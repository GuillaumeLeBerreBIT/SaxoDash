from datetime import date
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from . import alerts, importer
from .factories import make_investor, store_quarter
from .models import FilingAlert, Security
from .test_importer import ALLY, APPLE, NEWEST, OLDER, Q1, Q2, listing, primary, table

Q3 = date(2026, 9, 30)
SINCE = date(2021, 10, 5)


def filed(investor):
    return [(alert.quarter_end, alert.filed_on) for alert in FilingAlert.objects.filter(investor=investor)]


@patch('investors.importer.figi.resolve', return_value=iter([]))
@patch('investors.importer.edgar.filing_documents')
@patch('investors.importer.edgar.filings')
class RecordOnImportTest(TestCase):
    def setUp(self):
        self.investor = make_investor(followed=True)
        store_quarter(self.investor, Q1, [APPLE])

    def test_a_newer_quarter_from_a_followed_investor_raises_one_alert(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.return_value = (primary(), table(APPLE, ALLY))

        importer.sync_investor(self.investor, SINCE)

        self.assertEqual(filed(self.investor), [(Q2, date(2026, 8, 14))])
        self.assertIsNone(FilingAlert.objects.get().read_at)

    def test_an_investor_you_do_not_follow_raises_nothing(self, filings, documents, resolve):
        quiet = make_investor(cik=2, slug='quiet', firm='Quiet')
        store_quarter(quiet, Q1, [APPLE])
        filings.return_value = [NEWEST]
        documents.return_value = (primary(), table(APPLE))

        importer.sync_investor(quiet, SINCE)

        self.assertFalse(FilingAlert.objects.exists())

    def test_the_first_import_of_an_investor_is_history_not_news(self, filings, documents, resolve):
        fresh = make_investor(cik=3, slug='fresh', firm='Fresh', followed=True)
        filings.return_value = [NEWEST, OLDER]
        documents.side_effect = [(primary(), table(APPLE)), (primary(), table(ALLY))]

        importer.sync_investor(fresh, SINCE)

        self.assertFalse(FilingAlert.objects.exists())

    def test_a_late_filing_for_a_quarter_already_stored_is_not_news(self, filings, documents, resolve):
        filings.return_value = [listing('A-9', Q1, date(2026, 6, 1), form='13F-HR/A')]
        documents.return_value = (primary('RESTATEMENT'), table(APPLE))

        importer.sync_investor(self.investor, SINCE)

        self.assertFalse(FilingAlert.objects.exists())

    def test_an_amendment_arriving_with_its_quarter_shares_the_alert(self, filings, documents, resolve):
        filings.return_value = [listing('A-3', Q2, date(2026, 8, 20), form='13F-HR/A'), NEWEST]
        documents.side_effect = [(primary('RESTATEMENT'), table(APPLE)), (primary(), table(APPLE, ALLY))]

        importer.sync_investor(self.investor, SINCE)

        self.assertEqual(filed(self.investor), [(Q2, date(2026, 8, 14))])

    def test_two_quarters_caught_up_at_once_are_two_alerts(self, filings, documents, resolve):
        filings.return_value = [listing('A-4', Q3, date(2026, 11, 14)), NEWEST]
        documents.side_effect = [(primary(), table(APPLE)), (primary(), table(ALLY))]

        importer.sync_investor(self.investor, SINCE)

        self.assertEqual(sorted(filed(self.investor)), [(Q2, date(2026, 8, 14)), (Q3, date(2026, 11, 14))])

    def test_an_unreadable_filing_raises_nothing(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.return_value = (primary(), b'<informationTable')

        importer.sync_investor(self.investor, SINCE)

        self.assertFalse(FilingAlert.objects.exists())


class PayloadTest(TestCase):
    def setUp(self):
        self.investor = make_investor(followed=True)
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='67066G104', ticker='NVDA')
        store_quarter(self.investor, Q1, [
            ('037833100', 'APPLE INC', 100, 600), ('02005N100', 'ALLY FINL INC', 5, 300),
            ('88160R101', 'TESLA INC', 10, 100),
        ])
        store_quarter(self.investor, Q2, [
            ('037833100', 'APPLE INC', 150, 900), ('67066G104', 'NVIDIA CORP', 1, 60), ('88160R101', 'TESLA INC', 5, 40),
        ])

    def alert(self, investor=None, quarter_end=Q2, filed_on=date(2026, 8, 14), **fields):
        return FilingAlert.objects.create(
            investor=investor or self.investor, quarter_end=quarter_end, filed_on=filed_on, **fields,
        )

    def test_nothing_filed_is_an_empty_inbox(self):
        self.assertEqual(alerts.payload(), {'unread': 0, 'alerts': []})

    def test_an_alert_says_who_filed_what_and_names_the_biggest_moves(self):
        alert = self.alert()

        payload = alerts.payload()

        self.assertEqual(payload['unread'], 1)
        item = payload['alerts'][0]
        self.assertEqual(
            {key: item[key] for key in ('id', 'quarter', 'filed_on', 'read', 'counts', 'investor')},
            {
                'id': alert.pk, 'quarter': '2026-06-30', 'filed_on': '2026-08-14', 'read': False,
                'counts': {'new': 1, 'added': 1, 'trimmed': 1, 'sold_out': 1},
                'investor': {'slug': 'berkshire-hathaway', 'name': 'Warren Buffett', 'firm': 'Berkshire Hathaway'},
            },
        )
        self.assertEqual(
            [(move['ticker'], move['issuer'], move['kind']) for move in item['moves']],
            [('NVDA', 'NVIDIA CORP', 'new'), ('AAPL', 'APPLE INC', 'added'), (None, 'TESLA INC', 'trimmed')],
        )

    def test_the_newest_filing_comes_first(self):
        self.alert(quarter_end=Q1, filed_on=date(2026, 5, 15))
        self.alert()

        self.assertEqual([item['quarter'] for item in alerts.payload()['alerts']], ['2026-06-30', '2026-03-31'])

    def test_a_first_stored_quarter_has_no_moves_to_name(self):
        self.alert(quarter_end=Q1, filed_on=date(2026, 5, 15))

        item = alerts.payload()['alerts'][0]

        self.assertEqual((item['counts'], item['moves']), ({'new': 0, 'added': 0, 'trimmed': 0, 'sold_out': 0}, []))

    def test_unfollowing_takes_an_investors_alerts_out_of_the_inbox(self):
        self.alert()
        self.investor.followed = False
        self.investor.save()

        self.assertEqual(alerts.payload(), {'unread': 0, 'alerts': []})

    def test_read_alerts_stay_listed_but_are_not_counted(self):
        self.alert(read_at=timezone.now())

        payload = alerts.payload()

        self.assertEqual((payload['unread'], payload['alerts'][0]['read']), (0, True))

    def test_the_list_is_capped_but_the_count_is_not(self):
        for index in range(alerts.LIMIT + 2):
            self.alert(quarter_end=date(2000 + index, 3, 31), filed_on=date(2000 + index, 5, 15))

        payload = alerts.payload()

        self.assertEqual((payload['unread'], len(payload['alerts'])), (alerts.LIMIT + 2, alerts.LIMIT))

    def test_marking_read_clears_the_count_and_keeps_earlier_read_times(self):
        earlier = timezone.now() - timezone.timedelta(days=3)
        seen = self.alert(quarter_end=Q1, filed_on=date(2026, 5, 15), read_at=earlier)
        self.alert()

        alerts.mark_read()

        self.assertEqual(alerts.payload()['unread'], 0)
        seen.refresh_from_db()
        self.assertEqual(seen.read_at, earlier)


class AlertsApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        investor = make_investor(followed=True)
        store_quarter(investor, Q1, [('037833100', 'APPLE INC', 100, 600)])
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 150, 900)])
        FilingAlert.objects.create(investor=investor, quarter_end=Q2, filed_on=date(2026, 8, 14))

    def test_the_inbox_needs_a_login(self):
        self.client.force_authenticate(None)

        self.assertEqual(self.client.get(reverse('investor-alerts')).status_code, 401)
        self.assertEqual(self.client.post(reverse('investor-alerts-read')).status_code, 401)

    def test_the_inbox_is_not_mistaken_for_an_investor_slug(self):
        response = self.client.get(reverse('investor-alerts'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['unread'], len(response.data['alerts'])), (1, 1))

    def test_marking_read_answers_with_the_emptied_inbox(self):
        response = self.client.post(reverse('investor-alerts-read'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['unread'], response.data['alerts'][0]['read']), (0, True))
