from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q


class EmailOrUsernameBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or password is None:
            return None
        login = username.strip()
        users = get_user_model().objects.filter(
            Q(username__iexact=login) | Q(email__iexact=login)
        )
        for user in users:
            if user.check_password(password) and self.user_can_authenticate(user):
                return user
        return None
