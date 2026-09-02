from django.utils import timezone

from .models import SaxoCredential


class SaxoNotConnected(Exception):
    """No credential usable for a Saxo call right now."""


def active_credential():
    """The credential a caller may talk to Saxo with.

    Raises rather than returning None because every caller that asks for one
    cannot proceed without it; the request-serving side turns this into a 409
    and the background tasks catch it to skip a tick.
    """
    credential = SaxoCredential.objects.first()
    if not credential:
        raise SaxoNotConnected('Saxo is not connected.')
    if credential.needs_reauth:
        raise SaxoNotConnected('Saxo needs re-authentication.')
    if credential.expires_at <= timezone.now():
        raise SaxoNotConnected('The Saxo access token has expired.')
    return credential
