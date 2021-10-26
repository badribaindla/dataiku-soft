(function() {
'use strict';

const app = angular.module('dataiku.flow.tools');


app.service('PropagateSchemaFlowTools', function($rootScope, $stateParams,
    DataikuAPI, ContextualMenu, Logger,
    FlowGraph, FlowViewsUtils, FlowToolsUtils, $q, ComputableSchemaRecipeSave) {

    const NAME = 'PROPAGATE_SCHEMA';

    this.getDefinition = function() {
        return {
            getName: () => NAME,
            getToolDisplayName: function(toolDef) {
                return "Check schema from " + toolDef.toolInitialData.datasetName;
            },

            initFlowTool: function(tool) {

                tool.user = {
                    updateStatus: {
                        updating: false
                    },
                    updateOptions: {
                        performExpensive: true,
                        doAnyRebuildingReqd: false,
                        doBuildAll: false,
                        recheckAll: false,
                        alwaysRebuildInputOfRecipesUsuallyComputingOutputSchemaBasedOnData: true,
                        alwaysRebuildOutputOfRecipesUsuallyComputingOutputSchemaAtRuntime: true
                    }
                };

                tool.user.canMarkRecipeAsOK = function(recipeName) {
                    let nodeId = graphVizEscape("recipe_" + recipeName);
                    if (tool.user.state &&  tool.user.state.stateByNode[nodeId]) {
                        return tool.user.state.stateByNode[nodeId].state != "OK";
                    } else {
                        return false;
                    }
                }

                tool.user.markRecipeAsOK = function(recipeName) {
                    DataikuAPI.flow.tools.propagateSchema.markRecipeAsOKForced($stateParams.projectKey, recipeName).success(function(data) {
                        tool.user.state = data;
                        tool.drawHooks.updateFlowToolDisplay();
                    })
                }

                tool.drawHooks.updateFlowToolDisplay = function() {
                    if (!tool.user.state) return; // protect against slow state fetching
                    if (!FlowGraph.ready()) return; // protect against slow graph fetching

                    let svg = FlowGraph.getSvg();
                    tool.user.state.itemsToRebuild = [];

                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        const nodeElt = FlowGraph.d3NodeWithId(nodeId);
                        const nodeState = tool.user.state.stateByNode[node.realId];

                        //TODO @flow factorize cleanNode
                        nodeElt.classed('focus', false).classed('out-of-focus', false);
                        $('.tool-simple-zone', FlowGraph.getSvg()).empty();
                        $('.node-totem span', nodeElt[0]).removeAttr('style').removeClass();
                        $('.never-built-computable *', nodeElt[0]).removeAttr('style');

                        Logger.info("NodeState: ", nodeId, nodeState);
                        if (!nodeState) {
                            const color = "#E9E9E9";
                            // Node is not involved in this
                            FlowToolsUtils.colorNode(node, nodeElt, color);

                            svg.find('[data-to="' + nodeId + '"]').each(function () {
                                d3.select(this).classed('grey-out-path',true).selectAll("path, ellipse").classed('grey-out-path',true);
                            });
                            svg.find('[data-from="' + nodeId + '"]').each(function () {
                                d3.select(this).classed('grey-out-path',true).selectAll("path, ellipse").classed('grey-out-path',true);
                            });
                        } else if (nodeState.state == "DATASET_NEEDS_REBUILD") {
                            node.partitioning = nodeState.partitioning;
                            node.buildPartitions = nodeState.buildPartitions;
                            tool.user.state.itemsToRebuild.push({type: 'DATASET', node: node});
                            FlowToolsUtils.colorNode(node, nodeElt, "orange");
                        } else if (nodeState.state == "UNCHECKABLE") {
                            FlowToolsUtils.colorNode(node, nodeElt, "orange");
                        } else if (nodeState.state == "EXCLUDED") {
                            FlowToolsUtils.colorNode(node, nodeElt, "lightgrey");
                        } else if (nodeState.state == "UNCHECKED") {
                            FlowToolsUtils.colorNode(node, nodeElt, "grey");
                        } else if (nodeState.state == "OK") {
                            FlowToolsUtils.colorNode(node, nodeElt, "green");
                        } else if (nodeState.state == "NOK") {
                            FlowToolsUtils.colorNode(node, nodeElt, "red");
                         } else if (nodeState.state == "FAILED_CHECK") {
                            FlowToolsUtils.colorNode(node, nodeElt, "purple");
                        }
                    });
                }

                tool.user.ignoreAllSuggestionsWithState = function(parentScope, state) {
                    var promises = [];

                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        const nodeElt = FlowGraph.d3NodeWithId(nodeId);
                        const nodeState = tool.user.state.stateByNode[node.realId];

                        if (nodeState && nodeState.state == state) {
                            Logger.info("Ignoring suggestion on node", nodeId);
                            const recipeName = node.name;

                            var deferred = $q.defer();
                            DataikuAPI.flow.tools.propagateSchema.markRecipeAsOKForced($stateParams.projectKey, recipeName).success(function(data) {
                                deferred.resolve();
                            }).error(FlowGraph.setError());
                            promises.push(deferred.promise);
                        }
                    });
                    Logger.info("Waiting on ", promises.length, "promises")
                    $q.all(promises).then(function() {
                        Logger.info("Done Waiting on ", promises.length, "promises");
                        parentScope.update();
                    });
                }

                tool.user.acceptAllRecipeSuggestions = function(parentScope){
                    var promises = [];

                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        const nodeElt = FlowGraph.d3NodeWithId(nodeId);
                        const nodeState = tool.user.state.stateByNode[node.realId];

                        if (nodeState && nodeState.state == "NOK") {
                            Logger.info("Accepting suggestion on node", nodeId);
                            const recipeName = node.name;

                            var deferred = $q.defer();

                            ComputableSchemaRecipeSave.handleSchemaUpdateWithPrecomputedUnattended(parentScope,
                                nodeState.updateSolution).then(function() {
                                Logger.info("Acceptance done on ", recipeName)
                                DataikuAPI.flow.tools.propagateSchema.markRecipeAsOKAfterUpdate($stateParams.projectKey, recipeName).success(function(data) {
                                    Logger.info("recipe marked as done, resolving deferred")
                                    deferred.resolve();
                                }).error(FlowGraph.setError());
                            });
                            promises.push(deferred.promise);
                        }
                     });
                    Logger.info("Waiting on ", promises.length, "promises")
                    $q.all(promises).then(function() {
                        Logger.info("Done Waiting on ", promises.length, "promises")
                        parentScope.update();
                    });
                }

                tool.actionHooks.onItemClick = function(node, evt) {
                    if (!tool.user.state) return; // protect against slow state fetching
                    let nodeState = tool.user.state.stateByNode[node.realId];

                    Logger.info("onItemClick nodeState ", nodeState);

                    ContextualMenu.prototype.closeAny();

                    if (nodeState && ["NOK", "FAILED_CHECK", "UNCHECKABLE"].indexOf(nodeState.state) >=0) {
                        let menuScope = $rootScope.$new();
                        menuScope.nodeState = nodeState;
                        menuScope.node = node;

                        new ContextualMenu({
                            template: "/templates/flow-editor/tools/propagate-schema-item-popup.html",
                            scope: menuScope,
                            contextual: false,
                            controller: "FlowToolPropagateItemPopupController"
                        }).openAtEventLoc(evt);
                    } else if (nodeState && nodeState.state == "DATASET_NEEDS_REBUILD") {
                        let menuScope = $rootScope.$new();
                        menuScope.nodeState = nodeState;
                        menuScope.node = node;

                        new ContextualMenu({
                            template: "/templates/flow-editor/tools/propagate-dataset-needs-rebuild-popup.html",
                            scope: menuScope,
                            contextual: false,
                            controller: "FlowToolPropagateDatasetNeedsRebuildPopupController"
                        }).openAtEventLoc(evt);
                    }
                };

                FlowViewsUtils.addAsynchronousStateComputationBehavior(tool);

                DataikuAPI.flow.tools.getState($stateParams.projectKey, NAME, {}).success(function(data) {
                    tool.user.state = data;
                    tool.drawHooks.updateFlowToolDisplay();
                }).error(FlowGraph.setError());
            },

            template: "/templates/flow-editor/tools/tool-propagate-schema.html"
        };
    };
});


