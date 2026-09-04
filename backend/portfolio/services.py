from datetime import timedelta

from django.conf import settings
from django.utils import timezone

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


# Past this age the broker's figure is no better evidence than our own marks.
VALUATION_MAX_AGE = timedelta(days=2)


def get_portfolio_value():
    """The investment book's market value, in REPORTING_CURRENCY.

    Saxo's own figure when there is one: it arrives already converted and
    reconciled (TotalValue - CashBalance), where rebuilding it from prices
    depends on marks Saxo may never have given us. Falls back to our own
    positions when the account has not been synced - demo data, or a first run.

    The broker figure is denominated in the *account's* currency, so it is only
    usable directly when that is the currency we report in; otherwise our own
    positions answer, since they carry an fx_rate and the valuation does not.
    A stale valuation is likewise declined - `as_of` is only evidence while the
    sync that wrote it is still running.
    """
    valuation = PortfolioValuation.objects.filter(source=SAXO_SOURCE).first()
    if valuation and _is_usable(valuation):
        return Money(valuation.positions_value, valuation.currency)
    return get_positions_value()


def _is_usable(valuation):
    return (
        valuation.currency == settings.REPORTING_CURRENCY
        and timezone.now() - valuation.as_of <= VALUATION_MAX_AGE
    )
