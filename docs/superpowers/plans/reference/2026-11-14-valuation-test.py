import json
import random
from bisect import bisect_right
from collections import defaultdict
from datetime import date, timedelta

TMP = 'data/'
LAG = timedelta(days=45)
WINDOW_WEEKS = 104
HORIZONS = (63, 126, 252)
random.seed(11)

data = json.load(open(TMP + 'valuation_data.json'))
closes, fundamentals = data['closes'], data['fundamentals']


def percentile(values, q):
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


rows = []
for ticker, info in fundamentals.items():
    series = closes.get(ticker)
    if not series or len(series) < 1100 or len(info['eps']) < 8:
        continue
    eps = sorted((date.fromisoformat(p) + LAG, v) for p, v in info['eps'] if v is not None)
    known = [d for d, _ in eps]
    days = [date.fromisoformat(d) for d, _ in series]
    price = [c for _, c in series]
    n = len(series)

    def pe_at(i):
        k = bisect_right(known, days[i])
        if k < 4:
            return None
        ttm = sum(v for _, v in eps[k - 4:k])
        return price[i] / ttm if ttm > 0 else None

    weekly = [(i, pe_at(i)) for i in range(0, n, 5)]
    everything = [pe for _, pe in weekly if pe]
    if len(everything) < 150:
        continue
    full25, full75 = percentile(everything, 0.25), percentile(everything, 0.75)
    for t in range(WINDOW_WEEKS * 5, n - 63, 21):
        now = pe_at(t)
        past = [pe for i, pe in weekly if t - WINDOW_WEEKS * 5 <= i < t and pe]
        if not now or len(past) < 80:
            continue
        p25, p75 = percentile(past, 0.25), percentile(past, 0.75)
        sma = sum(price[t - 200:t]) / 200
        rows.append({
            'ticker': ticker, 't': t, 'pe': now,
            'grade': 'cheap' if now < p25 else 'expensive' if now > p75 else 'fair',
            'hindsight': 'cheap' if now < full25 else 'expensive' if now > full75 else 'fair',
            'trend': 'up' if price[t] > sma else 'down',
            'drawdown': price[t] / max(price[max(0, t - 252):t + 1]) - 1,
            **{f'f{h}': (price[t + h] / price[t] - 1 if t + h < n else None) for h in HORIZONS},
        })

by_date = defaultdict(list)
for row in rows:
    by_date[row['t']].append(row)
for t, group in by_date.items():
    ranked = sorted(group, key=lambda r: r['pe'])
    for position, row in enumerate(ranked):
        row['cross'] = 'cheap' if position < len(ranked) / 4 else 'expensive' if position >= 3 * len(ranked) / 4 else 'fair'
    for h in HORIZONS:
        values = [r[f'f{h}'] for r in group if r[f'f{h}'] is not None]
        average = sum(values) / len(values) if values else None
        for row in group:
            row[f'x{h}'] = row[f'f{h}'] - average if row[f'f{h}'] is not None and average is not None else None


def mean(items, key):
    values = [r[key] for r in items if r[key] is not None]
    return sum(values) / len(values) if values else float('nan')


def spread(select_a, select_b, key):
    per_date = []
    for t, group in sorted(by_date.items()):
        a = [r[key] for r in group if select_a(r) and r[key] is not None]
        b = [r[key] for r in group if select_b(r) and r[key] is not None]
        if len(a) >= 5 and len(b) >= 5:
            per_date.append(sum(a) / len(a) - sum(b) / len(b))
    if not per_date:
        return 'n/a'
    wins = sum(1 for d in per_date if d > 0)
    return f'{100 * sum(per_date) / len(per_date):+.2f}pp (positive on {wins} of {len(per_date)} dates)'


def boot(select_a, select_b, key, rounds=1000):
    tickers = sorted({r['ticker'] for r in rows})
    sa, sb = defaultdict(lambda: [0.0, 0]), defaultdict(lambda: [0.0, 0])
    for r in rows:
        if r[key] is None:
            continue
        if select_a(r):
            sa[r['ticker']][0] += r[key]; sa[r['ticker']][1] += 1
        if select_b(r):
            sb[r['ticker']][0] += r[key]; sb[r['ticker']][1] += 1
    diffs = []
    for _ in range(rounds):
        pick = random.choices(tickers, k=len(tickers))
        xa = sum(sa[t][0] for t in pick); na = sum(sa[t][1] for t in pick)
        xb = sum(sb[t][0] for t in pick); nb = sum(sb[t][1] for t in pick)
        if na and nb:
            diffs.append(xa / na - xb / nb)
    diffs.sort()
    return f'[{100 * diffs[25]:+.2f},{100 * diffs[974]:+.2f}]'


print('stocks', len({r['ticker'] for r in rows}), 'observations', len(rows), 'dates', len(by_date))
first = min(by_date); print('evaluation bars', first, 'to', max(by_date), '(of 1200 daily bars ending 2026-11)')
print('x = return minus the average of all stocks on the same date')
for label, field in (('own 2-year history, known at the time', 'grade'), ('own history WITH HINDSIGHT (as the mockup draws it)', 'hindsight'), ('against other stocks on the day (lowest/highest quarter of P/E)', 'cross')):
    print(f'--- cheap vs expensive by {label}')
    for grade in ('cheap', 'fair', 'expensive'):
        group = [r for r in rows if r[field] == grade]
        print(f'  {grade:<10} n={len(group):>5}  ' + '  '.join(f'{h}d raw {100 * mean(group, f"f{h}"):+6.2f}% x {100 * mean(group, f"x{h}"):+5.2f}pp' for h in HORIZONS))
    for h in HORIZONS:
        print(f'  cheap minus expensive, {h}d excess: per-date {spread(lambda r: r[field] == "cheap", lambda r: r[field] == "expensive", f"x{h}")}  stock-bootstrap {boot(lambda r: r[field] == "cheap", lambda r: r[field] == "expensive", f"x{h}")}')
print('--- cheap (own history, known then) split by trend and by drawdown')
for name, test in (
    ('cheap, above 200-day', lambda r: r['grade'] == 'cheap' and r['trend'] == 'up'),
    ('cheap, below 200-day', lambda r: r['grade'] == 'cheap' and r['trend'] == 'down'),
    ('not cheap, above 200-day', lambda r: r['grade'] != 'cheap' and r['trend'] == 'up'),
    ('not cheap, below 200-day', lambda r: r['grade'] != 'cheap' and r['trend'] == 'down'),
    ('cheap, >20% off 1y high', lambda r: r['grade'] == 'cheap' and r['drawdown'] < -0.2),
    ('cheap, <10% off 1y high', lambda r: r['grade'] == 'cheap' and r['drawdown'] > -0.1),
    ('any, >20% off 1y high', lambda r: r['drawdown'] < -0.2),
    ('any, <10% off 1y high', lambda r: r['drawdown'] > -0.1),
):
    group = [r for r in rows if test(r)]
    print(f'  {name:<26} n={len(group):>5}  ' + '  '.join(f'{h}d raw {100 * mean(group, f"f{h}"):+6.2f}% x {100 * mean(group, f"x{h}"):+5.2f}pp' for h in HORIZONS))
