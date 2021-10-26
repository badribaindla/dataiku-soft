(function(){
    'use strict';

    var app = angular.module('dataiku.flow.runtime');

    /** Directive job regular status */
    app.directive('jobStatusGraph', function ($state, $stateParams, $rootScope, DataikuAPI, ContextualMenu, FlowGraph, FlowGraphSelection, FlowGraphHighlighting, StateUtils, GraphZoomTrackerService) {
        return {
            controller: function ($scope, $element, $attrs) {

                const MAX_NODES = 200;
                let directiveScope = $scope, jobId, shouldGetGraph, graphData, jobGraph;
                const isPreview = $attrs.preview !== undefined;

                // Whether or not the flow is too big to be directly rendered (on list page!)
                $scope.hasBigFlow = false;
                // To force big flow rendering (on user manual action)
                $scope.forceFlow = false;

                // Returns the targets of the given activity
                function getTargetsByRecipeName(recipeName) {
                    let targets = [];
                    let activities = $scope.getJobAllActivities();
                    Object.keys(activities).forEach(function(activityKey) {
                        let activity = activities[activityKey];
                        if (graphVizEscape('recipe_' + activity.recipeName) === recipeName) {
                            targets = targets.concat(activity.targets);
                        }
                    });
                    return targets;
                }

                function fadeOutActivity(recipeName, node, fadeOutRecipe=true) {
                    if (fadeOutRecipe) { node.classList.add('fade-out--no-filter') }
                    let targets = getTargetsByRecipeName(recipeName);
                    targets.forEach(function(target) {
                        d3.select('svg [data-id="' + graphVizEscape('dataset_' + target.projectKey + "." + target.datasetName) + '"]').classed("fade-out--no-filter", true);
                        d3.select('svg [data-id="' + graphVizEscape('managedfolder_' + target.projectKey + "." + target.datasetName) + '"]').classed("fade-out--no-filter", true);
                        d3.select('svg [data-id="' + graphVizEscape('savedmodel_' + target.projectKey + "." + target.datasetName) + '"]').classed("fade-out--no-filter", true);
                    });
                }

                function setStatus(element, classes, value) {
                    let statusValue = document.createElement('span');
                    let statusIcon =  document.createElement('i');
                    statusIcon.className = 'node-status__icon ' + classes;
                    statusValue.textContent = value;
                    statusValue.className = 'node-status__value';
                    element.appendChild(statusIcon);
                    element.appendChild(statusValue);
                }

                function setGraphData(serializedGraph) {
                    if (serializedGraph) {
                        $scope.nodesGraph = serializedGraph;
                        FlowGraph.set($scope.nodesGraph);
                        $scope.nodesGraph.filteredOutElementCount = Object.values(serializedGraph.filteredOutObjectsByType).reduce((a, b) => a + b, 0);
                        $scope.nodesGraph.nodesOnGraphCount = Object.keys(serializedGraph.nodes).length;
                        const displayedElementCount = Object.values(serializedGraph.includedObjectsByType).reduce((a,b)=>a+b, 0);
                        $scope.isFlowEmpty = ($scope.nodesGraph.filteredOutElementCount || 0) + displayedElementCount === 0;
                        $scope.allFilteredOut = !$scope.isFlowEmpty && displayedElementCount === 0;
                    }
                }

                function getGraph() {
                    let jobElements = [];
                    let jobAllActivities = $scope.getJobAllActivities();

                    Object.keys(jobAllActivities).forEach(function(activityKey) {
                        let activity = jobAllActivities[activityKey];
                        activity.recipes.forEach(recipe => jobElements.push(graphVizEscape('recipe_' + recipe.name)));
                        activity.sources.forEach(function(source) {
                            jobElements.push(graphVizEscape('dataset_' + source.projectKey + "." + source.datasetName));
                            jobElements.push(graphVizEscape('managedfolder_' + source.projectKey + "." + source.datasetName));
                            jobElements.push(graphVizEscape('savedmodel_' + source.projectKey + "." + source.datasetName));
                            jobElements.push(graphVizEscape('modelevaluationstore_' + source.projectKey + "." + source.datasetName));
                        });
                        activity.targets.forEach(function (target) {
                            jobElements.push(graphVizEscape('dataset_' + target.projectKey + "." + target.datasetName));
                            jobElements.push(graphVizEscape('managedfolder_' + target.projectKey + "." + target.datasetName));
                            jobElements.push(graphVizEscape('savedmodel_' + target.projectKey + "." + target.datasetName));
                            jobElements.push(graphVizEscape('modelevaluationstore_' + target.projectKey + "." + target.datasetName));
                        });
                        // For backward compatibility with jobs created by a version of DSS before 4.1.2
                        if (activity.recipeName) {
                            jobElements.push(graphVizEscape('recipe_' + activity.recipeName));
                        }
                    });

                    return jobElements;
                }

                const selectionStrategy = {
                    onItemClick: function(item) {
                        // Select the clicked item
                        d3.selectAll($element.find('svg .selected')).classed("selected", false);
                        let elt = $element.find('svg [data-id="' + item.id + '"]')[0];
                        d3.select(elt).classed("selected", true);

                        // Select activities matching the current item
                        let matchingActivities;

                        switch (item.nodeType) {
                            case 'LOCAL_DATASET':
                                matchingActivities = directiveScope.getActivitiesByDatasetName(item.name);
                                break;
                            case 'RECIPE':
                                matchingActivities = directiveScope.getActivitiesByRecipeName(item.name);
                                break;
                        }

                        if (matchingActivities != undefined) {
                            matchingActivities.forEach(function(activity, index) {
                                if (index === 0) {
                                    directiveScope.selectActivity(activity);
                                } else {
                                    directiveScope.highlightActivity(activity);
                                }
                            });
                        }
                    }
                };

                // Resize around the job nodes.
                $scope.$emit('setResizeStrategy', 'highlight');

                function setStatusOnGraph() {
                    $scope.svg = $element.find('svg');
                    $scope.jobStatus && $scope.svg && $.each($scope.jobStatus.stateByGraphNodeId, function (key, value) {
                        let svgDOM = $($scope.svg).get(0);
                        let node = svgDOM && svgDOM.querySelector('g[data-id="'+ key + '"]');
                        let nodeTotem = node && node.querySelector('.node-totem span');
                        let flowNode = FlowGraph.node(key);
                        let hasMultipleStatus = value.done + value.running + value.failed + value.notStarted + value.aborted + value.warning + value.skipped > 1;
                        let isJobFinished = $scope.jobStatus && $scope.jobStatus.baseStatus
                            && $scope.jobStatus.baseStatus.state != 'RUNNING'
                            && $scope.jobStatus.baseStatus.state != 'NOT_STARTED'
                            && $scope.jobStatus.baseStatus.state != 'WAITING_CONFIRMATION';

                        if (!node) {
                            return;
                        }

                        // Dynamically remove "never-built-computable" style where needed (successor of done recipes)
                        if (['DONE', 'WARNING'].includes(value.state)) {
                            node.setAttribute('data-state', value.state);
                            if (flowNode.successors) {
                                flowNode.successors.forEach(s => {
                                    let nodeElt = FlowGraph.d3NodeWithId(s);
                                    window.nodeElt = nodeElt;
                                    if (nodeElt) {
                                        $(nodeElt[0]).find('.never-built-computable').removeClass('never-built-computable')
                                    }
                                })
                            }
                        }

                        // Add global state and fade non-builded stuff if not in preview mode
                        switch (value.state) {
                            case 'DONE':
                                nodeTotem.className += ' node-totem__status-icon icon-dku-success text-success';
                                nodeTotem.setAttribute('title', 'DONE');
                                break;
                            case 'WARNING':
                                nodeTotem.className += ' node-totem__status-icon icon-dku-warning text-warning';
                                nodeTotem.setAttribute('title', 'WARNING');
                                break;
                            case 'FAILED':
                                nodeTotem.className += ' node-totem__status-icon icon-dku-error text-error';
                                nodeTotem.setAttribute('title', 'FAILED');
                                break;
                            case 'NOT_STARTED':
                                nodeTotem.className += ' node-totem__status-icon icon-dku-queued text-weak';
                                nodeTotem.setAttribute('title', 'NOT STARTED');
                                !isPreview && fadeOutActivity(key, node);
                                break;
                            case 'RUNNING':
                                nodeTotem.className += ' node-totem__status-icon';
                                // Make the icon spin only if the job is not finished. If job is finished do not spin because it means the activity has only partially run.
                                if (!isJobFinished) {
                                    // nodeTotem.className += ' icon-spin'; DISABLED for now, nasty animation bug in chrome svg, does not work at all
                                    nodeTotem.setAttribute('title', 'RUNNING');
                                } else {
                                    nodeTotem.setAttribute('title', 'PARTIALLY RAN');
                                }
                                let iconBar = document.createElement('span');
                                iconBar.className = 'dku-loader';
                                nodeTotem.appendChild(iconBar);
                                break;
                            case 'ABORTED':
                                nodeTotem.className += ' node-totem__status-icon icon-dku-pause text-debug';
                                !isPreview && fadeOutActivity(key, node);
                                nodeTotem.setAttribute('title', 'ABORTED');
                                break;
                            case 'SKIPPED':
                                nodeTotem.className += ' node-totem__status-icon icon-step-forward text-debug';
                                nodeTotem.setAttribute('title', 'SKIPPED');
                                !isPreview && fadeOutActivity(key, node);
                                break;
                        }

                        // Add status counts
                        if (hasMultipleStatus) {
                            let nodeStatus = makeSVG('foreignObject', {
                                x: -100,
                                y: 110,
                                width: 300,
                                height: 42,
                                class: 'node-status'
                            });

                            nodeTotem.parentElement.parentElement.appendChild(nodeStatus);

                            if (value.failed > 0) {
                                setStatus(nodeStatus, 'icon-dku-error text-error', value.failed);
                            }

                            if (value.warning > 0) {
                                setStatus(nodeStatus, 'icon-dku-warning text-warning', value.warning);
                            }

                            if (value.notStarted > 0) {
                                setStatus(nodeStatus, 'icon-dku-queued text-weak', value.notStarted);
                            }

                            if (value.skipped > 0) {
                                setStatus(nodeStatus, 'icon-step-forward text-debug', value.skipped);
                            }

                            if (value.aborted > 0) {
                                setStatus(nodeStatus, 'icon-dku-pause text-debug', value.aborted);
                            }

                            if (value.done > 0) {
                                setStatus(nodeStatus, 'icon-dku-success text-success', value.done);
                            }
                        }
                    });
                }

                function reset() {
                    FlowGraphHighlighting.removeHighlights();
                    FlowGraphHighlighting.removeFiltersRemoved();
                    let elements = document.querySelectorAll('.node-status');
                    elements.forEach(element => element.remove());
                    let nodes = FlowGraph.get() && FlowGraph.get().nodes;
                    if (nodes) {
                        $.each(FlowGraph.get().nodes, function (nodeId) {
                            let nodeElt = FlowGraph.d3NodeWithId(nodeId);
                            if (nodeElt) {
                                nodeElt.classed('out-of-focus', false)
                            }
                        });
                    }
                }

                function draw(force = false) {
                    if (graphData) {
                        // On jobs pages, if there is more than {MAX_NODES} nodes, consider we have a big flow (et Oli... wait what?) and we don't draw it
                        $scope.hasBigFlow = Object.keys(graphData.nodes).length >= MAX_NODES;

                        if (force === true) {
                            $scope.forceFlow = true;
                        }

                        setGraphData(graphData);

                        jobGraph = getGraph();

                        if (jobGraph && !$scope.hasBigFlow || $scope.forceFlow) {
                            $scope.$emit('drawGraph', null, true);

                            reset();

                            FlowGraphHighlighting.highlight(jobGraph);

                            d3.selectAll('svg .node:not(.highlight), svg .edge:not(.highlight)').classed('fade-out--no-filter filter-remove', true);
                            $.each(FlowGraph.get().nodes, function (nodeId) {
                                let nodeElt = FlowGraph.d3NodeWithId(nodeId);
                                nodeElt.classed('out-of-focus', true).classed('fade-out--no-filter', false);
                            });

                            setStatusOnGraph();

                            // Resize should be done around the job nodes.
                            $scope.$emit('setResizeStrategy', 'highlight');
                        }
                    }
                }

                function fetchGraph(force = false) {
                    DataikuAPI.flow.recipes.getGraph($stateParams.projectKey, $rootScope.tagFilter, true, false).success(function (data) {
                        graphData = data.serializedFilteredGraph.serializedGraph;
                        draw(force);
                    });
                }

                $scope.drawJobGraph = function (force = false) {

                    if (shouldGetGraph) {
                        if (force === false) {
                            // Quick call to check the number of potential nodes on the graph
                            DataikuAPI.taggableObjects.countAccessibleObjects($stateParams.projectKey).success((countsByType) => {
                                const possibleNodes = countsByType["DATASET"] + countsByType["RECIPE"] + countsByType["MANAGED_FOLDER"] + countsByType["STREAMING_ENDPOINT"] + countsByType["MODEL_EVALUATION_STORE"];
                                if (possibleNodes >= MAX_NODES) {
                                    // Mimic a MAX_NODES response
                                    graphData = {nodes: Array.from({length: MAX_NODES}, (v, i) => i).reduce((o, key) => Object.assign(o, {[key]: key}), {}), filteredOutObjectsByType: {}, includedObjectsByType: {}, datasetsKeptForRecipe: {}, realNodes: {}, zonesUsedByRealId: {}, hasZones: false, hasZoneSharedObjects: false, hasProjectZones: false, svg: ""};
                                    draw(force);
                                } else {
                                    fetchGraph(force);
                                }
                            });
                        } else if (force === true) {
                            fetchGraph(force);
                        }
                    } else {
                        draw(force);
                    }
                };


                $scope.$watch("jobStatus", function(jobStatus) {
                    $scope.hasBigFlow = false;
                    $scope.forceFlow = false;

                    // Disable flow zoom remembering while navigating on jobs flows
                    GraphZoomTrackerService.disable();

                    // Do not re-compute job graph if already known (for running jobs)
                    if (jobId && jobId === jobStatus.baseStatus.def.id) {
                        shouldGetGraph = false;
                    } else {
                        shouldGetGraph = true;
                        jobId = jobStatus.baseStatus.def.id;
                    }

                    // When a job is running, it is better to temporarily disable resizing to let the user navigate its job flow.
                    if (jobStatus.baseStatus.state === 'RUNNING') {
                        $scope.$emit('disableNextFlowResize');
                    }
                    $scope.drawJobGraph();
                    FlowGraphSelection.setSelectionStrategy(selectionStrategy);
                });

                // Come back to default flow selection strategy when
                $scope.$on('$destroy', _ => {
                    FlowGraphSelection.setSelectionStrategy();
                    $scope.$emit('setResizeStrategy', '');
                    reset();
                    // We don't re-enable zoom tracking because it would be too soon sp zoom would be persisted
                });
            },

            link: function($scope) {
                $scope.onItemDblClick = function(item, evt){
                    let destUrl = StateUtils.href.node(item);
                    fakeClickOnLink(destUrl, evt);
                };
                $scope.onItemContextualMenu = function(){
                    return false;
                };
                $scope.onContextualMenu = function(item, evt) {
                    ContextualMenu.prototype.closeAny();
                    return true;
                };
                $scope.$watch("rightColumnItem", function(nv, ov) {
                    if (!nv) return;
                    $scope.selectedItemData = $scope.jobStatus.stateByGraphNodeId[nv.id];
                });
                $scope.$watch("jobStatus", function(nv, ov){
                    if (nv && $scope.rightColumnItem) {
                        $scope.selectedItemData = $scope.jobStatus.stateByGraphNodeId[$scope.rightColumnItem.id];
                    }
                });
            }
        };
    });
})();