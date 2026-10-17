from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from investors.ownership import BadTickers, parse_tickers

from . import ownership, summaries
from .models import Member


class MemberListView(APIView):
    def get(self, request):
        today = date.today()
        return Response({
            'members': summaries.cards(list(Member.objects.all())),
            'most_bought': ownership.most_bought(today),
            'window_days': ownership.WINDOW_DAYS,
        })


class MemberDetailView(APIView):
    def get(self, request, slug):
        return Response(summaries.profile(get_object_or_404(Member, slug=slug)))


class OwnershipSummaryView(APIView):
    def get(self, request):
        try:
            tickers = parse_tickers(request.query_params.get('tickers', ''))
        except BadTickers as exc:
            raise ValidationError(str(exc))
        return Response(ownership.summary(tickers, date.today()))


class OwnershipDetailView(APIView):
    def get(self, request, ticker):
        return Response(ownership.detail(ticker.upper(), date.today()))
