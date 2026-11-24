from datetime import date

from django.core.management import call_command
from django.core.management.base import BaseCommand

from research.models import DailyBars
from research.valuation import PE_WINDOW_BARS, pe_percentiles, stored_eps
from verdicts import compute

CLOSE = 4


class Command(BaseCommand):
    help = 'Recalculate the stored P/E range, the verdicts and optionally the yardstick report from stored data.'

    def add_arguments(self, parser):
        parser.add_argument('--report', help='Also write the grade_valuation report to this path.')

    def handle(self, *args, report=None, **options):
        changed = 0
        for stored in DailyBars.objects.select_related('row').iterator(chunk_size=20):
            row = stored.row
            closes = [(date.fromisoformat(bar[0]), bar[CLOSE]) for bar in stored.bars[-PE_WINDOW_BARS:]]
            pe_history = pe_percentiles(closes, stored_eps(row.fundamentals_history)) or {}
            if pe_history != row.pe_history:
                row.pe_history = pe_history
                row.save(update_fields=['pe_history'])
                changed += 1
        result = compute.run()
        self.stdout.write(f'P/E range changed for {changed} stocks; {result.written} verdicts written, '
                          f'{len(result.failed)} failed.')
        if report:
            call_command('grade_valuation', out=report, stdout=self.stdout)
