(function() {
'use strict';

const app = angular.module('dataiku.dashboards');

    app.constant("InsightLoadingState", {
        // Insight has registered itself and is waiting for the dashboard/insight-preview component to load it.
        WAITING: 0,

        // Dashboard/insight-preview component has called the promise in loadPromises map and is waiting for the promise to be resolved.
        LOADING: 1,

        // Loading promise has been resolved
        LOADED: 2,

        // Loading promise has been resolved and any additional asynchronous work has also completed.
        COMPLETE: 3
        }
    );

    app.constant("InsightLoadingBehavior", {
            // Once the promise registered in loadPromises has be resolved, the insight is fully loaded.
            NORMAL: undefined,

            // Additional work is needed to fully load the insight once the promise registered in loadPromises has be resolved.
            // The insight will itself change the loading state to COMPLETE asynchronously in `loadStates` map.
            DELAYED_COMPLETE: "DELAYED_COMPLETE",
        }
    );

    app.controller("DashboardViewController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate, Dialogs,$state,$q, TopNav) {
        if (typeof($scope.uiState)==='undefined'){
            $scope.uiState = {};
        }
        $scope.uiState.hideForExport = false;TopNav.setLocation(TopNav.TOP_DASHBOARD, 'dashboards', null, 'view');
        if ($scope.dashboard) {
            TopNav.setPageTitle($scope.dashboard.name + " - Dashboard");
        }
        $scope.$watch("fullScreen", function(nv) {
            let wrapper = $('body')[0];
            if (nv == null) return;

            if (nv) {
                requestFullscreen();
            } else {
                exitFullscreen();
            }
            $state.go($state.current, {fullScreen: (nv && nv != "false") ? true : null}, {location: true, inherit:true, notify:false, reload:false});

            $scope.$on("$destroy", () => {
                exitFullscreen();
            });

            function requestFullscreen() {
                let startFsNames = ['requestFullscreen', 'mozRequestFullScreen', 'webkitRequestFullScreen'];
                executeFirstAvailableFunction(startFsNames, wrapper);
            }

            function exitFullscreen() {
                if (document.fullscreenElement || 
                    document.webkitFullscreenElement || 
                    document.mozFullScreenElement) { // Can't exit fullscreen if there is no element in fullscreen
                        let stopFsNames = ['exitFullscreen', 'cancelFullScreen', 'webkitCancelFullScreen', 'mozCancelFullScreen'];
                        executeFirstAvailableFunction(stopFsNames, document);
                }
            }

            function executeFirstAvailableFunction(functionNames, elmt) {
                for (let i = 0; i < functionNames.length; i++) {
                    if (elmt[functionNames[i]]) {
                        elmt[functionNames[i]]();
                        break;
                    }
                }
            }
        });

        $scope.fullScreen = $stateParams.fullScreen && $stateParams.fullScreen != "false";
    });

app.directive('dashboardZone', function(DataikuAPI, $stateParams, $state) {
    return {
        restrict: 'EA',
        templateUrl: '/templates/dashboards/zone.html',
        replace: true,
        link: function($scope, elements, attrs) {
            $scope.editable = $scope.$eval(attrs.editable);

            $scope.insightsMap = {};
            $scope.insightAccessMap = {};

            if ($scope.dashboard && $scope.dashboard.pages) {
                $scope.dashboard.pages.forEach(function(page) {
                    delete page.$enriched;
                });
            }

            $scope.loadPage = function(pageIdx, forceRefresh, onlyAccessMap) {
                if (!($scope.dashboard.pages[pageIdx] || {}).id) return; // Page has not been saved yet
                if (!$scope.dashboard.pages[pageIdx].$enriched || forceRefresh) {
                    DataikuAPI.dashboards.getEnrichedPage($scope.dashboard.projectKey, $scope.dashboard.id, pageIdx)
                        .success(function(data) {
                            $scope.currentPageIdx = pageIdx;
                            if (!onlyAccessMap) angular.extend($scope.insightsMap, data.insightsData);
                            angular.extend($scope.insightAccessMap, data.insightAccessData);
                            $scope.dashboard.pages[pageIdx].$enriched = true;
                        })
                        .error(setErrorInScope.bind($scope));
                } else {
                    $scope.currentPageIdx = pageIdx;
                }
            };

            $scope.$on("dashboardReaderAccessChanged", function() {
                $scope.loadPage($scope.uiState.currentPageIdx, true, true);
            });

            $scope.$watch("dashboard", function(nv) {
                if (!nv) return;
                if (!$scope.dashboard.pages.length) {
                    $scope.dashboard.pages.push({});
                }

                if ($scope.uiState.currentPageIdx == null) {
                    if ($stateParams.pageId) {
                        $scope.uiState.currentPageIdx = Math.max(getPageIdxById($stateParams.pageId), 0);
                    } else {
                        $scope.uiState.currentPageIdx = 0;
                    }
                } else {
                    updateUrl();
                }

                if ($scope.initialSelectedTile != null) {
                    if ($scope.initialSelectedTile == 'LAST') {
                        $scope.uiState.selectedTile = $scope.dashboard.pages[$scope.uiState.currentPageIdx].grid.tiles[$scope.dashboard.pages[$scope.uiState.currentPageIdx].grid.tiles.length-1];
                    } else {
                        $scope.uiState.selectedTile = $scope.dashboard.pages[$scope.uiState.currentPageIdx].grid.tiles[$scope.initialSelectedTile];
                    }
                    $scope.initialSelectedTile = null;
                }
            });

            $scope.$watch("uiState.currentPageIdx", function(nv) {
                if (nv != null) {
                    $scope.loadPage($scope.uiState.currentPageIdx);
                    updateUrl();
                }
            });

            // On dashboard save
            $scope.$watch("origDashboard", updateUrl);

            function getPageIdxById(pageId) {
                for (var i = 0; i < $scope.dashboard.pages.length; i++) {
                    if ($scope.dashboard.pages[i].id == pageId) {
                        return i;
                    }
                }

                return -1;
            }

            function updateUrl() {
                if ($scope.uiState.currentPageIdx == null) return;
                $state.go($state.current, {pageId: ($scope.dashboard.pages[$scope.uiState.currentPageIdx] || {}).id || $scope.uiState.currentPageIdx}, {
                    location: 'replace',
                    inherit: true,
                    notify: false,
                    reload: false
                });
            }
        }
    }
});

app.directive('dashboardPage', function($timeout, $q, CreateModalFromTemplate, StateUtils, $rootScope, $stateParams, DashboardUtils, ContextualMenu, executeWithInstantDigest, Logger, InsightLoadingState, InsightLoadingBehavior) {
    return {
        restrict: 'EA',
        replace: true,
        templateUrl: '/templates/dashboards/page.html',
        scope: {
            page: '=',
            insightsMap: '=',
            accessMap: '=',
            editable: '=',
            selectedTile: '=',
            showGrid: '=',
            pageIdx: '=',
            dashboard: '=',
            uiState: '=dkuUiState',
            canEditDashboard: '=',
            canModerateDashboards: '='
        },
        link: function(scope, element, attrs) {
            scope.DashboardUtils = DashboardUtils;

                var cancelDeselect;
                if (scope.page && scope.page.grid && scope.page.grid.tiles) {
                	scope.page.grid.tiles.forEach(function(tile) {
                		tile.$added = false;
                	})
                }

                if(scope.page && !scope.page.$lastTileId) scope.page.$lastTileId = 1;
                if (scope.page.grid.tiles.indexOf(scope.selectedTile) == -1) {
                   scope.selectedTile = null;
                }

                /*
                 * Dashboard Export Toolbox
                 */

                scope.dashboardExportToolbox = {
                        checkLoading: function() {
                            return scope.isLoading;
                        },

                        getPageCount: function() {
                            return scope.dashboard.pages.length;
                        },

                        getVerticalBoxesCount: function(pageIndex) {
                            let total = 0;
                            for (let tile of scope.dashboard.pages[pageIndex].grid.tiles) {
                                if (tile.box.top + tile.box.height > total) {
                                    total = tile.box.top + tile.box.height;
                                }
                            }
                            return total;
                        },

                        getTilesCount: function(pageIndex) {
                            let pages = scope.dashboard.pages;
                            return (pageIndex && pageIndex < pages.length) ? pages[pageIndex].grid.tiles.length : 0;
                        },

                        scroll: function(scrolledHeight) {
                            return document.querySelector(".dashboard-export-page-wrapper").scrollTop = scrolledHeight;
                        },

                        getTitleBoundaries: function() {
                            return document.querySelector(".dashboard-export-title").getBoundingClientRect();
                        },

                        getGridBoundaries: function() {
                            return document.querySelector(".dashboard-export-grid").getBoundingClientRect();
                        },

                        clearDashboard: function() {
                            executeWithInstantDigest(_ => scope.uiState.hideForExport = true, scope);
                        },

                        goToFirstPage: function() {
                            executeWithInstantDigest(_ => {
                                if (scope.uiState.currentPageIdx > 0) {
                                    scope.uiState.currentPageIdx = 0;
                                }
                            }, scope);
                        },

                        goToNextPage: function() {
                            scope.isLoading = true;
                            executeWithInstantDigest(_ => {
                                if (scope.uiState.currentPageIdx < scope.dashboard.pages.length - 1) {
                                    scope.uiState.currentPageIdx = scope.uiState.currentPageIdx + 1;
                                }
                            }, scope);
                        },

                        goToPage: function(pageIdx) {
                            scope.isLoading = true;
                            executeWithInstantDigest(_ => {
                                if (scope.uiState.currentPageIdx != pageIdx) {
                                    scope.uiState.currentPageIdx = pageIdx;
                                }
                            }, scope);
                        }
                };

                /*
             * GridList
             */

            scope.addElements = function() {
                scope.$emit("dashboardOpenAddInsightModal");
            };

            scope.getOrSetTileId = function(tile) {
                if (!scope.page.$lastTileId) {
                    scope.page.$lastTileId = 1;
                }
                if (!tile.$tileId) {
                    tile.$tileId = ++scope.page.$lastTileId;
                }
                return tile.$tileId;
            };

            scope.deleteTile = function(tile) {
                var el = $('[data-id=' + tile.$tileId + ']');
                scope.$gridContainer.gridList('deleteItem', $(el));
                scope.syncModels();
                scope.selectedTile = null;
            };

                scope.openMoveCopyTileModal = function(tile) {
                	CreateModalFromTemplate("/templates/dashboards/insights/move-copy-tile-modal.html", scope, "MoveCopyTileModalController", function(newScope) {
                		newScope.dashboard = scope.dashboard;
                		newScope.page = scope.page;
                		newScope.tile = tile;
                		newScope.uiState = scope.uiState;
                		newScope.insight = tile.tileType == "INSIGHT" ? scope.insightsMap[tile.insightId] : null;
                		newScope.insightName = tile.tileType == "INSIGHT" ? newScope.insight.name : tile.title;
                		newScope.insightsMap = scope.insightsMap;

                        newScope.init(newScope.insight, tile.tileParams);
                	});
                };

                scope.syncModels = function() {
                    $timeout(function() {
                    	if (scope.$gridContainer.data('_gridList')) {
                    		var items = scope.$gridContainer.data('_gridList').items;
    	                	var tilesToRemove = [];
    	                    scope.page.grid.tiles.forEach(function(tile) {
    	                        var toRemove = true;
    	                        items.forEach(function(item) {
    	                            if (item.id == tile.$tileId) {
    	                                toRemove = false;
    	                                tile.box.left = item.x;
    	                                tile.box.top = item.y;
    	                                tile.box.width = item.w;
    	                                tile.box.height = item.h;
    	                            }
    	                        });
    	                        if (toRemove) {
    	                            tilesToRemove.push(tile);
    	                        }
    	                    });
    	                    tilesToRemove.forEach(function(tile) {
    	                        var index = scope.page.grid.tiles.indexOf(tile);
    	                        if (index > -1) {
    	                        	scope.page.grid.tiles.splice(index, 1);
    	                        }
    	                    });
                            scope.$emit("dashboardSyncModelsDone");
                    	}
                    }, 0);
                };

                scope.addTileToGridList = function(tile) {
                	$timeout(function() {
                		var el = element.find('[data-id = ' + tile.$tileId + ']');

                    	if (!scope.gridListRenderPromise) {
                    		scope.renderGridList();
                    	}

                    	scope.gridListRenderPromise.then(function() {
                    		if (!isTileInGridList(tile)) {
                    			scope.$gridContainer.gridList('addItem', $(el));
                                tile.$added = true;
                    		}
                            $timeout(scope.syncModels);
                    	}, 0);
                	})
                };

                var isTileInGridList = function(tile) {
                	var items = scope.$gridContainer.data('_gridList').items;
                	for (var i = 0; i < items.length; i++) {
                		if (items.id == tile.$tileId) {
                			return true;
                		}
                	}
                	return false;
                };

                var getTileByElement = function(el) {
                	var tileId = $(el).data("id");
                	for (var i = 0; i< scope.page.grid.tiles.length; i++) {
                		var tile = scope.page.grid.tiles[i];
                		if (tileId == tile.$tileId) {
                			return tile;
                		}
                	}
                }

                scope.gridListRendered = false;
                if (!scope.page || !scope.page.grid || !scope.page.grid.tiles || scope.page.grid.tiles.length == 0) {
                	scope.gridListRendered = true;
                }
                $rootScope.spinnerPosition = "dashboard-page";

            scope.renderGridList = function() {
                scope.gridListRenderPromise = $timeout(function() {
                    scope.$gridContainer = $(element.find('.dashboard-grid').addBack('.dashboard-grid')); //addBack to add self

                    /*
                     * Instantiating gridList
                     */

                    var currentSize = 12;

                    var flashItems = function(items) {
                        // Hack to flash changed items visually
                        for (var i = 0; i < items.length; i++) {
                            (function($element) {
                                $element.addClass('changed')
                                setTimeout(function() {
                                    $element.removeClass('changed');
                                }, 0);
                            })(items[i].$element);
                        }
                    };



                        scope.$on('$destroy', function() {
                            $(window).off('resize.dashboard' );
                        });

                        scope.$gridContainer.gridList(
                    		{
                                lanes: currentSize,
                                onChange: function(changedItems) {
                                    flashItems(changedItems);
                                },
                                direction: "vertical",
                                readOnly: !scope.editable
                            },
                            {
                                start: function(event, ui) {
                                    $(event.target).addClass("dragging");
                                    $timeout(function() {
                                    	var tile = getTileByElement(event.target);
                                        scope.selectTile(tile);
                                        tile.$showOverlay = false;
                                    });
                                },
                                stop: function(event, ui) {
                                    $(event.target).removeClass("dragging");
                                    scope.syncModels();
                                },
                                scroll: true,
                                containment: 'parent'
                            },
                            {
                            	resize: function(event, ui) {
                                	event.stopPropagation();
                                },
                                stop: function(event, ui) {
                                	$timeout(function() {
                                	    angular.element(event.target).scope().$broadcast("resize");
                                        scope.syncModels();
                                        cancelDeselect = false;
                                    }, 200);
                                	cancelDeselect = true;

                            	}
                            }
                        );

                        scope.gridListRendered = true;
                        $rootScope.spinnerPosition = undefined;
                        $rootScope.$broadcast("gridListRendered");

                    });
                };

                scope.isErrorMap = {};
                scope.hook = {
                	loadPromises : {},
                    loadStates: {},
                	isErrorMap : scope.isErrorMap,
                	setErrorInDashboardPageScope : function(data, status, headers, config, statusText) {
                		setErrorInScope.bind(scope)(data, status, headers, config, statusText);
                	},
                    editable: scope.editable
                };

                const nbSimultaneousLoading = $rootScope.appConfig.nbSimultaneousInsightLoading;

                let deferredLoadTileInProgress = false;
                scope.loadTiles = function() {
                    const loadingState = function(tileId) {
                        return (tileId in scope.hook.loadStates) ? scope.hook.loadStates[tileId] : InsightLoadingState.WAITING;
                    };
                    const areAllTilesComplete = function() {
                        return !Object.keys(scope.hook.loadPromises).some(function(tileId) {
                            return loadingState(tileId) !== InsightLoadingState.COMPLETE;
                        });
                    };
                    const getTileLoadingCallback = function(tileId, markComplete = true) {
                		return function() {
                		    // For simple tiles, mark them as fully loaded (i.e. complete). For tiles with delayed
                            // complete events, just mark them as loaded. This way we are still waiting for them but
                            // in the meantime we can load more tiles.
                            if (scope.hook.loadStates[tileId] !== InsightLoadingState.COMPLETE) {
                                scope.hook.loadStates[tileId] = markComplete ? InsightLoadingState.COMPLETE : InsightLoadingState.LOADED;
                            }

                            if (areAllTilesComplete()) {
                                // Finished loading all insights
                                scope.isLoading = false;
                                Logger.info("All dashboard insights have been fully loaded.");
                            } else if (!deferredLoadTileInProgress) {
                                // Finished loading some insights but there are pending ones. Trying to load more.
                                scope.loadTiles();
                            }
                		}
                	};

                	let tilesInsightTypes = {};
                	scope.page.grid.tiles.forEach(function(tile) {
                		tilesInsightTypes[tile.$tileId] = tile.insightType;
                	});

                    // Compute how many tiles we can load given the number of already loading tiles
                    let nbLoading = Object.keys(scope.hook.loadPromises).map(loadingState).filter(function(state){
                        return state === InsightLoadingState.LOADING;
                    }).length;
                    let remainingLoadingSlots = nbSimultaneousLoading - nbLoading;

                    // Build the list of tiles that we should load now.
                    let tilesToLoad = [];
                    Object.keys(scope.hook.loadPromises).filter(function(tileId) {
                        return loadingState(tileId) === InsightLoadingState.WAITING;
                    }).forEach(function(tileId){
                        if (tilesInsightTypes[tileId] in ["chart", "dataset_table"]) { // Load heavy tiles first to load them first.
                            tilesToLoad.push(tileId);
                        } else {
                            tilesToLoad.unshift(tileId);
                        }
                    });
                    // If there are too many loading requests. Only keeping the first ones
                    if (tilesToLoad.length > remainingLoadingSlots) {
                        tilesToLoad.length = remainingLoadingSlots;
                    }

                    if (tilesToLoad.length > 0) {
                        scope.isLoading = true;
                        for (let i in tilesToLoad) {
                            const tileId = tilesToLoad[i];
                            const d = $q.defer();
                            scope.hook.loadStates[tileId] = InsightLoadingState.LOADING;
                            const markComplete = scope.hook.loadPromises[tileId](d.resolve, d.reject) !== InsightLoadingBehavior.DELAYED_COMPLETE;
                            const tileLoadingCallback = getTileLoadingCallback(tileId, markComplete);
                            d.promise.then(tileLoadingCallback, tileLoadingCallback); // Don't try to reload a tile if an error appear the first time for now.
                        }
                    } else {
                        scope.isLoading = !areAllTilesComplete();
                        if (!scope.isLoading) {
                            Logger.info("All dashboard insights have been fully loaded.");
                        } else if (!deferredLoadTileInProgress) {
                            // If there are pending loading insights, call us back later
                            deferredLoadTileInProgress = true;
                            $timeout(function () {
                                deferredLoadTileInProgress = false;
                                scope.loadTiles();
                            }, 1000);
                        }
                    }
                };

                scope.$watch('hook.loadStates', function(nv, ov) {
                	// Waiting for newcomers
                	$timeout(function() {
                        if (!scope.isLoading) {
                            scope.loadTiles();
                        }
                	});
                }, true);

            scope.selectTile = function(tile, evt) {
                if (evt && evt.target.hasAttribute('dashboard-no-select')) return;
                if (scope.selectedTile == tile) {
                    var $tileWrapper = evt ? $(evt.target).closest('.tile-wrapper') : null;
                    if (!evt || (!$tileWrapper.hasClass('ui-draggable-dragging') && !$tileWrapper.hasClass('ui-resizable-resizing'))) {
                        tile.$showOverlay = true;
                    }
                }
                scope.selectedTile = tile;
            };

            scope.toggleTileSelection = function(tile, evt) {
                if (evt && evt.target.hasAttribute('dashboard-no-select')) return;
                if (scope.selectedTile === tile) scope.deselectTile(evt);
                else scope.selectedTile = tile;
            };

            scope.dashboardClicked = function(evt) {
                if (evt && $(evt.target).closest('.tile-wrapper').size() > 0) return;
                scope.deselectTile(evt);
            };

            scope.deselectTile = function(evt) {
                $timeout(function() {
                    if (cancelDeselect) {
                        cancelDeselect = false;
                        return;
                    }
                    scope.selectedTile = null;
                });
            };

            Mousetrap.bind("backspace", function() {
                if (scope.selectedTile) {
                    scope.deleteTile(scope.selectedTile);
                }
            });

            scope.$on("$destroy", function() {
                Mousetrap.unbind("backspace");
            });

            scope.openInsightAccessModal = function(insight) {
                CreateModalFromTemplate("/templates/dashboards/insights/insight-access-warning-modal.html", scope, null, function(newScope) {
                    newScope.initForInsights([insight], false);
                }).then(function(readerAccessChanged) {
                    if (readerAccessChanged) {
                        scope.$emit("dashboardReaderAccessChanged");
                    }
                });
            };

            scope.getTargetHref = function(tile, evt) {
                const insight = scope.insightsMap[tile.insightId];
                if (!insight) {
                    return;
                }
                const options = {};
                const canModerateDashboards = $rootScope.projectSummary && $rootScope.projectSummary.canModerateDashboards;
                if (scope.editable &&
                        DashboardUtils.canEditInsight(insight, canModerateDashboards) &&
                        DashboardUtils.hasEditTab(insight)) {
                    options.tab = 'edit';
                }
                switch (tile.clickAction) {
                case 'DO_NOTHING':
                case 'OPEN_INSIGHT':
                    options.name = insight.name;
                    return StateUtils.href.insight(tile.insightId, $stateParams.projectKey, options);
                case 'OPEN_OTHER_INSIGHT':
                    if (tile.targetInsightId) {
                        const targetInsight = scope.insightsMap[tile.targetInsightId] || {};
                        options.name = targetInsight.name;
                        return StateUtils.href.insight(tile.targetInsightId, $stateParams.projectKey, options);
                    }
                }
            };

            scope.tileMenu = new ContextualMenu({
                template: "/templates/dashboards/tile-contextual-menu.html"
            });

            scope.openTileMenu = function($event, tile) {
                let newScope = scope.$new();
                newScope.tile = angular.copy(tile);
                scope.tileMenu.scope = newScope;
                scope.tileMenu.openAtXY($event.pageX, $event.pageY);
            };
        }
    }
});

    app.directive('gridDisplay', function($timeout) {
        return {
            restrict: 'EA',
            replace: false,
            scope: {
                backgroundColor: '=',
                gridFormat: '=?'
            },
            template: '<div class="fh grid-display" ng-style="displayBackground()"></div>',
            link: function(scope, element, attrs) {
                let shadeColor = function(color, percent) {

                    let R = parseInt(color.substring(1,3),16);
                    let G = parseInt(color.substring(3,5),16);
                    let B = parseInt(color.substring(5,7),16);

                    R = parseInt(R * (100 + percent) / 100);
                    G = parseInt(G * (100 + percent) / 100);
                    B = parseInt(B * (100 + percent) / 100);

                    R = (R<255)?R:255;
                    G = (G<255)?G:255;
                    B = (B<255)?B:255;

                    let RR = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
                    let GG = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
                    let BB = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));

                    return "#"+RR+GG+BB;
                }

                let cellWidth = null;
                let gridColor;
                scope.$watch('backgroundColor', function() {
                    gridColor = scope.backgroundColor ? shadeColor(scope.backgroundColor, +20) : "#F4F4F4";
                });

                scope.displayBackground = function() {
                    if (cellWidth != null) {
                        if (scope.gridFormat == null) {
                            return {
                                'background': 'repeating-linear-gradient(180deg, ' + gridColor + ', '+ gridColor + ' 5px, transparent 6px, transparent ' + (cellWidth - 1) + 'px, ' + gridColor + ' ' + cellWidth + 'px),' +
                                'repeating-linear-gradient(90deg, ' + gridColor + ', '+ gridColor + ' 5px, transparent 6px, transparent ' + (cellWidth - 1) + 'px, ' + gridColor + ' ' + cellWidth + 'px)',
                                'width': (12*cellWidth + 5)+ 'px'
                            }
                        } else {
                            return {
                                'background': 'repeating-linear-gradient(180deg, ' + gridColor + ', '+ gridColor + ' 5px, transparent 5px, transparent ' + scope.gridFormat.numberBoxY*cellWidth + 'px),' +
                                'repeating-linear-gradient(90deg, ' + gridColor + ', '+ gridColor + ' 5px, transparent 5px, transparent ' + scope.gridFormat.numberBoxX*cellWidth + 'px)',
                                'width': (12*cellWidth + 5)+ 'px'
                            }
                        }
                    }
                }

                let dashboardGrid = angular.element(document).find('.dashboard-grid');
                scope.$on("gridListRendered", function() {
                    cellWidth = $(dashboardGrid).data('_gridList')._cellWidth
                });

                let resizeTimer;
                let resizeCallback = function() {
                    let customEvent = new Event('resize');
                    customEvent.data = {propagate: true};
                    window.dispatchEvent(customEvent);
                    dashboardGrid.gridList('reflow');
                    resizeTimer = null;
                };

                // We need to delay the window.resize event by 250ms so that the css animation on tiles width/height is done and the tile contents are drawn with the right dimensions
                $(window).on('resize.dashboard', function(event) {
                    if (!event.originalEvent || !event.originalEvent.data || !event.originalEvent.data.propagate) {
                        dashboardGrid.gridList('reflow');
                        cellWidth = $(dashboardGrid).data('_gridList')._cellWidth;
                        event.stopPropagation();
                        event.stopImmediatePropagation();

                        if (resizeTimer) {
                            $timeout.cancel(resizeTimer);
                        }
                        resizeTimer = $timeout(resizeCallback, 250);
                    }
                });
            }
        }
    });app.directive('dashboardTile', function($stateParams, TileUtils){
        return {
            restrict: 'EA',
            templateUrl: '/templates/dashboards/tile.html',
            scope: {
                tile: '=',
                insight: '=',
                editable: '=',
                hook: '='
            },
            link: function($scope, element, attrs){
                $scope.$stateParams = $stateParams;

            $scope.openUploadPictureDialog = TileUtils.openUploadPictureDialog;

            $scope.getResizeImageClass = function(resizeImageMode) { //convert mode to css class name
                switch (resizeImageMode)
                {
                    case 'STRETCH_SIZE': return 'stretch-size';
                    case 'ORIG_SIZE': return 'orig-size';
                    case 'FIT_CROP_SIZE': return 'fit-crop-size';
                    default: return 'fit-size';
                }

            }
        }
    };
});


