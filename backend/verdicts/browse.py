from dataclasses import dataclass, field

from research.models import ScreenerRow

from . import payload
from .models import StockVerdict

ACTION_RANK = ['buy', 'add', 'hold', 'wait', 'trim', 'not_a_fit', 'sell_review', 'no_verdict']
VALUATIONS = ['cheap', 'fair', 'expensive', 'not_judged']
QUALITIES = ['strong', 'mixed', 'weak', 'unknown']
SORTS = ['opportunity', 'discount', 'fall']
DEFAULT_LIMIT = 24
MAX_LIMIT = 60
FACETS = ('valuation', 'quality', 'sector')


@dataclass
class Query:
    valuation: set = field(default_factory=set)
    quality: set = field(default_factory=set)
    sector: set = field(default_factory=set)
    min_yield: float | None = None
    min_fall: float | None = None
    not_held: bool = False
    exclude: set = field(default_factory=set)
    text: str = ''
    only: set = field(default_factory=set)
    sort: str = 'opportunity'
    limit: int = DEFAULT_LIMIT
    offset: int = 0


def _pct_under(price, level):
    if not price or not level:
        return None
    return round((1 - price / level) * 100, 1)


def _stock(verdict, row):
    return {
        'ticker': verdict.ticker,
        'name': verdict.name,
        'sector': row.get('sector') or None,
        'quality': verdict.quality,
        'valuation': verdict.valuation,
        'last_close': verdict.last_close,
        'cheap_below': verdict.cheap_below,
        'expensive_above': verdict.expensive_above,
        'discount_pct': _pct_under(verdict.last_close, verdict.cheap_below),
        'below_high_pct': _pct_under(verdict.last_close, verdict.high_1y),
        'dividend_yield': row.get('dividend_yield'),
        'market_cap': row.get('market_cap'),
        'spark': verdict.spark,
        'checks_passed': sum(1 for check in verdict.checks if check.get('status') == 'pass'),
        'checks_answered': sum(1 for check in verdict.checks if check.get('status') in ('pass', 'fail')),
        'failed_checks': [check.get('label') for check in verdict.checks if check.get('status') == 'fail'],
    }


def _matches(stock, query, held, skip=None):
    if skip != 'valuation' and query.valuation and stock['valuation'] not in query.valuation:
        return False
    if skip != 'quality' and query.quality and stock['quality'] not in query.quality:
        return False
    if skip != 'sector' and query.sector and stock['sector'] not in query.sector:
        return False
    if query.min_yield is not None and (stock['dividend_yield'] or 0) < query.min_yield:
        return False
    if query.min_fall is not None and (stock['below_high_pct'] is None or stock['below_high_pct'] < query.min_fall):
        return False
    if query.not_held and stock['ticker'] in held:
        return False
    if query.only and stock['ticker'] not in query.only:
        return False
    if query.text and not _named(stock, query.text):
        return False
    return stock['ticker'] not in query.exclude


def _named(stock, text):
    needle = text.casefold()
    return stock['ticker'].casefold().startswith(needle) or needle in stock['name'].casefold()


def _rank(action):
    return ACTION_RANK.index(action) if action in ACTION_RANK else len(ACTION_RANK)


def _sort_key(query):
    def by(value):
        return -value if value is not None else float('inf')

    if query.sort == 'discount':
        return lambda stock: (by(stock['discount_pct']), stock['ticker'])
    if query.sort == 'fall':
        return lambda stock: (by(stock['below_high_pct']), stock['ticker'])
    return lambda stock: (_rank(stock['action']), by(stock['discount_pct']), stock['ticker'])


def _counts(stocks, query, held, facet):
    counts = {}
    for stock in stocks:
        if _matches(stock, query, held, skip=facet):
            key = stock[facet]
            if key:
                counts[key] = counts.get(key, 0) + 1
    return counts


def run(query, user):
    rows = {row['ticker']: row for row in ScreenerRow.objects.values('ticker', 'sector', 'dividend_yield', 'market_cap')}
    verdicts = list(StockVerdict.objects.filter(ticker__in=rows.keys()))
    held = set(payload.weights_by_ticker(user))
    computed = payload.for_user(verdicts, user)
    stocks = [{**_stock(verdict, rows[verdict.ticker]), **computed[verdict.ticker]} for verdict in verdicts]
    found = sorted((stock for stock in stocks if _matches(stock, query, held)), key=_sort_key(query))
    return {
        'total': len(found),
        'facets': {facet: _counts(stocks, query, held, facet) for facet in FACETS},
        'stocks': [{**stock, 'held': stock['ticker'] in held} for stock in found[query.offset:query.offset + query.limit]],
    }
