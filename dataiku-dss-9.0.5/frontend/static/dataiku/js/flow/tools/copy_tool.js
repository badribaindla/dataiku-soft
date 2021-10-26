(function() {
'use strict';

const app = angular.module('dataiku.flow.tools');


app.service('CopyFlowTool', function($rootScope, $stateParams,
    DataikuAPI, ContextualMenu, LoggerProvider,
    FlowToolsUtils, FlowViewsUtils, FlowGraph) {

    const Logger = LoggerProvider.getLogger('flow.tools.copy');
    const NAME = 'COPY';
    const DISPLAY_NAME = 'Copy';

    this.getDefinition = function() {
        return {
            getName: () => NAME,
            getToolDisplayName: () => DISPLAY_NAME,

            initFlowTool: function(tool) {
                tool.user = {
                    updateOptions: {
                        recheckAll: false,
                        datasets: {
                            consistencyWithData: true
                        },
                        recipes: {
                            schemaConsistency: true,
                            otherExpensiveChecks: true
                        }
                    },
                    updateStatus: {
                        updating: false
                    }
                };

                /*
                * Since the items to copy is not he user selection (we force recipes outputs, etc)
                * we maintain a user selection and recompute the list to copy when updated
                * to be sure that the graph updates don't change the nodes objects, and break the lists lookups
                * we only keep ids there
                */

                function updateNodeStates() {
                    tool.user.state.stateByNode = {};
                    tool.user.state.countByState = {REQUESTED: 0, REQUIRED: 0, REUSED: 0}
                    const stateByNode = tool.user.state.stateByNode;

                    // select the requested items
                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        if (tool.user.state.requested[nodeId]) {
                            if (node.projectKey === $stateParams.projectKey) {
                                stateByNode[nodeId] = 'REQUESTED';
                            } else {
                                stateByNode[nodeId] = 'REUSED'; //Can't deep copy a foreign dataset
                            }
                        }
                    });
                    // By default, don't copy the sources of the subflow, reuse them, copy only if forced
                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        if (tool.user.state.requested[nodeId] === 'REQUESTED' && node.nodeType !== 'RECIPE') {
                            for (let p of node.predecessors) {
                                if (stateByNode[p]) {
                                    return; //A predecessor is requested => not a source for the subflow
                                }
                            }
                            let anyCopiedSuccessor = false;
                            for (let p of node.successors) {
                                if (stateByNode[p]) {
                                    anyCopiedSuccessor = true;
                                    break;
                                }
                            }
                            if (!anyCopiedSuccessor) {
                                return; //Isolated node, the user probably actually want to copy it
                            }
                            stateByNode[nodeId] = 'REUSED';
                        }
                    });
                    // select the non requested but required items
                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        if (stateByNode[nodeId]) {
                            if (node.nodeType === 'RECIPE') {
                                $.each(node.successors, function(index, nodeId2) {
                                    if (!stateByNode[nodeId2]) {
                                        stateByNode[nodeId2] = 'REQUIRED';
                                    }
                                });
                            } else if (node.nodeType === 'LOCAL_SAVEDMODEL'){
                                $.each(node.predecessors, function(index, nodeId2) {
                                    if (!stateByNode[nodeId2]) {
                                        stateByNode[nodeId2] = 'REQUIRED';
                                    }
                                });
                            }
                        }
                    });
                    // select the non requested, non required but reused items
                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        if (stateByNode[nodeId]) {
                            if (node.nodeType === 'RECIPE' ) {
                                $.each(node.predecessors, function(index, nodeId2) {
                                    if (!stateByNode[nodeId2]) {
                                        stateByNode[nodeId2] = 'REUSED';
                                    }
                                });
                            } else if (node.nodeType === 'LOCAL_SAVEDMODEL'){
                                $.each(node.predecessors, function (index, nodeId2) {
                                    //reuse train recipe sources
                                    $.each(FlowGraph.get().nodes[nodeId2].predecessors, function (datasetIndex, datasetId) {
                                        if (!stateByNode[datasetId]) {
                                            stateByNode[datasetId] = 'REUSED';
                                        }
                                    });
                                });
                            }
                        }
                    });

                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        const nodeState = stateByNode[nodeId];
                        if (nodeState) {
                            tool.user.state.countByState[nodeState]++;
                        }
                    });
                }

                const COLORS = {
                    'REQUESTED': 'green',
                    'REQUIRED': '#41f544',
                    'REUSED': '#ffc500'
                };

                function colorNodes() {
                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        const nodeElt = node.nodeType === 'ZONE' ? FlowGraph.d3ZoneNodeWithId(nodeId) : FlowGraph.d3NodeWithId(nodeId);
                        const nodeState = tool.user.state.stateByNode[nodeId];

                        //TODO @flow factorize cleanNode
                        nodeElt.classed('focus', false).classed('out-of-focus', false);
                        $('.tool-simple-zone', FlowGraph.getSvg()).empty();
                        $('.node-totem span', nodeElt[0]).removeAttr('style').removeClass();
                        $('.never-built-computable *', nodeElt[0]).removeAttr('style');

                        const color = COLORS[nodeState] || '#e2e2e2';
                        FlowToolsUtils.colorNode(node, nodeElt, color);

                    });
                }

                tool.drawHooks.updateFlowToolDisplay = function() {
                    if (!tool.user.state) return; // protect against slow state fetching
                    if (!FlowGraph.ready()) return; // protect against slow graph fetching

                    updateNodeStates();
                    colorNodes();
                }

                DataikuAPI.flow.tools.getState($stateParams.projectKey, NAME, {}).success(function(data) {
                    tool.user.state = data;
                    tool.user.state.requested = tool.user.state.requested || [];

                    if (tool.user.state.preselectedNodes) {
                        tool.user.state.preselectedNodes.forEach(function(nodeId) {
                            tool.user.state.requested[nodeId] = 'REQUESTED';
                        });
                    }

                    tool.drawHooks.updateFlowToolDisplay();
                }).error(FlowGraph.setError());;
            },

            template: "/templates/flow-editor/tools/tool-copy.html"
        };
    };
});

