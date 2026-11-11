from verdicts.views import TrackRecordView, VerdictDetailView

from ..envelope import Reply
from ..views import fetch
from . import tool

VERDICTS = 'verdicts'
NOT_COVERED = 'No verdict: not in the nightly scan.'


@tool(
    'Verdict › Stock: the rule-based quality grade, valuation grade and suggested action for one US stock, with the checks behind them '
    'and your own weight in it. Labels are rule output, not advice, and the server never trades.',
    sources=[VERDICTS],
)
def get_verdict(symbol: str):
    data = fetch(VerdictDetailView, kwargs={'ticker': symbol})
    return Reply(data, [] if data.get('verdict') else [NOT_COVERED])


@tool(
    'Verdict › Track record: every logged buy-grade call scored against the S&P 500, with the summary. '
    'Labels are rule output, not advice, and the server never trades.',
    sources=[VERDICTS, 'price history'],
)
def get_verdict_track_record():
    return fetch(TrackRecordView)
