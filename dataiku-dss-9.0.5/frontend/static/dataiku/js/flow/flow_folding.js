(function() {
    'use strict';

    /**
     * This file contains the functionality for folding and unfolding branches of the flow
     * The UI allows you to select any node in the flow (referred to as the rootItem) and fold the branch
     * upstream (FoldDirection.predecessors) or downstream (FoldDirection.successors)
     *
     * The underlying SVG flowgraph produced by GraphViz on the server is not changed when folding.
     * Instead, the folding is achieved by manipulating the browser DOM directly.  Mostly this involves tagging nodes
     * and edges as folded using the CSS classes: folded-node and folded-edge
     *
     * To unfold a node you click on a + symbol alongside folded node.  This symbol is created by inserting
     * SVG elements into the most appropriate edge from the folded node.  The most appropriate edge is currently
     * the line that leaves the node at the most horizontal angle - which is calculated by decomposing the SVG path
     * path that GraphViz created for the line, and doing some dodgy trigonometry to determine the angle of the last
     * section of the path.
     *
     * The elements inserted to form a 'boundary marker' look something like:
     *  <g class="folded-icon" data-folded-node-id="..." data-folded-direction="successors">
     *    <path d="...." class="folded-boundary-marker-line"></path>
     *    <g>
     *        <circle cx="0" cy="0" r="16" class="folded-boundary-marker-circle"></circle>
     *        <path d="M0,-11 V11 M-11,0 H11" stroke="#000000" fill="none" class="folded-boundary-marker-plus"></path>
     *     </g>
     *  </g>
     *
     *  data-folded-node-id indicates the node to be unfolded when the boundary marker clicked.  The direction
     *  indicated by data-folded-direction.
     *
     * Boundary markers are also needed where ever the folded branches have an edge linked to a node outside the branch.
     *
     * We need to flag boundary markers that are hidden when the branch they are in has been folded -
     * these are called 'nested boundary edges' and marked with CSS class folded-nested.
     *
     * To achieve a consistent behaviour when folding and unfolding nodes in different orders, and when refreshing
     * the page, we remember the state as a sequence of fold requests.  An unfold command simply removes a previous
     * fold command from the state.  This fold state is held in the GraphZoomTrackerService.
     *
     * The processing of a fold/unfold command is made as follows:
     * 1.  Update the fold state held in the GraphZoomTrackerService.
     * 2.  Retrieve the full fold state from the service. This consists entirely of 'fold' commands - there are no
     *     'unfold' commands.
     * 3.  Build a complete logical view of the fold state of the flow by looping through each fold command (FoldCommand)
     *     in the fold state and calling buildFoldReqst to calculate the impact of the command.  This logical view is
     *     held in the FoldReqst object.
     * 4.  The FoldReqst object is passed to applyFoldReqstToDom, which make the necessary
     *     DOM changes based on the contents of the object via D3.
     * 5.  Since the FoldReqst object tracks the active elements, we need to also be able to remove previous DOM
     *     updates that are unnecessary (i.e. we 'reshow items').  This appears to be slightly beyond what D3 can achieve
     *     (happy to hear to the contrary!), so we keep track of which DOM elements we have updated in the FoldDomStatus
     *     object. Each new FoldReqst object is applied to the FoldDomStatus object, and a list of elements to 'reshow'
     *     is generated.
     * 6.  The list of items to reshow is processed via reShowFoldedDomItems.
     *
     * The previewing of folding, unfolding and branch selection uses much the same sequences of steps, but is
     * lighter-weight since it only changes the CSS classes on nodes and edges.  It does not change boundary markers.
     *
     * * NB: Anytime the doc mentions an 'activated' node, it means that the node has been manipulated by the flow_folding system
     * (to hide it or to change its appearance in the case of boundaryEdges)
     *
     */

    const app = angular.module('dataiku.flow.project');

    const FoldDirections = {
        predecessors: 'predecessors',
        successors: 'successors',
        getOpposite(val) {
            return (val == this.predecessors ? this.successors : this.predecessors);
        }
    };

    const FoldActions = {
        fold: 'fold',
        unfold: 'unfold'
    };

    app.service('FlowGraphFolding', function ($rootScope, WT1, TaggableObjectsUtils, FlowGraph, FlowGraphHighlighting, GraphZoomTrackerService, $timeout, LoggerProvider) {

        const Logger = LoggerProvider.getLogger('FlowGraphFolding');

        const svc = this;

        let foldedNodeCount = 0; // tracks the fold status to drive a 'hidden items' count on the flow view
        let activeFoldDomStatus; // maps of every DOM manipulation we've map so far

        const FoldDomStatusMapIdx = {
            node: 0,
            edge: 1,
            nestedBoundaryEdge: 2,
            boundaryEdge: 3
        }

        function getSelectorByIdFromList (list) {
            const sel = list.map(
                id => `svg [id="${id}"]`).join(', ');
            return sel == "" ? [] : sel;
        }

        let FoldDomStatus = function(){
            return {
                // Four maps for: nodes, edges, nestedBoundaryEdges, boundaryEdges
                maps:[{},{},{},{}],

                /**
                 * Takes the new list of ids which are part of the complete fold and
                 * compares these with the 'FoldDomStatus' map of currently 'activated' DOM ids.
                 * The function updates the 'FoldDomStatus' map of DOM ids which are 'activated',
                 * and returns a list of ids to be deactivated.
                 *
                 * @param newIdsList - array of Ids now be 'activated'
                 * @param mapIdx - 0, 1, 2, or 3 depending on which type of item we want to update (0 to update the nodes map, 1 for the edges one, etc.)
                 * @returns a list of existing activated DOM items to be de-
                 */
                updateStatusList: function (newIdsList, mapIdx) {

                    // flag all the items which need to be kept, so we can see which don't
                    const existingItemsMap = this.maps[mapIdx];
                    newIdsList.forEach(id => {
                        existingItemsMap[id] = true; // we need to keep this entry, or we add new entry
                    });

                    let newItemsMap = {};
                    let deactivateList = [];

                    Object.keys(existingItemsMap).forEach(id => {
                        if (existingItemsMap[id]) {
                            newItemsMap[id] = false;
                        }
                        else  {
                            deactivateList.push(id);
                        }
                    });

                    this.maps[mapIdx] = newItemsMap; // update map with new items
                    return deactivateList; // return list of items to deactivate
                },

                /**
                 * Update all the FoldDomStatus' maps of acticate DOM elements.
                 * @param listofListOfIds - array of four lists of IDs, corresponding to the four maps held in FoldDomStatus.
                 *                          This param represents the new foldState to be applied
                 * @returns - array of fours lists containing Ids of DOM items to be 'deactivated' - loosely speaking 'unfolded'
                 */
                update: function (listofListOfIds) {
                    const unFoldInfo = [];
                    listofListOfIds.forEach((list, i) => unFoldInfo.push(this.updateStatusList(list, i)));
                    return unFoldInfo;
                },

                previewStatusList: function (newIdsList, mapIdx) {

                    // flag all the items which need to be kept, so we can see which don't
                    const existingItemsMap = this.maps[mapIdx];
                    const differencesMap = angular.copy(existingItemsMap);

                    // flag all matching items as true, add missing items as false.
                    // result is all differences are marked false
                    newIdsList.forEach(id => {
                        if (differencesMap.hasOwnProperty(id)){
                            differencesMap[id] = true; // we need to keep this entry,
                        }
                         else {
                            differencesMap[id] = false; // new entry
                        }
                    });

                    let differencesList = [];

                    Object.keys(differencesMap).forEach(id => {
                        if (!differencesMap[id]) {
                            differencesList.push(id);
                        }
                    });

                    return differencesList;
                },

                getPreviewItems : function (listofListOfIds) {
                    const itemsToActivate = [];
                    listofListOfIds.forEach((list, i) => itemsToActivate.push(this.previewStatusList(list, i)));
                    return itemsToActivate;
                }
            };
        }

        /**
         * FoldReqst - returns the structure that defines the DOM operations required to perform a sequence of
         * fold commands
         * @param rootItem: the item which is being folded to unfolded
         * @param direction: a value of FoldDirections i.e. upstream (predecessors) or downstream (successors)
         * @returns a structure describing who are the DOM elements that need to be manipulated
         *
         */
        let FoldReqst = function (rootItem, direction, isUseCssTransitions) {
            return {
                direction: direction,
                rootItem: rootItem,
                idsToRemainShownList: [],       // list of ids of items that we do not want to hide with the folding
                                                // e.g. an item we are zooming to, or on the hidden end of a +  sign
                                                // we are trying to unfold
                nodeIdMap: {},                  // id=>element map of all the node elements being folded/unfolded. Used to detect loops
                nodeEls: [],                    // array of all the node elements being folded/unfolded

                edgeEls: [],                    // array of edge elements to fold/unfold
                edgeIdMap: {},
                branchEdgeIdMap: {},            // id=>element map of all the edges in the core branch being manipulated. Used to validate potential boundary markers

                boundaryEdges: [],              // array of edges (Flow item structures not SCG elements) which are boundary makers for the fold
                boundaryEdgeMap: {},
                boundaryEdgeMapByNode: {},

                nestedBoundaryEdgeIds: [],      // boundary edges from earlier folds that must now be hidden
                nestedBoundaryEdgeIdMap: {},
 
                isUseCssTransitions: isUseCssTransitions,

                copyFoldStateData: function(from, to) {
                    ['nodeIdMap', 'edgeIdMap', 'branchEdgeIdMap', 'boundaryEdgeMap', 'boundaryEdgeMapByNode', 'nestedBoundaryEdgeIdMap'].forEach(key => {
                        to[key] = Object.assign({}, from[key]);
                    });

                    ['nodeEls', 'edgeEls', 'boundaryEdges', 'nestedBoundaryEdgeIds'].forEach(key => {
                        to[key] = from[key].slice();
                    });

                    return to;
                },

                backupFoldState: function() {
                    this.foldStateBackup  = this.copyFoldStateData(this, {});
                },

                restoreFoldState: function() {
                    this.copyFoldStateData(this.foldStateBackup, this);
                },

                getRootNode: function () {
                    return FlowGraph.rawNodeWithId(this.rootItem.Id);
                },

                getBoundaryEdgeDescr: function (edgeId) {
                    return this.boundaryEdgeMap.hasOwnProperty(edgeId) ? this.boundaryEdgeMap[edgeId] : undefined;
                },

                getBoundaryEdges: function () {
                    return this.boundaryEdges.map(it => it.el);
                },

                getNestedBoundaryEdgesSelector: function () {
                    return getSelectorByIdFromList(this.nestedBoundaryEdgeIds);
                },

                isNodeFolded: function (nodeId) {
                    return this.nodeIdMap.hasOwnProperty(nodeId);
                },

                isEdgeFolded: function (edgeId) {
                    return this.edgeIdMap.hasOwnProperty(edgeId);
                },

                isBoundaryEdge: function (edgeId) {
                    return this.boundaryEdgeMap.hasOwnProperty(edgeId);
                },

                addNode: function(el, item) {
                    if (this.nodeIdMap[el.id]) return;

                    this.idsToRemainShownList.forEach(idToRemainShown => {
                        if (idToRemainShown == item.id) {
                            this.isItemToRemainShownWillBeHidden = true;
                        }
                    });

                    this.nodeEls.push(el);
                    this.nodeIdMap[item.id] = item;
                },

                addEdge: function(el, isMainBranch) {
                    if (this.edgeIdMap[el.id]) return;

                    this.edgeEls.push(el);
                    this.edgeIdMap[el.id] = el;
                    if (isMainBranch) this.branchEdgeIdMap[el.id] = el;
                },

                addBoundaryEdge: function(newEdgeDescr) {
                    const mapKey = newEdgeDescr.boundaryNodeId + this.rootItem.id + this.direction;

                    if (this.boundaryEdgeMapByNode.hasOwnProperty(mapKey)) return;

                    newEdgeDescr.rootItemId = this.rootItem.id;
                    newEdgeDescr.direction = this.direction;
                    this.boundaryEdgeMap[newEdgeDescr.el.id] = newEdgeDescr;
                    this.boundaryEdgeMapByNode[mapKey] = newEdgeDescr;
                    this.boundaryEdges.push(newEdgeDescr);

                    // these should always be hidden edges
                    this.addEdge(newEdgeDescr.el);
                },

                addNestedBoundaryEdge: function(edge) {
                    if (this.nestedBoundaryEdgeIds.hasOwnProperty(edge.id)) return;

                    this.nestedBoundaryEdgeIds.push(edge.id);
                    this.nestedBoundaryEdgeIdMap[edge.id] = edge;
                },

                isEdgeNeedsProcessing: function(edge) {
                    return !this.edgeIdMap[edge.id];
                }
            };
        }

        /**
         * Fold command - a structure to describe a fold or unfold operation.
         * An array of these are saved in the GraphZoomTrackerService to enable the fold statue to be restored
         */
        const FoldCommand = function (nodeId, direction, action) {
            return {
                nodeId: nodeId,
                direction: direction,
                action: action
            }
        }

        /**
         * lineAnalyser - a set of functions for processing edge (SVG path) information and help us determine the new
         * path we will add from the node to the boundary marker circle.
         */
        const lineAnalyser = {

            /**
             * addXyDeltasToLineInfo: enrich a line description which is in global co-ordinates to
             * give the relative change in X and Y co-ordinates (dX, dY)
             *
             * @param lineInfo: the line description to be enriched
             * @returns enriched lineInfo with dX and dY
             */
            addXyDeltasToLineInfo: function (lineInfo) {
                lineInfo.dX = lineInfo.endPoint.x - lineInfo.ctlPoint.x;
                lineInfo.dY = lineInfo.endPoint.y - lineInfo.ctlPoint.y;
                return lineInfo;
            },

            /**
             * addTrigToLineInfo: enrich a line description (dX, dY calculated already) to contain the length
             * if the line (hypot) and the angle of the line (angle) in radians
             *
             * @param lineInfo: the line description to be enriched
             * @returns enriched lineInfo with hypot and angle
             */
            addTrigToLineInfo: function (lineInfo) {
                this.addXyDeltasToLineInfo(lineInfo);
                lineInfo.hypot = Math.sqrt(Math.pow(lineInfo.dX, 2) + Math.pow(lineInfo.dY, 2));
                lineInfo.angle = Math.asin(lineInfo.dY / lineInfo.hypot);
                return lineInfo;
            },

            /**
             * findIconCentre: calculate the centre of the + sign in boundary marker.
             *
             *
             * @param lineInfo: a fully enriched line description
             * @param distXFromEnd: how far the centre should be from the end of the line along the X axis.
             * @returns an {x,y) co-ord structure
             */
            findIconCentre: function (lineInfo, distXFromEnd) {
                // some shockingly sloppy geometry.  This is not proper trig but near enough for a short line
                const scalingFactor = distXFromEnd / lineInfo.hypot;
                return {
                    x: lineInfo.endPoint.x - lineInfo.dX * scalingFactor,
                    y: lineInfo.endPoint.y - lineInfo.dY * scalingFactor
                };
            },

            /**
             * extendEndPoint: extend the length of a line that will be a boundary marker
             *
             * We need to do this because the line path we base our marker on doesn't actually go all the way to the
             * node at the end with the 'arrow'.  It stops shorts to give room for said arrow (actually a circle).
             *
             * @param lineInfo: a fully enriched line description
             * @param extendBy: how far you extend the line by
             * @returns lineInfo enriched with endPoint co-ordinate record
             */
            extendEndPoint: function (lineInfo, extendBy) {
                lineInfo.endPoint.x = lineInfo.endPoint.x + extendBy * Math.cos(lineInfo.angle);
                lineInfo.endPoint.y = lineInfo.endPoint.y + extendBy * Math.sin(lineInfo.angle);
                return lineInfo;
            },

            /**
             * extractFoldingInfoFromEdgePath: extract a description of the last section of the SVG path that
             * represents a curved edge between nodes.  We use this line as the basis for the edge from the node to the
             * boundary marker circle.  Ultimately a new path will be added from the node to the boundary circle which
             * uses the same start point and angle as the line we extract here.
             *
             * @param el: the edge SVG element
             * @param direction: which end of the curve we want to look at
             * @returns lineInfo fully enriched with trig info
             */
            extractFoldingInfoFromEdgePath: function (el, direction) {
                let info = {};

                const dAttr = el.firstElementChild.getAttribute("d");

                //extract end point and direct from the end of a Bezier cubic curve definition
                // PATH d attribute has format:
                //  d="M<start-x>,<start-y>C<ctl-point-x1>,<ctl-point-y1> <ctl-point-x2>,<ctl-point-y2> ... <end-x><end-y>"

                let tokens = dAttr.split(/[ MC]/);
                if (tokens.length < 2) return undefined;

                function buildCoord(s) { //expect string of format 123456,456789,
                    const tokens = s.split(",");
                    return (tokens.length > 1) ? {x: parseInt(tokens[0], 10), y: parseInt(tokens[1], 10)} : undefined;
                }

                if (direction == FoldDirections.successors)
                    info = {endPoint: buildCoord(tokens[1]), ctlPoint: buildCoord(tokens[2])};
                else
                    info = {endPoint: buildCoord(tokens.pop()), ctlPoint: buildCoord(tokens.pop())};

                return this.addTrigToLineInfo(info);
            },

            /**
             * initBoundaryEdgeData = the externally-called function to build the description of the boundary marker
             * @param el: the SVG element which is the edge we are aligning our boundary marker with.
             * @param direction: which end of the edge lement we want to put the boundar marker
             * @returns a structure which defines the new path we will create for the boundary marker
             */
            initBoundaryEdgeData: function (el, direction) {
                const distPlusIconFromEnd = 60; // how far the + icon is from the end of the line.
                const arrowTipWidth = 5; // the arrow tip is actually a circle.

                //get the first PATH statement, and then extract end point and last ctl-point.
                let info = this.extractFoldingInfoFromEdgePath(el, direction);

                if (direction != FoldDirections.successors) info = this.extendEndPoint(info, arrowTipWidth); //extend lines when folding upstream to account for 'arrow' circle on end of line

                info.iconCentre = this.findIconCentre(info, distPlusIconFromEnd);
                return info;
            },

            /**
             * getEdgeLineAngleForEl:calculate an indicator of the steepness of the line, ignoring direction
             * @param el: the edge SVG element to be analyzed
             * @param direction: the end of the edge we are interested in
             * @returns the modulus of the angle ie. ignoring its sign
             */
             getEdgeLineAngleForEl: function (el, direction) {
                let info = this.extractFoldingInfoFromEdgePath(el, direction);
                return info.angle < 0 ? -info.angle : info.angle;
            }
        };


        /**
         * applyPreviewCssChangesToDom
         * Apply CSS class to all highlight all nodes and edges affected by the preview
         * @param previewItemsInfo - array of lists of DSS ids of items beinb previewed.
         * @param previewClass - class to apply to DOM objects being preview
         */
        function applyPreviewCssChangesToDom(previewItemsInfo, previewClass) {
            d3.selectAll(previewItemsInfo[FoldDomStatusMapIdx.node].map(id => FlowGraph.rawNodeWithId(id)))  // id values for nodes are actually data-id= values
                .classed(previewClass, true);

            [FoldDomStatusMapIdx.edge, FoldDomStatusMapIdx.nestedBoundaryEdge].forEach( i =>
                d3.selectAll(getSelectorByIdFromList(previewItemsInfo[i]))
                    .classed(previewClass, true)
            )
        }

        function removeAllPreviewStyling() {
            $('.fold-preview').removeClass('fold-preview');
            $('.unfold-preview').removeClass('unfold-preview');
            $('.select-preview').removeClass('select-preview');
        }

        /**
         * applyPreviewFoldReqstToDom
         * Action all the DOM changes for a preview
         * @param previewFoldReqst - FoldReqst structure for preview
         * @param previewClass - CSS class to be applied
         */
        function applyPreviewFoldReqstToDom (previewFoldReqst, previewClass) {

            const itemsToPreview = activeFoldDomStatus.getPreviewItems(
                [previewFoldReqst.nodeEls.map(el => el.getAttribute('data-id')),
                 previewFoldReqst.edgeEls.map(el => el.id),
                 previewFoldReqst.nestedBoundaryEdgeIds]
            );
            applyPreviewCssChangesToDom(itemsToPreview, previewClass);
        }

        /**
         * reShowFoldedDomItems
         * Remove CSS and other DOM changes previously applied but no longer needed
         * @param itemsToReShow - array of id lists for items affected
         */
        function reShowFoldedDomItems(itemsToReShow) {

            d3.selectAll(itemsToReShow[FoldDomStatusMapIdx.node].map(id => FlowGraph.rawNodeWithId(id))).classed('folded-node', false); //node Ids are actually data-ids, which are slow to select.  use element lookup instead
            d3.selectAll(getSelectorByIdFromList(itemsToReShow[FoldDomStatusMapIdx.edge])).classed('folded-edge', false);
            d3.selectAll(getSelectorByIdFromList(itemsToReShow[FoldDomStatusMapIdx.nestedBoundaryEdge])).classed('folded-nested', false);

            d3.selectAll(getSelectorByIdFromList(itemsToReShow[FoldDomStatusMapIdx.boundaryEdge]))
                .classed('folded-boundary-edge', false)
                .attr('data-folded-boundary-node-id', null)
                .select('g.folded-icon')
                    .remove();  // the folded-icon group containing + sign
        }

        /**
         * applyFoldReqstToDom: use a fully built FoldReqst structure to make
         * the changes to the DOM necessary to execute a fold command.
         * @param foldReqst: a built FoldReqst structure
         */
        function applyFoldReqstToDom(foldReqst) {
            const radiusPlusIcon = 16; // radius of + icon
            const lenPlusArm = 11; // length of each arm of plus path

            if (!activeFoldDomStatus) activeFoldDomStatus = new FoldDomStatus();  // this remembers our DOM updates

            removeAllPreviewStyling();

            // hide nodes in branch
            d3.selectAll(foldReqst.nodeEls)
                .classed('folded-node', true)
                .classed('fold-transition', foldReqst.isUseCssTransitions);

            // hide edges in branch
            d3.selectAll(foldReqst.edgeEls)
                .classed('folded-edge', true)
                .classed('fold-transition', foldReqst.isUseCssTransitions);

            // hide nested boundary markers
            d3.selectAll(foldReqst.getNestedBoundaryEdgesSelector())
                .classed('folded-nested', true)
                .classed('fold-transition', foldReqst.isUseCssTransitions);

            // sort out hidden edges going to other nodes
            let boundaryEdges = foldReqst.boundaryEdges.map(item => {
                item.data = lineAnalyser.initBoundaryEdgeData(item.el, item.direction);
                return item
            });

            // find boundary edges that haven't been treated yet and add '+' indicator
            let boundaryEdgesSelectionNew =
                d3.selectAll(foldReqst.getBoundaryEdges())
                .filter(":not(.folded-boundary-edge)")
                    .data(boundaryEdges, function (d) {
                        return d ? d.el.id : this.id;
                    });

            // existing boundary makers need to bew processed - their rootItem data sometimes changes
            let boundaryEdgesSelectionExisting =
                d3.selectAll(foldReqst.getBoundaryEdges())
                    .filter(".folded-boundary-edge")
                    .data(boundaryEdges, function (d) {
                        return d ? d.el.id : this.id;
                    });

            boundaryEdgesSelectionNew
                .classed('folded-boundary-edge', true)
                .attr('data-folded-boundary-node-id', d => d.boundaryNodeId);

            //make sure existing boundary markers are updated
            boundaryEdgesSelectionExisting.select("g.folded-icon")  // .select forces the propagation of the updated data binding to the children
                .attr('data-folded-node-id', d => d.rootItemId)
                .attr('data-folded-direction', d => d.direction)
                .attr('data-folded-hidden-node-id', d => d.hiddenNodeId); // the hidden node on the end of the edge

            //create marker DOM elements for new ones
            //bundle it all in a <g> for easy removal
            const boundaryEdgeMarker = boundaryEdgesSelectionNew
                .append('g')
                .classed('folded-icon', true)
                .attr('data-folded-node-id', d => d.rootItemId)
                .attr('data-folded-direction', d => d.direction)
                .attr('data-folded-hidden-node-id', d => d.hiddenNodeId);

            // add the short line to the boundary marker
            const drawLine = d3.svg.line()
                .x(function (d) {
                    return d.x;
                })
                .y(function (d) {
                    return d.y;
                })
                .interpolate('linear');

            boundaryEdgeMarker
                .append('path')
                .attr('d', d => drawLine([d.data.iconCentre, d.data.endPoint]))
                .attr('stroke', '#000000')
                .attr('fill', 'none')
                .classed('folded-boundary-marker-line', true);

            // add a <g> to hold the plus-in-a-circle - mainly so we can
            // transform the co-ordinates to make centering the contents trivial
            const boundaryEdgeMarkerIconG = boundaryEdgeMarker
                .append('g')
                .attr('transform', d => {
                    return 'translate(' + d.data.iconCentre.x + ',' + d.data.iconCentre.y + ')'
                })

            // add a boundary marker circle
            boundaryEdgeMarkerIconG
                .append('circle')
                .attr('cx', 0)
                .attr('cy', 0)
                .attr('r', radiusPlusIcon)
                .attr('class', 'folded-boundary-marker-circle')
                .on('mouseover', d => {
                    const elG = $(d.el).find("g.folded-icon");
                    return svc.previewUnfold(FlowGraph.node(elG.attr('data-folded-node-id')), elG.attr('data-folded-direction'), elG.attr('data-folded-hidden-node-id'));
                    // by pulling the attributes dynamically, it is easier to handle boundarymarkers that change their rootItemId.
                })
                .on('mouseleave', d => svc.endPreviewBranch());

            // add the + sign as a <path>
            boundaryEdgeMarkerIconG
                .append('path')
                .attr("d", `M0,-${lenPlusArm} V${lenPlusArm} M-${lenPlusArm},0 H${lenPlusArm}`)
                .attr('stroke', '#000000')
                .attr('fill', 'none')
                .classed('folded-boundary-marker-plus', true);

            // re-show all the DOM stuff we no longer want hidden
            const itemsToReShow = activeFoldDomStatus.update(
                [foldReqst.nodeEls.map(el => el.getAttribute('data-id')),
                foldReqst.edgeEls.map(el => el.id),
                foldReqst.nestedBoundaryEdgeIds,
                foldReqst.boundaryEdges.map(item => item.el.id)]
            );

            reShowFoldedDomItems(itemsToReShow);

            // zap the CSS transition classes once we are done with them
            $timeout(_ => {
                $('.fold-transition').removeClass('fold-transition');
            }, 2000);

        }

        function getFuncEdgesAwayFromRoot (direction) {
            // edges on the side of the node further from the root item
            return direction == FoldDirections.successors ? FlowGraph.rawEdgesWithFromId : FlowGraph.rawEdgesWithToId;
        }

        function getFuncEdgesTowardRoot (direction) {
            // edges on the side of the node nearer the root item
            return direction == FoldDirections.successors ? FlowGraph.rawEdgesWithToId : FlowGraph.rawEdgesWithFromId;
        }

        function isEdgeSuitableAsBoundaryMarker(foldReqst, edge) {
            const existingDescr = foldReqst.getBoundaryEdgeDescr(edge.id);
            return !existingDescr || existingDescr.rootItemId == foldReqst.rootItem.id;
        }

        function getDirectionForEdgeEl(foldReqst, edge) {
            const existingDescr = foldReqst.getBoundaryEdgeDescr(edge.id);
            return existingDescr ? existingDescr.direction : undefined;
        }

        function updateMostLevelEdge(edge, mostLevelEdge, direction) {
            edge.angle = lineAnalyser.getEdgeLineAngleForEl(edge, direction);
            if (!mostLevelEdge || mostLevelEdge.angle > edge.angle) {
                mostLevelEdge = edge;
            }
            return mostLevelEdge;
        }

        /**
         * buildFoldReqst - build a FoldReqst structure for a fold command
         * This is the real engine of the folding logic.  It loops through elements starting form the rootItem in a
         * recursive pattern following the same pattern as the FlowSelection logic. However, it is made much more
         * complicated because of:
         * a) Nested folding
         * b) The need to define boundary markers for every element in the flow that loses an input or output edge
         *    due to the folding.
         * c) The ability to unfold in different order from the folding.
         * d) Loops in the graph
         *
         * The processing of a fold and unfold are broadly similarly, with some specific logic where necesssary.
         *
         * @param foldReqst: a single FoldReqst structure being built up throughout the recursive calls
         * @param item: item to process.  If undefined, then assume use the rootItem. Is set for the 'next' item in a recursive call
         * @param idsToRemainShownList: list of ids of items that we do not want hidden.  We flag if this foldReqst would hide an item
         * @returns the completed FoldReqst structure
         */

        function buildFoldReqst(foldReqst, item, idsToRemainShownList) {

            let isRootItem = false;
            if (typeof item === 'undefined') {
                item = foldReqst.rootItem;
                isRootItem = true;
            }

            foldReqst.idsToRemainShownList = idsToRemainShownList || [];

            let inValidContext = (!item || !item.id);
            inValidContext = inValidContext || (foldReqst.nodeIdMap && foldReqst.nodeIdMap.hasOwnProperty(item.id)); //reprocessing non-rootItem
            inValidContext = inValidContext || (!isRootItem && foldReqst.rootItem.id == item.id); //reprocessing rootItem - usually a looping flow

            if (inValidContext) {
                return foldReqst;
            }

            const fEdgesAwayFromRoot = getFuncEdgesAwayFromRoot(foldReqst.direction); // edges on the side of the node further from the root item
            const fEdgesTowardRoot = getFuncEdgesTowardRoot(foldReqst.direction); // edges on the side of the node nearer the root item
            const boundaryEdgeNodeAttr = 'data-' + (foldReqst.direction == FoldDirections.successors ? 'from' : 'to');
            const boundaryEdgeHiddenNodeAttr = 'data-' + (foldReqst.direction == FoldDirections.successors ? 'to' : 'from');
            const oppositeDirection = FoldDirections.getOpposite(foldReqst.direction);

            if (isRootItem) {
                const rootEdgesArray = fEdgesAwayFromRoot(foldReqst.rootItem.id);
                let mostLevelEdge;
                foldReqst.isChangeMadeForCommand = false;

                rootEdgesArray.forEach(
                    edge => {
                        if (foldReqst.isEdgeNeedsProcessing(edge)) {
                            foldReqst.isChangeMadeForCommand = true;
                            foldReqst.addEdge(edge);

                            //fold - we only want a single boundary marker added per node
                            // The most horizontal line looks visually tidiest
                            // but with unfold-strategy=rootitem we need to find an edge that is not already a boundary marker.
                            if (isEdgeSuitableAsBoundaryMarker(foldReqst, edge)) {
                                mostLevelEdge = updateMostLevelEdge(edge, mostLevelEdge, foldReqst.direction)
                            }
                        }
                    }
                );

                if (mostLevelEdge) {
                    foldReqst.addBoundaryEdge({el: mostLevelEdge, data: {},
                        boundaryNodeId: foldReqst.rootItem.id,
                        hiddenNodeId: mostLevelEdge.getAttribute(boundaryEdgeHiddenNodeAttr),

                    });
                }
            }
            else {
                //non-root item on the branch
                foldReqst.addNode(FlowGraph.rawNodeWithId(item.id), item);

                // we want boundary markers on all nodes that are left hanging: side branches of this branch
                fEdgesTowardRoot(item.id).forEach(
                    edge => {

                        const remoteNodeId = edge.getAttribute(boundaryEdgeNodeAttr);
                        const isBoundaryMarkerForNodeAlreadyBeingAdded =
                                    foldReqst.boundaryEdges.find(boundaryEdge =>
                                            boundaryEdge.el.id != edge.id &&
                                            boundaryEdge.boundaryNodeId == remoteNodeId &&
                                            boundaryEdge.direction == foldReqst.direction);

                        if (!isBoundaryMarkerForNodeAlreadyBeingAdded) {
                            //case of boundary marker pointing back upstream that need to be nested/hidden
                            if (getDirectionForEdgeEl(foldReqst, edge) == oppositeDirection){
                                foldReqst.addNestedBoundaryEdge(edge);
                            }

                            if (!foldReqst.isEdgeFolded(edge.id)) { //don't show new boundaries for edges already hidden
                                foldReqst.addBoundaryEdge({el: edge, data: {},
                                    boundaryNodeId: remoteNodeId,
                                    hiddenNodeId: item.id
                                });
                            }
                        }
                        else {
                            // we have a second edge on a boundary node.  We only want one edge to show the + sign,
                            // so we don't add to boundary edges list, but we still need to hide the edge so we
                            // add to edges list.  This is not an edge on the main branch though, so we don't add to
                            // branchEdgeIdMap
                            foldReqst.addEdge(edge);
                        }
                    });

                let isItemFolded = foldReqst.isNodeFolded(item.id);
                fEdgesAwayFromRoot(item.id).forEach( // edges on the branch being folded
                    edge => {
                        // we need to hide any boundary markers now nested in this fold.
                        if (foldReqst.isBoundaryEdge(edge.id) || isItemFolded) { //<<<<< extra conditional test only
                            foldReqst.addNestedBoundaryEdge(edge);
                        }

                        foldReqst.addEdge(edge, true);
                    });
            }

            $.each(item[foldReqst.direction], function (index, otherNodeId) {
                if (!foldReqst.isNodeFolded(otherNodeId)) {
                    const otherNode = FlowGraph.node(otherNodeId);
                    if (otherNode) foldReqst = buildFoldReqst(foldReqst, otherNode, idsToRemainShownList);
                }
            });

            // boundary edges cannot be edges inside the folded branch
            foldReqst.boundaryEdges = foldReqst.boundaryEdges.filter(item => !foldReqst.branchEdgeIdMap.hasOwnProperty(item.el.id))

            return foldReqst;
        }

        /**
         * tidyFoldState - ensure we clear down the restore state if things do awry.
         */
        function tidyFoldState(foldReqst) {
            const allFoldedNodes = $('.folded-node');
            foldedNodeCount = allFoldedNodes.length;

            if (foldedNodeCount==0) {
                GraphZoomTrackerService.resetFoldState();
            } else if (foldReqst && !foldReqst.isChangeMadeForCommand) {
                // check if the last command did nothing.  If so, we remove from state list
                // This can happened when build close alread-yclosed nodes and would lead to
                // unfolds that appear to do nothing.
                GraphZoomTrackerService.removeLastFoldCommand();
            }
        }

        /**
         * cleanRestoreState
         * Takes the restore state and removes any fold commands that reference flow items that don't exist anymore
         * @param commands - list of fold commands
         * @returns {*}
         */
        function cleanRestoreState(commands) {
            let origLen = commands.length;

            commands = commands.filter(cmd => !!FlowGraph.node(cmd.nodeId))
            if (origLen!=commands.length) {
                GraphZoomTrackerService.resetFoldState(commands);
            }
            return commands;
        }

        function applyFoldCommandToReqst (foldReqst, foldCommand, idsToRemainShownList) {
            // build total action into single foldReqst to apply at once
            const rootItem = FlowGraph.node(foldCommand.nodeId);

            foldReqst.rootItem = rootItem;
            foldReqst.direction = foldCommand.direction;
            foldReqst.action = foldCommand.action;
            foldReqst.isItemToRemainShownWillBeHidden = false;

            return buildFoldReqst(foldReqst, undefined, idsToRemainShownList);
        }

        /**
         * buildFoldReqstForCompleteState
         * Create a FoldReqst object that represents the complete sequence of fold commands.
         * This is called for previews, page refreshes, and user-driven folding / unfolding
         * @param commands - list of fold commands
         * @param isInteractiveReqst - if is a user-driven fold change, rather than a page refresh.  This determines if
         *        a CSS transition is used
         * @returns {FoldReqst}
         */
        function buildFoldReqstForCompleteState(commands, isInteractiveReqst, idsToRemainShownList) {
            let foldReqst = new FoldReqst(null, FoldDirections.successors, isInteractiveReqst);
            let foldCmdsApplied = [];
            let isCmdSkipped = false;

            cleanRestoreState(commands).forEach(cmd => {
                foldReqst.backupFoldState();
                foldReqst = applyFoldCommandToReqst (foldReqst, cmd, idsToRemainShownList);

                if (foldReqst.isItemToRemainShownWillBeHidden) {
                    foldReqst.restoreFoldState()
                    isCmdSkipped = true;
                }
                else {
                    foldCmdsApplied.push(cmd)
                }
            });

            if (isCmdSkipped) foldReqst.revisedFoldCmds = foldCmdsApplied;
            return foldReqst;
        }

        /**
         * applyFoldState
         * Apply the foldstate to the DOM.
         * This is called for pages refreshes and and user-driven folding / unfolding, but not previews
         * @param commands - the fold state
         * @param isInteractiveReqst - if is a user-driven fold change, rather than a page refresh.  This determines if
         *        a CSS transition is used
         */
        function applyFoldState(commands, isInteractiveReqst, idsToRemainShownList) {
            const foldReqst = buildFoldReqstForCompleteState(commands, isInteractiveReqst, idsToRemainShownList);

            applyFoldReqstToDom(foldReqst);
            $rootScope.$emit('flowSelectionUpdated');

            if (foldReqst.revisedFoldCmds) GraphZoomTrackerService.resetFoldState(foldReqst.revisedFoldCmds)
            tidyFoldState(foldReqst);
        }

        /**
         * foldMultiItems - action a fold command
         * @param rootItem: the item being folded/unfolded
         * @param direction: a value of FoldDirections, successor or predecessor
         * @param action: a value of FoldActions, fold or unfold
         * @param idsToRemainShownList: list of ids node that must be visible after unfolding.  For example, when you press
         *          a + you want something to shown on the end of that edge or it seems like nothing happened!
         */
        function foldMultiItems(rootItem, direction, action, idsToRemainShownList) {
            trackFoldCommand(rootItem.id, direction, action);
            applyFoldState(GraphZoomTrackerService.getFoldState(), true, idsToRemainShownList);
        }

        /**
         * trackFoldCommand - Update the GraphZoomTrackerService's list of active fold commands
         * @param nodeId - id of rootItem
         * @param direction: a value of FoldDirections, successor or predecessor
         * @param action: a value of FoldActions, fold or unfold
         */
        function trackFoldCommand(nodeId, direction, action) {
            Logger.debug(action.toString().toUpperCase() + " - " + direction.toUpperCase() + " " + nodeId);

            GraphZoomTrackerService.setFoldCommand(new FoldCommand(nodeId, direction, action));
        }

        // We only want to restore the fold status when the SVG graph has been reloaded.
        let foldStateRestored = false;
        $rootScope.$on('graphRendered', function() {
            foldStateRestored = false;
        });

        /* public methods */

        /**
         * unfoldNode: Unfold a folded node
         * @param unfoldEl: the boundary marker element (circle with a +) to unfold
         * */
        this.unfoldNode = function (unFoldEl) {
            const nodeId = unFoldEl.getAttribute('data-folded-node-id');
            const direction = unFoldEl.getAttribute('data-folded-direction');
            const idMustBeShown = unFoldEl.getAttribute('data-folded-hidden-node-id');
            foldMultiItems(FlowGraph.node(nodeId), direction, FoldActions.unfold, [idMustBeShown, nodeId]);
        };

        /**
         * foldSuccessors: fold a node downstream
         * @param item: a DSS flow data object (not a DOM element)
         */
        this.foldSuccessors = function (item) {
            foldMultiItems(item, FoldDirections.successors, FoldActions.fold);
        };

        /**
         * foldPredecessors: fold a node upstream
         * @param item: a DSS flow data object (not a DOM element)
         */
        this.foldPredecessors = function (item) {
            foldMultiItems(item, FoldDirections.predecessors, FoldActions.fold);
        };

        /**
         * previewSelect
         * Highlights the nodes / edges that will be affected by a 'Select all upstream/downstream' operation
         */
        this.previewSelect = function (item, direction) {
            const previewSelectReqst = buildFoldReqst(new FoldReqst(item, direction, true));
            if (previewSelectReqst) applyPreviewFoldReqstToDom(previewSelectReqst, 'select-preview');
        };

        /**
         * previewFoldOrUnfoldAction
         * Highlights the nodes / edges that will be affected by a 'Hide all upstream/downstream' operation
         * or display the nodes that will reappear when clicking on a boundaryEdgeMarkerIcon
         */
        function previewFoldOrUnfoldAction(item, direction, action, idsMustRemainShownList) {
            const previewFoldState = GraphZoomTrackerService.getPreviewFoldState(new FoldCommand(item.id, direction, action));
            const previewFoldReqst = buildFoldReqstForCompleteState(previewFoldState, true, idsMustRemainShownList);
            if (previewFoldReqst) applyPreviewFoldReqstToDom(previewFoldReqst, action + '-preview');
        }

        /**
         * previewFold
         * Highlights the nodes / edges that will be affected by a 'Hide all upstream/downstream' operation
         */
        this.previewFold = function (item, direction) {
            previewFoldOrUnfoldAction(item, direction, FoldActions.fold);
        };

        /**
         * previewUnfold
         * Display the nodes that will reappear when clicking on a boundaryEdgeMarkerIcon
         * For intuitive results, we need to ensure both the node we are unfolding appears incases it is nested in a
         * fold, and that the node on the end of the edge being unfolded appears, else it can seem like nothing
         * happened.
         */
        this.previewUnfold = function (item, direction, idsMustRemainShownList) {
            previewFoldOrUnfoldAction(item, direction, FoldActions.unfold, [idsMustRemainShownList, item.id]);
        };

        this.endPreviewBranch = function () {
            removeAllPreviewStyling();
        };

        /**
         * restoreState: restore the active sequence of fold/unfold commands
         * We only need to do this when the SVG graph is reloaded, not on
         * all resizes, but we need the node maps created by the graph resize
         *  to have been prepared, hence we trigger form the resize, but
         *  only action if we have not restored the state since the last
         *  draw_graph call.
         * @param commands: array of FoldCommands
         */
        this.restoreState = function (commands) {
            if (!foldStateRestored) {
                applyFoldState(commands, false);
                foldStateRestored = true;
            }
        };

        this.clearFoldState = function() {
            GraphZoomTrackerService.resetFoldState();
            foldStateRestored = false;
        };

        this.unfoldAll = function() {
            GraphZoomTrackerService.resetFoldState();
            $rootScope.$emit('drawGraph', {ignoreCache:true});
            tidyFoldState();
        }

        /**
         * ensureNodeNotFolded
         * called when the flow view tries to focus on an item. We need the item to be visible.
         * We re-apply the fold state, but specify the id is to remain shown, resulting in and
         * fold commands that contradict this are removed from the fold state.
         * @param idsToRemainShownList - list of ids of items that needs to be visible
         */
        //
        this.ensureNodesNotFolded = function (idsToRemainShownList) {
            applyFoldState(GraphZoomTrackerService.getFoldState(), true, idsToRemainShownList);
        }

        this.isNodeFolded = function(nodeId) {
            return activeFoldDomStatus
                && activeFoldDomStatus.maps[FoldDomStatusMapIdx.node].hasOwnProperty(nodeId);
        }

        this.getFoldedNodeCount = function () {
            return foldedNodeCount;
        }

    })

})();
