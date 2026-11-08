import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def give_rows_to_owner(apps, schema_editor):
    alias = schema_editor.connection.alias
    models_to_backfill = [apps.get_model('accounts', 'BankAccount')]
    Profile = apps.get_model('users', 'Profile')
    if not any(model.objects.using(alias).exists() for model in models_to_backfill):
        return
    owner = Profile.objects.using(alias).filter(is_owner=True).first()
    if owner is None:
        raise RuntimeError(
            'Bank accounts exist but no user is the owner. '
            'Run the users migrations with SAXODASH_OWNER=<username> first.'
        )
    for model in models_to_backfill:
        model.objects.using(alias).update(user_id=owner.user_id)


def user_field(null):
    return models.ForeignKey(
        null=null,
        on_delete=django.db.models.deletion.CASCADE,
        related_name='+',
        to=settings.AUTH_USER_MODEL,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_bankaccount_currency'),
        ('users', '0002_pick_owner'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name='bankaccount', name='user', field=user_field(null=True)),
        migrations.RunPython(give_rows_to_owner, migrations.RunPython.noop),
        migrations.AlterField(model_name='bankaccount', name='user', field=user_field(null=False)),
        migrations.AlterField(model_name='bankaccount', name='external_id', field=models.CharField(blank=True, default=None, max_length=64, null=True)),
        migrations.AddConstraint(
            model_name='bankaccount',
            constraint=models.UniqueConstraint(fields=['user', 'external_id'], name='bankaccount_user_external_id_uniq'),
        ),
    ]
