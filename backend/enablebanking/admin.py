from django.contrib import admin

from .models import BankSyncRun, BankTransaction, Budget, EnableBankingCredential, ManualIbanLabel, Subscription


@admin.register(EnableBankingCredential)
class EnableBankingCredentialAdmin(admin.ModelAdmin):
    list_display = ('bank', 'needs_reauth', 'valid_until')
    list_filter = ('bank', 'needs_reauth')
    readonly_fields = ('valid_until', 'linked_accounts')

    # session_id is an EncryptedTextField - excluding it keeps a decrypted
    # bearer-equivalent secret off an HTML admin page, same reasoning as
    # SaxoCredentialAdmin excluding access_token/refresh_token.
    exclude = ('session_id',)

    def has_add_permission(self, request):
        # Credentials come from the OAuth-style callback, the only place
        # session_id exists. A hand-added row would fail on the excluded
        # NOT NULL session_id column anyway.
        return False


@admin.register(BankSyncRun)
class BankSyncRunAdmin(admin.ModelAdmin):
    list_display = ('ran_at', 'bank', 'outcome', 'rows', 'detail')
    list_filter = ('bank', 'outcome')
    readonly_fields = ('bank', 'outcome', 'detail', 'rows', 'ran_at')

    def has_add_permission(self, request):
        return False


@admin.register(BankTransaction)
class BankTransactionAdmin(admin.ModelAdmin):
    list_display = ('booking_date', 'bank', 'counterparty_name', 'amount', 'category', 'category_override')
    list_filter = ('bank', 'category')
    search_fields = ('counterparty_name', 'description')


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'cadence', 'expected_amount', 'last_charged', 'dismissed')
    list_filter = ('cadence', 'dismissed')


@admin.register(ManualIbanLabel)
class ManualIbanLabelAdmin(admin.ModelAdmin):
    list_display = ('label', 'iban', 'category')


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ('category', 'monthly_limit')
