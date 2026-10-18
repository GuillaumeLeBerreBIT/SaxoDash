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


def _instruments():
    found = {}
    for item in WatchlistItem.objects.all():
        found.setdefault(item.symbol.upper(), (item.uic, item.asset_type or 'Stock'))
    for position in Position.objects.exclude(uic=None):
        found[position.ticker.upper()] = (position.uic, position.asset_type or 'Stock')
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


def enrich(events, today):
    symbols = {(event['symbol'] or '').upper() for event in events}
    rows = {row.ticker.upper(): row for row in ScreenerRow.objects.filter(ticker__in=symbols)}
    positions = {position.ticker.upper(): position for position in Position.objects.all()}
    total = _portfolio_total() if any(event['held'] for event in events) else None
    instruments = _instruments()
    bars_by_symbol = {}
    today_iso = today.isoformat()

    def move(event, symbol, row):
        if event['date'] > today_iso:
            return None, None
        if symbol not in bars_by_symbol:
            bars_by_symbol[symbol] = _bars(symbol, event['mine'], instruments, row)
        return reaction.move(event['date'], event['session'], bars_by_symbol[symbol])

    enriched = []
    for event in events:
        symbol = (event['symbol'] or '').upper()
        row = rows.get(symbol)
        holding = _holding(positions.get(symbol) if event['held'] else None, total)
        move_pct, basis = move(event, symbol, row)
        enriched.append({
            **event,
            **_company(row),
            **holding,
            'move_pct': move_pct,
            'move_basis': basis,
            'pnl_impact': pnl_impact(holding['value'], move_pct),
            'also': [],
        })
    return enriched
