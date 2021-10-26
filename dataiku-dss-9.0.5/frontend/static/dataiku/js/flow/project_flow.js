(function() {
'use strict';

/**
* Main flow page functionalities
*/
const app = angular.module('dataiku.flow.project', ['dataiku.flow.graph']);

app.directive('flowRightColumn', function(QuickView, TaggableObjectsUtils, FlowGraphSelection, FlowGraph) {
    return {
        scope: true,
        link: function(scope, element, attrs) {
            scope.QuickView = QuickView;

            scope.$watch("rightColumnItem", function() {
                scope.context = "FLOW";
                scope.selection = {
                    selectedObject: scope.rightColumnItem,
                    confirmedItem: scope.rightColumnItem
                };
            });

            scope.getSelectedNodes = function() {
                return scope.rightColumnSelection || [];
            };

            scope.getSelectedTaggableObjectRefs = function() {
                return scope.getSelectedNodes().map(TaggableObjectsUtils.fromNode);
            };

            scope.computeMovingImpact = function() {
                    var computedImpact = [];
                    var movingItems = FlowGraphSelection.getSelectedTaggableObjectRefs();

                    function addSuccessors(node, original) {
                        if (node.nodeType != "RECIPE") return;
                        node.successors.forEach(function(successor) {
                            let newTaggableObjectRef = TaggableObjectsUtils.fromNode(FlowGraph.node(successor));
                            if (original && successor == original.id || movingItems.filter(it => it.id == newTaggableObjectRef.id).length) return;
                            computedImpact.push(newTaggableObjectRef);
                        });
                    }
                    function computeImpact(node) {
                        let predecessor = node.predecessors[0];
                        if (predecessor && node.nodeType != "RECIPE") {
                            let newTaggableObjectRef = TaggableObjectsUtils.fromNode(FlowGraph.node(predecessor));
                            if (computedImpact.filter(it => it.id == newTaggableObjectRef.id).length) return;
                            if (!movingItems.filter(it => it.id == newTaggableObjectRef.id).length) {
                                computedImpact.push(newTaggableObjectRef);
                            }
                            addSuccessors(FlowGraph.node(predecessor), node);
                        }

                        addSuccessors(node);
                    }

                    FlowGraphSelection.getSelectedNodes().forEach(function(node) {
                        let realNode = node.usedByZones.length ? FlowGraph.node(`zone__${node.ownerZone}__${node.realId}`) : node;
                        computeImpact(realNode);
                    });
                    return computedImpact;
                }
        }
    };
});



// WARNING Keep the switch in sync with other _XXX_MassActionsCallbacks controllers (flow, taggable objects pages, list pages)
app.controller('FlowMassActionsCallbacks', function($scope, $controller, $rootScope, FlowTool, FlowGraphSelection, PIPELINEABILITY_ACTIONS) {

    $scope.onAction = function(action) {
        switch (action) {
            case 'action-delete':
                reloadGraph();
                FlowGraphSelection.clearSelection();
                break;
            case 'action-tag':
                refreshFlowStateWhenViewIsActive(['TAGS']);
                break;
            case 'action-watch':
            case 'action-star':
                refreshFlowStateWhenViewIsActive(['WATCH']);
                $rootScope.$emit('userInterestsUpdated');
                break;
            case 'action-clear':
                reloadGraph();
                break;
            case 'action-build':
                reloadGraph();
                break;
            case 'action-change-connection':
                reloadGraph();
                break;
            case 'action-update-status':
                refreshFlowStateWhenViewIsActive(['COUNT_OF_RECORDS', 'FILESIZE']);
                break;
            case 'action-set-auto-count-of-records':
                refreshFlowStateWhenViewIsActive(['COUNT_OF_RECORDS']);
                break;
            case 'action-set-virtualizable':
                reloadGraph();
                break;
            case 'action-add-to-scenario':
                refreshFlowStateWhenViewIsActive(['SCHEDULING']);
                break;
            case 'action-share':
                reloadGraph();
                break;
            case 'action-unshare':
                reloadGraph();
                FlowGraphSelection.clearSelection();
                break;
            case 'action-change-recipes-engines':
                refreshFlowStateWhenViewIsActive();
                break;
            case 'action-change-spark-config':
                refreshFlowStateWhenViewIsActive(['SPARK_CONFIG']);
                break;
            case PIPELINEABILITY_ACTIONS.changeSpark:
                refreshFlowStateWhenViewIsActive(['SPARK_PIPELINES']);
                break;
            case PIPELINEABILITY_ACTIONS.changeSQL:
                refreshFlowStateWhenViewIsActive(['SQL_PIPELINES']);
                break;
            case 'action-change-impala-write-mode':
                refreshFlowStateWhenViewIsActive(['IMPALA_WRITE_MODE']);
                break;
            case 'action-change-hive-engine':
                refreshFlowStateWhenViewIsActive(['HIVE_MODE']);
                break;
            case 'action-change-spark-engine':
                refreshFlowStateWhenViewIsActive(['SPARK_ENGINE']);
                break;
            case 'action-convert-to-hive':
            case 'action-convert-to-impala':
                reloadGraph();
                break;
            case 'action-change-python-env':
            case 'action-change-r-env':
                refreshFlowStateWhenViewIsActive();
                break;
            default:
                break;
        }
    }

    /*
    * Refresh the flow state only for some views
    * (or all is not specified)
    */
    function refreshFlowStateWhenViewIsActive(viewNames) {
        const currentTool = FlowTool.getCurrent();
        if (currentTool.def && (!viewNames || !viewNames.length || viewNames.includes(currentTool.def.getName()))) {
            currentTool.refreshState();
        }
    }

    /*
    * Fetch the whole flow + the view state if any active
    */
    function reloadGraph() {
        $rootScope.$emit('reloadGraph');
    }
});


app.directive('flowEditor', function($compile, $state, $stateParams, $timeout, $rootScope, $controller, Debounce, GraphZoomTrackerService,
            Assert, TopNav, CreateModalFromTemplate, DataikuAPI, ContextualMenu, HistoryService, Logger, StateUtils, TaggableObjectsUtils, localStorageService,
            FlowGraphSelection, FlowToolsRegistry, FlowToolsUtils, FlowGraph, FlowGraphFiltering, FlowFilterQueryService, FlowGraphFolding, executeWithInstantDigest, Notification, $q, MessengerUtils) {

function drawExposedIndicators(svg, nodesGraph) {
    svg.find('.exposed-indicator').remove();

    svg.find('g[data-type=LOCAL_DATASET], g[data-type=LOCAL_SAVEDMODEL], g[data-type=LOCAL_MODELEVALUATIONSTORE], g[data-type=LOCAL_MANAGED_FOLDER]').each(function (index, boxElement) {
        const nodeId = $(boxElement).attr('data-id');
        const node = nodesGraph.nodes[nodeId];
        if (!node) {
            Logger.warn("Graph node not found:", nodeId);
            return;
        }
        if (node.isExposed) {
            const type = {
                LOCAL_DATASET: 'dataset',
                LOCAL_SAVEDMODEL: 'model',
                LOCAL_MODELEVALUATIONSTORE: 'evaluation store',
                LOCAL_MANAGED_FOLDER: 'folder'
            }[$(boxElement).data('type')];

            const exposedSVG = $(makeSVG('foreignObject', {
                    x: 2,
                    y: 2,
                    width: 20,
                    height: 20,
                    class: 'exposed-indicator nodeicon-small'+(type == 'dataset' ? '' : '-dark')
                }))
                .append($(`<div><i class="icon-mail-forward" title="This ${type} is exposed in other projects"></i></div>`));
            if (type == 'folder') {
                $(boxElement).find('>g').first().append(exposedSVG);
            } else {
                $(boxElement).find('>g').append(exposedSVG);
            }
        }
    });
}

function drawBuildInProgressIndicators(svg, nodesGraph) {
    svg.find('.build-indicator').remove();

    svg.find('g[data-type=LOCAL_DATASET], g[data-type=LOCAL_SAVEDMODEL], g[data-type=LOCAL_MODELEVALUATIONSTORE], g[data-type=LOCAL_MANAGED_FOLDER]').each(function (index, boxElement) {
        let nodeId = $(boxElement).attr('data-id');
        let node = nodesGraph.nodes[nodeId];

        if (!node) {
            Logger.warn("Graph node not found:", nodeId)
            return;
        }

        let iconDom = null;
        if (node.beingBuilt) {
            iconDom = $('<div class="icon-being-built"><i class="icon-play" /></div>');
        } else if (node.aboutToBeBuilt) {
            iconDom = $('<div class="icon-about-to-be-built"><i class="icon-spinner"></i></div>');
        }
        if (iconDom) {
            let $pinSvg = $(makeSVG('foreignObject', {
                    x: 75,
                    y: 55,
                    width: 20,
                    height: 20,
                    'class': 'build-indicator'
            })).append(iconDom);

            if ($(boxElement).data('type') == 'LOCAL_MANAGED_FOLDER') {
                $(boxElement).find('>g').first().append($pinSvg);
            } else {
                $(boxElement).find('>g').append($pinSvg);
            }
        }
    });

    svg.find('g[data-type=RECIPE]').each(function (index, boxElement) {
        let nodeId = $(boxElement).attr('data-id');
        let node = nodesGraph.nodes[nodeId];

        if (!node) {
            Logger.warn("Graph node not found:", nodeId)
            return;
        }

        let iconDom = null;
        if (node.continuousActivityDone) {
            iconDom = $('<div class="icon-continuous-activity-done"><i class="icon-warning-sign" /></div>');
        } else if (node.beingBuilt) {
            iconDom = $('<div class="icon-being-built"><i class="icon-play" /></div>');
        }
        if (iconDom) {
            let $pinSvg = $(makeSVG('foreignObject', {
                    x: 55,
                    y: 40,
                    width: 20,
                    height: 20,
                    'class': 'build-indicator',
                    transform: 'scale(1.92 1.92)'  // scale to conteract the 0.52 iconScale
            })).append(iconDom);

            $(boxElement).find('>g').append($pinSvg);
        }
    });
}

return {
    restrict: 'EA',
    scope: true,
    controller: function($scope, $element) {
        $controller('FlowMassActionsCallbacks', {$scope: $scope});

        TopNav.setLocation(TopNav.TOP_FLOW, "flow", TopNav.TABS_NONE, null);
        TopNav.setNoItem();

        $scope.projectFlow = true;
        $scope.nodesGraph = {flowFiltersAndSettings : {}};

        $scope.getZoneColor = zoneId => {
            const nodeFound = $scope.nodesGraph.nodes ? $scope.nodesGraph.nodes[`zone_${zoneId}`] : undefined;
            if (nodeFound && nodeFound.customData) {
                return nodeFound.customData.color
            }
            return "#ffffff";
        };

        function updateUserInterests() {
            DataikuAPI.interests.getUserInterests($rootScope.appConfig.login, 0, 10000, {projectKey: $stateParams.projectKey}).success(function(data) {
                // It would be nice to fetch that with the graph but it is a little dangerous to require the database to be functional to see any flow...
                $scope.userInterests = data.interests.filter(x => ['RECIPE', 'DATASET', 'SAVED_MODEL', 'MODEL_EVALUATION_STORE', 'MANAGED_FOLDER'].includes(x.objectType));

                const indexedInterests = {};
                $scope.userInterests.forEach(function(interest) {
                    //TODO @flow using the node ids as keys would be better but we don't generate them in js for now (I think)
                    indexedInterests[interest.objectType+'___'+interest.objectId] = interest;
                });
                $.each($scope.nodesGraph.nodes, function(nodeId, node) {
                    const taggableType = TaggableObjectsUtils.fromNodeType(node.nodeType);
                    const interest = indexedInterests[taggableType+'___'+node.name]
                    if (interest) {
                        node.interest = interest;
                    } else {
                        node.interest = {
                            starred: false,
                            watching: false
                        };
                    }
                });

            }).error(setErrorInScope.bind($scope));
        }



        $scope.createGraphFilteringObject = function (keptNodes) {
            return {
                keptNodes: keptNodes,
                keptEdges: keptNodes,
                doFading: true,
                nonFadedNodes: [],
                nonFadedEdges: [],
                removeFadedElements: false
            };
        };
        $scope.applyNodeFiltering = function (filteredNodes) {
            $rootScope.$emit('drawGraph');

            $.each(FlowGraph.get().nodes, (key, node) => {
                node.filterRemove = !filteredNodes.includes(key);
            });

            FlowGraphSelection.clearSelection();
            $scope.zoomToBbox(FlowGraphFiltering.getBBoxFromSelector($scope.svg, '.node:not(.filter-remove)'));
        };

        $scope.isNotInGraph = function(item) {
            return $scope.nodesGraph && $scope.nodesGraph.nodes &&
                ! $scope.nodesGraph.nodes.hasOwnProperty('dataset_' + item.name);
        };

        $scope.processSerializedFilteredGraphResponse = function (serializedFilteredGraph, zoomTo) {
            $scope.setGraphData(serializedFilteredGraph.serializedGraph);
            if (typeof zoomTo === 'string') {
                const deregisterListener = $scope.$root.$on("flowDisplayUpdated", function () {
                    deregisterListener();
                    setTimeout(() => {
                        let id = zoomTo;
                        let node = $scope.nodesGraph.nodes[zoomTo];
                        if (!node) {
                            id = graphVizEscape(zoomTo);
                            node = $scope.nodesGraph.nodes[id];
                        }
                        if (!node && $scope.nodesGraph.hasProjectZones) {
                            id = Object.values($scope.nodesGraph.nodes).filter(it => it.realId == id && !it.usedByZones.length)[0].id;
                        }
                        $scope.zoomGraph(id);
                        GraphZoomTrackerService.instantSavePanZoomCtx($scope.panzoom);
                        GraphZoomTrackerService.setFocusItemCtx($scope.nodesGraph.nodes[id]);
                        FlowGraphSelection.onItemClick($scope.nodesGraph.nodes[id]);
                    });
                })
            }

            $scope.filtering.filteringResults = serializedFilteredGraph.filteringResults;
            $.each(FlowGraph.get().nodes, (key, node) => {
                node.filterRemove = $scope.filtering.filteringResults && (!$scope.filtering.filteringResults.filteredGraphElements || !$scope.filtering.filteringResults.filteredGraphElements.includes(key));
            });
            $rootScope.$emit('drawGraph');
        };

        $scope.reloadFilters = function(structuredFlowObjectFilter, args) {
            if (args && args.refreshFlowFilters) $scope.reloadFlowFilterSettings()
         }

        $scope.reloadFlowFilterSettings = function () {

            DataikuAPI.flow.loadFlowFilterSettings($stateParams.projectKey, $stateParams.zoneId, $scope.collapsedZones)
                .success(function (resp) {
                    Object.assign($scope.filtering, resp.flowFiltersAndSettings);
                    const findId = $scope.filtering.activeFilter.id
                    const refreshedFilter = $scope.filtering.filters.find( e => e.id == findId)
                    if (refreshedFilter) $scope.filtering.activeFilter = refreshedFilter;
                })
                .error(setErrorInScope.bind($scope));
        }

        $scope.processLoadFlowResponse = function (resp, zoomTo, graphReloaded, resetZoom) {
            Assert.trueish(resp, "Received empty response");
            if (resp.flowFiltersAndSettings) {
                Object.assign($scope.filtering, resp.flowFiltersAndSettings);
                if (resp.flowFiltersAndSettings.filters) {
                    if (resp.flowFiltersAndSettings.activeFilterId) {
                        $scope.filtering.activeFilter = $scope.filtering.filters.find(e => e.id === resp.flowFiltersAndSettings.activeFilterId);
                    } else {
                        // by default select "All" filter
                        $scope.filtering.activeFilter = $scope.filtering.filters.find(e => e.id === '-1');
                    }
                    if (!$scope.filtering.activeFilter) {
                        $scope.resetFilter();
                    }
                    if ($scope.filtering.activeFilter) {
                        if (!graphReloaded) $scope.reloadFilters($scope.filtering.activeFilter.structuredFlowObjectFilter);
                        const creationDate = $scope.filtering.activeFilter.structuredFlowObjectFilter.customCreationDateRange;
                        $scope.filtering.pickerStartCreationDate = creationDate && creationDate.from ? moment(creationDate.from).format($scope.format) : null;
                        $scope.filtering.pickerEndCreationDate = creationDate && creationDate.to ? moment(creationDate.to).format($scope.format) : null;
                        const modificationDate = $scope.filtering.activeFilter.structuredFlowObjectFilter.customModificationDateRange;
                        $scope.filtering.pickerStartModificationDate = modificationDate && modificationDate.from ? moment(modificationDate.from).format($scope.format) : null;
                        $scope.filtering.pickerEndModificationDate = modificationDate && modificationDate.to ? moment(modificationDate.to).format($scope.format) : null;
                    }
                }
            }
            $scope.filtering.filtersByCategories = {'global': [], 'shared': [], 'private': []};
            $scope.filtering.filters.forEach(f => {
                if (f.scope === 'BUILT_IN') {
                    $scope.filtering.filtersByCategories['global'].push(f);
                } else if (f.scope === 'SHARED') {
                    $scope.filtering.filtersByCategories['shared'].push(f);
                } else {
                    $scope.filtering.filtersByCategories['private'].push(f);
                }
            });
            if (resp.serializedFilteredGraph) {
                $scope.processSerializedFilteredGraphResponse(resp.serializedFilteredGraph, zoomTo);
            }
            if (resetZoom) $scope.resetPanZoom();
            $scope.isFlowLoaded = true;
        };

        $scope.updateGraph = function (zoomTo) {
            DataikuAPI.flow.recipes.getGraph($stateParams.projectKey, null, true, $scope.drawZones.drawZones, $stateParams.zoneId || "", $scope.collapsedZones)
                .success(function(response) {
                        $scope.zoneIdLoaded = $stateParams.zoneId;
                        $scope.processLoadFlowResponse(response, zoomTo, true);
                        updateUserInterests();
                    }
                )
                .error(setErrorInScope.bind($scope));
            //TODO @flow move to flow_search
            // DataikuAPI.datasets.list($stateParams.projectKey).success(function(data) {
            //     $scope.datasets = data;
            // }).error(setErrorInScope.bind($scope));
            // DataikuAPI.datasets.listHeads($stateParams.projectKey, {}, false).success(function(data) {
            //     $scope.filteredDatasets = data;
            // }).error(setErrorInScope.bind($scope));
        };

        var storageKey = `dku.flow.drawZones.${$stateParams.projectKey}`;
        $scope.drawZones = {
            drawZones: !!$stateParams.zoneId || JSON.parse(localStorageService.get(storageKey) || true)
        }

        $scope.$watch("drawZones.drawZones", function(nv, ov) {
            if (nv !== ov && !$scope.inFlowExport) {
                localStorageService.set(storageKey, $scope.drawZones.drawZones);
                $scope.resetPanZoom();
                $scope.updateGraph();
            }
        });

        var collapsedZonesStorageKey = `dku.flow.collapsedZones.${$stateParams.projectKey}`;

        $scope.cleanupCollapsedZones = (collapsedZones = $scope.collapsedZones) => {
            let changed = false;
            [...collapsedZones].forEach(collapsedZone => {
                const zoneFound = FlowGraph.node(`zone_${collapsedZone}`);
                if (!zoneFound) {
                    const index = collapsedZones.indexOf(collapsedZone);
                    if (index !== -1) {
                        collapsedZones.splice(index, 1);
                        changed = true;
                    }
                }
            });
            if (changed) {
                localStorageService.set(collapsedZonesStorageKey, JSON.stringify(collapsedZones));
            }
            return collapsedZones;
        }
        $scope.collapsedZones = localStorageService.get(collapsedZonesStorageKey) || [];

        $scope.toggleZoneCollapse = (collapseItems, multiItemStrategy) => {
            let zoneIds = collapseItems.map(it => it.id);
            zoneIds.forEach(function(zoneId) {
                let index = $scope.collapsedZones.findIndex(it => it === zoneId);
                if (index > -1 && multiItemStrategy !== 'collapseAll') {
                    $scope.collapsedZones.splice(index, 1);
                } else if (index < 0 && multiItemStrategy !== 'expandAll') {
                    $scope.collapsedZones.push(zoneId);
                }
            });
            localStorageService.set(collapsedZonesStorageKey, JSON.stringify($scope.collapsedZones));
            $scope.updateGraph();
        }

        $scope.filtering = {};

        $scope.resetFilter = function (isAdvanced) {
            $scope.filtering.activeFilter = {
                id: null,
                isAdvanced: !!isAdvanced,
                isDirty: true,
                structuredFlowObjectFilter: {
                    tags: [],
                    creator: [],
                    customCreationDateRange: {
                        from: null,
                        to: null
                    },
                    customModificationDateRange: {
                        from: null,
                        to: null
                    },
                    datasetTypes: [],
                    recipeTypes: [],
                    types: [],
                    downstreamPredecessorsIds: []
                },
                active: false,
                removeFadedElements: false,
                advancedFilter: '',
                query: ''
            };
            $scope.filtering.pickerStartCreationDate = null;
            $scope.filtering.pickerEndCreationDate = null;
            $scope.filtering.pickerStartModificationDate = null;
            $scope.filtering.pickerEndModificationDate = null;
        };

        $scope.resetFilter();
        $scope.updateGraph($stateParams.id);

        $scope.buildDataset = function(projectKey, name, trainMode) {
            DataikuAPI.datasets.get(projectKey, name, $stateParams.projectKey).success(function(dataset) {
                CreateModalFromTemplate("/templates/datasets/build-dataset-modal.html", $scope, "BuildDatasetController", function(modalScope) {
                    modalScope.dataset = dataset;
                    if (trainMode) {
                        modalScope.trainMode = true;
                    }
                }, "build-dataset-modal");
            }).error(setErrorInScope.bind($scope));
        };
        $scope.trainModel = function(projectKey, id) {
            CreateModalFromTemplate("/templates/savedmodels/build-model-modal.html", $scope, "BuildSavedModelController", function(modalScope) {
                    modalScope.modelId = id;
            });
        };
        $scope.buildManagedFolder = function(projectKey, id) {
            CreateModalFromTemplate("/templates/managedfolder/build-folder-modal.html", $scope, "BuildManagedFolderController", function(modalScope) {
                    modalScope.odbId = id;
            });
        };
        $scope.buildModelEvaluationStore = function(projectKey, id) {
            CreateModalFromTemplate("/templates/modelevaluationstores/build-store-modal.html", $scope, "BuildModelEvaluationStoreController", function(modalScope) {
                    modalScope.mesId = id;
            });
        };

        $scope.startCopy = function() {
            $scope.startTool('COPY', {preselectedNodes: FlowGraphSelection.getSelectedNodes().map(n => n.id)});
        };

        const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);

        $scope.$on('projectTagsUpdated', function (e, args) {
            $scope.reloadFilters($scope.filtering.activeFilter.structuredFlowObjectFilter, args);
        });

        let jobStateChangeListener = Notification.registerEvent("job-state-change", function(evt, message) {

            let refreshGraph = false;

            function getNodeNameForItem(itemType, itemName) {
                return itemType + "__" + graphVizEscape(itemName);
            }


            function isRunning(message) {
                if (message.state=='DONE' || message.state=='FAILED' || message.state=='ABORTED') return false;
                if (message.state=='RUNNING') return true;
                return undefined;
            }

            function updateNodeStatus(isRunIcon, node) {
                if (!node) return;

                if (isRunIcon && !node.beingBuilt) {
                    refreshGraph = true;
                    node.beingBuilt = true;
                    node.aboutToBeBuilt = false;
                }
                else if (node.beingBuilt || node.aboutToBeBuilt) {
                    refreshGraph = true;
                    node.beingBuilt = false;
                    node.aboutToBeBuilt = false;
                }

            }

            function updateNodeStatusFlowWithZones() {
                // selector matching job output datasets realId (can be in multiple zones)
                const selector = message.outputs.filter(output => output.type && output.type.toLowerCase() === 'dataset').map(output => {
                    const realId = getNodeNameForItem('dataset',  output.targetDatasetProjectKey + '.' + output.targetDataset);
                    return `svg [data-node-id="${realId}"]`;
                }).join(', ');

                // update node status for each matching output dataset
                if (selector) {
                    d3.selectAll(selector).each(function() {
                        const id = this.getAttribute('data-id');
                        updateNodeStatus(isRun, FlowGraph.node(id));
                    });
                }
            }

            function updateNodeStatusFlowWithoutZones() {
                message.outputs.forEach(output => {
                    if (output.type && output.type.toLowerCase() === 'dataset') {
                        updateNodeStatus(isRun, $scope.nodesGraph.nodes[getNodeNameForItem('dataset',  output.targetDatasetProjectKey + '.' + output.targetDataset)]);
                    }
                });
            }

            let isRun = isRunning(message);
            if (isRun!==undefined) {
                if ($scope.nodesGraph.hasProjectZones && $scope.drawZones.drawZones) {
                    updateNodeStatusFlowWithZones()
                } else {
                    updateNodeStatusFlowWithoutZones();
                }
            }

            if (refreshGraph) {
                drawBuildInProgressIndicators(FlowGraph.getSvg(), $scope.nodesGraph);
            }
        });
        let continuousActivityStateChangeListener = Notification.registerEvent("continuous-activity-state-change", function(evt, message) {

            let refreshGraph = false;

            function getNodeNameForItem(itemType, itemName) {
                return itemType + "__" + graphVizEscape(itemName);
            }


            function isRunning(message) {
                if (message.state=='STOPPED') return false;
                if (message.state=='STARTED') return true;
                return undefined;
            }

            function updateNodeStatus(isRunIcon, node) {
                if (!node) return;

                if (isRunIcon && !node.beingBuilt) {
                    refreshGraph = true;
                    node.beingBuilt = true;
                    node.continuousActivityDone = false;
                    node.aboutToBeBuilt = false;
                }
                else if (node.beingBuilt || node.aboutToBeBuilt) {
                    refreshGraph = true;
                    node.beingBuilt = false;
                    node.continuousActivityDone = false;
                    node.aboutToBeBuilt = false;
                }

            }

            let isRun = isRunning(message);
            if (isRun!==undefined) {
                let nodeName = getNodeNameForItem('recipe', message.continuousActivityId);
                updateNodeStatus(isRun, $scope.nodesGraph.nodes[nodeName]);
            }

            if (refreshGraph) {
                drawBuildInProgressIndicators(FlowGraph.getSvg(), $scope.nodesGraph);
            }
        });

        $scope.$on("$destroy", function() {
            if ($scope.svg) {
                $scope.svg.empty();
                $scope.svg.remove();
                $scope.svg = null;
            }
            interestsListener();
            jobStateChangeListener();
            continuousActivityStateChangeListener();
        });

        $scope.toggleFilter = function () {
            DataikuAPI.flow.enableFlowFiltering($stateParams.projectKey, !$scope.filtering.filteringEnabled, $scope.collapsedZones)
                .success($scope.processLoadFlowResponse)
                .error(setErrorInScope.bind($scope));
        };

        $scope.unfoldAll = function() {
            FlowGraphFolding.unfoldAll();
        }

        $scope.zoomToSelection = function() {
            $scope.zoomToBbox(FlowGraphFiltering.getBBoxFromSelector($scope.svg, '.selected'), 1.2);
        };

        $scope.exportFlow = function() {
            const graphBBox = $scope.svg.find('g.graph')[0].getBBox();
            CreateModalFromTemplate("/templates/flow-editor/export-flow-modal.html", $scope, "ExportFlowModalController", function(newScope) {
                newScope.init($stateParams.projectKey, graphBBox);
            });
        };

        // Toolbox used by export-flow.js to prepare the flow to be exported
        $scope.exportToolbox = {
            checkLoading: function() {
                return $scope.httpRequests.length !== 0 || !$scope.isFlowLoaded;
            },
            removeDecorations: function(drawZones) {
                executeWithInstantDigest(function() {
                    $scope.hideForExport = true;
                    $scope.fullScreen = true;
                    $scope.inFlowExport = true; // Prevent the flow from automatically refreshing when zones are shown/hidden
                }, $scope);
            },
            getGraphBoundaries: function () {
                const graphBBox = $scope.svg.find('g.graph')[0].getBBox();
                return {
                    x: graphBBox.x,
                    y: graphBBox.y,
                    width: graphBBox.width,
                    height: graphBBox.height
                };
            },
            adjustViewBox: function(x, y, width, height) {
                $scope.svg[0].setAttribute('viewBox', [x, y, width, height].join(', '));
            },
            configureZones: function(drawZones, collpasedZones) {
                $scope.drawZones.drawZones = drawZones;
                $scope.collapsedZones = collpasedZones;
                // Reload the flow graph
                $scope.isFlowLoaded = false;
                $scope.updateGraph();
            }
        };


        $scope.zoomOnZone = zoneId => {
            $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId }));
        };

        $scope.zoomOutOfZone = (id = null) => {
            $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId: null, id }));
        }
    },
    link: function(scope, element) {
        // Try to find the more recent item for the project and zone
        function getLastItemInHistory(projectKey, zoneId) {
            const items = HistoryService.getRecentlyViewedItems();
            if (items && items.length) {
                const validItems = items.filter(it => it.type !== 'PROJECT' && it.projectKey === projectKey);
                if (!zoneId) {
                    return validItems[0];
                }
                const zoneName = graphVizEscape(`zone_${zoneId}`);
                const zoneContent = Object.keys(scope.nodesGraph.nodes).filter(it => it.startsWith(zoneName)).map(it => scope.nodesGraph.nodes[it]);
                return validItems.find(item => zoneContent.find(it => it.name === item.id));
            }
            return null;
        }

        function getName(item) {
            if (item.type === 'RECIPE') {
                return item.type.toLowerCase() + graphVizEscape(`_${item.id}`)
            }
            return item.type.toLowerCase().replace('_', '') + graphVizEscape(`_${item.projectKey}.${item.id}`);
        }

        function zoomOnLast() {
            if (!scope.nodesGraph || !scope.nodesGraph.nodes) {
                return; // not ready
            }
            const itemFound = getLastItemInHistory($stateParams.projectKey, $stateParams.zoneId);
            if (itemFound) {
                const id = GraphZoomTrackerService.getZoomedName(FlowGraph, getName(itemFound));
                Logger.info("zooming on " + id + "--> ", scope.nodesGraph.nodes[id]);
                scope.zoomGraph(id);
                FlowGraphSelection.onItemClick(scope.nodesGraph.nodes[id]);
                scope.$apply();
            }
        }

        const lastUsedZoneKey = `dku.flow.lastUsedZone.${$stateParams.projectKey}`;

        function preselectZone() {
            const selectedItems = FlowGraphSelection.getSelectedNodes();
            if (selectedItems.length == 1 && selectedItems[0].nodeType == "ZONE") {
                return selectedItems[0].cleanId;
            }
            return localStorageService.get(lastUsedZoneKey);
        }

        scope.zoneComparator = (v1, v2) => {
            // If we don't get strings, just compare by index
            if (v1.type !== 'string' || v2.type !== 'string') {
              return (v1.index < v2.index) ? -1 : 1;
            }
            if (scope.uiState.zones[v1.index].id === 'default') {
                return 1;
            }
            if (scope.uiState.zones[v2.index].id === 'default') {
                return -1;
            }
            // Compare strings alphabetically, taking locale into account
            return v1.value.localeCompare(v2.value);
          };

        scope.moveToFlowZone = (movingItems, forceCreation = false, computedImpact = []) => {
            scope.movingItems = movingItems;
            scope.computedImpact = computedImpact;
            scope.uiState = {
                zones: [],
                selectedZone: undefined,
                creationMode: forceCreation ? 'create' : 'move',
                stockColors: ["#C82423","#8C2DA7","#31439C","#087ABF","#0F786B","#4B8021","#F9BE40","#C54F00","#D03713","#465A64"],
                color: "#FF0000",
                forceCreation
            };
            DataikuAPI.flow.zones.list($stateParams.projectKey).success(zones => {
                scope.uiState.zones = zones;
                scope.uiState.creationMode = !forceCreation && zones.length > 0 ? 'move' : 'create';
            }).error(setErrorInScope.bind(scope));
            CreateModalFromTemplate("/templates/flow-editor/move-to-zone.html", scope, null, newScope => {
                newScope.uiState.color = newScope.uiState.stockColors[Math.floor(Math.random() * newScope.uiState.stockColors.length)]
                newScope.uiState.selectedZone = preselectZone();
                newScope.pickStockColor = color => {
                    newScope.uiState.color = color;
                };
                newScope.onClick = () => {
                    let movingTo = newScope.uiState.selectedZone;
                    let promise = null
                    movingItems = movingItems.concat(scope.computedImpact);
                    if (newScope.uiState.creationMode === 'create') {
                        promise = DataikuAPI.flow.zones.create($stateParams.projectKey, newScope.uiState.name, newScope.uiState.color).success(zoneCreated => {
                            movingTo = zoneCreated.id;
                            $rootScope.$emit('zonesListChanged');
                        }).error($q.reject);
                    } else {
                        promise = $q.resolve();
                    }

                    if (movingItems.length > 0) {
                        promise = promise.then(() => DataikuAPI.flow.zones.moveItems($stateParams.projectKey, movingTo, movingItems).error($q.reject));
                    }
                    promise.then(() => {
                        localStorageService.set(lastUsedZoneKey, movingTo);
                        GraphZoomTrackerService.setFocusItemCtx({id: `zone_${movingTo}`}, true);
                        newScope.$emit('reloadGraph');
                        newScope.dismiss();
                    }, setErrorInScope.bind(newScope))
                }
            });
        };

        scope.shareToFlowZone = (sharingItems, forceCreation = false) => {
            scope.uiState = {
                zones: [],
                selectedZone: undefined,
                creationMode: forceCreation ? 'create' : 'share',
                stockColors: ["#C82423","#8C2DA7","#31439C","#087ABF","#0F786B","#4B8021","#F9BE40","#C54F00","#D03713","#465A64"],
                color: "#FF0000",
                forceCreation
            };
            DataikuAPI.flow.zones.list($stateParams.projectKey).success(zones => {
                scope.uiState.zones = zones;
                scope.uiState.creationMode = !forceCreation && zones.length > 0 ? 'share' : 'create';
            }).error(setErrorInScope.bind(scope));
            CreateModalFromTemplate("/templates/flow-editor/share-to-zone.html", scope, null, newScope => {
                newScope.uiState.color = newScope.uiState.stockColors[Math.floor(Math.random() * newScope.uiState.stockColors.length)]
                newScope.uiState.selectedZone = preselectZone();
                newScope.pickStockColor = color => {
                    newScope.uiState.color = color;
                };
                newScope.onClick = () => {
                    let sharedTo = newScope.uiState.selectedZone;
                    let promise = null
                    if (newScope.uiState.creationMode === 'create') {
                        promise = DataikuAPI.flow.zones.create($stateParams.projectKey, newScope.uiState.name, newScope.uiState.color).success(zoneCreated => {
                            sharedTo = zoneCreated.id;
                            newScope.uiState.zones.push(zoneCreated);
                            $rootScope.$emit('zonesListChanged');
                        }).error($q.reject);
                    } else {
                        promise = $q.resolve();
                    }

                    if (sharingItems.length > 0) {
                        promise = promise.then(() => DataikuAPI.flow.zones.shareItems($stateParams.projectKey, sharedTo, sharingItems).error($q.reject));
                    }

                    promise.then(() => {
                        localStorageService.set(lastUsedZoneKey, sharedTo);
                        if ($stateParams.zoneId) {
                            const found = newScope.uiState.zones.find(z => z.id === sharedTo);
                            if (found) {
                                MessengerUtils.post({
                                    message: `Shared to zone: <a class="link-std" href="${StateUtils.href.dssObject("FLOW_ZONE", found.id, $stateParams.projectKey)}">${newScope.sanitize(found.name)}</a>`,
                                    icon: '<i class="icon-zone"/>',
                                    type: "no-severity",
                                    id: "share-flow-zone" + found.id,
                                    showCloseButton: true
                                });
                            }
                        }
                        newScope.$emit('reloadGraph');
                        newScope.dismiss()
                    }, setErrorInScope.bind(newScope));
                }
            });
        };

        scope.unshareToFlowZone = (sharingItems, zoneIds) => {
            if (sharingItems.length > 0) {
                DataikuAPI.flow.zones.unshareItems($stateParams.projectKey, zoneIds, sharingItems).success(scope.$emit('reloadGraph'));
            }
        };

        scope.onItemDblClick = function(item, evt) {
            let destUrl = StateUtils.href.node(item);
            fakeClickOnLink(destUrl, evt);
        };

        scope.onContextualMenu = function(item, evt) {
            let $itemEl = $(evt.target).parents("g[data-type]").first();
            if ($itemEl.length > 0) {
                let x = evt.pageX;
                let y = evt.pageY;
                let ctxMenuScope = scope.$new();
                const selectedNodes = FlowGraphSelection.getSelectedNodes();
                let type = selectedNodes.length > 1 ? 'MULTI' : item.nodeType;

                let controller = {
                    "LOCAL_DATASET": "DatasetContextualMenuController",
                    "FOREIGN_DATASET": "ForeignDatasetContextualMenuController",
                    "LOCAL_STREAMING_ENDPOINT": "StreamingEndpointContextualMenuController",
                    "RECIPE": "RecipeContextualMenuController",
                    "LOCAL_SAVEDMODEL": "SavedModelContextualMenuController",
                    "FOREIGN_SAVEDMODEL": "SavedModelContextualMenuController",
                    "LOCAL_MODELEVALUATIONSTORE": "ModelEvaluationStoreContextualMenuController",
                    "FOREIGN_MODELEVALUATIONSTORE": "ModelEvaluationStoreContextualMenuController",
                    "LOCAL_MANAGED_FOLDER": "ManagedFolderContextualMenuController",
                    "FOREIGN_MANAGED_FOLDER": "ManagedFolderContextualMenuController",
                    "ZONE": "ZoneContextualMenuController",
                    "MULTI": "MultiContextualMenuController",
                }[type];

                let template = "/templates/flow-editor/" + {
                    "LOCAL_DATASET": "dataset-contextual-menu.html",
                    "FOREIGN_DATASET": "foreign-dataset-contextual-menu.html",
                    "LOCAL_STREAMING_ENDPOINT": "streaming-endpoint-contextual-menu.html",
                    "RECIPE": "recipe-contextual-menu.html",
                    "LOCAL_SAVEDMODEL": "savedmodel-contextual-menu.html",
                    "FOREIGN_SAVEDMODEL": "savedmodel-contextual-menu.html",
                    "LOCAL_MODELEVALUATIONSTORE": "modelevaluationstore-contextual-menu.html",
                    "FOREIGN_MODELEVALUATIONSTORE": "modelevaluationstore-contextual-menu.html",
                    "LOCAL_MANAGED_FOLDER": "managed-folder-contextual-menu.html",
                    "FOREIGN_MANAGED_FOLDER": "managed-folder-contextual-menu.html",
                    "ZONE": "zone-contextual-menu.html",
                    "MULTI": "multi-contextual-menu.html",
                }[type];

                ctxMenuScope.object = item;
                ctxMenuScope.hasZone = [...selectedNodes, item].find(it => it.nodeType === "ZONE") !== undefined;

                let menu = new ContextualMenu({
                    template: template,
                    scope: ctxMenuScope,
                    contextual: true,
                    controller: controller,
                });
                menu.openAtXY(x, y);
                return false;
            } else {
                ContextualMenu.prototype.closeAny();
                return true;
            }
        };

        FlowGraphSelection.clearSelection();

        scope.flowViews = FlowToolsRegistry.getFlowViews();

        Mousetrap.bind("z", zoomOnLast);

        Mousetrap.bind("left", scope.moveLeft);
        Mousetrap.bind("right", scope.moveRight);
        Mousetrap.bind("up", scope.moveUp);
        Mousetrap.bind("down", scope.moveDown);

        Mousetrap.bind("-", scope.zoomOut);
        Mousetrap.bind("+", scope.zoomIn);
        Mousetrap.bind("=", scope.zoomIn); // For more practicity on qwerty keyboard without numpad

        const updateGraphDebounced = Debounce().withDelay(200,200).wrap(scope.updateGraph);

        const deregister1 = $rootScope.$on('datasetsListChangedFromModal', updateGraphDebounced);
        const deregister2 = $rootScope.$on('taggableObjectTagsChanged', updateGraphDebounced);
        const deregister3 = $rootScope.$on('flowItemAddedOrRemoved', updateGraphDebounced);
        const deregister4 = $rootScope.$on('reloadGraph', (event, { zoomTo } = {}) => updateGraphDebounced(zoomTo));
        const deregister5 = $rootScope.$on('objectMetaDataChanged', updateGraphDebounced);
        const deregister6 = $rootScope.$on('discussionCountChanged', updateGraphDebounced);
        //const deregister7 = $rootScope.$on('unreadDiscussionsChanged', updateGraphDebounced); TODO: find a better solution to live-refresh the unread discussions

        scope.$on("$destroy", function() {
            Mousetrap.unbind("z");
            Mousetrap.unbind("left");
            Mousetrap.unbind("right");
            Mousetrap.unbind("up");
            Mousetrap.unbind("down");
            Mousetrap.unbind("-");
            Mousetrap.unbind("+");
            Mousetrap.unbind("=");
            deregister1();
            deregister2();
            deregister3();
            deregister4();
            deregister5();
            deregister6();
            //deregister7(); TODO: find a better solution to live-refresh the unread discussions

        });

        scope.$on('graphRendered', function() {
            drawBuildInProgressIndicators(scope.svg, scope.nodesGraph);
            drawExposedIndicators(scope.svg, scope.nodesGraph);
        });

        scope.$on('indexNodesDone', () => {
            scope.cleanupCollapsedZones();
        });
    }
};
});

