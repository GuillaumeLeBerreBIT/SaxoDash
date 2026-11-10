from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_seed_housekeeping'),
    ]

    operations = [
        migrations.RunSQL(
            [
                'DROP TABLE IF EXISTS authtoken_token',
                "DELETE FROM django_migrations WHERE app = 'authtoken'",
            ],
            migrations.RunSQL.noop,
        ),
    ]
