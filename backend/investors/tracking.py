from django.utils.text import slugify

from . import edgar, tasks
from .models import Investor

RESERVED_SLUGS = frozenset({'hub', 'stocks', 'search'})
SLUG_LENGTH = 60


class AlreadyTracked(Exception):
    def __init__(self, investor):
        super().__init__(investor.slug)
        self.investor = investor


class NotA13FFiler(Exception):
    pass


class CuratedInvestor(Exception):
    pass


def search(query):
    tracked = dict(Investor.objects.values_list('cik', 'slug'))
    return [
        {**found, 'tracked': found['cik'] in tracked, 'slug': tracked.get(found['cik'])}
        for found in edgar.search_filers(query)
    ]


def _free_slug(name, cik):
    slug = slugify(name)[:SLUG_LENGTH]
    if not slug or slug in RESERVED_SLUGS or Investor.objects.filter(slug=slug).exists():
        return f'{slug or "cik"}-{cik}'
    return slug


def add(cik):
    existing = Investor.objects.filter(cik=cik).first()
    if existing is not None:
        raise AlreadyTracked(existing)
    found = edgar.filer(cik)
    if found['last_13f'] is None:
        raise NotA13FFiler(found['name'])
    investor = Investor.objects.create(
        cik=cik, name=found['name'], firm=found['name'], slug=_free_slug(found['name'], cik),
        curated=False, quarters_expected=0,
    )
    tasks.backfill_investor.delay(investor.pk)
    return investor


def stop(investor):
    if investor.curated:
        raise CuratedInvestor(investor.slug)
    investor.delete()
