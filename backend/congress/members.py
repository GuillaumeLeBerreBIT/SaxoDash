import csv
import logging
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import requests
from django.db.models import Max
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
        self.parties = {}
        for person in legislators:
            terms = [term for term in person.get('terms', []) if term.get('type') == 'rep' and term.get('end', '') >= SINCE.isoformat()]
            if not terms:
                continue
            latest = terms[-1]
            self.parties[person['id']['bioguide']] = latest.get('party', '')
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

    def party_of(self, bioguide):
        return self.parties.get(bioguide, '')


def aliases():
    with ALIASES.open(newline='') as handle:
        return {
            (normalize(row['last']), first_token(row['first']), row['state_district']): row['bioguide']
            for row in csv.DictReader(handle)
        }


def _free(slug):
    return not Member.objects.filter(slug=slug).exists()


def _unique_slug(first, last, state_district):
    base = slugify(f'{first_token(first)} {last}')
    with_district = slugify(f'{base} {state_district}')
    if _free(base):
        return base
    if _free(with_district):
        return with_district
    counter = 2
    while not _free(f'{with_district}-{counter}'):
        counter += 1
    return f'{with_district}-{counter}'


def _known(entry):
    wanted_last = normalize(entry.last)
    wanted_first = first_token(entry.first)
    matches = [
        member for member in Member.objects.filter(state_district__startswith=entry.state_district[:2]).order_by('pk')
        if normalize(member.last_name) == wanted_last and first_token(member.first_name) == wanted_first
    ]
    exact = [member for member in matches if member.state_district == entry.state_district]
    return next(iter(exact or matches), None)


def _is_latest(member, filed_on):
    latest = member.reports.aggregate(latest=Max('filed_on'))['latest']
    return latest is None or filed_on >= latest


def _refresh(member, entry, party=''):
    changed = []
    if entry.state_district != member.state_district and _is_latest(member, entry.filed_on):
        member.state_district = entry.state_district
        changed.append('state_district')
    if party and not member.party:
        member.party = party
        changed.append('party')
    if member.bioguide_id and not member.photo_url:
        member.photo_url = PHOTO_URL.format(bioguide=member.bioguide_id)
        changed.append('photo_url')
    if changed:
        member.save(update_fields=changed)
    return member


def _missing_party(member, directory):
    if member.party or not member.bioguide_id:
        return ''
    try:
        return directory().party_of(member.bioguide_id)
    except requests.RequestException:
        logger.info('Legislator dataset unreachable; party for %s stays empty for now', member.slug)
        return ''


def member_for(entry, directory):
    known = _known(entry)
    if known:
        return _refresh(known, entry, _missing_party(known, directory))
    state = entry.state_district[:2]
    bioguide = aliases().get((normalize(entry.last), first_token(entry.first), entry.state_district))
    party = ''
    if bioguide is None:
        found = directory().find(entry.last, entry.first, state)
        if found:
            bioguide, party = found['bioguide'], found['party']
    else:
        party = directory().party_of(bioguide)
    if bioguide:
        existing = Member.objects.filter(bioguide_id=bioguide).first()
        if existing:
            return _refresh(existing, entry, party)
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
