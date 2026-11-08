from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile'
    )
    is_owner = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['is_owner'],
                condition=models.Q(is_owner=True),
                name='one_owner',
            )
        ]

    def __str__(self):
        return f'{self.user} (owner)' if self.is_owner else str(self.user)
