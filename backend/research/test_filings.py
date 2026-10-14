from datetime import date
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings

from . import filings, finnhub

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def filing(form='10-K', filed='2026-02-01 00:00:00', accepted='2026-02-01 16:05:00', **extra):
    row = {
        'accessNumber': f'0001-{form}-{filed}',
        'form': form,
        'filedDate': filed,
        'acceptedDate': accepted,
        'reportUrl': 'https://www.sec.gov/report',
        'filingUrl': 'https://www.sec.gov/filing',
    }
    row.update(extra)
    return row


def trade(name='DOE JANE', day='2026-09-10', code='S', change=-100, price=10.0, share=1000, **extra):
    row = {
        'name': name,
        'transactionDate': day,
        'filingDate': day,
        'transactionCode': code,
        'change': change,
        'transactionPrice': price,
        'share': share,
        'isDerivative': False,
        'id': f'{name}-{day}-{code}-{change}-{price}',
    }
    row.update(extra)
    return row


class FilingsShapingTest(SimpleTestCase):
    def test_keeps_the_newest_rows_per_form_up_to_its_limit(self):
        tenks = [filing('10-K', f'20{10 + i}-02-01 00:00:00') for i in range(10)]
        result = filings.to_filings({'10-K': tenks})

        self.assertEqual(len(result), filings.FORM_LIMITS['10-K'])
        self.assertEqual(result[0]['filed'], '2019-02-01')
        self.assertEqual(result[-1]['filed'], '2014-02-01')

    def test_the_limits_are_six_annual_eight_quarterly_twenty_current(self):
        self.assertEqual(filings.FORM_LIMITS, {'10-K': 6, '10-Q': 8, '8-K': 20})

    def test_merges_forms_newest_first_by_filed_date(self):
        result = filings.to_filings({
            '10-K': [filing('10-K', '2026-02-01 00:00:00')],
            '10-Q': [filing('10-Q', '2026-05-01 00:00:00')],
            '8-K': [filing('8-K', '2026-03-01 00:00:00')],
        })

        self.assertEqual([row['form'] for row in result], ['10-Q', '8-K', '10-K'])

    def test_ties_on_filed_date_are_broken_by_accepted_time(self):
        result = filings.to_filings({
            '8-K': [
                filing('8-K', '2026-03-01 00:00:00', '2026-03-01 09:00:00', accessNumber='early'),
                filing('8-K', '2026-03-01 00:00:00', '2026-03-01 17:00:00', accessNumber='late'),
            ],
        })

        self.assertEqual([row['accession'] for row in result], ['late', 'early'])

    def test_cuts_the_filed_date_to_the_day_and_passes_the_accession_through(self):
        [row] = filings.to_filings({'10-K': [filing(accessNumber='0000320193-26-000001')]})

        self.assertEqual(row['filed'], '2026-02-01')
        self.assertEqual(row['accepted'], '2026-02-01 16:05:00')
        self.assertEqual(row['accession'], '0000320193-26-000001')
        self.assertEqual(row['url'], 'https://www.sec.gov/filing')
        self.assertEqual(row['report_url'], 'https://www.sec.gov/report')

    def test_a_missing_accepted_stamp_becomes_an_empty_string(self):
        [row] = filings.to_filings({'10-K': [filing(acceptedDate=None)]})

        self.assertEqual(row['accepted'], '')

    def test_blanks_a_url_that_is_not_on_the_sec_site(self):
        for bad in ('http://www.sec.gov/x', 'https://evil.example/www.sec.gov/', 'javascript:alert(1)', None):
            with self.subTest(url=bad):
                [row] = filings.to_filings({'10-K': [filing(filingUrl=bad, reportUrl=bad)]})

                self.assertEqual(row['url'], '')
                self.assertEqual(row['report_url'], '')

    def test_skips_a_row_with_no_filed_date_or_no_form(self):
        result = filings.to_filings({'10-K': [
            filing(filedDate=None),
            filing(form=None),
            filing(),
        ]})

        self.assertEqual(len(result), 1)

    def test_an_empty_or_none_list_contributes_nothing(self):
        self.assertEqual(filings.to_filings({'10-K': [], '10-Q': None, '8-K': []}), [])


