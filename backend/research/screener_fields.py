from dataclasses import dataclass


@dataclass(frozen=True)
class Field:
    label: str
    short: str
    unit: str
    format: str


FIELDS = {
    'last_close': Field('Close', 'Close', '', 'money'),
    'ma50': Field('50-day MA', '50D', '', 'money'),
    'ma200': Field('200-day MA', '200D', '', 'money'),
    'rsi14': Field('RSI 14', 'RSI', '', 'number'),
    'pct_vs_ma200': Field('Price vs 200-day MA', 'vs 200D', '%', 'signed_pct'),
    'pct_from_52w_high': Field('From 52-week high', 'From high', '%', 'signed_pct'),
    'rvol': Field('Relative volume', 'RVOL', '×', 'multiple'),
    'roe': Field('ROE', 'ROE', '%', 'pct'),
    'net_margin': Field('Net margin', 'Margin', '%', 'pct'),
    'eps_growth_5y': Field('5-year EPS growth', 'EPS 5Y', '%', 'signed_pct'),
    'pe': Field('P/E', 'P/E', '', 'ratio'),
    'market_cap': Field('Market cap', 'Mkt cap', '', 'cap'),
}
