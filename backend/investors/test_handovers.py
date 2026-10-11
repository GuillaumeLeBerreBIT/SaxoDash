from datetime import date

from django.test import TestCase

from . import handovers, moves
from .factories import make_investor, store_quarter
from .models import Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)
Q3 = date(2026, 9, 30)
OLD, MIDDLE, NEW, OTHER = 'G5494J103', 'G5494J999', 'G54950103', '037833100'
NO_ALIASES = {}


def fund(number):
    return make_investor(cik=number, slug=f'fund-{number}', firm=f'Fund {number}')


def hand_over(investor, shares, *, before=OLD, after=NEW, first=Q1, second=Q2):
    store_quarter(investor, first, [(before, 'LINDE PLC', shares, shares * 10)], rebuild=False)
    store_quarter(investor, second, [(after, 'LINDE PLC NEW', shares, shares * 11)])


def linde(**fields):
    return Security.objects.create(cusip=NEW, ticker='LIN', name='LINDE PLC', security_type='Common Stock', **fields)


def state(cusip):
    security = Security.objects.get(pk=cusip)
    return security.ticker, security.inherited_via


class HandoverTest(TestCase):
    def test_a_position_two_funds_carried_over_share_for_share_inherits_the_successors_ticker(self):
        Security.objects.create(cusip=OLD, attempts=3)
        linde()
        hand_over(fund(1), 500)
        hand_over(fund(2), 1200)

        self.assertEqual(handovers.apply(NO_ALIASES), 1)

        inherited = Security.objects.get(pk=OLD)
        self.assertEqual(
            (inherited.ticker, inherited.name, inherited.security_type, inherited.inherited_via),
            ('LIN', 'LINDE PLC', 'Common Stock', Security.HANDOVER),
        )
        self.assertIsNotNone(inherited.resolved_at)

    def test_one_fund_is_not_enough_evidence(self):
        Security.objects.create(cusip=OLD)
        linde()
        hand_over(fund(1), 500)

        self.assertEqual(handovers.apply(NO_ALIASES), 0)

        self.assertEqual(state(OLD), (None, ''))

    def test_a_share_count_that_fits_two_new_positions_points_at_neither(self):
        Security.objects.create(cusip=OLD)
        linde()
        Security.objects.create(cusip=OTHER, ticker='AAPL')
        for number in (1, 2):
            investor = fund(number)
            store_quarter(investor, Q1, [(OLD, 'LINDE PLC', 500, 5000)], rebuild=False)
            store_quarter(investor, Q2, [(NEW, 'LINDE PLC NEW', 500, 5500), (OTHER, 'APPLE INC', 500, 900)])

        handovers.apply(NO_ALIASES)

        self.assertEqual(state(OLD), (None, ''))

    def test_a_changed_share_count_is_a_sale_and_a_purchase(self):
        Security.objects.create(cusip=OLD)
        linde()
        for number in (1, 2):
            investor = fund(number)
            store_quarter(investor, Q1, [(OLD, 'LINDE PLC', 500, 5000)], rebuild=False)
            store_quarter(investor, Q2, [(NEW, 'LINDE PLC NEW', 499, 5500)])

        handovers.apply(NO_ALIASES)

        self.assertEqual(state(OLD), (None, ''))

    def test_option_rows_are_never_a_handover(self):
        Security.objects.create(cusip=OLD)
        linde()
        for number in (1, 2):
            investor = fund(number)
            store_quarter(investor, Q1, [(OLD, 'LINDE PLC', 500, 5000, 'CALL')], rebuild=False)
            store_quarter(investor, Q2, [(NEW, 'LINDE PLC NEW', 500, 5500, 'CALL')])

        handovers.apply(NO_ALIASES)

        self.assertEqual(state(OLD), (None, ''))

    def test_a_chain_of_identifiers_inherits_from_the_one_that_has_a_ticker(self):
        Security.objects.create(cusip=OLD)
        Security.objects.create(cusip=MIDDLE)
        linde()
        for number in (1, 2):
            investor = fund(number)
            store_quarter(investor, Q1, [(OLD, 'LINDE PLC', 500, 5000)], rebuild=False)
            store_quarter(investor, Q2, [(MIDDLE, 'LINDE PLC', 500, 5000)], rebuild=False)
            store_quarter(investor, Q3, [(NEW, 'LINDE PLC NEW', 500, 5500)])

        self.assertEqual(handovers.apply(NO_ALIASES), 2)

        self.assertEqual(state(OLD), ('LIN', Security.HANDOVER))
        self.assertEqual(state(MIDDLE), ('LIN', Security.HANDOVER))

    def test_identifiers_that_hand_over_to_each_other_resolve_to_nothing(self):
        Security.objects.create(cusip=OLD)
        Security.objects.create(cusip=MIDDLE)
        for number in (1, 2):
            investor = fund(number)
            store_quarter(investor, Q1, [(OLD, 'LINDE PLC', 500, 5000)], rebuild=False)
            store_quarter(investor, Q2, [(MIDDLE, 'LINDE PLC', 500, 5000)], rebuild=False)
            store_quarter(investor, Q3, [(OLD, 'LINDE PLC', 500, 5500)])

        self.assertEqual(handovers.apply(NO_ALIASES), 0)

    def test_a_successor_without_a_ticker_passes_nothing_on(self):
        Security.objects.create(cusip=OLD)
        Security.objects.create(cusip=NEW)
        hand_over(fund(1), 500)
        hand_over(fund(2), 1200)

        self.assertEqual(handovers.apply(NO_ALIASES), 0)

        self.assertEqual(state(OLD), (None, ''))

    def test_a_looked_up_ticker_is_never_replaced(self):
        Security.objects.create(cusip=OLD, ticker='LIN.OLD')
        linde()
        hand_over(fund(1), 500)
        hand_over(fund(2), 1200)

        self.assertEqual(handovers.apply({OLD: {'ticker': 'ALIAS', 'name': 'Alias'}}), 0)

        self.assertEqual(state(OLD), ('LIN.OLD', ''))

    def test_an_inherited_ticker_is_withdrawn_when_its_evidence_is_gone(self):
        Security.objects.create(cusip=OLD, ticker='LIN', name='LINDE PLC', inherited_via=Security.HANDOVER)
        linde()

        handovers.apply(NO_ALIASES)

        withdrawn = Security.objects.get(pk=OLD)
        self.assertEqual((withdrawn.ticker, withdrawn.name, withdrawn.inherited_via), (None, '', ''))
        self.assertIsNone(withdrawn.resolved_at)

    def test_running_twice_changes_nothing(self):
        Security.objects.create(cusip=OLD)
        linde()
        hand_over(fund(1), 500)
        hand_over(fund(2), 1200)
        handovers.apply(NO_ALIASES)

        self.assertEqual(handovers.apply(NO_ALIASES), 1)

        self.assertEqual(state(OLD), ('LIN', Security.HANDOVER))


    def test_the_evidence_survives_moves_rebuilt_with_the_inherited_ticker(self):
        Security.objects.create(cusip=OLD)
        linde()
        funds = [fund(1), fund(2)]
        hand_over(funds[0], 500)
        hand_over(funds[1], 1200)
        handovers.apply(NO_ALIASES)
        for investor in funds:
            moves.rebuild(investor)

        handovers.apply(NO_ALIASES)

        self.assertEqual(state(OLD), ('LIN', Security.HANDOVER))


