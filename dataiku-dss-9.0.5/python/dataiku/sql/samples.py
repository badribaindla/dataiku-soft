# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Sample code for SQL generation python API
# It does not replace proper documentation, tutos and samples but for now it will do the trick

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
import dataiku.sql as sql
import json
from dataiku.sql import JoinTypes, Expression, Column, Constant, InlineSQL, SelectQuery, Table, Dialects, toSQL

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Expression: 1 * 2 * 3
eb = Constant(1).times(Constant(2), Constant(3))

toSQL(eb, dialect=Dialects.MYSQL)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Simple select
sb = SelectQuery()
sb.select_from(Table('myTable'))

toSQL(sb, dialect=Dialects.MYSQL)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Simple select with schema
sb = SelectQuery()
sb.select_from(Table('myTable', schema="mySchema"))

toSQL(sb, dialect=Dialects.MYSQL)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Simple select with schema and catalog
sb = SelectQuery()
sb.select_from(Table('myTable', catalog="myCatalog", schema="mySchema"))

toSQL(sb, dialect=Dialects.SNOWFLAKE)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# join in fluent style
sb = SelectQuery() \
    .select(Constant('Hello')) \
    .select_from('t1') \
    .join('t2', JoinTypes.INNER, Column('c', 't1').eq(Column('c', 't2')))

toSQL(sb, dialect=Dialects.MYSQL)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Group by and limit
sb = SelectQuery()
sb.select_from('myTable')
sb.group_by(Column('groupCol'))
sb.limit(1000)

toSQL(sb, dialect=Dialects.MYSQL)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Where clause and select distinct
sb = SelectQuery()
sb.distinct()
sb.select_from('myTable')
sb.where(Column('wherecol').le(Constant(33)))

toSQL(sb, dialect=Dialects.MYSQL)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Having clause
sb = SelectQuery()
sb.select_from('myTable')
sb.having(Column('havingcol').ge(Constant(33)))

toSQL(sb, dialect=Dialects.MYSQL)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# CTE
sb = SelectQuery()
sb.select(Constant(33))
sb.with_cte(sql.SelectQuery().select_from('cte_table').alias('myCTE'))
sb.select_from('myTable')

toSQL(sb, dialect=Dialects.GREENPLUM)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Order
sb = SelectQuery()
sb.select_from('myTable')
sb.order_by(Column('orderCol'))

toSQL(sb, dialect=Dialects.MYSQL)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Subquery
q1 = SelectQuery()
q1.select_from('table')
q1.alias('innerQuery')

q2 = SelectQuery()
q2.select_from(q1)

toSQL(q2, dialect=Dialects.MYSQL)

# -------------------------------------------------------------------------------- NOTEBOOK-CELL: CODE
# Recipe outputs
out = dataiku.Dataset("out")
out.write_with_schema(pandas_dataframe)