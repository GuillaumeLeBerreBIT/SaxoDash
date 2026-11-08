import datetime
import os
from decimal import Decimal
from unittest import mock

from cryptography.fernet import Fernet
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

USERS_BEFORE = ('users', '0001_initial')
USERS_AFTER = ('users', '0002_pick_owner')
SAXO_BEFORE = ('saxo', '0003_syncrun_task_ran_idx')
SAXO_AFTER = ('saxo', '0004_per_user')
INVESTORS_BEFORE = ('investors', '0009_investor_successor')
INVESTORS_AFTER = ('investors', '0010_follows_and_reads')
PORTFOLIO_BEFORE = ('portfolio', '0006_remove_position_isin')
PORTFOLIO_AFTER = ('portfolio', '0007_per_user')


def without_owner_env():
    env = {k: v for k, v in os.environ.items() if k != 'SAXODASH_OWNER'}
    return mock.patch.dict(os.environ, env, clear=True)


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode())
class BackfillMigrationTests(TransactionTestCase):
    def migrate(self, *targets):
        executor = MigrationExecutor(connection)
        executor.migrate(list(targets))
        return executor.loader.project_state(list(targets)).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def make_user(self, apps, username):
        return apps.get_model('auth', 'User').objects.create(username=username, password='!')

    def make_owner(self, apps, username='owner'):
        user = self.make_user(apps, username)
        apps.get_model('users', 'Profile').objects.create(user=user, is_owner=True)
        return user

    def test_the_only_user_becomes_the_owner_without_any_setting(self):
        apps = self.migrate(USERS_BEFORE)
        only = self.make_user(apps, 'demo')

        with without_owner_env():
            apps = self.migrate(USERS_AFTER)

        profile = apps.get_model('users', 'Profile').objects.get(user_id=only.pk)
        self.assertTrue(profile.is_owner)
        self.assertTrue(apps.get_model('auth', 'User').objects.get(pk=only.pk).is_superuser)

    def test_an_owner_setting_naming_nobody_stops_the_migration(self):
        apps = self.migrate(USERS_BEFORE)
        self.make_user(apps, 'demo')
        self.make_user(apps, 'other')

        with mock.patch.dict(os.environ, {'SAXODASH_OWNER': 'ghost'}):
            with self.assertRaisesMessage(RuntimeError, "SAXODASH_OWNER='ghost' matches no user"):
                self.migrate(USERS_AFTER)

        apps.get_model('auth', 'User').objects.all().delete()

    def test_saxo_keeps_the_newest_credential_and_gives_everything_to_the_owner(self):
        apps = self.migrate(SAXO_BEFORE, USERS_AFTER)
        owner = self.make_owner(apps)
        Credential = apps.get_model('saxo', 'SaxoCredential')
        expires = timezone.now() + datetime.timedelta(hours=1)
        for token in ('old', 'older-still', 'newest'):
            Credential.objects.create(access_token=token, refresh_token=f'{token}-r', expires_at=expires)
        apps.get_model('saxo', 'SyncRun').objects.create(task='sync_positions', outcome='ok')

        apps = self.migrate(SAXO_AFTER)

        credentials = list(apps.get_model('saxo', 'SaxoCredential').objects.all())
        self.assertEqual([(c.access_token, c.user_id) for c in credentials], [('newest', owner.pk)])
        runs = apps.get_model('saxo', 'SyncRun').objects.values_list('user_id', flat=True)
        self.assertEqual(list(runs), [owner.pk])

    def test_saxo_rows_without_an_owner_stop_the_migration(self):
        apps = self.migrate(SAXO_BEFORE, USERS_AFTER)
        self.make_user(apps, 'not-the-owner')
        apps.get_model('saxo', 'SyncRun').objects.create(task='sync_positions', outcome='ok')

        with self.assertRaisesMessage(RuntimeError, 'no user is the owner'):
            self.migrate(SAXO_AFTER)

        apps.get_model('saxo', 'SyncRun').objects.all().delete()

    def test_investors_follows_and_reads_go_to_the_owner(self):
        apps = self.migrate(INVESTORS_BEFORE, USERS_AFTER)
        owner = self.make_owner(apps)
        Investor = apps.get_model('investors', 'Investor')
        followed = Investor.objects.create(
            name='Followed', firm='A', cik=1, slug='followed-test', followed=True
        )
        Investor.objects.create(name='Ignored', firm='B', cik=2, slug='ignored-test')
        read_at = timezone.now() - datetime.timedelta(days=30)
        alert = apps.get_model('investors', 'FilingAlert').objects.create(
            investor=followed,
            quarter_end=datetime.date(2026, 6, 30),
            filed_on=datetime.date(2026, 8, 14),
            read_at=read_at,
        )

        apps = self.migrate(INVESTORS_AFTER)

        follows = apps.get_model('investors', 'InvestorFollow').objects.values_list(
            'user_id', 'investor_id'
        )
        self.assertEqual(list(follows), [(owner.pk, followed.pk)])
        read = apps.get_model('investors', 'FilingAlertRead').objects.get()
        self.assertEqual((read.user_id, read.alert_id, read.read_at), (owner.pk, alert.pk, read_at))

    def test_portfolio_positions_go_to_the_owner(self):
        apps = self.migrate(PORTFOLIO_BEFORE, USERS_AFTER)
        owner = self.make_owner(apps)
        apps.get_model('portfolio', 'Position').objects.create(
            ticker='NVDA', name='NVIDIA', qty=Decimal('15'), avg_cost=Decimal('412.30'),
            current_price=Decimal('875.40'), sector='Tech', type='Stock', color='green',
        )

        apps = self.migrate(PORTFOLIO_AFTER)

        users = apps.get_model('portfolio', 'Position').objects.values_list('user_id', flat=True)
        self.assertEqual(list(users), [owner.pk])
