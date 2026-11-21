from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('verdicts', '0005_verdictcall_rule'),
    ]

    operations = [
        migrations.AddField(
            model_name='stockverdict',
            name='close_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
