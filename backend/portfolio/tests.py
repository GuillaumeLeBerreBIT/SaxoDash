from datetime import date, timedelta
from unittest.mock import patch

from django.conf import settings
from django.test import TestCase
from django.utils import timezone
from decimal import Decimal
from core.models import NetWorthSnapshot
from portfolio import insights
from portfolio.models import SAXO_SOURCE, PortfolioValuation, Position
from portfolio.serializers import PositionSerializer
from portfolio.services import (
    VALUATION_MAX_AGE,
    get_portfolio_value,
    get_positions_value,
)
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


def _snap(d, portfolio, bank=Decimal('1000.00')):
    return NetWorthSnapshot.objects.create(
        date=d, portfolio_value=Decimal(portfolio), bank_total=bank,
        net_worth=Decimal(portfolio) + bank,
    )


def _pos(ticker, qty, avg, price, sector='Technology', currency='USD', color='#111111',
         price_source='live'):
    return Position.objects.create(
        ticker=ticker, name=f'{ticker} Inc', qty=Decimal(qty), avg_cost=Decimal(avg),
        current_price=Decimal(price), sector=sector, type='STOCK', color=color,
        currency=currency, price_source=price_source,
    )


# Create your tests here.
class PositionModelTest(TestCase):
    def test_create_position(self):
        position = Position.objects.create(
            ticker='NVDA', name='NVIDIA Corporation', qty=15,
            avg_cost=Decimal('412.30'), current_price=Decimal('875.40'),
            sector='Technology', type='STOCK', color='#76b900', 
        )
        
        self.assertEqual(Position.objects.count(), 1)
        self.assertEqual(position.ticker, 'NVDA')
        
class PositionSerializerTest(TestCase):
    def setUp(self):
        self.p1 = Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('150.00'),
            sector='Technology', type='STOCK', color='#76b900',
        )
        self.p2 = Position.objects.create(
            ticker='AAPL', name='Apple', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('50.00'),
            sector='Technology', type='STOCK', color='#a3a3a3',
        )

    def test_total_value(self):
        total = get_positions_value().amount
        self.assertEqual(total, Decimal('2000.00'))  # 1500 + 500

    def test_computed_fields(self):
        total = get_positions_value().amount
        data = PositionSerializer(self.p1, context={'total_value': total}).data
        self.assertEqual(data['value'], Decimal('1500.00'))
        self.assertEqual(data['cost'], Decimal('1000.00'))
        self.assertEqual(data['pnl'], Decimal('500.00'))
        self.assertEqual(data['pnl_pct'], Decimal('50.00'))
        self.assertEqual(data['weight'], Decimal('75.00'))  # 1500/2000
        
class PortfolioAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('150.00'),
            sector='Technology', type='STOCK', color='#76b900',
        )

    def test_positions_list(self):
        response = self.client.get('/api/portfolio/positions/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['weight'], Decimal('100.00'))

    def test_summary(self):
        response = self.client.get('/api/portfolio/summary/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_value'], Decimal('1500.00'))

    def test_requires_auth(self):
        self.client.credentials()  # clear token
        response = self.client.get('/api/portfolio/positions/')
        self.assertEqual(response.status_code, 401)


class PortfolioValuationTrustTest(TestCase):
    """The broker's figure is preferred, but only while it is evidence."""

    def _valuation(self, **overrides):
        return PortfolioValuation.objects.create(**{
            'source': SAXO_SOURCE,
            'currency': 'EUR',
            'cash_balance': Decimal('1000.00'),
            'positions_value': Decimal('31567.81'),
            'total_value': Decimal('32567.81'),
            **overrides,
        })

    def _position(self):
        return Position.objects.create(
            ticker='MSFT', name='Microsoft', qty=Decimal('10'),
            avg_cost=Decimal('100.00'), current_price=Decimal('110.00'),
            sector='Technology', type='STOCK', color='#00a4ef',
            currency='EUR', fx_rate=Decimal('1'),
        )

    def test_prefers_the_broker_figure_when_it_is_in_the_reporting_currency(self):
        self._valuation()
        self._position()

        self.assertEqual(get_portfolio_value().amount, Decimal('31567.81'))

    def test_falls_back_to_our_own_marks_for_a_foreign_currency_account(self):
        # The valuation carries no fx_rate; the positions do.
        self._valuation(currency='USD')
        self._position()

        value = get_portfolio_value()
        self.assertEqual(value.currency, settings.REPORTING_CURRENCY)
        self.assertEqual(value.amount, Decimal('1100.00'))

    def test_declines_a_valuation_older_than_the_sync_that_should_refresh_it(self):
        valuation = self._valuation()
        PortfolioValuation.objects.filter(pk=valuation.pk).update(
            as_of=timezone.now() - VALUATION_MAX_AGE - timedelta(hours=1)
        )
        self._position()

        self.assertEqual(get_portfolio_value().amount, Decimal('1100.00'))


