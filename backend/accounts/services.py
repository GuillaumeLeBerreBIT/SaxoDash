from decimal import Decimal

from django.db.models import Sum

from .models import BankAccount


def get_total_bank_balance():
    total = BankAccount.objects.aggregate(total=Sum('balance'))['total']
    return total if total is not None else Decimal('0')
