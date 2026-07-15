from django.db import models

# Create your models here.
class Transaction(models.Model):
    
    TYPE_CHOICES = [
        ('BUY', 'Buy'), ('SELL', 'Sell'), ('DIVIDEND', 'Dividend'),
        ('DEPOSIT', 'Deposit'), ('FEE', 'Fee'),
    ]
    
    date = models.DateField()
    type = models.CharField(max_length=10 ,choices=TYPE_CHOICES)
    instrument = models.CharField(max_length=100)
    ticker = models.CharField(max_length=10, blank=True, default='-')
    qty = models.DecimalField(max_digits=12, decimal_places=4)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    account = models.CharField(max_length=50, default='Saxo')
    
    class Meta:
        ordering = ['-date', '-id']
        
    def __str__(self):
        return f'{self.date} {self.type} {self.ticker}'
        