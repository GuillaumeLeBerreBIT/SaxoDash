from django.contrib import admin

from .models import Filing, Holding, Investor, Security


@admin.register(Investor)
class InvestorAdmin(admin.ModelAdmin):
    list_display = ('name', 'firm', 'cik', 'curated', 'last_filing_at')


@admin.register(Filing)
class FilingAdmin(admin.ModelAdmin):
    list_display = ('investor', 'quarter_end', 'filed_on', 'form', 'amendment_type', 'positions')
    list_filter = ('investor',)


@admin.register(Holding)
class HoldingAdmin(admin.ModelAdmin):
    list_display = ('filing', 'cusip', 'issuer', 'shares', 'value', 'put_call')


@admin.register(Security)
class SecurityAdmin(admin.ModelAdmin):
    list_display = ('cusip', 'ticker', 'name', 'attempts')
    search_fields = ('cusip', 'ticker', 'name')
