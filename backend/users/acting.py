import contextlib
import contextvars

_acting_user = contextvars.ContextVar('acting_user', default=None)


def current_user():
    return _acting_user.get()


def set_acting_user(user):
    return _acting_user.set(user)


def clear_acting_user():
    _acting_user.set(None)


@contextlib.contextmanager
def acting_as(user):
    token = _acting_user.set(user)
    try:
        yield
    finally:
        _acting_user.reset(token)


class ActingUserMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        finally:
            clear_acting_user()
