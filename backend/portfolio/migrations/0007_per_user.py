import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def give_rows_to_owner(apps, schema_editor):
    models_to_backfill = [apps.get_model('portfolio', 'Position'), apps.get_model('portfolio', 'PortfolioValuation')]
    Profile = apps.get_model('users', 'Profile')
    if not any(model.objects.exists() for model in models_to_backfill):
        return
    owner = Profile.objects.filter(is_owner=True).first()
    if owner is None:
        raise RuntimeError(
            'Positions or valuations exist but no user is the owner. '
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
        ('portfolio', '0006_remove_position_isin'),
        ('users', '0002_pick_owner'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(model_name='position', name='user', field=user_field(null=True)),
        migrations.AddField(model_name='portfoliovaluation', name='user', field=user_field(null=True)),
        migrations.RunPython(give_rows_to_owner, migrations.RunPython.noop),
        migrations.AlterField(model_name='position', name='user', field=user_field(null=False)),
        migrations.AlterField(model_name='portfoliovaluation', name='user', field=user_field(null=False)),
        migrations.AlterField(model_name='position', name='ticker', field=models.CharField(max_length=10)),
        migrations.AlterField(model_name='portfoliovaluation', name='source', field=models.CharField(default='saxo', max_length=32)),
        migrations.AddConstraint(
            model_name='position',
            constraint=models.UniqueConstraint(fields=['user', 'ticker'], name='position_user_ticker_uniq'),
        ),
        migrations.AddConstraint(
            model_name='portfoliovaluation',
            constraint=models.UniqueConstraint(fields=['user', 'source'], name='valuation_user_source_uniq'),
        ),
    ]
