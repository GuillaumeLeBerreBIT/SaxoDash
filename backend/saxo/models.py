from django.db import models

from .fields import EncryptedTextField


class SaxoCredential(models.Model):
    ENVIRONMENT_CHOICES = [('sim', 'Simulation'), ('live', 'Live')]

    access_token = EncryptedTextField()
    refresh_token = EncryptedTextField()
    expires_at = models.DateTimeField()
    environment = models.CharField(max_length=10, choices=ENVIRONMENT_CHOICES, default='sim')
    needs_reauth = models.BooleanField(default=False)

    def __str__(self):
        return f'SaxoCredential({self.environment}, needs_reauth={self.needs_reauth})'


class SyncRun(models.Model):
    """One execution of a sync task, and what it actually did.

    Freshness is a fact about the synced data, not about the credential: it
    used to live on SaxoCredential, which re-authentication deletes and
    recreates, so "last synced" reset to never on every reconnect. Recording
    skips as well as successes is what stops a task that did nothing from
    being indistinguishable from one that worked.
    """

    OUTCOME_CHOICES = [
        ('ok', 'Completed'),
        ('skipped', 'Skipped'),
        ('failed', 'Failed'),
    ]

    task = models.CharField(max_length=64)
    outcome = models.CharField(max_length=10, choices=OUTCOME_CHOICES)
    detail = models.CharField(max_length=200, blank=True, default='')
    rows = models.PositiveIntegerField(default=0)
    ran_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ran_at', '-id']
        indexes = [models.Index(fields=['-ran_at', '-id'], name='syncrun_ran_at_desc_idx')]

    def __str__(self):
        return f'{self.task} {self.outcome} at {self.ran_at}'
