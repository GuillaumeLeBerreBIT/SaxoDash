from django.urls import path

from .views import (
    ChartView,
    CompanyNewsView,
    EarningsCalendarView,
    FundamentalsView,
    InstrumentDetailsView,
    InstrumentSearchView,
    PeersView,
    QuotesView,
    SymbolEarningsView,
    SymbolNoteView,
    WatchlistDetailView,
    WatchlistItemCreateView,
    WatchlistItemDeleteView,
    WatchlistListCreateView,
)

urlpatterns = [
    path('chart/', ChartView.as_view(), name='research-chart'),
    path('quotes/', QuotesView.as_view(), name='research-quotes'),
    path('fundamentals/<str:symbol>/', FundamentalsView.as_view(), name='research-fundamentals'),
    path('peers/<str:symbol>/', PeersView.as_view(), name='research-peers'),
    path(
        'earnings/calendar/',
        EarningsCalendarView.as_view(),
        name='research-earnings-calendar',
    ),
    path(
        'earnings/<str:symbol>/',
        SymbolEarningsView.as_view(),
        name='research-earnings-symbol',
    ),
    path('news/<str:symbol>/', CompanyNewsView.as_view(), name='research-company-news'),
    path('notes/<str:symbol>/', SymbolNoteView.as_view(), name='research-symbol-note'),
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
