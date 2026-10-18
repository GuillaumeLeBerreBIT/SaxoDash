from datetime import date

from django.test import TestCase

from . import signals
from .factories import make_investor, store_quarter
from .models import Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)
TODAY = date(2026, 10, 5)
AAPL, NVDA, TSLA = '037833100', '67066G104', '88160R101'
BEFORE = [(AAPL, 'APPLE INC', 100, 500), (TSLA, 'TESLA INC', 100, 500)]


def fund(index, **over):
    return make_investor(name=f'Manager {index}', firm=f'Fund {index}', cik=index, slug=f'fund-{index}', **over)


def shelf(payload, key):
    return next((s for s in payload['shelves'] if s['key'] == key), None)


class SignalQuarterTest(TestCase):
    def test_no_moves_means_no_signal_quarter(self):
        fund(1)
        self.assertIsNone(signals.signal_quarter())

    def test_the_newest_quarter_counts_once_half_have_filed_it(self):
        for index in (1, 2):
            store_quarter(fund(index), Q1, BEFORE)
        store_quarter(signals.Investor.objects.get(slug='fund-1'), Q2, BEFORE)

        self.assertEqual(signals.signal_quarter(), {
            'quarter': Q2, 'filed': 1, 'tracked': 2, 'newest_quarter': Q2, 'newest_filed': 1,
        })

    def test_an_early_filing_window_falls_back_to_the_previous_quarter(self):
        for index in (1, 2, 3):
            store_quarter(fund(index), Q1, BEFORE)
        store_quarter(signals.Investor.objects.get(slug='fund-1'), Q2, BEFORE)

        self.assertEqual(signals.signal_quarter(), {
            'quarter': Q1, 'filed': 3, 'tracked': 3, 'newest_quarter': Q2, 'newest_filed': 1,
        })


