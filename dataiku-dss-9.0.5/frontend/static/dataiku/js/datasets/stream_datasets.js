(function() {
'use strict';

const app = angular.module('dataiku.datasets');


app.controller("StreamOrientedDatasetControllerFragment", function($scope, $rootScope, $stateParams, MonoFuture, $q,
                Assert, DataikuAPI, WT1, DatasetsService, Dialogs, DatasetUtils, LoggerProvider,
                FutureProgressModal, CreateModalFromTemplate, PluginConfigUtils) {

    var Logger = LoggerProvider.getLogger('datasets.stream');

    $scope.detectScheme = function() {
        return DataikuAPI.datasets.detectFilePartitioning($scope.dataset);
    };
    $scope.testScheme = function() {
        return DataikuAPI.datasets.testFilePartitioning($scope.dataset);
    };

    $scope.setSchemaUserModified = function() {
        $scope.schemaJustModified = true;
        $scope.dataset.schema.userModified = true;
    };

    $scope.inferStorageTypesFromData = function(){
        Dialogs.confirm($scope,
            "Infer storage types from data",
            "This only takes into account a very small sample of data, and could lead to invalid data. "+
            "For safer typing of data, use a prepare recipe.").then(function(){
                $scope.dataset.schema.userModified = false;
                $scope.preview(true);
        });
    };

    function waitTestDetectFuture(mfWrapped){
        var deferred = $q.defer();
        mfWrapped.success(function(data) {
            $scope.testingFuture = null;
            deferred.resolve(data.result);
        }).update(function(data){
            $scope.testingFuture = data;
        }).error(function (data, status, headers) {
            $scope.testingFuture = null;
            $scope.detectionResults = null;
            $scope.doingPreviewOrDetection = false;
            setErrorInScope.bind($scope)(data, status, headers);
        });
        return deferred.promise;
   }

    $scope.detectFormat = function () {
        //$scope.detectionResults = null;
        $scope.doingPreviewOrDetection = true;
        WT1.event("dataset-detectformat-start", {datasetType : $scope.dataset.type, datasetManaged : $scope.dataset.managed})

        waitTestDetectFuture(MonoFuture($scope).wrap(DataikuAPI.datasets.detect_format)($stateParams.projectKey, $scope.dataset))
            .then(function(dRes){
            Logger.info('Got detection result', dRes, $scope.dataset.params);
            $scope.detectionResults = dRes;
            $scope.doingPreviewOrDetection = false;
            if (!$scope.dataset.name && !$scope.new_dataset_name_manually_edited) {
                $scope.new_dataset_name = $scope.detectionResults.suggestedName;
            }
            if ($scope.detectionResults.connectionOK) {
                $scope.dataset.formatParams = $scope.dataset.formatParams || {};
                if ($scope.detectionResults.empty) {
                    $scope.updateTableFromPreviewResult();
                } else {
                    if ($scope.detectionResults.format) {
                        /* Load the detected format params in the dataset */
                        $scope.dataset.formatType = $scope.detectionResults.format.type;
                        $scope.dataset.formatParams = $scope.detectionResults.format.params || {};
                        $scope.updateTableFromPreviewResult();
                    } else {
                        //  $scope.detectionResults.format = { table : null,
                        //     errorMessage : 'Failed to detect a format, please manually configure',
                        //     metadata : {}
                        // };
                    }
                }
            }
            getDigestTime($scope, function(time) {
                var d = $.isEmptyObject($scope.dataset.formatParams) ? "failed" : JSON.stringify($scope.dataset.formatParams);
                WT1.event("dataset-detectformat-done",
                    {datasetType : $scope.dataset.type, datasetManaged : $scope.dataset.managed, digestTime : time,
                     detectedType : $scope.dataset.formatType, detectedParams :  d});
            });
        });//.error(setErrorInScope.bind($scope));
    };

    $scope.$watch("dataset.formatType", function() {
    	if (!$scope.dataset.formatType) return;
        /* get plugin desc of format if needed*/
        if ($scope.dataset.formatType.startsWith("jformat")) {
            $scope.loadedDesc = $rootScope.appConfig.customJavaFormats.filter(function(x){
                return x.formatterType == $scope.dataset.formatType;
            })[0];
            $scope.pluginId = $scope.loadedDesc ? $scope.loadedDesc.ownerPluginId : null;
        }
        if ($scope.dataset.formatType.startsWith("format")) {
            $scope.loadedDesc = $rootScope.appConfig.customPythonFormats.filter(function(x){
                return x.formatterType == $scope.dataset.formatType;
            })[0];
            $scope.pluginId = $scope.loadedDesc ? $scope.loadedDesc.ownerPluginId : null;
        }

        /* Set default values for custom formats */
        if ($scope.dataset.formatType.startsWith("jformat") || $scope.dataset.formatType.startsWith("format")) {
            $scope.formats[$scope.dataset.formatType].params.some(function(elt) {
                if (elt.type === "autoconfig") {
                    PluginConfigUtils.setDefaultValues(elt.params, $scope.dataset.formatParams.config);
                    return true;
                }
                return false;
            });
        }

    });

    $scope.preview = function (inferStorageTypes) {
        $scope.doingPreviewOrDetection = true;

        if (inferStorageTypes == null) inferStorageTypes = false;

        WT1.event("dataset-preview-start", {datasetType : $scope.dataset.type, datasetManaged : $scope.dataset.managed})
        waitTestDetectFuture(MonoFuture($scope).wrap(DataikuAPI.datasets.preview)($stateParams.projectKey, $scope.dataset, inferStorageTypes))
        .then(function (data) {
            Logger.info('Got preview result', data, $scope.dataset.params);
            $scope.detectionResults = data;
            $scope.doingPreviewOrDetection = false;
            if (!$scope.firstPreviewDone) {
                if (data.connectionOK) {
                    //$scope.goToPreview();
                }
                $scope.firstPreviewDone = true;
            }
            //$scope.testOrDetectPartitioningIfNeeded();
            $scope.updateTableFromPreviewResult();
            getDigestTime($scope, function(time) {
                WT1.event("dataset-preview-done", {
                    datasetType : $scope.dataset.type, datasetManaged : $scope.dataset.managed, digestTime : time,
                    formatType : $scope.dataset.formatType, formatParams : $scope.dataset.formatParams});
            });
        })
    };

    /* Manual change of format type : redo a detection limited to this type*/
    $scope.onFormatTypeChanged = function () {
        clear($scope.dataset.formatParams);

        WT1.event("dataset-detectformat-onetype-start",{
                    datasetType : $scope.dataset.type, datasetManaged : $scope.dataset.managed, formatType : $scope.dataset.formatType});

        $scope.doingPreviewOrDetection = true;
        waitTestDetectFuture(MonoFuture($scope).wrap(DataikuAPI.datasets.detectOneFormat)($stateParams.projectKey, $scope.dataset, $scope.dataset.formatType))
            .then(function(data) {
            $scope.doingPreviewOrDetection = false;
            $scope.detectionResults = data;
            if (!$scope.detectionResults.format) {
                /* Could not detect anything for this format ... */
                clear($scope.dataset.formatParams);
                $scope.detectionResults.format = { table : null,
                    errorMessage : 'Failed to detect suitable parameters for this format, please manually configure',
                    metadata : {}
                };
            } else {
                var fmt = $scope.detectionResults.format;
                Assert.trueish(fmt.type == $scope.dataset.formatType, 'detected format is not the current dataset format');
                // Don't change formatParams, clear and refill
                if ($scope.dataset.formatParams == null) $scope.dataset.formatParams = {}
                mapCopyContent($scope.dataset.formatParams, fmt.params);
            }
            $scope.updateTableFromPreviewResult();

            WT1.event("dataset-detectformat-onetype-done",{
                datasetType : $scope.dataset.type, datasetManaged : $scope.dataset.managed, formatType : $scope.dataset.formatType});
        });
    };

    /* Change of format params : just update preview */
    $scope.onFormatParamsChanged = function () {
        /*  User changed format params, so stop changing them automatically if core params change */
        if ($scope.dataset.formatParams.style == 'excel' && $scope.dataset.formatParams.quoteChar != '"') {
            $scope.dataset.formatParams.quoteChar = '"';
        }
        $scope.redetectFormatOnCoreParamsChanged = false;
        $scope.preview();
    };

    $scope.updateTableFromPreviewResult = function () {
        Assert.inScope($scope, 'detectionResults');
        var dRes = $scope.detectionResults;
        if (!dRes.connectionOK) {
            dRes.format = { table : null, errorMessage : "Connection failed: " + dRes.connectionErrorMessage };
            return;
        }
        $scope.consistency = { empty : dRes.empty };
        $scope.consistency.kind = DatasetUtils.getKindForConsistency($scope.dataset);
        if (dRes.empty) {
            if ($scope.dataset.formatType == null) {
                $scope.dataset.formatType = 'csv';
                $scope.dataset.formatParams = {
                    'separator': '\t',
                    'charset': 'utf8'
                };
            }
        } else {
            Assert.trueish(dRes.format, 'no format detected');
            $scope.consistency.result = dRes.format.schemaDetection;
            if (dRes.format.schemaDetection) {
                $scope.dataset.schema = dRes.format.schemaDetection.newSchema;
            }
            $scope.schemaJustModified = false;
        }
    };

    $scope.clearDataset = function(){
        DatasetsService.clear($scope, $scope.dataset.projectKey, $scope.dataset.name).then(function(){
            $scope.preview();
        });
    };

    $scope.overwriteSchema = function(newSchema) {
        WT1.event("dataset-discard-schema-changed",{
                    datasetType : $scope.dataset.type, datasetManaged : $scope.dataset.managed});
        $scope.dataset.schema =angular.copy(newSchema);
        $scope.schemaJustModified = false;
        $scope.consistency = null;
        // Trigger a new preview
        $scope.preview();
    };

    $scope.discardConsistencyError= function(){
        $scope.consistency = null;
    };

    $scope.schemaIsUserModified = function () {
        return $scope.dataset.schema != null && $scope.dataset.schema.userModified;
    };
    $scope.dataset.formatParams = $scope.dataset.formatParams || {};

    $scope.testSchemaConsistencyOnAllFiles = function(){
        Dialogs.confirm($scope, "Test schema consistency on all files",
            "This operation can be very slow if your dataset has many files").then(function(){
                DataikuAPI.datasets.testSchemaConsistencyOnAllFiles($scope.dataset).success(function(data){
                    FutureProgressModal.show($scope, data, "Checking schema consistency").then(function(result){
                        CreateModalFromTemplate("/templates/datasets/modals/all-files-schema-consistency-modal.html", $scope, null, function(newScope){
                            newScope.result = result;
                        })
                    });
                }).error(setErrorInScope.bind($scope));
        });
    }
});


app.controller("TwitterStreamDatasetController", function($scope, $stateParams, Assert, DataikuAPI, $timeout, WT1) {
    $scope.onLoadComplete = function () {
        Assert.inScope($scope, 'dataset');
        Assert.trueish($scope.dataset.type == "Twitter", 'not a Twitter dataset');

        if (!$scope.dataset.params.keywords) {
            $scope.dataset.params.keywords = [];
        }

        if (!$scope.dataset.formatType) {
            $scope.dataset.formatType = "csv";
        }

        if ($scope.dataset.formatParams == null || Object.keys($scope.dataset.formatParams).length === 0) {
            $scope.dataset.formatParams = {
                "quoteChar": "\"",
                "escapeChar": "\\",
                "style": "unix",
                "charset": "utf8",
                "arrayMapFormat": "json",
                "parseHeaderRow": "false",
                "separator": "\t"
            };
        }
        $scope.dataset.partitioning = {
            "filePathPattern": "%Y/%M/%D/%H/.*",
            "ignoreNonMatchingFile": false,
            "considerMissingRequestedPartitionsAsEmpty": false,
            "dimensions": [
            {
              "name": "date",
              "type": "time",
              "params": {
                "period": "HOUR"
              }
            }
            ]
        };

        if(!$scope.dataset.schema){
            $scope.dataset.schema = {userModified : false};
        }

        if(!$scope.dataset.schema.columns){
            $scope.dataset.schema.columns = [];
        }

        $scope.toggleField = function(field){
            if($scope.containsColumn(field)){ // remove
                $scope.dataset.schema.columns = $scope.dataset.schema.columns.filter(
                    function(e){ return e.name != field; });
            } else {
                $scope.dataset.schema.columns.push({
                    "name": field,
                    "type": "string",
                    "maxLength": 1000
                });
            }
        }

        $scope.containsColumn = function(name){
            for(var c in $scope.dataset.schema.columns){
                if($scope.dataset.schema.columns[c]["name"] == name){
                    return true;
                }
            }
            return false;
        }

        if($scope.dataset.schema.columns.length === 0){
            $scope.dataset.schema.columns.push({
                "name": "id_str",
                "type": "string",
                "maxLength": 1000
            });
            $scope.dataset.schema.columns.push({
                "name": "created_at",
                "type": "string",
                "maxLength": 1000
            });
            $scope.dataset.schema.columns.push({
                "name": "user.screen_name",
                "type": "string",
                "maxLength": 1000
            });
            $scope.dataset.schema.columns.push({
                "name": "text",
                "type": "string",
                "maxLength": 1000
            });
        }

        $scope.keywordItems = $scope.dataset.params.keywords.map(function(f) { return { keyword: f }; });
    }

    $scope.keywordsChanged = function(newKeywords = []) {
        [].splice.apply($scope.dataset.params.keywords,
            [0, $scope.dataset.params.keywords.length].concat(newKeywords.map(function(fi) { return fi.keyword; })));
    };

    $scope.isReady = function(){
        return !angular.isUndefined($scope.dataset.params.keywords) &&
                ($scope.dataset.params.keywords.length !== 0) && ($scope.connectionTwitter) && $scope.dataset.params.path && $scope.dataset.params.path!='/';
    };

    $scope.$watch("new_dataset_name", function(nv, ov) {
        if (nv && nv.length &&
            (($scope.dataset.params.path == "/") || !$scope.dataset.params.path || (ov && $scope.dataset.params.path == ('/'+$stateParams.projectKey + '.' + ov)))) {
            $scope.dataset.params.path =  "/" + $stateParams.projectKey + '.' + nv;
        }
    }, true);

    $scope.isRunning = false;
    $scope.hasData = false;

    $scope.saveHooks.push(function() {
        if($scope.dataset && $scope.dataset.params) {
            var path = $scope.dataset.params.path;
            return path && path!='/';
        }
        return false;
    });

    // isRunning is true if there's a twitter capture of the current dataset
    // hasData is true if at least a tweet has been written

    if (angular.isDefined($scope.dataset.name)) {
        DataikuAPI.datasets.getTwitterStatus($stateParams.projectKey, $scope.dataset.name).success(function(res) {
            $scope.isRunning = res.isStarted;
            $scope.hasData = res.hasData;
        });
    }

    if (angular.isUndefined($scope.dataset.params.path)) {
        $scope.dataset.params.path = '/';
    }

    // If there's an active twitter connection, we retrieve it...
    if (angular.isUndefined($scope.connectionTwitter)) {
        DataikuAPI.connections.getTwitterConfig().success(function(data) {
            $scope.connectionTwitter = data.connection;
        }).error(function(){
            setErrorInScope.bind($scope);
        });
    }

    // ... Otherwise, we see if there's a twitter connection
    if(!$scope.connectionTwitter){
        DataikuAPI.connections.getNames('Twitter').success(function (data) {
            $scope.connectionsTwitter = data;
            if ($scope.connectionsTwitter.length > 0) {
                $scope.connectionTwitterSelection = $scope.connectionsTwitter[0];
            }
            $scope.hasConnectionsTwitter = $scope.connectionsTwitter.length > 0;
        }).error(setErrorInScope.bind($scope));
    }

    $scope.toggleStreaming = function(start){
        DataikuAPI.datasets.controlTwitterStreaming($stateParams.projectKey, $scope.dataset.name, start).success(function() {
            $scope.isRunning = start;
        }).error(function() {
            setErrorInScope.bind($scope);
            DataikuAPI.datasets.getTwitterStatus($stateParams.projectKey, $scope.dataset.name).success(function(res) {
                $scope.isRunning = res.isStarted == "true" ? true : false;
            });
        });
    };

    DataikuAPI.connections.getNames('Filesystem').success(function (data) {
        $scope.connections = data;
        if ($scope.connections.length > 0 && ($scope.dataset.params.connection == null || $scope.dataset.params.connection.length === 0)) {
            for(var i = 0; i < $scope.connections.length; i++){
                if($scope.connections[i] == "filesystem_managed"){
                    $scope.dataset.params.connection = $scope.connections[i];
                } else {
                    $scope.dataset.params.connection = $scope.connections[0];
                }
            }
        }
    }).error(setErrorInScope.bind($scope));
});


/** For the moment, we have one controller for managed fs-like and external ... */
app.controller("ManagedFSLikeDatasetController", function($scope, $controller) {
    $controller("ExternalStreamOrientedDatasetController", {$scope:$scope});
});


app.controller("ExternalStreamOrientedDatasetController", function($scope, $controller, $stateParams, DataikuAPI, $timeout, WT1, CreateModalFromTemplate) {
    $controller("StreamOrientedDatasetControllerFragment", {$scope:$scope});
    $scope.onLoadComplete = function () {
        $scope.uiState.activeTab = 'connection'
        $scope.uiState.autoTestOnFileSelection = true;
        $scope.uiState.listFilesSelectedOnly = false;

        if ($stateParams.datasetName) {
            /* If, when we arrive, the dataset does not have a format yet, then each time the core params
             * change, we'll redo a detection. That allows us to better react to the core params actually
             * targeting different files during the process
             */
            if (angular.isDefined($scope.dataset.formatParams)) {
                $scope.redetectFormatOnCoreParamsChanged = false;
            } else {
                $scope.redetectFormatOnCoreParamsChanged = true;
            }
            /* Fire initial preview-detection */
            //$scope.preview();
        }
    };

    $scope.getFilesListingHeight = function(filesListing) {
        return Math.min(28*filesListing.paths.length, 235);
    }

    $scope.getAlertClassForResultsOnConnectionTab = function(dRes){
        if (!dRes) return "";
        if (!dRes.connectionOK) return "alert-error";
        if (dRes.empty) return "alert-warning";
        if (!dRes.format || !dRes.format.ok) return "alert-error";
        if (dRes.format && dRes.format.ok && dRes.format.schemaDetection && dRes.format.schemaDetection.warningLevel == 'WARN') return "alert-warning";
        return "alert-success";
    }
    $scope.getAlertClassForResultsOnPreviewTab = function(dRes) {
        if (!dRes) return "";
        if (!dRes.connectionOK) return "alert-error";
        if (dRes.empty) return "alert-warning";
        if (!dRes.format || !dRes.format.ok) return "alert-error";
        return "ng-hide"; // Don't display if OK
    }

    $scope.startUpdateFromHive = function() {
        CreateModalFromTemplate("/templates/datasets/fragments/update-from-hive-modal.html", $scope, "UpdateDatasetFromHiveController");
    };

    $scope.detectOrPreview = function(){
        var shouldDetect = ($scope.dataset.formatParams == null || $scope.dataset.formatParams.length === 0 || angular.isUndefined($scope.dataset.formatType) || $scope.redetectFormatOnCoreParamsChanged);

        if (shouldDetect) {
            $scope.detectFormat();
        } else {
            $scope.preview();
        }
    }

    /* Params changed : trigger smart detection-or-preview */
    $scope.onCoreParamsChanged = function(){
        if ($scope.uiState.autoTestOnFileSelection) $scope.detectOrPreview();
    };

    /* Manual force format redetection: drop current data and trigger detection */
    $scope.forceFormatRedetection = function () {
        $scope.dataset.formatType = null;
        clear($scope.dataset.formatParams); // formatParams is watched, never reassign it.
        $scope.detectFormat();
    };

     $scope.listFiles = function(providerType){
        DataikuAPI.fsproviders.listFiles(providerType, $scope.dataset.params, $scope.projectKey || $stateParams.projectKey, $scope.contextVars || {},
            $scope.dataset.params.filesSelectionRules, $scope.uiState.listFilesSelectedOnly).success(function(data){
                $scope.uiState.filesListing = data;
            }).error(setErrorInScope.bind($scope));
    }

    $scope.addExplicitSelect = function(path) {
        path.selected = true;
        $scope.dataset.params.filesSelectionRules.explicitFiles.push(path.path);
        $scope.uiState.filesListing.selectedFiles ++;
        $scope.uiState.filesListing.selectedSize += path.size;
    }

    $scope.addIncludeRule = function(path) {
        path.selected = true;
        var p = path.path;
        if (p.startsWith('/')) p = p.substring(1);
        $scope.dataset.params.filesSelectionRules.includeRules.push({expr:p,mode:'GLOB',matchingMode:'FULL_PATH'});
        $scope.dataset.params.filesSelectionRules.includeRules = [].concat($scope.dataset.params.filesSelectionRules.includeRules); // touch the array to force a refresh of the listForm
        $scope.uiState.filesListing.selectedFiles ++;
        $scope.uiState.filesListing.selectedSize += path.size;
    }

    function updateCreationWarning(){
        let warnings = [];
        $scope.uiState.creationWarning = null;
        if (!$scope.new_dataset_name) return;

        if (["HDFS", "Filesystem", "SCP", "SFTP", "FTP", "S3", "GCS", "Azure"].indexOf($scope.dataset.type) >= 0) {
            if (!$scope.dataset.params || !$scope.dataset.params.path || "/" == $scope.dataset.params.path || "" == $scope.dataset.params.path) {
                warnings.push("Dataset at root of connection. This is atypical. Do you want to create a managed dataset?");
            }
        }

        if ($scope.dataset.type != 'Inline') {
            if (!$scope.dataset.formatType || !$scope.dataset.formatParams) {
                warnings.push("No format configured, dataset won't be usable");
            }
            if (!$scope.dataset.schema || !$scope.dataset.schema.columns || !$scope.dataset.schema.columns.length) {
                warnings.push("No schema set, dataset won't be usable");
            }
        }
        if (warnings.length > 0) {
            $scope.uiState.creationWarning = warnings.join("; ");
        }
    }


    $scope.$watch("dataset", updateCreationWarning, true);
    $scope.$watch("new_dataset_name", updateCreationWarning);

});

app.controller("UpdateDatasetFromHiveController", function($scope, DataikuAPI, $stateParams) {
    var handleHiveImportability = function(data) {
        var messages = data.importability.messages;
        $scope.hiveDataset = data.importability.dataset;
        $scope.hiveSyncOutcome = messages.error ? 'FAILED' : (messages.warning ? 'WARNING' : 'SUCCESS');
        $scope.hiveSyncMessage = '';
        messages.messages.forEach(function(message) {
            $scope.hiveSyncMessage = $scope.hiveSyncMessage + "\n" + (message.details || message.message);
        });
        if ($scope.hiveDataset == null && $scope.hiveSyncOutcome == 'SUCCESS') {
            // mmh. should not be null.
            $scope.hiveSyncOutcome = 'FAILED';
            $scope.hiveSyncMessage = $scope.hiveSyncMessage || "No dataset could be built from table";
        } else {
            $scope.connectionIsSubdirSynchronized = data.connectionIsSubdirSynchronized;
            $scope.schemaIncompatibilities = data.schemaIncompatibilities;
            $scope.connectionIncompatibility = data.connectionIncompatibility;
            $scope.pathIncompatibility = data.pathIncompatibility;
            $scope.partitioningIncompatibility = data.partitioningIncompatibility;
        }
    };

    $scope.hasIncompatibilities = function() {
        return $scope.connectionIsSubdirSynchronized || ($scope.schemaIncompatibilities && $scope.schemaIncompatibilities.length) || $scope.connectionIncompatibility || $scope.pathIncompatibility || $scope.partitioningIncompatibility;
    };

    $scope.checkHiveImportability = function(importability) {
        $scope.hiveCheckInProgress = true;
        DataikuAPI.datasets.checkHiveSync($stateParams.projectKey, $stateParams.datasetName).success(function (data) {
            $scope.hiveCheckInProgress = false;
            handleHiveImportability(data);
        }).error(function(a,b,c) {
            $scope.hiveCheckInProgress = false;
            setErrorInScope.bind($scope)(a,b,c);
        });
    };


    $scope.checkHiveImportability();
});

app.service("FSProviderUtils", function(){

})

app.directive('fsFilesSelection', function(DataikuAPI, $stateParams, WT1, Debounce) {
    return {
        restrict: 'A',
        templateUrl: '/templates/datasets/fragments/fs-files-selection.html',
        scope: {
            params : '='
        },
        link: function($scope, element, attrs) {
            $scope.filesSelectionRulesModes = [['ALL', 'All'],
                                               ['EXPLICIT_SELECT_FILES', 'Explicitly select files'],
                                               ['RULES_ALL_BUT_EXCLUDED', 'All but excluded'],
                                               ['RULES_INCLUDED_ONLY', 'Only included']];
            $scope.filesSelectionRulesModesDesc = ['No filtering',
                                                   'Select individual files from the directory at Path',
                                                   'Any file from the directory at Path that match a rule is ignored ',
                                                   'Only files from the directory at Path that match a rule are taken'];
            if (!$scope.params.filesSelectionRules) {
                $scope.params.filesSelectionRules = {
                    mode: "ALL", includeRules:[], excludeRules:[]
                };
            }
            $scope.prepareNewRule = function(rule) {
                if (!rule.mode) rule.mode = "GLOB";
                if (!rule.matchingMode) rule.matchingMode = "FULL_PATH";
            }
        }
    };
});

app.directive('fsProviderBucketSelector', function(DataikuAPI, $stateParams, WT1, Debounce) {
    return {
        restrict: 'A',
        templateUrl: '/templates/datasets/fs-provider-bucket-selector.html',
        scope: {
            providerType : '=',
            projectKey : '=',
            config : '=',
            contextVars : '=',
            bucketLabel : '=',
            bucketProperty : '='
        },
        link: function($scope, element, attrs) {
            $scope.selectorUiState = {mode:'CUSTOM', fetchingBucketList:false, couldListBuckets: null, bucketsListError: null, buckets: null};

            var fetchConnectionMetadata = function() {
                if ($scope.config == null || $scope.config.connection == null) return;
                DataikuAPI.fsproviders.testConnection($scope.providerType, $scope.config, $scope.projectKey || $stateParams.projectKey, $scope.contextVars || {}, false)
                    .success(function (data) {
                        $scope.connMeta = data;
                    })
                    .error(setErrorInScope.bind($scope));
            };
            fetchConnectionMetadata();
            $scope.$watch("config.connection", fetchConnectionMetadata);
            $scope.$watch('config.' + $scope.bucketProperty, Debounce().withDelay(200, 1000).withScope($scope).wrap(fetchConnectionMetadata));

            $scope.fetchBucketList = function() {
                $scope.selectorUiState.fetchingBucketList = true;
                DataikuAPI.fsproviders.testConnection($scope.providerType, $scope.config, $scope.projectKey || $stateParams.projectKey, $scope.contextVars || {}, true)
                .success(function (data) {
                    $scope.connMeta = data;
                    if (data.buckets) {
                        $scope.selectorUiState.buckets = data.buckets.split(",");
                    } else {
                        $scope.selectorUiState.buckets = null;
                    }
                    $scope.selectorUiState.couldListBuckets = data.couldListBuckets;
                    $scope.selectorUiState.bucketsListError = data.bucketsListError;
                    $scope.selectorUiState.mode = 'SELECT';
                })
                .error(setErrorInScope.bind($scope))
                .finally(function() {$scope.selectorUiState.fetchingBucketList = false;});
            };
        }
    };
});

app.directive('fsProviderSettings', function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        replace: true,
        templateUrl: '/templates/datasets/fs-provider-settings.html',
        scope: {
            connectionHasMetadata : '=',
            providerType : '=',
            config : '=',
            projectKey : '=',
            contextVars : '=',
            defaultPath : '=',
            pathChangeNeedsConfirm : '=',
            onChange : '&'
        },
        link: function($scope, element, attrs) {
            if ($scope.config.$resetConnection) {
                delete $scope.config.$resetConnection;
                $scope.config.connection = null;
            }

            var initConnectionFieldIfEmpty = function() {
                if ($scope.config == null) return;
                if ($scope.connections == null) return;
                if ($scope.connections.length > 0 && ($scope.config.connection == null || $scope.config.connection.length === 0)) {
                    $scope.config.connection = $scope.connections[0];
                }
            };
            var initPathFieldIfEmpty = function() {
                if ($scope.config == null) return;
                if (angular.isUndefined($scope.config.path)) {
                    $scope.config.path = $scope.defaultPath != null ? $scope.defaultPath : '/';
                }
            };
            $scope.$watch("config", function() {
                if ($scope.config == null) return;
                initPathFieldIfEmpty();
                initConnectionFieldIfEmpty();
            }, true);
            $scope.$watch("providerType", function(nv, ov) {
            	if (nv && ov && nv != ov && $scope.config) {
            		// clear the connection to avoid testing an provider with a connection of the wrong type
        			$scope.config.connection = null;
            	}
                if ($scope.providerType == null) return;
                if ($scope.providerType == 'S3') {
                    $scope.connectionType = 'EC2';
                } else if ($scope.providerType == 'SFTP' || $scope.providerType == 'SCP') {
                    $scope.connectionType = 'SSH';
                } else {
                    $scope.connectionType = $scope.providerType;
                }
                DataikuAPI.connections.getNames($scope.connectionType).success(function (data) {
                    $scope.connections = data;
                    initConnectionFieldIfEmpty();
                }).error(setErrorInScope.bind($scope));
            });

            $scope.browse = function (path) {
                if (path == null)
                    path = $scope.defaultPath != null ? $scope.defaultPath : '/';
                var configAnchoredAtRoot = angular.copy($scope.config);
                // We discard stuff to have a shorter serialized version of our dataset
                configAnchoredAtRoot.path = $scope.defaultPath != null ? $scope.defaultPath : '/';

                WT1.event("fsprovider-fs-browse", {providerType : $scope.providerType, path : path});

                // Ugly workaround. Angular 1.2 unwraps promises (don't understand why)
                // Except if the promise object has a $$v.
                // See https://github.com/angular/angular.js/commit/3a65822023119b71deab5e298c7ef2de204caa13
                // and https://github.com/angular-ui/bootstrap/issues/949
                var promise = DataikuAPI.fsproviders.browse($scope.providerType, configAnchoredAtRoot, $scope.projectKey || $stateParams.projectKey, $scope.contextVars || {}, path);
                promise.$$v = promise;
                return promise;
            };


        }
    };
});

