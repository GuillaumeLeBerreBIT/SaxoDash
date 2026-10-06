NEW = 'new'
ADDED = 'added'
TRIMMED = 'trimmed'
UNCHANGED = 'unchanged'
SOLD_OUT = 'sold_out'
THRESHOLD_PCT = 1


def position_change(shares, previous_shares):
    if previous_shares is None:
        return NEW, None
    if previous_shares == 0:
        return (ADDED, None) if shares > 0 else (UNCHANGED, None)
    pct = round((shares - previous_shares) / previous_shares * 100, 2)
    if (shares - previous_shares) * 100 >= previous_shares * THRESHOLD_PCT:
        return ADDED, pct
    if (previous_shares - shares) * 100 >= previous_shares * THRESHOLD_PCT:
        return TRIMMED, pct
    return UNCHANGED, pct


def compare(current, previous):
    if previous is None:
        return {key: None for key in current}, []
    per_key = {key: position_change(shares, previous.get(key)) for key, shares in current.items()}
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
