(function() {
'use strict';

    /**
     * Directives and functions for the main flow graphs
     * (flow, inter project graph and job preview subgraph)
     */


    const app = angular.module('dataiku.flow.graph', []);

    app.service('GraphZoomTrackerService', function($timeout, $stateParams, localStorageService) {
        // GraphZoomTrackerService tracks the context needed to restore the zoom level, window position and focussed item when returning to the
        // flow view screen.  The zoomCtx (zoom-context) is persisted in local storage and comprises:
        // - focusItem: details of the last focused node, as tracked by the service.
        // - panzoom: $scope.panzoom context managed by the flowGraph directive, an extended version of the viewBox dimensions of the SVG flow graph element
        // - nodeCount: the number of node in the whole flow

        const svc = this;
        const lsKeyPrefix = "zoomCtx-";
        let zoomCtxKeyLoaded = "";
        let currentCtx = {};
        let disabled = false;

        svc.disable = function(disable = true) {
            disabled = disable;
        }

        svc.isEnabled = function() {
            return !disabled;
        }

        function zoneId() {
            return $stateParams.zoneId ? $stateParams.zoneId : "";
        }

        function projectKey() {
            return $stateParams.projectKey;
        }

        function zoomCtxKey() { // the key to access the zoomCtx in local storage
            return lsKeyPrefix + projectKey() + zoneId();
        }

        /*
            * currentCtx management: loading it from local storage / cleaning it...
            */

        /**
         * Load in current context (ie: global variables) the zoomContext stored in localstorage.
         * Loading won't occur if we already have a current context matching the current project key and that have a focusItem, unless it is forced.
         */
        function ensureZoomCtxLoaded () {
            let isProjectContextLoaded = function() {
                return zoomCtxKey()==zoomCtxKeyLoaded;
            };

            let isFocusItemCtxSet = function() {
                return (currentCtx.focusItem && currentCtx.focusItem.id && currentCtx.focusItem.projectKey==projectKey())
            };

            let timeToCheckLocalStorageUsage = function() {
                // Date.now returns millseconds.
                // ( date % 5 == 0) is effectively "we check about once in 5 times"
                return Date.now() % 5 == 0;
            };

            // reload zoom context from local storage e.g on reload of the flow view
            if (isProjectContextLoaded() && isFocusItemCtxSet()) return;

            clearContext();
            const restored = localStorageService.get(zoomCtxKey());

            if (restored && restored.panzoom) {
                zoomCtxKeyLoaded = zoomCtxKey();
                currentCtx.focusItem = restored.focusItem ? restored.focusItem : {};
                currentCtx.nodeCount = restored.nodeCount ? restored.nodeCount : 0;

                if (svc.isValidPanZoom(restored.panzoom)) {
                    angular.copy(restored.panzoom, currentCtx.panzoom);
                } else {
                    currentCtx.panzoom = {};
                }

                currentCtx.foldState = restored.foldState || [];
            }
            if (timeToCheckLocalStorageUsage()) $timeout(() => tidyLocalStorage(), 2000);
        };

        const blankCtx = {
            focusItem: {},
            nodeCount: 0,
            panzoom: {},
            foldState: []
        }

        function clearContext() {
            zoomCtxKeyLoaded = "";
            angular.copy(blankCtx, currentCtx);
        }

        /*
            * Local storage management: saving, cleaning...
            */

        /**
         * Save the currentCtx to localstorage under the key of 'zoomKey'.
         */
        function setLocalStorage(zoomKey) {
            if (projectKey() == undefined || zoomKey !== zoomCtxKey() || currentCtx.isSaving) {
                // Cancel save in case we force a save but a lazy is pending
                // or when the key are not the same
                return;
            }
            currentCtx.modified = Date.now();
            localStorageService.set(zoomKey, currentCtx);
        }

        /**
         * Set current context's panzoom
         * @param pz
         */
        function setPanzoom(pz) {
            const pzToSave = {};
            ['x', 'y', 'height', 'width'].forEach((f) => pzToSave[f] = pz[f]);
            currentCtx.panzoom = angular.copy(pzToSave);
        }

        /**
         * Save panzoom context immediately to local storage
         * @param pz
         */
        svc.instantSavePanZoomCtx = function(pz) {
            if (disabled === true) {
                return;
            }
            setPanzoom(pz);
            setLocalStorage(zoomCtxKey());
        };

        /**
         * Save the zoom context in local storage, but since this can get called very rapidly when zooming and panning, we make sure we don't write on local storage more than once every second.
         * @param pz
         */
        svc.lazySaveZoomCtx = function(pz) {

            if (disabled === true) {
                return;
            }
            // save the zoom context, but since this can get called v rapidly when zooming and panning,
            setPanzoom(pz);

            if (!currentCtx.isSaving) {
                currentCtx.isSaving = true;
                const zoomKey = zoomCtxKey();
                $timeout (() => {
                    delete currentCtx.isSaving;
                    setLocalStorage(zoomKey);
                }, 1000);
            }
        };

        /**
         * Remove oldest zoomCtxes if we've stored too many of them.
         */
        function tidyLocalStorage() {
            // We allow the number of stored keys to vary between numLsKeysToKeep and maxNumLsKeysAllowed
            // to avoid purging everytime we open a project.  Unclear if this is worthwhile perf saving.
            const numLsKeysToKeep = 10; // number of context entries in localstorage we will keep on purge
            const maxNumLsKeysAllowed = 15; // number of context entries that will trigger a purge.

            let getLsDateModified = function (key) {
                return new Date(localStorageService.get(key).modified);
            }

            const keys = localStorageService.keys().filter((k) => k.startsWith(lsKeyPrefix))

            if (keys.length > maxNumLsKeysAllowed) {
                keys.sort((a,b) => {
                        const aDate = getLsDateModified(a);
                        const bDate = getLsDateModified(b);
                        return aDate > bDate ? -1 : aDate < bDate ? 1 : 0;
                    }
                );

                const keysToDelete = keys.splice(numLsKeysToKeep);
                keysToDelete.forEach((k) => localStorageService.remove(k));
            };

        }

        function updateFoldStateList(foldStateList, foldCmd) {
            const listLen = foldStateList.length;
            let foundFirstFold = false;

            if (foldCmd.action == 'unfold') {
                foldStateList = foldStateList.filter(oldCmd => {
                    //Any unfold commands before a fold are meaningless
                    if (!foundFirstFold) {
                        foundFirstFold = (oldCmd.action == 'fold')
                        if (!foundFirstFold) return false;
                    }
                    // filter out previous fold/unfolds on this node
                    return oldCmd.nodeId != foldCmd.nodeId || oldCmd.direction != foldCmd.direction;
                });
            }

            if (listLen == foldStateList.length) {
                foldStateList.push(foldCmd);
            }

            return foldStateList;
        }

        /*
            * Setters: persisting panzoom ctx elements...
            */

        /**
         * Set current context's focusItem and save it on local storage
         * @param node
         */
        svc.setFocusItemCtx = function(node, nodeChangedByName = false) {

            if (disabled === true) {
                return;
            }

            currentCtx.focusItem = {
                id: node.id,
                nodeChangedByName,
                projectKey: projectKey()
            };
            ensureZoomCtxLoaded();
            setLocalStorage(zoomCtxKey());
        };

        svc.resetFocusItemCtx = function() {
            currentCtx.focusItem = {};
            setLocalStorage(zoomCtxKey());
        };


        /**
         * Set current context's focusItem based on a type and a fullname and save it on local storage
         * (A generalised version of setFocusItemByName which supports foreign datasets, which have a different project key)
         * @param type: node type (recipe, dataset, etc.)
         * @param fullName: node full name (it includes project's key)
         */
        svc.setFocusItemByFullName = function (type, fullName) {

            if (disabled === true) {
                return;
            }
            // A generalised version of setFocusItemByName. It supports foreign datasets,
            // which have a different project key.
            if (!fullName) return;
            ensureZoomCtxLoaded();

            currentCtx.focusItem.id = graphVizEscape(type + "_" + fullName);
            currentCtx.focusItem.nodeChangedByName = true;

            setLocalStorage(zoomCtxKey());
        };

        /**
         * Set current context's focusItem based on a type and a name and save it on local storage
         * Called from various controllers (e.g. dataset/recipe editors) to update the flow item that is will be selected when the flow is next redisplayed.
         * @param type: node type (recipe, dataset, etc.)
         * @param name: node name
         */
        svc.setFocusItemByName = function (type, name) {

            if (disabled === true) {
                return;
            }
            let isIncludeProjRefInNodeId = function(type) {
                return type != "recipe"; //recipes have a slightly different SVG element id format in the flow
            }

            if (!name) return;
            const proj = isIncludeProjRefInNodeId(type) ? projectKey() + "." : "";
            svc.setFocusItemByFullName(type, proj + name);
        };

        svc.setFlowRedrawn = function (newNodeCount) {
            currentCtx.focusItem.nodeChangedByName = false;
            currentCtx.nodeCount = newNodeCount;
        };

        /**
         * Set fold/unfold request
         * Called when the user folds or unfolds a node.  The
         * active fold state is saved so it can be restored when the
         * view is refreshed.
         * On unfold we remove existing 'redundant' commands from the list.
         */
        svc.setFoldCommand = function (foldCmd) {
            currentCtx.foldState = updateFoldStateList(currentCtx.foldState, foldCmd)
            setLocalStorage(zoomCtxKey());
        };

        svc.resetFoldState = function(commands) {
            currentCtx.foldState = commands || [];
            setLocalStorage(zoomCtxKey());
        }

        svc.removeLastFoldCommand = function () {
            currentCtx.foldState.pop();
            setLocalStorage(zoomCtxKey());
        }

        /*
            * Getters: retrieving panzoom ctx elements
            */

        /**
         * Load panzoom ctx that we stored in activePz passed in parameter
         * @param activePz - the current $scope.panZoom.  This is updated not replaced, to avoid any knock on effects
         *                   in the existing graph-handling software
         * @param defaultPz - a panZoom structure with default settings i.e. show the whole flow
         * @returns true if replacement occured, false otherwise (in the case there's no current context's panzoom)
         */
        svc.restoreZoomCtx = function(activePz, defaultPz) {

            if (disabled === true) {
                return;
            }
            ensureZoomCtxLoaded();

            if (svc.isValidPanZoom(currentCtx.panzoom) && activePz && defaultPz) {
                angular.copy(defaultPz, activePz); //copy defaultPz in activePz
                angular.extend (activePz, currentCtx.panzoom); //extend activePz with currentCtx.panzoom
                return true;
            }
            return false;
        };

        /**
         * Returns current context focusItem id (or empty string if this item is not contained in the flowGraph passed in parameter)
         * @param flowGraph to validate current context focusItem's id with
         * @returns current context focusItem's id (or empty string if this item is not contained in the flowGraph passed in parameter)
         */

        svc.getSafeFocusItemId = function (flowGraph) {

            if (disabled === true) {
                return;
            }
            if (flowGraph && currentCtx.focusItem && currentCtx.focusItem.id) {
                if (!flowGraph.node(currentCtx.focusItem.id)) {
                    // focus item may have been added by name without taking in account the zones
                    // try to find it
                    if (currentCtx.focusItem.nodeChangedByName) {
                        currentCtx.focusItem.id = svc.getZoomedName(flowGraph, currentCtx.focusItem.id);
                    }
                    if (!flowGraph.node(currentCtx.focusItem.id)) {
                        currentCtx.focusItem.id = "";
                    }
                }
            }
            return currentCtx.focusItem ? currentCtx.focusItem.id : "";
        };

        /**
         * Returns the id with the correct zone if we are not in a zone
         * In case we are in zone, return the id
         */
        svc.getZoomedName = (flowGraph, id) => {
            if (!id || id.startsWith("zone_")) {
                return id;
            }
            const graph = flowGraph.get();
            if (!graph.hasZones && !$stateParams.zoneId) {
                return id;
            }
            const sharedBetweenZones = graph.zonesUsedByRealId[id];
            if (sharedBetweenZones) {
                const node = flowGraph.node(graphVizEscape(`zone_${sharedBetweenZones[0]}_`) + id);
                if (node && flowGraph.node(graphVizEscape(`zone_${node.ownerZone}_`) + id)) {
                    return graphVizEscape(`zone_${node.ownerZone}_`) + id;
                }
            }
            const foundName = Object.keys(graph.nodes).find(it => it.endsWith(id));
            if (foundName) {
                return foundName;
            }
            return id;
        }

        svc.getNodeCount = function() {
            return currentCtx.nodeCount;
        };

        function isValidDimension(d) {
            return angular.isDefined(d) && isFinite(d) && d > 0;
        }
        svc.isValidPanZoom = function(pz) {
            return isValidDimension(pz.width) && isValidDimension(pz.height);
        };

        svc.wasNodeChangedOutsideFlow = function() {
            return !!currentCtx.focusItem.nodeChangedByName;
        };

        svc.getFoldState = function() {
            return currentCtx.foldState;
        }

        svc.getPreviewFoldState = function(foldCmd) {
            const previewFoldState =  angular.copy(currentCtx.foldState);
            return updateFoldStateList(previewFoldState, foldCmd)
        }

    });


    app.filter("recipeFlowIcon", function() {
        const dict = {
            'sync': 'recipe_sync',
            'shaker': 'recipe_prepare',
            'update': 'recipe_push_to_editable',
            'sampling': 'recipe_filter',
            'grouping': 'recipe_group',
            'distinct': 'recipe_distinct',
            'split': 'recipe_split',
            'topn': 'recipe_topn',
            'sort': 'recipe_sort',
            'vstack': 'recipe_stack',
            'join': 'recipe_join',
            'fuzzyjoin': 'recipe_fuzzyjoin',
            'window': 'recipe_window',
            'export': 'recipe_export',
            'pivot' : "recipe_pivot",
            'download': 'recipe_download',
            'merge_folder': 'recipe_merge_folder',

            'sql_script': 'recipe_sql',
            'sql_query': 'recipe_sql',

            'python': 'recipe_python',
            'julia': 'recipe_julia',
            'r': 'recipe_R',
            'shell': 'recipe_shell',

            'pig': 'recipe_pig',
            'hive': 'recipe_hive',
            'impala': 'recipe_impala',

            'pyspark': 'recipe_pyspark',
            'sparkr': 'recipe_sparkr',
            'spark_scala': 'recipe_spark_scala',
            'spark_sql_query': 'recipe_spark_sql',

            'clustering_cluster': 'recipe_cluster',
            'clustering_training': 'recipe_train',
            'clustering_scoring': 'recipe_score',
            'prediction_training': 'recipe_train',
            'prediction_scoring': 'recipe_score',
            'evaluation': 'recipe_evaluation',
            'standalone_evaluation': 'recipe_standalone_evaluation',

            'csync': 'recipe_sync',
            'streaming_spark_scala': 'recipe_spark_scala',
            'cpython': 'recipe_python',
            'ksql': 'recipe_ksql'
        };
        return function(input) {
            if (input.startsWith('CustomCode_') || input.startsWith("App_")) {
                return 'recipe_empty'
            }
            return dict[input] || 'icon-'+(input||'').toLowerCase();
        };
    });


    app.directive('flowCommon', function($state, $stateParams, $rootScope, FlowGraphSelection, FlowGraph, GraphZoomTrackerService) {
        return {
            restrict: 'EA',
            scope: true,
            link : function(scope, element) {

                function setRightColumnItem() {
                    // This is a quick and dirty hack to keep compatibility with old
                    // right columns that handle only one element at a time
                    scope.rightColumnSelection = FlowGraphSelection.getSelectedNodes();
                    if (scope.rightColumnSelection.length == 0) {
                        scope.rightColumnItem = null;
                        if ($stateParams.zoneId) {
                            const node = FlowGraph.node(`zone_${$stateParams.zoneId}`);
                            if (node) {
                                scope.rightColumnItem = node;
                                scope.rightColumnSelection = [node];
                                GraphZoomTrackerService.setFocusItemCtx(node);
                            }
                        }
                    } else if (scope.rightColumnSelection.length == 1) {
                        scope.rightColumnItem = scope.rightColumnSelection[0];
                    } else {
                        scope.rightColumnItem = {
                            nodeType: 'MULTI',
                            selection: scope.rightColumnSelection
                        };
                    }
                }

                scope.focusLast = function(){
                    if (scope.previousRightColumnItemId) {
                        FlowGraphSelection.clearSelection();
                        scope.zoomGraph(scope.previousRightColumnItemId);
                        FlowGraphSelection.onItemClick(scope.previousRightColumnItemId);
                    }
                };

                const h = $rootScope.$on('flowSelectionUpdated', setRightColumnItem);
                scope.$on('$destroy', h);
            }
        }
    });


    // Main directive for all graphs (project flow, global graph, job graph)
    app.directive('flowGraph', function($rootScope, $timeout, $stateParams, Logger, $state,
                                    FlowGraph, ProjectFlowGraphStyling, InterProjectGraphStyling, ProjectFlowGraphLayout,
                                    InterProjectGraphLayout, FlowGraphFiltering, FlowGraphSelection, FlowGraphFolding, GraphZoomTrackerService) {
    return {
        restrict: 'EA',
        controller: function ($scope, $element, $attrs) {
            $scope.FlowGraph = FlowGraph;//debug
            // Enable Zoom tracking
            GraphZoomTrackerService.disable(false);
            let nextResizeEnabled = true;

            function disableNextResize(disabled = true) {
                nextResizeEnabled = disabled === false;
            }

            $scope.$on('disableNextFlowResize', disableNextResize);

            $scope.setGraphData = function (serializedGraph) {
                if (serializedGraph) {
                    $scope.nodesGraph = serializedGraph;
                    FlowGraph.set($scope.nodesGraph);

                    $scope.nodesGraph.filteredOutElementCount = Object.values(serializedGraph.filteredOutObjectsByType).reduce((a, b) => a + b, 0);
                    $scope.nodesGraph.nodesOnGraphCount = Object.keys(serializedGraph.nodes).filter(it => $stateParams.zoneId ? it.startsWith(`zone__${$stateParams.zoneId}`) : true).length; //if zoomed on a zone we need the zone node for the color, but not in the filter count
                    const displayedElementCount = Object.values(serializedGraph.includedObjectsByType).reduce((a,b)=>a+b, 0);
                    $scope.isFlowEmpty = (($scope.nodesGraph.filteredOutElementCount || 0) + displayedElementCount === 0) && !serializedGraph.hasZoneSharedObjects;
                    $scope.allFilteredOut = !$scope.isFlowEmpty && $scope.nodesGraph.nodesOnGraphCount === 0;
                }
            };
            function setupZoomBehavior() {
                // The scope.panZoom structure controls:
                // - the position of the flow on the screen, via  SVG coords x,y
                // - How zoomed in it is, via SVG dimensions width, height
                // - How far out you can zoom, via maxWidth, maxHeight, SVG dimensions
                //
                // The size of the HTML container element in HTML coords is held in WIDTH and HEIGHT
                // x, y, width, height are used directly as the SVG viewBox settings.
                $scope.panzoom = {
                    x: 0,
                    y: 0,
                    width: undefined,
                    height: undefined,
                    maxWidth: undefined,
                    maxHeight: undefined,
                    WIDTH: $element.width(),
                    HEIGHT: $element.height()
                };

                let h;

                const resizeStrategies = {
                    reinit : "reinit", // don't use any saved settings, redisplay whole flow
                    usePanZoom : "zoom", // use the saved zoom context, but don't smart-adjust the positioning at all
                    zoomToFocusItem : "item", // use the saved zoom contrext, but adjust centring for a 'nice fit'
                    highlight : "highlight" // resize around the highlighted nodes
                };

                const smallFlowNodeCount = 10; // any flow less than 10 nodes can be displayed in full everytime.

                /**
                 * Return the set strategy if some, or calculate the best strategy for restoring the saved zoom and focused item. We want as natural
                 * an experience as possible.  If the user hasn't changed anything, we try to restore the flow layout
                 * exactly as it was before - they presumably set it that way!  If they have added/deleted/navigated
                 * then we need to adjust layout so they can see the last item they navigated to.
                 *
                 * @param currentNodeCount - the current number of nodes in the flow
                 * @returns the resize strateegy
                 */
                function getResizeStrategy(currentNodeCount) {
                    let strategy = resizeStrategies.reinit;

                    if ($scope.strategy) {
                        strategy = $scope.strategy;
                    } else {
                        if ($rootScope.appConfig.userSettings.disableFlowZoomTracking || !currentNodeCount) {
                            return strategy;
                        }

                        if (GraphZoomTrackerService.isValidPanZoom($scope.panzoom)) {
                            const focusItemId = GraphZoomTrackerService.getSafeFocusItemId($scope.FlowGraph);
                            if (focusItemId && $scope.FlowGraph.node(focusItemId) && GraphZoomTrackerService.wasNodeChangedOutsideFlow()) {
                                strategy = resizeStrategies.zoomToFocusItem;
                            } else {
                                strategy = resizeStrategies.usePanZoom;
                            }
                        }

                        const previousNodeCount = GraphZoomTrackerService.getNodeCount()
                        if (currentNodeCount <= smallFlowNodeCount && currentNodeCount != previousNodeCount) { //small flows with a flow change
                            strategy = resizeStrategies.reinit; // with small flows, always snap back to the full flow
                        }
                    }
                    return strategy;
                }

                function setResizeStrategy(scope, strategy='reinit') {
                    if (strategy && resizeStrategies[strategy]) {
                        $scope.strategy = resizeStrategies[strategy];
                    }
                }

                $scope.$on('setResizeStrategy', setResizeStrategy);

                /**
                 * Calculate how close the bounding box for an item is to the edge of the viewable area, as
                 * a fraction of the total size of the view.  This function does the calculation for a
                 * specified dimension i.e. the X or Y axis.
                 *
                 * @param bbItem - the bound box of one item in the viewable area (the one we want to set focus to)
                 * @param bbFlow - the bounding box of the whole flow
                 * @param dimension  'x' for the horizontal dimension, 'y' for vertical
                 * @param viewBoxLength - the viewable size of the SVG window in the specified dimension
                 * @returns the fraction of the total size from the edge.  For example 0.5 means we are in the middle
                 */
                function getFractionalDistOfItemToEdge(bbItem, bbFlow, dimension, viewBoxLength) {

                    const length = dimension=='x' ? 'width' : 'height';
                    const start = dimension; // x or y axis

                    let extentOfItem = bbItem[start] + bbItem[length];
                    let extentOfFlow = bbFlow[start] + bbFlow[length];
                    return (extentOfFlow - extentOfItem) /  viewBoxLength;
                }

                /**
                 * We need the .width / .height aspect ratio for the SVG viewbox to match the
                 * aspect ratio of the containing HTML element, otherwise we get inaccuracies when
                 * we try to drag the whole flow around.
                 * @param pz - the pan zoom to be normalised
                 * returns - the same pan zoom, normalised
                 */
                function normaliseAspectRatio(pz) {
                    const viewBoxAR = pz.width / pz.height;
                    const elementAR = pz.WIDTH / pz.HEIGHT;
                    if (viewBoxAR!=elementAR) {
                        pz.width = pz.height * elementAR; // not sure we need to worry about which way round we adjust AR
                    }
                    return pz;
                }

                function resize(forcedReinit) {
                    let zoomTrackingEnabled = GraphZoomTrackerService.isEnabled();
                    if ($scope.isFlowEmpty || $scope.allFilteredOut || !$scope.svg || !$scope.svg.length) {
                        return false;
                    }

                    $scope.panzoom.WIDTH = $element.width();
                    $scope.panzoom.HEIGHT = $element.height();

                    const bbFlow = $scope.svg.find('g.graph')[0].getBBox(); //get the whole-flow bounding box
                    const defaultPz = buildDefaultPanZoomSettings($scope.panzoom, bbFlow);
                    let pz = $scope.panzoom;
                    if (!GraphZoomTrackerService.isValidPanZoom($scope.panzoom)) {
                        pz = angular.copy(defaultPz);
                    }
                    let isReloadedZoomCtx;
                    if (zoomTrackingEnabled) {
                        isReloadedZoomCtx = (GraphZoomTrackerService.restoreZoomCtx(pz, defaultPz));
                    }

                    $scope.setPanZoom(normaliseAspectRatio(pz));

                    const nodeCount = $scope.FlowGraph.nodeCount();
                    let strategy = getResizeStrategy(nodeCount);
                    let nodeIdToFocus = GraphZoomTrackerService.getSafeFocusItemId($scope.FlowGraph);

                    if (forcedReinit === true) {
                        strategy = resizeStrategies.reinit;
                        nodeIdToFocus = undefined;
                        FlowGraphFolding.clearFoldState();
                        FlowGraph.setGraphBBox(bbFlow);
                    }

                    if (strategy == resizeStrategies.usePanZoom) { // we have saved viewbox setting ie zoom level and positioning.  Reuse these
                        if (isReloadedZoomCtx) $scope.redraw();
                        // SVG will rescale quite nicely by itself with changes in Window size
                    }
                    else if (strategy == resizeStrategies.zoomToFocusItem) { // position this last-used item in the centre of the screen
                        const wPrev = $scope.panzoom.width;
                        const hPrev = $scope.panzoom.height;
                        const node = $scope.nodesGraph.nodes[nodeIdToFocus];
                        const selector = $scope.getSelector(nodeIdToFocus, node);
                        let bb = FlowGraphFiltering.getBBoxFromSelector($scope.svg, selector); //get the focussed-item box

                        let xPosInCell = 0.5; // the middle of the viewable area
                        let yPosInCell = 0.5;

                        const centerOnItemX = bbFlow.width > wPrev; // do we want to try to center the item, or does the whole flow fits in this dimension?
                        const centerOnItemY = bbFlow.height > hPrev;

                        let boxToCentreForX = centerOnItemX ? bb: bbFlow;
                        let boxToCentreForY = centerOnItemY ? bb : bbFlow;

                        if (centerOnItemX) {
                            // we are centring the item in the width of the viewport.
                            // By default we put it in the middle, but if it's near the edges, we adjust it a bit with heuristically developed numbers ;-)
                            const edgeFraction = getFractionalDistOfItemToEdge(bb, bbFlow, "x", wPrev);
                            if (edgeFraction < 0.25) xPosInCell = 0.8 - edgeFraction; // near right hand edge

                            if ((bb.x - bbFlow.x) / wPrev < 0.25)  xPosInCell = 0.25; // near left hand edge
                        }

                        if (centerOnItemY) {
                            // we are centring the item in the height of the item.
                            const edgeFraction = getFractionalDistOfItemToEdge(bb, bbFlow, "y", hPrev) ;
                            if (edgeFraction < 0.2) yPosInCell = 0.8 - edgeFraction;

                            if ((bb.y - bbFlow.y) / hPrev < 0.25) yPosInCell = 0.25;
                        }

                        $scope.panzoom.x = boxToCentreForX.x + boxToCentreForX.width * xPosInCell - wPrev * xPosInCell; //centre the view
                        $scope.panzoom.y = boxToCentreForY.y + boxToCentreForY.height * yPosInCell -hPrev * yPosInCell;
                        $scope.panzoom.height = hPrev; //keep same zoom level as before
                        $scope.panzoom.width = wPrev;

                        $scope.redraw();
                    } else if (strategy === resizeStrategies.highlight) {
                        // Zoom on highlighted nodes
                        let bbox = FlowGraphFiltering.getBBoxFromSelector($scope.svg, '.highlight');
                        $scope.zoomToBbox(bbox);
                    } else { // refit the whole flow.  May have focus item
                        $scope.setPanZoom(defaultPz);

                        let paddingFactor = 1.2;
                        if (nodeCount) paddingFactor += (smallFlowNodeCount-Math.min(nodeCount, smallFlowNodeCount)) * 0.08; // more padding when there are fewer items in the flow.
                        zoomTo(paddingFactor);
                    }

                    // if nodeIdToFocus is set, we want to select this node in the flow. The existing technique for this is
                    // to call FlowGraphSelection.onItemClick. However we need to force the existing FlowGraph data
                    // structure to load the current set of node ids before this will work.
                    if (nodeIdToFocus) {
                        FlowGraph.indexNodesCoordinates($scope.svg, bbFlow);
                        FlowGraphSelection.onItemClick($scope.FlowGraph.node(nodeIdToFocus));
                        applyFlowFolding();
                    } else {
                        h && clearTimeout(h);
                        h = setTimeout(function() {
                            FlowGraph.indexNodesCoordinates($scope.svg, bbFlow);
                            applyFlowFolding();
                        }, 500);
                    }

                    zoomTrackingEnabled === true && GraphZoomTrackerService.setFlowRedrawn(nodeCount);

                    return true;
                }
                function applyFlowFolding() {
                    if ($attrs.showFolding) FlowGraphFolding.restoreState(GraphZoomTrackerService.getFoldState());
                }
                function resizeListener() {
                    resize();
                    if (!$scope.$$phase) {
                        $scope.$apply();
                    }
                }
                $(window).on('resize', resizeListener);
                $scope.$on('$destroy', param => {
                    if (!param.currentScope.projectFlow || !(param.currentScope.nodesGraph && param.currentScope.nodesGraph.hasZones || param.currentScope.zoneIdLoaded)) {
                        GraphZoomTrackerService.instantSavePanZoomCtx($scope.panzoom);
                    }
                    $(window).off('resize', resizeListener)
                });
                $scope.$on('resizePane', resize);
                $scope.$watch('svg', function() {
                    // Wait for the svg to be totally rendered before updating the view (we need to make computation based on bbox)
                    // If the resize has been temporarily disabled, re-enable it.
                    if (nextResizeEnabled) {
                        setTimeout(function() {
                            if (resize($scope.isResetZoomNeeded)) $rootScope.$emit('flowDisplayUpdated');
                            $scope.isResetZoomNeeded = false;
                        });
                    } else {
                        nextResizeEnabled = true;
                    }
                });

                function keepPanZoomDimSane(pz, bbflow, start, length, nearFraction) {
                    if (pz[start] + (1-nearFraction)*pz[length] < bbflow[start]) { //rhs
                        pz[start] = (nearFraction-1)*pz[length] + bbflow[start];
                    }
                    if (bbflow[length] + bbflow[start] < pz[start] + nearFraction * pz[length]) { // lhs
                        pz[start] = (bbflow[start] + bbflow[length] - nearFraction*pz[length]);
                    }
                    return pz;
                }

                function keepPanZoomSane(pz) { //prevent flow being pushed out of view
                    const bbFlow = $scope.svg.find('g.graph')[0].getBBox();
                    pz = keepPanZoomDimSane(pz, bbFlow, "x", "width", 0.3);
                    pz = keepPanZoomDimSane(pz, bbFlow, "y", "height", 0.4);
                    return pz;
                }

                $scope.redraw = function () {
                    if ($scope.svg && $scope.svg.length) {
                        $scope.panzoom = keepPanZoomSane($scope.panzoom);
                        GraphZoomTrackerService.lazySaveZoomCtx($scope.panzoom);
                        $scope.svg[0].setAttribute('viewBox', [
                            $scope.panzoom.x,
                            $scope.panzoom.y,
                            $scope.panzoom.width,
                            $scope.panzoom.height
                        ].join(', '));
                    }
                };

                $scope.getPanZoom = function() {
                    return angular.copy($scope.panzoom);
                };

                $scope.setPanZoom = function(panzoom) {
                    $scope.panzoom = angular.copy(panzoom);
                    $scope.redraw();
                };

                $scope.bbox = function(bbox) {
                    $scope.panzoom.x = bbox.x;
                    $scope.panzoom.y = bbox.y;

                    if (bbox.width / bbox.height > $scope.panzoom.WIDTH / $scope.panzoom.HEIGHT) {
                        $scope.panzoom.width = bbox.width;
                        $scope.panzoom.height = bbox.width * ($scope.panzoom.HEIGHT / $scope.panzoom.WIDTH);
                        $scope.panzoom.y = bbox.y - ($scope.panzoom.height - bbox.height) / 2;
                    } else {
                        $scope.panzoom.width = bbox.height * ($scope.panzoom.WIDTH / $scope.panzoom.HEIGHT);
                        $scope.panzoom.height = bbox.height;
                        $scope.panzoom.x = bbox.x - ($scope.panzoom.width - bbox.width) / 2;
                    }

                    $scope.redraw();
                };
                // Safari, Chrome, Opera, IE
                const WHEEL_ZOOM_STEP = 1.1;
                $element.on('mousewheel', function (e) {
                    let scale = 1;
                    if (e.originalEvent.wheelDeltaY != 0) {
                        scale = e.originalEvent.wheelDeltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
                    }
                    const eOrig = e.originalEvent && angular.isDefined(e.originalEvent.layerX) ? e.originalEvent : undefined;
                    zoomTo(scale, eOrig ? eOrig.layerX : e.offsetX, eOrig ? eOrig.layerY : e.offsetY);
                    e.stopPropagation();
                    e.preventDefault();
                });

                Mousetrap.bind("Z R", () => $scope.resizeToShowAll());
                Mousetrap.bind("Z A", () => $scope.resizeToShowAll());

                $scope.reinitGraph = () => { resize(true); };

                $scope.$on("$destroy", _ => {
                    Mousetrap.unbind("Z R");
                    Mousetrap.unbind("Z A");
                });

                $scope.zoomIn = () => {
                    zoomTo(1 / WHEEL_ZOOM_STEP, $scope.panzoom.WIDTH / 2, $scope.panzoom.HEIGHT / 2);
                }

                $scope.zoomOut = () => {
                    zoomTo(WHEEL_ZOOM_STEP, $scope.panzoom.WIDTH / 2, $scope.panzoom.HEIGHT / 2);
                }

                $scope.resizeToShowAll = () => {
                    $scope.resetPanZoom();
                    $rootScope.$emit('drawGraph', {ignoreCache:true}, true);
                    FlowGraphSelection.refreshStyle(true);
                }

                $scope.resetPanZoom = function () {
                    $scope.isResetZoomNeeded = true;
                }

                // Touchable devices
                if (isTouchDevice()) {
                    let onTouchStart = (function() {
                        let previousPinchDistance;

                        /*
                            * Utils
                            */

                        function computePinchDistance(e) {
                            let t1 = e.originalEvent.touches[0];
                            let t2 = e.originalEvent.touches[1];
                            let distance = Math.sqrt(Math.pow(Math.max(t1.screenX, t2.screenX) - Math.min(t1.screenX, t2.screenX), 2) + Math.pow(Math.max(t1.screenY, t2.screenY) - Math.min(t1.screenY, t2.screenY), 2));
                            return distance;
                        }

                        function computePinchMiddle(e) {
                            let t1 = e.originalEvent.touches[0];
                            let t2 = e.originalEvent.touches[1];
                            let offset = $($element).offset();
                            // point of contact 1
                            let c1 = {
                                x: t1.pageX - offset.left,
                                y: t1.pageY - offset.top
                            };
                            // point of contact 2
                            let c2 = {
                                x: t2.pageX - offset.left,
                                y: t2.pageY - offset.top
                            };
                            // middle
                            let middle = {
                                x: (c1.x + c2.x)/2,
                                y: (c1.y + c2.y)/2
                            };
                            return middle;
                        }

                        /*
                            * Callbacks
                            */

                        function onTouchMove(e) {
                            e.stopPropagation();
                            e.preventDefault();
                            let distance = computePinchDistance(e);
                            if (!isNaN(previousPinchDistance)) {
                                let scale = previousPinchDistance / distance;
                                let middle = computePinchMiddle(e);
                                requestAnimationFrame(_ =>zoomTo(scale, middle.x, middle.y));
                            }
                            previousPinchDistance = distance;
                        }

                        function onTouchEnd(e) {
                            $element.off('touchmove', onTouchMove);
                            $element.off('touchend', onTouchEnd);
                            e.stopPropagation();
                            e.preventDefault();
                        }

                        return function(e){
                            e.stopPropagation();
                            e.preventDefault();
                            if (e.originalEvent.targetTouches.length !== 2) {
                                return;
                            }

                            previousPinchDistance = computePinchDistance(e);

                            $element.on('touchmove', onTouchMove);
                            $element.on('touchend', onTouchEnd);
                        }
                    })();

                    $element.on('touchstart', onTouchStart);
                }

                // Firefox
                $element.on('DOMMouseScroll', function (e) {
                    const scale = e.originalEvent.detail > 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
                    const coordinates = mouseViewportCoordinates(e);
                    zoomTo(scale, coordinates.x, coordinates.y);
                    e.stopPropagation();
                });
                function zoomTo(scale, x, y) {
                    if (scale < 1 && $scope.panzoom.width && $scope.panzoom.width <= 150) {
                        return; // cannot zoom infinitely
                    }
                    if(scale > 1 && $scope.panzoom.width * scale > $scope.panzoom.maxWidth*2) {
                        return; // cannot dezoom infinitely
                    }
                    if (angular.isUndefined(x)) {
                        x = $scope.panzoom.WIDTH / 2;
                    }
                    if (angular.isUndefined(y)) {
                        const menuH = $('#flow-editor-page .menu').height();
                        y = ($scope.panzoom.HEIGHT - menuH) / 2 + menuH;
                    }

                    $scope.panzoom.x = $scope.panzoom.x + (x / $scope.panzoom.WIDTH) * $scope.panzoom.width * (1 - scale);
                    $scope.panzoom.y = $scope.panzoom.y + (y / $scope.panzoom.HEIGHT) * $scope.panzoom.height * (1 - scale);

                    $scope.panzoom.width = $scope.panzoom.width * scale;
                    $scope.panzoom.height = $scope.panzoom.height * scale;

                    $scope.redraw();
                }
            }

            let original_coordinates;
            let original_graph_coordinates;
            let original_click;

            function getEventWithCoordinates(evt) {
                return angular.isUndefined(evt.originalEvent.changedTouches) ? evt.originalEvent : evt.originalEvent.changedTouches[0];
            }

            /* offsetX and offsetY are not really supported in Firefox. They used to be undefined, but May'18 and they are returning 0.
                It's not clear if this was always the case, but this getOffsetXY function implemented the broadly excepted
                substitute calculation.  Clearly userAgent test is not a great solution, but leaving the Chrome solution
                in place seems safer and more efficient.
                */
            const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
            function getOffsetXY(e) {
                let offsets;

                if (isFirefox || angular.isUndefined(e.offsetX)) { // having problem with offsetX as zero, not undefined, on firefox
                    const target = e.target || e.srcElement;
                    const rect = target.getBoundingClientRect();
                    offsets = { x:   e.clientX - rect.left, y:  e.clientY - rect.top};
                }
                else {
                    offsets = { x: e.offsetX, y: e.offsetY};
                }
                return offsets;
            }

            /*
            * Gives the coordinates of a mouse event in a coordinate system fixed relative viewport
            */
            function mouseViewportCoordinates(evt) {
                const formattedEvt = getEventWithCoordinates(evt);
                //mjt I have a feeling that the existing if clause and the new getOffsetXY function are
                // trying to do similar things and might be conflatable.  It's not trivial though.
                if (angular.isUndefined(formattedEvt.offsetX) || !$scope.svg || formattedEvt.target != $scope.svg[0]) {
                    const containerOffset = $element.offset();
                    return {
                        x: formattedEvt.pageX - containerOffset.left,
                        y: formattedEvt.pageY - containerOffset.top
                    };
                } else {
                    return getOffsetXY(formattedEvt)
                }
            }
            /*
            * Gives the coordinates of a mouse event in the graph coordinate systems:
            * Ex: if the graph is resized and moved, clicking on one specific item would give the same coordinates
            */
            let pt;

            function mouseGraphCoordinates(evt) {
                let formattedEvt = getEventWithCoordinates(evt);
                pt = pt || $scope.svg[0].createSVGPoint();
                pt.x = formattedEvt.clientX;
                pt.y = formattedEvt.clientY;
                return pt.matrixTransform($scope.svg[0].getScreenCTM().inverse());
            }

            function setupMoveAndSelectBehavior() {
                $scope.rectangleSelection = false;

                function moveView(evt) {
                    if (!original_coordinates) return;
                    const coordinates = mouseViewportCoordinates(evt);
                    $scope.panzoom.x = original_coordinates.x - $scope.panzoom.width * (coordinates.x / $scope.panzoom.WIDTH);
                    $scope.panzoom.y = original_coordinates.y - $scope.panzoom.height * (coordinates.y / $scope.panzoom.HEIGHT);
                    $scope.redraw();
                }

                function getBBoxFromPoints(p1, p2) {
                    return {
                        x: Math.min(p1.x, p2.x),
                        y: Math.min(p1.y, p2.y),
                        width: Math.max(p1.x, p2.x) - Math.min(p1.x, p2.x),
                        height: Math.max(p1.y, p2.y) - Math.min(p1.y, p2.y),
                    };
                }

                function updateSelectionRectangle(evt) {
                    const svg = FlowGraph.getSvg();
                    if (!svg) return;
                    clearSelectionRectangle();

                    const coords = mouseGraphCoordinates(evt);
                    const rect = getBBoxFromPoints(coords, original_graph_coordinates);
                    rect.id = 'flow-selection-rectangle';

                    $(svg).append(makeSVG('rect', rect));
                }

                function clearSelectionRectangle() {
                    const svg = FlowGraph.getSvg();
                    $('#flow-selection-rectangle', svg).remove();
                }

                function commitRectangleSelection(evt) {
                    const coords = mouseGraphCoordinates(evt);
                    const rect = getBBoxFromPoints(coords, original_graph_coordinates);
                    const nodeIds = FlowGraph.getEnclosedNodesIds(rect);
                    FlowGraphSelection.select(node => !node.filterRemove && nodeIds.includes(node.id));
                }

                function clearOriginalCoordinates() {
                    original_coordinates = undefined;
                    clearSelectionRectangle();
                    $('#flow-editor-page .mainPane').removeClass('no-pointer-events');
                }

                function isLassoKeyPressed(evt) {
                    const isNotMac = !$('html').hasClass('macos')
                    return evt.shiftKey || evt.metaKey || (evt.ctrlKey && isNotMac);
                }

                $('body').on('keydown.rectangleSelection', function (e) {
                    if ((isLassoKeyPressed(e)) && $stateParams.projectKey) {
                        $scope.$apply(() => $scope.rectangleSelection = true);
                    }
                }).on('keyup.rectangleSelection', function (e) {
                    if ((!isLassoKeyPressed(e)) && $stateParams.projectKey) {
                        $scope.$apply(() => $scope.rectangleSelection = false);
                    }
                });

                $scope.$on('$destroy', function() {
                    $('body').off('keydown.rectangleSelection').off('keyup.rectangleSelection');
                });

                /**
                 * Return a function taking an event in input and calling the callback passed on parameter only if this event is a mono touch event
                 */
                function monoTouchCallBack(fn) {
                    return function(evt) {
                        if (evt.originalEvent.touches && evt.originalEvent.touches.length == 1) {
                            fn(evt);
                        }
                    }
                }

                let dragStart = (function() {
                    /* in order to avoid lag on big flows, when dragging we apply the move cursor to the item initially clicked, and on each item entered during the drag
                     * it performs better because the bottleneck is the style recalculation, not the javascript event part
                     */
                    const applyMoveCursorSelector = 'svg, svg [class~=node], svg [class~=zone_cluster], svg [class~=folded-icon]';
                    let $applyMoveCursorInitialItem = $element;
                    function applyMoveCursor(evt) {
                        $(evt.target).addClass('moving');
                        $(evt.target).parentsUntil($element).addClass('moving');
                    }
                    function cleanMoveCursor() {
                        $element.find('.moving').removeClass('moving');
                    }

                    /*
                        *  Utils
                        */
                    // Remove listeners on drag release
                    function removeListeners() {
                        $(document).off('mousemove', drag);
                        $element.off('mouseenter', applyMoveCursorSelector, applyMoveCursor);
                        $element.off('mouseup', 'svg [class~=node]', releaseDragOnNode);
                        $element.off('mouseup', 'svg [class~=folded-icon]', releaseDragOnUnfoldButton);
                        $element.off('mouseup', 'svg [class~=zone_cluster]', releaseDragOnZone);
                        $(document).off('mouseup', releaseDrag);

                        if (isTouchDevice()) {
                            $(document).off('touchmove', monoTouchCallBack(drag));
                            $element.off('touchend', 'svg [class~=node]', releaseDragOnNode);
                            $element.off('touchend', 'svg [class~=zone_cluster]', releaseDragOnZone);
                            $element.off('touchend', 'svg [class~=folded-icon]', releaseDragOnUnfoldButton);
                            $(document).off('touchend', releaseDrag);
                        }
                    }

                    /*
                    * Calllbacks
                    */

                    // Ondrag callback
                    function drag(evt) {
                        if (!$scope.svg) {
                            return;
                        }

                        $applyMoveCursorInitialItem.addClass('moving');

                        if (!((isLassoKeyPressed(evt) ) && $stateParams.projectKey) && $scope.rectangleSelection) {
                            //This is an old rectangleSelection that was not cleared
                            clearOriginalCoordinates();
                        }
                        if (!(isLassoKeyPressed(evt) ) && $scope.rectangleSelection) {
                            $scope.$apply(() => $scope.rectangleSelection = false);
                        }
                        if (original_coordinates) {
                            if ($scope.rectangleSelection) {
                                const coordinates = mouseViewportCoordinates(evt);
                                if (original_click && square_distance(coordinates, original_click) > 16) {
                                    // We don't want to immediately add no-pointer-events because cmd+click will not work (1 pixel moves)
                                    $('#flow-editor-page .mainPane').addClass('no-pointer-events');
                                }
                                updateSelectionRectangle(evt);
                            } else {
                                requestAnimationFrame(_ => moveView(evt));
                            }
                        }
                        evt.stopPropagation();
                        if(!$rootScope.$$phase) $scope.$apply();
                    }

                    // Ondragend on node callback
                    function releaseDragOnNode(e) {
                        cleanMoveCursor();
                        if ( e.originalEvent && e.originalEvent.detail == 2 ) {
                            let zoneId = $(this).attr('id');
                            if (!$stateParams.zoneId && zoneId.startsWith('zone_')) {
                                zoneId = zoneId.split('_')[1];
                                $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId }));
                            }
                        }
                        const coordinates = mouseViewportCoordinates(e);
                        // travelled distance
                        if (original_click && square_distance(coordinates, original_click) < 16) {
                            // if mouse has moved less than 4px
                            if ((e.which == 1) || (e.which == 2) || (e.type=='touchend')) {
                                const nodeId = $(this).attr('data-id');
                                const node = FlowGraph.node(nodeId);
                                if (node) {
                                    GraphZoomTrackerService.setFocusItemCtx(node);
                                    FlowGraphSelection.onItemClick(node, e);
                                    $scope.$apply();
                                }
                            }
                        }
                        clearOriginalCoordinates();
                        removeListeners();
                        //$scope.$apply();
                        e.stopPropagation();
                    }

                    // Ondragend on unfold callback
                    function releaseDragOnUnfoldButton(e) {
                        cleanMoveCursor();
                        if ( e.originalEvent && e.originalEvent.detail == 2 ) {
                            return; // that's a double click
                        }
                        FlowGraphFolding.unfoldNode(this);


                        clearOriginalCoordinates();
                        removeListeners();
                        e.stopPropagation();
                    }

                    // Ondragend on unfold callback
                    function releaseDragOnZone(e) {
                        cleanMoveCursor();
                         if ( e.originalEvent && e.originalEvent.detail == 2 ) {
                            const zoneId = $(this).attr('id').split('_')[2];
                            $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId }));
                            return;
                        }
                        const coordinates = mouseViewportCoordinates(e);
                        // travelled distance
                        if (original_click && square_distance(coordinates, original_click) < 16) {
                            // if mouse has moved less than 4px
                            if ((e.which == 1) || (e.which == 2) || (e.type=='touchend')) {
                                const nodeId = $(this).attr('id').split(/_(.+)/)[1];
                                const node = FlowGraph.node(nodeId);
                                if (node) {
                                    GraphZoomTrackerService.setFocusItemCtx(node);
                                    FlowGraphSelection.onItemClick(node, e);
                                    $scope.$apply();
                                }
                            }
                        }
                        clearOriginalCoordinates();
                        removeListeners();
                        //$scope.$apply();
                        e.stopPropagation();

                    }

                    // Ondragend on something else than a node
                    function releaseDrag(e) {
                        cleanMoveCursor();
                        try {
                            const coordinates = mouseViewportCoordinates(e);
                            if (original_click) {
                                // travelled distance
                                if (square_distance(coordinates, original_click) < 16) {
                                    // if mouse has moved less than 4px
                                    const isTagEditPopoverOpened = $(".tag-edit-popover__popover")[0];
                                    if ((e.which == 1 || e.which == 2 || e.type=='touchend') && !(e.metaKey || e.shiftKey) && !isTagEditPopoverOpened) {
                                        FlowGraphSelection.clearSelection();
                                    }
                                } else if ($scope.rectangleSelection) {
                                    commitRectangleSelection(e);
                                }
                            }
                        } catch (e) {
                            Logger.error(e);
                        }
                        clearOriginalCoordinates();
                        removeListeners();
                        $scope.$apply();
                    }

                    return function(evt) {
                        if (!$scope.svg) {
                            return;
                        }
                        if (evt.which == 1 || evt.type == 'touchstart') {
                            const coordinates = mouseViewportCoordinates(evt);
                            original_coordinates = {
                                x: $scope.panzoom.x + $scope.panzoom.width * (coordinates.x / $scope.panzoom.WIDTH),
                                y: $scope.panzoom.y + $scope.panzoom.height * (coordinates.y / $scope.panzoom.HEIGHT)
                            };
                            original_graph_coordinates = mouseGraphCoordinates(evt);
                            original_click = {
                                x: coordinates.x,
                                y: coordinates.y
                            };
                        }

                        //store the item under the cusror at the beginning of what could be a drag&drop action
                        $applyMoveCursorInitialItem = $(evt.target);

                        $(document).on('mousemove', drag);
                        $element.on('mouseenter', applyMoveCursorSelector, applyMoveCursor);
                        $element.on('mouseup', 'svg [class~=node]', releaseDragOnNode);
                        $element.on('mouseup', 'svg [class~=zone_cluster]', releaseDragOnZone);
                        $element.on('mouseup', 'svg [class~=folded-icon]', releaseDragOnUnfoldButton);

                        $(document).on('mouseup', releaseDrag);

                        if (isTouchDevice()) {
                            $(document).on('touchmove', monoTouchCallBack(drag));
                            $element.on('touchend', 'svg [class~=node]', releaseDragOnNode);
                            $element.on('touchend', 'svg [class~=zone_cluster]', releaseDragOnZone);
                            $element.on('touchend', 'svg [class~=folded-icon]', releaseDragOnUnfoldButton);
                            $(document).on('touchend', releaseDrag);
                        }

                        $scope.$apply();
                    };
                })();

                $element.on('mousedown', dragStart);
                $element.on('touchstart', monoTouchCallBack(dragStart));

                $element.on('dblclick', 'svg [class~=node]', function (e) {
                    const nodeId = $(this).attr('data-id');
                    const node = FlowGraph.node(nodeId);
                    clearOriginalCoordinates();
                    $scope.onItemDblClick(node, e);
                    e.stopPropagation();
                });

                const KEYBOARD_FACTOR = 100;

                $scope.moveLeft = () => {
                    $scope.panzoom.x = $scope.panzoom.x + $scope.panzoom.width / 2 - $scope.panzoom.width * ((($scope.panzoom.WIDTH / 2) + KEYBOARD_FACTOR) / $scope.panzoom.WIDTH);
                    $scope.redraw();
                }

                $scope.moveRight = () => {
                    $scope.panzoom.x = $scope.panzoom.x + $scope.panzoom.width / 2 - $scope.panzoom.width * ((($scope.panzoom.WIDTH / 2) - KEYBOARD_FACTOR) / $scope.panzoom.WIDTH);
                    $scope.redraw();
                }

                $scope.moveUp = () => {
                    $scope.panzoom.y = $scope.panzoom.y + $scope.panzoom.height / 2 - $scope.panzoom.height * ((($scope.panzoom.HEIGHT / 2) + KEYBOARD_FACTOR) / $scope.panzoom.HEIGHT);
                    $scope.redraw();
                }

                $scope.moveDown = () => {
                    $scope.panzoom.y = $scope.panzoom.y + $scope.panzoom.height / 2 - $scope.panzoom.height * ((($scope.panzoom.HEIGHT / 2) - KEYBOARD_FACTOR) / $scope.panzoom.HEIGHT);
                    $scope.redraw();
                }
            }

            $scope.getNode = id => {
                if (!id) {
                    return undefined;
                }
                const item = $scope.nodesGraph.nodes[id];
                if (!item) {
                    return $scope.nodesGraph.nodes[id.replace("cluster_", "")];
                }
                return item;
            }

            $scope.getSelector = (id, node) => {
                const item = node ? node : $scope.getNode(id);
                let selector = id ? `g[data-id=${id}]` : 'g .highlight';
                if (item && item.nodeType === 'ZONE') {
                    selector = `#cluster_${id}`;
                }
                return selector;
            }

            $scope.zoomGraph = (id, paddingFactor = 3, item = null) => {
                FlowGraphFolding.ensureNodesNotFolded([id]);
                if (!item) {
                    item = $scope.getNode(id);
                }
                const selector = $scope.getSelector(id, item);
                if (item && item.nodeType === 'ZONE') {
                    paddingFactor = 1.5;
                }
                $scope.zoomToBbox(FlowGraphFiltering.getBBoxFromSelector($scope.svg, selector), paddingFactor);
            };

            $scope.zoomToBbox = function(bbox, paddingFactor = 1.5) {
                if (!$scope.svg || !bbox) return;
                $scope.panzoom.x = bbox.x;
                $scope.panzoom.y = bbox.y;

                if (bbox.width / bbox.height > $scope.panzoom.WIDTH / $scope.panzoom.HEIGHT) {
                    $scope.panzoom.width = bbox.width;
                    $scope.panzoom.height = bbox.width / ($scope.panzoom.WIDTH / $scope.panzoom.HEIGHT);
                    $scope.panzoom.y = bbox.y - ($scope.panzoom.height - bbox.height) / 2;
                } else {
                    $scope.panzoom.width = bbox.height * ($scope.panzoom.WIDTH / $scope.panzoom.HEIGHT);
                    $scope.panzoom.height = bbox.height;
                    $scope.panzoom.x = bbox.x - ($scope.panzoom.width - bbox.width) / 2;
                }

                const menuHeight = $('#flow-editor-page .menu').height();
                const x = $scope.panzoom.WIDTH / 2;
                const y = ($scope.panzoom.HEIGHT - menuHeight) / 2 + menuHeight;
                $scope.panzoom.x = $scope.panzoom.x + $scope.panzoom.width * (x / $scope.panzoom.WIDTH) * (1 - paddingFactor);
                $scope.panzoom.y = $scope.panzoom.y + $scope.panzoom.height * (y / $scope.panzoom.HEIGHT) * (1 - paddingFactor);
                $scope.panzoom.width  = $scope.panzoom.width * paddingFactor;
                $scope.panzoom.height = $scope.panzoom.height * paddingFactor;

                d3.select($scope.svg[0]).transition(300).attr(
                    'viewBox', [
                        $scope.panzoom.x,
                        $scope.panzoom.y,
                        $scope.panzoom.width,
                        $scope.panzoom.height
                    ].join(', ')
                );
            };

            setupZoomBehavior();
            setupMoveAndSelectBehavior();

            Mousetrap.bind("Z S", _ => $scope.zoomToBbox(FlowGraphFiltering.getBBoxFromSelector($scope.svg, '.selected')));
            $scope.$on("$destroy", _ => Mousetrap.unbind("Z S"));

            Mousetrap.bind("Z F", _ => $scope.zoomToBbox(FlowGraphFiltering.getBBoxFromSelector($scope.svg, '.focus')));
            $scope.$on("$destroy", _ => Mousetrap.unbind("Z F"));

            Mousetrap.bind("Z U", _ => $scope.zoomToBbox(FlowGraphFiltering.getBBoxFromSelector($scope.svg, '.usedDatasets .node')));
            $scope.$on("$destroy", _ => Mousetrap.unbind("Z U"));

            Mousetrap.bind("j e l l y", function(){
                let x = [];
                let y = [];
                let t = c => (c||0)*0.95 + 10 * (Math.random() - 0.5);
                let d = 9000;
                window.setInterval(function(){
                    d3.selectAll("g.node,g.edge").transition().duration(d).ease("elastic").attr("transform", function(d, i) {
                        [x[i], y[i]] = [t(x[i]), t(y[i])];
                        return "translate(" + x[i] + " , " + y[i] + ")";
                    });
                }, d*0.09);
            });

            Mousetrap.bind("d i s c o", function(){
                let r = {};
                let g = {};
                let b = {};
                let s = c => (c === undefined ? 255*Math.random() : c) + 100 * (Math.random() - 0.5);
                let bn = c => Math.max(0, Math.min(255, c));
                let sb = c => bn(s(c))
                let d = 2000;
                window.setInterval(function(){
                    d3.selectAll("g.node,g.edge").transition().duration(d).ease("elastic").style("fill", function(d,i) {
                        let id = $(this).attr('id')+'';
                        r[id] = sb(r[id])
                        g[id] = sb(g[id])
                        b[id] = sb(b[id])
                        // [r[id], g[id], b[id]] = [sb(r[id]), sb(g[id]), sb(b[id])];
                        return `rgb(${r[id]}, ${g[id]}, ${b[id]})`;
                    });
                }, d*0.09);
            });

            Mousetrap.bind("b e r n a r d", function(){
                d3.select($scope.svg[0])
                    .append("defs")
                    .append('pattern')
                    .attr('id', 'bp')
                    .attr('patternUnits', 'userSpaceOnUse')
                    .attr('width', 120)
                    .attr('height', 120)
                    .append("image")
                    .attr("xlink:href", "https://dev.dataiku.com/egg/bp.jpg")
                    .attr('width', 122)
                    .attr('height', 110)
                    .attr('x', -11);

                d3.select($scope.svg[0]).selectAll("g[data-recipe-type='pivot']").selectAll("path").attr("fill", "url(#bp)");
                d3.select($scope.svg[0]).selectAll("g[data-recipe-type='pivot']").style("opacity", "1")
            })

            let last_svg_str; //cache used only withing state, going out of the flow discards it
            let last_svg_element;
            let last_$svg;
            let last_filter_str;
            let last_nodes;
            let last_unread_ids;
            let deregister = $rootScope.$on('drawGraph', function (tgtScope, filter, indexNodes) {
                if (!$scope.nodesGraph.nodes) return; // Too early

                if (!filter && $scope.filtering) {
                    const filteringResults = $scope.filtering.filteringResults;
                    if (filteringResults && filteringResults.filteredGraphElements && !filteringResults.filteringError) {
                        filter = $scope.createGraphFilteringObject(filteringResults.filteredGraphElements);
                    }
                }

                let svgElement;
                let cachedSVG = !!$stateParams.projectKey && last_svg_str == $scope.nodesGraph.svg && last_filter_str === JSON.stringify(filter) && (!filter || !filter.ignoreCache) && angular.equals($scope.nodesGraph.nodes, last_nodes) && angular.equals(($rootScope.discussionsUnreadStatus || {}).unreadFullIds || [], last_unread_ids); // TODO and = last filter TODO
                if (cachedSVG) {
                    Logger.debug('use cached svg');
                    svgElement = last_svg_element;
                } else {
                    svgElement = $($scope.nodesGraph.svg);

                    // Manipulate the SVG in a hidden DIV as far as possible before switching to it,
                    // rather than switch early and then apply a sequence of changes. When we switch, don't change the SVG element, but its contents

                    $element.addClass('no-animation'); // Initial rendering should not have animation (especially when a flow view is active)

                    if (filter) {
                        let fakeElt = $('<div />');
                        fakeElt.append(svgElement);
                        FlowGraphFiltering.filterGraph(fakeElt.find('svg'), filter);
                    }

                    last_svg_str = $scope.nodesGraph.svg;
                    last_filter_str = JSON.stringify(filter);
                    last_svg_element = svgElement;
                    last_$svg = $element.find('svg');
                    last_nodes = $scope.nodesGraph.nodes;
                    last_unread_ids = angular.copy(($rootScope.discussionsUnreadStatus || {}).unreadFullIds || []);
                }

                if (!!$stateParams.zoneId) {
                    svgElement = $(svgElement).find(`.zone#zone_${$stateParams.zoneId}>svg`).removeAttr('x').removeAttr('y')
                }

                if (cachedSVG) {
                    Logger.debug('Graph is ready, reset style');
                    //TODO @flow move to do flow styling + views
                    $('g', $scope.svg).removeAttr('style');
                    $('.newG', $scope.svg).removeAttr('color');
                    $('.tool-simple-zone', $scope.svg).empty();
                    $('.node-label', $scope.svg).remove();
                    $('.node-totem span', $scope.svg).removeAttr('style').removeClass();
                    $('.never-built-computable *', $scope.svg).removeAttr('style');
                    $scope.svg = last_$svg;

                    $scope.$emit('refreshFlowState');
                } else {
                    Logger.debug('Graph is not ready, add svg element', svgElement);

                    var isReload = false;

                    if ($element.children().length > 0) {
                        isReload = true;
                        $element.append("<div style='visibility:hidden; width:100%; height:100%' id='hc-svnt-dracones'></div>")
                        var $preloadedGraph = $element.find('#hc-svnt-dracones');
                        $preloadedGraph.append(svgElement);
                        $scope.svg = last_$svg = $preloadedGraph.find('>svg');
                    } else {
                        $element.children().remove();
                        $element.find('svg').remove();
                        $element.append(svgElement);
                        $scope.svg = last_$svg = $element.find('>svg');
                    }

                    const bbFlow = $scope.svg.find('g.graph')[0].getBBox(); //get the whole-flow bounding box
                    const defaultPz = buildDefaultPanZoomSettings($scope.panzoom, bbFlow);
                    if (!GraphZoomTrackerService.isValidPanZoom($scope.panzoom)) {
                        $scope.panzoom = defaultPz;
                    }

                    $scope.svg.attr('height', '100%').attr('width', '100%');

                    // remove background polygon
                    // Firefox use to have an issue but seems resolved with recent version (Check history of the file)
                    $scope.svg[0].setAttribute('viewBox', '-10000 -10000 10 10'); //mjt move offscreen to avoid flicker
                    $scope.svg.find('g').first().attr('transform', '').find('polygon').first().remove();
                    d3.select($scope.svg[0]).selectAll("g.cluster:not(.zone_cluster)").remove()


                    if (!!$stateParams.projectKey) {
                        ProjectFlowGraphStyling.restyleGraph($scope.svg, $scope);
                        ProjectFlowGraphLayout.relayout($scope.svg);
                    } else {
                        InterProjectGraphStyling.restyleGraph($scope.svg, $scope);
                        InterProjectGraphLayout.relayout($scope.svg);
                    }
                    $scope.$emit('graphRendered');
                    $scope.$emit('refreshFlowState');
                }
                FlowGraphSelection.refreshStyle();

                if (filter) {
                    FlowGraphFiltering.fadeOut($scope.svg, filter);
                }

                $('#flow-graph').attr('style', '');
                $rootScope.$broadcast('reflow');

                //mjt experiment in anti-flicker
                if (isReload) {
                    const $newSvg = $preloadedGraph.children().first();//find('svg');
                    const $origSvg = $element.children().first();
                    $origSvg.children().remove();
                    $origSvg.append($newSvg.children());
                    $scope.svg = last_$svg = $element.find('>svg');
                    $preloadedGraph.remove();
                }

                if (indexNodes === true) {
                    let graphDOM = $scope.svg.find('g.graph')[0];
                    if (graphDOM) {
                        FlowGraph.indexNodesCoordinates($scope.svg, graphDOM.getBBox());
                    }
                }

            }, true);
            $scope.$on('$destroy', deregister);

            $element[0].oncontextmenu = function(evt) {
                const itemElt =  $(evt.target).parents('g[data-type]').first();
                let nodeId = $(itemElt).attr('data-id');
                if (itemElt.attr("data-type") === "ZONE") {
                    nodeId = nodeId.replace("cluster_", "");
                }
                const node = FlowGraph.node(nodeId);
                return $scope.onContextualMenu(node, evt);
            };

            //TODO @flow move?
            $scope.$watchCollection('tool.user.state.focusMap', function(nv,ov) {
                if (!nv ) return;
                $scope.tool.drawHooks.updateFlowToolDisplay();
                $scope.tool.saveFocus();
            })


            $scope.$on('graphRendered', function() {
                if (FlowGraph.get().nodes.length < 200) { // Too slow for bigger graphs
                    Logger.debug('Reactivate animations')
                    $('#flow-graph').toggleClass('no-animation', false);
                }
            });
            // Attempt to render SVG into canvas, so as to extract a dataURL that could in turn be used as a thumbnail
            // It lacks a lot of refinement, but the core principle is solid
            //NOSONAR
            // $scope.$on('graphRendered', function() {
            //     setTimeout(function() {
            //         if($scope.svg.length) {
            //             const canvas = $('<canvas style="width:600px;height:300px;position:absolute;top:0;left:0;border:solid;"></canvas>')[0];
            //             const ctx = canvas.getContext('2d');
            //
            //             const data = "data:image/svg+xml," + $scope.svg[0].outerHTML.replace('height=""', 'height="600"').replace('width=""', 'width="300"');
            //             const img = new Image();
            //             img.src = data;
            //             img.onload = function() { ctx.drawImage(img, 0, 0, 600, 300); }
            //             document.body.appendChild(canvas);
            //         }
            //     }, 1000)
            // })

            }
        };
    });


    app.directive('flowGraphWithTooltips', function($rootScope, FlowGraph, ChartTooltipsUtils, WatchInterestState) {

    return {
        restrict: 'EA',
        link: function (scope, element, attrs) {
            let tooltip, tooltipScope;
            let timeout;
            const DEFAULT_DELAY = 500;
            const SHORT_DELAY = 250; // Just enough so that if you just want to click on an item, you don't see the tooltip

            function show(node, tooltipScope, evt, delay) {
                timeout = setTimeout(function() {
                    ChartTooltipsUtils.handleMouseOverElement(tooltipScope);
                    tooltipScope.node = node;
                    tooltipScope.$apply();
                    ChartTooltipsUtils.appear(tooltip, '#777', evt, element);
                }, delay);
            }

            function hide(digestInProgress) {
                if (tooltipScope == null) return; // might not be ready yet
                clearTimeout(timeout);
                ChartTooltipsUtils.handleMouseOutElement(tooltip, tooltipScope, digestInProgress);
            }

            function addTooltipBehavior(elt, boxplot) {
                const nodeId = elt.attr('data-id');
                const node = FlowGraph.node(nodeId);

                if (node) {
                    elt.on("mouseover", function(d, i) {
                        if (node.filterRemove || tooltipScope == null) return; // might not be ready yet

                        if (scope.tool && scope.tool.drawHooks && scope.tool.drawHooks.setupTootip) {
                            tooltipScope.tooltip = scope.tool.drawHooks.setupTootip(node);
                            show(node, tooltipScope, d3.event, SHORT_DELAY);
                        } else if ((node.nodeType.endsWith('DATASET') || node.nodeType.endsWith('ZONE')) && !node.shortDesc && !(node.tags && node.tags.length)) {
                            return; // Let's not display the tooltip just for the name of the dataset...
                        } else {
                            tooltipScope.tooltip = {};
                            show(node, tooltipScope, d3.event, DEFAULT_DELAY);
                        }
                    })
                        .on("mouseout", hide);
                }
            }

            ChartTooltipsUtils.createWithStdAggr1DBehaviour(scope, attrs.tooltipType || 'flow-tooltip', element)
                .then(function(x){
                    tooltip = x[0];
                    tooltipScope = x[1];
                })
                .then(() => {
                    tooltipScope.isWatching = WatchInterestState.isWatching;
                });

            scope.setupTootips = function() {
                $('[data-id][data-type]:not([data-type="ZONE"])').each(function(_, g) {
                    addTooltipBehavior(d3.select(g))
                });
                $('.zone_cluster').each(function(_, g) {
                    addTooltipBehavior(d3.select(g))
                });
            }

            const h = $rootScope.$on('flowSelectionUpdated', _ => hide(true));
            scope.$on('$destroy', h);

            scope.$on("graphRendered", scope.setupTootips);
        }
    }
    });


    // Used to have global variables...
    app.service('FlowGraph', function($rootScope) {
        const svc = this;

        let graph;
        let nodesElements;
        let edgesElementsTo;
        let edgesElementsFrom;
        let nodesCoordinates; // simple list: [{nodeId, middlePoint}]
        let zonesElements;
        let graphBBox;

        this.set = function(g) {
            graph = g;
        };

        this.get = function() {
            return graph;
        };

        this.node = function(nodeId) {
            return graph.nodes[nodeId];
        };

        this.nodeCount = function() {
            return graph.nodesOnGraphCount;
        };

        this.getDOMElement = function() {
            return $('#flow-graph');
        };

        this.getSvg = function() {
            return $('#flow-graph > svg');
        };

        this.rawNodeWithId = function(nodeId) {
            if (!nodesElements) return; // not ready
            return nodesElements[nodeId];
        };
        this.d3NodeWithId = function(nodeId) {
            if (!nodesElements) return; // not ready
            return d3.select(svc.rawNodeWithId(nodeId));
        };
        this.d3ZoneNodeWithId = function(nodeId) {
            if (!zonesElements) return; // not ready
            return d3.select(zonesElements[nodeId]);
        };
        this.rawZoneNodeWithId = function(nodeId) {
            if (!zonesElements) return; // not ready
            return zonesElements[nodeId];
        };

        this.rawEdgesWithFromId = function(nodeId) {
            if (!edgesElementsFrom) return [];
            return edgesElementsFrom[nodeId] || [];
        };

        this.rawEdgesWithToId = function(nodeId) {
            if (!edgesElementsTo) return [];
            return edgesElementsTo[nodeId] || [];
        };

        // No fancy search (for now?)
        this.getEnclosedNodesIds = function(rect) {
            if (!nodesCoordinates) return []; // not ready
            const bounds = {x1: rect.x, y1: rect.y, x2: rect.x + rect.width, y2: rect.y + rect.height};
            return nodesCoordinates.filter(c => c.middlePoint.x >= bounds.x1 && c.middlePoint.x <= bounds.x2 && c.middlePoint.y >= bounds.y1 && c.middlePoint.y <= bounds.y2).map(c => c.nodeId);
        };

        // Return the graphBBox, filled when indexNodesCoordinates is called
        this.getGraphBBox = function() {
            return graphBBox;
        }

        this.setGraphBBox = function(newBBox) {
            graphBBox = newBBox;
        }

        this.indexNodesCoordinates = function(globalSvg, svgBBox) {
            nodesElements = {};
            edgesElementsTo = {};
            edgesElementsFrom = {};
            zonesElements = {};
            nodesCoordinates = [];

            function pushEltToEdgeMap(nodeId, elt, edgeMap) {
                if (nodeId) {
                    if (!edgeMap[nodeId]) edgeMap[nodeId] = [];
                    edgeMap[nodeId].push(elt);
                }
            }
            this.setGraphBBox(svgBBox);
            $('.usedDatasets .node,.connectedProjects .node', globalSvg).each(function(_, elt) {
                const nodeId = $(elt).attr('data-id');
                const bbox = elt.getBBox();
                const svg = $(elt).closest('svg');

                if (!svg.is(globalSvg)) {
                     // In case the parent is a zone, map the bbox to the globalSVG coords
                    const matrix = elt.getTransformToElement(globalSvg[0]);
                    let topLeft = svg[0].createSVGPoint();
                    topLeft.x = bbox.x;
                    topLeft.y = bbox.y;

                    topLeft = topLeft.matrixTransform(matrix);

                    bbox.x = topLeft.x;
                    bbox.y = topLeft.y;
                }

                const middlePoint = {x: bbox.x + bbox.width/2, y: bbox.y + bbox.height/2}
                nodesElements[nodeId] = elt;
                nodesCoordinates.push({nodeId, middlePoint});
            });

            // build a map of edges to accelerate path highlighting hugely on large flows
            $('.edge', globalSvg).each(function(_, elt) {
                pushEltToEdgeMap($(elt).attr('data-from'), elt, edgesElementsFrom);
                pushEltToEdgeMap($(elt).attr('data-to'), elt, edgesElementsTo);
            });

            $('.draftDatasets > .node', globalSvg).each(function(_, elt) {
                const nodeId = $(elt).attr('data-id');
                const bbox = elt.getBBox();
                const svg = $(elt).closest('svg');

                if (!svg.is(globalSvg)) {
                    // In case the parent is a zone, map the bbox to the globalSVG coords
                    const matrix = elt.getTransformToElement(globalSvg[0]);

                    let topLeft = svg[0].createSVGPoint();
                    topLeft.x = bbox.x;
                    topLeft.y = bbox.y;

                    topLeft = topLeft.matrixTransform(matrix);

                    bbox.x = topLeft.x;
                    bbox.y = topLeft.y;
                } else {
                    bbox.x = svgBBox.x + bbox.x;
                    bbox.y = svgBBox.y + bbox.y;
                }

                const middlePoint = { x: bbox.x + bbox.width/2, y: bbox.y + bbox.height/2 };
                nodesElements[nodeId] = elt;
                nodesCoordinates.push({nodeId, middlePoint});
            });

            $('.zone_cluster', globalSvg).each(function(_, elt) {
                const nodeId = $(elt).attr('id').replace('cluster_', '');

                zonesElements[nodeId] = elt;
            });

            $rootScope.$emit('flowDisplayUpdated');
            $rootScope.$broadcast('indexNodesDone');
        };

        this.ready = function() {
            return !!graph && !!nodesCoordinates;
        };

        // Some services make API calls that require to be displayed in API error directive so bound to a scope
        // But the services have no scope and binding errors to rootScope is inconvenient
        // (because the error won't necessarily go away when moving to another state)
        this.setError = function() {
            const flowGraphScope = angular.element('#flow-graph').scope();
            return setErrorInScope.bind(flowGraphScope);
        }

        this.updateTagsFromFlowTool = function(tagsByNode) {
            Object.keys(graph.nodes).forEach(node => {
                if (tagsByNode.hasOwnProperty(node)) graph.nodes[node].tags = tagsByNode[node];
            });
        }

        this.nodeSharedBetweenZones = node => {
            const found = graph.zonesUsedByRealId[node.realId];
            if (found) {
                const set = new Set(found);
                set.delete(node.ownerZone);
                return set;
            }
            return null;
        };
    });


    function square_distance(A, B) {
        const dx = A.x - B.x;
        const dy = A.y - B.y;
        return (dx*dx + dy*dy);
    }

    /**
     * Create a panZoom structure that will display the whole flow nicely.
     * This is the classic fall-back display used when there is no saved zoom settings
     * or the flow is too small to justify re-using the saved zoom settings.
     *
     * @param currentPz - the current panZoom settings.
     * @param bbFlow - the SVG bounding box structure for the whole flow
     * @returns a new panZoom structure
     */
    function buildDefaultPanZoomSettings(currentPz, bbFlow) {
        //copy existing settings, in particular the HEIGHT/WIDTH (for the HTML container,
        // and typically the maxHeight / maxWidth, which control how far you can zoom out.

        const pz = angular.copy(currentPz);

        pz.width = bbFlow.width;
        pz.height = bbFlow.height;
        pz.x = bbFlow.x;
        pz.y = bbFlow.y;
        if (bbFlow.width / bbFlow.height > pz.WIDTH / pz.HEIGHT) {
            pz.width = bbFlow.width;
            pz.height = bbFlow.width * (pz.HEIGHT / pz.WIDTH);
            pz.y = bbFlow.y - (pz.height - bbFlow.height) / 2;
        } else {
            pz.width = bbFlow.height * (pz.WIDTH / pz.HEIGHT);
            pz.height = bbFlow.height;
            pz.x = bbFlow.x - (pz.width - bbFlow.width) / 2;
        }

        pz.maxHeight = pz.height;
        pz.maxWidth = pz.width;

        return pz;
    }

})();
