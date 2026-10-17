from django.core.management.base import BaseCommand, CommandError

from congress import house, performance, run_lock
from congress.models import Member, Report


class Command(BaseCommand):
    help = 'Reset reports to pending and parse them again.'

    def add_arguments(self, parser):
        parser.add_argument('--doc-id')
        parser.add_argument('--failed', action='store_true')
        parser.add_argument('--unread', action='store_true')

    def handle(self, *args, **options):
        if options['doc_id']:
            reports = Report.objects.filter(doc_id=options['doc_id'])
        elif options['failed']:
            reports = Report.objects.filter(status=Report.FAILED)
        elif options['unread']:
            reports = Report.objects.filter(status=Report.PARSED, unparsed_rows__gt=0, trades__isnull=True)
        else:
            raise CommandError('Pass --doc-id ID, --failed or --unread.')
        try:
            with run_lock.exclusive('reparse') as held:
                self._reparse(reports, held.pause)
        except run_lock.Busy as busy:
            raise CommandError(f'A House {busy.holder} is already running; try again when it finishes.')

    def _reparse(self, reports, pause):
        reset = reports.exclude(status=Report.PAPER).update(status=Report.PENDING, attempts=0, retry_after=None, error='')
        result = house.parse_pending(pause=pause)
        for member in Member.objects.filter(pk__in=result.member_ids):
            performance.rebuild(member)
        self.stdout.write(f'reset {reset}, parsed {result.parsed}, failed {result.failed}')
