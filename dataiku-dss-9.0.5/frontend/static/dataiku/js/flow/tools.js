(function() {
'use strict';

const app = angular.module('dataiku.flow.tools', []);


app.service('FlowToolsRegistry', function() {
    const flowViews = {};
    const flowTools = {};

    this.registerView = function(service) {
        let def = service.getDefinition();
        def.isTool = false;
        flowViews[def.getName()] = def;
    };
    this.registerFlowTool = function(service) {
        let def = service.getDefinition();
        def.isTool = true;
        flowTools[def.getName()] = def;
    };

    this.getDef = function(name) {
        return flowViews[name] || flowTools[name];
    };
    this.getFlowViews = function() {
        return Object.values(flowViews);
    };
});


app.service('FlowToolsLoader', function(FlowToolsRegistry,
    FlowZonesView, TagsView, CustomFieldsView, ConnectionsView, FileformatsView, RecipesEnginesView, RecipesCodeEnvsView,
    PipelinesView, ImpalaWriteModeView, HiveModeView, SparkConfigView, SparkEngineView,
    PartitioningView, PartitionsView, ScenariosView, WatchView, CountOfRecordsView, FilesizeView,
    CreationView, LastModifiedView, LastBuildView, LastBuildDurationView,
    RecentActivityView, DatasetMetricsView, DatasetChecksView,
    CopyFlowTool, PropagateSchemaFlowTools, CheckConsistencyFlowTool) {

    FlowToolsRegistry.registerView(FlowZonesView);
    FlowToolsRegistry.registerView(TagsView);
    FlowToolsRegistry.registerView(CustomFieldsView);

    FlowToolsRegistry.registerView(ConnectionsView);
    FlowToolsRegistry.registerView(RecipesEnginesView);
    FlowToolsRegistry.registerView(RecipesCodeEnvsView);

    FlowToolsRegistry.registerView(ImpalaWriteModeView);
    FlowToolsRegistry.registerView(HiveModeView);
    FlowToolsRegistry.registerView(SparkConfigView);
    FlowToolsRegistry.registerView(SparkEngineView);
    FlowToolsRegistry.registerView(PipelinesView.getService("SPARK_PIPELINES"));
    FlowToolsRegistry.registerView(PipelinesView.getService("SQL_PIPELINES"));

    FlowToolsRegistry.registerView(CreationView);
    FlowToolsRegistry.registerView(LastModifiedView);
    FlowToolsRegistry.registerView(LastBuildView);
    FlowToolsRegistry.registerView(LastBuildDurationView);
    FlowToolsRegistry.registerView(RecentActivityView);

    FlowToolsRegistry.registerView(PartitioningView);
    FlowToolsRegistry.registerView(PartitionsView);
    FlowToolsRegistry.registerView(ScenariosView);

    FlowToolsRegistry.registerView(DatasetMetricsView);
    FlowToolsRegistry.registerView(DatasetChecksView);
    FlowToolsRegistry.registerView(CountOfRecordsView);
    FlowToolsRegistry.registerView(FilesizeView);
    FlowToolsRegistry.registerView(FileformatsView);

    FlowToolsRegistry.registerView(WatchView);

    FlowToolsRegistry.registerFlowTool(CopyFlowTool);
    FlowToolsRegistry.registerFlowTool(CheckConsistencyFlowTool);
    FlowToolsRegistry.registerFlowTool(PropagateSchemaFlowTools);
});


/*
* Note that for now, flow views are simply flow tools
*/
app.service('FlowTool', function($rootScope, Assert, Logger, FlowToolsRegistry) {
    const svc = this;
    let currentTool = {};

    this.setCurrent = function(tool)  {
        currentTool = tool;
        if (tool.def) {
            $('#flow-graph').addClass('with-flow-view-focus');
        } else {
            $('#flow-graph').removeClass('with-flow-view-focus');
        }
    };

    this.getCurrent = function(tool)  {
        return currentTool;
    };

    this.unactivateCurrentTool = function(redraw = true) {
        if (!currentTool.def) return; // None active
        if (currentTool.def.destroyFlowTool) {
            currentTool.def.destroyFlowTool();
        }
        svc.setCurrent({});
        if (redraw) {
            $rootScope.$emit('drawGraph');
        }
        return currentTool;
    };

    this.activateTool = function(currentToolSession) {
        Assert.trueish(currentToolSession, 'no currentToolSession');

        Logger.info("Activating tool", currentToolSession, FlowToolsRegistry.registry);

        svc.unactivateCurrentTool(false);

        let def = FlowToolsRegistry.getDef(currentToolSession.type);
        Assert.trueish(def, 'no tool def');
        svc.setCurrent({
            drawHooks: {},
            actionHooks: {},
            type: currentToolSession.type,
            currentSession: currentToolSession,
            def: def
        });

        def.initFlowTool(currentTool);
        return currentTool;
    };

    $rootScope.$on('flowDisplayUpdated', function() {
        if (currentTool.drawHooks && currentTool.drawHooks.updateFlowToolDisplay) {
            currentTool.drawHooks.updateFlowToolDisplay();
        }
    });

    $rootScope.$on('refreshFlowState', function() {
        if (currentTool && currentTool.refreshState && currentTool.projectKey == $rootScope.$stateParams.projectKey) {
            currentTool.refreshState();
        }
    });

    $rootScope.$on('flowItemClicked', function(evt, evt2, item) {
        if (currentTool.actionHooks && currentTool.actionHooks.onItemClick) {
            currentTool.actionHooks.onItemClick(item, evt2);
        }
    });
});


app.service('FlowViewsUtils', function($stateParams, WT1, DataikuAPI, Logger, MonoFuture, ProgressStackMessageBuilder,
    FlowGraph, FlowGraphSelection, FlowGraphFiltering, FlowGraphFolding) {

    this.addFocusBehavior = function(tool) {


        function isItemSelectedbyId(itemId) {

            let val = tool.user.state.valueByNode[itemId];
            if (val === undefined) {
                return false;
            }
            // Multi-valued view (tags, scenarios)
            if (angular.isArray(tool.getRepr(val))) {
                for (let v of tool.getRepr(val)) {
                    if (tool.user.state.focusMap[v]) {
                        return true;
                    }
                }
                return false;
            }
            // Single-valued view
            return tool.user.state.focusMap[tool.getRepr(val)];
        }

        function isItemSelected(item) {
            return isItemSelectedbyId(item.realId);
        }

        function getSelectedIdsList() {
            const selectedIdslist = [];
            Object.keys(tool.user.state.valueByNode).forEach (itemId => {
                if (isItemSelectedbyId(itemId))  selectedIdslist.push(itemId);
            });
            return selectedIdslist;
        }

        tool.user.isFocused = function(val) {
            // Disable focus when in continuous mode
            if (typeof tool.colorScale == 'function' && tool.colorScale().continuous) {
                return true;
            }

            const repr = tool.getRepr(val);
            if (angular.isArray(repr)) {
                let any = false;
                repr.forEach(function(it) {
                    if (tool.user.state.focusMap[it]) {
                        any = true;
                    }
                });
                return any;
            } else {
                return tool.user.state.focusMap[repr];
            }
        };

        tool.user.getFocusedAsList = function() {
            if (!tool.user.state) return []; //Too early
            const ret = [];
            for (let val in tool.user.state.focusMap) {
                if(tool.user.state.focusMap[val]) {
                    ret.push(val);
                }
            }
            return ret;
        };

        //TODO @flow deprecated
        tool.user.getSingleFocused = function() {
            for (let val in tool.user.state.focusMap) {
                if(tool.user.state.focusMap[val]) {
                    return val;
                }
            }
        };

        tool.user.zoomToFocused = function() {
            FlowGraphFolding.ensureNodesNotFolded(getSelectedIdsList());
            let scope = $('#flow-graph').scope();
            if($('#flow-graph svg .focus').length) {
                scope.zoomToBbox(FlowGraphFiltering.getBBoxFromSelector(scope.svg, '.focus'), 1.2);
            } else {
                scope.zoomToBbox(FlowGraphFiltering.getBBoxFromSelector(scope.svg, '.node'), 1.2);
            }
        };

        tool.user.selectFocused = function() {
            WT1.event("flow-view-select-focused", {tool: tool.def.name});
            FlowGraphFolding.ensureNodesNotFolded(getSelectedIdsList());
            FlowGraphSelection.select(isItemSelected);
        };
    };

    //TODO @flow move or rename service
    this.addAsynchronousStateComputationBehavior = function(tool) {
        tool.user.update = function(scope) {
            tool.user.updateStatus.updating = true;
            tool.user.firstUpdateDone = true;
            return MonoFuture(scope).wrap(DataikuAPI.flow.tools.startUpdate)($stateParams.projectKey, tool.def.getName(), tool.user.updateOptions)
            .success(function(data) {
                tool.user.state = data.result;
                tool.drawHooks.updateFlowToolDisplay();
                tool.user.updateStatus.updating = false;
            }).error(function(a,b,c) {
                tool.user.updateStatus.updating = false;
                setErrorInScope.bind(scope)(a,b,c);
            }).update(function(data) {
                tool.user.updateStatus.progress = data.progress;
                tool.user.updateStatus.totalPercent = ProgressStackMessageBuilder.getPercentage(data.progress);
            });
        };
    };

});


app.service('FlowToolsUtils', function(Logger, FlowGraph) {
    const svc = this;

    this.notSoGrey = function(node, elt) {
        svc.colorNode(node, elt, '#ACACAC');
    },

    this.greyOutNode = function(node, elt) {
        svc.colorNode(node, elt, '#DADADA');
    },

    this.colorNode = function(node, elt, color) {
        try {
            if (node.nodeType == 'LOCAL_DATASET' || node.nodeType == 'FOREIGN_DATASET') {
                elt.style('fill', color);
                if (node.neverBuilt) {
                    elt.select('.never-built-computable .main-dataset-rectangle').style('stroke', color);
                    elt.select('.never-built-computable .nodeicon').style('color', color);
                    elt.select('.never-built-computable .nodelabel-wrapper').style('color', color);
                }
            } else if (node.nodeType == 'LOCAL_MANAGED_FOLDER'  || node.nodeType == 'FOREIGN_MANAGED_FOLDER') {
                elt.style('fill', color);
            } else if (node.nodeType == 'LOCAL_STREAMING_ENDPOINT') {
                elt.style('fill', color);
            } else if (node.nodeType == 'LOCAL_SAVEDMODEL' || node.nodeType == 'FOREIGN_SAVEDMODEL') {
                elt.style('fill', color);
            } else if (node.nodeType == 'LOCAL_MODELEVALUATIONSTORE' || node.nodeType == 'FOREIGN_MODELEVALUATIONSTORE') {
                elt.style('fill', color);
            } else if (node.nodeType == 'RECIPE') {
                elt.select('.bzicon').style('fill', color);
            } else if (node.nodeType == 'ZONE') {
                elt.style('background-color', color);
                elt.style('stroke', color);
                const rgbColor = d3.rgb(color);
                const titleColor = (rgbColor.r*0.299 + rgbColor.g*0.587 + rgbColor.b*0.114) >= 128 ? "#000" : "#FFF";
                elt.style('color', titleColor);
            } else {
                Logger.warn("Cannot color node", node);
            }
            elt.select("g, rect").attr("color", color); //text color
        } catch (e) {
            Logger.error("Failed to color node", e);
        }
    }

    // Bottom right colored indicator
    // There might be several (Ex: tags, so there is an index)
    const RADIUS = 6;
    this.addSimpleZone = function(elt, color='rgba(0,0,0,0)', idx = 0, onClick) {
        let tsz = elt.select(".tool-simple-zone");

        if (!tsz.empty()) {
            if (idx == 0) {
                tsz.selectAll("*").remove();
            }
            let tszHeight = tsz.attr("data-height");
            tsz.append("circle")
                .attr("cx", RADIUS + 2)
                .attr("cy", tszHeight - RADIUS - idx * (RADIUS*2 + 2))
                .attr("r", RADIUS)
                .attr("fill", color)
                .on("click", onClick)
                ;
        }
    }
});

app.directive('flowToolSupport', function($rootScope, $stateParams, Assert, WT1, Logger, DataikuAPI, Dialogs, FlowToolsRegistry, FlowTool,FlowGraph) {
    return {
        restrict: 'A',
        link : function(scope, element, attrs) {
            function activateFromStateIfNeeded() {
                Assert.trueish(scope.toolsState, 'no tool state');
                scope.toolsState.otherActive = {}
                $.each(scope.toolsState.active, function(k, v) {
                    if (k != scope.toolsState.currentId) {
                        scope.toolsState.hasOtherActive = true;
                        scope.toolsState.otherActive[k] = v;
                    }
                });

                if (scope.toolsState.currentId) {
                    scope.tool = FlowTool.activateTool(scope.toolsState.active[scope.toolsState.currentId]);
                } else {
                    scope.tool = FlowTool.unactivateCurrentTool();
                }
            }

            scope.getgetToolDisplayName = function(toolState) {
                return FlowToolsRegistry.registry[toolState.type].getToolDisplayName(toolState);
            };

            scope.refreshToolsState = function() {
                DataikuAPI.flow.tools.getSessions($stateParams.projectKey).success(function(data) {
                    scope.toolsState = data;
                    activateFromStateIfNeeded();
                }).error(setErrorInScope.bind(scope));
            };

            scope.startTool = function(type, data) {
                WT1.event("flow-tool-start", {tool: type});

                scope.drawZones.drawZones = true;
                DataikuAPI.flow.tools.start($stateParams.projectKey, type, data).success(function(data) {
                    scope.toolsState = data;
                    activateFromStateIfNeeded();
                }).error(setErrorInScope.bind(scope));
            };

            scope.$on('projectTagsUpdated', function (e, args) {
                if (scope.tool && scope.tool.type=="TAGS") {
                    scope.tool.refreshState(false, args.updateGraphTags);
                }
            });

            scope.stopCurrentTool = function() {
                const currentId = scope.toolsState.currentId;
                Assert.trueish(currentId, 'no active tool, cannot stop');

                $.each(FlowGraph.get().nodes, function (nodeId, node) {
                    const nodeElt = FlowGraph.d3NodeWithId(nodeId);
                    nodeElt.classed('focus', false).classed('out-of-focus', false);
                });
                if (scope.tool.type == "PROPAGATE_SCHEMA") { //reset paths colors applied on
                    FlowGraph.getSvg().find('.grey-out-path').each(function () {
                        d3.select(this).classed('grey-out-path', false);
                    });
                }
                scope.tool = FlowTool.unactivateCurrentTool();
                DataikuAPI.flow.tools.stop($stateParams.projectKey, currentId).success(function(data) {
                    scope.toolsState = data;
                    scope.drawZones.drawZones = true;
                    activateFromStateIfNeeded();
                }).error(setErrorInScope.bind(scope));
            };

            scope.activateDefaultTool = function() {
                DataikuAPI.flow.tools.setDefaultActive($stateParams.projectKey).success(function(data) {
                    scope.toolsState = data;
                    activateFromStateIfNeeded();
                }).error(setErrorInScope.bind(scope));
            };

            scope.activateTool = function(toolId) {
                 DataikuAPI.flow.tools.setActive($stateParams.projectKey, toolId).success(function(data) {
                    scope.toolsState = data;
                    activateFromStateIfNeeded();
                }).error(setErrorInScope.bind(scope));
            };

            const h = $rootScope.$on('stopCurrentTool', scope.stopCurrentTool);
            scope.$on('$destroy', h);

            scope.refreshToolsState();
        }
    }
});


app.directive("flowToolFacetElt", function() {
    return {
        template:
            `<label class="horizontal-flex" ng-class="{'single-focused': states[key]}">
                <input type="checkbox" ng-if="!singleFocused" ng-model="states[key]" ng-click="$event.stopPropagation()"/>
                <span class="dib flex horizontal-flex" ng-click="click(key, $event)">
                    <span class="bullet noflex" style="background-color: {{color}};" />
                    <span class="text flex">
                        <span ng-if="!displayGlobalTags">{{displayName ? displayName : (isNumber(key) ? (key | number) : key) }}</span>
                        <span ng-if="displayGlobalTags" ui-global-tag="displayName ? displayName : (isNumber(key) ? (key | number) : key)" object-type="'TAGGABLE_OBJECT'"/>
                    </span>
                    <span class="number noflex">{{number}}</span>
                </span>
            </label>`,
        scope: {
            color: '=',
            key: '=',
            displayName: '=',
            number: '=',
            singleFocused: '=',
            states: '=',
            displayGlobalTags: '='
        },
        link: function(scope, element, attr) {
            scope.click = function(key, evt) {
                if (!scope.states) return;
                $.each(scope.states, function(k) {
                    scope.states[k] = false;
                });
                scope.states[key] = true;
                evt.preventDefault();
                evt.stopPropagation();
            };
            scope.isNumber = n  => angular.isNumber(n);
        }
    }
});

const keepLogValue = function(value) {
    let v = value;
    while (v > 9 && v % 10 == 0) {
        v /= 10;
    }
    return v == 1;
};

const formatValue = function(domain, log = false, scaleUnit = undefined) {
    const sizes = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y', 'N', 'X', 'XK', 'XM', 'XG', 'XT', 'XP', 'XE', 'XZ', 'XY', 'XN', 'bX', 'bXK'];

    // determine if we should display the tick value of the very first and very last ticks, even if they are not power of 10
    // The rule is that if the last tick is more than 10% of the scale beyond the last 'normal' tick, we display it
    const makeLogTickOpt = () => {
        // the log range of the scale (how many powers of 10 are shown)
        const totalRange = Math.log10(domain[1]) - Math.log10(domain[0]); 

        // keep top tick if more that 10% of the scale is over the top 10**x tick
        const topPow10Tick = Math.pow(10, Math.floor(Math.log10(domain[1]))); // the higest tick in the sacle
        const topTick = Math.floor(domain[1] / topPow10Tick) * topPow10Tick;
        const keepTopTick = Math.log10(topTick) - Math.log10(topPow10Tick) > 0.1 * totalRange; 

        // keep bottom tick if more that 10% of the scale is under the lowest 10**x tick
        const bottomPow10Tick = Math.pow(10, Math.ceil(Math.log10(domain[0])));
        const bottomTick = Math.ceil(domain[0] / (bottomPow10Tick/10)) * (bottomPow10Tick/10); // the lowest tick on the scale
        const keepBottomTick = Math.log10(bottomPow10Tick) - Math.log10(bottomTick) > 0.1 * totalRange;

        return {
            topTick, keepTopTick,
            bottomTick, keepBottomTick,
        };
    }

    const logTickOpt = log ? makeLogTickOpt() : undefined;

    return function(value) {
        if (log && 
            !(logTickOpt.bottomTick == value && logTickOpt.keepBottomTick) &&
            !(logTickOpt.topTick == value && logTickOpt.keepTopTick) && 
            !keepLogValue(value)) {
            return;
        }
        if (value == 0) {
            return '0' + (scaleUnit === 'FILESIZE' ? ' B' : '');
        }
        switch(scaleUnit) {
            case 'FILESIZE': {
                let i = Math.floor(Math.log(value) / Math.log(1024)) + 1;
                return '~ ' + parseFloat((value / Math.pow(1024, i)).toPrecision(1)) + ' ' + sizes[i] + 'B';
            }
            case 'DURATION': {
                if(value < 1000) return value + 'ms';
                return durationHHMMSS(value / 1000);
            }
            default: {
                let i = Math.floor(Math.log(value) / Math.log(1000));
                return parseFloat((value / Math.pow(1000, i)).toFixed(4)) + ' ' + sizes[i];
            }
        }
    }
};

const applyContinuousScale = function(colorScale, scaleUnit, urlPath) {
    const w = 120, h = 200;
    const range = colorScale.range;
    const domain = colorScale.domain;
    const log = colorScale.log;

    d3.select("continuous-color-scale-legend svg").remove();
    const svg = d3.select("continuous-color-scale-legend").append("svg").attr("width", w).attr("height", h);

    const legend = svg.append("defs").append("svg:linearGradient").attr("id", "gradient").attr("x1", "100%").attr("y1", "0%").attr("x2", "100%").attr("y2", "100%").attr("spreadMethod", "pad");
    for (let i = 0; i < range.length; i++) {
        legend.append("stop").attr("offset", ((i / (range.length - 1)) * 100) + "%").attr("stop-color", range[range.length - i - 1]).attr("stop-opacity", 1);
    }

    svg.append("rect").attr("width", w - 100).attr("height", h).style("fill", "url(" + (urlPath || "") + "#gradient)").attr("transform", "translate(0,10)").attr("x", 20);
    const y = ( log ? d3.scale.log() : d3.scale.linear() ).range([h, 0]).domain([domain[0], domain[domain.length - 1]]);
    // build yAxis with format function for ticks
    const yAxis = d3.svg.axis().scale(y).orient("right").tickFormat(formatValue(domain, log, scaleUnit));
    svg.append("g").attr("class", "y axis").attr("transform", "translate(41,10)").call(yAxis);
};

app.directive('continuousColorScaleLegend', function($location) {
    return {
        scope: {
            tool: '=',
        },
        link: function(scope, element, attrs) {
            scope.$watch("tool", function() {
                applyContinuousScale(scope.tool.colorScale(), scope.tool.scaleUnit, $location.$$path);
            }, true);
        }
    };
});

})();
