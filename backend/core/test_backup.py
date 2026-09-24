import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from django.test import override_settings

from core.backup import backup_database


class BackupDatabaseTest(unittest.TestCase):
    """A plain unittest.TestCase, not django.test.TestCase: backup_database()
    opens its own raw sqlite3 connection to whatever settings.DATABASES.NAME
    is, and Django's TestCase wraps every test in a transaction on its own
    connection to that same name - the two interact badly under Django's
    in-memory shared-cache test database. Using an explicit real temp file
    as the source (overriding DATABASES.NAME to point at it) tests the same
    behaviour without that entanglement."""

    def _make_source_db(self, path):
        con = sqlite3.connect(str(path))
        con.execute('CREATE TABLE core_networthsnapshot (id INTEGER PRIMARY KEY)')
        con.commit()
        con.close()

    def test_creates_a_timestamped_copy_of_the_live_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source.sqlite3'
            self._make_source_db(source)
            with override_settings(
                DATABASES={'default': {'NAME': source}},
                DB_BACKUP_DIR=Path(tmp) / 'backups', DB_BACKUP_RETAIN=14,
            ):
                path = backup_database()
                self.assertTrue(path.exists())
                self.assertTrue(path.name.startswith('db-'))
                self.assertTrue(path.name.endswith('.sqlite3'))

    def test_the_copy_is_a_valid_readable_sqlite_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source.sqlite3'
            self._make_source_db(source)
            with override_settings(
                DATABASES={'default': {'NAME': source}},
                DB_BACKUP_DIR=Path(tmp) / 'backups', DB_BACKUP_RETAIN=14,
            ):
                path = backup_database()
                con = sqlite3.connect(str(path))
                cur = con.cursor()
                cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = {row[0] for row in cur.fetchall()}
                con.close()
                self.assertIn('core_networthsnapshot', tables)

    def test_prunes_old_backups_beyond_the_retention_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source.sqlite3'
            self._make_source_db(source)
            backup_dir = Path(tmp) / 'backups'
            with override_settings(
                DATABASES={'default': {'NAME': source}},
                DB_BACKUP_DIR=backup_dir, DB_BACKUP_RETAIN=2,
            ):
                first = backup_database()
                second = backup_database()
                third = backup_database()
                remaining = sorted(backup_dir.glob('db-*.sqlite3'))
                self.assertEqual(len(remaining), 2)
                self.assertNotIn(first, remaining)
                self.assertIn(second, remaining)
                self.assertIn(third, remaining)

    def test_never_prunes_down_to_zero_even_if_retain_is_misconfigured(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source.sqlite3'
            self._make_source_db(source)
            backup_dir = Path(tmp) / 'backups'
            with override_settings(
                DATABASES={'default': {'NAME': source}},
                DB_BACKUP_DIR=backup_dir, DB_BACKUP_RETAIN=0,
            ):
                backup_database()
                backup_database()
                remaining = list(backup_dir.glob('db-*.sqlite3'))
                self.assertEqual(len(remaining), 1)

    def test_creates_the_backup_directory_if_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source.sqlite3'
            self._make_source_db(source)
            target = Path(tmp) / 'nested' / 'backups'
            with override_settings(
                DATABASES={'default': {'NAME': source}},
                DB_BACKUP_DIR=target, DB_BACKUP_RETAIN=14,
            ):
                path = backup_database()
                self.assertTrue(path.exists())

    def test_a_failed_backup_leaves_nothing_that_looks_like_a_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source.sqlite3'
            self._make_source_db(source)
            backup_dir = Path(tmp) / 'backups'
            real_connect = sqlite3.connect
            broken_source = MagicMock()
            broken_source.backup.side_effect = sqlite3.OperationalError('disk I/O error')
            connections = iter([broken_source])

            def connect(path, *args, **kwargs):
                return next(connections, None) or real_connect(path, *args, **kwargs)

            with override_settings(
                DATABASES={'default': {'NAME': source}},
                DB_BACKUP_DIR=backup_dir, DB_BACKUP_RETAIN=14,
            ), patch('core.backup.sqlite3.connect', side_effect=connect):
                with self.assertRaises(sqlite3.OperationalError):
                    backup_database()
            self.assertEqual(list(backup_dir.iterdir()), [])

    def test_a_missing_source_database_raises_instead_of_backing_up_an_empty_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'missing.sqlite3'
            backup_dir = Path(tmp) / 'backups'
            with override_settings(
                DATABASES={'default': {'NAME': source}},
                DB_BACKUP_DIR=backup_dir, DB_BACKUP_RETAIN=14,
            ):
                with self.assertRaises(FileNotFoundError):
                    backup_database()
            self.assertFalse(source.exists())
            self.assertEqual(list(backup_dir.glob('db-*.sqlite3')), [])
