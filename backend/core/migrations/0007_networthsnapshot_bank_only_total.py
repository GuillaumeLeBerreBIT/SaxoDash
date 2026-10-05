from decimal import Decimal

from django.db import migrations, models


def backfill_bank_only_total(apps, schema_editor):
    Snapshot = apps.get_model('core', 'NetWorthSnapshot')
    rows = Snapshot.objects.filter(saxo_account_value__isnull=False, bank_only_total__isnull=True)
    for snapshot in rows:
        saxo_cash = max(snapshot.saxo_account_value - snapshot.portfolio_value, Decimal('0'))
        snapshot.bank_only_total = max(snapshot.bank_total - saxo_cash, Decimal('0'))
        snapshot.save(update_fields=['bank_only_total'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_seed_discover_scan'),
    ]

    operations = [
        migrations.AddField(
            model_name='networthsnapshot',
            name='bank_only_total',
            field=models.DecimalField(blank=True, decimal_places=2, default=None, max_digits=14, null=True),
        ),
        migrations.RunPython(backfill_bank_only_total, migrations.RunPython.noop),
    ]
