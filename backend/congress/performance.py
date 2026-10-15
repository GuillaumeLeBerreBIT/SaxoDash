from django.db import transaction
from django.db.models import Sum

from investors import copying
from investors.prices import Series

from .models import CopyPerformance, Holding, Member, Report, Trade
from .replay import PUT, TradeRow, dedupe, replay

BACKFILL_SINCE = '2021-01-01'


def rows_for(member):
    trades = Trade.objects.filter(report__member=member, report__status=Report.PARSED).select_related('report')
    return dedupe([
        TradeRow(
            filed_on=trade.report.filed_on, traded_on=trade.traded_on, ticker=trade.ticker, kind=trade.kind,
            option=trade.option, exercise=trade.exercise, amount_low=trade.amount_low, amount_high=trade.amount_high,
            priceable=trade.priceable, amended=trade.report.amended, asset=trade.asset, owner=trade.owner,
            report=trade.report.doc_id,
        )
        for trade in trades
    ])


def _report_counts(member):
    reports = Report.objects.filter(member=member)
    return {
        'paper_reports': reports.filter(status=Report.PAPER).count(),
        'failed_reports': reports.filter(status=Report.FAILED).count(),
        'unparsed_rows': reports.aggregate(total=Sum('unparsed_rows'))['total'] or 0,
    }


def _store_holdings(member, periods):
    Holding.objects.filter(member=member).delete()
    latest = periods[-1].holdings if periods else []
    total = sum(value for _, value in latest)
    Holding.objects.bulk_create(
        Holding(member=member, ticker=ticker, value=value, weight_pct=round(value / total * 100, 2))
        for ticker, value in latest if total
    )


@transaction.atomic
def rebuild(member):
    rows = rows_for(member)
    wanted = {row.ticker for row in rows if row.priceable and row.option != PUT}
    prices = copying.price_series(wanted | {copying.BENCHMARK_TICKER})
    result = replay(rows, prices)
    _store_holdings(member, result.periods)
    member.basis = {**result.basis, **_report_counts(member), 'since': BACKFILL_SINCE}
    member.save(update_fields=['basis'])
    measured = copying.measure(result.periods, prices, prices.get(copying.BENCHMARK_TICKER) or Series([], []))
    if measured is None:
        CopyPerformance.objects.filter(member=member).delete()
        return False
    CopyPerformance.objects.update_or_create(member=member, defaults=measured)
    return True


def rebuild_all():
    return sum(rebuild(member) for member in Member.objects.all())


def wanted_tickers():
    current = set(Holding.objects.values_list('ticker', flat=True))
    ever = set(
        Trade.objects.filter(priceable=True).exclude(option=PUT).exclude(ticker__isnull=True).values_list('ticker', flat=True)
    )
    return current, ever | current


def payload(member):
    method = {'benchmark': copying.BENCHMARK_NAME, 'holdings': None}
    stored = CopyPerformance.objects.filter(member=member).first()
    if stored is None:
        return {'available': False, **method}
    return {
        'available': True,
        **method,
        'since': stored.since.isoformat(),
        'until': stored.until.isoformat(),
        'clone_return_pct': stored.clone_return_pct,
        'benchmark_return_pct': stored.benchmark_return_pct,
        'excess_return_pct': copying.edge(stored.clone_return_pct, stored.benchmark_return_pct),
        'clone_cagr_pct': stored.clone_cagr_pct,
        'benchmark_cagr_pct': stored.benchmark_cagr_pct,
        'excess_cagr_pct': copying.edge(stored.clone_cagr_pct, stored.benchmark_cagr_pct),
        'coverage_pct': stored.coverage_pct,
        'periods': stored.periods,
        'skipped_periods': stored.skipped_periods,
        'series': stored.series,
        'computed_at': stored.computed_at.isoformat(),
    }