class InsightsHelpersTest(TestCase):
    def test_day_delta_is_the_last_two_points(self):
        pairs = [(date(2026, 9, 8), Decimal('100')), (date(2026, 9, 9), Decimal('110'))]
        self.assertEqual(insights._day(pairs), {'abs': Decimal('10'), 'pct': 10.0})

    def test_day_delta_needs_two_points(self):
        self.assertIsNone(insights._day([(date(2026, 9, 9), Decimal('100'))]))

    def test_trailing_window_anchors_to_the_first_in_window_point(self):
        pairs = [
            (date(2026, 8, 1), Decimal('100')),
            (date(2026, 9, 5), Decimal('120')),
            (date(2026, 9, 12), Decimal('132')),
        ]
        self.assertEqual(insights._trailing(pairs, 10), {'abs': Decimal('12'), 'pct': 10.0})

    def test_trailing_returns_none_when_the_window_has_under_two_points(self):
        pairs = [(date(2026, 8, 1), Decimal('100')), (date(2026, 9, 12), Decimal('132'))]
        self.assertIsNone(insights._trailing(pairs, 3))

    def test_ytd_uses_the_latest_years_points(self):
        pairs = [
            (date(2025, 12, 31), Decimal('90')),
            (date(2026, 1, 2), Decimal('100')),
            (date(2026, 9, 12), Decimal('125')),
        ]
        self.assertEqual(insights._ytd(pairs), {'abs': Decimal('25'), 'pct': 25.0})

    def test_all_time_is_first_versus_last(self):
        pairs = [(date(2026, 1, 1), Decimal('80')), (date(2026, 9, 1), Decimal('100'))]
        self.assertEqual(insights._all_time(pairs), {'abs': Decimal('20'), 'pct': 25.0})

    def test_pct_is_none_when_the_anchor_is_zero(self):
        pairs = [(date(2026, 9, 1), Decimal('0')), (date(2026, 9, 2), Decimal('5'))]
        self.assertEqual(insights._day(pairs), {'abs': Decimal('5'), 'pct': None})


class InsightsPositionsTest(TestCase):
    def setUp(self):
        # values: NVDA 6000, AAPL 3000, KO 1000  -> total 10000
        self.nvda = _pos('NVDA', '10', '100', '600', sector='Technology', currency='USD')
        self.aapl = _pos('AAPL', '10', '400', '300', sector='Technology', currency='USD')
        self.ko = _pos('KO', '10', '50', '100', sector='Staples', currency='EUR')
        self.positions = list(Position.objects.all())
        self.total = sum((p.value for p in self.positions), Decimal('0'))

    def test_concentration_maths(self):
        c = insights._concentration(self.positions, self.total)
        self.assertEqual(c['top1'], {'ticker': 'NVDA', 'pct': 60.0})
        self.assertEqual(c['top3_pct'], 100.0)
        self.assertAlmostEqual(c['hhi'], 0.36 + 0.09 + 0.01, places=4)
        self.assertEqual(c['positions'], 3)

    def test_concentration_of_an_empty_book_is_nulls(self):
        c = insights._concentration([], Decimal('0'))
        self.assertIsNone(c['top1'])
        self.assertIsNone(c['top3_pct'])
        self.assertIsNone(c['hhi'])
        self.assertEqual(c['positions'], 0)

    def test_sector_exposure_groups_and_orders_by_value(self):
        rows = insights._exposure(self.positions, self.total, 'sector', 'name')
        self.assertEqual(rows[0], {'name': 'Technology', 'pct': 90.0, 'value': Decimal('9000.00')})
        self.assertEqual(rows[1]['name'], 'Staples')

    def test_currency_exposure_uses_the_instrument_currency(self):
        rows = insights._exposure(self.positions, self.total, 'currency', 'currency')
        self.assertEqual(rows[0], {'currency': 'USD', 'pct': 90.0, 'value': Decimal('9000.00')})

    def test_blank_key_becomes_unknown(self):
        _pos('X', '1', '1', '1', sector='')
        rows = insights._exposure(list(Position.objects.all()), self.total + Decimal('1'),
                                  'sector', 'name')
        self.assertIn('Unknown', [r['name'] for r in rows])

    def test_movers_of_a_small_book_are_all_best_and_no_worst(self):
        # 3 holdings, MOVERS=3 -> best takes all, worst dedups to empty.
        m = insights._movers(self.positions)
        self.assertEqual([r['ticker'] for r in m['best']], ['NVDA', 'KO', 'AAPL'])
        self.assertEqual(m['worst'], [])

    def test_movers_split_best_and_worst_without_overlap(self):
        _pos('AMD', '10', '100', '250')   # +150%
        _pos('INTC', '10', '100', '40')   # -60%
        _pos('F', '10', '100', '90')      # -10%
        m = insights._movers(list(Position.objects.all()))
        best = [r['ticker'] for r in m['best']]
        worst = [r['ticker'] for r in m['worst']]
        self.assertEqual(best, ['NVDA', 'AMD', 'KO'])
        self.assertEqual(worst, ['INTC', 'AAPL', 'F'])
        self.assertFalse(set(best) & set(worst))

    def test_contributors_ordered_by_absolute_contribution(self):
        total_cost = sum((p.cost for p in self.positions), Decimal('0'))
        total_pnl = self.total - total_cost
        rows = insights._contributors(self.positions, total_cost, total_pnl)
        self.assertEqual(rows[0]['ticker'], 'NVDA')       # +5000 pnl, biggest magnitude
        self.assertEqual(rows[-1]['ticker'], 'KO')        # +500 pnl, smallest
        # contribution = pnl / total_cost; total_cost = 1000 + 4000 + 500 = 5500
        self.assertAlmostEqual(rows[0]['contribution_pp'], 5000 / 5500 * 100, places=2)

    def test_contributors_survive_zero_denominators(self):
        rows = insights._contributors(self.positions, Decimal('0'), Decimal('0'))
        self.assertTrue(all(r['contribution_pp'] == 0.0 for r in rows))


