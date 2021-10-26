-- This assumes that you have a relation called `input_relation`
-- containing columns `column_to_group` and `column_to_sum

input_relation_grouped = GROUP input_relation BY column_to_group;

-- The 'input_relation_grouped' contains two columns :
--    * a column named 'group' containing the values of 'column_to_group'
--    * a column named 'input_relation' containing the records of
--      input_relation for each value of column_to_group

output_relation = FOREACH input_relation_grouped GENERATE
     					group AS column_to_group,
     					SUM(input_relation.column_to_sum) AS the_sum;