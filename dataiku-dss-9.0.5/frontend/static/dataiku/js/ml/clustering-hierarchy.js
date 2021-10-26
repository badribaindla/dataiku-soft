(function(){
'use strict';

var app = angular.module('dataiku.ml.report');


app.controller("ClusterHierarchyController", function($scope, $controller, $stateParams, Dialogs, DataikuAPI,
   FutureProgressModal, ActivityIndicator, CreateModalFromTemplate, WT1){

    WT1.event("clustering-hierarchy-page-open");

    $scope.hierarchyData = null;

    var retrieveData = function(){
        $scope.waiting = true;
        DataikuAPI.ml.clustering.getClusterHierarchy($stateParams.fullModelId || $scope.fullModelId).success(function(data) {
             $scope.hierarchyData = data;

             // create all cluster-meta to avoid constant saves while manipulating the graph.
             var registerNode = function(node){
                $scope.getClusterMeta("node_" + node.id);
                if(node.left_son){
                    registerNode(node.left_son);
                    registerNode(node.right_son)
                }
             };

             // Auto-name the root, well, "root"
             var rootNodeKey = "node_" + $scope.hierarchyData.root.id;
             if (! (rootNodeKey in $scope.clusterMetas)) {
                $scope.getClusterMeta(rootNodeKey).name = "root";
             }

             registerNode($scope.hierarchyData.root);

             $scope.waiting = false;
        }).error(function(data,status,headers){
              setErrorInScope.bind($scope)(data, status, headers);
              $scope.waiting = false;
        });
    };

    retrieveData();

    $scope.canCommit = true;

    $scope.hooks.dirty = function(){
        return $scope.diff;
    };

    $scope.$on("$destroy", function() { delete $scope.hooks.dirty; });

    $scope.diff = false;

    $scope.commit = function(leafIds){
        WT1.event("clustering-hierarchy-commit");
        var warning = "Are you sure you want to save this new clustering?";
        if($scope.getAlgorithm().startsWith("MLLIB")) warning += " This will trigger a Spark job.";
        Dialogs.confirm($scope, "Save clustering", warning).then(function(){
            WT1.event("clustering-hierarchy-commit-confirmed");
            $scope.modelData.userMeta.kept_hierarchy_node_ids = leafIds;
            DataikuAPI.ml.saveModelUserMeta($stateParams.fullModelId || $scope.fullModelId, $scope.modelData.userMeta).success(function(){
                  ActivityIndicator.success("Saved"); //maybe not necessary
                  DataikuAPI.ml.clustering.rescore($stateParams.fullModelId || $scope.fullModelId).success(function(data){
                      $scope.canCommit = false,
                      FutureProgressModal.show($scope, data, "Rescoring cluster hierarchy").then(function(result){
                      $scope.fetchModelDetails();
                          retrieveData();
                          $scope.canCommit = true;
                      })
                  }).error(setErrorInScope.bind($scope));
            }).error(setErrorInScope.bind($scope));
        });
    };

    $scope.edit = function(node, svgUpdateCallback){
        WT1.event("clustering-hierarchy-edit-node");
        CreateModalFromTemplate("/templates/ml/clustering-model/cluster-details-edit.html", $scope,
            "ClusterEditController", function(newScope){
            newScope.meta = $scope.getClusterMeta("node_" + node.id);
            newScope.callback = svgUpdateCallback;
        });
    };

});

app.directive("clusterHierarchy", function(Dialogs, ClusteringHeatmapUtils, WT1, getNameValueFromMLFeatureFilter){
    return {
        replace: true,
        templateUrl : '/templates/ml/clustering-model/cluster-hierarchy.html',
        scope: {
            data: '=',
            getClusterMeta: '=',
            edit: '=',
            commit: '=',
            canCommit: '=',
            readOnly: '=',
            diff: "="
        },
        link: function($scope, element) {

            var width = null;
            var height = null;
            var treeWidth = null;
            var container = $(element[0]).find("#container");
            d3.select(container[0]).select("svg").attr('height', 100000).append("defs");

            var svg = d3.select(container[0]).select("svg > g");
            var tree = d3.layout.cluster();

            var clusterWidth = 95;
            var clusterHeight = 18;

            var computeDimensions = function(){
                var leafCount = function(node){
                    if(node.collapsed || !node.left_son){
                        return 1;
                    } else {
                        return leafCount(node.left_son) + leafCount(node.right_son);
                    }
                };
                width = container.width();
                height = Math.max(400, (clusterHeight + 20) * leafCount(root));
                treeWidth = width - 100;
                tree.size([height, treeWidth]);
                container.height(height + 100);
            };

            tree.children(function(d){
                if(d.collapsed || !d.left_son){
                    return null;
                } else {
                    return [d.left_son, d.right_son];
                }
            });
            tree.sort(function(a,b){
                return d3.ascending(a.id, b.id);
            });

            $scope.editCluster = function(c){
                $scope.edit(c, function(){ update(root); });
            }

            var hasClusterParent = function(d){
                if(!d.parent){
                    return false;
                } else if(isCluster(d)){
                    return true;
                } else {
                    return hasClusterParent(d.parent);
                }
            };

            // Toggle children on click.
            var click = function(d) {
                if(hasClusterParent(d)){
                    d.collapsed = !d.collapsed;
                    update(d);
                    $scope.$apply(); //to recompute nLeaves
                }
            };

            var root = null;

            var collapseAll = function(node){
                if(node.left_son){
                    node.collapsed = true;
                    collapseAll(node.left_son);
                    collapseAll(node.right_son);
                } else {
                    node.collapsed = false;
                }
            }

            var collapseInit = function(node){
                if(isCluster(node)){
                    collapseAll(node);
                } else if(node.left_son) {
                    node.collapsed = false;
                    collapseInit(node.left_son);
                    collapseInit(node.right_son);
                } else {
                    node.collapsed = false;
                }
            }

            $scope.selectedNode = null;

            $scope.normalizeFeature = function(f){
                if(f === undefined) return;
                var splitedFeature = getNameValueFromMLFeatureFilter(f);
                if(splitedFeature.value){
                    return splitedFeature.name + " = " + splitedFeature.value;
                } else {
                    return f;
                }
            };

            $scope.featureSort = {
                sortBy: "default",
                sortDesc: false
            };

            $scope.featureIndex = [];

            var initFeatureIndex = function(){
                $scope.featureIndex = [];
                for(var i = 0; i < root.representative.length; i++){
                    $scope.featureIndex.push(i);
                }
            };

            var getParentChildScore = function(node){
                return function(i){
                    var parentValue = node.parent.representative[i];
                    var parentStd = node.parent.stds[i];
                    var parentWeight = node.parent.weight[i];
                    var value = node.representative[i];
                    var ratio;
                    if(parentStd == 0.0 || Number.isNaN(parentStd)){
                        ratio = value == 0.0 ? 0.0 : (value > 0.0 ? 2 : -2);//TODO
                    } else {
                        ratio = (value - parentValue)/parentStd;
                    }
                    return Math.abs(ratio);
                };
            };

            var getGlobalScore = function(node){
                return function(i){
                    return Math.abs(computeGlobalImportance(node, i));
                };
            };

            // scoreFeature is a function int => double on which to sort
            var applySorting = function(scoreFeature){
                var eps = $scope.featureSort.sortDesc ? -1 : 1;
                $scope.featureIndex.sort(function(a,b){
                    var aScore = scoreFeature(a);
                    var bScore = scoreFeature(b);
                    return eps * ((aScore < bScore) ? - 1 : (aScore > bScore ? 1 : 0));
                });
            };

            var sortDefault = function(){
                if($scope.featureSort.sortDesc){
                    $scope.featureIndex.reverse();
                }
            }

            var sortFeatureIndex = function(){
                initFeatureIndex();
                switch($scope.featureSort.sortBy){
                    case "global": applySorting(getGlobalScore($scope.selectedNode), root); break;
                    case "parent": applySorting(getParentChildScore($scope.selectedNode)); break;
                    default: sortDefault();
                }
            };

            var initDesc = function() {
                switch($scope.featureSort.sortBy){
                    case "global":
                    case "parent": $scope.featureSort.sortDesc = true; break;
                    default: $scope.featureSort.sortDesc = false; break;
                };
            };

            $scope.$watch('featureSort', function(nv, ov){
                if(nv && ov && nv.sortDesc === ov.sortDesc) {
                    initDesc();
                }
                WT1.event("clustering-hierarchy-sort-features", {
                    sortBy: $scope.featureSort ? $scope.featureSort.sortBy : "??",
                    sortDesc: $scope.featureSort ? $scope.featureSort.sortDesc : "??"
                });
                if(root)sortFeatureIndex();
            }, true);

            var ratioScales = d3.scale.linear().domain([-2, 0, 2]).range(["#0d52c1", "white", "#CE1329"]);
            $scope.arrowUp = function(featureIndex) {
                return $scope.selectedNode.representative[featureIndex] > $scope.selectedNode.parent.representative[featureIndex];
            };
            $scope.arrowColor = function(featureIndex){
                var value = $scope.selectedNode.representative[featureIndex];
                var parentValue = $scope.selectedNode.parent.representative[featureIndex];
                var parentStd = $scope.selectedNode.parent.stds[featureIndex];
                var ratio;
                if(parentStd == 0.0 || Number.isNaN(parentStd)){
                    ratio = value == 0.0 ? 0.0 : (value > 0.0 ? 2 : -2);
                } else {
                    ratio = (value - parentValue)/parentStd;
                }
                return ratioScales(ratio);
            };


            $scope.normalizeFeatureValue = function(feature, value){
                if(feature === undefined) return;
                if(feature.startsWith("dummy")){
                    return (Math.abs(value) * 100).toFixed(2) + "%";
                } else if (Math.abs(value) < .1 || Math.abs(value) >= 1000000) {
                    return value.toExponential(2);
                } else {
                    return value.toFixed(2);
                }
            };

            // utility to compute statistics
            var reduce = function(node, accessor, reducer){
                if(!node.left_son){
                    return accessor(node);
                } else {
                    var a = reduce(node.left_son, accessor, reducer);
                    var b = reduce(node.right_son, accessor, reducer)
                    return reducer(a,b);
                }
            };

            var featureScales = [];
            var globalScale;
            var computeColorScales = function(data){
                var max = 0.0;
                for(var i = 0; i < data.variable_names.length; i++){
                     max = Math.max(max, reduce(data.root, function(d){return Math.abs(computeGlobalImportance(d, i));}, Math.max));
                }
                max = Math.max(max, 10.0);
                globalScale = d3.scale.linear().domain([-max, -10.0, -2.0, 0.0, 2.0, 10.0, max])
                              .range(['#4285f4','#92abf9','#ccd4fc','#ffffff','#fbbab2','#ea746a','#ce1329']);
            };

            //replace squares by standard deviation to avoid recomputation
            var standardifyNode = function(n){
                n.stds = zip(n.representative, n.squares).map(x => Math.sqrt(Math.abs(x[1] / n.weight - x[0] * x[0]))); //should not need the Math.abs
                if(n.left_son){
                    standardifyNode(n.left_son);
                    standardifyNode(n.right_son);
                }
            };

            var computeGlobalImportance = function(node, featureIndex){
                var x = node.representative[featureIndex];
                var gx = root.representative[featureIndex];
                var importance;
                if($scope.features[featureIndex].startsWith("dummy:")){
                     importance = ClusteringHeatmapUtils.categoricalDiff(x, gx, node.weight, root.weight);
                } else {
                     importance = ClusteringHeatmapUtils.numericalDiff(x, gx, node.stds[featureIndex],
                                        root.stds[featureIndex], node.weight, root.weight);
                }

                return importance;
            };
            $scope.featureColor = function(featureIndex){
                if(featureIndex === undefined) return;
                var importance = computeGlobalImportance($scope.selectedNode, featureIndex);
                var col = globalScale(importance);
                return col;
            };

            var isCluster = function(d){
                return d && d.id in $scope.clusters;
            };
            $scope.isCluster = isCluster;

            /*
                labels each node with its cluster parent's id, if it has a cluster parent.
            */
            var computeClusterParents = function(node){
                var labelAll = function(n, i){
                    n.parent_cluster = i;
                    if(n.left_son){
                        labelAll(n.left_son, i);
                        labelAll(n.right_son, i);
                    }
                };
                if(isCluster(node)){
                    labelAll(node, node.id);
                } else if(node.left_son) {
                    computeClusterParents(node.left_son);
                    computeClusterParents(node.right_son);
                }
            };

            $scope.expandAll = function(){
                WT1.event("clustering-hierarchy-expand-all");
                var expandAll = function(node){
                    node.collapsed = false;
                    if(node.left_son){
                        expandAll(node.left_son);
                        expandAll(node.right_son);
                    }
                }
                expandAll(root);
                update(root);
            };

            $scope.collapse = function(){
                WT1.event("clustering-hierarchy-collapse");
                collapseInit(root);
                $scope.selectedNode = null;
                update(root);
            };

            $scope.reset = function(){
                 Dialogs.confirm($scope, "Reset clusters", "Do you want to reset the clustering to its current saved state ?").then(function(){
                   WT1.event("clustering-hierarchy-reset");
                   $scope.selectedNode = null;
                   initClusters();
                   $scope.diff = false;
                   svg.selectAll("rect.temporary").remove();
                   collapseInit(root);
                   computeClusterParents(root);
                   update(root);
                });
            };

            $scope.getName = function(nodeId){
                return $scope.getClusterMeta("node_" + nodeId).name;
            };

            var leaves = function(node){
                if(node.collapsed || ! node.left_son){
                    return [node.id];
                } else {
                    return leaves(node.left_son).concat(leaves(node.right_son));
                }
            };

            $scope.clusters = {};

            var computeDiff = function(){
                if(Object.keys($scope.clusters).length != $scope.data.active_ids.length){
                    $scope.diff = false;
                }
                for(var i = 0; i < $scope.data.active_ids.lenght; i++){
                    if(!($scope.data.active_ids[i] in $scope.clusters)){
                        $scope.diff = false;
                    }
                }
                $scope.diff = true;
            };

            checkChangesBeforeLeaving($scope, (function(_scope){return function() {return _scope.diff; }})($scope));

            /* Set a node as a cluster. If it does not have a cluster parent, it is set as a cluster and its
                cluster children are discarded. Otherwise, its cluster parent is discarded and the associated
                minimal set of clusters is added.
            */
            $scope.setAsCluster = function(node){
                if(hasClusterParent(node)){
                    WT1.event("clustering-hierarchy-set-as-cluster-has-cluster-parents");
                    var warning = "Setting this node as a cluster will also set its siblings as clusters.";
                    Dialogs.confirm($scope, "Set as cluster", warning).then(function(){
                        var n = node;
                        var toAdd = [node];
                        do {
                            if(n.parent.left_son == n){
                                toAdd.push(n.parent.right_son);
                            } else {
                                toAdd.push(n.parent.left_son);
                            }
                            n = n.parent;
                        } while(!isCluster(n));
                        delete $scope.clusters[n.id];
                        toAdd.forEach(function(c){ $scope.clusters[c.id] = {}});
                        computeDiff();
                        computeClusterParents(n);
                        svg.selectAll("rect.temporary").remove();
                        update(root);
                    });
                } else {
                    WT1.event("clustering-hierarchy-set-as-cluster-hasnt-cluster-parents");
                    var clusterSons = [];
                    var collectClusterSons = function(n){
                        if(isCluster(n)){
                            clusterSons.push(n);
                        } else {
                            collectClusterSons(n.left_son);
                            collectClusterSons(n.right_son);
                        }
                    };
                    collectClusterSons(node);
                    clusterSons.forEach(function(c){ delete $scope.clusters[c.id]; });
                    $scope.clusters[node.id] = {};
                    computeDiff();
                    computeClusterParents(node);
                    svg.selectAll("rect.temporary").remove();
                    update(root);
                }
            };

            $scope.commitClustering = function(){
                $scope.commit(Object.keys($scope.clusters));
            }

            var nLeaves = function(node){
                if(node.collapsed || !node.left_son){
                    return 1;
                } else {
                    return nLeaves(node.left_son) + nLeaves(node.right_son);
                }
            }

            $scope.nodeProportion = function(d){
                return (100 * (d.weight + 0.0)/root.weight).toFixed(2);
            };


            /*************************
                LAYOUT COMPUTATION
            *************************/

            /* helper functions for layout computation */

            var maxDepth = function(node, isLeaf){
                if(!isLeaf(node)){
                    return 1 + Math.max(maxDepth(node.children[0], isLeaf), maxDepth(node.children[1], isLeaf));
                } else {
                    return 0;
                }
            };

            var minLeafSeparation = 10; //we don't want leaves to be separated by less than 10px.

            /*
              Puts all nodes in the tree (as defined by the isLeaf function) in a list, in the post-order traversal
              order. This ensures leaves are put in order, followed by their parents in the same order, and so on.
            */
            var postOrderList = function(tree, isLeaf){
                var node = tree, nodes = [node], next = [], children, i, n;
                    while (node = nodes.pop()) {
                        next.push(node);
                        if(!isLeaf(node)){
                            nodes.push(node.left_son);
                            nodes.push(node.right_son);
                        }
                    }
                return next.reverse();
            };

            var isTerminalNode = function(n){ return n.collapsed || (!n.left_son); };

            /*
               Computes the cluster layout for a node and its descendants. Layout is stored in x, y.
               If positionLeaves is true, then the layout will also be computed for the leaves and the result
                will not be normalized. Otherwise, y-positions will be normalized with respect to leaf positioning.
                If a width is provided, the base layout will be built with that width, fully occupied. Otherwise,
                it will build it with width equal to the depth of the tree.
            */
            var computeBaseLayout = function(tree, treatAsLeaf, positionLeaves, width){
                var m = 1.0 * maxDepth(tree, treatAsLeaf);
                if(!width){
                    width = m;
                }
                var previousNode;
                var x = 0;
                postOrderList(tree,treatAsLeaf).forEach(function(node){
                    if(!treatAsLeaf(node)){
                        node.y = (node.left_son.y + node.right_son.y)/2;
                        node.x = Math.min(node.left_son.x, node.right_son.x) - width / m;
                    } else if (positionLeaves) {
                        node.y = previousNode ? x += (node.parent === previousNode.parent ? 1 : 2) * minLeafSeparation : 0;
                        node.x = m;
                        previousNode = node;
                    }
                });
            };

            /*
                Computes the bounding box for a tree, ie the coordinates of the smallest rectangle containing the tree,
                where coordinates are taken as the x,y properties of each node.
            */
            var computeBoundingBox = function(tree){
                var maxY = Number.NEGATIVE_INFINITY;
                var maxX = Number.NEGATIVE_INFINITY;
                var minY = Number.POSITIVE_INFINITY;
                var minX = Number.POSITIVE_INFINITY;
                var updateBoundingBox = function(node){
                    maxY = Math.max(node.y, maxY);
                    maxX = Math.max(node.x, maxX);
                    minY = Math.min(node.y, minY);
                    minX = Math.min(node.x, minX);
                    if(!isTerminalNode(node)){
                        updateBoundingBox(node.left_son);
                        updateBoundingBox(node.right_son);
                    }
                };
                updateBoundingBox(tree);
                return {
                    maxX: maxX,
                    maxY: maxY,
                    minX: minX,
                    minY: minY
                };
            };

            /**/
            var rescale = function(tree, x_scale, y_scale, x_offset, y_offset){
                var bb = computeBoundingBox(tree);
                var renormalizeNode = function(node){
                    node.x = x_offset + width * x_scale * (node.x - bb.minX);
                    node.y = y_offset + height * y_scale * (node.y - bb.minY);
                    if(!isTerminalNode(node)){
                        renormalizeNode(node.left_son);
                        renormalizeNode(node.right_son);
                    }
                };
                renormalizeNode(tree);
            };

            /* Renormalizes the tree, given a width and height, and offsets such that the upper-left corner of
                the bounding box for the tree should begin at that offset.*/
            var renormalize = function(tree, width, height, x_offset, y_offset) {
                var bb = computeBoundingBox(tree);
                var xScale = bb.maxX == bb.minX ? 1.0 : 1.0/(bb.maxX - bb.minX);
                var yScale = bb.maxY == bb.minY ? 1.0 : 1.0/(bb.maxY - bb.minY);
                var renormalizeNode = function(node){
                    node.x = x_offset + width * xScale * (node.x - bb.minX);
                    node.y = y_offset + height * yScale * (node.y - bb.minY);
                    if(!isTerminalNode(node)){
                        renormalizeNode(node.left_son);
                        renormalizeNode(node.right_son);
                    }
                };
                renormalizeNode(tree);
            };

            /* Recomputes the layout for the clustering.
            The logic of the algorithm is the following : we build the layout right to left
                - first, if a node is a "cluster" (or collapsed cluster), its opened children and itself are considered
                  as their own cluster layout, which is computed as d3 would the full layout.
                - we rescale each subtree layout so that they all have the same width
                - then, each subtree is positioned in order, with the same vertical distance in between subtrees, and roots
                  at the same height.
                - for the leftmost part of the layout, the layout is the same as a d3 cluster layout, but the leaves
                  are the cluster nodes, which already have their positions defined.
                - when all is done, we compute the bounding box for the whole thing and see if we can stretch it
                  vertically to occupy the whole screen, and then adjust for padding.
                - finally, we adjust horizontally, to add space for the cluster label boxes */
            var computeLayout = function(root, width, height, padding, clusterWidth){

                var subtrees = [];
                //collects all subtrees starting at a cluster, from top to bottom (right to left in tree order)
                //this terminates because every path from the root traverses a cluster
                var collectSubtrees = function(node){
                    if(isCluster(node)){
                        subtrees.push(node);
                    } else {
                        collectSubtrees(node.right_son);
                        collectSubtrees(node.left_son);
                    }
                };
                collectSubtrees(root);

                //compute the layout for every subtree, which will be correctly positioned.
                subtrees.forEach(function(tree){ computeBaseLayout(tree, function(node){ return !node.children; }, true); });
                var y_offset = 0;
                for(var i = 0; i < subtrees.length; i++){
                    var bb = computeBoundingBox(subtrees[i]);
                    var subtreeHeight = bb.maxY - bb.minY;
                    //we don't touch subtree height, but stretch the tree to fit half the window.
                    renormalize(subtrees[i], width / 2 - clusterWidth, subtreeHeight, width / 2, y_offset);
                    y_offset += subtreeHeight + 2 * clusterHeight;
                }

                //compute the root layout, but this time clusters are the leaves.
                computeBaseLayout(root, function(node){ return isCluster(node); }, false, width/2);

                //stretch if we can
                var bb = computeBoundingBox(root);
                var h = padding + bb.maxY - bb.minY;
                var nodeList = postOrderList(root, function(n){ return isTerminalNode(n); });
                if(!padding){
                    padding = 0;
                }
                if(h > 0 && h < height){
                    var scale = (1.0 * height)/h;
                    nodeList.forEach(function(n){ n.y = scale * n.y; });
                    bb.maxY *= scale;
                }
                //add padding
                var x_scale = (width - 2.0 * padding) / width;
                var y_scale = (h - 2.0 * padding) / height;
                nodeList.forEach(function(node){
                    node.x = padding + node.x * x_scale;
                    node.y = padding + node.y;
                });

                //rescale to take cluster width into account. We rescale left and right symmetrically, in order to keep
                //the padding but ensure the right clusterWidth
                var scaleRatio = (0.50 * width - padding - 0.5 * clusterWidth)/(0.5 * width - padding);
                var rescaleLeft = function(x){ return (x - padding) * scaleRatio + padding; };
                nodeList.forEach(function(node){
                    if(isCluster(node)){
                        return;
                    } else if(hasClusterParent(node)){
                        node.x = width - rescaleLeft(width - node.x);
                    } else {
                        node.x = rescaleLeft(node.x);
                    }
                });

            };

            var initClusters = function(){
                $scope.clusters = {};
                for(var i = 0; i < $scope.data.active_ids.length; i++){
                    $scope.clusters[$scope.data.active_ids[i]] = {};
                }
            };

            /*************************
                DATA UPDATE FUNCTION
            *************************/
            $scope.$watch('data', function(){
                if($scope.data){
                    root = $scope.data.root;
                    $scope.features = $scope.data.variable_names;
                    initClusters();
                    $scope.activeIds = $scope.data.active_ids;
                    collapseInit(root);
                    standardifyNode(root);
                    computeColorScales($scope.data);
                    computeClusterParents(root);
                    $scope.diff = false;
                    initFeatureIndex();
                    update(root);
                }
            });

            /************************
                SVG UPDATE FUNCTION
            ************************/
            var update = function(source) {

                $scope.nLeaves = nLeaves(root);

                computeDimensions();

                /* graphical utilities, need to be in update function because they require computed dimensions */

                var nodeRadius = function(d){
                  return 20 * Math.pow(d.weight / root.weight, 0.3);
                };

                var maxCurveLength = 40;
                var linkShape = function(d){
                    //adjust target and source positions to account for cluster label width
                    var sourceX = d.source.x;
                    var targetX = d.target.x;
                    if(isCluster(d.source)){
                        sourceX += clusterWidth / 2;
                    } else if(isCluster(d.target)){
                        targetX -= clusterWidth / 2;
                    }
                    var xDiff = targetX - sourceX;
                    var curveLength = Math.min(maxCurveLength, xDiff);
                    var diag = d3.svg.diagonal()
                                 .source(function(d) { return {"x":d.source.y, "y":sourceX}; })
                                 .target(function(d) { return {"x":d.target.y, "y":sourceX + curveLength}; })
                                 .projection(function(d) { return [d.y, d.x]; });
                    var line;
                    if(curveLength < xDiff){
                        line = "L " + d.target.x + "," + d.target.y;
                    } else {
                        line = "";
                    }
                    return diag(d) + line;
                }

                $scope.nodeColor = function(node){
                    return $scope.getClusterMeta("node_" + node.id).color;
                };

                var inactiveLinkColor = "#CCCCCC";
                var activeLinkColor = "#999999";

                var colorLeadingLinks = function(node, color){
                    if(node.parent){
                        svg.select("#link_" + node.parent.id + "_" + node.id).style("stroke", function(d){return color;});
                        colorLeadingLinks(node.parent, color);
                    }
                };
                var appendLeadingNames = function(node) {
                    if(!isCluster(node)){
                        var name = $scope.getName(node.id);
                        //clip name for overflow
                        if(name.length > 10){
                            name = name.substring(0,8) + "...";
                        }
                        svg.select("#nodegroup_" + node.id)
                            .append("text")
                            .attr("id", "text_" + node.id)
                            .text(name)
                            .attr("fill", node == $scope.selectedNode ? "#666" : "#CCC")
                            .attr("dx", 20)
                            .attr("dy", 4)
                            .on('mouseover', onNodeHover);
                    }

                    if(node.parent){
                        appendLeadingNames(node.parent);
                    }
                };
                var removeLeadingNames = function(node) {
                    if(!isCluster(node)){
                        svg.select("#text_" + node.id).remove();
                    }
                    if(node.parent){
                        removeLeadingNames(node.parent);
                    }
                };

                var onNodeHover = function(d){
                    if(!$scope.selectedNode || $scope.selectedNode.id != d.id){
                        //reset the previous path to default style
                        if($scope.selectedNode){
                            colorLeadingLinks($scope.selectedNode, inactiveLinkColor);
                            removeLeadingNames($scope.selectedNode);
                            svg.selectAll("rect.temporary").remove();
                            svg.selectAll("text.caret").remove();
                        }
                        $scope.selectedNode = d;
                        sortFeatureIndex();
                        showSelected(d);
                    }
                };

                var showSelected = function(node) {
                    var nodeGroup = svg.select("#nodegroup_" + node.id);

                    if (!$scope.readOnly) {
                        //add an invisible target for the dropdown click
                        nodeGroup
                            .append("rect")
                            .attr("x", isCluster(node)? clusterWidth / 2 - 22 : clusterWidth - 25)
                            .attr("y", -clusterHeight/2)
                            .attr("width", clusterHeight + 5)
                            .attr("height", clusterHeight)
                            .attr("fill-opacity", 0)
                            .attr("class", "temporary cursor-pointer")
                            .on("click", showNodeMenu);
                        //add a caret (no pointer events)
                        nodeGroup.append("text")
                            .attr("class", "caret cursor-pointer")
                            .style("font-family", "FontAwesome")
                            .text(String.fromCharCode(parseInt("F0D7", 16)))
                            .attr("x", isCluster(node) ? clusterWidth/2 - 15 : clusterWidth - 25)
                            .attr("y", 5)
                            .attr("fill", isCluster(node) ? "white" : "#333")
                            .attr("pointer-events", "none");
                    }


                    //for non-cluster nodes, add a transient cartouche under the name
                    if(!isCluster(node)){
                        nodeGroup.insert("rect", ":first-child")
                            .attr("class", "temporary")
                            .attr("width", clusterWidth )
                            .attr("height", clusterHeight )
                            .attr("rx", clusterHeight/2)
                            .attr("y", -clusterHeight/2)
                            .attr("x", -10)
                            .attr("fill", "#E2E2E2");
                    }

                    colorLeadingLinks(node, activeLinkColor);
                    appendLeadingNames(node);
                    safeApply($scope);
                };

                var $nodeMenu = container.find("ul.dropdown-menu");
                var showNodeMenu = function(d) {
                    $nodeMenu.css("left", d.x - clusterWidth/2 + 5);
                    $nodeMenu.css("top", d.y + clusterHeight/2 + 2);
                    $nodeMenu.css("display", "block");
                };

                var hideNodeMenu = function(e) {
                    if (e.target.classList[0] != 'caret' && e.target.classList[0] != 'temporary') {
                        $nodeMenu.css("display", "none");
                    }
                };

                //hide the menu when clicking outside it
                $('body').on('click', hideNodeMenu);
                $scope.$on("$destroy", function() { $('body').off('click', null, hideNodeMenu)});

                // Compute the new tree layout.
                var nodes = tree.nodes(root);
                var links = tree.links(nodes);

                var padding = 20;
                computeLayout(root, width, height, padding, clusterWidth);

                var node = svg.selectAll(".node").data(nodes, function(d) { return d.id; });
                var link = svg.selectAll(".link").data(links);

                node.exit().remove();
                link.exit().remove();
                svg.selectAll("text").remove();

                link.enter().insert("path", ":first-child").attr("class", "link");

                 link.attr("d", linkShape)
                    .attr("id",function(d){ return "link_" + d.source.id + "_" + d.target.id; })
                    .style("fill", "none")
                    .style("stroke",inactiveLinkColor)
                    .style("stroke-width", function(d){
                       return Math.max(2, 15 * d.target.weight/root.weight);
                    })
                    .on("mouseover", function(d) {
                        onNodeHover(d.target);
                    });

                if($scope.selectedNode){
                    showSelected($scope.selectedNode);
                }

                var nodeEntered = node.enter()
                    .append("g")
                    .attr("class", "node").attr("id", function(d){ return "nodegroup_" + d.id;});
                nodeEntered.append("rect");

                nodeEntered.attr("transform", function(d){
                       return "translate(" + 0 + ", " + d.x + ")";
                });

                node.attr("transform", function(d){
                     return "translate(" + d.x + ", " + d.y + ")";
                });

                node.select("rect")
                    .attr("width", function(d){ return isCluster(d) ? clusterWidth: nodeRadius(d); })
                    .attr("height", function(d){ return isCluster(d) ? clusterHeight: nodeRadius(d); })
                    .attr("rx", function(d){return (isCluster(d) ? clusterHeight: nodeRadius(d))/2;})
                    .attr("y", function(d){return -(isCluster(d) ? clusterHeight: nodeRadius(d))/2;})
                    .attr("x", function(d){return -(isCluster(d) ? clusterWidth : nodeRadius(d))/2;})
                    .attr("fill", function(d){
                        if(isCluster(d)){
                            return $scope.nodeColor(d);
                        } else if(!d.left_son){
                            return inactiveLinkColor;
                        } else {
                            return "white";
                        }
                    })
                    .style("stroke", function(d){
                        return "#666666";
                    })
                    .style("stroke-width", function(d){
                        if(isCluster(d) || !d.left_son){
                            return 0;
                        } else if($scope.selectedNode && $scope.selectedNode.id == d.id){
                            return 3;
                        } else {
                            return 1;
                        }
                    }).style("cursor", function(d){ return hasClusterParent(d) && d.left_son ? "pointer": "default"; })
                      .attr("id",function(d){return "node_" + d.id})
                      .on("click", click)
                      .on("mouseover", onNodeHover);

                 node.filter(function(d){
                    return isCluster(d);
                  })
                 .append("text").text(function(d){
                    var name = $scope.getName(d.id);
                    //clip name for overflow
                    if(name.length > 10){
                        return name.substring(0,8) + "...";
                    } else {
                        return name;
                    }
                 })
                 .attr("text-anchor", "middle")
                 .attr("fill", function(d){
                     return "white";
                 })
                 .style("pointer-events", "none")
                 //.attr("dx", )
                 .attr("dy", 4);

                 var linkExit = link.exit().remove();
                 var nodeExit = node.exit().remove();


                node.exit().remove();
            };
        }
    };
});


})();
