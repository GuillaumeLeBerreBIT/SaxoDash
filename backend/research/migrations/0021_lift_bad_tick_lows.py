from django.db import migrations

LOWEST_PLAUSIBLE_LOW = 0.2
OPEN, LOW, CLOSE = 1, 3, 4


def lift_bad_tick_lows(apps, schema_editor):
    DailyBars = apps.get_model('research', 'DailyBars')
    for daily in DailyBars.objects.iterator(chunk_size=20):
        changed = False
        for bar in daily.bars:
            body_bottom = min(bar[OPEN], bar[CLOSE])
            if bar[LOW] < LOWEST_PLAUSIBLE_LOW * body_bottom:
                bar[LOW] = body_bottom
                changed = True
        if changed:
            daily.save(update_fields=['bars'])


class Migration(migrations.Migration):

    dependencies = [
        ('research', '0020_drop_placeholder_bars'),
    ]

    operations = [
        migrations.RunPython(lift_bad_tick_lows, migrations.RunPython.noop),
    ]
