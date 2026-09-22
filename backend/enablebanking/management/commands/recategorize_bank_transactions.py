"""Re-applies categorization.categorize() and transfers.mark_transfers() to
every already-synced BankTransaction. A rule change (a new keyword, a new
ManualIbanLabel row) only affects transactions a future sync fetches - the
historical rows that prompted the rule change in the first place are
exactly the ones that need it applied retroactively.
"""
from django.core.management.base import BaseCommand

from ...categorization import categorize
from ...models import BankTransaction
from ...transfers import mark_transfers


class Command(BaseCommand):
    help = (
        'Re-run categorization and transfer-matching against every synced '
        'bank transaction, picking up rule changes made after they were '
        'first synced. Never touches a row with a category_override.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help='Write the changes. Without it this is a dry run.')

    def handle(self, *args, **options):
        transactions = list(BankTransaction.objects.filter(category_override__isnull=True))
        before = {tx.pk: tx.category for tx in transactions}

        for tx in transactions:
            tx.category = categorize(tx.counterparty_name, tx.description, tx.amount)
        mark_transfers(transactions)

        changed = [tx for tx in transactions if tx.category != before[tx.pk]]

        for tx in changed:
            self.stdout.write(f'{tx.booking_date} {tx.counterparty_name!r}: '
                              f'{before[tx.pk]} -> {tx.category}')

        if not options['apply']:
            self.stdout.write(self.style.WARNING(
                f'\nDry run - {len(changed)} transaction(s) would change. '
                f'Re-run with --apply to write.'))
            return

        BankTransaction.objects.bulk_update(changed, ['category'])
        self.stdout.write(self.style.SUCCESS(f'\nRecategorized {len(changed)} transaction(s).'))
