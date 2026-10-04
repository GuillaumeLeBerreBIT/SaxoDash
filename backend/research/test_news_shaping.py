from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from . import finnhub

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

RAW_ROW = {
    'category': 'company', 'datetime': 1_760_000_000, 'id': 7,
    'image': 'https://example.com/x.png', 'related': 'SPY', 'source': 'Yahoo',
    'url': 'https://example.com/story',
    'headline': 'Is the SPDR S&amp;P 500 ETF a buy?',
    'summary': '',
}


class CleanTextTest(TestCase):
    def test_decodes_named_and_numeric_entities(self):
        self.assertEqual(finnhub._clean_text('SPDR S&amp;P 500 ETF'), 'SPDR S&P 500 ETF')
        self.assertEqual(finnhub._clean_text('Apple&#39;s &quot;Pro&quot; push'), 'Apple\'s "Pro" push')
        self.assertEqual(finnhub._clean_text('Q3&nbsp;beat'), 'Q3 beat')

    def test_a_tag_boundary_becomes_a_space(self):
        self.assertEqual(
            finnhub._clean_text("<b>Key Takeaways</b>Morgan Stanley's view"),
            "Key Takeaways Morgan Stanley's view",
        )
        self.assertEqual(finnhub._clean_text('one<br/>two<p>three</p>'), 'one two three')

    def test_whitespace_runs_collapse_and_ends_are_trimmed(self):
        self.assertEqual(finnhub._clean_text('  a \n\n b\t c  '), 'a b c')

    def test_encoded_markup_is_text_not_a_tag(self):
        self.assertEqual(finnhub._clean_text('Use &lt;b&gt; carefully'), 'Use <b> carefully')

    def test_none_and_non_strings_are_empty(self):
        self.assertEqual(finnhub._clean_text(None), '')
        self.assertEqual(finnhub._clean_text(42), '')

    def test_plain_text_is_untouched(self):
        self.assertEqual(finnhub._clean_text('Apple ships a thing'), 'Apple ships a thing')


class NewsItemShapingTest(TestCase):
    def test_headline_and_summary_are_cleaned(self):
        item = finnhub._to_news_item({
            **RAW_ROW,
            'summary': "<p>Key Takeaways</p>Morgan Stanley&#x27;s analysts say S&amp;P earnings&nbsp;rise.",
        })
        self.assertEqual(item['headline'], 'Is the SPDR S&P 500 ETF a buy?')
        self.assertEqual(item['summary'], "Key Takeaways Morgan Stanley's analysts say S&P earnings rise.")

    def test_missing_summary_is_an_empty_string(self):
        item = finnhub._to_news_item({k: v for k, v in RAW_ROW.items() if k != 'summary'})
        self.assertEqual(item['summary'], '')

    def test_source_and_url_are_left_alone(self):
        item = finnhub._to_news_item({**RAW_ROW, 'url': 'https://example.com/a?x=1&amp;y=2'})
        self.assertEqual(item['url'], 'https://example.com/a?x=1&amp;y=2')
        self.assertEqual(item['source'], 'Yahoo')


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class NewsCapTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_company_news')
    def test_list_is_capped_at_the_newest_news_max_items(self, mock_news):
        total = finnhub.NEWS_MAX_ITEMS + 5
        mock_news.return_value = [
            {**RAW_ROW, 'id': i, 'datetime': 1_760_000_000 + i, 'headline': f'story {i}'}
            for i in range(total)
        ]

        items = finnhub.news('SPY')['items']

        self.assertEqual(finnhub.NEWS_MAX_ITEMS, 30)
        self.assertEqual(len(items), 30)
        self.assertEqual(items[0]['headline'], f'story {total - 1}')
        self.assertEqual(items[-1]['headline'], f'story {total - 30}')

    @patch('research.finnhub.get_company_news')
    def test_entities_are_decoded_end_to_end(self, mock_news):
        mock_news.return_value = [RAW_ROW]
        self.assertEqual(finnhub.news('SPY')['items'][0]['headline'], 'Is the SPDR S&P 500 ETF a buy?')
