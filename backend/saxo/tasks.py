import functools
import inspect
import logging
from datetime import timedelta
from typing import NamedTuple

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from accounts.models import BankAccount
from portfolio.models import SAXO_SOURCE, PortfolioValuation, Position
from transactions.models import Transaction
from users.owner import owner

from . import client, mapping
from .credentials import SYNC_TASKS, SaxoNotConnected, active_credential
from .models import SaxoCredential, SyncRun

logger = logging.getLogger(__name__)

REFRESH_MARGIN = timedelta(minutes=5)
CREATE_ONLY_FIELDS = frozenset({'sector'})


class SyncReport(NamedTuple):
    rows: int
    detail: str = ''
    outcome: str = 'ok'


def _upsert_transaction(user, fields):
    transaction_row, created = Transaction.objects.update_or_create(
        user=user,
        saxo_trade_id=fields['saxo_trade_id'],
        defaults={key: value for key, value in fields.items() if key != 'fx_rate'},
        create_defaults=fields,
    )
    if not created and transaction_row.fx_rate is None and fields['fx_rate'] is not None:
        transaction_row.fx_rate = fields['fx_rate']
        transaction_row.save(update_fields=['fx_rate'])
    return transaction_row

SYNC_TASK = {
    # Only transient failures retry - a permanent 4xx/malformed-body error
    # (client.SaxoPermanentError) needs a code fix or user action, not three
    # retries with backoff that cannot possibly help it succeed.
    'autoretry_for': (client.SaxoTransientError,),
    'retry_backoff': True,
    'max_retries': 3,
}


CREDENTIAL_MODES = ('each', 'owner', None)
NO_OWNER = 'No user is the owner of this instance.'


def _recorded(name, user, fn, leading, args, kwargs, *, atomic):
    try:
        if atomic:
            with transaction.atomic():
                result = fn(*leading, *args, **kwargs)
        else:
            result = fn(*leading, *args, **kwargs)
    except Exception as exc:
        SyncRun.objects.create(task=name, user=user, outcome='failed', detail=str(exc)[:200])
        raise
    report = result if isinstance(result, SyncReport) else SyncReport(result)
    SyncRun.objects.create(
        task=name, user=user, outcome=report.outcome, rows=report.rows, detail=report.detail[:200],
    )
    return report.rows


def _skipped(name, user, reason):
    SyncRun.objects.create(task=name, user=user, outcome='skipped', detail=str(reason)[:200])
    logger.info('Skipping %s for %s: %s', name, user, reason)


def _run_for_owner(name, fn, args, kwargs):
    user = owner()
    if user is None:
        _skipped(name, None, NO_OWNER)
        return None
    try:
        credential = active_credential(user)
    except SaxoNotConnected as exc:
        _skipped(name, user, exc)
        return None
    return _recorded(name, user, fn, (credential,), args, kwargs, atomic=False)


def _run_for_each(name, fn, args, kwargs):
    users = [credential.user for credential in SaxoCredential.objects.select_related('user').order_by('user_id')]
    if not users:
        _skipped(name, None, 'Saxo is not connected.')
        return None
    rows = 0
    errors = []
    for user in users:
        try:
            credential = active_credential(user)
        except SaxoNotConnected as exc:
            _skipped(name, user, exc)
            continue
        try:
            rows += _recorded(name, user, fn, (credential,), args, kwargs, atomic=True)
        except Exception as exc:
            errors.append(exc)
    _raise_first(name, errors)
    return rows


def _raise_first(name, errors):
    for later in errors[1:]:
        logger.error('%s also failed: %r', name, later)
    if errors:
        raise errors[0]


def synced(fn=None, *, reports_health=True, task=None, credential='each'):
    """Give `fn` a usable credential and record what the run actually did.

    Every sync shared the same preamble - get a credential or bail - and bailed
    with a bare `return`, which Celery logs as a success. One wrapper instead
    keeps each task body to the work itself and makes a skip as visible as a
    completion. `fn` returns the number of rows it wrote.
    """
    if credential not in CREDENTIAL_MODES:
        raise ValueError(f'credential must be one of {CREDENTIAL_MODES}, not {credential!r}')
    if fn is None:
        return functools.partial(
            synced, reports_health=reports_health, task=task, credential=credential,
        )
    name = task or fn.__name__
    if reports_health and name not in SYNC_TASKS:
        raise ValueError(f'{name} is not declared in saxo.credentials.SYNC_TASKS')

    @functools.wraps(fn)
    def run(*args, **kwargs):
        if credential == 'each':
            return _run_for_each(name, fn, args, kwargs)
        if credential == 'owner':
            return _run_for_owner(name, fn, args, kwargs)
        return _recorded(name, None, fn, (), args, kwargs, atomic=False)

    # functools.wraps sets __wrapped__ and inspect.signature follows it, so
    # Celery validated calls against fn's own signature - credential included -
    # and rejected beat's argument-less call. Report what callers actually pass.
    if credential is not None:
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
    errors = []
    for credential in SaxoCredential.objects.filter(needs_reauth=False).order_by('user_id'):
        try:
            _refresh(credential)
        except Exception as exc:
            errors.append(exc)
    _raise_first('refresh_saxo_token', errors)


