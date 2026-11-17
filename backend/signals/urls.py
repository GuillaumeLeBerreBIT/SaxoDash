from django.urls import path

from . import views

urlpatterns = [
    path('', views.SignalListView.as_view()),
    path('<str:ticker>/', views.StockSignalsView.as_view()),
]
