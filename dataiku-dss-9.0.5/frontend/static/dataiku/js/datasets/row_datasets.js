(function() {
'use strict';

var app = angular.module('dataiku.datasets');


// All Row-Oriented DS (including SQL)
app.controller("BaseRowDatasetController", function($scope, LoggerProvider, DataikuAPI, DatasetUtils, WT1, withConsistency) {
    var Logger = LoggerProvider.getLogger('datasets.row');

    $scope.dimensionTypes = [
        { type: 'time',  label: 'Time range' },
        { type: 'value', label: 'Discrete values' }
    ];
    $scope.timeDimensionPeriods = ["YEAR", "MONTH", "DAY", "HOUR"];

    // Consistency methods
    if (!withConsistency) {
        Logger.warn("Consistency not implemented");
        return;
    }
    $scope.setSchemaUserModified = function() {
        $scope.schemaJustModified = true;
        $scope.dataset.schema.userModified = true;
    };

    $scope.discardSchemaChanges = function() {
        // To discard schema changes, we mark the schema as not modified and trigger a new preview.
        // The backend will thus discard our schema changes but keep our comments when applicable.
        Logger.info("Discarding schema changes");
        if ($scope.dataset.schema) {
            $scope.dataset.schema.userModified = false;
        }
        $scope.test(false);
    };

    $scope.checkConsistency = function() {
        Logger.info('Checking consistency');

        $scope.schemaJustModified = false;
        DataikuAPI.datasets.testSchemaConsistency($scope.dataset).success(function (data) {
            Logger.info("Got consistency result", data);
            $scope.consistency = data;
            $scope.consistency.kind = DatasetUtils.getKindForConsistency($scope.dataset);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.discardConsistencyError = function() {
        $scope.consistency = null;
    };

    $scope.overwriteSchema = function(newSchema) {
        WT1.event("dataset-discard-schema-changed", { datasetType: $scope.dataset.type, datasetManaged: $scope.dataset.managed });
        $scope.dataset.schema = angular.copy(newSchema);
        $scope.schemaJustModified = false;
        $scope.consistency = null;
        $scope.checkConsistency();
    };
});


// NoSQL Row-Oriented DS
app.controller("BaseNoSQLRowDatasetController", function($scope, $stateParams, $controller, LoggerProvider, DataikuAPI, Dialogs, withConsistency) {
    $controller("BaseRowDatasetController", {$scope: $scope, withConsistency: withConsistency});

    var Logger = LoggerProvider.getLogger('datasets.row');

    // Finish dataset initialization if needed
    if (! $scope.dataset.schema) {
        $scope.dataset.schema = { columns: [] };
    }

    $scope.$watch('dataset.type', function (nv, ov) {
        DataikuAPI.connections.getNames($scope.dataset.type).success(function (data) {
            $scope.connections = data;
            if (!$scope.dataset.params.connection && data.length) {
                $scope.dataset.params.connection = data[0];
                $scope.test(true);
            }
        }).error(setErrorInScope.bind($scope));
    });

    $scope.inferStorageTypesFromData = function(){
        Dialogs.confirm($scope,
            "Infer storage types from data",
            "This only takes into account a very small sample of data, and could lead to invalid data. "+
            "For safer typing of data, use a prepare recipe.").then(function(){
                $scope.dataset.schema.userModified = false;
                $scope.test(false, true);
        });
    };


    // requires $scope.testAPI and $scope.testCallback
    $scope.test = function (connectionOnly, inferStorageTypes, listTables) {
        $scope.testing = true;
        $scope.testResult = null;
        $scope.schemaJustModified = false;
        if (angular.isUndefined($scope.dataset.params.connection)) {
            Logger.info('Not testable');
            $scope.testing = false;
            $scope.testResult = { connectionOK: false, connectionErrorMsg: "no connection defined" };
            return;
        }
        $scope.testAPI($stateParams.projectKey, $scope.dataset, connectionOnly, inferStorageTypes, listTables)
            .success(function (data) {
                Logger.info('Got test result');
                $scope.testing = false;
                $scope.testResult = data;
                $scope.testCallback(connectionOnly, data);
            })
            .error(function (data) { $scope.testing = false; });
    };

    $scope.onLoadComplete = function() {
        if ($scope.$eval('dataset.params.connection')) {
            $scope.test(true);
        }
    };
});


app.controller("BaseNoSQLRowDatasetControllerWithSingleColumnPartitioning", function($scope, $controller, withConsistency) {
    $controller("BaseNoSQLRowDatasetController", {$scope: $scope, withConsistency: withConsistency});

    $scope.$watch('dataset.params', function (nv, ov) {
        $scope.dataset.partitioning = $scope.dataset.partitioning || {};
        $scope.dataset.partitioning.dimensions = $scope.dataset.partitioning.dimensions || [];
        const dimensions = $scope.dataset.partitioning.dimensions;
        if ($scope.dataset.params.partitioned) {
            if (!dimensions.length) {
                dimensions.push({
                    name: 'time',
                    type: 'value',
                    params: {}
                });
            }
            if (angular.isDefined($scope.dataset.params.partitioningColumn)) {
                dimensions[0].name = $scope.dataset.params.partitioningColumn;
            }
        }
        else {
            $scope.dataset.partitioning.dimensions = [];
            delete $scope.dataset.params.partitioningColumn;
            delete $scope.dataset.params.explicitPartitionsList;
        }
    }, true);

});


app.controller("MongoDBDatasetController", function($scope, $controller, DataikuAPI, DatasetUtils) {
    $controller("BaseNoSQLRowDatasetControllerWithSingleColumnPartitioning", {$scope: $scope, withConsistency: true});

    $scope.testAPI = DataikuAPI.datasets.mongoDB.test;

    $scope.testCallback = function (connectionOnly, data) {
        if (!connectionOnly) {
            $scope.dataset.schema = (data.schemaDetection || {}).newSchema;
            $scope.consistency = { empty : false, result : data.schemaDetection };
            $scope.consistency.kind = DatasetUtils.getKindForConsistency($scope.dataset);

            if (!$scope.dataset.name && !$scope.new_dataset_name_manually_edited) {
                $scope.new_dataset_name = $scope.testResult.suggestedName;
            }
        }
    };

    /* For managed only */
    $scope.createCollection = function() {
        DataikuAPI.datasets.mongoDB.createCollection($scope.dataset).success(function (data) {
            $scope.test(false);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.deleteCollection = function() {
        DataikuAPI.datasets.mongoDB.deleteCollection($scope.dataset).success(function (data) {
            $scope.test(false);
        }).error(setErrorInScope.bind($scope));
    };
});

app.controller("DynamoDBDatasetController", function($scope, $controller, DataikuAPI, DatasetUtils, Dialogs) {
    $controller("BaseNoSQLRowDatasetControllerWithSingleColumnPartitioning", {$scope: $scope, withConsistency: true});


    $scope.testAPI = DataikuAPI.datasets.dynamoDB.test;

    $scope.testCallback = function (connectionOnly, data) {
        if (!connectionOnly) {
            $scope.dataset.schema = (data.schemaDetection || {}).newSchema;
            $scope.consistency = { empty : false, result : data.schemaDetection };
            $scope.consistency.kind = DatasetUtils.getKindForConsistency($scope.dataset);

            if (!$scope.dataset.name && !$scope.new_dataset_name_manually_edited) {
                $scope.new_dataset_name = $scope.testResult.suggestedName;
            }
        }
    };

    $scope.createTable = function() {
        DataikuAPI.datasets.dynamoDB.createTable($scope.dataset).success(function (data) {
            $scope.test(false);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.deleteTable = function() {
        DataikuAPI.datasets.dynamoDB.deleteTable($scope.dataset).success(function (data) {
            $scope.test(false);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.updateIndex = function() {
        $scope.saveDataset().then(function() {
            DataikuAPI.datasets.dynamoDB.updateIndex($scope.dataset).success(function (data) {
                $scope.test(false);
            }).error(setErrorInScope.bind($scope));
        },setErrorInScope.bind($scope));
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
                    "to be extremely long and to cause your browser to become unresponsive.</p>").then($scope.test.bind(this,false,false,true));
    };

});


app.controller("BaseCassandraDatasetController", function($scope, $controller, DataikuAPI) {
    $controller("BaseNoSQLRowDatasetControllerWithSingleColumnPartitioning", {$scope: $scope, withConsistency: false});

    $scope.overwriteSchemaFromTable = function () {
        $scope.dataset.schema = {
            userModified: false,
            columns: $scope.testResult.tableSchema.columns
        };
        $scope.test(true);
    };

    $scope.testAPI = DataikuAPI.datasets.cassandra.test;

    $scope.testCallback = function (connectionOnly, data) {
        if (! $scope.dataset.managed && (!$scope.dataset.schema || !$scope.dataset.schema.columns || $scope.dataset.schema.columns.length == 0) && $scope.testResult.tableSchema) {
            // Overwrite schema using detected schema, if we have none
            $scope.dataset.schema = {
                userModified: false,
                columns: $scope.testResult.tableSchema.columns
            };
            $scope.testResult.schemaMatchesTable = true;
        }
    };
});


app.controller("ManagedCassandraDatasetController", function($scope, $controller, DataikuAPI, Dialogs) {
    $controller("BaseCassandraDatasetController", {$scope: $scope});

    $scope.createTable = function() {
        DataikuAPI.datasets.cassandra.createTable($scope.dataset)
            .success($scope.test.bind($scope, false))
            .error(setErrorInScope.bind($scope));
    };

    $scope.dropTable = function() {
        Dialogs.confirm($scope,'Drop table','Are you sure you want to drop the Cassandra table?').then(function(){
            DataikuAPI.datasets.cassandra.dropTable($scope.dataset)
                .success($scope.test.bind($scope, false))
                .error(setErrorInScope.bind($scope));
        });
    };
});


app.controller("ExternalCassandraDatasetController", function($scope, $controller) {
    $controller("BaseCassandraDatasetController", {$scope: $scope});
});


app.controller("ElasticSearchDatasetController", function($scope, $controller, DataikuAPI) {
    $controller("BaseNoSQLRowDatasetController", {$scope: $scope, withConsistency: true});

    $scope.$watch('dataset.params', function (nv, ov) {
        if ($scope.testResult && !$scope.testResult.testedConnectionOnly && (nv.index !== ov.index || nv.type !== ov.type)) {
            $scope.testResult.testedConnectionOnly = true;
        }
        /* For ElasticSearch, we have:
         *    - managed = partition-by-alias, only partitioning definition in dataset config
         *    - not-managed = partition-by-column, with "partitioned" and "partitioningColumn"
         *                    in the dataset config
         *
         * In the managed case, we DO NOT do anything to the dataset config.
         */
        $scope.dataset.partitioning = $scope.dataset.partitioning || {};
        if (!$scope.dataset.params.partitioned || !$scope.dataset.partitioning.dimensions) {
            $scope.dataset.partitioning.dimensions = [];
        }
        const dimensions = $scope.dataset.partitioning.dimensions;
        if ($scope.dataset.params.partitioned) {
            if (dimensions.length === 0) {
                dimensions.push({
                    name: 'time',
                    type: 'value',
                    params: {}
                });
            }
            if (angular.isDefined($scope.dataset.params.partitioningColumn)) {
                dimensions[0].name = $scope.dataset.params.partitioningColumn;
            }
        }
    }, true);

    $scope.partitionTemplate = { type: 'value' };
    $scope.checkPartitionDimension = function(it) {
        return it.type && it.name && (it.type !== 'time' || it.params.period);
    };

    $scope.testAPI = function() {
        return DataikuAPI.datasets.elasticsearch.test.apply(null, arguments)
            .success(function(data) {
                if (data.defaultMapping) { // prettify
                    data.defaultMapping = JSON.stringify(JSON.parse(data.defaultMapping), null, '  ');
                }
                return data;
            });
    };
    $scope.testCallback = function (connectionOnly, data) {
        if (!connectionOnly && data.schemaDetection) {
            $scope.dataset.schema = data.schemaDetection.newSchema;
        }
        $scope.documentTypeNeeded = ['ES_LE_2', 'ES_5'].includes($scope.testResult.dialect);
        if ($scope.testResult.version != undefined) { // server unreachable will not return any ES version
            var terms = $scope.testResult.version.split('.');
            if(terms.length >= 2){
                var major = parseInt(terms[0]);
                var minor = parseInt(terms[1]);
                if(major < 6 || (major == 6 && minor <2)) {
                    $scope.indexDocumentTypePattern = new RegExp('^(?!_).+$');
                } else if (major == 6 && minor >= 2) {
                    $scope.indexDocumentTypePattern = new RegExp('^((?!_).+)$|^_doc$');
                }
            } else {
                $scope.indexDocumentTypePattern = new RegExp('^(?!_).+$');
            }
        }
    };

    $scope.$watch('dataset.params.connection', function (){
        //Wait init before watching changes.
        if($scope.testResult){
            $scope.test(true);
        }
    });
    $scope.documentTypeNeeded = false;
});

}());
