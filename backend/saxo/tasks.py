import functools
import inspect
import logging
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from accounts.models import BankAccount
from portfolio.models import SAXO_SOURCE, PortfolioValuation, Position
from transactions.models import Transaction

from . import client, mapping
from .credentials import SaxoNotConnected, active_credential
from .models import SaxoCredential, SyncRun

logger = logging.getLogger(__name__)

REFRESH_MARGIN = timedelta(minutes=5)

SYNC_TASK = {
    'autoretry_for': (client.SaxoAPIError,),
    'retry_backoff': True,
    'max_retries': 3,
}


class SyncRefused(Exception):
    """Raised when a sync would corrupt what it is meant to keep current."""


def synced(fn):
    """Give `fn` a usable credential and record what the run actually did.

    Every sync shared the same preamble - get a credential or bail - and bailed
    with a bare `return`, which Celery logs as a success. One wrapper instead
    keeps each task body to the work itself and makes a skip as visible as a
    completion. `fn` returns the number of rows it wrote.
    """
    @functools.wraps(fn)
    def run(*args, **kwargs):
        try:
            credential = active_credential()
        except SaxoNotConnected as exc:
            SyncRun.objects.create(task=fn.__name__, outcome='skipped', detail=str(exc))
            logger.info('Skipping %s: %s', fn.__name__, exc)
            return

        try:
            rows = fn(credential, *args, **kwargs)
        except Exception as exc:
            SyncRun.objects.create(
                task=fn.__name__, outcome='failed', detail=str(exc)[:200]
            )
            raise

        SyncRun.objects.create(task=fn.__name__, outcome='ok', rows=rows)
        return rows

    # functools.wraps sets __wrapped__ and inspect.signature follows it, so
    # Celery validated calls against fn's own signature - credential included -
    # and rejected beat's argument-less call. Report what callers actually pass.
    run.__signature__ = inspect.Signature(
        list(inspect.signature(fn).parameters.values())[1:]
    )
    return run


def _mapped_rows(raw_rows, to_fields):
    for raw_row in raw_rows:
        try:
            yield to_fields(raw_row)
        # ArithmeticError too: a null in a numeric field raises decimal's
        # InvalidOperation, which is not a ValueError.
        except (KeyError, TypeError, ValueError, ArithmeticError) as exc:
            logger.warning(
                'Skipping Saxo row that %s could not map: %r', to_fields.__name__, exc
            )


@shared_task
def refresh_saxo_token():
    """Not a @synced task: an expired access token is this one's trigger, not
    its blocker, since it authenticates with the refresh token."""
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
@synced
def sync_positions(credential):
    saxo_positions = client.get_positions(credential.access_token)

    # Upsert and prune together, so a failure mid-loop cannot prune against a
    # half-built list of seen tickers.
    with transaction.atomic():
        seen_tickers = []
        for fields in _mapped_rows(saxo_positions, mapping.to_position_fields):
            Position.objects.update_or_create(ticker=fields['ticker'], defaults=fields)
            seen_tickers.append(fields['ticker'])

        # Saxo returning nothing is a real "you hold nothing" and should prune.
        # Rows that all failed to map is a bug on our side, and pruning against
        # it would delete the whole book.
        if saxo_positions and not seen_tickers:
            raise SyncRefused(
                f'Saxo returned {len(saxo_positions)} positions and none could be '
                f'mapped; refusing to prune the portfolio to empty.'
            )

        Position.objects.exclude(ticker__in=seen_tickers).delete()

    return len(seen_tickers)


@shared_task(**SYNC_TASK)
@synced
def sync_transactions(credential):
    # SIM never populates /hist/v1/transactions, so entry trades come from open
    # positions instead; exit trades await a real closed-position payload.
    saxo_positions = client.get_positions(credential.access_token)

    written = 0
    for fields in _mapped_rows(saxo_positions, mapping.to_transaction_fields):
        Transaction.objects.update_or_create(
            saxo_trade_id=fields['saxo_trade_id'], defaults=fields
        )
        written += 1

    return written


@shared_task(**SYNC_TASK)
@synced
def sync_account_balance(credential):
    saxo_balance = client.get_account_balance(credential.access_token)
    valuation = mapping.to_valuation_fields(saxo_balance=saxo_balance)

    with transaction.atomic():
        BankAccount.objects.update_or_create(
            external_id=mapping.SAXO_CASH_ACCOUNT_ID,
            defaults=mapping.to_account_fields(saxo_balance=saxo_balance),
        )
        if valuation:
            PortfolioValuation.objects.update_or_create(
                source=SAXO_SOURCE, defaults=valuation
            )

    if not valuation:
        logger.warning(
            'Saxo sent no account valuation; portfolio value falls back to our '
            'own marks, which may be worse than the broker figure.'
        )

    return 1 if valuation else 0
