(function() {
'use strict';

const app = angular.module('dataiku.flow.graph');

app.controller("FlowZonesDetailsController", function ($scope, $rootScope, $filter, $state, StateUtils) {
    $scope.StateUtils = StateUtils;
    $scope.getObjectIcon = function(object) {
        switch(object.type) {
            case 'SAVED_MODEL':            return 'icon-machine_learning_regression saved-model';
            case 'MODEL_EVALUATION_STORE': return 'icon-model-evaluation-store';
            case 'MANAGED_FOLDER':         return 'icon-folder-open managed-folder';
            default:                       return $filter('datasetTypeToIcon')(object.type) + ' dataset';
        }
    };

    $scope.getObjectLink = function(object) {
        switch(object.type) {
            case 'SAVED_MODEL':            return StateUtils.href.savedModel(object.id, object.projectKey);
            case 'MODEL_EVALUATION_STORE': return StateUtils.href.modelEvaluationStore(object.id, object.projectKey);
            case 'MANAGED_FOLDER':         return StateUtils.href.managedFolder(object.id, object.projectKey);
            default:                       return StateUtils.href.dataset(object.id);
        }
    };
});

app.directive('zoneRightColumnSummary', function($controller, $rootScope, $state, $stateParams, DataikuAPI, Logger, CreateModalFromTemplate, TaggableObjectsUtils, FlowGraph, ActivityIndicator) {
    return {
        templateUrl: '/templates/zones/right-column-summary.html',

        link: function(scope, element, attrs) {

            $controller('_TaggableObjectsMassActions', {$scope: scope});
            $controller('_TaggableObjectsCapabilities', {$scope: scope});

            scope.$stateParams = $stateParams;

            scope.zoomOnZone = zoneId => {
                $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId }))
            };

            scope.zoomOutOfZone = (id = null) => {
                $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId: null, id}))
            }

            scope.$on("objectSummaryEdited", function() {
                const zone = scope.zoneFullInfo.zone;
                const tor = {type: 'FLOW_ZONE', projectKey: $stateParams.projectKey, id: zone.id};
                DataikuAPI.taggableObjects.getMetadata(tor).success(function(metadata) {
                    metadata.tags = zone.tags;
                    DataikuAPI.taggableObjects.setMetaData(tor, metadata).success(function() {
                        ActivityIndicator.success("Saved");
                    });
                }).error(setErrorInScope.bind(scope));
            });

            scope.editZone = () => {
                CreateModalFromTemplate("/templates/zones/edit-zone-box.html", scope, null, function(newScope){
                    newScope.zoneName = scope.selection.selectedObject.name;
                    newScope.uiState = {
                        stockColors: ["#C82423","#8C2DA7","#31439C","#087ABF","#0F786B","#4B8021","#F9BE40","#C54F00","#D03713","#465A64"],
                        newColor: scope.selection.selectedObject.color,
                        newName: scope.selection.selectedObject.name
                    };

                    newScope.pickStockColor = color => {
                        newScope.uiState.newColor = color;
                    };

                    newScope.go = function(){
                        DataikuAPI.flow.zones.edit($stateParams.projectKey, scope.selection.selectedObject.id, newScope.uiState.newName, newScope.uiState.newColor).success(function () {
                            scope.$emit('reloadGraph');
                            if ($stateParams.zoneId) {
                                $rootScope.$emit("zonesListChanged", newScope.uiState.newName);
                            }
                            newScope.dismiss()
                        }).error(setErrorInScope.bind(newScope));
                    }
                });
            }

            scope.refreshData = function() {
                DataikuAPI.zones.getFullInfo(scope.selection.selectedObject.projectKey, scope.selection.selectedObject.cleanId).success(function(data) {
                    data.zone.cleanId = data.zone.id
                    scope.zoneFullInfo = data;
                    // check that the selection didn't change while getFullInfo was called
                    if (scope.selection.selectedObject && scope.selection.selectedObject.cleanId === data.zone.cleanId) {
                        scope.selection.selectedObject = data.zone;
                        scope.selection.selectedObject.isCollapsed = scope.collapsedZones.find(it => it === data.zone.id) !== undefined;
                    }
                }).error(setErrorInScope.bind(scope));
            };

            scope.deleteZone = () => {
                let items = scope.getSelectedTaggableObjectRefs();
                let success = undefined;
                if ($stateParams.zoneId) {
                    items = [TaggableObjectsUtils.fromNode(scope.nodesGraph.nodes[`zone_${$stateParams.zoneId}`])];
                    success = () => scope.zoomOutOfZone();
                }
                scope.deleteSelected(items, success);
            };

            scope.collapseAllZones = () => {
                const allFlowZones = Object.values(FlowGraph.get().nodes).filter(it => TaggableObjectsUtils.fromNodeType(it.nodeType) === 'FLOW_ZONE');
                scope.toggleZoneCollapse(allFlowZones.map(TaggableObjectsUtils.fromNode), 'collapseAll');
            }

            scope.expandAllZones = () => {
                const allFlowZones = Object.values(FlowGraph.get().nodes).filter(it => TaggableObjectsUtils.fromNodeType(it.nodeType) === 'FLOW_ZONE');
                scope.toggleZoneCollapse(allFlowZones.map(TaggableObjectsUtils.fromNode), 'expandAll');
            }

            scope.$watch("selection.selectedObject",function(nv) {
                if (!scope.selection) scope.selection = {};
                scope.zoneFullInfo = {zone: scope.selection.selectedObject, timeline: {}}; // display temporary (incomplete) data
            });

            scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) return;
                scope.selection.selectedObject.cleanId = scope.selection.selectedObject.id.split('_')[1];
                scope.refreshData();
            });

            const zonesListChangedListener = $rootScope.$on("zonesListChanged", scope.refreshData);
            scope.$on('$destroy',zonesListChangedListener);

        }
    }
});

})();