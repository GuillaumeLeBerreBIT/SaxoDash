from datetime import date

from django.core.cache import cache

from . import finnhub
from .providers import ProviderUnavailable

PREFIX = 'us-gaap_'
SINGLE_QUARTER_MAX_DAYS = 100
QUARTERS_KEPT = 12

INCOME = {
    'revenue': (
        'Revenues',
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'RevenueFromContractWithCustomerIncludingAssessedTax',
        'SalesRevenueNet',
        'RevenuesNetOfInterestExpense',
        'SalesRevenueGoodsNet',
    ),
    'cost_of_revenue': ('CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'),
    'gross_profit': ('GrossProfit',),
    'research_development': ('ResearchAndDevelopmentExpense',),
    'selling_general_admin': ('SellingGeneralAndAdministrativeExpense',),
    'operating_income': ('OperatingIncomeLoss',),
    'pretax_income': (
        'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
        'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
    ),
    'income_tax': ('IncomeTaxExpenseBenefit',),
    'net_income': ('NetIncomeLoss', 'ProfitLoss'),
}

PER_SHARE = {
    'eps_diluted': ('EarningsPerShareDiluted',),
    'diluted_shares': ('WeightedAverageNumberOfDilutedSharesOutstanding',),
}

BALANCE = {
    'cash': ('CashAndCashEquivalentsAtCarryingValue', 'CashAndDueFromBanks'),
    'short_term_investments': (
        'MarketableSecuritiesCurrent',
        'AvailableForSaleSecuritiesCurrent',
        'ShortTermInvestments',
        'OtherShortTermInvestments',
    ),
    'receivables': ('AccountsReceivableNetCurrent',),
    'inventory': ('InventoryNet',),
    'current_assets': ('AssetsCurrent',),
    'property_plant_equipment': ('PropertyPlantAndEquipmentNet',),
    'goodwill': ('Goodwill',),
    'total_assets': ('Assets',),
    'accounts_payable': ('AccountsPayableCurrent',),
    'current_liabilities': ('LiabilitiesCurrent',),
    'long_term_debt': ('LongTermDebtNoncurrent', 'LongTermDebt'),
    'total_liabilities': ('Liabilities',),
    'equity': ('StockholdersEquity',),
}

DEBT = ('CommercialPaper', 'LongTermDebtCurrent', 'LongTermDebtNoncurrent')
SEPARATE_SGA = ('SellingAndMarketingExpense', 'GeneralAndAdministrativeExpense')
EQUITY_WITH_MINORITY = 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'

CASH_FLOW = {
    'operating_cash_flow': ('NetCashProvidedByUsedInOperatingActivities',),
    'capital_expenditure': ('PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'),
    'depreciation_amortization': (
        'DepreciationDepletionAndAmortization',
        'DepreciationAmortizationAndAccretionNet',
        'DepreciationAndAmortization',
    ),
    'stock_based_compensation': ('ShareBasedCompensation',),
    'investing_cash_flow': ('NetCashProvidedByUsedInInvestingActivities',),
    'financing_cash_flow': ('NetCashProvidedByUsedInFinancingActivities',),
    'dividends_paid': ('PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'),
    'share_repurchases': ('PaymentsForRepurchaseOfCommonStock',),
}


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _values(rows):
    found = {}
    for row in rows or []:
        concept, value = row.get('concept'), row.get('value')
        if concept and _is_number(value):
            found.setdefault(concept.removeprefix(PREFIX), value)
    return found


def _pick(values, row_candidates):
    picked = {}
    for key, candidates in row_candidates.items():
        for concept in candidates:
            if concept in values:
                picked[key] = values[concept]
                break
    return picked


def _income(values):
    income = _pick(values, INCOME)
    if 'gross_profit' not in income and 'revenue' in income and 'cost_of_revenue' in income:
        income['gross_profit'] = income['revenue'] - income['cost_of_revenue']
    if 'selling_general_admin' not in income and all(concept in values for concept in SEPARATE_SGA):
        income['selling_general_admin'] = sum(values[concept] for concept in SEPARATE_SGA)
    return income


def _balance(values):
    balance = _pick(values, BALANCE)
    debt = [values[concept] for concept in DEBT if concept in values]
    if debt:
        balance['total_debt'] = sum(debt)
    if 'total_liabilities' not in balance:
        total = values.get('LiabilitiesAndStockholdersEquity')
        equity = values.get(EQUITY_WITH_MINORITY, values.get('StockholdersEquity'))
        if total is not None and equity is not None:
            balance['total_liabilities'] = total - equity
    return balance


def _cash_flow(values):
    cash_flow = _pick(values, CASH_FLOW)
    if 'operating_cash_flow' in cash_flow and 'capital_expenditure' in cash_flow:
        cash_flow['free_cash_flow'] = cash_flow['operating_cash_flow'] - cash_flow['capital_expenditure']
    return cash_flow


