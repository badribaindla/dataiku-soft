(function(){
'use strict';

const app = angular.module('dataiku.streaming-endpoints', []);

 app.controller('StreamingEndpointsListController', function($scope, $controller, $stateParams, $state, $q,
                          DatasetsService, DataikuAPI, CreateModalFromTemplate, TopNav, ComputablesService, Fn) {

        $controller('_TaggableObjectsListPageCommon', {$scope: $scope});

        TopNav.setLocation(TopNav.TOP_FLOW, "streaming-endpoints", TopNav.TABS_NONE, null);
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
            { value: 'id', label: 'Name' },
            { value: 'type', label: 'Type' },
            { value : '-lastModifiedOn', label : 'Last modified' }
        ];

        $scope.sortCookieKey = 'streaming-endpoints';
        $scope.maxItems = 20;

        $scope.goToItem = function(item) {
            $scope.$state.go('projects.project.streaming-endpoints.streaming-endpoint.explore', {datasetName: item.name, projectKey: $stateParams.projectKey});
        };

        $scope.list = function() {
            return DataikuAPI.streamingEndpoints.listHeads($stateParams.projectKey, {}, true).success(function (data) {
                $scope.listItems = data;
                $scope.restoreOriginalSelection();
            }).error(setErrorInScope.bind($scope));
        };

        $scope.$on('projectTagsUpdated', function (e, args) {
             if (args.refreshFlowFilters) $scope.list();
        });
        $scope.list();
    });


app.controller("NewStreamingEndpointController", function ($scope, $state, $stateParams, DataikuAPI, WT1) {
    WT1.event("streaming-endpoint-creation-modal");
    addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);

    $scope.newStreamingEndpoint = {
        zone: $scope.getRelevantZoneId($stateParams.zoneId)
    };

    DataikuAPI.datasets.getStreamingEndpointOptionsNoContext($stateParams.projectKey).success(function(data) {
        $scope.connections = data.connections.filter(function(c) {return c.connectionType.toLowerCase() == $scope.newStreamingEndpoint.type;});
        $scope.newStreamingEndpoint.connection = $scope.connections[0];
    });

    $scope.create = function () {
        resetErrorInScope($scope);
        DataikuAPI.streamingEndpoints.create($stateParams.projectKey, $scope.newStreamingEndpoint).success(function(data){
            $state.go('projects.project.streaming-endpoints.streaming-endpoint.settings', { 
                streamingEndpointId: $scope.newStreamingEndpoint.id 
            });
            $scope.dismiss();
        }).error(setErrorInScope.bind($scope));
    };
});

app.controller("StreamingEndpointCommonController", function ($controller, $scope, $stateParams, $rootScope, DataikuAPI, TopNav, $state, DatasetsService, CreateModalFromTemplate, DatasetCustomFieldsService) {
    TopNav.setItem(TopNav.ITEM_STREAMING_ENDPOINT, $stateParams.streamingEndpointId);

    DataikuAPI.streamingEndpoints.getFullInfo($stateParams.projectKey, $stateParams.streamingEndpointId).success(function(data){
        $scope.streamingEndpointFullInfo = data;
        $scope.streamingEndpoint = data.streamingEndpoint;
        $scope.origStreamingEndpoint = angular.copy($scope.streamingEndpoint);
        
        TopNav.setItem(TopNav.ITEM_STREAMING_ENDPOINT, $stateParams.streamingEndpointId, {name:$scope.streamingEndpoint.id, type:$scope.streamingEndpoint.type});
    }).error(setErrorInScope.bind($scope));
});

app.controller("StreamingEndpointPageController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, WT1, LoggerProvider, FutureWatcher){
    $controller('StreamingEndpointCommonController', {$scope: $scope});
});

