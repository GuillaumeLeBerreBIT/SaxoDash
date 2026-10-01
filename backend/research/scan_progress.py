from django.core.cache import cache

PROGRESS_KEY = 'research:scan-progress'
QUEUED_TTL = 120
RUNNING_TTL = 300


def current():
    return cache.get(PROGRESS_KEY)


def claim():
    return cache.add(PROGRESS_KEY, {'done': 0, 'total': None}, QUEUED_TTL)


def report(done, total):
    cache.set(PROGRESS_KEY, {'done': done, 'total': total}, RUNNING_TTL)


def clear():
    cache.delete(PROGRESS_KEY)
