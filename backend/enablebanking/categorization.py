"""Rule-based categorizer: a hardcoded {category: [keywords]} table, same
pattern as the existing ASPSPS/GRADIENTS hardcoded dicts elsewhere in this
app. Matching is symmetric for credits and debits - a refund from a known
merchant lands in that merchant's normal category, so it nets against prior
outflows there purely through signed SUM aggregation (see services.py),
no separate refund-matching logic needed."""

_RULES = {
    'GROCERIES': ['COLRUYT', 'DELHAIZE', 'CARREFOUR', 'ALDI', 'LIDL', 'OKAY', 'SPAR', 'INTERMARCHE', 'JUMBO'],
    'DINING': ['UBER EATS', 'DELIVEROO', 'TAKEAWAY', "MCDONALD", 'QUICK', 'STARBUCKS', 'RESTAURANT'],
    'TRANSPORT': ['NMBS', 'SNCB', 'DE LIJN', 'STIB', 'MIVB', 'TEC', 'UBER', 'SHELL', 'TOTALENERGIES', 'Q8', 'ESSO'],
    'UTILITIES': ['ENGIE', 'LUMINUS', 'PROXIMUS', 'TELENET', 'ORANGE BELGIUM', 'VOO', 'FLUVIUS'],
    'SUBSCRIPTIONS': ['NETFLIX', 'SPOTIFY', 'DISNEY', 'AMAZON PRIME', 'YOUTUBE PREMIUM', 'ICLOUD', 'APPLE.COM/BILL', 'PLAYSTATION'],
    'SHOPPING': ['AMAZON', 'BOL.COM', 'ZALANDO', 'MEDIAMARKT', 'COOLBLUE', 'IKEA'],
    'HEALTH': ['PHARMACIE', 'APOTHEEK', 'MUTUALITE', 'MUTUALITEIT'],
    'TRAVEL': ['BOOKING.COM', 'AIRBNB', 'RYANAIR', 'BRUSSELS AIRLINES', 'EUROSTAR'],
    'ENTERTAINMENT': ['KINEPOLIS', 'PATHE', 'STUBHUB', 'TICKETMASTER', 'FNAC'],
    # No default employer keywords - extend this list as real income sources
    # show up uncategorized; until then unmatched credits fall to REFUND_CREDIT.
    'INCOME': [],
}


def categorize(counterparty_name, description, amount):
    haystack = f'{counterparty_name or ""} {description or ""}'.upper()

    for category, keywords in _RULES.items():
        if any(keyword in haystack for keyword in keywords):
            return category

    return 'REFUND_CREDIT' if amount > 0 else 'OTHER'
