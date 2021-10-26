(function() {
'use strict';

const app = angular.module('dataiku.taggableobjects', []);


// Keep in sync with Java TaggableType enum
app.constant("TAGGABLE_TYPES", [
    'PROJECT',
    'FLOW_ZONE',
    'DATASET',
    'MANAGED_FOLDER',
    'STREAMING_ENDPOINT',
    'RECIPE',
    'SQL_NOTEBOOK',
    'JUPYTER_NOTEBOOK',
    'ANALYSIS',
    'STATISTICS_WORKSHEET',
    'SAVED_MODEL',
    'MODEL_EVALUATION_STORE',
    'SCENARIO',
    'DASHBOARD',
    'INSIGHT',
    'WEB_APP',
    'REPORT',
    'ARTICLE',
    'LAMBDA_SERVICE',
]);

// Can be exposed from one project to another
app.constant("EXPOSABLE_TYPES", [
    'DATASET',
    'SAVED_MODEL',
    'MANAGED_FOLDER',
    'JUPYTER_NOTEBOOK',
    'WEB_APP',
    'REPORT',
    'SCENARIO'
]);

// Computable in the flow (as outputs of recipes)
app.constant("FLOW_COMPUTABLE_TYPES", [
    'DATASET',
    'MANAGED_FOLDER',
    'SAVED_MODEL',
    'MODEL_EVALUATION_STORE',
    'STREAMING_ENDPOINT'
]);

// Publishable as insights on dashboards
app.constant("PUBLISHABLE_TYPES", [
    'DATASET',
    'JUPYTER_NOTEBOOK',
    'SAVED_MODEL',
    'MANAGED_FOLDER',
    'SCENARIO',
    'WEB_APP',
    'REPORT'
]);

app.constant('PIPELINEABILITY_ACTIONS', {
    changeSQL: 'action-change-sql-pipelineability',
    changeSpark: 'action-change-spark-pipelineability'
});


function isHDFSAbleType(type) {
    return ['HDFS', 'S3', 'GCS', 'Azure'].includes(type);
}

/*
There are essentially 4 representations for taggable objects in the JS code:
- {type, projectKey, id [,displayName]}, the equivalent of java TaggableObjectRef (so it's good to call those variables tor or something similar)
- the actual serialized taggable object (they can be called using they actual types or 'to' or something similar)
- the graph node (that use in particular a specific id system) (good to call them 'node' or something similar)
- the list items, as used in list pages (good to call them 'listItem' or something similar)

This service helps juggling with them
*/
app.service("TaggableObjectsUtils", function($state, $stateParams) {
    const svc = this;

    // Returns the items common taggableType or 'TAGGABLE_OBJECT' if they don't have the same
    // Items can be an array of taggable type or an array of arbitrary objects that 'typeFieldAccessor' can map to taggable types
    this.getCommonType = function(items, typeFieldAccessor) {
        let commonType = null;
        for (let i = 0; i < items.length; ++i) {
            let itemType = typeFieldAccessor ? typeFieldAccessor(items[i]) : items[i];
            if (!commonType) {
                commonType = itemType;
            } else if (commonType != itemType) {
                return 'TAGGABLE_OBJECT';
            }
        }
        return commonType || 'TAGGABLE_OBJECT';
    };

    this.fromNodeType = function(nodeType) {
        if (!nodeType) return;

        if (nodeType.includes('DATASET')) {
            return 'DATASET';
        } else if (nodeType.includes('LAMBDA_SERVICE')) {
            return 'LAMBDA_SERVICE';
        } else if (nodeType.includes('SAVEDMODEL')) {
            return 'SAVED_MODEL';
        } else if (nodeType.includes('MODELEVALUATIONSTORE')) {
            return 'MODEL_EVALUATION_STORE';
        } else if (nodeType.includes('STREAMING_ENDPOINT')) {
            return 'STREAMING_ENDPOINT';
        } else if (nodeType.includes('MANAGED_FOLDER')) {
            return 'MANAGED_FOLDER';
        } else if (nodeType == 'RECIPE') {
            return 'RECIPE';
        } else if (nodeType == 'PROJECT') {
            return 'PROJECT';
        } else if (nodeType == 'JUPYTER_NOTEBOOK') {
            return 'JUPYTER_NOTEBOOK';
        } else if (nodeType == 'SQL_NOTEBOOK') {
            return 'SQL_NOTEBOOK';
        } else if (nodeType == 'DASHBOARD') {
            return 'DASHBOARD';
        } else if (nodeType == 'INSIGHT') {
            return 'INSIGHT';
        } else if (nodeType == 'SCENARIO') {
            return 'SCENARIO';
        } else if (nodeType == 'ANALYSIS') {
            return 'ANALYSIS';
        } else if (nodeType == 'WEB_APP') {
            return 'WEB_APP';
        } else if (nodeType == 'REPORT') {
            return 'REPORT';
        } else if (nodeType == 'NOTEBOOK') {
            return 'NOTEBOOK';
        } else if (nodeType == 'ZONE') {
            return 'FLOW_ZONE';
        }
    };

    this.fromNode = function(node) {
        return {
            type: svc.fromNodeType(node.nodeType),
            projectKey: node.projectKey,
            id: node.name,
            displayName: node.description || node.name,
            subType: node.datasetType || node.recipeType || node.smType,
            tags: node.tags
        };
    };

    this.fromObjectItem = function(objectItem) {
        return {
            type: svc.fromNodeType(objectItem.nodeType),
            projectKey: objectItem.projectKey,
            id: objectItem.id,
            displayName: objectItem.description || objectItem.name,
            subType: objectItem.datasetType || objectItem.recipeType || objectItem.smType,
            tags: objectItem.tags
        };
    };

    this.fromListItem = function(listItem) {
        return {
            type: svc.taggableTypeFromAngularState(listItem),
            projectKey: $stateParams.projectKey,
            id: listItem.id,
            displayName: listItem.name,
            subType: listItem.type,
            tags: listItem.tags
        };
    };

    this.taggableTypeFromAngularState = function(listItem) {
        const stateName = $state.current.name;

        // in the special case of notebooks, we cannot retrieve the taggable type only from angular state
        // then we use the item to get the language to determine the proper taggle type
        if (listItem && listItem.type && stateName.startsWith('projects.project.notebooks')) {
            if (listItem.type == 'SQL') {
                return 'SQL_NOTEBOOK';
            } else {
                return 'JUPYTER_NOTEBOOK';
            }
        }
        if (listItem && stateName.startsWith('projects.project.continuous-activities')) {
            return 'CONTINUOUS_ACTIVITY';
        }

        if (stateName.startsWith('projects.project.datasets') || stateName.startsWith('projects.project.foreigndatasets')) {
            return 'DATASET';
        } else if (stateName.startsWith('projects.project.streaming-endpoints')) {
            return 'STREAMING_ENDPOINT';
        } else if (stateName.startsWith('projects.project.managedfolders')) {
            return 'MANAGED_FOLDER';
        } else if (stateName.startsWith('projects.project.savedmodels')) {
            return 'SAVED_MODEL';
        } else if (stateName.startsWith('projects.project.modelevaluationstores')) {
            return 'MODEL_EVALUATION_STORE';
        } else if (stateName.startsWith('projects.project.recipes')) {
            return 'RECIPE';
        } else if (stateName.startsWith('projects.project.analyses')) {
            return 'ANALYSIS';
        } else if (stateName.startsWith('projects.project.scenarios')) {
            return 'SCENARIO';
        } else if (stateName.startsWith('projects.project.webapps')) {
            return 'WEB_APP';
        } else if (stateName.startsWith('projects.project.reports')) {
            return 'REPORT';
        } else if (stateName.startsWith('projects.project.dashboards.insights')) {
            return 'INSIGHT';
        } else if (stateName.startsWith('projects.project.dashboards')) {
            return 'DASHBOARD';
        } else if (stateName.startsWith('projects.project.lambdaservices')) {
            return 'LAMBDA_SERVICE';
        } else if (stateName.startsWith('projects.project.continuous-activities')) {
            throw new Error("Cannot get continuous activity taggable type from angular state");
        } else if (stateName.startsWith('projects.project.notebooks')) {
            throw new Error("Cannot get notebook taggable type from angular state");
        }
        //Note that we never return 'PROJECT'
        throw new Error("Failed to get taggable type from angular state");
    };

    this.isComputable = function(tor) {
        if (!tor) return;
        return tor.type == 'DATASET' || tor.type == 'MANAGED_FOLDER' || tor.type == 'SAVED_MODEL' || tor.type == 'MODEL_EVALUATION_STORE' || tor.type == 'STREAMING_ENDPOINT';
    };

    this.isLocal = function(tor) {
        if (!tor || !$stateParams.projectKey) return;
        return tor.projectKey == $stateParams.projectKey;
    };
    this.isHDFSAbleType = isHDFSAbleType;
});


app.service("TaggableObjectsService", function($stateParams, $rootScope, $q, DataikuAPI, CreateModalFromTemplate, Dialogs) {
    /* deletionRequests should be {taggableType: ... , projectKey: ... , id: ...} */
    this.delete = function(deletionRequests, customMassDeleteSelected) {
        let deferred = $q.defer();

        CreateModalFromTemplate("/templates/taggable-objects/delete-modal.html", $rootScope, "DeleteTaggableObjectsModalController", function(modalScope) {
            deletionRequests.forEach(function(dr) {
                dr.options = {dropData: false};
            })

            modalScope.computedImpact = {};
            modalScope.deletionRequests = deletionRequests;
            modalScope.currentProject = $stateParams.projectKey;
        }).then(function() {
            deletionRequests = deletionRequests.filter(it => it.type != "FLOW_ZONE" || it.id != "default"); // do not delete default zone
            deletionRequests.forEach(function(item, index, objcet) {
                if (item.type == 'JUPYTER_NOTEBOOK' && item.activeSessions) {
                    item.activeSessions.forEach(function(session) {
                        DataikuAPI.jupyterNotebooks.unload(session.sessionId);
                    });
                    delete item.activeSessions;
                }

            });

            const deleteCall = customMassDeleteSelected || DataikuAPI.taggableObjects.delete;

            deleteCall(deletionRequests, $stateParams.projectKey)
                .success(function(errors) {
                    $rootScope.$emit('flowItemAddedOrRemoved', deletionRequests);

                    deletionRequests.forEach(function(req) {
                        // HistoryService.notifyRemoved({
                        //     type: "DATASET",
                        //     id: req.name,
                        //     projectKey: req.projectKey
                        // },
                        // $scope.computedImpact.data
                        // );
                    });

                    DataikuAPI.flow.zones.list($stateParams.projectKey).then(data => {
                        if (data.data.length == 1 && data.data[0].id == "default") {
                            DataikuAPI.flow.zones.delete($stateParams.projectKey, "default");
                        }
                    });

                    Dialogs.infoMessagesDisplayOnly($rootScope, "Deletion", errors);
                    deferred.resolve();
                })
                .error(function() {
                    deferred.reject.apply(this, arguments);
                })
        });
        return deferred.promise;
    };
});


app.filter('niceTaggableType', function($filter) {
    const dict = {
        'MANAGED_FOLDER': 'folder',
        'SAVED_MODEL': 'model',
        'MODEL_EVALUATION_STORE': 'evaluation store',
        'LAMBDA_SERVICE': 'API service',
        'SQL_NOTEBOOK': 'SQL notebook',
        'TAGGABLE_OBJECT': 'item'
    };
    const plurals = {
        'ANALYSIS': 'analyses'
    };

    return function(input, count = 1) {
        if (!input) return input;
        return $filter('plurify')(dict[input] || input.toLowerCase().replace('_', ' '), count, plurals[input]);
    };
});


app.filter("taggableObjectRef", function() {
    return function(input) {
        if (!input || !input.type) return "";
        switch (input.type) {
            case 'PROJECT': return "Project " + input.projectKey;
            case 'DATASET': return "Dataset " + input.projectKey + "." + input.id;
            case 'RECIPE': return "Recipe " + input.projectKey + "." + input.id;
            default:
                // Pure laziness
                return input.id;
        }
    }
});


app.controller('_TaggableObjectPageRightColumnActions', function($scope, $controller, TaggableObjectsUtils) {

    $controller('TaggableObjectPageMassActionsCallbacks', {$scope: $scope});

    $scope.getSelectedNodes = function() {
        return [$scope.selection.selectedObject];
    };

    $scope.getSelectedTaggableObjectRefs = function() {
        return $scope.getSelectedNodes().map(TaggableObjectsUtils.fromObjectItem);
    };

});


app.controller("DeleteTaggableObjectsModalController", function($scope, $state, $stateParams, Assert, DataikuAPI, WT1, TaggableObjectsUtils, FLOW_COMPUTABLE_TYPES, PUBLISHABLE_TYPES) {

    $scope.$watch("deletionRequests", function(nv, ov) {
        if (nv == null) {
            return;
        }

        Assert.inScope($scope, 'deletionRequests');

        $scope.commonTaggableType = TaggableObjectsUtils.getCommonType($scope.deletionRequests, function(x) {return x.type;});

        // Flow computables, publishable items and dashboards deletion can have impact
        let typesWithImpact = PUBLISHABLE_TYPES.concat(FLOW_COMPUTABLE_TYPES).concat('DASHBOARD');
        let computeImpact = $scope.deletionRequests.filter(function(x) {return typesWithImpact.indexOf(x.type) > -1;}).length > 0;

        if (computeImpact) {
            DataikuAPI.taggableObjects.computeDeletionImpact($scope.deletionRequests, $stateParams.projectKey)
            .success(function(data) {
                $scope.computedImpact.data = data;
                $scope.nbActions = 0;
                for(let k in data.availableOptions) {
                    let optns = data.availableOptions[k];
                    let enabled = false;
                    for(let j in optns) {
                        enabled |= 'isDropDataDangerous' !== j && optns[j];
                    }
                    if(enabled) {
                        $scope.nbActions++;
                    }
                }
                // dashboards have two additional actions
                $scope.deletionRequests.forEach(function(dr) {
                    switch (dr.type) {
                    case 'DASHBOARD':
                        $scope.nbActions += 2;
                        $scope.hasAnyDashboard = true;
                        break;
                    case 'DATASET':
                        dr.options.dropData = $scope.appConfig.dropDataWithDatasetDeleteEnabled;
                        dr.options.dropMetastoreTable = $scope.appConfig.dropDataWithDatasetDeleteEnabled;
                        break;
                    case 'MANAGED_FOLDER':
                        dr.options.dropData = $scope.appConfig.dropDataWithDatasetDeleteEnabled;
                        break;
                    }
                });
            })
            .error(setErrorInScope.bind($scope));
        } else {
            $scope.computedImpact.data = {
                ok: true
            };
        }

        $scope.confirm = function() {
            WT1.event("taggable-items-delete-many", {state: $state.current, numberOfItems: $scope.deletionRequests.length});
            $scope.resolveModal();
            $scope.dismiss();
        };
    });
});

// WARNING Keep the switch in sync with other _XXX_MassActionsCallbacks controllers (flow, taggable objects pages, list pages)
app.controller('TaggableObjectPageMassActionsCallbacks', function($scope, $rootScope, $state, DKUtils, PIPELINEABILITY_ACTIONS) {

    $scope.onAction = function(action) { //NOSONAR
        switch (action) {
            case 'action-delete':
                $state.go("projects.project.flow");
                break;
            case 'action-tag':
                break;
            case 'action-watch':
            case 'action-star':
                $rootScope.$emit('userInterestsUpdated');
                break;
            case 'action-clear':
                DKUtils.reloadState();
                break;
            case 'action-build':
                break;
            case 'action-change-connection':
                DKUtils.reloadState();
                break;
            case 'action-update-status':
            case 'action-set-auto-count-of-records':
            case 'action-set-virtualizable':
            case 'action-add-to-scenario':
            case 'action-share':
                break;
            case 'action-unshare':
                $state.go("projects.project.flow");
                break;
            case 'action-change-recipes-engines':
            case 'action-change-spark-config':
            case PIPELINEABILITY_ACTIONS.changeSpark:
            case PIPELINEABILITY_ACTIONS.changeSQL:
            case 'action-change-impala-write-mode':
            case 'action-change-hive-engine':
            case 'action-change-spark-engine':
                //Should not be possible on this page
                break;
            case 'action-convert-to-hive':
            case 'action-convert-to-impala':
                DKUtils.reloadState();
                break;
            case 'action-change-python-env':
            case 'action-change-r-env':
                DKUtils.reloadState();
                break;
            default:
                break;
        }
    }
});

// WARNING Keep the switch in sync with other _XXX_MassActionsCallbacks controllers (flow, taggable objects pages, list pages)
app.controller('ListMassActionsCallbacks', function($scope, PIPELINEABILITY_ACTIONS) {

    $scope.onAction = function(action) { //NOSONAR
        switch (action) {
            case 'action-delete':
            case 'action-tag':
            case 'action-watch':
            case 'action-star':
            case 'action-clear':
            case 'action-build':
            case 'action-change-connection':
            case 'action-update-status':
            case 'action-set-auto-count-of-records':
            case 'action-set-virtualizable':
            case 'action-add-to-scenario':
            case 'action-share':
            case 'action-unshare':
            case 'action-change-recipes-engines':
            case 'action-change-spark-config':
            case PIPELINEABILITY_ACTIONS.changeSQL:
            case PIPELINEABILITY_ACTIONS.changeSpark:
            case 'action-change-impala-write-mode':
            case 'action-change-hive-engine':
            case 'action-change-spark-engine':
            case 'action-convert-to-hive':
            case 'action-convert-to-impala':
            case 'action-change-python-env':
            case 'action-change-r-env':
                $scope.list();
                break;
            default:
                break;
        }
    }
});


app.controller('_TaggableObjectsListPageCommon', function($controller, $scope, $filter, $state, $stateParams, $rootScope,
    DataikuAPI, WT1, Fn,
    TaggableObjectsService, TaggableObjectsUtils, TaggingService, InterestsService) {

    $controller('ListMassActionsCallbacks', {$scope: $scope});
    $controller('_TaggableObjectsMassActions', {$scope: $scope});

    let loadMoreLock = false;
    $scope.loadMoreItems = function() {
        if(!loadMoreLock && $scope.listItems && $scope.maxItems < $scope.listItems.length) {
            $scope.maxItems += 20;
            loadMoreLock = true;
            setTimeout(function() {loadMoreLock=false;}, 300);
        }
    };

    $scope.selectTag = function(filterQuery,tag) {
        let index = filterQuery.tags.indexOf(tag);
        if(index >= 0) {
            filterQuery.tags.splice(index, 1);
        } else {
            filterQuery.tags.push(tag);
        }
    };

    $scope.restoreOriginalSelection = function() {
        $scope.selection.filteredSelectedObjects.forEach(obj => {
            let i = $scope.listItems.find(item => item.id === obj.id);
            if (i) {
                i.$selected = true;
            }
        });
    }

    $scope.$on('tagSelectedInList', function(e, tag) {
        $scope.selectTag($scope.selection.filterQuery,tag);
        e.stopPropagation();
    });

    $scope.$on('selectedIndex', function(e, index) {
        // an index has been selected, we unselect the multiselect
        $scope.$broadcast('clearMultiSelect');
    });

    $scope.$on('projectTagsUpdated', function (e, args) {
        if (args.refreshFlowFilters) $scope.list();
    });

    const updateSelectedObjectMetadata = function (metaData) {
        const o = $scope.selection.selectedObject;
        if (o) {
            o.shortDesc = metaData.shortDesc;
            o.description = metaData.description;
            o.tags = metaData.tags;
            o.checklists = metaData.checklists;
            o.customFields = metaData.customFields;
        }
    };

    $scope.$on("objectMetaDataRefresh", function(ev, metaData) {
        updateSelectedObjectMetadata(metaData);
    });  

    $scope.$on('objectMetaDataChanged', (ev, metaData) => {
        updateSelectedObjectMetadata(metaData);
    });

    $scope.allStarred = function(listItems) {
        if (!listItems || !listItems.length) return true;
        return listItems.map(x => !!(x && x.interest && x.interest.starred)).reduce((a,b) => a && b);
    };

    $scope.allWatching = function(listItems) {
        if (!listItems || !listItems.length) return true;

        return listItems
            .map(it => it.interest && it.interest.watching)
            .every($scope.isWatching);
    };

    $scope.watchObject = function(watch, item) {
        InterestsService.watch($scope, [TaggableObjectsUtils.fromListItem(item)], watch).then($scope.list); //GRUIK, list is not that necessary
    };

    $scope.starObject = function(star, item) {
        InterestsService.star($scope, [TaggableObjectsUtils.fromListItem(item)], star).then($scope.list); //GRUIK, list is not that necessary
    };

    $scope.toggleFilterStarred = function() {
        let fq = $scope.selection.filterQuery;
        fq.interest.starred = (fq.interest.starred === '' ? 'true' : '');
    };

    /* Default list call */
    $scope.list = function() {
        $scope.listHeads($stateParams.projectKey, $scope.tagFilter).success(function(data) {
            $scope.filteredOut = data.filteredOut;
            $scope.listItems = data.items;
            $scope.restoreOriginalSelection();
            if ($scope.listHeadHook && typeof($scope.listHeadHook.list) === "function") {
                $scope.listHeadHook.list($scope.listItems);
            }
        }).error(setErrorInScope.bind($scope));
    };

    $scope.getSelectedListItems = function() {
        if($scope.selection.selectedObjects && $scope.selection.selectedObjects.length) {
            return $scope.selection.selectedObjects;
        } else if ($scope.selection.selectedObject) {
            return [$scope.selection.selectedObject];
        } else {
            return [];
        }
    };

    $scope.getSelectedTaggableObjectRefs = function() {
        return $scope.getSelectedListItems().map(TaggableObjectsUtils.fromListItem);
    };

    try {
        $scope.listItemType = TaggableObjectsUtils.taggableTypeFromAngularState();
    } catch (e) {
        console.info("Cannot set the taggable type on this list page"); // It will be the case for notebooks in particular since there is no "notebook" taggableType
    }
});


app.service('TaggableObjectsCapabilities', function($stateParams, RecipesCapabilities, TaggableObjectsUtils) {
    $.extend(this, RecipesCapabilities);

    this.canChangeConnection = function(tor) {
        if (tor.nodeType) {
            //This is a node, not a taggableObjectReference
            tor = TaggableObjectsUtils.fromNode(tor);
        }
        if ($stateParams.projectKey && tor.projectKey != $stateParams.projectKey) {
            return false;
        }
        if (tor.type == 'DATASET') {
            if (tor.subType && ['Inline', 'UploadedFiles'].includes(tor.subType)) {
                return false;
            }
            return true;
        } else if (tor.type == 'MANAGED_FOLDER') {
            return true;
        }
        return false;
    };
    this.canSyncMetastore = function(tor) {
        if (tor.nodeType) {
            //This is a node, not a taggableObjectReference
            tor = TaggableObjectsUtils.fromNode(tor);
        }
        if ($stateParams.projectKey && tor.projectKey != $stateParams.projectKey) {
            return false;
        }
        if (tor.type == 'DATASET') {
            if (tor.subType && isHDFSAbleType(tor.subType)) {
                return true;
            }
        }
        return false;
    };
});


// Move the service functionalities to the scope
app.controller('_TaggableObjectsCapabilities', function($scope, TaggableObjectsCapabilities) {
    $.extend($scope, TaggableObjectsCapabilities);
});


app.controller('_TaggableObjectsMassActions', function($scope, $state, $rootScope, $q, $stateParams, WT1, Logger, Dialogs, DataikuAPI, CreateModalFromTemplate,
    TaggableObjectsService, TaggingService,
    ImpalaService, HiveService, SparkService, ComputablesService, DatasetsService, DatasetConnectionChangeService, SubFlowCopyService, RecipesEnginesService, ExposedObjectsService,
    GlobalProjectActions, RecipeDescService, FlowGraphSelection, FlowTool,
    InterestsService, InterestWording, WatchInterestState,
    CodeEnvsService, PipelineService, PIPELINEABILITY_ACTIONS) {
    //Expects a $scope.getSelectedTaggableObjectRefs()

    function onAction(action) {
        return function(data) {
            if ($scope.onAction) {
                $scope.onAction(action);
            } else {
                Logger.warn('No mass action callbacks handler');
            }
            return data;
        };
    }

    // Generic mass actions

    $scope.deleteSelected = function(items = $scope.getSelectedTaggableObjectRefs(), onSuccess = onAction('action-delete')) {
        WT1.event("action-delete", {state: $state.current.name, items: items.length});
        return TaggableObjectsService.delete(items, $scope.customMassDeleteSelected).then(onSuccess);
    };

    $scope.startApplyTagging = function(selection = $scope.getSelectedTaggableObjectRefs()) {
        WT1.event("action-tag", {state: $state.current.name, items: selection.length});
        TaggingService.startApplyTagging(selection).then(onAction('action-tag'));
    };

    $scope.copyAllSelected = function() {
        // Note that we want the nodes here, not the refs
        WT1.event("action-copy-all", {state: $state.current.name, preselectedNodes: $scope.getSelectedNodes().length});
        $scope.startTool('COPY', {preselectedNodes: $scope.getSelectedNodes().map(n => n.id)});
    };

    $scope.watchObjects = function(watch) {
        InterestsService.watch($scope, $scope.getSelectedTaggableObjectRefs(), watch).then(onAction('action-watch'));
    };

    $scope.starObjects = function(star) {
        InterestsService.star($scope, $scope.getSelectedTaggableObjectRefs(), star).then(onAction('action-star'));
    };

    $scope.isWatching = WatchInterestState.isWatching;
    $scope.actionLabels = { ...InterestWording.labels };
    $scope.actionTooltips = { ...InterestWording.tooltips };

    // Computables

    $scope.resynchronizeMetastore = function() {
        WT1.event("action-sync-metastore", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        HiveService.resynchronizeMetastore($scope.getSelectedTaggableObjectRefs());
    };

    $scope.resynchronizeDataset = function() {
        WT1.event("action-sync-dataset", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        HiveService.resynchronizeDataset($scope.getSelectedTaggableObjectRefs());
    };

    $scope.clearSelected = function() {
        WT1.event("action-clear", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        ComputablesService.clear($scope, $scope.getSelectedTaggableObjectRefs()).then(onAction('action-clear'));
    };

    $scope.buildSelected = function() {
        WT1.event("action-build", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        $scope.buildSelectedComputables($scope.getSelectedTaggableObjectRefs()).then(onAction('action-build'));
    }

    $scope.changeSelectedItemsConnections = function() {
        WT1.event("action-change-connection", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        DatasetConnectionChangeService.start($scope.getSelectedTaggableObjectRefs()).then(onAction('action-change-connection'));
    };

    $scope.updateStatuses = function() {
        const items = $scope.getSelectedTaggableObjectRefs().filter(it => it.type == 'DATASET');
        WT1.event("action-update-status", {state: $state.current.name, items: items.length});
        DatasetsService.refreshSummaries($scope, items)
            .then(onAction('action-update-status'))
            .then(function(result) {
                if(result.anyMessage) {
                    Dialogs.infoMessagesDisplayOnly($scope, "Datasets statuses update results", result);
                }
            }, setErrorInScope.bind($scope))
    };

    $scope.startSetAutoCountOfRecords = function() {
        const items = $scope.getSelectedTaggableObjectRefs().filter(it => it.type == 'DATASET');
        WT1.event("action-set-auto-count-of-records", {state: $state.current.name, items: items.length});
        DatasetsService.startSetAutoCountOfRecords(items).then(onAction('action-set-auto-count-of-records'));
    };

    $scope.setAutoCountOfRecords = function(autoCountOfRecords) {
        const items = $scope.getSelectedTaggableObjectRefs().filter(it => it.type == 'DATASET');
        WT1.event("action-set-auto-count-of-records2", {state: $state.current.name, items: items.length});
        DatasetsService.setAutoCountOfRecords(items, autoCountOfRecords).then(onAction('action-set-auto-count-of-records'));
    };

    $scope.setVirtualizable = function(virtualizable) {
        WT1.event("action-set-virtualizable", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        DatasetsService.setVirtualizable($scope, $scope.getSelectedTaggableObjectRefs(), virtualizable).then(onAction('action-set-virtualizable'));
    };

    $scope.addSelectedToScenario = function() {
        WT1.event("action-add-to-scenario", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});

        CreateModalFromTemplate('/templates/scenarios/add-to-scenario-modal.html', $scope, 'AddToScenarioModalController', function(modalScope) {
        /*empty?*/}).then(onAction('action-add-to-scenario'));
    };

    $scope.exposeSelected = function() {
        WT1.event("action-share", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        ExposedObjectsService.exposeObjects($scope.getSelectedTaggableObjectRefs()).then(onAction('action-share'));
    };

    $scope.unshare = function() {
        WT1.event("action-unshare", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        ExposedObjectsService.unshare($scope.getSelectedTaggableObjectRefs()).then(onAction('action-unshare'));
    };

    // Recipes

    $scope.changeSelectedRecipesEngines = function() {
        WT1.event("action-change-recipes-engines", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        RecipesEnginesService.startChangeEngine($scope.getSelectedTaggableObjectRefs()).then(onAction('action-change-recipes-engines'));
    };

    $scope.changeSelectedSparkConfig = function() {
        WT1.event("action-change-spark-config", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        SparkService.startChangeSparkConfig($scope.getSelectedTaggableObjectRefs()).then(onAction('action-change-spark-config'));
    };

    $scope.changeSelectedPipelineability = function(pipelineActionType) {
        WT1.event(pipelineActionType, {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        const pipelineType = pipelineActionType === PIPELINEABILITY_ACTIONS.changeSpark ? 'SPARK' : 'SQL';
        PipelineService
            .startChangePipelineability($scope.getSelectedTaggableObjectRefs(), pipelineType)
            .then(onAction(pipelineActionType));
    };

    $scope.changeSelectedSparkPipelineability = function() {
        $scope.changeSelectedPipelineability(PIPELINEABILITY_ACTIONS.changeSpark);
    };

    $scope.changeSelectedSqlPipelineability = function() {
        $scope.changeSelectedPipelineability(PIPELINEABILITY_ACTIONS.changeSQL);
    };

    $scope.changeSelectedImpalaWriteMode = function() {
        WT1.event("action-change-impala-write-mode", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        ImpalaService.startChangeWriteMode($scope.getSelectedTaggableObjectRefs()).then(onAction('action-change-impala-write-mode'));
    };

    $scope.changeSelectedHiveEngine = function() {
        WT1.event("action-change-hive-engine", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        HiveService.startChangeHiveEngine($scope.getSelectedTaggableObjectRefs()).then(onAction('action-change-hive-engine'));
    };

    $scope.changeSelectedSparkEngine = function() {
        WT1.event("action-change-spark-engine", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        HiveService.startChangeSparkEngine($scope.getSelectedTaggableObjectRefs()).then(onAction('action-change-spark-engine'));
    };

    $scope.convertSelectedToHive = function() {
        WT1.event("action-convert-to-hive", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        ImpalaService.convertToHive($scope.getSelectedTaggableObjectRefs()).then(onAction('action-convert-to-hive'));
    };

    $scope.convertSelectedToImpala = function() {
        WT1.event("action-convert-to-impala", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        HiveService.convertToImpala($scope.getSelectedTaggableObjectRefs()).then(onAction('action-convert-to-impala'));
    };

    $scope.changePythonEnvSelection = function() {
        WT1.event("action-change-python-env", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        CodeEnvsService.startChangeCodeEnv($scope.getSelectedTaggableObjectRefs(), 'PYTHON', $scope).then(onAction('action-change-python-env'))
    };

    $scope.changeREnvSelection = function() {
        WT1.event("action-change-r-env", {state: $state.current.name, items: $scope.getSelectedTaggableObjectRefs().length});
        CodeEnvsService.startChangeCodeEnv($scope.getSelectedTaggableObjectRefs(), 'R', $scope).then(onAction('action-change-r-env'))
    };

    $scope.computeActionsUsability = function() {
        const usability = {
            recipes: { // quick hack: prefill with actions that will be available even without datasets
                python: {ok: true},
                r: {ok: true},
                shell: {ok: true},
                julia: {ok: true},
            },
            things: {},
            selectablePlugins: []
        };

        function mergeUsability(itemUsability) {
            const rus = usability.recipes;
            $.each(itemUsability.recipes, function(recipeType, ru) {
                if (!rus[recipeType]) {
                    rus[recipeType] = angular.copy({ok: true, details: {enableStatus: 'OK'} });
                }
                if (!rus[recipeType].ok) {
                    return;
                }
                if (!ru.ok) {
                    rus[recipeType].ok = false;
                    rus[recipeType].reason = ru.reason;
                }
            });


            const tus = usability.things;
            $.each(itemUsability.things, function(thing, tu) {
                if (!tus[thing]) {
                    tus[thing] = angular.copy({ok: true, details: {enableStatus: 'OK'} });
                }
                if (!tus[thing].ok) {
                    return;
                }
                if (!tu.ok) {
                    tus[thing].ok = false;
                    tus[thing].reason = tu.reason;
                }
            });
        }

        $scope.getSelectedTaggableObjectRefs().forEach(function(item) {
            if (item.type == 'DATASET') {
                const datasetRef = {
                    projectKey: item.projectKey,
                    name: item.id,
                    type: item.subType
                };
                mergeUsability(GlobalProjectActions.getAllStatusForDataset(datasetRef))
            }
        });
        return usability;
    }
    $scope.startContinuous = function(item) {
        WT1.event("start-continuous")
        CreateModalFromTemplate("/templates/continuous-activities/start-continuous-activity-modal.html", $scope, "StartContinuousActivityController", function(newScope) {
            newScope.recipeId = item.name;
        }).then(function(loopParams) {
            DataikuAPI.continuousActivities.start($stateParams.projectKey, item.name, loopParams).success(function(data){
                onAction('action-build');
            }).error(setErrorInScope.bind($scope));
        });
    }
    $scope.stopContinuous = function(item) {
        WT1.event("stop-continuous")
        DataikuAPI.continuousActivities.stop($stateParams.projectKey, item.name).success(function(data){
            onAction('action-build');
        }).error(setErrorInScope.bind($scope));
    }
    
    $scope.startAllContinuous = function(objects) {
        WT1.event("start-continuous")
        CreateModalFromTemplate("/templates/continuous-activities/start-continuous-activity-modal.html", $scope, "StartContinuousActivityController", function(newScope) {
            newScope.recipeId = objects[0].name;
        }).then(function(loopParams) {
            let promises = objects.map(function(object) {
                return DataikuAPI.continuousActivities.start($stateParams.projectKey, object.name, loopParams)
            });
            $q.all(promises).then(function (values) {
                onAction('action-build');
            });
        });
    };
    $scope.stopAllContinuous = function(objects) {
        WT1.event("stop-continuous")
        let promises = objects.map(function(object) {
            return DataikuAPI.continuousActivities.stop($stateParams.projectKey, object.name)
        });
        $q.all(promises).then(function (values) {
            onAction('action-build');
        });
    };
    $scope.refreshAllContinuous = function(objects) {
        // grab the state of all continuous activities in the project, not just the selected ones
        // but the nodes objects are in the objects parameter
        DataikuAPI.continuousActivities.getStates($stateParams.projectKey).success(function(data) {
            // compute the {beingBuilt,continuousActivityDone} of each activity
            let states = {};
            data.activities.forEach(function(activity) {
                let beingBuilt = activity.desiredState == 'STARTED';
                let continuousActivityDone = beingBuilt && ((activity.mainLoopState || {}).futureInfo || {}).hasResult
                states[activity.recipeId] = {beingBuilt: beingBuilt, continuousActivityDone: continuousActivityDone}
            });
            
            var changes = 0;
            objects.forEach(function(o) {
                let continuousActivityDone = (states[o.name] || {}).continuousActivityDone || false;
                if (o.continuousActivityDone != continuousActivityDone) {
                    o.continuousActivityDone = continuousActivityDone;
                    changes += 1;
                }                    
            });
            if (changes > 0) {
                $rootScope.$broadcast("graphRendered");
            }
        }).error(setErrorInScope.bind($scope));
    };
    
});


app.directive('contributorsList', function($state) {
    return {
        templateUrl: '/templates/contributors-list.html',
        scope: {
            timeline: '=tl'
        },
        link: function(scope) {
            scope.$state = $state;
        }
    };
});


app.service("_SummaryHelper", function($stateParams, Dialogs, DataikuAPI, WT1, Logger, CreateModalFromTemplate, InterestsService) {
    const svc = this;

    this.addEditBehaviour = function($scope, element) {

        $scope.state = {
            currentEditing : null,
            name : { editing: false, newVal: null, selector : ".name-edit-zone"},
            shortDesc : { editing: false, newVal: null, selector : ".shortdesc-edit-zone"},
            description : { editing: false, newVal: null, selector : ".desc-edit-zone"},
            tags: {editing : false, newVal : null},
            projectStatus: {editing : false, newVal : null},

            checklistTitle : { editing : null, newVal : null }
        };

        function cancelAllEdits () {
            if ($scope.state.checklistTitle.editing) {
                $scope.cancelChecklistTitleEdit();
            }
            if ($scope.state.currentEditing) {
                $scope.cancelFieldEdit();
            }
            if ($scope.state.tags.editing) {
                $scope.cancelEditTags();
            }
        }

        $scope.startEditChecklistTitle = function(checklist) {
            cancelAllEdits();
            checklist.editingTitle = true;
            $scope.state.checklistTitle.editing = checklist;
            $scope.state.checklistTitle.newVal = checklist.title;
            window.setTimeout(function() {
                $(".checklist-title", element).on("click.editField", function(e) {
                    e.stopPropagation();
                });
                $("html").on("click.editField", function(event) {
                    $scope.$apply(function() {$scope.cancelChecklistTitleEdit()});
                })
            }, 0)
        };

        $scope.validateChecklistTitleEdit = function() {
            $scope.state.checklistTitle.editing.title = $scope.state.checklistTitle.newVal;
            $scope.cancelChecklistTitleEdit();
        };

        $scope.cancelChecklistTitleEdit = function() {
            $scope.state.checklistTitle.editing.editingTitle = false;
            $scope.state.checklistTitle.editing = null;
            $(".checklist-title", element).off("click.editField");
            $("html").off("click.editField");
        };

        $scope.startFieldEdit = function(field, allowed) {
            if (allowed === false) return;
            cancelAllEdits();
            const fstate = $scope.state[field];
            fstate.editing = true;
            if (fstate.newVal == null) {
                fstate.newVal = $scope.object[field];
            }
            $scope.state.currentEditing = field;

            window.setTimeout(function() {
                fstate.suppressClick = false;
                $(fstate.selector, element).on("mousedown.editField", function(e) {
                    fstate.suppressClick = true;
                });
                $("html").on("mouseup.editField", function(event) {
                    const filterCMHints = function(node) {
                        return node.className == 'CodeMirror-hints';
                    };
                    const filterCMModal = function(node) {
                    return Array.prototype.indexOf.call(node.classList || [],'codemirror-editor-modal') >= 0;  //often this is a DOMTokenList not an array
                    };
                    const filterBSSelect = function(node) {
                        return Array.prototype.indexOf.call(node.classList || [],'bootstrap-select') >= 0;
                    };
                    const filterObjectSelector = function(node) {
                        return Array.prototype.indexOf.call(node.classList || [],'dss-object-selector-popover') >= 0;
                    };
                    const path = event.originalEvent && (event.originalEvent.path || (event.originalEvent.composedPath && event.originalEvent.composedPath()));
                    const isEventFromCMHints = path && path.filter(filterCMHints).length > 0;
                    const isEventFromCMModal = path && path.filter(filterCMModal).length > 0;
                    const isEventFromBSSelect = path && path.filter(filterBSSelect).length > 0;
                    const isEventFromObjectSelector = path && path.filter(filterObjectSelector).length > 0;
                    if (fstate.suppressClick || isEventFromCMHints || isEventFromCMModal || isEventFromBSSelect || isEventFromObjectSelector) {
                        fstate.suppressClick = null;
                    } else {
                        $scope.$apply(function() {$scope.cancelFieldEdit()});
                    }
                })
                $scope.$broadcast('elastic:adjust');
            }, 0)
        };

        $scope.validateFieldEdit = function($event) {
            if ($event) {
                $event.preventDefault();
            }
            $scope.object[$scope.state.currentEditing] = $scope.state[$scope.state.currentEditing].newVal;
            $scope.state[$scope.state.currentEditing].newVal = null;
            $scope.$emit("objectSummaryEdited", $scope.state.currentEditing);
            $scope.cancelFieldEdit();
        };

        $scope.validateFieldEditNotUndefined = function() {
            if ($scope.state[$scope.state.currentEditing].newVal != undefined) {
                $scope.validateFieldEdit();
            }
        }

        $scope.cancelFieldEdit = function() {
            const field = $scope.state.currentEditing;
            if (field) {
                const fstate = $scope.state[field];
                fstate.editing = false;
                fstate.newVal = null;
                $(fstate.selector, element).off("mousedown.editField");
                $("html").off("mouseup.editField");
            }
        };

        $scope.startEditTags = function() {
            cancelAllEdits();
            if ($scope.state.tags.newVal == null) {
                $scope.state.tags.newVal = angular.copy($scope.object.tags);
            }
            $scope.state.tags.editing = true;
        };

        $scope.validateEditTags = function() {
            $scope.$broadcast("tagFieldAddTag", function() {
                $scope.object.tags = angular.copy($scope.state.tags.newVal);
                $scope.state.tags.newVal = null;
                $scope.state.tags.editing = false;
                $scope.$emit("objectSummaryEdited");
            });
        };

        $scope.cancelEditTags = function() {
            $scope.state.tags.newVal = null;
            $scope.state.tags.editing = false;
        };

        $scope.addChecklist = function(index) {
            WT1.event("add-checklist", {objectType: $scope.objectType});
            const nChecklists = $scope.object.checklists.checklists.length;
            $scope.object.checklists.checklists.push({
                id: Math.floor(Math.random()*16777215).toString(16), //16777215 == ffffff
                title:"Todo list"+(nChecklists ? ' '+(nChecklists+1) : ''),
                items: [],
                $newlyCreated : true
            });
        };

        $scope.deleteChecklist = function(index) {
            Dialogs.confirmSimple($scope, "Delete checklist").then(function() {
                $scope.object.checklists.checklists.splice(index, 1);
                $scope.$emit("objectSummaryEdited");
            });
        };

        $scope.$on("checklistEdited", function() {
            $scope.$emit("objectSummaryEdited");
        });

        $scope.editProjectStatus = function(projectStatus) {
            $scope.state.projectStatus.newVal = projectStatus;
            $scope.validateFieldEdit();
        };
    };

    this.addInterestsManagementBehaviour = function($scope) {
        function getTaggableObjects() {
            return [{
                type: $scope.objectType,
                projectKey: $stateParams.projectKey,
                id: $scope.getObjectId()
            }];
        }

        $scope.watchObject = function(watch) { //watch is NOT a boolean : values in YES ENO (explicit no) INO (implicit no) SHALLOW (for projects)
            return InterestsService.watch($scope, getTaggableObjects(), watch)
                .success(function() {
                    $scope.objectInterest.watching = watch;
                    // $scope.objectInterest.nbWatching = data.nbWatching; //TODO @flow
                });
        };

        $scope.starObject = function(star) {
            return InterestsService.star($scope, getTaggableObjects(), star)
                .success(function() {
                    $scope.objectInterest.starred = star;
                    // $scope.objectInterest.nbStarred = data.nbStarred; //TODO @flow
                });
        };

        $scope.showWatchingUsers = function () {
            WT1.event("list-interested-users", {type: 'watches'});
            DataikuAPI.interests.listWatchingUsers($scope.objectType, $stateParams.projectKey, $scope.getObjectId()).success(function(users) {
                const modalScope = $scope.$new();
                modalScope.usersList = users;
                modalScope.icon = "icon-eye-open";
                modalScope.title = users.length + (users.length > 1? " users are " : " user is ") + "watching this object";
                CreateModalFromTemplate("/templates/interested-users.html", modalScope);
            });
        };

        $scope.showUsersWithStar = function () {
            WT1.event("list-interested-users", {type: 'stars'});
            DataikuAPI.interests.listUsersWithStar($scope.objectType, $stateParams.projectKey, $scope.getObjectId()).success(function(users) {
                const modalScope = $scope.$new();
                modalScope.usersList = users;
                modalScope.icon = "icon-star";
                modalScope.title = users.length + " user"+(users.length>1?'s':'')+" starred this object";
                CreateModalFromTemplate("/templates/interested-users.html", modalScope);
            });
        };
    };
});

app.directive('editableSummary', function(DatasetsService, DataikuAPI, $stateParams, $rootScope, TopNav, Dialogs, _SummaryHelper) {
    return {
        templateUrl : '/templates/editable-summary.html',
        scope: {
            object : '=',
            objectType : '@',
            getTags : '=',
            insightMode : '=',
            nameEditable : '=?',
            saveCallback : '=',
            editable : '=?',
            objectInterest : '=?',
            tagColor : '='
        },
        link : function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;

            if ($scope.nameEditable == undefined) $scope.nameEditable = true;
            $scope.getObjectId = function () {
                if ($scope.objectType == "PROJECT") {
                    return $stateParams.projectKey;
                } else if ($scope.object) {
                    if ($scope.objectType === "DATASET" || $scope.objectType === "DATASET_CONTENT" || $scope.objectType === "RECIPE") {
                        return $scope.object.name;
                    } else {
                        return $scope.object.id;
                    }
                }
                return null;
            };

            _SummaryHelper.addEditBehaviour($scope, element);
            _SummaryHelper.addInterestsManagementBehaviour($scope, element);

            $scope.image = {};
            $scope.pattern = attrs['pattern'];

            $scope.$watch("object", function (nv, ov) {
                if (!nv) return;
                if ($scope.objectType == "PROJECT" || $scope.objectType == "INSIGHT") {
                    $scope.display_image = true;
                    // $scope.image_src = '/dip/api/image/get-image?size=50x50&projectKey=' + $stateParams.projectKey + '&type=' + $scope.objectType + '&id=' + $scope.getObjectId();
                    $scope.totem = {
                        projectKey: $stateParams.projectKey,
                        objectType: $scope.objectType,
                        id: $scope.getObjectId()
                    }
                } else {
                    $scope.display_image = false;
                }
            });

            $scope.nameValidationCB = function(value) {
                if (!value) return true;
                return $scope.isRenamingValid($scope.editSummaryState.formerName, value);
            }

            $scope.isRenamingValid = function(oldName, newName) {
                /* It's a bit ugly to centralize validation here, but it allows reusing the
                directive without complex directive composition with isolate scope */
                if ($scope.objectType == "DATASET") {
                    return DatasetsService.isRenamingValid($stateParams.projectKey, oldName, newName);
                } else if ($scope.objectType === "RECIPE") {
                    return newName.length;
                } else {
                    return newName.length;
                }
            }
            if ($scope.objectType == "DATASET") {
                if (DatasetsService.listPerProject[$stateParams.projectKey] == null) {
                    DatasetsService.updateProjectList($stateParams.projectKey);
                }
            }

            $scope.saveCustomFields = function(customFields) {
                $scope.$emit('customFieldsSummaryEdited', customFields);
            };

            $rootScope.$on('customFieldsSaved', function(event, item, newCustomFields) {
                if (TopNav.sameItem(TopNav.getItem(), item)) {
                    $scope.object.customFields = newCustomFields;
                }
            });
        }
    };
});


app.directive('editableProjectSummary', function($stateParams, $rootScope, TopNav, WT1, DatasetsService, DataikuAPI, _SummaryHelper) {
    return {
        scope : true,
        link : function($scope, element, attrs) {
            $scope.getObjectId = function() {
                return $scope.object && $scope.object.projectKey;
            };

            _SummaryHelper.addEditBehaviour($scope, element);
            _SummaryHelper.addInterestsManagementBehaviour($scope, element);

            $scope.$stateParams = $stateParams;
            $scope.currentBranch = "master";

            $scope.$watch("projectSummary", function(nv) {
                $scope.object = nv;
                $scope.objectType = 'PROJECT';
            });

            $scope.$watch("projectCurrentBranch", function(nv) {
                $scope.currentBranch = nv ? nv : "master";
            });

            $scope.nameValidationCB = function(value) {
                if (!value) return true;
                return $scope.isRenamingValid($scope.editSummaryState.formerName, value);
            };

            $scope.isRenamingValid = function(oldName, newName) {
                return newName.length;
            };

            $scope.saveCustomFields = function(customFields) {
                $scope.$emit('customFieldsSummaryEdited', customFields);
            };

            $rootScope.$on('customFieldsSaved', function(event, item, newCustomFields) {
                if (TopNav.sameItem(TopNav.getItem(), item)) {
                    $scope.object.customFields = newCustomFields;
                }
            });
        }
    };
});

app.controller('CustomFieldsEditModalController', function($scope, $rootScope, PluginConfigUtils) {
    let customFieldsMapFlattenList = [];
    $scope.uiState = { cfComponentIdx: 0 };

    function populateCustomFields() {
        $scope.uiState.customFields = angular.copy($scope.objectCustomFields);
        PluginConfigUtils.setDefaultValues(customFieldsMapFlattenList, $scope.uiState.customFields);
        $scope.uiState.cfComponentIdx = $scope.editingTabIndex === undefined || $scope.editingTabIndex === null ? 0 : $scope.editingTabIndex;
    }

    $scope.$watch('objectType', function() {
        if ($scope.objectType) {
            $scope.customFieldsMap = $rootScope.appConfig.customFieldsMap[$scope.objectType];
            customFieldsMapFlattenList = [];
            $scope.customFieldsMap.forEach(ref => customFieldsMapFlattenList = customFieldsMapFlattenList.concat(ref.customFields));
            if ($scope.objectCustomFields) {
                populateCustomFields();
            }
        }
    });
    $scope.$watch('objectCustomFields', populateCustomFields);
    $scope.save = function() {
        $scope.resolveModal($scope.uiState.customFields);
    };

    populateCustomFields();
});

app.directive('customFieldsPopup', function() {
    return {
        templateUrl: '/templates/taggable-objects/custom-fields-popup.html',
        scope: {
            customFields: '=',
            customFieldsMap: '='
        }
    };
});

app.directive('customFieldsEditForm', function($rootScope) {
    return {
        templateUrl : '/templates/taggable-objects/custom-fields-edit-form.html',
        scope: {
            customFields: '=',
            objectType: '=',
            componentIndex: '='
        },
        link : function($scope, element, attrs) {
            $scope.$watch('componentIndex', function() {
                if ($scope.componentIndex >= 0) {
                    $scope.customFieldsMap = [$rootScope.appConfig.customFieldsMap[$scope.objectType][$scope.componentIndex]];
                } else {
                    $scope.customFieldsMap = $rootScope.appConfig.customFieldsMap[$scope.objectType];
                }
            });
        }
    };
});

// TO DO : Delete this directive when the Summary tab of all DSS objects are moved to the standardizedSidePanel directive
app.directive('customFieldsInSummary', function($rootScope, Logger, PluginConfigUtils) {
    return {
        templateUrl : '/templates/taggable-objects/custom-fields-summary.html',
        scope: {
            customFields: '=',
            objectType: '=',
            saveFn: '='
        },
        link : function($scope, element, attrs) {
            $scope.customFieldsMap = $rootScope.appConfig.customFieldsMap[$scope.objectType];
            let customFieldsMapFlattenList = [];
            $scope.customFieldsMap.forEach(ref => customFieldsMapFlattenList = customFieldsMapFlattenList.concat(ref.customFields));
            $scope.ui = {
                customFields: angular.copy($scope.customFields),
                editing: false
            };
            PluginConfigUtils.setDefaultValues(customFieldsMapFlattenList, $scope.ui.customFields);
            $scope.editCF = function() {
                if (!$scope.saveFn) {
                    Logger.warn("There is no save function attached to the custom fields editable summary");
                    $scope.ui.editing = false;
                } else {
                    $scope.ui.editing = true;
                }
            };
            $scope.discardCF = function() {
                if (!$scope.saveFn) {
                    Logger.warn("There is no save function attached to the custom fields editable summary");
                    $scope.ui.editing = false;
                } else {
                    $scope.ui.customFields = angular.copy($scope.customFields);
                    PluginConfigUtils.setDefaultValues(customFieldsMapFlattenList, $scope.ui.customFields);
                    $scope.ui.editing = false;
                }
            };
            $scope.saveCF = function() {
                if (!$scope.saveFn) {
                    Logger.warn("There is no save function attached to the custom fields editable summary");
                    $scope.ui.editing = false;
                } else {
                    $scope.saveFn(angular.copy($scope.ui.customFields));
                    $scope.ui.editing = false;
                }
            };
            $scope.$watch('customFields', function() {
                $scope.ui.customFields = angular.copy($scope.customFields);
                PluginConfigUtils.setDefaultValues(customFieldsMapFlattenList, $scope.ui.customFields);
            });
        }
    };
});

app.directive('customFieldsInSidePanel', function($rootScope, Logger, PluginConfigUtils, TopNav) {
    return {
        templateUrl : '/templates/taggable-objects/custom-fields-sidepanel.html',
        scope: {
            customFields: '=',
            objectType: '=',
            saveFn: '=',
            editCustomFields: '=',
            editable: '=',
        },
        link : function($scope, element, attrs) {
            $scope.customFieldsMap = $rootScope.appConfig.customFieldsMap[$scope.objectType];
            let customFieldsMapFlattenList = [];
            $scope.customFieldsMap.forEach(ref => customFieldsMapFlattenList = customFieldsMapFlattenList.concat(ref.customFields));
            $scope.ui = {
                customFields: angular.copy($scope.customFields),
            };
            PluginConfigUtils.setDefaultValues(customFieldsMapFlattenList, $scope.ui.customFields);

            $scope.canWriteProject = () => $scope.editable;

            $scope.editCF = function() {
                if (!$scope.saveFn) {
                    Logger.warn("There is no save function attached to the custom fields editable summary");
                }
            };
            $scope.discardCF = function() {
                if (!$scope.saveFn) {
                    Logger.warn("There is no save function attached to the custom fields editable summary");
                } else {
                    $scope.ui.customFields = angular.copy($scope.customFields);
                    PluginConfigUtils.setDefaultValues(customFieldsMapFlattenList, $scope.ui.customFields);
                }
            };
            $scope.saveCF = function() {
                if (!$scope.saveFn) {
                    Logger.warn("There is no save function attached to the custom fields editable summary");
                } else {
                    $scope.saveFn(angular.copy($scope.ui.customFields));
                }
            };
            $scope.$watch('customFields', function() {
                $scope.ui.customFields = angular.copy($scope.customFields);
                PluginConfigUtils.setDefaultValues(customFieldsMapFlattenList, $scope.ui.customFields);
            });

            $rootScope.$on('customFieldsSaved', function(event, item, newCustomFields) {
                if (TopNav.sameItem(TopNav.getItem(), item)) {
                    $scope.ui.customFields = newCustomFields;
                }
            });
        }
    };
});

})();
