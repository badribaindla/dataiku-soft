(function(){
'use strict';

var app0 = angular.module('dataiku.analysis', []);

var app = angular.module('dataiku.analysis.core', []);


/** List of analyses */
app.controller("AnalysesListController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate, DatasetUtils, $state, TopNav) {

    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});
    $controller('AnalysisCoreController', {$scope: $scope});

    $scope.sortBy = [
        { value: 'name', label: 'Name' },
        { value: 'inputDatasetSmartName', label: 'Dataset' },
        { value: '-lastModifiedOn', label: 'Last modified'}, // Appears not to be filled up correctly
    ];
    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
            tags: [],
            interest: {
                starred: '',
            },
            inputDatasetSmartName: []
        },
        filterParams: {
            userQueryTargets: ["name", "tags", "inputDatasetSmartName"],
            propertyRules: {tag: 'tags', dataset: "inputDatasetSmartName"},
            exactMatch: ['inputDatasetSmartName']
        },
        orderQuery: "-lastModifiedOn",
        orderReversed: false
    }, $scope.selection || {});

    if ($stateParams.datasetId) {
        $scope.selection.filterQuery.inputDatasetSmartName.push($stateParams.datasetId);
    }

    $scope.maxItems = 20;

    $scope.list = function() {
        DataikuAPI.analysis.listHeads($stateParams.projectKey, true).success(function(data) {
            $scope.listItems = data;
            $scope.listItems.forEach(item => {
                item.nbModels = item.mlTasks.reduce((sum, task) => sum + task.modelCount, 0);
                item.nbSessions = item.mlTasks.reduce((sum, task) => sum + task.sessionCount, 0);
                item.computedIcon = 'icon-dku-nav_analysis';
                if (item.nbMLTasks === 1) {
                    switch(item.mlTasks[0].taskType) {
                        case 'PREDICTION':
                            if (item.mlTasks[0].backendType === 'KERAS') {
                                item.computedIcon = 'icon-dku-deeplearning-prediction';
                            } else {
                                item.computedIcon = 'icon-dku-automl-prediction';
                            }
                        break;

                        case 'CLUSTERING':
                            item.computedIcon = 'icon-dku-automl-clustering';
                        break;
                    }
                }
            });
            $scope.restoreOriginalSelection();
        }).error(setErrorInScope.bind($scope));
    };

    TopNav.setLocation(TopNav.TOP_ANALYSES, 'analyses', TopNav.TABS_NONE, null);
    TopNav.setNoItem();
    $scope.list();

    /* Tags handling */

    $scope.$on('selectedIndex', function(e, index){
        // an index has been selected, we unselect the multiselect
        $scope.$broadcast('clearMultiSelect');
    });

    /* Specific actions */
    $scope.goToItem = function(data) {
        $state.go("projects.project.analyses.analysis.script", {projectKey : $stateParams.projectKey, analysisId : data.id});
    }

    $scope.newAnalysis = function() {
        CreateModalFromTemplate("/templates/analysis/new-analysis-modal.html", $scope, "NewAnalysisModalController");
    }

    DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success(data => {
    	// Move the usable flag where it's going to be read
        data.forEach(x => {
            x.usable = x.usableAsInput;
            x.usableReason = x.inputReason;
        });
        $scope.availableDatasets = data;
    }).error(setErrorInScope.bind($scope));
});


app.controller("NewAnalysisModalController", function($scope, $state, $stateParams, DataikuAPI, DatasetUtils){

    DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success(function(data){
    	// move the usable flag where it's going to be read
        data.forEach(function(x) {
            x.usable = x.usableAsInput;
            x.usableReason = x.inputReason;
        });
        $scope.availableDatasets = data;
        // set the usable flag here instead of in the UsabilityComputer, like the other places seem to do
        angular.forEach($scope.availableDatasets, function(x) {
            x.usable=true;
        });
    }).error(setErrorInScope.bind($scope));

    $scope.newAnalysis = {}

    $scope.$watch("newAnalysis.datasetSmartName", function(nv, ov) {
        if (nv && !$scope.newAnalysis.name) {
            $scope.newAnalysis.name = "Analyze " + $scope.newAnalysis.datasetSmartName;
        }
    });

     $scope.create = function(){
        DataikuAPI.analysis.create($stateParams.projectKey, $scope.newAnalysis.datasetSmartName, $scope.newAnalysis.name).success(function(data) {
            $state.go("projects.project.analyses.analysis.script", {
                projectKey : $stateParams.projectKey,
                analysisId : data.id
            })
        }).error(setErrorInScope.bind($scope));
    }
});


