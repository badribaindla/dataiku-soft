from ..core import schema_handling
from dataiku.core import base
try:
    import Queue
except:
    import queue as Queue


def none_if_throws(f):
    def aux(*args, **kargs):
        try:
            return f(*args, **kargs)
        except:
            return None
    return aux


class SchemaHelper(object):
    """
    Helper to cast data sent to export into the types given in the export's schema
    """
    def __init__(self, schema):
        self.casters = [
            schema_handling.CASTERS.get(col["type"], lambda s:s)
            for col in schema["columns"]
        ]

    def cast_values(self, row):
        """
        Cast the values from an array of strings to the appropriate types
        """
        return [none_if_throws(caster)(val) for (caster, val) in base.dku_zip_longest(self.casters, row)]
