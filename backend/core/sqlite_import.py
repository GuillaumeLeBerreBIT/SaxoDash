import sqlite3
import tempfile
from contextlib import contextmanager
from pathlib import Path

from django.apps import apps
from django.core.management import call_command
from django.db import DEFAULT_DB_ALIAS, connections

from core.scheduling import sync_periodic_tasks

SOURCE_ALIAS = 'sqlite_source'
EXCLUDED_APPS = {'admin', 'contenttypes', 'sessions', 'django_celery_beat', 'token_blacklist'}
EXCLUDED_MODELS = {'auth.permission'}


class ImportRefused(Exception):
    pass


@contextmanager
def source_database(path):
    connections.databases[SOURCE_ALIAS] = {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': str(path),
        'ATOMIC_REQUESTS': False,
        'AUTOCOMMIT': True,
        'CONN_MAX_AGE': 0,
        'CONN_HEALTH_CHECKS': False,
        'OPTIONS': {},
        'TIME_ZONE': None,
        'USER': '',
        'PASSWORD': '',
        'HOST': '',
        'PORT': '',
        'TEST': {},
    }
    try:
        yield
    finally:
        connections[SOURCE_ALIAS].close()
        del connections[SOURCE_ALIAS]
        connections.databases.pop(SOURCE_ALIAS, None)


def copied_models():
    for model in apps.get_models(include_auto_created=True):
        meta = model._meta
        if meta.proxy or not meta.managed:
            continue
        if meta.app_label in EXCLUDED_APPS or meta.label_lower in EXCLUDED_MODELS:
            continue
        yield model


def _first_table_with_rows(alias):
    for model in copied_models():
        if model._base_manager.using(alias).exists():
            return model._meta.label_lower
    return None


def _snapshot(source, destination):
    reader = sqlite3.connect(f'{source.resolve().as_uri()}?mode=ro', uri=True)
    writer = sqlite3.connect(str(destination))
    try:
        reader.backup(writer)
    finally:
        writer.close()
        reader.close()


def _counts():
    return [
        (
            model._meta.label_lower,
            model._base_manager.using(SOURCE_ALIAS).count(),
            model._base_manager.using(DEFAULT_DB_ALIAS).count(),
        )
        for model in copied_models()
    ]


def import_sqlite(source, flush=False):
    source = Path(source)
    if not source.is_file():
        raise ImportRefused(f'There is no SQLite database at {source}')
    occupied = _first_table_with_rows(DEFAULT_DB_ALIAS)
    if occupied and not flush:
        raise ImportRefused(
            f'The target database already holds data ({occupied}). '
            'Rerun with --flush to replace everything in it.'
        )

    with tempfile.TemporaryDirectory() as tmp:
        working = Path(tmp) / 'source.sqlite3'
        dump = Path(tmp) / 'data.jsonl'
        _snapshot(source, working)
        with source_database(working):
            call_command('migrate', database=SOURCE_ALIAS, verbosity=0, interactive=False)
            call_command(
                'dumpdata',
                database=SOURCE_ALIAS,
                format='jsonl',
                natural_foreign=True,
                use_base_manager=True,
                exclude=sorted(EXCLUDED_APPS | EXCLUDED_MODELS),
                output=str(dump),
                verbosity=0,
            )
            if flush:
                call_command('flush', database=DEFAULT_DB_ALIAS, interactive=False, verbosity=0)
            call_command('loaddata', str(dump), database=DEFAULT_DB_ALIAS, verbosity=0)
            counts = _counts()
    sync_periodic_tasks()
    return counts