app.directive('flowExportForm', function(GRAPHIC_EXPORT_OPTIONS, WT1, GraphicImportService) {
    return {
        replace: false,
        require: '^form',
        restrict: 'EA',
        scope: {
            params: '=',
            graphBoundaries: '='
        },
        templateUrl: '/templates/flow-editor/export-flow-form.html',
        link: function($scope, element, attrs, formCtrl) {
            WT1.event("flow-export-form-displayed", {});

            $scope.exportFormController = formCtrl;
            // Utilities that give us all the choices possible
            $scope.paperSizeMap = GRAPHIC_EXPORT_OPTIONS.paperSizeMap;
            $scope.orientationMap = GRAPHIC_EXPORT_OPTIONS.orientationMap;
            $scope.ratioMap = GRAPHIC_EXPORT_OPTIONS.ratioMap;
            $scope.paperInchesMap = GRAPHIC_EXPORT_OPTIONS.paperInchesMap;
            $scope.fileTypes = GRAPHIC_EXPORT_OPTIONS.fileTypes;
            $scope.tileScaleModes = GRAPHIC_EXPORT_OPTIONS.tileScaleModes;

            $scope.minResW = 500;
            $scope.minResH = 500;
            $scope.maxResW = 10000;
            $scope.maxResH = 10000;
            $scope.maxDpi = 300;

            let computeTileScale = function (tileScaleProps) {
                if (!tileScaleProps.enabled || tileScaleProps.percentage === undefined) {
                    return 1;
                } else {
                    return Math.max(1, tileScaleProps.percentage / 100)
                }
            };

            let computeBestTileScale = function(width, height) {
                const targetFactor = 1.0; // 1-to-1 between size of graph and exported image
                const xFactor = $scope.graphBoundaries.width / width;
                const yFactor = $scope.graphBoundaries.height / height;
                return Math.max(1, Math.ceil(Math.max(xFactor, yFactor) / targetFactor));
            };

            let capWidth = function(width) {
                return Math.min($scope.maxResW, Math.max($scope.minResW, width));
            };
            let capHeight = function(height) {
                return Math.min($scope.maxResH, Math.max($scope.minResH, height));
            };

            // Given an image width, height and tile scale, compute how many pages
            // will be required to render the whole graph
            let computeTileScaleSheets = function(width, height, tileScale) {
                if (width === undefined || height === undefined || tileScale == undefined) {
                    return {x: 0, y: 0, count: 0};
                }
                const sheetRatio = width / height;
                const graphRatio = $scope.graphBoundaries.width / $scope.graphBoundaries.height;
                let graphSheetWidth;
                let graphSheetHeight;
                if (sheetRatio < graphRatio) {
                    // Dominant width
                    graphSheetWidth = $scope.graphBoundaries.width / tileScale;
                    graphSheetHeight = graphSheetWidth / sheetRatio;
                } else {
                    // Dominant height
                    graphSheetHeight = $scope.graphBoundaries.height / tileScale;
                    graphSheetWidth = graphSheetHeight * sheetRatio;
                }
                const x = Math.max(1, Math.ceil($scope.graphBoundaries.width / graphSheetWidth));
                const y = Math.max(1, Math.ceil($scope.graphBoundaries.height / graphSheetHeight));
                const count = x * y;
                return {x: x, y: y, count: count};
            };

            // Compute the best width, height and tile scale for the exported image
            // for the supplied paper size and orientation.
            let setBestDimensions = function(authorizeTileScaling = true) {
                let exportFormat = $scope.params.exportFormat;

                let width, height;
                const sheetRatio = (exportFormat.orientation == "LANDSCAPE") ?
                    $scope.ratioMap[exportFormat.paperSize] :
                    1 / $scope.ratioMap[exportFormat.paperSize];
                const graphRatio = $scope.graphBoundaries.width / $scope.graphBoundaries.height;
                if (sheetRatio < graphRatio) {
                    // Dominant width
                    width = $scope.graphBoundaries.width;
                    height = width / sheetRatio;
                } else {
                    // Dominant height
                    height = $scope.graphBoundaries.height;
                    width = height * sheetRatio;
                }

                let tileScale = 1;
                let dpi = Math.max(width, height) / $scope.paperInchesMap[exportFormat.paperSize];
                if (authorizeTileScaling && dpi > $scope.maxDpi) {
                    width = (width * $scope.maxDpi) / dpi;
                    height = (height * $scope.maxDpi) / dpi;
                    tileScale = computeBestTileScale(width, height);
                }

                exportFormat.width = capWidth(Math.round(width));
                exportFormat.height = capHeight(Math.round(height));
                exportFormat.tileScale = tileScale;
            };

            // Parameters of the export
            $scope.params.exportFormat = {
                paperSize: "A4",
                orientation: "LANDSCAPE",
                fileType: "PDF",
                width: 1920,
                height: 1358,
                tileScale: 1,
            };
            let exportFormat = $scope.params.exportFormat;

            // Restore values from LocalStorage if they have been saved
            let savedFileType = localStorage.getItem("dku.flow.export.fileType");
            if (savedFileType && $scope.fileTypes.indexOf(savedFileType) >= 0) {
                exportFormat.fileType = savedFileType;
            }
            let savedPaperSize = localStorage.getItem("dku.flow.export.paperSize");
            if (savedPaperSize && $scope.paperSizeMap[savedPaperSize]) {
                exportFormat.paperSize = savedPaperSize;
            }
            if (savedPaperSize == "CUSTOM") {
                let savedWidth = localStorage.getItem("dku.flow.export.width");
                if (savedWidth && !isNaN(Number(savedWidth))) {
                    exportFormat.width = capWidth(Number(savedWidth));
                }
                let savedHeight = localStorage.getItem("dku.flow.export.height");
                if (savedHeight && !isNaN(Number(savedHeight))) {
                    exportFormat.height = capHeight(Number(savedHeight));
                }
            } else {
                let savedOrientation = localStorage.getItem("dku.flow.export.orientation");
                if (savedOrientation && $scope.orientationMap[savedOrientation]) {
                    exportFormat.orientation = savedOrientation;
                }
            }
            if (exportFormat.paperSize != "CUSTOM") {
                // Choose the best width & height and compute the tile scale
                setBestDimensions();
            }
            $scope.tileScale = {};
            $scope.tileScale.enabled = exportFormat.tileScale > 1;
            $scope.tileScale.percentage = exportFormat.tileScale * 100;
            $scope.tileScale.sheets = computeTileScaleSheets(exportFormat.width, exportFormat.height, exportFormat.tileScale);

            let onUpdatePaperSizeOrOrientation = function() {
                setBestDimensions();
                let exportFormat = $scope.params.exportFormat;
                $scope.tileScale.enabled = exportFormat.tileScale > 1;
                $scope.tileScale.percentage = exportFormat.tileScale * 100;
                $scope.tileScale.sheets = computeTileScaleSheets(exportFormat.width, exportFormat.height, exportFormat.tileScale);
            };

            $scope.$watch('params.exportFormat.paperSize', function (newVal, oldVal) {
                if (newVal !== oldVal && newVal != 'CUSTOM') {
                    onUpdatePaperSizeOrOrientation();
                }
            });

            $scope.$watch('params.exportFormat.orientation', function (newVal, oldVal) {
                if (newVal !== oldVal) {
                    onUpdatePaperSizeOrOrientation();
                }
            });

            $scope.$watch('params.exportFormat.width', function (newVal, oldVal) {
                if (newVal !== oldVal) {
                    let exportFormat = $scope.params.exportFormat;
                    $scope.tileScale.sheets = computeTileScaleSheets(exportFormat.width, exportFormat.height, exportFormat.tileScale);
                }
            });

            $scope.$watch('params.exportFormat.height', function (newVal, oldVal) {
                if (newVal !== oldVal) {
                    let exportFormat = $scope.params.exportFormat;
                    $scope.tileScale.sheets = computeTileScaleSheets(exportFormat.width, exportFormat.height, exportFormat.tileScale);
                }
            });

            $scope.$watch('tileScale.enabled', function (newVal, oldVal) {
                if (newVal !== oldVal) {
                    let exportFormat = $scope.params.exportFormat;
                    if (newVal == true) {
                        // Try to keep the DPI of exported images around 300 dpi
                        if (exportFormat.paperSize != "CUSTOM") {
                            let dpi = Math.max(exportFormat.width, exportFormat.height) / GRAPHIC_EXPORT_OPTIONS.paperInchesMap[exportFormat.paperSize];
                            if (dpi > $scope.maxDpi) {
                                exportFormat.width = capWidth(Math.round(exportFormat.width * $scope.maxDpi / dpi));
                                exportFormat.height = capHeight(Math.round(exportFormat.height * $scope.maxDpi / dpi));
                            }
                        }
                        $scope.tileScale.percentage = computeBestTileScale(exportFormat.width, exportFormat.height) * 100;
                        exportFormat.tileScale = computeTileScale($scope.tileScale);
                    } else {
                        if (exportFormat.paperSize != "CUSTOM") {
                            setBestDimensions(false);
                        } else {
                            exportFormat.tileScale = 1;
                        }
                    }

                }
            });
            $scope.$watch('tileScale.percentage', function (newVal, oldVal) {
                if (newVal !== oldVal) {
                    let exportFormat = $scope.params.exportFormat;
                    exportFormat.tileScale = computeTileScale($scope.tileScale);
                    $scope.tileScale.sheets = computeTileScaleSheets(exportFormat.width, exportFormat.height, exportFormat.tileScale);
                }
            });
        }
    }
});

