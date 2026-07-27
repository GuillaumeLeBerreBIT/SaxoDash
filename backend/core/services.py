from django.utils import timezone

from portfolio.services import get_positions_total_value
from accounts.services import get_total_bank_balance

from .models import NetWorthSnapshot

def ensure_todays_snapshot():
    today = timezone.localdate()
    snapshot = NetWorthSnapshot.objects.filter(date=today).first()
    
    if snapshot:
        return snapshot
    
    portfolio_value = get_positions_total_value()
    bank_total = get_total_bank_balance()
    return NetWorthSnapshot.objects.create(
        date=today,
        portfolio_value=portfolio_value,
        bank_total=bank_total,
        net_worth=portfolio_value + bank_total,
    )