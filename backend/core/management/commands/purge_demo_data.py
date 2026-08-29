from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import BankAccount
from core.models import NetWorthSnapshot
from portfolio.models import Position
from transactions.models import Transaction

SAXO_BANK = 'Saxo'


class Command(BaseCommand):
    help = (
        'Delete the seeded demo rows, leaving only data that came from Saxo. '
        'The inverse of seed_demo_data. Destructive: requires --yes.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report what would be deleted without deleting it.',
        )
        parser.add_argument(
            '--yes', action='store_true',
            help='Actually delete. Without this the command only reports.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # Demo transactions are the ones no Saxo sync ever claimed. Real rows
        # carry the PositionId that makes their upsert idempotent.
        demo_transactions = Transaction.objects.filter(saxo_trade_id=None)
        demo_accounts = BankAccount.objects.exclude(bank=SAXO_BANK)

        # Every existing snapshot is discarded, not just the 364 synthetic
        # ones: bank_total on the recent "real" snapshots still included the
        # invented BNP/KBC/ING balances, so they are wrong the moment those
        # accounts go away. ensure_todays_snapshot rebuilds from clean data.
        snapshots = NetWorthSnapshot.objects.all()

        counts = {
            'transactions': demo_transactions.count(),
            'bank accounts': demo_accounts.count(),
            'net worth snapshots': snapshots.count(),
        }

        for label, count in counts.items():
            self.stdout.write(f'  {count:>5} {label}')

        kept = (
            f'Keeping {Transaction.objects.exclude(saxo_trade_id=None).count()} Saxo '
            f'transactions, {BankAccount.objects.filter(bank=SAXO_BANK).count()} Saxo '
            f'account, {Position.objects.count()} positions.'
        )

        if not options['yes'] or options['dry_run']:
            self.stdout.write(kept)
            self.stdout.write(self.style.WARNING(
                'Dry run - nothing deleted. Re-run with --yes to apply.'
            ))
            return

        snapshots.delete()
        demo_accounts.delete()
        demo_transactions.delete()

        self.stdout.write(kept)
        self.stdout.write(self.style.SUCCESS(
            'Demo data purged. The net worth history restarts from today.'
        ))
