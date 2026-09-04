from datetime import timedelta

from django.utils import timezone

from .models import SaxoCredential, SyncRun

# Past this much expiry the refresh cycle has clearly failed rather than simply
# not run yet, so the user has to reconnect.
REAUTH_GRACE = timedelta(minutes=15)


class SaxoNotConnected(Exception):
    """No credential usable for a Saxo call right now."""


def active_credential():
    """The credential a caller may talk to Saxo with.

    Raises rather than returning None because every caller that asks for one
    cannot proceed without it; the request-serving side turns this into a 409
    and the background tasks catch it to record a skipped run.
    """
    credential = SaxoCredential.objects.first()
    if not credential:
        raise SaxoNotConnected('Saxo is not connected.')
    if credential.needs_reauth:
        raise SaxoNotConnected('Saxo needs re-authentication.')
    if credential.expires_at <= timezone.now():
        raise SaxoNotConnected('The Saxo access token has expired.')
    return credential


def needs_reauthentication(credential):
    """Whether the user has to act, as opposed to the refresh cycle catching up.

    Separate from `active_credential`, which refuses the moment a token expires:
    a token seconds past expiry stops syncs but is not yet the user's problem.
    """
    return (
        credential.needs_reauth
        or credential.expires_at <= timezone.now() - REAUTH_GRACE
    )


def last_successful_sync():
    return SyncRun.objects.filter(outcome='ok').first()
