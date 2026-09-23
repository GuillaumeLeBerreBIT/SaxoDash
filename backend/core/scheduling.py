"""The canonical Celery Beat schedule, version-controlled here instead of
living only in django_celery_beat's database tables (DatabaseScheduler still
reads from the DB at runtime - this module is the source of truth a fresh
environment or a reviewable PR can see, and sync_periodic_tasks() is what
writes it into the DB, idempotently, from a migration or a management
command).

To change a schedule: edit PERIODIC_TASKS here, then run
`python manage.py sync_periodic_tasks` (or add a migration that calls
sync_periodic_tasks() so existing environments pick it up automatically).
"""
from django_celery_beat.models import CrontabSchedule, IntervalSchedule, PeriodicTask

# Name -> {task, and either 'interval': (every, period) or 'crontab': {...}}.
# Every entry here is exactly what was live in the dev database on
# 2026-09-23 (verified by reading django_celery_beat_periodictask directly).
PERIODIC_TASKS = {
    'Refresh Saxo token': {
        'task': 'saxo.tasks.refresh_saxo_token',
        'interval': (10, IntervalSchedule.MINUTES),
    },
    'Sync Saxo positions': {
        'task': 'saxo.tasks.sync_positions',
        'interval': (30, IntervalSchedule.MINUTES),
    },
    'Sync Saxo account balance': {
        'task': 'saxo.tasks.sync_account_balance',
        'interval': (30, IntervalSchedule.MINUTES),
    },
    'Sync Saxo closed positions': {
        'task': 'saxo.tasks.sync_closed_positions',
        'interval': (30, IntervalSchedule.MINUTES),
    },
    'Sync watchlists': {
        'task': 'research.tasks.sync_watchlists',
        'interval': (30, IntervalSchedule.MINUTES),
    },
    'Sync Enable Banking balances': {
        'task': 'enablebanking.tasks.sync_enablebanking_balances',
        'interval': (3, IntervalSchedule.HOURS),
    },
    'Sync Enable Banking transactions': {
        'task': 'enablebanking.tasks.sync_enablebanking_transactions',
        'interval': (3, IntervalSchedule.HOURS),
    },
    'Detect subscriptions': {
        'task': 'enablebanking.tasks.detect_enablebanking_subscriptions',
        'interval': (3, IntervalSchedule.HOURS),
    },
    'Snapshot net worth': {
        'task': 'core.tasks.snapshot_net_worth',
        'crontab': {'minute': '40', 'hour': '23'},
    },
    'Backfill position sectors': {
        'task': 'portfolio.tasks.backfill_position_sectors',
        'crontab': {'minute': '0', 'hour': '4'},
    },
    'Backup database': {
        'task': 'core.tasks.backup_database_task',
        'crontab': {'minute': '30', 'hour': '4'},
    },
}

# Celery/django-celery-beat's own built-in tasks - never declared above,
# never touched by sync_periodic_tasks.
_UNMANAGED_TASK_PREFIXES = ('celery.',)

# Dead as of this plan: the task this pointed at (saxo.tasks.sync_transactions)
# no longer exists in code, superseded by sync_closed_positions. Was already
# disabled everywhere seen - removed outright rather than carried forward.
_DEAD_TASKS = ('saxo.tasks.sync_transactions',)


def sync_periodic_tasks(stdout=None):
    """Create/update every task in PERIODIC_TASKS, remove the known dead
    task, and warn (never silently delete) about anything else enabled in
    the DB that this module doesn't recognize - most likely drift from an
    ad-hoc admin edit that was never added here."""
    def log(msg):
        if stdout is not None:
            stdout.write(msg)

    for name, spec in PERIODIC_TASKS.items():
        defaults = {'task': spec['task'], 'enabled': True}
        if 'interval' in spec:
            every, period = spec['interval']
            schedule, _ = IntervalSchedule.objects.get_or_create(every=every, period=period)
            defaults['interval'] = schedule
            defaults['crontab'] = None
        else:
            crontab = spec['crontab']
            schedule, _ = CrontabSchedule.objects.get_or_create(
                minute=crontab['minute'], hour=crontab['hour'],
                day_of_week='*', day_of_month='*', month_of_year='*',
            )
            defaults['crontab'] = schedule
            defaults['interval'] = None
        PeriodicTask.objects.update_or_create(name=name, defaults=defaults)
        log(f'  {name}: ok')

    removed, _ = PeriodicTask.objects.filter(task__in=_DEAD_TASKS).delete()
    if removed:
        log(f'  removed {removed} stale row(s) for {", ".join(_DEAD_TASKS)}')

    orphans = PeriodicTask.objects.exclude(name__in=PERIODIC_TASKS).filter(enabled=True)
    for orphan in orphans:
        if orphan.task.startswith(_UNMANAGED_TASK_PREFIXES):
            continue
        log(f'  WARNING: enabled periodic task "{orphan.name}" ({orphan.task}) is not '
            f'declared in core.scheduling.PERIODIC_TASKS - drifted from an admin edit? '
            f'Add it there or disable it.')