app.controller("NewAnalysisOnDatasetModalController",
        function($scope, $state, $stateParams, DataikuAPI, DatasetUtils, $timeout, Fn){

    var focus1stInput = $timeout.bind(null, function() { $(".modal").find('input').focus(); }, 0);

    $scope.$watch("datasetSmartName", function(nv) {
        if (!nv) return;
        DataikuAPI.analysis.listOnDataset($stateParams.projectKey, $scope.datasetSmartName, !!$scope.forMLTask)
            .success(function(data) {
                $scope.existingAnalyses = data;
                $scope.hasMLTasks = !!$scope.forMLTask &&
                    data.map(Fn.propStr('mlTasks.length')).reduce(Fn.SUM, 0) > 0;
                $scope.newData.name = "Analyze " + $scope.datasetSmartName;
                if (data.length == 0) {
                    focus1stInput();
                }
            }).error(setErrorInScope.bind($scope));
    });

    $scope.newData = {};
    $scope.createAnother = function() {
        $scope.existingAnalyses.length = 0;
        focus1stInput();
    };
    $scope.create = function() {
        DataikuAPI.analysis.create($stateParams.projectKey, $scope.datasetSmartName, $scope.newData.name)
            .success(function(data) {
                $state.go("projects.project.analyses.analysis." + ($scope.forMLTasks ? 'ml.list' : 'script'),
                    { projectKey: $stateParams.projectKey, analysisId: data.id });
            }).error(setErrorInScope.bind($scope));
    };
});


app.controller("AnalysisCoreController", function($scope, $stateParams, $rootScope, WT1, TopNav, DataikuAPI, CreateModalFromTemplate, CreateExportModal, ExportUtils, Dialogs, $state, $q, DatasetUtils) {
    
    if ($state.is('projects.project.analyses.list')) {
        let selectedObjectListener = $scope.$watch("selection.selectedObject", (nv) => {
            if (nv) {
                $stateParams.analysisId = $scope.selection.selectedObject.id;
                $scope.analysisDataContext.inputDatasetLoc = DatasetUtils.getLocFromSmart($stateParams.projectKey, $scope.selection.selectedObject.inputDatasetSmartName);
            }
        });
        $scope.$on("$destroy", selectedObjectListener);
    }

    $scope.analysisId = $stateParams.analysisId;

    $scope.analysisDataContext = {};
    $scope.mlTasksContext = {};

    $scope.appConfig = $rootScope.appConfig;

    $scope.createShakerRecipe = function() {
        CreateModalFromTemplate("/templates/shaker/add-to-flow.html", $scope, "AddAnalysisToFlowController");
    };

    $scope.exportProcessedData = function() {
        DataikuAPI.analysis.getCore($stateParams.projectKey, $stateParams.analysisId).success(function(acp) {
            var datasetLoc = DatasetUtils.getLocFromSmart($stateParams.projectKey, acp.inputDatasetSmartName);
            DataikuAPI.datasets.get(datasetLoc.projectKey, datasetLoc.name, $stateParams.projectKey).success(function(dataset){
                var partitionLoader = (!dataset.partitioning.dimensions.length)?null:(function() {
                    var deferred = $q.defer();
                    DataikuAPI.datasets.listPartitions(dataset).success(function(data) {
                        deferred.resolve(data);
                    }).error(function() {
                        deferred.reject();
                    });
                    return deferred.promise;
                });
                var features = {
                        advancedSampling : true,
                        partitionListLoader : partitionLoader,
                        isDownloadable : true
                };
                var dialog = {
                        title : 'Prepared Dataset "'+dataset.name+'"',
                        warn : null
                };
                CreateExportModal($scope, dialog, features).then(function(params) {
                    DataikuAPI.analysis.exportProcessedData($stateParams.projectKey, $stateParams.analysisId,
                                                            params).success(function(data){
                        ExportUtils.defaultHandleExportResult($scope, params, data);
                    }).error(setErrorInScope.bind($scope));
                });
            }).error(setErrorInScope.bind($scope));
        }).error(setErrorInScope.bind($scope));
    }

    $scope.clearMLTasksContext = function(){
        $scope.mlTasksContext.type = null;
        $scope.mlTasksContext.activeMetric = null;
    }

    $scope.changeDataset = function() {
        DataikuAPI.analysis.getCore($stateParams.projectKey, $stateParams.analysisId).success(function(acp) {
        	var newScope = $scope.$new();
        	newScope.analysisCoreParams = acp;
            CreateModalFromTemplate("/templates/analysis/change-dataset-modal.html", newScope, "ChangeDatasetOnAnalysisModalController");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.saveCustomFields = function(analysis, newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'ANALYSIS'});
        let oldCustomFields = angular.copy(analysis.customFields);
        analysis.customFields = newCustomFields;
        return DataikuAPI.analysis.saveCore(analysis, {summaryOnly: true})
            .success(function() {
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), analysis.customFields);
            })
            .error(function(a, b, c) {
                analysis.customFields = oldCustomFields;
                setErrorInScope.bind($scope)(a, b, c);
            });
    };

    $scope.editCustomFields = function() {
        DataikuAPI.analysis.getSummary($stateParams.projectKey, $stateParams.analysisId).success(function(data) {
            let analysisCoreParams = data.object;
            let modalScope = angular.extend($scope, {objectType: 'ANALYSIS', objectName: analysisCoreParams.name, objectCustomFields: analysisCoreParams.customFields});
            CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                $scope.saveCustomFields(analysisCoreParams, customFields);
            });
        }).error(setErrorInScope.bind($scope));
    };
});


