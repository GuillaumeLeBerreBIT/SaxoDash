from django.test import SimpleTestCase

from signals import evaluate
from signals.series import Series

BARS = 600


def day(i):
    return f'{2020 + i // 240:04d}-{(i % 240) // 20 + 1:02d}-{i % 20 + 1:02d}'


def flat_series(count=BARS, price=100.0):
    return Series(
        dates=[day(i) for i in range(count)], opens=[price] * count, highs=[price] * count,
        lows=[price] * count, closes=[price] * count, volumes=[1000] * count,
    )


def market(stocks=60, count=BARS):
    return {f'S{n:02d}': flat_series(count) for n in range(stocks)}


def no_flags(series_by_ticker):
    return {ticker: {} for ticker in series_by_ticker}


def mark(series_by_ticker, flags, ticker, key, bars):
    values = [False] * len(series_by_ticker[ticker])
    for i in bars:
        values[i] = True
    flags[ticker][key] = values


def found(scores, key, horizon):
    return next(score for score in scores if score.key == key and score.horizon == horizon)


class GradeTest(SimpleTestCase):
    def test_under_three_hundred_cases_is_too_few(self):
        self.assertEqual(evaluate.grade(299, 0.01, 0.03, 0.02, 0.02), 'too_few')

    def test_interval_above_zero_and_both_halves_positive_is_supported(self):
        self.assertEqual(evaluate.grade(300, 0.01, 0.03, 0.02, 0.01), 'supported')

    def test_one_negative_half_demotes_a_positive_interval(self):
        self.assertEqual(evaluate.grade(5000, 0.01, 0.03, 0.05, -0.01), 'no_edge')

    def test_interval_below_zero_and_both_halves_negative_is_against(self):
        self.assertEqual(evaluate.grade(5000, -0.03, -0.01, -0.02, -0.01), 'against')

    def test_interval_spanning_zero_is_no_edge(self):
        self.assertEqual(evaluate.grade(5000, -0.01, 0.03, 0.02, 0.01), 'no_edge')

    def test_missing_interval_is_too_few(self):
        self.assertEqual(evaluate.grade(5000, None, None, None, None), 'too_few')