app.controller("FilesystemDatasetController", function() {
	// nothing to add to base behavior
});

app.controller("AzureDatasetController", function() {
	// nothing to add to base behavior
});

app.controller("GCSDatasetController", function() {
	// nothing to add to base behavior
});

app.controller("HDFSDatasetController", function($scope) {
    if (angular.isUndefined($scope.dataset.params.metastoreSynchronizationEnabled)) {
        $scope.dataset.params.metastoreSynchronizationEnabled = false;
    }
});

app.controller("S3DatasetController", function() {
	// nothing to add to base behavior
});

app.controller("FTPDatasetController", function() {
	// nothing to add to base behavior
});

app.controller("SFTPDatasetController", function() {
	// nothing to add to base behavior
});

app.controller("SCPDatasetController", function() {
	// nothing to add to base behavior
});

app.controller("HTTPDatasetController", function($scope, Dialogs, $timeout) {
    if (!$scope.dataset.params || !$scope.dataset.params.sources) {
        $scope.dataset.params = {
            sources: [],
            consider404AsEmpty: true,
            useGlobalProxy: true,
            previewPartition: '',
            partitions: []
        };
    }

    $scope.uiState ={
        urls: ($scope.dataset.params.sources || []).map(function(source) { return source.url; }).join('\n'),
        partitioned: $scope.dataset.partitioning.dimensions ? ($scope.dataset.partitioning.dimensions.length > 0) : false,
        previewPartition: $scope.dataset.params.previewPartition && $scope.dataset.params.previewPartition.length > 0
            ? partitionId2Obj($scope.dataset.params.previewPartition) : {},
        partitionList: $scope.dataset.params.partitions && $scope.dataset.params.partitions.length > 0
            ? $scope.dataset.params.partitions.map(partitionId2Obj) : []
    };
    $scope.hasTimeDimension = function() {
        return $scope.dataset.partitioning.dimensions.some(function(d) { return d.type === 'time'; });
    };
    $scope.$watch('uiState.urls', function(nv) {
        $scope.dataset.params.sources = nv.split(/(?:\r?\n)+/).map(function(url) {
            return { url: url.trim() };
        }).filter(function(_) { return _.url.length > 0; });
    });
    $scope.$watch('uiState.previewPartition', function(nv) {
        if (nv == null) return;
        $scope.dataset.params.previewPartition = partitionObj2Id(nv);
    }, true);
    $scope.$watch('uiState.partitionList', function(nv) {
        $scope.dataset.params.partitions = nv.map(partitionObj2Id);
    }, true);
    $scope.$watch('dataset.partitioning.dimensions', function(nv, ov) {
        if (nv == null) return;
        if (nv.length != ov.length) {
            var oldNames = ov.map(function(d) {return d.name;});
            var newNames = nv.map(function(d) {return d.name;});
            var toAdd = newNames.filter(function(name) {return oldNames.indexOf(name) < 0;});
            var toDel = oldNames.filter(function(name) {return newNames.indexOf(name) < 0;});
            var cleanPartition = function(obj) {
                toAdd.forEach(function(name) {obj[name] = '';});
                toDel.forEach(function(name) {delete obj[name];});
            };
            cleanPartition($scope.uiState.previewPartition);
            $scope.uiState.partitionList.forEach(cleanPartition);
        } else {
            // rename fields in UI partition list
            var cleanPartition = function(obj) {
                for (var i = 0; i < nv.length; i++) {
                    if (nv[i].name !== ov[i].name) {
                        obj[nv[i].name] = obj[ov[i].name];
                        delete obj[ov[i].name];
                    }
                }
            };
            cleanPartition($scope.uiState.previewPartition);
            $scope.uiState.partitionList.forEach(cleanPartition);
        }
    }, true);
    $scope.addPartitionToList = function() {
        $scope.uiState.partitionList.push(partitionId2Obj(''));
        $timeout(function() {
            $('table.table.table-partition-values tr').slice(-1).find('input[type="text"]').first().focus();
        });
    };
    $scope.removePartitionFromList = function(i) {
        if (i >= 0 && i < $scope.uiState.partitionList.length) {
            $scope.uiState.partitionList.splice(i, 1);
        }
    };
    $scope.partitionListPrompt = function() {
        Dialogs.prompt($scope, "Partitions list",
            "Edit partitions list, one partition ID per line, dimensions separated by |",
            $scope.dataset.params.partitions.join('\n'),
            {
                type: 'textarea',
                placeholder: 'dim1_value1|dim2_value1\ndim1_value2|dim2_value2'
            }
        ).then(function(nv) {
            $scope.uiState.partitionList = nv.split(/(?:\r?\n)+/)
                .map(function(_) { return _.trim(); })
                .filter(function(_) { return !!_; })
                .map(partitionId2Obj);
        });
    };

    function partitionId2Obj(id) {
        var parts = (id || '').split('|');
        return $scope.dataset.partitioning.dimensions.reduce(function(obj, dim, i) {
            obj[dim.name] = parts[i] || '';
            return obj;
        }, {});
    }
    function partitionObj2Id(obj) {
        return $scope.dataset.partitioning.dimensions
            .map(function(dim, i) { return obj[dim.name]; })
            .join('|');
    }

    $scope.getDimensionVariable = function(d) {
        if (d.type == 'time') {
            var patterns = ['%Y'];
            if (d.params.period == 'MONTH') {
                patterns.push('%M');
            } else if (d.params.period == 'DAY') {
                patterns.push('%M');
                patterns.push('%D');
            } else if (d.params.period == 'HOUR') {
                patterns.push('%M');
                patterns.push('%D');
                patterns.push('%H');
            }
            return patterns.join(", ");
        } else {
            return '%{' + d.name + '}';
        }
    };
});

