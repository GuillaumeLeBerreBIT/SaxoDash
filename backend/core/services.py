from typing import NamedTuple

from django.utils import timezone

from accounts.services import get_total_bank_balance
from portfolio.services import get_portfolio_value, get_saxo_account_value

from .models import NetWorthSnapshot
from .money import Money


class NetWorth(NamedTuple):
    portfolio: Money
    bank: Money
    saxo_account_value: Money | None
    total: Money
    basis: str


def _total_and_basis(bank, portfolio, saxo_account_value):
    """The one formula both current_net_worth() and ensure_todays_snapshot()
    use, so the live headline and the stored history can never define "total"
    two different ways. RECONCILED (bank + Saxo's own cash+positions) is
    preferred; APPROXIMATE (bank + positions only) is an explicit fallback,
    never presented as if it were the precise figure."""
    if saxo_account_value is not None:
        return bank + saxo_account_value, NetWorthSnapshot.Basis.RECONCILED
    return bank + portfolio, NetWorthSnapshot.Basis.APPROXIMATE


def current_net_worth():
    """Net worth right now, as Money in REPORTING_CURRENCY.

    One definition, shared by the snapshot and the endpoint the dashboard
    reads, so the headline figure and the chart cannot disagree.
    """
    portfolio = get_portfolio_value()
    bank = get_total_bank_balance()
    saxo_account_value = get_saxo_account_value()
    total, basis = _total_and_basis(bank, portfolio, saxo_account_value)
    return NetWorth(portfolio, bank, saxo_account_value, total, basis)


def ensure_todays_snapshot():
    """Record today's net worth, refreshing a row that already exists.

    Not create-if-absent: the day's figure is a running total until the day is
    over, so freezing it at the first call of the day meant a correction
    landing later never reached the chart.
    """
    today = timezone.localdate()
    existing = NetWorthSnapshot.objects.filter(date=today).first()

    portfolio = get_portfolio_value()
    bank = get_total_bank_balance()
    saxo_value = get_saxo_account_value()

    # A None fetch (the Saxo credential is unusable right now) must not blank
    # out a good value this same day already recorded from an earlier,
    # usable sync - a mid-day re-auth lapse should not erase real data, and
    # must not silently downgrade today's total from reconciled to
    # approximate either.
    if saxo_value is not None:
        saxo_account_value = saxo_value
    elif existing and existing.saxo_account_value is not None:
        saxo_account_value = Money(existing.saxo_account_value, bank.currency)
    else:
        saxo_account_value = None

    total, basis = _total_and_basis(bank, portfolio, saxo_account_value)

    snapshot, _ = NetWorthSnapshot.objects.update_or_create(
        date=today,
        defaults={
            'portfolio_value': portfolio.rounded().amount,
            'bank_total': bank.rounded().amount,
            'net_worth': total.rounded().amount,
            'net_worth_basis': basis,
            'saxo_account_value': (
                saxo_account_value.rounded().amount if saxo_account_value is not None else None
            ),
        },
    )
    return snapshot
