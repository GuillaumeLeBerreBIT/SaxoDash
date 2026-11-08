from django.contrib.auth import get_user_model
from django.core.management.base import CommandError

from .owner import owner


def add_user_argument(parser):
    parser.add_argument('--user', help='Username whose data to act on. Defaults to the owner.')


def chosen_user(username):
    if username:
        user = get_user_model().objects.filter(username=username).first()
        if user is None:
            raise CommandError(f'No user named {username!r}.')
        return user
    user = owner()
    if user is None:
        raise CommandError('No user is the owner of this instance. Pass --user <username>.')
    return user
