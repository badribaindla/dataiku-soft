Spread a key-value pair across multiple columns.

This operation is similar to the "unfold" visual recipe. It takes a thin, long data.frame and generates a wide, short data.frame.

Spread uses two columns, which represent keys and values. The key column contains the names of columns in the output data.frame. The value column contains the values that are going to populate the output data.frame. 

All columns that are not specified are used as the index. If you do not want to use a column as an index, remove it from the data.frame prior to spreading.

Spread is the opposite of gather.