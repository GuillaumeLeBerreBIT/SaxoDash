from django.core.management.base import BaseCommand

from investors.curated import load_curated


class Command(BaseCommand):
    help = 'Load investors/curated.csv into Investor.'

    def handle(self, *args, **options):
        result = load_curated()
        self.stdout.write(f"created {result['created']}, updated {result['updated']}")
