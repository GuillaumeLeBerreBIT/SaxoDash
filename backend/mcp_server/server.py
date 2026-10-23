import functools

from asgiref.sync import sync_to_async
from mcp.server.fastmcp import FastMCP
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from .envelope import answer

from .tools import REGISTRY


def _off_the_event_loop(fn):
    @functools.wraps(fn)
    async def run(*args, **kwargs):
        try:
            return await sync_to_async(fn)(*args, **kwargs)
        except (RedisConnectionError, RedisTimeoutError):
            return answer(None, sources=[], warnings=['Redis is not running — start it (scripts/dev.sh) and ask again.'])

    return run


def build_server():
    server = FastMCP('saxodash')
    for fn in REGISTRY:
        server.add_tool(_off_the_event_loop(fn), description=getattr(fn, 'description', None))
    return server