class HubShelvesTest(TestCase):
    def setUp(self):
        Security.objects.create(cusip=NVDA, ticker='NVDA')
        self.funds = [fund(index) for index in (1, 2, 3, 4)]
        for investor in self.funds:
            store_quarter(investor, Q1, BEFORE)

    def after(self, investor, holdings):
        store_quarter(investor, Q2, holdings)

    def test_three_buyers_make_a_convergent_buy(self):
        for investor in self.funds[:3]:
            self.after(investor, [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250)])
        self.after(self.funds[3], BEFORE)

        buys = shelf(signals.hub(TODAY), 'convergent-buys')

        self.assertEqual((buys['kind'], buys['total']), ('stocks', 1))
        item = buys['items'][0]
        self.assertEqual(
            (item['ticker'], item['issuer'], item['bought'], item['new'], item['owners'], item['sold']),
            ('NVDA', 'NVIDIA CORP', 3, 3, 3, 0),
        )
        self.assertEqual([face['slug'] for face in item['investors']], ['fund-1', 'fund-2', 'fund-3'])
        self.assertEqual(item['investors'][0], {'slug': 'fund-1', 'name': item['investors'][0]['name'], 'photo_url': None, 'logo_url': None})

    def test_two_buyers_are_not_convergent(self):
        for investor in self.funds[:2]:
            self.after(investor, [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250)])
        for investor in self.funds[2:]:
            self.after(investor, BEFORE)

        self.assertIsNone(shelf(signals.hub(TODAY), 'convergent-buys'))

    def test_options_never_count_as_a_stock_signal(self):
        for investor in self.funds:
            self.after(investor, [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250, 'CALL')])

        payload = signals.hub(TODAY)

        self.assertIsNone(shelf(payload, 'convergent-buys'))
        self.assertIsNone(shelf(payload, 'new-bets'))

    def test_a_fund_with_one_stored_quarter_owns_but_did_not_buy(self):
        for investor in self.funds[:2]:
            self.after(investor, [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250)])
        for investor in self.funds[2:]:
            self.after(investor, BEFORE)
        store_quarter(fund(9), Q2, [(NVDA, 'NVIDIA CORP', 10, 250)])

        self.assertIsNone(shelf(signals.hub(TODAY), 'convergent-buys'))
        owned = signals.stock_activity('owned', Q2)['rows']
        self.assertEqual(next(row for row in owned if row['cusip'] == NVDA)['owners'], 3)

    def test_most_sold_counts_trims_and_exits(self):
        self.after(self.funds[0], [(AAPL, 'APPLE INC', 100, 500)])
        self.after(self.funds[1], [(AAPL, 'APPLE INC', 100, 500)])
        self.after(self.funds[2], [(AAPL, 'APPLE INC', 100, 500), (TSLA, 'TESLA INC', 40, 200)])
        self.after(self.funds[3], BEFORE)

        sold = shelf(signals.hub(TODAY), 'most-sold')

        self.assertEqual((sold['total'], sold['items'][0]['issuer'], sold['items'][0]['sold']), (1, 'TESLA INC', 3))

    def test_new_bets_are_one_card_per_stock_ranked_by_the_biggest_position(self):
        amd = '007903107'
        self.after(self.funds[0], [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 1000)])
        self.after(self.funds[1], [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250)])
        self.after(self.funds[2], [*BEFORE, (amd, 'ADVANCED MICRO DEVICES INC', 10, 100)])
        self.after(self.funds[3], BEFORE)

        bets = shelf(signals.hub(TODAY), 'new-bets')

        self.assertEqual(bets['total'], 2)
        self.assertEqual(
            [(item['issuer'], item['weight'], item['new'], [face['slug'] for face in item['investors']])
             for item in bets['items']],
            [('NVIDIA CORP', 50.0, 2, ['fund-1', 'fund-2']), ('ADVANCED MICRO DEVICES INC', 9.09, 1, ['fund-3'])],
        )

    def test_following_and_just_filed_are_investor_shelves(self):
        self.funds[1].followed = True
        self.funds[1].last_filing_at = date(2026, 8, 14)
        self.funds[1].save()
        self.funds[0].last_filing_at = date(2026, 8, 20)
        self.funds[0].save()

        payload = signals.hub(TODAY)

        self.assertEqual([card['slug'] for card in shelf(payload, 'following')['items']], ['fund-2'])
        self.assertEqual([card['slug'] for card in shelf(payload, 'just-filed')['items']], ['fund-1', 'fund-2'])
        self.assertEqual(shelf(payload, 'following')['kind'], 'investors')

    def test_empty_shelves_are_left_out_and_dates_are_iso(self):
        payload = signals.hub(TODAY)

        self.assertEqual(payload['shelves'], [])
        self.assertEqual((payload['quarter'], payload['filed'], payload['tracked']), ('2026-03-31', 4, 4))

    def test_no_data_at_all_answers_an_empty_hub(self):
        signals.Investor.objects.all().delete()
        fund(1)
        self.assertEqual(signals.hub(TODAY), {
            'quarter': None, 'filed': 0, 'tracked': 1, 'newest_quarter': None, 'newest_filed': 0, 'shelves': [],
        })


class StockActivityTest(TestCase):
    def setUp(self):
        self.funds = [fund(index) for index in (1, 2)]
        for investor in self.funds:
            store_quarter(investor, Q1, BEFORE)
        store_quarter(self.funds[0], Q2, [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250)])
        store_quarter(self.funds[1], Q2, [(AAPL, 'APPLE INC', 100, 500)])

    def test_each_view_ranks_and_keeps_only_stocks_with_that_activity(self):
        self.assertEqual([row['issuer'] for row in signals.stock_activity('bought')['rows']], ['NVIDIA CORP'])
        self.assertEqual([row['issuer'] for row in signals.stock_activity('sold')['rows']], ['TESLA INC'])
        self.assertEqual([row['issuer'] for row in signals.stock_activity('new')['rows']], ['NVIDIA CORP'])
        self.assertEqual(
            [(row['issuer'], row['owners']) for row in signals.stock_activity('owned')['rows']],
            [('APPLE INC', 2), ('TESLA INC', 1), ('NVIDIA CORP', 1)],
        )

    def test_defaults_to_the_signal_quarter_and_lists_the_quarters(self):
        payload = signals.stock_activity('owned')
        self.assertEqual((payload['quarter'], payload['quarters'], payload['view']), ('2026-06-30', ['2026-06-30', '2026-03-31'], 'owned'))
        self.assertEqual(payload['signal_quarter'], '2026-06-30')

    def test_an_asked_quarter_still_reports_the_signal_quarter(self):
        payload = signals.stock_activity('owned', Q1)
        self.assertEqual((payload['quarter'], payload['signal_quarter']), ('2026-03-31', '2026-06-30'))

    def test_an_unknown_view_is_refused(self):
        with self.assertRaises(signals.UnknownView):
            signals.stock_activity('hot')