app.controller("ChangeDatasetOnAnalysisModalController", function($scope, $state, $stateParams, DataikuAPI, DatasetUtils, $timeout, Fn, Dialogs, DKUtils){
    DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success(function(data){
        $scope.availableDatasets = data;
        // set the usable flag here instead of in the UsabilityComputer, like the other places seem to do
        angular.forEach($scope.availableDatasets, function(x) {
            x.usable = x.smartName != $scope.analysisCoreParams.inputDatasetSmartName;
        });
    }).error(setErrorInScope.bind($scope));

    $scope.change = function(datasetSmartName) {
    	var usableDataset = null;
        angular.forEach($scope.availableDatasets, function(x) {
        	if ( x.smartName == datasetSmartName) {
        		usableDataset = x;
        	}
        });

    	Dialogs.confirm($scope, "Change input to " + usableDataset.name, "Are you sure you want to use  as input to this analysis? Columns and features might be different "
    			+ "and prevent some script steps and/or models from functioning.").then(function() {
    		$scope.analysisCoreParams.inputDatasetSmartName = datasetSmartName;
    		DataikuAPI.analysis.saveCore($scope.analysisCoreParams).success(function(data) {
    			DKUtils.reloadState();
    		}).error(setErrorInScope.bind($scope));
        });
    };
});


