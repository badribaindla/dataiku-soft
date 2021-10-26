(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards.insights');

    app.constant("JupyterInsightHandler", {
        name: "Notebook",
        desc: "Code analysis",
        icon: 'icon-dku-nav_notebook',
        color: 'notebook',

        getSourceId: function(insight) {
            return insight.params.notebookSmartName;
        },
        sourceType: 'JUPYTER_NOTEBOOK',
        hasEditTab: false,
        defaultTileParams: {
            showCode: false
        },
        defaultTileDimensions: [4, 5]
    });

    app.controller('JupyterInsightCommonController', function($scope, DataikuAPI, $stateParams, $timeout) {

    	$scope.getLoadingPromise = function() {
        	if ($scope.insight.params.loadLast) {
        		return DataikuAPI.jupyterNotebooks.export.getLast($scope.insight.projectKey, $scope.insight.params.notebookSmartName);
        	} else {
        		return DataikuAPI.jupyterNotebooks.export.get($scope.insight.projectKey, $scope.insight.params.notebookSmartName, $scope.insight.params.exportTimestamp);
        	}
    	};

    	$scope.displayExport = function(element, html, showCode, pointer) {
    		if (html) {
    			$scope.exportNotFound = false;
            	$timeout(function() {
                	showHTML(element, html, showCode, pointer);
                }, 0);
            } else {
            	$scope.exportNotFound = true;
            }
    	}

    	var showHTML = function(element, html, showCode, pointer) {
            var $iframe = element.find('iframe'), iframe = $iframe[0], $parent = $iframe.parent();
            if (iframe && (iframe.document || iframe.contentDocument)) {
            	var doc = iframe.document || iframe.contentDocument;
                doc.open();
                if (showCode != null) {
                    html = html.replace("<a id='toggleCode' onclick='toggleCodeVisibility()'>Show code</a>", "");
                    if (showCode) {
                        html = html.replace('<body class="hideCode">', '<body>');
                    } else {
                        html = html.replace('<body>', '<body class="hideCode">');
                    }

                    if (pointer) {
                        html = html.replace('<body', '<body style="cursor: pointer;" onload="_load()"');
                    }
                }
                html = html.replace("</body>", "<style>div.output_subarea { max-width: none; } ::-webkit-scrollbar { -webkit-appearance: none; width: 5px; height: 7px; } ::-webkit-scrollbar-thumb { border-radius: 4px; background-color: rgba(0,0,0,.4); box-shadow: 0 0 1px rgba(255,255,255,.5); }</style></body>")
                doc.writeln(html);
                doc.close();
            }
    	}

    });

    app.directive('jupyterInsightTile', function($stateParams, $timeout, DataikuAPI, $controller, DashboardUtils, InsightLoadingState){
        return {
            templateUrl: '/templates/dashboards/insights/jupyter/jupyter_tile.html',
            scope: {
                insight: '=',
                tile: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
            	$controller('JupyterInsightCommonController', {$scope: $scope});

                var html;

                $scope.loaded = false;
            	$scope.loading = false;
                $scope.error = null;
                $scope.load = function(resolve, reject) {
                	$scope.loading = true;
                	var loadingPromise = $scope.getLoadingPromise().noSpinner();
                	//any case write in iframe to display html
                	loadingPromise
                        .success(DashboardUtils.setLoaded.bind([$scope, resolve]))
                        .success(function(data) {
                            html = data.html; $scope.displayExport(element, html, !!$scope.tile.tileParams.showCode, $scope.tile.clickAction != 'DO_NOTHING');

                            if ($scope.tile.clickAction != 'DO_NOTHING') {
                                // On click on body, redirect event to main-click link
                                $timeout(function() {
                                    element.find('iframe')[0].contentWindow._load = function() {
                                        element.find('iframe').contents().find('body').on('click', function(evt) {
                                            if(evt.originalEvent.preventRecursionMarker === 'norec') {
                                                // Prevent event recursion : do not handle this event if we generated it!
                                                return;
                                            }
                                            var cloneEvent = document.createEvent('MouseEvents');
                                            cloneEvent.preventRecursionMarker = 'norec';
                                            var e = evt.originalEvent;
                                            cloneEvent.initMouseEvent(e.type, e.bubbles, e.cancelable, window, e.detail,
                                                e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey,
                                                e.metaKey, e.button, e.relatedTarget);
                                            element.closest('.tile-wrapper').find('[main-click]')[0].dispatchEvent(cloneEvent);
                                            e.stopPropagation();
                                        });
                                    }
                                });
                            }
                        })
                        .error(DashboardUtils.setError.bind([$scope, reject]));
                };

                if ($scope.tile.autoLoad) {
                	$scope.hook.loadPromises[$scope.tile.$tileId] = $scope.load;
                    $scope.hook.loadStates[$scope.tile.$tileId] = InsightLoadingState.WAITING;
                }

                $scope.$watch("tile.tileParams.showCode", function (nv) {
                    if (nv == null || !$scope.loaded) return;
                    $scope.displayExport(element, html, !!nv);
                });
            }
        };
    });

    app.directive('jupyterInsightView', function($controller){
        return {
            templateUrl: '/templates/dashboards/insights/jupyter/jupyter_view.html',
            scope: {
                insight: '=',
                tileParams: '='
            },
            link: function($scope, element, attrs) {
                $controller('JupyterInsightCommonController', {$scope: $scope});

                var loadingPromise = $scope.getLoadingPromise();
            	//any case write in iframe to display html
            	loadingPromise.success(function(data) {
            		$scope.displayExport(element, data.html);
            	}).error(function(data, status, headers, config, statusText) {
                	setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                });

            }
        };
    });

    app.directive('jupyterInsightTileParams', function(){
        return {
            templateUrl: '/templates/dashboards/insights/jupyter/jupyter_tile_params.html',
            scope: {
                tileParams: '='
            },
            link: function($scope, element, attrs){
            }
        };
    });


    app.directive('jupyterInsightCreateForm', function(DataikuAPI, $filter, $stateParams){
        return {
            templateUrl: '/templates/dashboards/insights/jupyter/jupyter_create_form.html',
            scope: true,
            link: function($scope, element, attrs){

                $scope.hook.defaultName = "Jupyter notebook";
                $scope.$watch("hook.sourceObject", function(nv) {
                    if (!nv || !nv.label) return;
                    $scope.hook.defaultName = nv.label;
                });

            	$scope.insight.params.loadLast = true;

                $scope.facade = {
            		notebookSmartName : null,
                    availableExports : [],
                    createExport : $scope.canWriteProject()
                };

                $scope.setNotebook = function() {
                    if (!$scope.facade.notebookSmartName) return;
                	$scope.insight.params.notebookSmartName = $scope.facade.notebookSmartName;
                	$scope.facade.availableExports = $scope.notebookToExportsMap[$scope.facade.notebookSmartName];
                };

                $scope.$watch("facade.notebookSmartName", $scope.setNotebook);

                $scope.hook.beforeSave = function(resolve, reject) {
                	if ($scope.facade.createExport) {
                		DataikuAPI.jupyterNotebooks.export.create($stateParams.projectKey, $scope.insight.params.notebookSmartName)
                		.success(function(data) {
                			if (!$scope.insight.params.loadLast) {
                				$scope.insight.params.exportTimestamp = data.timestamp;
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
                	if (!$scope.insight.params.loadLast && !$scope.insight.params.exportTimestamp && !$scope.facade.createExport) {
                		$scope.newInsightForm.$setValidity('loadLastAndTimestampConsistency',false);
                	} else {
                		$scope.newInsightForm.$setValidity('loadLastAndTimestampConsistency',true);
                	}
                	return true;
                };

                $scope.formatDate = function(timestamp) {
                	return $filter('date')(timestamp, 'short');
                };

                $scope.resetTimestamp = function() {
                	$scope.insight.params.exportTimestamp = null;
                };

                DataikuAPI.jupyterNotebooks.mapNotebooksToExports($scope.insight.projectKey).success(function(data) {
                    $scope.notebookMap = data.first;
                    $scope.notebookToExportsMap = data.second;
                }).error($scope.hook.setErrorInModaleScope);
            }
        };
    });

    app.directive('jupyterInsightEdit', function($controller, DataikuAPI, $rootScope, Dialogs){
        return {
            templateUrl: '/templates/dashboards/insights/jupyter/jupyter_edit.html',
            scope: {
                insight: '=',
            },
            link: function($scope, element, attrs) {
                $controller('JupyterInsightCommonController', {$scope: $scope});

                $scope.canWriteProject = $rootScope.topNav.isProjectAnalystRW;

                DataikuAPI.jupyterNotebooks.export.list($scope.insight.projectKey, $scope.insight.params.notebookSmartName).success(function(data) {
                    $scope.exports = data;
                });

                function refresh() {
                    if (!$scope.insight.params) return;
                    if (!$scope.insight.params.loadLast && !$scope.insight.params.exportTimestamp) {
                        $scope.insight.params.exportTimestamp = $scope.exports[0].timestamp;
                    }

                    var loadingPromise = $scope.getLoadingPromise();
                    //any case write in iframe to display html
                    loadingPromise.success(function(data) {
                        $scope.displayExport(element, data.html);
                    }).error(function(data, status, headers, config, statusText) {
                        setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                    });
                }

                $scope.$watch("insight.params", refresh, true);

                $scope.createNewExport = function() {
                    Dialogs.confirmPositive($scope, "Export Jupyter notebook",
                        "Create a new export of this Jupyter notebook? Note that it will not rerun the code of this notebook "+
                        "and will use the last saved state. To rerun the notebook, go to the notebook or use a DSS scenario").then(function(){
                        DataikuAPI.jupyterNotebooks.export.create($scope.insight.projectKey, $scope.insight.params.notebookSmartName)
                            .success(function(data) {
                                if (!$scope.insight.params.loadLast) {
                                    $scope.insight.params.exportTimestamp = data.timestamp;
                                }
                                refresh();
                                $scope.exports.unshift(data);
                            }).error(function(data, status, headers, config, statusText) {
                                setErrorInScope.bind($scope)(data, status, headers, config, statusText);
                            });
                    });
                }
            }
        };
    });

})();