app.controller("PluginFSProviderDatasetController", function($scope, $rootScope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, PluginConfigUtils) {
    // nothing to add to base behavior
});

app.controller("FilesystemProviderController", function() {
	// nothing to add to base behavior
});

app.controller("AzureProviderController", function($scope) {
    $scope.uiState = {
        enterManually : false,
        selectedContainer : $scope.config.container
    };

    $scope.$watch('connMeta', function () {
        if ($scope.connMeta) {
            $scope.containers = null;
            if ($scope.connMeta.containers) {
                $scope.containers = $scope.connMeta.containers.split(',');
                $scope.uiState.selectedContainer = $scope.containers.filter(function(b) {return b == $scope.config.container;})[0];
            }
        }
    });
});

app.controller("GCSProviderController", function($scope) {
    $scope.uiState = {
        enterManually : false,
        selectedBucket : $scope.config.bucket
    };

    $scope.$watch('connMeta', function () {
        if ($scope.connMeta) {
            $scope.buckets = null;
            if ($scope.connMeta.buckets) {
                $scope.buckets = $scope.connMeta.buckets.split(',');
                $scope.uiState.selectedBucket = $scope.buckets.filter(function(b) {return b == $scope.config.bucket;})[0];
            }
        }
    });
});

app.controller("HDFSProviderController", function() {
	// nothing to add to base behavior
});

