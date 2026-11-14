WEIGHT_CAP_PCT = 15

QUALITY_AND_CHEAP = 'Quality passes and the price is in its cheap range'


def _result(action, reason):
    return {'action': action, 'reason': reason}


def _held(quality_grade, valuation_grade, weight_pct, failed_labels):
    over_cap = weight_pct > WEIGHT_CAP_PCT
    if quality_grade == 'weak':
        return _result('sell_review', 'Story check failed: ' + ', '.join(failed_labels))
    if over_cap and valuation_grade == 'expensive':
        return _result(
            'trim', f'Over your {WEIGHT_CAP_PCT}% cap and expensive against its own history',
        )
    if quality_grade == 'strong' and valuation_grade == 'cheap':
        if over_cap:
            return {
                **_result('hold', f'Still cheap, but its weight is already over your {WEIGHT_CAP_PCT}% cap'),
                'capped': True,
            }
        return _result('add', QUALITY_AND_CHEAP)
    reason = 'Nothing in your plan says to act'
    if over_cap:
        reason += f'. Over your {WEIGHT_CAP_PCT}% cap.'
    return _result('hold', reason)


def _not_held(quality_grade, valuation_grade, failed_labels):
    if quality_grade != 'strong':
        return _result('not_a_fit', 'Failed: ' + ', '.join(failed_labels))
    if valuation_grade == 'cheap':
        return _result('buy', QUALITY_AND_CHEAP)
    return _result('wait', 'Quality passes; price is not in its cheap range')


def action(quality_grade, valuation_grade, weight_pct, failed_labels):
    if quality_grade == 'unknown':
        return _result('no_verdict', 'Not enough figures to judge the quality')
    if weight_pct is None:
        return _not_held(quality_grade, valuation_grade, failed_labels)
    return _held(quality_grade, valuation_grade, weight_pct, failed_labels)
