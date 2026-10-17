SAME_DAY_SESSIONS = frozenset({'bmo', 'dmh'})


def _pct(after, before):
    if after is None or not before:
        return None
    return round((after - before) / before * 100, 2)


def move(report_date, session, closes):
    previous = next((close for day, close in reversed(closes) if day < report_date), None)
    same_day = next((close for day, close in closes if day == report_date), None)
    following = next((close for day, close in closes if day > report_date), None)

    if session in SAME_DAY_SESSIONS:
        pct, basis = _pct(same_day, previous), '1d'
    elif session == 'amc':
        pct, basis = _pct(following, same_day), '1d'
    else:
        pct, basis = _pct(following, previous), '2d'
    return (pct, basis) if pct is not None else (None, None)
