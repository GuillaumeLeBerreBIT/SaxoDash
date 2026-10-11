from collections import defaultdict

from .models import Filing, Holding, Security


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


def tickers_held(investor):
    held = Holding.objects.filter(filing__investor=investor).values('cusip')
    return dict(Security.objects.filter(cusip__in=held, ticker__isnull=False).values_list('cusip', 'ticker'))


def identity(key, tickers):
    return tickers.get(key[0]) or key[0], key[1]


def _by_identity(keys, tickers):
    grouped = defaultdict(list)
    for key in keys:
        if key[0] in tickers:
            grouped[identity(key, tickers)].append(key)
    return grouped


def carried_over(previous_snap, snap, tickers):
    if previous_snap is None:
        return None
    left = _by_identity((key for key in previous_snap if key not in snap), tickers)
    arrived = _by_identity((key for key in snap if key not in previous_snap), tickers)
    renamed = {
        keys[0]: arrived[stock][0]
        for stock, keys in left.items() if len(keys) == 1 and len(arrived.get(stock, [])) == 1
    }
    return {renamed.get(key, key): row for key, row in previous_snap.items()}


def held_keys_by_quarter(investor, tickers):
    ids_by_quarter = _effective_ids_by_quarter(investor)
    quarter_of = {pk: quarter for quarter, ids in ids_by_quarter.items() for pk in ids}
    keys = {quarter: set() for quarter in ids_by_quarter}
    rows = Holding.objects.filter(filing_id__in=quarter_of).values_list('filing_id', 'cusip', 'put_call')
    for filing_id, cusip, put_call in rows:
        keys[quarter_of[filing_id]].add(identity((cusip, put_call), tickers))
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
