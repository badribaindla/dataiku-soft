(function() {
'use strict';

const app = angular.module('dataiku.bundles.design', []);


app.controller("DesignBundleDetailsModalController", function($scope, $stateParams, Assert, DataikuAPI, ProgressStackMessageBuilder, FutureProgressModal) {
    $scope.uiState = {
        activeTab: "content"
    };

    function fetch() {
        Assert.inScope($scope, 'bundleId');
        DataikuAPI.projects.design.getBundleDetails($stateParams.projectKey, $scope.bundleId).success(function(data) {
            $scope.bundleDetails = data;

        }).error(setErrorInScope.bind($scope))
    }

    $scope.$watch("bundleId", function(nv, ov) {
        if (!nv) return;
        fetch();
    });
});


app.controller("DesignBundlesListController", function($scope, $controller, $stateParams, DataikuAPI, Dialogs, $state,
    $q, TopNav, Fn, CreateModalFromTemplate, ProgressStackMessageBuilder, FutureProgressModal, Assert) {
    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});

    TopNav.setLocation(TopNav.TOP_MORE, "bundlesdesign", TopNav.TABS_NONE, null);
    TopNav.setNoItem();

    function exportedOn(bundle) { return ((bundle.exportManifest || {}).exportUserInfo || {}).exportedOn; }

    $scope.noTags = true;
    $scope.noWatch = true;
    $scope.noStar = true;
    $scope.sortBy = [
        { value: 'exportManifest.exportUserInfo.exportedOn', label: 'Date' },
        { value: 'bundleId', label: 'Name' },
    ];
    $scope.sortCookieKey = 'designbundles';
    $scope.selection = $.extend({
        filterQuery: {
            q: '',
        },
        filterParams: {userQueryTargets: "bundleId"},
        orderQuery: 'exportManifest.exportUserInfo.exportedOn',
        orderReversed: false,
    }, $scope.selection || {});
    $scope.noTags = true;

    $scope.maxItems = 20;

    $scope.list = function() {
        DataikuAPI.projects.design.listBundles($stateParams.projectKey).success(function(data) {
            $scope.listItems = data.bundles;
            $scope.$broadcast('clearMultiSelect');

            $scope.listItems.forEach(function(x) {
                if (x.futureItem && x.futureItem.lastResponse && x.futureItem.lastResponse.progress) {
                    // not ProgressStackMessageBuilder.build(...), so pass the states instead of the progress
                    x.progressMsg = ProgressStackMessageBuilder.buildFull(x.futureItem.lastResponse.progress.states);
                }
            });
        }).error(setErrorInScope.bind($scope));
    };

    $scope.list();

    if ($stateParams.showProgressModalFor) {
        FutureProgressModal.showPeekOnlyIfRunning($scope,
                    $stateParams.showProgressModalFor, "Exporting bundle ...").then($scope.list);
    }

    // /* Specific actions */
    $scope.goToItem = function(data) {
        data.state === "BUILT" && $scope.showBundleDetails(data);
    };

    $scope.showBundleDetails = function(data) {
        CreateModalFromTemplate("/templates/bundles/design/details-modal.html", $scope, null, function(modalScope) {
            modalScope.bundleId = data.bundleId;
            modalScope.$apply();
        });
    };

    $scope.downloadBundleArchive = function(bundle) {
        downloadURL(DataikuAPI.projects.design.getBundleDownloadURL($stateParams.projectKey, bundle.bundleId));
    };

    $scope.publishOnDeployer = function(bundle) {
        if ($scope.appConfig.deployerClientEnabled) {
            CreateModalFromTemplate("/templates/bundles/design/publish-on-deployer-modal.html", $scope, "PublishBundleOnDeployerModalController", function(newScope) {
                newScope.uploadParams = {bundleId: bundle.bundleId};

                newScope.refreshBundle = function(bundleId, publishedBundleState) {
                    const latestBundle = $scope.listItems.find(item => item.bundleId === bundleId);
                    latestBundle.publishedBundleState = publishedBundleState;
                }
            });
        }
    };

    $scope.setBundleExporterSettings = function() {
        CreateModalFromTemplate("/templates/bundles/design/exporter-settings-modal.html", $scope);
    };

    $scope.startRevert = function(bundleId) {
        DataikuAPI.projects.design.checkBundleReversion($stateParams.projectKey, bundleId).success(function(data) {
            CreateModalFromTemplate("/templates/bundles/design/reversion-check-result.html", $scope, null, function(modalScope) {
                modalScope.checkResult = data;
                modalScope.doRevert = function() {
                    Assert.inScope(modalScope, 'checkResult');
                    DataikuAPI.projects.design.revertBundle($stateParams.projectKey, modalScope.checkResult.bundleId, modalScope.importOptions).success(function(data) {
                        modalScope.dismiss();

                        FutureProgressModal.show($scope, data, "Activating bundle").then(function(activateResult) {
                            if (activateResult.anyMessage) {
                                Dialogs.infoMessagesDisplayOnly($scope, "Activation report", activateResult);
                            }

                            $scope.refreshProjectData();
                        });

                    }).error(setErrorInScope.bind(modalScope));
                }
            })
        }).error(setErrorInScope.bind($scope));
    };

    $scope.deleteBundle = function(bundle) {
        Dialogs.confirmSimple($scope, "Delete bundle <strong>" + bundle.bundleId +"</strong>?").then(function() {
            DataikuAPI.projects.design.deleteBundle($stateParams.projectKey, bundle.bundleId)
                .success($scope.list.bind(null))
                .error(setErrorInScope.bind($scope));
        });
    };

    $scope.deleteSelected = function() {
        if ($scope.selection.none) {
            return;
        } else if ($scope.selection.single) {
            $scope.deleteBundle($scope.selection.selectedObject);
        } else {
            Dialogs.confirm($scope, "Confirm deletion", "Are you sure you want to delete the selected bundles? Only successfully created bundles will be deleted.").then(function() {
                $q.all($scope.selection.selectedObjects.filter(bundle => bundle.state === 'BUILT').map(Fn.prop('bundleId'))
                    .map(DataikuAPI.projects.design.deleteBundle.bind(null, $stateParams.projectKey))
                ).then($scope.list.bind(null), setErrorInScope.bind($scope));
            });
        }
    };
});

