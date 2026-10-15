from django.core.management.base import BaseCommand
from django.utils import timezone

from congress import house, performance


class Command(BaseCommand):
    help = 'Import every House PTR filed since a year, parse the e-filed ones and rebuild every member.'

    def add_arguments(self, parser):
        parser.add_argument('--since', type=int, default=2021)

    def handle(self, *args, **options):
        now = timezone.now()
        for year in range(options['since'], now.year + 1):
            created = house.sync_index(year, now)
            self.stdout.write(f'{year}: {created} new reports')
        result = house.parse_pending()
        self.stdout.write(f'parsed {result.parsed}, failed {result.failed}')
        self.stdout.write(f'measured {performance.rebuild_all()} members')
