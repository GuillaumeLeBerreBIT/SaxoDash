from django.db.models import Max

from investors.copying import edge

from . import performance
from .models import CopyPerformance, Holding, Report, Trade

TOP_HOLDINGS = 5


def trade_row(trade):
    return {
        'amended': trade.report.amended, 'asset': trade.asset, 'ticker': trade.ticker, 'asset_type': trade.asset_type, 'owner': trade.owner,
        'kind': trade.kind, 'option': trade.option, 'exercise': trade.exercise,
        'traded_on': trade.traded_on.isoformat(), 'filed_on': trade.report.filed_on.isoformat(),
        'amount_low': trade.amount_low, 'amount_high': trade.amount_high, 'priceable': trade.priceable,
    }


def identity(member):
    return {'slug': member.slug, 'name': member.name, 'party': member.party, 'state_district': member.state_district}


def _edges(member_ids):
    rows = CopyPerformance.objects.filter(member_id__in=member_ids).values_list(
        'member_id', 'clone_cagr_pct', 'benchmark_cagr_pct',
    )
    return {member_id: edge(ours, market) for member_id, ours, market in rows}


def _top_holdings(member_ids):
    top = {}
    for member_id, ticker, weight_pct in Holding.objects.filter(member_id__in=member_ids).order_by(
        'member_id', '-weight_pct', 'ticker',
    ).values_list('member_id', 'ticker', 'weight_pct'):
        held = top.setdefault(member_id, [])
        if len(held) < TOP_HOLDINGS:
            held.append({'ticker': ticker, 'weight_pct': weight_pct})
    return top


def cards(members):
    ids = [member.pk for member in members]
    last_filed = dict(
        Report.objects.filter(member_id__in=ids).values('member').annotate(last=Max('filed_on')).values_list('member', 'last')
    )
    edges = _edges(ids)
    top = _top_holdings(ids)
    return [
        card(member, member.basis.get('trades', 0), last_filed.get(member.pk), edges.get(member.pk), top.get(member.pk, []))
        for member in members
    ]


def card(member, trades, last_filed, excess_cagr_pct, top_holdings):
    return {
        **identity(member),
        'photo_url': member.photo_url,
        'trades': trades,
        'last_filed': last_filed.isoformat() if last_filed else None,
        'excess_cagr_pct': excess_cagr_pct,
        'top_holdings': top_holdings,
    }


def profile(member):
    trades = Trade.objects.filter(report__member=member, report__status=Report.PARSED).select_related('report').order_by('-report__filed_on', '-traded_on')
    summary = cards([member])[0]
    return {
        **summary,
        'basis': member.basis,
        'holdings': [
            {'ticker': held.ticker, 'value': held.value, 'weight_pct': held.weight_pct} for held in member.holdings.all()
        ],
        'trades': [trade_row(trade) for trade in trades],
        'copy': performance.payload(member),
    }
