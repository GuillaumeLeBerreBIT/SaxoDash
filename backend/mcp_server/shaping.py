PRESENTATION_KEYS = frozenset({'color', 'logo', 'logo_url', 'photo', 'website', 'sparkline'})


def without(obj, keys=PRESENTATION_KEYS):
    if isinstance(obj, dict):
        return {k: without(v, keys) for k, v in obj.items() if k not in keys}
    if isinstance(obj, (list, tuple)):
        return [without(v, keys) for v in obj]
    return obj


def capped(items, limit):
    return {'items': items[:limit], 'truncated': max(0, len(items) - limit)}
