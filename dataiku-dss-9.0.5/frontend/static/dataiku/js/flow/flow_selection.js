(function() {
'use strict';

/**
 * This file groups functionalities for selecting and highlighting items in the flow graphs
 * (flow, inter project graph and job preview subgraph)
*/


const app = angular.module('dataiku.flow.project');


app.service('FlowGraphSelection', function($rootScope, WT1, FlowGraphFolding, TaggableObjectsUtils, FlowGraph, FlowGraphHighlighting) {
    /*
    * In all this service, "items" are flow items corresponding to graph nodes
    *
    * Several selection strategies (single items selectec at a time, etc)
    * Selection strategies are also responsible for adding highlighting
    * (not for removing it as for now as we always do before calling then)
    *
    * A selection strategy implements:
    * - onItemClick(nodeId, event)
    * - clearSelection()
    */
    const svc = this;

    let selectedItems = [];

    function _isSelected(item) {
        return selectedItems.includes(item);
    }

    function _hasOnlyZonesOrNone(item) {
        return (_isZone(item) && selectedItems.find(elem => !_isZone(elem)) === undefined) || (!_isZone(item) && selectedItems.find(elem => _isZone(elem)) === undefined);
    }

    function _clearSelection() {
        const element = FlowGraph.getDOMElement();
        if (!element) {
            return; //Too early
        }
        selectedItems.forEach(it => it.selected = false);
        $('#flow-graph').removeClass('has-selection');
        d3.selectAll(".zone_cluster.clusterHighlight").each(function() {this.style = null;}).classed("clusterHighlight", false);
        d3.selectAll(".zone_cluster.selected").each(function() {this.style = null;});
        d3.selectAll(element.find('svg .selected')).classed("selected", false);
        selectedItems = [];
    }

    function _addToSelection(items) {
        items = items.filter(it => !_isSelected(it));
        //For nodes used in multiple zones, we need to use a flag to know which one is truely selected
        items.forEach(it => it.selected = true);
        var realIdsSelected = items.map(it => it.realId);
        selectedItems = selectedItems.filter(it => !it.realId || !realIdsSelected.includes(it.realId));
        if (!items.length) {
            return;
        }

        const selector = items.map(it => _isZoned(it) ? `svg [data-node-id="${it.realId}"]` : _isZone(it) ? `svg [id="cluster_${it.id}"]` : `svg [data-id="${it.id}"]`).join(', ');
        d3.selectAll(selector).each(function() {
            const type = this.getAttribute('data-type');
            let key = this.getAttribute('data-id');
            if (type === "ZONE") {
                key = key.replace("cluster_", "");
                FlowGraphHighlighting.highlightZoneCluster(this)
            }
            selectedItems.push(FlowGraph.node(key));
        }).classed("selected", true);

        if (selectedItems.length) {
            $('#flow-graph').addClass('has-selection');
        }
        FlowGraphHighlighting.removeHighlights();
    }

    function _isZoned(item) {
        return item.id && item.realId && item.id !== item.realId;
    }

    function _isZone(item) {
        return item && item.nodeType === 'ZONE';
    }

    function _removeFromSelection(item) {
        const items = _isZoned(item) ? selectedItems.filter(it => it.realId === item.realId) : [item];
        items.forEach(item => {
            item.selected = false;
            const index = selectedItems.indexOf(item);
            if (index > -1) {
                if (_isZone(item)) {
                    d3.select(`g[data-id="${item.id}"]`)[0][0].style = null;
                    FlowGraph.d3ZoneNodeWithId(item.id).classed("selected", false);
                } else {
                    FlowGraph.d3NodeWithId(item.id).classed("selected", false);
                }
                selectedItems.splice(index, 1);
            }
        });

        if (!selectedItems.length) {
            $('#flow-graph').removeClass('has-selection');
        }
    }


    /* Selects one item at a time
    * highlights the predecessors and successors of the selected item
    */
    const singleItemSelectionStrategy = {
        onItemClick: function(item, evt) {
            _clearSelection();
            _addToSelection([item]);
            if (!item.filterRemove) {
                FlowGraphHighlighting.highlightPredecessors(item);
                FlowGraphHighlighting.highlightSuccessors(item);
                if (svc.hasSuccessorsInOtherZone(item)) {
                    FlowGraphHighlighting.highlightUsedZones(item);
                }
                if (_hasOnlyZonesOrNone(item)) {
                    FlowGraphHighlighting.highlightZoneElements(item.name);
                }
            }
        }
    }

    /*
    * Select n items at a time
    */
    const simpleMultiItemSelectionStrategy = {
        onItemClick: function(item, evt) {
            if (!_isSelected(item) && _hasOnlyZonesOrNone(item)) {
                _addToSelection([item]);
            } else {
                _removeFromSelection(item);
            }
            if (_hasOnlyZonesOrNone(item) && !_isZone(item)) {
                d3.selectAll(".zone_cluster.clusterHighlight").each(function() { this.style = null;});
            }
            if (selectedItems.length === 1 && !selectedItems[0].filterRemove && selectedItems[0].id === item.id) {
                FlowGraphHighlighting.highlightPredecessors(item);
                FlowGraphHighlighting.highlightSuccessors(item);
            }
            selectedItems.filter(_isZone).forEach(it => FlowGraphHighlighting.highlightZoneElements(it.name));
        }
    }

    function withAllPredecessorsOrSuccessorsMultiItemSelectionStrategy(mode) {
        if (mode != 'predecessors' && mode != 'successors') {
            throw new Error("mode should be either 'predecessors' or 'successors'")
        }
        return {
            onItemClick: function(item, evt) {
                // For performance we list and then select them all at once:
                const itemsToSelect = this._listPredecessorsOrSuccessors(item).map(FlowGraph.node);
                _addToSelection(itemsToSelect);
            },

            _listPredecessorsOrSuccessors: function(item, list) {
                list = list || [];

                if (list.includes(item.id)) {
                    // Avoid loops
                    return list;
                }
                list.push(item.id);

                const that = this;

                if (_isZoned(item) && !(mode == "predecessors" && item.usedByZones.length == 0)) {
                    let zoneNode = FlowGraph.node("zone_" + (item.usedByZones[0] || item.ownerZone));
                    if (zoneNode) {
                        $.each(zoneNode[mode], function (index, otherZoneNodeId) {
                            const otherNodeId = graphVizEscape((mode == "predecessors" ? `zone_${item.ownerZone}` : otherZoneNodeId));
                            const otherNode = FlowGraph.node(otherNodeId + "__" + item.realId);
                            if (otherNode) {
                                list = that._listPredecessorsOrSuccessors(otherNode, list);
                            }
                        });
                    }
                }

                $.each(item[mode], function (index, otherNodeId) {
                    const otherNode = FlowGraph.node(otherNodeId);
                    list = that._listPredecessorsOrSuccessors(otherNode, list);
                });
                return list;
            }
        }
    }

    const selectionStrategies = {
        'SINGLE': singleItemSelectionStrategy,
        'MULTI': simpleMultiItemSelectionStrategy,
        'MULTI_WITH_SUCCESSORS': withAllPredecessorsOrSuccessorsMultiItemSelectionStrategy('successors'),
        'MULTI_WITH_PREDECESSORS': withAllPredecessorsOrSuccessorsMultiItemSelectionStrategy('predecessors')
    };

    let activeStrategy = singleItemSelectionStrategy;

    this.onItemClick = function(item, evt) {
      if (activeStrategy !== selectionStrategies['DISABLED']) {
            if (evt && (evt.shiftKey || evt.metaKey || evt.ctrlKey)) {
                simpleMultiItemSelectionStrategy.onItemClick(item, evt);
            } else {
                activeStrategy.onItemClick(item, evt);
            }
            d3.selectAll('svg .node:not(.highlight), svg .edge:not(.highlight)').classed('fade-out', true);
        }
        $rootScope.$emit('flowSelectionUpdated');
        $rootScope.$emit('flowDisplayUpdated');
        $rootScope.$emit('flowItemClicked', evt, item);
    };

    this.clearSelection = function() {
        if (selectedItems.length) {
            FlowGraphHighlighting.removeHighlights();
            _clearSelection();

            $rootScope.$emit('flowSelectionUpdated');
            $rootScope.$emit('flowDisplayUpdated');
        }
    };

    // We need to call this after a new serialized graph has been fetched and rendered
    this.refreshStyle = function(redoSelection = false) {
        const element = FlowGraph.getDOMElement();
        if (!element) {
            return; //Too early
        }
        d3.selectAll(element.find('svg .selected')).classed("selected", false);
        if (selectedItems.length) {
            // Selected items are nodes, if they are part of the old graph they should be replaced by their new version
            selectedItems = selectedItems.map(it => Object.assign({}, FlowGraph.node(it.id), {selected: it.selected})).filter(x => !!x && x.id);
            const selector = selectedItems.map(it => _isZoned(it) ? `svg [data-node-id="${it.realId}"]` : _isZone(it) ? `svg [id="cluster_${it.id}"]` : `svg [data-id="${it.id}"]`).join(', ');
            if (selector.length) {
                d3.selectAll(selector).each(function() {
                    const type = this.getAttribute('data-type');
                    if (type === "ZONE") {
                        FlowGraphHighlighting.highlightZoneCluster(this)
                    }
                }).classed("selected", true);
            }
            if (redoSelection) {
                const oldSelection = [...selectedItems.filter(it => it.selected)];
                const strategy = selectionStrategies[oldSelection.length > 1 ? 'MULTI' : 'SINGLE'];
                oldSelection.forEach(item => {
                    strategy.onItemClick(item); // Deselect in multi
                    if (oldSelection.length > 1) {
                        strategy.onItemClick(item); // Select in multi
                    }
                });
            }
        }
        $rootScope.$emit('flowSelectionUpdated');
    };

    function select(predicate1) {
        return function(predicate) {
            let toSelect = Object.values(FlowGraph.get().nodes);
            if (predicate1) {
                toSelect = toSelect.filter(predicate1);
            }
            if (predicate) {
                toSelect = toSelect.filter(predicate);
            }

            toSelect = toSelect.filter((node) => !FlowGraphFolding.isNodeFolded(node.id));
            _clearSelection();
            _addToSelection(toSelect);
            selectedItems.filter(_isZone).forEach(it => FlowGraphHighlighting.highlightZoneElements(it.name));
            $rootScope.$emit('flowSelectionUpdated');
        };
    }

    /* These functions allow to select items based on a predicate
    * (User code does NOT provide items, they are read from FlowGraph)
     */
    this.select = select();
    this.selectAllByType = taggableType => {
        select(it => !it.filterRemove && TaggableObjectsUtils.fromNodeType(it.nodeType) == taggableType)();
    };

    this.filterByTaggableType = function(taggableType) {
        const selectedBefore = selectedItems.length;

        const toRemove = selectedItems.filter(it => TaggableObjectsUtils.fromNodeType(it.nodeType) != taggableType);
        toRemove.forEach(_removeFromSelection);

        const selectedAfter = selectedItems.length;
        if (selectedAfter != selectedBefore) {
            $rootScope.$emit('flowSelectionUpdated');
        }
    };

    this.getSelectedNodes = function() {
        return selectedItems.filter(it => it.selected);
    };

    this.getSelectedTaggableObjectRefs = function() {
        return svc.getSelectedNodes().map(TaggableObjectsUtils.fromNode);
    };

    this.setSelectionStrategy = function(name='SINGLE') {
        if (typeof name === 'string') {
            // strategy by name
            if (selectionStrategies[name]) {
                WT1.event("flow-graph-set-selection-strategy", { strategy: name });
                _clearSelection();
                activeStrategy = selectionStrategies[name];
            } else {
                throw new Error("Selection strategy does not exist: " + name)
            }
        } else {
            // custom strategy
            activeStrategy = name;
        }
    };

    this.selectSuccessors = function(item, evt) {
        $('.select-preview').removeClass('select-preview'); //remove preview styling
        selectionStrategies['MULTI_WITH_SUCCESSORS'].onItemClick(item, evt);
        $rootScope.$emit('flowSelectionUpdated');
    };
    this.selectPredecessors = function(item, evt) {
        $('.select-preview').removeClass('select-preview');
        selectionStrategies['MULTI_WITH_PREDECESSORS'].onItemClick(item, evt);
        $rootScope.$emit('flowSelectionUpdated');
    };

    this.hasPredecessorsInOtherZone = function(item) {
        return item.usedByZones.length > 0;
    };
    this.hasSuccessorsInOtherZone = function(item) {
        let hasSuccessors = false;
        if (_isZoned(item)) {
            let zoneNode = FlowGraph.node("zone_" + item.ownerZone);
            if (zoneNode) {
                $.each(zoneNode["successors"], function (index, otherZoneNodeId) {
                    const otherNode = FlowGraph.node(graphVizEscape(otherZoneNodeId) + "__" + item.realId);
                    if (otherNode) {
                        hasSuccessors = true;
                        return false;
                    }
                });
            }
        }
        return hasSuccessors;
    }
});


app.service('FlowGraphHighlighting', function(FlowGraph) {

    function removeHighlights() {
        d3.selectAll('.highlight, .fade-out').classed('highlight', false).classed('fade-out', false);
    }

   function removeFiltersRemoved() {
        d3.selectAll('.filter-remove').classed('fade-out--no-filter', false).classed('filter-remove', false);
    }
    function highlightPredecessors(item) {
        let element;
        let nodeElt;
        function _highlightPredecessorsRecursive(nodeType, nodeId) {
            nodeElt = nodeType === 'ZONE' ? FlowGraph.d3ZoneNodeWithId(nodeId) : FlowGraph.d3NodeWithId(nodeId);
            if (!nodeElt || !nodeElt.node()) {
                console.debug('Graph node not found', nodeId)
                return;
            }
            if (nodeElt.classed('filter-remove')) {
                return;
            }

            if (!nodeElt.classed('highlight')) {
                // prevents cycles and dreadful infinite loops
                nodeElt.classed('highlight', true).classed('fade-out', false);
                // highlight nodes
                FlowGraph.rawEdgesWithToId(nodeId).forEach(function (elt) {
                    d3.select(elt).classed('highlight', true).classed('fade-out', false);
                });
                // highlight former nodes
                $.each(FlowGraph.node(nodeId).predecessors, function (index, id) {
                    _highlightPredecessorsRecursive(nodeType, id);
                });
            }
        }
        try {
            element = FlowGraph.getDOMElement();
            _highlightPredecessorsRecursive(item.nodeType, item.id);
            d3.selectAll('svg .node:not(.highlight), svg .edge:not(.highlight)').classed('fade-out', true);
        } catch (e) {
            console.error("Failed to highlight items", nodeElt, e); // NOSONAR: OK to use console.
        }
    }

    function highlightSuccessors(item) {
        let element;
        let nodeElt;
        function _highlightSuccessorsRecursive(nodeType, nodeId, force) {
            nodeElt = nodeType === 'ZONE' ? FlowGraph.d3ZoneNodeWithId(nodeId) : FlowGraph.d3NodeWithId(nodeId);
            if (!nodeElt || !nodeElt.node()) {
                console.debug('Graph node not found', nodeId)
                return;
            }
            if (nodeElt.classed('filter-remove')) {
                return;
            }

            if (force || !nodeElt.classed('highlight')) {
                // prevents cycles and dreadful infinite loops
                nodeElt.classed('highlight', true).classed('fade-out', false);
                // highlight nodes
                FlowGraph.rawEdgesWithFromId(nodeId).forEach(function (elt) {
                    d3.select(elt).classed('highlight', true).classed('fade-out', false);
                });
                // highlight former nodes
                $.each(FlowGraph.node(nodeId).successors, function (index, successorNodeId) {
                    _highlightSuccessorsRecursive(nodeType, successorNodeId, false);
                });
            }
        }

        try {
            element = FlowGraph.getDOMElement();
            _highlightSuccessorsRecursive(item.nodeType, item.id, true);
            d3.selectAll('svg .node:not(.highlight), svg .edge:not(.highlight)').classed('fade-out', true);
        } catch (e) {
            console.error("Failed to highlight items", nodeElt, e); // NOSONAR: OK to use console.
        }
    }

    function highlightZoneElements(zoneId) {
        let svg = FlowGraph.getSvg();
        svg.find('g[data-zone-id="' + zoneId + '"]').each(function() {
            highlight(this.id);
        });
    }

    function highlightUsedZones(item) {
        let zoneId = 'zone_' + (item.usedByZones[0] || item.ownerZone);
        let zoneNode = FlowGraph.node(zoneId);
        highlightZoneCluster(d3.select(`g[id="cluster_${zoneId}"]`)[0][0]);
        if (item.usedByZones.length) {
            zoneNode.predecessors.forEach(function(otherZoneId) {
                if (!FlowGraph.node(`${graphVizEscape(otherZoneId)}__${item.realId}`)) return;
                d3.select(`g[data-from="${otherZoneId}"][data-to="${zoneId}"]`).classed('highlight',true);
                highlightZoneCluster(d3.select(`g[id="cluster_${otherZoneId}"]`)[0][0]);
            });
        } else {
            zoneNode.successors.forEach(function(otherZoneId) {
                if (!FlowGraph.node(`${graphVizEscape(otherZoneId)}__${item.realId}`)) return;
                d3.select(`g[data-to="${otherZoneId}"][data-from="${zoneId}"]`).classed('highlight',true);
                highlightZoneCluster(d3.select(`g[id="cluster_${otherZoneId}"]`)[0][0]);
            });
        }
    }

    function highlightZoneCluster(cluster, forcedColor) {
        let node = FlowGraph.node(cluster.getAttribute("data-id"));
        const color = d3.rgb(forcedColor || node.customData.color);
        let zoneTitleColor = (color.r*0.299 + color.g*0.587 + color.b*0.114) >= 128 ? "#000" : "#FFF"; //black or white depending on the zone color
        $(cluster).toggleClass('clusterHighlight',true);
        cluster.style = `color:${zoneTitleColor};background-color:${color.toString()};stroke:${color.toString()}`
    }

        // Highligh one or more nodes
        function highlight(nodesId) {
            let element;
            let nodeElt;
            function _highlightOne(nodeId) {
                nodeElt = FlowGraph.d3NodeWithId(nodeId);
                if (!nodeElt || !nodeElt.node()) {
                    console.debug('Graph node not found', nodeId);
                    return;
                }

                if (nodeElt.classed('filter-remove')) {
                    return;
                }

                if (!nodeElt.classed('highlight')) {
                    // prevents cycles and dreadful infinite loops
                    nodeElt.classed('highlight', true).classed('fade-out', false);
                    // highlight nodes
                    element.find('svg [data-to="' + nodeId + '"]').each(function () {
                        d3.select(this).classed('highlight', true).classed('fade-out', false);
                    });
                }
            }
            try {
                element = FlowGraph.getDOMElement();
                if (Object.prototype.toString.call(nodesId) == '[object Array]') {
                    nodesId.forEach(function(nodeId) {
                        _highlightOne(nodeId);
                    });
                } else {
                    _highlightOne(nodesId);
                }
            } catch (e) {
                console.error("Failed to highlight items", nodeElt, e); // NOSONAR: OK to use console.
            }
        }

        return {
            removeHighlights: removeHighlights,
            removeFiltersRemoved: removeFiltersRemoved,
            highlightPredecessors: highlightPredecessors,
            highlightSuccessors: highlightSuccessors,
            highlightZoneElements: highlightZoneElements,
            highlightUsedZones: highlightUsedZones,
            highlightZoneCluster: highlightZoneCluster,
            highlight: highlight
        }
});


app.directive('highlightDependenciesOnHover', function($rootScope, $timeout, FlowGraphSelection, FlowGraphHighlighting, FlowGraph) {
    return {
        link: function(scope, element) {
            let cur = null;

            element.on('mouseenter', 'svg [class~=node]', function (e) {
                if (FlowGraphSelection.getSelectedNodes().length) {
                    return; // Some items are selected, disable highlight on hover
                }
                let node = $(this);
                if (cur) $timeout.cancel(cur);
                cur = $timeout(function() {
                    const nodeId = node.attr('data-id');
                    const item = FlowGraph.node(nodeId);
                    if (!item || item.filterRemove) {
                        return;
                    }
                    FlowGraphHighlighting.highlightPredecessors(item);
                    FlowGraphHighlighting.highlightSuccessors(item);
                    cur = null;
                }, 100);
            });

            element.on('mouseleave', 'svg [class~=node]', function (e) {
                if (scope.rightColumnItem) {
                    return; // An item is selected, disable highlight
                }

                if (cur) $timeout.cancel(cur);
                FlowGraphHighlighting.removeHighlights();
            });
        }
    };
});

})();
