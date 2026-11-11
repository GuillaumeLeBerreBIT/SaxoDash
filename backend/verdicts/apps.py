from django.apps import AppConfig


class VerdictsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'verdicts'

    def ready(self):
        from investors import price_feed

        from . import track_record

        price_feed.add_ticker_source(track_record.wanted_tickers)