app.controller("CopyToolController", function($scope, $stateParams, Assert, DataikuAPI, TaggableObjectsUtils, FlowGraphSelection, FlowGraph, FlowToolsUtils, SubFlowCopyService) {
    Assert.inScope($scope, 'tool');

    $scope.addSelected = function(forceAdd) {
        const statesBefore = angular.copy($scope.tool.user.state.stateByNode);
        const requested = $scope.tool.user.state.requested;
        FlowGraphSelection.getSelectedNodes().forEach(function(it) {
            if(requested[it.id] != 'FORCED') {
                requested[it.id] = forceAdd ? 'FORCED' : 'REQUESTED';
            }
        });
        $scope.tool.drawHooks.updateFlowToolDisplay();

        // This had no effect, try with force
        if (!forceAdd && angular.equals($scope.tool.user.state.stateByNode, statesBefore)) {
            $scope.addSelected(true);
        }
    };

    $scope.removeSelected = function() {
        const requested = $scope.tool.user.state.requested;
        FlowGraphSelection.getSelectedNodes().forEach(function(it) {
            delete requested[it.id];
        });
        $scope.tool.drawHooks.updateFlowToolDisplay();
    };

    $scope.reset = function() {
        $scope.tool.user.state.requested = [];
        $scope.tool.drawHooks.updateFlowToolDisplay();
    };

    function getSelectedTaggableObjectRefs() {
        const items = [];
        const itemsByZones = new Map();
        $.each(FlowGraph.get().nodes, function(nodeId, node) {
            if (nodeId.startsWith("zone__") && node.nodeType !== 'ZONE' && (!node.isSource || node.isSink)) {
                const zoneId = nodeId.substring("zone__".length, node.id.length - node.realId.length - 2);
                if (node.ownerZone === zoneId) {
                    if (!itemsByZones.has(zoneId)) {
                        itemsByZones.set(zoneId, []);
                    }
                    const zoneContent = itemsByZones.get(zoneId);
                    zoneContent.push(TaggableObjectsUtils.fromNode(node));
                }
            }
            if (['REQUESTED', 'REQUIRED'].includes($scope.tool.user.state.stateByNode[nodeId])) {
                items.push(TaggableObjectsUtils.fromNode(node));
            }
        });
        return {selectedTaggableObjectRefs: items, itemsByZones};
    }

    $scope.go = function() {
        const { selectedTaggableObjectRefs, itemsByZones } = getSelectedTaggableObjectRefs();
        SubFlowCopyService.start(selectedTaggableObjectRefs, itemsByZones);
    };
});

})();