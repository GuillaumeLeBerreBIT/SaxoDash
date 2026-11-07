from celery import shared_task
from django.contrib.auth import get_user_model

from users import reset


@shared_task
def send_password_reset(user_id):
    user = get_user_model().objects.filter(pk=user_id, is_active=True).first()
    if user is not None:
        reset.send_reset_link(user)
