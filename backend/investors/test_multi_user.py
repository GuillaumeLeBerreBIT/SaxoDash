from datetime import date
from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from users.testing import make_user, the_owner

from . import alerts
from .factories import make_investor, store_quarter
from .models import FilingAlert, FilingAlertRead, Investor, InvestorFollow

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)
PERSHING = {'cik': 1336528, 'name': 'Pershing Square Capital Management, L.P.', 'last_13f': '2026-08-14'}


def as_user(client, user):
    client.force_authenticate(user)


@override_settings(CACHES=LOCMEM)
class InvestorsMultiUserTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.owner = the_owner()
        self.alice = make_user('alice')
        self.bob = make_user('bob')

    def follow_url(self, slug):
        return reverse('investor-detail', args=[slug])

    def followed(self, user, slug):
        as_user(self.client, user)
        card = next(c for c in self.client.get(reverse('investor-list')).data if c['slug'] == slug)
        return card['followed']

    def test_follow_is_per_user(self):
        make_investor()
        as_user(self.client, self.alice)

        response = self.client.patch(self.follow_url('berkshire-hathaway'), {'followed': True}, format='json')

        self.assertEqual((response.status_code, response.data['followed']), (200, True))
        self.assertTrue(self.followed(self.alice, 'berkshire-hathaway'))
        self.assertFalse(self.followed(self.bob, 'berkshire-hathaway'))
        self.assertFalse(self.followed(self.owner, 'berkshire-hathaway'))

    def test_unfollowing_only_removes_your_own_follow(self):
        investor = make_investor(followed_by=[self.alice, self.bob])
        as_user(self.client, self.alice)

        self.client.patch(self.follow_url(investor.slug), {'followed': False}, format='json')

        self.assertEqual(list(InvestorFollow.objects.values_list('user__username', flat=True)), ['bob'])

    def test_inbox_and_read_state_are_per_user(self):
        investor = make_investor(followed_by=[self.alice, self.bob])
        store_quarter(investor, Q1, [('037833100', 'APPLE INC', 100, 600)])
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 150, 900)])
        FilingAlert.objects.create(investor=investor, quarter_end=Q2, filed_on=date(2026, 8, 14))
        as_user(self.client, self.alice)

        after = self.client.post(reverse('investor-alerts-read'))

        self.assertEqual((after.data['unread'], after.data['alerts'][0]['read']), (0, True))
        self.assertEqual(FilingAlertRead.objects.filter(user=self.alice).count(), 1)
        self.assertFalse(FilingAlertRead.objects.filter(user=self.bob).exists())
        as_user(self.client, self.bob)
        theirs = self.client.get(reverse('investor-alerts'))
        self.assertEqual((theirs.data['unread'], theirs.data['alerts'][0]['read']), (1, False))
        as_user(self.client, self.owner)
        self.assertEqual(self.client.get(reverse('investor-alerts')).data, {'unread': 0, 'alerts': []})

    def test_marking_read_twice_keeps_one_row(self):
        investor = make_investor(followed_by=[self.alice])
        FilingAlert.objects.create(investor=investor, quarter_end=Q2, filed_on=date(2026, 8, 14))

        alerts.mark_read(self.alice)
        alerts.mark_read(self.alice)

        self.assertEqual(FilingAlertRead.objects.count(), 1)

    def test_alert_raised_when_any_user_follows(self):
        investor = make_investor(followed_by=[self.bob])
        entries = [{'quarter_end': Q2, 'filed_on': date(2026, 8, 14)}]

        alerts.record(investor, Q1, entries)

        self.assertEqual(FilingAlert.objects.count(), 1)

    def test_no_alert_when_nobody_follows(self):
        investor = make_investor()

        alerts.record(investor, Q1, [{'quarter_end': Q2, 'filed_on': date(2026, 8, 14)}])

        self.assertFalse(FilingAlert.objects.exists())

    def test_alert_still_needs_a_newer_quarter(self):
        investor = make_investor(followed_by=[self.bob])

        alerts.record(investor, Q2, [{'quarter_end': Q1, 'filed_on': date(2026, 5, 15)}])

        self.assertFalse(FilingAlert.objects.exists())

    @patch('research.views.connection_state')
    @patch('research.views.tasks.scan_universe.delay')
    @patch('research.views.scan_progress.claim', return_value=True)
    def test_non_owner_cannot_start_discover_scan(self, claim, delay, state):
        as_user(self.client, self.alice)

        response = self.client.post(reverse('research-discover-scan'))

        self.assertEqual(response.status_code, 403)
        delay.assert_not_called()
        claim.assert_not_called()

    @patch('research.views.connection_state')
    @patch('research.views.tasks.scan_universe.delay')
    @patch('research.views.scan_progress.claim', return_value=True)
    def test_owner_can_start_discover_scan(self, claim, delay, state):
        state.return_value.usable = True
        as_user(self.client, self.owner)

        response = self.client.post(reverse('research-discover-scan'))

        self.assertEqual(response.status_code, 202)
        delay.assert_called_once_with(claimed=True)

    @patch('investors.tracking.tasks.backfill_investor.delay')
    @patch('investors.tracking.edgar.filer', return_value=PERSHING)
    def test_any_user_may_add_investor_and_added_by_is_set(self, filer, delay):
        as_user(self.client, self.alice)

        response = self.client.post(reverse('investor-list'), {'cik': 1336528}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Investor.objects.get(cik=1336528).added_by, self.alice)

    def remove(self, user, slug='acme'):
        as_user(self.client, user)
        return self.client.delete(reverse('investor-detail', args=[slug])).status_code

    def test_remove_investor_rules(self):
        mine = make_investor(curated=False, slug='acme', cik=11, added_by=self.alice)
        self.assertEqual(self.remove(self.bob), 403)
        self.assertEqual(self.remove(self.alice), 204)
        self.assertFalse(Investor.objects.filter(pk=mine.pk).exists())

    def test_the_adder_cannot_remove_what_someone_else_follows(self):
        make_investor(curated=False, slug='acme', cik=11, added_by=self.alice, followed_by=[self.bob])

        self.assertEqual(self.remove(self.alice), 403)
        self.assertTrue(Investor.objects.filter(slug='acme').exists())

    def test_the_adder_may_remove_when_only_they_follow(self):
        make_investor(curated=False, slug='acme', cik=11, added_by=self.alice, followed_by=[self.alice])

        self.assertEqual(self.remove(self.alice), 204)

    def test_the_owner_may_remove_any_added_investor(self):
        make_investor(curated=False, slug='acme', cik=11, added_by=self.alice, followed_by=[self.bob])

        self.assertEqual(self.remove(self.owner), 204)

    def test_an_investor_nobody_added_is_removable_only_by_the_owner(self):
        make_investor(curated=False, slug='acme', cik=11)

        self.assertEqual(self.remove(self.alice), 403)
        self.assertEqual(self.remove(self.owner), 204)

    def test_curated_investors_stay_unremovable(self):
        make_investor(slug='acme', cik=11, added_by=self.alice)

        for user in (self.alice, self.bob, self.owner):
            self.assertEqual(self.remove(user), 409)
        self.assertTrue(Investor.objects.filter(slug='acme').exists())
