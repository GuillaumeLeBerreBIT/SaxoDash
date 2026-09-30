from django.core.management.base import BaseCommand

from research.tasks import scan_universe


class Command(BaseCommand):
    help = 'Scan the Discover universe now (resolve, technicals, fundamentals).'

    def handle(self, *args, **options):
        rows = scan_universe()
        self.stdout.write('skipped: Saxo not connected' if rows is None else f'{rows} rows ok')
