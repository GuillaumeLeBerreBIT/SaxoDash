"""See enablebanking/recategorize.py for why this exists."""
from django.core.management.base import BaseCommand

from ...models import BankTransaction
from ...recategorize import recategorize


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
        changed = recategorize()

        for tx in changed:
            self.stdout.write(f'{tx.booking_date} {tx.counterparty_name!r} -> {tx.category}')

        if not options['apply']:
            self.stdout.write(self.style.WARNING(
                f'\nDry run - {len(changed)} transaction(s) would change. '
                f'Re-run with --apply to write.'))
            return

        BankTransaction.objects.bulk_update(changed, ['category'])
        self.stdout.write(self.style.SUCCESS(f'\nRecategorized {len(changed)} transaction(s).'))
