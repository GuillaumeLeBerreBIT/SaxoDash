from django.db import models


class Member(models.Model):
    HOUSE = 'house'

    slug = models.SlugField(max_length=80, unique=True)
    bioguide_id = models.CharField(max_length=7, unique=True, null=True, blank=True)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    chamber = models.CharField(max_length=10, default=HOUSE)
    state_district = models.CharField(max_length=6)
    party = models.CharField(max_length=20, blank=True, default='')
    photo_url = models.URLField(blank=True, default='')
    basis = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.first_name} {self.last_name} ({self.state_district})'


class Report(models.Model):
    PENDING = 'pending'
    PARSED = 'parsed'
    FAILED = 'failed'
    PAPER = 'paper'
    STATUS_CHOICES = [(PENDING, 'Pending'), (PARSED, 'Parsed'), (FAILED, 'Failed'), (PAPER, 'Paper')]

    doc_id = models.CharField(max_length=12, unique=True)
    member = models.ForeignKey(Member, related_name='reports', on_delete=models.CASCADE)
    year = models.PositiveSmallIntegerField()
    filed_on = models.DateField()
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default=PENDING)
    amended = models.BooleanField(default=False)
    attempts = models.PositiveSmallIntegerField(default=0)
    unparsed_rows = models.PositiveSmallIntegerField(default=0)
    error = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        ordering = ['filed_on', 'doc_id']


class Trade(models.Model):
    PURCHASE = 'purchase'
    SALE = 'sale'
    PARTIAL_SALE = 'partial_sale'
    EXCHANGE = 'exchange'
    KIND_CHOICES = [(PURCHASE, 'Purchase'), (SALE, 'Sale'), (PARTIAL_SALE, 'Partial sale'), (EXCHANGE, 'Exchange')]
    CALL = 'call'
    PUT = 'put'
    OPTION_CHOICES = [('', 'Not an option'), (CALL, 'Call'), (PUT, 'Put')]

    report = models.ForeignKey(Report, related_name='trades', on_delete=models.CASCADE)
    owner = models.CharField(max_length=4, default='self')
    asset = models.CharField(max_length=300)
    asset_type = models.CharField(max_length=4, blank=True, default='')
    ticker = models.CharField(max_length=16, null=True, blank=True)
    kind = models.CharField(max_length=12, choices=KIND_CHOICES)
    option = models.CharField(max_length=4, choices=OPTION_CHOICES, blank=True, default='')
    exercise = models.BooleanField(default=False)
    traded_on = models.DateField()
    notified_on = models.DateField(null=True, blank=True)
    amount_low = models.PositiveBigIntegerField()
    amount_high = models.PositiveBigIntegerField(null=True, blank=True)
    priceable = models.BooleanField(default=False)

    class Meta:
        ordering = ['traded_on', 'id']
        indexes = [models.Index(fields=['ticker'])]


class Holding(models.Model):
    member = models.ForeignKey(Member, related_name='holdings', on_delete=models.CASCADE)
    ticker = models.CharField(max_length=16)
    value = models.FloatField()
    weight_pct = models.FloatField()

    class Meta:
        unique_together = [('member', 'ticker')]
        ordering = ['-value']


class CopyPerformance(models.Model):
    member = models.OneToOneField(Member, related_name='copy_performance', on_delete=models.CASCADE)
    since = models.DateField()
    until = models.DateField()
    clone_return_pct = models.FloatField()
    benchmark_return_pct = models.FloatField()
    clone_cagr_pct = models.FloatField(null=True, blank=True)
    benchmark_cagr_pct = models.FloatField(null=True, blank=True)
    coverage_pct = models.FloatField()
    periods = models.PositiveSmallIntegerField()
    skipped_periods = models.PositiveSmallIntegerField(default=0)
    series = models.JSONField(default=list)
    computed_at = models.DateTimeField(auto_now=True)


class HouseIndexState(models.Model):
    year = models.PositiveSmallIntegerField(unique=True)
    etag = models.CharField(max_length=100, blank=True, default='')
    last_modified = models.CharField(max_length=40, blank=True, default='')
    checked_at = models.DateTimeField(null=True, blank=True)
