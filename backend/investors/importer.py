import logging
from dataclasses import dataclass, field
from datetime import date, timedelta

from django.db import IntegrityError, transaction
from django.db.models import F, Max
from django.utils import timezone

from . import edgar, figi, moves, parse
from .models import Filing, Holding, Investor, Security

logger = logging.getLogger(__name__)

HISTORY_YEARS = 5


@dataclass
class SyncResult:
    imported: int = 0
    skipped: list = field(default_factory=list)


def history_start(today=None):
    return (today or date.today()) - timedelta(days=365 * HISTORY_YEARS + 1)


def _import_filing(investor, entry):
    primary, table = edgar.filing_documents(investor.cik, entry['accession'])
    amendment_type = parse.parse_amendment_type(primary) if entry['form'] == '13F-HR/A' else Filing.ORIGINAL
    rows = parse.aggregate(parse.parse_information_table(table, entry['filed_on']))
    try:
        with transaction.atomic():
            filing = Filing.objects.create(
                investor=investor,
                quarter_end=entry['quarter_end'],
                filed_on=entry['filed_on'],
                accession=entry['accession'],
                form=entry['form'],
                amendment_type=amendment_type,
                total_value=sum(row['value'] for row in rows),
                positions=len(rows),
            )
            Holding.objects.bulk_create(Holding(filing=filing, **row) for row in rows)
            Security.objects.bulk_create(
                [Security(cusip=cusip) for cusip in {row['cusip'] for row in rows}], ignore_conflicts=True,
            )
    except IntegrityError:
        return False
    return True


def _set_expected(investor, quarters):
    Investor.objects.filter(pk=investor.pk).update(quarters_expected=quarters)
    investor.quarters_expected = quarters


def _moves_are_behind(investor):
    newest_filing = investor.filings.aggregate(latest=Max('quarter_end'))['latest']
    newest_move = investor.moves.aggregate(latest=Max('quarter_end'))['latest']
    return newest_filing != newest_move


def sync_investor(investor, since, *, track_progress=False, resolve=True):
    entries = edgar.filings(investor.cik, since)
    stored = set(
        Filing.objects.filter(accession__in=[e['accession'] for e in entries]).values_list('accession', flat=True)
    )
    result = SyncResult()
    if track_progress:
        _set_expected(investor, len({e['quarter_end'] for e in entries}))
    try:
        try:
            for entry in entries:
                if entry['accession'] in stored:
                    continue
                try:
                    stored_now = _import_filing(investor, entry)
                except (parse.FilingUnreadable, edgar.FilingIncomplete) as exc:
                    logger.warning('Skipping %s filing %s: %s', investor.slug, entry['accession'], exc)
                    result.skipped.append(entry['accession'])
                    continue
                if stored_now:
                    result.imported += 1
        finally:
            Investor.objects.filter(pk=investor.pk).update(
                last_checked_at=timezone.now(),
                last_filing_at=investor.filings.aggregate(latest=Max('filed_on'))['latest'],
            )
            if result.imported or _moves_are_behind(investor):
                moves.rebuild(investor)
        if resolve:
            resolve_securities()
    finally:
        if investor.quarters_expected is not None:
            _set_expected(investor, None)
    return result


def backfill(investor, today=None, resolve=True):
    return sync_investor(investor, history_start(today), track_progress=True, resolve=resolve)


def _store_batch(batch):
    hits = 0
    now = timezone.now()
    with transaction.atomic():
        for cusip, shaped in batch.items():
            pending = Security.objects.filter(pk=cusip)
            if shaped is None:
                pending.update(attempts=F('attempts') + 1)
                continue
            pending.update(attempts=F('attempts') + 1, resolved_at=now, **shaped)
            hits += 1
    return hits


def resolve_securities():
    pending = list(
        Security.objects.filter(ticker__isnull=True, attempts__lt=Security.MAX_ATTEMPTS)
        .order_by('cusip').values_list('cusip', flat=True)
    )
    hits = 0
    try:
        for batch in figi.resolve(pending):
            hits += _store_batch(batch)
    except figi.FigiError as exc:
        logger.warning('OpenFIGI stopped resolving: %s', exc)
    return hits


def progress(investor):
    if investor.quarters_expected is None:
        return None
    cusips = Holding.objects.filter(filing__investor=investor).values('cusip').distinct()
    return {
        'quarters_imported': investor.filings.values('quarter_end').distinct().count(),
        'quarters_expected': investor.quarters_expected,
        'cusips_resolved': Security.objects.filter(cusip__in=cusips, ticker__isnull=False).count(),
        'cusips_seen': cusips.count(),
    }
