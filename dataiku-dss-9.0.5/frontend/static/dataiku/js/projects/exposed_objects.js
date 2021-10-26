(function(){
'use strict';


const app = angular.module('dataiku.projects.settings');


app.service('ExposedObjectsService', function($rootScope, $stateParams, CreateModalFromTemplate) {

    this.exposeObjects = function(items) {
        return CreateModalFromTemplate("/templates/projects/expose-objects-modal.html", $rootScope, "ExposeObjectsModalController", function(modalScope) {
            modalScope.init(items);
        });
    };

    this.exposeSingleObject = function(objectType, objectId, objectDisplayName, projectKey) {
        if (!projectKey) projectKey = $stateParams.projectKey;
        if (!objectDisplayName) objectDisplayName = objectId;

        return CreateModalFromTemplate("/templates/projects/expose-single-object-modal.html", $rootScope, "ExposeSingleObjectModalController", function(modalScope) {
            modalScope.init(objectType, objectId, objectDisplayName, projectKey);
        });
    };

    this.unshare = function(items) {
        return CreateModalFromTemplate("/templates/projects/unshare-modal.html", $rootScope, "UnshareModalController", function(modalScope) {
            modalScope.init(items);
        });
    };

});


app.controller("ExposeSingleObjectModalController", function($scope, $stateParams, $timeout, DataikuAPI, ActivityIndicator, CatalogItemService) {
    const dashboardsAndInsightsOnlyExposition = ["WEB_APP", "SCENARIO", "JUPYTER_NOTEBOOK", "REPORT"];
    $scope.uiState = {};
    $scope.available = {};

    $scope.init = function(objectType, objectId, objectDisplayName, projectKey) {
        $scope.currentProjectKey = projectKey;
        $scope.objectDisplayName = objectDisplayName;
        $scope.showExpositionInfo = dashboardsAndInsightsOnlyExposition.includes(objectType);

        DataikuAPI.projects.getObjectExposition(projectKey, objectType, objectId).success(function(objectExposition) {
            $scope.objectExposition = objectExposition;
            $scope.projectKeys = {};
            $scope.originalTargetProjects = [];

            if (projectKey) {
                $scope.projectKeys[projectKey] = true;
            }

            objectExposition.rules.forEach(function(rule) {
                $scope.projectKeys[rule.targetProject] = true;
                $scope.originalTargetProjects.push(rule.targetProject);
            });

            $scope.dashboardAuthorized = objectExposition.dashboardAuthorizedModes.indexOf('READ') > -1;
        }).error(setErrorInScope.bind($scope));

        $scope.save = function() {
            DataikuAPI.projects.saveObjectExposition(projectKey, objectType, objectId, $scope.objectExposition)
                .success(function() {
                    function buildLinkToExposedObject(targetProjectKey, objectType, objectId, objectProjectKey) {
                        const href = CatalogItemService.getFlowLink(objectType.toLowerCase(), {id: objectId, projectKey: objectProjectKey}, targetProjectKey);
                        const linkMessage =  `View in ${targetProjectKey} flow`;
                        return `<a href='${href}'>${linkMessage}</a>.`;
                    }
                    const links = "<div>" +
                        $scope.objectExposition.rules
                            .filter(rule => !($scope.originalTargetProjects.includes(rule.targetProject)))
                            .map(rule => buildLinkToExposedObject(rule.targetProject, objectType, objectId, projectKey))
                            .join('<br>')
                        + "</div>";

                    ActivityIndicator.success("Exposed elements updated!" + links, 5000);
                    $scope.resolveModal();
                })
                .error(setErrorInScope.bind($scope));
        };

        $scope.addProject = function(newProject) {
            $scope.objectExposition.rules.push({
                targetProject: newProject.id,
                targetProjectDisplayName: newProject.label,
                appearOnFlow: true
            });

            $scope.projectKeys[newProject.id] = true;
        };

        $scope.removeProject = function(projectKey) {
            const idx = $scope.objectExposition.rules.findIndex(function(rule) {
                return rule.targetProject === projectKey;
            });

            if (idx > -1) {
                $scope.objectExposition.rules.splice(idx, 1);
            }

            delete $scope.projectKeys[projectKey];
        };

        $scope.onDashboardAuthorize = function() {
            if (!$scope.dashboardAuthorized) {
                const idx = $scope.objectExposition.dashboardAuthorizedModes.indexOf('READ');
                if (idx > -1) {
                    $scope.objectExposition.dashboardAuthorizedModes.splice(idx, 1);
                }
            } else {
                $scope.objectExposition.dashboardAuthorizedModes.push('READ');
            }
        };
        $scope.$watch('newProject', function(nv,ov){
            if (nv != ov && !$.isEmptyObject(nv)) {
                $scope.addProject(nv);
                $scope.projectKey = null;
                $timeout(function(){
                    const element = $('.expose-object-modal .project-select');
                    element[0].scrollTop = element.outerHeight();
                });
            }
        });
    };
});


app.controller("ExposeObjectsModalController", function($scope, $stateParams, $timeout, DataikuAPI, TaggableObjectsUtils, ActivityIndicator) {
    $scope.available = {};
    $scope.settings = {
        dashboard: false
    };
    $scope.oldTargetProjects = []
    $scope.newTargetProjects = [];
    $scope.allTargetProjects = {}; //For exclusion in the selector of new projects

    if ($stateParams.projectKey) {
        $scope.allTargetProjects[$stateParams.projectKey] = true;
    }

    $scope.init = function(selectedItems) {
        $scope.selectedItems = selectedItems;
        $scope.itemsType = TaggableObjectsUtils.getCommonType(selectedItems, it => it.type);

        DataikuAPI.projects.getObjectsExpositions(selectedItems).success(function(currentExpositions) {
            $scope.currentExpositions = currentExpositions;
            $.each($scope.currentExpositions.projects, function(projectKey, exp){
                $scope.oldTargetProjects[projectKey] = {exposeAll: false};
                $scope.allTargetProjects[projectKey] = true; //exclude
            });
        }).error(setErrorInScope.bind($scope));

        $scope.save = function() {
            $scope.settings.projects = $.extend({}, $scope.oldTargetProjects);
            $scope.newTargetProjects.forEach(function(p) {
                $scope.settings.projects[p.projectKey] = {projectKey: p.projectKey, exposeAll: true};
            })
            DataikuAPI.projects.addObjectsExpositions(selectedItems, $scope.settings)
                .success(function() {
                    ActivityIndicator.success("Exposed elements updated!");
                    $scope.resolveModal();
                })
                .error(setErrorInScope.bind($scope));
        };

        $scope.addProject = function(newProject) {
            $scope.newTargetProjects.push({
                projectKey: newProject.id,
                appearOnFlow: true,
                label: newProject.label
            });

            $scope.allTargetProjects[newProject.id] = true;
        };

        $scope.removeProject = function(projectKey) {
            const idx = $scope.newTargetProjects.findIndex(x => x.projectKey == projectKey);
            if (idx > -1) {
                $scope.newTargetProjects.splice(idx, 1);
            }
            delete $scope.allTargetProjects[projectKey];
        };

        $scope.$watch('newProject', function(nv,ov){
            if (nv != ov && !$.isEmptyObject(nv)) {
                $scope.addProject(nv);
                $scope.projectKey = null;
                $timeout(function(){
                    const element = $('.expose-object-modal .project-select');
                    element[0].scrollTop = element.outerHeight();
                });
            }
        });
    };
});


app.controller("UnshareModalController", function($scope, $stateParams, DataikuAPI, TaggableObjectsUtils) {

    $scope.init = function(selectedObjects) {
        $scope.selectedObjects = selectedObjects;
        $scope.selectedObjectsType = TaggableObjectsUtils.getCommonType(selectedObjects, it => it.type);

        $scope.ok = function() {
            DataikuAPI.projects.unshare(selectedObjects, $stateParams.projectKey).success(function(data) {
                $scope.resolveModal();
            }).error(setErrorInScope.bind($scope));
        };
    };
});

})();