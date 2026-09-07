"""Reproduce (pre-fix) / disprove (post-fix) the concurrent-writer SQLite lock.

Run:  cd backend && .venv/bin/python manage.py shell < ../scripts/repro_sqlite_lock.py

Before the WAL + IMMEDIATE settings change: prints "LOCKED ..." within ~1s.
After it: prints "OK: both writers committed ...".
"""
import threading
import time
from decimal import Decimal

from django.db import connections, transaction

from portfolio.models import Position

RESULT = {}

DEFAULTS = {
    'name': 'repro', 'qty': Decimal('1'), 'avg_cost': Decimal('1'),
    'current_price': Decimal('1'), 'sector': 'Uncategorized',
    'type': 'STOCK', 'color': '#000000',
}


def writer(name, ticker):
    try:
        with transaction.atomic():
            Position.objects.update_or_create(ticker=ticker, defaults=DEFAULTS)
            time.sleep(0.5)  # hold the write lock so the other writer collides
        RESULT[name] = 'committed'
    except Exception as exc:  # noqa: BLE001 - this is a probe
        RESULT[name] = f'{type(exc).__name__}: {exc}'
    finally:
        connections.close_all()


a = threading.Thread(target=writer, args=('probe-a', 'ZZZ-REPRO-A'))
b = threading.Thread(target=writer, args=('probe-b', 'ZZZ-REPRO-B'))
a.start(); b.start(); a.join(); b.join()

Position.objects.filter(ticker__startswith='ZZZ-REPRO-').delete()

if any('locked' in v.lower() or 'operationalerror' in v.lower() for v in RESULT.values()):
    print('LOCKED', RESULT)
else:
    print('OK: both writers committed', RESULT)
