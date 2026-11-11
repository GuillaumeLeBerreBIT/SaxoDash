from django.urls import path

from . import views

urlpatterns = [
    path('', views.VerdictSummaryView.as_view()),
    path('track-record/', views.TrackRecordView.as_view()),
    path('<str:ticker>/', views.VerdictDetailView.as_view()),
]
