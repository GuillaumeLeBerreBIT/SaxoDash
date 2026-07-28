from decimal import Decimal
from django.db.models import Sum, Case, When, F, DecimalField
from django.db.models.functions import TruncMonth

from .models import Transaction

AMOUNT = F('qty') * F('price')
MONEY_FIELD = DecimalField(max_digits=24, decimal_places=2)


def get_monthly_cash_flow():
    rows = (
        Transaction.objects
        .annotate(month=TruncMonth('date'))
        .values('month')
        .annotate(
            inflow=Sum(
                Case(
                    When(type__in=['DEPOSIT', 'DIVIDEND'], then=AMOUNT),
                    default=Decimal('0'),
                    output_field=MONEY_FIELD,
                )
            ),
            outflow=Sum(
                Case(
                    When(type='FEE', then=AMOUNT),
                    default=Decimal('0'),
                    output_field=MONEY_FIELD,
                )
            )
        ).order_by('month')
    )

    return [
        {
            'month': row['month'].strftime('%Y-%m'),
            'inflow': row['inflow'] or Decimal('0'),
            'outflow': row['outflow'] or Decimal('0'),
        }
        for row in rows]
