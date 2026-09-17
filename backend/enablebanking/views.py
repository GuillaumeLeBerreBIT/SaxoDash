import datetime
import logging
import secrets

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import Http404, HttpResponseForbidden
from django.shortcuts import redirect
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView, Response

from . import client, credentials
from .models import EnableBankingCredential

logger = logging.getLogger(__name__)


def _back_to_frontend(outcome, bank=None):
    # bank is included when known so the frontend can show which bank's
    # connect attempt failed - there are two independent banks here, unlike
    # Saxo's single connection, so a bare "error" is ambiguous.
    query = f'enablebanking={outcome}' + (f'&bank={bank}' if bank else '')
    return redirect(f'{settings.FRONTEND_URL}/accounts?{query}')


# Same reasoning as saxo.views: the connect redirect is a full-page
# navigation, so a signed ticket stands in for the JWT header an
# authenticated fetch would normally carry.
_connect_ticket_signer = TimestampSigner(salt='enablebanking-connect')
CONNECT_TICKET_MAX_AGE = 120


def _fallback_valid_until():
    # The public example response for POST /sessions shows only session_id
    # and accounts, no echoed expiry - use the 180-day window requested in
    # build_authorize_url as the stored value. A live check confirms whether
    # the real response ever includes its own expiry.
    return datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=180)


class EnableBankingConnectTicketView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({'ticket': _connect_ticket_signer.sign(str(request.user.pk))})


class EnableBankingConnectView(APIView):
    permission_classes = [AllowAny]  # the ticket is the credential

    def get(self, request, bank):
        if bank not in credentials.BANKS:
            raise Http404(f'Unknown bank: {bank}')

        try:
            _connect_ticket_signer.unsign(
                request.query_params.get('ticket', ''), max_age=CONNECT_TICKET_MAX_AGE
            )
        except (BadSignature, SignatureExpired):
            return HttpResponseForbidden('A fresh connect ticket is required.')

        state = f'{secrets.token_urlsafe(24)}:{bank}'
        request.session['enablebanking_oauth_state'] = state

        response = redirect(client.build_authorize_url(bank, state, settings.ENABLE_BANKING_REDIRECT_URI))
        response['Referrer-Policy'] = 'no-referrer'
        return response


class EnableBankingCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get('code')
        state = request.query_params.get('state')
        expected_state = request.session.pop('enablebanking_oauth_state', None)

        if not code or not state or state != expected_state or ':' not in state:
            return _back_to_frontend('error')

        bank = state.rsplit(':', 1)[1]

        try:
            session_data = client.exchange_code_for_session(code)
        except client.EnableBankingAPIError:
            logger.exception('Enable Banking session exchange failed for %s', bank)
            return _back_to_frontend('error', bank)

        EnableBankingCredential.objects.update_or_create(
            bank=bank,
            defaults={
                'session_id': session_data['session_id'],
                'valid_until': _fallback_valid_until(),
                'linked_accounts': session_data['accounts'],
                'needs_reauth': False,
            },
        )

        return _back_to_frontend('connected', bank)


class EnableBankingStatusView(APIView):

    def get(self, request):
        result = {}
        for bank in credentials.BANKS:
            state = credentials.connection_state(bank)
            last_sync = credentials.last_successful_sync(bank)
            result[bank] = {
                'connected': state.connected,
                'needs_reauth': state.needs_reauth,
                'usable': state.usable,
                'unusable_reason': state.reason,
                'last_synced_at': last_sync.ran_at if last_sync else None,
            }
        return Response(result)
