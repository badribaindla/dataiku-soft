/* jshint loopfunc: true*/
(function(){
'use strict';

var app = angular.module('dataiku.charts')

app.factory("WebappChart", function(ChartViewCommon, $compile, DataikuAPI, $stateParams, WebAppsService, PluginConfigUtils, FutureWatcher, $timeout, Logger, VirtualWebApp, SmartId) {
    return function($container, chartDef, data, $scope) {
    	$scope.chartDef = chartDef;
    	$scope.uiDisplayState = $scope.uiDisplayState || {};
    	$scope.storedWebAppId = $scope.chartDef.$storedWebAppId;

    	let datasetSmartName = SmartId.create(data.datasetName, data.projectKey);
    	// set the dataset name into the config
    	if ($scope.chartDef.$pluginChartDesc.datasetParamName) {
            $scope.chartDef.webAppConfig[$scope.chartDef.$pluginChartDesc.datasetParamName] = datasetSmartName;
    	}
        var hooks = {
            webAppConfigPreparation: function(chartDef) {
                var strippedChartDef = angular.copy(chartDef);
                Object.keys($scope.chartDef).filter(function(k) {return k.startsWith("$");}).forEach(function(k) {delete strippedChartDef[k];});
                return strippedChartDef;
            },
            stopFunction: function() {
               return $scope.chartDef.type != 'webapp';
            },
            handleError: $scope.chartSetErrorInScope,
            webAppReady: function(webAppId) {
                $scope.chartDef.$storedWebAppId = webAppId; // don't put in localstorage, just keep it in the chartDef (temporarily)
            }
        };

        $scope.uiDisplayState.skinWebApp = {noConfigWatch:true};
        VirtualWebApp.update($scope, $container, 'chartDef.webAppType', 'chartDef', DataikuAPI.explores.getOrCreatePluginChart.bind($scope, $stateParams.projectKey, datasetSmartName, chartDef), $scope.uiDisplayState.skinWebApp, hooks);
    }
});

})();