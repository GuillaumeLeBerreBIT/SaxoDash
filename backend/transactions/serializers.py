from rest_framework import serializers
from .models import Transaction


class TransactionSerializer(serializers.ModelSerializer):
    total = serializers.ReadOnlyField()

    class Meta:
        model = Transaction
        fields = [
            'id', 'date', 'type', 'instrument', 'ticker',
            'qty', 'price', 'account', 'total',
        ]
