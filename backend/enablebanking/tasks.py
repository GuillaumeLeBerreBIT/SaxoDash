import logging
from datetime import date

from celery import shared_task

from accounts.models import BankAccount

from . import categorization, client, credentials, mapping, subscriptions, transfers
from .models import BankSyncRun, BankTransaction

logger = logging.getLogger(__name__)


def _sync_one_bank(bank):
    state = credentials.connection_state(bank)

    if not state.connected:
        return ('skipped', state.reason, 0), None

    if state.needs_reauth:
        if not state.credential.needs_reauth:
            # First time this run notices the lapse - persist it so the
            # status endpoint can surface "Reconnect" without waiting for a
            # second sync tick.
            state.credential.needs_reauth = True
            state.credential.save(update_fields=['needs_reauth'])
        return ('skipped', state.reason, 0), None

    credential = state.credential
    rows = 0
    errors = []
    for account in credential.linked_accounts:
        try:
            balance_response = client.get_balances(credential.session_id, account['uid'])
        except client.EnableBankingAPIError as exc:
            logger.warning('Skipping %s account %s: %s', bank, account['uid'], exc)
            errors.append(exc)
            continue

        fields = mapping.to_account_fields(bank, account, balance_response)
        BankAccount.objects.update_or_create(
            external_id=f'enablebanking:{bank}:{account["uid"]}', defaults=fields,
        )
        rows += 1

    return _outcome(errors, succeeded=rows, rows=rows), _transient_outage(errors, succeeded=rows)


def _outcome(errors, succeeded, rows):
    messages = '; '.join(str(error) for error in errors)
    if errors and succeeded == 0:
        return 'failed', messages[:200], 0
    if errors:
        return 'ok', f'{len(errors)} account(s) failed: ' + messages[:150], rows
    return 'ok', '', rows


def _transient_outage(errors, succeeded):
    if succeeded == 0 and errors and all(
        isinstance(error, client.EnableBankingTransientError) for error in errors
    ):
        return errors[-1]
    return None


def _retry_on(outages):
    outage = next((outage for outage in outages if outage is not None), None)
    if outage is not None:
        raise outage


@shared_task(autoretry_for=(client.EnableBankingTransientError,), retry_backoff=True, max_retries=3)
def sync_enablebanking_balances():
    total = 0
    outages = []
    for bank in credentials.BANKS:
        (outcome, detail, rows), outage = _sync_one_bank(bank)
        BankSyncRun.objects.create(bank=bank, outcome=outcome, detail=(detail or '')[:200], rows=rows)
        outages.append(outage)
        total += rows
    _retry_on(outages)
    return total


def _fetch_transactions_for_account(bank, credential, account):
    """Fetches and maps new transactions for one linked account into unsaved
    BankTransaction instances - categorized, but not yet transfer-checked or
    persisted. Kept separate from persistence so the caller can combine every
    account's new transactions into one list before running mark_transfers:
    doing it per-account would mean a same-run KBC<->Argenta transfer pair
    could never see each other in the same batch (see transfers.py)."""
    account_uid = account['uid']
    bank_account = BankAccount.objects.filter(
        external_id=f'enablebanking:{bank}:{account_uid}'
    ).first()
    if bank_account is None:
        return []

    latest = (
        BankTransaction.objects.filter(bank_account=bank_account)
        .order_by('-booking_date').first()
    )
    fetch_kwargs = {'strategy': 'longest'} if latest is None else {'date_from': str(latest.booking_date)}

    batch = []
    for raw in client.iter_transactions(credential.session_id, account_uid, **fetch_kwargs):
        if raw.get('status') != 'BOOK':
            continue
        fields = mapping.to_bank_transaction_fields(bank, account_uid, raw)
        # mapping returns booking_date as the raw API date string; transfers.py
        # does date arithmetic on it before this row is ever saved (which is
        # the only point Django would otherwise parse it), so convert now.
        fields['booking_date'] = date.fromisoformat(fields['booking_date'])
        tx = BankTransaction(bank_account=bank_account, **fields)
        tx.category = categorization.categorize(tx.counterparty_name, tx.description, tx.amount)
        batch.append(tx)

    return batch


def _persist(batch):
    for tx in batch:
        BankTransaction.objects.update_or_create(
            external_id=tx.external_id,
            defaults={
                'bank': tx.bank, 'bank_account': tx.bank_account, 'amount': tx.amount,
                'currency': tx.currency, 'booking_date': tx.booking_date,
                'counterparty_name': tx.counterparty_name, 'counterparty_iban': tx.counterparty_iban,
                'description': tx.description, 'category': tx.category,
            },
        )


@shared_task(autoretry_for=(client.EnableBankingTransientError,), retry_backoff=True, max_retries=3)
def sync_enablebanking_transactions():
    all_new = []
    outages = []
    run_info = []  # (bank, outcome, detail, rows), recorded after persisting

    for bank in credentials.BANKS:
        state = credentials.connection_state(bank)

        if not state.usable:
            run_info.append((bank, 'skipped', state.reason or '', 0))
            continue

        bank_batch = []
        errors = []
        succeeded = 0
        for account in state.credential.linked_accounts:
            try:
                bank_batch += _fetch_transactions_for_account(bank, state.credential, account)
            except client.EnableBankingAPIError as exc:
                logger.warning('Skipping %s account %s transactions: %s', bank, account['uid'], exc)
                errors.append(exc)
                continue
            succeeded += 1

        run_info.append((bank, *_outcome(errors, succeeded, len(bank_batch))))
        outages.append(_transient_outage(errors, succeeded))
        all_new += bank_batch

    # Every bank's new transactions are combined before transfer detection
    # runs once, so a KBC<->Argenta transfer pair synced in the same run can
    # match each other regardless of which bank was processed first.
    transfers.mark_transfers(all_new)
    _persist(all_new)

    for bank, outcome, detail, rows in run_info:
        BankSyncRun.objects.create(bank=bank, kind='transactions', outcome=outcome, detail=detail[:200], rows=rows)

    _retry_on(outages)
    return len(all_new)


@shared_task
def detect_enablebanking_subscriptions():
    return subscriptions.detect_subscriptions()