app.controller("ExportFlowModalController", function($scope, DataikuAPI, ActivityIndicator, FutureProgressModal, WT1) {
    $scope.init = function (projectKey, graphBoundaries) {
        $scope.params = {};
        $scope.modalTitle = "Export Flow graph";
        $scope.projectKey = projectKey;
        $scope.graphBoundaries = graphBoundaries;
    };

    $scope.doExportFlow = function() {
        WT1.event("flow-exported", {
            format: $scope.params.exportFormat
        });

        // Duplicate export format and add the zones export information
        let exportFormat = JSON.parse(JSON.stringify($scope.params.exportFormat));
        exportFormat.drawZones = $scope.drawZones.drawZones;
        exportFormat.collapsedZones = $scope.collapsedZones;

        // Save options into LocalStorage to use them again for next export
        localStorage.setItem("dku.flow.export.fileType", exportFormat.fileType);
        localStorage.setItem("dku.flow.export.paperSize", exportFormat.paperSize);
        if (exportFormat.paperSize === "CUSTOM") {
            localStorage.setItem("dku.flow.export.width", exportFormat.width);
            localStorage.setItem("dku.flow.export.height", exportFormat.height);
        } else {
            localStorage.setItem("dku.flow.export.orientation", exportFormat.orientation);
        }

        // Export the flow
        DataikuAPI.flow.export($scope.projectKey, exportFormat)
            .error(setErrorInScope.bind($scope))
            .success(function (resp) {
                FutureProgressModal.show($scope, resp, "Export Flow graph").then(function (result) {
                    if (result) { // undefined in case of abort
                        downloadURL(DataikuAPI.flow.getExportURL(result.projectKey, result.exportId));
                        ActivityIndicator.success("Flow graph export downloaded!", 5000);
                    } else {
                        ActivityIndicator.error("Export Flow failed", 5000);
                    }
                    $scope.resolveModal();
                });
            });
    }
});

