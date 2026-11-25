from django.db import migrations

from core.restatement import without_bank_money


def restate(apps, schema_editor):
    snapshot = apps.get_model('core', 'NetWorthSnapshot')
    rows = snapshot.objects.using(schema_editor.connection.alias)
    for row in rows.iterator():
        row.bank_total, row.net_worth = without_bank_money(row.portfolio_value, row.bank_total, row.bank_only_total)
        row.save(using=schema_editor.connection.alias, update_fields=['bank_total', 'net_worth'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_drop_bank_sync_schedule'),
    ]

    operations = [
        migrations.RunPython(restate, migrations.RunPython.noop),
    ]
