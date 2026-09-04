from django.conf import settings
from django.db import models


class BankAccount(models.Model):
    bank = models.CharField(max_length=50)
    type = models.CharField(max_length=50)
    iban_masked = models.CharField(max_length=34)
    balance = models.DecimalField(max_digits=12, decimal_places=2)
    available = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default=settings.REPORTING_CURRENCY)
    gradient = models.CharField(max_length=100, blank=True, default='')
    accent = models.CharField(max_length=20, blank=True, default='')

    # Stable key for synced accounts; null for ones entered by hand. `bank` is
    # not unique because one bank can hold several accounts.
    external_id = models.CharField(max_length=64, null=True, blank=True,
                                   default=None, unique=True)

    class Meta:
        ordering = ['bank', 'type']

    def __str__(self):
        return f'{self.bank} {self.type}'