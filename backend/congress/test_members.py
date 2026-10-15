from datetime import date
from unittest import mock

from django.test import TestCase

from . import members
from .members import Directory, IndexEntry, member_for
from .models import Member


def legislator(bioguide, first, last, state, district, party='Democrat', end='2027-01-03'):
    return {
        'id': {'bioguide': bioguide},
        'name': {'first': first, 'last': last},
        'terms': [{'type': 'rep', 'state': state, 'district': district, 'party': party, 'start': '2023-01-03', 'end': end}],
    }


DATASET = [
    legislator('P000197', 'Nancy', 'Pelosi', 'CA', 11),
    legislator('C001120', 'Dan', 'Crenshaw', 'TX', 2, party='Republican'),
    legislator('S000001', 'Adam', 'Smith', 'WA', 9),
    legislator('S000002', 'Jason', 'Smith', 'MO', 8, party='Republican'),
    legislator('O000001', 'Old', 'Timer', 'OH', 1, end='2019-01-03'),
]


def entry(first, last, state_district, doc_id='20000001'):
    return IndexEntry(doc_id=doc_id, first=first, last=last, state_district=state_district,
                      filed_on=date(2026, 1, 2), year=2026)


class DirectoryTest(TestCase):
    def setUp(self):
        self.directory = Directory(DATASET)

    def test_finds_by_last_name_and_state(self):
        self.assertEqual(self.directory.find('Pelosi', 'Nancy', 'CA'), {'bioguide': 'P000197', 'party': 'Democrat'})

    def test_ignores_accents_case_and_middle_initials(self):
        self.assertEqual(self.directory.find('CRENSHAW', 'Daniel R.', 'TX')['bioguide'], 'C001120')

    def test_members_who_left_before_2021_are_not_candidates(self):
        self.assertIsNone(self.directory.find('Timer', 'Old', 'OH'))


class MemberForTest(TestCase):
    def setUp(self):
        self.calls = 0

        def provider():
            self.calls += 1
            return Directory(DATASET)

        self.provider = provider

    def test_creates_a_member_with_party_and_photo(self):
        member = member_for(entry('Nancy', 'Pelosi', 'CA11'), self.provider)
        self.assertEqual((member.slug, member.bioguide_id, member.party), ('nancy-pelosi', 'P000197', 'Democrat'))
        self.assertEqual(member.photo_url, 'https://unitedstates.github.io/images/congress/225x275/P000197.jpg')

    def test_a_known_member_does_not_touch_the_dataset(self):
        member_for(entry('Nancy', 'Pelosi', 'CA11'), self.provider)
        member_for(entry('Nancy', 'Pelosi', 'CA11', doc_id='20000002'), self.provider)
        self.assertEqual(self.calls, 1)

    def test_redistricted_member_stays_one_member(self):
        first = member_for(entry('Dan', 'Crenshaw', 'TX02'), self.provider)
        second = member_for(entry('Dan', 'Crenshaw', 'TX05'), self.provider)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(Member.objects.get(pk=first.pk).state_district, 'TX05')

    def test_two_smiths_in_different_states_are_two_members_with_distinct_slugs(self):
        adam = member_for(entry('Adam', 'Smith', 'WA09'), self.provider)
        jason = member_for(entry('Jason', 'Smith', 'MO08'), self.provider)
        self.assertNotEqual(adam.slug, jason.slug)

    def test_an_alias_answers_a_name_the_dataset_cannot_match(self):
        with mock.patch.object(members, 'aliases', return_value={('pelosi', 'nan', 'CA11'): 'P000197'}):
            member = member_for(entry('Nan', 'Pelosi', 'CA11'), self.provider)
        self.assertEqual(member.bioguide_id, 'P000197')

    def test_an_unmatched_member_is_created_without_party(self):
        with self.assertLogs('congress.members', level='WARNING'):
            member = member_for(entry('Nobody', 'Known', 'ZZ01'), self.provider)
        self.assertEqual((member.bioguide_id, member.party, member.slug), (None, '', 'nobody-known'))
