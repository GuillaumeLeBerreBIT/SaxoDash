from django.db import migrations


def retry_foreign_issuers(apps, schema_editor):
    Security = apps.get_model('investors', 'Security')
    Security.objects.filter(ticker__isnull=True, cusip__regex=r'^[A-Za-z]').update(attempts=0)


class Migration(migrations.Migration):
    dependencies = [('investors', '0002_investor_hub')]

    operations = [migrations.RunPython(retry_foreign_issuers, migrations.RunPython.noop)]
