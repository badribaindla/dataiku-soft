(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');


    app.constant("ScenarioInsightHandler", {
        name: "Scenario",
        desc: "Run button or activity report of a scenario",
        icon: 'icon-list',
        color: 'scenario'
    });

    app.constant("ScenarioLastRunsInsightHandler", {

        icon: 'icon-list',
        color: 'scenario',
        name: 'Scenario last runs',

        getSourceId: function(insight) {
            return insight.params.scenarioSmartId;
        },
        sourceType: 'SCENARIO',
        hasEditTab: false,
        defaultTileParams: {
            displayMode: 'SIMPLE',
            range: 'CURRENT_MONTH'
        },
        defaultTileShowTitleMode: 'MOUSEOVER',
        defaultTileDimensions: [12, 1]
    });

    app.constant("ScenarioRunButtonInsightHandler", {

        icon: 'icon-list',
        color: 'scenario',
        name: 'Scenario run button',

        getSourceId: function(insight) {
            return insight.params.scenarioSmartId;
        },
        sourceType: 'SCENARIO',
        hasEditTab: false,
        defaultTileParams: {
        },
        defaultTileDimensions: [2, 2],
        accessMode: 'RUN'
    });

    app.controller('ScenarioLastRunsViewCommon', function($scope) {
        $scope.resolveRange = function(range) {
            var to, from;
            switch(range) {
                case 'CURRENT_DAY':
                    to = moment();
                    from = moment().startOf('day');
                    break;
                case 'PREVIOUS_DAY':
                    from = moment().subtract(1, 'day').startOf('day');
                    to = moment().subtract(1, 'day').endOf('day');
                    break;
                case 'LAST_NIGHT':
                    to = moment().set({'hours': 9, 'second': 0, 'millisecond': 0});
                    from = moment().subtract(1, 'day').set({'hours': 17, 'second': 0, 'millisecond': 0});
                    break;
                case 'CURRENT_WEEK':
                    to = moment();
                    from = moment().startOf('week');
                    break;
                case 'PREVIOUS_WEEK':
                    from = moment().subtract(1, 'week').startOf('week');
                    to = moment().subtract(1, 'week').endOf('week');
                    break;
                case 'CURRENT_MONTH':
                    to = moment();
                    from = moment().startOf('month');
                    break;
                case 'PREVIOUS_MONTH':
                    from = moment().subtract(1, 'month').startOf('month');
                    to = moment().subtract(1, 'month').endOf('month');
                    break;
                default:
                    throw "Unexpected range: " + range;
            }
            return {to: to.format(), from: from.format()};
        };


        $scope.ranges = [
            'CURRENT_DAY',
            'LAST_NIGHT',
            'PREVIOUS_DAY',
            'CURRENT_WEEK',
            'PREVIOUS_WEEK',
            'CURRENT_MONTH',
            'PREVIOUS_MONTH'
        ];
    });

    app.directive('scenarioLastRunsInsightTile', function($stateParams, $timeout, DataikuAPI, $controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_last_runs/scenario_last_runs_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
            	
            	$controller('ScenarioTimelineControllerCommon', {$scope: $scope});
                $controller('ScenarioLastRunsViewCommon', {$scope: $scope});

                $scope.scenarioId = $scope.insight.params.scenarioSmartId;
        		$scope.uiState.viewMode = $scope.insight.params.viewMode;

            	$scope.loading = false;
                $scope.loaded = false;
                $scope.error = null;
                $scope.load = function(resolve, reject) {
                	$scope.loading = true;

                    $scope.$watch("tile.tileParams.range", function(nv) {
                        if (!nv) return;

                        var resolvedRange = $scope.resolveRange($scope.tile.tileParams.range);
                        DataikuAPI.scenarios.getScenarioReport($scope.insight.projectKey, $scope.insight.params.scenarioSmartId, resolvedRange.from, resolvedRange.to)
                            .noSpinner()
                            .success($scope.setScenarioGantt)
                            .success(DashboardUtils.setLoaded.bind([$scope, resolve]))
                            .error(DashboardUtils.setError.bind([$scope, reject]));
                    });

                };
                
                if ($scope.tile.autoLoad) {
                	$scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }
                
            }
        };
    });

    app.directive('scenarioLastRunsInsightView', function($controller, DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_last_runs/scenario_last_runs_view.html',
            scope: {
                insight: '=',
                tileParams: '='
            },
            link: function($scope, element, attrs) {
            	$controller('ScenarioTimelineControllerCommon', {$scope: $scope});
                $controller('ScenarioLastRunsViewCommon', {$scope: $scope});

                $scope.editable = true;
                $scope.scenarioId = $scope.insight.params.scenarioSmartId;
                $scope.uiState.range = "CURRENT_MONTH";

                $scope.$watch("uiState.range", function(nv) {
                    if (!nv) return;
                    var resolvedRange = $scope.resolveRange($scope.uiState.range);

                    DataikuAPI.scenarios.getScenarioReport($scope.insight.projectKey, $scope.insight.params.scenarioSmartId, resolvedRange.from, resolvedRange.to).success(function(data){
                        $scope.setScenarioGantt(data);
                    }).error(function(data, status, headers, config, statusText) {
                        setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                    });
                });
            }
        };
    });

    app.directive('scenarioLastRunsInsightTileParams', function($controller){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_last_runs/scenario_last_runs_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
                $controller('ScenarioLastRunsViewCommon', {$scope: $scope});
            }
        };
    });

    app.directive('scenarioInsightCreateForm', function(DataikuAPI, $filter, $controller){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_last_runs/scenario_create_form.html',
            scope: true,
            link: function($scope, element, attrs){
                $controller('ScenarioLastRunsViewCommon', {$scope: $scope});

                $scope.insight.type = 'scenario_last_runs';
                $scope.insight.params.viewMode = 'TIMELINE';
                $scope.insight.params.range = 'CURRENT_DAY';
                $scope.hook.defaultName = "Scenario";

                function updateDefaultName() {
                    if ($scope.insight.type == 'scenario_last_runs') {
                        $scope.hook.defaultName = $filter('niceConst')($scope.insight.params.viewMode) + ' view of scenario';
                    } else if ($scope.insight.type == 'scenario_run_button') {
                        $scope.hook.defaultName = 'Run scenario';
                    } else {
                        $scope.hook.defaultName = 'Scenario';
                    }
                    if ($scope.hook.sourceObject && $scope.hook.sourceObject.label) {
                        $scope.hook.defaultName += ' ' + $scope.hook.sourceObject.label;
                    }
                }
                $scope.$watch("hook.sourceObject", updateDefaultName);
                $scope.$watch("insight.params.viewMode", updateDefaultName);
                $scope.$watch("insight.type", updateDefaultName);
            }
        };
        
    });


    app.directive('scenarioRunButtonInsightTile', function($stateParams, $timeout, DataikuAPI, WT1, Notification, SmartId, ScenarioUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_run_button/scenario_run_button_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){

                $scope.getTriggerName = ScenarioUtils.getTriggerName;

                // Check if there is a loading scenario
                function refreshScenarioRunState(resolve, reject) {
                    return DataikuAPI.scenarios.getLastScenarioRuns($scope.insight.projectKey, $scope.insight.params.scenarioSmartId, true, 1)
                        .success(function(data) {
                            $scope.lastRun = data[0];
                            $scope.runStarting = false;
                            $scope.scenario = data.scenario;
                            $scope.loading = false;
                            $scope.loaded = true;
                            if (resolve) resolve();
                        })
                        .error($scope.hook.setErrorInDashboardPageScope.bind($scope))
                        .error(function() {
                            $scope.loading = false;
                            if (reject) reject();
                        }).noSpinner();
                }

                $scope.load = function(resolve, reject) {
                    $scope.loading = true;

                    var resolvedScenario = SmartId.resolve($scope.insight.params.scenarioSmartId);

                    refreshScenarioRunState(resolve, reject)
                        .success(function() {
                            var unRegister = Notification.registerEvent("scenario-state-change", function(evt, message) {
                                if (message.scenarioId != resolvedScenario.id || message.projectKey != resolvedScenario.projectKey) return;
                                refreshScenarioRunState();
                            });
                            $scope.$on("$destroy", unRegister);
                        });
                };

                $scope.abort = function(resolve, reject) {
                    DataikuAPI.futures.abort($scope.lastRun.futureId);
                };

                if ($scope.tile.autoLoad) {
                    $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }

                $scope.runNow = function() {
                    $scope.runStarting = true;
                    WT1.event("scenario-manual-run-from-dashboard");
                    DataikuAPI.scenarios.manualRun($scope.insight.projectKey, $scope.insight.params.scenarioSmartId)
                        .success(function(data){})
                        .error(function(data, status, headers, config, statusText) {
                            $scope.runStarting = false;
                            $scope.hook.setErrorInDashboardPageScope.bind($scope)(data, status, headers, config, statusText);
                        });
                }
            }
        };
    });

    app.directive('scenarioRunButtonInsightTileParams', function(DataikuAPI){
        return {
            templateUrl: '/templates/dashboards/insights/scenario_run_button/scenario_run_button_tile_params.html',
            scope: {
                tileParams: '='
            }
        };
    });
    
})();
