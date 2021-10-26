(function(){
'use strict';

const app = angular.module('dataiku.dashboards.insights');


app.constant("ReportInsightHandler", {
    name: "Report",
    desc: "Display report",
    icon: 'icon-DKU_rmd',
    color: 'notebook',

    getSourceId: function(insight) {
        return insight.params.reportSmartId;
    },
    sourceType: 'REPORT',
    hasEditTab: true,
    defaultTileParams: {

    },
    defaultTileShowTitleMode: 'NO',
    defaultTileDimension: [4, 5]
});


app.controller('ReportSnapshotCommonController', function($scope, $stateParams, $sce, $timeout, $q, Assert, DataikuAPI, RMARKDOWN_PREVIEW_OUTPUT_FORMATS) {
    $scope.resolvedReport = resolveObjectSmartId($scope.insight.params.reportSmartId,  $stateParams.projectKey);


    $scope.displaySnapshot = function(element, snapshot) {
        if (!snapshot.timestamp) {
            return;
        }
        let format = $scope.insight.params.viewFormat;
        if (format == null && snapshot.availableFormats && snapshot.availableFormats.length) { // backwards compatibility
            const availablePreviewFormats = RMARKDOWN_PREVIEW_OUTPUT_FORMATS.filter(f => snapshot.availableFormats.includes(f.name));
            if (availablePreviewFormats.length) {
                format = availablePreviewFormats[0].name;
            }
        }
        const url = "/dip/api/reports/snapshots/view?" + $.param({
            projectKey: snapshot.projectKey,
            id: snapshot.reportId,
            format: format,
            timestamp: snapshot.timestamp
        });
        const iframe = element.find('iframe');
        iframe.attr('src', url);
    };

    $scope.getLoadingPromise = function() {
        const params = $scope.insight.params;
        const t = params.loadLast ? 0 : params.exportTimestamp;
        return DataikuAPI.reports.snapshots.get($scope.insight.projectKey, params.reportSmartId, t);
    };

});


app.directive('reportInsightTile', function($controller, $timeout, DashboardUtils, InsightLoadingState){
    return {
        templateUrl: '/templates/dashboards/insights/code-reports/report_tile.html',
        scope: {
            insight: '=',
            tile: '=',
            hook: '=',
            editable: '='
        },
        link: function($scope, element, attrs){
            $scope.element = element;

            $controller('ReportSnapshotCommonController', {$scope: $scope});

            $scope.loaded = false;
            $scope.loading = false;
            $scope.error = null;
            $scope.load = function(resolve, reject) {
                $scope.loading = true;
                const loadingPromise = $scope.getLoadingPromise()//.noSpinner();
                //any case write in iframe to display html
                loadingPromise
                    .then(function(resp) {
                        DashboardUtils.setLoaded.bind([$scope, resolve])();
                        $timeout(function() { $scope.displaySnapshot(element, resp.data); });

                        if ($scope.tile.clickAction != 'DO_NOTHING') {
                            // On click on body, redirect event to main-click link
                            $timeout(function() {
                                element.find('iframe')[0].contentWindow._load = function() {
                                    element.find('iframe').contents().find('body').on('click', function(evt) {
                                        if(evt.originalEvent.preventRecursionMarker === 'norec') {
                                            // Prevent event recursion : do not handle this event if we generated it!
                                            return;
                                        }
                                        const cloneEvent = document.createEvent('MouseEvents');
                                        cloneEvent.preventRecursionMarker = 'norec';
                                        const e = evt.originalEvent;
                                        cloneEvent.initMouseEvent(e.type, e.bubbles, e.cancelable, window, e.detail,
                                            e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey,
                                            e.metaKey, e.button, e.relatedTarget);
                                        element.closest('.tile-wrapper').find('[main-click]')[0].dispatchEvent(cloneEvent);
                                        e.stopPropagation();
                                    });
                                }
                            });
                        }
                    }, DashboardUtils.setError.bind([$scope, reject]));
            };

            if ($scope.tile.autoLoad) {
                $scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
            }
        }
    }
});


app.directive('reportInsightView', function($controller) {
    return {
        templateUrl: '/templates/dashboards/insights/code-reports/report_view.html',
        scope: {
            insight: '='
        },
        link: function($scope, element, attrs) {
            $scope.element = element;
            $controller('ReportSnapshotCommonController', {$scope: $scope});

            const loadingPromise = $scope.getLoadingPromise();
            loadingPromise.then(function(resp) {
                $scope.displaySnapshot(element, resp.data);
            }, setErrorInScope.bind($scope));
        }
    };
});


app.directive('reportInsightTileParams', function(){
    return {
        templateUrl: '/templates/dashboards/insights/code-reports/report_tile_params.html',
        scope: {
            tileParams: '='
        },
        link: function($scope, element, attrs){
            //No tile params
        }
    };
});


app.directive('reportInsightCreateForm', function($stateParams, $filter, DataikuAPI){
    return {
        templateUrl: '/templates/dashboards/insights/code-reports/report_create_form.html',
        scope: true,
        link: function($scope, element, attrs) {
            let snapshotsByReportSmartId = {};
            $scope.hook.defaultName = "Rmarkdown report";
            $scope.$watch("hook.sourceObject", function(nv) {
                if (!nv || !nv.label) return;
                $scope.hook.defaultName = nv.label;
            });

            $scope.insight.params.loadLast = true;

            $scope.facade = {
                reportSmartId: null,
                availableSnapshots: [],
                createSnapshot: $scope.canWriteProject()
            };

            function setReport() {
                if (!$scope.facade.reportSmartId) {
                    return;
                }
                $scope.insight.params.reportSmartId = $scope.facade.reportSmartId;
                $scope.facade.availableSnapshots = snapshotsByReportSmartId[$scope.facade.reportSmartId];
            };

            $scope.$watch("facade.reportSmartId", setReport);

            $scope.hook.beforeSave = function(resolve, reject) {
                const snapshot = $scope.facade.snapshot;
                if (snapshot) {
                    const formatNames = getAvailablePreviewFormats(snapshot).map(_ => _.name);
                    if (formatNames.length && !formatNames.includes(params.viewFormat)) {
                        params.viewFormat = formatNames[0];
                    }
                    $scope.insight.params.exportTimestamp = snapshot.timestamp;
                }
                if ($scope.facade.createSnapshot) {
                    DataikuAPI.reports.snapshots.create($stateParams.projectKey, $scope.insight.params.reportSmartId)
                    .success(function(snapshot) {
                        if (!$scope.insight.params.loadLast) {
                            const formatNames = getAvailablePreviewFormats(snapshot).map(_ => _.name);
                            if (formatNames.length && !formatNames.includes(params.viewFormat)) {
                                params.viewFormat = formatNames[0];
                            }
                            $scope.insight.params.exportTimestamp = snapshot.timestamp;
                        }
                        resolve();
                    })
                    .error(function(data, status, headers, config, statusText){
                        reject(arguments);
                    });
                } else {
                    resolve();
                }
            };

            $scope.checkLoadLastAndTimestampConsistency = function() {
                if (!$scope.insight.params.loadLast && !$scope.facade.snapshot && !$scope.facade.createSnapshot) {
                    $scope.newInsightForm.$setValidity('loadLastAndTimestampConsistency', false);
                } else {
                    $scope.newInsightForm.$setValidity('loadLastAndTimestampConsistency', true);
                }
                return true;
            };

            $scope.formatDate = function(timestamp) {
                return $filter('date')(timestamp, 'short');
            };

            $scope.resetTimestamp = function() {
                $scope.insight.params.exportTimestamp = null;
            };

            DataikuAPI.reports.snapshots.listForAll($scope.insight.projectKey).success(function(data) {
                snapshotsByReportSmartId = data;
            }).error($scope.hook.setErrorInModaleScope);
        }
    };
});


app.directive('reportInsightEdit', function($controller, DataikuAPI, FutureProgressModal, $rootScope, Dialogs, RMARKDOWN_PREVIEW_OUTPUT_FORMATS) {
    return {
        templateUrl: '/templates/dashboards/insights/code-reports/report_edit.html',
        scope: {
            insight: '=',
        },
        link: function($scope, element, attrs) {
            $controller('ReportSnapshotCommonController', {$scope});

            function getAvailablePreviewFormats(snapshot) {
                if (!snapshot || !snapshot.availableFormats) {
                    return [];
                }
                return RMARKDOWN_PREVIEW_OUTPUT_FORMATS.filter(f => snapshot.availableFormats.includes(f.name));
            }

            $scope.canWriteProject = $rootScope.topNav.isProjectAnalystRW;

            DataikuAPI.reports.snapshots.list($scope.insight.projectKey, $scope.insight.params.reportSmartId)
                .success(function(snapshots) {
                    $scope.snapshots = snapshots;
                    refresh();
                })
                .error(setErrorInScope.bind($scope));

            function refresh() {
                const params = $scope.insight.params;
                if (!params) {
                    return;
                }
                if (!params.loadLast && !params.exportTimestamp && $scope.snapshots && $scope.snapshots.length) {
                    params.exportTimestamp = $scope.snapshots[0].timestamp;
                }


                $scope.availablePreviewFormats = null;
                if ($scope.snapshots) {
                    if (params.loadLast) {
                        $scope.snapshot = $scope.snapshots[0];
                    } else if (params.exportTimestamp) {
                        $scope.snapshot = $scope.snapshots.find(e => e.timestamp == params.exportTimestamp);
                    }
                    $scope.availablePreviewFormats = getAvailablePreviewFormats($scope.snapshot);
                    const formatNames = $scope.availablePreviewFormats.map(_ => _.name);
                    if (formatNames.length && !formatNames.includes(params.viewFormat)) {
                        params.viewFormat = $scope.availablePreviewFormats[0].name;
                    }
                }
                console.info("Using exportFormat", params.exportFormat);

                const loadingPromise = $scope.getLoadingPromise();
                loadingPromise.then(function(resp) {
                    $scope.displaySnapshot(element, resp.data);
                }, setErrorInScope.bind($scope));
            }

            $scope.$watch("insight.params", refresh, true);

            $scope.createSnapshot = function() {
                const params = $scope.insight.params;
                Dialogs.confirmPositive($scope, "Snapshot report", `Run Rmarkdown?`).then(function() {
                    DataikuAPI.reports.snapshots.create($scope.insight.projectKey, params.reportSmartId)
                    .success(function(data) {
                        FutureProgressModal.show($scope, data, "Building report for snapshot...").then(function(result) {
                            var snapshot = result.snapshot;
                            if (!params.loadLast) {
                                const formatNames = getAvailablePreviewFormats(snapshot).map(_ => _.name);
                                if (formatNames.length && !formatNames.includes(params.viewFormat)) {
                                    params.viewFormat = formatNames[0];
                                }
                                params.exportTimestamp = snapshot.timestamp;
                            }
                            refresh();
                            $scope.snapshots.unshift(snapshot);
                        });
                    }).error(setErrorInScope.bind($scope));
                });
            };
        }
    };
});

})();
