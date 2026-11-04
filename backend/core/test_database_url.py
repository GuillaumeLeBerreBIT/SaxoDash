from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from core.database_url import database_from_url


class DatabaseFromUrlTest(SimpleTestCase):
    def test_reads_every_part_of_a_postgres_url(self):
        config = database_from_url('postgres://saxo:s3cret@db.internal:5433/saxodash')

        self.assertEqual(config['ENGINE'], 'django.db.backends.postgresql')
        self.assertEqual(config['NAME'], 'saxodash')
        self.assertEqual(config['USER'], 'saxo')
        self.assertEqual(config['PASSWORD'], 's3cret')
        self.assertEqual(config['HOST'], 'db.internal')
        self.assertEqual(config['PORT'], '5433')

    def test_accepts_the_postgresql_spelling(self):
        config = database_from_url('postgresql://saxo@localhost/saxodash')

        self.assertEqual(config['ENGINE'], 'django.db.backends.postgresql')

    def test_leaves_an_absent_port_and_password_empty(self):
        config = database_from_url('postgres://saxo@localhost/saxodash')

        self.assertEqual(config['PORT'], '')
        self.assertEqual(config['PASSWORD'], '')

    def test_decodes_a_percent_encoded_password(self):
        config = database_from_url('postgres://saxo:p%40ss%2Fword@localhost/saxodash')

        self.assertEqual(config['PASSWORD'], 'p@ss/word')

    def test_passes_query_parameters_as_connection_options(self):
        config = database_from_url('postgres://saxo@localhost/saxodash?sslmode=require')

        self.assertEqual(config['OPTIONS'], {'sslmode': 'require'})

    def test_keeps_connections_open_and_checks_them_before_reuse(self):
        config = database_from_url('postgres://saxo@localhost/saxodash')

        self.assertEqual(config['CONN_MAX_AGE'], 60)
        self.assertTrue(config['CONN_HEALTH_CHECKS'])

    def test_refuses_any_database_but_postgres(self):
        with self.assertRaisesMessage(ImproperlyConfigured, 'sqlite'):
            database_from_url('sqlite:///db.sqlite3')

    def test_refuses_a_url_without_a_database_name(self):
        with self.assertRaisesMessage(ImproperlyConfigured, 'database name'):
            database_from_url('postgres://saxo@localhost/')