app.controller("S3ProviderController", function($scope) {
    $scope.uiState = {
        enterManually : false,
        selectedBucket : $scope.config.bucket
    };

    $scope.$watch('connMeta', function () {
        if ($scope.connMeta) {
            $scope.buckets = null;
            if ($scope.connMeta.buckets) {
                $scope.buckets = $scope.connMeta.buckets.split(',');
                $scope.uiState.selectedBucket = $scope.buckets.filter(function(b) {return b == $scope.config.bucket;})[0];
            }
        }
    });
});


app.controller("FTPProviderController", function($scope) {
    if (angular.isUndefined($scope.config.timeout)) {
        $scope.config.timeout = 30000;
    }
});

app.controller("SFTPProviderController", function($scope) {
    if (angular.isUndefined($scope.config.timeout)) {
        $scope.config.timeout = 10000;
    }
});

app.controller("SCPProviderController", function($scope) {
    if (angular.isUndefined($scope.config.timeout)) {
        $scope.config.timeout = 10000;
    }
});

app.controller("PluginFSProviderController", function($scope, $rootScope, $controller, $state, $stateParams, Assert, DataikuAPI, TopNav, CreateModalFromTemplate, PluginConfigUtils) {
    $scope.config.config = $scope.config.config || {};
    $scope.loadedDesc = $rootScope.appConfig.customFSProviders.filter(function(x){
        return x.fsProviderType == $scope.providerType;
    })[0];

    Assert.inScope($scope, 'loadedDesc');

    $scope.desc = $scope.loadedDesc.desc;

    // put default values in place
    PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.config.config);

    $scope.pluginDesc = $rootScope.appConfig.loadedPlugins.filter(function(x){
        return x.id == $scope.loadedDesc.ownerPluginId;
    })[0];
});

