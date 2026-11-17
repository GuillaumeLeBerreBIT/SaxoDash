from datetime import date, timedelta

from django.test import SimpleTestCase

from verdicts.growth_line import steps


def quarters(start, values):
    return [(start + timedelta(days=91 * i), value) for i, value in enumerate(values)]


class GrowthLineTests(SimpleTestCase):
    def test_a_quarter_counts_35_days_after_its_end(self):
        eps = quarters(date(2018, 3, 31), [1.0] * 16 + [2.0])
        last = steps(eps, today=date(2026, 1, 1))[-1]
        self.assertEqual(last['from'], (eps[-1][0] + timedelta(days=35)).isoformat())

    def test_no_step_uses_a_quarter_known_after_the_step(self):
        eps = quarters(date(2016, 3, 31), [1 + i * 0.1 for i in range(30)])
        for step in steps(eps, today=date(2026, 1, 1)):
            known = [d for d, _ in eps if d + timedelta(days=35) <= date.fromisoformat(step['from'])]
            self.assertAlmostEqual(
                step['eps_ttm'],
                round(sum(v for _, v in sorted(eps)[len(known) - 4:len(known)]), 2),
            )

    def test_a_one_off_quarter_is_replaced_by_the_median_of_the_four_before(self):
        eps = quarters(date(2018, 3, 31), [2.0] * 16 + [9.0, 2.0])
        by_from = {s['from']: s for s in steps(eps, today=date(2026, 1, 1))}
        spike = by_from[(eps[16][0] + timedelta(days=35)).isoformat()]
        self.assertEqual(spike['eps_ttm'], 8.0)

    def test_low_one_off_is_replaced_too_and_neighbours_are_kept(self):
        eps = quarters(date(2018, 3, 31), [2.0] * 16 + [0.5, 2.6])
        s = steps(eps, today=date(2026, 1, 1))
        self.assertEqual(s[-2]['eps_ttm'], 8.0)
        self.assertEqual(s[-1]['eps_ttm'], 8.6)

    def test_fewer_than_four_quarters_gives_no_step_and_a_loss_ends_the_line(self):
        self.assertEqual(steps(quarters(date(2024, 3, 31), [1.0, 1.0, 1.0]), today=date(2026, 1, 1)), [])
        loss = quarters(date(2016, 3, 31), [1.0] * 16 + [-3.0] * 4 + [1.0] * 4)
        line = steps(loss, today=date(2026, 1, 1))
        first_loss = (loss[18][0] + timedelta(days=35)).isoformat()
        resumed = (loss[23][0] + timedelta(days=35)).isoformat()
        ends = [s for s in line if s['price'] is None]
        self.assertEqual(ends, [{'from': first_loss, 'price': None, 'pe': None, 'growth': None, 'eps_ttm': None, 'capped': False}])
        self.assertFalse([s for s in line if first_loss <= s['from'] < resumed and s['price'] is not None])
        self.assertIsNotNone(line[-1]['price'])

    def test_slow_growth_takes_the_floor_and_fast_growth_is_capped(self):
        flat = steps(quarters(date(2016, 3, 31), [1.0] * 20), today=date(2026, 1, 1))[-1]
        self.assertEqual((flat['pe'], flat['capped']), (15.0, False))
        fast = steps(quarters(date(2015, 3, 31), [1.5 ** (i / 4) for i in range(40)]), today=date(2026, 1, 1))[-1]
        self.assertEqual((fast['pe'], fast['capped']), (30.0, True))
        self.assertEqual(fast['price'], round(30.0 * fast['eps_ttm'], 2))

    def test_growth_between_floor_and_cap_is_the_fair_pe(self):
        eps = quarters(date(2015, 3, 31), [1.2 ** (i / 4) for i in range(40)])
        last = steps(eps, today=date(2026, 1, 1))[-1]
        self.assertAlmostEqual(last['pe'], 20.0, delta=0.2)
        self.assertFalse(last['capped'])

    def test_only_the_last_ten_years_are_kept(self):
        eps = quarters(date(2000, 3, 31), [1.0 + i * 0.05 for i in range(100)])
        first = steps(eps, today=date(2026, 1, 1))[0]
        self.assertGreaterEqual(date.fromisoformat(first['from']), date(2016, 1, 1))