app.controller("StreamingEndpointSettingsController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, WT1, LoggerProvider, FutureWatcher){
    var Logger = LoggerProvider.getLogger('streaming-endpoints.settings');

    $scope.uiState = {
        activeTab : "basic"
    };

    TopNav.setLocation(TopNav.TOP_FLOW, "streaming-endpoints", TopNav.TABS_STREAMING_ENDPOINT, "settings");
    
    $controller('StreamingEndpointCommonController', {$scope: $scope});

    $scope.saveStreamingEndpoint = function() {
        DataikuAPI.streamingEndpoints.save($stateParams.projectKey, $scope.streamingEndpoint).success(function(data){
                        // Reset the modification detector
                        $scope.origStreamingEndpoint = angular.copy($scope.streamingEndpoint);
                        // $scope.dataset.versionTag = newVersionTag;
                        // $scope.origDataset.versionTag = newVersionTag;

            }).error(setErrorInScope.bind($scope));
    }

    $scope.streamingEndpointIsDirty = function () {
        if (!$scope.streamingEndpoint) {
            return false;
        }
        return !angular.equals($scope.streamingEndpoint, $scope.origStreamingEndpoint);
    };
    
    $scope.$watch("streamingEndpoint", function() {
        // blatantly lie and offer the streaming endpoint under the name 'dataset' in the scope, so that 
        // we can reuse the schema editor as is
        $scope.dataset = $scope.streamingEndpoint;
    });

    checkChangesBeforeLeaving($scope, function(){
        return $scope.streamingEndpointIsDirty();
    });
    
    $scope.setSchemaUserModified = function() {
        $scope.schemaJustModified = true;
        $scope.streamingEndpoint.schema.userModified = true;
    };

    $scope.trySample = function(inferStorageTypes) {
        WT1.event("streaming-sample")
        $scope.uiState.sample = null;
        DataikuAPI.streamingEndpoints.collectSample($stateParams.projectKey, $scope.streamingEndpoint, 10, 30, inferStorageTypes).success(function(data) {
            FutureWatcher.watchJobId(data.jobId).success(function(futureResult) {
                        $scope.captureFuture = null;
                        $scope.uiState.sample = futureResult.result;
                        $scope.uiState.sample.error = null;
                    }).update(function(data) {
                        $scope.captureFuture = data;
                    }).error(function (data, status, headers) {
                        $scope.captureFuture = null;
                        $scope.uiState.sample = {table:{headers:[]}};
                        $scope.uiState.sample.error = getErrorDetails(data, status, headers).detailedMessage;
                    });

        }).error(setErrorInScope.bind($scope));
    };
    
    $scope.useSchemaFromData = function() {
        WT1.event("streaming-use-schema-from-sample")
        $scope.streamingEndpoint.schema = $scope.uiState.sample.schemaDetection.detectedSchema;
        $scope.uiState.sample.schemaDetection.warningLevel = null; // now the warnings are ok
    };
    
    $scope.getAlertClassForDetection = function(dr) {
        if (!dr || !dr.schemaDetection || !dr.schemaDetection.warningLevel) return '';
        if (dr.schemaDetection.warningLevel == 'FATAL') {
            return 'alert-error';
        }
        if (dr.schemaDetection.warningLevel == 'WARN') {
            return 'alert-warning';
        }
        return 'alert-info';
    };
    
});

app.controller("StreamingEndpointAdvancedController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, WT1, LoggerProvider, FutureWatcher){
    var Logger = LoggerProvider.getLogger('streaming-endpoints.advanced');

    $scope.uiState = $scope.uiState || {};
    
    $scope.syncKsql = function(terminateQueries) {
        WT1.event("sync-ksql")
        $scope.uiState.syncDone = null;
        $scope.uiState.syncNotDoneReason = null;
        $scope.uiState.syncNotDoneFailure = null;
        DataikuAPI.streamingEndpoints.syncKsql($stateParams.projectKey, $scope.streamingEndpoint.id, terminateQueries).success(function(data) {
            $scope.uiState.syncDone = data.done;
            $scope.uiState.syncNotDoneReason = data.reason;
            $scope.uiState.syncNotDoneFailure = data.failure;
        }).error(setErrorInScope.bind($scope));
    };
});

