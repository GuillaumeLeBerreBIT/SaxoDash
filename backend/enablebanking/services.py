from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import Coalesce

from .models import BankTransaction

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
