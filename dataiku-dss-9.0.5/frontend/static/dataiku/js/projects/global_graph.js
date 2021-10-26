(function() {
'use strict';

const app = angular.module('dataiku.projects.directives');


app.directive('projectsFlow', function($rootScope, Logger, $state, $stateParams, $timeout, $q,
        TopNav, CreateModalFromTemplate, DataikuAPI, ContextualMenu, WT1, HistoryService,
        FlowTool, FlowGraph) {
    return {
        restrict: 'EA',
        scope: true,
        controller: function($scope, $element, $rootScope, ProjectFolderContext) {
            $scope.nodesGraph = {};

            $scope.updateGraph = function(zoomTo) {
                DataikuAPI.projects.getGraph($scope.displayMode.flowLayoutEngine, ProjectFolderContext.getCurrentProjectFolderId(), !!$scope.displayMode.recursive).success(function(data) {
                    $scope.nodesGraph = data;
                    data.nodesOnGraphCount = Object.keys(data.nodes).length;
                    FlowGraph.set(data);
                    $scope.nbEoBundles =  0;

                    $scope.isFlowEmpty = data.includedProjects == 0 && data.includedExposedObjectsBundles == 0 && data.includedProjectFolders == 0;

                    for (let k in $scope.nodesGraph.nodes) {
                        if ($scope.nodesGraph.nodes[k].nodeType == 'BUNDLE_EO') $scope.nbEoBundles++;
                    }
                    if (zoomTo) {
                        $timeout(function() {
                            let id = graphVizEscape(zoomTo);
                            $scope.zoomGraph(id);
                            $scope.onItemClick($scope.nodesGraph.nodes[id]);
                        }, 0);
                    } else {
                        $timeout(() => { $scope.reinitGraph(); });
                    }

                    $rootScope.$emit('drawGraph');

                }).error(setErrorInScope.bind($scope));

            };
            $scope.updateGraph();

            $scope.$watch("displayMode", function(nv, ov) {
                if (nv != ov) {
                    $scope.updateGraph();
                }
            }, true);

            $scope.tool = {};
            FlowTool.setCurrent($scope.tool);

            const deregister = $rootScope.$on('reloadGraph', () => { $scope.updateGraph(false); });

            $scope.$on('$destroy', function() {
                deregister();
            });
        },
        link: function(scope, element) {
            scope.onItemDblClick = function(item, evt) {
                let destUrl = "";
                switch (item.nodeType) {
                    case "PROJECT_FOLDER":
                        destUrl = $state.href('project-list', {folderId: item.projectFolderId});
                        break;
                    case "PROJECT":
                        destUrl = $state.href('projects.project.home.regular', {projectKey : item.projectKey});
                        break;
                    case "BUNDLE_EO":
                        destUrl = item.canExposeFromProject ? $state.href('projects.project.security', {
                            projectKey: item.fromProjectKey,
                            selectedTab: 'exposed'
                        }) : '';
                        break;
                }
                fakeClickOnLink(destUrl,evt);
            };
            scope.onContextualMenu = function(item, evt) {
                evt.preventDefault();
            }
        }
    }
});


app.directive('projectRightColumnSummary', function(DataikuAPI) {
    return {
        templateUrl :'/templates/projects/project-right-column-summary.html',
        link: function($scope, element, attrs) {

            function refreshProject() {
                DataikuAPI.projects.getExtended($scope.rightColumnItem.projectKey, false)
                    .success(item => { $scope.project = item; })
                    .error(setErrorInScope.bind($scope));
            }
            $scope.$watch("rightColumnItem", function(nv, ov) {
                if(nv != ov && nv.nodeType == "PROJECT") {
                    refreshProject();
                }
            });
            refreshProject();

        }
    };
});


app.directive('eoBundleRightColumnSummary', function($filter, StateUtils, $state) {
    return {
        templateUrl :'/templates/projects/eo-bundle-right-column-summary.html',
        link: function($scope, element, attrs) {

            $scope.getItemHeaderHref = function(item) {
                return item.canExposeFromProject ? $state.href('projects.project.security', {
                    projectKey: item.fromProjectKey,
                    selectedTab: 'exposed'
                }) : '';
            };

            $scope.goToOriginal = function(node, evt) {
                StateUtils.go.dssObject(node.nodeType, node.id, node.fromProjectKey, {name: node.name});
            };

            $scope.goToForeign = function(node, evt) {
                const fullId = node.fromProjectKey+'.'+node.id;
                StateUtils.go.dssObject(node.nodeType, fullId, node.toProjectKey, {name: node.name});
            };

        }
    };
});

app.directive('projectFolderRightColumnSummary', function($state) {
    return {
        templateUrl: '/templates/projects/project-folder-right-column-summary.html',
        link: function($scope, element, attrs) {

            $scope.folder = $scope.foldersList.find(f => f.id == $scope.rightColumnItem.projectFolderId);
            $scope.$watch("rightColumnItem", function(nv, ov) {
                if(nv != ov && nv.nodeType == "PROJECT_FOLDER") {
                    $scope.folder = $scope.foldersList.find(f => f.id == $scope.rightColumnItem.projectFolderId);
                }
            });

            $scope.getItemHeaderHref = function(item) {
                return $state.href('project-list', {
                    folderId: item.projectFolderId
                });
            };
        }
    };
});

})();