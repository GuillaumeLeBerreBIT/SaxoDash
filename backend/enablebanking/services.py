from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Min, Sum
from django.db.models.functions import Abs, Coalesce, TruncMonth
from django.utils import timezone

from .models import BankTransaction, Budget, ManualIbanLabel

TRANSFER_CATEGORIES = ('TRANSFER', 'SAVINGS')


def _today():
    return timezone.localdate()


def _shift_month(day, delta):
    index = day.year * 12 + day.month - 1 + delta
    return date(index // 12, index % 12 + 1, 1)


def _spend_by_category(nets):
    return {category: -net for category, net in nets if net < 0}


def _last_day_of_month(day):
    return _shift_month(day, 1) - timedelta(days=1)


def _previous_period(date_from, date_to):
    if date_from.day == 1:
        months = (date_to.year - date_from.year) * 12 + date_to.month - date_from.month + 1
        prev_from = _shift_month(date_from, -months)
        prev_month_start = _shift_month(date_to, -months)
        prev_month_end = _last_day_of_month(prev_month_start)
        whole = date_to == _last_day_of_month(date_to)
        if whole:
            prev_to = prev_month_end
            label = 'previous month' if months == 1 else f'previous {months} months'
        else:
            prev_to = prev_month_start.replace(day=min(date_to.day, prev_month_end.day))
            label = 'same days last month' if months == 1 else f'same days {months} months earlier'
        return prev_from, prev_to, label

    length_days = (date_to - date_from).days + 1
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=length_days - 1)
    return prev_from, prev_to, f'previous {length_days} days'


def spending_summary(date_from=None, date_to=None, _include_previous=True):
    today = _today()
    end = min(date.fromisoformat(date_to), today) if date_to else today
    qs = BankTransaction.objects.filter(booking_date__lte=end)
    if date_from:
        qs = qs.filter(booking_date__gte=date_from)
    qs = qs.annotate(effective_category=Coalesce('category_override', 'category'))

    spending_rows = (
        qs.exclude(effective_category__in=TRANSFER_CATEGORIES)
        .values('effective_category')
        .annotate(total=Sum('amount'))
        .order_by('effective_category')
    )
    spend = _spend_by_category(
        (row['effective_category'], row['total']) for row in spending_rows
    )
    categories = [{'category': category, 'amount': amount} for category, amount in spend.items()]

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
    comparison_label = None
    if _include_previous and date_from and date.fromisoformat(date_from) <= end:
        prev_from, prev_to, comparison_label = _previous_period(date.fromisoformat(date_from), end)
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
        'comparison_label': comparison_label,
    }


def spending_trend(months=6):
    months = max(1, months)
    current = _today().replace(day=1)
    starts = [_shift_month(current, offset) for offset in range(1 - months, 1)]

    rows = (
        BankTransaction.objects
        .filter(booking_date__gte=starts[0], booking_date__lte=_today())
        .annotate(effective_category=Coalesce('category_override', 'category'))
        .exclude(effective_category__in=TRANSFER_CATEGORIES)
        .annotate(month=TruncMonth('booking_date'))
        .values('month', 'effective_category')
        .annotate(total=Sum('amount'))
    )
    nets_by_month = defaultdict(list)
    for row in rows:
        nets_by_month[row['month']].append((row['effective_category'], row['total']))

    first = BankTransaction.objects.aggregate(first=Min('booking_date'))['first']
    first_month = first.replace(day=1) if first else None

    return [
        {
            'month': start.strftime('%Y-%m'),
            'total': (
                None
                if first_month is None or start < first_month
                else sum(_spend_by_category(nets_by_month[start]).values(), Decimal('0'))
            ),
            'partial': start == current or start == first_month,
        }
        for start in starts
    ]


def _first_of_month(d):
    return d.replace(day=1)


def budget_progress():
    today = _today()
    start = _first_of_month(today)

    spent_by_category = dict(
        BankTransaction.objects
        .filter(booking_date__gte=start, booking_date__lte=today)
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
