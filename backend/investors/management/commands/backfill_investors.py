from django.core.management.base import BaseCommand, CommandError

from investors.importer import backfill
from investors.models import Investor


class Command(BaseCommand):
    help = 'Import five years of 13F filings for every investor, or one with --slug.'

    def add_arguments(self, parser):
        parser.add_argument('--slug')

    def handle(self, *args, **options):
        investors = Investor.objects.all()
        if options['slug']:
            investors = investors.filter(slug=options['slug'])
            if not investors.exists():
                raise CommandError(f"No investor with slug {options['slug']!r}")
        for investor in investors:
            result = backfill(investor)
            self.stdout.write(f'{investor.slug}: imported {result.imported}, skipped {len(result.skipped)}')
