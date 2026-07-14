from decimal import Decimal
from rest_framework import serializers
from .models import Position

class PositionSerializer(serializers.ModelSerializer):
    
    value = serializers.SerializerMethodField()
    cost = serializers.SerializerMethodField()
    pnl = serializers.SerializerMethodField()
    pnl_pct = serializers.SerializerMethodField()
    weight = serializers.SerializerMethodField()
    
    class Meta:
        model = Position
        fields = [
            'id', 'ticker', 'name', 'qty', 'avg_cost', 'current_price',
            'sector', 'type', 'color', 'value', 'cost', 'pnl', 'pnl_pct',
            'weight',
        ]
        
    def get_value(self, obj):
        return obj.qty * obj.current_price
    
    def get_cost(self, obj):
        return obj.qty * obj.avg_cost
    
    def get_pnl(self, obj):
        return self.get_value(obj) - self.get_cost(obj)
    
    def get_pnl_pct(self, obj):
        cost = self.get_cost(obj)
        if cost == 0:
            return Decimal('0')
        return (self.get_pnl(obj)/ cost) * 100
    
    def get_weight(self, obj):
        total = self.context.get('total_value') or Decimal('1')
        return (self.get_value(obj) / total) * 100     