app.directive('bundlesDesignRightColumnSummary', function(){
    return {
        templateUrl :'/templates/bundles/design/right-column-summary.html'
    }
});

app.controller("PublishBundleOnDeployerModalController", function($scope, $stateParams, DataikuAPI, StringUtils, WT1) {
    $scope.publishedProjectKeys = [];

    $scope.step = "confirmPublish";

    let suggestedProjectKey;
    $scope.$watch('uploadParams.targetProject.createProjectMessage', function(nv, ov) {
        if (nv) {
            $scope.uploadParams.targetProject.id = suggestedProjectKey;
        }
    });

    DataikuAPI.projectdeployer.client.listPublishedProjects()
        .success(function(response) {
            $scope.publishedProjects = response.filter(projectStatus => projectStatus.canWrite).sort((a, b) => a.projectBasicInfo.name.localeCompare(b.projectBasicInfo.name));
            suggestedProjectKey = StringUtils.transmogrify($stateParams.projectKey,
                                                          $scope.publishedProjects.map(_ => _.projectBasicInfo.id),
                                                          (count, name) => `${name}_${count}`);
            $scope.publishedProjects.unshift({createProjectMessage: "Create a new project...", packages: [], projectBasicInfo: {id: suggestedProjectKey}});
            $scope.publishedProjectKeys = $scope.publishedProjects.map(function(projectStatus) {
                if (projectStatus.createProjectMessage || (projectStatus.projectBasicInfo.id === projectStatus.projectBasicInfo.name)) return "";
                return projectStatus.projectBasicInfo.id;
            });
            $scope.uploadParams.targetProject = $scope.publishedProjects.find(project => project.projectBasicInfo.id === $stateParams.projectKey);
            if (!$scope.uploadParams.targetProject || $scope.uploadParams.targetProject.packages.find(bundle => bundle.id === $scope.uploadParams.bundleId)) {
                $scope.uploadParams.targetProject = $scope.publishedProjects[0];
            }
        })
        .error(setErrorInScope.bind($scope));

    $scope.ok = function() {
        $scope.step = "publishing";
        DataikuAPI.projects.design.publishToDeployer(
                $stateParams.projectKey,
                $scope.uploadParams.bundleId,
                $scope.uploadParams.targetProject.projectBasicInfo.id)
            .success(function(response) {
                $scope.step = "published";
                $scope.refreshBundle($scope.uploadParams.bundleId, response);
                WT1.event('project-deployer-publish-to-deployer');
            })
            .error(setErrorInScope.bind($scope));
    };
});

