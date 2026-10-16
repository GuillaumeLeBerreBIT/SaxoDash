from contextlib import contextmanager

from django.core.cache import cache

KEY = 'congress:house-run'
TTL = 3 * 60 * 60


class Busy(Exception):
    def __init__(self, holder):
        super().__init__(holder)
        self.holder = holder


@contextmanager
def exclusive(holder):
    if not cache.add(KEY, holder, TTL):
        raise Busy(cache.get(KEY) or 'run')
    try:
        yield
    finally:
        cache.delete(KEY)
