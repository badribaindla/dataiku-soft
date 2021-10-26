(function() {
'use strict';

var app = angular.module('dataiku.datasets');

app.controller('BuildDatasetController', function($scope, $state, $stateParams, DataikuAPI, PartitionSelection, JobDefinitionComputer) {
    $scope.computeMode = undefined;
    $scope.buildPartitions = {};

    $scope.isBuildingDataset = false;
    $scope.startJob = function() {
        var jd = JobDefinitionComputer.computeJobDefForSingleDataset($stateParams.projectKey, $scope.computeMode, $scope.dataset, $scope.buildPartitions);
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.start(jd).success(function(data) {
            $scope.startedJob = data;
            // This is really a ugly hack ... It's used to dismiss the modal
            // when this controller is called from the
            // build-dataset-box.html template
            if ($scope.dismiss) $scope.dismiss();
            if ($scope.jobStartRedirects) {$state.go('projects.project.jobs.job', {projectKey : $stateParams.projectKey, jobId: data.id})}
            else {$scope.$emit("datasetBuildStarted");}
        }).error((data, status, headers) => {
            setErrorInScope.bind($scope)(data, status, headers)
            $scope.isBuildingDataset = false;
        });
    };

     $scope.startJobPreview = function() {
        var jd = JobDefinitionComputer.computeJobDefForSingleDataset($stateParams.projectKey, $scope.computeMode, $scope.dataset, $scope.buildPartitions);
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.startPreview(jd).success(function(data) {
            $scope.startedJob = data;
            // This is really a ugly hack ... It's used to dismiss the modal
            // when this controller is called from the
            // build-dataset-box.html template
            if ($scope.dismiss) $scope.dismiss();
            $state.go('projects.project.jobs.job', {projectKey : $stateParams.projectKey, jobId: data.id});
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };
});


app.directive('buildModeSelector', function() {
    return {
        restrict:'AE',
        scope: {
            targetType: '=',
            buildMode: '='
        },
        templateUrl: '/templates/datasets/build-mode-selector.html',
        link: function($scope, element, attrs) {

            $scope.$watch('build.mode', function(nv, ov) {
                $scope.buildMode = $scope.build.mode;
            });
            $scope.build = {
                mode: "NON_RECURSIVE_FORCED_BUILD"
            };

            $scope.descriptionDisplayed = { mode : "NON_RECURSIVE_FORCED_BUILD"};

            $scope.chooseNonRecursive = function(){
                $scope.build.mode = "NON_RECURSIVE_FORCED_BUILD";
                $scope.descriptionDisplayed.mode = "NON_RECURSIVE_FORCED_BUILD";
            }
            $scope.chooseRecursive = function(){
                $scope.build.mode = "RECURSIVE_BUILD";
                $scope.descriptionDisplayed.mode = "RECURSIVE_BUILD";
            }

            $scope.buildModes = [
                ["NON_RECURSIVE_FORCED_BUILD", "only this " + $scope.targetType, "DSS will just build this " + $scope.targetType + " even if some required datasets are missing or outdated. This can cause invalid or odd results.", "/static/dataiku/images/BUILD-Only-this-dataset.png"],
                ["RECURSIVE_BUILD", "Smart reconstruction", "Automatically builds datasets that are out-of-date (and their successors). Datasets are out-of-date if their predecessors have changed, or if the recipe building them has changed", "/static/dataiku/images/BUILD-From-outdated-dataset.png"],
                ["RECURSIVE_FORCED_BUILD", "Forced recursive rebuild", "Rebuilds all datasets leading to the selected one, recursively.", "/static/dataiku/images/BUILD-Force-all-upstream.png"],
                ["RECURSIVE_MISSING_ONLY_BUILD", "'Missing' data only", "Only builds datasets (or partitions) that are required but completely missing. Datasets (or partitions) that are present but out-of-date are not rebuilt.", "/static/dataiku/images/BUILD-From-missing-dataset.png"]
            ];

            $scope.recursiveBuildModes = [$scope.buildModes[1], $scope.buildModes[2], $scope.buildModes[3]];
        }
    }
});

app.directive('partitionSelector', function(PartitionSelection) {
    return {
        restrict: 'AE',
        scope: {
            partitioning: '=',
            buildPartitions: '=',
            bemModifier: '=?'
        },
        templateUrl: '/templates/datasets/partition-selector.html',
        link: function ($scope, element, attrs) {
            $scope.$watch('partitioning.dimensions', function(nv, ov){
                $scope.buildPartitions = PartitionSelection.getBuildPartitions($scope.partitioning);
            },true);

            $scope.$watch("buildPartitions", function(nv, ov) {
                if (nv !== ov) {
                    PartitionSelection.saveBuildPartitions($scope.partitioning, $scope.buildPartitions);
                }
            }, true);
        }
    }
});

//Expects in scope: odbId
app.controller('BuildManagedFolderController', function($scope, Assert, DataikuAPI, $state, $stateParams, PartitionSelection, JobDefinitionComputer) {

    $scope.computeMode = undefined;
    $scope.buildPartitions = {};

    $scope.$watch('odbId', function() {
        if (!$scope.odbId) return;
        DataikuAPI.managedfolder.get($stateParams.projectKey, $stateParams.projectKey, $scope.odbId).success(function(data) {
            $scope.odb = data;
        }).error(setErrorInScope.bind($scope));
    });

    $scope.isBuildingDataset = false;
    $scope.startJob = function() {
        Assert.inScope($scope, 'odbId');
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.start(JobDefinitionComputer.computeJobDefForBox($stateParams.projectKey, $scope.computeMode, $scope.odb, $scope.buildPartitions)).success(function(data) {
            $scope.startedJob = data;
            // This is really a ugly hack ... It's used to dismiss the modal
            // when this controller is called from the
            // build-dataset-box.html template
            if ($scope.dismiss) $scope.dismiss();
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };

     $scope.startJobPreview = function() {
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.startPreview(JobDefinitionComputer.computeJobDefForBox($stateParams.projectKey, $scope.computeMode, $scope.odb, $scope.buildPartitions)).success(function(data) {
            $scope.startedJob = data;
            // This is really a ugly hack ... It's used to dismiss the modal
            // when this controller is called from the
            // build-dataset-box.html template
            if ($scope.dismiss) $scope.dismiss();
            $state.go('projects.project.jobs.job', {projectKey : $stateParams.projectKey, jobId: data.id});
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };
})

//Expects in scope: mesId
app.controller('BuildModelEvaluationStoreController', function($scope, Assert, DataikuAPI, $state, $stateParams, PartitionSelection, JobDefinitionComputer) {

    $scope.computeMode = undefined;
    $scope.buildPartitions = {};

    $scope.$watch('mesId', function() {
        if (!$scope.mesId) return;
        DataikuAPI.modelevaluationstores.get($stateParams.projectKey, $scope.mesId).success(function(data) {
            $scope.mes = data;
        }).error(setErrorInScope.bind($scope));
    });

    $scope.isBuildingDataset = false;
    $scope.startJob = function() {
        Assert.inScope($scope, 'mesId');
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.start(JobDefinitionComputer.computeJobDefForModelEvaluationStore($stateParams.projectKey, $scope.computeMode, $scope.mes, $scope.buildPartitions)).success(function(data) {
            $scope.startedJob = data;
            // This is really a ugly hack ... It's used to dismiss the modal
            // when this controller is called from the
            // build-dataset-box.html template
            if ($scope.dismiss) $scope.dismiss();
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };

     $scope.startJobPreview = function() {
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.startPreview(JobDefinitionComputer.computeJobDefForModelEvaluationStore($stateParams.projectKey, $scope.computeMode, $scope.mes, $scope.buildPartitions)).success(function(data) {
            $scope.startedJob = data;
            // This is really a ugly hack ... It's used to dismiss the modal
            // when this controller is called from the
            // build-dataset-box.html template
            if ($scope.dismiss) $scope.dismiss();
            $state.go('projects.project.jobs.job', {projectKey : $stateParams.projectKey, jobId: data.id});
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };
})


//Expects in scope: modelId
app.controller('BuildSavedModelController', function($scope, Assert, DataikuAPI, $state, $stateParams, PartitionSelection, JobDefinitionComputer) {

    $scope.computeMode = undefined;
    $scope.buildPartitions = {};

    $scope.$watch('modelId', function() {
        if (!$scope.modelId) return;
        DataikuAPI.savedmodels.get($stateParams.projectKey, $scope.modelId).success(function(data) {
            $scope.model = data;
        }).error(setErrorInScope.bind($scope));
    });

    $scope.isBuildingDataset = false;
    $scope.startJob = function() {
        Assert.inScope($scope, 'modelId');
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.start(JobDefinitionComputer.computeJobDefForSavedModel($stateParams.projectKey, $scope.computeMode, $scope.model, $scope.buildPartitions)).success(function(data) {
            $scope.startedJob = data;
            // This is really a ugly hack ... It's used to dismiss the modal
            // when this controller is called from the
            // build-dataset-box.html template
            if ($scope.dismiss) $scope.dismiss();
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };

     $scope.startJobPreview = function() {
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.startPreview(JobDefinitionComputer.computeJobDefForSavedModel($stateParams.projectKey, $scope.computeMode, $scope.model, $scope.buildPartitions)).success(function(data) {
            $scope.startedJob = data;
            // This is really a ugly hack ... It's used to dismiss the modal
            // when this controller is called from the
            // build-dataset-box.html template
            if ($scope.dismiss) $scope.dismiss();
            $state.go('projects.project.jobs.job', {projectKey : $stateParams.projectKey, jobId: data.id});
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };
})

//Expects in scope: streamingEndpointId
app.controller('BuildStreamingEndpointController', function($scope, DataikuAPI, $state, $stateParams, JobDefinitionComputer, Assert) {

    $scope.compute = { mode : "NON_RECURSIVE_FORCED_BUILD"};
    $scope.build_partitions = {};

    // $scope.$watch('streamingEndpointId', function() {
    //     if (!$scope.odbId) return;
    //     DataikuAPI.streamingEndpoints.get($stateParams.projectKey, $scope.streamingEndpointId).success(function(data) {
    //         $scope.streamingEndpoint = data;
    //     }).error(setErrorInScope.bind($scope));
    // });

    $scope.buildModes = [
        ["NON_RECURSIVE_FORCED_BUILD", "Build only this streaming endpoint"],
        ["RECURSIVE_BUILD", "Build required datasets and this streaming endpoint"],
        ["RECURSIVE_FORCED_BUILD", "Force-rebuild all dependencies and build the streaming endpoint"],
        ["RECURSIVE_MISSING_ONLY_BUILD", "Build missing dependencies and build the streaming endpoint"]
    ];

    $scope.isBuildingDataset = false;
    $scope.startJob = function() {
        Assert.inScope($scope, 'streamingEndpointId');
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.start(JobDefinitionComputer.computeJobDefForStreamingEndpoint($stateParams.projectKey, $scope.compute.mode, {id:$scope.streamingEndpointId})).success(function(data) {
            $scope.startedJob = data;
            // This is really a ugly hack ... It's used to dismiss the modal
            // when this controller is called from the
            // build-dataset-box.html template
            if ($scope.dismiss) $scope.dismiss();
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };

     $scope.startJobPreview = function() {
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.startPreview(JobDefinitionComputer.computeJobDefForStreamingEndpoint($stateParams.projectKey, $scope.compute.mode, {id:$scope.streamingEndpointId})).success(function(data) {
            $scope.startedJob = data;
            // This is really a ugly hack ... It's used to dismiss the modal
            // when this controller is called from the
            // build-dataset-box.html template
            if ($scope.dismiss) $scope.dismiss();
            $state.go('projects.project.jobs.job', {projectKey : $stateParams.projectKey, jobId: data.id});
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };
})

app.controller('BuildDownstreamController', function ($scope, PartitionSelection, JobDefinitionComputer, DataikuAPI, $stateParams, $state, $filter){
    $scope.initModal = function(computables, startingPoint) {
        $scope.startingPoint = startingPoint;
        $scope.computables = computables;
    };

    $scope.buildModes = [
            ["RECURSIVE_BUILD", "Build required dependencies"],
            ["RECURSIVE_FORCED_BUILD", "Force-rebuild all dependencies"],
            ["RECURSIVE_MISSING_ONLY_BUILD", "Build missing dependencies"]
    ];
    $scope.buildMode = "RECURSIVE_BUILD";

    $scope.removeRestore = function(index, isRemove) {
        $scope.computables[index].removed = isRemove;
        $scope.validateForm();
    };

    $scope.isAllDataset = function() {
        return $scope.computables.filter(function(c) {return c.type == 'DATASET';}).length == $scope.computables.length;
    };

    $scope.validateForm = function () {
        $scope.theform.$invalid = $scope.computables.find(i => !i.removed) == undefined;
    };

    function getJobDef() {
        var outputs = $scope.computables.filter(d => !d.removed).map(function(d) {
            if (d.type === 'DATASET') {
                return JobDefinitionComputer.computeOutputForDataset(d.serializedDataset, d.buildPartitions);
            } else if (d.type === 'MANAGED_FOLDER') {
                return JobDefinitionComputer.computeOutputForBox(d.box, d.buildPartitions);
            } else if (d.type === 'SAVED_MODEL') {
                return JobDefinitionComputer.computeOutputForSavedModel(d.model, d.buildPartitions);
            } else {
                return { "targetDataset": d.id, "targetDatasetProjectKey": d.projectKey, "type": d.type };
            }
        });

        return {
            "type": $scope.buildMode,
            "refreshHiveMetastore":true,
            "projectKey": $stateParams.projectKey,
            "outputs": outputs
        };
    }

    $scope.isBuildingDataset = false;
    $scope.startJob = function() {
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.start(getJobDef()).success(function(startedJob) {
            $scope.$emit("datasetBuildStarted");
            $scope.dismiss();
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };

    $scope.startJobPreview = function() {
        $scope.isBuildingDataset = true;
        DataikuAPI.flow.jobs.startPreview(getJobDef()).success(function(startedJob) {
            $state.go('projects.project.jobs.job', {projectKey : $stateParams.projectKey, jobId: startedJob.id});
            $scope.dismiss();
        }).error(setErrorInScope.bind($scope)).then(function(){$scope.isBuildingDataset = false;});
    };

    $scope.getIcon = function(computable) {
        switch(computable.type) {
            case 'DATASET':            return 'dataset ' + $filter('datasetTypeToIcon')(computable.serializedDataset.type);
            case 'MANAGED_FOLDER':     return 'icon-folder-open';
            case 'SAVED_MODEL':        return 'icon-machine_learning_regression';
        }
    };

    $scope.getPartitioning = function(computable) {
        if (computable.type === 'DATASET') {
            return computable.serializedDataset.partitioning;
        }
        if (computable.type === 'MANAGED_FOLDER') {
            return computable.box.partitioning;
        }
        if (computable.type === 'SAVED_MODEL') {
            return computable.model.partitioning;
        }
    };
});


app.controller('XmlFormatController', function ($scope, DataikuAPI, $state, $stateParams) {
	// record the last field visited that is used to input XPath. The fields
	// have a directive to send a setter on their model to xpathFieldGotFocus().
	// by default, the focus is on the root path element field
	$scope.lastFocusedXpathFieldSetter = function (value) {$scope.dataset.formatParams.rootPath = value;};

	$scope.xpathFieldGotFocus = function (fieldSetter) {
		$scope.lastFocusedXpathFieldSetter = fieldSetter;
	};
});


}());
