from datetime import date

from django.core.cache import cache

from . import finnhub
from .providers import ProviderUnavailable


SEC_PREFIX = 'https://www.sec.gov/'
FORM_LIMITS = {'10-K': 6, '10-Q': 8, '8-K': 20}
TRANSACTIONS_KEPT = 60
SENTIMENT_MONTHS = 12
FILINGS_TTL = 43200
INSIDERS_TTL = 43200
PARTIAL_TTL = 600
OPEN_MARKET = {'P': 'bought', 'S': 'sold'}
SHAPING_ERRORS = (KeyError, TypeError, IndexError, ValueError, AttributeError)


def _today():
    return date.today()


def _filings_key(symbol):
    return f'research:filings:v1:{symbol}'


def _insiders_key(symbol):
    return f'research:insiders:v1:{symbol}'


def _sec_url(url):
    return url if isinstance(url, str) and url.startswith(SEC_PREFIX) else ''


def _filing(row):
    return {
        'form': row['form'],
        'filed': row['filedDate'][:10],
        'accepted': row.get('acceptedDate') or '',
        'url': _sec_url(row.get('filingUrl')),
        'report_url': _sec_url(row.get('reportUrl')),
        'accession': row.get('accessNumber'),
    }


def _newest_first(rows):
    return sorted(rows, key=lambda row: (row['filed'], row['accepted']), reverse=True)


def to_filings(by_form):
    kept = []
    for form, limit in FORM_LIMITS.items():
        rows = [
            _filing(row) for row in (by_form.get(form) or [])
            if row.get('filedDate') and row.get('form')
        ]
        kept.extend(_newest_first(rows)[:limit])
    return _newest_first(kept)


def _groups(rows):
    grouped = {}
    for row in rows:
        if row.get('isDerivative') or not row.get('change') or not row.get('transactionDate'):
            continue
        key = (row.get('name') or '', row['transactionDate'], row.get('transactionCode') or '')
        grouped.setdefault(key, []).append(row)
    return grouped


def _transaction(key, rows):
    name, day, code = key
    shares = sum(row['change'] for row in rows)
    priced = [row for row in rows if (row.get('transactionPrice') or 0) > 0]
    priced_shares = sum(abs(row['change']) for row in priced)
    value = sum(abs(row['change']) * row['transactionPrice'] for row in priced)
    holdings = [row['share'] for row in rows if row.get('share') is not None]
    pick = min if shares < 0 else max
    return {
        'date': day,
        'filed': rows[0].get('filingDate') or '',
        'name': name,
        'code': code,
        'shares': shares,
        'price': value / priced_shares if priced else None,
        'value': value if priced else None,
        'holdings': pick(holdings) if holdings else None,
    }


def _all_transactions(rows):
    transactions = [_transaction(key, group) for key, group in _groups(rows or []).items()]
    transactions.sort(key=lambda row: row['name'])
    transactions.sort(key=lambda row: row['date'], reverse=True)
    return transactions


def to_transactions(rows):
    return _all_transactions(rows)[:TRANSACTIONS_KEPT]


def to_summary(rows):
    transactions = _all_transactions(rows)
    summary = {
        'buys': 0, 'sells': 0,
        'shares_bought': 0, 'shares_sold': 0,
        'value_bought': 0, 'value_sold': 0,
    }
    names = set()
    for row in transactions:
        side = OPEN_MARKET.get(row['code'])
        if not side:
            continue
        names.add(row['name'])
        summary['buys' if side == 'bought' else 'sells'] += 1
        summary[f'shares_{side}'] += abs(row['shares'])
        summary[f'value_{side}'] += row['value'] or 0
    dates = [row['date'] for row in transactions]
    return {
        **summary,
        'insiders': len(names),
        'since': min(dates) if dates else None,
        'until': max(dates) if dates else None,
    }


def to_sentiment(rows):
    months = [
        {
            'month': f"{row['year']:04d}-{row['month']:02d}",
            'mspr': round(row['mspr'], 2),
            'change': row.get('change'),
        }
        for row in (rows or [])
        if row.get('year') and row.get('month') and row.get('mspr') is not None
    ]
    months.sort(key=lambda row: row['month'])
    return months[-SENTIMENT_MONTHS:]


def _produce_filings(symbol):
    by_form = {form: finnhub.get_filings(symbol, form) for form in FORM_LIMITS}
    return {'filings': to_filings(by_form)}, FILINGS_TTL


def _sentiment_window():
    today = _today()
    start = date(today.year - 1, today.month, 1)
    return start.isoformat(), today.isoformat()


def _produce_insiders(symbol):
    rows = finnhub.get_insider_transactions(symbol)['data']
    data = {
        'transactions': to_transactions(rows),
        'summary': to_summary(rows),
    }
    try:
        date_from, date_to = _sentiment_window()
        data['sentiment'] = to_sentiment(finnhub.get_insider_sentiment(symbol, date_from, date_to)['data'])
    except (ProviderUnavailable, *SHAPING_ERRORS):
        return {**data, 'sentiment': []}, PARTIAL_TTL
    return data, INSIDERS_TTL


def _cached(key, produce, symbol):
    try:
        data = cache.get(key)
        if data is None:
            data, timeout = produce(symbol)
            cache.set(key, data, timeout)
    except ProviderUnavailable:
        raise
    except SHAPING_ERRORS as exc:
        raise finnhub.FinnhubUnexpected() from exc

    return {'available': True, **data}


def filings(symbol):
    return _cached(_filings_key(symbol), _produce_filings, symbol)


def insiders(symbol):
    return _cached(_insiders_key(symbol), _produce_insiders, symbol)
