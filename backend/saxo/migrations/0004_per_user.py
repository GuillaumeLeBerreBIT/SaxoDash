import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def give_rows_to_owner(apps, schema_editor):
    SaxoCredential = apps.get_model('saxo', 'SaxoCredential')
    SyncRun = apps.get_model('saxo', 'SyncRun')
    Profile = apps.get_model('users', 'Profile')
    if not SaxoCredential.objects.exists() and not SyncRun.objects.exists():
        return
    owner = Profile.objects.filter(is_owner=True).first()
    if owner is None:
        raise RuntimeError(
            'Saxo credentials or sync runs exist but no user is the owner. '
            'Run the users migrations with SAXODASH_OWNER=<username> first.'
        )
    newest = SaxoCredential.objects.order_by('-pk').first()
    if newest is not None:
        SaxoCredential.objects.exclude(pk=newest.pk).delete()
    SaxoCredential.objects.update(user_id=owner.user_id)
    SyncRun.objects.update(user_id=owner.user_id)


class Migration(migrations.Migration):

    dependencies = [
        ('saxo', '0003_syncrun_task_ran_idx'),
        ('users', '0002_pick_owner'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='saxocredential',
            name='user',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='+',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='syncrun',
            name='user',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='+',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(give_rows_to_owner, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='saxocredential',
            name='user',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='+',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
