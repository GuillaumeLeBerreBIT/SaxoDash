from django.db import models

from .fields import EncryptedTextField


class SaxoCredential(models.Model):
    ENVIRONMENT_CHOICES = [('sim', 'Simulation'), ('live', 'Live')]

    access_token = EncryptedTextField()
    refresh_token = EncryptedTextField()
    expires_at = models.DateTimeField()
    environment = models.CharField(max_length=10, choices=ENVIRONMENT_CHOICES, default='sim')
    needs_reauth = models.BooleanField(default=False)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'SaxoCredential({self.environment}, needs_reauth={self.needs_reauth})'