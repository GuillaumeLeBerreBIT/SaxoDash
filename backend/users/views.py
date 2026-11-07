import logging
from functools import partial

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from users import reset, tokens
from users.serializers import (
    AccountChangeSerializer,
    PasswordChangeSerializer,
    SignupSerializer,
    UserSerializer,
)
from users.tasks import send_password_reset


logger = logging.getLogger('users.reset')
RESET_REQUESTED = 'If an account exists for that address, a link is on its way.'
RESET_INVALID = 'This reset link is invalid or has expired.'


def queue_reset_mail(user_id):
    try:
        send_password_reset.delay(user_id)
    except Exception:
        logger.exception('Password reset email for user %s could not be queued', user_id)


class SignupView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = 'signup'

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {**tokens.issue(user), 'user': UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = AccountChangeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        fields = [f for f in ('username', 'email') if f in serializer.validated_data]
        for field in fields:
            setattr(user, field, serializer.validated_data[field])
        if fields:
            user.save(update_fields=fields)
        return Response(UserSerializer(user).data)


class PasswordView(APIView):
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        return Response(
            tokens.set_password_and_reissue(user, serializer.validated_data['new_password'])
        )


class SignOutEverywhereView(APIView):
    def post(self, request):
        tokens.blacklist_all(request.user)
        return Response(status=status.HTTP_205_RESET_CONTENT)


class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = 'password_reset'

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        for user in reset.users_for_email(data.get('email')):
            transaction.on_commit(partial(queue_reset_mail, user.pk))
        return Response({'detail': RESET_REQUESTED})


class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = 'password_reset_confirm'

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        user = reset.user_for_link(data.get('uid'), data.get('token'))
        if user is None:
            return Response({'detail': RESET_INVALID}, status=status.HTTP_400_BAD_REQUEST)
        new_password = data.get('new_password')
        if not isinstance(new_password, str):
            return Response(
                {'new_password': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            validate_password(new_password, user)
        except ValidationError as error:
            return Response({'new_password': error.messages}, status=status.HTTP_400_BAD_REQUEST)
        return Response(tokens.set_password_and_reissue(user, new_password))
