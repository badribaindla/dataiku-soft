#### Join two data.frames

Joins combine two data.frames to produce a third data.frame. By default, all joins in the dplyr package are *natural join*. This means that joins are conducted using columns with identical names in the two data.frames.

Examples of joins in dplyr include

##### inner_join(x, y)
return all rows from x where there are matching values in y, and all columns from x and y. If there are multiple matches between x and y, all combination of the matches are returned.

##### left_join(x, y)
return all rows from x, and all columns from x and y. Rows in x with no match in y will have NA values in the new columns. If there are multiple matches between x and y, all combinations of the matches are returned.

##### right_join(x, y)
return all rows from y, and all columns from x and y. Rows in x with no match in y will have NA values in the new columns. If there are multiple matches between x and y, all combinations of the matches are returned.

##### full_join(x, y)
return all rows from x and y, and all columns from x and y. Rows in x with no match in y will have NA values in the new columns and vice versa for y. If there are multiple matches between x and y, all combinations of the matches are returned.

##### semi_join(x, y)
return all rows from x where there are matching values in y, keeping just columns from x.

A semi join differs from an inner join because an inner join will return one row of x for each matching row of y, where a semi join will never duplicate rows of x.

##### anti_join(x, y)
return all rows from x where there are not matching values in y, keeping just columns from x