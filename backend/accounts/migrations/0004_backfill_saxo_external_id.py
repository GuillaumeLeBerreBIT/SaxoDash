from django.db import migrations

SAXO_CASH_ACCOUNT_ID = 'saxo:cash'


def claim_saxo_account(apps, schema_editor):
    """Give the synced Saxo cash account its stable key.

    A bank-name case mismatch has produced duplicate 'Saxo'/'saxo' rows before,
    so match case-insensitively, keep the most recently updated balance, and
    fold the rest away.
    """
    BankAccount = apps.get_model('accounts', 'BankAccount')

    candidates = list(BankAccount.objects.filter(bank__iexact='Saxo').order_by('id'))
    if not candidates:
        return

    keeper = max(candidates, key=lambda a: (a.balance, a.id))
    keeper.bank = 'Saxo'
    keeper.external_id = SAXO_CASH_ACCOUNT_ID
    keeper.save(update_fields=['bank', 'external_id'])

    BankAccount.objects.filter(
        id__in=[a.id for a in candidates if a.id != keeper.id]
    ).delete()


def release_saxo_account(apps, schema_editor):
    BankAccount = apps.get_model('accounts', 'BankAccount')
    BankAccount.objects.filter(external_id=SAXO_CASH_ACCOUNT_ID).update(external_id=None)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_alter_bankaccount_options_bankaccount_external_id'),
    ]

    operations = [
        migrations.RunPython(claim_saxo_account, release_saxo_account),
    ]
