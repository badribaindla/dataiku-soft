SELECT
  *,
  CONCAT(user_id, '_', SUM(new_session))
       OVER (PARTITION BY user_id ORDER BY mytimestamp) AS session_id
FROM (
  SELECT
    *,
    CASE
       WHEN EXTRACT(EPOCH FROM mytimestamp) 
          - LAG(EXTRACT(EPOCH FROM mytimestamp)) 
            OVER (PARTITION BY user_id ORDER BY mytimestamp) >= 30 * 60 
       THEN 1
       ELSE 0
    END as new_session
    FROM
      table_name_with_data
) t1