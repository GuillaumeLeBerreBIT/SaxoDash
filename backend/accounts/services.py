from django.conf import settings

from core.money import Money
from saxo.mapping import SAXO_CASH_ACCOUNT_ID

from .models import BankAccount


def get_total_bank_balance():
    """Total across bank accounts, in REPORTING_CURRENCY.

    Raises CurrencyMismatch on a foreign-currency account rather than adding
    it as if it were local - there is no rate on BankAccount to convert with.
    """
    return Money.total(
        (Money(account.balance, account.currency)
         for account in BankAccount.objects.all()),
        settings.REPORTING_CURRENCY,
    )


def get_bank_only_balance():
    return Money.total(
        (Money(account.balance, account.currency)
         for account in BankAccount.objects.exclude(external_id=SAXO_CASH_ACCOUNT_ID)),
        settings.REPORTING_CURRENCY,
    )
