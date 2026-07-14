from django.test import TestCase
from decimal import Decimal
from portfolio.models import Position
from portfolio.serializers import PositionSerializer
from portfolio.services import get_positions_total_value

# Create your tests here.
class PositionModelTest(TestCase):
    def test_create_position(self):
        position = Position.objects.create(
            ticker='NVDA', name='NVIDIA Corporation', qty=15,
            avg_cost=Decimal('412.30'), current_price=Decimal('875.40'),
            sector='Technology', type='STOCK', color='#76b900', 
        )
        
        self.assertEqual(Position.objects.count(), 1)
        self.assertEqual(position.ticker, 'NVDA')
        
class PositionSerializerTest(TestCase):
    def setUp(self):
        self.p1 = Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('150.00'),
            sector='Technology', type='STOCK', color='#76b900',
        )
        self.p2 = Position.objects.create(
            ticker='AAPL', name='Apple', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('50.00'),
            sector='Technology', type='STOCK', color='#a3a3a3',
        )

    def test_total_value(self):
        total = get_positions_total_value()
        self.assertEqual(total, Decimal('2000.00'))  # 1500 + 500

    def test_computed_fields(self):
        total = get_positions_total_value()
        data = PositionSerializer(self.p1, context={'total_value': total}).data
        self.assertEqual(data['value'], Decimal('1500.00'))
        self.assertEqual(data['cost'], Decimal('1000.00'))
        self.assertEqual(data['pnl'], Decimal('500.00'))
        self.assertEqual(data['pnl_pct'], Decimal('50.00'))
        self.assertEqual(data['weight'], Decimal('75.00'))  # 1500/2000