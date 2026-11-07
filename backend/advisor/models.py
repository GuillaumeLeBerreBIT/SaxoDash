from django.conf import settings
from django.db import models


class Recommendation(models.Model):
    ACTIONS = [(a, a) for a in ('buy_new', 'add', 'trim', 'sell', 'watch', 'hold', 'harvest_loss', 'harvest_gain')]
    CONVICTIONS = [(c, c) for c in ('low', 'medium', 'high')]
    HORIZONS = [(h, h) for h in ('3m', '6m', '12m')]
    DECISIONS = [(d, d) for d in ('pending', 'accepted', 'declined')]
    CLOSE_REASONS = [(r, r) for r in ('sold', 'invalidated', 'superseded')]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    ticker = models.CharField(max_length=16)
    uic = models.PositiveIntegerField()
    asset_type = models.CharField(max_length=20)
    action = models.CharField(max_length=20, choices=ACTIONS)
    review = models.BooleanField(default=False)
    thesis = models.TextField()
    bear_case = models.JSONField(default=list)
    invalidation = models.JSONField(default=dict)
    target = models.JSONField(null=True, blank=True)
    buy_range = models.JSONField(null=True, blank=True)
    sell_range = models.JSONField(null=True, blank=True)
    figures = models.JSONField(default=dict, blank=True)
    lenses = models.JSONField(default=list, blank=True)
    zone = models.CharField(max_length=20, blank=True)
    conviction = models.CharField(max_length=10, choices=CONVICTIONS)
    horizon = models.CharField(max_length=3, choices=HORIZONS)
    uncertainties = models.JSONField(default=list, blank=True)
    entry_price = models.FloatField()
    entry_currency = models.CharField(max_length=3)
    recorded_at = models.DateTimeField(auto_now_add=True)
    decision = models.CharField(max_length=10, choices=DECISIONS, default='pending')
    closed_at = models.DateTimeField(null=True, blank=True)
    close_reason = models.CharField(max_length=12, choices=CLOSE_REASONS, blank=True)

    class Meta:
        ordering = ['-recorded_at']

    def __str__(self):
        return f'{self.ticker} {self.action} {self.recorded_at:%Y-%m-%d}'
