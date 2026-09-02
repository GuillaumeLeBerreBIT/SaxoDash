from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken


class TokenLogoutView(APIView):
    # No authentication at all: the access token is usually already stale by the
    # time somebody logs out, and JWTAuthentication would 401 before AllowAny is
    # consulted. The refresh token in the body is the credential here.
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        refresh = request.data.get('refresh')
        if not refresh:
            return Response(
                {'detail': 'A refresh token is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            RefreshToken(refresh).blacklist()
        except TokenError:
            pass

        return Response(status=status.HTTP_205_RESET_CONTENT)
