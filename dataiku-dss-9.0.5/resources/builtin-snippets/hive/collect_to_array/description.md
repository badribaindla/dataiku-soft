This is an aggregation function that gathers all input values and outputs them as an array.

For example

    table page_views {
        int visitor_id;
        string page;
    }

The query:

    select collect_to_array(page) from page_views group by visitor_id;

produces: `array<string>`, the list of pages viewed for each visitor_id
