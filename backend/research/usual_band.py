from . import daily, finnhub, valuation
from .listings import look_up
from .models import ScreenerRow


def released_dates(ticker):
    stored = ScreenerRow.everything.filter(ticker__iexact=ticker).values_list('fundamentals_history', flat=True).first()
    return valuation.stored_releases(stored)


def usual_band(symbol, *, user):
    listing = look_up(symbol, user=user)
    reason = listing.refusal()
    if reason:
        return {'band': [], 'warnings': [reason]}
    bars, unavailable = daily.available(listing, user=user)
    if bars is None:
        return {'band': [], 'warnings': [unavailable] if unavailable else []}
    series = finnhub.valuation_series(listing.ticker)
    data, notes = valuation.history(listing.ticker, series, bars, released=released_dates(listing.ticker))
    return {'band': data['daily_pe_band'], 'warnings': notes}
