from django.db import models

from saxo.fields import EncryptedTextField


class EnableBankingCredential(models.Model):
    """One row per connected bank. Unlike SaxoCredential there is no
    access/refresh token pair - Enable Banking authenticates every request
    with a fresh JWT signed by the app's own private key (see client.py),
    and the only per-user secret worth encrypting is the session_id."""

    BANK_CHOICES = [('kbc', 'KBC'), ('argenta', 'Argenta')]

    bank = models.CharField(max_length=20, choices=BANK_CHOICES, unique=True)
    session_id = EncryptedTextField()
    valid_until = models.DateTimeField()
    linked_accounts = models.JSONField(default=list)
    needs_reauth = models.BooleanField(default=False)

    def __str__(self):
        return f'EnableBankingCredential({self.bank}, needs_reauth={self.needs_reauth})'


class BankSyncRun(models.Model):
    """One execution of sync_enablebanking_balances for one bank.

    Separate table from saxo.SyncRun, deliberately: SaxoStatusView reads
    SyncRun.objects.all() unscoped, assuming only Saxo tasks write to it -
    writing here too would silently blend this integration's health into
    Saxo's status endpoint.
    """

    OUTCOME_CHOICES = [('ok', 'Completed'), ('skipped', 'Skipped'), ('failed', 'Failed')]

    bank = models.CharField(max_length=20, choices=EnableBankingCredential.BANK_CHOICES)
    outcome = models.CharField(max_length=10, choices=OUTCOME_CHOICES)
    detail = models.CharField(max_length=200, blank=True, default='')
    rows = models.PositiveIntegerField(default=0)
    ran_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ran_at', '-id']
        indexes = [models.Index(fields=['bank', '-ran_at'], name='bsr_bank_ran_at_idx')]

    def __str__(self):
        return f'{self.bank} {self.outcome} at {self.ran_at}'
