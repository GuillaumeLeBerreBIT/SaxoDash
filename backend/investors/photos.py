from urllib.parse import quote

COMMONS = 'https://commons.wikimedia.org/wiki/'
THUMBNAIL_WIDTH = 160
LOGO_SIZE = 128


def photo_url(investor):
    if not investor.photo:
        return None
    return f'{COMMONS}Special:FilePath/{quote(investor.photo)}?width={THUMBNAIL_WIDTH}'


def logo_url(investor):
    if not investor.website:
        return None
    return f'https://www.google.com/s2/favicons?domain={quote(investor.website)}&sz={LOGO_SIZE}'


def photo_credit_url(investor):
    if not investor.photo:
        return None
    return f"{COMMONS}File:{quote(investor.photo.replace(' ', '_'))}"
