from django.db import models

# Create your models here.
class NetWorthSnapshot(models.Model):
    date = models.DateField(unique=True)
    portfolio_value = models.DecimalField(max_digits=14, decimal_places=2)
    bank_total = models.DecimalField(max_digits=14, decimal_places=2)
    net_worth = models.DecimalField(max_digits=14, decimal_places=2)
    
    class Meta:
        ordering = ['date']
        
    def __str__(self):
        return f'{self.date} net_worth={self.net_worth}'
    