from django.test import SimpleTestCase

from .models import Investor
from .photos import logo_url, photo_credit_url, photo_url


class PhotoUrlTest(SimpleTestCase):
    def test_a_commons_file_becomes_a_thumbnail_and_its_credit_page(self):
        investor = Investor(photo="Valeant Pharmaceuticals' Business Model (headshot).jpg")
        self.assertEqual(
            photo_url(investor),
            'https://commons.wikimedia.org/wiki/Special:FilePath/Valeant%20Pharmaceuticals%27%20Business%20Model%20%28headshot%29.jpg?width=160',
        )
        self.assertEqual(
            photo_credit_url(investor),
            'https://commons.wikimedia.org/wiki/File:Valeant_Pharmaceuticals%27_Business_Model_%28headshot%29.jpg',
        )

    def test_a_website_becomes_its_logo(self):
        self.assertEqual(
            logo_url(Investor(website='scionasset.com')), 'https://www.google.com/s2/favicons?domain=scionasset.com&sz=128',
        )
        self.assertIsNone(logo_url(Investor()))

    def test_no_photo_is_none(self):
        self.assertIsNone(photo_url(Investor()))
        self.assertIsNone(photo_credit_url(Investor()))
