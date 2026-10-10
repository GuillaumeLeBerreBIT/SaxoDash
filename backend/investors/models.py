from django.db import models


STYLES = ('Value', 'Growth', 'Activist', 'Macro', 'Tech', 'Concentrated', 'Contrarian', 'Quant')


class Investor(models.Model):
    name = models.CharField(max_length=120)
    firm = models.CharField(max_length=160)
    cik = models.PositiveIntegerField(unique=True)
    slug = models.SlugField(max_length=80, unique=True)
    blurb = models.TextField(blank=True, default='')
    curated = models.BooleanField(default=False)
    added_at = models.DateTimeField(auto_now_add=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_filing_at = models.DateField(null=True, blank=True)
    quarters_expected = models.PositiveSmallIntegerField(null=True, blank=True)
    styles = models.JSONField(default=list, blank=True)
    followed = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.firm})'


class Filing(models.Model):
    ORIGINAL = ''
    RESTATEMENT = 'RESTATEMENT'
    NEW_HOLDINGS = 'NEW HOLDINGS'
    FORM_CHOICES = [('13F-HR', '13F-HR'), ('13F-HR/A', '13F-HR/A')]
    AMENDMENT_CHOICES = [
        (ORIGINAL, 'Original'), (RESTATEMENT, 'Restatement'), (NEW_HOLDINGS, 'New holdings'),
    ]

    investor = models.ForeignKey(Investor, related_name='filings', on_delete=models.CASCADE)
    quarter_end = models.DateField()
    filed_on = models.DateField()
    accession = models.CharField(max_length=20, unique=True)
    form = models.CharField(max_length=10, choices=FORM_CHOICES)
    amendment_type = models.CharField(
        max_length=12, choices=AMENDMENT_CHOICES, blank=True, default=ORIGINAL,
    )
    total_value = models.BigIntegerField()
    positions = models.PositiveIntegerField()

    class Meta:
        ordering = ['-quarter_end', 'filed_on', 'accession']
        constraints = [
            models.UniqueConstraint(
                fields=['investor', 'quarter_end', 'accession'], name='filing_investor_quarter_accession',
            ),
        ]
        indexes = [models.Index(fields=['investor', '-quarter_end'], name='filing_investor_quarter_idx')]

    def __str__(self):
        return f'{self.investor.slug} {self.quarter_end} {self.accession}'


class Holding(models.Model):
    AMOUNT_TYPE_CHOICES = [('SH', 'Shares'), ('PRN', 'Principal')]
    PUT_CALL_CHOICES = [('', 'None'), ('PUT', 'Put'), ('CALL', 'Call')]

    filing = models.ForeignKey(Filing, related_name='holdings', on_delete=models.CASCADE)
    cusip = models.CharField(max_length=9)
    issuer = models.CharField(max_length=200)
    title_of_class = models.CharField(max_length=150, blank=True, default='')
    shares = models.BigIntegerField()
    amount_type = models.CharField(max_length=3, choices=AMOUNT_TYPE_CHOICES, default='SH')
    value = models.BigIntegerField()
    put_call = models.CharField(max_length=4, choices=PUT_CALL_CHOICES, blank=True, default='')
    discretion = models.CharField(max_length=10, blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['filing', 'cusip', 'put_call'], name='holding_filing_cusip_side'),
        ]
        indexes = [models.Index(fields=['cusip'], name='holding_cusip_idx')]


class Security(models.Model):
    MAX_ATTEMPTS = 3

    cusip = models.CharField(max_length=9, primary_key=True)
    ticker = models.CharField(max_length=16, null=True, blank=True)
    name = models.CharField(max_length=200, blank=True, default='')
    figi = models.CharField(max_length=12, blank=True, default='')
    security_type = models.CharField(max_length=60, blank=True, default='')
    resolved_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    def __str__(self):
        return f'{self.cusip} {self.ticker or "?"}'


class PositionMove(models.Model):
    investor = models.ForeignKey(Investor, related_name='moves', on_delete=models.CASCADE)
    quarter_end = models.DateField()
    cusip = models.CharField(max_length=9)
    put_call = models.CharField(max_length=4, blank=True, default='')
    issuer = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, null=True, blank=True)
    shares = models.BigIntegerField()
    previous_shares = models.BigIntegerField(null=True, blank=True)
    value = models.BigIntegerField()
    previous_value = models.BigIntegerField(null=True, blank=True)
    weight_pct = models.FloatField()
    previous_weight_pct = models.FloatField(null=True, blank=True)
    change_pct = models.FloatField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['investor', 'quarter_end', 'cusip', 'put_call'], name='move_investor_quarter_holding',
            ),
        ]
        indexes = [
            models.Index(fields=['quarter_end', 'kind'], name='move_quarter_kind_idx'),
            models.Index(fields=['cusip'], name='move_cusip_idx'),
        ]

    def __str__(self):
        return f'{self.investor.slug} {self.quarter_end} {self.cusip} {self.kind}'