app.controller("AddAnalysisToFlowController", function($scope, $controller, $stateParams, $state, DataikuAPI, $q, DatasetUtils) {
    $scope.recipeType = "shaker";
    $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});
    $scope.io.inputDataset = DatasetUtils.makeSmart($scope.analysisDataContext.inputDatasetLoc, $stateParams.projectKey);


    // addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);
    // fetchManagedDatasetConnections($scope, DataikuAPI);

    $scope.$watch("io.inputDataset", function(nv, ov){
        if (!nv) return;
        var datasetLoc = DatasetUtils.getLocFromSmart( $stateParams.projectKey, $scope.io.inputDataset);
        DataikuAPI.datasets.get(datasetLoc.projectKey, datasetLoc.name, $stateParams.projectKey).success(function(dataset){
            $scope.dataset = dataset;
            $scope.dataset.partitioned = dataset.partitioning && dataset.partitioning.dimensions && dataset.partitioning.dimensions.length
        }).error(setErrorInScope.bind($scope));
    })


    $scope.options = {
        fallbackToString: true,
        cleanupColumnNames: true,
        exportCharts : true,
    }
    $scope.buildAfterCreation = false;

    $scope.showOutputPane = function(){
        return true;
    }

    $scope.autosetName = function() {
            var niceInputName = $scope.analysisDataContext.inputDatasetLoc.name.replace(/[A-Z]*\./,"");
            $scope.maybeSetNewDatasetName(niceInputName + "_prepared");
    }

    function buildDataset(projectKey, outputDataset) {
        var deferred = $q.defer();
        var jd = {};
        jd.type = "NON_RECURSIVE_FORCED_BUILD";
        jd.refreshHiveMetastore = true;
        jd.projectKey = projectKey;
        jd.outputs = [{targetDataset : outputDataset, targetDatasetProjectKey : projectKey}];
        DataikuAPI.flow.jobs.start(jd).success(function(data) {
            deferred.resolve();
        }).error(function(a, b, c) {
            setErrorInScope.bind($scope)(a, b,c);
            $scope.recipeWT1Event("recipe-run-start-failed");
            deferred.reject();
        });
        return deferred.promise;
    }

    $scope.createRecipe = function() {
        var createOutput = $scope.io.newOutputTypeRadio == 'create';
        var outputName =createOutput ? $scope.newOutputDataset.name : $scope.io.existingOutputDataset;
        $scope.options.inputDataset = $scope.io.inputDataset;

        DataikuAPI.analysis.addToFlow(
            $stateParams.projectKey,
            $stateParams.analysisId,
            createOutput,
            outputName,
            $scope.getDatasetCreationSettings(),
            $scope.options
        ).success(function(data){
            $scope.dismiss();

            if ($scope.buildAfterCreation) {
                buildDataset($stateParams.projectKey, outputName).then(function(){
                    $state.transitionTo('projects.project.flow', {
                        projectKey : $stateParams.projectKey,
                        id : 'dataset_' + $stateParams.projectKey + '.' + outputName
                    });
                });
            } else {
                $state.transitionTo('projects.project.recipes.recipe', {
                    projectKey : $stateParams.projectKey , recipeName : data.id, newlyCreated:true
                });
            }
        }).error(setErrorInScope.bind($scope));
    }
});


app.controller("AnalysisSummaryController", function($scope, $rootScope, $stateParams, $timeout, DataikuAPI, TopNav, ActivityIndicator) {
    TopNav.setLocation(TopNav.TOP_ANALYSES, null, TopNav.TABS_ANALYSIS, "summary");

    DataikuAPI.analysis.getSummary($stateParams.projectKey, $stateParams.analysisId).success(function(data) {
        $scope.analysisCoreParams = data.object;
        $scope.objectTimeline = data.timeline;
        $scope.objectInterest = data.interest;

        TopNav.setItem(TopNav.ITEM_ANALYSIS, $stateParams.analysisId, {name: $scope.analysisCoreParams.name, inputDatasetSmartName: $scope.analysisCoreParams.inputDatasetSmartName});
        TopNav.setPageTitle($scope.analysisCoreParams.name + " - Analysis");

    }).error(setErrorInScope.bind($scope));

    $scope.$on("objectSummaryEdited", function(){
        DataikuAPI.analysis.saveCore($scope.analysisCoreParams, {summaryOnly: true}).success(function(data) {
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    });

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        $scope.saveCustomFields($scope.analysisCoreParams, customFields);
    });
});


