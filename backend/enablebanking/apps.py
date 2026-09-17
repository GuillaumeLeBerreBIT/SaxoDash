from django.apps import AppConfig


class EnablebankingConfig(AppConfig):
    name = 'enablebanking'

    def ready(self):
        from . import checks  # noqa: F401  (registers the system check, Task 7)
