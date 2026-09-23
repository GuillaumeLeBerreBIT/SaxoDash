"""Local SQLite backups.

Uses sqlite3's own online backup API (Connection.backup), not a raw file
copy - a file copy taken while WAL-mode Django is mid-write can capture a
torn, unreadable snapshot; the backup API is SQLite's own answer to backing
up a live database safely, copying page-by-page under a lock it manages
itself.

The Fernet key that encrypts SaxoCredential/EnableBankingCredential tokens
(SAXO_TOKEN_ENCRYPTION_KEY) lives in backend/.env, not the database, and is
deliberately NOT backed up here - copying .env would also copy every other
secret in it (SAXO_SECRET, FINNHUB_API_KEY, ENABLE_BANKING_PRIVATE_KEY).
Losing that key only forces reconnecting Saxo/Enable Banking - low stakes -
so keep .env's own values written down durably yourself (a password
manager); restoring a database backup without it is still fully usable,
just re-authenticate the two integrations afterwards.

Restoring: stop the app and any Celery worker/beat process, then
    cp backend/backups/db-<timestamp>.sqlite3 backend/db.sqlite3
and restart. There is no in-app restore command deliberately - this is a
rare, high-stakes action better done as a conscious, explicit file copy.
"""
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)


def backup_database():
    """Writes a new timestamped backup and prunes old ones. Returns the
    Path of the backup just written."""
    backup_dir = Path(settings.DB_BACKUP_DIR)
    backup_dir.mkdir(parents=True, exist_ok=True)

    # Microsecond resolution: a scheduled once-daily backup never collides,
    # but tests calling this back-to-back would otherwise land on the same
    # second and silently overwrite each other.
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    dest_path = backup_dir / f'db-{stamp}.sqlite3'

    source = sqlite3.connect(str(settings.DATABASES['default']['NAME']))
    dest = sqlite3.connect(str(dest_path))
    try:
        source.backup(dest)
    finally:
        dest.close()
        source.close()

    logger.info('Database backed up to %s', dest_path)
    _prune(backup_dir)
    return dest_path


def _prune(backup_dir):
    retain = max(settings.DB_BACKUP_RETAIN, 1)  # never prune to zero
    backups = sorted(backup_dir.glob('db-*.sqlite3'))
    for stale in (backups[:-retain] if len(backups) > retain else []):
        stale.unlink()
        logger.info('Pruned old backup %s', stale)
