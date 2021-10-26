(function() {
'use strict';

const app = angular.module('dataiku.ml.report');


app.controller('DecisionTreeController', function($scope, DataikuAPI, $stateParams){
    DataikuAPI.ml.prediction.getTreeSummary($stateParams.fullModelId || $scope.fullModelId).success(function(data) {
        if($.isEmptyObject(data)){
             $scope.noTreesFound = true;
             return;
        }
        $scope.treeData = data;
    }).error(function() {
        $scope.uiState.noTreesFound = true;
        setErrorInScope.apply($scope, arguments);
    });
});


app.controller('TreeEnsembleController', function($scope, DataikuAPI, $stateParams, Throttle){
    //mild makeover to address stricter input[type=range] validation in ng1.6
    $scope.uiState = { i: -1, nTrees: 0, warningHidden: false, wasClipped: false, selectedPartition: $scope.uiState ? $scope.uiState.selectedPartition : null};

    $scope.setIndex = function(i){ $scope.uiState.i = i; };
    $scope.nextTree = function(){ if($scope.uiState.i < $scope.uiState.nTrees) $scope.uiState.i++; };
    $scope.previousTree = function(){ if($scope.uiState.i > 1) $scope.uiState.i--; };
    $scope.hideWarning = function(){ $scope.uiState.warningHidden = true;};

    var throttled = Throttle().withScope($scope).withDelay(500).wrap(function(){
        if($scope.uiState.i <= 0) return;
        $scope.currentTree = {
            featureNames: $scope.treeData.featureNames,
            tree: $scope.treeData.trees[$scope.uiState.i - 1]
        };
    });

    $scope.$watch('uiState.i', function(nv, ov){
        if (nv <= 0) return;
        throttled();
    });

    var p = DataikuAPI.ml.prediction.getEnsembleSummary($scope.uiState.selectedPartition || $stateParams.fullModelId || $scope.fullModelId).success(function(data) {
              if($.isEmptyObject(data)){
                 $scope.uiState.noTreesFound = true;
                 return;
              }
              $scope.treeData = data;
              $scope.uiState.i = 1;
              $scope.uiState.nTrees = data.trees.length;
              $scope.uiState.wasClipped = data.was_clipped;
    }).error(function() {
        $scope.uiState.noTreesFound = true;
        setErrorInScope.apply($scope, arguments);
    });

    if ($scope.noSpinner) p.noSpinner();// used by saved-model-report-insight-tile
});


app.directive('decisionTreeControl', function(FeatureNameUtils) {
    return {
        replace: true,
        templateUrl : '/templates/ml/prediction-model/tree_summary_view.html',
        scope: {
            data: '=',
            classes: '=',
            coreParams: '=',
            disableTransitions: "=?"
        },
        link : function($scope, element, attrs) {

            var i = 0;
            var duration = 200;
            var squareSize = 30;
            var linkWidth = function(proportion){ return 0.5 + 30 * proportion; };
            var diagonal = d3.svg.diagonal().projection(function(d){ return [d.x, d.y]; });

            var container = $(element[0]).find("#treeContainer svg");
            var svg = d3.select(element[0]).select("#treeContainer svg > g");

            var tree = d3.layout.tree();

            var height;
            var width;
            var nodeIntervalHeight = 100;

            var depth = function(node){
                if(node.children){
                    return 1 + Math.max(depth(node.children[0]), depth(node.children[1]));
                } else {
                    return 1;
                }
            };

            var computeDimensions = function(){
                height = nodeIntervalHeight * depth(root);
                width = container.width();
                tree.size([width, height]);
                container.height(height);
            };

            var argmax = function(a){
                var max = a[0];
                var arg = 0;
                for(var i = 1; i < a.length; i++){
                    if(a[i] > max){
                        arg = i;
                        max = arg;
                    }
                }
                return arg;
            };

            var root = {};
            var nodeColor = {};
            $scope.colors = {};

            var createNodeColor = function(root){
                var reduce = function(n, reducer, accessor){
                    if(n.children){
                        return reducer(reduce(n.children[0], reducer, accessor), reduce(n.children[1], reducer, accessor));
                    } else {
                        return accessor(n);
                    }
                };

                if(root.predict || root.predict == 0){
                    //regression
                    var acc = function(d){return d.predict;};
                    nodeColor = d3.scale.linear()
                                   .domain([reduce(root, Math.min, acc), root.predict, reduce(root, Math.max, acc)])
                                   .range(["blue","#f2f2f2","red"]);
                } else if(root.probabilities.length == 2) {
                    //binary classification
                    var acc = function(d){return d.probabilities[0];};
                    var scale = d3.scale.linear()
                                 .domain([reduce(root, Math.min, acc), root.probabilities[0], reduce(root, Math.max, acc)])
                                 .range(["blue","#f2f2f2","red"]);
                    nodeColor = function(probabilities){return scale(probabilities[0]);};
                    $scope.colors = function(c){
                        if(c == 0){
                            return "red";
                        } else {
                            return "blue";
                        }
                    };
                } else {
                    var nFeat = root.probabilities.length;
                    var globalScale = d3.scale.category10();
                    var localScales = [];
                    for(var i = 0; i<nFeat; i++){
                        var col = globalScale(i % 10);
                        //create linear scale between the smallest possible prob and the biggest found in tree
                        var acc = function(d){ return d.probabilities[i]; };
                        var local = d3.scale.linear()
                                    .domain([1.0/nFeat, Math.max(reduce(root, Math.max, acc), 0.001 + 1.0/nFeat)])
                                    .range(["#f2f2f2", col]);
                        localScales.push(local);
                    }
                    nodeColor = function(probabilities){
                       var winner = argmax(probabilities);
                       return localScales[winner](probabilities[winner]);
                    };
                    $scope.colors = function(c){ return globalScale(c % 10); };
                }
            };


            var createGradients = function(root){

                var makeArray = function(node){
                    var res = [];
                    if(node.children){
                        var left = makeArray(node.children[0]);
                        var right = makeArray(node.children[1]);
                        res = left.concat(right);
                    }
                    res.push({color: nodeColor(node.probabilities || node.predict)});
                    return res;
                };

                var gradients = svg.append("defs").selectAll("linearGradient").data(makeArray(root)).enter()
                                .append("linearGradient")
                                .attr("id", function(d){return "gradient-" + d.color;})
                                .attr("spreadMethod", "pad")
                                .attr("x1", "0%")
                                .attr("x2", "0%")
                                .attr("x1", "0%")
                                .attr("y2", "100%")
                                //.attr("y");

                gradients.append("stop")
                        .attr("offset", "0%")
                        .attr("stop-color", function(d){ return d.color; })
                        .attr("stop-opacity", 1);

                gradients.append("stop")
                        .attr("offset", "100%")
                        .attr("stop-color", "white")
                        .attr("stop-opacity", 0);
            };

            var updateNodeInformation = function(node, updateScope){
                if(node.probabilities){
                    $scope.probabilities = node.probabilities;
                    $scope.predict = $scope.classes[argmax[node.probabilities]];
                    $scope.currentNodeColor = nodeColor(node.probabilities);
                    $scope.targetClassesProportions = node.targetClassesProportions;
                } else {
                    $scope.predict = node.predict.toFixed(2);
                    $scope.currentNodeColor = nodeColor($scope.predict);
                }
                $scope.nSamples = node.nSamples;
                $scope.nSamplesWeighted = node.nSamplesWeighted;
                $scope.proportion = (node.proportion * 100).toFixed(2) + "%";
                $scope.proportionWeighted = (node.proportionWeighted * 100).toFixed(2) + "%";
                updateBreadcrumb(node);
                if(updateScope){
                    $scope.$apply();
                }
            };


            //create a (childless) node at the given index
            var nodify = function(data, index, maxSamples, maxSamplesWeighted){
                var node = {};
                var tree = data.tree;
                $scope.warningMessage = tree.warningMessage;
                if(tree.nSamples) {
                    node.nSamples = tree.nSamples[index];
                    node.proportion = tree.nSamples[index]/parseFloat(maxSamples);
                }
                node.impurity = tree.impurity[index];
                if(tree.nSamplesWeighted) {
                    node.nSamplesWeighted = tree.nSamplesWeighted[index];
                    node.proportionWeighted = tree.nSamplesWeighted[index]/parseFloat(maxSamplesWeighted);
                }
                if (node.proportionWeighted && !node.proportion) {
                    node.proportion = node.proportionWeighted;
                }
                if(tree.leftChild[index] > 0){
                    node.feature = data.featureNames[tree.feature[index]];
                    node.threshold = tree.threshold[index];
                }
                if(tree.probas){
                    node.probabilities = tree.probas[index];
                    if (tree.targetClassesProportions) {
                        node.targetClassesProportions = tree.targetClassesProportions[index];
                    }
                } else {
                    node.predict = tree.predict[index];
                }
                return node;
            };

            //build a (recursive) tree from the data, which will be used to display the graph
            var treeify = function(data, index){
                var index = typeof index !== 'undefined' ?  index : 0;
                var maxSamples = data.tree.nSamples ? data.tree.nSamples[0] : null;
                var maxSamplesWeighted = data.tree.nSamplesWeighted ? data.tree.nSamplesWeighted[0] : null;
                var result = nodify(data, index, maxSamples, maxSamplesWeighted);
                if(data.tree.leftChild[index] > 0){
                    var left = treeify(data, data.tree.leftChild[index]);
                    left.isLeftChild = true;
                    var right = treeify(data, data.tree.rightChild[index]);
                    right.isLeftChild = false;
                    result.children = [left, right];
                }
                return result;
            };

            var collapse = function(d, height) {
                if (d.children) {
                    if(height == 0){
                        d._children = d.children;
                        d._children.forEach( function(node){ collapse(node, 0); } );
                        d.children = null;
                    } else {
                        d.children.forEach(function(node){ collapse(node, height - 1); });
                    }
                }
            };

            const splitDescription = function(feature, threshold, isTrue){
                const result = {};
                const featureElements = FeatureNameUtils.getAsTextElements(feature);
                if (featureElements.type == "countvec") {
                    let level = featureElements.value;
                    if(level == ""){
                        level = 'empty';
                    }
                    result.left = featureElements.feature + " contains " + level;
                    result.right = threshold.toFixed(2) + " times";
                    result.operator = isTrue ? ' \u2264 ' : ' > ';
                } else if (featureElements.type == "tfidfvec") {
                    let level = featureElements.rawValue;
                    if(level == ""){
                        level = 'empty';
                    }
                    result.left = featureElements.feature + ": tfidf of " + level;
                    result.right = threshold.toFixed(2);
                    result.operator = isTrue ? ' \u2264 ' : ' > ';
                } else if(featureElements.value != null){
                    let level = featureElements.value;
                    if(level == ""){
                        level = 'empty';
                    }
                    result.left = featureElements.feature;
                    result.right = level;
                    if (featureElements.type === "hashing" && threshold < 0) {
                        // Categorical hashing adds a number of columns to the dataset. For each sample, the categorical
                        // feature is hashed to an int value between 0 and n_features-1; this hash value is used to select
                        // one of the additional column. A non null value is put in this column only: +1 is the feature
                        // hashes to + the hash value, -1 if the feature hashes to - the hash value. In the current case
                        // (threshold is -0.5), the tree splits the samples hashing to - the hash value (put in the left
                        // child node) and those not hashing to - the hash value (the right child node). In the else loop
                        // below (threshold is 0.5), the split separates the samples hashing to + the hash value (in the
                        // right node) to those not hashing to it.
                        result.operator = isTrue ? featureElements.operator : featureElements.no_operator;
                        result.right = "-" + result.right;
                    } else {
                        //note : for dummies, split will always have 0 on the left, ie when isTrue=true
                        result.operator = isTrue? featureElements.no_operator : featureElements.operator;
                    }
                } else {
                    result.left = featureElements.feature;
                    result.right = threshold.toFixed(2);
                    result.operator = isTrue ? ' \u2264 ' : ' > ';
                }
                return result;
            };

            //given a node and the child the function was called from, builds the breadcrumb element which
            //gave the decision leading to this child
            var buildBreadcrumb = function(node, from){
                var isTrue = node.children[0] == from;
                var bcElem = {rule : splitDescription(node.feature, node.threshold, isTrue)};
                if(node.parent){
                     var bc = buildBreadcrumb(node.parent, node);
                     bc.push(bcElem);
                     return bc;
                } else {
                    return [bcElem];
                }
            };

            //given a node, builds the breadcrumb of decision rules leading to this node
            var updateBreadcrumb = function(from){
                if(from.parent){
                var bc = buildBreadcrumb(from.parent, from);
                    $scope.breadcrumb = bc;
                } else {
                    $scope.breadcrumb = [];
                }
            }

            var expandAll = function(node, shouldUpdate){
                if(node._children){
                    node.children = node._children;
                    node._children = null;
                }
                if(node.children){
                    expandAll(node.children[0], false);
                    expandAll(node.children[1], false);
                }
                if(shouldUpdate){
                    update(node);
                }
            };

            $scope.expandAll = function(){ expandAll(root, true);};

            $scope.reset = function(){
                collapse(root, 3);
                update(root, true);
            };

            //get the data and do any dependent calculations
            $scope.$watch('data', function(){
                if($scope.data){
                    root = treeify($scope.data);
                    createNodeColor(root);
                    createGradients(root);
                    root.x0 = width/2;
                    root.y0 = 0;
                    collapse(root, 3);
                    updateNodeInformation(root, false);
                    update(root);

                    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
                    $scope.puppeteerHook_elementContentLoaded = true;
                }
            });


            computeDimensions();

            //recompute the layout whenever window is resized
            d3.select(window).on("resize.dtc", function(){update();});

            var update = function(source, noAnimation) {

              var actualDuration = (noAnimation || ($scope.disableTransitions)) ? 0 : duration;

              computeDimensions();

              // Compute the new tree layout.
              var nodes = tree.nodes(root).reverse();
              var links = tree.links(nodes);

              var levelWidth = 10;

              // Normalize for fixed-depth.
              nodes.forEach(function(d) { d.y = d.depth * nodeIntervalHeight; });

              // Update the nodes…
              var node = svg.selectAll("g.node")
                  .data(nodes, function(d) { return d.id || (d.id = ++i); });

              // Enter any new nodes at the parent's previous position.
              var nodeEnter = node.enter().append("g")
                  .attr("class", "node")
                  .attr("transform", function(d) { return "translate(" + source.x0 + "," + source.y0 + ")"; })
                  .style("cursor", function(d){
                    if(d._children || d.children){
                        return "pointer";
                    } else {
                        return "default";
                    }
                  })
                  .on("click", click)
                  .on("mouseover", function(d){
                    updateNodeInformation(d, true);
                  });

              nodeEnter.append("rect")
                  .attr("width", "1px")
                  .attr("height", "1px")
                  .style("fill", function(d) {
                    return nodeColor(d.probabilities ? d.probabilities: d.predict);
                  });

              node.selectAll("text").remove();
              node.selectAll("rect.tree-text-backdrop").remove();
              node.selectAll("rect.edge-fade").remove();

              node.append("text")
                 .text(function(d) {
                     if(d.children){
                        var desc = splitDescription(d.feature, d.threshold, false);
                        return desc.left + " " + desc.operator + " " + desc.right;
                     } else {
                        return "";
                     }
                   })
                  .attr("text-anchor", function(d) { return d.children || d._children ? "middle" : "middle"; })
                  .attr("x", function(d){return d.children? 60: 15;})
                  .attr("y", function(d){return d.children? 80: 45;})
                  .call(function(selection){selection.each(function(d){d.bbox = this.getBBox();});});

              node.insert("rect", "text").classed("tree-text-backdrop", true)
                  .attr("x", function(d){return d.bbox.x; })
                  .attr("y", function(d){return d.bbox.y; })
                  .attr("width", function(d){return d.bbox.width;})
                  .attr("height", function(d){return d.bbox.height;})
                  .style("fill", "rgba(255,255,255,0.7)");

              node.filter(function(d){return d._children; })
                          .append("rect").classed("edge-fade", true)
                          //.attr("x", function(d){ return d.bbox.x;})
                          //.attr("y", function(d){ return d.bbox.y - 3;})
                          .attr("x", function(d){ return squareSize/2 - linkWidth(d.proportion)/2;})
                          .attr("y", function(d){ return squareSize;})
                          .attr("width", function(d){ return linkWidth(d.proportion); })
                          .attr("height", 20)
                          .style("fill", function(d){ return "url(#gradient-" + nodeColor(d.probabilities || d.predict) + ")"; })

              // Transition nodes to their new position.
              var nodeUpdate = node.transition()
                  .duration(actualDuration)
                  .attr("transform", function(d) { return "translate(" + (d.x - squareSize / 2.0) +
                  "," + (d.y - squareSize / 2) + ")"; });

              nodeUpdate.select("rect")
                  .attr("width", "30px")
                  .attr("height", "30px");
                 // .style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

              nodeUpdate.select("text")
                  .style("fill-opacity", 1);

              // Transition exiting nodes to the parent's new position.
              var nodeExit = node.exit().transition()
                  .duration(actualDuration)
                  .attr("transform", function(d) { return "translate(" + source.x + "," + source.y + ")"; })
                  .remove();

              nodeExit.select("rect")
                  .attr("width", "1px")
                  .attr("height", "1px");

              nodeExit.select("text")
                  .style("fill-opacity", 1e-6);

              // Update the links…
              var link = svg.selectAll("path.link")
                  .data(links, function(d) { return d.target.id; });

              // Enter any new links at the parent's previous position.
              var linkEnter = link.enter().insert("path", "g")
                  .attr("class", "link")
                  .attr("d", function(d) {
                    var o = {x: source.x0, y: source.y0};
                    return diagonal({source: o, target: o});
                  })
                  .style("fill", "none")
                  .style("stroke", function(d){
                    return nodeColor(d.target.probabilities ? d.target.probabilities: d.target.predict);
                  })
                  .style("stroke-width", function(d){ return linkWidth(d.target.proportion);});

              // Transition links to their new position.
              link.transition()
                  .duration(actualDuration)
                  .attr("d", function(d){
                        var parentWidth = linkWidth(d.source.proportion);
                        var width = linkWidth(d.target.proportion);
                        var dy;
                        if(d.target.isLeftChild){
                            dy = (width - parentWidth) / 2;
                        } else {
                            dy = (parentWidth - width)/ 2;
                        }
                        var src = {x: d.source.x + dy, y: d.source.y};
                        var coords = {source: src, target: d.target};
                        return diagonal(coords);
                  });

              // Transition exiting nodes to the parent's new position.
              link.exit().transition()
                  .duration(actualDuration)
                  .attr("d", function(d) {
                    var o = {x: source.x, y: source.y};
                    return diagonal({source: o, target: o});
                  })
                  .remove();

              // Stash the old positions for transition.
              nodes.forEach(function(d) {
                d.x0 = d.x;
                d.y0 = d.y;
              });

            }

            // Toggle children on click.
            function click(d) {
              if (d.children) {
                d._children = d.children;
                d.children = null;
              } else {
                d.children = d._children;
                d._children = null;
              }
              update(d);
            }

           $scope.$on('$destroy', function(){
                d3.select(window).on('resize.dtc', null);
           });

        }
    };
});

})();
