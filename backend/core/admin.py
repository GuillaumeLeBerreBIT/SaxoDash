from django.contrib import admin

from .models import NetWorthSnapshot


@admin.register(NetWorthSnapshot)
class NetWorthSnapshotAdmin(admin.ModelAdmin):
    list_display = ('date', 'portfolio_value', 'bank_total', 'net_worth')
    date_hierarchy = 'date'
