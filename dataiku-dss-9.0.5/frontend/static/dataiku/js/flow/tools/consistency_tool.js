(function() {
'use strict';

const app = angular.module('dataiku.flow.tools');


app.service('CheckConsistencyFlowTool', function($rootScope, $stateParams,
    DataikuAPI, ContextualMenu, LoggerProvider,
    FlowToolsUtils, FlowViewsUtils, FlowGraph) {

    const Logger = LoggerProvider.getLogger('flow.tools');
    const NAME = 'CHECK_CONSISTENCY';
    const DISPLAY_NAME = 'Check consistency';

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

                tool.user.markAsOK = function(nodes) {
                    const nodeIds = nodes.map(n => n.realId);
                    DataikuAPI.flow.tools.checkConsistency.markAsOK($stateParams.projectKey, nodeIds).success(function(data) {
                        tool.user.state = data;
                        tool.drawHooks.updateFlowToolDisplay();
                    })
                };

                tool.user.recheck = function(nodes) {
                    const nodeIds = nodes.map(n => n.realId);
                    DataikuAPI.flow.tools.checkConsistency.recheck($stateParams.projectKey, nodeIds).success(function(data) {
                        tool.user.state = data;
                        tool.drawHooks.updateFlowToolDisplay();
                    })
                };

                tool.user.canRecheck = function(nodes) {
                    if (tool.user.state == null) return false; // protect against slow state fetching
                    return !!nodes.filter(n => tool.user.state.stateByNode[n.realId] != 'UNCHECKED').length;
                };


                function colorFromMessageHolder(holder, node, sel) {
                    if (holder.maxSeverity == "ERROR") {
                        FlowToolsUtils.colorNode(node, sel, "red");
                    } else if (holder.maxSeverity == "WARNING") {
                        FlowToolsUtils.colorNode(node, sel, "orange");
                    } else if (holder.maxSeverity == "INFO") {
                        FlowToolsUtils.colorNode(node, sel, "lightblue");
                    } else {
                        FlowToolsUtils.colorNode(node, sel, "green");
                    }
                }

                function needsPopup(nodeState) {
                    if (nodeState.state == "FAILED_CHECK") return true;
                    if (nodeState.state == "CHECKED") {
                        if (nodeState.recipeCheckResult && nodeState.recipeCheckResult.maxSeverity) return true;
                        if (nodeState.datasetCheckResult && nodeState.datasetCheckResult.maxSeverity) return true;
                    }
                    return false;
                }

                tool.drawHooks.updateFlowToolDisplay = function() {
                    if (!tool.user.state) return; // protect against slow state fetching
                    if (!FlowGraph.ready()) return; // protect against slow graph fetching

                    $.each(FlowGraph.get().nodes, function(nodeId, node) {
                        const nodeElt = FlowGraph.d3NodeWithId(nodeId);
                        const nodeState = tool.user.state.stateByNode[node.realId];

                        //TODO @flow factorize cleanNode
                        nodeElt.classed('focus', false).classed('out-of-focus', false);
                        $('.tool-simple-zone', FlowGraph.getSvg()).empty();
                        $('.node-totem span', nodeElt[0]).removeAttr('style').removeClass();
                        $('.never-built-computable *', nodeElt[0]).removeAttr('style');

                        if (!nodeState) {
                            // Node is not involved in this
                            FlowToolsUtils.colorNode(node, nodeElt, "#ccc");
                        } else if (nodeState.state == "UNCHECKED") {
                            FlowToolsUtils.colorNode(node, nodeElt, "#808080");
                        } else if (nodeState.state == "CHECKED") {
                            if (nodeState.recipeCheckResult) {
                                nodeState.errorHolder = nodeState.recipeCheckResult;

                                colorFromMessageHolder(nodeState.recipeCheckResult, node, nodeElt);
                            } else if (nodeState.datasetCheckResult) {
                                nodeState.errorHolder = nodeState.datasetCheckResult;
                                colorFromMessageHolder(nodeState.datasetCheckResult, node, nodeElt);
                            }
                        } else if (nodeState.state == "FAILED_CHECK") {
                            FlowToolsUtils.colorNode(node, nodeElt, "purple");
                        }
                    });
                }

                tool.actionHooks.onItemClick = function(node, evt) {
                    if (!tool.user.state) return; // protect against slow state fetching
                    let nodeState = tool.user.state.stateByNode[node.realId];

                    ContextualMenu.prototype.closeAny();

                    if (nodeState && needsPopup(nodeState)) {
                        let menuScope = $rootScope.$new();

                        menuScope.nodeState = nodeState;
                        menuScope.node = node;
                        menuScope.tool = tool;

                        let menuParams = {
                            template: "/templates/flow-editor/tools/consistency-item-popup.html",
                            scope: menuScope,
                            contextual: false
                        };
                        let menu = new ContextualMenu(menuParams);
                        menu.openAtEventLoc(evt);
                    }
                }

                FlowViewsUtils.addAsynchronousStateComputationBehavior(tool);

                DataikuAPI.flow.tools.getState($stateParams.projectKey, NAME, {}).success(function(data) {
                    tool.user.state = data;
                    tool.drawHooks.updateFlowToolDisplay();
                }).error(FlowGraph.setError());
            },

            template: "/templates/flow-editor/tools/tool-check-consistency.html"
        };
    };
});


app.controller("ConsistencyFlowToolMainController", function($scope, Assert, DataikuAPI, $stateParams) {
    Assert.inScope($scope, 'tool');
    $scope.update = $scope.tool.user.update;
});


})();