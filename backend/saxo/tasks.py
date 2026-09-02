import logging
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from portfolio.models import Position
from transactions.models import Transaction

from . import client, mapping
from .models import SaxoCredential
from accounts.models import BankAccount

logger = logging.getLogger(__name__)

REFRESH_MARGIN = timedelta(minutes=5)

SYNC_TASK = {
    'autoretry_for': (client.SaxoAPIError,),
    'retry_backoff': True,
    'max_retries': 3,
}


def _usable_credential():
    """The credential the sync tasks may call Saxo with, or None to skip.

    Not used by `refresh_saxo_token`: an expired access token is that task's
    trigger, not its blocker, since it authenticates with the refresh token.
    """
    credential = SaxoCredential.objects.first()
    if not credential or credential.needs_reauth:
        return None
    if credential.expires_at <= timezone.now():
        return None
    return credential


def _mapped_rows(raw_rows, to_fields):
    for raw_row in raw_rows:
        try:
            yield to_fields(raw_row)
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning(
                'Skipping Saxo row that %s could not map: %r', to_fields.__name__, exc
            )


def _stamp_synced(credential):
    credential.last_synced_at = timezone.now()
    credential.save(update_fields=['last_synced_at'])


@shared_task
def refresh_saxo_token():
    credential = SaxoCredential.objects.first()
    if not credential or credential.needs_reauth:
        return

    if credential.expires_at - timezone.now() > REFRESH_MARGIN:
        return

    try:
        token_data = client.refresh_access_token(credential.refresh_token)
        access_token = token_data['access_token']
        refresh_token = token_data['refresh_token']
        expires_in = int(token_data['expires_in'])
    except client.SaxoAuthError:
        logger.warning('Saxo token refresh rejected; re-authentication required')
        credential.needs_reauth = True
        credential.save(update_fields=['needs_reauth'])
        return

    credential.access_token = access_token
    credential.refresh_token = refresh_token
    credential.expires_at = timezone.now() + timedelta(seconds=expires_in)
    credential.save(update_fields=['access_token', 'refresh_token', 'expires_at'])


@shared_task(**SYNC_TASK)
def sync_positions():
    credential = _usable_credential()
    if not credential:
        return

    saxo_positions = client.get_positions(credential.access_token)

    # Upsert and prune together, so a failure mid-loop cannot prune against a
    # half-built list of seen tickers.
    with transaction.atomic():
        seen_tickers = []
        for fields in _mapped_rows(saxo_positions, mapping.to_position_fields):
            Position.objects.update_or_create(ticker=fields['ticker'], defaults=fields)
            seen_tickers.append(fields['ticker'])

        Position.objects.exclude(ticker__in=seen_tickers).delete()

    _stamp_synced(credential)


@shared_task(**SYNC_TASK)
def sync_transactions():
    credential = _usable_credential()
    if not credential:
        return

    # SIM never populates /hist/v1/transactions, so entry trades come from open
    # positions instead; exit trades await a real closed-position payload.
    saxo_positions = client.get_positions(credential.access_token)

    for fields in _mapped_rows(saxo_positions, mapping.to_transaction_fields):
        Transaction.objects.update_or_create(
            saxo_trade_id=fields['saxo_trade_id'], defaults=fields
        )

    _stamp_synced(credential)


@shared_task(**SYNC_TASK)
def sync_account_balance():
    credential = _usable_credential()
    if not credential:
        return

    saxo_balance = client.get_account_balance(credential.access_token)
    fields = mapping.to_account_fields(saxo_balance=saxo_balance)
    BankAccount.objects.update_or_create(bank='Saxo', defaults=fields)

    _stamp_synced(credential)
