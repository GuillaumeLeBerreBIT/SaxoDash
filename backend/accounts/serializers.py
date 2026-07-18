from rest_framework.serializers import ModelSerializer
from .models import BankAccount


class BankAccountSerializer(ModelSerializer):

    class Meta:
        model = BankAccount
        fields = [
            'id', 'bank', 'type', 'iban_masked', 'balance',
            'available', 'gradient', 'accent'
            ]
