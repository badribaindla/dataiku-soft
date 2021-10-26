(function() {
'use strict';

const app = angular.module('dataiku.bundles.automation',[]);


app.controller("AutomationBundleDetailsModalController", function($scope, $stateParams, Assert, DataikuAPI) {
    $scope.uiState = {
        activeTab : "content"
    };

    // We don't have access to the original git on the automation node, and don't store a per-commit diff in the bundle's changelog.json
    $scope.noCommitDiff = true;

    function fetch() {
        Assert.inScope($scope, 'bundleId');
        DataikuAPI.projects.automation.getBundleDetails($stateParams.projectKey, $scope.bundleId).success(function(data) {
            $scope.bundleDetails = data;
        }).error(setErrorInScope.bind($scope))
    }

    $scope.$watch("bundleId", function(nv, ov) {
        if (!nv) return;
        fetch();
    });

    $scope.modalActivate = function() {
        Assert.inScope($scope, 'bundleId');
        $scope.startActivate($scope.bundleId);
        $scope.dismiss();
    };

    $scope.modalPreload = function() {
        Assert.inScope($scope, 'bundleId');
        $scope.preloadBundle($scope.bundleId);
        $scope.dismiss();
    };
});


app.controller("AutomationBundlesSettingsController", function($scope, $stateParams, Assert, DataikuAPI, $state, TopNav, ActivityIndicator, AutomationUtils) {
    TopNav.setLocation(TopNav.TOP_HOME, "bundlesautomation", TopNav.TABS_NONE, "settings");
    TopNav.setNoItem();

    $scope.uiState = {
        settingsPane: 'connections'
    };
    $scope.AutomationUtils = AutomationUtils;

    var savedSettings;
    $scope.dirtySettings = function() {
        return !angular.equals($scope.settings, savedSettings);
    };
    checkChangesBeforeLeaving($scope, $scope.dirtySettings);

    function load() {
        DataikuAPI.projects.automation.getBundleActivationSettingsExt($stateParams.projectKey).success(function(data) {
            $scope.settings = data.settings;
            $scope.availableConnections = data.availableConnections;
            $scope.usedByLastBundle = data.usedByLastBundle;
            savedSettings = angular.copy($scope.settings);
            updateConnectionsCoverage();
        }).error(setErrorInScope.bind($scope));
    }

    $scope.$watch("settings.remapping.connections", updateConnectionsCoverage, true);

    function updateConnectionsCoverage() {
        if(!$scope.usedByLastBundle) {
            return;
        }
        $scope.typeAheadValues = [];
        $scope.usedByLastBundle.forEach(function(connection) {
            var mapped = $scope.settings.remapping.connections.filter(function(v) { return v.source === connection.name; });
            var original = $scope.availableConnections.filter(function(v) { return v.name === connection.name; });
            if (mapped.length) {
                connection.mapsTo = $scope.availableConnections.filter(function(v) { return v.name === mapped[0].target; })[0];
                connection.clickable = false;
            } else if (original.length) {
                connection.mapsTo = original[0];
                connection.clickable = true;
                $scope.typeAheadValues.push(connection.name);
            } else {
                connection.mapsTo = null;
                connection.clickable = true;
                $scope.typeAheadValues.push(connection.name);
            }
        });
    }

    $scope.addConnectionRemapping = function(name) {
        Assert.inScope($scope, 'settings');
        $scope.settings.remapping.connections.push({
            source: name,
            target: null
        });
    };

    $scope.save = function() {
        DataikuAPI.projects.automation.saveBundleActivationSettings($stateParams.projectKey, $scope.settings).success(function(data) {
            ActivityIndicator.success("Saved");
            savedSettings = angular.copy($scope.settings);
        }).error(setErrorInScope.bind($scope));
    };

    load();
});


app.controller("AutomationBundlesListController", function($scope, $controller, $stateParams, DataikuAPI, Dialogs, $state, $q, TopNav, Fn, CreateModalFromTemplate, FutureProgressModal) {
    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});

    TopNav.setLocation(TopNav.TOP_HOME, "bundlesautomation", TopNav.TABS_NONE, "list");
    TopNav.setNoItem();

    $scope.noTags = true;
    $scope.noWatch = true;
    $scope.noStar = true;
    $scope.sortBy = [
        {label: 'Imported On', value: 'importState.importedOn'},
        {label: 'Exported On', value: 'exportManifest.exportUserInfo.exportedOn'},
        {label: 'Name', value: 'bundleId'},
    ];
    $scope.sortCookieKey = 'bundlesautomation';
    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
        },
        filterParams: {userQueryTargets: "bundleId"},
        orderQuery: 'importState.importedOn',
        orderReversed: false,
    }, $scope.selection || {});
    $scope.noTags = true;
    $scope.maxItems = 20;

    $scope.list = function() {
        DataikuAPI.projects.automation.listBundles($stateParams.projectKey).success(function(data) {
            $scope.listItems = data.bundles;
            $scope.$broadcast('clearMultiSelect');
        }).error(setErrorInScope.bind($scope));
    };

    $scope.list();

    $scope.goToItem = function(data) {
        $scope.showBundleDetails(data);
    };

    $scope.showBundleDetails = function(data) {
        CreateModalFromTemplate("/templates/bundles/automation/details-modal.html", $scope, null, function(modalScope) {
            modalScope.bundleId = data.bundleId;
            modalScope.$apply();
        });
    };

    $scope.importBundle = function() {
        CreateModalFromTemplate("/templates/bundles/automation/import-bundle-modal.html", $scope);
    };

    $scope.startActivate = function(bundleId) {
        DataikuAPI.projects.automation.checkBundleActivation($stateParams.projectKey, bundleId).success(function(data) {
            CreateModalFromTemplate("/templates/bundles/automation/activation-check-result.html", $scope, null, function(modalScope) {
                modalScope.checkResult = data;
            })
        }).error(setErrorInScope.bind($scope));
    };

    $scope.preloadBundle = function(bundleId) {
        DataikuAPI.projects.automation.preloadBundle($stateParams.projectKey, bundleId).success(function(data) {
            FutureProgressModal.show($scope, data, "Preloading bundle").then(function(preloadResult) {
                if (preloadResult.anyMessage) {
                    Dialogs.infoMessagesDisplayOnly($scope, "Preload report", preloadResult, preloadResult.futureLog);
                }
                $scope.list() // TODO do we really need this?
                $scope.refreshProjectData();
            });
        }).error(setErrorInScope.bind($scope));
    };

    $scope.deleteBundle = function(bundle) {
        Dialogs.confirmSimple($scope, "Delete bundle <strong>" + bundle.bundleId +"</strong>?").then(function() {
            DataikuAPI.projects.automation.deleteBundle($stateParams.projectKey, bundle.bundleId)
                .success($scope.list.bind(null))
                .error(setErrorInScope.bind($scope));
        });
    };

    $scope.deleteSelected = function() {
        if ($scope.selection.none) {
            return;
        } else if ($scope.selection.single) {
            $scope.deleteBundle($scope.selection.selectedObject);
        } else {
            Dialogs.confirm($scope, "Confirm deletion", "Are you sure you want to delete the selected bundles?").then(function() {
                $q.all($scope.selection.selectedObjects.map(Fn.prop('bundleId'))
                    .map(DataikuAPI.projects.automation.deleteBundle.bind(null, $stateParams.projectKey))
                ).then($scope.list.bind(null), setErrorInScope.bind($scope));
            });
        }
    };
});


