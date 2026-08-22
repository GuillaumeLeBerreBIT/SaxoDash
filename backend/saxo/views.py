import secrets
from datetime import timedelta

from django.shortcuts import redirect
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView, Response

from . import client
from .models import SaxoCredential

class SaxoConnectView(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        state = secrets.token_urlsafe(24)
        request.session['saxo_oauth_state'] = state
        
        return redirect(client.build_authorize_url(state))
    
class SaxoCallbackView(APIView):
    
    permission_classes = [AllowAny]
    
    def get(self, request):
        code = request.query_params.get('code')
        state = request.query_params.get('state')
        expected_state = request.session.pop('saxo_oauth_state', None)
        
        if not code or not state or state != expected_state:
            return Response({'error': 'Invalid or missing OAuth state'}, status=400)
        
        token_data = client.exchange_code_for_token(code)
        
        SaxoCredential.objects.all().delete()
        SaxoCredential.objects.create(
            access_token=token_data['access_token'],
            refresh_token=token_data['refresh_token'],
            expires_at=timezone.now() + timedelta(seconds=token_data['expires_in']),
        )
        
        return Response({'connected': True})
    
class SaxoStatusView(APIView):
    
    def get(self, request):
        credential = SaxoCredential.objects.first()
        if not credential:
            return Response({'connected': False})
        return Response({
            'connected': True,
            'environment': credential.environment,
            'needs_reauth': credential.needs_reauth,
            'last_synced_at': credential.last_synced_at,
        })