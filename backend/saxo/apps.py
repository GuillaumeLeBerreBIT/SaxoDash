from django.apps import AppConfig


class SaxoConfig(AppConfig):
    name = 'saxo'

    def ready(self):
        from . import checks  # noqa: F401  (registers the system check)
