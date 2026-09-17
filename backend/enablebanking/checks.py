from django.conf import settings
from django.core.checks import Error, register


@register()
def check_config(app_configs, **kwargs):
    """Fail at startup, not inside a Celery task at 3am, if the app-level
    Enable Banking credentials are missing."""
    errors = []

    if not settings.ENABLE_BANKING_APPLICATION_ID:
        errors.append(Error(
            'ENABLE_BANKING_APPLICATION_ID is unset.',
            hint='Register a production application at enablebanking.com/cp/applications '
                 'and set ENABLE_BANKING_APPLICATION_ID in backend/.env',
            id='enablebanking.E001',
        ))

    if not settings.ENABLE_BANKING_PRIVATE_KEY:
        errors.append(Error(
            'ENABLE_BANKING_PRIVATE_KEY is unset, so API requests cannot be signed.',
            hint='Set ENABLE_BANKING_PRIVATE_KEY in backend/.env to the contents of the '
                 '.pem file downloaded when registering the application.',
            id='enablebanking.E002',
        ))

    return errors
