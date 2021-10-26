def get_partition_id_as_pairs(partitioning, partition_id):
    """
    Converts a partition identifier to a list of pairs of dimension name to value        
    """
    if partitioning is not None and len(partitioning['dimensions']) == 0 and partition_id == 'NP':
        return []
    dimension_names = [dimension['name'] for dimension in partitioning['dimensions']]
    dimension_values = partition_id.split('|')
    return zip(dimension_names, dimension_values)
    
def get_partition_id_as_map(partitioning, partition_id):
    """
    Converts a partition identifier to a map of dimension name to dimension value        
    """
    partition = {}
    for pair in get_partition_id_as_pairs(partitioning, partition_id):
        partition[pair[0]] = pair[1]
    return partition
    