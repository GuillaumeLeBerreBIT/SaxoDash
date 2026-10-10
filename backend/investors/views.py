from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import edgar, signals, summaries, tracking
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
        return Response(summaries.cards(investors, date.today()))

    def post(self, request):
        cik = request.data.get('cik')
        if isinstance(cik, bool) or not isinstance(cik, int) or cik <= 0:
            raise Refused('Send the filer\'s CIK as a positive integer.')
        try:
            investor = tracking.add(cik)
        except tracking.AlreadyTracked as exc:
            raise Conflict(f'{exc.investor.name} is already tracked.')
        except tracking.NotA13FFiler as exc:
            raise Refused(f'{exc} has never filed a 13F.')
        except edgar.EdgarError:
            raise BadGateway(EDGAR_DOWN)
        except tracking.ImportNotQueued:
            raise ServiceUnavailable('Could not start the import. Is the worker running?')
        return Response(summaries.card(investor, date.today()), status=201)


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
            tracking.stop(investor)
        except tracking.CuratedInvestor:
            raise Conflict('Curated investors cannot be removed; unfollow instead.')
        return Response(status=204)

    def get(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        try:
            return Response(summaries.detail(investor, _quarter_param(request), date.today()))
        except summaries.QuarterNotFound:
            raise NotFound('No filing is stored for that quarter.')

    def patch(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        followed = request.data.get('followed')
        if not isinstance(followed, bool):
            raise ValidationError({'followed': 'Send true or false.'})
        Investor.objects.filter(pk=investor.pk).update(followed=followed)
        investor.followed = followed
        return Response(summaries.card(investor, date.today()))


class InvestorChangesView(APIView):
    def get(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        try:
            return Response(summaries.changes_payload(investor, _quarter_param(request)))
        except summaries.QuarterNotFound:
            raise NotFound('No filing is stored for that quarter.')


class InvestorHubView(APIView):
    def get(self, request):
        return Response(signals.hub(date.today()))


class InvestorStocksView(APIView):
    def get(self, request):
        view = request.query_params.get('view') or 'bought'
        try:
            return Response(signals.stock_activity(view, _quarter_param(request)))
        except signals.UnknownView:
            raise ValidationError({'view': f'Use one of {", ".join(signals.VIEWS)}.'})


class InvestorSearchView(APIView):
    throttle_scope = 'investors.search'

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if len(query) < MIN_QUERY:
            return Response([])
        try:
            return Response(tracking.search(query))
        except edgar.EdgarError:
            raise BadGateway(EDGAR_DOWN)
