from django.core.management.base import BaseCommand

from portfolio.models import Position
from portfolio.sectors import backfill_sectors
from users.commands import add_user_argument, chosen_user


class Command(BaseCommand):
    help = (
        'Backfill Position.sector from Finnhub for every position still at '
        "the default 'Uncategorized' - a one-off run for existing positions. "
        'Ongoing coverage of newly-synced positions is handled separately by '
        'the periodic portfolio.tasks.backfill_position_sectors task.'
    )

    def add_arguments(self, parser):
        add_user_argument(parser)

    def handle(self, *args, **options):
        user = chosen_user(options['user'])
        updated = backfill_sectors(Position.objects.filter(user=user))
        self.stdout.write(self.style.SUCCESS(f'Backfilled sector for {updated} position(s).'))
