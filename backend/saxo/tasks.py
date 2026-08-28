from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from portfolio.models import Position
from transactions.models import Transaction

from . import client, mapping
from .models import SaxoCredential
from accounts.models import BankAccount

REFRESH_MARGIN = timedelta(minutes=5)

@shared_task
def refresh_saxo_token():
    credential = SaxoCredential.objects.first()
    if not credential or credential.needs_reauth:
        return
    
    if credential.expires_at - timezone.now() > REFRESH_MARGIN:
        return
    
    try:
        token_data = client.refresh_access_token(credential.refresh_token)
    
    except client.SaxoAuthError:
        credential.needs_reauth = True
        credential.save(update_fields=['needs_reauth'])
        return
    
    credential.access_token = token_data['access_token']
    credential.refresh_token = token_data['refresh_token']
    credential.expires_at = timezone.now() + timedelta(seconds=token_data['expires_in'])
    credential.save(update_fields=['access_token', 'refresh_token', 'expires_at'])
    
@shared_task(autoretry_for=(client.SaxoAPIError,), retry_backoff=True, max_retries=3)
def sync_positions():
    credential = SaxoCredential.objects.first()
    if not credential or credential.needs_reauth:
        return

    saxo_positions = client.get_positions(credential.access_token)
    seen_tickers = []

    for raw_position in saxo_positions:
        try:
            fields = mapping.to_position_fields(raw_position)
        except (KeyError, TypeError):
            continue
        Position.objects.update_or_create(ticker=fields['ticker'], defaults=fields)
        seen_tickers.append(fields['ticker'])

    Position.objects.exclude(ticker__in=seen_tickers).delete()
    credential.last_synced_at = timezone.now()
    credential.save(update_fields=['last_synced_at'])


@shared_task(autoretry_for=(client.SaxoAPIError,), retry_backoff=True, max_retries=3)
def sync_transactions():
    credential = SaxoCredential.objects.first()
    if not credential or credential.needs_reauth:
        return

    # SIM never populates /hist/v1/transactions, so entry trades are derived
    # from the currently-open positions instead (mapping.to_transaction_fields).
    # Exit trades (SELL-side of a closed long) will be added from
    # /port/v1/closedpositions/me once a real closed-position payload exists to
    # map against - it was empty in SIM on 2026-08-27.
    saxo_positions = client.get_positions(credential.access_token)

    for raw_position in saxo_positions:
        try:
            fields = mapping.to_transaction_fields(raw_position)
        except (KeyError, TypeError):
            continue
        Transaction.objects.update_or_create(
            saxo_trade_id=fields['saxo_trade_id'], defaults=fields
        )

    credential.last_synced_at = timezone.now()
    credential.save(update_fields=['last_synced_at'])
    
@shared_task(autoretry_for=(client.SaxoAPIError,), retry_backoff=True, max_retries=3)
def sync_account_balance():
    credential = SaxoCredential.objects.first()
    if not credential or credential.needs_reauth:
        return
    
    saxo_balance = client.get_account_balance(credential.access_token)
    fields = mapping.to_account_fields(saxo_balance=saxo_balance)
    BankAccount.objects.update_or_create(bank='Saxo', defaults=fields)