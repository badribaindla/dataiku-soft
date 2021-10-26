(function () {
    'use strict';

    var app = angular.module('dataiku.controllers');

    app.controller("DatasetsCommon", function ($scope, $stateParams, DataikuAPI, $state, $q, DatasetsService, CreateModalFromTemplate) {

        $scope.createAndPin = function(datasetName) {
            var insight = {
                projectKey: $stateParams.projectKey,
                type: 'dataset_table',
                params: { datasetSmartName: datasetName },
                name: datasetName
            };
            CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insight-modal.html", $scope, "CreateAndPinInsightModalController", function(newScope) {
                newScope.init(insight);
            });
        };

        $scope.clearDataset = function(datasetName) {
            DatasetsService.clear($scope, $stateParams.projectKey, datasetName).then(function() {
                $scope.$broadcast('refresh-table');
            });
        };
    });


    app.controller('DatasetsListController', function($scope, $controller, $stateParams, $state, $q,
                          DatasetsService, DataikuAPI, CreateModalFromTemplate, TopNav, ComputablesService, Fn) {

        $controller("DatasetsCommon", {$scope: $scope});
        $controller('_TaggableObjectsListPageCommon', {$scope: $scope});

        TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_NONE, null);
        TopNav.setNoItem();

        $scope.showClearData = true;
        $scope.selection = $.extend({
            filterQuery: {
                userQuery: '',
                tags: [],
                interest: {
                    starred: '',
                },
            },
            filterParams: {
                userQueryTargets: ["name","type","tags"],
                propertyRules: {"tag": "tags"}
            },
            orderQuery: "-lastModifiedOn",
            orderReversed: false,
        }, $scope.selection || {});

        $scope.sortBy = [
            { value: 'name', label: 'Name' },
            { value: 'type', label: 'Type' },
            { value: 'status.totalSize', label: 'Size' },
            { value: 'status.records', label: 'Records'},
            { value : '-lastModifiedOn', label : 'Last modified' }
        ];

        $scope.sortCookieKey = 'datasets';
        $scope.maxItems = 20;

        $scope.goToItem = function(item) {
            $scope.$state.go('projects.project.datasets.dataset.explore', {datasetName: item.name, projectKey: $stateParams.projectKey});
        };

        $scope.list = function() {
            return DataikuAPI.datasets.listHeads($stateParams.projectKey, {}, true).success(function (data) {
                $scope.datasets = data;
                $scope.filteredOut = data.filteredOut;
                $scope.listItems = data.items;
                $scope.restoreOriginalSelection();
            }).error(setErrorInScope.bind($scope));
        };

        $scope.$on('projectTagsUpdated', function (e, args) {
             if (args.refreshFlowFilters) $scope.list();
        });
        $scope.list();
    });


    app.controller("NewManagedDatasetController", function ($scope, $state, $stateParams, DataikuAPI, WT1) {
        WT1.event("dataset-new-managed-box");
        addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);

        $scope.newDataset ={
            name : null,
            settings : {
                specificSettings : {},
                zone: $scope.getRelevantZoneId($stateParams.zoneId)
            }
        };

        DataikuAPI.datasets.getManagedDatasetOptionsNoContext($stateParams.projectKey).success(function(data) {
            $scope.managedDatasetOptions = data;
            if (!$scope.newDataset.settings.connection && data.connections.length) {
                $scope.newDataset.settings.connection = data.connections[0];
            }
            $scope.partitioningOptions = [
                {"id" : "NP", "label" : "Not partitioned"},
            ].concat(data.projectPartitionings)

            $scope.newDataset.settings.partitioningOptionId = "NP";
        });

        $scope.$watch("newDataset.settings.connection", function(nv, ov) {
            if (nv && nv.formats && nv.formats.length) {
                $scope.newDataset.settings.specificSettings.formatOptionId = nv.formats[0].id;
            }
            if (nv && nv.fsProviderTypes && nv.fsProviderTypes.length >= 1) {
                $scope.newDataset.settings.typeOptionId = nv.fsProviderTypes[0];
            }
        }, true);

        $scope.create = function () {
            resetErrorInScope($scope);
            $scope.newDataset.settings.connectionId = $scope.newDataset.settings.connection.id;
            DataikuAPI.datasets.newManagedDataset($stateParams.projectKey, $scope.newDataset.name, $scope.newDataset.settings).success(function (data) {
                $state.go('projects.project.datasets.dataset.settings', { datasetName: $scope.newDataset.name });
                $scope.dismiss();
            }).error(setErrorInScope.bind($scope));
        };
    });


    app.controller("DatasetCommonController", function ($controller, $scope, $stateParams, $rootScope, DataikuAPI, TopNav, $state, DatasetsService, CreateModalFromTemplate, DatasetCustomFieldsService) {
        $controller("DatasetsCommon", {$scope: $scope});
        TopNav.setItem(TopNav.ITEM_DATASET, $stateParams.datasetName);

        $scope.datasetHooks = {};

        /* Check if this dataset has preview custom fields */
        function getCurrentDatasetFullInfo() {
            return DataikuAPI.datasets.getFullInfo($stateParams.projectKey, $stateParams.projectKey, $stateParams.datasetName).success(function(data) {
                $scope.datasetFullInfo = data;

                if ($scope.datasetFullInfo.type == "Inline") {
                    $scope.editableDataset = true;
                }

                TopNav.setItem(TopNav.ITEM_DATASET, $stateParams.datasetName, {
                    datasetType : data.type,
                    name : $stateParams.datasetName,
                    creatingRecipe: data.creatingRecipe,
                    creatingContinuousRecipe: data.creatingContinuousRecipe,
                    usedByRecipes: data.recipes,
                    customFields: data.dataset.customFields,
                    customFieldsPreview: DatasetCustomFieldsService.buildCustomFieldsPreviews(data.dataset.customFields)
                });

            }).error(setErrorInScope.bind($scope));
        }
        getCurrentDatasetFullInfo();

        $rootScope.$on('customFieldsSaved', function(event, item, customFields) {
            if (TopNav.sameItem(item, TopNav.getItem())) {
                let newItem = TopNav.getItem();
                newItem.data.customFields = customFields;
                newItem.data.customFieldsPreview = DatasetCustomFieldsService.buildCustomFieldsPreviews(customFields);
            }
        });

        $scope.newAnalysis = function() {
            GlobalProjectActions.smartNewAnalysis($scope, $stateParams.datasetName);
        };

        $scope.buildOpenDataset = function() {
            DataikuAPI.datasets.get($stateParams.projectKey, $stateParams.datasetName, $stateParams.projectKey).success(function(dataset) {
                CreateModalFromTemplate("/templates/datasets/build-dataset-modal.html", $scope, "BuildDatasetController", function(newScope) {
                    newScope.jobStartRedirects = true;
                    newScope.dataset = dataset;
                }, "build-dataset-modal");
            }).error(setErrorInScope.bind($scope));
        };

        Mousetrap.bind("g e", function() {
            $state.go("projects.project.datasets.dataset.explore", {
                projectKey : $stateParams.projectKey,
                datasetName : $stateParams.datasetName
            });
        });
        Mousetrap.bind("g v", function() {
            $state.go("projects.project.datasets.dataset.visualize", {
                projectKey : $stateParams.projectKey,
                datasetName : $stateParams.datasetName
            });
        });

        $scope.$on("$destroy", function() {
            Mousetrap.unbind("g e");
            Mousetrap.unbind("g v");
        });
    });

    app.controller("DatasetNewController", function ($scope, $stateParams, DataikuAPI) {
    });

    app.controller("DatasetSummaryController", function ($scope, $stateParams, Assert, DataikuAPI, TopNav, ActivityIndicator, $q, CreateModalFromTemplate, $state, HistoryService, DatasetCustomFieldsService) {
        $scope.datasetName = $stateParams.datasetName;
        $scope.uiState = {};
        Assert.trueish($stateParams.datasetName, 'no datasetName in stateParams');

        TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_DATASET, "summary");

        $scope.refreshTimeline = function() {
            DataikuAPI.timelines.getForObject($stateParams.projectKey, "DATASET", $stateParams.datasetName).success(function(data) {
                $scope.objectTimeline = data;
            }).error(setErrorInScope.bind($scope));
        };

        DataikuAPI.datasets.getSummary($stateParams.projectKey, $stateParams.datasetName).success(function(data) {
            $scope.dataset = data.object;
            $scope.objectInterest = data.interest;
            $scope.objectTimeline = data.timeline;
        }).error(setErrorInScope.bind($scope));

        /* Auto save when summary is modified */
        $scope.$on("objectSummaryEdited", function(){
            DataikuAPI.datasets.save($stateParams.projectKey, $scope.dataset, {summaryOnly:true}).success(function(data) {
                ActivityIndicator.success("Saved");
                $scope.refreshTimeline();
            }).error(setErrorInScope.bind($scope));
        });

        $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
            DatasetCustomFieldsService.saveCustomFields($scope.dataset, customFields);
        });
    });


    app.controller("DatasetSettingsController", function ($scope, $rootScope, $state, $stateParams, $q, $timeout, $controller,
                                                          Assert, TopNav, CachedAPICalls, Dialogs, DataikuAPI, CreateModalFromTemplate, WT1, ActivityIndicator, DatasetUtils, DKUtils, LoggerProvider,
                                                          HistoryService) {
        var Logger = LoggerProvider.getLogger('datasets.settings');

        $scope.uiState = {
            activeTab : "connection"
        };

        $scope.anyPipelineTypeEnabled = function() {
            return $rootScope.projectSummary.sparkPipelinesEnabled || $rootScope.projectSummary.sqlPipelinesEnabled;
        };

        if ($stateParams.datasetName) {
            TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_DATASET, "settings");
        } else {
            TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_NEW_DATASET, "settings");
            TopNav.setItem(TopNav.ITEM_DATASET, "New dataset", { name: "New dataset", dummy: true,
                newDatasetType : $stateParams.type});
        }

        // Dataset Type specific controllers may set conditions
        // values for the form to be valid.
        // Conditions take a string as key.
        // The form is valid when all the predicates evaluate to true.
        $scope.saveHooks = [];
        $scope.canBeSaved = function() {
            for(var i = 0 ; i < $scope.saveHooks.length ; i++) {
                if(!$scope.saveHooks[i]()) {
                    return false;
                }
            }
            return true;
        };

        $scope.table = null;
        $scope.charsets = null;
        $scope.types = null;
        $scope.formats = null;
        $scope.loading = true;
        $scope.detectionResults = null;
        $scope.dataset_name = '';
        $scope.redetectFormatOnCoreParamsChanged = false;
        $scope.datasetShortStatus = null;

        /* ************************* Core loading and saving
         */
        var promises = [];
        promises.push(CachedAPICalls.datasetTypes);
        promises.push(CachedAPICalls.datasetCommonCharsets);
        promises.push(CachedAPICalls.datasetFormatTypes);
        promises.push(null);

        if ($stateParams.datasetName) {
            $scope.datasetName = $stateParams.datasetName;
            document.dispatchEvent(new CustomEvent("PushAllDatasetPromises"));
            promises.push(DataikuAPI.datasets.get($stateParams.projectKey, $stateParams.datasetName, $stateParams.projectKey));
        } else {
            $scope.dataset = {
                'name': null,
                'projectKey': $stateParams.projectKey,
                'params': {},
                'partitioning': {dimensions:[]},
                'tags':[],
                'schema': {}
            };
            Assert.trueish($stateParams.type, 'no type in stateParams');
            $scope.dataset.type = $stateParams.type;
            // FIXME
            $scope.datasetShortStatus = {};
        }

        $q.all(promises).then(function (values) {
            document.dispatchEvent(new CustomEvent("GotAllDatasetPromises"));
            Logger.info("All promises done, loading UI", values[4]);
            $scope.types = values[0].data;
            $scope.charsets = values[1].data;
            $scope.formats = values[2].data;

            $scope.formatsAsMap = angular.copy($scope.formats);
            for (var fmtIdx in $scope.formatsAsMap) {
                var fmt = $scope.formatsAsMap[fmtIdx];
                var o = {};
                for (var paramIdx in fmt.params) {
                    o[fmt.params[paramIdx].name] = fmt.params[paramIdx];
                }
                $scope.formatsAsMap[fmtIdx] = o;
            }
            if ($stateParams.datasetName) {
                $scope.dataset = values[4].data;
                $scope.dataset_name = $scope.dataset.name;
                $scope.origDataset = angular.copy($scope.dataset);
            } else {
                $scope.origDataset = angular.copy($scope.dataset);
                $scope.firstPreviewDone = true;
                /* No dataset yet -> Always redetect on core params changed */
                $scope.redetectFormatOnCoreParamsChanged = true;
            }

            $scope.datasetKindForConsistency = DatasetUtils.getKindForConsistency($scope.dataset);

            var datasetType = $scope.types[$scope.dataset.type];
            var ctrl = null;
            /* Load the correct additional functions */

            if (datasetType.customDataset) {
                $scope.interactionType = "custom-dataset";
                ctrl = "CustomDatasetController";
            } else if ($scope.dataset.type == "Inline" && $stateParams.datasetName) {
                $scope.interactionType = "editable";
                ctrl = "EditableDatasetController";
            } else if ($scope.dataset.type == "Inline") {
                $scope.interactionType = "managed_fslike";
                ctrl = "EditableDatasetController";
            } else if ($stateParams.datasetName && $scope.types[$scope.dataset.type].sql && $scope.dataset.managed) {
                $scope.interactionType = 'managed_sql';
                ctrl = "ManagedSQLDatasetController";
            } else if ($scope.dataset.type == "MongoDB") {
                $scope.interactionType = "mongodb";
                ctrl = "MongoDBDatasetController";
            } else if ($stateParams.datasetName && $scope.dataset.type == "Cassandra" && $scope.dataset.managed) {
                $scope.interactionType = "managed_cassandra";
                ctrl = "ManagedCassandraDatasetController";
            } else if($scope.dataset.type == "Twitter") {
                $scope.interactionType = 'twitter_stream';
                ctrl = "TwitterStreamDatasetController";
            } else if($scope.dataset.type == "ElasticSearch") {
                $scope.interactionType = 'elasticsearch';
                ctrl = "ElasticSearchDatasetController";
            } else if($scope.dataset.type == "DynamoDB") {
                $scope.interactionType = 'dynamodb';
                ctrl = "DynamoDBDatasetController";
            } else if ($scope.dataset.type == "JobsDB") { // here, otherwise interactionType ends up being managed_fslike
                $scope.interactionType = 'jobsdb';
                ctrl = "MetricsDatasetController";
            } else if ($scope.dataset.type == "StatsDB") { // here, otherwise interactionType ends up being managed_fslike
                $scope.interactionType = 'statsdb';
                ctrl = "StatsDBDatasetController";
            } else if ($stateParams.datasetName && $scope.dataset.managed) {
                $scope.interactionType = 'managed_fslike';
                ctrl = "ManagedFSLikeDatasetController";
            } else if ($scope.dataset.type == "hiveserver2") { // almost sql, but special handling of connections
                $scope.interactionType = 'external_hive';
                ctrl = "ExternalHiveDatasetController";
            } else if ($scope.types[$scope.dataset.type].sql) {
                $scope.interactionType = 'external_sql';
                ctrl = "ExternalSQLDatasetController";
            } else if ($scope.dataset.type == "Cassandra") {
                $scope.interactionType = "external_cassandra";
                ctrl = "ExternalCassandraDatasetController";
            } else {
                $scope.interactionType = 'external_other';
                ctrl =  "ExternalStreamOrientedDatasetController";
            }

            $controller(ctrl, {$scope:$scope});
            $scope.onLoadComplete();
            $scope.loading = false;
            $scope.loadDone = true;
            getDigestTime($scope, function(time) {
                WT1.event("page-dataset-loaded", {digestTime : time, isNew : !$scope.dataset.name});
            });
        }, function (errors) {
            setErrorInScope.bind($scope)(errors.data, errors.status, errors.headers);
        });

        //TODO @flow factorize
        $scope.resynchronizeMetastore = function() {
            Dialogs.confirmPositive($scope,
                'Hive metastore resynchronization',
                'Are you sure you want to resynchronize this dataset to the Hive metastore?')
                .then(function() {
                    ActivityIndicator.waiting('Synchronizing to Hive metastore...');
                    const datasetRef = {
                        type: 'DATASET',
                        projectKey: $stateParams.projectKey,
                        id: $scope.dataset.name
                    };
                    DataikuAPI.datasets.synchronizeOneHiveMetastore(datasetRef, $scope.dataset.params).success(function(data) {
                        if (data.anyMessage && (data.warning || data.error)) {
                            ActivityIndicator.hide();
                            Dialogs.infoMessagesDisplayOnly($scope, "Metastore synchronization", data);
                        } else {
                            // nothing to show
                            ActivityIndicator.success('Hive metastore successfully synchronized');
                        }
                    }).error(function(data, status, headers) {
                        ActivityIndicator.error("Failed to synchronize Hive metastore");
                        setErrorInScope.call($scope,data,status,headers);
                    });
                });
        };

        //TODO @flow factorize
        $scope.resynchronizeDataset = function() {
            ActivityIndicator.waiting('Synchronizing from Hive metastore...');
            WT1.event("update-from-hive");
            DataikuAPI.datasets.updateFromHive($stateParams.projectKey, $scope.dataset.name).success(function(data,status,headers){
                ActivityIndicator.success('Dataset successfully synchronized');
                DataikuAPI.datasets.get($stateParams.projectKey, $stateParams.datasetName, $stateParams.projectKey).success(function(data) {
                    $scope.dataset = data;
                    $scope.dataset_name = $scope.dataset.name;
                    $scope.origDataset = angular.copy($scope.dataset);
                }).error(setErrorInScope.bind($scope));
            }).error(function(data, status, headers) {
                ActivityIndicator.error("Failed to synchronize Hive metastore");
                setErrorInScope.call($scope,data,status,headers);
            });
        };

        $scope.saveDataset = function() {
            if (!$stateParams.datasetName) {
                /* Creation */
                $scope.dataset.name = $scope.new_dataset_name;
                $scope.origDataset = null;
                return DataikuAPI.datasets.create($stateParams.projectKey, $scope.dataset, $stateParams.zoneId).success(function() {
                    $rootScope.$broadcast(dkuEvents.datasetChanged);
                    $state.transitionTo("projects.project.datasets.dataset.explore", {projectKey : $stateParams.projectKey,
                        datasetName : $scope.new_dataset_name});
                }).error(setErrorInScope.bind($scope));

            } else {
                Assert.trueish($scope.dataset.name, 'dataset has no name');

                var saveAfterConflictCheck = function() {
                    return DataikuAPI.datasets.saveWithRecipesFixup($stateParams.projectKey, $scope.dataset, {}, false)
                        .error(setErrorInScope.bind($scope))
                        .then(function(saveResp) {
                            if (saveResp.data.result) {
                                return saveResp.data.result.versionTag;
                            } else {
                                return Dialogs.confirmInfoMessages($scope,
                                    "Dependencies", saveResp.data.messages).then(function(){
                                    return DataikuAPI.datasets.saveWithRecipesFixup($stateParams.projectKey, $scope.dataset, {}, true)
                                        .error(setErrorInScope.bind($scope))
                                        .then(function(forcedSaveResp) {
                                            Assert.trueish(forcedSaveResp.data.result, 'response has no results');
                                            return forcedSaveResp.data.result.versionTag;
                                        });
                                });
                            }
                        }).then(function(newVersionTag) {
                        $rootScope.$broadcast(dkuEvents.datasetChanged);
                        // Reset the modification detector
                        $scope.origDataset = angular.copy($scope.dataset);
                        $scope.dataset.versionTag = newVersionTag;
                        $scope.origDataset.versionTag = newVersionTag;
                    });
                };

                return DataikuAPI.datasets.checkSaveConflict($stateParams.projectKey,$scope.dataset).success(function(conflictResult) {

                    if(!conflictResult.canBeSaved) {
                        return Dialogs.openConflictDialog($scope,conflictResult).then(
                            function(resolutionMethod) {
                                if(resolutionMethod == 'erase') {
                                    return saveAfterConflictCheck();
                                } else if(resolutionMethod == 'ignore') {
                                    return DKUtils.reloadState();
                                }
                            }
                        );
                    } else {
                        return saveAfterConflictCheck();
                    }

                }).error(setErrorInScope.bind($scope));
            }
        };

        $scope.goToPreview = function() {
            $scope.uiState.activeTab = "preview";
            $scope.$broadcast('tabSelect', 'preview');
        };

        $scope.buildDataset = function() {
            CreateModalFromTemplate("/templates/datasets/build-dataset-modal.html", $scope, "BuildDatasetController", null, "build-dataset-modal");
        };

        $scope.datasetIsDirty = function () {
            if (!$scope.dataset)
                return false;

            function cleanDimensionPatterns(input) {
                if (input == null) return null;
                var datasetToCheck = angular.copy(input);
                if (datasetToCheck && datasetToCheck.partitioning && datasetToCheck.partitioning.dimensions) {
                    for (var i = 0; i < datasetToCheck.partitioning.dimensions.length; i++) {
                        delete datasetToCheck.partitioning.dimensions[i].patterns;
                    }
                }
                return datasetToCheck;
            }

            function cleanSavedFiles(input) {
                if (input == null) return null;
                var datasetToCheck = angular.copy(input);
                delete datasetToCheck.savedFiles;
                return datasetToCheck;
            }

            var datasetToCheck = cleanSavedFiles(cleanDimensionPatterns($scope.dataset));
            var origDataset = cleanSavedFiles(cleanDimensionPatterns($scope.origDataset));

            return !angular.equals(datasetToCheck, origDataset) || $scope.dataset && $scope.dataset.name != $scope.dataset_name;
        };

        checkChangesBeforeLeaving($scope, function(){
            if ($scope.uiState.bypassDirtinessCheck) {
                return false;
            }

            var danger = false;
            /* Not yet loaded */
            if (!$scope.dataset) return;
            if ($scope.dataset.name) {
                /* Existing dataset */
                danger = $scope.origDataset && $scope.datasetIsDirty();
            } else {
                /* New dataset, don't do bogus renaming check */
                danger = $scope.origDataset && !angular.equals($scope.dataset, $scope.origDataset);
            }
            return danger;
        });

        $scope.smartWatch = function (expr, apply) {
            var stop;
            $scope.$watch(expr, function (nv, ov) {
                if (stop) {
                    $timeout.cancel(stop);
                }
                stop = $timeout(apply, 1000);
            }, true);
        };

        $scope.renameDataset = function(){
            WT1.event("dataset-rename-open-modal");
            CreateModalFromTemplate("/templates/datasets/rename-dataset-box.html", $scope, null, function(newScope){
                newScope.datasetName = $stateParams.datasetName;
                newScope.uiState = {
                    step : "input"
                }
                newScope.computeImpact = function(){
                    newScope.uiState.step = "do";
                    Assert.inScope(newScope, 'datasetName');
                    Assert.trueish(newScope.uiState.newName, 'dataset has no new name');
                    DataikuAPI.datasets.computeRenamingImpact($stateParams.projectKey, $stateParams.datasetName, newScope.uiState.newName).success(function(data) {
                        newScope.computedImpact = data;
                    }).error(setErrorInScope.bind(newScope));
                }

                newScope.go = function(){
                    WT1.event("dataset-rename", {"type" : $scope.dataset ? $scope.dataset.type : "?"});
                    DataikuAPI.datasets.rename($stateParams.projectKey, $stateParams.datasetName, newScope.uiState.newName).success(function() {
                        HistoryService.notifyRenamed({
                            type: "DATASET",
                            id: $stateParams.datasetName,
                            projectKey: $stateParams.projectKey
                        }, newScope.uiState.newName);
                        newScope.dismiss();
                        $state.transitionTo($state.current, { projectKey : $stateParams.projectKey, datasetName : newScope.uiState.newName });
                    }).error(setErrorInScope.bind(newScope));
                }
            });
        }
        Logger.info("Done loading dataset controller");
    });


    app.controller("DatasetHistoryController", function ($scope, TopNav) {
        TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_DATASET, "history");
    });
    
    app.controller("DatasetStatisticsController", function ($scope, TopNav, $state) {
        $scope.$state = $state;
        TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_DATASET, "statistics");
    });

    app.controller("DatasetLabController", function ($scope, $controller, $stateParams, $state, $timeout, Assert, DataikuAPI, DatasetUtils, GlobalProjectActions, Fn, $rootScope, StateUtils, CreateModalFromTemplate) {
        $controller('NotebooksCommons', { $scope: $scope });

        var excludedBackends = [];

        function fetchBackends(callback) {
            DataikuAPI.analysis.mlcommon.listBackends($stateParams.projectKey, $scope.datasetSmartName, '')
                .success(data => {
                    $scope.backends = data;
                    for(var i = 0; i < data.length; i++){
                        if (!data[i].available){
                            excludedBackends.push(data[i].type);
                        }
                    }
                    callback();
                }).error(setErrorInScope.bind($scope));
        }

        function generateAnalysisName(policy, targetVariable) {
            if (!policy) {
                return "Analyze " + $scope.datasetSmartName;
            }

            const withDataset = policy.analysis_name.replace("{dataset}", $scope.datasetSmartName);

            if (targetVariable) {
                return withDataset.replace("{target}", targetVariable);
            }
            return withDataset;
        };

        $scope.selectPolicy = function(taskData, policy, targetVariable) {
            taskData.selectedPolicy = policy;
            taskData.analysisName = generateAnalysisName(policy, targetVariable);
            $scope.updateBackend(taskData);
        };

        function selectDefaultPolicy(taskData, mode) {
            $scope.selectPolicy(taskData, taskData.guessPolicies[mode][0], taskData.targetVariable);
        }

        function prepareGuessPolicies(taskData) {
            taskData.guessPolicies.auto.forEach(updateGuessPolicyBackends);
            taskData.guessPolicies.expert.forEach(updateGuessPolicyBackends);
        };

        function updateGuessPolicyBackends(policy) {
            let policyBackends = [];
            let policyBackendsDescriptions = [];

            $scope.backends.forEach(backend => {
                policy.supported_backends.forEach(function (supportedBackend) {
                    if (supportedBackend === backend.type) {
                        let title = backend.displayName;
                        let description = backend.description;
                        if (backend.statusMessage) {
                            title += ' (Unavailable)';
                            description += '<br/><strong>' + backend.statusMessage + '</strong>';
                        }
                        backend.title = title;
                        policyBackends.push(backend);
                        policyBackendsDescriptions.push(description);
                    }
                });
            });

            policy.backends = policyBackends;
            policy.backendDomDescriptions = policyBackendsDescriptions;

            if (!policy.selectedBackend) {
                policy.selectedBackend = { displayName: angular.copy(policy.backends[0]).displayName };
            }
        };

        function displayNewPredictionModal(mode, resetColumn = true) {
            // Force user to re-set the target variable each time the modal is opened.
            // And pick the default policy depending on the prediction mode.
            if (resetColumn) {
                $scope.predictionTaskData.targetVariable = null;
            }
            selectDefaultPolicy($scope.predictionTaskData, mode);

            CreateModalFromTemplate('/templates/datasets/create-prediction-modal.html', $scope, null, (modalScope) => {
                modalScope.taskData = $scope.predictionTaskData;

                if (!$scope.predictionTaskData.targetVariable && $scope.appConfig.userProfile.mayVisualML) {
                    // Trigger click on target input to display the dropdown menu. 
                    // Wait a bit till the modal height is computed so that the dropdown could be properly displayed.
                    $timeout(() => {
                        document.querySelector('#create-prediction-modal .dku-select-button').click();
                    }, 400);
                }
            });
        }

        function prepareNewPredictionModal(column, mode) {  
            const loc = DatasetUtils.getLocFromSmart($stateParams.projectKey, $scope.datasetSmartName);
            const resetTargetVariable = !column;

            if (column) {
                $scope.predictionTaskData.targetVariable = column;
            }

            // Retrieve dataset columns
            DataikuAPI.datasets.get(loc.projectKey, loc.name, $stateParams.projectKey).success(data => {
                $scope.possibleColumns = data.schema.columns.map(it => it.name); 

                // Retrieve the prediction guess policies only if not already done.
                if ($scope.predictionTaskData.guessPolicies) {
                    displayNewPredictionModal(mode, resetTargetVariable);
                } else {
                    DataikuAPI.analysis.pml.listGuessPolicies().success(data => {
                        $scope.predictionTaskData.guessPolicies = data;
                        prepareGuessPolicies($scope.predictionTaskData);

                        $scope.$watch('predictionTaskData.targetVariable', (newValue) => { 
                            $scope.predictionTaskData.analysisName = generateAnalysisName($scope.predictionTaskData.selectedPolicy, newValue); 
                        });

                        displayNewPredictionModal(mode, resetTargetVariable);
                    }).error(setErrorInScope.bind($scope));
                }
            });
        }

        $scope.newPrediction = function(column, datasetSmartName, mode = 'auto') {

            $scope.datasetSmartName = datasetSmartName;

            // Retrieve the available backends only if not already done.
            if ($scope.backends) {
                prepareNewPredictionModal(column, mode);
            } else {
                fetchBackends(prepareNewPredictionModal.bind(this, column, mode));
            }
        };

        $scope.newDeepLearningPrediction = function(datasetSmartName) {
            $scope.newPrediction(undefined, datasetSmartName, 'expert');
        }

        function displayNewClusteringModal(mode) { 
            selectDefaultPolicy($scope.clusteringTaskData, mode);

            CreateModalFromTemplate('/templates/datasets/create-clustering-modal.html', $scope, null, modalScope => {
                modalScope.taskData = $scope.clusteringTaskData;
            });
        }

        function prepareNewClusteringModal(mode = 'auto') {
            // Retrieve the clustering guess policies only if not already done.
            if ($scope.clusteringTaskData.guessPolicies) {
                displayNewClusteringModal(mode);
            } else {
                DataikuAPI.analysis.cml.listGuessPolicies().success(data => {
                    $scope.clusteringTaskData.guessPolicies = data;
                    prepareGuessPolicies($scope.clusteringTaskData);
                    $scope.clusteringTaskData.analysisName = generateAnalysisName($scope.clusteringTaskData.selectedPolicy);
                    displayNewClusteringModal(mode);
                }).error(setErrorInScope.bind($scope));
            }
        }

        $scope.newClustering = function(datasetSmartName, mode) {
            $scope.datasetSmartName = datasetSmartName;

            // Retrieve the available backends only if not already done.
            if ($scope.backends) {
                prepareNewClusteringModal();
            } else {
                fetchBackends(prepareNewClusteringModal.bind(this, mode));
            }
        };

        $scope.newAnalysis = function(datasetSmartName) {
            CreateModalFromTemplate('/templates/analysis/new-analysis-modal.html', $scope, 'NewAnalysisModalController', (modalScope) => {
                modalScope.newAnalysis.datasetSmartName = datasetSmartName;
            });
        }
        
        $scope.predictionTaskData = {};
        $scope.clusteringTaskData = {};

        $scope.updateBackend = function(taskData, policy = taskData.selectedPolicy) {
            const foundBackend = policy.backends.find(backend => (backend.displayName === policy.selectedBackend.displayName));
            if (foundBackend) {
                taskData.backendType = foundBackend.type;
            }
        };

        $scope.canCreateTemplate = function(taskData) {
            return !!taskData.analysisName
                && !!taskData.backendType
                && !!taskData.selectedPolicy;
        };

        $scope.canCreatePredictionTemplate = function(taskData) {
            return !!taskData.targetVariable && $scope.canCreateTemplate(taskData);
        }

        $scope.createPredictionTemplate = function(policyId = $scope.predictionTaskData.selectedPolicy.id) {
            const taskData = $scope.predictionTaskData;

            DataikuAPI.analysis.createPredictionTemplate(
                $stateParams.projectKey,
                $scope.datasetSmartName,
                taskData.analysisName,
                taskData.backendType,
                '',
                taskData.targetVariable,
                policyId
            ).success(data => {
                $scope.dismiss && $scope.dismiss();
                $rootScope.mlTaskJustCreated = true;
                if (policyId === 'DEEP') {
                    $state.go('projects.project.analyses.analysis.ml.predmltask.list.design', { analysisId: data.analysisId, mlTaskId: data.mlTaskId, '#': 'keras-build' });
                } else if (policyId === 'ALGORITHMS' || policyId === 'CUSTOM') {
                    $state.go('projects.project.analyses.analysis.ml.predmltask.list.design', { analysisId: data.analysisId, mlTaskId: data.mlTaskId, '#': 'algorithms' });
                } else {
                    $state.go('projects.project.analyses.analysis.ml.predmltask.list.results', { analysisId: data.analysisId, mlTaskId: data.mlTaskId });
                }
            }).error(setErrorInScope.bind($scope));
        };

        $scope.createClusteringTemplate = function() {
            DataikuAPI.analysis.createClusteringTemplate(
                $stateParams.projectKey,
                $scope.datasetSmartName,
                $scope.clusteringTaskData.analysisName,
                $scope.clusteringTaskData.backendType,
                '',
                $scope.clusteringTaskData.selectedPolicy.id
            ).success(data => {
                $scope.dismiss && $scope.dismiss();
                $rootScope.mlTaskJustCreated = true;
                if ($scope.clusteringTaskData.selectedPolicy.id === 'ALGORITHMS' || $scope.clusteringTaskData.selectedPolicy.id === 'CUSTOM') {
                    $state.go('projects.project.analyses.analysis.ml.clustmltask.list.design', { analysisId: data.analysisId, mlTaskId: data.mlTaskId, '#': 'algorithms' });
                } else {
                    $state.go('projects.project.analyses.analysis.ml.clustmltask.list.results', { analysisId: data.analysisId, mlTaskId: data.mlTaskId });
                }
            }).error(setErrorInScope.bind($scope));
        };

        $scope.getNotebookHref = function (notebook) {
            if (notebook.type == "JUPYTER") {
                return StateUtils.href.jupyterNotebook(notebook.id, notebook.projectKey);
            } else if (notebook.type == "SQL") {
                return StateUtils.href.sqlNotebook(notebook.id, notebook.projectKey);
            }
        }
        
        // whenever the dataset is ready to be inspected, load the notebooks & analyses already on it
        $scope.$watch("datasetSmartName", nv => {
            if (!nv) return;
            $scope.usability = {};
            var parts = nv.match(/([^\.]+)\.(.+)/) || [nv, $stateParams.projectKey, nv]; // [smart, project, dataset]
            DataikuAPI.datasets.getFullInfo($stateParams.projectKey, parts[1], parts[2])
                .success(function(data) {
                    var hasSql = false;
                    ["sql", "hive", "impala", "pig", "sql99"].forEach(function(thing) {
                        $scope.usability[thing] = GlobalProjectActions.specialThingMaybePossibleFromDataset(data.dataset, thing);
                        hasSql = hasSql || $scope.usability[thing].ok;
                    });
                    $scope.usability.spark = { ok: true };
                    if (!$rootScope.appConfig.sparkEnabled) {
                        if (!$rootScope.appConfig.communityEdition) {
                            $scope.usability.spark.click = $scope.showCERestrictionModal.bind(null, 'Spark');
                        } else if (!$rootScope.addLicInfo.sparkLicensed) {
                            $scope.usability.spark.ok = false;
                            $scope.usability.spark.reason = "Spark is not licensed";
                        } else {
                            $scope.usability.spark.ok = false;
                            $scope.usability.spark.reason = "Spark is not configured";
                        }
                    }
                }).error(setErrorInScope.bind($scope));

            $scope.newAnalysisName = "Analyze " + $scope.datasetSmartName;
            
            DataikuAPI.analysis.listOnDataset($stateParams.projectKey, $scope.datasetSmartName, true)
                .success(data =>  {
                    $scope.analyses = data;
                    data.forEach(function (analysis) {
                        analysis.modelCount = analysis.mlTasks.reduce((sum, task) => sum + task.modelCount, 0);
                        analysis.icon = 'icon-dku-nav_analysis';
                        if (analysis.nbMLTasks === 1) {
                            switch(analysis.mlTasks[0].taskType) {
                                case 'PREDICTION':
                                    if (analysis.mlTasks[0].backendType === 'KERAS') {
                                        analysis.icon = 'icon-dku-deeplearning-prediction';
                                    } else {
                                        analysis.icon = 'icon-dku-automl-prediction';
                                    }
                                break;

                                case 'CLUSTERING':
                                    analysis.icon = 'icon-dku-automl-clustering';
                                break
                            }
                        }
                    });
                }).error(setErrorInScope.bind($scope));

            DataikuAPI.datasets.listNotebooks($stateParams.projectKey, nv)
                .success(data => {
                    $scope.notebooks = data;
                    data.forEach(function(nb) {
                        const lowerCaseLanguage = typeof nb.language === 'string' ? nb.language.toLowerCase() : undefined;
                        switch (nb.type) {
                            case 'JUPYTER':
                                if (lowerCaseLanguage.startsWith('python')) {
                                    nb.icon = 'python';
                                } else if (lowerCaseLanguage === 'ir' || lowerCaseLanguage === 'r'){
                                    nb.icon = 'r';
                                } else if (lowerCaseLanguage === 'julia') {
                                    nb.icon = 'julia';
                                } else if (['scala', 'toree'].includes(lowerCaseLanguage)) {
                                    nb.icon = 'spark_scala';
                                }
                                break;
                            case 'SQL': // @virtual(hive-hproxy), @virtual(hive-jdbc) => hive | @virtual(impala-jdbc) => impala | sql
                                nb.icon = (nb.connection.match(/^@virtual\((hive|impala)-\w+\)/) || [,'sql'])[1];
                                break;
                            default:
                                nb.icon = 'nav_notebook';
                        }
                    });
                }).error(setErrorInScope.bind($scope));
        });

        $scope.newNotebook = () => {
            CreateModalFromTemplate("/templates/notebooks/new-notebook-modal.html", $scope, 'NewNotebookModalController');
        };

        $scope.newNotebookFromTemplate = () => {
            CreateModalFromTemplate("/templates/notebooks/new-notebook-from-template-modal.html", $scope, 'NewNotebookFromTemplateModalController');
        };

        $scope.newNotebookFromFile = () => {
            CreateModalFromTemplate("/templates/notebooks/new-notebook-from-file-modal.html", $scope, 'NewNotebookFromFileModalController');
        };
    });


    app.controller("ProjectMassTableToDatasetController", function ($scope, Assert, CreateModalFromTemplate, $stateParams, $state, DataikuAPI, GlobalProjectActions, Fn, TopNav, ActivityIndicator, Dialogs, MonoFuture, FutureProgressModal, $timeout, $rootScope) {
        $scope.projectKey = $stateParams.projectKey;
        $scope.massImportData = null;
        $scope.uiState = {schemas:[], sourceSchema:null};

        $scope.acceptMassImport = function (zoneId) {
            $scope.candidates.hiveImportCandidates.forEach(candidate => {
                if (candidate.selectedConnectionId) {
                    candidate.selectedConnection = candidate.possibleConnections.find(pc => pc.id == candidate.selectedConnectionId)
                }
            });

            DataikuAPI.connections.massImportTableCandidates($stateParams.projectKey, $scope.candidates.sqlImportCandidates, $scope.candidates.hiveImportCandidates, zoneId).success(function (data) {
                FutureProgressModal.show($scope, data, "Importing tables").then(function (importResult) {
                    if (importResult) {
                        var allCandidates = $scope.candidates.sqlImportCandidates.concat($scope.candidates.hiveImportCandidates);
                        /* if only one item and success, go directly to it */
                        if (importResult.anyMessage && importResult.success && allCandidates.length == 1) {
                            $state.go("projects.project.datasets.dataset.explore", {
                                datasetName: allCandidates[0].datasetName
                            });
                        } else if (importResult.anyMessage) {
                            Dialogs.infoMessagesDisplayOnly($scope, "Import report", importResult).then(() => {
                                $state.go("projects.project.datasets.list", {
                                    projectKey: $scope.projectKey
                                });
                            });
                        }
                    }
                });
            }).error(setErrorInScope.bind($scope));
        };

        $scope.acceptMassImportAlation = function(tables) {
            DataikuAPI.connections.massImportSQL($stateParams.projectKey, $scope.uiState.connectionName, {'tables': tables}).success(function(data) {
                FutureProgressModal.show($scope, data, "Importing tables").then(function(importResult) {
                    if (importResult) {
                        if ($stateParams.fromExternal === "alation" && tables.length === 1 && importResult.maxSeverity === "INFO") {
                            // Fastpath when importing from Alation: skip the success message
                            $state.go("projects.project.datasets.dataset.explore", {"datasetName" : tables[0].datasetName});
                        } else if (importResult.anyMessage) {
                            Dialogs.infoMessagesDisplayOnly($scope, "Import report", importResult).then(function() {$scope.massImportData = null;});
                        } else {
                            $scope.massImportData = null;
                        }
                    }
                });
            }).error(setErrorInScope.bind($scope));
        };

        let importData = JSON.parse($stateParams.importData);

        $scope.removeOneCandidate = function(candidate) {
            $scope.tableImportCandidates.splice($scope.tableImportCandidates.indexOf(candidate), 1);

            var sqlIndex = $scope.candidates.sqlImportCandidates.indexOf(candidate);
            if (sqlIndex >=0) $scope.candidates.sqlImportCandidates.splice(sqlIndex, 1);
            var hiveIndex = $scope.candidates.hiveImportCandidates.indexOf(candidate);
            if (hiveIndex >=0) $scope.candidates.hiveImportCandidates.splice(hiveIndex, 1);
        }


        function refreshList() {
            function cb(data){
                $scope.candidates = data;
                $scope.tableImportCandidates = [];
                data.sqlImportCandidates.forEach(e => {
                    e.connectionType = 'SQL';
                    $scope.tableImportCandidates.push(e);
                });
                data.hiveImportCandidates.forEach(e => {
                    e.connectionType = 'HIVE';
                    if (e.selectedConnection) {
                        e.selectedConnectionId = e.selectedConnection.id;
                    }
                    $scope.tableImportCandidates.push(e);
                });
            }

            if (importData.workflowType == "KEYS") {
                DataikuAPI.connections.getTableImportCandidatesFromKeys(importData.tableKeys, $scope.projectKey).success(function(data){
                    FutureProgressModal.show($scope, data, "Get import data").then(cb)
                }).error(setErrorInScope.bind($scope));
            } else if (importData.workflowType == "SQL" || importData.workflowType == "HIVE") {
                DataikuAPI.connections.getTableImportCandidatesFromExplorer(importData.workflowType, importData.selectedTables, $scope.projectKey).success(function(data){
                    FutureProgressModal.show($scope, data, "Get import data").then(cb)
                }).error(setErrorInScope.bind($scope));
            } else if (importData.workflowType == "ALATION_MCC") {
                DataikuAPI.connections.getTableImportCandidatesFromAlationMCC($stateParams.projectKey, importData.alationSelection)
                    .success(cb)
                    .error(setErrorInScope.bind($scope));
            }
        }

        addDatasetUniquenessCheck($scope, DataikuAPI, $scope.projectKey);

        if ($stateParams.importData) {

            if ($stateParams.fromExternal === "alation") {
                $scope.uiState.fromExternal = "alation";
                Assert.inScope($rootScope, 'alationCatalogSelection');
                DataikuAPI.connections.listMassImportSQLFromAlation($stateParams.projectKey, $rootScope.alationCatalogSelection).success(function(data){
                    $scope.massImportData = {"tables": data};
                    $scope.uiState.connectionName = data.connectionName;
                    data.tables.forEach(function(x) { x.checked = true; });
                }).error(setErrorInScope.bind($scope));
            } else {
                refreshList();
            }

        }

    });

    app.controller("AlationOpenController", function ($scope, $stateParams, $state, DataikuAPI, GlobalProjectActions, Fn, TopNav, ActivityIndicator, Dialogs, MonoFuture, FutureProgressModal, $rootScope) {
        TopNav.setNoItem();

        $scope.importNewDataset = {}

        $scope.import = function(){
            $state.go("projects.project.tablesimport", {
                projectKey : $scope.importNewDataset.targetProjectKey,
                importData : JSON.stringify({
                    workflowType : "ALATION_MCC",
                    alationSelection: $scope.alationOpen.catalogSelection
                })
            })
        }

        DataikuAPI.connections.getAlationOpenInfo($stateParams.alationOpenId).success(function(data){
            $scope.alationOpen = data;
            if (data.connectionName) $scope.uiState.connectionName = data.connectionName;
            //data.tables.forEach(function(x) { x.checked = true; });
        }).error(setErrorInScope.bind($scope));
    });

    app.controller("ProjectsProjectMassImportController", function ($scope, CreateModalFromTemplate, $stateParams, $state, DataikuAPI, GlobalProjectActions, Fn, TopNav, ActivityIndicator, Dialogs, MonoFuture, FutureProgressModal) {
        TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_NONE, null);
        TopNav.setNoItem();
    });

    app.controller("ConnectionsExplorerController", function ($scope, CreateModalFromTemplate, $stateParams, $state, DataikuAPI, GlobalProjectActions, Fn, TopNav, ActivityIndicator, Dialogs, MonoFuture, FutureProgressModal, $timeout) {
        const ANY = '_any_';
        if ($stateParams.projectKey) {
            TopNav.setLocation(TopNav.TOP_FLOW, "datasets", TopNav.TABS_NONE, null);
            TopNav.setNoItem();
            $scope.massImportTargetProjectKey = $stateParams.projectKey;
        }
        $scope.catalog = $stateParams.catalogName ? $stateParams.catalogName : ANY;
        $scope.schema = $stateParams.schemaName ? $stateParams.schemaName : ANY;

        $scope.massImportData = null;
        $scope.uiState = {schemas: [], sourceSchema: null, importConnectionName: null};
        $scope.selection = {orderReversed: false};
        $scope.isCatalogPresent = false;
        $scope.connection = null;

        $scope.importTables = function (zoneId) {
            if ($stateParams.projectKey) {
                $state.go('projects.project.tablesimport', {
                    projectKey: $stateParams.projectKey,
                    importData: JSON.stringify($scope.getImportData()),
                    zoneId
                });
            } else {
                CreateModalFromTemplate("/templates/datasets/tables-import-project-selection-modal.html", $scope,
                    "TablesImportProjectSelectionModalController");
            }
        };
        $scope.sortBy = function (columnName) {
            if ($scope.selection.orderQuery == columnName) {
                $scope.selection.orderReversed = !$scope.selection.orderReversed;
            } else {
                $scope.selection.orderQuery = columnName;
            }
        };
        $scope.isSortedBy = function (columnName, reversed) {
            if (!$scope.selection || !$scope.selection.orderQuery) return false;
            return $scope.selection.orderQuery == columnName && $scope.selection.orderReversed === reversed;
        };
        $scope.getImportData = function () {
            if ($scope.isHdfs) {
                return {
                    workflowType : "HIVE",
                    selectedTables : $scope.selection.selectedObjects
                };
            } else {
                return {
                    workflowType : "SQL",
                    selectedTables : $scope.selection.selectedObjects
                }
            }
        };

        $scope.isCatalogAware = function() {
            return $scope.connection && ($scope.connection.type === 'BigQuery' || $scope.connection.type === 'Snowflake');
        };

        function assignConnectionRelatedVariables() {
            $scope.isHdfs = $scope.connection.type === 'HDFS';
            if ($scope.isHdfs) {
                $scope.selection.orderQuery = "name";
            } else {
                $scope.selection.orderQuery = "key.name";
            }
        }

        /* HANA organizes tables and calculation views into virtual packages embedded in table names,
         * in the form of package.name/table:name:in:the:package
         * or /package.name:sometimes:with:colons/table:name:in:the:package.
         * Since it's messy for users, allow quick filtering on these virtual packages */
        function buildHANAPackagesList() {
            $scope.massImportData.hanaPackages = null;
            if ($scope.massImportData.connectionType == "SAPHANA") {
                const packagesSet = new Set($scope.massImportData.tables.map(e => {
                    let firstSlash = e.table.indexOf("/");
                    if (firstSlash == 0) {
                        firstSlash = e.table.indexOf("/", 1);
                    }
                    if (firstSlash > 0) {
                        return e.table.substring(0, firstSlash)
                    } else {
                        return null;
                    }
                }));
                packagesSet.delete(null);
                if (packagesSet.size > 0) {
                    $scope.massImportData.hanaPackages =  Array.from(packagesSet);
                }
            }
        }

        $scope.refreshList = function () {
            let monofuture;

            if ($scope.isHdfs) {
                monofuture = MonoFuture($scope).wrap(DataikuAPI.connections.listHiveMassImportTables)($scope.connection.name, $stateParams.projectKey).success(function (data) {
                    $state.go('.', {connectionName: $scope.connection.name, schemaName: null, catalogName: null}, {notify: false});
                    $scope.listFuture = null;
                    $scope.showInputScreen = false;

                    $timeout(() => {
                        $scope.massImportData = {"tables": data.result.tables};
                    });
                });
            } else {
                const catalog = $scope.catalog === ANY ? null : $scope.catalog;
                const schema = $scope.schema === ANY ? null : $scope.schema;
                monofuture = MonoFuture($scope).wrap(DataikuAPI.connections.listSQLMassImportTables)($scope.connection.name, catalog, schema, $stateParams.projectKey).success(function (data) {
                    $state.go('.', {
                        connectionName: $scope.connection.name,
                        catalogName: $scope.catalog,
                        schemaName: $scope.schema
                    }, {notify: false});
                    $scope.listFuture = null;
                    $scope.showInputScreen = false;

                    $timeout(() => {
                        $scope.massImportData = data.result;
                        $scope.isCatalogPresent = $scope.massImportData.tables.find(e => e && e.catalog);
                        $scope.isSchemaPresent = $scope.massImportData.tables.find(e => e && e.schema);
                        buildHANAPackagesList();
                    });

                });

            }
            monofuture.update(function (data) {
                $scope.listFuture = data;
            }).error(function (data, status, headers) {
                $scope.listFuture = null;
                setErrorInScope.bind($scope)(data, status, headers);
            });
        };

        $scope.indeterminateSelectionState = function() {
            if ($scope.massImportData) {
                var tables = $filter('filter')($scope.massImportData.tables, $scope.uiState.query);
                var selectedCount = tables.filter(function(table) {
                    return table.checked;
                }).length;
                var unselectedCount = tables.filter(function(table) {
                    return !table.checked;
                }).length;
                return selectedCount != tables.length && unselectedCount != tables.length;
            } else {
                return false;
            }
        };

        DataikuAPI.connections.listMassImportSources($stateParams.projectKey).success(function(data) {
            $scope.massImportSourcesResult = data;
            $scope.connections = data.sources;
            if ($stateParams.connectionName) {
                $scope.connection = $scope.connections.find(c => {
                    return c.name === $stateParams.connectionName
                });
                assignConnectionRelatedVariables();
                if ($scope.connection.type === 'HDFS' || $stateParams.schemaName) {
                    $scope.refreshList();
                } else {
                    $scope.showInputScreen = true;
                }
            } else {
                $scope.showInputScreen = true;
            }
        }).error(setErrorInScope.bind($scope));

        $scope.$watch('connection', (connection, oldVal) => {
            if (connection) {
                $scope.massImportData = { "tables": [] };
                assignConnectionRelatedVariables();

                if (!$scope.isHdfs && $scope.connection.name != $scope.connectionOfSchemas) {
                    $scope.connectionOfSchemas = null;
                    $scope.fetchedSchemas = null;
                    $scope.schemas = [{ label: 'Any', schema: ANY }];
                    $scope.catalogs = [{ label: 'Any', catalog: ANY }];
                    if (oldVal) {
                        // We are changing the connection
                        $scope.catalog = ANY;
                        $scope.schema = ANY;
                    } else {
                        // We are loading the connection for the first time
                        if ($scope.schema !== ANY) {
                            $scope.schemas = $scope.schemas.concat({ label: $scope.schema, schema: $scope.schema });
                        }
                        if ($scope.catalog !== ANY) {
                            $scope.catalogs = $scope.catalogs.concat({ label: $scope.catalog, catalog: $scope.catalog });
                        }
                    }
                }
            }
        });

        $scope.$watch('catalog', (newVal, oldVal) => {
            // Update the available schemas depending on the selected catalog
            if (newVal !== oldVal && $scope.fetchedSchemas) {
                let availableSchemas;
                if (newVal && newVal !== ANY) {
                    availableSchemas = $scope.fetchedSchemas.filter(schema => schema.catalog === newVal);
                } else {
                    availableSchemas = $scope.fetchedSchemas;
                }
                const uniqueSchemas = [...new Set(availableSchemas.map(schema => schema.schema))];
                $scope.schemas = [{ label: 'Any', schema: ANY }].concat(uniqueSchemas.map(s => ({
                    label: s,
                    schema: s
                })));
            }
        });

        $scope.fetchSchemas = function() {
            var connectionName = $scope.connection.name;
            if ($scope.isCatalogAware()) {
                DataikuAPI.connections.listSQLMassImportSchemasWithCatalogs(connectionName, $stateParams.projectKey).success(function(data) {
                    $scope.connectionOfSchemas = connectionName;
                    $scope.fetchedSchemas = data;
                    const uniqueCatalogs = [...new Set(data.map(schema => schema.catalog))];
                    const uniqueSchemas = [...new Set(data.map(schema => schema.schema))];
                    $scope.catalogs = [{ label: 'Any', catalog: ANY }].concat(uniqueCatalogs.map(c => ({
                        label: c,
                        catalog: c
                    })));
                    $scope.schemas = [{ label: 'Any', schema: ANY }].concat(uniqueSchemas.map(s => ({
                        label: s,
                        schema: s
                    })));
                    if ($scope.catalog !== ANY && !uniqueCatalogs.contains($scope.catalog)) {
                        $scope.catalog = null;
                    }
                    if ($scope.schema !== ANY && !uniqueSchemas.contains($scope.schema)) {
                        $scope.schema = null;
                    }
                }).error(setErrorInScope.bind($scope));
            } else {
                DataikuAPI.connections.listSQLMassImportSchemas(connectionName, $stateParams.projectKey).success(function(data) {
                    $scope.connectionOfSchemas = connectionName;
                    $scope.catalogs = [{ label: 'Any', catalog: ANY }];
                    $scope.schemas = [{ label: 'Any', schema: ANY }].concat(data.map(s => ({
                        label: s,
                        schema: s
                    })));
                    $scope.catalog = ANY;
                    if ($scope.schema !== ANY && !data.contains($scope.schema)) {
                        $scope.schema = null;
                    }
                }).error(setErrorInScope.bind($scope));
            }
        };
    });

})();
