import re

_DOLLARS = re.compile(r'\$\s*([\d,]+)')
_OPEN = re.compile(r'over', re.I)


def parse_range(text):
    found = [int(value.replace(',', '')) for value in _DOLLARS.findall(text)]
    if not found:
        raise ValueError(f'no amount in {text!r}')
    if _OPEN.search(text) or len(found) == 1:
        return found[0], None
    return found[0], found[1]


def size(low, high):
    return low if high is None else (low + high) / 2
