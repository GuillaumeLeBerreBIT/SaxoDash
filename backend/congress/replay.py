from collections import Counter, defaultdict
from dataclasses import dataclass, replace
from datetime import date
from itertools import groupby

from investors.copying import Period

from .amounts import size

PURCHASE = 'purchase'
SALE = 'sale'
EXCHANGE = 'exchange'
CALL = 'call'
PUT = 'put'


@dataclass(frozen=True)
class TradeRow:
    filed_on: date
    traded_on: date
    ticker: str | None
    kind: str
    option: str
    exercise: bool
    amount_low: int
    amount_high: int | None
    priceable: bool
    amended: bool
    asset: str
    owner: str
    report: str


@dataclass
class Replayed:
    periods: list[Period]
    basis: dict


def _identity(row):
    return (row.owner, row.asset.lower(), row.traded_on, row.kind, row.option, row.amount_low, row.amount_high)


def dedupe(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[_identity(row)].append(row)
    kept = []
    for members in groups.values():
        copies = max(Counter(row.report for row in members).values())
        amended = [row for row in members if row.amended]
        pool = amended or members
        earliest = min(row.filed_on for row in members)
        kept.extend(replace(row, filed_on=earliest) for row in pool[:copies])
    return sorted(kept, key=lambda found: (found.filed_on, found.traded_on))


def _apply(row, price, stock, calls, basis):
    shares = size(row.amount_low, row.amount_high) / price
    book = calls if row.option == CALL else stock
    if row.kind == PURCHASE:
        if row.exercise:
            calls.pop(row.ticker, None)
        book[row.ticker] += shares
        return
    held = book.get(row.ticker, 0.0)
    if held <= 0:
        basis['unseen_sales'] += 1
        return
    remaining = 0.0 if row.kind == SALE else max(0.0, held - shares)
    if remaining > 0:
        book[row.ticker] = remaining
    else:
        book.pop(row.ticker, None)


def _period(filed_on, stock, calls, prices):
    held = []
    for ticker in set(stock) | set(calls):
        price = prices[ticker].at(filed_on)
        if price:
            held.append((ticker, (stock.get(ticker, 0.0) + calls.get(ticker, 0.0)) * price))
    held.sort(key=lambda found: (-found[1], found[0]))
    return Period(filed_on, held, int(sum(value for _, value in held)))


def replay(rows, prices):
    stock, calls = defaultdict(float), defaultdict(float)
    basis = {'trades': 0, 'unseen_sales': 0, 'unpriced': 0}
    periods = []
    ordered = sorted(rows, key=lambda found: (found.filed_on, found.traded_on))
    for filed_on, group in groupby(ordered, key=lambda found: found.filed_on):
        for row in group:
            basis['trades'] += 1
            if row.option == PUT or row.kind == EXCHANGE:
                continue
            series = prices.get(row.ticker) if row.priceable else None
            price = series.at(row.traded_on) if series else None
            if not price:
                basis['unpriced'] += 1
                continue
            _apply(row, price, stock, calls, basis)
        periods.append(_period(filed_on, stock, calls, prices))
    return Replayed(periods, basis)
