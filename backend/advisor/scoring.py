from collections import defaultdict
from datetime import timedelta

CHECKPOINTS = {'3m': 91, '6m': 182, '12m': 365}
DIRECTION = {'buy_new': 1, 'add': 1, 'hold': 1, 'watch': 1, 'trim': -1, 'sell': -1}
STALE_AFTER = timedelta(days=7)


def _pct(end, start):
    return (end / start - 1) * 100


def _unscored():
    return {'entry_day': None, 'checkpoints': {name: None for name in CHECKPOINTS}, 'latest': None}


def _entry_day(rec, series, benchmark):
    recorded = rec.recorded_at.date()
    first = benchmark.after(recorded)
    if first is None:
        return None
    if rec.action != 'watch':
        own = series.after(recorded)
        return None if own is None else max(own, first)
    ceiling = (rec.buy_range or {}).get('high')
    if ceiling is None:
        return None
    for day, close in zip(series.days, series.closes):
        if day > recorded and day >= first and close <= ceiling:
            return day
    return None


def _measure(rec, series, benchmark, entry_day, day, require_fresh):
    session = series.day_at(day)
    if session is None or session <= entry_day:
        return None
    if require_fresh and day - session > STALE_AFTER:
        return None
    start, bench_start = series.at(entry_day), benchmark.at(entry_day)
    bench_end = benchmark.at(day)
    if not start or not bench_start or bench_end is None:
        return None
    ours = round(_pct(series.at(day), start), 2)
    market = round(_pct(bench_end, bench_start), 2)
    return {
        'day': session,
        'return_pct': ours,
        'benchmark_pct': market,
        'excess_pct': round(DIRECTION[rec.action] * (ours - market), 2),
    }


def score(rec, prices, benchmark, today):
    series = prices.get(rec.ticker)
    if rec.action not in DIRECTION or not series or not benchmark:
        return _unscored()
    entry_day = _entry_day(rec, series, benchmark)
    if entry_day is None:
        return _unscored()
    end = min(today, rec.closed_at.date()) if rec.closed_at else today
    checkpoints = {}
    for name, days in CHECKPOINTS.items():
        day = entry_day + timedelta(days=days)
        checkpoints[name] = _measure(rec, series, benchmark, entry_day, day, True) if day <= end else None
    return {
        'entry_day': entry_day,
        'checkpoints': checkpoints,
        'latest': _measure(rec, series, benchmark, entry_day, end, False),
    }


def _means(rows):
    result = {}
    for name in CHECKPOINTS:
        values = [
            row['score']['checkpoints'][name]['excess_pct']
            for row in rows
            if row['score']['checkpoints'][name] is not None
        ]
        result[name] = {
            'mean_excess_pct': round(sum(values) / len(values), 2) if values else None,
            'n': len(values),
        }
    return result


def _grouped(rows, key):
    groups = defaultdict(list)
    for row in rows:
        groups[row[key]].append(row)
    return {value: _means(group) for value, group in groups.items()}


def summary(scored):
    rows = [row for row in scored if row['action'] in DIRECTION]
    return {
        'overall': _means(rows),
        'by_conviction': _grouped(rows, 'conviction'),
        'by_action': _grouped(rows, 'action'),
        'declined': _means([row for row in rows if row['decision'] == 'declined']),
    }
