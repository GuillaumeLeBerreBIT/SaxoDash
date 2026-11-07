from rest_framework.throttling import SimpleRateThrottle


class LoginThrottle(SimpleRateThrottle):
    scope = 'login'

    def get_cache_key(self, request, view):
        login = str(request.data.get('username', '')).strip().lower()
        return self.cache_format % {
            'scope': self.scope,
            'ident': f'{self.get_ident(request)}:{login}',
        }
