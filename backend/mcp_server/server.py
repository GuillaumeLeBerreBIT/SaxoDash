import functools

from asgiref.sync import sync_to_async
from mcp.server.fastmcp import FastMCP

from .tools import REGISTRY


def _off_the_event_loop(fn):
    @functools.wraps(fn)
    async def run(*args, **kwargs):
        return await sync_to_async(fn)(*args, **kwargs)

    return run


def build_server():
    server = FastMCP('saxodash')
    for fn in REGISTRY:
        server.add_tool(_off_the_event_loop(fn), description=getattr(fn, 'description', None))
    return server
