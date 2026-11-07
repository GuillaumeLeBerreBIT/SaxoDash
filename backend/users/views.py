from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from users import tokens
from users.serializers import (
    AccountChangeSerializer,
    PasswordChangeSerializer,
    SignupSerializer,
    UserSerializer,
)


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
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        tokens.blacklist_all(user)
        return Response(tokens.issue(user))


class SignOutEverywhereView(APIView):
    def post(self, request):
        tokens.blacklist_all(request.user)
        return Response(status=status.HTTP_205_RESET_CONTENT)
