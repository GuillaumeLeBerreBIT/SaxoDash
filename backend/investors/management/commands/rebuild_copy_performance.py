from django.core.management.base import BaseCommand

from investors import copying


class Command(BaseCommand):
    help = 'Recompute every investor\'s copy performance from the stored price histories.'

    def handle(self, *args, **options):
        self.stdout.write(f'{copying.rebuild_all()} investors measured')
