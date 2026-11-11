import logging
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from unittest import mock

import requests
from django.apps import apps
from django.conf import settings
from django.core.cache import cache
from django.test import override_settings
from django.urls import URLPattern, URLResolver, get_resolver
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import BankAccount
from advisor.models import Recommendation
from core.models import NetWorthSnapshot
from enablebanking.models import BankTransaction
from investors.models import FilingAlert, FilingAlertRead, Investor, InvestorFollow
from portfolio.models import PortfolioValuation, Position
from research.models import PriceLine, SymbolNote, TextAnnotation, TrendLine, Watchlist, WatchlistItem
from saxo.models import SaxoCredential, SyncRun
from transactions.models import Transaction
from users.testing import make_user

COVERED = {
    'accounts.BankAccount',
    'advisor.Recommendation',
    'core.NetWorthSnapshot',
    'investors.FilingAlertRead',
    'investors.Investor',
    'investors.InvestorFollow',
    'portfolio.PortfolioValuation',
    'portfolio.Position',
    'research.PriceLine',
    'research.SymbolNote',
    'research.TextAnnotation',
    'research.TrendLine',
    'research.Watchlist',
    'saxo.SaxoCredential',
    'saxo.SyncRun',
    'transactions.Transaction',
    'users.Profile',
}

PROJECT_DIRECTORIES = {path.name for path in Path(settings.BASE_DIR).iterdir() if path.is_dir()}
PROJECT_APPS = {config.label for config in apps.get_app_configs() if config.name.split('.')[0] in PROJECT_DIRECTORIES}

SKIPPED_PREFIXES = (
    'healthz', 'admin/', 'api/token/', 'api/auth/', 'api/saxo/connect', 'api/saxo/callback',
    'api/enablebanking/connect', 'api/enablebanking/callback',
)

SECRET = 'a-secret'
TICKER = 'ZZZA'
UIC = 987654
BANK = 'bank-a-secret'
IBAN = 'BE00-A-SECRET'
FORBIDDEN = (SECRET, TICKER, BANK, IBAN, 'a-access-token', 'a-refresh-token', 'a-secret-thesis')

EXTRA_URLS = (
    f'/api/research/notes/{TICKER}/',
    f'/api/research/price-lines/{UIC}/Stock/',
    f'/api/research/trend-lines/{UIC}/Stock/',
    f'/api/research/text-annotations/{UIC}/Stock/',
    f'/api/research/fundamentals/{TICKER}/',
    f'/api/research/earnings/{TICKER}/',
    f'/api/research/chart/?uic={UIC}&asset_type=Stock',
    f'/api/research/quotes/?uics={UIC}',
    f'/api/research/instruments/?q={TICKER}',
    f'/api/congress/ownership/{TICKER}/',
    f'/api/investors/ownership/{TICKER}/',
    '/api/investors/ownership/?tickers=' + TICKER,
    '/api/enablebanking/transactions/?search=' + SECRET,
    f'/api/verdicts/{TICKER}/',
    '/api/verdicts/?tickers=' + TICKER,
    '/api/verdicts/track-record/',
)


def project_models_pointing_at_users():
    found = set()
    for model in apps.get_models():
        if model._meta.app_label not in PROJECT_APPS:
            continue
        for field in model._meta.get_fields():
            remote = getattr(field, 'remote_field', None)
            if field.concrete and remote and remote.model is not None and remote.model._meta.label == settings.AUTH_USER_MODEL:
                found.add(model._meta.label)
    return found


def walk(patterns, prefix=''):
    for entry in patterns:
        if isinstance(entry, URLResolver):
            yield from walk(entry.url_patterns, prefix + str(entry.pattern))
        elif isinstance(entry, URLPattern):
            yield prefix + str(entry.pattern), entry


def static_get_paths():
    paths = []
    for route, entry in walk(get_resolver().url_patterns):
        if '<' in route or '(?P' in route or route.startswith('^') or not route.startswith('api/'):
            continue
        if route.startswith(SKIPPED_PREFIXES):
            continue
        paths.append('/' + route)
    return sorted(set(paths))


def skipped_routes():
    skipped = []
    for route, entry in walk(get_resolver().url_patterns):
        if route.startswith(SKIPPED_PREFIXES) or not route.startswith('api/'):
            skipped.append(route)
    return sorted(set(skipped))


class CoverageTests(APITestCase):
    def test_every_per_person_model_is_covered(self):
        self.assertEqual(project_models_pointing_at_users(), COVERED)