class UpcomingEarningsTest(TestCase):
    def _win(self, events):
        return {'events': events, 'window': {}, 'ok': True}

    @patch('portfolio.insights._window_earnings')
    def test_keeps_held_unreported_rows_inside_the_horizon(self, mock_win):
        today = date(2026, 9, 10)
        mock_win.side_effect = [
            self._win([
                {'symbol': 'MSFT', 'date': '2026-09-13', 'session': 'amc',
                 'eps_estimate': 3.1, 'eps_actual': None, 'held': True},
                {'symbol': 'AAPL', 'date': '2026-09-11', 'session': 'bmo',
                 'eps_estimate': 1.5, 'eps_actual': 1.6, 'held': True},   # already reported
                {'symbol': 'TSLA', 'date': '2026-09-12', 'session': 'amc',
                 'eps_estimate': 0.7, 'eps_actual': None, 'held': False},  # not held
            ]),
            self._win([
                {'symbol': 'MSFT', 'date': '2026-09-30', 'session': 'amc',
                 'eps_estimate': 3.2, 'eps_actual': None, 'held': True},   # past horizon
            ]),
        ]
        rows = insights._upcoming_earnings({'MSFT', 'AAPL', 'TSLA'}, today)
        self.assertEqual([r['ticker'] for r in rows], ['MSFT'])
        self.assertEqual(rows[0]['days_until'], 3)

    @patch('portfolio.insights._window_earnings', side_effect=RuntimeError('feed down'))
    def test_a_feed_failure_yields_none(self, _mock):
        self.assertIsNone(insights._upcoming_earnings({'MSFT'}, date(2026, 9, 10)))


