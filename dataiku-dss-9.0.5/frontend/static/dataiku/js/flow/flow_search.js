(function() {
'use strict';

/**
* Search function in main flow
*/

var app = angular.module('dataiku.flow.project');


app.directive('flowSearchPopover', function($stateParams, $rootScope, ContextualMenu, ListFilter, DataikuAPI, StateUtils, FlowGraphSelection) {
    return {
        restrict : 'A',
        scope : true,
        templateUrl : '/templates/flow-editor/search-popover.html',

        link : function($scope, element, attrs) {
            /************************** SHOW / Hide logic ******************* */

            function hide() {
                //$scope.removeHighlights();
                element.hide();
                $("html").unbind("click", hide);
                shown=false;
                $scope.shown = false;
            };

            function show() {
                shown = true;
                $scope.shown = true;
                $(".flow-search-popover", element).css("left", $("#flow-search-input input").offset().left);
                $(element).show();
                element.off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    // Let "a" flow
                    if ($(e.target).parents(".directlink").length) return;
                    e.stopPropagation();
                });
                $("#flow-search-input").off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    e.stopPropagation();
                });
                window.setTimeout(function() { $("html").on("click.dku-pop-over", hide); }, 0);
            }

            $scope.pommef = function() {
                $("#flow-search-input").focus();
            };

            $scope.hidePopover = function() {
                if (shown) {
                    hide();
                }
            };

            var shown = false;
            $(element).hide();

            $scope.$on("$destroy", function() {
                $("html").off("click.dku-pop-over", hide);
            })
            $scope.$watch("flowSearch.pattern", function(nv, ov) {
                if (shown && (!nv || nv.length === 0)) {
                    hide();
                }
                if (!shown && nv && nv.length > 0) {
                    show();
                }
            });
            $("#flow-search-input input").on("focus", function() {
                if (!shown && $scope.flowSearch && $scope.flowSearch.pattern.length) {
                    show();
                }
            });

            /************************** Execution ******************* */

            $scope.$watch("flowSearch.pattern", function() {
                $scope.onFlowSearchQueryChange();
            });

            var extraneous = [];
            var formerPattern;

            function isInZone(node, zoneId) {
                if (!zoneId) {
                    return true;
                }
                return node.id.startsWith(`zone__${zoneId}`)
            }
            const isInOwnerZone = node => node && node.ownerZone && node.ownerZone !== "" && node.id.startsWith('zone') && node.id.startsWith(`zone__${node.ownerZone}__`);
            const getNode = (realId, nodes, zoneId) => {
                let node = nodes[realId];
                if (node) {
                    return node;
                }
                for (let key in nodes) {
                    node = nodes[key];
                    if (node.realId === realId && (!zoneId ? isInOwnerZone(node) : isInZone(node, zoneId))) {
                        return node;
                    }
                }
                return undefined;
            }
            $scope.onFlowSearchQueryChange = function() {
                if (!$scope.flowSearch) return;
                function getDatasets() {
                    if (!filteredDatasets) return [];
                    //First get local datasets
                    var results = ListFilter.filter(filteredDatasets.items, $scope.flowSearch.pattern);
                    $.map(results, function(item) {
                        item.nodeType = 'DATASET';
                        const potentialId = graphVizEscape("dataset_" + item.projectKey + "." + item.name);
                        const foundNode = getNode(potentialId, $scope.nodesGraph.nodes, $stateParams.zoneId);
                        item.id = foundNode ? foundNode.id : potentialId;
                    });
                    results = results.filter(node => isInZone(node, $stateParams.zoneId));
                    // Add foreign datasets
                    results = results.concat(getItemsFromGraph("FOREIGN_DATASET"));
                    return results;
                }

                function getItemsFromGraph(type) {
                    if (!$scope.nodesGraph) return [];
                    var result = [];
                    for (var key in $scope.nodesGraph.nodes) {
                        const node = $scope.nodesGraph.nodes[key];
                        if (node.nodeType.endsWith(type) && isInZone(node, $stateParams.zoneId)) {
                            if (isInOwnerZone(node, $stateParams.zoneId) || node.ownerZone === undefined) {
                                // No ownerZone when the graph does not have zones
                                result.push(node);
                            }
                        }
                    }
                    return ListFilter.filter(result, $scope.flowSearch.pattern);
                }

                if(formerPattern != $scope.flowSearch.pattern) {
                    formerPattern = $scope.flowSearch.pattern;
                    const datasets = getDatasets(),
                        recipes = getItemsFromGraph("RECIPE"),
                        folders = getItemsFromGraph("FOLDER"),
                        models = getItemsFromGraph("MODEL"),
                        zones = getItemsFromGraph("ZONE").map(item => Object.assign(item, {zoneId: item.id.split('_').splice(1).join('')}));
                    $scope.flowSearch.nbDatasets = datasets.length;
                    $scope.flowSearch.nbRecipes = recipes.length;
                    $scope.flowSearch.nbFolders = folders.length;
                    $scope.flowSearch.nbModels = models.length;
                    $scope.flowSearch.items = datasets.concat(recipes).concat(folders).concat(models).concat(zones).sort(function(a,b) {
                        var aIsGood = a.name.startsWith($scope.flowSearch.pattern.toLowerCase())?'0':'1';
                        var bIsGood = b.name.startsWith($scope.flowSearch.pattern.toLowerCase())?'0':'1';
                        return (aIsGood + a.name).localeCompare(bIsGood + b.name);
                    });
                }
                $scope.flowSearch.index = -1;
                $scope.currentlyDisplayedItems = 20;
            };

            $scope.currentlyDisplayedItems = 20;
            $scope.loadMoreItems = function() {
                $scope.currentlyDisplayedItems += 20;
            };

            let filteredDatasets;
            DataikuAPI.datasets.listHeads($stateParams.projectKey, $rootScope.tagFilter || {}, false).success(function(data){
                filteredDatasets = data;
            }).error(setErrorInScope.bind($scope));

            /*************************** Navigation **************** */

            $scope.flowSearchSelectPrevious = function($event) {
                if (!shown || !$scope.flowSearch.items.length) {
                    return;
                }
                $scope.flowSearchSelectIndex(Math.max(0, $scope.flowSearch.index-1));
                if ($event) $event.stopPropagation();
                const el = $("li", element)[$scope.flowSearch.index];
                if (el) {
                    const parent = $("ul", element).parent();
                    ensureVisible(el, parent);
                }
            };

            $scope.flowSearchSelectNext = function($event) {
                if (!shown || !$scope.flowSearch.items.length) {
                    return;
                }
                $scope.flowSearchSelectIndex(Math.min($scope.flowSearch.items.length - 1, $scope.flowSearch.index+1));
                if ($event) $event.stopPropagation();
                const el = $("li", element)[$scope.flowSearch.index];
                if (el) {
                    const parent = $("ul", element).parent();
                    ensureVisible(el, parent);
                }
            };

            $scope.flowSearchSelectIndex = function(index) {
                if (!shown) return;
                if (!$scope.nodesGraph || !$scope.nodesGraph.nodes) return;
                $scope.flowSearch.index = index;
                /* Highlight on selection */
                //$scope.removeHighlights();
                const item = $scope.flowSearch.items[$scope.flowSearch.index]
                const id = item.id;
                FlowGraphSelection.clearSelection($scope.nodesGraph.nodes[id]);
                FlowGraphSelection.onItemClick($scope.nodesGraph.nodes[id], null);
                $scope.zoomGraph(id, item.nodeType=="RECIPE" ? 5 : 3, item); //recipe nodes don't have names, so bbox ends up smaller
            };

            $scope.flowSearchGo = function() {
                if (!shown) return;
                if ($scope.flowSearch.index < 0) {
                    //No match
                    return;
                }
                if($scope.flowSearch.items.length) {
                    var item = $scope.flowSearch.items[$scope.flowSearch.index];
                    if (item.nodeType.endsWith("DATASET")) {
                        StateUtils.go.dataset(item.name, item.projectKey)
                    } else if (item.nodeType.endsWith("RECIPE")) {
                        StateUtils.go.recipe(item.name)
                    } else if (item.nodeType.endsWith("MODEL")) {
                        StateUtils.go.savedModel(item.name, item.projectKey)
                    } else if (item.nodeType.endsWith("EVALUATION_STORE")) {
                        StateUtils.go.modelEvaluationStore(item.name, item.projectKey)
                    } else if (item.nodeType.endsWith("FOLDER")) {
                        StateUtils.go.managedFolder(item.name, item.projectKey)
                    } else {
                        StateUtils.go.dssObject(item.nodeType, item.name)
                    }
                    $scope.flowSearch.pattern = "";
                    hide();
                    $("#flow-search-input").blur();
                }
            };

            $scope.contextMenu = function(idx, $event) {
                var x = $event.pageX;
                var y = $event.pageY;
                var newScope = $scope.$new();
                var item = $scope.flowSearch.items[idx];
                newScope.object = angular.copy(item);
                var menuParams = {
                    scope: newScope,
                    template: "/templates/flow-editor/dataset-contextual-menu.html"
                };
                var menu = new ContextualMenu(menuParams);
                menu.openAtXY(x, y);
            };

            $scope.onFlowSearchQueryChange();
        }
    };
});


})();

