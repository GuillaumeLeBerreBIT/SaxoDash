import logging

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET

logger = logging.getLogger(__name__)

PROBE_KEY = 'healthz:probe'


@require_GET
def healthz(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        cache.set(PROBE_KEY, 1, 10)
        if cache.get(PROBE_KEY) != 1:
            raise ConnectionError('cache did not return what was just written')
    except Exception:
        logger.exception('Health check failed')
        return JsonResponse({'status': 'unavailable'}, status=503)
    return JsonResponse({'status': 'ok'})
