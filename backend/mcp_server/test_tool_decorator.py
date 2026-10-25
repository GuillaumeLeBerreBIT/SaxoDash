import inspect
from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from .envelope import Reply, Unavailable
from .shaping import numbers
from .tools import answering


def run(fn, *, sources=('src',), saxo=False, warnings=()):
    with patch('mcp_server.tools.saxo_warnings', return_value=list(warnings)) as saxo_check:
        result = answering(fn, sources=list(sources), saxo=saxo)()
    return result, saxo_check


class AnsweringTest(SimpleTestCase):
    def test_plain_data_is_wrapped(self):
        result, _ = run(lambda: {'x': 1})
        self.assertEqual(result['data'], {'x': 1})
        self.assertEqual(result['sources'], ['src'])
        self.assertEqual(result['warnings'], [])

    def test_a_reply_carries_its_warnings_and_as_of(self):
        moment = datetime(2026, 1, 2, tzinfo=dt_timezone.utc)
        result, _ = run(lambda: Reply({'x': 1}, ['careful'], as_of=moment))
        self.assertEqual(result['warnings'], ['careful'])
        self.assertEqual(result['as_of'], moment.isoformat())

    def test_unavailable_is_null_data_with_its_warnings(self):
        def fails():
            raise Unavailable('first', None, 'second')

        result, _ = run(fails)
        self.assertIsNone(result['data'])
        self.assertEqual(result['warnings'], ['first', 'second'])

    def test_saxo_warnings_come_first_only_when_asked(self):
        result, check = run(lambda: Reply(1, ['own']), saxo=True, warnings=['Saxo is down.'])
        self.assertEqual(result['warnings'], ['Saxo is down.', 'own'])
        _, unused = run(lambda: 1, saxo=False, warnings=['Saxo is down.'])
        unused.assert_not_called()

    def test_saxo_warnings_survive_an_unavailable(self):
        def fails():
            raise Unavailable('gone')

        result, _ = run(fails, saxo=True, warnings=['Saxo is down.'])
        self.assertEqual(result['warnings'], ['Saxo is down.', 'gone'])

    def test_redis_down_is_a_warning(self):
        for error in (RedisConnectionError('refused'), RedisTimeoutError('slow')):
            def fails(error=error):
                raise error

            result, _ = run(fails)
            self.assertIsNone(result['data'])
            self.assertIn('Redis is not running', result['warnings'][0])

    def test_other_errors_still_raise(self):
        def bug():
            raise ValueError('bug')

        with self.assertRaises(ValueError):
            run(bug)

    def test_money_and_dates_are_json_safe(self):
        result, _ = run(lambda: {'eur': Decimal('12.30'), 'rows': [{'day': date(2026, 1, 2)}], 'pair': (Decimal('1'), 2)})
        self.assertEqual(result['data'], {'eur': 12.3, 'rows': [{'day': '2026-01-02'}], 'pair': [1.0, 2]})
        self.assertIsInstance(result['data']['eur'], float)

    def test_the_signature_is_kept_for_the_schema(self):
        def tool_fn(symbol: str, limit: int = 5):
            return None

        wrapped = answering(tool_fn, sources=[], saxo=False)
        self.assertEqual(list(inspect.signature(wrapped).parameters), ['symbol', 'limit'])


class NumbersTest(SimpleTestCase):
    def test_named_decimal_strings_become_decimals_and_blanks_stay_none(self):
        self.assertEqual(numbers({'price': '12.50', 'qty': None, 'ticker': '0001'}, ('price', 'qty')), {'price': Decimal('12.50'), 'qty': None, 'ticker': '0001'})
