from django.db.models import Count, Max

from investors.copying import edge

from . import performance
from .models import CopyPerformance, Report, Trade


def trade_row(trade):
    return {
        'asset': trade.asset, 'ticker': trade.ticker, 'asset_type': trade.asset_type, 'owner': trade.owner,
        'kind': trade.kind, 'option': trade.option, 'exercise': trade.exercise,
        'traded_on': trade.traded_on.isoformat(), 'filed_on': trade.report.filed_on.isoformat(),
        'amount_low': trade.amount_low, 'amount_high': trade.amount_high, 'priceable': trade.priceable,
    }


def _edges(member_ids):
    rows = CopyPerformance.objects.filter(member_id__in=member_ids).values_list(
        'member_id', 'clone_cagr_pct', 'benchmark_cagr_pct',
    )
    return {member_id: edge(ours, market) for member_id, ours, market in rows}


def cards(members):
    ids = [member.pk for member in members]
    trade_counts = dict(
        Trade.objects.filter(report__status=Report.PARSED, report__member_id__in=ids)
        .values('report__member').annotate(total=Count('id')).values_list('report__member', 'total')
    )
    last_filed = dict(
        Report.objects.filter(member_id__in=ids).values('member').annotate(last=Max('filed_on')).values_list('member', 'last')
    )
    edges = _edges(ids)
    return [card(member, trade_counts.get(member.pk, 0), last_filed.get(member.pk), edges.get(member.pk)) for member in members]


def card(member, trades, last_filed, excess_cagr_pct):
    return {
        'slug': member.slug,
        'name': f'{member.first_name} {member.last_name}',
        'party': member.party,
        'state_district': member.state_district,
        'photo_url': member.photo_url,
        'trades': trades,
        'last_filed': last_filed.isoformat() if last_filed else None,
        'excess_cagr_pct': excess_cagr_pct,
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
