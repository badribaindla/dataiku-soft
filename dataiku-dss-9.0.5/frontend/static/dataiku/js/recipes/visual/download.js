(function() {
'use strict';
var app = angular.module('dataiku.recipes');

app.controller("DownloadRecipeCreationController", function($scope, $stateParams, $state, $controller, Fn,
        DataikuAPI, WT1, RecipesUtils, RecipeDescService, DatasetsService, RecipeComputablesService, PartitionDeps, BigDataService, DatasetUtils) {

    $controller("_RecipeCreationControllerBase", {$scope:$scope});
    $controller("_RecipeOutputNewManagedBehavior", {$scope:$scope});

    $scope.uiState = $scope.uiState || {};
    $scope.io.newOutputTypeRadio = 'new-odb';
    $scope.recipeType = 'download';

    // for safety, to use the _RecipeOutputNewManagedBehavior fully (maybe one day)
    $scope.setErrorInTopScope = function(scope) {
        return setErrorInScope.bind($scope);
    };

    var makeMainRole = function (refs) {
        return {
            main: {
                items: refs.filter(function(ref) {return !!ref;}).map(function(ref) {return {ref: ref}; })
            }
        }
    };

    // Creates the recipe object and sends it to the backend
    $scope.doCreateRecipe = function() {
        var createOutputFolder = $scope.io.newOutputTypeRadio == 'new-odb';
        var outputRef = createOutputFolder ? $scope.newOutputODB.name : $scope.io.existingOutputDataset;
        var outputName = createOutputFolder ? $scope.newOutputODB.name : $scope.availableOutputFolders.filter(function(f) {return f.smartName == $scope.io.existingOutputDataset;})[0].label;
        var recipe = {
            type: $scope.recipeType,
            projectKey: $stateParams.projectKey,
            name: "download_to_"+outputName,

            inputs: {},
            outputs: makeMainRole([outputRef]),
        };
        if ($scope.zone) recipe.zone = $scope.zone;

        var settings = {
                createOutputFolder : createOutputFolder,
                outputFolderSettings : $scope.getFolderCreationSettings()
        };

        return DataikuAPI.flow.recipes.generic.create(recipe, settings);
    };

    // Called from UI, force means that no check-name-safety call is done
    $scope.createRecipe = function() {
        $scope.recipeWT1Event("recipe-create-" + $scope.recipeType);
        var p = $scope.doCreateRecipe();
        if (p) {
            $scope.creatingRecipe = true;
            p.success(function(data) {
                $scope.creatingRecipe = false;
                $scope.dismiss();
                $scope.$state.go('projects.project.recipes.recipe', {recipeName: data.id});
            }).error(function(a, b, c) {
                $scope.creatingRecipe = false;
                setErrorInScope.bind($scope)(a,b,c);
            });
        }
    };

    $scope.formIsValid = function() {
        if ($scope.io.newOutputTypeRadio == 'new-odb') {
            return $scope.newOutputODB && $scope.newOutputODB.name && $scope.newOutputODB.connectionOption;
        } else if ($scope.io.newOutputTypeRadio == 'select') {
            return $scope.io.existingOutputDataset;
        } else {
            return false;
        }
    };

    DatasetUtils.listFoldersUsabilityForOutput($stateParams.projectKey, $scope.recipeType).then(function(data){
        $scope.availableOutputFolders = data.filter(function(computable){
            return computable.usableAsOutput['main'] && computable.usableAsOutput['main'].usable && !computable.alreadyUsedAsOutputOf;
        });
    });

    var updateManagedFolderOptions = function() {
        var recipe = {
                type: $scope.recipeType,
                projectKey: $stateParams.projectKey,
                name: "compute_",
                inputs: {},
                outputs: {}
            };

        DataikuAPI.datasets.getManagedFolderOptions(recipe, 'main')
            .success(function(data) {
                $scope.setupManagedFolderOptions(data);
            })
            .error($scope.setErrorInTopScope($scope));
    };
    updateManagedFolderOptions();
});


app.controller("DownloadRecipeController", function($scope, $stateParams, $q, $timeout, DataikuAPI, Dialogs, PartitionDeps, RecipesUtils, ExportService) {
    $scope.hooks.save = function() {
        var deferred = $q.defer();
        var recipeSerialized = angular.copy($scope.recipe);
        PartitionDeps.prepareRecipeForSerialize(recipeSerialized);

        $scope.baseSave(recipeSerialized, null).then(function(){
                    deferred.resolve("Save done");
                }, function(error) {
                    Logger.error("Could not save recipe");
                    deferred.reject("Could not save recipe");
                })
        return deferred.promise;
    };

    $scope.hooks.preRunValidate = function() {
        var deferred = $q.defer();
        deferred.resolve({"ok" : true});
        return deferred.promise;
    };

    $scope.isOutputPartitioned = function() {
        return RecipesUtils.hasAnyPartitioning($scope.recipe, $scope.computablesMap);
    };

    $scope.enableAutoFixup();

    $scope.hasConnectionHasMetadata = function(source) {
        return ['Azure', 'S3', 'GCS'].indexOf(source.providerType) >= 0;
    };
    $scope.getDefaultPath = function(source) {
        return ['FTP', 'SFTP', 'SCP', 'Azure', 'S3', 'GCS'].indexOf(source.providerType) >= 0 ? '' : '/';
    };
    var contextVars = {};
    $scope.getContextVars = function() {
        return contextVars; // don't return a new one each time, otherwise $digest loop
    };
    $scope.getConnectionType = function(t) {
        return t == 'SFTP' || t == 'SCP' ? 'SSH' : t;
    };

    DataikuAPI.datasets.listFSProviderTypes(true).success(function(data) {
        $scope.providerTypes = data;
        $scope.providerTypes = ["URL"].concat($scope.providerTypes);
    }).error(setErrorInScope.bind($scope));

    $scope.addSource = function() {
        var source = {useGlobalProxy:true, providerType:'URL', params:{path:'', consider404AsEmpty:true, fallbackHeadToGet:true, trustAnySSLCertificate:false}};
        $scope.recipe.params.sources.push(source);
    };
    $scope.removeSource = function(index) {
        $scope.recipe.params.sources.splice(index, 1);
    };

    $scope.onProviderParamsChanged = function(source) {
        // no special action to take when changing the provider (at the moment)
    };

    $scope.checkSource = function(source) {
        var recipeSerialized = angular.copy($scope.recipe);
        PartitionDeps.prepareRecipeForSerialize(recipeSerialized);
        DataikuAPI.flow.recipes.download.checkDownloadSource($stateParams.projectKey, recipeSerialized, source, source.$testPartition).success(function(data) {
            source.$check = data;
        }).error(setErrorInScope.bind($scope));
    };
});

app.controller("CreateUrlDownloadToFolderDatasetController", function($scope, $state, $timeout, DataikuAPI, WT1, JobDefinitionComputer) {
    var folder;
    $scope.downloading = false;
    $scope.params = {
        url: '',
        connection: null,
        recipeName: null,
        folderName: '',
        folderId: null
    };
    $scope.$watch('params.projectKey', function(projectKey) {
        DataikuAPI.datasets.getManagedFolderOptionsNoContext(projectKey).success(function(data) {
            $scope.connections = data.connections.filter(function(_) {
                return ['Filesystem', 'HDFS'].indexOf(_.connectionType) >= 0;
            });
            var selected = $scope.connections.map(function(_){ return _.connectionName; }).indexOf('filesystem_managed');
            if (selected < 0) { // first Filesystem
                selected = $scope.connections.map(function(_){ return _.connectionType; }).indexOf('Filesystem');
                if (selected < 0 && $scope.connections.length > 0) { // first connection
                    selected = 0;
                }
            }
            if (selected >= 0) {
                $scope.params.connection = $scope.connections[selected];
            }
        });
    });
    $scope.checkURL = function() {
        $scope.downloading = true;
        function done(data) {
            $scope.downloadCheck = data;
            $scope.downloading = false;
            if (data.successful) {
                var url = new URL($scope.params.url);
                if (!$scope.params.folderName) {
                    $scope.params.folderName = url.hostname;
                }
            }
        }
        DataikuAPI.flow.recipes.download.checkDownloadURL($scope.projectKey, $scope.params.url)
            .success(done).error(done);
    };
    $scope.createFolderAndDownload = function() {
        if (!$scope.params.folderId) {
            WT1.event("new-managed-folder-modal-create");
            DataikuAPI.datasets.newManagedFolder($scope.params.projectKey, $scope.params.folderName, {
                type: $scope.params.connection.fsProviderTypes[0],
                connectionId: $scope.params.connection.connectionName,
                partitioningOptionId: 'NP'
            }).success(function(data) {
                $scope.params.folderId = data.id;
                folder = data;
                createRecipe();
            }).error(setErrorInScope.bind($scope));
        } else if (!$scope.params.recipeName) {
            createRecipe();
        } else {
            runRecipe();
        }
    };
    $scope.goToFolder = function() {
        $state.go('projects.project.managedfolders.managedfolder.view', { odbId: $scope.params.folderId });
        $scope.dismiss();
    };
    $scope.goCreateDataset = function() {
        $state.go('projects.project.datasets.new_with_type.settings', {
            type: 'FilesInFolder',
            prefillParams: JSON.stringify({
                folderSmartId: $scope.params.folderId,
                itemPathPattern: "/.*"
            })
        });
        $scope.dismiss();
        return;
    }

    function createRecipe() {
        var recipe = {
            name: 'compute_' + $scope.params.folderId,
            projectKey: $scope.params.projectKey,
            type: "download",
            inputs: {},
            outputs: {
                main: {
                    items: [{
                        ref: $scope.params.folderId,
                        deps: []
                    }]
                }
            },
            params: {
                deleteExtraFiles: true,
                copyEvenUpToDateFiles: false,
                sources: [{
                    useGlobalProxy:true,
                    providerType: "URL",
                    params: { path: $scope.params.url }
                }]
            }
        };
        $scope.creatingRecipe = true;
        DataikuAPI.flow.recipes.generic.create(recipe, { script: '' })
            .success(function(data) {
                $scope.params.recipeName = data.id;
                $scope.creatingRecipe = false;
                runRecipe();
            }).error(function(a, b, c) {
                $scope.creatingRecipe = false;
                setErrorInScope.bind($scope)(a,b,c);
            });
    }

    function runRecipe() {
        $scope.downloading = true;
        $scope.jobStatus = null;

        var jd = JobDefinitionComputer.computeJobDefForBox(
            $scope.params.projectKey,
            'NON_RECURSIVE_FORCED_BUILD',
            folder,
            null,   // NP
            'RECIPE',
            $scope.params.recipeName
        );

        DataikuAPI.flow.jobs.start(jd).success(function(data) {
            $scope.jobId = data.id;
            waitForEndOfRecipeRun();
        }).error(function(a, b, c) {
            $scope.downloading = false;
            setErrorInScope.bind($scope)(a, b,c);
        });

    }

    function waitForEndOfRecipeRun() {
        DataikuAPI.flow.jobs.getJobStatus($scope.params.projectKey, $scope.jobId).success(function(data) {
            $scope.jobStatus = data;
            data.totalWarningsCount = 0;
            for (var actId in data.baseStatus.activities) {
                var activity = data.baseStatus.activities[actId];
                if (activity.warnings) {
                    data.totalWarningsCount += activity.warnings.totalCount;
                }
            }
            if (data.baseStatus.state != "DONE" && data.baseStatus.state != "ABORTED" &&
                data.baseStatus.state != "FAILED") {
                $scope.jobCheckTimer = $timeout(waitForEndOfRecipeRun, 2000);
            } else {
                $scope.downloading = false;
            }
        }).error(setErrorInScope.bind($scope));
    }

});

})();