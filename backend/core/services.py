from django.utils import timezone

from accounts.services import get_total_bank_balance
from portfolio.services import get_positions_total_value

from .models import NetWorthSnapshot


def ensure_todays_snapshot():
    today = timezone.localdate()
    snapshot = NetWorthSnapshot.objects.filter(date=today).first()

    if snapshot:
        return snapshot

    portfolio_value = get_positions_total_value()
    bank_total = get_total_bank_balance()

    # get_or_create, not create: the view and the Celery task can both land here
    # at once, and `date` is unique.
    snapshot, _ = NetWorthSnapshot.objects.get_or_create(
        date=today,
        defaults={
            'portfolio_value': portfolio_value,
            'bank_total': bank_total,
            'net_worth': portfolio_value + bank_total,
        },
    )
    return snapshot
