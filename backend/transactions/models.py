from django.db import models


class Transaction(models.Model):

    # No sync ever writes DIVIDEND/DEPOSIT/FEE rows - Saxo SIM has no itemized
    # cash-activity endpoint (verified live 2026-09-17: /hist/v1/cashtransactions,
    # /hist/v1/activities, /cs/v1/reports/activities/me all 404 or empty).
    # Kept for when that data becomes available rather than removed.
    TYPE_CHOICES = [
        ('BUY', 'Buy'), ('SELL', 'Sell'), ('DIVIDEND', 'Dividend'),
        ('DEPOSIT', 'Deposit'), ('FEE', 'Fee'),
    ]

    date = models.DateField()
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    instrument = models.CharField(max_length=100)
    ticker = models.CharField(max_length=10, blank=True, default='-')
    qty = models.DecimalField(max_digits=12, decimal_places=4)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    account = models.CharField(max_length=50, default='Saxo')
    saxo_trade_id = models.CharField(max_length=64, null=True,
                                     blank=True, default=None, unique=True)

    class Meta:
        ordering = ['-date', '-id']
        indexes = [
            models.Index(fields=['-date', '-id'], name='tx_date_id_desc_idx'),
            models.Index(fields=['type'], name='tx_type_idx'),
        ]

    def __str__(self):
        return f'{self.date} {self.type} {self.ticker}'

    @property
    def total(self):
        return self.qty * self.price
