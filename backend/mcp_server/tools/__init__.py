import functools

from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError

from ..envelope import Reply, Unavailable, answer, json_safe, saxo_warnings
from ..views import app_user

REGISTRY = []
REDIS_DOWN = 'Redis is not running — start it (scripts/dev.sh) and ask again.'


def answering(fn, *, sources, saxo):
    @functools.wraps(fn)
    def run(*args, **kwargs):
        warnings = []
        try:
            if saxo:
                warnings.extend(saxo_warnings(app_user()))
            reply = fn(*args, **kwargs)
        except Unavailable as missing:
            return answer(None, sources=sources, warnings=[*warnings, *missing.warnings])
        except (RedisConnectionError, RedisTimeoutError):
            return answer(None, sources=sources, warnings=[REDIS_DOWN])
        if not isinstance(reply, Reply):
            reply = Reply(reply)
        return answer(json_safe(reply.data), sources=sources, warnings=[*warnings, *reply.warnings], as_of=reply.as_of)

    return run


def tool(description, *, sources, saxo=False):
    def register(fn):
        wrapped = answering(fn, sources=sources, saxo=saxo)
        wrapped.description = description
        REGISTRY.append(wrapped)
        return wrapped

    return register


from . import system  # noqa: E402,F401
from . import portfolio  # noqa: E402,F401
from . import research  # noqa: E402,F401
from . import market  # noqa: E402,F401
from . import smart_money  # noqa: E402,F401
from . import compare  # noqa: E402,F401
from . import journal  # noqa: E402,F401
from . import tax  # noqa: E402,F401
