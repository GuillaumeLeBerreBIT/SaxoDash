import itertools
from datetime import timedelta

from .models import Filing, Holding, Investor

_accessions = itertools.count(1)


def make_investor(**overrides):
    fields = {
        'name': 'Warren Buffett', 'firm': 'Berkshire Hathaway', 'cik': 1067983,
        'slug': 'berkshire-hathaway', 'curated': True,
    }
    fields.update(overrides)
    return Investor.objects.create(**fields)


def store_quarter(investor, quarter_end, holdings, *, filed_on=None, amendment_type='', form=None):
    rows = [
        {'cusip': h[0], 'issuer': h[1], 'shares': h[2], 'value': h[3], 'put_call': h[4] if len(h) > 4 else ''}
        for h in holdings
    ]
    filing = Filing.objects.create(
        investor=investor,
        quarter_end=quarter_end,
        filed_on=filed_on or quarter_end + timedelta(days=45),
        accession=f'0000000000-00-{next(_accessions):06d}',
        form=form or ('13F-HR/A' if amendment_type else '13F-HR'),
        amendment_type=amendment_type,
        total_value=sum(row['value'] for row in rows),
        positions=len(rows),
    )
    Holding.objects.bulk_create(Holding(filing=filing, **row) for row in rows)
    return filing
