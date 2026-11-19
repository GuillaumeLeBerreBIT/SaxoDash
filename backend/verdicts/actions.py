WEIGHT_CAP_PCT = 15


def _result(action, reason):
    return {'action': action, 'reason': reason}


def _held(quality_grade, weight_pct, failed_labels):
    if quality_grade == 'weak':
        return _result('sell_review', 'Story check failed: ' + ', '.join(failed_labels))
    if weight_pct > WEIGHT_CAP_PCT:
        return _result('trim', f'Over your {WEIGHT_CAP_PCT}% cap')
    if quality_grade == 'strong':
        return _result('add', f'Quality passes and it is under your {WEIGHT_CAP_PCT}% cap')
    return _result('hold', 'Nothing in your plan says to act')


def _not_held(quality_grade, failed_labels):
    if quality_grade != 'strong':
        return _result('not_a_fit', 'Failed: ' + ', '.join(failed_labels))
    return _result('buy', 'Quality passes')


def action(quality_grade, weight_pct, failed_labels):
    if quality_grade == 'unknown':
        return _result('no_verdict', 'Not enough figures to judge the quality')
    if weight_pct is None:
        return _not_held(quality_grade, failed_labels)
    return _held(quality_grade, weight_pct, failed_labels)
