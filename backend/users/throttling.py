import hashlib

from rest_framework.throttling import SimpleRateThrottle


class LoginThrottle(SimpleRateThrottle):
    scope = 'login'

    def get_cache_key(self, request, view):
        data = request.data
        login = str(data.get('username', '')) if isinstance(data, dict) else ''
        digest = hashlib.sha256(login.strip().lower().encode()).hexdigest()
        return self.cache_format % {
            'scope': self.scope,
            'ident': f'{self.get_ident(request)}:{digest}',
        }
