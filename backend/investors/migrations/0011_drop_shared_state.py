from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('investors', '0010_follows_and_reads'),
    ]

    operations = [
        migrations.RemoveField(model_name='investor', name='followed'),
        migrations.RemoveField(model_name='filingalert', name='read_at'),
    ]