app.directive("bundleContentEditor", function(Collections, DataikuAPI, $stateParams, FeatureFlagsService) {
    return {
        templateUrl: "/templates/bundles/design/bundle-content-editor.html",
        scope: {
            "exporterSettings": "="
        },
        link: function($scope) {
            $scope.featureFlagEnabled = FeatureFlagsService.featureFlagEnabled;
            function rebuildAvailableDatasets() {
                $scope.availableDatasets = $scope.rawHeaders.filter(function(x) {
                    return x.type != "JobsDB" && x.type != "StatsDB" && x.type != "Inline"
                }).map(function(dataset) {
                    return {
                        localProject : $stateParams.projectKey,
                        datasetType : dataset.type,
                        type : dataset.type,
                        usable: true,
                        smartName: dataset.name,
                        name : dataset.name
                    };
                });
                $scope.datasetsMap = Collections.indexByField($scope.availableDatasets, "name");
                // filter exported datasets to only have existing datasets
                $scope.exporterSettings.exportOptions.includedDatasetsData = $scope.exporterSettings.exportOptions.includedDatasetsData.filter(function(dataset) {
                    return dataset.name in $scope.datasetsMap;
                });
                $scope.exporterSettings.exportOptions.includedDatasetsData.forEach(function(dataset) {
                    $scope.datasetsMap[dataset.name].usable = false;
                });
            }

            DataikuAPI.datasets.listHeaders($stateParams.projectKey).success(function(data) {
                $scope.rawHeaders = data;
                rebuildAvailableDatasets();
            }).error(setErrorInScope.bind($scope));

            DataikuAPI.managedfolder.list($stateParams.projectKey).success(function(data) {
                $scope.availableManagedFolders = data.map(function(folder) {
                    return {
                        localProject : $stateParams.projectKey,
                        type : folder.type,
                        datasetType: "",
                        usable: true,
                        smartName: folder.id,
                        name : folder.name,
                        id: folder.id
                    };
                });
                $scope.foldersMap = Collections.indexByField($scope.availableManagedFolders, "id");
                $scope.exporterSettings.exportOptions.includedManagedFolders = $scope.exporterSettings.exportOptions.includedManagedFolders.filter(function(folder) {
                    return folder.id in $scope.foldersMap;
                });
                $scope.exporterSettings.exportOptions.includedManagedFolders.forEach(function(folder) {
                    $scope.foldersMap[folder.id].usable = false;
                });
            }).error(setErrorInScope.bind($scope));

            DataikuAPI.savedmodels.list($stateParams.projectKey).success(function(data) {
                $scope.availableSavedModels = data.map(function(model) {
                    return {
                        localProject : $stateParams.projectKey,
                        type : model.miniTask.taskType,
                        datasetType: "",
                        usable: true,
                        smartName: model.id,
                        name : model.name,
                        id: model.id,
                        model: model
                    };
                });
                $scope.modelsMap = Collections.indexByField($scope.availableSavedModels, "id");
                $scope.exporterSettings.exportOptions.includedSavedModels = $scope.exporterSettings.exportOptions.includedSavedModels.filter(function(model) {
                    return model.id in $scope.modelsMap;
                });
                $scope.exporterSettings.exportOptions.includedSavedModels.forEach(function(model) {
                   $scope.modelsMap[model.id].usable = false;
                });
            }).error(setErrorInScope.bind($scope));

            DataikuAPI.modelevaluationstores.list($stateParams.projectKey).success(function(data) {
                $scope.availableModelEvaluationStores = data.map(function(store) {
                    return {
                        localProject : $stateParams.projectKey,
                        type : "",
                        datasetType: "",
                        usable: true,
                        smartName: store.id,
                        name : store.name,
                        id: store.id,
                        store: store
                    };
                });
                $scope.storesMap = Collections.indexByField($scope.availableModelEvaluationStores, "id");
                $scope.exporterSettings.exportOptions.includedModelEvaluationStores = $scope.exporterSettings.exportOptions.includedModelEvaluationStores.filter(function(store) {
                    return store.id in $scope.storesMap;
                });
                $scope.exporterSettings.exportOptions.includedModelEvaluationStores.forEach(function(store) {
                   $scope.storesMap[store.id].usable = false;
                });
            }).error(setErrorInScope.bind($scope));

            $scope.addDataset = {};
            $scope.addSavedModel = {};
            $scope.addManagedFolder = {};
            $scope.addModelEvaluationStore = {};

            $scope.$watch("addDataset.dataset", function(nv) {
                if (nv) {
                    $scope.exporterSettings.exportOptions.includedDatasetsData.unshift($scope.datasetsMap[nv]);
                    rebuildAvailableDatasets();
                    $scope.datasetsMap[nv].usable = false;
                    $scope.addDataset.dataset = null;
                }
            });

            $scope.$watch("addManagedFolder.folder", function(nv) {
                if (nv) {
                    $scope.exporterSettings.exportOptions.includedManagedFolders.unshift($scope.foldersMap[nv]);
                    $scope.foldersMap[nv].usable = false;
                    $scope.addManagedFolder.folder = null;
                }
            });

            $scope.$watch("addSavedModel.model", function(nv) {
                if (nv) {
                    $scope.exporterSettings.exportOptions.includedSavedModels.unshift($scope.modelsMap[nv]);
                    $scope.modelsMap[nv].usable = false;
                    $scope.addSavedModel.model = null;
                }
            });
            
            $scope.$watch("addModelEvaluationStore.store", function(nv) {
                if (nv) {
                    $scope.exporterSettings.exportOptions.includedModelEvaluationStores.unshift($scope.storesMap[nv]);
                    $scope.storesMap[nv].usable = false;
                    $scope.addModelEvaluationStore.store = null;
                }
            });
        }
    }
});


