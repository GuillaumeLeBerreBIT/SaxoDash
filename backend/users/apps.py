from django.apps import AppConfig
from django.conf import settings
from django.db.models.signals import post_save


def create_profile(sender, instance, created, **kwargs):
    if created and not kwargs.get('raw'):
        from users.models import Profile

        Profile.objects.using(kwargs.get('using')).get_or_create(user=instance)


class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'users'

    def ready(self):
        post_save.connect(
            create_profile,
            sender=settings.AUTH_USER_MODEL,
            dispatch_uid='users.create_profile',
        )
