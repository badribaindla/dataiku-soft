import threading


class RequestContextFactory(object):
    """
    Mono-request/Mono-thread cache mechanism, that will allows us to access the request anywhere in the code/
    """

    _state = threading.local()
    _state.data = {}

    def __init__(self, **data):
        self._data = data

    def __enter__(self):
        self._prev_data = self.__class__.data()
        self.__class__._state.data = self._data

    def __exit__(self, *exc):
        self.__class__._state.data = self._prev_data
        del self._prev_data
        return False

    @classmethod
    def data(cls):
        if not hasattr(cls._state, 'data'):
            return {}
        return cls._state.data
