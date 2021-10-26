(function(){
'use strict';

const app = angular.module('dataiku.managedfolder', []);


app.directive('managedFolderRightColumnSummary', function($state, $controller, $stateParams, $rootScope, FlowGraph, FlowGraphSelection,
    DataikuAPI, ComputablesService, DatasetsService, CreateModalFromTemplate, QuickView, ActiveProjectKey, ActivityIndicator, SelectablePluginsService) {
    return {
        templateUrl :'/templates/managedfolder/right-column-summary.html',

        link : function(scope, element, attrs) {

            $controller('ManagedFolderInsightPinningController', {$scope: scope});

            $controller('_TaggableObjectsMassActions', {$scope: scope});

            scope.$stateParams = $stateParams;
            scope.QuickView = QuickView;

            scope.getSmartName = function (projectKey, name) {
                if (projectKey == ActiveProjectKey.get()) {
                    return name;
                } else {
                    return projectKey + '.' + name;
                }
            }

            scope.refreshData = function() {
                let projectKey = ActiveProjectKey.get();

                DataikuAPI.managedfolder.getFullInfo(projectKey, projectKey , scope.getSmartName(scope.selection.selectedObject.projectKey, scope.selection.selectedObject.name)).success(function(data){
                    data.folder.zone = (scope.selection.selectedObject.usedByZones || [])[0] || scope.selection.selectedObject.ownerZone;
                    scope.objectFullInfo = data;
                    scope.odb = data.folder;
                    scope.isLocalFolder = scope.selection.selectedObject && scope.selection.selectedObject.projectKey == projectKey;
                    scope.folderData = data;
                }).error(setErrorInScope.bind(scope));
            };

            scope.$watch("selection.selectedObject",function() {
                if(scope.selection && scope.selection.selectedObject != scope.selection.confirmedItem) {
                    scope.odb = null;
                }
            });

            scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) {
                    return;
                }
                if (!nv.projectKey) {
                    nv.projectKey = ActiveProjectKey.get();
                }
                scope.refreshData();
            });

            scope.createDatasetOnFolder = function() {
                $state.go("projects.project.datasets.new_with_type.settings", {type : 'FilesInFolder', fromOdbSmartId: scope.getSmartName(scope.odb.projectKey, scope.odb.id), zoneId: scope.odb.zone});
            };

        	scope.clearContents = function() {
                const taggableItems = [{
                    type: 'MANAGED_FOLDER',
                    projectKey: scope.odb.projectKey,
                    id: scope.odb.id,
                    displayName: scope.odb.name
                }];
                return ComputablesService.clear(scope, taggableItems);
    	    };

            scope.buildManagedFolder = function() {
                CreateModalFromTemplate("/templates/managedfolder/build-folder-modal.html", scope, "BuildManagedFolderController", function(newScope) {
                    newScope.projectKey = scope.odb.projectKey;
                    newScope.odbId = scope.odb.id;
                });
            };

            scope.selectablePlugins = SelectablePluginsService.listSelectablePlugins({'MANAGED_FOLDER' : 1});

            scope.$on("objectSummaryEdited", function() {
                DataikuAPI.managedfolder.save(scope.odb, {summaryOnly: true})
                .success(function(data) {
                    ActivityIndicator.success("Saved");
                }).error(setErrorInScope.bind(scope));
            });

            scope.saveCustomFields = function(newCustomFields) {
                let oldCustomFields = angular.copy(scope.odb.customFields);
                scope.odb.customFields = newCustomFields;
                return DataikuAPI.managedfolder.save(scope.odb, {summaryOnly: true})
                    .success(function() {
                        $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), scope.odb.customFields);
                    })
                    .error(function(a, b, c) {
                        scope.odb.customFields = oldCustomFields;
                        setErrorInScope.bind($scope)(a, b, c);
                    });
            };

            scope.editCustomFields = function() {
                DataikuAPI.managedfolder.get(scope.odb.projectKey, scope.odb.projectKey, scope.odb.id).success(function(data) {
                    let managedFolder = data;
                    if (!managedFolder) {
                        return;
                    }
                    let modalScope = angular.extend(scope, {objectType: 'MANAGED_FOLDER', objectName: managedFolder.name, objectCustomFields: managedFolder.customFields});
                    CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                        scope.saveCustomFields(customFields);
                    });
                }).error(setErrorInScope.bind(scope));
            };

            const customFieldsListener = $rootScope.$on('customFieldsSaved', scope.refreshData);
            scope.$on("$destroy", customFieldsListener);

            scope.zoomToOtherZoneNode = function(zoneId) {
                const otherNodeId = scope.selection.selectedObject.id.replace(/zone__.+?__managedfolder/, "zone__" + zoneId + "__managedfolder");
                if ($stateParams.zoneId) {
                    $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId: zoneId, id: graphVizUnescape(otherNodeId) }))
                }
                else {
                    scope.zoomGraph(otherNodeId);
                    FlowGraphSelection.clearSelection();
                    FlowGraphSelection.onItemClick(scope.nodesGraph.nodes[otherNodeId]);
                }
            }

            scope.isMFZoneInput = function() {
                return scope.selection.selectedObject.usedByZones.length && scope.selection.selectedObject.usedByZones[0] != scope.selection.selectedObject.ownerZone;
            }
        }
    }
});

app.controller("ManagedFolderInsightPinningController", function($scope, $stateParams, SmartId, CreateModalFromTemplate, ActiveProjectKey) {
    $scope.createAndPinInsight = function(folder, filePath, isDirectory) {
        const insight = {
            projectKey: ActiveProjectKey.get(),
            type: 'managed-folder_content',
            params: { folderSmartId: SmartId.create(folder.id, $stateParams.sourceProjectKey ? $stateParams.sourceProjectKey : folder.projectKey), filePath:filePath, isDirectory: isDirectory},
            name: "Content of folder " + folder.name + (filePath ? filePath : '')
        };
        CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insight-modal.html", $scope, "CreateAndPinInsightModalController", function(newScope) {
            newScope.init(insight);
        });
    }
});


app.controller("ManagedFolderBaseController", function($scope, $state, $stateParams, $q, $controller, $rootScope, WT1, TopNav, GlobalProjectActions, DataikuAPI, ComputablesService, ActiveProjectKey, SmartId, CreateModalFromTemplate, WebAppsService){

    $controller('ManagedFolderInsightPinningController', {$scope: $scope});

    $scope.createDatasetOnFolder = function() {
        $state.go("projects.project.datasets.new_with_type.settings", {type : 'FilesInFolder', fromOdbSmartId : SmartId.create($scope.baseOdb.id, $scope.baseOdb.projectKey), zoneId: $scope.baseOdb.zone})
    };

	$scope.clearContents = function() {
        const taggableItems = [{
            type: 'MANAGED_FOLDER',
            projectKey: $scope.baseOdb.projectKey,
            id: $scope.baseOdb.id,
            displayName: $scope.baseOdb.name
        }];
        return ComputablesService.clear($scope, taggableItems).then(function(){$scope.$broadcast('folder-contents-cleared')});
	};

    $scope.saveCustomFields = function(managedFolder, newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'MANAGED_FOLDER'});
        let oldCustomFields = angular.copy(managedFolder.customFields);
        managedFolder.customFields = newCustomFields;
        return DataikuAPI.managedfolder.save(managedFolder, {summaryOnly: true})
            .success(function() {
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), managedFolder.customFields);
            })
            .error(function(a, b, c) {
                managedFolder.customFields = oldCustomFields;
                setErrorInScope.bind($scope)(a, b, c);
            });
    };

    $scope.editCustomFields = function() {
        DataikuAPI.managedfolder.get(ActiveProjectKey.get(), ActiveProjectKey.get(), $stateParams.odbId).success(function(data) {
            let managedFolder = data;
            if (!managedFolder) {
                return;
            }
            let modalScope = angular.extend($scope, {objectType: 'MANAGED_FOLDER', objectName: managedFolder.name, objectCustomFields: managedFolder.customFields});
            CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                $scope.saveCustomFields(managedFolder, customFields);
            });
        }).error(setErrorInScope.bind($scope));
    };

	DataikuAPI.managedfolder.getFullInfo(ActiveProjectKey.get(), $stateParams.sourceProjectKey || ActiveProjectKey.get(), $stateParams.odbId).success(function(data) {
        $scope.baseOdb = data.folder;
        $scope.baseOdb.directAccessOnOriginal;
    }).error(setErrorInScope.bind($scope));
});