class ScoreTest(SimpleTestCase):
    def test_return_runs_from_the_next_open_and_subtracts_the_dates_average(self):
        stocks = market()
        winner = stocks['S00']
        winner.opens[300] = 90.0
        winner.closes[305] = 110.0
        flags = no_flags(stocks)
        mark(stocks, flags, 'S00', 'volume_thrust', [300])
        result = found(evaluate.score(stocks, flags), 'volume_thrust', 5)
        self.assertEqual(result.cases, 1)
        self.assertEqual(result.stocks, 1)
        self.assertAlmostEqual(result.mean_excess, 0.10 - 0.10 / 60)
        self.assertEqual(result.positive_share, 1.0)
        self.assertEqual((result.from_date, result.to_date), (day(300), day(300)))

    def test_every_signal_and_horizon_is_answered_even_without_cases(self):
        stocks = market()
        scores = evaluate.score(stocks, no_flags(stocks))
        self.assertEqual(len(scores), 17 * 3)
        empty = found(scores, 'hammer', 60)
        self.assertEqual((empty.cases, empty.mean_excess, empty.ci_low, empty.grade), (0, None, None, 'too_few'))

    def test_dates_with_fewer_than_fifty_stocks_are_left_out(self):
        stocks = market(stocks=49)
        flags = no_flags(stocks)
        mark(stocks, flags, 'S00', 'volume_thrust', [300])
        self.assertEqual(found(evaluate.score(stocks, flags), 'volume_thrust', 5).cases, 0)

    def test_stocks_under_520_bars_are_ignored(self):
        stocks = market()
        stocks['NEW'] = flat_series(400)
        flags = no_flags(stocks)
        mark(stocks, flags, 'NEW', 'volume_thrust', [300])
        self.assertEqual(found(evaluate.score(stocks, flags), 'volume_thrust', 5).cases, 0)

    def test_bars_before_260_and_bars_without_a_future_are_not_cases(self):
        stocks = market()
        flags = no_flags(stocks)
        mark(stocks, flags, 'S00', 'volume_thrust', [259, 260, BARS - 5, BARS - 6])
        self.assertEqual(found(evaluate.score(stocks, flags), 'volume_thrust', 5).cases, 2)

    def test_two_runs_give_the_same_interval(self):
        stocks = market()
        for n, series in enumerate(stocks.values()):
            for i in range(261, BARS):
                series.closes[i] = 100 + ((i * 7 + n * 13) % 11) - 5
        flags = no_flags(stocks)
        for ticker in stocks:
            mark(stocks, flags, ticker, 'hammer', range(260, BARS, 9))
        first = found(evaluate.score(stocks, flags), 'hammer', 20)
        second = found(evaluate.score(stocks, flags), 'hammer', 20)
        self.assertEqual((first.ci_low, first.ci_high), (second.ci_low, second.ci_high))
        self.assertLessEqual(first.ci_low, first.mean_excess)
        self.assertGreaterEqual(first.ci_high, first.mean_excess)

    def test_a_signal_that_worked_only_early_is_not_supported(self):
        stocks = market()
        flags = no_flags(stocks)
        early = list(range(262, 300, 6))
        late = list(range(440, 520, 6))
        for n in range(30):
            ticker = f'S{n:02d}'
            series = stocks[ticker]
            for i in early:
                series.closes[i + 5] = 110.0
            for i in late:
                series.closes[i + 5] = 99.0
            mark(stocks, flags, ticker, 'new_high', early + late)
        scores = evaluate.score(stocks, flags)
        result = found(scores, 'new_high', 5)
        self.assertGreater(result.first_half, 0)
        self.assertLess(result.second_half, 0)
        self.assertNotEqual(result.grade, 'supported')

    def test_the_grade_is_decided_on_sixty_sessions_and_shared_by_all_horizons(self):
        stocks = market()
        flags = no_flags(stocks)
        bars = list(range(262, 530, 4))
        for n in range(20):
            ticker = f'S{n:02d}'
            for i in bars:
                stocks[ticker].closes[i + 60] = 100.0 + 5 + (n % 3)
            mark(stocks, flags, ticker, 'volume_thrust', bars)
        scores = evaluate.score(stocks, flags)
        self.assertEqual(found(scores, 'volume_thrust', 60).grade, 'supported')
        self.assertEqual(found(scores, 'volume_thrust', 5).grade, 'supported')


    def test_a_signal_that_buys_weakness_cannot_earn_supported_among_survivors(self):
        stocks = market()
        flags = no_flags(stocks)
        bars = list(range(262, 530, 4))
        for n in range(20):
            ticker = f'S{n:02d}'
            for i in bars:
                stocks[ticker].closes[i + 60] = 100.0 + 5 + (n % 3)
            mark(stocks, flags, ticker, 'deep_pullback', bars)
        scores = evaluate.score(stocks, flags)
        self.assertEqual(found(scores, 'deep_pullback', 60).grade, 'unproven')
        self.assertGreater(found(scores, 'deep_pullback', 60).ci_low, 0)


class MomentumLeadersTest(SimpleTestCase):
    def test_the_top_quarter_by_momentum_on_each_date(self):
        stocks = {}
        for n in range(8):
            series = flat_series(300)
            for i in range(300):
                series.closes[i] = 100 * (1 + 0.001 * (n + 1)) ** i
            stocks[f'S{n}'] = series
        flags = evaluate.flags_by_stock(stocks)
        leaders = sorted(ticker for ticker in stocks if flags[ticker]['momentum_top'][299])
        self.assertEqual(leaders, ['S6', 'S7'])
        self.assertFalse(any(flags['S7']['momentum_top'][:252]))
        self.assertIn('hammer', flags['S0'])

    def test_fewer_than_eight_ranked_stocks_names_no_leader(self):
        stocks = {f'S{n}': flat_series(300) for n in range(7)}
        flags = evaluate.flags_by_stock(stocks)
        self.assertFalse(any(any(flags[ticker]['momentum_top']) for ticker in stocks))
