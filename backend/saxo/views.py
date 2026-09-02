import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.shortcuts import redirect
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView, Response

from . import client
from .models import SaxoCredential

logger = logging.getLogger(__name__)


def _back_to_frontend(outcome):
    return redirect(f'{settings.FRONTEND_URL}/portfolio?saxo={outcome}')


class SaxoConnectView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        state = secrets.token_urlsafe(24)
        request.session['saxo_oauth_state'] = state

        return redirect(client.build_authorize_url(state))


class SaxoCallbackView(APIView):

    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get('code')
        state = request.query_params.get('state')
        expected_state = request.session.pop('saxo_oauth_state', None)

        if not code or not state or state != expected_state:
            return _back_to_frontend('error')

        try:
            token_data = client.exchange_code_for_token(code)
            expires_in = int(token_data['expires_in'])
            access_token = token_data['access_token']
            refresh_token = token_data['refresh_token']
        except (client.SaxoAuthError, KeyError, TypeError, ValueError):
            logger.exception('Saxo token exchange failed')
            return _back_to_frontend('error')

        # Swap together: a failed create must not leave the app with no credential.
        with transaction.atomic():
            SaxoCredential.objects.all().delete()
            SaxoCredential.objects.create(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=timezone.now() + timedelta(seconds=expires_in),
                environment=settings.SAXO_ENVIRONMENT,
            )

        return _back_to_frontend('connected')


class SaxoStatusView(APIView):

    # Past this much expiry the refresh cycle has clearly failed, even if
    # needs_reauth was never set.
    REAUTH_GRACE = timedelta(minutes=15)

    def get(self, request):
        credential = SaxoCredential.objects.first()
        if not credential:
            return Response({'connected': False})
        needs_reauth = (
            credential.needs_reauth
            or credential.expires_at <= timezone.now() - self.REAUTH_GRACE
        )
        return Response({
            'connected': True,
            'environment': credential.environment,
            'needs_reauth': needs_reauth,
            'last_synced_at': credential.last_synced_at,
        })