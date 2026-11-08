import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import HttpResponseForbidden
from django.shortcuts import redirect
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView, Response

from core.connect_ticket import ConnectTicket

from . import client, credentials
from .models import SaxoCredential

logger = logging.getLogger(__name__)


def _back_to_frontend(outcome):
    return redirect(f'{settings.FRONTEND_URL}/portfolio?saxo={outcome}')


# The connect redirect is a full-page navigation, so it cannot carry the JWT
# header. This signed, short-lived ticket - minted by an authenticated request -
# stands in for it, so an anonymous caller cannot start the OAuth flow.
connect_ticket = ConnectTicket('saxo')
CONNECT_TICKET_MAX_AGE = 120


class SaxoConnectTicketView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return connect_ticket.issue(request.user, CONNECT_TICKET_MAX_AGE)


class SaxoConnectView(APIView):
    permission_classes = [AllowAny]  # the ticket is the credential

    def get(self, request):
        user_pk = connect_ticket.redeem(request, CONNECT_TICKET_MAX_AGE)
        if user_pk is None:
            return HttpResponseForbidden('A fresh connect ticket is required.')

        state = secrets.token_urlsafe(24)
        request.session['saxo_oauth_state'] = state
        request.session['saxo_oauth_user'] = user_pk

        response = redirect(client.build_authorize_url(state))
        # Keep the signed ticket in the URL out of the Referer sent to Saxo.
        response['Referrer-Policy'] = 'no-referrer'
        return connect_ticket.forget(response)


def _connecting_user(user_pk):
    if user_pk is None:
        return None
    return get_user_model().objects.filter(pk=user_pk, is_active=True).first()


class SaxoCallbackView(APIView):

    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get('code')
        state = request.query_params.get('state')
        expected_state = request.session.pop('saxo_oauth_state', None)
        user = _connecting_user(request.session.pop('saxo_oauth_user', None))

        if not code or not state or state != expected_state or user is None:
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
            SaxoCredential.objects.filter(user=user).delete()
            SaxoCredential.objects.create(
                user=user,
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=timezone.now() + timedelta(seconds=expires_in),
                environment=settings.SAXO_ENVIRONMENT,
            )

        return _back_to_frontend('connected')


class SaxoStatusView(APIView):

    def get(self, request):
        state = credentials.connection_state(request.user)
        if not state.connected:
            return Response({'connected': False})

        last_sync = credentials.last_successful_sync(request.user)

        return Response({
            'connected': True,
            'environment': state.credential.environment,
            'needs_reauth': state.needs_reauth,
            # What a market-data call would do right now, so the header cannot
            # claim connected while the panel below reports the opposite.
            'usable': state.usable,
            'unusable_reason': state.reason,
            'last_synced_at': last_sync.ran_at if last_sync else None,
            # Worst across each task's latest run, not whatever ran last -
            # otherwise one healthy task masks another that always fails.
            'last_sync_outcome': credentials.worst_recent_outcome(request.user),
            'failing_syncs': [
                run.task for run in credentials.latest_run_per_task(request.user) if run.outcome != 'ok'
            ],
        })