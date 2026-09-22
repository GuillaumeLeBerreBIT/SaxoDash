"""Re-applies categorize()+mark_transfers() to already-synced transactions.

A rule change (a new keyword, a new/edited ManualIbanLabel) only affects a
future sync's new fetches - the historical rows that prompted the change are
exactly the ones that need it applied retroactively. Used by both the
recategorize_bank_transactions management command (dry-run reporting) and
the labeled-accounts API (applied immediately when a label is saved).
"""
from .categorization import categorize
from .models import BankTransaction
from .transfers import mark_transfers


def recategorize(queryset=None):
    """Recomputes category for every transaction in `queryset` (default:
    every BankTransaction without a manual override). Returns the rows
    whose category actually changed - mutated in memory only, the caller
    decides whether/how to persist them.
    """
    if queryset is None:
        queryset = BankTransaction.objects.all()
    # A manual override is never touched, regardless of which queryset a
    # caller passes in.
    transactions = list(queryset.filter(category_override__isnull=True))
    before = {tx.pk: tx.category for tx in transactions}

    for tx in transactions:
        tx.category = categorize(tx.counterparty_name, tx.description, tx.amount)
    mark_transfers(transactions)

    return [tx for tx in transactions if tx.category != before[tx.pk]]


def recategorize_for_label(label):
    """Recomputes and persists category for just the rows this one label
    could plausibly match - its iban, or (when it has none) its exact
    counterparty_name on a row with no iban of its own. Applied immediately
    when a label is created/edited through the labeled-accounts API, so the
    effect is visible right away rather than waiting for the next sync or a
    manually-run command.
    """
    query = BankTransaction.objects.none()
    if label.iban:
        query = query | BankTransaction.objects.filter(counterparty_iban=label.iban)
    if label.counterparty_name:
        query = query | BankTransaction.objects.filter(
            counterparty_name__iexact=label.counterparty_name, counterparty_iban__isnull=True,
        )

    changed = recategorize(query.distinct())
    BankTransaction.objects.bulk_update(changed, ['category'])
    return changed
