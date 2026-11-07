import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def give_rows_to_owner(apps, schema_editor):
    Recommendation = apps.get_model('advisor', 'Recommendation')
    Profile = apps.get_model('users', 'Profile')
    if not Recommendation.objects.exists():
        return
    owner = Profile.objects.filter(is_owner=True).first()
    if owner is None:
        raise RuntimeError(
            'Recommendations exist but no user is the owner. '
            'Run the users migrations with SAXODASH_OWNER=<username> first.'
        )
    Recommendation.objects.update(user_id=owner.user_id)


def user_field(null):
    return models.ForeignKey(
        null=null,
        on_delete=django.db.models.deletion.CASCADE,
        related_name='+',
        to=settings.AUTH_USER_MODEL,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('advisor', '0001_initial'),
        ('users', '0002_pick_owner'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name='recommendation', name='user', field=user_field(True)),
        migrations.RunPython(give_rows_to_owner, migrations.RunPython.noop),
        migrations.AlterField(model_name='recommendation', name='user', field=user_field(False)),
    ]
