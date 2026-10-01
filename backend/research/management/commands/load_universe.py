from django.core.management.base import BaseCommand

from research.universe import load_universe


class Command(BaseCommand):
    help = 'Load research/universe.csv into ScreenerRow.'

    def handle(self, *args, **options):
        result = load_universe()
        self.stdout.write(f"created {result['created']}, updated {result['updated']}, removed {result['removed']}")
