import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def give_state_to_owner(apps, schema_editor):
    alias = schema_editor.connection.alias
    Investor = apps.get_model('investors', 'Investor')
    FilingAlert = apps.get_model('investors', 'FilingAlert')
    InvestorFollow = apps.get_model('investors', 'InvestorFollow')
    FilingAlertRead = apps.get_model('investors', 'FilingAlertRead')
    Profile = apps.get_model('users', 'Profile')
    followed = list(Investor.objects.using(alias).filter(followed=True))
    read = list(FilingAlert.objects.using(alias).filter(read_at__isnull=False))
    if not followed and not read:
        return
    owner = Profile.objects.using(alias).filter(is_owner=True).first()
    if owner is None:
        raise RuntimeError(
            'Followed investors or read alerts exist but no user is the owner. '
            'Run the users migrations with SAXODASH_OWNER=<username> first.'
        )
    InvestorFollow.objects.using(alias).bulk_create(
        InvestorFollow(user_id=owner.user_id, investor=investor) for investor in followed
    )
    reads = [FilingAlertRead(user_id=owner.user_id, alert=alert) for alert in read]
    FilingAlertRead.objects.using(alias).bulk_create(reads)
    for entry, alert in zip(reads, read):
        FilingAlertRead.objects.using(alias).filter(pk=entry.pk).update(read_at=alert.read_at)


class Migration(migrations.Migration):

    dependencies = [
        ('investors', '0009_investor_successor'),
        ('users', '0002_pick_owner'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='investor',
            name='added_by',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='+', to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.CreateModel(
            name='InvestorFollow',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('investor', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name='follows', to='investors.investor',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.CreateModel(
            name='FilingAlertRead',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('read_at', models.DateTimeField(auto_now_add=True)),
                ('alert', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name='reads', to='investors.filingalert',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.AddConstraint(
            model_name='investorfollow',
            constraint=models.UniqueConstraint(fields=('user', 'investor'), name='follow_user_investor_uniq'),
        ),
        migrations.AddConstraint(
            model_name='filingalertread',
            constraint=models.UniqueConstraint(fields=('user', 'alert'), name='alertread_user_alert_uniq'),
        ),
        migrations.RunPython(give_state_to_owner, migrations.RunPython.noop),
    ]
