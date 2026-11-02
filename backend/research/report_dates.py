from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import requests
from django.conf import settings
from django.core.cache import cache

from core.http_client import request_json

TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'
SUBMISSIONS_URL = 'https://data.sec.gov/submissions/CIK{cik:010d}.json'
TICKERS_KEY = 'research:sec-tickers:v1'
TICKERS_TTL = 7 * 24 * 3600
RESULTS_FORM = '8-K'
RESULTS_ITEM = '2.02'
PERIOD_FORMS = frozenset({'10-Q', '10-K'})
CALENDAR_QUARTER = timedelta(days=92)
REPORT_WINDOW = timedelta(days=100)
NEW_YORK = ZoneInfo('America/New_York')
MARKET_OPEN = time(9, 30)
MARKET_CLOSE = time(16, 0)
NO_REPORTS = {'releases': [], 'fiscal_ends': []}


class SecUnavailable(Exception):
    pass


def _get(url):
    if not settings.SEC_USER_AGENT:
        raise SecUnavailable('SEC_USER_AGENT is not set.')
    return request_json(
        requests.get, url, url,
        transient=SecUnavailable, permanent=SecUnavailable,
        headers={'User-Agent': settings.SEC_USER_AGENT},
    )


def _ciks():
    ciks = cache.get(TICKERS_KEY)
    if ciks is None:
        try:
            ciks = {row['ticker'].upper(): int(row['cik_str']) for row in _get(TICKERS_URL).values()}
        except (AttributeError, KeyError, TypeError, ValueError) as exc:
            raise SecUnavailable(f'SEC ticker list is unreadable: {exc}') from exc
        cache.set(TICKERS_KEY, ciks, TICKERS_TTL)
    return ciks


def release_session(accepted):
    moment = datetime.fromisoformat(accepted.replace('Z', '+00:00')).astimezone(NEW_YORK)
    if moment.time() < MARKET_OPEN:
        return moment.date(), 'bmo'
    if moment.time() >= MARKET_CLOSE:
        return moment.date(), 'amc'
    return moment.date(), 'dmh'


def _is_results_release(filing):
    items = (filing.get('items') or '').split(',')
    return filing.get('form') == RESULTS_FORM and RESULTS_ITEM in items and filing.get('acceptanceDateTime')


def company_reports(symbol):
    cik = _ciks().get(symbol.upper())
    if cik is None:
        return NO_REPORTS
    try:
        recent = _get(SUBMISSIONS_URL.format(cik=cik))['filings']['recent']
        filings = [dict(zip(recent, values)) for values in zip(*recent.values())]
        releases = []
        fiscal_ends = set()
        for filing in filings:
            if filing.get('form') in PERIOD_FORMS and filing.get('reportDate'):
                fiscal_ends.add(date.fromisoformat(filing['reportDate']))
            if _is_results_release(filing):
                day, session = release_session(filing['acceptanceDateTime'])
                releases.append({'date': day, 'session': session})
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        raise SecUnavailable(f'SEC filings for {symbol} are unreadable: {exc}') from exc
    return {'releases': sorted(releases, key=lambda release: release['date']), 'fiscal_ends': sorted(fiscal_ends)}


def _fiscal_end(period, fiscal_ends):
    inside = [end for end in fiscal_ends if period - CALENDAR_QUARTER < end <= period]
    return inside[-1] if inside else None


def attach(history, reports):
    claimed = None
    for row in sorted(history, key=lambda row: row['date']):
        period = date.fromisoformat(row['date'])
        fiscal_end = _fiscal_end(period, reports['fiscal_ends'])
        floor = fiscal_end or period - CALENDAR_QUARTER
        after = max(floor, claimed) if claimed else floor
        until = (fiscal_end or period) + REPORT_WINDOW
        release = next((r for r in reports['releases'] if after < r['date'] <= until), None)
        row['reported_on'] = release['date'].isoformat() if release else None
        row['session'] = release['session'] if release else None
        if release:
            claimed = release['date']
    return history
