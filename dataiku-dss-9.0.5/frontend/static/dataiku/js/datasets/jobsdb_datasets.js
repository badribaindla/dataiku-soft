(function() {
'use strict';

const app = angular.module('dataiku.datasets');


app.controller("MetricsDatasetController", function($scope, $stateParams, $controller, LoggerProvider, DataikuAPI) {
	$controller("BaseRowDatasetController", {$scope: $scope, withConsistency: true});

    const Logger = LoggerProvider.getLogger('datasets.jobsdb');

    if ( !$scope.dataset.params.view ) {
    	$scope.dataset.params.view = 'METRICS_HISTORY';
    }
    if (!$scope.dataset.params.scope) {
        $scope.dataset.params.scope = "SINGLE_OBJECT";
    }

    $scope.viewTypes = [
        {
            name: 'METRICS_HISTORY',
            displayName: 'Metrics history'
        },
        {
            name: 'METRICS_LAST',
            displayName: 'Metrics last values'
        },
        {
            name: 'CHECKS_HISTORY',
            displayName: 'Checks history'
        },
        {
            name: 'CHECKS_LAST',
            displayName: 'Checks last values'
        }
    ];
    $scope.selected = {
        dataset: null,
        managedFolder: null,
        savedModel: null
    };

    function updateSelectedObject() {
    	if (!$scope.datasets || !$scope.managedFolders || !$scope.savedModels || !$scope.dataset.params || !$scope.dataset.params.smartName) {
            return;
        }
        const params = $scope.dataset.params;
    	const fullName = params.smartName.includes('.') ? params.smartName : ($stateParams.projectKey + '.' + params.smartName);
    	$scope.datasets.forEach(function(dataset) {
    		if (fullName == dataset.projectKey + '.' + dataset.name) {
    			$scope.selected.dataset = dataset;
    		}
    	});
    	$scope.managedFolders.forEach(function(mf) {
    		if (fullName == mf.projectKey + '.' + mf.id) {
    			$scope.selected.managedFolder = mf;
    		}
    	});
    	$scope.savedModels.forEach(function(sm) {
    		if (fullName == sm.projectKey + '.' + sm.id) {
    			$scope.selected.savedModel = sm;
    		}
    	});
    };

    DataikuAPI.datasets.listWithAccessible($stateParams.projectKey).success(function(data) {
    	data.forEach(function(ds) {ds.foreign = (ds.projectKey != $stateParams.projectKey);});
        $scope.datasets = data;
        updateSelectedObject();
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.managedfolder.listWithAccessible($stateParams.projectKey).success(function(data) {
    	data.forEach(function(ds) {ds.foreign = (ds.projectKey != $stateParams.projectKey);});
        $scope.managedFolders = data;
        updateSelectedObject();
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.savedmodels.listWithAccessible($stateParams.projectKey).success(function(data) {
    	data.forEach(function(ds) {ds.foreign = (ds.projectKey != $stateParams.projectKey);});
        $scope.savedModels = data;
        updateSelectedObject();
    }).error(setErrorInScope.bind($scope));

    $scope.onLoadComplete = function () {
    	updateSelectedObject();
    };

    $scope.$watch('selected.dataset', function(nv, ov) {
    	if ( nv == null || nv == ov ) return;
    	var ds = $scope.selected.dataset;
    	$scope.selected.managedFolder = null;
    	$scope.selected.savedModel = null;
    	var newSmartName = ($stateParams.projectKey != ds.projectKey ? (ds.projectKey + '.') : '') + ds.name;
    	if (newSmartName != $scope.dataset.params.smartName) {
    	    $scope.dataset.params.smartName = newSmartName;
    	    $scope.dataset.params.partition = null;
    	    $scope.dataset.params.filter = null;
    	}
    });

    $scope.$watch('selected.managedFolder', function(nv, ov) {
    	if ( nv == null || nv == ov ) return;
    	$scope.selected.dataset = null;
    	var mf = $scope.selected.managedFolder;
    	$scope.selected.savedModel = null;
        var newSmartName = ($stateParams.projectKey != mf.projectKey ? (mf.projectKey + '.') : '') + mf.id;
        if (newSmartName != $scope.dataset.params.smartName) {
        	$scope.dataset.params.smartName = newSmartName;
        	$scope.dataset.params.partition = null;
        	$scope.dataset.params.filter = null;
        }
    });

    $scope.$watch('selected.savedModel', function(nv, ov) {
    	if ( nv == null || nv == ov ) return;
    	$scope.selected.dataset = null;
    	$scope.selected.managedFolder = null;
    	var sm = $scope.selected.savedModel;
        var newSmartName = ($stateParams.projectKey != sm.projectKey ? (sm.projectKey + '.') : '') + sm.id;
        if (newSmartName != $scope.dataset.params.smartName) {
        	$scope.dataset.params.smartName = newSmartName;
        	$scope.dataset.params.partition = null;
        	$scope.dataset.params.filter = null;
        }
    });

    $scope.$watch('dataset.params.view', function(nv, ov) {
    	if ( nv == null || nv == ov ) return;
    	$scope.dataset.params.partition = null;
    	$scope.dataset.params.filter = null;
    });
    $scope.$watch('dataset.params.filter', function(nv, ov) {
    	if ( nv == ov ) return;
    	if ( $scope.dataset.params.filter == null ) {
    		$scope.dataset.params.filter = '';
    	}
    });
    $scope.$watch('dataset.params.partition', function(nv, ov) {
    	if ( nv == ov ) return;
    	if ( $scope.dataset.params.partition == null ) {
    		$scope.dataset.params.partition = '';
    	}
    });

    $scope.test = function () {
        $scope.testResult = null;
        $scope.testing = true;
        $scope.testable = true;

        DataikuAPI.datasets.jobsdb.test($stateParams.projectKey, $scope.dataset).success(function (data) {
            Logger.info('Got test result');
            $scope.testing = false;
            $scope.testResult = data;
            if ($scope.testResult.querySchema) {
                $scope.dataset.schema = $scope.testResult.querySchema;
            }
            if (!$scope.dataset.name && !$scope.new_dataset_name_manually_edited) {
                $scope.new_dataset_name = $scope.testResult.suggestedName;
            }
            if ( data.knownPartitions ) {
            	$scope.testResult.knownPartitionsAndEmpty = [{name:"Any", value:""}];
            	data.knownPartitions.forEach(function(p) {$scope.testResult.knownPartitionsAndEmpty.push({name:p, value:p})});
            } else {
            	$scope.testResult.knownPartitionsAndEmpty = null;
            }
            if ( data.knownIds ) {
            	$scope.testResult.knownIdsAndEmpty = [{name:"Any", value:""}];
            	data.knownIds.forEach(function(p) {$scope.testResult.knownIdsAndEmpty.push({name:p, value:p})});
            } else {
            	$scope.testResult.knownIdsAndEmpty = null;
            }
        }).error(function (a, b, c) {
            $scope.testing = false;
            setErrorInScope.bind($scope)(a,b,c);
        });
    };
});


app.controller("StatsDBDatasetController", function($scope, $stateParams, $controller, LoggerProvider, DataikuAPI, Debounce) {
    $controller("BaseRowDatasetController", {$scope: $scope, withConsistency: true});

    var Logger = LoggerProvider.getLogger('datasets.statsdb');

    $scope.viewTypes = [
        {name:'CLUSTER_TASKS', displayName:'Cluster tasks'},
        {name:'COMMITS', displayName:'Commits (internal Git)'},
        {name:'JOBS', displayName:'Jobs'},
        {name:'SCENARIO_RUNS', displayName:'Scenario runs'},
        {name:'FLOW_ACTIONS', displayName:'Object states'}
    ]

    $scope.onLoadComplete = function () {
        if ($scope.dataset.params && !$scope.dataset.params.view){
            $scope.dataset.params.view = "CLUSTER_TASKS";
        }
    };

    $scope.test = function () {
        $scope.testResult = null;
        $scope.testing = true;
        $scope.testable = true;

        DataikuAPI.datasets.statsdb.test($stateParams.projectKey, $scope.dataset).success(function (data) {
            Logger.info('Got test result');
            $scope.testing = false;
            $scope.testResult = data;
            if ($scope.testResult.querySchema) {
                $scope.dataset.schema = $scope.testResult.querySchema;
            }
            if (!$scope.dataset.name && !$scope.new_dataset_name_manually_edited) {
                $scope.new_dataset_name = $scope.testResult.suggestedName;
            }
        }).error(function (a, b, c) {
            $scope.testing = false;
            setErrorInScope.bind($scope)(a,b,c);
        });
    };
});

}());