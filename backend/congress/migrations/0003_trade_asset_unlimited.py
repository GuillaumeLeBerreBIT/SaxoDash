from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("congress", "0002_report_retry_after"),
    ]

    operations = [
        migrations.AlterField(
            model_name="trade",
            name="asset",
            field=models.TextField(),
        ),
    ]
