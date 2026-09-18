"""Detects recurring-merchant patterns across all synced BankTransactions and
upserts Subscription rows. See docs/superpowers/specs/
2026-09-18-bank-transactions-spending-design.md for the detection rules."""
from collections import defaultdict
from decimal import Decimal

from .models import BankTransaction, Subscription

AMOUNT_TOLERANCE = Decimal('0.10')

# (min_days, max_days) average gap between charges for each cadence.
CADENCE_WINDOWS = {
    'weekly': (5, 9),
    'monthly': (23, 36),
    'yearly': (351, 379),
}


def _normalize_merchant(name):
    return (name or '').strip().upper()


def _cadence_for(gaps_days):
    avg_gap = sum(gaps_days) / len(gaps_days)
    for cadence, (low, high) in CADENCE_WINDOWS.items():
        if low <= avg_gap <= high:
            return cadence
    return None


def detect_subscriptions():
    groups = defaultdict(list)
    qs = (
        BankTransaction.objects
        .exclude(category__in=['TRANSFER', 'SAVINGS'])
        .filter(amount__lt=0)
        .order_by('booking_date')
    )
    for tx in qs:
        groups[_normalize_merchant(tx.counterparty_name)].append(tx)

    detected = 0
    for merchant_key, txs in groups.items():
        if not merchant_key or len(txs) < 2:
            continue

        dates = [tx.booking_date for tx in txs]
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        cadence = _cadence_for(gaps)
        if cadence is None:
            continue

        amounts = [abs(tx.amount) for tx in txs]
        avg_amount = sum(amounts) / len(amounts)
        if any(abs(a - avg_amount) > avg_amount * AMOUNT_TOLERANCE for a in amounts):
            continue

        Subscription.objects.update_or_create(
            merchant_key=merchant_key,
            defaults={
                'display_name': txs[-1].counterparty_name,
                'category': txs[-1].category,
                'expected_amount': avg_amount,
                'cadence': cadence,
                'last_charged': dates[-1],
            },
        )
        detected += 1

    return detected