class AliasTest(TestCase):
    def test_an_alias_names_a_ticker_no_fund_has_handed_over_yet(self):
        Security.objects.create(cusip=OLD, attempts=3)

        self.assertEqual(handovers.apply({OLD: {'ticker': 'LIN', 'name': 'Linde plc'}}), 1)

        aliased = Security.objects.get(pk=OLD)
        self.assertEqual((aliased.ticker, aliased.name, aliased.inherited_via), ('LIN', 'Linde plc', Security.ALIAS))

    def test_an_alias_wins_over_a_handover(self):
        Security.objects.create(cusip=OLD)
        linde()
        hand_over(fund(1), 500)
        hand_over(fund(2), 1200)

        handovers.apply({OLD: {'ticker': 'LINX', 'name': 'Linde plc'}})

        self.assertEqual(state(OLD), ('LINX', Security.ALIAS))

    def test_an_alias_for_an_identifier_nobody_filed_creates_nothing(self):
        handovers.apply({OLD: {'ticker': 'LIN', 'name': 'Linde plc'}})

        self.assertFalse(Security.objects.exists())

    def test_the_shipped_alias_file_reads_as_identifier_to_ticker_and_name(self):
        aliases = handovers.load_aliases()

        self.assertEqual(aliases['30231G102'], {'ticker': 'XOM', 'name': 'ExxonMobil Holdings Corp'})
        self.assertTrue(all(len(cusip) == 9 and entry['ticker'] for cusip, entry in aliases.items()))
