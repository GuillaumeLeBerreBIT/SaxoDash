from django.test import SimpleTestCase

from verdicts import actions


class ActionTest(SimpleTestCase):
    def check(self, quality, valuation, weight, failed=()):
        return actions.action(quality, valuation, weight, list(failed))

    def test_cap_is_fifteen(self):
        self.assertEqual(actions.WEIGHT_CAP_PCT, 15)

    def test_held_weak_is_sell_review_listing_failed_checks(self):
        result = self.check('weak', 'cheap', 5, ['Debt', 'Margins'])
        self.assertEqual(result['action'], 'sell_review')
        self.assertEqual(result['reason'], 'Story check failed: Debt, Margins')

    def test_weak_beats_over_cap(self):
        self.assertEqual(self.check('weak', 'expensive', 30, ['Debt'])['action'], 'sell_review')

    def test_held_over_cap_and_expensive_is_trim(self):
        self.assertEqual(self.check('strong', 'expensive', 16), {
            'action': 'trim',
            'reason': 'Over your 15% cap and expensive against its own history',
        })

    def test_trim_applies_to_mixed_quality_too(self):
        self.assertEqual(self.check('mixed', 'expensive', 20)['action'], 'trim')

    def test_exactly_at_cap_is_not_over(self):
        self.assertEqual(self.check('strong', 'expensive', 15)['action'], 'hold')

    def test_held_strong_cheap_is_add(self):
        result = self.check('strong', 'cheap', 5)
        self.assertEqual(result['action'], 'add')
        self.assertEqual(result['reason'], 'Quality passes and the price is in its cheap range')

    def test_held_unknown_quality_over_cap_and_expensive_is_no_verdict_not_trim(self):
        self.assertEqual(self.check('unknown', 'expensive', 30)['action'], 'no_verdict')

    def test_held_anything_else_is_hold(self):
        self.assertEqual(
            self.check('mixed', 'fair', 5),
            {'action': 'hold', 'reason': 'Nothing in your plan says to act'},
        )

    def test_held_strong_not_judged_is_hold(self):
        self.assertEqual(self.check('strong', 'not_judged', 5)['action'], 'hold')

    def test_held_over_cap_and_fair_is_hold_naming_the_cap(self):
        result = self.check('strong', 'fair', 16)
        self.assertEqual(result['action'], 'hold')
        self.assertIn('over your 15% cap', result['reason'].lower())
        self.assertEqual(result['reason'], 'Nothing in your plan says to act. Over your 15% cap.')

    def test_not_held_strong_cheap_is_buy(self):
        result = self.check('strong', 'cheap', None)
        self.assertEqual(result['action'], 'buy')
        self.assertEqual(result['reason'], 'Quality passes and the price is in its cheap range')

    def test_not_held_strong_fair_or_expensive_or_not_judged_is_wait(self):
        for valuation in ('fair', 'expensive', 'not_judged'):
            with self.subTest(valuation=valuation):
                result = self.check('strong', valuation, None)
                self.assertEqual(result['action'], 'wait')
                self.assertEqual(result['reason'], 'Quality passes; price is not in its cheap range')

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
