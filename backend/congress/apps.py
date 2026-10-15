from django.apps import AppConfig


class CongressConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'congress'

    def ready(self):
        from investors import price_feed

        from . import performance

        price_feed.add_ticker_source(performance.wanted_tickers)
