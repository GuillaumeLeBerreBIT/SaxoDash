import csv
from pathlib import Path

from django.db import transaction

from .models import ScreenerRow

UNIVERSE_CSV = Path(__file__).resolve().parent / 'universe.csv'


@transaction.atomic
def load_universe(path=UNIVERSE_CSV):
    with open(path, newline='') as handle:
        entries = {
            row['ticker'].strip().upper(): row
            for row in csv.DictReader(handle)
            if row['ticker'].strip()
        }

    existing = {row.ticker: row for row in ScreenerRow.objects.all()}
    created = updated = 0
    for ticker, entry in entries.items():
        values = {
            'name': entry['name'].strip(),
            'sector': (entry.get('sector') or '').strip(),
            'indexes': entry['indexes'].strip(),
        }
        row = existing.get(ticker)
        if row is None:
            ScreenerRow.objects.create(ticker=ticker, **values)
            created += 1
        elif any(getattr(row, field) != value for field, value in values.items()):
            ScreenerRow.objects.filter(pk=row.pk).update(**values)
            updated += 1

    removed, _ = ScreenerRow.objects.exclude(ticker__in=entries).delete()
    return {'created': created, 'updated': updated, 'removed': removed}
