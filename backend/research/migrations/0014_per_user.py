import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

OWNED_MODELS = ['Watchlist', 'SymbolNote', 'PriceLine', 'TrendLine', 'TextAnnotation']
LINE_MODELS = ['priceline', 'trendline', 'textannotation']
NEW_INDEXES = {
    'priceline': 'research_pr_user_id_8fae91_idx',
    'trendline': 'research_tr_user_id_752b3f_idx',
    'textannotation': 'research_te_user_id_0a7bae_idx',
}
OLD_INDEXES = {
    'priceline': 'research_pr_uic_4040a0_idx',
    'trendline': 'research_tr_uic_0aae5f_idx',
    'textannotation': 'research_te_uic_065e7e_idx',
}


def give_rows_to_owner(apps, schema_editor):
    alias = schema_editor.connection.alias
    owned = [apps.get_model('research', name) for name in OWNED_MODELS]
    Profile = apps.get_model('users', 'Profile')
    if not any(model.objects.using(alias).exists() for model in owned):
        return
    owner = Profile.objects.using(alias).filter(is_owner=True).first()
    if owner is None:
        raise RuntimeError(
            'Watchlists, notes or chart lines exist but no user is the owner. '
            'Run the users migrations with SAXODASH_OWNER=<username> first.'
        )
    for model in owned:
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
        ('research', '0013_screenerrow_recent_closes'),
        ('users', '0002_pick_owner'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        *[migrations.AddField(model_name=name.lower(), name='user', field=user_field(null=True)) for name in OWNED_MODELS],
        migrations.RunPython(give_rows_to_owner, migrations.RunPython.noop),
        *[migrations.AlterField(model_name=name.lower(), name='user', field=user_field(null=False)) for name in OWNED_MODELS],
        migrations.AlterField(model_name='symbolnote', name='symbol', field=models.CharField(max_length=20)),
        migrations.AddConstraint(
            model_name='symbolnote',
            constraint=models.UniqueConstraint(fields=['user', 'symbol'], name='symbolnote_user_symbol_uniq'),
        ),
        *[migrations.RemoveIndex(model_name=name, name=OLD_INDEXES[name]) for name in LINE_MODELS],
        *[
            migrations.AddIndex(model_name=name, index=models.Index(fields=['user', 'uic', 'asset_type'], name=NEW_INDEXES[name]))
            for name in LINE_MODELS
        ],
    ]
