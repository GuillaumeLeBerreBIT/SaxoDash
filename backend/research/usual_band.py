from datetime import date

from . import daily, finnhub, valuation
from .listings import look_up
from .models import ScreenerRow


def released_dates(ticker):
    stored = ScreenerRow.everything.filter(ticker__iexact=ticker).values_list('fundamentals_history', flat=True).first()
    return valuation.stored_releases(stored)


def price_band(band, eps):
    ttms = valuation.trailing_eps([date.fromisoformat(row[0]) for row in band], eps)
    priced = []
    for (day, low, high), ttm in zip(band, ttms):
        if low is None or ttm is None or ttm <= 0:
            priced.append([day, None, None])
        else:
            priced.append([day, round(low * ttm, 2), round(high * ttm, 2)])
    return priced


def usual_band(symbol, *, user):
    listing = look_up(symbol, user=user)
    reason = listing.refusal()
    if reason:
        return {'band': [], 'warnings': [reason]}
    bars, unavailable = daily.available(listing, user=user)
    if bars is None:
        return {'band': [], 'warnings': [unavailable] if unavailable else []}
    series = finnhub.valuation_series(listing.ticker)
    released = released_dates(listing.ticker)
    data, notes = valuation.history(listing.ticker, series, bars, released=released, band=True)
    return {'band': price_band(data['daily_pe_band'], valuation.series_eps(series, released)), 'warnings': notes}
