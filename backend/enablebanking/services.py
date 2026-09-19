from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import Coalesce, TruncMonth

from .models import BankTransaction, Budget

TRANSFER_CATEGORIES = ('TRANSFER', 'SAVINGS')


def spending_summary(date_from=None, date_to=None):
    qs = BankTransaction.objects.filter(amount__lt=0)
    if date_from:
        qs = qs.filter(booking_date__gte=date_from)
    if date_to:
        qs = qs.filter(booking_date__lte=date_to)

    rows = (
        qs.annotate(effective_category=Coalesce('category_override', 'category'))
        .values('effective_category')
        .annotate(total=Sum('amount'))
        .order_by('effective_category')
    )

    by_category = {row['effective_category']: -row['total'] for row in rows}
    transfers_total = sum(
        (by_category.pop(cat, Decimal('0')) for cat in TRANSFER_CATEGORIES), Decimal('0'),
    )

    return {
        'categories': [{'category': k, 'amount': v} for k, v in by_category.items()],
        'total': sum(by_category.values(), Decimal('0')),
        'transfers': transfers_total,
    }


def spending_trend(months=6):
    qs = (
        BankTransaction.objects
        .filter(amount__lt=0)
        .annotate(effective_category=Coalesce('category_override', 'category'))
        .exclude(effective_category__in=TRANSFER_CATEGORIES)
        .annotate(month=TruncMonth('booking_date'))
        .values('month')
        .annotate(total=Sum('amount'))
        .order_by('month')
    )
    rows = [{'month': row['month'].strftime('%Y-%m'), 'total': -row['total']} for row in qs]
    return rows[-months:]


def _first_of_month(d):
    return d.replace(day=1)


def _first_of_next_month(d):
    if d.month == 12:
        return date(d.year + 1, 1, 1)
    return date(d.year, d.month + 1, 1)


def budget_progress():
    today = date.today()
    start = _first_of_month(today)
    end = _first_of_next_month(today)

    spent_by_category = dict(
        BankTransaction.objects
        .filter(amount__lt=0, booking_date__gte=start, booking_date__lt=end)
        .annotate(effective_category=Coalesce('category_override', 'category'))
        .values('effective_category')
        .annotate(total=Sum('amount'))
        .values_list('effective_category', 'total')
    )

    rows = []
    for budget in Budget.objects.all().order_by('category'):
        spent = -spent_by_category.get(budget.category, Decimal('0'))
        rows.append({
            'category': budget.category,
            'limit': budget.monthly_limit,
            'spent': spent,
            'pct': float(spent / budget.monthly_limit * 100),
        })
    return rows
