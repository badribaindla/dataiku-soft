import json

import dataiku.core.intercom as intercom
from dataiku import Dataset

import logging

class Dialects(object):
    ASTER_DATA = 'AsterData'
    BIGQUERY = 'BigQuery'
    DB2 = 'DB2'
    EXASOL = 'Exasol'
    GREENPLUM = 'Greenplum'
    H2 = 'H2'
    HIVE = 'Hive'
    IMPALA = 'Impala'
    MYSQL = 'MySQL'
    NETEZZA = 'Netezza'
    ORACLE = 'Oracle'
    POSTGRES = 'PostgreSQL'
    REDSHIFT = 'Redshift'
    SAPHANA = 'SAPHANA'
    SQLSERVER = 'SQLServer'
    SQLSERVERDWH = 'Synapse' # Kept for legacy purpose
    SYNAPSE = 'Synapse'
    SPARK = 'SparkSQL'
    SYBASEIQ = 'SybaseIQ'
    TERADATA = 'Teradata'
    VERTICA = 'Vertica'
    SNOWFLAKE = 'Snowflake'
    ATHENA = 'Athena'


def toSQL(builder, dataset=None, dialect=None):
    connection = None
    if dialect is None:
        if dataset is None:
            raise Exception("Either a dialect or a connection must be specified")
        connection = _get_dataset_connection(dataset)

    ast = json.dumps(builder._get_ast(), default=lambda o: o._expr, indent=4)
    if ast is None or len(ast) == 0:
        raise Exception("Empty query")

    resp = intercom.jek_or_backend_json_call("sql-generation/expr", data = {
        "ast": ast,
        "dialect": dialect,
        "connection": connection
    })

    return resp.get('sql')

def _get_dataset_connection(dataset):
    if not isinstance(dataset, Dataset):
        raise TypeError("Expected a dataiku Dataset, got: "+str(type(dataset)))
    return dataset.get_config()['params']['connection']