app.controller("ManagedFolderPageRightColumnActions", async function($controller, $scope, $rootScope, $stateParams, $state, DataikuAPI, ActiveProjectKey) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    $scope.folderData = (await DataikuAPI.managedfolder.getFullInfo(ActiveProjectKey.get(), $stateParams.sourceProjectKey || ActiveProjectKey.get(), $stateParams.odbId)).data;
    $scope.odb = $scope.folderData.folder;
    $scope.odb.description = $scope.odb.name;
    $scope.odb.name = $scope.odb.id;
    $scope.odb.nodeType = "LOCAL_MANAGED_FOLDER";
    $scope.odb.interest = $scope.folderData.interest;

    $scope.selection = {
        selectedObject : $scope.odb,
        confirmedItem : $scope.odb
    };

    function updateUserInterests() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "MANAGED_FOLDER", ActiveProjectKey.get(), $stateParams.odbId).success(function(data) {

            $scope.selection.selectedObject.interest.watching = data.watching;
            $scope.selection.selectedObject.interest.starred = data.starred;

        }).error(setErrorInScope.bind($scope));
    }

    updateUserInterests();
    const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);
    $scope.$on("$destroy", interestsListener);

    $scope.isOnFolderObjectPage = function() {
        return $state.includes('projects.project.managedfolders.managedfolder');
    }
});


app.controller("NewManagedFolderController", function($scope, $state, DataikuAPI, WT1, $stateParams) {
    WT1.event("new-managed-folder-modal-open");

    $scope.newBox = {
        name : null,
        settings : {
            zone: $scope.getRelevantZoneId($stateParams.zoneId)
        }
    };

    function updateFolderConnection () {
        if ($scope.newBox.settings.$connection == null) return;
        $scope.newBox.settings.connectionId = $scope.newBox.settings.$connection.connectionName;
        $scope.newBox.settings.typeOptionId = $scope.newBox.settings.$connection.fsProviderTypes[0];
    }

    DataikuAPI.datasets.getManagedFolderOptionsNoContext($stateParams.projectKey).success(function(data) {
        $scope.managedDatasetOptions = data;
        $scope.managedDatasetOptions.connections = $scope.managedDatasetOptions.connections.filter(function(c) {return c.fsProviderTypes != null;});
        if (!$scope.newBox.settings.connectionId && $scope.managedDatasetOptions.connections.length) {
            $scope.newBox.settings.$connection = $scope.managedDatasetOptions.connections[0];
            updateFolderConnection();
        }
        $scope.partitioningOptions = [
            {"id" : "NP", "label" : "Not partitioned"},
        ].concat(data.projectPartitionings)

        $scope.newBox.settings.partitioningOptionId = "NP";
    }).error(setErrorInScope.bind($scope));

    $scope.$watch("newBox.settings.$connection", updateFolderConnection);

    $scope.create = function(){
        resetErrorInScope($scope);
        WT1.event("new-managed-folder-modal-create");
        DataikuAPI.datasets.newManagedFolder($stateParams.projectKey, $scope.newBox.name, $scope.newBox.settings).success(function(data) {
            $scope.dismiss();
            $state.go("projects.project.managedfolders.managedfolder.view", {odbId: data.id})
        }).error(setErrorInScope.bind($scope));
    }
});


app.controller("ManagedFolderSummaryController", function($scope, $rootScope, $stateParams, DataikuAPI, TopNav, $timeout, ActivityIndicator) {
    TopNav.setLocation(TopNav.TOP_FLOW, null, TopNav.TABS_MANAGED_FOLDER, "summary");

    DataikuAPI.managedfolder.getSummary($stateParams.projectKey, $stateParams.odbId).success(function(data) {
        $scope.odb = data.object;
        $scope.objectInterest = data.interest;
        $scope.objectTimeline = data.timeline;

        TopNav.setItem(TopNav.ITEM_MANAGED_FOLDER, $stateParams.odbId, {name: $scope.odb.name});
        TopNav.setPageTitle($scope.odb.name + " - Managed folder");
    }).error(setErrorInScope.bind($scope));

    $scope.refreshTimeline = function() {
        DataikuAPI.timelines.getForObject($stateParams.projectKey, "MANAGED_FOLDER", $stateParams.odbId).success(function(data){
            $scope.objectTimeline = data;
        }).error(setErrorInScope.bind($scope));
    };

    /* Auto save */
    function saveManagedFolder() {
        DataikuAPI.managedfolder.save($scope.odb, {summaryOnly: true}).success(function(data) {
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    }
    $scope.$watch("odb", function(nv, ov) {
        if (nv && ov) {
            saveManagedFolder();
        }
    }, true);
    $scope.$on("objectSummaryEdited", saveManagedFolder);

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        $scope.saveCustomFields($scope.odb, customFields);
    });
});


app.controller("ManagedFolderViewController", function($scope, DataikuAPI, $q, CreateModalFromTemplate, $state, $stateParams, TopNav, $controller, Fn, $filter){
    TopNav.setLocation(TopNav.TOP_FLOW, null, TopNav.TABS_MANAGED_FOLDER, "view");
    TopNav.setItem(TopNav.ITEM_MANAGED_FOLDER, $stateParams.odbId);

    $scope.snippetSource = 'SAVED';

    DataikuAPI.managedfolder.get($stateParams.projectKey, $stateParams.sourceProjectKey || $stateParams.projectKey, $stateParams.odbId).success(function(data) {
        $scope.odb = data;
        TopNav.setItem(TopNav.ITEM_MANAGED_FOLDER, $stateParams.odbId, {name:data.name});
    }).error(setErrorInScope.bind($scope));
});


app.controller("ManagedFolderUploadOverwriteModalController", function($scope, $stateParams, DataikuAPI) {
	$scope.selectAll = false;
	function applySelectAll() {
		if ($scope.alreadyPresent != null) {
			$scope.alreadyPresent.forEach(function(file) {file.overwrite = $scope.selectAll;});
		}
	};
	$scope.$watch("selectAll", function(nv, ov) {applySelectAll();});

	$scope.$watch("alreadyPresent", function(nv, ov) {
		if (nv == null) return;

		applySelectAll();

		$scope.cancel = function() {
			$scope.dismiss();
		};

		$scope.confirm = function() {
			if ( $scope.forceUploadFiles == undefined) return;

			const overwriteFiles = [];
			$scope.alreadyPresent.forEach(function(file) {
				if ( file.overwrite ) {
					overwriteFiles.push(file);
				}
			});
			$scope.forceUploadFiles(overwriteFiles);
			$scope.dismiss();
		};
	});
});

