While processing a stream of rows, rank will return the number of times it has previously seen the same value of `in`.

__WARNING__: Rank only makes sense on a sorted table.

For example, while processing a table:
   
    table a {
        string data;
    }
    
with values:

    p1
    p1
    p2
    p2
    p2
    p3
    p4

The query:

    select data, rank(data) from a;

would return:

    p1   0
    p1   1
    p2   0
    p2   1
    p2   2
    p3   0
    p4   0
    

Rank is very useful for sequence analysis.