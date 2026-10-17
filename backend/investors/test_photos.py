from django.test import SimpleTestCase

from .models import Investor
from .photos import photo_credit_url, photo_url


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

    def test_no_photo_is_none(self):
        self.assertIsNone(photo_url(Investor()))
        self.assertIsNone(photo_credit_url(Investor()))
