SELECT
	query,
	count_distinct_map(country, userid) as nusers_per_country
FROM queries
GROUP BY query;