app.directive('analysisRightColumnSummary', function(DataikuAPI, $state, $stateParams, $rootScope, $controller, GlobalProjectActions, QuickView, ActiveProjectKey, ActivityIndicator, MLTasksNavService) {
    return {
        templateUrl :'/templates/analysis/right-column-summary.html',
        link : function($scope) {

            $controller('_TaggableObjectsMassActions', { $scope });

            $scope.QuickView = QuickView;

            function setUIState() {
                $scope.analysisData.uiState = $scope.analysisData.uiState || { showAllMLTasks: false, showAllSavedModels: false };
            }

            function prepareMLTasks() {
                // Compute icons
                $scope.analysisData.mlTasks.forEach(mlTask => {
                    switch(mlTask.taskType) {
                        case 'PREDICTION':
                            if (mlTask.backendType === 'KERAS') {
                                mlTask.computedIcon = 'icon-dku-deeplearning-prediction';
                            } else {
                                mlTask.computedIcon = 'icon-dku-automl-prediction';
                            }
                        break;
    
                        case 'CLUSTERING':
                            mlTask.computedIcon = 'icon-dku-automl-clustering';
                        break;
                    }
                });

                // Sort
                $scope.analysisData.mlTasks.sort((a, b) => { return a.lastModifiedOn - b.lastModifiedOn } );

                const activeMLTaskId = MLTasksNavService.getActiveMLTaskId($scope.selection.selectedObject.id);

                // Last opened ml task takes precedence over modification date sorting.
                if (activeMLTaskId) {
                    const activeMLTaskIndex = $scope.analysisData.mlTasks.findIndex(mlTask => mlTask.mlTaskId === activeMLTaskId);
                    Array.move($scope.analysisData.mlTasks, activeMLTaskIndex, 0);
                }
            }
            
            $scope.refreshData = function() {
                $scope.insight = $scope.selection.selectedObject;

                DataikuAPI.analysis.getSummary($scope.selection.selectedObject.projectKey, $scope.selection.selectedObject.id, true).success(data => {
                    // TODO use sequenceId
                    $scope.analysisData = { analysis: data.object, mlTasks: data.mlTasks, savedModels: data.savedModels };
                    $scope.analysis = $scope.analysisData.analysis;
                    setUIState();
                    prepareMLTasks();

                    $rootScope.$broadcast('objectMetaDataRefresh', { 
                        tags: $scope.analysis.tags,
                        shortDesc: $scope.analysis.shortDesc,
                        description: $scope.analysis.description,
                        checklists: $scope.analysis.checklists,
                        customFields: $scope.analysis.customFields
                    });
                });
            };

            /* Auto save when summary is modified */
            $scope.$on("objectSummaryEdited", function(){
                DataikuAPI.analysis.saveCore($scope.selection.selectedObject, {summaryOnly: true}).success(function(data) {
                    ActivityIndicator.success("Saved");
                }).error(setErrorInScope.bind($scope));
            });

            $scope.refreshTimeline = function(){
                DataikuAPI.timelines.getForObject(ActiveProjectKey.get(), "ANALYSIS", $scope.selection.selectedObject.id)
                .success(function(data){
                    $scope.objectTimeline = data;
                })
                .error(setErrorInScope.bind($scope));
            };

            $scope.deleteAnalysis = function() {
                GlobalProjectActions.deleteTaggableObject($scope, 'ANALYSIS', $scope.selection.selectedObject.id, $scope.selection.selectedObject.name)
            };

            $scope.duplicate = function() {
                DataikuAPI.analysis.duplicate(ActiveProjectKey.get(), $scope.selection.selectedObject.id).success(function(data) {
                    if ($scope.list) {
                        $scope.list();
                        $scope.selection.selectedObject = null;
                    } else {
                        $state.transitionTo("projects.project.analyses.analysis.script",{
                            projectKey : $stateParams.projectKey,
                            analysisId : data.id
                        });
                    }
                }).error(setErrorInScope.bind($scope));
            };

            $scope.$watch("selection.selectedObject", function(nv, ov) {
                if (!nv) return;
                $scope.analysisData = {analysis: nv, mlTasks: []}; // display temporary (incomplete) data
                if (!$scope.selection.selectedObject) {
                    $scope.objectTimeline = null;
                    $scope.acp = null;
                }
            });

            $scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) return;
                $scope.refreshData();
            });

            const customFieldsListener = $rootScope.$on('customFieldsSaved', $scope.refreshData);
            $scope.$on("$destroy", customFieldsListener);
        }
    }
});

app.controller("AnalysisPageRightColumnActions", async function($controller, $scope, $rootScope, $stateParams, DataikuAPI, ActiveProjectKey) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    $scope.data = (await DataikuAPI.analysis.getSummary(ActiveProjectKey.get(), $stateParams.analysisId)).data;

    const analysis = $scope.data.object;
    analysis.nodeType = "ANALYSIS";
    analysis.interest = $scope.data.interest;

    $scope.selection = {
        selectedObject : analysis,
        confirmedItem : analysis
    };

    function updateUserInterests() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "ANALYSIS", ActiveProjectKey.get(), $stateParams.analysisId).success(function(data) {

            $scope.selection.selectedObject.interest = data;

        }).error(setErrorInScope.bind($scope));
    }

    updateUserInterests();
    const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);
    $scope.$on("$destroy", interestsListener);
});

})();
