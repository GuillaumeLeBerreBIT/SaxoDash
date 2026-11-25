from django.db import migrations


def keep_only_the_saxo_cash_accounts(apps, schema_editor):
    accounts = apps.get_model('accounts', 'BankAccount').objects.using(schema_editor.connection.alias)
    accounts.exclude(external_id='saxo:cash').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('enablebanking', '0005_banktransaction_reviewed'),
        ('accounts', '0006_per_user'),
    ]

    operations = [
        migrations.RunPython(keep_only_the_saxo_cash_accounts, migrations.RunPython.noop),
        migrations.RemoveIndex(
            model_name='banksyncrun',
            name='bsr_bank_kind_ran_idx',
        ),
        migrations.DeleteModel(
            name='BankSyncRun',
        ),
        migrations.RemoveIndex(
            model_name='banktransaction',
            name='bktx_date_id_desc_idx',
        ),
        migrations.RemoveIndex(
            model_name='banktransaction',
            name='bktx_account_date_idx',
        ),
        migrations.DeleteModel(
            name='Budget',
        ),
        migrations.DeleteModel(
            name='EnableBankingCredential',
        ),
        migrations.DeleteModel(
            name='ManualIbanLabel',
        ),
        migrations.DeleteModel(
            name='Subscription',
        ),
        migrations.DeleteModel(
            name='BankTransaction',
        ),
    ]