class InsiderShapingTest(SimpleTestCase):
    def test_rows_of_one_insider_day_and_code_merge_into_one_transaction(self):
        [one] = filings.to_transactions([
            trade(change=-100, price=10.0),
            trade(change=-300, price=20.0),
        ])

        self.assertEqual(one['shares'], -400)
        self.assertEqual(one['name'], 'DOE JANE')
        self.assertEqual(one['code'], 'S')
        self.assertEqual(one['date'], '2026-09-10')

    def test_price_is_share_weighted_and_value_sums_the_priced_rows(self):
        [one] = filings.to_transactions([
            trade(change=-100, price=10.0),
            trade(change=-300, price=20.0),
        ])

        self.assertAlmostEqual(one['price'], 17.5)
        self.assertAlmostEqual(one['value'], 7000.0)

    def test_unpriced_rows_do_not_dilute_the_average_price(self):
        [one] = filings.to_transactions([
            trade(change=-100, price=10.0),
            trade(change=-900, price=0),
        ])

        self.assertEqual(one['shares'], -1000)
        self.assertAlmostEqual(one['price'], 10.0)
        self.assertIsNone(one['value'])

    def test_holdings_is_the_smallest_share_for_a_net_decrease(self):
        [one] = filings.to_transactions([
            trade(change=-100, share=900),
            trade(change=-100, share=800),
        ])

        self.assertEqual(one['holdings'], 800)

    def test_holdings_is_the_largest_share_for_a_net_increase(self):
        [one] = filings.to_transactions([
            trade(code='P', change=100, share=1100),
            trade(code='P', change=100, share=1200),
        ])

        self.assertEqual(one['holdings'], 1200)

    def test_a_group_with_only_zero_prices_has_no_price_and_no_value(self):
        [one] = filings.to_transactions([trade(code='A', change=500, price=0)])

        self.assertIsNone(one['price'])
        self.assertIsNone(one['value'])

    def test_different_names_days_or_codes_stay_separate(self):
        result = filings.to_transactions([
            trade(name='A'),
            trade(name='B'),
            trade(day='2026-09-11'),
            trade(code='G'),
        ])

        self.assertEqual(len(result), 4)

    def test_drops_derivative_rows_zero_changes_and_rows_without_a_date(self):
        result = filings.to_transactions([
            trade(isDerivative=True),
            trade(name='ZERO', change=0),
            trade(name='NODATE', day=None),
            trade(name='KEPT'),
        ])

        self.assertEqual([row['name'] for row in result], ['KEPT'])

    def test_orders_newest_date_first_then_by_name(self):
        result = filings.to_transactions([
            trade(name='B', day='2026-09-10'),
            trade(name='A', day='2026-09-10'),
            trade(name='C', day='2026-09-12'),
        ])

        self.assertEqual([row['name'] for row in result], ['C', 'A', 'B'])

    def test_caps_each_kind_at_the_transactions_kept(self):
        sales = [trade(name=f'S{i:03d}') for i in range(filings.TRANSACTIONS_KEPT + 15)]
        awards = [trade(name=f'A{i:03d}', code='A', change=50, price=0) for i in range(filings.TRANSACTIONS_KEPT + 5)]

        result = filings.to_transactions(sales + awards)

        self.assertEqual(len([row for row in result if row['code'] == 'S']), filings.TRANSACTIONS_KEPT)
        self.assertEqual(len([row for row in result if row['code'] == 'A']), filings.TRANSACTIONS_KEPT)

    def test_an_old_sale_survives_a_flood_of_newer_awards(self):
        sale = trade(name='SELLER', day='2026-01-05', code='S')
        awards = [trade(name=f'A{i:03d}', day='2026-09-10', code='A', change=50, price=0) for i in range(150)]

        result = filings.to_transactions([sale] + awards)

        self.assertEqual(len(result), filings.TRANSACTIONS_KEPT + 1)
        self.assertEqual(result[-1]['name'], 'SELLER')
        self.assertEqual([row['date'] for row in result], sorted((row['date'] for row in result), reverse=True))

    def test_counts_report_each_kind_before_the_caps(self):
        sale = trade(name='SELLER', code='S')
        buy = trade(name='BUYER', code='P', change=10)
        awards = [trade(name=f'A{i:03d}', code='A', change=50, price=0) for i in range(150)]

        self.assertEqual(filings.to_counts([sale, buy] + awards), {'open_market': 2, 'other': 150})
        self.assertEqual(filings.to_counts([]), {'open_market': 0, 'other': 0})

    def test_nothing_is_dropped_below_the_caps(self):
        rows = [trade(name=f'S{i}') for i in range(5)] + [trade(name=f'G{i}', code='G', price=0) for i in range(7)]

        self.assertEqual(len(filings.to_transactions(rows)), 12)

    def test_a_group_that_nets_to_zero_is_dropped(self):
        rows = [trade(code='J', change=100, price=0), trade(code='J', change=-100, price=0), trade(name='OTHER')]

        self.assertEqual([row['name'] for row in filings.to_transactions(rows)], ['OTHER'])
        self.assertEqual(filings.to_counts(rows), {'open_market': 1, 'other': 0})

    def test_a_partly_priced_group_has_no_value_rather_than_a_guess(self):
        [one] = filings.to_transactions([trade(change=-100, price=50.0), trade(change=-100, price=0)])

        self.assertEqual(one['shares'], -200)
        self.assertEqual(one['price'], 50.0)
        self.assertIsNone(one['value'])

    def test_a_fully_priced_group_is_valued_row_by_row(self):
        [one] = filings.to_transactions([trade(change=-100, price=50.0), trade(change=-300, price=60.0)])

        self.assertEqual(one['value'], 23000.0)
        self.assertAlmostEqual(one['price'], 57.5)

    def test_carries_the_filing_date(self):
        [one] = filings.to_transactions([trade(filingDate='2026-09-12')])

        self.assertEqual(one['filed'], '2026-09-12')

    def test_summary_counts_merged_groups_not_raw_rows(self):
        summary = filings.to_summary([
            trade(change=-100, price=10.0),
            trade(change=-300, price=20.0),
            trade(name='OTHER', code='P', change=50, price=5.0),
        ])

        self.assertEqual(summary['sells'], 1)
        self.assertEqual(summary['buys'], 1)

    def test_summary_totals_are_positive_and_sum_the_group_values(self):
        summary = filings.to_summary([
            trade(change=-100, price=10.0),
            trade(change=-300, price=20.0),
            trade(name='OTHER', code='P', change=50, price=5.0),
            trade(name='THIRD', code='P', change=10, price=0),
        ])

        self.assertEqual(summary['shares_sold'], 400)
        self.assertEqual(summary['shares_bought'], 60)
        self.assertNotIn('value_sold', summary)
        self.assertNotIn('value_bought', summary)

    def test_summary_counts_distinct_insiders_among_buys_and_sells(self):
        summary = filings.to_summary([
            trade(name='A', code='S'),
            trade(name='A', code='P', change=10),
            trade(name='B', code='S', day='2026-09-11'),
            trade(name='C', code='A', change=900, price=0),
        ])

        self.assertEqual(summary['insiders'], 2)

    def test_awards_gifts_and_exercises_change_no_summary_figure(self):
        summary = filings.to_summary([
            trade(code='A', change=500, price=0),
            trade(code='G', change=-50, price=0),
            trade(code='M', change=200, price=3.0),
            trade(code='F', change=-80, price=11.0),
        ])

        self.assertEqual(summary['buys'], 0)
        self.assertEqual(summary['sells'], 0)
        self.assertEqual(summary['shares_bought'], 0)
        self.assertEqual(summary['shares_sold'], 0)
        self.assertEqual(summary['insiders'], 0)

    def test_summary_is_computed_before_the_cap(self):
        rows = [trade(name=f'N{i:03d}') for i in range(filings.TRANSACTIONS_KEPT + 15)]

        self.assertEqual(filings.to_summary(rows)['sells'], filings.TRANSACTIONS_KEPT + 15)

    def test_summary_spans_the_oldest_to_the_newest_transaction(self):
        summary = filings.to_summary([
            trade(day='2026-03-02'),
            trade(day='2026-09-10', code='A', change=5, price=0),
            trade(day='2026-06-01', name='X'),
        ])

        self.assertEqual(summary['since'], '2026-03-02')
        self.assertEqual(summary['until'], '2026-09-10')

    def test_summary_span_is_none_without_rows(self):
        summary = filings.to_summary([])

        self.assertIsNone(summary['since'])
        self.assertIsNone(summary['until'])

    def test_sentiment_rows_become_months_oldest_first(self):
        result = filings.to_sentiment([
            {'year': 2026, 'month': 9, 'change': -1200, 'mspr': -45.678},
            {'year': 2026, 'month': 8, 'change': 300, 'mspr': 12.0},
        ])

        self.assertEqual(result, [
            {'month': '2026-08', 'mspr': 12.0, 'change': 300},
            {'month': '2026-09', 'mspr': -45.68, 'change': -1200},
        ])

    def test_sentiment_keeps_the_last_twelve_months(self):
        rows = [{'year': 2025, 'month': m, 'change': 1, 'mspr': 1.0} for m in range(1, 13)]
        rows += [{'year': 2026, 'month': m, 'change': 1, 'mspr': 1.0} for m in range(1, 4)]

        result = filings.to_sentiment(rows)

        self.assertEqual(len(result), filings.SENTIMENT_MONTHS)
        self.assertEqual(result[0]['month'], '2025-04')
        self.assertEqual(result[-1]['month'], '2026-03')

    def test_sentiment_skips_a_row_without_year_month_or_mspr(self):
        result = filings.to_sentiment([
            {'month': 9, 'change': 1, 'mspr': 1.0},
            {'year': 2026, 'change': 1, 'mspr': 1.0},
            {'year': 2026, 'month': 9, 'change': 1},
            {'year': 2026, 'month': 8, 'change': 1, 'mspr': 0},
        ])

        self.assertEqual([row['month'] for row in result], ['2026-08'])


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class FilingsEntryPointTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_filings', side_effect=lambda symbol, form: [filing(form)])
    def test_requests_each_form_on_its_own_and_answers_available(self, mock_get):
        result = filings.filings('JPM')

        self.assertTrue(result['available'])
        self.assertEqual(
            sorted(call.args[1] for call in mock_get.call_args_list),
            sorted(filings.FORM_LIMITS),
        )
        self.assertEqual(len(result['filings']), 3)

    @patch('research.finnhub.get_filings', side_effect=lambda symbol, form: [filing(form)])
    def test_a_second_call_does_not_refetch(self, mock_get):
        filings.filings('JPM')
        filings.filings('JPM')

        self.assertEqual(mock_get.call_count, len(filings.FORM_LIMITS))

    @patch('research.finnhub.get_filings')
    def test_a_failed_form_leaves_the_others_as_a_partial_answer(self, mock_get):
        def answer(symbol, form):
            if form == '10-Q':
                raise finnhub.FinnhubAPIError('boom')
            return [filing(form)]

        mock_get.side_effect = answer

        with patch('research.filings.cache') as fake_cache:
            fake_cache.get.return_value = None
            result = filings.filings('JPM')

        self.assertTrue(result['available'])
        self.assertTrue(result['partial'])
        self.assertEqual(result['missing'], ['10-Q'])
        self.assertEqual(sorted(row['form'] for row in result['filings']), ['10-K', '8-K'])
        self.assertEqual(fake_cache.set.call_args.args[2], filings.PARTIAL_TTL)

    @patch('research.finnhub.get_filings', side_effect=lambda symbol, form: [filing(form)])
    def test_a_complete_answer_is_not_partial_and_keeps_the_long_ttl(self, mock_get):
        with patch('research.filings.cache') as fake_cache:
            fake_cache.get.return_value = None
            result = filings.filings('JPM')

        self.assertFalse(result['partial'])
        self.assertEqual(fake_cache.set.call_args.args[2], filings.FILINGS_TTL)

    @patch('research.finnhub.get_filings', side_effect=finnhub.FinnhubAPIError('boom'))
    def test_every_form_failing_propagates_and_caches_nothing(self, mock_get):
        with self.assertRaises(finnhub.FinnhubAPIError):
            filings.filings('JPM')
        calls_after_failure = mock_get.call_count
        with self.assertRaises(finnhub.FinnhubAPIError):
            filings.filings('JPM')

        self.assertGreater(mock_get.call_count, calls_after_failure)

    @patch('research.finnhub.get_filings', return_value=[])
    def test_all_forms_empty_answers_an_empty_list_and_is_cached(self, mock_get):
        self.assertEqual(filings.filings('NEW'), {'available': True, 'filings': [], 'partial': False, 'missing': []})
        filings.filings('NEW')

        self.assertEqual(mock_get.call_count, len(filings.FORM_LIMITS))

    @patch('research.finnhub.get_filings', return_value='oops')
    def test_a_malformed_payload_becomes_finnhub_unexpected(self, mock_get):
        with self.assertRaises(finnhub.FinnhubUnexpected):
            filings.filings('JPM')


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class InsidersEntryPointTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_insider_sentiment', return_value={'data': [{'year': 2026, 'month': 9, 'change': -5, 'mspr': -10.0}]})
    @patch('research.finnhub.get_insider_transactions', return_value={'data': [trade()]})
    def test_answers_transactions_summary_and_sentiment(self, mock_tx, mock_sent):
        result = filings.insiders('NVDA')

        self.assertTrue(result['available'])
        self.assertEqual(len(result['transactions']), 1)
        self.assertEqual(result['summary']['sells'], 1)
        self.assertEqual(result['sentiment'][0]['month'], '2026-09')
        self.assertFalse(result['partial'])
        self.assertEqual(result['counts'], {'open_market': 1, 'other': 0})
        mock_tx.assert_called_once_with('NVDA')

    @patch('research.finnhub.get_insider_sentiment', return_value={'data': []})
    @patch('research.finnhub.get_insider_transactions', return_value={'data': []})
    def test_asks_for_sentiment_from_the_first_of_the_month_a_year_back(self, mock_tx, mock_sent):
        with patch('research.filings._today', return_value=date(2026, 10, 13)):
            filings.insiders('NVDA')

        mock_sent.assert_called_once_with('NVDA', '2025-10-01', '2026-10-13')

    @patch('research.finnhub.get_insider_sentiment', return_value={'data': []})
    @patch('research.finnhub.get_insider_transactions', return_value={'data': [trade()]})
    def test_a_second_call_does_not_refetch(self, mock_tx, mock_sent):
        filings.insiders('NVDA')
        filings.insiders('NVDA')

        self.assertEqual(mock_tx.call_count, 1)
        self.assertEqual(mock_sent.call_count, 1)

    @patch('research.finnhub.get_insider_sentiment', side_effect=finnhub.FinnhubAPIError('boom'))
    @patch('research.finnhub.get_insider_transactions', return_value={'data': [trade()]})
    def test_a_failed_sentiment_call_still_answers_with_the_transactions(self, mock_tx, mock_sent):
        result = filings.insiders('NVDA')

        self.assertEqual(len(result['transactions']), 1)
        self.assertEqual(result['sentiment'], [])
        self.assertTrue(result['partial'])

    @patch('research.finnhub.get_insider_sentiment', side_effect=finnhub.FinnhubAPIError('boom'))
    @patch('research.finnhub.get_insider_transactions', return_value={'data': [trade()]})
    def test_a_partial_answer_is_cached_for_the_short_ttl(self, mock_tx, mock_sent):
        with patch('research.filings.cache') as fake_cache:
            fake_cache.get.return_value = None
            filings.insiders('NVDA')

        self.assertEqual(fake_cache.set.call_args.args[2], filings.PARTIAL_TTL)

    @patch('research.finnhub.get_insider_sentiment', return_value={'data': []})
    @patch('research.finnhub.get_insider_transactions', return_value={'data': [trade()]})
    def test_a_full_answer_is_cached_for_the_long_ttl(self, mock_tx, mock_sent):
        with patch('research.filings.cache') as fake_cache:
            fake_cache.get.return_value = None
            filings.insiders('NVDA')

        self.assertEqual(fake_cache.set.call_args.args[2], filings.INSIDERS_TTL)

    @patch('research.finnhub.get_insider_sentiment', return_value={'data': []})
    @patch('research.finnhub.get_insider_transactions')
    def test_a_failed_transactions_call_propagates_and_caches_nothing(self, mock_tx, mock_sent):
        mock_tx.side_effect = finnhub.FinnhubAPIError('boom')

        with self.assertRaises(finnhub.FinnhubAPIError):
            filings.insiders('NVDA')
        with self.assertRaises(finnhub.FinnhubAPIError):
            filings.insiders('NVDA')

        self.assertEqual(mock_tx.call_count, 2)

    @patch('research.finnhub.get_insider_sentiment', return_value={'data': []})
    @patch('research.finnhub.get_insider_transactions', return_value={'data': 'oops'})
    def test_a_malformed_payload_becomes_finnhub_unexpected(self, mock_tx, mock_sent):
        with self.assertRaises(finnhub.FinnhubUnexpected):
            filings.insiders('NVDA')

    def test_the_ttls_are_twelve_hours_and_ten_minutes(self):
        self.assertEqual(filings.INSIDERS_TTL, 43200)
        self.assertEqual(filings.FILINGS_TTL, 43200)
        self.assertEqual(filings.PARTIAL_TTL, 600)
