from django.urls import path

from users import views

urlpatterns = [
    path('signup/', views.SignupView.as_view(), name='signup'),
    path('me/', views.MeView.as_view(), name='me'),
    path('password/', views.PasswordView.as_view(), name='password'),
    path('password-reset/', views.PasswordResetRequestView.as_view(), name='password-reset'),
    path(
        'password-reset/confirm/',
        views.PasswordResetConfirmView.as_view(),
        name='password-reset-confirm',
    ),
    path('sign-out-everywhere/', views.SignOutEverywhereView.as_view(), name='sign-out-everywhere'),
]