app.controller("MoveItemModalController", function($scope, $rootScope, $stateParams, DataikuAPI, CreateModalFromTemplate, FutureWatcher, ProgressStackMessageBuilder) {
    $scope.browse = function(path) {
        return DataikuAPI.managedfolder.browse($stateParams.sourceProjectKey || $stateParams.projectKey, $stateParams.odbId, path);
    };
    $scope.parentPath = $scope.odbListing.fullPath; // not null since there is an item to move
    $scope.canBrowse = function(item) {
        return item.directory && $scope.items.findIndex(_ => item.fullPath === _.fullPath) === -1;
    }

    $scope.canSelect = function(item) {
        return false;
    }

    $scope.confirm = function() {
        const prefix = $scope.parentPath + ($scope.parentPath.charAt($scope.parentPath.length - 1) == '/' ? '' : '/');
        const items = $scope.items.map(_ => ({
            "fromPath": _.fullPath,
            "toPath": prefix + _.name,
            "isDirectory": _.directory
        }));
        const parentScope = $scope.$parent;

        $scope.dismiss();

        DataikuAPI.managedfolder.moveItems($stateParams.sourceProjectKey || $stateParams.projectKey, $stateParams.odbId, items).success(function(initialResponse) {
            CreateModalFromTemplate("/templates/managedfolder/move-items-progress-modal.html", parentScope, null, function(progressScope) {
                progressScope.title = "Moving items...";

                progressScope.abort = function(){
                    DataikuAPI.futures.abort(initialResponse.jobId)
                        .success(() => {
                            progressScope.refreshDirectory();
                        })
                        .error(setErrorInScope.bind(progressScope));
                };

                progressScope.done = false;
                progressScope.aborted = false;
                FutureWatcher.watchJobId(initialResponse.jobId)
                    .success(function(data) {
                        progressScope.done = data.hasResult;
                        progressScope.aborted = data.aborted;
                        progressScope.futureResponse = null;
                        progressScope.finalResponse = data.result;
                        progressScope.errors = data.result.messages || [];

                        const movedItems = data.result.paths;

                        // remove items from list that were moved successfully
                        progressScope.odbListing.children = progressScope.odbListing.children.filter((_) => {
                            return !(movedItems && movedItems.find((x) => _.name === x.name));
                        });
                        progressScope.clearSelectedItemsAndPreview();

                        //check if, while moving, we created a folder in the current folder, if so we need to refresh it :(
                        let p = '';
                        const newItem = movedItems[0]; // only need to use one item to check
                        if (newItem) {
                            for (let i = 1; i < newItem.pathElts.length; i++) {
                                p += "/" + newItem.pathElts[i];
                                if (p == progressScope.odbListing.safeFullPath && i < newItem.pathElts.length - 1) {
                                    let f = newItem.pathElts[i + 1];
                                    if (progressScope.odbListing.children.filter(e => e.name == f).length == 0) {
                                        progressScope.refreshDirectory();
                                    }
                                }
                            }
                        }

                        // close immediately if no errors were found
                        if (!progressScope.errors.length) {
                            progressScope.dismiss();
                        }
                    }).update(function(data){
                        progressScope.percentage = ProgressStackMessageBuilder.getPercentage(data.progress);
                        progressScope.futureResponse = data;
                        progressScope.stateLabels = ProgressStackMessageBuilder.build(progressScope.futureResponse.progress, true);
                    }).error(function(data, status, headers) {
                        progressScope.done = true;
                        progressScope.futureResponse = null;
                        setErrorInScope.bind(progressScope)(data, status, headers);
                    });
            });
        }).error(setErrorInScope.bind($scope));
    }
});


app.controller("ManagedFolderSettingsController", function($scope, $rootScope, $stateParams, DataikuAPI, TopNav, $timeout, ActivityIndicator) {
    TopNav.setLocation(TopNav.TOP_FLOW, null, TopNav.TABS_MANAGED_FOLDER, "settings");

    $scope.uiState = {activeTab : 'storage', selectedProviderType : null};

    $scope.anyPipelineTypeEnabled = function() {
        return $rootScope.projectSummary.sparkPipelinesEnabled || $rootScope.projectSummary.sqlPipelinesEnabled;
    };

    $scope.storageBackends = [];
    DataikuAPI.datasets.listFSProviderTypes(true).success(function(data) {
    	$scope.storageBackends = data;
    });

    $scope.$watch("uiState.selectedProviderType", function() {
    	if ($scope.odb == null) return;
    	if ($scope.odb.type && $scope.uiState.selectedProviderType && $scope.odb.type != $scope.uiState.selectedProviderType) {
    	    $scope.odb.params.$resetConnection = true;
    	}
    	$scope.odb.type = $scope.uiState.selectedProviderType;
    });

    $scope.detectScheme = function() {
        return DataikuAPI.managedfolder.detectPartitioning($scope.odb);
    };

    $scope.testScheme = function() {
        return DataikuAPI.managedfolder.testPartitioning($scope.odb);
    };

    $scope.onCoreParamsChanged = function() {
        // noop
    };

    DataikuAPI.managedfolder.get($stateParams.projectKey, $stateParams.sourceProjectKey || $stateParams.projectKey, $stateParams.odbId).success(function(data) {
        $scope.odb = data;
        $scope.uiState.selectedProviderType = $scope.odb.type;
        $scope.origOdb = angular.copy(data);
        $scope.dataset = {flowOptions: $scope.odb.flowOptions}; // to reuse the same template
        TopNav.setItem(TopNav.ITEM_MANAGED_FOLDER, $stateParams.odbId, {name:data.name});
        TopNav.setPageTitle(data.name + " - Managed folder");
    }).error(setErrorInScope.bind($scope));

    $scope.settingsIsDirty = function() {
        return $scope.odb && !angular.equals($scope.odb, $scope.origOdb);
    };

    $scope.saveOdb = function() {
        DataikuAPI.managedfolder.save($scope.odb).success(function(data) {
            $scope.odb = data;
            $scope.uiState.selectedProviderType = $scope.odb.type;
            $scope.origOdb = angular.copy(data);
            $scope.dataset.flowOptions = $scope.odb.flowOptions;
            ActivityIndicator.success("Saved");
        }).error(setErrorInScope.bind($scope));
    };
});


app.controller("ManagedFolderStatusController", function($scope, $rootScope, $stateParams, DataikuAPI, TopNav, $timeout) {
    TopNav.setLocation(TopNav.TOP_FLOW, null, TopNav.TABS_MANAGED_FOLDER, "status");

    DataikuAPI.managedfolder.get($stateParams.projectKey, $stateParams.projectKey, $stateParams.odbId).success(function(data) {
        $scope.odb = data;
        $scope.dataset = {flowOptions: data.flowOptions}; // to reuse the same template
        TopNav.setItem(TopNav.ITEM_MANAGED_FOLDER, $stateParams.odbId, {name:data.name});
        TopNav.setPageTitle(data.name + " - Managed folder");
    }).error(setErrorInScope.bind($scope));

});

/*
 * stuff shared with the pinboard to present folder and/or their contents
 */
