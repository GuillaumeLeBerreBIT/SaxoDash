from django.urls import path

from .views import MemberDetailView, MemberListView, OwnershipDetailView, OwnershipSummaryView

urlpatterns = [
    path('members/', MemberListView.as_view(), name='congress-members'),
    path('members/<slug:slug>/', MemberDetailView.as_view(), name='congress-member'),
    path('ownership/', OwnershipSummaryView.as_view(), name='congress-ownership'),
    path('ownership/<str:ticker>/', OwnershipDetailView.as_view(), name='congress-ownership-detail'),
]
