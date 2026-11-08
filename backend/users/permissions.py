from rest_framework.permissions import BasePermission

from .owner import is_owner


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and is_owner(request.user))