app.directive('flowFilter', function ($stateParams, DataikuAPI,$rootScope,$timeout,CreateModalFromTemplate,Dialogs,FlowFilterQueryService) {

    return {
        controller: function ($scope) {

            function processLoadFlowResponse (response) {
                $scope.processLoadFlowResponse(response, undefined, undefined, true);
            }

            $scope.delete = function (id) {
                Dialogs.confirmSimple($scope, 'Delete filter?').then(function () {
                    DataikuAPI.flow.deleteFlowFilter($stateParams.projectKey, id, $scope.drawZones.drawZones, $stateParams.zoneId, $scope.collapsedZones)
                        .success(response => {
                            processLoadFlowResponse(response);
                            $scope.resetFilter($scope.filtering.activeFilter.isAdvanced);
                        })
                        .error(setErrorInScope.bind($scope));
                });

            };
            $scope.revertDirtyFilter = function (id) {
                Dialogs.confirmSimple($scope, 'Discard changes?').then(function () {
                    DataikuAPI.flow.revertDirtyFilter($stateParams.projectKey, id, $scope.drawZones.drawZones, $stateParams.zoneId, $scope.collapsedZones)
                        .success(processLoadFlowResponse)
                        .error(setErrorInScope.bind($scope));
                });

            };

            $scope.showEditNameModal = function(isSaveAs) {
                CreateModalFromTemplate("/templates/flow-editor/fragments/flow-filter-save-modal.html", $scope, null, function (newScope) {
                    newScope.isSaveAs = isSaveAs;
                    newScope.filter = angular.copy($scope.filtering.activeFilter);
                });
            }

            $scope.showModalIfNeededAndSave = function (isSaveAs) {
                if (!$scope.filtering.activeFilter.id || $scope.filtering.activeFilter.isDirty && !$scope.filtering.activeFilter.name || isSaveAs) {
                    $scope.showEditNameModal(isSaveAs);
                } else {
                    $scope.save($scope.filtering.activeFilter,isSaveAs);
                }
            };

            $scope.applyFilterOrHandleError = function() {
                const filteringResults = $scope.filtering.filteringResults;
                if (filteringResults && filteringResults.filteredGraphElements && !filteringResults.filteringError) {
                    $scope.applyNodeFiltering(filteringResults.filteredGraphElements);
                } else {
                    $scope.applyNodeFiltering(Object.keys($scope.nodesGraph.nodes));
                }
            }

            $scope.applyFilter = function () {
                $scope.filtering.activeFilter.query = $scope.filtering.activeFilter.isAdvanced ? $scope.filtering.activeFilter.advancedFilter : uiFilterToQuery();
                DataikuAPI.flow.applyFlowFilter($stateParams.projectKey, $scope.filtering.activeFilter, $scope.drawZones.drawZones, $stateParams.zoneId, $scope.collapsedZones)
                    .success(processLoadFlowResponse)
                    .error(setErrorInScope.bind($scope));
            };

            $scope.save = function (filter, isSaveAs) {
                $scope.filtering.activeFilter.query = $scope.filtering.activeFilter.isAdvanced ? $scope.filtering.activeFilter.advancedFilter : uiFilterToQuery();
                filter.id = isSaveAs ? null : $scope.filtering.activeFilter.id;
                DataikuAPI.flow.saveProjectFlowFilter($stateParams.projectKey, filter, $scope.drawZones.drawZones, $stateParams.zoneId, $scope.collapsedZones)
                    .success(function (response) {
                        processLoadFlowResponse(response);
                        $scope.hidePopover();
                        $('.dbt-tooltip').remove();
                    })
                    .error(setErrorInScope.bind($scope));
            };

            $scope.resetFilterWithWarning = function (isAdvanced) {
                const dirtyFilter= $scope.filtering.filters.find(f => f.isDirty);
                if (dirtyFilter){
                    Dialogs.confirmSimple($scope, 'There is an unsaved filter, changes will be discarded').then(function () {
                        $scope.resetFilter(isAdvanced);
                        $scope.applyFilter();
                    });
                } else {
                    $scope.resetFilter(isAdvanced);
                    $scope.applyFilter();
                }
            };

            $scope.filtering.pickerFormat = FlowFilterQueryService.pickerFormat;

            function uiFilterToQuery() {
                return FlowFilterQueryService.uiFilterToQuery($scope.filtering.activeFilter.structuredFlowObjectFilter, $scope.filtering.pickerFormat);
            }

            $scope.changeMode = function () {
                $scope.filtering.activeFilter.isAdvanced = !$scope.filtering.activeFilter.isAdvanced;
                if (!$scope.filtering.activeFilter.advancedFilter) {
                    $scope.filtering.activeFilter.advancedFilter = uiFilterToQuery();
                }
            };

            $scope.onFilterChange = function (filter) {
                if (filter.id === $scope.filtering.activeFilter.id) {
                    return
                }

                function __doConfirm() {
                    $scope.filtering.activeFilter = filter;
                    if ($scope.filtering.activeFilter) {
                        DataikuAPI.flow.activateFlowFilter($stateParams.projectKey, $scope.filtering.activeFilter.id, $scope.drawZones.drawZones, $stateParams.zoneId, $scope.collapsedZones)
                            .success(processLoadFlowResponse)
                            .error(setErrorInScope.bind($scope));
                    }
                }

                if ($scope.filtering.filters.find(f => f.isDirty)) {
                    Dialogs.confirm($scope, 'Erase filter?', 'Switching to another filter will erase your unsaved changes.  Do you want to continue?').then(function () {
                        __doConfirm();
                    });
                } else {
                    __doConfirm();
                }


            };

            $scope.projectKey = $stateParams.projectKey;

            $scope.filteringOptions = {
                selectors: [
                    {value: "tag:", label: "Tags"},
                    {value: "user:", label: "Users"},
                    {value: "createdBetween:", label: "Created"},
                    {value: "modifiedBetween:", label: "Modified"}
                ],
                values: {}
            };

            $scope.$watchCollection('[filtering.pickerStartCreationDate,filtering.pickerEndCreationDate]', function () {
                if ($scope.filtering.activeFilter) {
                    $scope.filtering.activeFilter.structuredFlowObjectFilter.customCreationDateRange.from = $scope.filtering.pickerStartCreationDate && moment($scope.filtering.pickerStartCreationDate, $scope.filtering.pickerFormat).toDate().getTime() || null;
                    $scope.filtering.activeFilter.structuredFlowObjectFilter.customCreationDateRange.to = $scope.filtering.pickerEndCreationDate && moment($scope.filtering.pickerEndCreationDate, $scope.filtering.pickerFormat).toDate().getTime() || null;
                }
            });

            $scope.$watchCollection('[filtering.pickerStartModificationDate,filtering.pickerEndModificationDate]', function () {
                if ($scope.filtering.activeFilter) {
                    $scope.filtering.activeFilter.structuredFlowObjectFilter.customModificationDateRange.from = $scope.filtering.pickerStartModificationDate && moment($scope.filtering.pickerStartModificationDate, $scope.filtering.pickerFormat).toDate().getTime() || null;
                    $scope.filtering.activeFilter.structuredFlowObjectFilter.customModificationDateRange.to = $scope.filtering.pickerEndModificationDate && moment($scope.filtering.pickerEndModificationDate, $scope.filtering.pickerFormat).toDate().getTime() || null;
                }
            });

            $scope.filterTypeOrderFunction = function (filter) {
                if (filter.scope === 'BUILT_IN') return 0;
                if (filter.isDirty && !filter.name) return 1;
                if (filter.scope === 'SHARED') return 2;
                return Infinity;
            }

            $scope.customSuggests = {
                "name:": ['REGEXP'],
                "tag:": $scope.filtering.flowFilteringFacetData.tagsStatistics.map(e => FlowFilterQueryService.escapeStr(e.key)).sort(),
                "user:": $scope.filtering.flowFilteringFacetData.usersStatistics.map(e => FlowFilterQueryService.escapeStr(e.key)).sort(),
                "type:": $scope.filtering.flowFilteringFacetData.elementIdsTypeStatistics.map(e => FlowFilterQueryService.escapeStr(e.key)).sort(),
                "datasetType:": $scope.filtering.flowFilteringFacetData.datasetTypeStatistics.map(e => FlowFilterQueryService.escapeStr(e.key)).sort(),
                "recipeType:": $scope.filtering.flowFilteringFacetData.recipeTypeStatistics.map(e => FlowFilterQueryService.escapeStr(e.key)).sort(),
            };

            $scope.suggestionSettings = {
                'REGEXP':         {suggestion: 'regular expression',    value: '',   shiftPosition: 0},
                'VALUE':          {suggestion: 'string',                value: '',   shiftPosition: 0},
                'ESCAPED_TEXT':   {suggestion: '"escaped string"',      value: '""', shiftPosition: 1},
                'DATE':           {suggestion: 'YYYY-MM-DD',            value: '',   shiftPosition: 0},
                'DATETIME':       {suggestion: 'YYYY-MM-DD HH:mm',      value: '',   shiftPosition: 0},
            };
            $scope.formatErrorMessage = function (error) {
                if (!error) {
                    return;
                }
                const expectedTokensString = !error.expectedTokens ? "" : error.expectedTokens.map(t => {
                    return t in $scope.suggestionSettings ? $scope.suggestionSettings[t]['suggestion'] : t;
                }).join(', ');
                return error.message + expectedTokensString;
            };
        },
        link:function (scope, element, attr) {

            $timeout(() => {
                $('.daterangepicker').on('click', function (e) {
                    e.stopPropagation();
                });
            });
        },
        templateUrl: '/templates/flow-editor/flow_filter.html'
    };
});

