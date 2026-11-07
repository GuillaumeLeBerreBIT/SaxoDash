import os

from django.conf import settings
from django.db import migrations


def pick_owner(apps, schema_editor):
    alias = schema_editor.connection.alias
    app_label, model_name = settings.AUTH_USER_MODEL.split('.')
    User = apps.get_model(app_label, model_name)
    Profile = apps.get_model('users', 'Profile')
    users = list(User.objects.using(alias).order_by('pk'))
    if not users:
        return
    if len(users) == 1:
        chosen = users[0]
    else:
        wanted = os.environ.get('SAXODASH_OWNER')
        if not wanted:
            raise RuntimeError(
                f'{len(users)} users exist and none can be assumed to be the owner. '
                'Set SAXODASH_OWNER=<username> and run migrate again.'
            )
        matches = [user for user in users if user.username == wanted]
        if not matches:
            raise RuntimeError(f'SAXODASH_OWNER={wanted!r} matches no user.')
        chosen = matches[0]
    chosen.is_superuser = True
    chosen.save(update_fields=['is_superuser'])
    for user in users:
        Profile.objects.using(alias).update_or_create(
            user=user, defaults={'is_owner': user.pk == chosen.pk}
        )


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(pick_owner, migrations.RunPython.noop),
    ]
