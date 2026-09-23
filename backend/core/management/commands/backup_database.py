from django.core.management.base import BaseCommand

from core.backup import backup_database


class Command(BaseCommand):
    help = 'Write a timestamped SQLite backup and prune old ones. See core.backup for restore instructions.'

    def handle(self, *args, **options):
        try:
            path = backup_database()
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f'Backup failed: {exc}'))
            raise
        self.stdout.write(self.style.SUCCESS(f'Backed up to {path}'))
