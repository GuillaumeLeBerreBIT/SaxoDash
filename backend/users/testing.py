from django.contrib.auth import get_user_model

from users.models import Profile


def make_user(username='u', *, email=None, password='pw-Strong-123', owner=False):
    user = get_user_model().objects.create_user(
        username, email=email or f'{username}@example.com', password=password
    )
    profile, _ = Profile.objects.get_or_create(user=user)
    if owner:
        profile.is_owner = True
        profile.save(update_fields=['is_owner'])
    return user
