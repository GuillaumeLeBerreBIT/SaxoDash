from django.db import models


class SignalScore(models.Model):
    key = models.CharField(max_length=40)
    horizon = models.PositiveSmallIntegerField()
    cases = models.PositiveIntegerField(default=0)
    stocks = models.PositiveIntegerField(default=0)
    mean_excess = models.FloatField(null=True, blank=True)
    ci_low = models.FloatField(null=True, blank=True)
    ci_high = models.FloatField(null=True, blank=True)
    positive_share = models.FloatField(null=True, blank=True)
    first_half = models.FloatField(null=True, blank=True)
    second_half = models.FloatField(null=True, blank=True)
    grade = models.CharField(max_length=10)
    from_date = models.DateField(null=True, blank=True)
    to_date = models.DateField(null=True, blank=True)
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key', 'horizon']
        constraints = [models.UniqueConstraint(fields=['key', 'horizon'], name='one_score_per_signal_and_horizon')]

    def __str__(self):
        return f'{self.key} @ {self.horizon}: {self.grade}'


class StockSignals(models.Model):
    ticker = models.CharField(max_length=20, unique=True)
    uic = models.PositiveIntegerField(null=True, blank=True)
    as_of = models.DateField(null=True, blank=True)
    active = models.JSONField(default=list)
    events = models.JSONField(default=dict)
    context = models.JSONField(default=dict)
    runs = models.JSONField(default=dict)
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['ticker']

    def __str__(self):
        return f'{self.ticker}: {len(self.active)} active'
