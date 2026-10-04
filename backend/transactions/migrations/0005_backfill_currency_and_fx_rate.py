from django.db import migrations

TRADE_TYPES = ('BUY', 'SELL')


def backfill_from_positions(apps, schema_editor):
    Position = apps.get_model('portfolio', 'Position')
    Transaction = apps.get_model('transactions', 'Transaction')

    for position in Position.objects.all():
        Transaction.objects.filter(
            ticker=position.ticker,
            type__in=TRADE_TYPES,
            currency__isnull=True,
        ).update(currency=position.currency, fx_rate=position.fx_rate)


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0004_transaction_currency_transaction_fx_rate'),
        ('portfolio', '0006_remove_position_isin'),
    ]

    operations = [
        migrations.RunPython(backfill_from_positions, migrations.RunPython.noop),
    ]
