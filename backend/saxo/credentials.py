from dataclasses import dataclass
from datetime import timedelta

from django.utils import timezone

from .models import SaxoCredential, SyncRun

# Past this much expiry the refresh cycle has clearly failed rather than simply
# not run yet, so the user has to reconnect.
REAUTH_GRACE = timedelta(minutes=15)


class SaxoNotConnected(Exception):
    """No credential usable for a Saxo call right now."""


@dataclass(frozen=True)
class ConnectionState:
    """Everything anyone may ask about the app's Saxo connection.

    One value rather than two predicates: the status endpoint and the
    market-data path used to answer "connected?" separately, with different
    thresholds, and contradicted each other on screen for the fifteen minutes
    between token expiry and the reauth grace running out.
    """

    credential: SaxoCredential | None
    reason: str | None
    needs_reauth: bool

    @property
    def connected(self):
        return self.credential is not None

    @property
    def usable(self):
        return self.reason is None


def connection_state():
    credential = SaxoCredential.objects.first()
    if not credential:
        return ConnectionState(None, 'Saxo is not connected.', False)
    if credential.needs_reauth:
        return ConnectionState(credential, 'Saxo needs re-authentication.', True)
    if credential.expires_at <= timezone.now():
        # Expired stops calls immediately; only past the grace is it the
        # user's problem rather than the refresh cycle's.
        return ConnectionState(
            credential,
            'The Saxo access token has expired.',
            credential.expires_at <= timezone.now() - REAUTH_GRACE,
        )
    return ConnectionState(credential, None, False)


def active_credential():
    """The credential a caller may talk to Saxo with.

    Raises rather than returning None because every caller that asks for one
    cannot proceed without it; the request-serving side turns this into a 409
    and the background tasks catch it to record a skipped run.
    """
    state = connection_state()
    if not state.usable:
        raise SaxoNotConnected(state.reason)
    return state.credential


def last_successful_sync():
    return SyncRun.objects.filter(outcome='ok').first()
