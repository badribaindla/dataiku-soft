This sample groups a Pig relation by the values of `column_to_group` and creates an output relation containing the values of `column_to_group` together with the sum of `column_to_sum`

This is equivalent to the following SQL construct : `SELECT column_to_group, SUM(column_to_sum)`
` FROM input_relation GROUP BY column_to_group`.

In Pig, grouping and performing the sum are two distinct operations.