app.directive('advancedFilterInput', function () {
    return{
        link: function (scope, element, attr) {
            scope.typeaheadClass = attr.typeaheadClass;
            let lastCaretPosition;

            let typeahead, textarea;

            function overrideTypeahead() {
                typeahead = element.find('[bs-typeahead]').data('typeahead');
                textarea = element.find('textarea')[0];


                typeahead.lookup = function () {
                    typeahead.query = "";
                    return typeahead.process(scope.suggests);
                };

                typeahead.updater = function (val) {
                    let beforeCaret = scope.filtering.activeFilter.advancedFilter.substr(0, lastCaretPosition);
                    const afterCaret = scope.filtering.activeFilter.advancedFilter.substr(lastCaretPosition).trim();
                    (function (lastCaretPosition) {
                        setTimeout(function () {
                            textarea.focus();
                            let newPosition = lastCaretPosition + (scope.suggestionSettings[val] ? scope.suggestionSettings[val].shiftPosition : val.length + 1);
                            textarea.setSelectionRange(newPosition, newPosition);
                            if (scope.suggestionSettings[val] && scope.suggestionSettings[val].shiftPosition > 0) {
                                scope.updateSuggestions();
                            }
                        })
                    })(lastCaretPosition);
                    const offeringSymbol = FlowFilterParser.suggestTokens(beforeCaret).offeringSymbol;
                    if (offeringSymbol && val.toLowerCase().startsWith(offeringSymbol.toLowerCase())){
                        beforeCaret = beforeCaret.substr(0, beforeCaret.length - offeringSymbol.length);
                    }

                    if (val === 'AND' || val === 'OR') {
                        if (beforeCaret.length > 0 && beforeCaret.substr(-1) !== ' ') {
                            val = ' ' + val;
                        }
                        if (beforeCaret.length > 0 && afterCaret.substr(0, 1) !== ' ') {
                            val = val  + ' ' ;
                        }
                    }
                    let newValue = `${beforeCaret}${scope.suggestionSettings[val] ? scope.suggestionSettings[val].value : val}${afterCaret}`;

                    return newValue;

                };

                let superSelect = typeahead.select;
                typeahead.select = function () {
                    superSelect.call(typeahead);
                    scope.updateSuggestions();
                };
                let superKeyup = typeahead.keyup;
                typeahead.$element.off('keyup');
                typeahead.keyup = function (event) {
                    if (event.which === 13 && (event.ctrlKey)) {
                        event.stopPropagation();
                        scope.applyFilter();
                        return;
                    }
                    superKeyup.call(typeahead,event);
                    if (event.which !== 38 && event.which !== 40)
                        scope.updateSuggestions();
                };
                typeahead.$element.on('keyup', $.proxy(typeahead.keyup, typeahead));

                typeahead.render = function (items) {
                    let that = this;

                    items = $(items).map(function (i, item) {
                        i = $(that.options.item).attr('data-value', item);
                        if (scope.suggestionSettings[item]) {
                            i.find('a').html(`<i>${scope.suggestionSettings[item].suggestion}</i>`);
                        } else {
                            i.find('a').html(that.highlighter(item))
                        }
                        return i[0]
                    });
                    const emptySpace = $('<div class="empty-space" style="width:100%">');
                    emptySpace.on('mousedown', function (e) {
                        e.stopPropagation();
                        typeahead.$element.off('blur');
                    });
                    emptySpace.on('click', function (e) {
                        e.stopPropagation();
                        typeahead.hide();
                        typeahead.$element.on('blur', $.proxy(typeahead.blur, typeahead));
                    });
                    items.push(emptySpace[0]);
                    items.first().addClass('active');
                    this.$menu.html(items);
                    return this
                };
            }

            scope.updateSuggestions = function (event) {
                lastCaretPosition = textarea.selectionStart;
                const textBeforeCaret = !scope.filtering.activeFilter.advancedFilter ? "" : scope.filtering.activeFilter.advancedFilter.substr(0, lastCaretPosition);

                const suggestionResult = FlowFilterParser.suggestTokens(textBeforeCaret);
                const tokens = suggestionResult.tokens;

                if (tokens[tokens.length - 1] in scope.customSuggests) {
                    scope.suggests = scope.customSuggests[tokens[tokens.length - 1]]
                } else {
                    scope.suggests = suggestionResult.suggestions;
                }
                scope.suggests = scope.suggests.filter(e => !suggestionResult.offeringSymbol || suggestionResult.offeringSymbol == '<EOF>' ||  e.toLowerCase().startsWith(suggestionResult.offeringSymbol.toLowerCase()));
                typeahead.lookup();
                if (!typeahead.shown) {
                    typeahead.show();
                }
            };

            overrideTypeahead();
        },
        template:`<textarea rows="5" style="width: 100%"
                    bs-typeahead="suggests" class="{{typeaheadClass}}"
                    ng-keyup="updateSuggestions($event)"
                    ng-click="updateSuggestions($event)"
                    ng-trim="false"
                    ng-model="filtering.activeFilter.advancedFilter" min-length="0">
                  </textarea>`
    }
});

