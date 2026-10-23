import json
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

from . import company_data

FIXTURE = Path(settings.BASE_DIR).parent / 'frontend' / 'src' / 'lib' / 'fixtures' / 'company-data-parity.json'


class CompanyDataStatusTest(SimpleTestCase):
    def test_matches_the_frontend_rule_on_every_fixture_case(self):
        for case in json.loads(FIXTURE.read_text()):
            instrument = case['instrument']
            with self.subTest(case['name']):
                got = company_data.status(
                    asset_type=instrument['assetType'] if instrument else None,
                    currency=case['currency'],
                    resolved=instrument is not None,
                )
                self.assertEqual(got, case['expected'])

    def test_refusal_names_every_status_but_eligible(self):
        self.assertIsNone(company_data.refusal('eligible'))
        self.assertIn('non-US', company_data.refusal('foreign'))
        self.assertIn('ETF', company_data.refusal('fund'))
        self.assertIn('currency is unknown', company_data.refusal('unverified'))

    def test_status_of_an_instrument(self):
        self.assertEqual(company_data.status_of(None), company_data.ELIGIBLE)
        self.assertEqual(company_data.status_of({'asset_type': 'Stock', 'currency': 'EUR'}), company_data.FOREIGN)
        self.assertEqual(company_data.status_of({'asset_type': 'Etf', 'currency': 'USD'}), company_data.FUND)
        self.assertEqual(company_data.status_of({'asset_type': 'Stock', 'currency': None}), company_data.UNVERIFIED)
        self.assertEqual(company_data.status_of({'asset_type': 'Stock', 'currency': 'USD'}), company_data.ELIGIBLE)
