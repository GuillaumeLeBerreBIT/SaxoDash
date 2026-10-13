from django.test import SimpleTestCase

from . import statements


def rows(**concepts):
    return [{'concept': concept, 'unit': 'usd', 'label': concept, 'value': value} for concept, value in concepts.items()]


def filing(year, quarter, start, end, form=None, filed=None, ic=None, bs=None, cf=None):
    return {
        'year': year,
        'quarter': quarter,
        'form': form or ('10-K' if quarter == 0 else '10-Q'),
        'startDate': f'{start} 00:00:00',
        'endDate': f'{end} 00:00:00',
        'filedDate': f'{filed or end} 00:00:00',
        'report': {'ic': ic or [], 'bs': bs or [], 'cf': cf or []},
    }


def annual(year, **income):
    return filing(year, 0, f'{year}-01-01', f'{year}-12-31', ic=rows(**income))


class AnnualShapingTest(SimpleTestCase):
    def test_maps_prefixed_concepts_onto_standard_rows(self):
        reported = {'data': [filing(
            2025, 0, '2025-01-01', '2025-12-31',
            ic=rows(**{
                'us-gaap_Revenues': 1000, 'us-gaap_CostOfRevenue': 400, 'us-gaap_GrossProfit': 600,
                'us-gaap_OperatingIncomeLoss': 300, 'us-gaap_NetIncomeLoss': 200,
                'us-gaap_EarningsPerShareDiluted': 2.5,
            }),
            bs=rows(**{'us-gaap_Assets': 5000, 'us-gaap_StockholdersEquity': 2000}),
            cf=rows(**{'us-gaap_NetCashProvidedByUsedInOperatingActivities': 350}),
        )]}

        [row] = statements.to_annual(reported)

        self.assertEqual(row['period'], '2025-12-31')
        self.assertEqual(row['fiscal_year'], 2025)
        self.assertEqual(row['label'], 'FY 2025')
        self.assertEqual(row['income']['revenue'], 1000)
        self.assertEqual(row['income']['gross_profit'], 600)
        self.assertEqual(row['income']['eps_diluted'], 2.5)
        self.assertEqual(row['balance'], {'total_assets': 5000, 'equity': 2000})
        self.assertEqual(row['cash_flow'], {'operating_cash_flow': 350})

    def test_reads_concepts_without_the_us_gaap_prefix(self):
        [row] = statements.to_annual({'data': [annual(2012, Revenues=900, NetIncomeLoss=90)]})

        self.assertEqual(row['income'], {'revenue': 900, 'net_income': 90})

    def test_falls_back_through_the_revenue_candidates(self):
        [contract] = statements.to_annual({'data': [annual(
            2020, **{'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax': 700})]})
        [bank] = statements.to_annual({'data': [annual(2020, **{'us-gaap_RevenuesNetOfInterestExpense': 800})]})

        self.assertEqual(contract['income']['revenue'], 700)
        self.assertEqual(bank['income']['revenue'], 800)

    def test_ignores_a_company_extension_concept(self):
        [row] = statements.to_annual({'data': [annual(2020, jpm_Revenues=5, **{'us-gaap_NetIncomeLoss': 10})]})

        self.assertEqual(row['income'], {'net_income': 10})

    def test_derives_gross_profit_when_only_revenue_and_cost_are_reported(self):
        [row] = statements.to_annual({'data': [annual(
            2020, **{'us-gaap_Revenues': 1000, 'us-gaap_CostOfGoodsAndServicesSold': 350})]})

        self.assertEqual(row['income']['gross_profit'], 650)

    def test_sums_selling_and_general_expense_when_reported_separately(self):
        [row] = statements.to_annual({'data': [annual(2020, **{
            'us-gaap_SellingAndMarketingExpense': 120, 'us-gaap_GeneralAndAdministrativeExpense': 80})]})

        self.assertEqual(row['income']['selling_general_admin'], 200)

    def test_omits_a_row_the_company_does_not_report(self):
        [row] = statements.to_annual({'data': [annual(
            2020, **{'us-gaap_RevenuesNetOfInterestExpense': 800, 'us-gaap_NetIncomeLoss': 100})]})

        self.assertNotIn('gross_profit', row['income'])
        self.assertNotIn('operating_income', row['income'])

    def test_ignores_a_value_that_is_not_a_number(self):
        reported = {'data': [filing(2020, 0, '2020-01-01', '2020-12-31', ic=[
            {'concept': 'us-gaap_Revenues', 'value': 'N/A'},
            {'concept': 'us-gaap_NetIncomeLoss', 'value': None},
            {'concept': 'us-gaap_GrossProfit', 'value': 10},
        ])]}

        [row] = statements.to_annual(reported)

        self.assertEqual(row['income'], {'gross_profit': 10})

    def test_derives_balance_and_cash_flow_figures(self):
        reported = {'data': [filing(
            2020, 0, '2020-01-01', '2020-12-31',
            bs=rows(**{
                'us-gaap_LiabilitiesAndStockholdersEquity': 9000,
                'us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest': 4000,
                'us-gaap_StockholdersEquity': 3900,
                'us-gaap_CommercialPaper': 100, 'us-gaap_LongTermDebtCurrent': 200,
                'us-gaap_LongTermDebtNoncurrent': 700,
            }),
            cf=rows(**{
                'us-gaap_NetCashProvidedByUsedInOperatingActivities': 500,
                'us-gaap_PaymentsToAcquireProductiveAssets': 120,
            }),
        )]}

        [row] = statements.to_annual(reported)

        self.assertEqual(row['balance']['total_liabilities'], 5000)
        self.assertEqual(row['balance']['total_debt'], 1000)
        self.assertEqual(row['balance']['long_term_debt'], 700)
        self.assertEqual(row['cash_flow']['capital_expenditure'], 120)
        self.assertEqual(row['cash_flow']['free_cash_flow'], 380)

    def test_keeps_annual_reports_only_oldest_first(self):
        reported = {'data': [
            annual(2025, **{'us-gaap_Revenues': 3}),
            filing(2025, 2, '2025-01-01', '2025-06-30', ic=rows(**{'us-gaap_Revenues': 1})),
            annual(2024, **{'us-gaap_Revenues': 2}),
        ]}

        self.assertEqual([row['fiscal_year'] for row in statements.to_annual(reported)], [2024, 2025])

    def test_an_amended_year_takes_the_latest_filing(self):
        first = filing(2024, 0, '2024-01-01', '2024-12-31', filed='2025-02-01', ic=rows(**{'us-gaap_Revenues': 10}))
        amended = filing(2024, 0, '2024-01-01', '2024-12-31', filed='2025-06-01', ic=rows(**{'us-gaap_Revenues': 12}))

        [row] = statements.to_annual({'data': [first, amended]})

        self.assertEqual(row['income']['revenue'], 12)

    def test_a_filing_with_no_recognised_row_is_left_out(self):
        reported = {'data': [filing(2020, 0, '2020-01-01', '2020-12-31', ic=rows(**{'ifrs-full_Revenue': 10}))]}

        self.assertEqual(statements.to_annual(reported), [])

    def test_survives_an_empty_or_missing_payload(self):
        self.assertEqual(statements.to_annual(None), [])
        self.assertEqual(statements.to_annual({}), [])
        self.assertEqual(statements.to_annual({'data': [{'form': '10-K'}]}), [])


