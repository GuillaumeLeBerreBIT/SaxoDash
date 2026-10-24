from investors.models import PriceHistory
from research.models import ScreenerRow
from saxo.credentials import connection_state, latest_run_per_task

from . import tool


def _iso(moment):
    return moment.isoformat() if moment else None


def _latest(model, field):
    row = model.objects.exclude(**{f'{field}__isnull': True}).order_by(f'-{field}').first()
    return getattr(row, field) if row else None


@tool(
    'Saxo connection state, each sync task\'s latest outcome, the last Discover scan and the last price refresh.',
    sources=['saxo', 'discover', 'prices'],
    saxo=True,
)
def get_data_health():
    state = connection_state()
    tasks = {
        run.task: {'outcome': run.outcome, 'finished_at': _iso(run.ran_at)}
        for run in latest_run_per_task()
    }
    data = {
        'saxo_connected': state.connected,
        'saxo_usable': state.usable,
        'unusable_reason': state.reason,
        'tasks': tasks,
        'discover_scanned_at': _iso(_latest(ScreenerRow, 'technicals_at')),
        'prices_refreshed_at': _iso(_latest(PriceHistory, 'checked_at')),
    }
    return data
