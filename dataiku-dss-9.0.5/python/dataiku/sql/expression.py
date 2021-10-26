import json


class Expression(object):
    """
    Base class for any expression (including constants, columns, and operation on them)
    it holds _expr which is a nested dict
    Note that although you can combine the expressions, the _expr is a hierachy of simple dict, not Expression objects
    """
    def __init__(self, expr=None):
        self._expr = expr

    def __repr__(self):
        return json.dumps(self._expr, indent=4)

    def _get_ast(self):
        return self._expr

    def eq(self, arg):
        """ Equal """
        return self._op(Operator.EQ, arg)
    def eq_null_unsafe(self, arg):
        """ Equal (EQ is implemented so that NULL == NULL, but there are issues, in particular for perf) """
        return self._op(Operator.NULL_UNSAFE_EQ, arg)
    def ne(self, arg):
        """ Not equal """
        return self._op(Operator.NE, arg)
    def gt(self, arg):
        """ Greater (strictly) """
        return self._op(Operator.GT, arg)
    def lt(self, arg):
        """ Lower (strictly) """
        return self._op(Operator.LT, arg)
    def ge(self, arg):
        """ Greater or equal """
        return self._op(Operator.GE, arg)
    def le(self, arg):
        """ Lower or equal """
        return self._op(Operator.LE, arg)
    def like(self, arg):
        return self._op(Operator.LIKE, arg)
    def and_(self, *args):
        return self._op(Operator.AND, *args)
    def or_(self, *args):
        return self._op(Operator.OR, *args)
    def not_(self):
        return self._op(Operator.NOT)
    def is_null(self):
        return self._op(Operator.ISNULL)
    def is_not_null(self):
        return self._op(Operator.ISNOTNULL)

    def abs(self):
        return self._op(Operator.ABS)
    def floor(self):
        return self._op(Operator.FLOOR)
    def ceil(self):
        return self._op(Operator.CEIL)
    def round(self):
        return self._op(Operator.ROUND)
    def sqrt(self):
        return self._op(Operator.SQRT)
    def exp(self):
        return self._op(Operator.EXP)
    def ln(self):
        return self._op(Operator.LN)
    def log(self):
        return self._op(Operator.LOG)
    def ln(self):
        return self._op(Operator.LN)

    def plus(self, *args):
        return self._op(Operator.PLUS, *args)
    def minus(self, *args):
        return self._op(Operator.MINUS, *args)
    def times(self, *args):
        return self._op(Operator.TIMES, *args)
    def div(self, arg):
        """ Division (handles division by zero by replacing with NULL) """
        return self._op(Operator.DIV, arg)
    def mod(self, arg):
        return self._op(Operator.MOD, arg)
    def pow(self, p):
        return self._op(Operator.POW, p)

    def length(self):
        return self._op(Operator.LENGTH)
    def upper(self):
        return self._op(Operator.UPPER)
    def lower(self):
        return self._op(Operator.LOWER)
    def trim(self):
        return self._op(Operator.TRIM)
    def concat(self, *args):
        return self._op(Operator.CONCAT, *args)
    def contains(self, arg):
        return self._op(Operator.CONTAINS, arg)
    def startsWith(self, arg):
        return self._op(Operator.STARTS_WITH, arg)

    def coalesce(self, replacement):
        return self._op(Operator.COALESCE, replacement)
    def replace(self, replaced, replacement):
        return self._op(Operator.REPLACE, replaced, replacement)

    def sign(self):
        return self._op(Operator.SIGN)
    def hash(self):
        return self._op(Operator.HASH)
    def is_true(self):
        return self._op(Operator.ISTRUE)
    def greatest(self, *args):
        return self._op(Operator.GREATEST, *args)
    def least(self, *args):
        return self._op(Operator.LEAST, *args)

    def avg(self):
        return self._op(Operator.AVG)
    def median(self):
        return self._op(Operator.MEDIAN)
    def min(self):
        return self._op(Operator.MIN)
    def max(self):
        return self._op(Operator.MAX)
    def sum(self):
        return self._op(Operator.SUM)

    def std_dev_samp(self):
        return self._op(Operator.STDDEV_SAMP)
    # def std_dev_pop(self):
    #     return self._op(Operator.STDDEV_POP)

    def count(self):
        return self._op(Operator.COUNT)
    def distinct(self):
        return self._op(Operator.DISTINCT)
    def count_distinct(self):
        return self.distinct().count()

    def first_value(self):
        return self._op(Operator.FIRST_VALUE)
    def last_value(self):
        return self._op(Operator.LAST_VALUE)
    def rowNumber(self):
        return self._op(Operator.ROW_NUMBER)
    def rank(self):
        return self._op(Operator.RANK)
    def dense_rank(self):
        return self._op(Operator.DENSE_RANK)
    def lag(self, n):
        return self._op(Operator.LAG, n)
    def lead(self, n):
        return self._op(Operator.LEAD, n)
    def cume_dist(self):
        return self._op(Operator.CUME_DIST)
    def ntile(self, n_buckets):
        return self._op(Operator.NTILE, n_buckets)
    def lag_diff(self, n, window):
        return self.minus(self.lag(n).over(window))

    def date_part(self, unit):
        return self._op(Operator.DATEPART, unit)
    def extract(self, unit):
        return self._op(Operator.EXTRACT_FROM_INTERVAL, unit)
    def date_trunc(self, unit):
        return self._op(Operator.DATETRUNC, unit)
    def date_diff(self, unit):
        return self._op(Operator.DATEDIFF, unit)

    def cast(self, target_type):
        return self._op(Operator.CAST, target_type)

    def in_(self, haystack):
        return self._op(Operator.IN, haystack)

    def over(self, window):
        # if self.window is not None:
        #     logger.warning("Set window twice for query expression")
        if self._expr['type'] != "OPERATOR":
            raise TypeError("SQL generation: over() can only be called on an operator, got type: "+str(self._expr['type']))
        new_expr = {
            "type": "OPERATOR",
            "op": self._expr['op'],
            "args": self._expr['args'],
            "window": window
        }
        return Expression(new_expr)

    def _op(self, op, *args):
        expressions = _make_expressions_list(args)
        if self._expr is not None:
            expressions.insert(0, self._expr) # use current expression as first argument
        new_expr = {
            "type": "OPERATOR",
            "op": op,
            "args": expressions
        }
        return Expression(new_expr)


