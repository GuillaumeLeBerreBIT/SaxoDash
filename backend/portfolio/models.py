from decimal import Decimal

from django.db import models


class Position(models.Model):
    TYPE_CHOICES = [('STOCK', 'Stock'), ('ETF', 'ETF')]

    ticker = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    qty = models.IntegerField()
    avg_cost = models.DecimalField(max_digits=12, decimal_places=2)
    current_price = models.DecimalField(max_digits=12, decimal_places=2)
    sector = models.CharField(max_length=50)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    color = models.CharField(max_length=7)

    class Meta:
        ordering = ['-ticker']

    def __str__(self):
        return self.ticker

    @property
    def value(self):
        return self.qty * self.current_price

    @property
    def cost(self):
        return self.qty * self.avg_cost

    @property
    def pnl(self):
        return self.value - self.cost

    @property
    def pnl_pct(self):
        cost = self.cost
        if not cost:
            return Decimal('0')
        return (self.pnl / cost) * 100

    def weight_of(self, total_value):
        if not total_value:
            return Decimal('0')
        return (self.value / total_value) * 100
