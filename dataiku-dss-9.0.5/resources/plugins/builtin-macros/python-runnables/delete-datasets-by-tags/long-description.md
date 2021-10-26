This macro allows you to mass-delete datasets based on their tags.

You can specify both included tags (delete datasets containing these tags) and excluded tags (do not delete datasets containing these tags). If a dataset matches the exclusion rule, it is not deleted, even it it matches the inclusion rule.

Both the inclusion and the exclusion rule can be specified as a "AND" or "OR" match of multiple tags. Note that at least one included tag is mandatory: you cannot delete "all datasets but excluded ones".

**Warning**: Deleting datasets may cause attached recipes and analyses to be deleted. You will not get any warning.