from importlib import import_module

from django.apps import apps
from django.test import TestCase

from .models import Security

retry_foreign_issuers = import_module('investors.migrations.0003_retry_foreign_issuer_tickers').retry_foreign_issuers


class RetryForeignIssuersTest(TestCase):
    def attempts(self):
        return dict(Security.objects.values_list('cusip', 'attempts'))

    def test_only_unresolved_identifiers_starting_with_a_letter_get_another_try(self):
        Security.objects.create(cusip='H1467J104', attempts=3)
        Security.objects.create(cusip='G0403H108', ticker='AON', attempts=1)
        Security.objects.create(cusip='000360206', attempts=3)

        retry_foreign_issuers(apps, None)

        self.assertEqual(self.attempts(), {'H1467J104': 0, 'G0403H108': 1, '000360206': 3})
