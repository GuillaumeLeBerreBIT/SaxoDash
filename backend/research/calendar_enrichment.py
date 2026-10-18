import logging

from django.conf import settings

from core.money import CurrencyMismatch
from portfolio.models import Position
from portfolio.services import get_portfolio_value

from . import market, reaction
from .models import ScreenerRow, WatchlistItem
from .providers import ProviderError

logger = logging.getLogger(__name__)

DAILY_HORIZON = 1440
MINE_CHART_BARS = 60


def _portfolio_total():
    try:
        total = get_portfolio_value()
    except CurrencyMismatch:
        logger.warning('portfolio total unavailable for earnings weights', exc_info=True)
        return None
    if total.currency != settings.REPORTING_CURRENCY or not total.amount:
        return None
    return total.amount


def _instruments(positions, watch_items):
    found = {symbol: (item.uic, item.asset_type or 'Stock') for symbol, item in watch_items.items()}
    for symbol, position in positions.items():
        if position.uic is not None:
            found[symbol] = (position.uic, position.asset_type or 'Stock')
    return found


def _watch_items():
    found = {}
    for item in WatchlistItem.objects.order_by('pk'):
        found.setdefault(item.symbol.upper(), item)
    return found


def _chart_bars(instrument):
    try:
        return market.chart(*instrument, DAILY_HORIZON, MINE_CHART_BARS)
    except ProviderError:
        logger.info('earnings move: no Saxo chart for %s', instrument)
        return []


def _bars(symbol, mine, instruments, row):
    charted = _chart_bars(instruments[symbol]) if mine and symbol in instruments else []
    return charted or (row.recent_closes if row else [])


def pnl_impact(value, move_pct):
    if value is None or move_pct is None:
        return None
    return round(value * move_pct / 100, 2)


def _company(row):
    return {
        'name': (row.name or None) if row else None,
        'market_cap': row.market_cap if row else None,
        'sector': (row.sector or None) if row else None,
    }


def _holding(position, total):
    if position is None:
        return {'value': None, 'weight_pct': None}
    return {
        'value': float(position.value),
        'weight_pct': float(position.weight_of(total)) if total else None,
    }


def enrich(events, today, moves=True):
    symbols = {(event['symbol'] or '').upper() for event in events}
    rows = {row.ticker.upper(): row for row in ScreenerRow.objects.filter(ticker__in=symbols)}
    positions = {position.ticker.upper(): position for position in Position.objects.all() if position.ticker}
    watch_items = _watch_items()
    instruments = _instruments(positions, watch_items)
    total = _portfolio_total() if symbols & positions.keys() else None
    bars_by_symbol = {}
    today_iso = today.isoformat()

    def move(event, symbol, mine, row):
        if not moves or event['date'] > today_iso:
            return None, None
        if symbol not in bars_by_symbol:
            bars_by_symbol[symbol] = _bars(symbol, mine, instruments, row)
        return reaction.move(event['date'], event['session'], bars_by_symbol[symbol])

    enriched = []
    for event in events:
        symbol = (event['symbol'] or '').upper()
        row = rows.get(symbol)
        held = symbol in positions
        watched = not held and symbol in watch_items
        holding = _holding(positions.get(symbol), total)
        move_pct, basis = move(event, symbol, held or watched, row)
        enriched.append({
            **event,
            'held': held,
            'watched': watched,
            'mine': held or watched,
            **_company(row),
            **holding,
            'move_pct': move_pct,
            'move_basis': basis,
            'pnl_impact': pnl_impact(holding['value'], move_pct),
            'also': [],
        })
    return enriched


def _summed(values):
    present = [value for value in values if value is not None]
    return round(sum(present), 2) if present else None


def _merge(group):
    lead = min(group, key=lambda e: (not e['held'], not e['watched'], -(e['market_cap'] or 0), e['symbol'] or ''))
    held = any(e['held'] for e in group)
    value = _summed(e['value'] for e in group)
    return {
        **lead,
        'also': sorted(e['symbol'] for e in group if e is not lead),
        'held': held,
        'watched': not held and any(e['watched'] for e in group),
        'mine': any(e['mine'] for e in group),
        'value': value,
        'weight_pct': _summed(e['weight_pct'] for e in group),
        'pnl_impact': pnl_impact(value, lead['move_pct']),
    }


def merge_share_classes(events):
    grouped = {}
    singles = []
    for event in events:
        if event.get('name'):
            grouped.setdefault((event['date'], event['name']), []).append(event)
        else:
            singles.append(event)
    merged = [group[0] if len(group) == 1 else _merge(group) for group in grouped.values()]
    return sorted(merged + singles, key=lambda e: (e['date'], e['symbol'] or ''))


def next_mine(after):
    held = [ticker.upper() for ticker in Position.objects.values_list('ticker', flat=True) if ticker]
    row = (
        ScreenerRow.objects.filter(ticker__in=held, next_earnings_date__gt=after)
        .order_by('next_earnings_date', 'ticker')
        .first()
    )
    return {'symbol': row.ticker, 'date': row.next_earnings_date.isoformat()} if row else None
