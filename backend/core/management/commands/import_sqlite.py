from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.sqlite_import import ImportRefused, import_sqlite


class Command(BaseCommand):
    help = (
        'Copy every row of an old SQLite database into the configured Postgres. '
        'The SQLite file is only read, from a temporary copy brought up to the current migrations.'
    )

    def add_arguments(self, parser):
        parser.add_argument('source', nargs='?', default=str(settings.BASE_DIR / 'db.sqlite3'))
        parser.add_argument(
            '--flush', action='store_true',
            help='Empty the target database first. Without it, a target that holds data is refused.',
        )

    def handle(self, *args, source, flush, **options):
        try:
            counts = import_sqlite(source, flush=flush)
        except ImportRefused as exc:
            raise CommandError(str(exc)) from exc

        width = max(len(label) for label, _, _ in counts)
        mismatched = []
        for label, in_source, in_target in counts:
            if in_source or in_target:
                self.stdout.write(f'{label:<{width}}  {in_source:>8}  {in_target:>8}')
            if in_source != in_target:
                mismatched.append(label)
        if mismatched:
            raise CommandError(f'Row counts differ for: {", ".join(mismatched)}')
        total = sum(in_target for _, _, in_target in counts)
        self.stdout.write(self.style.SUCCESS(f'Imported {total} rows from {source}; every count matches.'))
