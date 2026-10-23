import anyio
from django.test import SimpleTestCase
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from .server import _off_the_event_loop


def raising(error):
    def tool():
        raise error

    return tool


class RedisDownTest(SimpleTestCase):
    def call(self, error):
        return anyio.run(_off_the_event_loop(raising(error)))

    def test_connection_error_is_a_warning(self):
        result = self.call(RedisConnectionError('refused'))
        self.assertIsNone(result['data'])
        self.assertEqual(result['sources'], [])
        self.assertIn('Redis is not running', result['warnings'][0])

    def test_timeout_is_a_warning(self):
        result = self.call(RedisTimeoutError('slow'))
        self.assertIsNone(result['data'])
        self.assertIn('Redis is not running', result['warnings'][0])

    def test_other_errors_still_raise(self):
        with self.assertRaises(ValueError):
            self.call(ValueError('bug'))