app.controller("BaseUploadedFilesController", function($scope, DataikuAPI, WT1, $stateParams, ActivityIndicator) {
    $scope.files = [];

    $scope.downloadingFiles = 0;

    $scope.drop = function (uploaded_files) {
        function handleFiles(uploaded_files) {
            // if its a brand new dataset, instantiate an uploadbox first
            // upload files with progress bar

            for (var i = uploaded_files.length - 1; i >= 0; i--) {
                (function (uploaded_file) {
                    var file = {
                            progress: 0,
                            path: uploaded_file.name,
                            length: uploaded_file.size
                        };
                    $scope.files.push(file);
                    $scope.downloadingFiles++;
                    DataikuAPI.datasets.upload.addFileToDataset($stateParams.projectKey, uploaded_file, $scope.dataset, function (e) {
                        // progress bar
                        if (e.lengthComputable) {
                            $scope.$apply(function () {
                                file.progress = Math.round(e.loaded * 100 / e.total);
                            });
                        }
                    }).then(function (data) {
                        //success
                        var index = $scope.files.indexOf(file);
                        try {
                            data = JSON.parse(data);
                            if (data.wasArchive) {
                                ActivityIndicator.success("Extracted "  + data.files.length + " files from Zip archive");
                            }
                            // replace stub file object by result of upload
                            $scope.files = $scope.files.slice(0, index).concat(data.files).concat($scope.files.slice(index + 1));
                            $scope.files.sort(function (a, b) {
                                return a.path < b.path;
                            });
                        } catch(e){
                            // a lot can go wrong
                            $scope.files = $scope.files.slice(0, index).concat($scope.files.slice(index + 1));
                        }
                        $scope.downloadingFiles--;
                    }, function(payload){
                        // delete faulty file
                        $scope.files.splice($scope.files.indexOf(file), 1);

                        try {
                            setErrorInScope.bind($scope)(JSON.parse(payload.response), payload.status, function(h){return payload.getResponseHeader(h)});
                        } catch(e) {
                            // The payload.response is not JSON
                            setErrorInScope.bind($scope)({$customMessage: true, message: (payload.response || "Unknown error").substring(0, 20000), httpCode: payload.status}, payload.status);
                        }

                        $scope.downloadingFiles--;
                    });
                }(uploaded_files[i]));
            }
        }
        if ($scope.dataset.name == null && !$scope.dataset.params.uploadBoxId) {
            DataikuAPI.datasets.upload.createUploadBox().success(function (data) {
                $scope.dataset.params.uploadBoxId = data.id;
                handleFiles(uploaded_files);
            }).error(setErrorInScope.bind($scope));
        } else {
            handleFiles(uploaded_files);
        }
    };

    $scope.deleteFile = function (file, e) {
        WT1.event("dataset-upload-remove-file");
        e.preventDefault();
        e.stopPropagation();
        DataikuAPI.datasets.upload.removeFile($stateParams.projectKey, $scope.dataset, file.path).success(function(data) {
            $scope.files.splice($scope.files.indexOf(file), 1);
        }).error(setErrorInScope.bind($scope));
    };
});


