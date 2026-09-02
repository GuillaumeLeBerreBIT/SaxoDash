from decimal import Decimal

from django.db.models import DecimalField, F, Sum

from .models import Position

MONEY_FIELD = DecimalField(max_digits=24, decimal_places=2)


def get_positions_total_value():
    """Total market value of all positions, summed in the database.

    Callers that already hold the rows should sum `Position.value` instead of
    paying for a second query.
    """
    total = Position.objects.aggregate(
        total=Sum(F('qty') * F('current_price'), output_field=MONEY_FIELD)
    )['total']
    return total if total is not None else Decimal('0')
