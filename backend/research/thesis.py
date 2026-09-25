"""Whether a SymbolNote actually holds a thesis, not just an empty row.

SymbolNoteView.get_object creates an empty row on first GET (see
research/views.py), so a row existing is not evidence of anything - the
question this answers is whether any of its fields actually have content.
"""
from django.db.models import Q

from .models import SymbolNote

_HAS_CONTENT = (
    Q(business_summary__gt='')
    | Q(bull_case__gt='')
    | Q(bear_case__gt='')
    | Q(risks_to_watch__gt='')
    | Q(sell_trigger__gt='')
    | Q(target_price__isnull=False)
)


def notes_with_thesis(tickers):
    return SymbolNote.objects.filter(symbol__in=tickers).filter(_HAS_CONTENT)


def tickers_with_thesis(tickers):
    """The subset of `tickers` that have a non-empty SymbolNote.

    A single query, deliberately not one has_thesis() check per ticker -
    this backs a per-row indicator on a whole holdings table, not a
    one-off lookup.
    """
    if not tickers:
        return set()
    return set(notes_with_thesis(tickers).values_list('symbol', flat=True))
