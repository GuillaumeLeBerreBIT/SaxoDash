from datetime import date

from rest_framework.response import Response
from rest_framework.views import APIView

from . import summaries
from .models import Investor


class InvestorListView(APIView):
    def get(self, request):
        today = date.today()
        return Response([summaries.card(investor, today) for investor in Investor.objects.all()])
