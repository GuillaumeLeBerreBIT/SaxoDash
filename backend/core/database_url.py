from urllib.parse import parse_qsl, unquote, urlsplit

from django.core.exceptions import ImproperlyConfigured

POSTGRES_SCHEMES = {'postgres', 'postgresql'}


def database_from_url(url):
    parts = urlsplit(url)
    if parts.scheme not in POSTGRES_SCHEMES:
        raise ImproperlyConfigured(
            f'DATABASE_URL must be a postgres:// URL, not {parts.scheme or "a bare path"}://'
        )
    name = parts.path.lstrip('/')
    if not name:
        raise ImproperlyConfigured('DATABASE_URL has no database name')
    return {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': unquote(name),
        'USER': unquote(parts.username or ''),
        'PASSWORD': unquote(parts.password or ''),
        'HOST': parts.hostname or '',
        'PORT': str(parts.port or ''),
        'OPTIONS': dict(parse_qsl(parts.query)),
        'CONN_MAX_AGE': 60,
        'CONN_HEALTH_CHECKS': True,
    }
