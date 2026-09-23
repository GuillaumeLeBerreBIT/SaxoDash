from django.test import TestCase
from django_celery_beat.models import CrontabSchedule, IntervalSchedule, PeriodicTask

from core.scheduling import PERIODIC_TASKS, sync_periodic_tasks


class SyncPeriodicTasksTest(TestCase):
    def test_creates_every_declared_task(self):
        sync_periodic_tasks()
        self.assertEqual(
            PeriodicTask.objects.filter(name__in=PERIODIC_TASKS).count(),
            len(PERIODIC_TASKS),
        )

    def test_is_idempotent(self):
        sync_periodic_tasks()
        sync_periodic_tasks()
        self.assertEqual(
            PeriodicTask.objects.filter(name__in=PERIODIC_TASKS).count(),
            len(PERIODIC_TASKS),
        )

    def test_sync_positions_runs_every_30_minutes(self):
        sync_periodic_tasks()
        task = PeriodicTask.objects.get(name='Sync Saxo positions')
        self.assertEqual(task.task, 'saxo.tasks.sync_positions')
        self.assertEqual(task.interval.every, 30)
        self.assertEqual(task.interval.period, IntervalSchedule.MINUTES)
        self.assertTrue(task.enabled)

    def test_snapshot_net_worth_runs_at_2340_utc(self):
        sync_periodic_tasks()
        task = PeriodicTask.objects.get(name='Snapshot net worth')
        self.assertEqual(task.crontab.minute, '40')
        self.assertEqual(task.crontab.hour, '23')

    def test_reusing_an_existing_matching_schedule_does_not_duplicate_it(self):
        sync_periodic_tasks()
        sync_periodic_tasks()
        # sync_positions, sync_account_balance, sync_closed_positions and
        # sync_watchlists all share the same 30-minute interval - confirm
        # they share one IntervalSchedule row, not four.
        thirty_min_schedules = IntervalSchedule.objects.filter(
            every=30, period=IntervalSchedule.MINUTES)
        self.assertEqual(thirty_min_schedules.count(), 1)

    def _daily_crontab(self):
        return CrontabSchedule.objects.create(
            minute='0', hour='1', day_of_week='*', day_of_month='*', month_of_year='*',
        )

    def test_removes_the_dead_sync_transactions_row(self):
        PeriodicTask.objects.create(
            name='Sync Saxo transactions', task='saxo.tasks.sync_transactions',
            enabled=False, crontab=self._daily_crontab(),
        )
        sync_periodic_tasks()
        self.assertFalse(
            PeriodicTask.objects.filter(task='saxo.tasks.sync_transactions').exists()
        )

    def test_warns_about_an_enabled_task_not_in_the_canonical_list(self):
        PeriodicTask.objects.create(
            name='Some ad-hoc admin edit', task='some.app.tasks.mystery', enabled=True,
            crontab=self._daily_crontab(),
        )
        warnings = []

        class Stdout:
            def write(self, msg):
                warnings.append(msg)

        sync_periodic_tasks(stdout=Stdout())
        self.assertTrue(any('mystery' in w for w in warnings))

    def test_does_not_warn_about_celerys_own_built_in_tasks(self):
        PeriodicTask.objects.create(
            name='celery.backend_cleanup', task='celery.backend_cleanup', enabled=True,
            crontab=self._daily_crontab(),
        )
        warnings = []

        class Stdout:
            def write(self, msg):
                warnings.append(msg)

        sync_periodic_tasks(stdout=Stdout())
        self.assertFalse(any('backend_cleanup' in w for w in warnings))
