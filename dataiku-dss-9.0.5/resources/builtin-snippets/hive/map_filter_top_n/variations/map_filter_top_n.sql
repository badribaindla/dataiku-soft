SELECT  map_filter_top_n({"yes":2, "no":1, "maybe":2, "surely":5}, 3);
-- returns {"surely":5, "maybe":2, "yes":2}