app.controller("PropagateSchemaFlowToolMainController", function($scope, $q, Logger, DataikuAPI, $timeout, $stateParams, ActivityIndicator, Assert,
                                                                 JobDefinitionComputer, ComputableSchemaRecipeSave, PartitionSelection, CreateModalFromTemplate, $filter, AnyLoc) {

    checkChangesBeforeLeaving($scope, function () {return $scope.tool.user.updateStatus.multiPhaseUpdating;}, "Schema propagation in progress.  Leaving will abort the operation");

    function getCountOfProblemItems() {
        let sum = $scope.tool.user.state.summary;
        return sum.NOK + sum.UNCHECKABLE + sum.UNCHECKED + sum.DATASET_NEEDS_REBUILD + sum.FAILED_CHECK;
    }

    function isAnyRebuildingReqd() {
        return $scope.tool.user.updateOptions.doAnyRebuildingReqd || $scope.tool.user.updateOptions.doBuildAll;
    }

    function getItemToRebuild (toDoList, doneList) {
        let item =  toDoList.find( (item) => {
            return !doneList.includes(item.node.id);
        });
        if (item) {doneList.push(item.node.id)}
        return item;
    }

    function showIndicator(txt, isSuccess) {
        Logger.info("Showing indicator text:", txt, "success:", isSuccess);
        $scope.updateText = txt;
        if (isSuccess) {$timeout(() => $scope.updateText = "", 4000);}
    }

    function markDatasetAsOK(datasetName) {
        return DataikuAPI.flow.tools.propagateSchema.markDatasetAsBeingRebuilt($stateParams.projectKey, datasetName);
    }

    /**
     * Rebuild a dataset, marking as OK when done.
     * Returns promise to wait on for completion
     */
    function buildDataset(node) {
        const deferred = $q.defer();

        let jd = JobDefinitionComputer.computeJobDefForSingleDataset($stateParams.projectKey, "RECURSIVE_BUILD", node, node.buildPartitions ? node.buildPartitions : {});
        if (!$scope.isAborting) {
            $scope.startedJob = {nodeType:'DATASET', nodeName: node.name, nodeId: node.id};
            DataikuAPI.flow.jobs.start(jd).then((data) => {
                $scope.startedJob.jobId = data.data.id;
                waitForEndOfStartedJob().then (() => {
                    showIndicator("Marking dataset as OK: " + $scope.startedJob.nodeName);
                    let stateInfo = $scope.tool.user.state.stateByNode[node.realId];
                    if (stateInfo && stateInfo.state==="OK") {
                        deferred.resolve();
                    }else {
                        markDatasetAsOK($scope.startedJob.nodeName).finally(() => {
                            deferred.resolve();
                        });
                    }
                }, deferred.reject);
            }, (data) => {
                setErrorInScope.bind($scope)(data.data, data.status, data.headers);
                deferred.reject();
            });
        }
        return deferred.promise;
    }

    function rebuildNextAsReqd() {
        Logger.info("Making next step of auto-progress");
        if ($scope.isAborting) {return false;}
        if ($scope.tool.user.state.summary.UNCHECKABLE > 0) {
            Logger.info("I have some uncheckables, marking them as OK");
            showIndicator("Marking all uncheckable as OK");
            $scope.tool.user.ignoreAllSuggestionsWithState($scope, "UNCHECKABLE");
            return true;
        }
        if ($scope.tool.user.state.summary.NOK > 0) {
            Logger.info("I have some NOK, accepting suggestions");
            showIndicator("Accepting all suggestings");
            $scope.tool.user.acceptAllRecipeSuggestions($scope);
            return true;
        }
        else {
            Logger.info("No NOK nor UNCHECKABLE, building items that need to be built");
            return startRebuildNextItem();
        }
    }

    function startRebuildNextItem() {
        if (!$scope.itemsRebuildAttempted) {$scope.itemsRebuildAttempted = [];}

        const item = getItemToRebuild($scope.tool.user.state.itemsToRebuild, $scope.itemsRebuildAttempted);
        if (!item) {
            return false;
        } else {
            Assert.trueish(item.type === 'DATASET'); // We don't rebuild other stuff at the moment
            showIndicator("Rebuilding dataset " + item.node.name);
            buildDataset(item.node).finally($scope.update);
            return true;
        }
    }

    function markRecipeAsOK(recipeName, nodeId) {
        const nodeState = $scope.tool.user.state.stateByNode[nodeId];

        if (nodeState) {
            Logger.info("Accepting node after update", nodeId);

            let deferred = $q.defer();
            if (nodeState.state == "OK") {
                deferred.resolve();
            } else {
                ComputableSchemaRecipeSave.handleSchemaUpdateWithPrecomputedUnattended($scope,
                    nodeState.updateSolution).then(function () {
                    Logger.info("Acceptance done on ", recipeName)
                    DataikuAPI.flow.tools.propagateSchema.markRecipeAsOKAfterUpdate($stateParams.projectKey, recipeName).success(function (data) {
                        Logger.info("recipe marked as done, resolving deferred")
                        deferred.resolve();
                    }).error(setErrorInScope.bind($scope));
                });
            }
            return deferred.promise;
        }
    }

    function waitForEndOfStartedJob() {
        const deferred = $q.defer();

        function poll() {
            DataikuAPI.flow.jobs.getJobStatus($stateParams.projectKey, $scope.startedJob.jobId).then(function (data) {
                $scope.startedJob.jobStatus = data.data;
                let status = $scope.startedJob.jobStatus.baseStatus.state;

                if (status != "DONE" && status != "ABORTED" && status != "FAILED" && !$scope.isAborting) {
                    $scope.jobCheckTimer = $timeout(function () {
                        poll();
                    }, 2000);
                } else if (status == "DONE") {
                    deferred.resolve();
                } else {
                    deferred.reject();
                }
            }, setErrorInScope.bind($scope));
        }

        poll();
        return deferred.promise;
    }

    function getBuildAllJobDef() {
        var outputs = $scope.computables.filter(d => !d.removed).map(function(d) {
            const fullId = graphIdFor(d.type, AnyLoc.makeLoc(d.projectKey, d.id).fullId);
            const nodeFound = $scope.tool.user.state.stateByNode[fullId];
            if (d.type === 'DATASET') {
                return JobDefinitionComputer.computeOutputForDataset(d.serializedDataset, nodeFound ? nodeFound.buildPartitions : PartitionSelection.getBuildPartitions(d.serializedDataset.partitioning));
            } else if (d.type === 'MANAGED_FOLDER') {
                return JobDefinitionComputer.computeOutputForBox(d.box, nodeFound ? nodeFound.buildPartitions : PartitionSelection.getBuildPartitions(d.box.partitioning));
            } else {
                return { "targetDataset": d.id, "targetDatasetProjectKey": d.projectKey, "type": d.type };
            }
        });

        return {
            "type": "RECURSIVE_BUILD",
            "refreshHiveMetastore":true,
            "projectKey": $stateParams.projectKey,
            "outputs": outputs
        };
    }

    function startBuildAllJob(computables) {
        if ($scope.isAborting) {return;}

        $scope.computables = computables;
        showIndicator("Starting to build all...");
        DataikuAPI.flow.jobs.start(getBuildAllJobDef()).then((data) => {
            $scope.startedJob = {"jobId": data.data.id};
            showIndicator("Build all started...");
            waitForEndOfStartedJob().then (() => {
                    showIndicator("Build all completed", true);
                    $scope.tool.user.updateStatus.multiPhaseUpdating = false;
                }, () => {
                    showIndicator("Build all failed", true);
                    $scope.tool.user.updateStatus.multiPhaseUpdating = false;})
        }, setErrorInScope.bind($scope));
    }

    $scope.update = function(isStart) {
        const deferred = $q.defer();
        if (isStart) {
            $scope.isAborting = false;
            $scope.itemsRebuildAttempted = [];
            $scope.tool.user.updateOptions.recheckAll = (getCountOfProblemItems() == 0);
            $scope.tool.user.partitionedObjects = Object.values($scope.tool.user.state.stateByNode).filter(e => e.partitioning).map(e => Object.assign(e, {buildPartitions: [], name: AnyLoc.getLocFromSmart($stateParams.projectKey, e.fullId).localId }));
            if ($scope.tool.user.partitionedObjects && $scope.tool.user.partitionedObjects.length > 0 && $scope.tool.user.updateOptions.doAnyRebuildingReqd) {
                CreateModalFromTemplate("templates/flow-editor/tools/tool-propagate-schema-partitioning.html", $scope, null, function(newScope) {
                    newScope.computables = $scope.tool.user.partitionedObjects;
                    newScope.getIcon = computable => {
                        switch(computable.type) {
                            case 'DATASET':            return 'dataset ' + $filter('datasetTypeToIcon')(computable.subType);
                            case 'MANAGED_FOLDER':     return 'icon-folder-open';
                            case 'SAVED_MODEL':        return 'icon-machine_learning_regression';
                        }
                    };

                    newScope.continue = () => {
                        newScope.dismiss();
                        deferred.resolve();
                    }
                });
            } else {
                deferred.resolve();
            }
        } else {
            $scope.tool.user.updateOptions.recheckAll = false;
            deferred.resolve();
        }
        deferred.promise.finally(() => {
            if (!$scope.tool.user.updateStatus.multiPhaseUpdating) {
                $scope.tool.user.updateStatus.multiPhaseUpdating = isAnyRebuildingReqd();
                $scope.totalItemsToProcess = getCountOfProblemItems();
            }
            $scope.tool.user.updateStatus.totalPercent = 0;
            showIndicator("Propagating schema");
            $scope.tool.user.update($scope).then(() => {
                let multiPhase = false;
                for (const partitionedObject of $scope.tool.user.partitionedObjects) {
                    const escapedId = graphIdFor(partitionedObject.type, partitionedObject.fullId);
                    // Try with the index and fallback on slow search in case we missed a specific case for graphIds
                    let node = $scope.tool.user.state.stateByNode[escapedId];
                    if (node === undefined) {
                        node = Object.values($scope.tool.user.state.stateByNode).find(n => n.type === partitionedObject.type && n.fullId === partitionedObject.fullId)
                    }
                    if (node) {
                        node.buildPartitions = partitionedObject.buildPartitions;
                        node.partitioning = partitionedObject.partitioning;
                    }
                }
                $scope.tool.drawHooks.updateFlowToolDisplay()

                if ($scope.tool.user.updateOptions.recheckAll) {
                    $scope.totalItemsToProcess = getCountOfProblemItems();
                }

                if (isAnyRebuildingReqd()) {
                    multiPhase = rebuildNextAsReqd();
                }

                if (!multiPhase) {
                    if ($scope.tool.user.updateOptions.doBuildAll && !$scope.isAborting ) {
                        $scope.buildAll();
                        multiPhase = true;
                    }
                    else {
                        showIndicator($scope.isAborting ? "Schema propagation aborted ": "Schema propagation complete", true);
                    }
                }
                $scope.tool.user.updateStatus.multiPhaseUpdating = multiPhase;
            });

            $scope.tool.drawHooks.updateFlowToolDisplay();
        });
    };

    $scope.$watch('tool.user.updateOptions.doBuildAll', function (newVal) {
        let newRebuild = true;
        if (newVal) {
            $scope.prevRebuild = $scope.tool.user.updateOptions.doAnyRebuildingReqd;
        }
        else {
            newRebuild = $scope.prevRebuild;
        }
        $scope.tool.user.updateOptions.doAnyRebuildingReqd = newRebuild;
    });

    $scope.acceptAllRecipeSuggestions = function(){
         $scope.tool.user.acceptAllRecipeSuggestions($scope);
    };

    $scope.ignoreAllRecipeSuggestions = function(){
         $scope.tool.user.ignoreAllSuggestionsWithState($scope, "NOK");
    };

    $scope.markAllUncheckableAsOK = function(){
        $scope.tool.user.ignoreAllSuggestionsWithState($scope, "UNCHECKABLE");
    };

    $scope.getTotalPercent = function() {
        if ($scope.tool.user.updateStatus.multiPhaseUpdating) {
            let fixedItemsToDo = 1 + ($scope.tool.user.updateOptions.doBuildAll || 0); // '1 +' is allow us to show some progress from the start - gives positive feedback to user
            return 100 * (1+ $scope.totalItemsToProcess - getCountOfProblemItems()) / (fixedItemsToDo + Math.max($scope.totalItemsToProcess,1));
        }
        else {
            return $scope.tool.user.updateStatus.totalPercent;
        }
    };

    $scope.abortUpdate = function () {
        $scope.isAborting = true;
        if ($scope.startedJob && $scope.startedJob.jobId) {
            DataikuAPI.flow.jobs.abort($stateParams.projectKey, $scope.startedJob.jobId).error(setErrorInScope.bind($scope));
        }
        $scope.tool.user.updateStatus.multiPhaseUpdating = false;
        $scope.tool.user.updateStatus.updating = false;
        ActivityIndicator.hide();
    };

    $scope.buildAll = function () {
        DataikuAPI.flow.listDownstreamComputables($stateParams.projectKey, {computable: $scope.tool.currentSession.toolInitialData.datasetName})
            .success((computables) => {
                startBuildAllJob(computables);
            })
            .error(setErrorInScope.bind($scope));
    };
});

