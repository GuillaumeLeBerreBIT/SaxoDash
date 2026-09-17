import logging

from celery import shared_task

from accounts.models import BankAccount

from . import client, credentials, mapping
from .models import BankSyncRun

logger = logging.getLogger(__name__)


def _sync_one_bank(bank):
    state = credentials.connection_state(bank)

    if not state.connected:
        return 'skipped', state.reason, 0

    if state.needs_reauth:
        if not state.credential.needs_reauth:
            # First time this run notices the lapse - persist it so the
            # status endpoint can surface "Reconnect" without waiting for a
            # second sync tick.
            state.credential.needs_reauth = True
            state.credential.save(update_fields=['needs_reauth'])
        return 'skipped', state.reason, 0

    credential = state.credential
    rows = 0
    for account in credential.linked_accounts:
        try:
            balance_response = client.get_balances(credential.session_id, account['uid'])
        except client.EnableBankingAPIError as exc:
            logger.warning('Skipping %s account %s: %s', bank, account['uid'], exc)
            continue

        fields = mapping.to_account_fields(bank, account, balance_response)
        BankAccount.objects.update_or_create(
            external_id=f'enablebanking:{bank}:{account["uid"]}', defaults=fields,
        )
        rows += 1

    return 'ok', '', rows


@shared_task(autoretry_for=(client.EnableBankingAPIError,), retry_backoff=True, max_retries=3)
def sync_enablebanking_balances():
    total = 0
    for bank in credentials.BANKS:
        outcome, detail, rows = _sync_one_bank(bank)
        BankSyncRun.objects.create(bank=bank, outcome=outcome, detail=(detail or '')[:200], rows=rows)
        total += rows
    return total
