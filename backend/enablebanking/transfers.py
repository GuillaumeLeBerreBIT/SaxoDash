"""Tags same-amount/opposite-sign/nearby-date transactions across different
own accounts as TRANSFER or SAVINGS, overriding whatever categorization.py
assigned. See docs/superpowers/specs/2026-09-18-bank-transactions-spending-design.md."""
from datetime import timedelta

from .models import BankTransaction, ManualIbanLabel

DATE_TOLERANCE = timedelta(days=2)


def mark_transfers(bank_transactions):
    labels = list(ManualIbanLabel.objects.all())
    manual_by_iban = {label.iban: label for label in labels if label.iban}
    # Name-based labels only apply to a row with no IBAN at all - a row that
    # does carry an IBAN is matched by IBAN rules only, never by a name
    # coincidence (see test_manual_name_label_does_not_match_a_row_that_has_an_iban).
    manual_by_name = {label.counterparty_name: label for label in labels if label.counterparty_name}
    batch = list(bank_transactions)

    for tx in batch:
        if tx.counterparty_iban and tx.counterparty_iban in manual_by_iban:
            tx.category = manual_by_iban[tx.counterparty_iban].category
            continue
        if not tx.counterparty_iban:
            name = (tx.counterparty_name or '').strip().upper()
            if name and name in manual_by_name:
                tx.category = manual_by_name[name].category
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
