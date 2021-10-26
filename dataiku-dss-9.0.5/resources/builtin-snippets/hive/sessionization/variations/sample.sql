SELECT
    *,
    CONCAT(user_id, 
       CONCAT('_', 
        SUM(new_session) OVER (PARTITION BY user_id ORDER BY mytimestamp)
       )
    ) AS session_id
FROM (
    SELECT
        *,
        CASE
            WHEN UNIX_TIMESTAMP(mytimestamp)
                 - LAG (UNIX_TIMESTAMP(mytimestamp))
                 OVER (PARTITION BY user_id ORDER BY mytimestamp) >= 30 * 60
            THEN 1
            ELSE 0
        END AS new_session 
    FROM my_data_on_hdfs
) t1