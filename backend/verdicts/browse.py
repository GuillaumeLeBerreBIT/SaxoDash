from dataclasses import dataclass, field

from investors.signals import reported_buyers
from research import shelves
from research.models import ScreenerRow, WatchlistItem

from . import payload, rules
from .models import StockVerdict

ACTION_RANK = ['buy', 'add', 'hold', 'trim', 'not_a_fit', 'sell_review', 'no_verdict']
VALUATIONS = ['cheap', 'fair', 'expensive', 'not_judged']
QUALITIES = ['strong', 'incomplete', 'mixed', 'weak', 'unknown']
SORTS = ['opportunity', 'discount', 'fall', 'checks', 'funds']
SCREENS = {'all', 'strong', 'pullbacks', 'fund-buying', 'saved', *(shelf.key for shelf in shelves.SHELVES)}
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
    screen: str = 'all'
    sort: str = 'opportunity'
    limit: int = DEFAULT_LIMIT
    offset: int = 0


def _pct_under(price, level):
    if not price or not level:
        return None
    return round((1 - price / level) * 100, 1)


def _stock(verdict, row, summary):
    close = round(verdict.last_close, 2) if verdict.last_close is not None else None
    zone = rules.price_zone(close, verdict.cheap_below, verdict.expensive_above)
    passed = [check['label'] for check in verdict.checks if check['status'] == 'pass']
    failed = [check['label'] for check in verdict.checks if check['status'] == 'fail']
    revenue_growth = next((
        check.get('value') for check in verdict.checks
        if check.get('key') == 'revenue_growth' and check['status'] in ('pass', 'fail')
    ), None)
    return {
        **summary,
        'ticker': verdict.ticker,
        'name': verdict.name,
        'sector': row.get('sector') or None,
        'valuation': zone,
        'last_close': close,
        'cheap_below': verdict.cheap_below,
        'expensive_above': verdict.expensive_above,
        'discount_pct': _pct_under(close, verdict.cheap_below) if zone != 'not_judged' else None,
        'below_high_pct': _pct_under(verdict.last_close, verdict.high_1y),
        'dividend_yield': row.get('dividend_yield'),
        'market_cap': row.get('market_cap'),
        'close_date': verdict.close_date,
        'spark': [round(price, 2) for price in verdict.spark],
        'revenue_growth_5y': revenue_growth,
        'checks_passed': len(passed),
        'checks_answered': len(passed) + len(failed),
        'passed_checks': passed,
        'failed_checks': failed,
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

    if query.sort == 'checks':
        return lambda stock: (by(stock['checks_passed'] if stock['checks_answered'] else None), stock['ticker'])
    if query.sort == 'funds':
        return lambda stock: (by(stock.get('fund_count')), stock['ticker'])
    if query.sort == 'discount':
        return lambda stock: (by(stock['discount_pct']), stock['ticker'])
    if query.sort == 'fall':
        return lambda stock: (by(stock['below_high_pct']), stock['ticker'])
    return lambda stock: (_rank(stock['action']), -stock['checks_passed'], stock['ticker'])


def _counts(stocks, query, held, facet):
    counts = {}
    for stock in stocks:
        if _matches(stock, query, held, skip=facet):
            key = stock[facet]
            if key:
                counts[key] = counts.get(key, 0) + 1
    return counts


def _screen(stocks, screen, user):
    if screen == 'strong':
        return [stock for stock in stocks if stock['quality'] == 'strong']
    if screen == 'pullbacks':
        return [stock for stock in stocks if stock['quality'] == 'strong' and (stock['below_high_pct'] or 0) >= 25]
    if screen == 'saved':
        saved = set(WatchlistItem.objects.filter(watchlist__user=user, asset_type='Stock').values_list('uic', flat=True))
        return [stock for stock in stocks if stock['uic'] in saved]
    if screen == 'fund-buying':
        evidence = reported_buyers()
    elif shelf := shelves.by_key(screen):
        evidence = {row.ticker: {'reasons': shelves.reasons(row, shelf)} for row in shelves.matching(shelf)}
    else:
        return stocks
    return [{**stock, **evidence[stock['ticker']]} for stock in stocks if stock['ticker'] in evidence]


def run(query, user):
    rows = {row['ticker']: row for row in ScreenerRow.objects.values('ticker', 'sector', 'dividend_yield', 'market_cap')}
    verdicts = list(StockVerdict.objects.filter(ticker__in=rows.keys()))
    held = set(payload.weights_by_ticker(user))
    computed = payload.for_user(verdicts, user)
    stocks = [_stock(verdict, rows[verdict.ticker], computed[verdict.ticker]) for verdict in verdicts]
    stocks = _screen(stocks, query.screen, user)
    found = sorted((stock for stock in stocks if _matches(stock, query, held)), key=_sort_key(query))
    return {
        'total': len(found),
        'facets': {facet: _counts(stocks, query, held, facet) for facet in FACETS},
        'stocks': [{**stock, 'held': stock['ticker'] in held} for stock in found[query.offset:query.offset + query.limit]],
    }
