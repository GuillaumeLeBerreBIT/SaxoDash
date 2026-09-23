from dataclasses import dataclass

from django.utils import timezone

from .models import BankSyncRun, EnableBankingCredential

BANKS = ('kbc', 'argenta')
BANK_LABELS = {'kbc': 'KBC', 'argenta': 'Argenta'}


class EnableBankingNotConnected(Exception):
    """No credential usable for this bank right now."""


@dataclass(frozen=True)
class ConnectionState:
    credential: EnableBankingCredential | None
    reason: str | None
    needs_reauth: bool

    @property
    def connected(self):
        return self.credential is not None

    @property
    def usable(self):
        return self.reason is None


def connection_state(bank):
    label = BANK_LABELS[bank]
    credential = EnableBankingCredential.objects.filter(bank=bank).first()
    if not credential:
        return ConnectionState(None, f'{label} is not connected.', False)
    if credential.needs_reauth:
        return ConnectionState(credential, f'{label} needs re-authentication.', True)
    if credential.valid_until <= timezone.now():
        return ConnectionState(credential, f'{label} consent has expired.', True)
    return ConnectionState(credential, None, False)


def active_credential(bank):
    state = connection_state(bank)
    if not state.usable:
        raise EnableBankingNotConnected(state.reason)
    return state.credential


def last_successful_sync(bank):
    return BankSyncRun.objects.filter(bank=bank, outcome='ok').first()


# Weakest first, so the badge reflects the worst thing currently happening -
# same reasoning and order as saxo.credentials._OUTCOME_RANK.
_OUTCOME_RANK = ['failed', 'skipped', 'ok']


def latest_run_per_kind(bank):
    """The newest run of each sync kind (balances, transactions) for one
    bank. The newest run overall answers "what ran last", not "is anything
    broken" - a balances sync failing on every tick was hidden the moment a
    later transactions sync succeeded."""
    latest = {}
    for run in BankSyncRun.objects.filter(bank=bank):
        latest.setdefault(run.kind, run)
    return list(latest.values())


def worst_recent_outcome(bank):
    """The worst outcome among this bank's most recent run of each kind, or
    None if nothing has run yet."""
    outcomes = {run.outcome for run in latest_run_per_kind(bank)}
    return next((outcome for outcome in _OUTCOME_RANK if outcome in outcomes), None)
