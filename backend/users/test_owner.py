import importlib
import os
from unittest import mock

from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.db import IntegrityError, transaction
from django.test import TestCase

from users.models import Profile
from users.owner import is_owner, owner
from users.testing import make_user

pick_owner = importlib.import_module('users.migrations.0002_pick_owner').pick_owner


class OwnerTests(TestCase):
    def test_owner_is_none_without_profiles(self):
        self.assertIsNone(owner())

    def test_owner_returns_flagged_user(self):
        first = make_user('a', owner=True)
        self.assertEqual(owner().username, 'a')
        self.assertIs(is_owner(first), True)
        self.assertIs(is_owner(make_user('b')), False)
        self.assertIs(is_owner(AnonymousUser()), False)

    def test_second_owner_is_refused(self):
        make_user('a', owner=True)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_user('b', owner=True)

    def test_new_user_gets_profile(self):
        user = get_user_model().objects.create_user('fresh', password='pw-Strong-123')
        self.assertFalse(Profile.objects.get(user=user).is_owner)

    def test_user_without_profile_is_not_owner(self):
        user = make_user('a')
        Profile.objects.filter(user=user).delete()
        user = get_user_model().objects.get(pk=user.pk)
        self.assertIs(is_owner(user), False)


class PickOwnerTests(TestCase):
    def test_pick_owner_single_user(self):
        user = get_user_model().objects.create_user('solo', password='pw-Strong-123')
        Profile.objects.all().delete()
        pick_owner(apps, None)
        user.refresh_from_db()
        self.assertTrue(Profile.objects.get(user=user).is_owner)
        self.assertTrue(user.is_superuser)

    def test_pick_owner_uses_env(self):
        users = get_user_model().objects
        users.create_user('a', password='pw-Strong-123')
        users.create_user('b', password='pw-Strong-123')
        Profile.objects.all().delete()
        with mock.patch.dict(os.environ, {'SAXODASH_OWNER': 'b'}):
            pick_owner(apps, None)
        self.assertEqual(owner().username, 'b')
        self.assertEqual(Profile.objects.count(), 2)
        self.assertFalse(Profile.objects.get(user__username='a').is_owner)
        self.assertTrue(users.get(username='b').is_superuser)

    def test_pick_owner_fails_without_env(self):
        users = get_user_model().objects
        users.create_user('a', password='pw-Strong-123')
        users.create_user('b', password='pw-Strong-123')
        Profile.objects.all().delete()
        with mock.patch.dict(os.environ, clear=False):
            os.environ.pop('SAXODASH_OWNER', None)
            with self.assertRaisesRegex(RuntimeError, 'SAXODASH_OWNER'):
                pick_owner(apps, None)

    def test_pick_owner_without_users(self):
        pick_owner(apps, None)
        self.assertEqual(Profile.objects.count(), 0)