def _day(stamp):
    return (stamp or '')[:10]


def _report(filing, section):
    return _values((filing.get('report') or {}).get(section))


def _latest_filings(reported, form):
    latest = {}
    for filing in (reported or {}).get('data') or []:
        if filing.get('form') != form or not _day(filing.get('endDate')) or filing.get('year') is None:
            continue
        key = (filing['year'], filing.get('quarter'))
        if key not in latest or _day(filing.get('filedDate')) > _day(latest[key].get('filedDate')):
            latest[key] = filing
    return latest


def to_annual(reported):
    rows = []
    for (year, _), filing in _latest_filings(reported, '10-K').items():
        income_values = _report(filing, 'ic')
        row = {
            'period': _day(filing['endDate']),
            'fiscal_year': year,
            'label': f'FY {year}',
            'income': {**_income(income_values), **_pick(income_values, PER_SHARE)},
            'balance': _balance(_report(filing, 'bs')),
            'cash_flow': _cash_flow(_report(filing, 'cf')),
        }
        if row['income'] or row['balance'] or row['cash_flow']:
            rows.append(row)
    return sorted(rows, key=lambda row: row['period'])


def _span_days(filing):
    try:
        return (date.fromisoformat(_day(filing.get('endDate'))) - date.fromisoformat(_day(filing.get('startDate')))).days
    except ValueError:
        return None


def _flows(income, cash_flow):
    return {'income': income, 'cash_flow': cash_flow}


def _combine(left, right, operation):
    return {
        section: {key: operation(left[section][key], right[section][key]) for key in left[section] if key in right[section]}
        for section in ('income', 'cash_flow')
    }


def _quarter_row(year, quarter, period, single, balance):
    return {
        'period': period,
        'fiscal_year': year,
        'quarter': quarter,
        'label': f'Q{quarter} {year}',
        'income': single['income'],
        'balance': balance,
        'cash_flow': single['cash_flow'],
    }


def _year_quarters(year, filings, annual_row):
    rows = []
    to_date = {}
    for quarter in (1, 2, 3):
        filing = filings.get(quarter)
        if filing is None:
            continue
        reported = _flows(_income(_report(filing, 'ic')), _cash_flow(_report(filing, 'cf')))
        previous = to_date.get(quarter - 1)
        if quarter == 1:
            single = to_date[quarter] = reported
        elif _span_days(filing) is None:
            return rows
        elif _span_days(filing) <= SINGLE_QUARTER_MAX_DAYS:
            single = reported
            if previous is not None:
                to_date[quarter] = _combine(previous, reported, lambda a, b: a + b)
        else:
            to_date[quarter] = reported
            single = None if previous is None else _combine(reported, previous, lambda a, b: a - b)
        if single is not None:
            rows.append(_quarter_row(year, quarter, _day(filing['endDate']), single, _balance(_report(filing, 'bs'))))

    if annual_row is not None and 3 in to_date:
        full_year = _flows(annual_row['income'], annual_row['cash_flow'])
        single = _combine(full_year, to_date[3], lambda a, b: a - b)
        rows.append(_quarter_row(year, 4, annual_row['period'], single, annual_row['balance']))
    return rows


def to_quarterly(reported, annual_rows):
    by_year = {}
    for (year, quarter), filing in _latest_filings(reported, '10-Q').items():
        if quarter in (1, 2, 3):
            by_year.setdefault(year, {})[quarter] = filing

    annual_by_year = {row['fiscal_year']: row for row in annual_rows}
    rows = []
    for year, filings in by_year.items():
        rows.extend(_year_quarters(year, filings, annual_by_year.get(year)))
    return sorted(rows, key=lambda row: row['period'])[-QUARTERS_KEPT:]


STATEMENTS_TTL = 86400
PARTIAL_TTL = 600
CACHE_V = 'v1'


def _cache_key(symbol):
    return f'research:statements:{CACHE_V}:{symbol}'


def _produce(symbol):
    annual = to_annual(finnhub.get_financials_reported(symbol, 'annual'))
    if not annual:
        raise finnhub.FinnhubNoData(symbol)
    try:
        quarterly = to_quarterly(finnhub.get_financials_reported(symbol, 'quarterly'), annual)
    except ProviderUnavailable:
        return {'annual': annual, 'quarterly': []}, PARTIAL_TTL
    return {'annual': annual, 'quarterly': quarterly}, STATEMENTS_TTL


def statements(symbol):
    key = _cache_key(symbol)
    try:
        data = cache.get(key)
        if data is None:
            data, timeout = _produce(symbol)
            cache.set(key, data, timeout)
    except ProviderUnavailable:
        raise
    except (KeyError, TypeError, IndexError, ValueError, AttributeError) as exc:
        raise finnhub.FinnhubUnexpected() from exc

    return {'available': True, **data}
