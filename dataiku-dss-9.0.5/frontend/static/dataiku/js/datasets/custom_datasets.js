(function() {
'use strict';

const app = angular.module('dataiku.datasets.custom', []);


app.controller("CustomDatasetController", function($scope, $stateParams, Assert, DataikuAPI, PluginConfigUtils, Logger, DatasetUtils, MonoFuture) {
    Assert.trueish($scope.dataset.type, 'no dataset type');

    $scope.showPreview = true;

    $scope.desc = $scope.types[$scope.dataset.type].customDatasetDesc;

    $scope.loadedDesc = $scope.appConfig.customDatasets.filter(function(x){
        return x.datasetType == $scope.dataset.type;
    })[0];
    $scope.pluginDesc = $scope.appConfig.loadedPlugins.filter(function(x){
        return x.id == $scope.loadedDesc.ownerPluginId;
    })[0];


    // Finish dataset initialization if needed
    if (! $scope.dataset.schema) {
        $scope.dataset.schema = { columns: [] };
    }
    if (!$scope.dataset.params) {
        $scope.dataset.params ={}
    }
    if (!$scope.dataset.params.customConfig) {
        $scope.dataset.params.customConfig = {}
    }
    PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.dataset.params.customConfig);

    $scope.handleTestResult = function(){
        Assert.inScope($scope, 'testResult');

        if ($scope.testResult.schema != null) {
            $scope.dataset.schema = $scope.testResult.schema;
        }
        if ($scope.testResult.codeDefinedPartitioning != null) {
            $scope.dataset.partitioning = $scope.testResult.codeDefinedPartitioning;
        }
        if (!$scope.dataset.name && !$scope.new_dataset_name) {
            $scope.new_dataset_name = $scope.testResult.suggestedName;
        }
    }

    $scope.test = function () {
        $scope.testing = true;
        $scope.testResult = null;

        $scope.testFuture = null;
        MonoFuture($scope).wrap(DataikuAPI.datasets.customDataset.test)($stateParams.projectKey, $scope.dataset, $scope.showPreview).success(function (data) {
            $scope.testFuture = null;
            $scope.testing = false;
            Logger.info("Got test result");
            $scope.testResult = data.result;
            $scope.handleTestResult();
        }).update(function (data) {
            $scope.testFuture = data;
        }).error(function (data, status, headers) {
            $scope.testFuture = null;
            $scope.testing = false;
            setErrorInScope.bind($scope)(data, status, headers);
        });
    };

    $scope.onLoadComplete = function() {
        if ($scope.$eval('dataset.params.connection')) {
            $scope.test(true);
        }
    };

    $scope.toggleShowRequirements = function() {
    	if ( $scope.showRequirements === undefined ) {
    		$scope.showRequirements = false;
    		// first time : fetch requirements from the backend, with the command line to install them
    	    DataikuAPI.datasets.getRequirements($stateParams.projectKey, $scope.dataset.type).success(function(data){
    	    	$scope.requirements = data;
    	    }).error(setErrorInScope.bind($scope));
    	}
    	$scope.showRequirements = !$scope.showRequirements;
    };

    $scope.setSchemaUserModified = function() {
        $scope.schemaJustModified = true;
        $scope.dataset.schema.userModified = true;
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

});


    app.controller("DatasetFromPluginCreationController", function($scope, $state, $rootScope, $stateParams){
        $scope.datasets = [];
        $scope.otherPluginRecipes = [];

        $scope.$watch("pluginId", function(nv, ov) {
            if (!nv) return;
            $scope.plugin = Array.dkuFindFn($rootScope.appConfig.loadedPlugins, function(n){
                return n.id === $scope.pluginId
            });

            const addDataset = function (plugin, getPluginType) {
                if (plugin.ownerPluginId === $scope.pluginId) {
                    $scope.datasets.push({
                        type: getPluginType(plugin),
                        label: plugin.desc.meta.label,
                        description: plugin.desc.meta.description,
                        icon: plugin.desc.meta.icon || $scope.plugin.icon
                    });
                }
            };

            if ($scope.plugin) {
                $rootScope.appConfig.customFSProviders.forEach(plugin => addDataset(plugin, x => x.fsProviderType));
                $rootScope.appConfig.customDatasets.forEach(plugin => addDataset(plugin, x => x.datasetType));
            }
        });

        $scope.create = function(dataset) {
            $scope.dismiss();
            $state.go('projects.project.datasets.new_with_type.settings', {type:dataset.type, zoneId: $scope.getRelevantZoneId($stateParams.zoneId)});
        };
    });


})();