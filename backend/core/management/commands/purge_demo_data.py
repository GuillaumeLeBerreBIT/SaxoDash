from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import BankAccount
from core.models import NetWorthSnapshot
from portfolio.models import Position
from transactions.models import Transaction
from users.commands import add_user_argument, chosen_user


class Command(BaseCommand):
    help = (
        'Delete the seeded demo rows, leaving only data that came from Saxo. '
        'The inverse of seed_demo_data. Destructive: requires --yes.'
    )

    def add_arguments(self, parser):
        add_user_argument(parser)
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
        user = chosen_user(options['user'])
        transactions = Transaction.objects.filter(user=user)
        accounts = BankAccount.objects.filter(user=user)
        # Demo transactions are the ones no Saxo sync ever claimed. Real rows
        # carry the PositionId that makes their upsert idempotent.
        demo_transactions = transactions.filter(saxo_trade_id=None)

        snapshots = NetWorthSnapshot.objects.filter(user=user)

        counts = {
            'transactions': demo_transactions.count(),
            'net worth snapshots': snapshots.count(),
        }

        for label, count in counts.items():
            self.stdout.write(f'  {count:>5} {label}')

        kept = (
            f'Keeping {transactions.exclude(saxo_trade_id=None).count()} Saxo '
            f'transactions, {accounts.count()} Saxo '
            f'account, {Position.objects.filter(user=user).count()} positions.'
        )

        if not options['yes'] or options['dry_run']:
            self.stdout.write(kept)
            self.stdout.write(self.style.WARNING(
                'Dry run - nothing deleted. Re-run with --yes to apply.'
            ))
            return

        snapshots.delete()
        demo_transactions.delete()

        self.stdout.write(kept)
        self.stdout.write(self.style.SUCCESS(
            'Demo data purged. The net worth history restarts from today.'
        ))
