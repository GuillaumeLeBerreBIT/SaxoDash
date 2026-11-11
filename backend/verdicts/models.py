from django.db import models


class StockVerdict(models.Model):
    ticker = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=120)
    uic = models.PositiveIntegerField(null=True, blank=True)
    quality = models.CharField(max_length=10)
    valuation = models.CharField(max_length=12)
    checks = models.JSONField(default=list)
    current_pe = models.FloatField(null=True, blank=True)
    cheap_below = models.FloatField(null=True, blank=True)
    expensive_above = models.FloatField(null=True, blank=True)
    last_close = models.FloatField(null=True, blank=True)
    pct_vs_ma200 = models.FloatField(null=True, blank=True)
    as_of = models.DateField(null=True, blank=True)
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['ticker']

    def __str__(self):
        return f'{self.ticker}: {self.quality} / {self.valuation}'


class VerdictCall(models.Model):
    ticker = models.CharField(max_length=20, db_index=True)
    opened_on = models.DateField()
    entry_close = models.FloatField()
    quality = models.CharField(max_length=10)
    valuation = models.CharField(max_length=12)
    checks = models.JSONField(default=list)
    ended_on = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-opened_on', 'ticker']
        constraints = [
            models.UniqueConstraint(
                fields=['ticker'], condition=models.Q(ended_on__isnull=True),
                name='one_open_verdict_call_per_ticker',
            ),
        ]

    def __str__(self):
        return f'{self.ticker} from {self.opened_on}'
