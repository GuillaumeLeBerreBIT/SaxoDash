import csv
from functools import cache

from research.universe import UNIVERSE_CSV


@cache
def _sectors():
    with open(UNIVERSE_CSV, newline='') as handle:
        return {
            row['ticker'].strip().upper(): (row.get('sector') or '').strip() or None
            for row in csv.DictReader(handle)
        }


def sector_for(ticker):
    return _sectors().get(ticker.upper()) if ticker else None