app.directive('facetFilterableList', function ($filter) {
    return {
        scope: {items: '=', model: '=facetFilterableList', showAllItems: '=?', orderBy:'@'},
        transclude: true,
        link: function (scope, element, attr) {
            if (attr.filterFunction) {
                scope.filterFunction = scope.$parent.$eval(attr.filterFunction);
            } else {
                scope.filterFunction = $filter('filter');
            }
            scope.model = scope.model || [];
            scope.onFacetSearchKeyDown = function (e) {
                if (e.keyCode === 27) { // ESC key
                    e.target.blur();
                    angular.element(e.target).scope().$parent.showInput = false;
                    angular.element(e.target).scope().$parent.facetValueSearch = '';
                }
            };
        },
        templateUrl: '/templates/flow-editor/facet-filterable-list.html'
    }
});


app.directive('multiItemsRightColumnSummary', function($controller, $rootScope, $stateParams,
    DataikuAPI, Fn, TaggableObjectsUtils, RecipeDescService, CodeEnvsService,
    FlowGraphSelection, FlowGraphFiltering, SelectablePluginsService, WatchInterestState) {

    return {
        templateUrl:'/templates/flow-editor/multi-items-right-column-summary.html',

        link: function(scope, element, attrs) {
            $controller('_TaggableObjectsMassActions', {$scope: scope});
            $controller('_TaggableObjectsCapabilities', {$scope: scope});

            const getType = attrs.singleType ? () => attrs.singleType : item => item.nodeType;
            const getSelectedItems = attrs.selectedItems ? () => scope.$eval(attrs.selectedItems) : FlowGraphSelection.getSelectedNodes;
            const newItemsWatch = attrs.selectedItems ? () => scope.$eval(attrs.selectedItems) : 'rightColumnItem';

            function getCountByNodeType(selectedNodes) {
                let ret = {};
                selectedNodes.forEach(function(item) {
                    const type = getType(item);
                    ret[type] = (ret[type] || 0) + 1;
                });
                return ret;
            }
            function getCountByTaggableType(selectedNodes) {
                let ret = {};
                selectedNodes.forEach(function(item) {
                    const taggableType = TaggableObjectsUtils.fromNodeType(getType(item));
                    ret[taggableType] = (ret[taggableType] || 0) + 1;
                });
                return ret;
            }

            scope.getTaggableTypeMap = function () {
                let ret = {};
                scope.getSelectedNodes().forEach(function (item) {
                    let type = TaggableObjectsUtils.fromNodeType(getType(item));
                    if (ret.hasOwnProperty(type)) {
                        ret[type].push(getSmartName(item));
                    } else {
                        ret[type] = [getSmartName(item)];
                    }
                })
                return ret;
            }

            function count(nodeType) {
                return scope.selection.countByNodeType[nodeType] || 0;
            }

            function selectedNodes() {
                return scope.selection.selectedObjects;
            }
            scope.getSelectedNodes = selectedNodes;

            function isAll(nodeTypes) {
                return function() {
                    const total = scope.selection.selectedObjects.length;
                    return total > 0 && nodeTypes.map(count).reduce(Fn.SUM) == total;
                };
            }
            function allHaveFlag(propName) {
                return function() {
                    const total = scope.selection.selectedObjects.length;
                    return total > 0 && scope.selection.selectedObjects.filter(Fn.prop(propName)).length == total
                };
            }
            scope.isAllRecipes = isAll(['RECIPE']);
            scope.isAllContinuousRecipes = allHaveFlag("continuous");
            scope.isAllDatasets = isAll(['LOCAL_DATASET', 'FOREIGN_DATASET']);
            scope.isAllFolders = isAll(['LOCAL_MANAGED_FOLDER', 'FOREIGN_MANAGED_FOLDER']);
            scope.isAllStreamingEndpoints = isAll(['LOCAL_STREAMING_ENDPOINT']);
            scope.isAllModels = isAll(['LOCAL_SAVEDMODEL', 'FOREIGN_SAVEDMODEL']);
            scope.isAllEvaluationStores = isAll(['LOCAL_MODELEVALUATIONSTORE', 'FOREIGN_MODELEVALUATIONSTORE']);
            scope.isAllZones = isAll(['ZONE']);
            scope.isAllProjects = isAll(['PROJECT']);
            scope.isAllLocal = isAll(['RECIPE', 'LOCAL_DATASET', 'LOCAL_MANAGED_FOLDER', 'LOCAL_SAVEDMODEL', 'LOCAL_MODELEVALUATIONSTORE']);
            scope.isAllForeign = isAll(['FOREIGN_DATASET', 'FOREIGN_MANAGED_FOLDER', 'FOREIGN_SAVEDMODEL', 'FOREIGN_MODELEVALUATIONSTORE']);
            scope.isAllComputables = isAll(['LOCAL_DATASET', 'FOREIGN_DATASET', 'LOCAL_MANAGED_FOLDER', 'FOREIGN_MANAGED_FOLDER', 'LOCAL_SAVEDMODEL', 'FOREIGN_SAVEDMODEL', 'LOCAL_MODELEVALUATIONSTORE', 'FOREIGN_MODELEVALUATIONSTORE']);
            scope.isAllDatasetsAndFolders = isAll(['LOCAL_DATASET', 'FOREIGN_DATASET', 'LOCAL_MANAGED_FOLDER', 'FOREIGN_MANAGED_FOLDER']);

            scope.getSingleSelectedDataset = function() {
                const candidates = selectedNodes().filter(({nodeType}) => ['LOCAL_DATASET', 'FOREIGN_DATASET'].includes(nodeType));
                return candidates.length == 1 ? candidates[0] : null;
            }

            scope.getSingleSelectedModel = function() {
                const candidates = selectedNodes().filter(({nodeType}) => ['LOCAL_SAVEDMODEL', 'FOREIGN_SAVEDMODEL'].includes(nodeType));
                return candidates.length == 1 ? candidates[0] : null;
            }

            scope.isPredictionModel = function() {
                return scope.singleSelectedModelInfos
                    && scope.singleSelectedModelInfos.model.miniTask.taskType == 'PREDICTION'
                    && scope.singleSelectedModelInfos.model.miniTask.backendType !== 'VERTICA';
            }

            scope.isClusteringModel = function() {
                return scope.singleSelectedModelInfos
                    && scope.singleSelectedModelInfos.model.miniTask.taskType == 'CLUSTERING'
                    && scope.singleSelectedModelInfos.model.miniTask.backendType !== 'VERTICA';
            }

            scope.isDatasetAndModel = function() {
                return selectedNodes().length == 2 && scope.getSingleSelectedDataset() && scope.getSingleSelectedModel();
            }

            scope.isAllMetastoreAware = function() {
                const total = selectedNodes().length;
                const hiveRecipes = selectedNodes().filter(n => TaggableObjectsUtils.isHDFSAbleType(n.datasetType)).length;
                return total > 0 && hiveRecipes == total;
            };
            scope.isAllImpalaRecipes = function() {
                const total = selectedNodes().length;
                const impalaRecipes = selectedNodes().filter(n => (n.recipeType||n.type) == 'impala').length;
                return total > 0 && impalaRecipes == total;
            };
            scope.isAllPythonCodeEnvSelectableRecipes = function() {
                const total = selectedNodes().length;
                const codeEnvSelectableRecipes = selectedNodes().filter(n => (n.recipeType||n.type) && CodeEnvsService.canPythonCodeEnv(n)).length;
                return total > 0 && codeEnvSelectableRecipes == total;
            };
            scope.isAllRCodeEnvSelectableRecipes = function() {
                const total = selectedNodes().length;
                const codeEnvSelectableRecipes = selectedNodes().filter(n => (n.recipeType||n.type) && CodeEnvsService.canRCodeEnv(n)).length;
                return total > 0 && codeEnvSelectableRecipes == total;
            };
            scope.isAllHiveRecipes = function() {
                const total = selectedNodes().length;
                const hiveRecipes = selectedNodes().filter(n => (n.recipeType||n.type) == 'hive').length;
                return total > 0 && hiveRecipes == total;
            };

            scope.isAllManaged = function() {
                const total = selectedNodes().length;
                const managed = selectedNodes().filter(n => n.managed).length;
                return total > 0 && managed == total;
            };
            scope.isAllWatched = function() {
                const total = selectedNodes().length;
                const watched = selectedNodes().filter(n => n.interest && WatchInterestState.isWatching(n.interest.watching)).length;
                return total > 0 && watched == total;
            };
            scope.isAllStarred = function() {
                const total = selectedNodes().length;
                const starred = selectedNodes().filter(n => n.interest && n.interest.starred).length;
                return total > 0 && starred == total;
            };
            scope.isAllVirtualizable = function() {
                return selectedNodes().map(x => !!x.virtualizable).reduce((a,b) => a && b, true);
            };

            scope.anyPipelineTypeEnabled = function() {
                return $rootScope.projectSummary.sparkPipelinesEnabled || $rootScope.projectSummary.sqlPipelinesEnabled;
            };

            function showVirtualizationAction(showDeactivate) {
                return function() {
                    return scope.isProjectAnalystRW()
                        && scope.isAllDatasets()
                        && scope.isAllLocal()
                        && showDeactivate === scope.isAllVirtualizable();
                }
            }
            scope.showAllowVirtualizationAction = showVirtualizationAction(false);
            scope.showStopVirtualizationAction = showVirtualizationAction(true);


            scope.anyMultiEngineRecipe = function() {
                function isMultiEngine(recipeType) {
                    const desc = RecipeDescService.getDescriptor(recipeType);
                    return !!desc && desc.isMultiEngine;
                }
                return !!selectedNodes().filter(node => isMultiEngine(node.recipeType||node.type)).length;
            };

            scope.anyImpala = function() {
                return !!selectedNodes().filter(n => (n.recipeType||n.type) == 'impala').length;
            };

            scope.anyHive = function() {
                return !!selectedNodes().filter(n => (n.recipeType||n.type) == 'hive').length;
            };

            scope.anyCanSpark = function() {
                return !!selectedNodes().filter(node => scope.canSpark(node)).length;
            };

            scope.allAreSparkNotSQLRecipes = function() {
                return selectedNodes().every(node => ['spark_scala','pyspark','sparkr'].indexOf(node.recipeType||node.type) >= 0);
            };

            scope.anyCanSparkPipeline = function() {
                return selectedNodes().some(node => scope.canSparkPipeline(node));
            };

            scope.anyCanSqlPipeline = function() {
                return selectedNodes().some(node => scope.canSqlPipeline(node));
            };

            scope.allAutoTriggersDisabled = function() {
                return scope.getAutoTriggerDisablingReason($rootScope.appConfig, $rootScope.projectSummary);
            };

            scope.autoTriggersObjects = function(autoTriggerStatus, objects) {
                objects.forEach(function(object){
                    object.active = autoTriggerStatus;
                    scope.toggleActive(object);
                })
            };

            scope.isAllUnshareable = function() {
                const total = selectedNodes().length;
                const unshareables = selectedNodes().filter(n => n.usedByZones && n.usedByZones.length && !n.successors.length).length;
                return total > 0 && unshareables == total;
            }

            scope.getSelectedObjectsZones = function() {
                return getSelectedItems().map(n => n.usedByZones[0]);
            }

            scope.getCommonZone = function () {
                const nodesSelected = selectedNodes();
                return nodesSelected.length ? nodesSelected[0].ownerZone : null;
            };

            function getSmartName(it) {
                return it.projectKey == $stateParams.projectKey ? it.name : it.projectKey+'.'+it.name;
            }
            scope.getSmartNames = function () {
                return selectedNodes().map(getSmartName);
            };

            scope.clearSelection = function() {
                FlowGraphSelection.clearSelection();
            };

            scope.refreshData = function() {
                let selectedNodes = getSelectedItems();
                scope.selection = {
                    selectedObjects: selectedNodes,
                    taggableType: TaggableObjectsUtils.getCommonType(selectedNodes, node => TaggableObjectsUtils.fromNodeType(getType(node))),
                    countByNodeType: getCountByNodeType(selectedNodes),
                    countByTaggableType: getCountByTaggableType(selectedNodes)
                };
                scope.usability = scope.computeActionsUsability();
                scope.selectablePlugins =  scope.isAllComputables(selectedNodes) ? SelectablePluginsService.listSelectablePlugins(scope.selection.countByTaggableType) : [];

                scope.singleSelectedDataset = scope.getSingleSelectedDataset();
                scope.refreshSingleSelectedModelInfos();
            };

            scope.refreshSingleSelectedModelInfos = function() {
                if(!scope.getSingleSelectedModel()) {
                    scope.singleSelectedModelInfos = null;
                    scope.singleSelectedModel = null;
                }
                if(scope.getSingleSelectedModel() == scope.singleSelectedModel) {
                    return;
                }
                scope.singleSelectedModel = scope.getSingleSelectedModel();
                scope.singleSelectedModelInfos = null;
                let projectKey = scope.singleSelectedModel.projectKey;
                let name = scope.singleSelectedModel.name;
                DataikuAPI.savedmodels.getFullInfo($stateParams.projectKey, getSmartName(scope.singleSelectedModel)).success(data => {
                    if (!scope.singleSelectedModel || scope.singleSelectedModel.projectKey != projectKey || scope.singleSelectedModel.name != name) {
                        return; // too late, the selected model has changed in the meantime
                    }
                    scope.singleSelectedModelInfos = data;
                    scope.singleSelectedModelInfos.zone = (scope.singleSelectedModel.usedByZones || [])[0] || scope.singleSelectedModel.ownerZone;
                }).error(setErrorInScope.bind(scope));
            };

            scope.filterSelection = function(taggableType) {
                FlowGraphSelection.filterByTaggableType(taggableType);
                scope.refreshData();
            }

            scope.refreshData();
            scope.$watch(newItemsWatch, scope.refreshData);

            scope.collapseSelectedZones = () => {
                scope.toggleZoneCollapse(FlowGraphSelection.getSelectedTaggableObjectRefs(), 'collapseAll');
            }

            scope.expandSelectedZones = () => {
                scope.toggleZoneCollapse(FlowGraphSelection.getSelectedTaggableObjectRefs(), 'expandAll');
            }

            scope.isAllZonesExpanded = function() {
                const allZones = scope.selection.selectedObjects.filter(so => getType(so) === 'ZONE');
                return allZones.filter(z => z.customData.isCollapsed === false).length === allZones.length;
            };

            scope.isAllZonesCollapsed = function() {
                const allZones = scope.selection.selectedObjects.filter(so => getType(so) === 'ZONE');
                return allZones.filter(z => z.customData.isCollapsed === true).length === allZones.length;
            };
        }
    }
});


