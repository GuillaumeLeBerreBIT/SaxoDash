from django.core.management.base import BaseCommand

from portfolio.sectors import backfill_sectors


class Command(BaseCommand):
    help = (
        'Backfill Position.sector from Finnhub for every position still at '
        "the default 'Uncategorized' - a one-off run for existing positions. "
        'Ongoing coverage of newly-synced positions is handled separately by '
        'the periodic portfolio.tasks.backfill_position_sectors task.'
    )

    def handle(self, *args, **options):
        updated = backfill_sectors()
        self.stdout.write(self.style.SUCCESS(f'Backfilled sector for {updated} position(s).'))
