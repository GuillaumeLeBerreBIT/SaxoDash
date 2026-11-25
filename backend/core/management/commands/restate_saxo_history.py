from bisect import bisect_right
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from portfolio import account_performance
from portfolio.models import SAXO_SOURCE, PortfolioValuation

from ...models import NetWorthSnapshot

CENTS = Decimal('0.01')
LONGEST_GAP = timedelta(days=7)


def _account_currency(user):
    valuation = PortfolioValuation.objects.filter(user=user, source=SAXO_SOURCE).first()
    return valuation.currency if valuation else None


def _day_on_or_before(days, dates, day):
    index = bisect_right(dates, day)
    return days[index - 1] if index else None


def _user(username):
    user = get_user_model().objects.filter(username=username).first()
    if user is None:
        raise CommandError(f'No user named {username}.')
    return user


class Command(BaseCommand):
    help = "Rebuild the Saxo leg of one user's past net worth snapshots from Saxo's own account history."

    def add_arguments(self, parser):
        parser.add_argument('--user', required=True, help='Username whose snapshots to rebuild.')
        parser.add_argument('--since', help='First date to rebuild (YYYY-MM-DD).')
        parser.add_argument('--until', required=True, help='Last date to rebuild (YYYY-MM-DD).')
        parser.add_argument('--apply', action='store_true', help='Write the changes. Without it this is a dry run.')

    def handle(self, *args, **options):
        user = _user(options['user'])
        currency = _account_currency(user)
        if currency != settings.REPORTING_CURRENCY:
            raise CommandError(
                f'The Saxo account is in {currency or "an unknown currency"}, not {settings.REPORTING_CURRENCY}; '
                'its history cannot be added to the other accounts.'
            )

        days = account_performance.account_days(user=user)
        dates = [d.date for d in days]
        snapshots = NetWorthSnapshot.objects.filter(
            user=user, date__lt=timezone.localdate(), date__lte=options['until'],
        )
        if options['since']:
            snapshots = snapshots.filter(date__gte=options['since'])

        changed = skipped = 0
        for row in snapshots.order_by('date'):
            day = _day_on_or_before(days, dates, row.date)
            if day is None:
                continue
            if row.date - day.date > LONGEST_GAP:
                self.stdout.write(f'{row.date}  skipped: nearest Saxo day is {day.date}, more than 7 days earlier')
                skipped += 1
                continue
            new = {
                'portfolio_value': (day.value - day.cash).quantize(CENTS),
                'bank_total': day.cash.quantize(CENTS),
                'net_worth': day.value.quantize(CENTS),
                'saxo_account_value': day.value.quantize(CENTS),
            }
            self.stdout.write(f'{row.date}  net worth {row.net_worth} -> {new["net_worth"]}')
            if options['apply']:
                NetWorthSnapshot.objects.filter(pk=row.pk).update(**new)
            changed += 1

        verb = 'Rebuilt' if options['apply'] else 'Dry run: would rebuild'
        self.stdout.write(f'{verb} {changed} snapshot(s); skipped {skipped} too far from a Saxo day.')
