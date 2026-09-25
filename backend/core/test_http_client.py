from unittest.mock import Mock

import requests
from django.test import SimpleTestCase

from core.http_client import ERROR_BODY_LIMIT, REQUEST_TIMEOUT, request_json


class Transient(Exception):
    pass


class Permanent(Exception):
    pass


def _call(send):
    return request_json(send, 'https://example.test/x', 'GET /x', transient=Transient, permanent=Permanent)


class RequestJsonTest(SimpleTestCase):
    def test_returns_the_parsed_body(self):
        send = Mock(return_value=Mock(ok=True, json=lambda: {'a': 1}))

        self.assertEqual(_call(send), {'a': 1})

    def test_passes_the_timeout_and_request_arguments_through(self):
        send = Mock(return_value=Mock(ok=True, json=lambda: {}))

        request_json(send, 'https://example.test/x', 'GET /x', transient=Transient, permanent=Permanent,
                     params={'q': 1})

        send.assert_called_once_with('https://example.test/x', timeout=REQUEST_TIMEOUT, params={'q': 1})

    def test_a_network_failure_is_transient(self):
        send = Mock(side_effect=requests.ConnectionError('refused'))

        with self.assertRaisesMessage(Transient, 'GET /x failed: refused'):
            _call(send)

    def test_rate_limits_and_server_errors_are_transient(self):
        for status in (408, 425, 429, 500, 502, 503, 504):
            with self.subTest(status=status), self.assertRaises(Transient):
                _call(Mock(return_value=Mock(ok=False, status_code=status, text='')))

    def test_other_client_errors_are_permanent(self):
        with self.assertRaisesMessage(Permanent, 'GET /x failed: 404 missing'):
            _call(Mock(return_value=Mock(ok=False, status_code=404, text='missing')))

    def test_an_error_body_is_truncated(self):
        send = Mock(return_value=Mock(ok=False, status_code=400, text='x' * (ERROR_BODY_LIMIT * 2)))

        with self.assertRaises(Permanent) as ctx:
            _call(send)

        self.assertEqual(str(ctx.exception), f"GET /x failed: 400 {'x' * ERROR_BODY_LIMIT}")

    def test_a_non_json_body_is_permanent(self):
        send = Mock(return_value=Mock(ok=True, json=Mock(side_effect=ValueError('bad'))))

        with self.assertRaisesMessage(Permanent, 'GET /x returned a non-JSON body'):
            _call(send)

    def test_one_error_class_can_serve_both_roles(self):
        with self.assertRaises(Permanent):
            request_json(Mock(side_effect=requests.Timeout('slow')), 'u', 'GET /x',
                         transient=Permanent, permanent=Permanent)
