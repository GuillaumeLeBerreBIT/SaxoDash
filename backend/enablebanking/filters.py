import django_filters

from .models import BankTransaction


class BankTransactionFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name='booking_date', lookup_expr='gte')
    date_to = django_filters.DateFilter(field_name='booking_date', lookup_expr='lte')
    account = django_filters.NumberFilter(field_name='bank_account_id')

    class Meta:
        model = BankTransaction
        fields = ['category', 'date_from', 'date_to', 'account']
