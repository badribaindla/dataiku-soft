(function(){
'use strict';

var app = angular.module('dataiku.datasets.foreign', []);

app.controller("ForeignDatasetCommonController", function($rootScope, $injector, $scope, $stateParams, DataikuAPI, WT1, TopNav, $state, DatasetsService, $timeout, GlobalProjectActions, DatasetUtils, DatasetCustomFieldsService, CreateModalFromTemplate) {
    TopNav.setItem(TopNav.ITEM_DATASET, $stateParams.datasetFullName);
    var loc = DatasetUtils.getLocFromFull($stateParams.datasetFullName);

    $scope.datasetLoc = loc;

    $scope.createAndPin = function(datasetSmartName) {
        var insight = {
            projectKey: $stateParams.projectKey,
            type: 'dataset_table',
            params: { datasetSmartName: datasetSmartName },
            name: datasetSmartName
        };
        CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insight-modal.html", $scope, "CreateAndPinInsightModalController", function(newScope) {
            newScope.init(insight);
        });
    };

    DataikuAPI.datasets.getFullInfo($stateParams.projectKey, loc.projectKey, loc.name).success(function(data){
        //$scope.dataset = data; // Ugly must go
        $scope.datasetFullInfo = data;

        TopNav.setItem(TopNav.ITEM_DATASET, $stateParams.datasetFullName, {
            datasetType : data.dataset.type,
            name : $stateParams.datasetFullName,
            customFields: data.dataset.customFields,
            customFieldsPreview: DatasetCustomFieldsService.buildCustomFieldsPreviews(data.dataset.customFields)
        });
        $scope.editableDataset = $scope.datasetFullInfo.type == 'Inline';
    }).error(function(){
        setErrorInScope.apply($scope, arguments);
    });

    $scope.newAnalysis = function(){
        GlobalProjectActions.smartNewAnalysis($scope, $stateParams.datasetFullName);
    };

    $rootScope.$on('customFieldsSaved', function(event, item, customFields) {
        if (TopNav.sameItem(item, TopNav.getItem())) {
            let newItem = TopNav.getItem();
            newItem.data.customFields = customFields;
            newItem.data.customFieldsPreview = DatasetCustomFieldsService.buildCustomFieldsPreviews(customFields);
        }
    });
});

app.directive("foreignDatasetExplore", function($timeout, $q, Assert, DataikuAPI, WT1, TopNav, DatasetErrorCta, DatasetUtils, GraphZoomTrackerService) {
    return {
        scope: true,
        controller: function ($scope, $stateParams, $state) {
            var loc = DatasetUtils.getLocFromFull($stateParams.datasetFullName);

            /* ********************* Callbacks for shakerExploreBase ******************* */
            $scope.shakerHooks.saveForAuto = function() {
                var deferred = $q.defer();
                resetErrorInScope($scope);
                var shakerData = $scope.getShakerData();

                DataikuAPI.explores.saveScript($stateParams.projectKey, $stateParams.datasetFullName,
                    shakerData).success(function(data){
                    $scope.originalShaker = shakerData;
                    deferred.resolve();
                }).error(setErrorInScope.bind($scope));
                return deferred.promise;
            };


            /* ********************* Main ******************* */

            // Set base context and call baseInit
            Assert.inScope($scope, 'shakerHooks');

            TopNav.setLocation(TopNav.TOP_FLOW, 'datasets', TopNav.TABS_DATASET, "explore")
            GraphZoomTrackerService.setFocusItemByFullName("dataset", $stateParams.datasetFullName);

            $scope.table = null;
            $scope.scriptId = "__pristine__";
            $scope.shakerWritable = false;
            $scope.shakerReadOnlyActions = true;
            $scope.inputDatasetProjectKey = loc.projectKey;
            $scope.inputDatasetName = loc.name;
            $scope.inputDatasetSmartName = $stateParams.datasetFullName;

            WT1.event("shaker-explore-open");

            //For datasetErrorCTA directive (CTA in case of error while loading dataset sample)

            $scope.updateUiState = DatasetErrorCta.getupdateUiStateFunc($scope);

            $scope.$watch("datasetFullInfo", _ => $scope.updateUiState($scope.shakerState.runError), true);
            $scope.$watch("shakerState", _ => $scope.updateUiState($scope.shakerState.runError), true);
            $scope.$watch("table", _ => $scope.updateUiState($scope.shakerState.runError));

            // Load shaker, set the necessary stuff in scope and call the initial refresh
            DataikuAPI.explores.getScript($stateParams.projectKey, $stateParams.datasetFullName, $scope.scriptId).success(function(shaker) {
                $scope.shaker = shaker;
                $scope.shaker.origin = "DATASET_EXPLORE";
                $scope.shakerState.filtersExplicitlyAllowed = true;

                $scope.fixupShaker();
                $scope.requestedSampleId = null;
                $scope.refreshTable(false);

            }).error(setErrorInScope.bind($scope));
            // $scope.baseInit();

            $timeout(function() { $scope.$broadcast("tabSelect", "Filters") });

            // Load stuff for "edit last analysis"
            DataikuAPI.analysis.listOnDataset($stateParams.projectKey, $stateParams.datasetFullName).success(function(data) {
                data.sort(function(a, b) {
                    return b.lastModifiedOn - a.lastModifiedOn;
                });
                if (data.length) {
                    $scope.lastAnalysis = data[0];
                }
            }).error(setErrorInScope.bind($scope));
        }
    }
});

})();
