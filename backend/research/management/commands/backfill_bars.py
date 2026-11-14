from django.core.management.base import BaseCommand, CommandError

from research import backfill
from users.models import Profile


class Command(BaseCommand):
    help = 'Pages Saxo daily bars back for stocks whose stored history is not complete yet.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=backfill.ROWS_PER_RUN)

    def handle(self, *args, **options):
        owner = Profile.objects.filter(is_owner=True).select_related('user').first()
        if owner is None:
            raise CommandError('No owner account exists.')
        result = backfill.backfill(limit=options['limit'], user=owner.user)
        self.stdout.write(f'{result.completed} deepened, {len(result.failed)} failed {", ".join(result.failed[:20])}')
