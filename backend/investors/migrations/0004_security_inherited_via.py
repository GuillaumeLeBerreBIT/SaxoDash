from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('investors', '0003_retry_foreign_issuer_tickers'),
    ]

    operations = [
        migrations.AddField(
            model_name='security',
            name='inherited_via',
            field=models.CharField(blank=True, choices=[('handover', 'Handover'), ('alias', 'Alias')], default='', max_length=10),
        ),
    ]
