REGISTRY = []


def tool(description):
    def register(fn):
        fn.description = description
        REGISTRY.append(fn)
        return fn

    return register


from . import system  # noqa: E402,F401
