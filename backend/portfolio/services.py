from decimal import Decimal
from .models import Position

def get_positions_total_value(queryset=None):
    queryset = queryset if queryset is not None else Position.objects.all()
    total = sum((p.qty * p.current_price for p in queryset), Decimal('0'))
    return total