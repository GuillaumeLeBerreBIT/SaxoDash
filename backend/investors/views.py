from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import signals, summaries
from .models import Investor


class InvestorListView(APIView):
    def get(self, request):
        investors = Investor.objects.all()
        holds = request.query_params.get('holds', '').strip()
        if holds:
            investors = investors.filter(pk__in=summaries.holder_ids(holds))
        return Response(summaries.cards(investors, date.today()))


def _quarter_param(request):
    raw = request.query_params.get('quarter')
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ValidationError({'quarter': 'Use YYYY-MM-DD.'})


class InvestorDetailView(APIView):
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
