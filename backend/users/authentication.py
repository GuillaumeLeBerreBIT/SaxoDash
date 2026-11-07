from rest_framework_simplejwt.authentication import JWTAuthentication as SimpleJWTAuthentication

from .acting import set_acting_user


class JWTAuthentication(SimpleJWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            set_acting_user(result[0])
        return result