app.directive('dashboardMiniature', function($stateParams) {
    return {
        restrict: 'EA',
        templateUrl: '/templates/dashboards/dashboard-miniature.html',
        scope: {
            dashboard: '=',
            pageIdx: '='
        },
        link: function($scope, element, attrs) {
            $scope.tiles = $scope.dashboard.pages[$scope.pageIdx || 0].grid.tiles;

            $scope.$watch("dashboard", function () {
                $scope.tiles = $scope.dashboard.pages[$scope.pageIdx || 0].grid.tiles;
            });

            $scope.$watch("tiles", function () {
                var cells = [];

                var numCols = 12;
                var numRows = d3.max($scope.tiles, function (d) {
                    return d.box.top + d.box.height;
                });

                for (var i = 0; i < numRows; i++) {
                    cells[i] = [];
                    for (var j = 0; j < numCols; j++) {
                        cells[i][j] = "filler";
                    }
                }

                $scope.tiles.forEach(function (tile) {
                    var box = tile.box;
                    if (box.top == -1 || box.left == -1 || box.top == null || box.left == null || box.height == null || box.width == null) return;

                    cells[box.top][box.left] = tile;

                    for (var i = box.top; i < box.top + box.height; i++) {
                        for (var j = box.left; j < box.left + box.width; j++) {
                            if (i == box.top && j == box.left) continue;
                            cells[i][j] = false;
                        }
                    }
                });

                $scope.cells = cells;
            }, true);
        }
    };
});

})();
