(function(){
    'use strict';

    var app = angular.module('dataiku.dashboards');

    app.factory("TileUtils", function(DashboardUtils, CreateModalFromTemplate, $rootScope, $stateParams) {

        var getDefaultShowTitleMode = function(insight) {
            return DashboardUtils.getInsightHandler(insight.type).defaultTileShowTitleMode || 'YES';
        };

        var getDefaultTileParams = function(insight) {
            switch(insight.type) {
                case 'text':
                    return {
                    textAlign: 'LEFT'
                };
                case 'image':
                case 'iframe':
                    return {};
                default:
                    var handler = DashboardUtils.getInsightHandler(insight.type);
                    if (handler.getDefaultTileParams) {
                        return handler.getDefaultTileParams(insight);
                    }
                    return angular.copy(handler.defaultTileParams || {});
            }
        };

        var getDefaultTileBox = function(insight) {
            var dimensions;
            switch (insight.type) {
                case 'text':
                    dimensions = [2, 2];
                    break;
                case 'image':
                    dimensions = [3, 3];
                    break;
                case 'iframe':
                    dimensions = [6, 4];
                    break;
                default:
                    var handler = DashboardUtils.getInsightHandler(insight.type);
                    if (handler.getDefaultTileDimensions) {
                        dimensions = handler.getDefaultTileDimensions(insight);
                    } else {
                        dimensions = handler.defaultTileDimensions || [3, 3];
                    }
            }

            return { width: dimensions[0], height: dimensions[1] };
        };

        var openUploadPictureDialog = function(tile) {
            CreateModalFromTemplate(
                "/templates/widgets/image-uploader-dialog.html",
                $rootScope,
                null,
                function(newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.objectType = 'DASHBOARD_TILE';
                    newScope.objectId = tile.imageId
                },
            "image-uploader-dialog")
            .then(function(id) { tile.imageId = id; });
        };

        // TODO @dashboards move to insight handlers
        var getDefaultTileClickAction = function(insight) {
            switch (insight.type) {
                case 'chart':
                case 'dataset_table':
                case 'metrics':
                case 'scenario_last_runs':
                case 'eda':
                    return 'OPEN_INSIGHT';
                default:
                    return 'DO_NOTHING';
            }
        };

        var copyNonInsightTile = function(tile) {
            if (tile.tileType != 'INSIGHT') {
                var copy = angular.copy(tile);
                copy.box.left = -1;
                copy.box.top = -1;
                copy.clickAction = 'DO_NOTHING';
                return copy;
            }
        }

        return {
            newInsightTile : function(insight) {
                return {
                    tileType: 'INSIGHT',
                    insightId: insight.id,
                    insightType: insight.type,
                    tileParams: getDefaultTileParams(insight),
                    displayMode: 'INSIGHT',
                    box: getDefaultTileBox(insight),
                    clickAction: getDefaultTileClickAction(insight),
                    showTitle: getDefaultShowTitleMode(insight),
                    resizeImageMode: "FIT_SIZE",
                    autoLoad: true
                }
            },
            getDefaultTileParams : getDefaultTileParams,
            getDefaultTileBox : getDefaultTileBox,
            getDefaultTileClickAction: getDefaultTileClickAction,
            openUploadPictureDialog: openUploadPictureDialog,
            copyNonInsightTile: copyNonInsightTile
        }
    });

    app.controller("DashboardEditController", function($scope, $controller, $stateParams, $state, $q, $timeout,
        DataikuAPI, CreateModalFromTemplate, Dialogs, TopNav, INSIGHT_TYPES, TileUtils, ActivityIndicator, DashboardUtils, GRAPHIC_EXPORT_OPTIONS) {
        TopNav.setLocation(TopNav.TOP_DASHBOARD, 'dashboards', null, 'edit');
        if ($scope.dashboard) {
            TopNav.setPageTitle($scope.dashboard.name + " - Dashboard");
        }

        $scope.insightTypes = INSIGHT_TYPES;
        $scope.gridFormats = GRAPHIC_EXPORT_OPTIONS.fileFormats;

        Dialogs.saveChangesBeforeLeaving($scope, $scope.isDirty, $scope.saveDashboard, $scope.revertChanges, 'This dashboard has unsaved changes.');
        Dialogs.checkChangesBeforeLeaving($scope, $scope.isDirty);

        /*
        DataikuAPI.dashboards.insights.listWithAccessState($stateParams.projectKey)
            .success(function(data) {
                $scope.insights = data.insights;
                $scope.insightAccessMap = angular.extend($scope.insightAccessMap, data.insightAccessData);
            }).error(setErrorInScope.bind($scope));
         */

        $scope.$on("dashboardSyncModelsDone", function() {
            var insightIdList = [];
            $scope.dashboard.pages.forEach(function(page) {
                page.grid.tiles.forEach(function(tile) {
                    if (insightIdList.indexOf(tile.insightId) == -1) {
                        insightIdList.push(tile.insightId);
                    }
                })
            });
            Object.keys($scope.insightsMap).forEach(function(insightId) {
                if (insightIdList.indexOf(insightId) == -1) {
                    delete $scope.insightsMap[insightId];
                }
            })
        });

        $scope.createNewInsight = function() {
            CreateModalFromTemplate("/templates/dashboards/insights/new-insight-modal.html", $scope, "NewInsightModalController", function(modalScope) {
                modalScope.withSimpleTiles = true;
                modalScope.inDashboard = true;
                modalScope.pointerMode = {isPointerMode: false};
                modalScope.setDashboardCreationId($scope.dashboard.id);
                modalScope.addToDashboard = function(insight) {
                    if (!modalScope.pointerMode.isPointerMode) {
                        DataikuAPI.dashboards.insights.copy($scope.dashboard.projectKey, [insight.id], [insight.name], $scope.dashboard.id)
                        .error(setErrorInScope.bind($scope))
                        .success(function (data) {
                            var insightCopy = data[0];
                            $scope.insightsMap[insightCopy.id] = insightCopy;
                            $scope.addInsightToPage(insightCopy);
                            ActivityIndicator.success("Added");
                        });
                    } else {
                        $scope.addInsightToPage(insight);
                        ActivityIndicator.success("Added");
                    }
                };
                modalScope.isInsightInDashboard = function(insight) {
                    return typeof($scope.insightsMap[insight.id]) !== "undefined";
                };
            }).then(function(ret) {
                if (ret.tileType) { // simple tile
                    $scope.addSimpleTileToPage(ret.tileType);
                } else {
                    if (DashboardUtils.getInsightHandler(ret.insight.type).goToEditAfterCreation) {
                        $scope.$on("dashboardSyncModelsDone", function() {
                            $scope.saveDashboard().success(function() {
                                $timeout(function() {
                                    $state.go("projects.project.dashboards.insights.insight.edit", {insightId: ret.insight.id, insightName: ret.insight.name});
                                });
                            });
                        });
                    }

                    $scope.insightsMap[ret.insight.id] = ret.insight;
                    $scope.insightAccessMap[ret.insight.id] = ret.insight.isReaderAccessible ? 'READER' : 'ANALYST';
                    $scope.addInsightToPage(ret.insight);
                }
            });
        };

        $scope.$on("dashboardOpenAddInsightModal", $scope.createNewInsight);

        $scope.addInsightToPage = function(insight) {
            if (!$scope.insightsMap[insight.id]) {
                $scope.insightsMap[insight.id] = insight;
            }
            $scope.addTileToPage(TileUtils.newInsightTile(insight));
        };

        $scope.addTextTileToPage = function() {
            $scope.addTileToPage({
                tileType: 'TEXT',
                tileParams: TileUtils.getDefaultTileParams({type: 'text'}),
                box: TileUtils.getDefaultTileBox({type: 'text'}),
                showTitle: 'NO'
            });
        };

        $scope.addSimpleTileToPage = function(type) {
            var tile = {
                tileType: type.toUpperCase(),
                tileParams: TileUtils.getDefaultTileParams({type: type.toLowerCase()}),
                box: TileUtils.getDefaultTileBox({type: type.toLowerCase()})
            };

            if (type.toUpperCase() == 'IMAGE') {
                tile.displayMode = 'IMAGE';
                tile.showTitle = 'MOUSEOVER';
                tile.resizeImageMode = 'FIT_SIZE';
            } else {
                tile.showTitle = 'NO'
            }

            $scope.addTileToPage(tile);
        };


        $scope.createPage = function() {
            var page = {
                grid: {
                    tiles: []
                }
            };
            $scope.dashboard.pages.push(page);
            $scope.uiState.currentPageIdx = $scope.dashboard.pages.length - 1;
            $scope.uiState.activeTab = 'slide';
        };

        $scope.removePage = function(pageIdx) {
            $scope.dashboard.pages.splice(pageIdx, 1);
            if ($scope.dashboard.pages.length == 0) {
                $scope.createPage();
            }
            $scope.uiState.currentPageIdx = Math.min($scope.uiState.currentPageIdx, $scope.dashboard.pages.length-1);
        };

        $scope.openCopySlideModal = function(pageIdx) {
            CreateModalFromTemplate("/templates/dashboards/copy-page-modal.html", $scope, "CopyPageController", function(newScope) {
                newScope.pages = $scope.dashboard.pages;
                newScope.page = $scope.dashboard.pages[pageIdx];
                newScope.pageIdx = pageIdx;
                newScope.uiState = $scope.uiState;
                newScope.insightsMap = $scope.insightsMap;
                newScope.init();
            });
        };

        function onSortUpdated(evt, ui) {
            var prevIdx = ui.item.sortable.index, newIdx = ui.item.index();
            if (prevIdx == $scope.uiState.currentPageIdx) {
                $scope.uiState.currentPageIdx = ui.item.index();
            } else if (prevIdx < $scope.uiState.currentPageIdx && newIdx >= $scope.uiState.currentPageIdx) {
                $scope.uiState.currentPageIdx--;
            } else if (prevIdx > $scope.uiState.currentPageIdx && newIdx <= $scope.uiState.currentPageIdx) {
                $scope.uiState.currentPageIdx++;
            }
        }

        $scope.pageSortOptions = {
            axis:'x',
            cursor: 'move',
            update: onSortUpdated,
            handle: '.dashboard-slide-tab__content',
            items:'> .dashboard-slide-tab'
        };

        $scope.addTileToPage = function(tile) {
            $scope.dashboard.pages[$scope.uiState.currentPageIdx].grid.tiles.push(tile);
            $scope.uiState.selectedTile = tile;
        };

        $scope.$watch('uiState.selectedTile', function(nv) {
            if (nv == null) {
                if ($scope.uiState.activeTab == 'tile' && $scope.uiState.previousActiveTab) {
                    $scope.uiState.activeTab = $scope.uiState.previousActiveTab;
                }
            } else {
                if ($scope.uiState.activeTab != 'tile') {
                    $scope.uiState.previousActiveTab = $scope.uiState.activeTab;
                    $scope.uiState.activeTab = 'tile';
                }
            }
        });

        // Save dashboard on first gridListRendered to avoid dirty state caused by tile box initializations after publishing from object
        var unregister = $scope.$on("gridListRendered", function() {
            unregister();
            $timeout($scope.saveDashboard);
        });

        $scope.getPageTitle = function(page) {
            return page.title ? page.title : 'Slide ' + ($scope.dashboard.pages.indexOf(page) + 1);
        }

        $scope.$on('$destroy', $scope.resetInitialSelectedTile);

    });

    app.controller("CopyPageController", function($scope, DataikuAPI, $timeout, StateUtils) {

        $scope.pointerMode = false;

        // b/c when this function is called, CreateModalFromTemplate callback is not executed yet, therefore $scope.page does not exist yet.
        $scope.init = function() {
            $scope.copyPageName = $scope.page.title || 'Slide ' + ($scope.pageIdx + 1);
            $scope.copyPageName += " - COPY";

            DataikuAPI.dashboards.listEditable($scope.dashboard.projectKey, $scope.dashboard.id)
            .error(setErrorInScope.bind($scope))
            .success(function (data) {
                $scope.dashboards = data.dashboards;
                for (var i=0; i<$scope.dashboards.length; i++) {
                    var d = $scope.dashboards[i];
                    if (d.id == $scope.dashboard.id) {
                        $scope.targetedDashboard = d;
                        break;
                    }
                }
            });
        };

        $scope.copyPage = function() {
            var copyPageFront = function(insights) {
                var newPage = angular.copy($scope.dashboard.pages[$scope.pageIdx]);
                newPage.title = $scope.copyPageName;
                newPage.id = null;
                if (insights) {
                    newPage.grid.tiles.forEach(function(tile) {
                        if (tile.tileType == "INSIGHT") {
                            var insight = insights.shift();
                            tile.insightId = insight.id;
                        }
                    });
                }
                $scope.pages.splice($scope.pageIdx + 1, 0, newPage);
                $scope.uiState.currentPageIdx = $scope.pageIdx+1;
            }

            const tgt = $scope.targetedDashboard;

            if (tgt.id == $scope.dashboard.id) {
                if (!$scope.pointerMode) {
                    var insightIds = [];
                    var insightNames = [];
                    $scope.page.grid.tiles.forEach(function(tile) {
                        if (tile.tileType == "INSIGHT") {
                            insightIds.push(tile.insightId);
                            insightNames.push($scope.insightsMap[tile.insightId].name);
                        }
                    });
                    DataikuAPI.dashboards.insights.copy($scope.dashboard.projectKey, insightIds, insightNames, $scope.dashboard.id)
                    .error(setErrorInScope.bind($scope))
                    .success(function (data) {
                        data.forEach(function(insight) {
                            $scope.insightsMap[insight.id] = insight;
                        });
                        copyPageFront(data);
                        $scope.dismiss();
                    });
                } else {
                    copyPageFront();
                    $scope.dismiss();
                }
            } else {
                DataikuAPI.dashboards.copyPage($scope.dashboard.projectKey, $scope.dashboard.id, $scope.page, tgt.id, $scope.copyPageName, $scope.pointerMode)
                    .error(setErrorInScope.bind($scope))
                    .success(function (data) {
                        $timeout(function() {
                            StateUtils.go.dashboard(tgt.id, tgt.projectKey, {name: tgt.name, tab: 'edit', pageId: data});
                        });
                        $scope.dismiss();
                    });
            }
        }
    });

    app.directive('dashboardTileParams', function($stateParams, $controller, DashboardUtils, $timeout, TileUtils) {
        return {
            restrict: 'EA',
            templateUrl: '/templates/dashboards/tile-params.html',
            scope: {
                tile: '=',
                insight: '=',
                canModerateDashboards: '='
            },
            link: function($scope, $element) {
                $scope.$stateParams = $stateParams;
                $scope.getDefaultTileTitle = getDefaultTileTitle;
                $scope.canEditInsight = function(insight) { return DashboardUtils.canEditInsight(insight, $scope.canModerateDashboards); };
                $scope.DashboardUtils = DashboardUtils;

                $scope.feelIfEmpty = function() {
                    if (!$scope.tile.title) {
                        $scope.tile.title = getDefaultTileTitle($scope.tile, $scope.insight);
                    }
                };

                $scope.emptyIfUnchanged = function() {
                    if ($scope.tile.title == getDefaultTileTitle($scope.tile, $scope.insight)) {
                        delete $scope.tile.title;
                    }
                };

                $scope.$watch("tile.insightType", function() {
                    $timeout(function() {
                        $element.find('select.display-mode-select').selectpicker('refresh');
                    });
                });

                $scope.openUploadPictureDialog = TileUtils.openUploadPictureDialog;

                $scope.deleteTileBorderColor = function() {
                    delete $scope.tile.borderColor;
                }
            }
        }
    });


    app.controller("NewDashboardModalController", function($scope, $controller, $stateParams, DataikuAPI) {
        $scope.dashboard = {
                projectKey: $stateParams.projectKey,
                owner: $scope.appConfig.user.login
        };

        $scope.create = function() {
            $scope.dashboard.name = $scope.dashboard.name || ($scope.appConfig.user.displayName + "'s dashboard");
            DataikuAPI.dashboards.save($scope.dashboard).success(function (dashboard) {
                $scope.dashboard = dashboard;
                $scope.resolveModal($scope.dashboard);
            }).error(setErrorInScope.bind($scope));
        };
    });


    app.controller("CopyDashboardModalController", function($scope, DataikuAPI, ActivityIndicator, StateUtils) {
        $scope.init = function(dashboard) {
            $scope.dashboard = dashboard;
            $scope.dashboard.newName = "Copy of " + dashboard.name;
            $scope.pointerMode = false;
        };

        $scope.copy = function() {
            DataikuAPI.dashboards.copy($scope.dashboard.projectKey, $scope.dashboard.id, $scope.dashboard.newName, !$scope.pointerMode)
                .error(setErrorInScope.bind($scope))
                .success(function (data) {
                    ActivityIndicator.success( $scope.dashboard.name + " copied into " + data.name + ", <a href='" + StateUtils.href.dashboard(data.id, data.projectKey, {name: data.name}) + "' >view dashboard</a>.", 5000);
                    $scope.resolveModal();
                });
        }
    });

    app.directive('dashboardExportForm', function(GRAPHIC_EXPORT_OPTIONS, WT1, GraphicImportService) {
        return {
            replace: false,
            require: '^form',
            restrict: 'EA',
            scope: {
                params: '=',
                origin: '@origin',
                pageIdx: '=?'
            },
            templateUrl: '/templates/dashboards/export-form.html',
            link: function($scope, element, attrs, formCtrl) {
                WT1.event("dashboard-export-form-displayed", {});

                let gridOrWindowWidth = function () {
                    if (document.querySelector(".dashboard-export-grid") != null) {
                        // Add css margin of 5 and 5 for each side
                        return Math.round(Math.max(960, document.querySelector(".dashboard-export-grid").getBoundingClientRect().width + 10));
                    } else {
                        return Math.round(Math.max(960, window.outerWidth));
                    }
                };

                $scope.exportFormController = formCtrl;
                // Utilities that give us all the choices possible
                $scope.paperSizeMap = GRAPHIC_EXPORT_OPTIONS.paperSizeMap;
                $scope.orientationMap = GRAPHIC_EXPORT_OPTIONS.orientationMap;
                $scope.fileTypes = GRAPHIC_EXPORT_OPTIONS.fileTypes;

                $scope.minResW = 960;
                $scope.minResH = 540;
                $scope.maxResW = 7200;
                $scope.maxResH = 10000;
                $scope.selectedDashboard = {};

                // Parameters of the export
                if (angular.isUndefined($scope.params.exportFormat)) {
                    $scope.params.exportFormat = {
                        paperSize: "A4",
                        orientation: "LANDSCAPE",
                        fileType: "PDF",
                        width: ($scope.origin == 'modal') ? gridOrWindowWidth("LANDSCAPE") : 1920
                    };
                    $scope.params.exportFormat.height = GraphicImportService.computeHeight($scope.params.exportFormat.width, $scope.params.exportFormat.paperSize);
                }

                $scope.$watch('params.exportFormat.paperSize', function (newVal, oldVal) {
                    if (newVal !== oldVal) {
                        if (newVal != 'CUSTOM') {
                            $scope.params.exportFormat.width = ($scope.origin == 'modal') ? gridOrWindowWidth() :
                                $scope.params.exportFormat.orientation == "PORTRAIT" ? 1080 : 1920;
                            $scope.params.exportFormat.height = GraphicImportService.computeHeight($scope.params.exportFormat.width, $scope.params.exportFormat.paperSize, $scope.params.exportFormat.orientation);
                        }
                    }
                });
            }
        }
    });

    app.controller("ExportDashboardModalController", function($scope, DataikuAPI, ActivityIndicator, FutureProgressModal, WT1) {
        $scope.init = function (selection, massExport) {
            // Selection can correspond to multiple dashboards or a single dashboard
            $scope.params = {};

            if (massExport == true) {
                if ($scope.selection.selectedObjects.length > 0) {
                    $scope.projectKey = $scope.selection.selectedObjects[0].projectKey;
                } else {
                    $scope.projectKey = null;
                }
                $scope.params.dashboards = $scope.selection.selectedObjects.map(function(dashboard) {
                    return { dashboardId: dashboard.id, slideIndex: undefined };
                });
                if ($scope.selection.selectedObjects.length == 1) {
                    $scope.projectKey = $scope.dashboard.projectKey;
                    $scope.modalTitle = "Export dashboard : " + $scope.dashboard.name;
                } else {
                    $scope.projectKey = $scope.selection.selectedObjects.length == 0 ? null : $scope.selection.selectedObjects[0].projectKey;
                    $scope.modalTitle = "Export a list of " + $scope.selection.selectedObjects.length + " dashboards";
                }
            } else {
                $scope.projectKey = $scope.dashboard.projectKey;
                $scope.params.dashboards = [ {dashboardId: $scope.dashboard.id, slideIndex: undefined} ];
                $scope.modalTitle = "Export dashboard : " + $scope.dashboard.name;
            }
        };

        $scope.exportDashboard = function() {
            WT1.event("dashboard-exported-from-dashboard-universe", {
                format: $scope.params.exportFormat
            });

            if ($scope.params.exportOnlyCurrentSlide && $scope.params.dashboards.length == 1) {
                $scope.params.dashboards[0].slideIndex = $scope.pageIdx;
            }
            DataikuAPI.dashboards.export($scope.projectKey, $scope.params.exportFormat, $scope.params.dashboards)
                .error(setErrorInScope.bind($scope))
                .success(function (resp) {
                    FutureProgressModal.show($scope, resp, "Export dashboard").then(function (result) {
                        if (result) { // undefined in case of abort
                            downloadURL(DataikuAPI.dashboards.getExportURL(result.projectKey, result.exportId));
                            ActivityIndicator.success("Dashboard export(s) downloaded!", 5000);
                        } else {
                            ActivityIndicator.error("Export dashboard failed", 5000);
                        }
                        $scope.resolveModal();
                    });
                });
        }
    });

    function getDefaultTileTitle(tile, insight) {
        switch (tile.tileType) {
            case 'INSIGHT':
                return (insight || {}).name;
            case 'TEXT':
                return 'Text tile';
            case 'IMAGE':
                return 'Image tile';
        }
    }

})();
