from django.db import migrations


def seed(apps, schema_editor):
    from core.scheduling import sync_periodic_tasks
    sync_periodic_tasks(apps=apps)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_seed_copy_performance'),
    ]

    operations = [
        migrations.RunPython(seed, noop),
    ]
