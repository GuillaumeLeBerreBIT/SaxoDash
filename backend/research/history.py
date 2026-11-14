TARGET_BARS = 5900
ADJUSTMENT_TOLERANCE = 0.005
DATE, CLOSE = 0, 4


def agrees(stored, fresh):
    if not stored or not fresh:
        return True
    fresh_close = {bar[DATE]: bar[CLOSE] for bar in fresh}
    shared = [(bar[CLOSE], fresh_close[bar[DATE]]) for bar in stored if bar[DATE] in fresh_close]
    if not shared:
        return False
    return all(abs(old - new) <= ADJUSTMENT_TOLERANCE * abs(new) for old, new in shared)


def merged(stored, fresh):
    if not agrees(stored, fresh):
        return list(fresh), False
    by_date = {bar[DATE]: bar for bar in stored}
    by_date.update({bar[DATE]: bar for bar in fresh})
    return [by_date[day] for day in sorted(by_date)], True


def with_older(bars, page):
    if not bars:
        return list(page), bool(page)
    oldest = bars[0][DATE]
    older = [bar for bar in page if bar[DATE] < oldest]
    return [*older, *bars], bool(older)
