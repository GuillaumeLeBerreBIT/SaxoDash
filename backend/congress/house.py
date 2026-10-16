import io
import logging
import time
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from functools import cache

import requests
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from . import members
from .members import IndexEntry
from .models import HouseIndexState, Report, Trade
from .parse import parse_report, pdf_text

logger = logging.getLogger(__name__)

INDEX_URL = 'https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip'
PDF_URL = 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{doc_id}.pdf'
USER_AGENT = 'Mozilla/5.0 (SaxoDash personal dashboard)'
PAPER_PREFIXES = ('8', '9')
PERIODIC_TRANSACTION = 'P'
MAX_ATTEMPTS = 3
MISSING_BACKOFF = (timedelta(days=1), timedelta(days=3))
PAUSE_SECONDS = 1.0
TIMEOUT = 30
RETRY = Retry(
    total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504],
    respect_retry_after_header=True,
)


class HouseError(Exception):
    pass


class HouseMissing(HouseError):
    pass


@dataclass
class ParseResult:
    parsed: int = 0
    failed: int = 0
    member_ids: set = field(default_factory=set)
    waiting: int = 0


@cache
def _session():
    session = requests.Session()
    session.mount('https://', HTTPAdapter(max_retries=RETRY))
    return session


def _get(url, headers=None):
    try:
        answer = _session().get(url, headers={'User-Agent': USER_AGENT, **(headers or {})}, timeout=TIMEOUT)
    except requests.RequestException as exc:
        raise HouseError(f'{url}: {exc}') from exc
    if answer.status_code in (200, 304):
        return answer
    if 400 <= answer.status_code < 500:
        raise HouseMissing(f'{url} answered {answer.status_code}')
    raise HouseError(f'{url} answered {answer.status_code}')


def entries(xml_bytes):
    found = []
    for node in ET.fromstring(xml_bytes).iter('Member'):
        if (node.findtext('FilingType') or '').strip() != PERIODIC_TRANSACTION:
            continue
        try:
            found.append(IndexEntry(
                doc_id=node.findtext('DocID').strip(),
                first=(node.findtext('First') or '').strip(),
                last=(node.findtext('Last') or '').strip(),
                state_district=(node.findtext('StateDst') or '').strip(),
                filed_on=datetime.strptime(node.findtext('FilingDate').strip(), '%m/%d/%Y').date(),
                year=int(node.findtext('Year')),
            ))
        except (AttributeError, TypeError, ValueError):
            logger.warning('Skipped a malformed House index row: %s', ET.tostring(node, encoding='unicode')[:200])
    return found


def _conditional(state):
    if state.etag:
        return {'If-None-Match': state.etag}
    if state.last_modified:
        return {'If-Modified-Since': state.last_modified}
    return {}


def sync_index(year, now, directory=None):
    directory = directory or cache(members.Directory.fetch)
    state, _ = HouseIndexState.objects.get_or_create(year=year)
    answer = _get(INDEX_URL.format(year=year), headers=_conditional(state))
    state.checked_at = now
    if answer.status_code == 304:
        state.save(update_fields=['checked_at'])
        return 0
    archive = zipfile.ZipFile(io.BytesIO(answer.content))
    xml = archive.read(f'{year}FD.xml')
    known = set(Report.objects.filter(year=year).values_list('doc_id', flat=True))
    created = 0
    for entry in sorted(entries(xml), key=lambda found: (found.filed_on, found.doc_id)):
        if entry.doc_id in known:
            continue
        member = members.member_for(entry, directory)
        Report.objects.create(
            doc_id=entry.doc_id, member=member, year=year, filed_on=entry.filed_on,
            status=Report.PAPER if entry.doc_id.startswith(PAPER_PREFIXES) else Report.PENDING,
        )
        known.add(entry.doc_id)
        created += 1
    state.etag = answer.headers.get('ETag', '')
    state.last_modified = answer.headers.get('Last-Modified', '')
    state.save()
    logger.info('House %s index: Last-Modified %s, %s new reports', year, state.last_modified, created)
    return created


def _store(report, parsed):
    with transaction.atomic():
        report.trades.all().delete()
        Trade.objects.bulk_create(Trade(report=report, **vars(row)) for row in parsed.rows)
        report.status = Report.PARSED
        report.amended = parsed.amended
        report.unparsed_rows = parsed.unparsed_rows
        report.error = ''
        report.retry_after = None
        report.save()


def _due(now):
    return Report.objects.filter(
        Q(status=Report.PENDING)
        | Q(status=Report.FAILED, attempts__lt=MAX_ATTEMPTS) & (Q(retry_after__isnull=True) | Q(retry_after__lte=now)),
    ).order_by('filed_on', 'doc_id')


def _fail(report, error, now, attempts):
    report.status = Report.FAILED
    report.error = error[:200]
    report.attempts = attempts
    report.retry_after = now + MISSING_BACKOFF[attempts - 1] if attempts < MAX_ATTEMPTS else None
    report.save(update_fields=['status', 'error', 'attempts', 'retry_after'])


def parse_pending(pause=time.sleep, now=None):
    now = now or timezone.now()
    result = ParseResult()
    for report in _due(now):
        try:
            data = _get(PDF_URL.format(year=report.year, doc_id=report.doc_id)).content
        except HouseMissing as exc:
            logger.warning('House report %s is missing: %s', report.doc_id, exc)
            _fail(report, str(exc), now, report.attempts + 1)
            result.failed += 1
            pause(PAUSE_SECONDS)
            continue
        except HouseError:
            logger.warning('House host unreachable while fetching %s; stopping this run', report.doc_id, exc_info=True)
            result.waiting = _due(now).count()
            break
        report.attempts += 1
        try:
            _store(report, parse_report(pdf_text(data)))
            result.parsed += 1
            result.member_ids.add(report.member_id)
        except Exception as exc:
            logger.warning('Could not parse House report %s', report.doc_id, exc_info=True)
            _fail(report, str(exc), now, MAX_ATTEMPTS)
            result.failed += 1
        pause(PAUSE_SECONDS)
    return result
