(function() {
'use strict';


const app = angular.module('dataiku.common.nav');


    app.directive("navigatorObject", function(Navigator) {
        return {
            scope: true,
            restrict: 'A',
            controller: function($scope, $controller) {
                $controller('TaggableObjectPageMassActionsCallbacks', {$scope: $scope});
            },
            link: function(scope, element, attrs) {
                scope.Navigator = Navigator;

                Mousetrap.bind('shift+a', function() {
                    if (scope.datasetHooks && typeof scope.datasetHooks.userIsWriting == 'function' && scope.datasetHooks.userIsWriting()) {return;}
                    if (scope.isProjectAnalystRO() && (!attrs.navigatorDisabled || scope.$eval(attrs.navigatorDisabled))) {
                        Navigator.toggleForTopNav();
                    }
                });

                scope.$on('$destroy', function() {
                    Navigator.hide();
                    Mousetrap.unbind('shift+a');
                });
            }
        }
    });

    app.factory("Navigator", function ($rootScope, $stateParams, CreateCustomElementFromTemplate, DataikuAPI, $filter, Fn, $q) {
        var navScope, removeListener;

        // Dirty hack to hide the underneath right panel when the navigator's right panel is displayed [CH40012]
        // would be better to actually replace the navigator panel by the new right panel but let's leave that for Right Panel V2
        let toggleUnderneathRightPanelIfAny = (hide) => {
            let rightPanels = document.getElementsByClassName("right-panel");
            if (rightPanels && rightPanels.length > 0) {
                rightPanels[0].style.opacity = hide ? 0 : 1;
            }
        };

        var nav = {
            show: function (projectKey, objectType, objectId) {
                navScope = true; // Initialize navScope now to keep further calls to toggleForTopNav() from calling show() again, creating several navigator elements and scopes

                DataikuAPI.flow.recipes.getGraph(projectKey, null, false, false).success(function (data) {
                    toggleUnderneathRightPanelIfAny(true);
                    CreateCustomElementFromTemplate("/templates/navigator.html", $rootScope, "NavigatorController", function(newScope) {
                        navScope = newScope;
                        newScope.flow = data.serializedFilteredGraph.serializedGraph;
                        newScope.focus = {projectKey: projectKey, objectType: objectType, objectId: objectId};
                        newScope.init();
                    }, function(newEl) {
                        newEl.appendTo($('body'));
                    });
                }).noSpinner();
                Mousetrap.bind('esc', nav.hide);
                removeListener = $rootScope.$on("$stateChangeStart", nav.hide);
            },

            hide: function () {
                if (navScope && navScope.dismiss) {
                    toggleUnderneathRightPanelIfAny(false);
                    navScope.dismiss();
                    navScope = null;
                    Mousetrap.unbind('esc');
                }

                if (removeListener) removeListener();
            },

            toggleForTopNav: function () {
                if (navScope) return nav.hide();
                else return nav.show($stateParams.projectKey, $rootScope.topNav.item.type, $rootScope.topNav.item.id);
            },

            showForTopNav: function () {
                return nav.show($stateParams.projectKey, $rootScope.topNav.item.type, [$stateParams.sourceProjectKey,$rootScope.topNav.item.id].filter(Boolean).join("."));
            }
        };

        return nav;
    });


    app.controller("NavigatorController", function ($scope, DataikuAPI, $filter, getFlowNodeIcon, RecipesUtils, Navigator, QuickView) {
        $scope.Navigator = Navigator;

        $scope.getNodeColor = function (flowNode, focus) {
            if (!flowNode) {
                if (!focus) return;
                return focus.objectType.toLowerCase();
            }
            switch (flowNode.nodeType) {
                case 'RECIPE':
                    return $filter('recipeTypeToColor')(flowNode.recipeType);
                case 'LOCAL_DATASET':
                    return 'dataset';
                case 'LOCAL_SAVEDMODEL':
                    return 'saved-model';
                case 'LOCAL_MODELEVALUATIONSTORE':
                    return 'model-evaluation-store';
                case 'LOCAL_MANAGED_FOLDER':
                    return 'dataset';
                case 'LOCAL_STREAMING_ENDPOINT':
                    return 'black';
                default:
                    return 'black';
            }
        };

        $scope.getNodeIcon = function(flowNode, focus) {
            if (!flowNode) {
                if (!focus) return;
                return $filter('typeToIcon')(focus.objectType);
            }
            return getFlowNodeIcon(flowNode, false);
        };

        $scope.$on("change-context-focus", function (evt, target) {
            $scope.focus = target;
            updateContext();
        });

        $scope.selected = {};

        $scope.QuickView = QuickView;
        /*$scope.hoverIntentCallback = {
            show: function(projectKey, objectType, objectId) {
                $scope.selected.object = false;
                $scope.selected.type = objectType;
                $scope.selected.projectKey = projectKey;
                $scope.selected.objectId = objectId;
            },
            showObject: function(objectData, objectType) {
                $scope.selected.object = true;
                $scope.selected.item = {};
                $scope.selected.item[objectType.toLowerCase()] = objectData;
                $scope.selected.type = objectType;
            },
            hide: function() {
                $scope.selected.item = null;
                $scope.selected.objectId = null;
            }
        };*/

        var curToken = 0;
        var updateContext = function () {
            var reqToken = ++curToken;
            DataikuAPI.flow.getObjectContext($scope.focus.projectKey, $scope.focus.objectType, $scope.focus.objectId).success(function (data) {
                if (reqToken != curToken) return; // drop if not the most recent call
                $scope.context = data;
                if ($scope.focus.objectType == "RECIPE") {
                    RecipesUtils.parseScriptIfNeeded(data.nodes[data.focusNodeId]);
                }
            });
        };

        $scope.$watch("context", function (nv) {
            if (nv != null) {
                $scope.object = ($scope.context.nodes || {})[$scope.context.focusNodeId];
                $scope.node = ($scope.flow.nodes || {})[$scope.context.focusNodeId];
            }
        });

        $scope.$parent.init = updateContext;

        $scope.$on("$destroy", QuickView.hide);
    });

    app.directive("navigatorFlow", function (Fn, $filter, Navigator, StateUtils, $stateParams, getFlowNodeIcon, objectTypeFromNodeFlowType) {
        return {
            scope: {
                context: '=',
                flow: '='
            },
            restrict: 'A',
            link: function ($scope, element, attrs) {

                function endAll(transition, callback) {
                    if (transition.size() === 0) {
                        callback()
                    }
                    var n = 0;
                    transition
                        .each(function () {
                            ++n;
                        })
                        .each("end", function () {
                            if (!--n) callback.apply(this, arguments);
                        });
                }

                function translate(x, y) {
                    return 'translate(' + parseInt(x) + ',' + parseInt(y) + ')';
                }

                function parseTranslate(translate) {
                    if (!translate) return [0, 0];
                    var split = translate.split(',');
                    return [parseInt(split[0].split('(')[1]), parseInt(split[1])];
                }

                function flowNodeFromContextNode(id, contextNode) {
                    if (id.startsWith('insight_')) {
                        return {nodeType: 'INSIGHT', insightType: contextNode.insight.type, description: contextNode.insight.name, name: contextNode.insight.id, id: id};
                    } else if (id.startsWith('jupyterNotebook_')) {
                        return {nodeType: 'JUPYTER_NOTEBOOK', description: contextNode.notebook.name, name: contextNode.notebook.name, id: id};
                    }
                }

                var svg = d3.select(element[0]);

                var lineG = svg.append('g').attr('class', 'lines');
                var compG = svg.append('g').attr('class', 'computables');
                var runG = svg.append('g').attr('class', 'runnables');
                var compEls, runEls;

                var datasetInfos, recipeInfos, nodes, contextNodes, selectedNode;
                var runnables, computables, lines, drawing, flowLink;
                var centerNode, topNode;

                function draw() {
                    drawing = true;
                    if ($scope.flow.nodes) nodes = $scope.flow.nodes;
                    if ($scope.context.nodes) contextNodes = $scope.context.nodes;

                    var showFlowLink = true;
                    var height = $(svg[0][0]).height(),
                        width = $(svg[0][0]).width();

                    var blockSize = 72;
                    var margin = 0.3;

                    for (var node in nodes) {
                        delete nodes[node].left;
                        delete nodes[node].center;
                        delete nodes[node].drawn;
                    }

                    topNode = null;
                    centerNode = nodes[$scope.context.focusNodeId];
                    var objectData = contextNodes[$scope.context.focusNodeId];

                    runnables = [], computables = [], lines = [];

                    if (!centerNode) { // If the focus is on a non-flow item, we display it as topNode
                        if ($scope.context.focusNodeId.startsWith('insight')) {
                            computables.push(topNode = flowNodeFromContextNode($scope.context.focusNodeId, contextNodes[$scope.context.focusNodeId]));
                            topNode.center = true;
                            topNode.top = true;

                            centerNode = nodes[$scope.context.centerNodeId];

                            if (!centerNode) { // If the centerNode is a non-flow item as well
                                centerNode = flowNodeFromContextNode($scope.context.centerNodeId, contextNodes[$scope.context.centerNodeId]);
                                centerNode.center = true;
                                centerNode.top = false;
                                centerNode.predecessors = [];
                                centerNode.successors = [];
                                showFlowLink = false;
                            }

                            centerNode.clickable = true;
                            selectedNode = topNode;
                        } else if ($scope.context.focusNodeId.startsWith('analysis')) {
                            centerNode = nodes[objectData.datasetNodeId];
                            computables.push(topNode = {nodeType: 'ANALYSIS', description: objectData.analysis.name, center: true, top: true});
                            centerNode.clickable = true;
                            selectedNode = topNode;
                        } else if ($scope.context.focusNodeId.startsWith('jupyterNotebook')) {
                            if (objectData.datasetNodeId) {
                                centerNode = nodes[objectData.datasetNodeId];
                                computables.push(topNode = {nodeType: 'JUPYTER_NOTEBOOK', description: objectData.notebook.name, center: true, top: true});
                                centerNode.clickable = true;
                                selectedNode = topNode;
                            } else if (objectData.recipeNodeId) {
                                centerNode = nodes[objectData.recipeNodeId];
                                computables.push(topNode = {nodeType: 'JUPYTER_NOTEBOOK', description: objectData.notebook.name, center: true, top: true});
                                centerNode.clickable = true;
                                selectedNode = topNode;
                            } else {
                                showFlowLink = false;
                                centerNode = {nodeType: 'JUPYTER_NOTEBOOK', description: objectData.notebook.name, center: true, clickable: false, successors: [], predecessors: []};
                                computables.push(centerNode);
                                selectedNode = centerNode;
                            }
                        } else if ($scope.context.focusNodeId.startsWith('sqlNotebook')) {
                            if (objectData.datasetNodeId) {
                                centerNode = nodes[objectData.datasetNodeId];
                                computables.push(topNode = {nodeType: 'SQL_NOTEBOOK', description: objectData.notebook.name, center: true, top: true});
                                centerNode.clickable = true;
                                selectedNode = topNode;
                            } else {
                                showFlowLink = false;
                                centerNode = {nodeType: 'SQL_NOTEBOOK', description: objectData.notebook.name, center: true, clickable: false, successors: [], predecessors: []};
                                computables.push(centerNode);
                                selectedNode = centerNode;
                            }
                        }
//                    } else if (centerNode.datasetType == 'JobsDB') { // If the focus is on a metric dataset
//                        topNode = centerNode;
//                        topNode.center = true;
//                        topNode.top = true;
//                        topNode.metrics = true;
//                        computables.push(topNode);
//                        centerNode = nodes[objectData.datasetNodeId];
//                        centerNode.clickable = true;
//                        selectedNode = topNode;
                    } else {
                        centerNode.clickable = false;
                        selectedNode = centerNode;
                    }

                    var sides = [
                        {group: 'successors', left: 0, computables: 0, height: 0},
                        {group: 'predecessors', left: 1, computables: 0, height: 0}
                    ];

                    centerNode.center = true;
                    centerNode.drawn = true;
                    centerNode.runnableIdx = null;

                    var implicitRecipes = [];
                    if (centerNode.nodeType == 'RECIPE') {
                        runnables.push(centerNode);
                        sides.forEach(function (side) {
                            centerNode[side.group].forEach(function (id) {
                                nodes[id].left = side.left;
                                nodes[id].drawn = true;
                                nodes[id].idx = side.computables++;
                                nodes[id].runnableIdx = 0;
                                computables.push(nodes[id]);
                                lines.push([centerNode.id, id, false]);
                            });
                        });
                    } else {
                        computables.push(centerNode);
                        sides.forEach(function (side) {
                            centerNode[side.group].forEach(function (id, i) {
                                if (nodes[id].nodeType == 'RECIPE') {
                                    nodes[id].left = side.left;
                                    nodes[id].drawn = true;
                                    nodes[id].up = (i < centerNode[side.group].length / 2);
                                    runnables.push(nodes[id]);
                                    lines.push([id, centerNode.id, false]);
                                } else {
                                    var implicitRecipe = {id:'implicitRecipe_' + implicitRecipes.length, recipeType: 'aa', successors:[], predecessors:[]};
                                    implicitRecipes.push(implicitRecipe)
                                    implicitRecipe[side.group == 'successors' ? 'successors' : 'predecessors'] = [id];
                                    implicitRecipe.left = side.left;
                                    implicitRecipe.drawn = false;
                                    implicitRecipe.up = (i < centerNode[side.group].length / 2);
                                    runnables.push(implicitRecipe);
                                    lines.push([implicitRecipe.id, centerNode.id, true]);
                                }
                            });
                        });

                        runnables.forEach(function (runnable, i) {
                            runnable[sides[runnable.left].group].forEach(function (id) {
                                nodes[id].left = runnable.left;
                                nodes[id].drawn = true;
                                nodes[id].runnableIdx = i;
                                sides.forEach(function (side) {
                                    if (nodes[id].left == side.left) {
                                        nodes[id].idx = side.computables++;
                                    }
                                });
                                computables.push(nodes[id]);
                                lines.push([runnable.id, id, runnable.id.startsWith('implicitRecipe')]);
                            });
                        });
                    }

                    // Reduce the block size until both sides fit
                    sides.forEach(function (side) {
                        if (side.computables > 0) {
                            side.height = side.computables * blockSize + (side.computables - 1) * margin * blockSize;
                            while (side.height > 0.8 * $(element[0]).height()) {
                                blockSize--;
                                side.height = side.computables * blockSize + (side.computables - 1) * margin * blockSize;
                            }
                        }
                    });

                    sides.forEach(function (side) {
                        if (side.computables > 0) side.height = side.computables * blockSize + (side.computables - 1) * margin * blockSize;
                    });


                    var size = function (d) {
                        if (d.center) return 72;
                        else return blockSize;
                    };
                    var compTrY = function (d) {
                        return (height - sides[d.left].height) / 2 + d.idx * size(d) * (1 + margin);
                    };

                    var formats = {
                        foreignObject: function (sel) {
                            return sel.attr('x', function (d) {
                                return size(d) * 15 / 72;
                            })
                                .attr('y', function (d) {
                                    return size(d) * 16 / 72;
                                })
                                .attr('width', function (d) {
                                    return size(d) * 42 / 72;
                                })
                                .attr('height', function (d) {
                                    return size(d) * 42 / 72;
                                })
                                .style('font-size', function (d) {
                                    if (['LOCAL_SAVEDMODEL', 'FOREIGN_SAVEDMODEL', 'LOCAL_MODELEVALUATIONSTORE', 'FOREIGN_MODELEVALUATIONSTORE', 'LOCAL_MANAGED_FOLDER', 'FOREIGN_MANAGED_FOLDER'].indexOf(d.nodeType) > -1) {
                                        return size(d) + 'px';
                                    }
                                    return size(d) * 42 / 72 + 'px';
                                });
                        },

                        partitionedRect: function(sel, offset) {
                            return sel
                                .attr('x', (d) => {
                                    const onTop = d.nodeType === 'LOCAL_SAVEDMODEL' || d.nodeType === 'FOREIGN_SAVEDMODEL';
                                    return onTop ? 0 : offset;
                                })
                                .attr('y', offset)
                                .attr('width', size)
                                .attr('height', size)
                                .attr('class', 'fill node__rectangle--partitioned partitioning-indicator');
                        },

                        rescaleRect: function(sel) {
                            return sel
                                .attr('width', size)
                                .attr('height', size)
                                .attr('rx', function(d) {
                                    if (d.nodeType == 'INSIGHT') {
                                        return size(d)/8;
                                    }
                                });
                        },

                        rect: function (sel) {
                            return sel
                                .attr('width', size)
                                .attr('height', size)
                                .attr('class', function(d) {
                                    if (d.nodeType == 'INSIGHT') {
                                        return 'universe-fill ' + $filter('insightTypeToColor')(d.insightType);
                                    }
                                    if (d.partitioned) {
                                        const baseClasses = 'fill node__rectangle--partitioned ';
                                        if (d.nodeType == 'LOCAL_DATASET' || d.nodeType == 'FOREIGN_DATASET') {
                                            return baseClasses + 'main-dataset-rectangle';
                                        } else {
                                            return baseClasses + 'node__rectangle--blank';
                                        }
                                    }
                                })
                                .attr('rx', function(d) {
                                    if (d.nodeType == 'INSIGHT') {
                                        return size(d)/8;
                                    }
                                });
                        },

                        circle: function(sel) {
                            return sel
                                .attr('r', function (d) {
                                    return size(d) * 21 / 72;
                                })
                                .attr('cx', function (d) {
                                    return size(d) * 36 / 72;
                                })
                                .attr('cy', function (d) {
                                    return size(d) * 37 / 72;
                                });
                        },

                        iconsBg: function(sel) {
                            // A little hacky, append a white background with the correct shape behind managed folders & saved models transparent icons
                            var folders = sel.filter(function(d) {
                                return d.nodeType == 'LOCAL_MANAGED_FOLDER' || d.nodeType == 'FOREIGN_MANAGED_FOLDER';
                            });
                            if (folders.size()) {
                                var paths = folders.selectAll('path.bg-path').data([
                                    'M49.57,37.61L53.21,42h34l5.69-15.5-65.16-23L17.62,31H39C43.84,31,46.94,34.19,49.57,37.61Z',
                                    'M3.13,38.56V92.47c0,2.39,2.6,4.4,5.69,4.4H91.19c3.08,0,5.69-2,5.69-4.4V49.54c0-2.39-2.6-4.41-5.69-4.41H52.47a1.56,1.56,0,0,1-1.21-.57l-4.14-5c-2.51-3.26-4.83-5.4-8.12-5.4H8.81C5.73,34.15,3.13,36.17,3.13,38.56Z'
                                ]);
                                paths.enter().append('path').attr('class', 'bg-path')
                                    .attr('d', Fn.SELF)
                                    .attr('fill', 'white');
                                paths.attr('transform', function(d) { return 'scale(' + size(d)/100 + ')'; })

                            }
                            var models = sel.filter(function(d) {
                                return d.nodeType == 'LOCAL_SAVEDMODEL' || d.nodeType == 'FOREIGN_SAVEDMODEL';
                            });
                            if (models.size()) {
                                var paths = models.selectAll('path.bg-path').data([
                                    'M50,0L100,50L50,100L0,50z'
                                ]);
                                paths.enter().append('path').attr('class', 'bg-path')
                                    .attr('d', Fn.SELF)
                                    .attr('fill', 'white');
                                paths.attr('transform', function(d) { return 'scale(' + size(d)/100 + ')'; })
                            }
                            return sel;
                        },

                        compEl: function (sel) {
                            return sel.attr('transform', function (d, i) {
                                if (d.top) return translate((width - size(d)) / 2, 50);
                                if (d.center) return translate((width - size(d)) / 2, (height - size(d)) / 2);
                                return translate((width - size(d)) / 2 + (d.left ? -300 : 300), (height - sides[d.left].height) / 2 + d.idx * size(d) * (1 + margin));
                            }).attr('data-size', size);
                        },

                        runEl: function (sel) {
                            return sel.attr('transform', function (d, i) {
                                if (d.center) return translate((width - size(d)) / 2, (height - size(d)) / 2);

                                var childrenComps = computables.filter(function (c) {
                                    return c.runnableIdx === i;
                                });
                                var y = childrenComps.length == 0 ? (height - size(d)) / 2 : (compTrY(childrenComps[0]) + compTrY(childrenComps[childrenComps.length - 1])) / 2;
                                return translate((width - size(d)) / 2 + (d.left ? -200 : 200), y);
                            }).attr('data-size', size).style("display", function(d) {return d.drawn ? 'inline-block' : 'none'});
                        },

                        compTick: function (sel) {
                            return sel
                                .style("display", "none")
                                .filter(function (d) {
                                    return !d.center &&
                                        ((d.left && d.predecessors && d.predecessors.length)
                                        || (!d.left && d.successors && d.successors.length))
                                })
                                .style("display", null)
                                .attr('x1', function (d) {
                                    return d.left ? 0 : blockSize;
                                })
                                .attr('x2', function (d) {
                                    return d.left ? -15 : blockSize + 15;
                                })
                                .attr('y1', blockSize / 2)
                                .attr('y2', blockSize / 2 + 0.001)
                                .attr('stroke', function (d) {
                                    return d.left ? 'url(#grad-left-right)' : 'url(#grad-right-left)'
                                });
                        },

                        runTick: function (sel) {
                            return sel
                                .style("display", "none")
                                .filter(function (d) {
                                    return !d.center &&
                                        ((!d.left && d.predecessors && d.predecessors.length > 1)
                                        || (d.left && d.successors && d.successors.length > 1))
                                })
                                .style("display", null)
                                .style("stroke-width", "1.1px") //TODO @navigator css
                                .attr('x1', blockSize / 2)
                                .attr('x2', function (d) {
                                    return blockSize / 2 + (d.left ? blockSize / 2 : -blockSize / 2);
                                })
                                .attr('y1', blockSize / 2)
                                .attr('y2', function (d) {
                                    return blockSize / 2 + (d.up ? -blockSize / 2 : blockSize / 2);
                                })
                                .attr('stroke', function (d) {
                                    return !d.left ? 'url(#grad-left-right)' : 'url(#grad-right-left)'
                                });
                        }
                    };

                    compEls = compG.selectAll('g').data(computables, Fn.prop('id'));
                    runEls = runG.selectAll('g').data(runnables, Fn.prop('id'));
                    lines = lineG.selectAll('line.line').data(lines, function (d) {
                        return d[0] + ' ---> ' + d[1];
                    });

                    // 1. Remove exiting elements
                    compEls.exit().remove();
                    runEls.exit().remove();
                    lines.exit().remove();
                    if (datasetInfos) datasetInfos.remove();
                    if (recipeInfos) recipeInfos.remove();
                    if (flowLink) flowLink.remove();
                    svg.selectAll('line.dotted').remove();

                    // 2. Update existing elements
                    compEls.select('line.tick').style('display', 'none');
                    runEls.select('line.tick').style('display', 'none');
                    compEls.call(formats.iconsBg).transition().call(formats.compEl).call(endAll, enter);
                    compEls.select('rect').transition().call(formats.rescaleRect);
                    compEls.selectAll('rect.dataset-rectangle').transition().call(formats.rescaleRect);    // catch all 3 rectangles in case of a partitioned dataset.

                    compEls.select('foreignObject').transition().call(formats.foreignObject);

                    runEls.transition().call(formats.runEl);
                    runEls.select('circle').transition().call(formats.circle);
                    runEls.select('foreignObject').transition().call(formats.foreignObject);

                    runEls.order();
                    compEls.order();

                    // Update lines with a custom tween so that they stay connected to the centers of the 2 items during the transition
                    svg.selectAll('line.line').transition().tween("line", function (d) {
                        var run = runEls.filter(function (r) {
                            return r.id == d[0];
                        });
                        var comp = compEls.filter(function (c) {
                            return c.id == d[1]
                        });
                        return function () {
                            var runT = parseTranslate(run.attr('transform'));
                            var compT = parseTranslate(comp.attr('transform'));
                            var runS = run.attr('data-size');
                            var compS = comp.attr('data-size');
                            d3.select(this)
                                .attr('x1', runT[0] + runS / 2)
                                .attr('y1', runT[1] + runS / 2)
                                .attr('x2', compT[0] + compS / 2)
                                .attr('y2', compT[1] + compS / 2)
                                .attr('stroke', '#333');
                        }
                    });


                    function enter() {
                        // Create computables
                        var enteringCompEls = compEls.enter().append('g').attr('data-type', Fn.prop('nodeType')).call(formats.compEl).call(formats.iconsBg)
                            .on('click', function (d) {

                                if (d.center) {
                                    if (d.dblclick) {
                                        fakeClickOnLink(StateUtils.href.node(d), d3.event);
                                        Navigator.hide();
                                    }
                                    d.dblclick = true;
                                    setTimeout(function() { d.dblclick = false; }, 400);
                                }
                                d3.event.stopPropagation();

                                if (d.center && !d.clickable) return null;

                                // The objects start moving right away after the first click
                                // To make it easier to double click, any click on the svg works
                                svg.on('click.dblclick', function() {
                                    fakeClickOnLink(StateUtils.href.node(d), d3.event);
                                });
                                setTimeout(function() { svg.on('click.dblclick', null); }, 400);

                                return focusOnNode(d);
                            });


                        enteringCompEls.filter((d) => d.partitioned).append('rect').call(formats.partitionedRect, -10);
                        enteringCompEls.filter((d) => d.partitioned).append('rect').call(formats.partitionedRect, -5);

                        enteringCompEls.append('rect').call(formats.rect);

                        enteringCompEls.append('svg:foreignObject').call(formats.foreignObject)
                            .attr('class', 'nav-nodeicon').style('text-align', 'center')
                            .append('xhtml:div').append('xhtml:i').attr('class', function (d) {
                                if (d.nodeType == 'INSIGHT') {
                                    return $filter('insightTypeToIcon')(d.insightType);
                                }
                                return getFlowNodeIcon(d, true);
                        });

                        // Add tick
                        enteringCompEls.append('line').attr('class', 'tick');

                        // Create computables legend
                        datasetInfos = compEls
                            .append('svg:foreignObject').attr('class', 'dataset-info')
                            .attr('x', function (d) {
                                if (d.center) return -130;
                                else if (d.left) return (blockSize - width) / 2 + 300;
                                else return blockSize;
                            })
                            .attr('y', function (d, i) {
                                if (d.center) return size(d);
                                else return 0;
                            })
                            .attr('height', blockSize)
                            .attr('width', function (d) {
                                if (d.center) return 260 + size(d);
                                else return (width / 2 - 300 - 0.5 * blockSize);
                            })
                            .append('xhtml:div').classed('left', Fn.prop('left')).classed('center', Fn.prop('center'))
                            .style('height', blockSize + 'px')
                            .style('width', function (d) {
                                if (d.center) return 260 + size(d) + 'px';
                                else return (width / 2 - 300 - 0.5 * blockSize) + 'px';
                            });

                        datasetInfos.append('xhtml:h6').append('span').text(Fn.prop('description'));

                        var iconGroup = function (type, icon) {
                            return function (sel) {
                                var div = sel.append('xhtml:span').attr('class', 'count ' + type).style('display', 'none');
                                div.append('xhtml:i').attr('class', 'universe-color ' + type + ' ' + icon);
                                div.append('xhtml:span');
                                return sel;
                            }
                        };

                        datasetInfos.append('div').attr('class', 'counts').append('span').each(function (d) {
                            var p = d3.select(this);
                            switch (d.nodeType) {
                                case "LOCAL_DATASET":
                                case "FOREIGN_DATASET":
                                    p.call(iconGroup('analysis', 'icon-dku-nav_analysis'));
                                    p.call(iconGroup('chart', 'icon-dku-nav_dashboard'));
                                    p.call(iconGroup('notebook', 'icon-dku-nav_notebook'));
                                    break;
                                case "LOCAL_SAVEDMODEL":
                                    break;

                            }
                        });

                        enteringCompEls.filter('g[data-type="LOCAL_SAVEDMODEL"]').selectAll('rect')
                            .attr('transform', 'rotate(45) scale(0.7071) scale(1.05)');

                        // Create runnables
                        var enteringRunEls = runEls.enter().append('g').attr('class', function (d) {
                            return "bzicon recipeicon-" + (d.recipeType.indexOf("CustomCode_") == 0 ? 'custom-code' : (d.recipeType.indexOf("App_") == 0 ? "app" : d.recipeType))
                        }).call(formats.runEl);

                        enteringRunEls.append('line').attr('class', 'tick');

                        enteringRunEls.append('circle').call(formats.circle);
                        enteringRunEls
                            .append('svg:foreignObject').call(formats.foreignObject)
                            .attr('class', 'recipe-icon')
                            .classed("custom-code", function(d) { return d.recipeType.indexOf("CustomCode_") == 0; })
                            .append('xhtml:div')
                            .style('text-align', 'center').append('xhtml:i')
                            .attr('class', function (d) {
                                return $filter('recipeTypeToIcon')(d.recipeType);
                            });

                        enteringRunEls
                            .on('click', function (d) {
                                d3.event.stopPropagation();

                                if (d.center) {
                                    if (d.dblclick) {
                                        fakeClickOnLink(StateUtils.href.node(d), d3.event);
                                        Navigator.hide();
                                    }
                                    d.dblclick = true;
                                    setTimeout(function() { d.dblclick = false; }, 400);
                                }

                                if (d.center && !d.clickable) return null;

                                // The objects start moving right away after the first click
                                // To make it easier to double click, any click on the svg works
                                svg.on('click.dblclick', function() {
                                    fakeClickOnLink(StateUtils.href.node(d), d3.event);
                                });
                                setTimeout(function() { svg.on('click.dblclick', null); }, 400);

                                return focusOnNode(d);
                            });

                        // Create legend for center recipe
                        recipeInfos = runEls.filter(function(d) { return d.center; })
                            .append('svg:foreignObject').attr('class', 'dataset-info')
                            .attr('x', -130)
                            .attr('y', function(d) { return size(d) - 20; })
                            .attr('height', blockSize)
                            .attr('width', function (d) { return 260 + size(d); })
                            .append('xhtml:div').attr("class", "center")
                            .style('height', blockSize + 'px')
                            .style('width', function (d) { return 260 + size(d) + 'px'; });

                        recipeInfos.append('xhtml:h6').append('span').text(Fn.prop('description'));


                        lines.enter().append('line').attr('class', 'line').each(function (d) {
                            var run = runEls.filter(function (r) {
                                return r.id == d[0];
                            });
                            var comp = compEls.filter(function (c) {
                                return c.id == d[1]
                            });
                            var runT = parseTranslate(run.attr('transform'));
                            var compT = parseTranslate(comp.attr('transform'));
                            d3.select(this)
                                .attr('x1', runT[0] + run.attr('data-size') / 2)
                                .attr('y1', runT[1] + run.attr('data-size') / 2)
                                .attr('x2', compT[0] + comp.attr('data-size') / 2)
                                .attr('y2', compT[1] + comp.attr('data-size') / 2)
                                .attr('stroke', '#333')
                                .attr('stroke-dasharray', d[2] ? 4 : null);
                        });

                        if (topNode) {
                            svg.append('line').attr('class', 'vertical')
                                .attr('class', 'dotted')
                                .attr('x1', width/2)
                                .attr('x2', width/2)
                                .attr('y1', (height - 72) / 2 - 20)
                                .attr('y2', topNode.metrics ? 190 : 165)
                                .attr('stroke', '#AAA')
                                .attr('stroke-dasharray', 4);
                        }

                        if (showFlowLink) {
                            svg.append('line').attr('class', 'vertical')
                                .attr('class', 'dotted')
                                .attr('x1', width/2)
                                .attr('x2', width/2)
                                .attr('y1', centerNode.nodeType === 'RECIPE' ? (height/2) + 60 : height/2 + 110)
                                .attr('y2', height-70)
                                .attr('stroke', '#AAA')
                                .attr('stroke-dasharray', 4);

                            const contextProjectKey = $scope.context && $scope.context.projectKey ? $scope.context.projectKey : centerNode.projectKey;
                            flowLink = svg.append("foreignObject")
                                .attr("class", "flowLink")
                                .attr("x", width/2 - 50)
                                .attr("width", 100)
                                .attr("height", 30)
                                .attr("y", height - 50)
                                .append("xhtml:a")
                                    .attr("class", "btn btn--secondary")
                                    .attr("href", StateUtils.href.flowLink(centerNode, contextProjectKey))
                                    .text("View in flow");
                        }

                        compEls.selectAll('line.tick').call(formats.compTick);
                        runEls.selectAll('line.tick').call(formats.runTick);

                        writeCounts();
                        updateSelection();

                        drawing = false;
                    }
                }

                /* Keyboard navigation */
                var middle = function (arr) {
                    return arr[Math.floor((arr.length - 1) / 2)];
                };

                var mousetrap = new Mousetrap;

                mousetrap.bind('left', function () {
                    if (drawing) return;
                    if (selectedNode.top) return;
                    if (!selectedNode.center && selectedNode.left && !selectedNode.recipeType) return focusOnNode(selectedNode);

                    var els = selectedNode.predecessors.map(function (id) {
                        return nodes[id];
                    }).filter(function (n) {
                        return n.drawn;
                    });
                    if (!els.length) {
                        if (selectedNode.center) return false;
                        return focusOnNode(selectedNode);
                    }

                    selectedNode = middle(els);
                    updateSelection();
                    return false;
                });

                mousetrap.bind('right', function () {
                    if (drawing) return;
                    if (selectedNode.top) return;
                    if (!selectedNode.center && !selectedNode.left && !selectedNode.recipeType) return focusOnNode(selectedNode);

                    var els = selectedNode.successors.map(function (id) {
                        return nodes[id];
                    }).filter(function (n) {
                        return n.drawn;
                    });
                    if (!els.length) {
                        if (selectedNode.center) return false;
                        return focusOnNode(selectedNode);
                    }

                    selectedNode = middle(els);
                    updateSelection();
                    return false;
                });

                mousetrap.bind('up', function () {
                    if (drawing) return;
                    if (selectedNode.center) {
                        if (!selectedNode.top) {
                            if (topNode) selectedNode = topNode;
                            else return;
                        }
                    } else {
                        var siblings;
                        if (selectedNode.nodeType === 'RECIPE') {
                            siblings = runnables;
                        } else {
                            siblings = computables;
                        }

                        siblings = siblings.filter(function (s) {
                            return s.left == selectedNode.left && !s.center;
                        });
                        var idx = siblings.indexOf(selectedNode);

                        if (idx == 0) return false;
                        selectedNode = siblings[idx - 1];

                    }

                    updateSelection();
                    return false;
                });

                mousetrap.bind('down', function () {
                    if (drawing) return;
                    if (selectedNode.center) {
                        if (selectedNode.top) {
                            selectedNode = centerNode;
                        } else {

                        }
                    } else {
                        var siblings;
                        if (selectedNode.nodeType === 'RECIPE') {
                            siblings = runnables;
                        } else {
                            siblings = computables;
                        }

                        siblings = siblings.filter(function (s) {
                            return s.left == selectedNode.left && !s.center;
                        });
                        var idx = siblings.indexOf(selectedNode);

                        if (idx == siblings.length - 1) return false;
                        selectedNode = siblings[idx + 1];
                    }
                    updateSelection();
                    return false;
                });

                mousetrap.bind('enter', function (e) {
                    fakeClickOnLink(StateUtils.href.node(selectedNode), e);
                    Navigator.hide();
                    return false;
                });

                mousetrap.bind('space', function (e) {
                    if (selectedNode.center && !selectedNode.clickable) return false;
                    return focusOnNode(selectedNode);
                });

                element.on("$destroy", function () {
                    mousetrap.reset();
                });
                $scope.$on("$destroy", function () {
                    mousetrap.reset();
                });

                // TODO sucks
                var updateCount = function (type, attr) {
                    var span = compEls.select('span.count.' + type);
                    span.select('span')
                        .text(function (d) {
                            if (!$scope.context.nodes[d.id]) {
                                return null;
                            } else if (!$scope.context.nodes[d.id].hasOwnProperty(attr)) {
                                return $scope.context.nodes[d.id][attr.substr(3).toLowerCase()].length; // TODO mucho sucks!!
                            }
                            return $scope.context.nodes[d.id][attr];
                        });
                    span.style('display', function (d) {
                        if (d.center || !$scope.context.nodes[d.id]) return null;
                        return $scope.context.nodes[d.id][attr] ? null : 'none';
                    });
                };

                var updateSelection = function () {
                    compEls.classed('selected', function (d) {
                        return d === selectedNode;
                    });
                    runEls.classed('selected', function (d) {
                        return d === selectedNode;
                    });
                };

                function writeCounts() {
                    if (!$scope.context || !$scope.context.nodes) return;
                    updateCount('analysis', 'numAnalyses');
                    updateCount('chart', 'numCharts');
                    updateCount('notebook', 'numNotebooks');
                    d3.select('body').style('test', 'test');
                }

                var focusOnNode = function(node) {
                    $scope.context = {focusNodeId: node.id};
                    $scope.$apply();
                    $scope.$emit("change-context-focus", {
                        projectKey: $stateParams.projectKey || node.projectKey,
                        objectType: objectTypeFromNodeFlowType(node.nodeType),
                        objectId: node.nodeType == 'FOREIGN_DATASET' ? node.description : node.name
                    });
                    return false;
                };

                d3.select(window).on("resize.navigator", draw);
                $scope.$on('$destroy', function() {
                    d3.select(window).on("resize.navigator", null);
                });

                $scope.$watch("context", function (nv, ov) {
                    if (!nv || !nv.focusNodeId) return;
                    if (!ov || nv.focusNodeId != ov.focusNodeId) draw();
                    else writeCounts();
                });
            }
        }
    });

    // TODO FlowUtils?
    app.factory("getFlowNodeIcon", function ($filter) {
        return function (node, inFlow) {
            if (!node) return;
            switch (node.nodeType) {
                case 'RECIPE':
                    return $filter('recipeTypeToIcon')(node.recipeType);
                case 'LOCAL_DATASET':
                case 'FOREIGN_DATASET':
                    return $filter('datasetTypeToIcon')(node.datasetType);
                case 'LOCAL_SAVEDMODEL':
                case 'FOREIGN_SAVEDMODEL':
                    return node.smType == 'CLUSTERING' ? 'icon-machine_learning_clustering' : 'icon-machine_learning_regression';
                case 'LOCAL_MODELEVALUATIONSTORE':
                case 'FOREIGN_MODELEVALUATIONSTORE':
                    return "icon-model-evaluation-store";
                case 'LOCAL_MANAGED_FOLDER':
                case 'FOREIGN_MANAGED_FOLDER':
                    return inFlow ? 'icon-flow_dataset_folder' : 'icon-flow_dataset_folder';
                case 'LOCAL_STREAMING_ENDPOINT':
                    return $filter('datasetTypeToIcon')(node.streamingEndpointType);
                    
                // extra nodes in navigator
                case 'ANALYSIS':
                    return 'icon-dku-nav_analysis';
                case 'JUPYTER_NOTEBOOK':
                case 'SQL_NOTEBOOK':
                    return 'icon-dku-nav_notebook';
            }
        }
    });

    // TODO FlowUtils?
    app.factory("objectTypeFromNodeFlowType", function() {
        var types = {
            "LOCAL_SAVEDMODEL": "SAVED_MODEL",
            "FOREIGN_SAVEDMODEL": "SAVED_MODEL",
            "LOCAL_MODELEVALUATIONSTORE": "MODEL_EVALUATION_STORE",
            "FOREIGN_MODELEVALUATIONSTORE": "MODEL_EVALUATION_STORE",
            "LOCAL_DATASET": "DATASET",
            "FOREIGN_DATASET": "DATASET",
            "LOCAL_MANAGED_FOLDER": "MANAGED_FOLDER",
            "FOREIGN_MANAGED_FOLDER": "MANAGED_FOLDER",
            "LOCAL_STREAMING_ENDPOINT": "STREAMING_ENDPOINT",
            "RECIPE": "RECIPE"
        };

        return function(nodeFlowType) {
            return types[nodeFlowType] || nodeFlowType;
        }
    });
})();