class InsightsAttentionTest(TestCase):
    def test_single_name_and_concentration_fire_at_their_thresholds(self):
        c = {'top1': {'ticker': 'NVDA', 'pct': 34.0}, 'top3_pct': 61.0, 'hhi': 0.2, 'positions': 5}
        kinds = [i['kind'] for i in insights._attention([], [], date(2026, 9, 10), c, None)]
        self.assertEqual(kinds[:2], ['single_name', 'concentration'])

    def test_nothing_fires_below_threshold(self):
        c = {'top1': {'ticker': 'NVDA', 'pct': 20.0}, 'top3_pct': 45.0, 'hhi': 0.1, 'positions': 8}
        pairs = [(date(2026, 9, 9), Decimal('1')), (date(2026, 9, 10), Decimal('1'))]
        self.assertEqual(insights._attention([], pairs, date(2026, 9, 10), c, None), [])

    def test_stale_value_names_the_age(self):
        c = {'top1': None, 'top3_pct': None, 'hhi': None, 'positions': 0}
        pairs = [(date(2026, 9, 1), Decimal('1')), (date(2026, 9, 5), Decimal('1'))]
        items = insights._attention([], pairs, date(2026, 9, 10), c, None)
        self.assertEqual(items[0]['kind'], 'stale_value')
        self.assertIn('5 days old', items[0]['text'])

    def test_price_basis_counts_unpriced_holdings(self):
        _pos('A', '1', '1', '1', price_source='derived')
        _pos('B', '1', '1', '1', price_source='live')
        c = {'top1': None, 'top3_pct': None, 'hhi': None, 'positions': 2}
        items = insights._attention(list(Position.objects.all()), [], date(2026, 9, 10), c, None)
        pb = next(i for i in items if i['kind'] == 'price_basis')
        self.assertIn('1 holding', pb['text'])

    def test_earnings_soon_carries_the_ticker(self):
        c = {'top1': None, 'top3_pct': None, 'hhi': None, 'positions': 0}
        upcoming = [{'ticker': 'MSFT', 'date': '2026-09-13', 'days_until': 3,
                     'session': 'amc', 'eps_estimate': 3.1}]
        items = insights._attention([], [], date(2026, 9, 10), c, upcoming)
        es = next(i for i in items if i['kind'] == 'earnings_soon')
        self.assertEqual(es['ticker'], 'MSFT')
        self.assertIn('in 3 days', es['text'])

    def test_no_history_when_under_two_snapshots(self):
        c = {'top1': None, 'top3_pct': None, 'hhi': None, 'positions': 0}
        items = insights._attention([], [(date(2026, 9, 10), Decimal('1'))], date(2026, 9, 10), c, None)
        self.assertEqual(items[-1]['kind'], 'no_history')


class BuildInsightsTest(TestCase):
    @patch('portfolio.insights._upcoming_earnings', return_value=None)
    def test_empty_portfolio_and_no_snapshots_is_well_formed(self, _mock):
        payload = insights.build_insights()
        self.assertIsNone(payload['as_of'])
        self.assertFalse(payload['stale'])
        self.assertEqual(payload['spark'], [])
        self.assertIsNone(payload['change']['day'])
        self.assertEqual(payload['sector_exposure'], [])
        self.assertIsNone(payload['upcoming_earnings'])
        self.assertEqual(payload['attention'][-1]['kind'], 'no_history')

    @patch('portfolio.insights._upcoming_earnings', return_value=[])
    def test_a_seeded_book_produces_the_expected_shape(self, _mock):
        _pos('NVDA', '10', '100', '600')
        _snap(date(2026, 9, 8), '5000')
        _snap(date(2026, 9, 9), '5500')
        payload = insights.build_insights()
        self.assertEqual(payload['as_of'], '2026-09-09')
        self.assertEqual(payload['change']['day']['pct'], 10.0)
        self.assertEqual(payload['concentration']['top1']['ticker'], 'NVDA')
        self.assertEqual(len(payload['spark']), 2)
        self.assertEqual(payload['upcoming_earnings'], [])


class PortfolioInsightsViewTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        self.assertEqual(self.client.get('/api/portfolio/insights/').status_code, 401)

    @patch('portfolio.insights._upcoming_earnings', return_value=[])
    def test_returns_the_insights_payload(self, _mock):
        _pos('NVDA', '10', '100', '600')
        _snap(date(2026, 9, 8), '5000')
        _snap(date(2026, 9, 9), '5500')
        response = self.client.get('/api/portfolio/insights/')
        self.assertEqual(response.status_code, 200)
        for key in ('value', 'change', 'spark', 'concentration', 'sector_exposure',
                    'currency_exposure', 'movers', 'contributors', 'attention',
                    'upcoming_earnings'):
            self.assertIn(key, response.data)
        self.assertEqual(response.data['concentration']['top1']['ticker'], 'NVDA')

    @patch('portfolio.insights._window_earnings', side_effect=RuntimeError('boom'))
    def test_an_earnings_feed_failure_is_still_a_200_with_null_earnings(self, _mock):
        _pos('NVDA', '10', '100', '600')
        response = self.client.get('/api/portfolio/insights/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['upcoming_earnings'])

    @patch('portfolio.insights._upcoming_earnings', return_value=None)
    def test_no_positions_is_a_clean_200(self, _mock):
        response = self.client.get('/api/portfolio/insights/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['concentration']['top1'])
