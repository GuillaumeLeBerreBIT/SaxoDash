from collections import Counter
from datetime import timedelta

from .models import Holding, Member, Report, Trade
from .summaries import identity, trade_row

WINDOW_DAYS = 90
MOST_BOUGHT = 10
BUYS = {Trade.PURCHASE}
SELLS = {Trade.SALE, Trade.PARTIAL_SALE}


def _recent(today, tickers=None):
    trades = Trade.objects.filter(
        report__status=Report.PARSED, report__filed_on__gte=today - timedelta(days=WINDOW_DAYS), priceable=True,
    ).exclude(option=Trade.PUT)
    if tickers is not None:
        trades = trades.filter(ticker__in=tickers)
    return trades.values_list('ticker', 'kind', 'report__member')


def _counts(tickers, today):
    holders = Counter(Holding.objects.filter(ticker__in=tickers).values_list('ticker', flat=True))
    buyers, sellers = {}, {}
    for ticker, kind, member_id in _recent(today, tickers):
        if kind in BUYS:
            buyers.setdefault(ticker, set()).add(member_id)
        elif kind in SELLS:
            sellers.setdefault(ticker, set()).add(member_id)
    known = set(Trade.objects.filter(ticker__in=tickers).values_list('ticker', flat=True)) | set(holders)
    return {
        ticker: (
            {'holders': holders.get(ticker, 0), 'buyers': len(buyers.get(ticker, ())), 'sellers': len(sellers.get(ticker, ()))}
            if ticker in known else None
        )
        for ticker in tickers
    }


def summary(tickers, today):
    return {'window_days': WINDOW_DAYS, 'stocks': _counts(tickers, today)}


def most_bought(today):
    buyers, sellers = {}, {}
    for ticker, kind, member_id in _recent(today):
        target = buyers if kind in BUYS else sellers if kind in SELLS else None
        if target is not None:
            target.setdefault(ticker, set()).add(member_id)
    ranked = sorted(buyers, key=lambda ticker: (-len(buyers[ticker]), ticker))[:MOST_BOUGHT]
    return [{'ticker': ticker, 'buyers': len(buyers[ticker]), 'sellers': len(sellers.get(ticker, ()))} for ticker in ranked]


def detail(ticker, today):
    stock = _counts([ticker], today)[ticker]
    weights = dict(Holding.objects.filter(ticker=ticker).values_list('member_id', 'weight_pct'))
    trades = Trade.objects.filter(ticker=ticker, report__status=Report.PARSED).select_related('report', 'report__member') \
        .order_by('-report__filed_on', '-traded_on')
    by_member = {}
    for trade in trades:
        by_member.setdefault(trade.report.member_id, []).append(trade)
    members = Member.objects.filter(pk__in=set(by_member) | set(weights))
    ordered = sorted(members, key=lambda member: (-(weights.get(member.pk) or 0), member.last_name))
    return {
        'window_days': WINDOW_DAYS,
        'ticker': ticker,
        'stock': stock,
        'members': [
            {
                **identity(member), 'holds_weight_pct': weights.get(member.pk),
                'trades': [trade_row(trade) for trade in by_member.get(member.pk, [])],
            }
            for member in ordered
        ],
    }