app.controller("AutomationBundleNewProjectModalController", function($scope, $stateParams, $state, Assert, DataikuAPI, ProjectFolderContext) {
    $scope.newProject = {}

    $scope.create = function() {
        Assert.trueish($scope.newProject.file, "No file for new project");
        DataikuAPI.projects.automation.createWithInitialBundle($scope.newProject.file, ProjectFolderContext.getCurrentProjectFolderId()).then(function(data) {
            $scope.dismiss();
            $state.go("projects.project.home.regular", {projectKey: JSON.parse(data).projectKey});
        }, function(payload) {
            setErrorInScope.bind($scope)(JSON.parse(payload.response), payload.status, function(h) {return payload.getResponseHeader(h)});
        });
    };
});


app.controller("AutomationBundleImportBundleModalController", function($scope, $stateParams, Assert, DataikuAPI) {
    $scope.newBundleImport = {}

    $scope.newBundle = {}

    $scope.import = function() {
        Assert.trueish($scope.newBundle.file, "No file for new bundle");
        DataikuAPI.projects.automation.importBundle($stateParams.projectKey, $scope.newBundle.file).then(function(data) {
            $scope.$parent.$parent.list();
            $scope.dismiss();
        }, function(payload) {
            setErrorInScope.bind($scope)(JSON.parse(payload.response), payload.status, function(h) {return payload.getResponseHeader(h)});
        });
    }
});


app.controller("AutomationBundleCheckResultModalController", function($scope, DataikuAPI, $state, $stateParams, Assert, FutureProgressModal, Dialogs, DKUConstants) {
    $scope.doActivate = function() {
        Assert.inScope($scope, 'checkResult');
        DataikuAPI.projects.automation.activateBundle($stateParams.projectKey, $scope.checkResult.bundleId).success(function(data) {
            var parentScope = $scope.$parent.$parent; // Ugly

            $scope.dismiss();

            FutureProgressModal.show(parentScope, data, "Activating bundle").then(function(activateResult) {
                if (activateResult.anyMessage) {
                    Dialogs.infoMessagesDisplayOnly(parentScope, "Activation report", activateResult);
                }
                parentScope.list() // TODO do we really need this?
                parentScope.refreshProjectData();
            });
        }).error(setErrorInScope.bind($scope));
    };
});

})();