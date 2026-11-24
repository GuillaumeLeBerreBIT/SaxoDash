NEW = 'new'
ADDED = 'added'
TRIMMED = 'trimmed'
UNCHANGED = 'unchanged'
SOLD_OUT = 'sold_out'
THRESHOLD_PCT = 1
SPLIT_VALUE_TOLERANCE = 0.2


def _whole_ratio(larger, smaller):
    return smaller > 0 and larger >= 2 * smaller and larger % smaller == 0


def is_split(shares, previous_shares, value, previous_value):
    if not value or not previous_value or not shares or not previous_shares:
        return False
    if not (_whole_ratio(shares, previous_shares) or _whole_ratio(previous_shares, shares)):
        return False
    return abs(value / previous_value - 1) <= SPLIT_VALUE_TOLERANCE


def position_change(shares, previous_shares, value=None, previous_value=None):
    if previous_shares is None:
        return NEW, None
    if previous_shares == 0:
        return (ADDED, None) if shares > 0 else (UNCHANGED, None)
    if is_split(shares, previous_shares, value, previous_value):
        return UNCHANGED, 0.0
    pct = round((shares - previous_shares) / previous_shares * 100, 2)
    if (shares - previous_shares) * 100 >= previous_shares * THRESHOLD_PCT:
        return ADDED, pct
    if (previous_shares - shares) * 100 >= previous_shares * THRESHOLD_PCT:
        return TRIMMED, pct
    return UNCHANGED, pct


def _row_change(row, before):
    if before is None:
        return position_change(row['shares'], None)
    return position_change(row['shares'], before['shares'], row['value'], before['value'])


def compare(current, previous):
    if previous is None:
        return {key: None for key in current}, []
    per_key = {key: _row_change(row, previous.get(key)) for key, row in current.items()}
    sold_out = [key for key in previous if key not in current]
    return per_key, sold_out


def turnover(current_values, previous_values, new_keys, sold_out_keys):
    if previous_values is None:
        return None
    combined = sum(current_values.values()) + sum(previous_values.values())
    if not combined:
        return None
    replaced = sum(current_values[key] for key in new_keys) + sum(previous_values[key] for key in sold_out_keys)
    return round(replaced / combined * 100, 2)
