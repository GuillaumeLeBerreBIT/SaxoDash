from urllib.parse import quote

COMMONS = 'https://commons.wikimedia.org/wiki/'
THUMBNAIL_WIDTH = 160


def photo_url(investor):
    if not investor.photo:
        return None
    return f'{COMMONS}Special:FilePath/{quote(investor.photo)}?width={THUMBNAIL_WIDTH}'


def photo_credit_url(investor):
    if not investor.photo:
        return None
    return f"{COMMONS}File:{quote(investor.photo.replace(' ', '_'))}"
