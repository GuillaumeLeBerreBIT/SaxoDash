from django.core.management.base import BaseCommand

from investors import moves


class Command(BaseCommand):
    help = 'Regenerate every PositionMove from the stored filings.'

    def handle(self, *args, **options):
        self.stdout.write(f'{moves.rebuild_all()} moves')
