from django.contrib import admin

from .models import Recommendation


@admin.register(Recommendation)
class RecommendationAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'action', 'conviction', 'horizon', 'decision', 'recorded_at', 'closed_at')
    list_filter = ('action', 'decision', 'horizon')
    search_fields = ('ticker',)
