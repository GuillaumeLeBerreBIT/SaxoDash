import logging
from smtplib import SMTPException

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

logger = logging.getLogger('users.reset')


def reset_link(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f'{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}'


def send_reset_link(user):
    body = (
        'Someone asked to reset the password for your SaxoDash account.\n\n'
        f'Choose a new password here (the link works once, for one hour):\n{reset_link(user)}\n\n'
        'If this was not you, ignore this email; your password stays as it is.\n'
    )
    try:
        send_mail('Reset your SaxoDash password', body, None, [user.email])
    except (SMTPException, OSError):
        logger.exception('Password reset email to user %s could not be sent', user.pk)


def users_for_email(email):
    if not isinstance(email, str) or not email.strip():
        return []
    candidates = get_user_model().objects.filter(email__iexact=email.strip(), is_active=True)
    return [user for user in candidates if user.has_usable_password()]


def user_for_link(uid, token):
    if not isinstance(uid, str) or not isinstance(token, str):
        return None
    try:
        pk = force_str(urlsafe_base64_decode(uid))
        user = get_user_model().objects.get(pk=pk, is_active=True)
    except (TypeError, ValueError, OverflowError, UnicodeDecodeError, get_user_model().DoesNotExist):
        return None
    if not default_token_generator.check_token(user, token):
        return None
    return user
