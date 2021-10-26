(function() {
'use strict';

    const app = angular.module('dataiku.export.services', ['dataiku.services']);

    app.factory("ExportUtils", function(FutureProgressModal, DataikuAPI, CreateExportModal, $stateParams, $rootScope, GraphZoomTrackerService){
        var svc = {
            defaultHandleExportResult : function($scope, exportParams, result) {
                FutureProgressModal.show($scope, result.futureResponse, "Exporting ...").then(function(){
                    if (result.exportMethod == "FORMATTER_STREAM" || result.exportMethod == "FORMATTER_TO_FILE" ||
                        result.exportMethod == "CUSTOM_TO_FILE") {
                        downloadURL(DataikuAPI.exports.getDownloadURL(result.exportId));
                        if (result.realFutureResponse) {
                            FutureProgressModal.show($scope, result.realFutureResponse, "Exporting ...");
                        }
                    }
                    // when exporting to a new dataset in the project, refresh the flow
                    // to show the new dataset, and select this dataset
                    if (result.exportMethod=="DATASET") {
                        GraphZoomTrackerService.setFocusItemByName("dataset", result.params.destinationDatasetName);
                        $rootScope.$emit('datasetsListChangedFromModal');
                    }
                });
            },
            exportUIData : function($scope, data, modalTitle){
                var features = {
                    advancedSampling : false,
                    partitionListLoader : null
                }

                CreateExportModal($scope, { title: modalTitle } ,features).then(function(params) {
                	params.contextProjectKey = $stateParams.projectKey;
                    DataikuAPI.exports.exportUIData(data, params).success(function(data) {
                        svc.defaultHandleExportResult($scope, params, data);
                    }).error(setErrorInScope.bind($scope));
                });
            }
        }
        return svc;
    });

    app.factory("ExportService", function($timeout, $q, CreateModalFromTemplate, DataikuAPI, $stateParams, LocalStorage, Logger, Collections, DatasetUtils, CachedAPICalls) {

        function getExportSettings(destinationType) {
            return {
                destinationType : destinationType ? destinationType : 'DOWNLOAD',
                destinationDatasetProjectKey : $stateParams.projectKey,
                overwriteDestinationDataset:false,
                selection : {
                    samplingMethod : 'FULL',
                    partitionSelectionMethod : 'ALL' ,
                    targetRatio : 0.02,
                    maxRecords : 100000,
                    selectedPartitions:[],
                    ordering: {
                        enabled: false,
                        rules : []
                    }
                },
                advancedMode: false
            };
        }

        function setCsvSeparatorParam(format) {
            CachedAPICalls.datasetFormatTypes.success((formats) => {
                const csvFormatParams = formats['csv'];
                format.csvSeparatorParam =
                    csvFormatParams.params.find(param => param.name === 'separator');
            });
        }

        /**
         * Return first connection of type `Filesystem` if there is one in the list of connections, first one of the list otherwise.
         * @param connections: list of connections
         */
        function getDefaultConnection(connections) {
            if(!connections || connections.length == 0) {
                return;
            }

            // Select the first filesystem connection
            for(let i in connections) {
                let connection  = connections[i];
                if(connection.type=='Filesystem') {
                    return connection.connection;
                }
            }

            // If there is no filesystem connection, pick the first one
            return connections[0].connection;
        }

        function getExportModal(scope, dialog, deferred) {
            return  {
                partitionListLoaded : false,
                selectedPartitionsText:'',
                title : dialog.title,
                warn: dialog.warn,
                partitionList : [],
                DatasetUtils:DatasetUtils,
                accept : function() {
                    this.updateModel();
                    deferred.resolve(scope.exportParams);
                },
                cancel : function() {
                    this.updateModel();
                    deferred.reject(scope.exportParams);
                },
                loadPartitions : function() {
                    let ref = this;
                    this.partitionListLoader().then(function(data) {
                        ref.handlePartitionListLoaded(data);
                    },function() {
                        // nothing to do in case of failure
                    });
                },
                handlePartitionListLoaded : function(data) {
                    this.updateModel();
                    this.partitionListLoaded = true;
                    this.partitionList = data;
                },

                // Update the model "scope.exportParams" from the selected option
                // in the current tab
                updateModel : function() {
                    // check if we are currently in "text mode"
                    // update the modal with the list of selected partition
                    // (from the comma separated input field)
                    if(!this.partitionListLoaded) {
                        scope.exportParams.selection.selectedPartitions = this.selectedPartitionsText.length ? this.selectedPartitionsText.split(',') : [];
                    }
                },

                getCacheKey: function(destinationType, optionId) {
                    let key = destinationType;
                    if (optionId) {
                        key += "_" + optionId;
                    }
                    return key;
                },

                cacheExportParams: function(exportParams) {
                    if (this.backupExportParams == null) {
                        this.backupExportParams = {};
                    }
                    if (exportParams && exportParams.destinationType) {
                        let key = this.getCacheKey(exportParams.destinationType, exportParams.originatingOptionId);
                        this.backupExportParams[key] = angular.copy(exportParams);
                    }
                },

                getCachedExportParams: function() {
                    let key = this.getCacheKey(this.$destinationType, this.getSelectedOptionId());
                    if (key && this.backupExportParams && this.backupExportParams[key] != null) {
                       return this.backupExportParams[key];
                    }
                    return null;
                },

                getSelectedOptionId: function() {
                    let selectedOptionId = null;
                    if (this.$destinationType == "DOWNLOAD") {
                        selectedOptionId = this.$selectedDownloadOptionId;
                    } else if (this.$destinationType == "CUSTOM_MANAGED") {
                        selectedOptionId = this.$selectedManagedOptionId;
                    }
                    return selectedOptionId;
                },

                getDefaultExportParams: function() {
                    let exportParams = getExportSettings(this.$destinationType);
                    // Reset existing
                    exportParams.$exportOption = undefined;
                    exportParams.originatingOptionId = undefined;
                    exportParams.format = undefined;
                    exportParams.exporterType = undefined;
                    exportParams.config = undefined;

                    let selectedOptionId = this.getSelectedOptionId(this.$destinationType);
                    let selectedOption = selectedOptionId ? this.optionsMap[selectedOptionId] : null;

                    if (selectedOption) {
                        exportParams.$exportOption = selectedOption;
                        exportParams.originatingOptionId = selectedOption.id;
                        switch (selectedOption.optionType) {
                            case "BUILTIN_FORMAT":
                                exportParams.format = {
                                    type: selectedOption.formatType,
                                    params: angular.copy(selectedOption.predefinedConfig)
                                };
                                if ('csv' === selectedOption.formatType) {
                                    setCsvSeparatorParam(exportParams.format);
                                }
                                break;
                            case "CUSTOM_FORMAT":
                                exportParams.format = {
                                    type: selectedOption.formatType,
                                    params: {
                                        config: angular.copy(selectedOption.predefinedConfig)
                                    }
                                };
                                break;
                            case "CUSTOM_TO_FILE":
                            case "CUSTOM_MANAGED":
                                exportParams.exporterType = selectedOption.exporterType;
                                exportParams.config = angular.copy(selectedOption.predefinedConfig);
                                break;
                        }
                    }

                    if (this.$destinationType == 'DATASET') {
                        exportParams.destinationDatasetConnection = getDefaultConnection(this.managedDatasetConnections);
                    }

                    return exportParams;
                },

                handleSelectedOptionChange : function(){
                    this.cacheExportParams(scope.exportParams);

                    let cachedExportParams = this.getCachedExportParams();
                    if (cachedExportParams != null) {
                        scope.exportParams = cachedExportParams;
                    } else {
                        scope.exportParams = this.getDefaultExportParams();
                    }
                },
                checkFormIsValid : function() {
                    function isSingleChar(str) {
                        return !!str && str.length == 1;
                    }

                    if (scope.exportParams.destinationType == 'DATASET'
                        && !scope.exportParams.overwriteDestinationDataset
                        && (!this.exportModalForm.datasetName || this.exportModalForm.datasetName.$invalid)
                    ) {
                        return false;
                    }

                    if (scope.exportParams.destinationType == 'DATASET'
                        && scope.exportParams.overwriteDestinationDataset && !scope.exportParams.destinationDatasetName
                    ) {
                        return false;
                    }

                    if (scope.exportParams.destinationType == 'DOWNLOAD' &&
                        scope.exportParams.format && scope.exportParams.format.type == "csv"
                        && !isSingleChar(scope.exportParams.format.params.separator)) {
                        return false;
                    }
                    return true;

                },
                getExportButtonText : function() {
                    if(scope.exportParams.destinationType=='DOWNLOAD') {
                        return 'Download';
                    } else if(scope.exportParams.destinationType=='DATASET') {
                        if(scope.exportParams.overwriteDestinationDataset) {
                            return 'Overwrite dataset';
                        } else {
                            return 'Create dataset';
                        }
                    } else {
                        return "Export";
                    }
                }
            };
        }

        var svc = {
            initExportBehavior : function(scope, dialog, featureOptions, exportParamsContainer, initialExportParams, fullInitialExportParams, onExportParamsChanged){
                var deferred = $q.defer();

                // default values
                var defaultFeatures = {
                    forceShowMethods: false,
                    advancedSampling: false,
                    isDownloadable: true,
                    partitionListLoader: null
                };

                if (featureOptions === undefined) {
                    featureOptions = {};
                }
                // Creating fatass object here with load of functions (and extended just afterward with even more parameters)
                scope.exportModal = getExportModal(scope, dialog, deferred);
                $.extend(scope.exportModal, defaultFeatures, featureOptions);

                scope.exportModalForm = {};

                if (fullInitialExportParams != null) {
                    Logger.info("Using forcedInit with", fullInitialExportParams);
                    scope.exportParams = fullInitialExportParams;
                } else {
                    Logger.info("Using regular init, override with", initialExportParams);
                    scope.exportParams = getExportSettings();
                    if (initialExportParams != null) {
                        rextend(scope.exportParams, initialExportParams);
                    }
                }
                if (scope.exportParams.format && scope.exportParams.format.type === 'csv') {
                    setCsvSeparatorParam(scope.exportParams.format);
                }
                scope.exportModal.$destinationType = scope.exportParams.destinationType;

                exportParamsContainer.exportParams = scope.exportParams;

                Logger.warn("Initialized: ", scope.exportParams);

                DataikuAPI.datasets.list($stateParams.projectKey).success(function(data) {
                    scope.datasets = data.filter(function(d) {
                        return !d.type.startsWith('Doctor');
                    }).map(function(d) {
                        d.usable=true;
                        d.smartName=d.name;
                        d.localProject=true;
                        return d;
                    });
                }).error(setErrorInScope.bind(scope));

                DataikuAPI.exports.getOptions().success(function(data) {
                    scope.exportModal.exportOptions = data.options;

                    scope.exportModal.exportableFormats = data.options.filter(function(x){
                        return x.optionType == "BUILTIN_FORMAT" || x.optionType == "CUSTOM_FORMAT" || x.optionType == "CUSTOM_TO_FILE";
                    });
                    scope.exportModal.managedExporters = data.options.filter(function(x){
                        return x.optionType == "CUSTOM_MANAGED";
                    });

                    scope.exportModal.optionsMap = Collections.indexByField(data.options, "id");

                    /* Preinitialize (so that we have a fallback for both modes) */
                    scope.exportModal.$selectedDownloadOptionId =  scope.exportModal.exportableFormats[0].id;
                    if (scope.exportModal.managedExporters.length > 0) {
                        scope.exportModal.$selectedManagedOptionId =  scope.exportModal.managedExporters[0].id;
                    }

                    /* Reload existing option if any */
                    Logger.info("Loading after getting options, current params:"  + JSON.stringify(scope.exportParams));
                    if (scope.exportParams.originatingOptionId != null && scope.exportParams.destinationType == 'DOWNLOAD') {
                        scope.exportModal.$selectedDownloadOptionId = scope.exportParams.originatingOptionId;
                        scope.exportParams.$exportOption = scope.exportModal.optionsMap[scope.exportParams.originatingOptionId];
                    } else if (scope.exportParams.originatingOptionId != null && scope.exportParams.destinationType == 'CUSTOM_MANAGED') {
                        scope.exportModal.$selectedManagedOptionId = scope.exportParams.originatingOptionId;
                        scope.exportParams.$exportOption = scope.exportModal.optionsMap[scope.exportParams.originatingOptionId];
                    }

                    /* None yet, activate the default */
                    if (!scope.exportParams.$exportOption) {
                        Logger.info("No valid option yet (or option lost), initializing");
                        if (scope.exportParams.destinationType == 'DOWNLOAD' && scope.exportModal.exportableFormats.length > 0) {
                            scope.exportModal.$selectedDownloadOptionId = scope.exportModal.exportableFormats[0].id;
                            scope.exportParams.$exportOption = scope.exportModal.exportableFormats[0];
                        } else if (scope.exportParams.destinationType == 'CUSTOM_MANAGED' && scope.exportModal.managedExporters.length > 0) {
                            scope.exportModal.$selectedManagedOptionId = scope.exportModal.managedExporters[0].id;
                            scope.exportParams.$exportOption = scope.exportModal.managedExporters[0];
                        }
                        scope.exportModal.handleSelectedOptionChange();
                    }

                    Logger.info("Initialized export options", scope.exportParams);
                    scope.exportModal.updateModel();

                    scope.$watch("exportModal.$destinationType", function(nv, ov) {
                        if (nv && ov) {
                            scope.exportModal.handleSelectedOptionChange();
                            scope.exportModal.updateModel();
                        }
                    });

                }).error(setErrorInScope.bind(scope));

                if (typeof(onExportParamsChanged) === "function") {
                    scope.$watch('exportParams', function(nv, ov) {
                        let newExportParams = angular.copy(nv);
                        delete newExportParams.$exportOption;
                        if (newExportParams.format) delete newExportParams.format.csvSeparatorParam;
                        onExportParamsChanged(newExportParams);
                    }, true);
                }

                addDatasetUniquenessCheck(scope,DataikuAPI, $stateParams.projectKey);
                fetchManagedDatasetConnections(scope.exportModal, DataikuAPI);

                return deferred.promise;
            }
        }
        return svc;

    });

    app.factory("CreateExportModal", function(ExportService, $timeout, $q, CreateModalFromTemplate, DataikuAPI, $stateParams, LocalStorage, Logger) {
        // Example :
        //
        // features : {
        //   advancedSampling : false,
        //   partitionListLoader : null,
        //   isDownloadable : true
        // }
        //
        // dialog : {
        //     title : 'Export',
        //     warn : 'Be careful'
        // }
        //
        return function(baseScope,dialog, featureOptions, initialExportParams) {
            var scope = baseScope.$new();
            var promise = ExportService.initExportBehavior(scope, dialog, featureOptions, scope, initialExportParams);
            CreateModalFromTemplate('/templates/exports/export_modal.html',scope);
            return promise;
        };
    });

    function initializePluginConfig(Logger, PluginConfigUtils, scope, rootConfigFieldName, pathToConfig, rootConfigType, pathToConfigType, descriptors, descriptorTypeFieldName) {
        function getNestedValue(rootObject, path, defaultValue = {}) {
            let result = rootObject;
            let splitPath = path.split(".");
            for (let i = 0; i < splitPath.length; i++) {
                const pathElement = splitPath[i];
                const isLastPathElement = i === splitPath.length - 1;
                if (isLastPathElement && !(result[pathElement])) {
                    result[pathElement] = defaultValue;
                }
                result = result[pathElement];
            }
            return result;
        }

        function setConfig() {
            scope[rootConfigFieldName] = scope.exportParams;
            Logger.info("LOADED CONFIG:  " + JSON.stringify(scope.exportParams));
            // Initialize if empty.
            getNestedValue(scope[rootConfigFieldName], pathToConfig);
        }

        function updateType() {
            scope[rootConfigType] = getNestedValue(scope.exportParams, pathToConfigType, null);

            var descriptor = descriptors.filter(function(x){
                return x[descriptorTypeFieldName] === scope[rootConfigType];
            });
            if (descriptor.length > 0 ) {
                scope.loadedDesc = descriptor[0];
                scope.pluginDesc = window.dkuAppConfig.loadedPlugins.filter(function(x){
                    return x.id === scope.loadedDesc.ownerPluginId;
                })[0];
                PluginConfigUtils.setDefaultValues(scope.loadedDesc.desc.params, getNestedValue(scope[rootConfigFieldName], pathToConfig));
            } else {
                Logger.warn("Descriptor not found", scope[rootConfigType], " in list", descriptors);
            }
        }
        setConfig();
        scope.$watch('exportParams', setConfig); // updating config in case config's reference change
        scope.$watch("exportParams." + pathToConfigType, updateType, true);
    }

    app.directive('pluginExporterConfig', function($filter, PluginConfigUtils, Logger) {
        return {
            scope : false,
            restrict : 'A',
            link : function($scope, element, attrs) {
                initializePluginConfig(Logger, PluginConfigUtils, $scope ,
                    'exporterConfig', 'config',
                    'exporterType', "exporterType",
                    window.dkuAppConfig.customExporters, 'exporterType');
            }
        };
    });

    app.directive('pluginFormatConfig', function($filter, PluginConfigUtils, Logger) {
        return {
            scope : false,
            restrict : 'A',
            link : function($scope, element, attrs) {
                initializePluginConfig(Logger, PluginConfigUtils, $scope,
                    "formatConfig", "format.params.config",
                    "formatType", "format.type",
                    window.dkuAppConfig.customPythonFormats.concat(window.dkuAppConfig.customJavaFormats), "formatterType");
            }
        };
    });

})();

