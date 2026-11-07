import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def give_rows_to_owner(apps, schema_editor):
    models_to_backfill = [apps.get_model('core', 'NetWorthSnapshot')]
    Profile = apps.get_model('users', 'Profile')
    if not any(model.objects.exists() for model in models_to_backfill):
        return
    owner = Profile.objects.filter(is_owner=True).first()
    if owner is None:
        raise RuntimeError(
            'Net worth snapshots exist but no user is the owner. '
            'Run the users migrations with SAXODASH_OWNER=<username> first.'
        )
    for model in models_to_backfill:
        model.objects.update(user_id=owner.user_id)


def user_field(null):
    return models.ForeignKey(
        null=null,
        on_delete=django.db.models.deletion.CASCADE,
        related_name='+',
        to=settings.AUTH_USER_MODEL,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_seed_house_sync'),
        ('users', '0002_pick_owner'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name='networthsnapshot', name='user', field=user_field(null=True)),
        migrations.RunPython(give_rows_to_owner, migrations.RunPython.noop),
        migrations.AlterField(model_name='networthsnapshot', name='user', field=user_field(null=False)),
        migrations.AlterField(model_name='networthsnapshot', name='date', field=models.DateField()),
        migrations.AddConstraint(
            model_name='networthsnapshot',
            constraint=models.UniqueConstraint(fields=['user', 'date'], name='networth_user_date_uniq'),
        ),
    ]
