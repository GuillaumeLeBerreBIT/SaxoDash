from datetime import date, datetime, timezone

from django.test import TestCase

from research.models import ScreenerRow

from . import compute
from .models import StockVerdict, VerdictCall

STRONG_HISTORY = {'annual': [
    {'period': f'{2020 + index}-12-31', 'roe': 20, 'roic': 15, 'net_margin': 20, 'eps': index + 1}
    for index in range(5)
]}
CHEAP = {'current': 18, 'p25': 20, 'p75': 30, 'eps_ttm': 5, 'weeks': 200}
FAIR = {'current': 25, 'p25': 20, 'p75': 30, 'eps_ttm': 5, 'weeks': 200}
FUNDAMENTALS_AT = datetime(2026, 11, 10, 22, 45, tzinfo=timezone.utc)
DAY_ONE = date(2026, 11, 11)
DAY_TWO = date(2026, 11, 12)


def make_row(ticker='AAPL', **overrides):
    fields = {
        'name': f'{ticker} Inc', 'sector': 'Information Technology', 'indexes': 'sp500',
        'status': ScreenerRow.OK, 'fundamentals_at': FUNDAMENTALS_AT, 'last_close': 100.0,
        'pct_vs_ma200': 4.5, 'eps_growth_5y': 10.0, 'revenue_growth_5y': 8.0,
        'debt_to_equity': 0.5, 'fundamentals_history': STRONG_HISTORY, 'pe_history': CHEAP,
    }
    fields.update(overrides)
    return ScreenerRow.everything.create(ticker=ticker, **fields)