app.directive('managedFolderContentsView', function(DataikuAPI, $rootScope, $q, CreateModalFromTemplate, $state, $stateParams, TopNav, $controller, Dialogs, Fn, openDkuPopin, SmartId, $timeout, Logger, GraphZoomTrackerService, FutureWatcher, ProgressStackMessageBuilder, VirtualWebApp, WebAppsService, PluginConfigUtils) {
    return {
        restrict: 'AE',
        templateUrl: '/templates/managedfolder/fragments/contents-view.html',
        replace: true,
        scope : {
            odb : '=',
            readOnly : '=',
            canDownload : '=',
            createInsight : '=',
            subFolderStartingPoint : '<?'
        },
        link: function($scope, element, attrs){
            $scope.appConfig = $rootScope.appConfig;
            $scope.$state = $state;
            $scope.projectSummary = $rootScope.projectSummary;
            
            $scope.setErrorInThisScope = setErrorInScope.bind($scope);
            GraphZoomTrackerService.setFocusItemByName("managedfolder", $stateParams.odbId);

            /*
             * Loading folder content
             */
            if (!$scope.subFolderStartingPoint) {
                $scope.subFolderStartingPoint = "/";
            }
            $scope.odbListing = {items: null, safeFullPath: '/'};
            function refreshFolderListing (path = $scope.subFolderStartingPoint) {
                if ($scope.odb == null) return;
                if ($scope.odb.partitioning && $scope.odb.partitioning.dimensions.length > 0 && $scope.odb.selection == null) {
                    $scope.odb.selection = {partitionSelectionMethod: "ALL"};
                }
                DataikuAPI.managedfolder.browse($scope.odb.projectKey, $scope.odb.id, path).success(function(data){
                    $scope.odbListing = data;
                    $scope.odbListing.safeFullPath = $scope.odbListing.fullPath == null ? '/' : $scope.odbListing.fullPath;
                    $scope.currentDirectoryParentList = getParentDirectoryList($scope.odbListing.pathElts);
                    $scope.clearSelectedItemsAndPreview();
                    $scope.query = "";
                }).error(setErrorInScope.bind($scope));
            };

            // interactivity
            $scope.$watch('odb', function() {
                refreshFolderListing();
                if (!$scope.readOnly && $scope.odb) {
                    $scope.skins = [$scope.defaultViewSkin].concat(WebAppsService.getSkins('MANAGED_FOLDER', null, $scope.odb.contentType));
                }
            }); // shallow watch, to get the list when the folder is loaded
            $scope.$on("folder-contents-cleared", function() {
                $scope.odbListing = {items:[], safeFullPath: '/'}; // change the entire object so that the shallow watch below triggers
            });

            $scope.browseDirectory = function(fullPath) {
                refreshFolderListing(fullPath);
            };

            $scope.refreshDirectory = function() {
                refreshFolderListing($scope.odbListing.safeFullPath)
            }

            function getParentDirectoryList(pathElts) {
                let list = [];
                let fullPath = "";
                for (let i = 0; i < pathElts.length; i++) {
                    let name = pathElts[i];
                    fullPath = fullPath + "/" + name;
                    list.push({
                        name: name,
                        fullPath: fullPath
                    });
                }
                return list;
            };

            /*
             * Preview
             */
            $scope.setSelectedItems = function(selectedItems, anchorItem, lastItemAddedToSelection) {
                $scope.selectedItems = selectedItems;
                $scope.anchorItem = anchorItem; // when shift clicking, keep track of the first item selected
                $scope.lastItemAddedToSelection = lastItemAddedToSelection;
            };

            $scope.removeSelectedItem = function(item) {
                if ($scope.selectedItems.length == 1) {
                    $scope.clearSelectedItemsAndPreview()
                } else {
                    const itemIndex = $scope.selectedItems.findIndex(_ => _.fullPath === item.fullPath);
                    const anchorIndex = $scope.selectedItems.findIndex(_ => _.fullPath === $scope.anchorItem.fullPath);
                    const lastItemAddedToSelectionIndex = $scope.selectedItems.findIndex(_ => _.fullPath === $scope.lastItemAddedToSelection.fullPath);
                    const reversedOrderSelection =  anchorIndex > lastItemAddedToSelectionIndex;

                    let newSelectedItems = $scope.selectedItems.slice();
                    newSelectedItems.splice(itemIndex, 1);
                    let newAnchorItem = $scope.anchorItem;
                    let newLastItemAddedToSelection = $scope.lastItemAddedToSelection;

                    if ($scope.anchorItem && $scope.anchorItem.fullPath == item.fullPath) {
                        newAnchorItem = newSelectedItems[reversedOrderSelection ? newSelectedItems.length - 1 : 0];
                    }

                    if ($scope.lastItemAddedToSelection && $scope.lastItemAddedToSelection.fullPath == item.fullPath) {
                        newLastItemAddedToSelection = newSelectedItems[reversedOrderSelection ? 0 : newSelectedItems.length - 1];
                    }

                    $scope.setSelectedItems(newSelectedItems, newAnchorItem, newLastItemAddedToSelection);
                }
            }

            $scope.clearSelectedItemsAndPreview = function() {
                $scope.previewedItem = null;
                $scope.setSelectedItems([], null, null);
            };

            $scope.setSelectedItemAndPreview = function(item) {
                $scope.previewFile(item);
                $scope.setSelectedItems([item], item, item);
            };

            $scope.addSelectedItemAndPreview = function(item) {
                $scope.previewFile(item);
                let selectedItems = $scope.selectedItems.length > 0 ? $scope.selectedItems.concat([item]) : [item];
                let anchorItem = $scope.selectedItems.length > 0 ? $scope.anchorItem : item;
                $scope.setSelectedItems(selectedItems, anchorItem, item);
            };


            $scope.clearSelectedItemsAndPreview();

            $scope.onClickOnItem = function(e, item, items) {
                window.getSelection().removeAllRanges();
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    $scope.updateSelectedItems(e, item, items)
                } else {
                    if (item.directory) {
                        $scope.browseDirectory(item.fullPath);
                    } else {
                        $scope.setSelectedItemAndPreview(item);
                    }
                }
            };

            $scope.updateSelectedItems = function(e, item, items) {
                if ($scope.selectedItems.length && e.shiftKey) {
                    $scope.setSelectedItems(getItemsInRange(item, items), !$scope.selectedItems || $scope.selectedItems.length === 0 ? item : $scope.anchorItem, item);
                } else {
                    toggleItemSelection(item);
                }
            }

            function toggleItemSelection(item) {
                const itemIndex = $scope.selectedItems.findIndex(_ => _.fullPath === item.fullPath);

                if (itemIndex < 0) {
                    $scope.addSelectedItemAndPreview(item);
                } else {
                    if ($scope.selectedItems.length == 1) {
                        $scope.clearSelectedItemsAndPreview()
                    } else {
                        $scope.removeSelectedItem(item);
                        if ($scope.previewedItem && $scope.previewedItem.fullPath == item.fullPath) {
                            $scope.previewedItem = null;
                        }
                    }
                }
            }

            function getItemsInRange(selectedItem, items) {
                let start = items.findIndex(_ => _.fullPath === $scope.anchorItem.fullPath);
                let end = items.findIndex(_ => _.fullPath === selectedItem.fullPath);

                // swap if second item is lower index
                if (start > end) {
                    [start, end] = [end, start];
                }

                return items.slice(start, end + 1);
            }

            $scope.isSelected = function(item) {
                return $scope.selectedItems.indexOf(item) >= 0;
            }

            $scope.previewFile = function(item) {
                $scope.skinState.itemSkins = [$scope.defaultViewItemSkin];
                $scope.skinState.itemSkin = $scope.defaultViewItemSkin;
                if (item.directory) {
                    $scope.previewedItem = {type:'DIRECTORY', itemPath:item.fullPath, name:item.name, size:item.size, directory:true};
                } else {
                    DataikuAPI.managedfolder.previewItem($stateParams.projectKey, $scope.odb.projectKey, $scope.odb.id, item.fullPath).success(function(data){
                        $scope.previewedItem = data;
                        if (!$scope.readOnly) {
                            $scope.skinState.itemSkins = [$scope.defaultViewItemSkin].concat(WebAppsService.getSkins('MANAGED_FOLDER', data.itemPath, data.contentType));
                        }
                    }).error(setErrorInScope.bind($scope));
                }
            };

            $scope.deletePreviewedItem = function(e) {
                if ($scope.previewedItem == null)
                    return;
                let item = null;
                $scope.odbListing.children.forEach(function(i) {
                    if ($scope.previewedItem.itemPath == i.fullPath) {
                        item = i;
                    }
                });
                if (item == null)
                    return;

                const index = $scope.odbListing.children.indexOf(item);
                if (index >= 0) {
                    Dialogs.confirm($scope,'File deletion','Are you sure you want to delete ' + item.name + ' ?').then(function() {
                        $scope.removeFile(item.fullPath);
                        DataikuAPI.managedfolder.deleteItems($stateParams.sourceProjectKey || $stateParams.projectKey, $scope.odb.id, [item.fullPath]).success(function(){
                            $scope.odbListing.children.splice(index, 1);
                        }).error(setErrorInScope.bind($scope));
                    });
                }
            };

            $scope.decompressPreviewedFile = function(e) {
                if ($scope.previewedItem == null)
                    return;
                let item = null;
                $scope.odbListing.children.forEach(function(i) {
                    if ($scope.previewedItem.itemPath == i.fullPath) {
                        item = i;
                    }
                });
                if (item == null) {
                    Logger.info("Could not find item to decompress", $scope.previewedItem.itemPath);
                    return;
                }

                $scope.decompressFile(item);
            };

            $scope.downloadPreviewedFile = function() {
                if ($scope.previewedItem == null)
                    return;
                downloadURL(DataikuAPI.managedfolder.getDownloadItemURL($stateParams.projectKey, $scope.odb.projectKey,  $scope.odb.id, $scope.previewedItem.itemPath));
            };

            $scope.decompressFile = function(item) {
                DataikuAPI.managedfolder.decompressItem($stateParams.sourceProjectKey || $stateParams.projectKey, $scope.odb.id, item.fullPath).success(function(data){
                    $scope.clearSelectedItemsAndPreview();
                    refreshFolderListing($scope.odbListing.safeFullPath);
                }).error(setErrorInScope.bind($scope));
            };

            $scope.removeFile = function(itemPath) {
                if ($scope.previewedItem != null && $scope.previewedItem.itemPath == itemPath) { 
                    $scope.clearSelectedItemsAndPreview();
                }
            };

            $scope.getFilesSize = function() {
                if ($scope.odbListing && $scope.odbListing.children) {
                    return $scope.odbListing.children.map(Fn.prop("size")).reduce(Fn.SUM, 0);
                }
            }

            /*
             *
             */

            $scope.saveSampling = function() {
                DataikuAPI.managedfolder.saveSampling($scope.odb.projectKey, $scope.odb.id, $scope.odb.selection).success(function(data){
                    refreshFolderListing();
                }).error(setErrorInScope.bind($scope));
            };

            $scope.getPartitionsList = function() {
                return DataikuAPI.managedfolder.listPartitionsWithName($scope.odb.projectKey, $scope.odb.id)
                    .error(setErrorInScope.bind($scope))
                    .then(function(ret) {
                        return ret.data;
                    });
            };

            /*
             * Menus
             */

            $scope.openHeaderMenu = function($event) {
                function isElsewhere() {
                    return true;
                }

                var template = '<ul id="qa_folder-action-dropdown-menu" class="dropdown-menu">'
                    +    '<li ng-if="!readOnly"><a id="qa_folder-action-publish-button" ng-click="createInsight(odb, odbListing.safeFullPath, true)">Publish...</a></li>'
                    +    '<li><a ng-click="downloadFolder(odbListing.safeFullPath)">Download</a></li>'
                    +    '<li ng-if="!readOnly"><a id="qa_folder-action-create-dataset-button" ng-click="createDatasetOnCurrentFolder()">Create a dataset...</a></li>'
                    +    '<li ng-if="!readOnly" style="border-top: 1px #eee solid;"><a onclick="$(\'#hidden-input-file\').click();">Add File...</a></li>'
                    +    '<li ng-if="!readOnly && odb.isDirectoryAware"><a id="qa_folder-action-add-folder-button" ng-click="createSubFolder()" style="border-top: 1px #eee solid;">New Folder...</a></li>'
                    +'</ul>'
                var dkuPopinOptions = {
                    template: template,
                    isElsewhere: isElsewhere
                };
                openDkuPopin($scope, $event, dkuPopinOptions);
            };

            var createDatasetOnObject = function(itemPath, isDirectory) {
                $state.go("projects.project.datasets.new_with_type.settings", {type : 'FilesInFolder', fromOdbSmartId : SmartId.create($scope.odb.id, $scope.odb.projectKey), fromOdbItemPath: itemPath, fromOdbItemDirectory: isDirectory ? "true" : "false"})
            };
            $scope.createDatasetOnCurrentFolder = function() {
                createDatasetOnObject($scope.odbListing.safeFullPath, true);
            };
            $scope.createDatasetOnItem = function(item) {
                createDatasetOnObject(item.fullPath, item.directory);
            };

            /*
             * CRUD
             */

            $scope.createSubFolder = function() {
                Dialogs.prompt($scope, 'New Folder', 'Folder Name').then(function(newName) {
                    let path = $scope.odbListing.safeFullPath;
                    path += path.endsWith("/") ? newName : "/" + newName;
                    DataikuAPI.managedfolder.createSubFolder($stateParams.sourceProjectKey || $stateParams.projectKey, $scope.odb.id, path).success(function() {
                        refreshFolderListing($scope.odbListing.safeFullPath);
                    }).error(setErrorInScope.bind($scope));
                });
            };

            $scope.deleteItems = function(items) {
                let remainingItems = $scope.odbListing.children.filter(_ => items.indexOf(_) === -1);
                if (remainingItems && remainingItems.length !== $scope.odbListing.children.length) {
                    var objectKind = items.length > 1 ? 'these ' + items.length + ' selected items' : ('this ' + (items[0].directory ? 'folder and all its contents' : 'file'));
                    Dialogs.confirm($scope, 'File deletion', 'Are you sure you want to delete ' + objectKind + '?').then(function () {
                        DataikuAPI.managedfolder.deleteItems($stateParams.sourceProjectKey || $stateParams.projectKey, $scope.odb.id, items.map(_ => _.fullPath)).success(function (initialResponse) {
                            CreateModalFromTemplate("/templates/managedfolder/move-items-progress-modal.html", $scope, null, function(progressScope) {
                                progressScope.title = "Deleting items...";

                                progressScope.abort = function(){
                                    DataikuAPI.futures.abort(initialResponse.jobId)
                                        .success(() => {
                                            progressScope.refreshDirectory();
                                        })
                                        .error(setErrorInScope.bind(progressScope));
                                };

                                progressScope.done = false;
                                progressScope.aborted = false;
                                FutureWatcher.watchJobId(initialResponse.jobId)
                                    .success(function(data) {
                                        progressScope.done = data.hasResult;
                                        progressScope.percentage = 100;
                                        progressScope.aborted = data.aborted;
                                        progressScope.futureResponse = null;
                                        progressScope.finalResponse = data.result;
                                        progressScope.errors = data.result.messages || [];
                                        let deletedItems = data.result.paths;

                                        if (!progressScope.errors.length) {
                                            progressScope.dismiss();
                                        } else {
                                            remainingItems = $scope.odbListing.children.filter(_ => deletedItems.indexOf(_.fullPath) === -1);
                                        }

                                        $scope.setChildren(remainingItems);
                                    }).update(function(data){
                                        progressScope.percentage = ProgressStackMessageBuilder.getPercentage(data.progress);
                                        progressScope.futureResponse = data;
                                        progressScope.stateLabels = ProgressStackMessageBuilder.build(progressScope.futureResponse.progress, true);
                                    }).error(function(data, status, headers) {
                                        progressScope.done = true;
                                        progressScope.futureResponse = null;
                                        setErrorInScope.bind(progressScope)(data, status, headers);
                                    });
                            });
                        }).error(setErrorInScope.bind($scope));
                    });
                }
            };

            // callback for the dropping of files or clicking on the droparea
            $scope.uploadFiles = function(files, destination = $scope.odbListing.safeFullPath) {
                // try to not send a file that's already on the server
                let alreadyPresent = [];
                let filesToUpload = [];
                for(let i = 0, len = files.length; i < len ; i++) {
                    let file = files[i];
                    let found = false;
                    if (destination == $scope.odbListing.safeFullPath) {
                        $scope.odbListing.children.forEach(function(item) {found |= item.fullPath == getPathForFileToUpload(file, destination);});
                    }
                    if ( found ) {
                        alreadyPresent.push(file);
                    } else {
                        filesToUpload.push(file);
                    }
                }

                if (alreadyPresent.length > 0) {
                    CreateModalFromTemplate("/templates/managedfolder/upload-overwrite.html", $scope, "ManagedFolderUploadOverwriteModalController", function(newScope) {
                        newScope.projectKey = $stateParams.sourceProjectKey || $stateParams.projectKey;
                        newScope.alreadyPresent = alreadyPresent;
                        newScope.forceUploadFiles = function(files) {
                            forceUploadFiles(files, destination);
                        }
                    });
                }

                filesToUpload.forEach(function(fileToUpload) {uploadOneFile(fileToUpload, destination);});
            };

            $scope.setChildren = function(items) {
                $scope.odbListing.children = items;
            }

            function getPathForFileToUpload(fileToUpload, destination) {
                let path = destination;
                path += destination.charAt(destination.length - 1) == "/" ? fileToUpload.name : "/" + fileToUpload.name;
                return path;
            }

            function uploadOneFile(fileToUpload, destination = $scope.odbListing.safeFullPath) {
                let path = getPathForFileToUpload(fileToUpload, destination);
                var file = {
                    path: path,
                    name: fileToUpload.name,
                    size: fileToUpload.size,
                    lastModified: fileToUpload.lastModified,
                    progress: 0
                };
                if (destination == $scope.odbListing.safeFullPath) {
                    $scope.odbListing.children.push(file);
                }
                DataikuAPI.managedfolder.uploadItem($stateParams.sourceProjectKey || $stateParams.projectKey, $scope.odb.id, file.path, fileToUpload, destination == $scope.odbListing.safeFullPath, function (e) {
                    if (e.lengthComputable) {
                        $scope.$apply(function () {
                            file.progress = Math.round(e.loaded * 100 / e.total);
                        });
                    }
                }).then(function (data) {
                    //success
                    if (destination == $scope.odbListing.safeFullPath) {
                        let index = $scope.odbListing.children.indexOf(file);
                        $scope.odbListing.children = $scope.odbListing.children.slice(0, index).concat([JSON.parse(data)]).concat($scope.odbListing.children.slice(index + 1));
                    }
                }, function(payload){
                    // delete faulty file
                    let index = $scope.odbListing.children.indexOf(file);
                    if (index > -1) {
                        $scope.odbListing.children.splice($scope.odbListing.children.indexOf(file), 1);
                    }
                    setErrorInScope.bind($scope)(JSON.parse(payload.response), payload.status, function(h){return payload.getResponseHeader(h)});
                });
            }

            function forceUploadFiles(filesToUpload, destination = $scope.odbListing.safeFullPath) {
                filesToUpload.forEach(function(fileToUpload) {
                    let index = -1;
                    let itemPath = getPathForFileToUpload(fileToUpload, destination);
                    $scope.odbListing.children.forEach(function(item, i) {
                        if (item.fullPath == itemPath) {
                            index = i;
                        }
                    });
                    if (index >= 0) {
                        $scope.removeFile(itemPath);
                        $scope.odbListing.children.splice(index, 1);
                        DataikuAPI.managedfolder.deleteItems($stateParams.sourceProjectKey || $stateParams.projectKey, $scope.odb.id, [itemPath]).success(function(data){
                            uploadOneFile(fileToUpload);
                        }).error(setErrorInScope.bind($scope));
                    }
                });
            };

            $scope.uploadFilesAfterDigest = function(files, element) {
                $timeout(function() {
                    $scope.uploadFiles(files);
                    if (element) {
                        $(element).val("");
                    }
                }, 0);
            };

            $scope.downloadFile = function(path) {
                downloadURL(DataikuAPI.managedfolder.getDownloadItemURL($stateParams.projectKey, $scope.odb.projectKey, $scope.odb.id, path));
            };

            $scope.downloadFolder = function(path) {
                downloadURL(DataikuAPI.managedfolder.getDownloadFolderURL($stateParams.projectKey, $scope.odb.projectKey, $scope.odb.id, path));
            };
            
            /*
             * Skins
             */
            $scope.defaultViewSkin = {id:'Default view'};
            $scope.defaultViewItemSkin = {id:'Default view'};
            $scope.skins = [$scope.defaultViewSkin];
            $scope.webAppConfig = {}
            $scope.webAppType = null;
            $scope.runningWebAppId = null;

            $scope.$watch('uiState.skin', function() {
                if ($scope.uiState.skin === $scope.defaultViewSkin) return;
                VirtualWebApp.changeSkin($scope, 'MANAGED_FOLDER', $scope.uiState.skin, $scope.uiState, 'skin-holder',
                    $scope.odb.id, null, true);
            }, true);

            /*
             * UI Utils
             */
            $scope.getNameFromPath = function(path) {
                return path.replace(/^.*[\\\/]/, '')
            }

            $scope.uiState = {
                canDrop: false,
                skin: $scope.defaultViewSkin
            }
            $scope.skinState = {
                defaultViewItemSkin: $scope.defaultViewItemSkin,
                itemSkins: [$scope.defaultViewItemSkin],
                itemSkin: $scope.defaultViewItemSkin
            }
        }
    }
});


