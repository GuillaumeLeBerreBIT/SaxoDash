import django_filters

from .models import BankTransaction


class BankTransactionFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name='booking_date', lookup_expr='gte')
    date_to = django_filters.DateFilter(field_name='booking_date', lookup_expr='lte')
    account = django_filters.NumberFilter(field_name='bank_account_id')
    needs_review = django_filters.BooleanFilter(method='filter_needs_review')

    def filter_needs_review(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(category='OTHER', category_override__isnull=True, reviewed=False)

    class Meta:
        model = BankTransaction
        fields = ['category', 'date_from', 'date_to', 'account', 'needs_review']
