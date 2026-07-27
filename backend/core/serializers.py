from rest_framework import serializers

from .models import NetWorthSnapshot


class NetWorthSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = NetWorthSnapshot
        fields = ['date', 'portfolio_value', 'bank_total', 'net_worth']
