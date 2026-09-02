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
    # row costs one batched quote call and no instrument lookup.
    uic = models.PositiveIntegerField(null=True, blank=True)
    asset_type = models.CharField(max_length=20, default='Stock')
    description = models.CharField(max_length=120, blank=True, default='')
    exchange = models.CharField(max_length=20, blank=True, default='')

    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['added_at', 'id']
        unique_together = ('watchlist', 'symbol')

    def __str__(self):
        return f'{self.symbol} in {self.watchlist.name}'