app.controller('_FlowContextMenus', function($scope, $state, $stateParams, $controller, WT1, GlobalProjectActions, FlowGraph, FlowGraphSelection, FlowGraphFolding, TaggableObjectsUtils) {

    WT1.event("flow-context-menu-open");

    $controller('_TaggableObjectsCapabilities', {$scope: $scope});
    $controller('_TaggableObjectsMassActions', {$scope: $scope});

    $scope.toggleTab = tabName => {
        FlowGraphSelection.clearSelection();
        FlowGraphSelection.onItemClick($scope.object);

       $scope.standardizedSidePanel.toggleTab(tabName);
    };

    $scope.getSelectedTaggableObjectRefs = function() {
        return [TaggableObjectsUtils.fromNode($scope.object)];
    };

    $scope.computeMovingImpact = function() {
        let realNode = $scope.object.usedByZones.length ? FlowGraph.node(`zone__${$scope.object.ownerZone}__${$scope.object.realId}`) : $scope.object;
        var computedImpact = [];
        function addSuccessors(node) {
            if (node.nodeType != "RECIPE") return;
            let successors = node.successors;
            successors.forEach(function(successor) {
                if (successor == realNode.id) return;
                computedImpact.push(TaggableObjectsUtils.fromNode(FlowGraph.node(successor)));
            });
        }

        let predecessor = realNode.predecessors[0];
        if (predecessor && realNode.nodeType != "RECIPE" && !realNode.isHiddenLinkTarget) {
            computedImpact.push(TaggableObjectsUtils.fromNode(FlowGraph.node(predecessor)));
            addSuccessors(FlowGraph.node(predecessor));
        }

        addSuccessors(realNode);
        return computedImpact;
    }

    $scope.zoomToOtherZoneNode = function(zoneId) {
        const otherNodeId = $scope.object.id.replace(/zone__.+?__/, "zone__" + zoneId + "__");
        if ($stateParams.zoneId) {
            $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId, id: graphVizUnescape(otherNodeId) }));
        }
        else {
            $scope.zoomGraph(otherNodeId);
            FlowGraphSelection.clearSelection();
            FlowGraphSelection.onItemClick($scope.nodesGraph.nodes[otherNodeId]);
        }
    }

    $scope.$state = $state;
    $scope.$stateParams = $stateParams;
    $scope.othersZones = FlowGraph.nodeSharedBetweenZones($scope.object) ? Array.from(FlowGraph.nodeSharedBetweenZones($scope.object)) : null;

    $scope.startPropagateToolFromRecipe = function(node) {
        const predecessorNodeId = node.predecessors[0];
        const predecessorNode = FlowGraph.get().nodes[predecessorNodeId];
        $scope.startTool('PROPAGATE_SCHEMA', {projectKey: predecessorNode.projectKey, datasetName: predecessorNode.name});
    }

    $scope.selectSuccessors = function() {
        WT1.event("flow-context-menu-select-successors");
        FlowGraphSelection.selectSuccessors($scope.object);
    };

    $scope.selectPredecessors = function() {
        WT1.event("flow-context-menu-select-predecessors");
        FlowGraphSelection.selectPredecessors($scope.object);
    };

    $scope.hasPredecessorsInOtherZone = function(object) {
        return !$stateParams.zoneId && FlowGraphSelection.hasPredecessorsInOtherZone(object);
    }

    $scope.hasSuccessorsInOtherZone = function(object) {
        return !$stateParams.zoneId && FlowGraphSelection.hasSuccessorsInOtherZone(object);
    }

    $scope.foldSuccessors = function() {
        WT1.event("flow-context-menu-fold", {direction:'successors'});
        FlowGraphFolding.foldSuccessors($scope.object);
    };

    $scope.foldPredecessors = function() {
        WT1.event("flow-context-menu-fold", {direction: 'predecessors'});
        FlowGraphFolding.foldPredecessors($scope.object);
    };

    $scope.previewSelectSuccessors = function(object) {
        FlowGraphFolding.previewSelect($scope.object, "successors");
    };

    $scope.previewSelectPredecessors = function(object) {
        FlowGraphFolding.previewSelect($scope.object, "predecessors");
    };

    $scope.previewFoldSuccessors = function(object) {
        FlowGraphFolding.previewFold($scope.object, "successors");
    };

    $scope.previewFoldPredecessors = function(object) {
        FlowGraphFolding.previewFold($scope.object, "predecessors");
    };

    $scope.endPreviewBranch = function() {
        FlowGraphFolding.endPreviewBranch();
    };

    $scope.deleteFlowItem = function() {
        WT1.event('flow-context-menu-delete');

        const type = TaggableObjectsUtils.fromNodeType($scope.object.nodeType);
        const id = $scope.object.name;
        const displayName = $scope.object.description;
        GlobalProjectActions.deleteTaggableObject($scope, type, id, displayName)
            .then(FlowGraphSelection.clearSelection);
    };
});


app.controller("SavedModelContextualMenuController", function($scope, $controller, WT1, DatasetsService) {
    $controller('_FlowContextMenus', {$scope: $scope});

    $scope.trainThisModel = function() {
        WT1.event('flow-context-menu-train');
        $scope.trainModel($scope.object.projectKey, $scope.object.name);
    };
});

app.controller("ModelEvaluationStoreContextualMenuController", function($scope, $controller, WT1, DatasetsService) {
    $controller('_FlowContextMenus', {$scope: $scope});
});


app.controller("ManagedFolderContextualMenuController", function($scope, $controller, WT1) {
    $controller('_FlowContextMenus', {$scope: $scope});

    $scope.buildThis = function() {
        WT1.event('flow-context-menu-build');
        $scope.buildManagedFolder($scope.object.projectKey, $scope.object.id);
    };
});