app.controller("DesignBundleContentModalController", function($scope, DataikuAPI, $stateParams) {

    DataikuAPI.projects.design.getBundleExporterSettings($stateParams.projectKey).success(function(data) {
        $scope.exporterSettings = data;
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.datasets.listHeaders($stateParams.projectKey).success(function(data) {
        $scope.availableDatasets = data.map(function(dataset) {
            return {
                localProject: $stateParams.projectKey,
                datasetType: dataset.type,
                type: dataset.type
            };
        });
    }).error(setErrorInScope.bind($scope));

    $scope.save = function() {
        DataikuAPI.projects.design.saveBundleExporterSettings($stateParams.projectKey,  $scope.exporterSettings).success(function(data) {
            $scope.dismiss();
        }).error(setErrorInScope.bind($scope));
    }
});


app.controller("DesignBundlesNewController", function($scope, $state, $stateParams, Assert, DataikuAPI, TopNav, Logger, Dialogs, $q, Fn, MonoFuture, Collections) {
    TopNav.setLocation(TopNav.TOP_HOME, "bundlesdesign", TopNav.TABS_NONE, null);
    TopNav.setNoItem();

    Assert.trueish($stateParams.projectKey, "Not in a project");

    $scope.newBundle = {};

    $scope.createBundle = function() {
        DataikuAPI.projects.design.createBundle($stateParams.projectKey, $scope.newBundle.bundleId, $scope.preparationResult).success(function(data) {
            $state.go("projects.project.bundlesdesign.list", {
                showProgressModalFor : data.jobId
            });
        }).error(setErrorInScope.bind($scope));
    };

    MonoFuture($scope).wrap(DataikuAPI.projects.design.prepareBundleCreation)($stateParams.projectKey).success(function(data) {
        $scope.preparationResult = data.result;
        $scope.preparingFuture = null;
    }).update(function(data) {
        $scope.preparingFuture = data;
    }).error(function (data, status, headers) {
        $scope.preparingFuture = null;
        setErrorInScope.bind($scope)(data, status, headers);
    });
});


app.controller("DesignBundleCheckResultModalController", function($scope, DiffFormatter) {
    $scope.importOptions = {
        meaningsToImport: {}
    };

    $scope.$watch('checkResult', function(nv) {
        if (!nv) return;
        nv.messages.forEach(function(message) {
            if (message.udmId) {
                $scope.hasUDMConflict = true;
                $scope.importOptions.meaningsToImport[message.udmId] = false;
                message.formattedDiff = DiffFormatter.formatChange(message.diff);
            }
        });
    });
});

})();
