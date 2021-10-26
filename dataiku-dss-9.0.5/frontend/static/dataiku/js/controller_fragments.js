 /* Various controller fragments */
 function addDatasetUniquenessCheck($scope, DataikuAPI, projectKey) {
    DataikuAPI.datasets.listNames(projectKey).success(function(data) {
        $scope.datasets_names = data;
    });
    DataikuAPI.streamingEndpoints.listNames(projectKey).success(function(data) {
        $scope.streamingEndpoints_names = data;
    });

    let unicityCheck = function(value) {
        if ($scope.datasets_names) {
            for(var k in $scope.datasets_names) {
                var ds = $scope.datasets_names[k];
                if((ds||'').toLowerCase()===(value||'').toLowerCase()) {
                    return false;
                }
            }
        }
        if ($scope.streamingEndpoints_names) {
            for(var k in $scope.streamingEndpoints_names) {
                var ds = $scope.streamingEndpoints_names[k];
                if((ds||'').toLowerCase()===(value||'').toLowerCase()) {
                    return false;
                }
            }
        }
        return true;
    };
    $scope.isDatasetNameUnique = unicityCheck;
    $scope.isStreamingEndpointNameUnique = unicityCheck;
}

/* Mapping Code Mirror Editor Option Mode to language name */
function computeCodeMirrorMode(snippetType) {
	switch(snippetType) {
	    case 'jl':
	    case 'julia':
            return 'text/x-julia';
        case 'py':
	    case 'python':
            return 'text/x-python';
	    case 'pig':
	        return 'text/x-dkupig';
	    case 'R':
	        return 'text/x-rsrc';
	    case 'scala':
	    	return 'text/x-scala';
	    case 'shell':
	    	return 'text/x-sh';
	    case 'hive':
	    case 'impala':
	        return 'text/x-hivesql';
	    case 'sql':
	        return 'text/x-sql2';
	    case 'html':
	        return 'application/xml';
	    case 'css':
	        return 'text/css';
	    case 'javascript':
        case 'js':
	        return 'text/javascript';
	    default:
            return 'text/plain'
	}
}

function getDefaultConnection(list, cur, wantSQL, wantHDFS) {
    if (cur) return cur;
    if (list != null && list.length > 0) {
        if (wantSQL) {
            for (var i in list) {
                if (list[i].sql) return list[i].connection;
            }
        } else if (wantHDFS) {
            for (var i in list) {
                if (list[i].type == "HDFS") return list[i].connection;
            }
        } else {
            for (var i in list) {
                if (list[i].connection == "filesystem_managed") {
                    return list[i].connection;
                }
            }
        }
        return list[0].connection;
    } else {
        return null;
    }
}

function fetchManagedDatasetConnections($scope, DataikuAPI) {
    DataikuAPI.datasets.listManagedDatasetConnections().success(function(data) {
        $scope.managedDatasetConnections = [];
        for (var i in data) {
            var c = data[i];
            $scope.managedDatasetConnections.push({"connection" : c.name, "type" : c.type, "sql" : c.sql, "label" : c.name + " (" + c.type + ")"});
        }
    }).error(setErrorInScope.bind($scope));
}


function filterSortLimitTagsAndQ($filter, list, query, sortOptions, max, customFilter) {
    if (list == null) {
        return {formatted : [], filtered : []};
    }
    var filtered = list;
    // Filter on tags
    if (query.tags){
    angular.forEach(query.tags, function(tag){
        filtered = $.grep(filtered, function(item){
            return item.tags && item.tags.indexOf(tag) >= 0;
        })
    })
    }
    // Filter on terms
    filtered = angular.element(document.body).injector().get('ListFilter').filter(filtered, query.q);
    // Custom filters
    if (typeof(customFilter) === "function") {
    	filtered = customFilter(filtered);
    }
    // sort
    var formatted = $filter('orderBy')(filtered, sortOptions.column, sortOptions.reverse);
    // limit
    formatted = formatted.slice(0, max);
    return {formatted : formatted, filtered : filtered};
}

