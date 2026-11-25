from django.conf import settings

from core.money import Money
from saxo.mapping import SAXO_CASH_ACCOUNT_ID

from .models import BankAccount


def get_broker_cash_balance(user):
    return Money.total(
        (Money(account.balance, account.currency)
         for account in BankAccount.objects.filter(user=user, external_id=SAXO_CASH_ACCOUNT_ID)),
        settings.REPORTING_CURRENCY,
    )