class Column(Expression):
    def __init__(self, col_name, table_name=None, schema=None):
        column = {
            "type": "COLUMN",
            "name": col_name,
        }
        if table_name is not None:
            column["table"] = {
                "type": "TABLE",
                "name": table_name,
                "schema": schema
            }
        Expression.__init__(self, column)

    def __repr__(self):
        return Expression.__repr__(self)


class Constant(Expression):
    def __init__(self, value):
        expr = {
            "type": "CONSTANT",
            "value": value
        }
        Expression.__init__(self, expr)

    def __repr__(self):
        return Expression.__repr__(self)


class List(Expression):
    def __init__(self, *args):
        expr = {
            "type": "LIST",
            "items": _make_expressions_list(args)
        }
        Expression.__init__(self, expr)

    def __repr__(self):
        return Expression.__repr__(self)


class InlineSQL(Expression):
    def __init__(self, sql):
        expr = {
            "type": "INLINE_EXPRESSION",
            "expr": sql
        }
        Expression.__init__(self, expr)

    def __repr__(self):
        return Expression.__repr__(self)


class Interval(Expression): # TODO backend does not have Interval type yet, writing postgres style
    def __init__(self, value, unit):
        expr = {
            "type": "INLINE_EXPRESSION",
            "expr": "INTERVAL '"+str(value)+" "+unit+"'"
        }
        Expression.__init__(self, expr)

    def __repr__(self):
        return Expression.__repr__(self)

class WindowBound:
    UNBOUNDED = None
    CURRENT = 0


class WindowFrameDirection:
    PRECEDING = 'PRECEDING'
    FOLLOWING = 'FOLLOWING'


#TODO make immutable
class Window(object):
    def __init__(self,
                partition_by=[],
                order_by=[],
                order_types=[],
                mode='ROWS',
                start=WindowBound.UNBOUNDED,
                start_direction=WindowFrameDirection.PRECEDING,
                end=WindowBound.UNBOUNDED,
                end_direction=WindowFrameDirection.FOLLOWING,
                date_diff_unit=None
            ):
        self._expr = {
            "type": "WINDOW"
        }
        self._expr['partitionExpressions'] = partition_by
        if order_by is not None:
            if order_types is None:
                order_types = []
            if len(order_by) != len(order_types):
                if len(order_types) != 0:
                    raise ValueError("SQL Generation: order_by and order_types arrays should have the same size for windows")
                else:
                    order_types = ['ASC' for _ in order_by]
            self._expr['orderExpressions'] = order_by
            self._expr['orderTypes'] = order_types
        self.frame(mode, start, start_direction, end, end_direction, date_diff_unit)

    def order_by(self, order_by, order_type='ASC'):
        if order_by is None:
            order_by = []
            order_type = []
        self._expr['orderExpressions'].append(order_by) #TODO make immutable?
        self._expr['orderTypes'].append(order_type)

    def frame(self, mode='ROWS', start=None, start_direction=None, end=None, end_direction=None, date_diff_unit=None):
        """
            Frame settings (window limits)
        """
        self._expr['frameMode'] = mode
        self._expr['frameStart'] = start
        self._expr['frameStartDirection'] = start_direction
        self._expr['frameEnd'] = end
        self._expr['frameEndDirection'] = end_direction
        self._expr['dateDiffUnit'] = date_diff_unit

    RANGE = 'RANGE'
    ROWS = 'ROWS'


