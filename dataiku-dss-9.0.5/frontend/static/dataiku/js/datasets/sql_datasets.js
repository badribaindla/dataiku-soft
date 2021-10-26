(function() {
'use strict';

var app = angular.module('dataiku.datasets');

app.controller("BaseSQLDatasetController", function($scope, $stateParams, $controller, DataikuAPI, withConsistency) {
    $controller("BaseRowDatasetController", {$scope: $scope, withConsistency: withConsistency});

    $scope.partitionsList = {};

    $scope.isCatalogAware = function() {
        return $scope.dataset.type && ($scope.dataset.type === 'Snowflake' || $scope.dataset.type === 'BigQuery');
    };

    $scope.isSchemaAware = function() {
        return $scope.dataset.type && $scope.dataset.type != 'MySQL' && $scope.dataset.type != 'hiveserver2';
    };

    $scope.hooks = {};

    $scope.setConnections = function(data) {
        $scope.connections = data;
        if (!$scope.dataset.params.connection && data.length) {
            $scope.dataset.params.connection = data[0];
            $scope.test(false, false);
        }
    };

    $scope.hooks.getConnectionNames = function() {
        DataikuAPI.connections.getNames($scope.dataset.type).success(function (data) {
            $scope.setConnections(data);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.$watch('dataset.type', function() {
        $scope.hooks.getConnectionNames();

        if ($scope.dataset && $scope.dataset.type == "Teradata" && $scope.dataset.params && !$scope.dataset.params.assumedTzForUnknownTz) {
            $scope.dataset.params.assumedTzForUnknownTz = "GMT";
            $scope.dataset.params.assumedDbTzForUnknownTz = "GMT";
        }

    });

    $scope.supportsNativePartitioning = function () {
        return $scope.dataset !== null && $scope.dataset.type == 'Vertica';
    };
    $scope.listPartitions = function () {
        $scope.partitionsList.list = null;
        $scope.partitionsList.error = null;
        DataikuAPI.datasets.externalSQL.listPartitions($stateParams.projectKey, $scope.dataset).success(function (data) {
            $scope.partitionsList.list = data;
            if (data.length > 0 && $scope.dataset.params.previewPartition == null) {
                $scope.dataset.params.previewPartition = data[0];
            }
        }).error(function (data, status, error) {
            var err = getErrorDetails(data, status, error);
            $scope.partitionsList.errorMsg = getErrorDetails(data, status, error).detailedMessage;
            $scope.partitionsList.error = getErrorDetails(data, status, error);
        });
    };

    $scope.uiState = { codeSamplesSelectorVisible: false };

    /* Need to manually refresh code mirror on show.
     * as it will compute various dimensions and set them.
     *
     * Here we do refresh on any change of mode and partitioned,
     * to handle the two possible path to make the hidden codemirror
     * box to appear.
     */
    var refreshCodeMirrors = function() {
        $('.CodeMirror').each(function(i, el){
            if (el.CodeMirror != undefined) {
                setTimeout(function() {el.CodeMirror.refresh();}, 0);
            }
        });
    };
    $scope.isPartitioned = function() {
    	return $scope.dataset && $scope.dataset.partitioning && $scope.dataset.partitioning.dimensions && $scope.dataset.partitioning.dimensions.length > 0;
    };
    $scope.$watch("dataset.params.partitioned + dataset.params.mode", function() {
        if ($scope.isPartitioned()) {
        	refreshCodeMirrors();
        }
    });

    $scope.setPartitioned = function(activate) {
		$scope.dataset.partitioning = $scope.dataset.partitioning || {};
    	if (activate) {
    		$scope.dataset.partitioning.dimensions = $scope.dataset.partitioning.dimensions || [];
    		$scope.dataset.partitioning.dimensions.push({name:'', type:'value', params:{}});
    	} else {
    		$scope.dataset.partitioning.dimensions = [];
    	}
    };

    $scope.removeDimension = function(index) {
        $scope.dataset.partitioning.dimensions.splice(index, 1);
    };

    $scope.addDimension = function() {
        $scope.dataset.partitioning.dimensions.push({
            name : 'dim' + $scope.dataset.partitioning.dimensions.length,
            type : 'value',
            params : {}
        });
    };
});


app.controller("ExternalSQLDatasetController", function($scope, $stateParams, $controller, LoggerProvider, DataikuAPI, DatasetUtils, Dialogs, $state) {
    $controller("BaseSQLDatasetController", {$scope: $scope, withConsistency: true});

    var Logger = LoggerProvider.getLogger('datasets.sql');
    $scope.expandedDatasetParams = {}

    $scope.overwriteSchemaFromTable = function () {
        $scope.dataset.schema = {
            'userModified': false,
            'columns': $scope.testResult.querySchema.columns
        };
    };

    $scope.resetTableSelection = function () {
        if ($scope.testResult) {
            $scope.testResult.tablesList = null;
            $scope.dataset.params.table = null;
            $scope.dataset.params.schema = null;
            $scope.dataset.params.catalog = null;
        }
    };

    $scope.onLoadComplete = function () {
        if (angular.isUndefined($scope.dataset.params.mode)) {
            $scope.dataset.params.mode = 'table';
        }
        if (angular.isUndefined($scope.dataset.params.partitioningType)) {
            $scope.dataset.params.partitioningType = 'custom';
        }
        if (angular.isUndefined($scope.dataset.params.normalizeDoubles)) {
            $scope.dataset.params.normalizeDoubles = true;
        }
        if (angular.isUndefined($scope.dataset.params.readSQLDateColsAsDSSDates)) {
            $scope.dataset.params.readSQLDateColsAsDSSDates = $scope.appConfig.defaultReadSQLDatesAsDSSDates;
        }

        $scope.test(false, false);
    };

    $scope.gotoSearchAndImport = function () {
        $scope.uiState.bypassDirtinessCheck = true;
        DataikuAPI.connections.countIndexedAndUnindexed().success(function (data) {
            if (data.indexedConnections > 0) {
                $state.go('projects.project.catalog.items');
            } else {
                $state.go("projects.project.catalog.connectionexplorer")
            }

        }).error(setErrorInScope.bind($scope));
    };

    $scope.getAllTables = function(){
        Dialogs.confirmUnsafeHTML($scope, "Really list all tables?",
            "<p>This will list <strong>all tables in all schemas</strong> of your database.</p>"+
            "<p> On large entreprise databases, this is likely "+
            "to be extremely long and to cause your browser to become unresponsive.</p>"+
            "<p> To import existing tables, "+
            "it is recommended to use<br /> <a ng-click=\"dismiss(); gotoSearchAndImport()\">"+
            "<strong>New dataset &gt; Search &amp; Import</strong></a>, "+
            "which offers ability to filter, search and mass import</p>").then($scope.test.bind(this, true, false))
    }

    $scope.test = function (listTables, testTableOrQuery) {
        var previousTableList = $scope.testResult == null ? null : $scope.testResult.tablesList;

        $scope.testResult = null;
        $scope.testing = true;
        if (angular.isUndefined($scope.dataset.params.connection)) {
            $scope.testable = false;
            $scope.testing = false;
            return;
        } else {
            $scope.testable = true;
        }
        // Don't test obviously wrong stuff
        //if ($scope.dataset.params.partitioned == "true" && $scope.dataset.params.mode == "table")
        DataikuAPI.datasets.externalSQL.test($stateParams.projectKey, $scope.dataset, 15,
            listTables, testTableOrQuery).success(function (data) {
            Logger.info('Got test result');
            $scope.testing = false;
            $scope.testResult = data;
            if ($scope.testResult.queryOK && $scope.testResult.querySchema) {
                $scope.consistency = { empty : false, result : $scope.testResult.schemaDetection };
                $scope.consistency.kind = DatasetUtils.getKindForConsistency($scope.dataset);
                $scope.dataset.schema = $scope.testResult.schemaDetection.newSchema;
            }
            if ($scope.testResult.preview) {
                $scope.table = $scope.testResult.preview;
            }
            if (listTables) {
                if ($scope.testResult.schemaAware) {
                    if ($scope.testResult.catalogAware) {
                        angular.forEach($scope.testResult.tablesList, function(item) {
                            const qualifiedSchema = item.catalog ? (item.catalog + "." + item.schema) : item.schema;
                            item.qualified = qualifiedSchema + "." + item.table;
                            item.label = item.table + " (" + qualifiedSchema + ")";
                        });
                    } else {
                        angular.forEach($scope.testResult.tablesList, function(item) {
                            item.qualified = item.schema + "." + item.table;
                            item.label = item.table + " (" + item.schema + ")";
                        });
                    }
                } else {
                    angular.forEach($scope.testResult.tablesList, function(item) {
                        item.qualified = item.table;
                        item.label = item.table;
                    })
                }
            } else if (previousTableList) {
                $scope.testResult.tablesList = previousTableList;
            }
            if (!$scope.dataset.name && !$scope.new_dataset_name_manually_edited) {
                $scope.new_dataset_name = $scope.testResult.suggestedName;
            }
        }).error(function (a, b, c) {
            $scope.testing = false;
            setErrorInScope.bind($scope)(a,b,c);
        });
    };

    $scope.$watch("expandedDatasetParams.tableAndSchema", function(nv, ov) {
        if (nv) {
            $scope.dataset.params.table = nv.table;
            $scope.dataset.params.schema = nv.schema;
            $scope.dataset.params.catalog = nv.catalog;
        }
    });

    $scope.$watch("dataset.params", function(nv, ov) {
        if (nv) {
            $scope.expandedDatasetParams.tableAndSchema = {
                table : $scope.dataset.params.table,
                schema : $scope.dataset.params.schema,
                catalog : $scope.dataset.params.catalog
            }
        }
    }, true);

    /* Fixup everything we can ... */
    $scope.$watch('dataset.params', function (nv, ov) {
        if (nv && ov && nv.mode != ov.mode && $scope.testResult) {
            $scope.testResult.testedConnectionOnly = true;
        }
        // We DO NOT run a test each time params change because a test is a COSTLY
        // thing. We NEVER run it on simple model change, and in the specific case
        // of SQL, we even NEVER run it without explicit user action.
    }, true);

});

app.controller("ExternalHiveDatasetController", function($scope, $stateParams, $controller, LoggerProvider, DataikuAPI, DatasetUtils) {
    $controller("ExternalSQLDatasetController", {$scope: $scope});

    $scope.hooks.getConnectionNames = function() {
        DataikuAPI.connections.getHiveNames($stateParams.projectKey).success(function (data) {
            $scope.hiveConnections = data.map(function(db) {return {name:"@virtual(hive-jdbc):"+db, label:db};});
            $scope.setConnections($scope.hiveConnections.map(function(c) {return c.name;}));
        }).error(setErrorInScope.bind($scope));
    };


});


app.controller("ManagedSQLDatasetController", function($scope, $stateParams, $controller, $q, LoggerProvider, DataikuAPI, Dialogs, CreateModalFromTemplate, ActivityIndicator) {
    $controller("BaseSQLDatasetController", {$scope: $scope, withConsistency: true});

    var Logger = LoggerProvider.getLogger('datasets.sql');

    $scope.possibleTableCreationModes = [
        ["auto", "Automatically generate"],
        ["custom", "Manually define"]
    ]

    $scope.possibleSynapseDistribution = [
        ["ROUND_ROBIN", "Round robin"],
        ["HASH", "Hash"],
        ["REPLICATE", "Replicate"]
    ]

    $scope.copyCodeSnippet = function(snippet) {
        var stringToPutIntoClippboard = snippet.code;
        //ugly but necessary
        var textArea = document.createElement("textarea");
        textArea.style.position = 'absolute';
        textArea.style.top = '-1000px';
        textArea.style.left = '-1000px';
        textArea.value = stringToPutIntoClippboard;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            var successful = document.execCommand('copy');
            if (successful) {
                ActivityIndicator.success("Sample copied into cliboard");
            } else {
                ActivityIndicator.error("Your browser does not support automatic copying into clibboard");
            }
        } catch (err) {
            ActivityIndicator.error("Your browser does not support automatic copying into clibboard");
        }
        document.body.removeChild(textArea);
    };

    $scope.revertToAutogeneratedStatement = function(){
        $scope.test(true).then(function() {
            $scope.dataset.params.customCreateStatement = $scope.testResult.autogeneratedCreateStatement;
        });
    };

    $scope.refreshToAutogeneratedStatement = function(){
        $scope.test(true).then(function() { });
    };

    $scope.onLoadComplete = function () {
        if (angular.isUndefined($scope.dataset.params.mode)) {
            $scope.dataset.params.mode = 'table';
        }
        if (angular.isUndefined($scope.dataset.params.partitioningType)) {
            $scope.dataset.params.partitioningType = 'custom';
        }
        if (angular.isUndefined($scope.dataset.params.normalizeDoubles)) {
            $scope.dataset.params.normalizeDoubles = true;
        }
        if (!$scope.dataset.params.tableCreationMode) {
            $scope.dataset.params.tableCreationMode = "auto";
        }

        if (angular.isUndefined($scope.dataset.params.tableDistributionMode)) {
            $scope.dataset.params.tableDistributionMode = 'ROUND_ROBIN';
        }

        // Fire initial test
        // On managed, we more or less guarantee that we only target a table, so it can't be too heavy
        // EXCEPT IN CASE OF PARTITIONING
        $scope.test(false, !$scope.dataset.params.partitioned);
    };

    $scope.dropTable = function () {
        Dialogs.confirm($scope,'Drop table','Are you sure you want to drop the SQL table ?').then(function(){
            DataikuAPI.datasets.managedSQL.dropTable($stateParams.projectKey, $scope.dataset).success(function (data) {
                if(data.length > 0) {
                    // TODO @flow
                    // Some error happened!
                    CreateModalFromTemplate("/templates/datasets/delete-dataset-results.html", $scope, null, function(newScope) {
                    	newScope.results = data;
                    });
                } else {
                    $scope.test(false, true);
                    $scope.checkConsistency();
                }
            }).error(setErrorInScope.bind($scope));
        });
    };

    $scope.createTable = function () {
        DataikuAPI.datasets.managedSQL.createTable($stateParams.projectKey, $scope.dataset).success(function (data) {
            $scope.test(false, true);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.overwriteSchemaFromTable = function () {
        if (!$scope.dataset.schema) {
            $scope.dataset.schema = {};
        }
        $scope.dataset.schema.columns = $scope.testResult.currentTableSchema.columns;
        $scope.test(false, true);
    };

    $scope.filterEligibleBigQueryPartitionColumns = function(columns) {
        return columns.filter(c => (c.type === 'int' || c.type === 'tinyint' || c.type === 'bigint' || c.type === 'smallint' || c.type === 'date'));
    };

    $scope.filterEligibleBigQueryClusteringColumns = function(columns, clusteringIndex) {
        // Remove the columns that have a type that is not compatible with clustering
        let result = columns.filter(c => (c.type === 'string' || c.type === 'date' || c.type === 'boolean'
            || c.type === 'bigint' || c.type === 'int' || c.type === 'smallint' || c.type === 'tinyint'));

        // Remove the column used to partition the table
        result = result.filter(c => (c.name !== $scope.dataset.params.bigQueryPartitioningField));

        // Remove the columns used to cluster the table above.
        for (let i = 0; i < clusteringIndex; i++) {
            if ($scope.dataset.params.bigQueryClusteringColumns && $scope.dataset.params.bigQueryClusteringColumns.length > i) {
                result = result.filter(c => c.name !== $scope.dataset.params.bigQueryClusteringColumns[i].name);
            }
        }
        return result;
    };

    $scope.addBigQueryClusteringColumn = function() {
        if (!$scope.dataset.params.bigQueryClusteringColumns) {
            $scope.dataset.params.bigQueryClusteringColumns = [];
        }
        $scope.dataset.params.bigQueryClusteringColumns.push({name:''});
    };

    $scope.removeBigQueryClusteringColumn = function(index) {
        $scope.dataset.params.bigQueryClusteringColumns.splice(index, 1);
    };

    $scope.$watch("dataset.params.bigQueryPartitioningField", function(nv, ov) {
        if (nv) {
            const partitioningColumn = $scope.dataset.schema.columns.find(c => c.name === nv);
            $scope.dataset.params.bigQueryPartitioningType = (!partitioningColumn || partitioningColumn.type === "date") ? "DATE" : "RANGE";

            // If the new value was selected as a partitioning column, remove it from clustering columns if it was used as a clustering column
            const clusteringColumn = $scope.dataset.params.bigQueryClusteringColumns.find(c => c.name === nv);
            if (clusteringColumn) {
                const index = $scope.dataset.params.bigQueryClusteringColumns.indexOf(clusteringColumn);
                $scope.dataset.params.bigQueryClusteringColumns.splice(index, 1);
            }
        }
    });

    $scope.$watch("dataset.params.bigQueryClusteringColumns", function(nv, ov) {
        if (nv) {
            // Remove any duplicate column that may have been introduced by user.
            // It may happen if user has chosen [col1, col2, col3] as clustering columns and then select col2 in first dropdown.
            const columns = $scope.dataset.params.bigQueryClusteringColumns;
            $scope.dataset.params.bigQueryClusteringColumns = columns.filter((item, index) => {
                if (!item || !item.name) {
                    return true; // Keep empty placeholders
                }
                const firstMatchingColumn = columns.find(c => c.name === item.name);
                return columns.indexOf(firstMatchingColumn) === index;
            });
        }
    }, true);

    $scope.test = function (connectionOnly) {
        var deferred = $q.defer();
        $scope.testResult = null;
        $scope.testing = true;
        DataikuAPI.datasets.managedSQL.test($stateParams.projectKey, $scope.dataset, 15, connectionOnly).success(function (data) {
            Logger.info('Got test result');
            $scope.testing = false;
            $scope.testResult = data;
            if ($scope.testResult.preview) {
                $scope.table = $scope.testResult.preview;
            }
            deferred.resolve();

        }).error(function (a,b,c) {
            $scope.testing = false;
            setErrorInScope.bind($scope)(a,b,c);
            deferred.reject();
        });
        return deferred.promise;
    };

    $scope.$watch("dataset.params.tableCreationMode", function(nv, ov) {
        if (nv == "custom" && ov == "auto" && !$scope.dataset.params.customCreateStatement) {
             $scope.dataset.params.customCreateStatement =$scope.testResult.autogeneratedCreateStatement;
        }
    });

    /* For autocompletion in primary / distribute / sort / ... keys */
    $scope.$watch("dataset.schema", function(nv, ov){
        if (!nv) return;
        $scope.schemaColumnNames = nv.columns.map(x => x.name);
    }, true);

    /* Fixup everything we can ... */
    $scope.$watch('dataset.params', function (nv, ov) {
    }, true);
});

}());
