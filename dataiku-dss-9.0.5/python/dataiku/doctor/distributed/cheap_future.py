# coding: utf-8
import threading

import six
import sys


class CheapFuture(object):
    """
    A super-super-cheap replacement to concurrent.futures (not available in Python < 3)
    (it doesn't aim to be API compatible)
    """

    def __init__(self):
        self._condition = threading.Condition()
        self._result = None
        self._exc_info = None
        self._finished = False

    def _resolve(self, task_fn):
        try:
            result = task_fn()
        except Exception:
            # Error is not swallowed: it will be re-raised when consumer calls result()
            self.set_exception(sys.exc_info())
        else:
            self.set_result(result)

    def is_finished(self):
        with self._condition:
            return self._finished

    def result(self):
        with self._condition:
            while True:
                if self._finished:
                    return self._get_or_raise_result()
                self._condition.wait()

    def set_exception(self, exc_info):
        with self._condition:
            if self._finished:
                raise Exception("Future already resolved")
            self._exc_info = exc_info
            self._finished = True
            self._condition.notify_all()

    def _get_or_raise_result(self):
        if self._exc_info:
            six.reraise(*self._exc_info)
        else:
            return self._result

    def set_result(self, result):
        with self._condition:
            if self._finished:
                raise Exception("Future already resolved")
            self._result = result
            self._finished = True
            self._condition.notify_all()

    @staticmethod
    def from_result(result):
        future = CheapFuture()
        future.set_result(result)
        return future

    @staticmethod
    def from_exception(exception_type, *args, **kwargs):
        def raise_fn():
            raise exception_type(*args, **kwargs)

        future = CheapFuture()
        future._resolve(raise_fn)
        return future

    @staticmethod
    def from_async(task_fn):
        future = CheapFuture()
        threading.Thread(target=lambda: future._resolve(task_fn)).start()
        return future


def reraise_most_important(futures, importance):
    """
    Wait for a list of futures to complete and reraise the most important exception

    More precisely:
    - If no future has failed, do not raise anything
    - If one future has failed, re-raise the exception
    - If multiple futures have failed:
        - Re-raise the most important one according to 'importance' (decreasing order)
        - Re-raise first failure if exception type is not listed in 'importance'
    """

    failed_future = None
    failed_future_importance = None  # Index in 'importance' (lower = more important)

    for future in futures:
        try:
            future.result()
        except Exception as e:
            exc_position = None
            exc_position_mro = None

            for exc_type_idx, exc_type in enumerate(importance):
                try:
                    mro = e.__class__.__mro__.index(exc_type)
                    if exc_position_mro is None or mro < exc_position_mro:
                        exc_position_mro = mro
                        exc_position = exc_type_idx
                except ValueError:
                    pass

            if exc_position is not None:
                if failed_future_importance is None or exc_position < failed_future_importance:
                    failed_future = future
                    failed_future_importance = exc_position

    if failed_future:
        failed_future.result()

    for future in futures:
        # Re-raise first failed future if exception wasn't listed in 'importance'
        future.result()
