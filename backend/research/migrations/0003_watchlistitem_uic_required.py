from django.db import migrations, models


def drop_unpriceable_items(apps, schema_editor):
    """Rows with no Uic could never be priced and were filtered out of every
    quote batch, so they showed a permanent dash. They also made the
    (watchlist, uic) constraint vacuous, since NULLs never collide."""
    apps.get_model('research', 'WatchlistItem').objects.filter(uic__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('research', '0002_alter_watchlistitem_unique_together'),
    ]

    operations = [
        migrations.RunPython(drop_unpriceable_items, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='watchlistitem',
            name='uic',
            field=models.PositiveIntegerField(),
        ),
    ]
