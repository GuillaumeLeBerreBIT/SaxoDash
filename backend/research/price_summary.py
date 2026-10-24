from .technicals import rsi, sma

YEAR_SESSIONS = 252
CHANGE_SESSIONS = {'change_1m_pct': 21, 'change_3m_pct': 63, 'change_1y_pct': 252}
STRETCH_MA50_RATIO = 1.15
STRETCH_RSI = 75
STRETCH_PFCF_RATIO = 1.5


def zone(*, last_close, ma20, ma50, ma200, rsi14, pfcf=None, pfcf_median=None):
    if last_close is None or ma50 is None or ma200 is None:
        return None
    if (
        last_close >= STRETCH_MA50_RATIO * ma50
        or (rsi14 is not None and rsi14 >= STRETCH_RSI)
        or (pfcf and pfcf_median and pfcf >= STRETCH_PFCF_RATIO * pfcf_median)
    ):
        return 'stretched'
    if ma20 is not None and last_close > ma20 > ma50 > ma200:
        return 'trend'
    if ma50 > ma200 and ma200 <= last_close <= ma50:
        return 'pullback'
    if last_close < ma200:
        return 'below_200'
    return 'unclassified'


def _last(series):
    return series[-1] if series else None


def _change_pct(closes, sessions):
    if len(closes) <= sessions or not closes[-1 - sessions]:
        return None
    return round((closes[-1] / closes[-1 - sessions] - 1) * 100, 2)


def summarise(candles):
    closes = [c['close'] for c in candles]
    last_close = _last(closes)
    ma20, ma50, ma200 = (_last(sma(closes, period)) for period in (20, 50, 200))
    rsi14 = _last(rsi(closes))
    year = candles[-YEAR_SESSIONS:]
    high_52w = max((c['high'] for c in year), default=None)
    low_52w = min((c['low'] for c in year), default=None)
    summary = {
        'last_close': last_close,
        'ma20': ma20,
        'ma50': ma50,
        'ma200': ma200,
        'rsi14': rsi14,
        'high_52w': high_52w,
        'low_52w': low_52w,
        'pct_from_52w_high': round((last_close / high_52w - 1) * 100, 2) if last_close is not None and high_52w else None,
        **{key: _change_pct(closes, sessions) for key, sessions in CHANGE_SESSIONS.items()},
    }
    return {
        'summary': summary,
        'zone': zone(last_close=last_close, ma20=ma20, ma50=ma50, ma200=ma200, rsi14=rsi14),
    }
