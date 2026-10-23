from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from datetime import date
from decimal import Decimal

from portfolio.views import PortfolioSummaryView
from transactions.models import Transaction
from transactions.views import TransactionListView

from .views import ViewResult, app_user, call_view, problem

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


@override_settings(CACHES=LOCMEM)
class CallViewTest(APITestCase):
    def setUp(self):
        cache.clear()

    def test_dispatches_as_the_app_user(self):
        get_user_model().objects.create_user('u', password='p')
        result = call_view(PortfolioSummaryView)
        self.assertEqual(result.status, 200)
        self.assertIn('total_value', result.data)

    @override_settings(ALLOWED_HOSTS=['saxodash.local', 'localhost'])
    def test_paginated_view_links_on_an_allowed_host(self):
        get_user_model().objects.create_user('u', password='p')
        for i in range(2):
            Transaction.objects.create(
                date=date(2026, 1, 1), type='BUY', instrument='X', ticker='X',
                qty=Decimal('1'), price=Decimal('1'), saxo_trade_id=f't{i}',
            )
        result = call_view(TransactionListView, query={'page_size': 1})
        self.assertEqual(result.status, 200)
        self.assertIn('//saxodash.local/', result.data['next'])

    @override_settings(ALLOWED_HOSTS=['*'])
    def test_wildcard_hosts_fall_back_to_localhost(self):
        get_user_model().objects.create_user('u', password='p')
        for i in range(2):
            Transaction.objects.create(
                date=date(2026, 1, 1), type='BUY', instrument='X', ticker='X',
                qty=Decimal('1'), price=Decimal('1'), saxo_trade_id=f't{i}',
            )
        result = call_view(TransactionListView, query={'page_size': 1})
        self.assertIn('//localhost/', result.data['next'])

    def test_no_user_is_improperly_configured(self):
        with self.assertRaises(ImproperlyConfigured):
            call_view(PortfolioSummaryView)

    def test_app_user_prefers_the_configured_username(self):
        get_user_model().objects.create_user('first', password='p')
        second = get_user_model().objects.create_user('second', password='p')
        with override_settings(MCP_USER='second'):
            self.assertEqual(app_user(), second)

    def test_app_user_defaults_to_lowest_id(self):
        first = get_user_model().objects.create_user('first', password='p')
        get_user_model().objects.create_user('second', password='p')
        self.assertEqual(app_user(), first)

    def test_throttled_view_is_a_warning(self):
        self.assertEqual(problem(ViewResult(429, {})), 'Busy — try again in a minute.')

    def test_disconnected_saxo_is_a_warning(self):
        self.assertEqual(problem(ViewResult(409, {})), 'Saxo is not connected — reconnect in the app.')

    def test_not_found(self):
        self.assertEqual(problem(ViewResult(404, {})), 'Not found.')

    def test_upstream_error(self):
        self.assertEqual(problem(ViewResult(502, {})), 'Upstream error (502).')

    def test_unavailable_body_is_its_reason(self):
        self.assertEqual(problem(ViewResult(200, {'available': False, 'reason': 'Finnhub busy'})), 'Finnhub busy')

    def test_unavailable_body_falls_back_to_message(self):
        self.assertEqual(problem(ViewResult(200, {'available': False, 'message': 'No data'})), 'No data')

    def test_unavailable_body_without_text_has_a_default(self):
        self.assertEqual(problem(ViewResult(200, {'available': False})), 'Data unavailable.')

    def test_success_is_not_a_problem(self):
        self.assertIsNone(problem(ViewResult(200, {'available': True})))
