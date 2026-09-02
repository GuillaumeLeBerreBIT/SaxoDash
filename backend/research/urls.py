from django.urls import path

from .views import (
    ChartView,
    InstrumentDetailsView,
    InstrumentSearchView,
    QuotesView,
    WatchlistDetailView,
    WatchlistItemCreateView,
    WatchlistItemDeleteView,
    WatchlistListCreateView,
)

urlpatterns = [
    path('chart/', ChartView.as_view(), name='research-chart'),
    path('quotes/', QuotesView.as_view(), name='research-quotes'),
    path('instruments/', InstrumentSearchView.as_view(), name='research-instruments'),
    path(
        'instruments/<int:uic>/<str:asset_type>/',
        InstrumentDetailsView.as_view(),
        name='research-instrument-details',
    ),
    path('watchlists/', WatchlistListCreateView.as_view(), name='watchlist-list'),
    path('watchlists/<int:pk>/', WatchlistDetailView.as_view(), name='watchlist-detail'),
    path(
        'watchlists/<int:pk>/items/',
        WatchlistItemCreateView.as_view(),
        name='watchlist-item-create',
    ),
    path(
        'watchlists/<int:pk>/items/<int:item_pk>/',
        WatchlistItemDeleteView.as_view(),
        name='watchlist-item-delete',
    ),
]
