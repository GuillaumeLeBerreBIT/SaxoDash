import hashlib
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.utils import timezone

CENTS = Decimal('0.01')


def _color_for_ticker(ticker):
    digest = hashlib.md5(ticker.encode(), usedforsecurity=False).hexdigest()
    return f"#{digest[:6]}"


def _decimal(value, default='0'):
    """Saxo sends JSON null for fields it withholds, and Decimal('None') raises
    InvalidOperation - an ArithmeticError, which the sync's row guard does not
    catch, so one null row would fail the whole run."""
    return Decimal(str(default if value is None else value))


def bare_symbol(symbol):
    """'NVDA:xnas' -> 'NVDA'. The join key between positions, watchlist rows
    and the Research URL, so it has one definition."""
    return (symbol or '').split(':')[0]


def _mark(base, view):
    """(price, source) for one position, best source first.

    Saxo withholds CurrentPrice without a market-data entitlement - it sends
    0.0 with CurrentPriceType 'None' - but it still marks the book server-side,
    so ProfitLossOnTrade recovers the price. Both it and Amount are signed, so
    the one expression covers longs and shorts.

    On a SIM account with no entitlement at all, Saxo reports
    ProfitLossOnTrade as exactly -(OpenPrice * Amount) - "this position has no
    mark", not "it lost 100% of its value" - which makes the formula above
    land on exactly 0 (or, for a large enough loss against a small open price,
    negative). Neither is ever a legitimate price for a real position, so
    that result is rejected in favour of the 'cost' fallback rather than
    reported as a real 'derived' mark. Verified live against a SIM account
    2026-09-20.
    """
    open_price = _decimal(base['OpenPrice'])

    price = view.get('CurrentPrice')
    if price and view.get('CurrentPriceType') != 'None':
        return _decimal(price), 'live'

    pnl, amount = view.get('ProfitLossOnTrade'), base.get('Amount')
    if pnl is not None and amount:
        derived = open_price + _decimal(pnl) / _decimal(amount)
        if derived > 0:
            return derived, 'derived'

    return open_price, 'cost'


def to_position_fields(saxo_position):
    base = saxo_position['PositionBase']
    view = saxo_position.get('PositionView', {})
    display = saxo_position.get('DisplayAndFormat', {})

    ticker = bare_symbol(display.get('Symbol'))
    current_price, price_source = _mark(base, view)

    return {
        'ticker': ticker,
        'name': display.get('Description', ''),
        'qty': _decimal(base['Amount']),
        'avg_cost': _decimal(base['OpenPrice']),
        'current_price': current_price.quantize(CENTS, rounding=ROUND_HALF_UP),
        'sector': 'Uncategorized',
        'type': 'STOCK' if base.get('AssetType') == 'Stock' else 'ETF',
        'color': _color_for_ticker(ticker),
        'uic': base.get('Uic'),
        'asset_type': base.get('AssetType', 'Stock'),
        'currency': display.get('Currency', settings.REPORTING_CURRENCY),
        'fx_rate': _decimal(view.get('ConversionRateCurrent'), default=1),
        'price_source': price_source,
        'priced_at': timezone.now(),
    }


def to_transaction_fields(saxo_position):
    """Map one Saxo *open position* to an entry-trade ledger row.

    Sourced from /port/v1/positions/me, not /hist/v1/transactions: the SIM
    environment never populates the historical transactions endpoint (verified
    2026-08-27 - empty for the full year), so the open position is the only
    record of the entry trade. `saxo_trade_id` is the PositionId, so repeated
    syncs upsert the same row instead of duplicating it. A negative Amount is a
    short sale, so it maps to SELL.

    Exit trades (closing a long) are not covered here yet - they come from
    /port/v1/closedpositions/me, which had zero rows in SIM on 2026-08-27, so
    that mapping is deferred until a real closed-position payload exists.
    """
    base = saxo_position['PositionBase']
    display = saxo_position.get('DisplayAndFormat', {})
    amount = base['Amount']

    return {
        'saxo_trade_id': str(saxo_position['PositionId']),
        'date': date.fromisoformat(base['ExecutionTimeOpen'][:10]),
        'type': 'BUY' if amount >= 0 else 'SELL',
        'instrument': display.get('Description', ''),
        'ticker': bare_symbol(display.get('Symbol')),
        'qty': _decimal(abs(amount)),
        'price': _decimal(base['OpenPrice']),
        'account': 'Saxo',
    }


def to_closed_transaction_fields(saxo_closed_position):
    """Map one Saxo *closed position* (an exit trade) to a ledger row.

    Sourced from /port/v1/closedpositions/me - see to_transaction_fields for
    why /hist/v1/transactions is not used. BuyOrSell records the *opening*
    side, so closing a long (Buy) is a SELL and closing a short (Sell) is a
    BUY-to-cover. ClosedPositionUniqueId is stable across repeated syncs, so
    it plays the same upsert-key role saxo_trade_id plays for entry trades.
    """
    base = saxo_closed_position['ClosedPosition']
    display = saxo_closed_position.get('DisplayAndFormat', {})

    return {
        'saxo_trade_id': saxo_closed_position['ClosedPositionUniqueId'],
        'date': date.fromisoformat(base['ExecutionTimeClose'][:10]),
        'type': 'SELL' if base['BuyOrSell'] == 'Buy' else 'BUY',
        'instrument': display.get('Description', ''),
        'ticker': bare_symbol(display.get('Symbol')),
        'qty': _decimal(abs(base['Amount'])),
        'price': _decimal(base['ClosingPrice']),
        'account': 'Saxo',
    }


SAXO_CASH_ACCOUNT_ID = 'saxo:cash'


def to_account_fields(saxo_balance):
    return {
        'bank': 'Saxo',
        'type': 'Cash',
        'iban_masked': '-',
        'balance': _decimal(saxo_balance['CashBalance']),
        'available': _decimal(saxo_balance['CollateralAvailable']),
        'currency': saxo_balance.get('Currency', settings.REPORTING_CURRENCY),
        'gradient': 'from-slate-600 to-slate-800',
        'accent': '#334155',
    }


VALUATION_KEYS = ('Currency', 'CashBalance', 'NonMarginPositionsValue', 'TotalValue')


def to_valuation_fields(saxo_balance):
    """Saxo's own reconciled account valuation, or None if it sent none.

    TotalValue - CashBalance is NonMarginPositionsValue exactly, already
    converted to the account currency, so it needs no fx work of ours.
    """
    if not all(key in saxo_balance for key in VALUATION_KEYS):
        return None

    return {
        'currency': saxo_balance.get('Currency', settings.REPORTING_CURRENCY),
        'cash_balance': _decimal(saxo_balance['CashBalance']),
        'positions_value': _decimal(saxo_balance['NonMarginPositionsValue']),
        'total_value': _decimal(saxo_balance['TotalValue']),
    }
