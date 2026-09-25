from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import Abs, Coalesce, TruncMonth
from django.utils import timezone

from .models import BankTransaction, Budget, ManualIbanLabel

TRANSFER_CATEGORIES = ('TRANSFER', 'SAVINGS')


def _previous_period(date_from, date_to):
    length_days = (date_to - date_from).days + 1
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=length_days - 1)
    return prev_from, prev_to


def spending_summary(date_from=None, date_to=None, _include_previous=True):
    qs = BankTransaction.objects.all()
    if date_from:
        qs = qs.filter(booking_date__gte=date_from)
    if date_to:
        qs = qs.filter(booking_date__lte=date_to)
    qs = qs.annotate(effective_category=Coalesce('category_override', 'category'))

    spending_rows = (
        qs.exclude(effective_category__in=TRANSFER_CATEGORIES)
        .values('effective_category')
        .annotate(total=Sum('amount'))
        .order_by('effective_category')
    )
    # A category whose signed total is >= 0 (fully refunded, or nothing but
    # an unmatched credit) is dropped, not shown as negative spending.
    categories = [
        {'category': row['effective_category'], 'amount': -row['total']}
        for row in spending_rows if row['total'] < 0
    ]

    transfers_total = -(
        qs.filter(effective_category__in=TRANSFER_CATEGORIES, amount__lt=0)
        .aggregate(total=Sum('amount'))['total'] or Decimal('0')
    )

    # A netting credit isn't itself "a transaction of spending" - it reduces
    # one. Count the debit side only, same categories excluded as above.
    transaction_count = (
        qs.filter(amount__lt=0)
        .exclude(effective_category__in=TRANSFER_CATEGORIES)
        .count()
    )

    previous_period = None
    if _include_previous and date_from and date_to:
        prev_from, prev_to = _previous_period(
            date.fromisoformat(date_from), date.fromisoformat(date_to),
        )
        prev = spending_summary(
            date_from=prev_from.isoformat(), date_to=prev_to.isoformat(), _include_previous=False,
        )
        previous_period = {
            'date_from': prev_from.isoformat(),
            'date_to': prev_to.isoformat(),
            'total': prev['total'],
        }

    return {
        'categories': categories,
        'total': sum((c['amount'] for c in categories), Decimal('0')),
        'transfers': transfers_total,
        'transaction_count': transaction_count,
        'previous_period': previous_period,
    }


def spending_trend(months=6):
    qs = (
        BankTransaction.objects
        .annotate(effective_category=Coalesce('category_override', 'category'))
        .exclude(effective_category__in=TRANSFER_CATEGORIES)
        .annotate(month=TruncMonth('booking_date'))
        .values('month')
        .annotate(total=Sum('amount'))
        .order_by('month')
    )
    rows = [
        {'month': row['month'].strftime('%Y-%m'), 'total': -row['total']}
        for row in qs if row['total'] < 0
    ]
    return rows[-months:]


def _first_of_month(d):
    return d.replace(day=1)


def _first_of_next_month(d):
    if d.month == 12:
        return date(d.year + 1, 1, 1)
    return date(d.year, d.month + 1, 1)


def budget_progress():
    today = timezone.localdate()
    start = _first_of_month(today)
    end = _first_of_next_month(today)

    spent_by_category = dict(
        BankTransaction.objects
        .filter(booking_date__gte=start, booking_date__lt=end)
        .annotate(effective_category=Coalesce('category_override', 'category'))
        .values('effective_category')
        .annotate(total=Sum('amount'))
        .values_list('effective_category', 'total')
    )

    rows = []
    for budget in Budget.objects.all().order_by('category'):
        total = spent_by_category.get(budget.category, Decimal('0'))
        spent = -total if total < 0 else Decimal('0')
        rows.append({
            'category': budget.category,
            'limit': budget.monthly_limit,
            'spent': spent,
            'pct': float(spent / budget.monthly_limit * 100),
        })
    return rows


CANDIDATE_CATEGORIES = ('OTHER', 'REFUND_CREDIT')
MIN_CANDIDATE_OCCURRENCES = 2
MAX_CANDIDATES = 15


def labeled_account_candidates():
    """Recurring counterparties still landing in OTHER/REFUND_CREDIT - the
    ones a household/own-account label would most plausibly help with,
    surfaced so the user doesn't have to go digging for an IBAN themselves.
    A category_override is respected the same way categorization already
    is elsewhere: an overridden row is the user's own settled judgment, not
    a gap to suggest filling.
    """
    labeled_ibans = set(
        ManualIbanLabel.objects.exclude(iban__isnull=True).values_list('iban', flat=True)
    )
    labeled_names = set(
        ManualIbanLabel.objects.exclude(counterparty_name__isnull=True)
        .values_list('counterparty_name', flat=True)
    )

    rows = (
        BankTransaction.objects
        .filter(category__in=CANDIDATE_CATEGORIES, category_override__isnull=True)
        .values('counterparty_name', 'counterparty_iban')
        .annotate(count=Count('id'), total=Sum(Abs('amount')))
        .filter(count__gte=MIN_CANDIDATE_OCCURRENCES)
        .order_by('-total')
    )

    candidates = [
        row for row in rows
        if row['counterparty_iban'] not in labeled_ibans
        and (row['counterparty_name'] or '').strip().upper() not in labeled_names
    ]
    return candidates[:MAX_CANDIDATES]
