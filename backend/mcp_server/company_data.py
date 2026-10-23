ELIGIBLE = 'eligible'
FUND = 'fund'
FOREIGN = 'foreign'
UNVERIFIED = 'unverified'

COMPANY_DATA_CURRENCY = 'USD'

REFUSALS = {
    FOREIGN: 'A non-US listing: Finnhub and the SEC would describe a different company.',
    FUND: 'An ETF has no company statements.',
    UNVERIFIED: 'The listing currency is unknown, so US company data is withheld.',
}


def status(*, asset_type, currency, resolved):
    if currency and currency != COMPANY_DATA_CURRENCY:
        return FOREIGN
    if asset_type == 'Etf':
        return FUND
    if currency:
        return ELIGIBLE
    if resolved:
        return UNVERIFIED
    return ELIGIBLE


def status_of(instrument):
    if instrument is None:
        return status(asset_type=None, currency=None, resolved=False)
    return status(asset_type=instrument['asset_type'], currency=instrument['currency'], resolved=True)


def refusal(company_status):
    return REFUSALS.get(company_status)
