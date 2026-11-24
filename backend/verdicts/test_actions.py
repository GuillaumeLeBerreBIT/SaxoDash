from django.test import SimpleTestCase

from verdicts import actions


class ActionTest(SimpleTestCase):
    def check(self, quality, valuation, weight, failed=()):
        return actions.action(quality, weight, list(failed))

    def test_cap_is_fifteen(self):
        self.assertEqual(actions.WEIGHT_CAP_PCT, 15)

    def test_held_weak_is_sell_review_listing_failed_checks(self):
        result = self.check('weak', 'cheap', 5, ['Debt', 'Margins'])
        self.assertEqual(result['action'], 'sell_review')
        self.assertEqual(result['reason'], 'Story check failed: Debt, Margins')

    def test_weak_beats_over_cap(self):
        self.assertEqual(self.check('weak', 'expensive', 30, ['Debt'])['action'], 'sell_review')

    def test_held_over_cap_is_trim_whatever_the_price(self):
        for quality in ('strong', 'mixed'):
            for valuation in ('cheap', 'fair', 'expensive', 'not_judged'):
                with self.subTest(quality=quality, valuation=valuation):
                    self.assertEqual(
                        self.check(quality, valuation, 16),
                        {'action': 'trim', 'reason': 'Over your 15% cap'},
                    )

    def test_exactly_at_cap_is_not_over(self):
        self.assertEqual(self.check('strong', 'expensive', 15)['action'], 'add')

    def test_held_strong_is_add_whatever_the_price(self):
        for valuation in ('cheap', 'fair', 'expensive', 'not_judged'):
            with self.subTest(valuation=valuation):
                self.assertEqual(
                    self.check('strong', valuation, 5),
                    {'action': 'add', 'reason': 'Quality passes and it is under your 15% cap'},
                )

    def test_held_unknown_quality_over_cap_is_no_verdict_not_trim(self):
        self.assertEqual(self.check('unknown', 'expensive', 30)['action'], 'no_verdict')

    def test_held_mixed_under_cap_is_hold(self):
        self.assertEqual(
            self.check('mixed', 'cheap', 5),
            {'action': 'hold', 'reason': 'Nothing in your plan says to act'},
        )

    def test_not_held_strong_is_buy_whatever_the_price(self):
        for valuation in ('cheap', 'fair', 'expensive', 'not_judged'):
            with self.subTest(valuation=valuation):
                self.assertEqual(
                    self.check('strong', valuation, None),
                    {'action': 'buy', 'reason': 'Quality passes'},
                )

    def test_not_held_mixed_or_weak_is_not_a_fit_naming_failed_checks(self):
        for quality in ('mixed', 'weak'):
            with self.subTest(quality=quality):
                result = self.check(quality, 'cheap', None, ['Debt', 'Margins'])
                self.assertEqual(result['action'], 'not_a_fit')
                self.assertEqual(result['reason'], 'Failed: Debt, Margins')

    def test_unknown_quality_is_no_verdict_held_or_not(self):
        for weight in (None, 5, 30):
            with self.subTest(weight=weight):
                result = self.check('unknown', 'cheap', weight)
                self.assertEqual(result['action'], 'no_verdict')
                self.assertEqual(result['reason'], 'Not enough figures to judge the quality')

    def test_incomplete_quality_is_no_verdict_held_or_not(self):
        for weight in (None, 5, 30):
            with self.subTest(weight=weight):
                result = self.check('incomplete', 'cheap', weight)
                self.assertEqual(result['action'], 'no_verdict')
                self.assertEqual(result['reason'], 'Too many quality checks have no figure to call it strong')
