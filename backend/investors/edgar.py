import time
from datetime import date

import requests
from django.conf import settings

from core.http_client import REQUEST_TIMEOUT, request_json

SUBMISSIONS_URL = 'https://data.sec.gov/submissions/CIK{cik:010d}.json'
SUBMISSIONS_PAGE_URL = 'https://data.sec.gov/submissions/{name}'
ARCHIVE_URL = 'https://www.sec.gov/Archives/edgar/data/{cik}/{folder}/{name}'
PRIMARY_DOCUMENT = 'primary_doc.xml'
FORMS = ('13F-HR', '13F-HR/A')
MIN_SPACING = 0.12

_last_request = 0.0


class EdgarError(Exception):
    pass


class EdgarNotConfigured(EdgarError):
    pass


class FilingIncomplete(Exception):
    pass


def _headers():
    if not settings.SEC_USER_AGENT:
        raise EdgarNotConfigured('SEC_USER_AGENT is not set.')
    return {'User-Agent': settings.SEC_USER_AGENT}


def _pace():
    global _last_request
    wait = _last_request + MIN_SPACING - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_request = time.monotonic()


def _json(url):
    headers = _headers()
    _pace()
    return request_json(requests.get, url, url, transient=EdgarError, permanent=EdgarError, headers=headers)


def _document(url):
    headers = _headers()
    _pace()
    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as exc:
        raise EdgarError(f'{url} failed: {exc}') from exc
    if not response.ok:
        raise EdgarError(f'{url} failed: {response.status_code}')
    return response.content


def _entries(block):
    return [dict(zip(block, values)) for values in zip(*block.values())]


def _thirteen_f(entry, since):
    if entry['form'] not in FORMS or not entry.get('reportDate'):
        return None
    quarter_end = date.fromisoformat(entry['reportDate'])
    if quarter_end < since:
        return None
    return {
        'accession': entry['accessionNumber'],
        'form': entry['form'],
        'filed_on': date.fromisoformat(entry['filingDate']),
        'quarter_end': quarter_end,
    }


def _filings(cik, since):
    submissions = _json(SUBMISSIONS_URL.format(cik=cik))['filings']
    blocks = [submissions['recent']]
    for page in submissions.get('files', []):
        if date.fromisoformat(page['filingTo']) >= since:
            blocks.append(_json(SUBMISSIONS_PAGE_URL.format(name=page['name'])))

    found = {}
    for block in blocks:
        for entry in _entries(block):
            filing = _thirteen_f(entry, since)
            if filing:
                found[filing['accession']] = filing
    return sorted(
        found.values(),
        key=lambda f: (-f['quarter_end'].toordinal(), f['filed_on'], f['accession']),
    )


def filings(cik, since):
    try:
        return _filings(cik, since)
    except (KeyError, ValueError, TypeError) as exc:
        raise EdgarError(f'unexpected submissions payload for CIK {cik}: {exc!r}') from exc


def _item_names(index, accession):
    try:
        return [item['name'] for item in index['directory']['item']]
    except (KeyError, TypeError) as exc:
        raise EdgarError(f'unexpected index for {accession}: {exc!r}') from exc


def filing_documents(cik, accession):
    folder = accession.replace('-', '')
    index = _json(ARCHIVE_URL.format(cik=cik, folder=folder, name='index.json'))
    names = _item_names(index, accession)
    xml_names = [name for name in names if name.lower().endswith('.xml')]
    tables = [name for name in xml_names if name.lower() != PRIMARY_DOCUMENT]
    if PRIMARY_DOCUMENT not in [name.lower() for name in xml_names] or not tables:
        raise FilingIncomplete(f'{accession} has no primary document or information table')
    primary = _document(ARCHIVE_URL.format(cik=cik, folder=folder, name=PRIMARY_DOCUMENT))
    table = _document(ARCHIVE_URL.format(cik=cik, folder=folder, name=tables[0]))
    return primary, table