app.directive('managedFolderContentsPreview', function(Logger, VirtualWebApp, DataikuAPI, $stateParams, $http) {
    return {
        restrict: 'AE',
        templateUrl: '/templates/managedfolder/fragments/contents-preview.html',
        replace: true,
        scope : {
            odb : '=',
            previewedItem : '=',
            readOnly : '=',
            decompressPreviewedFile : '=',
            skinState : '='
        },
        link: function($scope, element, attrs){
            Logger.info("Initialize previewing", $scope.$id);
            $scope.destroyingScope = false;
            $scope.createdSVGPreviewURL = null;  // Empty object URL to store the current SVG file preview
            function setSVGPreviewURL(data) {
                if($scope.createdSVGPreviewURL) {
                    URL.revokeObjectURL($scope.createdSVGPreviewURL);
                }
                if(data) {
                    $scope.createdSVGPreviewURL = URL.createObjectURL(data);
                }
            }
            $scope.$watch('previewedItem', function() {
                if ($scope.previewedItem == null) return;
                Logger.info("Initialize preview item", $scope.$id, $scope.previewedItem.itemPath);
                // build up the image url (won't be used unless the previewItem's type is IMAGE OR PDF)
                if ($scope.previewedItem.contentType == "image/svg+xml") {
                    // Download as Blob, convert to URL and put in image tag to prevent XSS attack
                    // (of directly serving SVG as GET with SVG MIME type & inline content disposition)
                    // see ch59676, https://digi.ninja/blog/svg_xss.php
                    $http({
                        url:  DataikuAPI.managedfolder.getDownloadItemURL($stateParams.projectKey, $scope.odb.projectKey,  $scope.odb.id, $scope.previewedItem.itemPath),
                        method: 'GET',
                        responseType: 'blob',
                        transformResponse: function(data){
                            return new Blob([data], {type: $scope.previewedItem.contentType});
                        }
                    }).then(function({data}){
                        if ($scope.destroyingScope) return;
                        setSVGPreviewURL(data);
                        $scope.previewedItem.imageURL = $scope.createdSVGPreviewURL;
                    });
                } else {
                    // XSS-safe types can use GET & proper content type
                    $scope.previewedItem.imageURL = '/dip/api/managedfolder/preview-image?projectKey=' + $scope.odb.projectKey + '&odbId=' + $scope.odb.id + '&itemPath=' + encodeURIComponent($scope.previewedItem.itemPath) + '&contentType=' + encodeURIComponent($scope.previewedItem.contentType);
                }
                $scope.webAppType = null; // reset webapp
                if ($scope.previewedItem.type == "JSON"){
                    try {
                        $scope.previewedItem.jsonValue = JSON.parse($scope.previewedItem.head);
                    } catch (e) {
                        if ($scope.previewedItem.hasMore) {
                            document.getElementById("error_box").innerHTML = "This json file is too large be fully displayed."
                        } else {
                            document.getElementById("error_box").innerHTML = e;
                        }
                        $scope.jsonParsingFailed = true;
                        $scope.previewedItem.type = "TEXT";
                    }
                }
            });

            // Revoke the SVG object URL if the scope is destroyed
            $scope.$on("$destroy", function() {
                $scope.destroyingScope = true;
                setSVGPreviewURL(null);
             });
            
            /*
             * skins for preview items
             */
            $scope.webAppConfig = {}
            $scope.webAppType = null;
            $scope.runningWebAppId = null;

            $scope.$watch('skinState.itemSkin', function() {
                if ($scope.previewedItem == null) return;
                VirtualWebApp.changeSkin($scope, 'MANAGED_FOLDER', $scope.skinState.itemSkin, $scope.skinState,
                    'item-skin-holder', $scope.odb.id, $scope.previewedItem.itemPath, true);
            }, true);

            $scope.isDefaultItemView = function() {
                return $scope.skinState.itemSkin == null || $scope.skinState.itemSkin == $scope.skinState.defaultViewItemSkin;
            }
        }
    };
});

