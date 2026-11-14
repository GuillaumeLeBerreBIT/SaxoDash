import json
import random
from collections import defaultdict

TMP = 'data/'
HORIZONS = (5, 20, 60)
random.seed(3)
bars_by = {k: v for k, v in json.load(open(TMP + 'bars.json')).items() if len(v) >= 1100}


def sma(values, n, i):
    return sum(values[i - n + 1:i + 1]) / n


def rsi(C, n, i):
    gains = losses = 0.0
    for k in range(i - n + 1, i + 1):
        change = C[k] - C[k - 1]
        gains += max(change, 0)
        losses += max(-change, 0)
    return 100.0 if losses == 0 else 100 - 100 / (1 + gains / losses)


def ema_series(values, n):
    alpha = 2 / (n + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(out[-1] + alpha * (v - out[-1]))
    return out


observations = []
for ticker, bars in bars_by.items():
    D = [b[0] for b in bars]; O = [b[1] for b in bars]; H = [b[2] for b in bars]
    L = [b[3] for b in bars]; C = [b[4] for b in bars]; V = [b[5] for b in bars]
    n = len(bars)
    e12, e26 = ema_series(C, 12), ema_series(C, 26)
    macd = [a - b for a, b in zip(e12, e26)]
    signal = ema_series(macd, 9)
    for i in range(260, n - 60):
        s200, s50 = sma(C, 200, i), sma(C, 50, i)
        s200p, s50p = sma(C, 200, i - 5), sma(C, 50, i - 5)
        high252 = max(H[i - 251:i + 1]); prior_high = max(H[i - 252:i])
        mean20 = sma(C, 20, i)
        sd20 = (sum((c - mean20) ** 2 for c in C[i - 19:i + 1]) / 20) ** 0.5
        width = 4 * sd20 / mean20
        vol20 = sum(V[i - 20:i]) / 20 or 1
        body = abs(C[i] - O[i]); span = (H[i] - L[i]) or 1e-9
        down3 = C[i - 1] < C[i - 2] < C[i - 3]
        up3 = C[i - 1] > C[i - 2] > C[i - 3]
        flags = {
            'above 200-day average': C[i] > s200,
            'below 200-day average': C[i] <= s200,
            'within 5% of 1-year high': C[i] >= 0.95 * high252,
            'more than 20% below 1-year high': C[i] < 0.8 * high252,
            'new 1-year high today (breakout)': C[i] > prior_high,
            'golden cross in last 5 days': s50 > s200 and s50p <= s200p,
            'death cross in last 5 days': s50 < s200 and s50p >= s200p,
            'pullback in uptrend (RSI2<10, above 200d)': C[i] > s200 and rsi(C, 2, i) < 10,
            'oversold RSI14<30': rsi(C, 14, i) < 30,
            'overbought RSI14>70': rsi(C, 14, i) > 70,
            'MACD bullish cross today': macd[i] > signal[i] and macd[i - 1] <= signal[i - 1],
            'bullish engulfing after 3 down days': down3 and C[i - 1] < O[i - 1] and C[i] > O[i] and C[i] >= O[i - 1] and O[i] <= C[i - 1],
            'bearish engulfing after 3 up days': up3 and C[i - 1] > O[i - 1] and C[i] < O[i] and C[i] <= O[i - 1] and O[i] >= C[i - 1],
            'hammer after 3 down days': down3 and (min(O[i], C[i]) - L[i]) >= 2 * body and (H[i] - max(O[i], C[i])) <= 0.3 * span and body > 0,
            'squeeze breakout (tight bands, close above upper)': width < 0.06 and C[i] > mean20 + 2 * sd20,
            'gap up >4% on 2x volume (news/earnings)': O[i] > 1.04 * C[i - 1] and V[i] > 2 * vol20 and C[i] > O[i] * 0.98,
            'gap down >4% on 2x volume (news/earnings)': O[i] < 0.96 * C[i - 1] and V[i] > 2 * vol20,
            'up day on 2x volume': C[i] > C[i - 1] * 1.02 and V[i] > 2 * vol20,
        }
        observations.append({
            'ticker': ticker, 'date': D[i], 'mom': C[i - 21] / C[i - 252] - 1, 'flags': flags,
            **{f'f{h}': C[i + h] / C[i] - 1 for h in HORIZONS},
        })

by_date = defaultdict(list)
for row in observations:
    by_date[row['date']].append(row)
for group in by_date.values():
    ranked = sorted(group, key=lambda r: r['mom'])
    q = len(ranked) // 4
    for position, row in enumerate(ranked):
        row['flags']['12-1 momentum: top quarter'] = position >= len(ranked) - q
        row['flags']['12-1 momentum: bottom quarter'] = position < q
    for h in HORIZONS:
        average = sum(r[f'f{h}'] for r in group) / len(group)
        for row in group:
            row[f'x{h}'] = row[f'f{h}'] - average

names = list(observations[0]['flags'])
tickers = sorted(bars_by)
print(f'stocks {len(tickers)}  stock-days {len(observations)}  period {min(by_date)} to {max(by_date)}')
print('excess = forward return minus the average of all sampled stocks over the same days; CI = 95% bootstrap over stocks')
print(f'{"signal":<52}{"n":>7}  {"5d":>7} {"20d":>7} {"60d":>7}   20d CI            60d CI')
for name in names:
    sums = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    for row in observations:
        if row['flags'][name]:
            s = sums[row['ticker']]
            s[0] += row['x5']; s[1] += row['x20']; s[2] += row['x60']; s[3] += 1
    total = sum(s[3] for s in sums.values())
    if not total:
        continue
    means = [sum(s[k] for s in sums.values()) / total for k in range(3)]
    intervals = []
    for k in (1, 2):
        draws = []
        for _ in range(600):
            pick = random.choices(tickers, k=len(tickers))
            count = sum(sums[t][3] for t in pick)
            if count:
                draws.append(sum(sums[t][k] for t in pick) / count)
        draws.sort()
        intervals.append(f'[{100 * draws[int(0.025 * len(draws))]:+.2f},{100 * draws[int(0.975 * len(draws))]:+.2f}]')
    print(f'{name:<52}{total:>7}  {100 * means[0]:+6.2f}% {100 * means[1]:+6.2f}% {100 * means[2]:+6.2f}%   {intervals[0]:<17} {intervals[1]}')
