from django.db import migrations, models
from django.utils import timezone


def retire_cheap_calls(apps, schema_editor):
    VerdictCall = apps.get_model('verdicts', 'VerdictCall')
    VerdictCall.objects.update(rule='quality_and_cheap')
    VerdictCall.objects.filter(ended_on__isnull=True).update(ended_on=timezone.localdate())


class Migration(migrations.Migration):

    dependencies = [
        ('verdicts', '0004_stockverdict_eps_line'),
    ]

    operations = [
        migrations.AddField(
            model_name='verdictcall',
            name='rule',
            field=models.CharField(default='quality', max_length=20),
        ),
        migrations.RunPython(retire_cheap_calls, migrations.RunPython.noop),
    ]
