from rest_framework import serializers

from .models import BankTransaction, Subscription


class BankTransactionSerializer(serializers.ModelSerializer):
    effective_category = serializers.ReadOnlyField()

    class Meta:
        model = BankTransaction
        fields = [
            'id', 'bank', 'bank_account', 'booking_date', 'counterparty_name',
            'description', 'amount', 'currency', 'category', 'category_override',
            'effective_category',
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = [
            'id', 'merchant_key', 'display_name', 'category',
            'expected_amount', 'cadence', 'last_charged', 'dismissed',
        ]
