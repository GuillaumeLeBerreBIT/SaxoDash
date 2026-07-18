from django.db import models

# Create your models here.
class BankAccount(models.Model):
    bank = models.CharField(max_length=50)
    type = models.CharField(max_length=50)
    iban_masked = models.CharField(max_length=34)
    balance = models.DecimalField(max_digits=12, decimal_places=2)
    available = models.DecimalField(max_digits=12, decimal_places=2)
    gradient = models.CharField(max_length=100, blank=True, default='')
    accent = models.CharField(max_length=20, blank=True, default='')
    
    def __str__(self):
        return f'{self.bank} {self.type}'