app.directive('managedFolderPreviewHeader', function(DataikuAPI, $q, CreateModalFromTemplate, $state, $stateParams, TopNav, $controller, Dialogs, Fn, $filter, $rootScope) {
    return {
        restrict: 'AE',
        templateUrl: '/templates/managedfolder/fragments/preview-header.html',
        scope : {
            odb : '=',
            previewedItem : '=',
            canDownload : '=',
            readOnly : '=',
            deletePreviewedItem : '=',
            decompressPreviewedFile : '=',
            createInsight : '=',
            skinState : '='
        },

        link: function($scope, element, attrs){
            $scope.appConfig = $rootScope.appConfig;
            $scope.$state = $state;
            
            $scope.createInsightForItem = function(filePath) {
                $scope.createInsight($scope.odb, filePath);
            };
            $scope.$watch('previewedItem', function() {
                if ($scope.previewedItem == null) return;
                if ($scope.previewedItem.contentType == "image/svg+xml") return; // see managedFolderContentsPreview
                // build up the image url (won't be used unless the previewItem's type is IMAGE OR PDF)
                $scope.previewedItem.imageURL = '/dip/api/managedfolder/preview-image?projectKey=' + $scope.odb.projectKey + '&odbId=' + $scope.odb.id + '&itemPath=' + encodeURIComponent($scope.previewedItem.itemPath) + '&contentType=' + encodeURIComponent($scope.previewedItem.contentType);
            });
            $scope.downloadPreviewedFile = function() {
                if ($scope.previewedItem == null)
                    return;
                downloadURL(DataikuAPI.managedfolder.getDownloadItemURL($stateParams.projectKey, $scope.odb.projectKey,  $scope.odb.id, $scope.previewedItem.itemPath));
            };
        }
    };
});