app.controller("UploadedFilesController", function($scope, $controller, DataikuAPI, $stateParams) {
    $controller("BaseUploadedFilesController", {$scope: $scope});

    // Cannot save if there is no file
    $scope.saveHooks.push(function() {
        return $scope.files && $scope.files.length > 0;
    });

    // Cannot save if downloading
    $scope.saveHooks.push(function() {
        return $scope.downloadingFiles == 0;
    });

    function watchFilesList() {
        // list of uploaded files (with finished upload)
        $scope.$watch(function () {
            return $.grep($scope.files, function (f) {
                return angular.isUndefined(f.progress);
            });
        }, function (nv, ov) {
            if (nv !== ov) {
                $scope.onCoreParamsChanged();
                $scope.dataset.savedFiles = nv;
            }
        }, true);
    };

    // init files
    if ($scope.dataset.name != null) {
        DataikuAPI.datasets.upload.listFiles($stateParams.projectKey, $scope.dataset.name).success(function (data) {
            $scope.files = data;
            watchFilesList();
        }).error(setErrorInScope.bind($scope));
    } else {
        DataikuAPI.datasets.listManagedUploadableConnections($stateParams.projectKey).success(function(data) {
            $scope.uploadableConnections = data.connections;
            $scope.dataset.params.$uploadConnection = $scope.uploadableConnections[0];
        }).error(setErrorInScope.bind($scope));
        // restore files from saved, see #6840
        if ($scope.dataset.savedFiles && $scope.dataset.savedFiles.length) {
            [].push.apply($scope.files, $scope.dataset.savedFiles);
        }
        watchFilesList();
        $scope.$watch("dataset.params.$uploadConnection", function() {
            if (!$scope.dataset.params.$uploadConnection) return;
            $scope.dataset.params.uploadConnection = $scope.dataset.params.$uploadConnection.name;
            $scope.dataset.params.uploadFSProviderType = $scope.dataset.params.$uploadConnection.fsProviderTypes[0];
        });
    }
});

