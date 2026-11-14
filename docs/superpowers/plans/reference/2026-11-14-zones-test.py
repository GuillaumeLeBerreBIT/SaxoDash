import json
import math
import random
import statistics
import sys
from bisect import bisect_left, bisect_right
from collections import defaultdict

TMP = 'data/'
MODE = sys.argv[1] if len(sys.argv) > 1 else 'fixed'
SPAN, LOOKBACK, REACH, STEP, WATCH, COOLDOWN = 5, 520, 0.4, 5, 5, 20
HORIZONS = (5, 10, 20, 60)
BINS = 120
random.seed(7)

bars_by = json.load(open(TMP + 'bars.json'))


def prepare(bars):
    O = [b[1] for b in bars]; H = [b[2] for b in bars]; L = [b[3] for b in bars]
    C = [b[4] for b in bars]; V = [b[5] for b in bars]
    n = len(bars)
    piv_i, piv_p = [], []
    for i in range(SPAN, n - SPAN):
        if H[i] == max(H[i - SPAN:i + SPAN + 1]):
            piv_i.append(i); piv_p.append(H[i])
        if L[i] == min(L[i - SPAN:i + SPAN + 1]):
            piv_i.append(i); piv_p.append(L[i])
    tr = [H[0] - L[0]] + [max(H[i] - L[i], abs(H[i] - C[i - 1]), abs(L[i] - C[i - 1])) for i in range(1, n)]
    ctr = [0.0]
    for x in tr:
        ctr.append(ctr[-1] + x)
    cc = [0.0]
    for x in C:
        cc.append(cc[-1] + x)
    return O, H, L, C, V, piv_i, piv_p, ctr, cc


def zones_at(t, data, tolerance):
    O, H, L, C, V, piv_i, piv_p, ctr, cc = data
    span = min(LOOKBACK, t)
    start = t - span
    price = C[t - 1]
    low, high = price * (1 - REACH), price * (1 + REACH)
    a, b = bisect_left(piv_i, start), bisect_right(piv_i, t - 1 - SPAN)
    points = sorted((piv_p[k], piv_i[k]) for k in range(a, b) if low <= piv_p[k] <= high)
    clusters = []
    for level, index in points:
        if clusters and level <= clusters[-1][0] * (1 + tolerance):
            clusters[-1][1].append((level, index))
        else:
            clusters.append((level, [(level, index)]))
    llow = math.log(low)
    step = (math.log(high) - llow) / BINS
    profile = [0.0] * BINS
    for i in range(start, t):
        first = max(0, int((math.log(max(L[i], low)) - llow) / step))
        last = min(BINS - 1, int((math.log(min(H[i], high)) - llow) / step))
        if last < first:
            continue
        share = V[i] / (last - first + 1)
        for k in range(first, last + 1):
            profile[k] += share
    peak = max(profile) or 1
    out = []
    for _, hits in clusters:
        if len(hits) < 2:
            continue
        levels = [lv for lv, _ in hits]
        bottom, top = min(levels), max(levels)
        pad = max(0, (statistics.median(levels) * 0.012 - (top - bottom)) / 2)
        bottom, top = bottom - pad, top + pad
        weight = sum(0.5 + 0.5 * (ix - start) / span for _, ix in hits)
        fb = max(0, int((math.log(bottom) - llow) / step))
        lb = min(BINS - 1, int((math.log(top) - llow) / step))
        traded = max(profile[fb:lb + 1], default=0) / peak
        side = 'support' if top < price * 0.99 else 'resistance' if bottom > price * 1.01 else None
        out.append({
            'low': bottom, 'high': top, 'hits': len(hits), 'traded': traded,
            'score': weight / 4 + traded, 'side': side, 'age': t - max(ix for _, ix in hits),
        })
    for side in ('support', 'resistance'):
        ranked = sorted((z for z in out if z['side'] == side), key=lambda z: -z['score'])
        for rank, zone in enumerate(ranked):
            zone['top3'] = rank < 3
    return out, price


def placebos(found, price):
    made = []
    for zone in found:
        if not zone['side']:
            continue
        for _ in range(6):
            shift = math.exp(random.choice((-1, 1)) * random.uniform(0.03, 0.08))
            lo, hi = zone['low'] * shift, zone['high'] * shift
            if any(lo <= z['high'] and hi >= z['low'] for z in found):
                continue
            side = 'support' if hi < price * 0.99 else 'resistance' if lo > price * 1.01 else None
            if side != zone['side']:
                continue
            made.append({**zone, 'low': lo, 'high': hi})
            break
    return made


def outcome(j, entry, side, data, atr):
    O, H, L, C, V, *_ = data
    sign = 1 if side == 'support' else -1
    result = {f'r{k}': sign * (C[j + k] / entry - 1) for k in HORIZONS}
    result['raw20'] = C[j + 20] / entry - 1
    x = 2 * atr
    race = None
    for k in range(j + 1, j + 21):
        against = L[k] <= entry * (1 - x) if side == 'support' else H[k] >= entry * (1 + x)
        favour = H[k] >= entry * (1 + x) if side == 'support' else L[k] <= entry * (1 - x)
        if against:
            race = 0
            break
        if favour:
            race = 1
            break
    result['race'] = race
    return result