app.constant('MIME_TYPE_ICONS', {
    "text/plain" : "icon-file-text",
    "text/html" : "icon-file-text",
    "text/x-python" : "icon-file-text",
    "text/x-rsrc" : "icon-file-text",
    "text/x-julia" : "icon-file-text",
    "text/x-scala" : "icon-file-text",
    "text/x-sh" : "icon-file-text",
    "text/x-sql" : "icon-file-text",
    "text/x-markdown" : "icon-file-text",
    "application/json" : "icon-file-text",
    "application/javascript" : "icon-file-text",
    "application/pdf" : "icon-file-text",
    "application/xhtml+xml" : "icon-file-text",
    "application/xml" : "icon-file-text",
    "application/xml-dtd" : "icon-file-text",
    "application/xslt+xml" : "icon-file-text",

    "application/java-archive" : "icon-archive",
    "application/x-tar" : "icon-archive",
    "application/x-bzip" : "icon-archive",
    "application/x-bzip2" : "icon-archive",
    "application/zip" : "icon-archive",
    "application/x-gzip" : "icon-archive",

    "image/bmp" : "icon-picture",
    "image/gif" : "icon-picture",
    "image/jpeg" : "icon-picture",
    "image/png" : "icon-picture",
    "image/svg+xml" : "icon-picture",
    "image/tiff" : "icon-picture",
    "image/x-icon" : "icon-picture"
});


app.filter('mimeTypeToIcon', function(MIME_TYPE_ICONS) {
    return function(mimeType) {
        if (!mimeType) return 'icon-file';
        return MIME_TYPE_ICONS[mimeType] || 'icon-file';
    };
});


