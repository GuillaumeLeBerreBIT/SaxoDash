from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import alerts, copying, edgar, follows, ownership, signals, summaries, tracking
from .models import Investor

MIN_QUERY = 3
EDGAR_DOWN = 'EDGAR did not answer. Try again in a moment.'


class Conflict(APIException):
    status_code = 409


class Refused(APIException):
    status_code = 400


class BadGateway(APIException):
    status_code = 502


class ServiceUnavailable(APIException):
    status_code = 503


class InvestorListView(APIView):
    def get(self, request):
        investors = Investor.objects.all()
        holds = request.query_params.get('holds', '').strip()
        if holds:
            investors = investors.filter(pk__in=summaries.holder_ids(holds))
        return Response(summaries.cards(investors, date.today(), request.user))

    def post(self, request):
        cik = request.data.get('cik')
        if isinstance(cik, bool) or not isinstance(cik, int) or cik <= 0:
            raise Refused('Send the filer\'s CIK as a positive integer.')
        try:
            investor = tracking.add(cik, request.user)
        except tracking.AlreadyTracked as exc:
            raise Conflict(f'{exc.investor.name} is already tracked.')
        except tracking.NotA13FFiler as exc:
            raise Refused(f'{exc} has never filed a 13F.')
        except edgar.EdgarError:
            raise BadGateway(EDGAR_DOWN)
        except tracking.ImportNotQueued:
            raise ServiceUnavailable('Could not start the import. Is the worker running?')
        return Response(summaries.card(investor, date.today(), request.user), status=201)


def _quarter_param(request):
    raw = request.query_params.get('quarter')
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ValidationError({'quarter': 'Use YYYY-MM-DD.'})


class InvestorDetailView(APIView):
    def delete(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        try:
            tracking.stop(investor, request.user)
        except tracking.CuratedInvestor:
            raise Conflict('Curated investors cannot be removed; unfollow instead.')
        except tracking.NotYours:
            raise PermissionDenied('Only the person who added this investor, while nobody else follows it, can remove it.')
        return Response(status=204)

    def get(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        try:
            return Response(summaries.detail(investor, _quarter_param(request), date.today(), user=request.user))
        except summaries.QuarterNotFound:
            raise NotFound('No filing is stored for that quarter.')

    def patch(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        followed = request.data.get('followed')
        if not isinstance(followed, bool):
            raise ValidationError({'followed': 'Send true or false.'})
        follows.set_followed(request.user, investor, followed)
        return Response(summaries.card(investor, date.today(), request.user))


class InvestorChangesView(APIView):
    def get(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        try:
            return Response(summaries.changes_payload(investor, _quarter_param(request)))
        except summaries.QuarterNotFound:
            raise NotFound('No filing is stored for that quarter.')


class InvestorCopyView(APIView):
    def get(self, request, slug):
        return Response(copying.payload(get_object_or_404(Investor, slug=slug)))


class InvestorHubView(APIView):
    def get(self, request):
        return Response(signals.hub(date.today(), request.user))


class InvestorAlertsView(APIView):
    def get(self, request):
        return Response(alerts.payload(request.user))


class InvestorAlertsReadView(APIView):
    def post(self, request):
        alerts.mark_read(request.user)
        return Response(alerts.payload(request.user))


class InvestorStocksView(APIView):
    def get(self, request):
        view = request.query_params.get('view') or 'bought'
        try:
            return Response(signals.stock_activity(view, _quarter_param(request)))
        except signals.UnknownView:
            raise ValidationError({'view': f'Use one of {", ".join(signals.VIEWS)}.'})


class OwnershipSummaryView(APIView):
    def get(self, request):
        try:
            tickers = ownership.parse_tickers(request.query_params.get('tickers'))
        except ownership.BadTickers as error:
            raise ValidationError({'tickers': str(error)})
        return Response(ownership.summary(tickers))


class OwnershipDetailView(APIView):
    def get(self, request, ticker):
        return Response(ownership.detail(ticker.upper(), request.user))


class InvestorSearchView(APIView):
    throttle_scope = 'investors.search'

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if len(query) < MIN_QUERY:
            return Response([])
        try:
            return Response(tracking.search(query, date.today()))
        except edgar.EdgarError:
            raise BadGateway(EDGAR_DOWN)
