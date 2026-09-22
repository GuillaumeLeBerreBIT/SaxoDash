from django.core.exceptions import ValidationError
from django.db import models

from accounts.models import BankAccount
from saxo.fields import EncryptedTextField


class EnableBankingCredential(models.Model):
    """One row per connected bank. Unlike SaxoCredential there is no
    access/refresh token pair - Enable Banking authenticates every request
    with a fresh JWT signed by the app's own private key (see client.py),
    and the only per-user secret worth encrypting is the session_id."""

    BANK_CHOICES = [('kbc', 'KBC'), ('argenta', 'Argenta')]

    bank = models.CharField(max_length=20, choices=BANK_CHOICES, unique=True)
    session_id = EncryptedTextField()
    valid_until = models.DateTimeField()
    linked_accounts = models.JSONField(default=list)
    needs_reauth = models.BooleanField(default=False)

    def __str__(self):
        return f'EnableBankingCredential({self.bank}, needs_reauth={self.needs_reauth})'


class BankSyncRun(models.Model):
    """One execution of sync_enablebanking_balances for one bank.

    Separate table from saxo.SyncRun, deliberately: SaxoStatusView reads
    SyncRun.objects.all() unscoped, assuming only Saxo tasks write to it -
    writing here too would silently blend this integration's health into
    Saxo's status endpoint.
    """

    KIND_CHOICES = [('balances', 'Balances'), ('transactions', 'Transactions')]
    OUTCOME_CHOICES = [('ok', 'Completed'), ('skipped', 'Skipped'), ('failed', 'Failed')]

    bank = models.CharField(max_length=20, choices=EnableBankingCredential.BANK_CHOICES)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='balances')
    outcome = models.CharField(max_length=10, choices=OUTCOME_CHOICES)
    detail = models.CharField(max_length=200, blank=True, default='')
    rows = models.PositiveIntegerField(default=0)
    ran_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ran_at', '-id']
        indexes = [models.Index(fields=['bank', 'kind', '-ran_at'], name='bsr_bank_kind_ran_idx')]

    def __str__(self):
        return f'{self.bank} {self.outcome} at {self.ran_at}'


CATEGORY_CHOICES = [
    ('GROCERIES', 'Groceries'),
    ('DINING', 'Dining'),
    ('TRANSPORT', 'Transport'),
    ('UTILITIES', 'Utilities'),
    ('SUBSCRIPTIONS', 'Subscriptions'),
    ('SHOPPING', 'Shopping'),
    ('HEALTH', 'Health'),
    ('TRAVEL', 'Travel'),
    ('ENTERTAINMENT', 'Entertainment'),
    ('INCOME', 'Income'),
    ('TRANSFER', 'Transfer'),
    ('SAVINGS', 'Savings'),
    ('REFUND_CREDIT', 'Refund/Credit'),
    ('OTHER', 'Other'),
]

BUDGETABLE_CATEGORIES = [
    (code, label) for code, label in CATEGORY_CHOICES
    if code not in ('INCOME', 'TRANSFER', 'SAVINGS', 'REFUND_CREDIT')
]


class BankTransaction(models.Model):
    """One settled (status=BOOK) transaction on a KBC/Argenta account. `category`
    is rule-assigned and recomputed every sync; `category_override` is
    user-set and never touched by sync - `effective_category` prefers it."""

    bank = models.CharField(max_length=20, choices=EnableBankingCredential.BANK_CHOICES)
    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name='bank_transactions')
    external_id = models.CharField(max_length=128, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3)
    booking_date = models.DateField()
    counterparty_name = models.CharField(max_length=200, blank=True, default='')
    counterparty_iban = models.CharField(max_length=34, null=True, blank=True, default=None)
    description = models.CharField(max_length=500, blank=True, default='')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='OTHER')
    category_override = models.CharField(max_length=20, choices=CATEGORY_CHOICES, null=True, blank=True, default=None)

    class Meta:
        ordering = ['-booking_date', '-id']
        indexes = [
            models.Index(fields=['-booking_date', '-id'], name='bktx_date_id_desc_idx'),
            models.Index(fields=['bank_account', '-booking_date'], name='bktx_account_date_idx'),
        ]

    def __str__(self):
        return f'{self.booking_date} {self.counterparty_name} {self.amount}'

    @property
    def effective_category(self):
        return self.category_override or self.category


class Subscription(models.Model):
    """A detected recurring-merchant pattern. Member transactions are found on
    demand by filtering BankTransaction on merchant_key, not stored via FK/M2M,
    so membership never drifts as new transactions arrive."""

    CADENCE_CHOICES = [('weekly', 'Weekly'), ('monthly', 'Monthly'), ('yearly', 'Yearly')]

    merchant_key = models.CharField(max_length=200, unique=True)
    display_name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='SUBSCRIPTIONS')
    expected_amount = models.DecimalField(max_digits=12, decimal_places=2)
    cadence = models.CharField(max_length=10, choices=CADENCE_CHOICES)
    last_charged = models.DateField()
    dismissed = models.BooleanField(default=False)

    class Meta:
        ordering = ['-last_charged']

    def __str__(self):
        return f'{self.display_name} ({self.cadence}, {"dismissed" if self.dismissed else "active"})'


class ManualIbanLabel(models.Model):
    """A manually-labeled account/counterparty the user has identified as
    theirs or as a household account - a pure lookup table, no balance/
    transaction sync. Two reasons to need one: Enable Banking won't expose
    the account for consent (Plan B, see the design spec), matched by iban;
    or the transaction has no counterparty_iban at all (a Bancontact/
    instant-payment row Enable Banking never structured), matched by an
    exact counterparty_name instead. At least one of the two is required -
    see clean(). User-managed via the Accounts page, not hardcoded rules."""

    iban = models.CharField(max_length=34, null=True, blank=True, default=None, unique=True)
    counterparty_name = models.CharField(max_length=200, null=True, blank=True, default=None, unique=True)
    label = models.CharField(max_length=100)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='SAVINGS')

    def __str__(self):
        return f'{self.label} ({self.iban or self.counterparty_name})'

    def clean(self):
        if not self.iban and not self.counterparty_name:
            raise ValidationError('Provide an IBAN or a counterparty name to match on.')

    def save(self, *args, **kwargs):
        # Normalized the same way transfers.py compares it, so a lookup
        # never silently misses on case/whitespace.
        if self.counterparty_name:
            self.counterparty_name = self.counterparty_name.strip().upper()
        super().save(*args, **kwargs)


class Budget(models.Model):
    """A monthly spending limit for one category. Flat, no rollover: each
    calendar month is evaluated fresh against whatever `monthly_limit`
    currently holds - editing it re-evaluates the whole current month, not
    just going forward."""

    category = models.CharField(max_length=20, choices=BUDGETABLE_CATEGORIES, unique=True)
    monthly_limit = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f'{self.category}: €{self.monthly_limit}/mo'
