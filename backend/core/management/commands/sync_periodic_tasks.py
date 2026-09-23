from django.core.management.base import BaseCommand

from core.scheduling import sync_periodic_tasks


class Command(BaseCommand):
    help = 'Create/update the canonical Celery Beat schedule from core.scheduling.PERIODIC_TASKS.'

    def handle(self, *args, **options):
        sync_periodic_tasks(stdout=self.stdout)
        self.stdout.write(self.style.SUCCESS('Schedule synced.'))
