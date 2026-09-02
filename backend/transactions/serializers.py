from rest_framework import serializers
from .models import Transaction


class CashFlowRowSerializer(serializers.Serializer):
    month = serializers.CharField()
    inflow = serializers.DecimalField(max_digits=14, decimal_places=2)
    outflow = serializers.DecimalField(max_digits=14, decimal_places=2)


class TransactionSerializer(serializers.ModelSerializer):
    total = serializers.ReadOnlyField()

    class Meta:
        model = Transaction
        fields = [
            'id', 'date', 'type', 'instrument', 'ticker',
            'qty', 'price', 'account', 'total',
        ]
