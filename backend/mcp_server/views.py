from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from rest_framework.test import APIRequestFactory, force_authenticate

from research.daily import NOT_CONNECTED
from users.acting import acting_as
from users.owner import owner

from .envelope import Unavailable
from .shaping import without


@dataclass(frozen=True)
class ViewResult:
    status: int
    data: Any


def app_user():
    if settings.MCP_USER:
        user = get_user_model().objects.filter(is_active=True, username=settings.MCP_USER).first()
    else:
        user = owner()
    if user is None or not user.is_active:
        raise ImproperlyConfigured('No active user for the MCP server to act as.')
    return user


FALLBACK_HOST = 'localhost'


def _host():
    named = (host.lstrip('.') for host in settings.ALLOWED_HOSTS if host != '*')
    return next((host for host in named if host), FALLBACK_HOST)


def call_view(view_class, *, kwargs=None, query=None, user=None):
    request = APIRequestFactory().get('/', query or {}, HTTP_HOST=_host())
    acting = user or app_user()
    force_authenticate(request, user=acting)
    with acting_as(acting):
        response = view_class.as_view()(request, **(kwargs or {}))
    return ViewResult(response.status_code, response.data)


def problem(result):
    if result.status == 409:
        return NOT_CONNECTED
    if result.status == 429:
        return 'Busy — try again in a minute.'
    if result.status == 404:
        return 'Not found.'
    if result.status == 400:
        return f'Invalid request: {result.data}'
    if result.status >= 500:
        return f'Upstream error ({result.status}).'
    if isinstance(result.data, dict) and result.data.get('available') is False:
        return result.data.get('reason') or result.data.get('message') or 'Data unavailable.'
    return None


def fetch(view_class, *, kwargs=None, query=None):
    result = call_view(view_class, kwargs=kwargs, query=query)
    message = problem(result)
    if message:
        raise Unavailable(message)
    return without(result.data)


def fetch_optional(view_class, warnings, *, kwargs=None, query=None):
    try:
        return fetch(view_class, kwargs=kwargs, query=query)
    except Unavailable as missing:
        warnings.extend(missing.warnings)
        return None
