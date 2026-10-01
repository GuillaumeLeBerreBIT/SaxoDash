from django.db import models


class Watchlist(models.Model):
    name = models.CharField(max_length=60)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.name


class WatchlistItem(models.Model):
    watchlist = models.ForeignKey(Watchlist, related_name='items', on_delete=models.CASCADE)
    symbol = models.CharField(max_length=20)

    # Resolved once from the search result the user picked, so rendering a rail
    # row costs one batched quote call and no instrument lookup. Required: a
    # row exists to be priced, and pricing needs a Uic - and a nullable one
    # would make the unique_together below vacuous, since NULLs never collide.
    uic = models.PositiveIntegerField()
    asset_type = models.CharField(max_length=20, default='Stock')
    description = models.CharField(max_length=120, blank=True, default='')
    exchange = models.CharField(max_length=20, blank=True, default='')

    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['added_at', 'id']
        # The Uic, not the bare ticker: NVDA:xnas and NVDA:xetr are different
        # instruments that share a symbol, and keying on the symbol rejected
        # the second as a duplicate of the first.
        unique_together = ('watchlist', 'uic')

    def __str__(self):
        return f'{self.symbol} in {self.watchlist.name}'


class SymbolNote(models.Model):
    """The Research page's own-judgment fields, one record per symbol: what
    the company does, the case for and against it, and what would end the
    thesis. Single-tenant, like Watchlist - no user FK. A row is created on
    first GET (see SymbolNoteView), so an unannotated symbol is an empty
    record rather than a 404."""

    symbol = models.CharField(max_length=20, unique=True)

    business_summary = models.TextField(blank=True, default='')
    risks_to_watch = models.TextField(blank=True, default='')

    bull_case = models.TextField(blank=True, default='')
    bear_case = models.TextField(blank=True, default='')
    target_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    stop_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    sell_trigger = models.TextField(blank=True, default='')

    reviewed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['symbol']

    def __str__(self):
        return f'Note for {self.symbol}'


class PriceLine(models.Model):
    uic = models.PositiveIntegerField()
    asset_type = models.CharField(max_length=20)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    label = models.CharField(max_length=60, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['uic', 'asset_type'])]

    def __str__(self):
        return f'{self.price} on {self.uic}:{self.asset_type}'


class TrendLine(models.Model):
    uic = models.PositiveIntegerField()
    asset_type = models.CharField(max_length=20)
    start_bar_date = models.DateField()
    start_price = models.DecimalField(max_digits=12, decimal_places=2)
    end_bar_date = models.DateField()
    end_price = models.DecimalField(max_digits=12, decimal_places=2)
    label = models.CharField(max_length=60, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['uic', 'asset_type'])]

    def __str__(self):
        return f'{self.start_price}@{self.start_bar_date} -> {self.end_price}@{self.end_bar_date} on {self.uic}:{self.asset_type}'


class TextAnnotation(models.Model):
    uic = models.PositiveIntegerField()
    asset_type = models.CharField(max_length=20)
    bar_date = models.DateField()
    price = models.DecimalField(max_digits=12, decimal_places=2)
    text = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['uic', 'asset_type'])]

    def __str__(self):
        return f'"{self.text}" at {self.price}@{self.bar_date} on {self.uic}:{self.asset_type}'
