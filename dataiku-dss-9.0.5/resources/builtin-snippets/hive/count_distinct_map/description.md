For a group, generate a map with key from a secondary column counting the distinct values from keys from a third one. 


    select query, count_distinct_map(country, userid) as nusers_per_country FROM queries GROUP BY query; 

    query     country    userid
    FOO    FR    X
    FOO    FR    X
    FOO    FR    Y
    FOO    EN    Z 

    =>  FOO,  {"FR":2, EN:1}