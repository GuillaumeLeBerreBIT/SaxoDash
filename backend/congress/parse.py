import io
import re
from dataclasses import dataclass, field
from datetime import datetime

import pypdf

from .amounts import parse_range

_HEADER_END = '$200?\n'
_FOOTER = re.compile(r'^\* For the complete list', re.M)
_PAGE_BREAK = re.compile(r'Filing ID #\d+\n(?:.*\n)*?\$200\?\n')
_COLUMN_HEADER = re.compile(r'^(?i:ID\s+Owner\s+Asset\s+Transaction)\b.*\n(?:.*\n)*?\$200\?\n', re.M)
_STATUS = re.compile(r'^(?i:F(?:iling)?\s+S(?:tatus)?)\s*:\s*(New|Amended|Deleted)\b')
_LABEL = re.compile(
    r'^(?P<key>[A-Z])(?:\s{2,}[A-Z ]*|(?i:escription|omments|ocation|ubholding Of|iling Status)\s*):\s*(?P<text>.*)$'
)
_COLUMN_GAP = re.compile(r'\s{2,}')
_CHECKBOX = re.compile(r'\b(?:gfedcb?|nmlkji?)\b')
_CORE = re.compile(
    r'(?:^|(?<=\s))(?P<kind>S \(partial\)|P|S|E)\s+'
    r'(?P<traded>\d{2}/\d{2}/\d{4})\s+(?P<notified>\d{2}/\d{2}/\d{4})\s+'
    r'(?P<amount>(?:Spouse/DC )?Over(?: \$[\d,]+)?|\$[\d,]+\s*-\s*(?:\$[\d,]+)?|\$[\d,]+\.\d{2})'
)
_OWNER = re.compile(r'^(SP|JT|DC)\s+')
_TYPE = re.compile(r'\s*\[([A-Z]{2})\]')
_TICKER = re.compile(r'\(([A-Z][A-Z0-9.]{0,9})\)\s*\[')
_MISCASED_CODE = re.compile(r'\([A-Za-z][A-Za-z0-9.]{0,9}\)|\[[A-Za-z]{2}\]')
_DOLLARS = re.compile(r'\$[\d,]+')
_PUT = re.compile(r'\bput\b')
_WRAPPING_LABELS = {'D', 'C'}
_KINDS = {'P': 'purchase', 'S': 'sale', 'S (partial)': 'partial_sale', 'E': 'exchange'}
_PRICEABLE_TYPES = {'ST', 'OP'}


@dataclass
class ParsedTrade:
    owner: str
    asset: str
    asset_type: str
    ticker: str | None
    kind: str
    option: str
    exercise: bool
    traded_on: object
    notified_on: object
    amount_low: int
    amount_high: int | None
    priceable: bool


@dataclass
class ParsedReport:
    rows: list = field(default_factory=list)
    amended: bool = False
    unparsed_rows: int = 0
    deleted_rows: int = 0


def pdf_text(data):
    reader = pypdf.PdfReader(io.BytesIO(data))
    return '\n'.join(page.extract_text() or '' for page in reader.pages).replace('\x00', ' ')


def pdf_layout_text(data):
    reader = pypdf.PdfReader(io.BytesIO(data))
    pages = '\n'.join(page.extract_text(extraction_mode='layout') or '' for page in reader.pages)
    lines = (_COLUMN_GAP.sub(' ', _CHECKBOX.sub('', line)).strip() for line in pages.replace('\x00', ' ').splitlines())
    text = '\n'.join(line for line in lines if line) + '\n'
    return _MISCASED_CODE.sub(lambda code: code.group(0).upper(), text).replace(' (PARTIAL) ', ' (partial) ')


def read_report(data):
    plain = parse_report(pdf_text(data))
    if plain.rows:
        return plain
    layout = parse_report(pdf_layout_text(data))
    return layout if layout.rows or layout.unparsed_rows < plain.unparsed_rows else plain


def _body(text):
    start = text.find(_HEADER_END)
    body = text[start + len(_HEADER_END):] if start >= 0 else text
    footer = _FOOTER.search(body)
    body = body[:footer.start()] if footer else body
    return _COLUMN_HEADER.sub('', _PAGE_BREAK.sub('', body + '\n'))


def _is_continuation(line, following):
    if _OWNER.match(line) or _TYPE.search(line) or _CORE.search(line):
        return False
    rest = []
    closed = False
    for later in following:
        if _STATUS.match(later):
            closed = True
            break
        rest.append(later.strip())
    if not closed:
        return True
    flat = ' '.join(rest)
    return bool(_TYPE.search(flat) and _CORE.search(flat))


def _records(body):
    records, current, continuing = [], [], False
    lines = body.splitlines()
    for index, line in enumerate(lines):
        status = _STATUS.match(line)
        if status:
            records.append({'lines': current, 'status': status.group(1), 'notes': []})
            current, continuing = [], False
            continue
        if records and not current:
            label = _LABEL.match(line)
            if label or (continuing and _is_continuation(line, lines[index + 1:])):
                note = label.group('text') if label else line
                records[-1]['notes'].append(note)
                is_description = (label and label.group('key') in _WRAPPING_LABELS) or (not label and continuing)
                continuing = bool(is_description) and not note.rstrip().endswith('.')
                continue
        if line.strip():
            current.append(line)
    return records, current


def _date(text):
    return datetime.strptime(text, '%m/%d/%Y').date()


def _trade(record):
    flat = ' '.join(line.strip() for line in record['lines'])
    core = _CORE.search(flat)
    if core is None:
        return None
    head, tail = flat[:core.start()].strip(), flat[core.end():].strip()
    amount = core.group('amount')
    if amount.rstrip().endswith(('-', 'Over')):
        closing = _DOLLARS.search(tail)
        if closing is None:
            return None
        amount = f'{amount} {closing.group(0)}'
        tail = (tail[:closing.start()] + tail[closing.end():]).strip()
    low, high = parse_range(amount)
    owner_match = _OWNER.match(head)
    owner = owner_match.group(1) if owner_match else 'self'
    head = head[owner_match.end():] if owner_match else head
    type_match = _TYPE.search(flat)
    asset_type = type_match.group(1) if type_match else ''
    ticker_match = _TICKER.search(f'{head} {tail}')
    ticker = ticker_match.group(1) if ticker_match else None
    asset = _TYPE.sub('', f'{head} {tail}').strip()
    description = ' '.join(record['notes']).lower()
    option = ''
    if asset_type == 'OP':
        option = 'put' if _PUT.search(description) else 'call'
    return ParsedTrade(
        owner=owner,
        asset=asset,
        asset_type=asset_type,
        ticker=ticker,
        kind=_KINDS[core.group('kind')],
        option=option,
        exercise=description.startswith('exercised'),
        traded_on=_date(core.group('traded')),
        notified_on=_date(core.group('notified')),
        amount_low=low,
        amount_high=high,
        priceable=bool(ticker) and asset_type in _PRICEABLE_TYPES,
    )


def parse_report(text):
    records, leftover = _records(_body(text))
    parsed = ParsedReport(amended=any(record['status'] == 'Amended' for record in records))
    for record in records:
        if record['status'] == 'Deleted':
            parsed.deleted_rows += 1
            continue
        try:
            trade = _trade(record)
        except ValueError:
            trade = None
        if trade is None:
            parsed.unparsed_rows += 1
        else:
            parsed.rows.append(trade)
    parsed.unparsed_rows += bool(leftover)
    return parsed
