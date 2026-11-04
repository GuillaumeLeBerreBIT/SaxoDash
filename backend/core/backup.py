import logging
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.db import connections

logger = logging.getLogger(__name__)

STAMP_FORMAT = '%Y%m%d-%H%M%S-%f'
DUMP_GLOB = 'db-*.dump'


class BackupFailed(Exception):
    pass


def _now():
    return datetime.now(timezone.utc)


def _pg_env():
    db = connections['default'].settings_dict
    env = dict(os.environ)
    env.update({
        'PGDATABASE': db['NAME'],
        'PGUSER': db['USER'],
        'PGPASSWORD': db['PASSWORD'],
        'PGHOST': db['HOST'],
        'PGPORT': str(db['PORT']),
    })
    return env


def backup_database():
    backup_dir = Path(settings.DB_BACKUP_DIR)
    backup_dir.mkdir(parents=True, exist_ok=True)
    dest_path = backup_dir / f'db-{_now().strftime(STAMP_FORMAT)}.dump'
    partial_path = dest_path.with_name(dest_path.name + '.partial')

    try:
        subprocess.run(
            ['pg_dump', '--format=custom', '--no-owner', f'--file={partial_path}'],
            env=_pg_env(), check=True, capture_output=True,
        )
    except FileNotFoundError as exc:
        partial_path.unlink(missing_ok=True)
        raise BackupFailed('pg_dump is not installed on this machine') from exc
    except subprocess.CalledProcessError as exc:
        partial_path.unlink(missing_ok=True)
        detail = (exc.stderr or b'').decode(errors='replace').strip()
        raise BackupFailed(f'pg_dump failed: {detail}') from exc
    except BaseException:
        partial_path.unlink(missing_ok=True)
        raise
    partial_path.replace(dest_path)

    logger.info('Database backed up to %s', dest_path)
    _prune(backup_dir, keep=dest_path)
    return dest_path


def _day(path):
    return path.name[3:11]


def _month(path):
    return path.name[3:9]


def _prune(backup_dir, keep):
    backups = sorted(backup_dir.glob(DUMP_GLOB))
    recent_days = sorted({_day(p) for p in backups}, reverse=True)[:max(settings.DB_BACKUP_RETAIN, 0)]
    recent_months = sorted({_month(p) for p in backups}, reverse=True)[:max(settings.DB_BACKUP_MONTHLY, 0)]
    first_of_month = {}
    for path in backups:
        first_of_month.setdefault(_month(path), path)
    retained = {keep}
    retained.update(p for p in backups if _day(p) in recent_days)
    retained.update(first_of_month[m] for m in recent_months)
    for stale in backups:
        if stale not in retained:
            stale.unlink()
            logger.info('Pruned old backup %s', stale)
