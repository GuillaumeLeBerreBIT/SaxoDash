from . import changes, signals
from .models import Investor, Security
from .photos import photo_url

MAX_TICKERS = 200
KINDS = (changes.NEW, changes.ADDED, changes.TRIMMED, changes.SOLD_OUT, changes.UNCHANGED)


class BadTickers(Exception):
    pass


def parse_tickers(raw):
    tickers = list(dict.fromkeys(part.strip().upper() for part in (raw or '').split(',') if part.strip()))
    if not tickers:
        raise BadTickers('Name at least one ticker.')
    if len(tickers) > MAX_TICKERS:
        raise BadTickers(f'Ask for at most {MAX_TICKERS} tickers.')
    return tickers


def _header():
    signal = signals.signal_quarter()
    if signal is None:
        return {'quarter': None, 'filed': 0, 'tracked': Investor.objects.count()}
    return {'quarter': signal['quarter'].isoformat(), 'filed': signal['filed'], 'tracked': signal['tracked']}


def _counts(positions):
    counts = {'owners': 0, **{kind: 0 for kind in KINDS}, 'shares': 0, 'shares_change': 0}
    compared_before = 0
    for position in positions:
        counts['shares'] += position['shares']
        if position['kind'] != changes.SOLD_OUT:
            counts['owners'] += 1
        if position['kind'] is not None:
            counts[position['kind']] += 1
            before = position['previous_shares'] or 0
            counts['shares_change'] += position['shares'] - before
            compared_before += before
    counts['shares_change_pct'] = (
        round(counts['shares_change'] / compared_before * 100, 2) if compared_before else None
    )
    return counts


def _by_ticker(quarter_end, tickers):
    tickers_by_cusip = dict(Security.objects.filter(ticker__in=tickers).values_list('cusip', 'ticker'))
    grouped = {ticker: [] for ticker in tickers_by_cusip.values()}
    for (ticker, _), position in signals.stock_positions(quarter_end, tickers_by_cusip).items():
        grouped[ticker].append(position)
    return grouped


def summary(tickers):
    header = _header()
    grouped = _by_ticker(header['quarter'], tickers) if header['quarter'] else {}
    return {
        **header,
        'stocks': {ticker: _counts(grouped[ticker]) if ticker in grouped else None for ticker in tickers},
    }


def _change_pct(position):
    if position['kind'] == changes.SOLD_OUT:
        return -100.0
    if position['previous_shares'] is None:
        return None
    return changes.position_change(position['shares'], position['previous_shares'])[1]


def _rank(position):
    exited = position['kind'] == changes.SOLD_OUT
    size = (position['previous_weight'] or 0.0) if exited else position['weight']
    return (exited, -size, position['investor_id'])


def _weight(value):
    return None if value is None else round(value, 2)


def _fund(position, investor):
    return {
        'slug': investor.slug, 'name': investor.name, 'firm': investor.firm, 'followed': investor.followed,
        'photo_url': photo_url(investor),
        'kind': position['kind'],
        'shares': position['shares'], 'previous_shares': position['previous_shares'],
        'change_pct': _change_pct(position),
        'value': position['value'],
        'weight': _weight(position['weight']), 'previous_weight': _weight(position['previous_weight']),
    }


def detail(ticker):
    header = _header()
    positions = _by_ticker(header['quarter'], [ticker]).get(ticker) if header['quarter'] else None
    if positions is None:
        return {**header, 'ticker': ticker, 'issuer': '', 'stock': None, 'funds': []}
    ranked = sorted(positions, key=_rank)
    investors = Investor.objects.in_bulk([position['investor_id'] for position in ranked])
    largest = max(ranked, key=lambda position: max(position['value'], position['previous_value'] or 0), default=None)
    return {
        **header,
        'ticker': ticker,
        'issuer': largest['issuer'] if largest else '',
        'stock': _counts(ranked),
        'funds': [_fund(position, investors[position['investor_id']]) for position in ranked],
    }