app.directive('managedFolderContentsList', function(DataikuAPI, $q, CreateModalFromTemplate, $state, $stateParams, TopNav, $controller, Dialogs, openDkuPopin, $timeout, MIME_TYPE_ICONS) {
    return {
        restrict: 'AE',
        templateUrl: '/templates/managedfolder/fragments/contents-list.html',
        replace: true,
        link: function($scope, element, attrs){
            // to get the error displayed in the right context
            var setErrorInScopeToUse = $scope.setErrorInThisScope ? $scope.setErrorInThisScope : setErrorInScope.bind($scope);

            $scope.filteredOdbListing = [];
            $scope.sortMethod = {
                by: 'name',
                reversed: false
            };

            /*
             * List content
             */

            $scope.switchSortMethod = function(by) {
                if ($scope.sortMethod.by == by) {
                    $scope.sortMethod.reversed = !$scope.sortMethod.reversed;
                } else {
                    $scope.sortMethod.by = by;
                    $scope.sortMethod.reversed = false;
                }
            };

            function refreshFilteredOdbListing() {
                if (!$scope.odbListing || !$scope.odbListing.children) {
                    $scope.filteredOdbListing = [];
                    return;
                }
                if ($scope.query) {
                    var lowercaseQuery = $scope.query.toLowerCase();
                    $scope.filteredOdbListing = $scope.odbListing.children.filter(function(item) {return item.name.toLowerCase().indexOf(lowercaseQuery) >= 0;});
                } else {
                    $scope.filteredOdbListing = $scope.odbListing.children.concat();
                }
                $scope.filteredOdbListing.sort(function(a,b) {
                    let sortValue = 0;
                    function sortByIfDifferent(attr) {
                        if (a[attr] != b[attr]) {
                            sortValue = a[attr] < b[attr] ? -1 : 1;
                        }
                    }
                    switch($scope.sortMethod.by) {
                        case 'name':
                            if (a.directory != b.directory)  {
                                sortValue = a.directory ? -1 : 1;
                            } else {
                                sortValue = a.name.localeCompare(b.name);
                            }
                            break;
                        case 'lastModified':
                            sortByIfDifferent('lastModified');
                            break;
                        case 'size':
                            sortByIfDifferent('size');
                            break;
                    }
                    if ($scope.sortMethod.reversed) {
                        sortValue = -1*sortValue;
                    }
                    return sortValue;
                });
            }

            // interactivity
            $scope.$watch("odbListing", function(nv, ov) { // when listing is loaded or cleared
                if (!nv || !nv.children) return;
                refreshFilteredOdbListing();
            }, true);
            $scope.$watch("query", refreshFilteredOdbListing);
            $scope.$watch("sortMethod", refreshFilteredOdbListing, true);

            // moving in list
            var keyCodes = {
                pageup: 33,
                pagedown: 34,
                enter: 13,
                up: 38,
                down: 40
            };

            function previewOrUpdateSelection(e, item, items) {
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    $scope.updateSelectedItems(e, item, items)
                } else {
                    $scope.setSelectedItemAndPreview(item);
                }
            }

            $scope.fileListKeyDown = function(event, callFromFatTable) {
                if ($scope.previewedItem == null) {
                    if ($scope.filteredOdbListing.length > 0) {
                        if (event.keyCode === keyCodes.up) {
                            $scope.setSelectedItemAndPreview($scope.filteredOdbListing[$scope.filteredOdbListing.length-1]);
                        } else if (event.keyCode === keyCodes.down) {
                            $scope.setSelectedItemAndPreview($scope.filteredOdbListing[0]);
                        }
                    }
                    return;
                }
                var idx = -1;

                $scope.filteredOdbListing.forEach(function(item, i) {
                    if ($scope.lastItemAddedToSelection.fullPath == item.fullPath) {
                        idx = i;
                    }
                });
                if (idx < 0) return;

                if (event.keyCode === keyCodes.up) {
                    event.preventDefault();
                    if (idx > 0) {
                        previewOrUpdateSelection(event, $scope.filteredOdbListing[idx - 1], $scope.filteredOdbListing)
                    }
                } else if (event.keyCode === keyCodes.down) {
                    event.preventDefault();
                    if (idx < $scope.filteredOdbListing.length - 1) {
                        previewOrUpdateSelection(event, $scope.filteredOdbListing[idx + 1], $scope.filteredOdbListing);
                    }
                } else if (event.keyCode === keyCodes.enter) {
                    event.preventDefault();
                    if ($scope.filteredOdbListing[idx].directory) {
                        $scope.browseDirectory($scope.filteredOdbListing[idx].fullPath);
                    }
                }
                if (callFromFatTable && (event.keyCode === keyCodes.up || event.keyCode === keyCodes.down)) {
                    $scope.$broadcast('scrollToLine', idx);
                }
            };

            /*
             * CRUD
             */

            $scope.renameItem = function(item) {
                let index = $scope.odbListing.children.indexOf(item);
                if (index >= 0) {
                    Dialogs.prompt($scope, "Rename " + item.name, 'New name', item.name).then(function(newName) {
                        DataikuAPI.managedfolder.renameItem($stateParams.sourceProjectKey || $stateParams.projectKey, $scope.odb.id, item.fullPath, item.directory, newName).success(function(data){
                            if (data.result && data.result.paths) {
                                $scope.odbListing.children[index] = data.result.paths[0];
                            }
                        }).error(setErrorInScopeToUse);
                    });
                }
            };

            $scope.moveItems = function(items) {
                CreateModalFromTemplate("/templates/managedfolder/move-item-modal.html", $scope, "MoveItemModalController", function(newScope) {
                    newScope.items = items;
                });
            }

            /*
             * Menus
             */

            $scope.openFileMenu = function(item, $event, popinPosition, items) {
                const multiMode = items && items.length > 1 && items.indexOf(item) >= 0; // if user right clicks outside of selection, show full menu
                item.hovered = true;

                function isElsewhere(elt, e) {
                    if ($(e.target).closest('#upload-link').length == 0) {
                        item.hovered = false; //kind of a hack: no callback possibility for the moment the popin get closed so we're using this...
                        return true;
                    }
                    return false;
                }

                let newScope = $scope.$new();
                newScope.item = item;
                newScope.items = items;
                newScope.uploadFilesAfterDigest = function(files) {
                    $timeout($scope.uploadFiles(files, item.fullPath), 0);
                    newScope.$destroy(); //will destroy the popin
                };

                let template = '<ul class="dropdown-menu">';

                if (!multiMode) {
                    template += `
                        <li><a ng-click="renameItem(item)">Rename...</a></li>
                        <li><a ng-click="moveItems([item])">Move to...</a></li>
                        <li><a ng-click="createInsight(odb, item.fullPath, item.directory)">Publish...</a></li>
                        <li><a ng-click="createDatasetOnItem(item)">Create a dataset...</a></li>
                        <li><a ng-click="item.directory ? downloadFolder(item.fullPath) : downloadFile(item.fullPath)">Download</a></li>
                        <li style="border-top: 1px #eee solid;" ng-if="item.directory" id="upload-link">
                        <a onclick="$(this).siblings('input[type=file]').click();$(this).parents('.dropdown-menu').hide()">Add File into...</a>
                        <input type="file" name="file" multiple style="display:none;" onchange="angular.element(this).scope().uploadFilesAfterDigest(this.files)" />
                        </li>
                        <li><a ng-click="deleteItems([item], $event)" style="border-top: 1px #eee solid;">Delete...</a></li>
                    `;
                } else {
                    template += `
                        <li><a ng-click="moveItems(items)">Move to...</a></li>
                        <li><a ng-click="deleteItems(items, $event)" style="border-top: 1px #eee solid;">Delete...</a></li>
                    `;
                }

                template += '</ul>';

                var dkuPopinOptions = {
                    template: template,
                    isElsewhere: isElsewhere,
                    popinPosition: popinPosition
                };
                openDkuPopin(newScope, $event, dkuPopinOptions);
            };

            $scope.openCurrentFolderMenu = function($event) {
                function isElsewhere(elt, e) {
                    return true;
                }

                var template = '<ul class="dropdown-menu">'
                    +    '<li ng-if="!readOnly"><a ng-click="createInsight(odb, odbListing.safeFullPath, true)">Publish...</a></li>'
                    +    '<li><a ng-click="downloadFolder(odbListing.safeFullPath)">Download</a></li>'
                    +    '<li ng-if="!readOnly" style="border-top: 1px #eee solid;"><a onclick="$(\'#hidden-input-file\').click();">Add File...</a></li>'
                    +    '<li ng-if="!readOnly"><a ng-if="odb.isDirectoryAware" ng-click="createSubFolder()">New Folder...</a></li>'
                    +    '<li ng-if="!readOnly"><a ng-click="createDatasetOnCurrentFolder()">Create a dataset...</a></li>'
                    +'</ul>';

                var dkuPopinOptions = {
                    template: template,
                    isElsewhere: isElsewhere,
                    popinPosition: 'CLICK'
                };
                openDkuPopin($scope, $event, dkuPopinOptions);
            };

            $scope.getIconClass = function(item) {
                if (!item) return '';
                if (item.directory) return 'icon-folder-close colored-folder-icon';
                if (!item.mimeType) return 'icon-file';
                return MIME_TYPE_ICONS[item.mimeType] || 'icon-file';
            };
        }
    }
});


// ngSrc doesn't work on embed. See https://github.com/angular/angular.js/issues/339
app.directive('embedSrc', function () {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            let current = element;
            scope.$watch(function() { return attrs.embedSrc; }, function () {
                let clone = element.clone().attr('src', attrs.embedSrc);
                current.replaceWith(clone);
                current = clone;
            });
        }
    };
});

})();
