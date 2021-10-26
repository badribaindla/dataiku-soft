Aggregating operation on `map<string,int>` than performs the unions of keys of the map, and sum the value when a key exists in multiples maps


    CREATE TABLE docs {
        docid int;
        word_count map<string, int>
    }

    SELECT map_group_sum(word_count) FROM docs; ## Get the global word frequency
