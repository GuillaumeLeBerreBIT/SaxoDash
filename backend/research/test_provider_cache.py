from unittest.mock import Mock

from django.core.cache import cache
from django.test import TestCase, override_settings

from .provider_cache import FILL_WAIT_SECONDS, cached, fill_lock_key
from .providers import ProviderUnavailable

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


class Unexpected(ProviderUnavailable):
    def __init__(self):
        super().__init__('unreadable')


def answer(value, ttl=60):
    return Mock(return_value=(value, ttl))


@override_settings(CACHES=LOCMEM)
class CachedTest(TestCase):
    def setUp(self):
        cache.clear()

    def test_returns_a_stored_answer_without_producing(self):
        cache.set('k', {'a': 1}, 60)
        produce = answer({'a': 2})

        self.assertEqual(cached('k', produce), {'a': 1})
        produce.assert_not_called()

    def test_returns_a_stored_empty_answer_without_producing(self):
        cache.set('k', [], 60)
        produce = answer(['new'])

        self.assertEqual(cached('k', produce), [])
        produce.assert_not_called()

    def test_produces_and_stores_for_the_time_the_producer_chose(self):
        produce = answer({'a': 1}, ttl=600)

        self.assertEqual(cached('k', produce), {'a': 1})
        self.assertEqual(cached('k', produce), {'a': 1})
        produce.assert_called_once()

    def test_an_answer_without_a_time_to_live_is_returned_but_not_stored(self):
        produce = answer([], ttl=None)

        cached('k', produce)
        cached('k', produce)

        self.assertEqual(produce.call_count, 2)

    def test_a_provider_refusal_passes_through_and_nothing_is_stored(self):
        produce = Mock(side_effect=ProviderUnavailable('no'))

        with self.assertRaises(ProviderUnavailable):
            cached('k', produce, unexpected=Unexpected)

        self.assertIsNone(cache.get('k'))

    def test_an_unreadable_payload_becomes_the_unexpected_error(self):
        for error in (KeyError('x'), TypeError('x'), IndexError('x'), ValueError('x'), AttributeError('x')):
            with self.subTest(error=type(error).__name__):
                with self.assertRaises(Unexpected):
                    cached('k', Mock(side_effect=error), unexpected=Unexpected)

    def test_without_an_unexpected_error_a_shaping_error_passes_through(self):
        with self.assertRaises(KeyError):
            cached('k', Mock(side_effect=KeyError('x')))

    def test_any_other_error_passes_through(self):
        with self.assertRaises(RuntimeError):
            cached('k', Mock(side_effect=RuntimeError('bug')), unexpected=Unexpected)

    def test_the_fill_lock_is_released_after_success_and_after_failure(self):
        cached('ok', answer(1))
        with self.assertRaises(ProviderUnavailable):
            cached('bad', Mock(side_effect=ProviderUnavailable('no')))

        self.assertIsNone(cache.get(fill_lock_key('ok')))
        self.assertIsNone(cache.get(fill_lock_key('bad')))

    def test_waits_for_a_request_already_filling_the_same_key(self):
        cache.add(fill_lock_key('k'), True, 30)
        produce = answer('mine')
        waits = []

        def other_request_finishes(seconds):
            waits.append(seconds)
            if len(waits) == 3:
                cache.set('k', 'theirs', 60)
                cache.delete(fill_lock_key('k'))

        self.assertEqual(cached('k', produce, sleep=other_request_finishes), 'theirs')
        produce.assert_not_called()
        self.assertEqual(len(waits), 3)

    def test_fills_itself_when_the_other_request_gave_up_without_storing(self):
        cache.add(fill_lock_key('k'), True, 30)
        produce = answer('mine')

        def other_request_fails(seconds):
            cache.delete(fill_lock_key('k'))

        self.assertEqual(cached('k', produce, sleep=other_request_fails), 'mine')
        produce.assert_called_once()

    def test_stops_waiting_after_the_wait_budget_and_fills_itself(self):
        cache.add(fill_lock_key('k'), True, 30)
        produce = answer('mine')
        waited = []

        self.assertEqual(cached('k', produce, sleep=waited.append), 'mine')
        produce.assert_called_once()
        self.assertAlmostEqual(sum(waited), FILL_WAIT_SECONDS, places=5)

    def test_a_waiting_request_leaves_the_other_request_its_lock(self):
        cache.add(fill_lock_key('k'), True, 30)

        cached('k', answer('mine'), sleep=lambda seconds: None)

        self.assertTrue(cache.get(fill_lock_key('k')))
