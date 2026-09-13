from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import models

CENTS = Decimal('0.01')

SAXO_SOURCE = 'saxo'


def _money(value):
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


class Position(models.Model):
    TYPE_CHOICES = [('STOCK', 'Stock'), ('ETF', 'ETF')]

    # How `current_price` was arrived at, best first. `cost` means we could not
    # price the position at all and are showing what you paid for it.
    PRICE_SOURCE_CHOICES = [
        ('live', 'Live price'),
        ('derived', 'Derived from Saxo P/L'),
        ('cost', 'Open price (unpriced)'),
    ]

    ticker = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    qty = models.DecimalField(max_digits=16, decimal_places=4)
    avg_cost = models.DecimalField(max_digits=12, decimal_places=2)
    current_price = models.DecimalField(max_digits=12, decimal_places=2)
    sector = models.CharField(max_length=50)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    color = models.CharField(max_length=7)

    # Saxo's own identity for the instrument. Null for rows that predate the
    # sync that fills them; the Research page falls back to symbol search.
    # `type` cannot stand in - it says ETF where Saxo says Etf, and a Uic is
    # ambiguous without the AssetType that goes with it.
    uic = models.PositiveIntegerField(null=True, blank=True)
    asset_type = models.CharField(max_length=20, null=True, blank=True)

    # Prices are quoted in the instrument's currency, which is often not the
    # one the app reports in; fx_rate converts to REPORTING_CURRENCY.
    currency = models.CharField(max_length=3, default=settings.REPORTING_CURRENCY)
    fx_rate = models.DecimalField(max_digits=18, decimal_places=8, default=Decimal('1'))

    price_source = models.CharField(
        max_length=10, choices=PRICE_SOURCE_CHOICES, default='live'
    )
    priced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-ticker']

    def __str__(self):
        return self.ticker

    @property
    def is_priced(self):
        return self.price_source != 'cost'

    # value/cost/pnl are in REPORTING_CURRENCY so they can be summed across
    # positions; avg_cost and current_price stay in `currency`.

    @property
    def value(self):
        return _money(self.qty * self.current_price * self.fx_rate)

    @property
    def cost(self):
        return _money(self.qty * self.avg_cost * self.fx_rate)

    @property
    def pnl(self):
        return self.value - self.cost

    @property
    def pnl_pct(self):
        cost = self.cost
        if not cost:
            return Decimal('0')
        return _money((self.pnl / cost) * 100)

    def weight_of(self, total_value):
        if not total_value:
            return Decimal('0')
        return _money((self.value / total_value) * 100)


class PortfolioValuation(models.Model):
    """What the broker says the account is worth, in the account's currency.

    Stored rather than recomputed: Saxo returns positions already converted and
    reconciled (TotalValue - CashBalance == positions_value), while the app can
    only rebuild that figure from prices it may not be entitled to.
    """

    source = models.CharField(max_length=32, unique=True, default=SAXO_SOURCE)
    currency = models.CharField(max_length=3)
    cash_balance = models.DecimalField(max_digits=14, decimal_places=2)
    positions_value = models.DecimalField(max_digits=14, decimal_places=2)
    total_value = models.DecimalField(max_digits=14, decimal_places=2)
    as_of = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.source} {self.total_value} {self.currency}'
