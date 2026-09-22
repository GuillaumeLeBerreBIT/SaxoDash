from typing import NamedTuple

from django.utils import timezone

from accounts.services import get_total_bank_balance
from portfolio.services import get_portfolio_value, get_saxo_account_value

from .models import NetWorthSnapshot
from .money import Money


class NetWorth(NamedTuple):
    portfolio: Money
    bank: Money
    total: Money


def current_net_worth():
    """Net worth right now, as Money in REPORTING_CURRENCY.

    One definition, shared by the snapshot and the endpoint the dashboard
    reads, so the headline figure and the chart cannot disagree.
    """
    portfolio = get_portfolio_value()
    bank = get_total_bank_balance()
    return NetWorth(portfolio, bank, portfolio + bank)


def ensure_todays_snapshot():
    """Record today's net worth, refreshing a row that already exists.

    Not create-if-absent: the day's figure is a running total until the day is
    over, so freezing it at the first call of the day meant a correction
    landing later never reached the chart.
    """
    net_worth = current_net_worth()
    today = timezone.localdate()

    # A None fetch (the Saxo credential is unusable right now) must not blank
    # out a good value this same day already recorded from an earlier,
    # usable sync - a mid-day re-auth lapse should not erase real data.
    saxo_value = get_saxo_account_value()
    if saxo_value is not None:
        saxo_account_value = saxo_value.rounded().amount
    else:
        existing = NetWorthSnapshot.objects.filter(date=today).first()
        saxo_account_value = existing.saxo_account_value if existing else None

    snapshot, _ = NetWorthSnapshot.objects.update_or_create(
        date=today,
        defaults={
            'portfolio_value': net_worth.portfolio.rounded().amount,
            'bank_total': net_worth.bank.rounded().amount,
            'net_worth': net_worth.total.rounded().amount,
            'saxo_account_value': saxo_account_value,
        },
    )
    return snapshot
