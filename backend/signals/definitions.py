from collections import deque
from dataclasses import dataclass

EVENT, STATE, RANK = 'event', 'state', 'rank'
YEAR = 252
SKIP = 21
VOLUME_WINDOW = 20


@dataclass(frozen=True)
class Signal:
    key: str
    code: str
    label: str
    description: str
    kind: str
    buys_weakness: bool = False


SIGNALS = (
    Signal('momentum_top', 'MO', 'Momentum leader',
           'In the top quarter of stocks by 12-month return, leaving out the latest month.', RANK),
    Signal('news_gap_up', 'GU', 'Gap up on heavy volume',
           'Opened more than 4% above the last close on at least twice the usual volume and held it.', EVENT),
    Signal('news_gap_down', 'GD', 'Gap down on heavy volume',
           'Opened more than 4% below the last close on at least twice the usual volume.', EVENT, buys_weakness=True),
    Signal('volume_thrust', 'VT', 'Volume thrust',
           'Closed more than 2% higher on at least twice the usual volume.', EVENT),
    Signal('new_high', 'NH', 'New 1-year high',
           'Closed above every high of the past year.', EVENT),
    Signal('deep_pullback', 'DP', 'Deep pullback',
           'More than 20% below its highest price of the past year.', STATE, buys_weakness=True),
    Signal('above_ma200', 'A2', 'Above 200-day average',
           'The close is above the average close of the last 200 sessions.', STATE),
    Signal('golden_cross', 'GC', 'Golden cross',
           'The 50-day average moved above the 200-day average within the last five sessions.', EVENT),
    Signal('death_cross', 'DC', 'Death cross',
           'The 50-day average moved below the 200-day average within the last five sessions.', EVENT, buys_weakness=True),
    Signal('rsi_oversold', 'OS', 'RSI oversold',
           'RSI (simple, 14 sessions) is below 30.', STATE, buys_weakness=True),
    Signal('rsi_overbought', 'OB', 'RSI overbought',
           'RSI (simple, 14 sessions) is above 70.', STATE),
    Signal('pullback_in_uptrend', 'PU', 'Pullback in an uptrend',
           'Above the 200-day average with RSI (simple, 2 sessions) below 10.', EVENT, buys_weakness=True),
    Signal('macd_cross_up', 'MC', 'MACD bullish cross',
           'MACD (12, 26) moved above its 9-session signal line.', EVENT),
    Signal('bullish_engulfing', 'BE', 'Bullish engulfing',
           'After three falling closes, an up candle whose body covers the previous down candle.', EVENT, buys_weakness=True),
    Signal('bearish_engulfing', 'SE', 'Bearish engulfing',
           'After three rising closes, a down candle whose body covers the previous up candle.', EVENT),
    Signal('hammer', 'HA', 'Hammer',
           'After three falling closes, a small body with a long lower wick and almost no upper wick.', EVENT, buys_weakness=True),
    Signal('squeeze_breakout', 'SQ', 'Squeeze breakout',
           'Bollinger bands narrower than 6% of the price, and a close above the upper band.', EVENT),
)
BY_KEY = {signal.key: signal for signal in SIGNALS}


def _prefix(values):
    total = [0.0]
    for value in values:
        total.append(total[-1] + value)
    return total


def _average(prefix, count, i):
    if i + 1 < count:
        return None
    return (prefix[i + 1] - prefix[i + 1 - count]) / count


def _rolling_max(values, window):
    out, queue = [], deque()
    for i, value in enumerate(values):
        while queue and values[queue[-1]] <= value:
            queue.pop()
        queue.append(i)
        if queue[0] <= i - window:
            queue.popleft()
        out.append(values[queue[0]] if i + 1 >= window else None)
    return out


def _rsi(closes, count, i):
    if i < count:
        return None
    gains = losses = 0.0
    for k in range(i - count + 1, i + 1):
        change = closes[k] - closes[k - 1]
        gains += max(change, 0)
        losses += max(-change, 0)
    if gains == 0 and losses == 0:
        return 50.0
    return 100.0 if losses == 0 else 100 - 100 / (1 + gains / losses)


