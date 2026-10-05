from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from . import figi

APPLE = {'data': [
    {'figi': 'BBG000B9XSK7', 'name': 'APPLE INC', 'ticker': 'AAPL', 'exchCode': 'UA', 'securityType': 'Common Stock'},
    {'figi': 'BBG000B9XRY4', 'name': 'APPLE INC', 'ticker': 'AAPL', 'exchCode': 'US', 'securityType': 'Common Stock'},
]}
MISSING = {'warning': 'No identifier found.'}


def ok(results):
    return Mock(ok=True, status_code=200, json=lambda: results)


@override_settings(OPENFIGI_API_KEY='')
@patch('investors.figi.time.sleep')
@patch('investors.figi.requests.post')
class ResolveTest(SimpleTestCase):
    def test_prefers_the_us_composite_listing(self, post, sleep):
        post.return_value = ok([APPLE])

        batches = list(figi.resolve(['037833100']))

        self.assertEqual(batches, [{'037833100': {
            'ticker': 'AAPL', 'name': 'APPLE INC', 'figi': 'BBG000B9XRY4', 'security_type': 'Common Stock',
        }}])
        self.assertEqual(
            post.call_args.kwargs['json'], [{'idType': 'ID_CUSIP', 'idValue': '037833100'}],
        )
        self.assertNotIn('X-OPENFIGI-APIKEY', post.call_args.kwargs['headers'])

    def test_a_cusip_with_no_us_listing_or_no_match_is_none(self, post, sleep):
        foreign = {'data': [{'figi': 'F', 'name': 'X', 'ticker': 'X', 'exchCode': 'LN', 'securityType': 'Common Stock'}]}
        post.return_value = ok([foreign, MISSING])

        batches = list(figi.resolve(['AAAAAAAAA', 'BBBBBBBBB']))

        self.assertEqual(batches, [{'AAAAAAAAA': None, 'BBBBBBBBB': None}])

    def test_a_share_class_slash_becomes_a_dot(self, post, sleep):
        post.return_value = ok([{'data': [
            {'figi': 'G', 'name': 'BERKSHIRE HATHAWAY INC-CL B', 'ticker': 'BRK/B', 'exchCode': 'US', 'securityType': 'Common Stock'},
        ]}])

        batch = next(figi.resolve(['084670702']))

        self.assertEqual(batch['084670702']['ticker'], 'BRK.B')

    def test_keyless_batches_ten_and_waits_between_requests(self, post, sleep):
        post.side_effect = lambda *a, **kw: ok([MISSING] * len(kw['json']))
        cusips = [f'{i:09d}' for i in range(23)]

        batches = list(figi.resolve(cusips))

        self.assertEqual([len(batch) for batch in batches], [10, 10, 3])
        self.assertEqual(sleep.call_count, 2)
        self.assertEqual(sleep.call_args.args[0], 2.5)

    def test_a_rate_limit_raises_after_earlier_batches_were_yielded(self, post, sleep):
        post.side_effect = [ok([MISSING] * 10), Mock(ok=False, status_code=429, text='slow down')]
        cusips = [f'{i:09d}' for i in range(15)]
        received = []

        with self.assertRaises(figi.FigiError):
            for batch in figi.resolve(cusips):
                received.append(batch)

        self.assertEqual(len(received), 1)

    def test_nothing_to_resolve_makes_no_request(self, post, sleep):
        self.assertEqual(list(figi.resolve([])), [])
        post.assert_not_called()


@override_settings(OPENFIGI_API_KEY='k')
@patch('investors.figi.time.sleep')
@patch('investors.figi.requests.post')
class KeyedResolveTest(SimpleTestCase):
    def test_a_key_sends_the_header_and_batches_a_hundred(self, post, sleep):
        post.side_effect = lambda *a, **kw: ok([MISSING] * len(kw['json']))

        batches = list(figi.resolve([f'{i:09d}' for i in range(150)]))

        self.assertEqual([len(batch) for batch in batches], [100, 50])
        self.assertEqual(post.call_args.kwargs['headers']['X-OPENFIGI-APIKEY'], 'k')
        self.assertEqual(sleep.call_args.args[0], 0.25)