@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'users-isolation'}})
class IsolationSweepTests(APITestCase):
    def setUp(self):
        cache.clear()
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        self.alice = make_user('alice', owner=True)
        self.bob = make_user('bob')
        self.rows = self.seed(self.alice)

    def seed(self, user):
        now = timezone.now()
        credential = SaxoCredential.objects.create(
            user=user, access_token='a-access-token', refresh_token='a-refresh-token',
            expires_at=now + timedelta(hours=1),
        )
        run = SyncRun.objects.create(user=user, task='sync-a-secret', outcome='failed', detail=SECRET)
        position = Position.objects.create(
            user=user, ticker=TICKER, name=SECRET, qty=Decimal('1'), avg_cost=Decimal('1'),
            current_price=Decimal('2'), sector=SECRET, type='STOCK', color='#000000', uic=UIC, asset_type='Stock',
        )
        valuation = PortfolioValuation.objects.create(
            user=user, currency='EUR', cash_balance=Decimal('1234567.89'),
            positions_value=Decimal('7654321.09'), total_value=Decimal('8888888.98'),
        )
        transaction = Transaction.objects.create(
            user=user, date=timezone.localdate(), type='BUY', instrument=SECRET, ticker=TICKER,
            qty=Decimal('1'), price=Decimal('1'),
        )
        snapshot = NetWorthSnapshot.objects.create(
            user=user, date=timezone.localdate(), portfolio_value=Decimal('1'), bank_total=Decimal('1'),
            net_worth=Decimal('9999999.99'),
        )
        account = BankAccount.objects.create(
            user=user, bank=BANK, type='current', iban_masked=IBAN, balance=Decimal('1'), available=Decimal('1'),
        )
        bank_transaction = BankTransaction.objects.create(
            bank='kbc', bank_account=account, external_id='ext-a', amount=Decimal('1'), currency='EUR',
            booking_date=timezone.localdate(), counterparty_name=SECRET, description=SECRET,
        )
        watchlist = Watchlist.objects.create(user=user, name=SECRET)
        WatchlistItem.objects.create(watchlist=watchlist, symbol=TICKER, uic=UIC, asset_type='Stock')
        note = SymbolNote.objects.create(user=user, symbol=TICKER, bull_case='a-secret-thesis')
        price_line = PriceLine.objects.create(user=user, uic=UIC, asset_type='Stock', price=Decimal('1'), label=SECRET)
        trend_line = TrendLine.objects.create(
            user=user, uic=UIC, asset_type='Stock', start_bar_date=timezone.localdate(), start_price=Decimal('1'),
            end_bar_date=timezone.localdate(), end_price=Decimal('2'), label=SECRET,
        )
        annotation = TextAnnotation.objects.create(
            user=user, uic=UIC, asset_type='Stock', bar_date=timezone.localdate(), price=Decimal('1'), text=SECRET,
        )
        recommendation = Recommendation.objects.create(
            user=user, ticker=TICKER, uic=UIC, asset_type='Stock', action='watch', thesis=SECRET,
            conviction='low', horizon='3m', entry_price=1.0, entry_currency='USD',
        )
        investor = Investor.objects.create(
            name='Shared Fund', firm='Shared', cik=424242, slug='shared-fund', added_by=user,
        )
        InvestorFollow.objects.create(user=user, investor=investor)
        alert = FilingAlert.objects.create(investor=investor, quarter_end=date(2025, 12, 31), filed_on=date(2026, 2, 1))
        FilingAlertRead.objects.create(user=user, alert=alert)
        return {
            'credential': credential, 'run': run, 'position': position, 'valuation': valuation,
            'transaction': transaction, 'snapshot': snapshot, 'account': account,
            'bank_transaction': bank_transaction, 'watchlist': watchlist, 'note': note,
            'price_line': price_line, 'trend_line': trend_line, 'annotation': annotation,
            'recommendation': recommendation, 'investor': investor,
        }

    def detail_urls(self):
        rows = self.rows
        return [
            f'/api/research/price-lines/{rows["price_line"].pk}/',
            f'/api/research/trend-lines/{rows["trend_line"].pk}/',
            f'/api/research/text-annotations/{rows["annotation"].pk}/',
            f'/api/research/watchlists/{rows["watchlist"].pk}/',
            f'/api/enablebanking/transactions/{rows["bank_transaction"].pk}/category/',
        ]

    def offline(self):
        refused = requests.ConnectionError('offline in isolation sweep')
        return mock.patch('requests.adapters.HTTPAdapter.send', side_effect=refused)

    def fetch_all(self, urls):
        self.client.raise_request_exception = False
        self.client.force_authenticate(self.bob)
        results = {}
        with self.offline():
            for url in urls:
                response = self.client.get(url)
                results[url] = (response.status_code, response.content.decode('utf-8', 'replace'))
        return results

    def test_no_endpoint_leaks_rows(self):
        urls = static_get_paths() + list(EXTRA_URLS)
        self.assertGreater(len(static_get_paths()), 15)
        for url, (status, body) in self.fetch_all(urls).items():
            for needle in FORBIDDEN:
                if needle in url:
                    continue
                self.assertNotIn(needle, body, f'GET {url} ({status}) leaked {needle!r}')
            for figure in ('1234567.89', '7654321.09', '8888888.98', '9999999.99'):
                self.assertNotIn(figure, body, f'GET {url} ({status}) leaked {figure}')

    def test_no_detail_url_serves_another_users_object(self):
        for url, (status, body) in self.fetch_all(self.detail_urls()).items():
            self.assertIn(status, (403, 404, 405), f'GET {url} answered {status}')
            self.assertNotIn(SECRET, body)

    def test_non_owner_sees_nothing_of_the_owners_banking(self):
        self.client.force_authenticate(self.bob)
        for url in ('/api/enablebanking/status/', '/api/enablebanking/transactions/', '/api/enablebanking/budgets/'):
            self.assertEqual(self.client.get(url).status_code, 403, url)
        self.assertEqual(self.client.get('/api/accounts/').json(), [])

    def test_other_user_changes_nothing_of_the_owners(self):
        self.client.force_authenticate(self.bob)
        for url in self.detail_urls():
            self.client.delete(url)
            self.client.patch(url, {'label': 'x', 'category': 'OTHER'}, format='json')
        self.assertTrue(PriceLine.objects.filter(pk=self.rows['price_line'].pk, label=SECRET).exists())
        self.assertTrue(TrendLine.objects.filter(pk=self.rows['trend_line'].pk).exists())
        self.assertTrue(TextAnnotation.objects.filter(pk=self.rows['annotation'].pk).exists())
        self.assertTrue(Watchlist.objects.filter(pk=self.rows['watchlist'].pk).exists())
        self.assertTrue(BankTransaction.objects.filter(pk=self.rows['bank_transaction'].pk, category_override=None).exists())

    def test_alice_sees_her_own_rows(self):
        self.client.force_authenticate(self.alice)
        with self.offline():
            body = self.client.get('/api/portfolio/positions/').content.decode()
        self.assertIn(TICKER, body)
