from django.contrib.auth import get_user_model

from users.models import Profile


def owner():
    return get_user_model().objects.filter(profile__is_owner=True).first()


def is_owner(user):
    if user is None or not user.is_authenticated:
        return False
    return Profile.objects.filter(user=user, is_owner=True).exists()
