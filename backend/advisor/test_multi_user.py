from types import SimpleNamespace

from django.test import TestCase

from research.listings import Listing
from users.testing import make_user

from . import journal

INSTRUMENT = Listing(ticker='NEWCO', symbol='NEWCO', name='NewCo', uic=77, asset_type='Stock', currency='USD', exchange='X')
OTHER = Listing(ticker='OTHR', symbol='OTHR', name='Other', uic=78, asset_type='Stock', currency='USD', exchange='X')
SAXO = SimpleNamespace(chart=lambda *args, user: [{'date': '2026-10-21', 'open': 1, 'high': 2, 'low': 1, 'close': 42.25, 'volume': 1}])


def record(user, listing=INSTRUMENT):
    return journal.log(
        user,
        listing=listing,
        saxo=SAXO,
        action='buy_new',
        thesis='Compounder.',
        bear_case=['a', 'b', 'c'],
        invalidation={'price': 30, 'conditions': []},
        target={'price': 60, 'condition': 'fair value'},
        horizon='12m',
        conviction='high',
    )


class JournalPerUserTest(TestCase):
    def setUp(self):
        self.alice = make_user('alice', owner=True)
        self.bob = make_user('bob')

    def test_journal_is_per_user(self):
        row = record(self.alice)

        self.assertEqual(row.user, self.alice)
        self.assertEqual(journal.review(self.bob, 'all')['recommendations'], [])
        self.assertEqual(len(journal.review(self.alice, 'all')['recommendations']), 1)

    def test_another_users_recommendation_cannot_be_decided_or_closed(self):
        row = record(self.alice)

        with self.assertRaisesMessage(journal.Refused, f'No recommendation {row.id}.'):
            journal.decide(self.bob, row.id, 'accepted')
        with self.assertRaisesMessage(journal.Refused, f'No recommendation {row.id}.'):
            journal.close(self.bob, row.id, 'sold')

        row.refresh_from_db()
        self.assertEqual((row.decision, row.closed_at), ('pending', None))

    def test_every_users_tickers_are_wanted_for_price_history(self):
        record(self.alice)
        record(self.bob, listing=OTHER)

        current, ever = journal.wanted_tickers()

        self.assertTrue({'NEWCO', 'OTHR'} <= current)
        self.assertTrue({'NEWCO', 'OTHR'} <= ever)
