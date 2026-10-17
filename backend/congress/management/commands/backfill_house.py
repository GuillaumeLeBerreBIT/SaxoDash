from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from congress import house, performance, run_lock


class Command(BaseCommand):
    help = 'Import every House PTR filed since a year, parse the e-filed ones and rebuild every member.'

    def add_arguments(self, parser):
        parser.add_argument('--since', type=int, default=2021)

    def handle(self, *args, **options):
        try:
            with run_lock.exclusive('backfill') as held:
                self._backfill(options['since'], held.pause)
        except run_lock.Busy as busy:
            raise CommandError(f'A House {busy.holder} is already running; try again when it finishes.')

    def _backfill(self, since, pause):
        now = timezone.now()
        for year in range(since, now.year + 1):
            created = house.sync_index(year, now)
            self.stdout.write(f'{year}: {created} new reports')
        result = house.parse_pending(pause=pause)
        self.stdout.write(f'parsed {result.parsed}, failed {result.failed}, waiting {result.waiting}')
        self.stdout.write(f'measured {performance.rebuild_all()} members')
        self.stdout.write(
            'Copy performance fills in after the nightly price refresh and the next daily sync; no manual rebuild is needed.'
        )
