from django.apps import AppConfig


class AdvisorConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'advisor'

    def ready(self):
        from investors import price_feed

        from . import journal

        price_feed.add_ticker_source(journal.wanted_tickers)
