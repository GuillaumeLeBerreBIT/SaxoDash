from rest_framework import serializers

from .models import Watchlist, WatchlistItem


class WatchlistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = WatchlistItem
        fields = ['id', 'symbol', 'uic', 'asset_type', 'description', 'exchange', 'added_at']


class WatchlistSerializer(serializers.ModelSerializer):
    items = WatchlistItemSerializer(many=True, read_only=True)

    class Meta:
        model = Watchlist
        fields = ['id', 'name', 'order', 'created_at', 'items']


class WatchlistItemCreateSerializer(serializers.ModelSerializer):
    # A row exists to be priced, and pricing needs a Uic. Accepting one without
    # meant it was silently dropped from every quote batch with nothing to show
    # the user why its price stayed a dash.
    uic = serializers.IntegerField(min_value=1)

    class Meta:
        model = WatchlistItem
        fields = ['id', 'symbol', 'uic', 'asset_type', 'description', 'exchange', 'added_at']

    def validate_uic(self, uic):
        # unique_together cannot be validated by DRF here: `watchlist` comes
        # from the URL, not the payload, so it is not a serializer field and
        # the automatic validator never sees it. Without this the duplicate
        # reaches the database and surfaces as a 500.
        if self.context['watchlist'].items.filter(uic=uic).exists():
            raise serializers.ValidationError('That instrument is already in this list.')
        return uic

    def create(self, validated_data):
        return WatchlistItem.objects.create(
            watchlist=self.context['watchlist'], **validated_data
        )
