"""Tags same-amount/opposite-sign/nearby-date transactions across different
own accounts as TRANSFER or SAVINGS, overriding whatever categorization.py
assigned. See docs/superpowers/specs/2026-09-18-bank-transactions-spending-design.md."""
from datetime import timedelta

from .models import BankTransaction, ManualIbanLabel

DATE_TOLERANCE = timedelta(days=2)


def mark_transfers(bank_transactions):
    manual_labels = {label.iban: label for label in ManualIbanLabel.objects.all()}
    batch = list(bank_transactions)

    for tx in batch:
        if tx.counterparty_iban and tx.counterparty_iban in manual_labels:
            tx.category = manual_labels[tx.counterparty_iban].category
            continue

        match = _find_own_account_match(tx, batch)
        if match is None:
            continue

        is_savings = 'savings' in tx.bank_account.type.lower() or 'savings' in match.bank_account.type.lower()
        tx.category = 'SAVINGS' if is_savings else 'TRANSFER'


def _find_own_account_match(tx, batch):
    window_start = tx.booking_date - DATE_TOLERANCE
    window_end = tx.booking_date + DATE_TOLERANCE

    for other in batch:
        if (
            other is not tx
            and other.bank_account_id != tx.bank_account_id
            and other.amount == -tx.amount
            and window_start <= other.booking_date <= window_end
        ):
            return other

    return (
        BankTransaction.objects
        .filter(amount=-tx.amount, booking_date__range=(window_start, window_end))
        .exclude(bank_account=tx.bank_account)
        .first()
    )
