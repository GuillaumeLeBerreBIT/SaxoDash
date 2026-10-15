from django.core.management.base import BaseCommand, CommandError

from congress import house, performance
from congress.models import Member, Report


class Command(BaseCommand):
    help = 'Reset reports to pending and parse them again.'

    def add_arguments(self, parser):
        parser.add_argument('--doc-id')
        parser.add_argument('--failed', action='store_true')

    def handle(self, *args, **options):
        if options['doc_id']:
            reports = Report.objects.filter(doc_id=options['doc_id'])
        elif options['failed']:
            reports = Report.objects.filter(status=Report.FAILED)
        else:
            raise CommandError('Pass --doc-id ID or --failed.')
        reset = reports.exclude(status=Report.PAPER).update(status=Report.PENDING, attempts=0, error='')
        result = house.parse_pending()
        for member in Member.objects.filter(pk__in=result.member_ids):
            performance.rebuild(member)
        self.stdout.write(f'reset {reset}, parsed {result.parsed}, failed {result.failed}')
