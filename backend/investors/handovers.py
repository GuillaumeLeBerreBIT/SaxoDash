import csv
from collections import Counter, defaultdict
from pathlib import Path

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import PositionMove, Security

ALIASES_CSV = Path(__file__).resolve().parent / 'cusip_aliases.csv'
MIN_FUNDS = 2
WITHDRAWN = {'ticker': None, 'name': '', 'security_type': '', 'resolved_at': None, 'inherited_via': ''}


def load_aliases(path=ALIASES_CSV):
    with open(path, newline='') as handle:
        return {
            row['cusip'].strip(): {'ticker': row['ticker'].strip(), 'name': row['name'].strip()}
            for row in csv.DictReader(handle)
        }


def _only_once(positions):
    counts = Counter(shares for shares, _ in positions)
    return {shares: cusip for shares, cusip in positions if shares and counts[shares] == 1}


def _stock_positions():
    held = defaultdict(lambda: defaultdict(dict))
    rows = PositionMove.objects.filter(put_call='', shares__gt=0).values_list(
        'investor_id', 'quarter_end', 'cusip', 'shares',
    )
    for investor_id, quarter_end, cusip, shares in rows:
        held[investor_id][quarter_end][cusip] = shares
    return held


def _backers():
    backers = defaultdict(lambda: defaultdict(set))
    for investor_id, by_quarter in _stock_positions().items():
        ordered = [by_quarter[quarter_end] for quarter_end in sorted(by_quarter)]
        for before, after in zip(ordered, ordered[1:]):
            left = _only_once([(shares, cusip) for cusip, shares in before.items() if cusip not in after])
            arrived = _only_once([(shares, cusip) for cusip, shares in after.items() if cusip not in before])
            for shares, cusip in left.items():
                if shares in arrived:
                    backers[cusip][arrived[shares]].add(investor_id)
    return backers


def successors():
    chosen = {}
    for cusip, candidates in _backers().items():
        ranked = sorted(candidates.items(), key=lambda candidate: len(candidate[1]), reverse=True)
        successor, funds = ranked[0]
        contested = len(ranked) > 1 and len(ranked[1][1]) == len(funds)
        if len(funds) >= MIN_FUNDS and not contested:
            chosen[cusip] = successor
    return chosen


def _nearest_looked_up(cusip, links, looked_up):
    seen = {cusip}
    while cusip in links:
        cusip = links[cusip]
        if cusip in looked_up:
            return looked_up[cusip]
        if cusip in seen:
            return None
        seen.add(cusip)
    return None


def _inheritances(aliases):
    looked_up = {
        security['cusip']: {key: security[key] for key in ('ticker', 'name', 'security_type')}
        for security in Security.objects.filter(ticker__isnull=False, inherited_via='').values(
            'cusip', 'ticker', 'name', 'security_type',
        )
    }
    links = successors()
    wanted = {}
    for cusip in links:
        source = _nearest_looked_up(cusip, links, looked_up)
        if source is not None:
            wanted[cusip] = {**source, 'inherited_via': Security.HANDOVER}
    for cusip, alias in aliases.items():
        wanted[cusip] = {**alias, 'security_type': '', 'inherited_via': Security.ALIAS}
    return wanted


@transaction.atomic
def apply(aliases=None):
    wanted = _inheritances(load_aliases() if aliases is None else aliases)
    Security.objects.exclude(inherited_via='').exclude(cusip__in=wanted).update(**WITHDRAWN)
    now = timezone.now()
    inherited = 0
    open_to_inherit = Security.objects.filter(Q(ticker__isnull=True) | ~Q(inherited_via=''), cusip__in=wanted)
    for security in open_to_inherit:
        fields = wanted[security.cusip]
        if any(getattr(security, name) != value for name, value in fields.items()):
            Security.objects.filter(pk=security.pk).update(resolved_at=now, **fields)
        inherited += 1
    return inherited
