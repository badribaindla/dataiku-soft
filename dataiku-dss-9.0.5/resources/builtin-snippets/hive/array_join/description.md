Joins an array of arrays into a single array containing all elements.

    array<TYPE> array_join(array<array<TYPE> >)

This is often used in combination with collect_to_array.
For example, if you have:

    table A {
        int product_id;
        int day;
        array<string> buying_customers;
    }

collect_to_array(buying_customers) will therefore produce array<array<string>>

To get the full list of customers for one product, you can use:

    SELECT array_join(collect_to_array(buying_customers)) FROM A GROUP BY product_id;