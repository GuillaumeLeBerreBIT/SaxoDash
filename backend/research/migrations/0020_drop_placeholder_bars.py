from django.db import migrations

LOWEST_TRADED_PRICE = 0.0001
PRICES = slice(1, 5)


def drop_placeholder_bars(apps, schema_editor):
    DailyBars = apps.get_model('research', 'DailyBars')
    for daily in DailyBars.objects.iterator(chunk_size=20):
        kept = [bar for bar in daily.bars if min(bar[PRICES]) >= LOWEST_TRADED_PRICE]
        if len(kept) != len(daily.bars):
            daily.bars = kept
            daily.save(update_fields=['bars'])


class Migration(migrations.Migration):

    dependencies = [
        ('research', '0019_dailybars_backfill_tried_at'),
    ]

    operations = [
        migrations.RunPython(drop_placeholder_bars, migrations.RunPython.noop),
    ]
