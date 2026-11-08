from datetime import datetime, timezone as dt_timezone
from unittest import mock

from django.test import SimpleTestCase, TestCase

from saxo.credentials import ConnectionState

from .envelope import answer, saxo_warnings

USER = mock.sentinel.user


class AnswerTest(SimpleTestCase):
    def test_wraps_data_with_sources_and_warnings(self):
        out = answer({'x': 1}, sources=['portfolio'], warnings=['stale'])
        self.assertEqual(out['data'], {'x': 1})
        self.assertEqual(out['sources'], ['portfolio'])
        self.assertEqual(out['warnings'], ['stale'])
        self.assertIsNotNone(out['as_of'])

    def test_warnings_default_to_empty(self):
        self.assertEqual(answer(None, sources=[])['warnings'], [])

    def test_as_of_is_iso(self):
        moment = datetime(2026, 1, 2, 3, 4, tzinfo=dt_timezone.utc)
        self.assertEqual(answer(1, sources=[], as_of=moment)['as_of'], moment.isoformat())


class SaxoWarningsTest(TestCase):
    def test_healthy_is_empty(self):
        with mock.patch('mcp_server.envelope.connection_state', return_value=ConnectionState(object(), None, False)), \
                mock.patch('mcp_server.envelope.worst_recent_outcome', return_value='ok'):
            self.assertEqual(saxo_warnings(USER), [])

    def test_unusable_connection_is_named(self):
        with mock.patch('mcp_server.envelope.connection_state', return_value=ConnectionState(None, 'Saxo is not connected.', False)) as state, \
                mock.patch('mcp_server.envelope.worst_recent_outcome', return_value=None) as outcome:
            self.assertEqual(saxo_warnings(USER), ['Saxo is not connected.'])
        state.assert_called_once_with(USER)
        outcome.assert_called_once_with(USER)

    def test_failed_sync_is_named(self):
        with mock.patch('mcp_server.envelope.connection_state', return_value=ConnectionState(object(), None, False)), \
                mock.patch('mcp_server.envelope.worst_recent_outcome', return_value='failed'):
            self.assertEqual(len(saxo_warnings(USER)), 1)
