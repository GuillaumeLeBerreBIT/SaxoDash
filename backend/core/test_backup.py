import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from django.db import connections
from django.test import SimpleTestCase, override_settings

from core.backup import BackupFailed, backup_database


def _dump_succeeds(args, **kwargs):
    Path(_file_arg(args)).write_bytes(b'PGDMP')
    return subprocess.CompletedProcess(args, 0, b'', b'')


def _file_arg(args):
    return next(a.split('=', 1)[1] for a in args if a.startswith('--file='))


def _existing(backup_dir, *stamps):
    backup_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for stamp in stamps:
        path = backup_dir / f'db-{stamp}.dump'
        path.write_bytes(b'PGDMP')
        paths.append(path)
    return paths


class BackupDatabaseTest(SimpleTestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.backup_dir = Path(tmp.name) / 'backups'
        overrides = override_settings(DB_BACKUP_DIR=self.backup_dir, DB_BACKUP_RETAIN=14, DB_BACKUP_MONTHLY=6)
        overrides.enable()
        self.addCleanup(overrides.disable)

    def _backup(self, run=_dump_succeeds, now=None):
        with patch('core.backup.subprocess.run', side_effect=run) as mocked:
            if now:
                with patch('core.backup._now', return_value=now):
                    return backup_database(), mocked
            return backup_database(), mocked

    def test_writes_a_timestamped_custom_format_dump(self):
        path, mocked = self._backup(now=datetime(2026, 11, 4, 3, 15, 0, 123456, tzinfo=timezone.utc))

        self.assertEqual(path, self.backup_dir / 'db-20261104-031500-123456.dump')
        self.assertTrue(path.exists())
        self.assertIn('--format=custom', mocked.call_args.args[0])

    def test_dumps_the_configured_database_with_the_password_out_of_the_command_line(self):
        db = connections['default'].settings_dict

        _, mocked = self._backup()

        args, env = mocked.call_args.args[0], mocked.call_args.kwargs['env']
        self.assertEqual(args[0], 'pg_dump')
        self.assertEqual(env['PGDATABASE'], db['NAME'])
        self.assertEqual(env['PGUSER'], db['USER'])
        self.assertEqual(env['PGHOST'], db['HOST'])
        self.assertEqual(env['PGPASSWORD'], db['PASSWORD'])
        self.assertFalse(any(db['PASSWORD'] and db['PASSWORD'] in a for a in args))

    def test_dumps_into_a_partial_file_and_renames_it_only_on_success(self):
        path, mocked = self._backup()

        self.assertTrue(_file_arg(mocked.call_args.args[0]).endswith('.dump.partial'))
        self.assertEqual(list(self.backup_dir.glob('*.partial')), [])
        self.assertTrue(path.exists())

    def test_a_failed_dump_raises_and_leaves_nothing_that_looks_like_a_backup(self):
        def fails(args, **kwargs):
            Path(_file_arg(args)).write_bytes(b'half')
            raise subprocess.CalledProcessError(1, args, b'', b'connection refused')

        with self.assertRaisesMessage(BackupFailed, 'connection refused'):
            self._backup(run=fails)

        self.assertEqual(list(self.backup_dir.iterdir()), [])

    def test_a_missing_pg_dump_is_named_in_the_error(self):
        def missing(args, **kwargs):
            raise FileNotFoundError('pg_dump')

        with self.assertRaisesMessage(BackupFailed, 'pg_dump is not installed'):
            self._backup(run=missing)

    def test_creates_the_backup_directory_if_missing(self):
        path, _ = self._backup()

        self.assertTrue(path.parent.is_dir())

    def test_keeps_every_backup_from_the_most_recent_days(self):
        with override_settings(DB_BACKUP_RETAIN=2, DB_BACKUP_MONTHLY=0):
            older, = _existing(self.backup_dir, '20261101-030000-000000')
            kept = _existing(self.backup_dir, '20261102-030000-000000', '20261102-141500-000000')

            newest, _ = self._backup(now=datetime(2026, 11, 3, 3, 0, tzinfo=timezone.utc))

        remaining = set(self.backup_dir.glob('db-*.dump'))
        self.assertEqual(remaining, {*kept, newest})
        self.assertNotIn(older, remaining)

    def test_keeps_the_first_backup_of_each_recent_month_beyond_the_daily_window(self):
        with override_settings(DB_BACKUP_RETAIN=1, DB_BACKUP_MONTHLY=2):
            september_first, september_later = _existing(
                self.backup_dir, '20260901-030000-000000', '20260915-030000-000000'
            )
            october_first, october_later = _existing(
                self.backup_dir, '20261001-030000-000000', '20261020-030000-000000'
            )
            august_first, = _existing(self.backup_dir, '20260801-030000-000000')

            newest, _ = self._backup(now=datetime(2026, 11, 3, 3, 0, tzinfo=timezone.utc))

        remaining = set(self.backup_dir.glob('db-*.dump'))
        self.assertEqual(remaining, {newest, october_first})
        self.assertNotIn(september_first, remaining)
        self.assertNotIn(august_first, remaining)

    def test_never_prunes_the_backup_it_just_wrote(self):
        with override_settings(DB_BACKUP_RETAIN=0, DB_BACKUP_MONTHLY=0):
            newest, _ = self._backup()

        self.assertEqual(set(self.backup_dir.glob('db-*.dump')), {newest})

    def test_leaves_files_that_are_not_its_own_dumps_alone(self):
        self.backup_dir.mkdir(parents=True)
        old_sqlite = self.backup_dir / 'db-20250101-030000-000000.sqlite3'
        old_sqlite.write_bytes(b'SQLite format 3')
        with override_settings(DB_BACKUP_RETAIN=1, DB_BACKUP_MONTHLY=0):
            self._backup()

        self.assertTrue(old_sqlite.exists())
