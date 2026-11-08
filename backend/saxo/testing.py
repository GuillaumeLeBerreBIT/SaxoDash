import itertools
from datetime import timedelta

from django.utils import timezone

from users.testing import make_user

from .models import SaxoCredential

_numbers = itertools.count(1)


def saxo_credential(user=None, **fields):
    return SaxoCredential.objects.create(**{
        'user': user or make_user(f'saxo-user-{next(_numbers)}'),
        'access_token': 'access',
        'refresh_token': 'refresh',
        'expires_at': timezone.now() + timedelta(hours=1),
        **fields,
    })
