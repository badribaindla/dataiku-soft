# coding: utf-8
from __future__ import unicode_literals

import time
from itertools import chain

import numpy as np
from tabulate import tabulate


class Context(object):
    def __init__(self, parent=None, name="", brackets=False):
        self.childs = []
        self.start = None
        self.name = name
        self.parent = parent
        self.end = None
        if parent is None:
            self.fullname = name
        elif brackets:
            self.fullname = "%s[%s]" % (parent.fullname, name)
        elif parent.fullname:
            self.fullname = "%s.%s" % (parent.fullname, name)
        else:
            self.fullname = name

    def __enter__(self):
        assert self.start is None

        self.start = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end = time.time()
        self.totaltime = self.end - self.start
        self.childtime = np.sum([child.totaltime for child in self.childs])
        self.owntime = self.totaltime - self.childtime

    def summary_table(self, quantile=0.1):
        summary = self.summary()
        owntimes = sorted([line[1] for line in summary], reverse=True)
        threshold = owntimes[int(len(owntimes) * quantile)]
        cells = [[name, "%.1fms" % (own * 1000), "%.1fms" % (total * 1000)] for name, own, total in self.summary() if
                 own >= threshold]
        return tabulate(cells, headers=["Computation", "Own", "Total"])

    def summary(self):
        child_summaries = list(chain(*[child.summary() for child in self.childs]))
        wildcard = ".*" if len(child_summaries) > 0 else ""
        return [[self.fullname + wildcard, self.owntime, self.totaltime]] + child_summaries

    def sub(self, name, brackets=False):
        assert self.start is not None
        assert self.end is None

        sub_context = Context(parent=self, name=name, brackets=brackets)
        self.childs.append(sub_context)
        return sub_context
