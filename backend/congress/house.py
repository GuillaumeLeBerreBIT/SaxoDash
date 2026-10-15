import io
import logging
import time
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from functools import cache

import requests
from django.db import transaction
from django.db.models import Q

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
PAUSE_SECONDS = 1.0
TIMEOUT = 30


class HouseError(Exception):
    pass


@dataclass
class ParseResult:
    parsed: int = 0
    failed: int = 0
    member_ids: set = field(default_factory=set)


def _get(url, headers=None):
    try:
        answer = requests.get(url, headers={'User-Agent': USER_AGENT, **(headers or {})}, timeout=TIMEOUT)
    except requests.RequestException as exc:
        raise HouseError(f'{url}: {exc}') from exc
    if answer.status_code not in (200, 304):
        raise HouseError(f'{url} answered {answer.status_code}')
    return answer


def entries(xml_bytes):
    found = []
    for node in ET.fromstring(xml_bytes).iter('Member'):
        if (node.findtext('FilingType') or '').strip() != PERIODIC_TRANSACTION:
            continue
        found.append(IndexEntry(
            doc_id=node.findtext('DocID').strip(),
            first=(node.findtext('First') or '').strip(),
            last=(node.findtext('Last') or '').strip(),
            state_district=(node.findtext('StateDst') or '').strip(),
            filed_on=datetime.strptime(node.findtext('FilingDate').strip(), '%m/%d/%Y').date(),
            year=int(node.findtext('Year')),
        ))
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
        report.save()


def parse_pending(pause=time.sleep):
    result = ParseResult()
    due = Report.objects.filter(
        Q(status=Report.PENDING) | Q(status=Report.FAILED, attempts__lt=MAX_ATTEMPTS),
    ).order_by('filed_on', 'doc_id')
    for report in due:
        report.attempts += 1
        try:
            data = _get(PDF_URL.format(year=report.year, doc_id=report.doc_id)).content
            _store(report, parse_report(pdf_text(data)))
            result.parsed += 1
            result.member_ids.add(report.member_id)
        except Exception as exc:
            logger.warning('Could not parse House report %s', report.doc_id, exc_info=True)
            report.status = Report.FAILED
            report.error = str(exc)[:200]
            report.save(update_fields=['status', 'error', 'attempts'])
            result.failed += 1
        pause(PAUSE_SECONDS)
    return result
