import csv
from pathlib import Path

from django.db import transaction
from django.utils.text import slugify

from .models import Investor

CURATED_CSV = Path(__file__).resolve().parent / 'curated.csv'


@transaction.atomic
def load_curated(path=CURATED_CSV):
    with open(path, newline='') as handle:
        entries = list(csv.DictReader(handle))

    existing = {investor.cik: investor for investor in Investor.objects.all()}
    created = updated = 0
    for entry in entries:
        cik = int(entry['cik'])
        values = {
            'name': entry['name'].strip(),
            'firm': entry['firm'].strip(),
            'blurb': (entry.get('blurb') or '').strip(),
            'curated': True,
        }
        investor = existing.get(cik)
        if investor is None:
            Investor.objects.create(cik=cik, slug=slugify(values['firm']), **values)
            created += 1
        elif any(getattr(investor, name) != value for name, value in values.items()):
            Investor.objects.filter(pk=investor.pk).update(**values)
            updated += 1
    return {'created': created, 'updated': updated}