app.controller("StreamingEndpointKafkaSettingsController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, WT1, LoggerProvider, FutureWatcher){
    var Logger = LoggerProvider.getLogger('streaming-endpoints.settings');

    $scope.uiState = $scope.uiState || {};
    
    DataikuAPI.connections.getNames('Kafka').success(function (data) {
        $scope.connections = data;
        if (!$scope.streamingEndpoint.params.connection && data.length) {
            $scope.streamingEndpoint.params.connection = data[0];
        }
    }).error(setErrorInScope.bind($scope));
    
    $scope.fetchTopics = function() {
        $scope.uiState.forceCustom = false;
        DataikuAPI.streamingEndpoints.testKafka($stateParams.projectKey, $scope.streamingEndpoint).success(function(data) {
            $scope.uiState.topicsFetched = true;
            $scope.uiState.testResults = data;            
            $scope.uiState.topics = data.topics;
        }).error(setErrorInScope.bind($scope));
    };
    
    $scope.canBeInferredFromRegistry = function(type) {
        // json format only uses the schema registry if you set the schema, so it's unlikely to happen
        return ["avro", "single"].indexOf(type) >= 0;
    };
    $scope.fetchSchemaFromRegistry = function() {
        DataikuAPI.streamingEndpoints.fetchKafkaSchema($stateParams.projectKey, $scope.streamingEndpoint).success(function(data) {
            $scope.uiState.schemaRegistrySchema = data;
        }).error(setErrorInScope.bind($scope));
    };
    
    $scope.useSchemaFromRegistry = function() {
        $scope.streamingEndpoint.schema = $scope.uiState.schemaRegistrySchema.schemaDetection.detectedSchema;
        $scope.uiState.schemaRegistrySchema.schemaDetection.warningLevel = null; // now the warnings are ok
    };
});

app.directive('kafkaFormatBlock', function($state, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate) {
    return {
        restrict: 'A',
        templateUrl :'/templates/streaming-endpoints/settings/kafka-format-block.html',
        scope: {
            formatType : '=',
            formatParams : '=',
            part: '='
        },
        link: function($scope, element, attrs) {
            let fixupParams = function() {
                if ($scope.formatType == null) return;
                if ($scope.formatParams == null) return;
                if (['json', 'avro'].indexOf($scope.formatType) >= 0 && $scope.formatParams.columnNames == null) {
                    $scope.formatParams.columnNames = [];
                }
            };
            $scope.$watch("formatType", fixupParams);
            $scope.$watch("formatParams", fixupParams);
        }
    }
});

app.controller("StreamingEndpointSQSSettingsController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, WT1, LoggerProvider, FutureWatcher){
    var Logger = LoggerProvider.getLogger('streaming-endpoints.settings');

    $scope.uiState = $scope.uiState || {};
    
    DataikuAPI.connections.getNames('SQS').success(function (data) {
        $scope.connections = data;
        if (!$scope.streamingEndpoint.params.connection && data.length) {
            $scope.streamingEndpoint.params.connection = data[0];
        }
    }).error(setErrorInScope.bind($scope));
    
    $scope.fetchQueues = function() {
        $scope.uiState.forceCustom = false;
        DataikuAPI.streamingEndpoints.testSQS($stateParams.projectKey, $scope.streamingEndpoint).success(function(data) {
            $scope.uiState.queuesFetched = true;
            $scope.uiState.testResults = data;            
            $scope.uiState.queues = data.queues;
        }).error(setErrorInScope.bind($scope));
    };
});

app.controller("StreamingEndpointHttpSSESettingsController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, WT1, LoggerProvider, FutureWatcher){
    var Logger = LoggerProvider.getLogger('streaming-endpoints.settings');

    $scope.uiState = $scope.uiState || {};
    
    $scope.testParams = function() {
        DataikuAPI.streamingEndpoints.testHttpSSE($stateParams.projectKey, $scope.streamingEndpoint).success(function(data) {
            $scope.uiState.testResults = data;            
        }).error(setErrorInScope.bind($scope));
    };
});


app.controller("StreamingEndpointKDBPlusTickSettingsController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, WT1, LoggerProvider, FutureWatcher){
    var Logger = LoggerProvider.getLogger('streaming-endpoints.settings');

    $scope.uiState = $scope.uiState || {};

    DataikuAPI.connections.getNames('kdbplus').success(function (data) {
        $scope.connections = data;
        if (!$scope.streamingEndpoint.params.connection && data.length) {
            $scope.streamingEndpoint.params.connection = data[0];
        }
    }).error(setErrorInScope.bind($scope));
});


app.controller("StreamingEndpointExploreController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, WT1, LoggerProvider, FutureWatcher){
    var Logger = LoggerProvider.getLogger('streaming-endpoints.explore');

    TopNav.setLocation(TopNav.TOP_FLOW, "streaming-endpoints", TopNav.TABS_STREAMING_ENDPOINT, "explore");
    $controller('StreamingEndpointCommonController', {$scope: $scope});
});

