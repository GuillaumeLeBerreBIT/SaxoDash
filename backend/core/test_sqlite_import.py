import hashlib
import tempfile
from datetime import date
from decimal import Decimal
from io import StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TransactionTestCase
from django_celery_beat.models import PeriodicTask
from rest_framework.authtoken.models import Token

from core.models import NetWorthSnapshot
from core.scheduling import PERIODIC_TASKS
from core.sqlite_import import SOURCE_ALIAS, ImportRefused, import_sqlite, source_database

User = get_user_model()


def _digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class ImportSqliteTest(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.databases = cls.databases | {SOURCE_ALIAS}
        cls._tmp = tempfile.TemporaryDirectory()
        cls.source = Path(cls._tmp.name) / 'db.sqlite3'
        with source_database(cls.source):
            call_command('migrate', database=SOURCE_ALIAS, verbosity=0, interactive=False)
            owner = User.objects.db_manager(SOURCE_ALIAS).create_user('guillaume', password='pw')
            owner.user_permissions.add(
                Permission.objects.using(SOURCE_ALIAS).get(codename='view_networthsnapshot')
            )
            Token.objects.using(SOURCE_ALIAS).create(key='a' * 40, user=owner)
            NetWorthSnapshot.objects.using(SOURCE_ALIAS).create(
                user=owner, date=date(2026, 8, 28), portfolio_value=Decimal('1000.00'),
                bank_total=Decimal('250.50'), net_worth=Decimal('1250.50'),
            )

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()
        super().tearDownClass()

    def test_copies_every_row_into_the_default_database(self):
        import_sqlite(self.source)

        owner = User.objects.get(username='guillaume')
        self.assertTrue(owner.check_password('pw'))
        self.assertEqual(Token.objects.get(user=owner).key, 'a' * 40)
        snapshot = NetWorthSnapshot.objects.get()
        self.assertEqual(snapshot.net_worth, Decimal('1250.50'))

    def test_permissions_follow_by_name_not_by_id(self):
        import_sqlite(self.source)

        owner = User.objects.get(username='guillaume')
        self.assertTrue(owner.has_perm('core.view_networthsnapshot'))

    def test_reports_matching_counts_per_model(self):
        counts = dict((label, (src, dst)) for label, src, dst in import_sqlite(self.source))

        self.assertEqual(counts['auth.user'], (1, 1))
        self.assertEqual(counts['core.networthsnapshot'], (1, 1))

    def test_never_changes_the_source_file(self):
        before = _digest(self.source)

        import_sqlite(self.source)

        self.assertEqual(_digest(self.source), before)

    def test_new_rows_continue_after_the_imported_ids(self):
        import_sqlite(self.source)

        later = User.objects.create_user('second')

        self.assertGreater(later.pk, User.objects.get(username='guillaume').pk)

    def test_keeps_the_schedule_from_the_code(self):
        import_sqlite(self.source)

        self.assertEqual(
            set(PeriodicTask.objects.values_list('name', flat=True)) & set(PERIODIC_TASKS),
            set(PERIODIC_TASKS),
        )

    def test_refuses_a_database_that_already_holds_data(self):
        User.objects.create_user('fresh')

        with self.assertRaisesMessage(ImportRefused, '--flush'):
            import_sqlite(self.source)

        self.assertFalse(User.objects.filter(username='guillaume').exists())

    def test_flush_replaces_what_was_there(self):
        User.objects.create_user('fresh')

        import_sqlite(self.source, flush=True)

        self.assertEqual(list(User.objects.values_list('username', flat=True)), ['guillaume'])

    def test_lists_every_value_too_long_for_its_postgres_column_before_copying(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'oversized.sqlite3'
            with source_database(source):
                call_command('migrate', database=SOURCE_ALIAS, verbosity=0, interactive=False)
                User.objects.db_manager(SOURCE_ALIAS).create_user('long', first_name='x' * 151)
                User.objects.db_manager(SOURCE_ALIAS).create_user('longer', last_name='y' * 200)

            with self.assertRaises(ImportRefused) as refused:
                import_sqlite(source)

        message = str(refused.exception)
        self.assertIn('auth.user first_name', message)
        self.assertIn('151 > 150', message)
        self.assertIn('auth.user last_name', message)
        self.assertIn('200 > 150', message)
        self.assertFalse(User.objects.exists())

    def test_refuses_a_missing_file(self):
        with self.assertRaisesMessage(ImportRefused, 'no SQLite database'):
            import_sqlite(Path(self._tmp.name) / 'missing.sqlite3')

    def test_the_command_prints_the_counts_and_fails_on_refusal(self):
        out = StringIO()

        call_command('import_sqlite', str(self.source), stdout=out)

        self.assertIn('core.networthsnapshot', out.getvalue())
        with self.assertRaisesMessage(CommandError, '--flush'):
            call_command('import_sqlite', str(self.source), stdout=StringIO())
