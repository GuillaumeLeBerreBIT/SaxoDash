import datetime
import logging
import secrets

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import Http404, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView, Response

from . import client, credentials
from .filters import BankTransactionFilter
from .models import CATEGORY_CHOICES, BankTransaction, EnableBankingCredential, Subscription
from .serializers import BankTransactionSerializer, SubscriptionSerializer
from .services import spending_summary, spending_trend

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

        iban = request.query_params.get('iban') or None
        response = redirect(
            client.build_authorize_url(bank, state, settings.ENABLE_BANKING_REDIRECT_URI, iban=iban)
        )
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


class BankTransactionListView(ListAPIView):
    queryset = BankTransaction.objects.select_related('bank_account').all()
    serializer_class = BankTransactionSerializer
    filterset_class = BankTransactionFilter
    filter_backends = [DjangoFilterBackend]


class BankTransactionCategoryView(APIView):

    def patch(self, request, pk):
        tx = get_object_or_404(BankTransaction, pk=pk)
        category = request.data.get('category_override')
        if category is not None and category not in dict(CATEGORY_CHOICES):
            return Response({'detail': 'Unknown category'}, status=400)
        tx.category_override = category
        tx.save(update_fields=['category_override'])
        return Response(BankTransactionSerializer(tx).data)


class SpendingSummaryView(APIView):

    def get(self, request):
        return Response(spending_summary(
            date_from=request.query_params.get('date_from'),
            date_to=request.query_params.get('date_to'),
        ))


class SpendingTrendView(APIView):

    def get(self, request):
        months = int(request.query_params.get('months', 6))
        return Response(spending_trend(months=months))


class SubscriptionListView(ListAPIView):
    serializer_class = SubscriptionSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Subscription.objects.all()
        if self.request.query_params.get('include_dismissed') != 'true':
            qs = qs.exclude(dismissed=True)
        return qs


class SubscriptionDetailView(APIView):

    def patch(self, request, pk):
        sub = get_object_or_404(Subscription, pk=pk)
        if 'dismissed' in request.data:
            sub.dismissed = bool(request.data['dismissed'])
            sub.save(update_fields=['dismissed'])
        return Response(SubscriptionSerializer(sub).data)