app.controller("ZoneContextualMenuController", function($scope, $rootScope, $controller, WT1, DataikuAPI, TaggableObjectsUtils, $stateParams, CreateModalFromTemplate, FlowGraph) {
    $controller('_FlowContextMenus', {$scope: $scope});

    $scope.deleteZone = () => {
        DataikuAPI.flow.zones.delete($stateParams.projectKey, $scope.object.name).success(() => {
            if ($stateParams.zoneId) {
                $scope.zoomOutOfZone();
            } else {
                $scope.$emit('reloadGraph');
            }
        }).error(setErrorInScope.bind($scope));
    };

    $scope.openZone = items => {
        const zoneToOpen = items.map(ref => ref.id)[0];
        $scope.zoomOnZone(zoneToOpen);
    }

    $scope.collapseAllZones = () => {
        const allFlowZones = Object.values(FlowGraph.get().nodes).filter(it => TaggableObjectsUtils.fromNodeType(it.nodeType) === 'FLOW_ZONE');
        $scope.toggleZoneCollapse(allFlowZones.map(TaggableObjectsUtils.fromNode), 'collapseAll');
    }

    $scope.expandAllZones = () => {
        const allFlowZones = Object.values(FlowGraph.get().nodes).filter(it => TaggableObjectsUtils.fromNodeType(it.nodeType) === 'FLOW_ZONE');
        $scope.toggleZoneCollapse(allFlowZones.map(TaggableObjectsUtils.fromNode), 'expandAll');
    }

    $scope.collapseSelectedZones = () => {
        $scope.toggleZoneCollapse(FlowGraphSelection.getSelectedTaggableObjectRefs(), 'collapseAll');
    }

    $scope.expandSelectedZones = () => {
        $scope.toggleZoneCollapse(FlowGraphSelection.getSelectedTaggableObjectRefs(), 'expandAll');
    }

    $scope.editZone = () => {
        CreateModalFromTemplate("/templates/zones/edit-zone-box.html", $scope, null, function(newScope){
            newScope.zoneName = $scope.object.description;
            newScope.uiState = {
                stockColors: ["#C82423","#8C2DA7","#31439C","#087ABF","#0F786B","#4B8021","#F9BE40","#C54F00","#D03713","#465A64"],
                newColor: $scope.object.customData.color,
                newName: $scope.object.description
            };

            newScope.pickStockColor = color => {
                newScope.uiState.newColor = color;
            };

            newScope.go = function(){
                DataikuAPI.flow.zones.edit($stateParams.projectKey, $scope.object.name, newScope.uiState.newName, newScope.uiState.newColor).success(function () {
                    $scope.$emit('reloadGraph');
                    if ($stateParams.zoneId) {
                        $rootScope.$emit("zonesListChanged", newScope.uiState.newName);
                    }
                    newScope.dismiss()
                }).error(setErrorInScope.bind(newScope));
            }
        });
    }
});


app.controller("DatasetContextualMenuController", function($scope, $rootScope, $controller, WT1, DataikuAPI, TaggableObjectsUtils) {
    $controller('_FlowContextMenus', {$scope: $scope});

    $scope.buildThisDataset = function() {
        WT1.event('flow-context-menu-build');
        $scope.buildDataset($scope.object.projectKey, $scope.object.name);
    };

    $scope.markAsBuilt = function() {
        WT1.event('flow-context-menu-mark-as-built');
        DataikuAPI.datasets.markAsBuilt([TaggableObjectsUtils.fromNode($scope.object)]).then(function() {
            $rootScope.$emit('reloadGraph');
        }, setErrorInScope.bind($scope));
    };
});


app.controller("ForeignDatasetContextualMenuController", function($scope, $controller, $state, WT1, DataikuAPI) {
    $controller('_FlowContextMenus', {$scope: $scope});
});


app.controller("StreamingEndpointContextualMenuController", function($scope, $rootScope, $controller, WT1, DataikuAPI, TaggableObjectsUtils) {
    $controller('_FlowContextMenus', {$scope: $scope});
});

app.controller("RecipeContextualMenuController", function($scope, $controller, $stateParams, WT1, ComputableSchemaRecipeSave) {
    $controller('_FlowContextMenus', {$scope: $scope});

    $scope.propagateSchema = function() {
        WT1.event('flow-context-menu-propagate-schema');
        ComputableSchemaRecipeSave.handleSchemaUpdateFromAnywhere($scope, $stateParams.projectKey, $scope.object.name)
    }
});


app.controller("SavedModelContextualMenuController", function ($scope, $controller) {
    $controller('_FlowContextMenus', {$scope: $scope});

});

app.controller("ModelEvaluationStoreContextualMenuController", function ($scope, $controller) {
    $controller('_FlowContextMenus', {$scope: $scope});

});


app.controller("MultiContextualMenuController", function($scope, $controller, WT1, FlowGraphSelection, FlowGraphFolding, TaggableObjectsService, TaggableObjectsUtils, FlowGraph) {
    $controller('_FlowContextMenus', {$scope: $scope});

    $controller('_TaggableObjectsMassActions', {$scope: $scope});
    $controller('_TaggableObjectsCapabilities', {$scope: $scope});

    $scope.getSelectedTaggableObjectRefs = FlowGraphSelection.getSelectedTaggableObjectRefs;

    $scope.computeMovingImpact = function() {
        var computedImpact = [];
        var movingItems = FlowGraphSelection.getSelectedTaggableObjectRefs();

        function addSuccessors(node, original) {
            if (node.nodeType != "RECIPE") return;
            node.successors.forEach(function(successor) {
                let newTaggableObjectRef = TaggableObjectsUtils.fromNode(FlowGraph.node(successor));
                if (original && successor == original.id || movingItems.filter(it => it.id == newTaggableObjectRef.id).length) return;
                computedImpact.push(newTaggableObjectRef);
            });
        }
        function computeImpact(node) {
            let predecessor = node.predecessors[0];
            if (predecessor && node.nodeType != "RECIPE") {
                let newTaggableObjectRef = TaggableObjectsUtils.fromNode(FlowGraph.node(predecessor));
                if (computedImpact.filter(it => it.id == newTaggableObjectRef.id).length) return;
                if (!movingItems.filter(it => it.id == newTaggableObjectRef.id).length) {
                    computedImpact.push(newTaggableObjectRef);
                }
                addSuccessors(FlowGraph.node(predecessor), node);
            }

            addSuccessors(node);
        }

        FlowGraphSelection.getSelectedNodes().forEach(function(node) {
            let realNode = node.usedByZones.length ? FlowGraph.node(`zone__${node.ownerZone}__${node.realId}`) : node;
            computeImpact(realNode);
        });
        return computedImpact;
    }

    $scope.selectedObjectsZones = FlowGraphSelection.getSelectedNodes().map(n => n.usedByZones[0]);

    $scope.deleteFlowItems = function() {
        WT1.event('flow-context-menu-delete-multi');

        TaggableObjectsService.delete(FlowGraphSelection.getSelectedTaggableObjectRefs())
            .then(FlowGraphSelection.clearSelection);
    };

    $scope.selectSuccessors = function() {
        WT1.event("flow-context-menu-select-successors-multi");
        FlowGraphSelection.getSelectedNodes().forEach(FlowGraphSelection.selectSuccessors);
    };

    $scope.selectPredecessors = function() {
        WT1.event("flow-context-menu-select-predecessors-multi");
        FlowGraphSelection.getSelectedNodes().forEach(FlowGraphSelection.selectPredecessors);
    };

    $scope.havePredecessors = false;
    $scope.haveSuccessors = false;
    $scope.anyLocalDataset = false;
    $scope.anyLocalFolder = false;
    $scope.anyLocalComputable = false;
    $scope.anyRecipe = false;
    $scope.anyNonVirtualizable = false;
    $scope.anyCanSpark = false;
    $scope.anyCanChangeConnection = false;
    $scope.allShareable = true;
    $scope.allUnshareable = true;
    $scope.isAllZonesCollapsed = true;
    $scope.isAllZonesExpanded = true;

    FlowGraphSelection.getSelectedNodes().forEach(function(node) {
        if (node.nodeType.startsWith('LOCAL')) {
            $scope.anyLocalComputable = true;
        }
        if (node.nodeType == 'LOCAL_DATASET') {
            $scope.anyLocalDataset = true;
            if (!node.virtualizable) {
                $scope.anyNonVirtualizable = true;
            }
        }
        if (node.nodeType == 'LOCAL_MANAGED_FOLDER') {
            $scope.anyLocalFolder = true;
        }
        if (node.nodeType == 'RECIPE') {
            $scope.anyRecipe = true;
            if ($scope.canSpark(node)) {
                $scope.anyCanSpark = true;
            }
        }
        if (node.predecessors.length) {
            $scope.havePredecessors = true;
        }
        if (node.successors.length) {
            $scope.haveSuccessors = true;
        }
        if (["ZONE","RECIPE"].includes(node.nodeType)) {
            $scope.allShareable = false;
        }
        if (!node.usedByZones.length || node.successors.length) {
            $scope.allUnshareable = false;
        }
        if (node.nodeType == "ZONE" && !node.customData.isCollapsed) {
            $scope.isAllZonesCollapsed = false;
        }
        if (node.nodeType == "ZONE" && node.customData.isCollapsed) {
            $scope.isAllZonesExpanded = false;
        }

        $scope.anyCanChangeConnection = $scope.anyCanChangeConnection || $scope.canChangeConnection(node);
    })

});

app.service('FlowFilterQueryService', function() {
    const svc = this;

    this.escapeStr = function (string) {
        if (string.includes(' ') || string.includes('"') || string.includes(':')) {
            return `"${string.replace(/"/g, '\\"')}"`
        }
        return string;
    };

    function uiFilterArrayToQueryClause(elements, key) {
        if (!elements) return;
        const resultString = elements.map(el => key + svc.escapeStr(el)).join(' OR ');
        return elements.length > 1 ? `(${resultString})` : resultString;
    }

    this.pickerFormat = "YYYY-MM-DD HH:mm";

    const queryClauseOrNull = (types, type) => types && types.includes(type) ? uiFilterArrayToQueryClause([type], "type:"): null;

    this.uiFilterToQuery = function(structuredFlowObjectFilter) {

        function formatDate(date) {
            return moment(date).format(svc.pickerFormat);
        }

        const creationDate = structuredFlowObjectFilter.customCreationDateRange;
        const modificationDate = structuredFlowObjectFilter.customModificationDateRange;

        let createdRangeClause;
        let modifiedRangeClause;
        if (structuredFlowObjectFilter.creationDateRange) {
            if (structuredFlowObjectFilter.creationDateRange === 'CUSTOM') {
                createdRangeClause = creationDate && creationDate.from && creationDate.to ? `createdBetween:${formatDate(creationDate.from)} / ${formatDate(creationDate.to)}` : null;
            } else {
                createdRangeClause = `created:${structuredFlowObjectFilter.creationDateRange}`;
            }
        }
        if (structuredFlowObjectFilter.modificationDateRange) {
            if (structuredFlowObjectFilter.modificationDateRange === 'CUSTOM') {
                modifiedRangeClause = modificationDate && modificationDate.from && modificationDate.to ? `modifiedBetween:${formatDate(modificationDate.from)} / ${formatDate(modificationDate.to)}` : null;
            } else {
                modifiedRangeClause = `modified:${structuredFlowObjectFilter.modificationDateRange}`;
            }
        }
        const datasetTypeClause = uiFilterArrayToQueryClause(structuredFlowObjectFilter.datasetTypes, "datasetType:");
        const recipeTypeClause = uiFilterArrayToQueryClause(structuredFlowObjectFilter.recipeTypes, "recipeType:");

        const recipeClauseArr = [queryClauseOrNull(structuredFlowObjectFilter.types, 'RECIPE'), recipeTypeClause].filter(e=>e);
        const recipeClause = recipeClauseArr.length > 1 ? `(${recipeClauseArr.join(' AND ')})` : recipeClauseArr.join(' AND ');
        const datasetClauseArr = [queryClauseOrNull(structuredFlowObjectFilter.types, 'DATASET'), datasetTypeClause].filter(e=>e);
        const datasetClause = datasetClauseArr.length > 1 ? `(${datasetClauseArr.join(' AND ')})` : datasetClauseArr.join(' AND ');

        const typeClauses = structuredFlowObjectFilter.types.filter(e => (e !== 'RECIPE' && e !== 'DATASET')).map(e => uiFilterArrayToQueryClause([e], "type:"));
        const typeWithRefinements = [...typeClauses,recipeClause, datasetClause].filter(e=>e);

        let typeWithRefinementClause = typeWithRefinements.join(' OR ');
        if (typeWithRefinements.length > 1){
            typeWithRefinementClause = `(${typeWithRefinementClause})`
        }

        return [
            uiFilterArrayToQueryClause(structuredFlowObjectFilter.tags, "tag:"),
            uiFilterArrayToQueryClause(structuredFlowObjectFilter.creator, "user:"),
            typeWithRefinementClause,
            createdRangeClause,
            modifiedRangeClause
        ].filter(e => e).join(' AND ');
    }
});

})();
