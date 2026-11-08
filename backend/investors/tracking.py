from datetime import date, timedelta

from django.utils.text import slugify

from users.owner import is_owner

from . import edgar, follows, tasks
from .models import Investor

RESERVED_SLUGS = frozenset({'hub', 'stocks', 'search'})
SLUG_LENGTH = 60
STOPPED_AFTER = timedelta(days=365)


class AlreadyTracked(Exception):
    def __init__(self, investor):
        super().__init__(investor.slug)
        self.investor = investor


class NotA13FFiler(Exception):
    pass


class ImportNotQueued(Exception):
    pass


class CuratedInvestor(Exception):
    pass


class NotYours(Exception):
    pass


def _stopped_filing(last_13f, today):
    return last_13f is not None and today - date.fromisoformat(last_13f) > STOPPED_AFTER


def search(query, today):
    tracked = dict(Investor.objects.values_list('cik', 'slug'))
    rows = [
        {
            **found,
            'tracked': found['cik'] in tracked,
            'slug': tracked.get(found['cik']),
            'stale': _stopped_filing(found['last_13f'], today),
        }
        for found in edgar.search_filers(query)
    ]
    return sorted(rows, key=lambda row: row['stale'])


def _free_slug(name, cik):
    slug = slugify(name)[:SLUG_LENGTH]
    if not slug or slug in RESERVED_SLUGS or Investor.objects.filter(slug=slug).exists():
        return f'{slug or "cik"}-{cik}'
    return slug


def add(cik, user):
    existing = Investor.objects.filter(cik=cik).first()
    if existing is not None:
        raise AlreadyTracked(existing)
    found = edgar.filer(cik)
    if found['last_13f'] is None:
        raise NotA13FFiler(found['name'])
    investor = Investor.objects.create(
        cik=cik, name=found['name'], firm=found['name'], slug=_free_slug(found['name'], cik),
        curated=False, quarters_expected=0, added_by=user,
    )
    try:
        tasks.backfill_investor.delay(investor.pk)
    except Exception as exc:
        investor.delete()
        raise ImportNotQueued(found['name']) from exc
    return investor


def may_remove(investor, user):
    if is_owner(user):
        return True
    return investor.added_by_id == user.pk and not follows.followed_by_someone_else(investor, user)


def stop(investor, user):
    if investor.curated:
        raise CuratedInvestor(investor.slug)
    if not may_remove(investor, user):
        raise NotYours(investor.slug)
    investor.delete()
