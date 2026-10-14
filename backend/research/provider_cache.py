import time

from django.core.cache import cache

from .providers import ProviderUnavailable

SHAPING_ERRORS = (KeyError, TypeError, IndexError, ValueError, AttributeError)

FILL_LOCK_SECONDS = 30
FILL_WAIT_SECONDS = 5
FILL_POLL_SECONDS = 0.1


def fill_lock_key(key):
    return f'{key}:filling'


def _wait_for_other_fill(key, sleep):
    for _ in range(round(FILL_WAIT_SECONDS / FILL_POLL_SECONDS)):
        sleep(FILL_POLL_SECONDS)
        value = cache.get(key)
        if value is not None:
            return value
        if cache.get(fill_lock_key(key)) is None:
            return None
    return None


def _produce(produce, unexpected):
    try:
        return produce()
    except ProviderUnavailable:
        raise
    except SHAPING_ERRORS as exc:
        if unexpected is None:
            raise
        raise unexpected() from exc


def cached(key, produce, *, unexpected=None, sleep=time.sleep):
    value = cache.get(key)
    if value is not None:
        return value

    filling = cache.add(fill_lock_key(key), True, FILL_LOCK_SECONDS)
    if not filling:
        value = _wait_for_other_fill(key, sleep)
        if value is not None:
            return value

    try:
        value, ttl = _produce(produce, unexpected)
        if ttl:
            cache.set(key, value, ttl)
        return value
    finally:
        if filling:
            cache.delete(fill_lock_key(key))
