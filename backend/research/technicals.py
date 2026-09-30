RSI_PERIOD = 14
RVOL_WINDOW = 20
YEAR_SESSIONS = 252
SPARKLINE_LENGTH = 63
CHANGE_SESSIONS = {'change_1d': 1, 'change_1m': 21, 'change_3m': 63, 'change_1y': 252}


def sma(values, period):
    out = [None] * len(values)
    total = 0.0
    for i, value in enumerate(values):
        total += value
        if i >= period:
            total -= values[i - period]
        if i >= period - 1:
            out[i] = total / period
    return out


def rsi(values, period=RSI_PERIOD):
    out = [None] * len(values)
    gain = 0.0
    loss = 0.0
    for i in range(1, len(values)):
        change = values[i] - values[i - 1]
        up = max(0.0, change)
        down = max(0.0, -change)
        if i <= period:
            gain += up / period
            loss += down / period
            if i == period:
                out[i] = 100 - 100 / (1 + gain / (loss or 1e-9))
        else:
            gain = (gain * (period - 1) + up) / period
            loss = (loss * (period - 1) + down) / period
            out[i] = 100 - 100 / (1 + gain / (loss or 1e-9))
    return out


def relative_volume(bars, window=RVOL_WINDOW):
    min_samples = -(-window * 3 // 4)
    out = []
    for i, bar in enumerate(bars):
        volume = bar.get('volume') or 0
        if not volume > 0:
            out.append(None)
            continue
        prior = [b['volume'] for b in bars[max(0, i - window):i] if (b.get('volume') or 0) > 0]
        if len(prior) < min_samples:
            out.append(None)
            continue
        out.append(volume / (sum(prior) / len(prior)))
    return out


def _last(series):
    return series[-1] if series else None


def _pct(numerator, denominator):
    if numerator is None or not denominator:
        return None
    return (numerator / denominator - 1) * 100


def technical_fields(bars):
    closes = [bar['close'] for bar in bars]
    last_close = closes[-1] if closes else None
    ma50 = _last(sma(closes, 50))
    ma200 = _last(sma(closes, 200))
    year = bars[-YEAR_SESSIONS:]
    high = max((bar['high'] for bar in year), default=None)

    fields = {
        'last_close': last_close,
        'ma50': ma50,
        'ma200': ma200,
        'pct_vs_ma200': _pct(last_close, ma200),
        'rsi14': _last(rsi(closes)),
        'pct_from_52w_high': _pct(last_close, high),
        'rvol': _last(relative_volume(bars)),
        'sparkline': closes[-SPARKLINE_LENGTH:],
    }
    for name, sessions in CHANGE_SESSIONS.items():
        fields[name] = _pct(last_close, closes[-1 - sessions]) if len(closes) > sessions else None
    return fields
