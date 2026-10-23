REGISTRY = []


def tool(description):
    def register(fn):
        fn.description = description
        REGISTRY.append(fn)
        return fn

    return register


from . import system  # noqa: E402,F401
from . import portfolio  # noqa: E402,F401
from . import research  # noqa: E402,F401
from . import market  # noqa: E402,F401
from . import smart_money  # noqa: E402,F401
from . import compare  # noqa: E402,F401