def run(ticker, bars, events):
    data = prepare(bars)
    O, H, L, C, V, piv_i, piv_p, ctr, cc = data
    n = len(bars)
    grid = list(range(260, n - 60 - WATCH, STEP))
    state = {}
    for t in grid:
        atr = (ctr[t] - ctr[t - 14]) / 14 / C[t - 1]
        tolerance = 0.025 if MODE == 'fixed' else max(0.008, min(0.06, 1.0 * atr))
        found, price = zones_at(t, data, tolerance)
        span = min(LOOKBACK, t)
        state[t] = (found, price, atr, 'up' if price > (cc[t] - cc[t - 200]) / 200 else 'down',
                    min(L[t - span:t]), max(H[t - span:t]))
    jobs = []
    for t in grid:
        found, price, *_ = state[t]
        for zone in found:
            if not zone['side']:
                continue
            jobs.append(('zone', t, zone))
            t2 = random.choice(grid)
            found2, price2, *_ = state[t2]
            lo, hi = zone['low'] / price * price2, zone['high'] / price * price2
            jobs.append(('placebo', t2, {**zone, 'low': lo, 'high': hi,
                                         'onzone': any(lo <= z['high'] and hi >= z['low'] for z in found2)}))
    jobs.sort(key=lambda job: job[1])
    recent = defaultdict(list)
    for group, t, zone in jobs:
        found, price, atr, trend, wlow, whigh = state[t]
        side = zone['side']
        for j in range(t, t + WATCH):
            hit = L[j] <= zone['high'] if side == 'support' else H[j] >= zone['low']
            if not hit:
                continue
            seen = recent[(group, side)]
            if any(j - pj < COOLDOWN and zone['low'] <= ph and zone['high'] >= pl for pj, pl, ph in seen):
                break
            seen.append((j, zone['low'], zone['high']))
            entry = min(O[j], zone['high']) if side == 'support' else max(O[j], zone['low'])
            events.append({
                'ticker': ticker, 'group': group, 'side': side, 'trend': trend, 'top3': zone['top3'],
                'hits': zone['hits'], 'traded': zone['traded'], 'score': zone['score'], 'age': zone['age'],
                'onzone': zone.get('onzone', True), 'inrange': wlow <= zone['high'] and zone['low'] <= whigh,
                'dist': abs(math.log((zone['high'] if side == 'support' else zone['low']) / price)),
                **outcome(j, entry, side, data, atr),
            })
            break


events = []
for ticker, bars in bars_by.items():
    if len(bars) >= 600:
        run(ticker, bars, events)
json.dump(events, open(TMP + f'events_{MODE}.json', 'w'))


def mean(rows, key):
    values = [r[key] for r in rows if r[key] is not None]
    return sum(values) / len(values) if values else float('nan')


def boot_diff(a, b, key, rounds=1000):
    tickers = sorted({r['ticker'] for r in a} | {r['ticker'] for r in b})
    sa, sb = defaultdict(lambda: [0.0, 0]), defaultdict(lambda: [0.0, 0])
    for rows, store in ((a, sa), (b, sb)):
        for r in rows:
            if r[key] is not None:
                store[r['ticker']][0] += r[key]; store[r['ticker']][1] += 1
    diffs = []
    for _ in range(rounds):
        pick = random.choices(tickers, k=len(tickers))
        xa = sum(sa[t][0] for t in pick); na = sum(sa[t][1] for t in pick)
        xb = sum(sb[t][0] for t in pick); nb = sum(sb[t][1] for t in pick)
        if na and nb:
            diffs.append(xa / na - xb / nb)
    diffs.sort()
    return diffs[int(0.025 * len(diffs))], diffs[int(0.975 * len(diffs))]


def line(label, rows, base=None):
    parts = [f'{label:<34} n={len(rows):>5}']
    for key in ('r5', 'r10', 'r20', 'r60'):
        parts.append(f'{key} {100 * mean(rows, key):+5.2f}%')
    parts.append(f'race {100 * mean(rows, "race"):4.1f}%')
    print('  '.join(parts))
    if base is not None and rows:
        notes = []
        for key in ('r10', 'r20', 'r60', 'race'):
            lo, hi = boot_diff(rows, base, key)
            notes.append(f'{key} diff {100 * (mean(rows, key) - mean(base, key)):+.2f} [{100 * lo:+.2f},{100 * hi:+.2f}]')
        print('      vs placebo: ' + ' | '.join(notes))


print(f'MODE {MODE}  stocks {len({e["ticker"] for e in events})}  events {len(events)}')
print('returns are signed so positive = the level worked (support: price rose; resistance: price fell)')
for side in ('support', 'resistance'):
    zone = [e for e in events if e['group'] == 'zone' and e['side'] == side]
    base = [e for e in events if e['group'] == 'placebo' and e['side'] == side]
    print(f'--- {side}')
    print(f'    mean distance to level at start: zones {100 * mean(zone, "dist"):.2f}%  placebo {100 * mean(base, "dist"):.2f}%')
    line('placebo: same move, random day', base)
    off = [e for e in base if not e['onzone']]
    line('placebo landing off any zone', off)
    line('placebo landing on a zone', [e for e in base if e['onzone']])
    line('all zones', zone, base)
    line('all zones vs off-zone placebo', zone, off)
    line('top-3 zones (what the chart draws)', [e for e in zone if e['top3']], base)
    cut = sorted(e['score'] for e in zone)
    third = cut[2 * len(cut) // 3] if cut else 0
    line('highest-score third', [e for e in zone if e['score'] >= third], base)
    line('5+ touches', [e for e in zone if e['hits'] >= 5], base)
    line('heavy volume node (traded>=0.7)', [e for e in zone if e['traded'] >= 0.7], base)
    line('light volume (traded<0.3)', [e for e in zone if e['traded'] < 0.3], base)
    line('fresh zone (last pivot <60 bars)', [e for e in zone if e['age'] < 60], base)
    line('old zone (last pivot >=250 bars)', [e for e in zone if e['age'] >= 250], base)
    for trend in ('up', 'down'):
        line(f'zones, trend {trend}', [e for e in zone if e['trend'] == trend], [e for e in base if e['trend'] == trend])
        line(f'placebo, trend {trend}', [e for e in base if e['trend'] == trend])