def _refresh(credential):
    if credential.expires_at - timezone.now() > REFRESH_MARGIN:
        return

    try:
        token_data = client.refresh_access_token(credential.refresh_token)
        access_token = token_data['access_token']
        refresh_token = token_data['refresh_token']
        expires_in = int(token_data['expires_in'])
    except client.SaxoAuthError:
        logger.warning('Saxo token refresh rejected for user %s; re-authentication required', credential.user_id)
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
    """Also writes the entry-trade ledger from the same fetch (see mapping.to_transaction_fields:
    SIM never populates /hist/v1/transactions, so entry trades are derived from open positions;
    exit trades await a real closed-position payload). One fetch feeding both tables means they
    can no longer silently diverge by running on separate schedules."""
    saxo_positions = client.get_positions(credential.access_token)
    raw_rows = saxo_positions or []
    positions = list(_mapped_rows(raw_rows, mapping.to_position_fields))
    trades = list(_mapped_rows(raw_rows, mapping.to_transaction_fields))
    unreadable = len(raw_rows) - min(len(positions), len(trades))
    complete = saxo_positions is not None and not unreadable

    # Upsert and prune together, so a failure mid-loop cannot prune against a
    # half-built list of seen tickers.
    merged = mapping.merge_lots(positions)
    seen_tickers = [fields['ticker'] for fields in merged]
    with transaction.atomic():
        if complete:
            for fields in merged:
                synced = {key: value for key, value in fields.items() if key not in CREATE_ONLY_FIELDS}
                Position.objects.update_or_create(
                    user=credential.user, ticker=fields['ticker'], defaults=synced, create_defaults=fields
                )
            Position.objects.filter(user=credential.user).exclude(ticker__in=seen_tickers).delete()

        for fields in trades:
            _upsert_transaction(credential.user, fields)

    if complete:
        return len(seen_tickers)
    return SyncReport(len(seen_tickers), _incomplete_detail(saxo_positions, unreadable), outcome='incomplete')


def _incomplete_detail(saxo_positions, unreadable):
    if saxo_positions is None:
        return 'Saxo sent no positions field; every position was kept.'
    total = len(saxo_positions)
    return f'Read {total - unreadable} of {total} Saxo positions; positions missing from the reply were kept.'


@shared_task(**SYNC_TASK)
@synced
def sync_closed_positions(credential):
    """Exit trades (SELL/cover rows), from a separate Saxo endpoint than the
    entry trades sync_positions derives - see mapping.to_closed_transaction_fields."""
    saxo_closed_positions = client.get_closed_positions(credential.access_token)

    rows = 0
    with transaction.atomic():
        for fields in _mapped_rows(saxo_closed_positions, mapping.to_closed_transaction_fields):
            _upsert_transaction(credential.user, fields)
            rows += 1

    return rows


@shared_task(**SYNC_TASK)
@synced
def sync_account_balance(credential):
    saxo_balance = client.get_account_balance(credential.access_token)
    valuation = mapping.to_valuation_fields(saxo_balance=saxo_balance)

    with transaction.atomic():
        BankAccount.objects.update_or_create(
            user=credential.user,
            external_id=mapping.SAXO_CASH_ACCOUNT_ID,
            defaults=mapping.to_account_fields(saxo_balance=saxo_balance),
        )
        if valuation:
            PortfolioValuation.objects.update_or_create(
                user=credential.user, source=SAXO_SOURCE, defaults=valuation
            )

    if not valuation:
        logger.warning(
            'Saxo sent no account valuation; portfolio value falls back to our '
            'own marks, which may be worse than the broker figure.'
        )

    return 1 if valuation else 0