app.controller("FlowToolPropagateItemPopupController", function($scope, $controller, Assert, DataikuAPI, $stateParams, ComputableSchemaRecipeSave) {
    $controller('StandardFlowViewsMainController', {$scope: $scope});

    Assert.inScope($scope, 'tool');
    let recipeName = $scope.node.name;

    $scope.reviewSuggestion = function() {
        ComputableSchemaRecipeSave.handleSchemaUpdateWithPrecomputed($scope,
            $scope.nodeState.updateSolution).then(function() {
                DataikuAPI.flow.tools.propagateSchema.markRecipeAsOKAfterUpdate($stateParams.projectKey, recipeName).success(function(data) {
                    $scope.tool.user.state = data;
                    $scope.tool.drawHooks.updateFlowToolDisplay();
                })
            });
    }

    $scope.ignoreSuggestion = function() {
        let recipeName = $scope.node.name;

        DataikuAPI.flow.tools.propagateSchema.markRecipeAsOKForced($stateParams.projectKey, recipeName).success(function(data) {
            $scope.tool.user.state = data;
            $scope.tool.drawHooks.updateFlowToolDisplay();
        })
    }
});


app.controller("FlowToolPropagateDatasetNeedsRebuildPopupController", function($scope, $controller, Assert, DataikuAPI, $stateParams, ActivityIndicator, CreateModalFromTemplate) {
    $controller('StandardFlowViewsMainController', {$scope: $scope});
    Assert.inScope($scope, 'tool');
    let datasetName = $scope.node.name;

    $scope.build = function() {
        DataikuAPI.datasets.get($stateParams.projectKey, datasetName, $stateParams.projectKey).success(function(dataset) {
            CreateModalFromTemplate("/templates/datasets/build-dataset-modal.html", $scope, "BuildDatasetController", function(modalScope) {
                modalScope.dataset = dataset;
                modalScope.computeMode = "RECURSIVE_BUILD";
            }, "build-dataset-modal");

            $scope.$on("datasetBuildStarted", function() {
                ActivityIndicator.success("Dataset build started ... Please wait for end before continuing propagation");
            });

            DataikuAPI.flow.tools.propagateSchema.markDatasetAsBeingRebuilt($stateParams.projectKey, datasetName).success(function(data) {
                $scope.tool.user.state = data;
                $scope.tool.drawHooks.updateFlowToolDisplay();
            });
        });
    };

    $scope.ignoreSuggestion = function() {
        DataikuAPI.flow.tools.propagateSchema.markDatasetAsBeingRebuilt($stateParams.projectKey, datasetName).success(function(data) {
            $scope.tool.user.state = data;
            $scope.tool.drawHooks.updateFlowToolDisplay();
        })
    };
});


})();