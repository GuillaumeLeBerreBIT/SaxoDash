from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('verdicts', '0006_stockverdict_close_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='stockverdict',
            name='fundamental_period',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='stockverdict',
            name='published_on',
            field=models.DateField(blank=True, null=True),
        ),
    ]
