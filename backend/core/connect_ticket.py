import secrets

from django.conf import settings
from django.core.cache import cache
from django.core.signing import BadSignature, TimestampSigner
from django.utils.crypto import constant_time_compare
from rest_framework.response import Response


class ConnectTicket:
    def __init__(self, provider):
        self.signer = TimestampSigner(salt=f'{provider}-connect')
        self.cookie = f'{provider}_connect'
        self.path = f'/api/{provider}/'
        self.used_prefix = f'{provider}-connect-used'

    def issue(self, user, max_age):
        nonce = secrets.token_urlsafe(24)
        response = Response({'ticket': self.signer.sign_object({'user': user.pk, 'nonce': nonce})})
        response.set_cookie(
            self.cookie,
            nonce,
            max_age=max_age,
            path=self.path,
            httponly=True,
            samesite='Lax',
            secure=not settings.DEBUG,
        )
        return response

    def redeem(self, request, max_age):
        try:
            claims = self.signer.unsign_object(request.query_params.get('ticket', ''), max_age=max_age)
        except BadSignature:
            return None
        nonce = claims.get('nonce') if isinstance(claims, dict) else None
        if not nonce or not constant_time_compare(request.COOKIES.get(self.cookie, ''), nonce):
            return None
        if not cache.add(f'{self.used_prefix}:{nonce}', True, timeout=max_age):
            return None
        return claims.get('user')

    def forget(self, response):
        response.delete_cookie(self.cookie, path=self.path, samesite='Lax')
        return response
