(function(){
'use strict';

var app = angular.module('dataiku.analysis.mlcore',['dataiku.ml.core', 'dataiku.ml.report']);

app.factory("MLTasksNavService", function($state, $stateParams, Fn, Assert, localStorageService) {
    /** Choose to which ml task to go based on the list */
    const ret  = {
        getActiveMLTaskId: (analysisId) => localStorageService.get("analysis." + analysisId + ".activeMLTask"),
        setMlTaskIdToGo: function(analysisId, mlTaskId) {
            return localStorageService.set("analysis." + analysisId + ".activeMLTask", mlTaskId);
        },
        mlTaskIdToGo: function(analysisMLTasks, analysisId) {
            Assert.trueish(analysisMLTasks.length, "No ML task");
            var goTo = ret.getActiveMLTaskId(analysisId);
            if (!goTo || !analysisMLTasks.some(Fn(Fn.prop('mlTaskId'), Fn.eq(goTo)))) {
                goTo = analysisMLTasks[0].mlTaskId;
            }
            Assert.trueish(goTo, "No ML task to go to");
            return goTo;
        },
        link: Fn.dict({ PREDICTION: 'predmltask', CLUSTERING: 'clustmltask' }, false),
        goToCorrectMLTask: function(analysisMLTasks, analysisId) {
            var goTo = ret.mlTaskIdToGo(analysisMLTasks, analysisId),
                mlTask = analysisMLTasks.filter(Fn(Fn.prop('mlTaskId'), Fn.eq(goTo)))[0],
                link = mlTask && ret.link(mlTask.taskType);
            Assert.trueish(link, "cannot resolve ML task link from taskType");
            $state.go("projects.project.analyses.analysis.ml." + link + ".list.results", {
                    projectKey: $stateParams.projectKey,
                    analysisId: $stateParams.analysisId,
                    mlTaskId: goTo
                }, {location: "replace"});
        }
    };
    return ret;
});


/**
 * The MLTasks list page. We only stay on this page if there is no ML task yet
 */
app.controller("AnalysisMLTasksController", function($scope, DataikuAPI, $q, CreateModalFromTemplate, $state, $stateParams, TopNav, MLTasksNavService){
    TopNav.setLocation(TopNav.TOP_ANALYSES, null, TopNav.TABS_ANALYSIS, "models");
    TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId);

    DataikuAPI.analysis.getCore($stateParams.projectKey, $stateParams.analysisId).success(function(data) {
        $scope.analysisCoreParams = data;
        TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId,
            {name: data.name, inputDatasetSmartName: data.inputDatasetSmartName});
        TopNav.setPageTitle(data.name + " - Analysis");

        DataikuAPI.analysis.listMLTasks($stateParams.projectKey, $stateParams.analysisId).success(function(data){
            $scope.analysisMLTasks = data;
            if ($scope.analysisMLTasks.length) {
                MLTasksNavService.goToCorrectMLTask($scope.analysisMLTasks, $stateParams.analysisId);
            }
        });
    }).error(setErrorInScope.bind($scope));

    $scope.createNewMLTask = CreateModalFromTemplate.bind(null,
        "/templates/analysis/new-mltask-modal.html", $scope, "AnalysisNewMLTaskController");
});

app.directive('iframeOnload', [function () {
    return {
        scope: {
            callBack: '&iframeOnload'
        },
        link: function (scope, element, attrs) {
            element.on('load', function () {
                scope.$apply(function () {
                    scope.callBack();
                });
            })
        }
    }
}]);


app.controller("AnalysisNewMLTaskController", function($scope, $rootScope, $controller, $state, $location, $timeout, DataikuAPI){
    $controller("DatasetLabController", { $scope: $scope });
    $scope.datasetSmartName = $scope.analysisCoreParams.inputDatasetSmartName;

    // Override default template creation functions in order to reuse the current Analysis instead of creating new one.
    $scope.createPredictionTemplate = function(policyId = $scope.predictionTaskData.selectedPolicy.id) {
        const taskData = $scope.predictionTaskData;

        DataikuAPI.analysis.pml.createAndGuess(
            $scope.analysisCoreParams.projectKey,
            $scope.analysisCoreParams.id,
            taskData.targetVariable,
            taskData.backendType,
            taskData.backendName,
            policyId
        ).success(data => {
            $rootScope.mlTaskJustCreated = true;
            if (policyId === 'DEEP') {
                $state.go('projects.project.analyses.analysis.ml.predmltask.list.design', { mlTaskId: data.id });
                $timeout(() => $location.hash('keras-build'));
            } else if (policyId === 'ALGORITHMS' || policyId === 'CUSTOM') {
                $state.go('projects.project.analyses.analysis.ml.predmltask.list.design', { mlTaskId: data.id });
                $timeout(() => $location.hash('algorithms.sessions'));
            } else {
                $state.go('projects.project.analyses.analysis.ml.predmltask.list.results', { mlTaskId: data.id });
            }
        }).error(setErrorInScope.bind($scope));
    };

    $scope.createClusteringTemplate = function() {
        DataikuAPI.analysis.cml.createAndGuess(
            $scope.analysisCoreParams.projectKey,
            $scope.analysisCoreParams.id,
            $scope.clusteringTaskData.backendType,
            $scope.clusteringTaskData.backendName,
            $scope.clusteringTaskData.selectedPolicy.id
        ).success(data => {
            $rootScope.mlTaskJustCreated = true;
            if ($scope.clusteringTaskData.selectedPolicy.id  === 'ALGORITHMS' || $scope.clusteringTaskData.selectedPolicy.id === 'CUSTOM') {
                $state.go("projects.project.analyses.analysis.ml.clustmltask.list.design", { mlTaskId: data.id });
                $timeout(() => $location.hash('algorithms.sessions'));
            } else {
                $state.go("projects.project.analyses.analysis.ml.clustmltask.list.results", { mlTaskId: data.id });
            }
        }).error(setErrorInScope.bind($scope));
    };
});
})();
