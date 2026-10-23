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
