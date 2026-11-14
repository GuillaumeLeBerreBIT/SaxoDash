from django.test import SimpleTestCase

from research import history


def bar(day, close):
    return [day, close, close + 1, close - 1, close, 100]


class AgreesTest(SimpleTestCase):
    def test_equal_closes_on_shared_dates_agree(self):
        self.assertTrue(history.agrees([bar('2026-01-01', 10), bar('2026-01-02', 11)], [bar('2026-01-02', 11.01)]))

    def test_a_restated_close_does_not_agree(self):
        self.assertFalse(history.agrees([bar('2026-01-01', 10), bar('2026-01-02', 11)], [bar('2026-01-02', 5.5)]))

    def test_no_shared_date_cannot_be_confirmed(self):
        self.assertFalse(history.agrees([bar('2026-01-01', 10)], [bar('2026-01-05', 10)]))

    def test_nothing_stored_agrees(self):
        self.assertTrue(history.agrees([], [bar('2026-01-05', 10)]))


class MergedTest(SimpleTestCase):
    def test_keeps_older_bars_and_takes_the_fresh_ones(self):
        stored = [bar('2026-01-01', 10), bar('2026-01-02', 11)]
        fresh = [bar('2026-01-02', 11.02), bar('2026-01-03', 12)]
        bars, kept = history.merged(stored, fresh)
        self.assertTrue(kept)
        self.assertEqual([(b[0], b[4]) for b in bars], [('2026-01-01', 10), ('2026-01-02', 11.02), ('2026-01-03', 12)])

    def test_drops_the_stored_history_after_a_restatement(self):
        stored = [bar('2026-01-01', 10), bar('2026-01-02', 11)]
        fresh = [bar('2026-01-02', 5.5), bar('2026-01-03', 6)]
        self.assertEqual(history.merged(stored, fresh), (fresh, False))


class WithOlderTest(SimpleTestCase):
    def test_prepends_only_bars_before_the_oldest_stored(self):
        bars = [bar('2026-01-03', 12), bar('2026-01-04', 13)]
        page = [bar('2026-01-01', 10), bar('2026-01-02', 11), bar('2026-01-03', 12)]
        result, grew = history.with_older(bars, page)
        self.assertTrue(grew)
        self.assertEqual([b[0] for b in result], ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'])

    def test_reports_when_nothing_older_came_back(self):
        bars = [bar('2026-01-03', 12)]
        self.assertEqual(history.with_older(bars, [bar('2026-01-03', 12)]), (bars, False))