app.controller("StreamingEndpointHistoryController", function($scope, $controller, $state, $stateParams, TopNav, DataikuAPI, WT1, LoggerProvider){
    TopNav.setLocation(TopNav.TOP_FLOW, "streaming-endpoints", TopNav.TABS_STREAMING_ENDPOINT, "history");
    $controller('StreamingEndpointCommonController', {$scope: $scope});
});

app.controller("StreamingEndpointPageRightColumnActions", async function($controller, $scope, $rootScope, $stateParams, $state, DataikuAPI, ActiveProjectKey) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    $scope.selection = {
        selectedObject : { "name" : $stateParams.streamingEndpointId, "projectKey" : $stateParams.projectKey},
        confirmedItem : { "name" : $stateParams.streamingEndpointId, "projectKey" : $stateParams.projectKey}
    };

    function updateUserInterests() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "STREAMING_ENDPOINT", ActiveProjectKey.get(), $stateParams.streamingEndpointId).success(function(data) {
            $scope.selection.selectedObject.interest = data;
        }).error(setErrorInScope.bind($scope));
    }

    updateUserInterests();
    const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);
    $scope.$on("$destroy", interestsListener);

    $scope.isOnStreamingEndpointObjectPage = function() {
        return $state.includes('projects.project.streaming-endpoints.streaming-endpoint');
    }
});


app.directive('streamingEndpointRightColumnSummary', function($state, $controller, $stateParams,
    DataikuAPI, ComputablesService, DatasetsService, CreateModalFromTemplate, QuickView, GlobalProjectActions) {
    return {
        templateUrl :'/templates/streaming-endpoints/right-column-summary.html',

        link : function(scope, element, attrs) {

            $controller('_TaggableObjectsMassActions', {$scope: scope});

            scope.$stateParams = $stateParams;
            scope.QuickView = QuickView;

            function getSmartName(projectKey, name) {
                if (projectKey == $stateParams.projectKey) {
                    return name;
                } else {
                    return projectKey + '.' + name;
                }
            }

            /* Auto save when summary is modified */
            scope.$on("objectSummaryEdited", function(){
                DataikuAPI.streamingEndpoints.save($stateParams.projectKey, scope.se, {summaryOnly:true}).success(function(data) {
                    ActivityIndicator.success("Saved");
                }).error(setErrorInScope.bind(scope));
            });

            scope.refreshData = function() {
                DataikuAPI.streamingEndpoints.getFullInfo($stateParams.projectKey, getSmartName(scope.selection.selectedObject.projectKey, scope.selection.selectedObject.name)).success(function(data){
                    scope.objectFullInfo = data;
                    scope.se = data.streamingEndpoint;
                    scope.isLocalStreamingEndpoint = scope.selection.selectedObject && scope.selection.selectedObject.projectKey == $stateParams.projectKey;
                    scope.usability = GlobalProjectActions.getAllStatusForStreamingEndpoint(data.streamingEndpoint);
                    scope.se.zone = (scope.selection.selectedObject.usedByZones || [])[0] || scope.selection.selectedObject.ownerZone;
                }).error(setErrorInScope.bind(scope));

            };

            scope.$watch("selection.selectedObject",function() {
                if(scope.selection.selectedObject != scope.selection.confirmedItem) {
                    scope.se = null;
                }
            });

            scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) {
                    return;
                }
                if (!nv.projectKey) {
                    nv.projectKey = $stateParams.projectKey;
                }
                scope.refreshData();
            });

            scope.buildStreamingEndpoint = function() {
                // TODO @streaming
                // CreateModalFromTemplate("/templates/managedfolder/build-folder-modal.html", scope, "BuildManagedFolderController", function(newScope) {
                //     newScope.projectKey = scope.odb.projectKey;
                //     newScope.odbId = scope.odb.id;
                // });
            };
        }
    }
});

app.controller("StreamingEndpointDetailsController", function($scope, $stateParams, DataikuAPI, FutureProgressModal, StateUtils, Dialogs, ActiveProjectKey) {
    $scope.StateUtils = StateUtils;
    $scope.isLocalStreamingEndpoint = function() {
        return $scope.data.projectKey == ActiveProjectKey.get();
    };
});


})();
