from django.contrib import admin

from .models import Position


@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'name', 'qty', 'avg_cost', 'current_price', 'sector', 'type')
    list_filter = ('type', 'sector')
    search_fields = ('ticker', 'name')
