from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_restate_without_bank_money'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='networthsnapshot',
            name='bank_only_total',
        ),
    ]
