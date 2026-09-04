"""Restate snapshots whose portfolio leg was recorded in the wrong currency.

Before the currency fix, `portfolio_value` held an unconverted instrument-currency
total that was then labelled and summed as REPORTING_CURRENCY. The true historical
value cannot be recovered - we have neither the prices nor the rates of those days -
so this offers the two honest options: restate at a stated rate (an approximation,
and far closer than leaving it), or delete the affected rows.

Today's row is never touched: it is an upsert now and the next sync corrects it.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from portfolio.models import Position

from ...models import NetWorthSnapshot

CENTS = Decimal('0.01')


def _default_rate():
    """The rate the positions themselves carry, when they agree on one."""
    rates = set(Position.objects.values_list('fx_rate', flat=True).distinct())
    return rates.pop() if len(rates) == 1 else None


class Command(BaseCommand):
    help = 'Restate or delete net worth snapshots recorded in the wrong currency.'

    def add_arguments(self, parser):
        parser.add_argument('--since', help='First date to repair (YYYY-MM-DD).')
        parser.add_argument('--until', help='Last date to repair (YYYY-MM-DD).')
        parser.add_argument('--rate', help='Instrument-to-reporting currency rate.')
        parser.add_argument('--delete', action='store_true',
                            help='Remove the rows instead of restating them.')
        parser.add_argument('--apply', action='store_true',
                            help='Write the changes. Without it this is a dry run.')

    def handle(self, *args, **options):
        # Restating has no marker and is not idempotent: a second run scales
        # the same rows again, and rows written after the currency fix are
        # already correct. Naming the window is how you say which rows are bad.
        if not options['delete'] and not (options['since'] and options['until']):
            raise CommandError(
                'Restating needs --since and --until naming the bad window. '
                'This command multiplies rows in place with nothing recording '
                'that it ran, so an unbounded or repeated run corrupts good data.'
            )

        snapshots = NetWorthSnapshot.objects.filter(date__lt=timezone.localdate())
        if options['since']:
            snapshots = snapshots.filter(date__gte=options['since'])
        if options['until']:
            snapshots = snapshots.filter(date__lte=options['until'])
        snapshots = list(snapshots)

        if not snapshots:
            self.stdout.write('No snapshots before today to repair.')
            return

        if options['delete']:
            return self._delete(snapshots, options['apply'])

        rate = Decimal(options['rate']) if options['rate'] else _default_rate()
        if rate is None:
            raise CommandError(
                'No --rate given and the positions do not agree on one. Pass '
                '--rate explicitly, or --delete to drop the affected rows.'
            )
        self._restate(snapshots, rate, options['apply'])

    def _restate(self, snapshots, rate, apply):
        self.stdout.write(f'Restating the portfolio leg at {rate} '
                          f'(bank balances were already in the reporting currency).\n')
        self.stdout.write(f'{"date":<12}{"was":>14}{"becomes":>14}{"net worth":>16}')

        for snapshot in snapshots:
            portfolio = (snapshot.portfolio_value * rate).quantize(
                CENTS, rounding=ROUND_HALF_UP)
            net_worth = portfolio + snapshot.bank_total
            self.stdout.write(
                f'{snapshot.date!s:<12}{snapshot.portfolio_value:>14,}'
                f'{portfolio:>14,}{net_worth:>16,}'
            )
            snapshot.portfolio_value = portfolio
            snapshot.net_worth = net_worth

        self._finish(snapshots, apply, lambda: NetWorthSnapshot.objects.bulk_update(
            snapshots, ['portfolio_value', 'net_worth']))

    def _delete(self, snapshots, apply):
        self.stdout.write(f'Deleting {len(snapshots)} snapshots '
                          f'({snapshots[0].date} to {snapshots[-1].date}).')
        self._finish(snapshots, apply, lambda: NetWorthSnapshot.objects.filter(
            pk__in=[s.pk for s in snapshots]).delete())

    def _finish(self, snapshots, apply, write):
        if not apply:
            self.stdout.write(self.style.WARNING(
                f'\nDry run - {len(snapshots)} snapshots unchanged. '
                f'Re-run with --apply to write.'))
            return

        write()
        self.stdout.write(self.style.SUCCESS(f'\nRepaired {len(snapshots)} snapshots.'))
