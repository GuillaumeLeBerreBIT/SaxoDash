from django.db import transaction
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken


def issue(user):
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def blacklist_all(user, except_jti=None):
    outstanding = OutstandingToken.objects.filter(user=user)
    if except_jti is not None:
        outstanding = outstanding.exclude(jti=except_jti)
    for token in outstanding:
        BlacklistedToken.objects.get_or_create(token=token)


def set_password_and_reissue(user, new_password):
    with transaction.atomic():
        user.set_password(new_password)
        user.save(update_fields=['password'])
        blacklist_all(user)
        return issue(user)
