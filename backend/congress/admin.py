from django.contrib import admin

from .models import Member, Report, Trade


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ('last_name', 'first_name', 'state_district', 'party', 'bioguide_id')
    search_fields = ('last_name', 'first_name', 'bioguide_id')


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ('doc_id', 'member', 'filed_on', 'status', 'amended', 'attempts', 'unparsed_rows')
    list_filter = ('status', 'year')
    search_fields = ('doc_id', 'member__last_name')


@admin.register(Trade)
class TradeAdmin(admin.ModelAdmin):
    list_display = ('report', 'owner', 'ticker', 'asset_type', 'kind', 'option', 'traded_on', 'amount_low', 'amount_high')
    list_filter = ('kind', 'asset_type', 'priceable')
    search_fields = ('ticker', 'asset')
