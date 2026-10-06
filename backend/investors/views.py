from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import summaries
from .models import Investor


class InvestorListView(APIView):
    def get(self, request):
        today = date.today()
        investors = Investor.objects.all()
        holds = request.query_params.get('holds', '').strip()
        if holds:
            investors = [investor for investor in investors if summaries.holds_ticker(investor, holds)]
        return Response([summaries.card(investor, today) for investor in investors])


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
