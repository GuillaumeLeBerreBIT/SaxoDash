from django.db import models

# Create your models here.
class NetWorthSnapshot(models.Model):
    date = models.DateField(unique=True)
    portfolio_value = models.DecimalField(max_digits=14, decimal_places=2)
    bank_total = models.DecimalField(max_digits=14, decimal_places=2)
    net_worth = models.DecimalField(max_digits=14, decimal_places=2)
    # Saxo's reconciled cash+positions total (portfolio.services.
    # get_saxo_account_value) - the return/performance series should read
    # this, not portfolio_value, which is positions-only and drops every
    # time a position is sold into cash. Null on a day the broker figure
    # wasn't usable - see get_saxo_account_value for why this has no
    # positions-only fallback the way portfolio_value does.
    saxo_account_value = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, default=None,
    )

    class Meta:
        ordering = ['date']
        
    def __str__(self):
        return f'{self.date} net_worth={self.net_worth}'
    