from portfolio.models import Position
from research.listings import bare
from research.models import ScreenerRow, WatchlistItem


def own_tickers(user):
    held = Position.objects.filter(user=user).values_list('ticker', flat=True)
    watched = WatchlistItem.objects.filter(watchlist__user=user).values_list('symbol', flat=True)
    return {bare(symbol) for symbol in held} | {bare(symbol) for symbol in watched}


def visible_tickers(tickers, user):
    tickers = set(tickers)
    universe = set(ScreenerRow.objects.filter(ticker__in=tickers).values_list('ticker', flat=True))
    return universe | (tickers & own_tickers(user))


def visible_to(verdicts, user):
    allowed = visible_tickers([verdict.ticker for verdict in verdicts], user)
    return [verdict for verdict in verdicts if verdict.ticker in allowed]
