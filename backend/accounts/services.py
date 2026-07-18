from .models import BankAccount
from decimal import Decimal

def get_total_bank_balance(queryset=None):
    
    queryset = queryset if queryset is not None else BankAccount.objects.all()
    return sum((b.balance for b in queryset), Decimal('0'))