from decimal import Decimal

from django.conf import settings

BANK_LABELS = {'kbc': 'KBC', 'argenta': 'Argenta'}
GRADIENTS = {'kbc': 'from-sky-500 to-sky-700', 'argenta': 'from-amber-500 to-amber-700'}
ACCENTS = {'kbc': '#0284c7', 'argenta': '#d97706'}


def _mask_iban(iban):
    if not iban or len(iban) <= 8:
        return iban or '-'
    return f'{iban[:4]} •••• •••• {iban[-4:]}'


def _amount_for_type(balances, wanted):
    return next(
        (b['balance_amount']['amount'] for b in balances if b.get('balance_type') == wanted),
        None,
    )


def to_account_fields(bank, account, balance_response):
    """Map one Enable Banking account + its balances to a BankAccount row.

    CLBD (closing booked) is preferred for `balance` - the ledger figure a
    person recognizes as "my balance" - over ITAV (interim available, which
    can differ due to holds); ITAV is preferred for `available` for the
    opposite reason. Not every ASPSP sends both types, so each falls back to
    whichever balance actually came back.
    """
    balances = balance_response.get('balances', [])
    booked = _amount_for_type(balances, 'CLBD')
    available = _amount_for_type(balances, 'ITAV')
    fallback = balances[0]['balance_amount']['amount'] if balances else '0'
    primary = booked if booked is not None else fallback
    currency = balances[0]['balance_amount']['currency'] if balances else settings.REPORTING_CURRENCY

    return {
        'bank': BANK_LABELS[bank],
        'type': account.get('product') or 'Account',
        'iban_masked': _mask_iban(account.get('account_id', {}).get('iban')),
        'balance': Decimal(str(primary)),
        'available': Decimal(str(available if available is not None else primary)),
        'currency': currency,
        'gradient': GRADIENTS[bank],
        'accent': ACCENTS[bank],
    }


def to_bank_transaction_fields(bank, account_uid, raw):
    """Map one Enable Banking transaction to BankTransaction fields.
    remittance_information is a plain list of strings - joined here into one
    description. The counterparty is the *other* party: creditor for an
    outflow (DBIT), debtor for an inflow (CRDT) - never the account holder."""
    is_credit = raw['credit_debit_indicator'] == 'CRDT'
    amount = Decimal(raw['transaction_amount']['amount'])
    counterparty = (raw.get('debtor') if is_credit else raw.get('creditor')) or {}
    counterparty_account = (raw.get('debtor_account') if is_credit else raw.get('creditor_account')) or {}

    return {
        'bank': bank,
        'external_id': f'enablebanking:{bank}:{account_uid}:{raw["entry_reference"]}',
        'amount': amount if is_credit else -amount,
        'currency': raw['transaction_amount']['currency'],
        'booking_date': raw['booking_date'],
        'counterparty_name': counterparty.get('name', ''),
        'counterparty_iban': counterparty_account.get('iban'),
        'description': ' '.join(raw.get('remittance_information') or []),
    }