def ytd(year, quarter, end, revenue, cash=None, operating=None, capex=None, bs=None):
    cf = {}
    if operating is not None:
        cf['us-gaap_NetCashProvidedByUsedInOperatingActivities'] = operating
    if capex is not None:
        cf['us-gaap_PaymentsToAcquirePropertyPlantAndEquipment'] = capex
    return filing(
        year, quarter, f'{year}-01-01', end,
        ic=rows(**{'us-gaap_Revenues': revenue, 'us-gaap_EarningsPerShareDiluted': 9.9}),
        bs=rows(**bs) if bs else [],
        cf=rows(**cf),
    )


class QuarterlyShapingTest(SimpleTestCase):
    def setUp(self):
        self.annual_filing = filing(
            2025, 0, '2025-01-01', '2025-12-31',
            ic=rows(**{'us-gaap_Revenues': 1000, 'us-gaap_EarningsPerShareDiluted': 4.0}),
            bs=rows(**{'us-gaap_Assets': 7000}),
            cf=rows(**{
                'us-gaap_NetCashProvidedByUsedInOperatingActivities': 400,
                'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment': 100,
            }),
        )
        self.annual_rows = statements.to_annual({'data': [self.annual_filing]})

    def quarterly(self, *filings):
        return statements.to_quarterly({'data': list(filings)}, self.annual_rows)

    def test_turns_year_to_date_figures_into_single_quarters(self):
        result = self.quarterly(
            ytd(2025, 3, '2025-09-30', 720, operating=290, capex=70),
            ytd(2025, 2, '2025-06-30', 450, operating=180, capex=40),
            ytd(2025, 1, '2025-03-31', 200, operating=80, capex=20, bs={'us-gaap_Assets': 6000}),
        )

        self.assertEqual([row['label'] for row in result], ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'])
        self.assertEqual([row['income']['revenue'] for row in result], [200, 250, 270, 280])
        self.assertEqual([row['cash_flow']['free_cash_flow'] for row in result], [60, 80, 80, 80])
        self.assertEqual([row['quarter'] for row in result], [1, 2, 3, 4])

    def test_the_fourth_quarter_takes_the_annual_period_and_balance_sheet(self):
        result = self.quarterly(
            ytd(2025, 3, '2025-09-30', 720),
            ytd(2025, 2, '2025-06-30', 450),
            ytd(2025, 1, '2025-03-31', 200),
        )

        self.assertEqual(result[-1]['period'], '2025-12-31')
        self.assertEqual(result[-1]['balance'], {'total_assets': 7000})

    def test_a_quarter_filed_without_a_balance_sheet_has_an_empty_one(self):
        [row] = self.quarterly(ytd(2025, 1, '2025-03-31', 200))

        self.assertEqual(row['balance'], {})

    def test_leaves_per_share_figures_out_of_quarters(self):
        result = self.quarterly(
            ytd(2025, 3, '2025-09-30', 720),
            ytd(2025, 2, '2025-06-30', 450),
            ytd(2025, 1, '2025-03-31', 200),
        )

        for row in result:
            self.assertNotIn('eps_diluted', row['income'])

    def test_a_quarter_after_a_missing_filing_is_dropped(self):
        result = self.quarterly(
            ytd(2025, 3, '2025-09-30', 720),
            ytd(2025, 1, '2025-03-31', 200),
        )

        self.assertEqual([row['label'] for row in result], ['Q1 2025', 'Q4 2025'])
        self.assertEqual(result[-1]['income']['revenue'], 280)

    def test_a_filing_that_already_covers_one_quarter_is_not_subtracted(self):
        single = filing(2025, 2, '2025-04-01', '2025-06-30', ic=rows(**{'us-gaap_Revenues': 250}))

        result = self.quarterly(
            ytd(2025, 3, '2025-09-30', 720),
            single,
            ytd(2025, 1, '2025-03-31', 200),
        )

        self.assertEqual([row['income']['revenue'] for row in result], [200, 250, 270, 280])

    def test_no_fourth_quarter_without_the_annual_report(self):
        result = statements.to_quarterly({'data': [
            ytd(2026, 1, '2026-03-31', 300),
        ]}, self.annual_rows)

        self.assertEqual([row['label'] for row in result], ['Q1 2026'])

    def test_uses_the_fiscal_year_in_the_label(self):
        fiscal = filing(2027, 1, '2026-01-26', '2026-04-26', ic=rows(**{'us-gaap_Revenues': 44}))

        [row] = statements.to_quarterly({'data': [fiscal]}, [])

        self.assertEqual(row['label'], 'Q1 2027')
        self.assertEqual(row['fiscal_year'], 2027)

    def test_keeps_the_newest_twelve_quarters(self):
        filings = [
            ytd(year, quarter, f'{year}-{quarter * 3:02d}-28', quarter * 100)
            for year in range(2019, 2025)
            for quarter in (1, 2, 3)
        ]

        result = statements.to_quarterly({'data': filings}, [])

        self.assertEqual(len(result), 12)
        self.assertEqual(result[-1]['label'], 'Q3 2024')

    def test_survives_an_empty_or_missing_payload(self):
        self.assertEqual(statements.to_quarterly(None, []), [])
        self.assertEqual(statements.to_quarterly({'data': []}, []), [])


class UndatedQuarterTest(SimpleTestCase):
    def test_a_quarter_whose_span_cannot_be_read_is_dropped_with_its_successors(self):
        annual_rows = statements.to_annual({'data': [annual(2025, **{'us-gaap_Revenues': 1000})]})
        undated = ytd(2025, 2, '2025-06-30', 450)
        undated['startDate'] = ''

        result = statements.to_quarterly({'data': [
            ytd(2025, 1, '2025-03-31', 200),
            undated,
            ytd(2025, 3, '2025-09-30', 720),
        ]}, annual_rows)

        self.assertEqual([row['label'] for row in result], ['Q1 2025'])
