from cryptography.fernet import Fernet
from django.conf import settings
from django.core.checks import Error, register

GENERATE_HINT = (
    'Generate one with:\n'
    '  python -c "from cryptography.fernet import Fernet; '
    'print(Fernet.generate_key().decode())"\n'
    'then set SAXO_TOKEN_ENCRYPTION_KEY in backend/.env'
)


@register()
def check_environment(app_configs, **kwargs):
    """SAXO_ENVIRONMENT selects which Saxo host the client talks to.

    A typo here would otherwise raise KeyError deep inside a Celery task.
    """
    from .client import ENVIRONMENTS

    if settings.SAXO_ENVIRONMENT not in ENVIRONMENTS:
        return [Error(
            f'SAXO_ENVIRONMENT is {settings.SAXO_ENVIRONMENT!r}, which is not a '
            f'known Saxo environment.',
            hint=f'Use one of: {", ".join(sorted(ENVIRONMENTS))}',
            id='saxo.E003',
        )]
    return []


@register()
def check_token_encryption_key(app_configs, **kwargs):
    """Fail at startup if the key that decrypts Saxo tokens is missing or bad.

    Without this the setting's '' default reaches Fernet() only on the first
    credential read - which happens inside a Celery worker at 01:00 UTC, where
    it surfaces as an opaque cryptography error rather than a config problem.
    """
    key = settings.SAXO_TOKEN_ENCRYPTION_KEY

    if not key:
        return [Error(
            'SAXO_TOKEN_ENCRYPTION_KEY is unset, so Saxo tokens cannot be '
            'encrypted or decrypted.',
            hint=GENERATE_HINT,
            id='saxo.E001',
        )]

    try:
        Fernet(key.encode())
    except (ValueError, TypeError):
        return [Error(
            'SAXO_TOKEN_ENCRYPTION_KEY is not a valid Fernet key (it must be '
            '32 url-safe base64-encoded bytes).',
            hint=GENERATE_HINT,
            id='saxo.E002',
        )]

    return []
