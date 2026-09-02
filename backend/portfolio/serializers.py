from rest_framework import serializers

from .models import Position


class PositionSerializer(serializers.ModelSerializer):

    value = serializers.ReadOnlyField()
    cost = serializers.ReadOnlyField()
    pnl = serializers.ReadOnlyField()
    pnl_pct = serializers.ReadOnlyField()
    weight = serializers.SerializerMethodField()

    class Meta:
        model = Position
        fields = [
            'id', 'ticker', 'name', 'qty', 'avg_cost', 'current_price',
            'sector', 'type', 'color', 'value', 'cost', 'pnl', 'pnl_pct',
            'weight',
        ]

    def get_weight(self, obj):
        return obj.weight_of(self.context.get('total_value'))
