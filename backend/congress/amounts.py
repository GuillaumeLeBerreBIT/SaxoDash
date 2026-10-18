import re
from decimal import ROUND_HALF_UP, Decimal

_DOLLARS = re.compile(r'\$\s*([\d,]+)')
_OPEN = re.compile(r'over', re.I)
_EXACT = re.compile(r'^\s*\$\s*([\d,]+\.\d{2})\s*$')


def parse_range(text):
    exact = _EXACT.match(text)
    if exact:
        dollars = max(1, int(Decimal(exact.group(1).replace(',', '')).quantize(Decimal(1), ROUND_HALF_UP)))
        return dollars, dollars
    found = [int(value.replace(',', '')) for value in _DOLLARS.findall(text)]
    if not found:
        raise ValueError(f'no amount in {text!r}')
    if _OPEN.search(text) or len(found) == 1:
        return found[0], None
    return found[0], found[1]


def size(low, high):
    return low if high is None else (low + high) / 2
