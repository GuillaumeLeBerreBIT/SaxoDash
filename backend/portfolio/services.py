from django.conf import settings

from core.money import Money

from .models import SAXO_SOURCE, PortfolioValuation, Position


def get_positions_value():
    """Sum of the positions we hold, in REPORTING_CURRENCY.

    The relative view: what allocation and per-position weights divide into.
    """
    return Money.total(
        (Money(p.value, settings.REPORTING_CURRENCY) for p in Position.objects.all()),
        settings.REPORTING_CURRENCY,
    )


def get_portfolio_value():
    """The investment book's market value, in REPORTING_CURRENCY.

    Saxo's own figure when there is one: it arrives already converted and
    reconciled (TotalValue - CashBalance), where rebuilding it from prices
    depends on marks Saxo may never have given us. Falls back to our own
    positions when the account has not been synced - demo data, or a first run.
    """
    valuation = PortfolioValuation.objects.filter(source=SAXO_SOURCE).first()
    if valuation:
        return Money(valuation.positions_value, valuation.currency)
    return get_positions_value()
