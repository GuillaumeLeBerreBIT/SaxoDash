from decimal import Decimal


def without_bank_money(portfolio_value, bank_total, bank_only_total):
    bank = bank_total - (bank_only_total or Decimal('0'))
    return bank, portfolio_value + bank
