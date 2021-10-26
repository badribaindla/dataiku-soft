This is an aggregation function.

    TYPE1 first_of_group(TYPE1 outColumn, TYPE2 sortColumn)

For each group, it sorts the rows of the group by `sortColumn`, and then 
output the value of `outColumn` for the first row, once sorted.

These functions are very useful for processing tables with "updates".

For example:

    table user {
        int id;
        int version;
        string email;
        string location;
    }

To get the first recorded location for a given user, you can use:

    select first_of_group(location, version) FROM user GROUP BY id;

You can use several first_of_group in the same query:

    select first_of_group(location, version), first_of_group(email, version) FROM user GROUP BY id;
