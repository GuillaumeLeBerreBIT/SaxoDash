import xml.etree.ElementTree as ET
from datetime import date
from decimal import Decimal, InvalidOperation

DOLLAR_VALUES_SINCE = date(2023, 1, 3)
AMENDMENT_TYPES = ('RESTATEMENT', 'NEW HOLDINGS')


class FilingUnreadable(Exception):
    pass


def _local(tag):
    return tag.rsplit('}', 1)[-1].rsplit(':', 1)[-1]


def _root(xml, what):
    try:
        return ET.fromstring(xml)
    except ET.ParseError as exc:
        raise FilingUnreadable(f'{what} is not valid XML: {exc}') from exc


def _fields(info_table):
    return {_local(node.tag): (node.text or '').strip() for node in info_table.iter()}


def _whole(text):
    return Decimal(text.replace(',', ''))


def _row(fields, scale):
    try:
        return {
            'cusip': fields['cusip'].upper(),
            'issuer': fields['nameOfIssuer'],
            'title_of_class': fields.get('titleOfClass', ''),
            'shares': int(_whole(fields['sshPrnamt'])),
            'amount_type': fields.get('sshPrnamtType', 'SH').upper() or 'SH',
            'value': int(_whole(fields['value']) * scale),
            'put_call': fields.get('putCall', '').upper(),
            'discretion': fields.get('investmentDiscretion', ''),
        }
    except (KeyError, InvalidOperation) as exc:
        raise FilingUnreadable(f'information table row is missing or garbles {exc}') from exc


def parse_information_table(xml, filed_on):
    scale = 1 if filed_on >= DOLLAR_VALUES_SINCE else 1000
    return [
        _row(_fields(node), scale)
        for node in _root(xml, 'information table').iter()
        if _local(node.tag) == 'infoTable'
    ]


def aggregate(rows):
    merged = {}
    for row in rows:
        key = (row['cusip'], row['put_call'])
        if key in merged:
            merged[key]['shares'] += row['shares']
            merged[key]['value'] += row['value']
        else:
            merged[key] = dict(row)
    return list(merged.values())


def parse_amendment_type(primary_xml):
    for node in _root(primary_xml, 'primary document').iter():
        if _local(node.tag) == 'amendmentType':
            kind = (node.text or '').strip().upper()
            return kind if kind in AMENDMENT_TYPES else ''
    return ''