class Operator(object):
    EQ = 'EQ'
    NULL_UNSAFE_EQ = 'NULL_UNSAFE_EQ' # EQ is implemented so that NULL == NULL, but there are issues, in particular for perf
    NE = 'NE'
    GT = 'GT'
    LT = 'LT'
    GE = 'GE'
    LE = 'LE'
    LIKE = 'LIKE'
    AND = 'AND'
    OR = 'OR'
    NOT = 'NOT'
    ISNULL = 'ISNULL'
    ISNOTNULL = 'ISNOTNULL'

    ABS = 'ABS'
    FLOOR = 'FLOOR'
    CEIL = 'CEIL'
    ROUND = 'ROUND'
    SQRT = 'SQRT'
    EXP = 'EXP'
    LN = 'LN'
    LOG = 'LOG'

    PLUS = 'PLUS'
    MINUS = 'MINUS'
    TIMES = 'TIMES'
    DIV = 'DIV'
    MOD = 'MOD'
    POW = 'POW'

    LENGTH = 'LENGTH'
    UPPER = 'UPPER'
    LOWER = 'LOWER'
    TRIM = 'TRIM'
    CONCAT = 'CONCAT'
    CONTAINS = 'CONTAINS'
    STARTS_WITH = 'STARTS_WITH'

    COALESCE = 'COALESCE'
    REPLACE = 'REPLACE'

    SIGN = 'SIGN'
    HASH = 'HASH'
    ISTRUE = 'ISTRUE'
    GREATEST = 'GREATEST'
    LEAST = 'LEAST'

    AVG = 'AVG'
    MEDIAN = 'MEDIAN'
    MIN = 'MIN'
    MAX = 'MAX'
    SUM = 'SUM'
    STDDEV_SAMP = 'STDDEV_SAMP'
    STDDEV_POP = 'STDDEV_POP'

    COUNT = 'COUNT'
    DISTINCT = 'DISTINCT'

    FIRST_VALUE = 'FIRST_VALUE'
    LAST_VALUE = 'LAST_VALUE'
    ROW_NUMBER = 'ROW_NUMBER'
    RANK = 'RANK'
    DENSE_RANK = 'DENSE_RANK'
    LAG = 'LAG'
    LEAD = 'LEAD'
    CUME_DIST = 'CUME_DIST'
    NTILE = 'NTILE'

    CAST = 'CAST'

    DATEPART = 'DATEPART'
    EXTRACT_FROM_INTERVAL = 'EXTRACT_FROM_INTERVAL'
    DATEDIFF = 'DATEDIFF'
    DATETRUNC = 'DATETRUNC'

    IN = 'IN'


class DatePart:
    SECOND_FROM_EPOCH = 'SECOND_FROM_EPOCH'
    HOUR_OF_DAY = 'HOUR_OF_DAY'
    DAY_OF_WEEK = 'DAY_OF_WEEK'
    DAY_OF_MONTH = 'DAY_OF_MONTH'
    WEEK_OF_YEAR = 'WEEK_OF_YEAR'
    MONTH_OF_YEAR = 'MONTH_OF_YEAR'
    YEAR = 'YEAR'


class TimeUnit:
    SECOND = 'SECOND'
    MINUTE = 'MINUTE'
    HOUR = 'HOUR'
    DAY = 'DAY'
    WEEK = 'WEEK'
    MONTH = 'MONTH'
    QUARTER = 'QUARTER'
    YEAR = 'YEAR'

class ColumnType: #Keep in sync with com.dataiku.dip.datasets.Type
    SMALLINT = 'SMALLINT'
    INT = 'INT'
    BIGINT = 'BIGINT'
    FLOAT = 'FLOAT'
    DOUBLE = 'DOUBLE'
    STRING = 'STRING'
    BOOLEAN = 'BOOLEAN'
    DATE = 'DATE'
    GEOMETRY = 'GEOMETRY'
    GEOPOINT = 'GEOPOINT'
    MAP = 'MAP'
    ARRAY = 'ARRAY'
    OBJECT = 'OBJECT'


def _make_expressions_list(args):
    ret = []
    for arg in args:
        if type(arg) == type({}):
            ret.append(arg)
        if isinstance(arg, Expression):
            ret.append(arg._expr)
        #TODO SQL test is String or is numerical? What about dates? (cannot be boolean)
        else:
            ret.append(Constant(arg))
    return ret
