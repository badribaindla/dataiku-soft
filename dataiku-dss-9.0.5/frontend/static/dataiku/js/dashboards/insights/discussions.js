(function() {
'use strict';

const app = angular.module('dataiku.dashboards.insights');


app.constant("DiscussionsInsightHandler", {
    name: "discussions",
    desc: "Discussions feed on an object",
    icon: 'icon-comments-alt',
    color: 'discussions',

    getSourceId: function(insight) {
        return insight.params.objectId;
    },
    getSourceType: function(insight) {
        return insight.params.objectType;
    },

    hasEditTab: false,
    defaultTileParams: {
    },
    defaultTileDimensions: [5, 3]
});


app.controller('_discussionsInsightViewCommon', function($scope, $controller, DataikuAPI, $stateParams) {
    $scope.resolvedObject = {projectKey: $stateParams.projectKey, type: $scope.insight.params.objectType, id: $scope.insight.params.objectId};

    $scope.fetchdiscussions = function(resolve, reject, noSpinner) {
        const p = DataikuAPI.discussions.getForObject($stateParams.projectKey, $scope.insight.params.objectType, $scope.insight.params.objectId);
        if (noSpinner) {
            p.noSpinner();
        }
        p.noSpinner()
            .success(function(data) {
                $scope.discussions = data.discussions;
                if (typeof(resolve)==="function") resolve();
            }).error(function(data, status, headers, config, statusText) {
            	setErrorInScope.bind($scope)(data, status, headers, config, statusText);
            	if (typeof(reject)==="function") reject(data, status, headers, config, statusText);
        	});
    };
});


app.directive('discussionsInsightTile', function($controller, InsightLoadingState) {
    return {
        templateUrl: '/templates/dashboards/insights/discussions/discussions_tile.html',
        scope: {
            insight: '=',
            tile: '=',
            hook: '='
        },
        link: function($scope, element, attrs) {
            $controller('_discussionsInsightViewCommon', {$scope: $scope});

            $scope.loading = false;
            $scope.loaded = false;
            $scope.error = null;
            $scope.load = function(resolve, reject) {
            	$scope.loading = true;
                $scope.fetchdiscussions(
            		function() {
            			 $scope.loading = false;
                         $scope.loaded = true;
                         $scope.error = null;
                         if ($scope.hook && $scope.hook.isErrorMap) {
                         	$scope.hook.isErrorMap[$scope.tile.$tileId] = false;
                         }
                         if (typeof(resolve)==="function") resolve();
            		}, function(data, status, headers, config, statusText) {
            			$scope.loading = false;
                        $scope.loaded = false;
                        $scope.error = data;
                        if ($scope.hook && $scope.hook.isErrorMap) {
                        	$scope.hook.isErrorMap[$scope.tile.$tileId] = true;
                        }
                		$scope.hook.setErrorInDashboardPageScope(data, status, headers, config, statusText);
                        if (typeof(reject)==="function") reject();
            		}
        		);
            };

            if ($scope.tile.autoLoad) {
            	$scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
            }
        }
    };
});


app.directive('discussionsInsightTileParams', function() {
    return {
        templateUrl: '/templates/dashboards/insights/discussions/discussions_tile_params.html',
        scope: {
            tileParams: '='
        }
    };
});


app.directive('discussionsInsightCreateForm', function() {
    return {
        templateUrl: '/templates/dashboards/insights/discussions/discussions_create_form.html',
        scope: true,
        link: function($scope, element, attrs) {
            $scope.insight.params.objectType = 'DATASET';
            $scope.hook.defaultName = "discussions on object";
            $scope.$watch("hook.sourceObject", function(nv) {
                if (!nv || !nv.label) return;
                $scope.hook.defaultName = "discussions on " + nv.label;
            });
        }
    };
});


app.directive('discussionsInsightView', function($controller) {
    return {
        templateUrl: '/templates/dashboards/insights/discussions/discussions_view.html',
        scope: true,
        link: function($scope, element, attrs) {
            $controller('_discussionsInsightViewCommon', {$scope: $scope});
            $scope.fetchdiscussions();
        }
    };
});


app.directive('discussionsInsightEdit', function($controller, DataikuAPI) {
    return {
        templateUrl: '/templates/dashboards/insights/discussions/discussions_edit.html',
        scope: {
            insight: '='
        }
    };
});

})();