class OneStockUnderTwoIdentifiersTest(TestCase):
    OLD, NEW = '30231G102', '30233Q108'

    def setUp(self):
        Security.objects.create(cusip=self.OLD, ticker='XOM', inherited_via=Security.ALIAS)
        Security.objects.create(cusip=self.NEW, ticker='XOM')
        self.funds = [fund(index) for index in (1, 2, 3)]

    def rows(self, view):
        return signals.stock_activity(view, Q2)['rows']

    def test_funds_filing_either_identifier_own_the_same_stock(self):
        store_quarter(self.funds[0], Q2, [(self.OLD, 'EXXON MOBIL CORP', 100, 500)])
        store_quarter(self.funds[1], Q2, [(self.OLD, 'EXXON MOBIL CORP', 10, 50)])
        store_quarter(self.funds[2], Q2, [(self.NEW, 'EXXONMOBIL HOLDINGS CORP', 300, 1500)])

        owned = self.rows('owned')

        self.assertEqual(len(owned), 1)
        self.assertEqual(
            (owned[0]['ticker'], owned[0]['owners'], owned[0]['value'], owned[0]['cusip'], owned[0]['issuer']),
            ('XOM', 3, 2050, self.NEW, 'EXXONMOBIL HOLDINGS CORP'),
        )

    def test_a_fund_switching_identifier_neither_sold_nor_opened_the_stock(self):
        store_quarter(self.funds[0], Q1, [(self.OLD, 'EXXON MOBIL CORP', 100, 500)])
        store_quarter(self.funds[0], Q2, [(self.NEW, 'EXXONMOBIL HOLDINGS CORP', 100, 550)])

        self.assertEqual(self.rows('sold'), [])
        self.assertEqual(self.rows('new'), [])
        self.assertEqual(self.rows('bought'), [])
        self.assertEqual([(row['ticker'], row['owners']) for row in self.rows('owned')], [('XOM', 1)])

    def test_a_fund_that_switched_and_bought_more_is_a_buyer_of_the_difference(self):
        store_quarter(self.funds[0], Q1, [(self.OLD, 'EXXON MOBIL CORP', 100, 500)])
        store_quarter(self.funds[0], Q2, [(self.NEW, 'EXXONMOBIL HOLDINGS CORP', 150, 900)])

        bought = self.rows('bought')

        self.assertEqual([(row['ticker'], row['bought'], row['new']) for row in bought], [('XOM', 1, 0)])
        self.assertEqual(self.rows('sold'), [])

    def test_identifiers_without_a_ticker_stay_separate_stocks(self):
        store_quarter(self.funds[0], Q2, [('111111111', 'ACME CORP', 100, 500)])
        store_quarter(self.funds[1], Q2, [('222222222', 'ACME CORP', 100, 500)])

        self.assertEqual(sorted(row['cusip'] for row in self.rows('owned')), ['111111111', '222222222'])

    def test_a_first_stored_quarter_under_two_identifiers_owns_but_did_not_buy(self):
        store_quarter(self.funds[0], Q2, [
            (self.OLD, 'EXXON MOBIL CORP', 100, 500), (self.NEW, 'EXXONMOBIL HOLDINGS CORP', 50, 250),
        ])

        self.assertEqual(self.rows('bought'), [])
        self.assertEqual([(row['owners'], row['value']) for row in self.rows('owned')], [(1, 750)])
