from collections import defaultdict

from .models import Filing, Holding


def quarter_ends(investor):
    return sorted(set(investor.filings.values_list('quarter_end', flat=True)), reverse=True)


def effective_filings(filings):
    chosen = []
    for filing in filings:
        if filing.amendment_type == Filing.NEW_HOLDINGS:
            chosen.append(filing)
        else:
            chosen = [filing]
    return chosen


def _effective_ids_by_quarter(investor, quarter_end=None):
    filings = investor.filings.order_by('quarter_end', 'filed_on', 'accession')
    if quarter_end is not None:
        filings = filings.filter(quarter_end=quarter_end)
    grouped = defaultdict(list)
    for filing in filings:
        grouped[filing.quarter_end].append(filing)
    return {quarter: [f.pk for f in effective_filings(group)] for quarter, group in grouped.items()}


def snapshot(investor, quarter_end):
    filing_ids = _effective_ids_by_quarter(investor, quarter_end).get(quarter_end, [])
    merged = {}
    for holding in Holding.objects.filter(filing_id__in=filing_ids).order_by('filing__filed_on', 'pk'):
        key = (holding.cusip, holding.put_call)
        if key in merged:
            merged[key]['shares'] += holding.shares
            merged[key]['value'] += holding.value
            continue
        merged[key] = {
            'cusip': holding.cusip, 'put_call': holding.put_call, 'issuer': holding.issuer,
            'title_of_class': holding.title_of_class, 'amount_type': holding.amount_type,
            'shares': holding.shares, 'value': holding.value,
        }
    return merged


def held_keys_by_quarter(investor):
    ids_by_quarter = _effective_ids_by_quarter(investor)
    quarter_of = {pk: quarter for quarter, ids in ids_by_quarter.items() for pk in ids}
    keys = {quarter: set() for quarter in ids_by_quarter}
    rows = Holding.objects.filter(filing_id__in=quarter_of).values_list('filing_id', 'cusip', 'put_call')
    for filing_id, cusip, put_call in rows:
        keys[quarter_of[filing_id]].add((cusip, put_call))
    return keys


def quarters_held(keys_by_quarter, quarter_end):
    earlier = sorted((q for q in keys_by_quarter if q <= quarter_end), reverse=True)
    counts = {}
    for key in keys_by_quarter.get(quarter_end, set()):
        streak = 0
        for quarter in earlier:
            if key not in keys_by_quarter[quarter]:
                break
            streak += 1
        counts[key] = streak
    return counts
