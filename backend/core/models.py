from django.db import models


class NetWorthSnapshot(models.Model):
    class Basis(models.TextChoices):
        RECONCILED = 'reconciled', 'Reconciled (bank + Saxo cash+positions)'
        APPROXIMATE = 'approximate', 'Approximate (bank + positions only - Saxo cash unavailable)'

    date = models.DateField(unique=True)
    portfolio_value = models.DecimalField(max_digits=14, decimal_places=2)
    bank_total = models.DecimalField(max_digits=14, decimal_places=2)
    net_worth = models.DecimalField(max_digits=14, decimal_places=2)
    # Which formula produced `net_worth` for this row - RECONCILED means
    # bank_total + saxo_account_value (everything the user has); APPROXIMATE
    # means bank_total + portfolio_value, which silently excludes any idle
    # Saxo cash. Historical rows (before this field existed) default to
    # APPROXIMATE since that is what the old formula actually computed - see
    # the 0005 migration's data step for the one-time reclassification of
    # rows that do have a saxo_account_value.
    net_worth_basis = models.CharField(
        max_length=12, choices=Basis.choices, default=Basis.APPROXIMATE,
    )
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
        return f'{self.date} net_worth={self.net_worth} ({self.net_worth_basis})'
