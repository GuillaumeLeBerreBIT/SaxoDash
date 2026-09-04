"""Amounts that carry their currency, so combining two of them can fail.

Net worth was overstated because a USD position total and a EUR cash balance
are both plain Decimals: the addition that was wrong was indistinguishable
from every addition that was right. Aggregation goes through Money so a
mismatch raises instead of reaching the dashboard.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

CENTS = Decimal('0.01')


class CurrencyMismatch(ValueError):
    """Raised when amounts in different currencies are combined."""


@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency: str

    def __add__(self, other):
        if self.currency != other.currency:
            raise CurrencyMismatch(
                f'Cannot add {other.currency} to {self.currency}.'
            )
        return Money(self.amount + other.amount, self.currency)

    def converted(self, currency, rate):
        return Money(self.amount * rate, currency)

    def rounded(self):
        return Money(self.amount.quantize(CENTS, rounding=ROUND_HALF_UP), self.currency)

    @classmethod
    def zero(cls, currency):
        return cls(Decimal('0'), currency)

    @classmethod
    def total(cls, amounts, currency):
        """Sum, refusing to mix currencies.

        `currency` is required rather than taken from the first element so an
        empty sequence still produces a denominated zero.
        """
        result = cls.zero(currency)
        for amount in amounts:
            result = result + amount
        return result
