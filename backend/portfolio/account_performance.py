from datetime import date
from typing import NamedTuple

from django.core.cache import cache

from saxo import client
from saxo.client import SaxoAPIError
from saxo.credentials import SaxoNotConnected, active_credential

CACHE_TTL = 3600
WEEKEND_FROM = 5
UNANSWERED = 'Saxo did not answer the account history request.'


class GrowthSeries(NamedTuple):
    growth: list
    warning: str | None


def _cache_key(user):
    return f'portfolio:account-performance:v1:{user.pk}'


def _last_good_key(user):
    return f'{_cache_key(user)}:last-good'


def _growth(body):
    accumulated = (body.get('TimeWeighted') or {}).get('Accumulated') or []
    dated = ((date.fromisoformat(point['Date'][:10]), 1 + point['Value']) for point in accumulated)
    return [(day, value) for day, value in dated if day.weekday() < WEEKEND_FROM]


def _fetched(user):
    token = active_credential(user).access_token
    return _growth(client.get_performance_timeseries(token, client.get_client_key(token)))


def _fallback(reason, user):
    growth = cache.get(_last_good_key(user)) or []
    if not growth:
        return GrowthSeries([], reason)
    last = growth[-1][0]
    return GrowthSeries(growth, f'{reason} Showing your history up to {last.day} {last:%b %Y}.')


def growth_series(*, user):
    growth = cache.get(_cache_key(user))
    if growth is not None:
        return GrowthSeries(growth, None)
    try:
        growth = _fetched(user)
    except SaxoNotConnected as error:
        return _fallback(f'Saxo is not connected: {error}', user)
    except SaxoAPIError:
        return _fallback(UNANSWERED, user)
    cache.set(_cache_key(user), growth, CACHE_TTL)
    cache.set(_last_good_key(user), growth, None)
    return GrowthSeries(growth, None)
