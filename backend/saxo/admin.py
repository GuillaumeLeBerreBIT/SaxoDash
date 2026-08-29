from django.contrib import admin

from .models import SaxoCredential


@admin.register(SaxoCredential)
class SaxoCredentialAdmin(admin.ModelAdmin):
    list_display = ('environment', 'needs_reauth', 'expires_at', 'last_synced_at')
    list_filter = ('environment', 'needs_reauth')
    readonly_fields = ('expires_at', 'last_synced_at')

    # access_token/refresh_token are EncryptedTextFields, so putting them on the
    # form would decrypt live Saxo bearer tokens into an HTML page and undo the
    # encryption-at-rest they exist for. needs_reauth stays editable: clearing it
    # by hand is the way to retry a credential after a transient auth failure.
    exclude = ('access_token', 'refresh_token')

    def has_add_permission(self, request):
        # Credentials come from the OAuth callback, which is the only place the
        # tokens exist. A hand-added row would fail on the excluded NOT NULL
        # token columns anyway.
        return False
