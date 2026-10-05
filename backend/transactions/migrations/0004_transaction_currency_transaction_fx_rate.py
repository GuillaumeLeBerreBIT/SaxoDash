from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0003_transaction_tx_date_id_desc_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='currency',
            field=models.CharField(blank=True, default=None, max_length=3, null=True),
        ),
        migrations.AddField(
            model_name='transaction',
            name='fx_rate',
            field=models.DecimalField(blank=True, decimal_places=8, default=None, max_digits=18, null=True),
        ),
    ]
