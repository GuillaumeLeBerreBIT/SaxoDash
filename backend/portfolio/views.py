from decimal import Decimal

from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Position
from .serializers import PositionSerializer
from .services import get_portfolio_value, get_positions_value


class PositionListView(ListAPIView):
    serializer_class = PositionSerializer
    pagination_class = None

    def list(self, request, *args, **kwargs):
        positions = list(Position.objects.all())
        serializer = self.get_serializer(
            positions,
            many=True,
            context={
                'total_value': get_positions_value().amount,
                'request': request,
            },
        )
        return Response(serializer.data)


class PortfolioSummaryView(APIView):
    """Headline value from the broker, breakdown from the positions we hold.

    They can differ by a few euros - our marks are derived where Saxo withholds
    a price - so weights divide into the positions' own sum and stay at 100%.
    """

    def get(self, request):
        positions = list(Position.objects.all())

        total_value = get_portfolio_value().rounded().amount
        total_cost = sum((p.cost for p in positions), Decimal('0'))

        # The balance sync and the position sync are independent tasks, so the
        # broker's value can arrive while the position table is still empty.
        # There is nothing to cost against then, and reporting the whole book
        # as profit would be worse than reporting no P/L at all.
        priced = bool(positions)
        total_pnl = total_value - total_cost if priced else None
        total_pnl_pct = (
            (total_pnl / total_cost) * 100 if priced and total_cost else None
        )

        return Response({
            'total_value': total_value,
            'total_cost': total_cost,
            'total_pnl': total_pnl,
            'total_pnl_pct': total_pnl_pct,
            'allocation': [
                {'ticker': p.ticker, 'value': p.value, 'color': p.color}
                for p in positions
            ],
        })