class ComputeTest(TestCase):
    def test_writes_one_verdict_per_ok_row_including_extras(self):
        make_row('AAPL')
        make_row('NBIS', in_universe=False)
        make_row('BAD', status=ScreenerRow.FAILED)

        result = compute.run(today=DAY_ONE)

        self.assertEqual((result.written, result.failed), (2, []))
        self.assertEqual(
            set(StockVerdict.objects.values_list('ticker', flat=True)), {'AAPL', 'NBIS'},
        )

    def test_verdict_carries_grades_levels_and_row_figures(self):
        make_row('AAPL')

        compute.run(today=DAY_ONE)

        verdict = StockVerdict.objects.get(ticker='AAPL')
        self.assertEqual((verdict.quality, verdict.valuation), ('strong', 'cheap'))
        self.assertEqual(
            (verdict.current_pe, verdict.cheap_below, verdict.expensive_above), (18, 100.0, 150.0),
        )
        self.assertEqual((verdict.last_close, verdict.pct_vs_ma200), (100.0, 4.5))
        self.assertEqual(verdict.as_of, date(2026, 11, 10))
        self.assertEqual(len(verdict.checks), 6)
        self.assertEqual(verdict.name, 'AAPL Inc')

    def test_skips_rows_never_given_fundamentals(self):
        make_row('AAPL', fundamentals_at=None)

        self.assertEqual(compute.run(today=DAY_ONE).written, 0)
        self.assertFalse(StockVerdict.objects.exists())

    def test_becoming_strong_and_cheap_opens_one_call_at_the_close(self):
        make_row('AAPL')

        compute.run(today=DAY_ONE)

        call = VerdictCall.objects.get()
        self.assertEqual(
            (call.ticker, call.opened_on, call.entry_close, call.quality, call.valuation, call.ended_on),
            ('AAPL', DAY_ONE, 100.0, 'strong', 'cheap', None),
        )
        self.assertEqual(len(call.checks), 6)

    def test_no_call_opens_without_a_close(self):
        make_row('AAPL', last_close=None)

        compute.run(today=DAY_ONE)

        self.assertFalse(VerdictCall.objects.exists())

    def test_fair_valuation_opens_no_call(self):
        make_row('AAPL', pe_history=FAIR)

        compute.run(today=DAY_ONE)

        self.assertFalse(VerdictCall.objects.exists())

    def test_staying_strong_and_cheap_does_not_open_a_second(self):
        make_row('AAPL')

        compute.run(today=DAY_ONE)
        compute.run(today=DAY_TWO)

        self.assertEqual(VerdictCall.objects.count(), 1)
        self.assertIsNone(VerdictCall.objects.get().ended_on)

    def test_leaving_strong_and_cheap_ends_the_call(self):
        row = make_row('AAPL')
        compute.run(today=DAY_ONE)
        row.pe_history = FAIR
        row.save()

        compute.run(today=DAY_TWO)

        self.assertEqual(VerdictCall.objects.get().ended_on, DAY_TWO)

    def test_returning_to_strong_and_cheap_opens_a_new_call(self):
        row = make_row('AAPL')
        compute.run(today=DAY_ONE)
        row.pe_history = FAIR
        row.save()
        compute.run(today=DAY_TWO)
        row.pe_history = CHEAP
        row.last_close = 90.0
        row.save()

        compute.run(today=date(2026, 11, 13))

        self.assertEqual(VerdictCall.objects.count(), 2)
        reopened = VerdictCall.objects.get(ended_on__isnull=True)
        self.assertEqual((reopened.opened_on, reopened.entry_close), (date(2026, 11, 13), 90.0))

    def test_a_row_that_disappears_takes_its_verdict_but_keeps_its_calls(self):
        row = make_row('AAPL')
        compute.run(today=DAY_ONE)
        row.delete()

        compute.run(today=DAY_TWO)

        self.assertFalse(StockVerdict.objects.exists())
        self.assertEqual(VerdictCall.objects.get().ended_on, DAY_TWO)

    def test_a_present_row_that_is_not_ok_tonight_keeps_its_verdict_and_open_call(self):
        row = make_row('AAPL')
        compute.run(today=DAY_ONE)
        row.status = ScreenerRow.FAILED
        row.save()

        result = compute.run(today=DAY_TWO)

        self.assertEqual(result.written, 0)
        self.assertEqual(StockVerdict.objects.get().ticker, 'AAPL')
        self.assertIsNone(VerdictCall.objects.get().ended_on)

    def test_one_row_raising_does_not_stop_the_others_or_retirement(self):
        make_row('AAA')
        make_row('BBB', fundamentals_history='not a dict')
        make_row('CCC')
        gone = make_row('GONE')
        compute.run(today=DAY_ONE)
        gone.delete()

        with self.assertLogs('verdicts.compute', level='ERROR') as logged:
            result = compute.run(today=DAY_TWO)

        self.assertEqual(result.failed, ['BBB'])
        self.assertEqual(result.written, 2)
        self.assertIn('BBB', logged.output[0])
        self.assertEqual(
            set(StockVerdict.objects.values_list('ticker', flat=True)), {'AAA', 'CCC'},
        )
        self.assertEqual(VerdictCall.objects.get(ticker='GONE').ended_on, DAY_TWO)

    def test_a_ticker_that_failed_to_compute_keeps_its_verdict_and_open_call(self):
        row = make_row('AAPL')
        compute.run(today=DAY_ONE)
        row.fundamentals_history = 'not a dict'
        row.save()

        with self.assertLogs('verdicts.compute', level='ERROR'):
            result = compute.run(today=DAY_TWO)

        self.assertEqual(result.failed, ['AAPL'])
        self.assertEqual(StockVerdict.objects.get().quality, 'strong')
        self.assertIsNone(VerdictCall.objects.get().ended_on)

    def test_an_overlong_name_is_truncated_not_raised(self):
        row = ScreenerRow(
            ticker='AAPL', name='z' * 300, fundamentals_at=FUNDAMENTALS_AT, last_close=100.0,
        )

        compute._judge(row, DAY_ONE)

        self.assertEqual(StockVerdict.objects.get().name, 'z' * 120)

    def test_run_is_repeatable(self):
        make_row('AAPL')
        compute.run(today=DAY_ONE)
        fields = ['ticker', 'name', 'quality', 'valuation', 'checks', 'current_pe', 'cheap_below',
                  'expensive_above', 'last_close', 'pct_vs_ma200', 'as_of']
        before = list(StockVerdict.objects.values(*fields))
        calls = list(VerdictCall.objects.values())
        computed_before = StockVerdict.objects.get().computed_at

        compute.run(today=DAY_ONE)

        self.assertGreater(StockVerdict.objects.get().computed_at, computed_before)
        self.assertEqual(list(StockVerdict.objects.values(*fields)), before)
        self.assertEqual(list(VerdictCall.objects.values()), calls)
