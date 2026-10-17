from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from . import run_lock

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM)
class RunLockTest(SimpleTestCase):
    def tearDown(self):
        cache.delete(run_lock.KEY)

    def test_a_second_holder_is_told_who_holds_it(self):
        with run_lock.exclusive('backfill'):
            with self.assertRaises(run_lock.Busy) as raised:
                with run_lock.exclusive('daily sync'):
                    pass
        self.assertEqual(raised.exception.holder, 'backfill')

    def test_releasing_never_deletes_a_lock_someone_else_took_over(self):
        with run_lock.exclusive('backfill'):
            cache.set(run_lock.KEY, 'daily sync:other', run_lock.TTL)
        self.assertEqual(cache.get(run_lock.KEY), 'daily sync:other')

    def test_each_pause_keeps_the_lock_alive(self):
        with run_lock.exclusive('backfill') as held, \
                mock.patch.object(run_lock.time, 'sleep') as sleep, \
                mock.patch.object(run_lock.cache, 'touch', wraps=cache.touch) as touch:
            held.pause(1)
        sleep.assert_called_once_with(1)
        touch.assert_called_once_with(run_lock.KEY, run_lock.TTL)

    def test_a_pause_after_losing_the_lock_does_not_extend_the_new_holder(self):
        with run_lock.exclusive('backfill') as held, \
                mock.patch.object(run_lock.time, 'sleep'), \
                mock.patch.object(run_lock.cache, 'touch') as touch:
            cache.set(run_lock.KEY, 'daily sync:other', run_lock.TTL)
            held.pause(1)
        touch.assert_not_called()
