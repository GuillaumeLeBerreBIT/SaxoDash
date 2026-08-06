from cryptography.fernet import Fernet
from django.conf import settings
from django.db import models

def _fernet():
    return Fernet(settings.SAXO_TOKEN_ENCRYPTION_KEY.encode())

class EncryptedTextField(models.TextField):
    
    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value is None or value == '':
            return value
        return _fernet().encrypt(value.encode()).decode()
    
    def from_db_value(self, value, expressions, connection):
        if value is None or value == '':
            return value
        return _fernet().decrypt(value.encode()).decode()