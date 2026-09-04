import hashlib
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.utils import timezone

CENTS = Decimal('0.01')


def _color_for_ticker(ticker):
    digest = hashlib.md5(ticker.encode(), usedforsecurity=False).hexdigest()
    return f"#{digest[:6]}"


def _decimal(value):
    return Decimal(str(value))


def _mark(base, view):
    """(price, source) for one position, best source first.

    Saxo withholds CurrentPrice without a market-data entitlement - it sends
    0.0 with CurrentPriceType 'None' - but it still marks the book server-side,
    so ProfitLossOnTrade recovers the price. Both it and Amount are signed, so
    the one expression covers longs and shorts.
    """
    open_price = _decimal(base['OpenPrice'])

    price = view.get('CurrentPrice')
    if price and view.get('CurrentPriceType') != 'None':
        return _decimal(price), 'live'

    pnl, amount = view.get('ProfitLossOnTrade'), base.get('Amount')
    if pnl is not None and amount:
        return open_price + _decimal(pnl) / _decimal(amount), 'derived'

    return open_price, 'cost'


def to_position_fields(saxo_position):
    base = saxo_position['PositionBase']
    view = saxo_position.get('PositionView', {})
    display = saxo_position.get('DisplayAndFormat', {})

    ticker = display.get('Symbol', '').split(':')[0]
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
        'fx_rate': _decimal(view.get('ConversionRateCurrent', 1)),
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
        'ticker': display.get('Symbol', '').split(':')[0],
        'qty': _decimal(abs(amount)),
        'price': _decimal(base['OpenPrice']),
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
