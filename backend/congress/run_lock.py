import time
import uuid
from contextlib import contextmanager

from django.core.cache import cache

KEY = 'congress:house-run'
TTL = 60 * 60


class Busy(Exception):
    def __init__(self, holder):
        super().__init__(holder)
        self.holder = holder


class Held:
    def __init__(self, token):
        self.token = token

    def owned(self):
        return cache.get(KEY) == self.token

    def pause(self, seconds):
        time.sleep(seconds)
        if self.owned():
            cache.touch(KEY, TTL)


def _holder(token):
    return (token or 'run').split(':')[0]


@contextmanager
def exclusive(holder):
    held = Held(f'{holder}:{uuid.uuid4().hex}')
    if not cache.add(KEY, held.token, TTL):
        raise Busy(_holder(cache.get(KEY)))
    try:
        yield held
    finally:
        if held.owned():
            cache.delete(KEY)
