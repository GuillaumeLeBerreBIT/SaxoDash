from pathlib import Path

from django.core.management.base import BaseCommand

from research.models import DailyBars
from research.valuation import stored_eps
from signals.series import from_bars
from verdicts import yardstick_report


class Command(BaseCommand):
    help = 'Grade the P/E range and the growth line on stored history.'

    def add_arguments(self, parser):
        parser.add_argument('--since', help='Only count cases on or after this ISO date.')
        parser.add_argument('--out', help='Write the markdown report to this path.')

    def handle(self, *args, since=None, out=None, **options):
        series_by_ticker, eps_by_ticker = {}, {}
        for stored in DailyBars.objects.select_related('row').filter(row__in_universe=True).iterator(chunk_size=20):
            series = from_bars(stored.bars)
            if len(series):
                series_by_ticker[stored.row.ticker] = series
                eps_by_ticker[stored.row.ticker] = stored_eps(stored.row.fundamentals_history)
        window = f' from {since}' if since else ''
        full = yardstick_report.grade_run(f'All stocks{window}', series_by_ticker, eps_by_ticker, since=since)
        runs = [full]
        if full.split_suspects:
            runs.append(yardstick_report.grade_run(
                f'Without split suspects{window}', series_by_ticker, eps_by_ticker,
                since=since, exclude=set(full.split_suspects),
            ))
        text = '\n'.join(yardstick_report.render(run) for run in runs)
        if out:
            Path(out).write_text(text)
        self.stdout.write(text)
