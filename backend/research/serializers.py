from rest_framework import serializers

from .models import Watchlist, WatchlistItem


class WatchlistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = WatchlistItem
        fields = ['id', 'symbol', 'uic', 'asset_type', 'description', 'exchange', 'added_at']


class WatchlistSerializer(serializers.ModelSerializer):
    items = WatchlistItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(source='items.count', read_only=True)

    class Meta:
        model = Watchlist
        fields = ['id', 'name', 'order', 'created_at', 'items', 'item_count']


class WatchlistItemCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WatchlistItem
        fields = ['id', 'symbol', 'uic', 'asset_type', 'description', 'exchange', 'added_at']

    def validate_symbol(self, symbol):
        # unique_together cannot be validated by DRF here: `watchlist` comes
        # from the URL, not the payload, so it is not a serializer field and
        # the automatic validator never sees it. Without this the duplicate
        # reaches the database and surfaces as a 500.
        if self.context['watchlist'].items.filter(symbol=symbol).exists():
            raise serializers.ValidationError('That symbol is already in this list.')
        return symbol

    def create(self, validated_data):
        return WatchlistItem.objects.create(
            watchlist=self.context['watchlist'], **validated_data
        )