app.controller("FilesInFolderController", function($scope, $controller, DataikuAPI, $stateParams, SmartId) {
    $scope.fileChoice = {};

    // put the prefill in place if there is one
    if ($stateParams.fromOdbSmartId && $scope.dataset && $scope.dataset.params && !$scope.dataset.params.folderSmartId) {
        $scope.dataset.params.folderSmartId = $stateParams.fromOdbSmartId;
        if ($stateParams.fromOdbItemPath && $stateParams.fromOdbItemDirectory == "false") {
            $scope.dataset.params.filesSelectionRules = {mode: "EXPLICIT_SELECT_FILES", includeRules: [], excludeRules: [], explicitFiles: [$stateParams.fromOdbItemPath]}
        } else if ($stateParams.fromOdbItemPath && $stateParams.fromOdbItemDirectory == "true") {
            var globbed = $stateParams.fromOdbItemPath + "/**/*";
            if (globbed.startsWith('/')) globbed = globbed.substring(1)
            $scope.dataset.params.filesSelectionRules = {mode: "RULES_INCLUDED_ONLY", includeRules: [{mode: "GLOB", matchingMode: "FULL_PATH", expr: globbed}], excludeRules: [], explicitFiles: []}
        }
        $scope.dataset.projectKey = $scope.dataset.projectKey || $stateParams.projectKey; // otherwise the folderSmartId is a bit irrelevant
    }

    var refreshManagedFolder = function() {
        if ($scope.managedfolders) {
            $scope.managedfolder = $scope.managedfolders.filter(function(f) {return f.smartId == $scope.dataset.params.folderSmartId;})[0];
        } else {
            $scope.managedfolder = null;
        }
    };

    DataikuAPI.managedfolder.listWithAccessible($stateParams.projectKey).success(function(data) {
        data.forEach(function(ds) {
            ds.foreign = (ds.projectKey != $stateParams.projectKey);
            ds.smartId = SmartId.create(ds.id, ds.projectKey);
        });
        $scope.managedfolders = data;
        refreshManagedFolder();
    }).error(setErrorInScope.bind($scope));

    $scope.usePartitioningFromFolder = function() {
        if (!$scope.managedfolder) return;
        $scope.dataset.partitioning = $scope.managedfolder.partitioning ? angular.copy($scope.managedfolder.partitioning) : {dimensions: []};
    };

    $scope.$watch("dataset.params.folderSmartId", function() {
        refreshManagedFolder();
    });

    $scope.itemPathSelected = function() {
        if ($scope.fileChoice.itemPath) {
            $scope.dataset.params.itemPathPattern = $scope.fileChoice.itemPath;
        }
    };

    if ($stateParams.prefillParams) {
        var prefillParams = JSON.parse($stateParams.prefillParams);
        if (prefillParams.folderSmartId && !$scope.dataset.params.folderSmartId) {
            $scope.dataset.params.folderSmartId = prefillParams.folderSmartId;
        }
        if (prefillParams.itemPathPattern && !$scope.dataset.params.itemPathPattern) {
            $scope.dataset.params.itemPathPattern = prefillParams.itemPathPattern;
        }
        $scope.dataset.projectKey = $scope.dataset.projectKey || $stateParams.projectKey; // otherwise the folderSmartId is a bit irrelevant
    }
});

}());
