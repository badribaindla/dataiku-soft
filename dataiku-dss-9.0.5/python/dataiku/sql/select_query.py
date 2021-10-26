import json
from six import string_types

from dataiku import Dataset
from .expression import Expression, Constant

class SelectQuery(object):
    """
    Class used to create and manipulate objects representing SQL select queries
    """

    def __init__(self):
        self._query = {
            "type": "QUERY",
            "with": [], #CTE definitions
            "distinct": False,
            "selectList": [], #list[Expression]
            "from": None, #TableLike
            "join": [],
            "where": [], # list[Expression]
            "having": [], # list[Expression]
            "groupBy": [], # list[Expression]
            "orderBy": [], # list[Expression]
            "limit": None,
            "comment": None, # String
            "alias": None # String
        }

    def __repr__(self):
        return json.dumps(self._query, indent=4)

    def _get_ast(self):
        return json.loads(json.dumps(self._query, default=lambda o: o._expr))

    def with_cte(self, tableLikeObj, alias=None):
        """
        Adds a CTE to the 'WITH' clause
        """
        tableLike = _getTableLikeDict(tableLikeObj, alias)
        self._query['with'].append(tableLike)
        return self

    def distinct(self, distinct=True):
        """
        Toggles DISTINCT select
        """
        self._query['distinct'] = distinct
        return self

    def select(self, expr, alias=None):
        """
        Adds an expression to select (expr can also be a list of expressions)
        """
        if type(expr) == type([]):
            if alias is None:
                for e in expr:
                    self.select(e)
                return self
            else:
                if type(alias) != type([]) or len(alias) != len(expr):
                    raise Exception("When selecting a list, alias parameter, if provided, must be a list of the same size")
                for i, e in enumerate(expr):
                    self.select(e, alias[i])
                return self

        if alias is not None:
            for ref in self._query['selectList']:
                if ref['alias'] == alias:
                    raise Exception("Duplicate alias: "+str(alias))
        if isinstance(expr, Expression):
            ref = {
                'expr': expr._expr,
                'alias': alias
            }
            self._query['selectList'].append(ref)
        else:
            raise Exception("Only Expression objects can be selected: "+str(type(expr)))
        return self

    def select_from(self, from_object, alias=None):
        """
        Set the FROM clause of the query, should be a tableLike (provided as String for table or SelectQuery for subquery)
        """
        tableLike = _getTableLikeDict(from_object, alias)

        self._query['from'] = tableLike
        return self

    def join(self, tableLikeObj, joinType, joinConditions, operatorBetweenConditions='AND', alias=None):
        """
        Adds a table like to Join the query with
        """
        tableLike = _getTableLikeDict(tableLikeObj, alias)
        try:
            if operatorBetweenConditions.upper() not in ['AND', 'OR']:
                raise ValueError("operatorBetweenConditions should be 'AND' or 'OR'")
        except:
            raise ValueError("operatorBetweenConditions should be 'AND' or 'OR'")

        JoinTypes.check(joinType)

        join = {
            "type": joinType,
            "tableLike": tableLike,
            "on": _getExpressionsList(joinConditions),
            "operatorBetweenConditions": operatorBetweenConditions.upper()
        }
        self._query['join'].append(join)
        return self

    def where(self, expr):
        self._query['where'].append(_getExpressionDict(expr))
        return self

    def having(self, expr):
        self._query['having'].append(_getExpressionDict(expr))
        return self

    def group_by(self, expr):
        """
        Adds an expression to group results
        Can be called several times
        """

        self._query['groupBy'].append({'expr': _getExpressionDict(expr)})
        return self

    def order_by(self, expr, direction='ASC'):
        """
        Adds an ordering expression to sort the results
        Can be called several times
        """
        if direction.upper() not in ['ASC', 'DESC']:
            raise ValueError("Order direction should be 'ASC' or 'DESC'")

        self._query['orderBy'].append({'expr': _getExpressionDict(expr), 'orderType': direction.upper()})
        return self

    def limit(self, limit):
        """
        Maximum number of returned rows
        """
        self._query['limit'] = limit
        return self

    def comment(self, comment):
        """
        String comment for the query, does not change the computation
        """
        self._query['comment'] = comment
        return self

    def alias(self, alias):
        """
        Identifier for the query. Required for subqueries.
        """
        self._query['alias'] = alias
        return self

    def get_alias(self):
        return self._query['alias']

    def get_columns_alias(self):
        return [col['alias'] for col in self._query['selectList'] if col['alias'] not in [None, '*']]


class JoinTypes(object):
    INNER = 'INNER'
    LEFT = 'LEFT'
    RIGHT = 'RIGHT'
    FULL = 'FULL'
    CROSS = 'CROSS'
    NATURAL_INNER = 'NATURAL_INNER'
    NATURAL_LEFT = 'NATURAL_LEFT'
    NATURAL_RIGHT = 'NATURAL_RIGHT'
    NATURAL_FULL = 'NATURAL_FULL'

    @staticmethod
    def check(joinType):
        if(joinType != JoinTypes.INNER
            and joinType != JoinTypes.LEFT
            and joinType != JoinTypes.RIGHT
            and joinType != JoinTypes.FULL
            and joinType != JoinTypes.CROSS
            and joinType != JoinTypes.NATURAL_INNER
            and joinType != JoinTypes.NATURAL_LEFT
            and joinType != JoinTypes.NATURAL_RIGHT
            and joinType != JoinTypes.NATURAL_FULL):
            raise ValueError("Invalid joinType: "+str(joinType))


class Table(object):
    def __init__(self, name, alias=None, catalog=None, schema=None):
        self._tableLike = {
            "type": "TABLE",
            "name": name,
            "catalog": catalog,
            "schema": schema,
            "alias": alias
        }

    def __repr__(self):
        return json.dumps(self._tableLike, indent=4)

    def _get_dict(self, alias=None):
        return json.loads(json.dumps(self._tableLike))

def _getExpressionDict(expr):
    if not isinstance(expr, Expression):
        raise Exception("expected an Expression, got " + str(type(expr)))
    return expr._expr

def _getExpressionsList(args):
    ret = []
    if type(args) != type([]):
        args = [args]
    for arg in args:
        if type(arg) == type({}):
            ret.append(arg)
        if isinstance(arg, Expression):
            ret.append(arg._expr)
        # if isinstance(arg, SelectQuery):
        #     ret.append(arg._query)
        else:
            ret.append(Constant(arg))
    return ret


def _getTableLikeDict(obj, alias=None, catalog=None, schema=None):
    """
    returns a copy
    """
    if isinstance(obj, string_types):
        tableLike = Table(obj, alias, catalog, schema)._tableLike
    elif isinstance(obj, Dataset):
        loc = obj.get_location_info()
        if loc.get('locationInfoType') != 'SQL':
            raise ValueError('Can only select from an SQL dataset, use a table name for other types')
        table_name = loc.get('info').get('table')
        catalog_name = loc.get('info').get('catalog')
        schema_name = loc.get('info').get('schema')
        tableLike = Table(table_name, alias, catalog_name, schema_name)._tableLike
    elif isinstance(obj, Table):
        tableLike = obj._get_dict()
    elif isinstance(obj, SelectQuery):
        tableLike = obj._get_ast()
    else:
        raise ValueError("Cannot make tableLike from object "+obj.__class__.__name__)
    if alias is not None:
        tableLike['alias'] = alias
    return tableLike
