from django.conf import settings
from rest_framework import serializers

from core.money import Money

from .models import Transaction


class TransactionSerializer(serializers.ModelSerializer):
    total = serializers.ReadOnlyField()
    total_eur = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = [
            'id', 'date', 'type', 'instrument', 'ticker',
            'qty', 'price', 'account', 'total',
            'currency', 'fx_rate', 'total_eur',
        ]

    def get_total_eur(self, transaction):
        if not transaction.currency or not transaction.fx_rate:
            return None
        converted = Money(transaction.total, transaction.currency).converted(
            settings.REPORTING_CURRENCY, transaction.fx_rate
        )
        return converted.rounded().amount
