from datetime import date
from decimal import Decimal

from rest_framework.test import APITestCase

from portfolio.models import Position
from research.models import ScreenerRow
from signals.models import SignalScore, StockSignals
from users.testing import make_user


def stock_signals(ticker, universe=True, **fields):
    ScreenerRow.everything.create(ticker=ticker, name=ticker, indexes='sp500', in_universe=universe)
    defaults = {'uic': 211, 'as_of': date(2026, 11, 13), 'active': ['volume_thrust'],
                'events': {'volume_thrust': ['2026-11-13']}}
    return StockSignals.objects.create(ticker=ticker, **{**defaults, **fields})


def hold(user, ticker):
    return Position.objects.create(
        user=user, ticker=ticker, name=ticker, qty=Decimal('1'), avg_cost=Decimal('10'),
        current_price=Decimal('10'), sector='Tech', type='STOCK', color='#000000',
        asset_type='Stock', currency='USD',
    )


class SignalApiTests(APITestCase):
    def setUp(self):
        self.alice = make_user('alice')
        self.bob = make_user('bob')

    def test_endpoints_require_login(self):
        self.assertEqual(self.client.get('/api/signals/').status_code, 401)
        self.assertEqual(self.client.get('/api/signals/AAPL/').status_code, 401)

    def test_before_the_first_run_every_signal_is_listed_ungraded(self):
        self.client.force_authenticate(self.bob)
        signals = self.client.get('/api/signals/').json()['signals']
        self.assertEqual(len(signals), 17)
        self.assertEqual(signals[0]['key'], 'momentum_top')
        self.assertEqual((signals[0]['grade'], signals[0]['period'], signals[0]['horizons']), (None, None, {}))
        self.assertEqual(set(signals[0]), {'key', 'code', 'label', 'description', 'kind', 'grade', 'period', 'horizons'})

    def test_the_list_carries_the_stored_figures(self):
        for horizon, excess in ((5, 0.003), (20, 0.009), (60, 0.029)):
            SignalScore.objects.create(
                key='momentum_top', horizon=horizon, cases=27280, stocks=120, mean_excess=excess,
                ci_low=0.008, ci_high=0.051, positive_share=0.53, first_half=0.02, second_half=0.04,
                grade='supported', from_date=date(2023, 2, 15), to_date=date(2026, 8, 20),
            )
        self.client.force_authenticate(self.bob)
        momentum = self.client.get('/api/signals/').json()['signals'][0]
        self.assertEqual(momentum['grade'], 'supported')
        self.assertEqual(momentum['period'], {'from': '2023-02-15', 'to': '2026-08-20'})
        self.assertEqual(sorted(momentum['horizons']), ['20', '5', '60'])
        self.assertEqual(momentum['horizons']['60'], {
            'cases': 27280, 'stocks': 120, 'mean_excess': 0.029, 'ci_low': 0.008, 'ci_high': 0.051,
            'positive_share': 0.53, 'first_half': 0.02, 'second_half': 0.04,
        })

    def test_the_list_runs_one_query(self):
        self.client.force_authenticate(self.bob)
        with self.assertNumQueries(1):
            self.client.get('/api/signals/')

    def test_a_universe_stocks_signals(self):
        stock_signals('AAPL')
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.get('/api/signals/AAPL/').json(), {'stock_signals': {
            'ticker': 'AAPL', 'uic': 211, 'as_of': '2026-11-13',
            'active': ['volume_thrust'], 'events': {'volume_thrust': ['2026-11-13']},
        }})

    def test_a_saxo_symbol_in_any_case_is_read_as_its_ticker(self):
        stock_signals('AAPL')
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.get('/api/signals/aapl:xnas/').json()['stock_signals']['ticker'], 'AAPL')

    def test_an_unknown_ticker_is_null(self):
        self.client.force_authenticate(self.bob)
        response = self.client.get('/api/signals/NOPE/')
        self.assertEqual((response.status_code, response.json()), (200, {'stock_signals': None}))

    def test_an_extra_is_served_only_to_a_user_who_holds_it(self):
        stock_signals('NBIS', universe=False)
        hold(self.alice, 'NBIS')
        self.client.force_authenticate(self.bob)
        self.assertIsNone(self.client.get('/api/signals/NBIS/').json()['stock_signals'])
        self.client.force_authenticate(self.alice)
        self.assertEqual(self.client.get('/api/signals/NBIS/').json()['stock_signals']['ticker'], 'NBIS')
