from rest_framework import serializers

from .models import BankTransaction, Budget, ManualIbanLabel, Subscription


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


class BudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Budget
        fields = ['category', 'monthly_limit']


class ManualIbanLabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = ManualIbanLabel
        fields = ['id', 'iban', 'counterparty_name', 'label', 'category']

    def validate(self, data):
        # A PATCH may include only one of the two fields - fall back to the
        # existing instance's value for whichever one is missing from data.
        iban = data.get('iban', getattr(self.instance, 'iban', None))
        counterparty_name = data.get('counterparty_name', getattr(self.instance, 'counterparty_name', None))
        if not iban and not counterparty_name:
            # {'detail': ...}, not DRF's default non_field_errors shape - the
            # frontend's ApiError only ever reads body.detail (see api/
            # client/http.js), matching every other hand-validated view in
            # this app (e.g. BudgetListView.put).
            raise serializers.ValidationError({'detail': 'Provide an IBAN or a counterparty name to match on.'})
        return data