def _ema(values, count):
    if not values:
        return []
    alpha = 2 / (count + 1)
    out = [values[0]]
    for value in values[1:]:
        out.append(out[-1] + alpha * (value - out[-1]))
    return out


def momentum(series):
    closes = series.closes
    return [
        closes[i - SKIP] / closes[i - YEAR] - 1 if i >= YEAR and closes[i - YEAR] else None
        for i in range(len(closes))
    ]


def detect(series):
    opens, highs, lows, closes, volumes = series.opens, series.highs, series.lows, series.closes, series.volumes
    count = len(closes)
    flags = {signal.key: [False] * count for signal in SIGNALS if signal.kind != RANK}
    if count == 0:
        return flags
    close_sum, volume_sum = _prefix(closes), _prefix(volumes)
    year_high = _rolling_max(highs, YEAR)
    macd = [fast - slow for fast, slow in zip(_ema(closes, 12), _ema(closes, 26))]
    macd_signal = _ema(macd, 9)

    for i in range(1, count):
        close, open_, high, low = closes[i], opens[i], highs[i], lows[i]
        ma200, ma50 = _average(close_sum, 200, i), _average(close_sum, 50, i)
        if ma200 is not None:
            flags['above_ma200'][i] = close > ma200
            rsi2 = _rsi(closes, 2, i)
            flags['pullback_in_uptrend'][i] = close > ma200 and rsi2 is not None and rsi2 < 10
            ma200_before, ma50_before = _average(close_sum, 200, i - 5), _average(close_sum, 50, i - 5)
            if ma200_before is not None:
                flags['golden_cross'][i] = ma50 > ma200 and ma50_before <= ma200_before
                flags['death_cross'][i] = ma50 < ma200 and ma50_before >= ma200_before
        if year_high[i] is not None:
            flags['deep_pullback'][i] = close < 0.8 * year_high[i]
        if i >= YEAR and year_high[i - 1] is not None:
            flags['new_high'][i] = close > year_high[i - 1]
        rsi14 = _rsi(closes, 14, i)
        if rsi14 is not None:
            flags['rsi_oversold'][i] = rsi14 < 30
            flags['rsi_overbought'][i] = rsi14 > 70
        if i >= 34:
            flags['macd_cross_up'][i] = macd[i] > macd_signal[i] and macd[i - 1] <= macd_signal[i - 1]
        if i >= 3:
            body = abs(close - open_)
            span = (high - low) or 1e-9
            falling = closes[i - 1] < closes[i - 2] < closes[i - 3]
            rising = closes[i - 1] > closes[i - 2] > closes[i - 3]
            flags['bullish_engulfing'][i] = (
                falling and closes[i - 1] < opens[i - 1] and close > open_
                and close >= opens[i - 1] and open_ <= closes[i - 1]
            )
            flags['bearish_engulfing'][i] = (
                rising and closes[i - 1] > opens[i - 1] and close < open_
                and close <= opens[i - 1] and open_ >= closes[i - 1]
            )
            flags['hammer'][i] = (
                falling and body > 0 and (min(open_, close) - low) >= 2 * body
                and (high - max(open_, close)) <= 0.3 * span
            )
        mean20 = _average(close_sum, 20, i)
        if mean20:
            deviation = (sum((value - mean20) ** 2 for value in closes[i - 19:i + 1]) / 20) ** 0.5
            flags['squeeze_breakout'][i] = 4 * deviation / mean20 < 0.06 and close > mean20 + 2 * deviation
        if i >= VOLUME_WINDOW:
            usual = (volume_sum[i] - volume_sum[i - VOLUME_WINDOW]) / VOLUME_WINDOW or 1
            heavy = volumes[i] > 2 * usual
            flags['news_gap_up'][i] = heavy and open_ > 1.04 * closes[i - 1] and close > 0.98 * open_
            flags['news_gap_down'][i] = heavy and open_ < 0.96 * closes[i - 1]
            flags['volume_thrust'][i] = heavy and close > 1.02 * closes[i - 1]
    return flags
