import csv
import logging
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import requests
from django.utils.text import slugify

from .models import Member

logger = logging.getLogger(__name__)

CURRENT_URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json'
HISTORICAL_URL = 'https://unitedstates.github.io/congress-legislators/legislators-historical.json'
PHOTO_URL = 'https://unitedstates.github.io/images/congress/225x275/{bioguide}.jpg'
SINCE = date(2021, 1, 1)
TIMEOUT = 60
ALIASES = Path(__file__).with_name('member_aliases.csv')


@dataclass
class IndexEntry:
    doc_id: str
    first: str
    last: str
    state_district: str
    filed_on: date
    year: int


def normalize(name):
    plain = unicodedata.normalize('NFKD', name or '').encode('ascii', 'ignore').decode()
    return ' '.join(''.join(ch if ch.isalpha() or ch in ' -' else ' ' for ch in plain.lower()).split())


def first_token(name):
    return normalize(name).split(' ')[0]


class Directory:
    def __init__(self, legislators):
        self.by_key = {}
        for person in legislators:
            terms = [term for term in person.get('terms', []) if term.get('type') == 'rep' and term.get('end', '') >= SINCE.isoformat()]
            if not terms:
                continue
            latest = terms[-1]
            key = (normalize(person['name'].get('last')), latest['state'])
            self.by_key.setdefault(key, []).append({
                'bioguide': person['id']['bioguide'],
                'party': latest.get('party', ''),
                'first': first_token(person['name'].get('first')),
                'nickname': first_token(person['name'].get('nickname', '')),
            })

    @classmethod
    def fetch(cls):
        legislators = []
        for url in (CURRENT_URL, HISTORICAL_URL):
            response = requests.get(url, timeout=TIMEOUT)
            response.raise_for_status()
            legislators += response.json()
        return cls(legislators)

    def find(self, last, first, state):
        candidates = self.by_key.get((normalize(last), state), [])
        if len(candidates) > 1:
            wanted = first_token(first)
            candidates = [found for found in candidates if wanted in (found['first'], found['nickname'])]
        if len(candidates) != 1:
            return None
        return {'bioguide': candidates[0]['bioguide'], 'party': candidates[0]['party']}


def aliases():
    with ALIASES.open(newline='') as handle:
        return {
            (normalize(row['last']), first_token(row['first']), row['state_district']): row['bioguide']
            for row in csv.DictReader(handle)
        }


def _unique_slug(first, last, state_district):
    base = slugify(f'{first_token(first)} {last}')
    if not Member.objects.filter(slug=base).exists():
        return base
    return slugify(f'{base} {state_district}')


def member_for(entry, directory):
    known = Member.objects.filter(
        last_name=entry.last, first_name=entry.first, state_district=entry.state_district,
    ).first()
    if known:
        return known
    state = entry.state_district[:2]
    bioguide = aliases().get((normalize(entry.last), first_token(entry.first), entry.state_district))
    party = ''
    if bioguide is None:
        found = directory().find(entry.last, entry.first, state)
        if found:
            bioguide, party = found['bioguide'], found['party']
    if bioguide:
        existing = Member.objects.filter(bioguide_id=bioguide).first()
        if existing:
            existing.state_district = entry.state_district
            existing.save(update_fields=['state_district'])
            return existing
    else:
        logger.warning('No legislator match for %s %s (%s); add it to member_aliases.csv', entry.first, entry.last, entry.state_district)
    return Member.objects.create(
        slug=_unique_slug(entry.first, entry.last, entry.state_district),
        bioguide_id=bioguide,
        first_name=entry.first,
        last_name=entry.last,
        state_district=entry.state_district,
        party=party,
        photo_url=PHOTO_URL.format(bioguide=bioguide) if bioguide else '',
    )
