from django.db import models

# Create your models here.
class NetWorthSnapshot(models.Model):
    date = models.DateField(unique=True)
    portfolio_value = models.DecimalField(max_digits=14, decimal_places=2)
    bank_total = models.DecimalField(max_digits=14, decimal_places=2)
    net_worth = models.DecimalField(max_digits=14, decimal_places=2)
    # Saxo's reconciled cash+positions total (portfolio.services.
    # get_saxo_account_value) - the *investment-performance* series
    # (analytics/views.py::_portfolio_dated_values) should read this, not
    # portfolio_value, which is positions-only and drops every time a
    # position is sold into cash. NOT used for net_worth/bank_total: Saxo's
    # own cash is already mirrored into a BankAccount row
    # (saxo.mapping.SAXO_CASH_ACCOUNT_ID, written atomically alongside this
    # field by saxo.tasks.sync_account_balance), so bank_total already
    # includes it - adding this on top would double-count that cash. Null on
    # a day the broker figure wasn't usable - see get_saxo_account_value for
    # why this has no positions-only fallback the way portfolio_value does.
    saxo_account_value = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, default=None,
    )

    class Meta:
        ordering = ['date']

    def __str__(self):
        return f'{self.date} net_worth={self.net_worth}'
