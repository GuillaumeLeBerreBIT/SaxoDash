from django.db import models

class Position(models.Model):
    TYPE_CHOICES = [('STOCK', 'Stock'), ('ETF', 'ETF')]
    
    ticker = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    qty = models.IntegerField()
    avg_cost = models.DecimalField(max_digits=12, decimal_places=2)
    current_price = models.DecimalField(max_digits=12, decimal_places=2)
    sector = models.CharField(max_length=50)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    color = models.CharField(max_length=7)
    
    class Meta: 
        ordering = ['-ticker']
        
    def __str__(self):
        return self.ticker