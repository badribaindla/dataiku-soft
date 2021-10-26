(function() {
'use strict';


const app = angular.module('dataiku.notebooks');
const setJupyterErrorInScope = function($scope) {return function(error) {$scope.jupyterError = error; $scope.$digest();}};

app.controller('PublishIPythonController', function ($scope, $stateParams, DataikuAPI, $filter, CreateModalFromTemplate) {
    $scope.exportCreateAndPinInsightNoSave = function(notebook) {
        var notebookName = notebook.name;
        $scope.queryRunning = true;
        var exportPromise = DataikuAPI.jupyterNotebooks.export.create($stateParams.projectKey, notebookName);
        exportPromise.success(function(jupyterExport) {
            var insight = {
                projectKey: $stateParams.projectKey,
                type: 'jupyter',
                name: notebook.name + " (" + $filter('utcDate')(jupyterExport.timestamp, 'YYYY-MM-DD hh:mm') + ")",
                params: {
                    projectKey: $stateParams.projectKey,
                    notebookSmartName: notebookName,
                    timestamp: jupyterExport.timestamp,
                    loadLast: true
                },
            }
            CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insight-modal.html", $scope, "CreateAndPinInsightModalController", function(newScope) {
                newScope.init(insight);
            });
        });
        exportPromise.error(setErrorInScope.bind($scope));
    };
    $scope.exportCreateAndPinInsight = function(notebook) {
        $('iframe#jupyter-iframe')[0].contentWindow.IPython.notebook.save_notebook().then(function() {
            $scope.exportCreateAndPinInsightNoSave(notebook);
        }).catch(setJupyterErrorInScope($scope));
    }
});


app.controller('IPythonController', function ($scope, $stateParams, $state, $sce, $q, $rootScope, Dialogs, CreateExportModal, ExportUtils, DataikuAPI, TopNav, ActivityIndicator, LoggerProvider, WT1, $filter, CreateModalFromTemplate, $controller, StateUtils) {
	$controller('PublishIPythonController', {$scope:$scope});

	var Logger = LoggerProvider.getLogger("dku.notebooks");

    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'notebooks', TopNav.TABS_JUPYTER_NOTEBOOK, null);
    TopNav.setItem(TopNav.ITEM_JUPYTER_NOTEBOOK, $stateParams.notebookId, {name:$stateParams.notebookId});
    $scope.$stateParams = $stateParams;
    if ($stateParams.kernel_name) {
        $scope.notebookURL = $sce.getTrustedResourceUrl("/jupyter/notebooks/" + $stateParams.projectKey + "/" + $stateParams.notebookId + ".ipynb?kernel_name=" + $stateParams.kernel_name);
    } else {
        $scope.notebookURL = $sce.getTrustedResourceUrl("/jupyter/notebooks/" + $stateParams.projectKey + "/" + $stateParams.notebookId + ".ipynb");
    }

    DataikuAPI.jupyterNotebooks.get($stateParams.projectKey, $stateParams.notebookId, $stateParams.kernel_name).success(function(data) {
        $scope.notebook = data;
        if ($scope.notebook && $scope.notebook.name) {
            $scope.notebook.name = $scope.notebook.name.replace(".ipynb", "");
            $scope.notebook.id = $stateParams.projectKey + "." + $scope.notebook.name;
        }

        if (data && data.content && data.content.metadata && data.content.metadata.kernelspec) {
            if (data.content.metadata.kernelspec.language=='python') {
                $scope.snippetsType = "python";
                $scope.snippetsCategories = ["py-std-dkuapi", "py-std-3rd", "user-py-std", "py-notebook", "py-spark-dkuapi", "py-spark-3rd"];
                $scope.snippetsSaveCategory = "user-py-std"
                TopNav.setItem(TopNav.ITEM_JUPYTER_NOTEBOOK, $stateParams.notebookId, {name:$stateParams.notebookId, type: "python"});
            } else if (data.content.metadata.kernelspec.language.startsWith('julia')) {
                $scope.snippetsType = "julia";
                $scope.snippetsCategories = ["jl-std-dkuapi", "jl-std-3rd", "user-jl-std", "j0l-notebook"];
                $scope.snippetsSaveCategory = "user-jl-std"
                TopNav.setItem(TopNav.ITEM_JUPYTER_NOTEBOOK, $stateParams.notebookId, {name:$stateParams.notebookId, type: "julia"});
            } else if (data.content.metadata.kernelspec.language=='R') {
                $scope.snippetsType = "R";
                $scope.snippetsCategories = ["R-std-dkuapi", "R-std-3rd", "user-R-std", "R-notebook", "sparkr-dkuapi", "sparkr-3rd"];
                $scope.snippetsSaveCategory = "user-R-std";
                TopNav.setItem(TopNav.ITEM_JUPYTER_NOTEBOOK, $stateParams.notebookId, {name:$stateParams.notebookId, type: "R"});
            } else if (data.content.metadata.kernelspec.language=='scala') {
                $scope.snippetsType = "scala";
                $scope.snippetsCategories = ["spark-scala-3rd", "mllib-clustering", "mllib-regressor", "user-scala-std"];
                $scope.snippetsSaveCategory = "user-scala-std";
                TopNav.setItem(TopNav.ITEM_JUPYTER_NOTEBOOK, $stateParams.notebookId, {name:$stateParams.notebookId, type: "scala"});
            }else {
                Logger.warn("Failed to guess snippets types", data);
            }
        } else {
            Logger.warn("Failed to guess snippets types", data);
        }
    });

    var deleteNotebookWithoutConfirm = function(notebook) {
        var deferred = $q.defer();
        var deletionRequest = [{
            type: 'JUPYTER_NOTEBOOK',
            projectKey: $stateParams.projectKey,
            id: notebook.name,
            displayName: notebook.name,
            options: {dropData: false}
        }];
        WT1.event("notebook-ipython-delete");
        if (notebook.kernel_id) {
            DataikuAPI.jupyterNotebooks.unload(notebook.session_id).success(function(d1) {
                DataikuAPI.taggableObjects.delete(deletionRequest, $stateParams.projectKey).success(function(data) {
                    deferred.resolve(true);
                }).error(setErrorInScope.bind($scope));
            }).error(setErrorInScope.bind($scope));
        } else {
            DataikuAPI.taggableObjects.delete(deletionRequest, $stateParams.projectKey).success(function(data) {
                deferred.resolve(true);
            }).error(setErrorInScope.bind($scope));
        }
        return deferred.promise;
    };

    $scope.editCustomFields = function(notebook) {
        const tor = {type: 'JUPYTER_NOTEBOOK', projectKey: $stateParams.projectKey, id: notebook.name};
        DataikuAPI.taggableObjects.getMetadata(tor)
            .success(function(metadata) {
                let modalScope = angular.extend($scope, {objectType: 'JUPYTER_NOTEBOOK', objectName: notebook.name, objectCustomFields: metadata.customFields || {}});
                CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                    metadata.customFields = angular.copy(customFields);
                    DataikuAPI.taggableObjects.setMetaData(tor, metadata)
                        .error(setErrorInScope.bind($scope));
                });
            })
            .error(setErrorInScope.bind($scope));
    };

    $scope.deleteNotebook = function(notebook) {
        if (!notebook || !notebook.name) {
            return;
        }
        Dialogs.confirm($scope, "Confirm deletion", "Are you sure you want to delete this notebook: " + notebook.name +" ?").then(function() {
            deleteNotebookWithoutConfirm(notebook).then(function() {
                $state.transitionTo('projects.project.notebooks.list', {projectKey: $stateParams.projectKey});
            });
        });
    };

    $scope.saveBackToRecipe = function(notebook) {
        var notebookHasName = notebook && !!notebook.name;
        var notebookHasMetadata = notebook && notebook.content && !!notebook.content.metadata;
        var notebookHasAssociatedRecipe = notebookHasMetadata && notebook.content.metadata.associatedRecipe && notebook.content.metadata.associatedRecipe.length > 0;
        if (!notebookHasName || !notebookHasAssociatedRecipe) {
            return;
        }
        $('iframe#jupyter-iframe')[0].contentWindow.IPython.notebook.save_notebook().then(function() {
            WT1.event("notebook-ipython-save-back-to-recipe");
            DataikuAPI.jupyterNotebooks.saveBackToRecipe($stateParams.projectKey, notebook.name).success(function(data) {
                StateUtils.go.recipe(data.id);
            }).error(setErrorInScope.bind($scope));
        }).catch(setJupyterErrorInScope($scope));
    };

    $scope.createRecipeFromNotebook = function(notebook) {
        if (!notebook || !notebook.name) {
            return;
        }
        var sparkAvailable = !$rootScope.appConfig.communityEdition && $rootScope.appConfig.sparkEnabled && $rootScope.addLicInfo.sparkLicensed;
        var possibleTypes = [];
        switch (notebook.content.metadata.kernelspec.language) {
            case 'python':
                possibleTypes.push({type: 'python', title: 'Python recipe', desc: 'native Python language'});
                if (sparkAvailable) {
                    possibleTypes.push({type: 'pyspark', title: 'PySpark recipe', desc: 'Python language using Spark framework'});
                }
                break;
            case 'scala':
                possibleTypes.push({type: 'spark_scala', title: 'Spark Scala recipe', desc: 'Scala language using Spark framework'});
                break;
            case 'julia':
                possibleTypes.push({type: 'julia', title: 'Julia recipe', desc: 'native Julia language'});
                break;
            case 'R':
                possibleTypes.push({type: 'r', title: 'R recipe', desc: 'native R language'});
                if (sparkAvailable) {
                    possibleTypes.push({type: 'sparkr', title: 'SparkR recipe', desc: 'native R language using Spark framework'});
                }
                break;
            default:
                return setErrorInScope.bind($scope)(new Error('Unknown notebook language: ' + notebook.content.metadata.kernelspec.language));
        }
        if (possibleTypes.length === 1) {
            $scope.showCreateRecipeFromNotebookModal(notebook.name, possibleTypes[0].type, notebook.content.metadata.analyzedDataset);
        } else if (possibleTypes.length >= 2) {
            Dialogs.select($scope, 'Choose recipe type', 'Please select the recipe type to use', possibleTypes, possibleTypes[0]).then(function(selectedType) {
                $scope.showCreateRecipeFromNotebookModal(notebook.name, selectedType.type, notebook.content.metadata.analyzedDataset);
            }).catch(setErrorInScope.bind($scope));
        }
    };

    $scope.forceReloadJupyterNotebook = function() {

        Dialogs.confirm(
            $scope,
            'Force Reload Jupyter kernel',
            '<p>Are you sure you want to force reload this notebook?</p>' +
            '<p>The kernel will be restarted. All current variables and outputs will be lost.</p>'
        ).then(function () {
            const iFrameWindow = $('iframe#jupyter-iframe')[0].contentWindow;
            iFrameWindow.IPython.notebook.save_notebook().then(function () {
                DataikuAPI.jupyterNotebooks.unload(
                    iFrameWindow.IPython.notebook.session.id
                ).success(function(data) {
                    iFrameWindow.location.reload();
                }).error(setErrorInScope.bind($scope));
            }, setJupyterErrorInScope($scope));
        });
    }

    $scope.copySnippetToClipboard_ = function(variation) {
    	var stringToPutIntoClippboard = variation.code;
    	//ugly but necessary
    	var textArea = document.createElement("textarea");
    	textArea.style.position = 'absolute';
    	textArea.style.top = '-1000px';
    	textArea.style.left = '-1000px';
    	textArea.value = stringToPutIntoClippboard;
    	document.body.appendChild(textArea);
    	textArea.select();
    	try {
		    var successful = document.execCommand('copy');
		    if (successful) {
		    	ActivityIndicator.success("Sample copied into cliboard");
		    } else {
		    	ActivityIndicator.error("Your browser does not support automatic copying into clibboard");
		    }
    	} catch (err) {
    		ActivityIndicator.error("Your browser does not support automatic copying into clibboard");
    	}
    	document.body.removeChild(textArea);
    };

    $scope.uiState = { codeSamplesSelectorVisible: false} ;

    window.openExportModalFromIPython = function(exportName, exportStartedCallback) {
        var features = {
                advancedSampling : false,
                partitionListLoader : null,
                isDownloadable : true
        };
        var dialog = {
                  title : 'Export from Jupyter',
                  warn : null
        };
        CreateExportModal($scope,dialog,features).then(function(params) {
            params.filenameBase = exportName;
            params.contextProjectKey = $stateParams.projectKey;
            DataikuAPI.exports.create(exportName, params).success(function(data){
                exportStartedCallback(data);
                ExportUtils.defaultHandleExportResult($scope, params, data);
            }).error(setErrorInScope.bind($scope));
        });
    };
});

app.controller("jupyterNotebookPageRightColumnActions", async function($controller, $scope, $rootScope, $stateParams, ActiveProjectKey, DataikuAPI, NotebooksUtils, DKUtils) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});
    $controller('PublishIPythonController', {$scope:$scope});

    $scope.notebook = (await DataikuAPI.jupyterNotebooks.getNotebook(ActiveProjectKey.get(), $stateParams.notebookId, $stateParams.kernel_name)).data;

    $scope.notebook.id = $scope.notebook.name;
    $scope.notebook.nodeType = 'JUPYTER_NOTEBOOK';
    $scope.notebook.interest = {};

    $scope.selection = {
        selectedObject : $scope.notebook,
        confirmedItem : $scope.notebook
    };

    function updateUserInterests() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "JUPYTER_NOTEBOOK", ActiveProjectKey.get(), $scope.selection.selectedObject.id)
            .success(function(data) {
                $scope.selection.selectedObject.interest = data;
            }).error(setErrorInScope.bind($scope));
    }

    function refreshPage() {
        DKUtils.reloadState();
    }
    updateUserInterests();
    const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);

    $scope.pushNotebooksToRemote = NotebooksUtils.pushNotebooksToRemote($scope);
    $scope.pullNotebooksFromRemote = NotebooksUtils.pullNotebooksFromRemote($scope);
    $scope.editNotebookReference = NotebooksUtils.editNotebookReference($scope)(refreshPage);
    $scope.unlinkNotebookReference = NotebooksUtils.unlinkNotebookReference($scope)(refreshPage);

    $scope.$on("$destroy", interestsListener);
});


app.directive('jupyterNotebookRightColumnSummary', function(DataikuAPI, $stateParams, QuickView, NotebooksUtils, $controller, ActiveProjectKey, ActivityIndicator){
    return {
        templateUrl :'/templates/notebooks/jupyter-notebook-right-column-summary.html',

        link : function($scope, element, attrs) {

        	$controller('PublishIPythonController', {$scope: $scope});
        	$controller('_TaggableObjectsMassActions', {$scope: $scope});
        	$controller('_TaggableObjectsCapabilities', { $scope: $scope});

            $scope.QuickView = QuickView;

            /* Auto save tags when they are modified */
            $scope.$on("objectSummaryEdited", function(){
                const tor = {type: 'JUPYTER_NOTEBOOK', projectKey: $stateParams.projectKey, id: $scope.notebookData.notebook.name};
                DataikuAPI.taggableObjects.getMetadata(tor).success(function(metadata) {
                    metadata.tags = angular.copy($scope.notebookData.notebook.tags);
                    DataikuAPI.taggableObjects.setMetaData(tor, metadata).success(function() {
                        ActivityIndicator.success("Saved");
                    }).error(setErrorInScope.bind($scope));
                }).error(setErrorInScope.bind($scope));
            });

            $scope.refreshTimeline = function(){
                var obj = $scope.selection.selectedObject;
                if (!obj) return;
                var pkey = obj.projectKey || ActiveProjectKey.get();
                var name = obj.id || obj.name;
                DataikuAPI.timelines.getForObject(pkey, "JUPYTER_NOTEBOOK", name)
                    .success(function(data){
                        if (!obj || obj.projectKey != pkey || obj.name != name) {
                            return; // too late!
                        }
                        $scope.objectTimeline = data;
                        if ($scope.notebookData) {
                            $scope.notebookData.timeline = data;
                            $scope.notebookData.versioning = Object.assign({}, data, {createdBy: null, createdOn: null});
                        }
                    })
                    .error(setErrorInScope.bind($scope));
            };

            $scope.getMetaData = function(){
                $scope.insight = $scope.selection.selectedObject;

                DataikuAPI.analysis.getSummary($scope.selection.selectedObject.projectKey, $scope.selection.selectedObject.id).success(function(data) {
                    $scope.objectFullInfo = data;
                    $scope.analysis = data.object;
                    const d = $scope.analysis;
                    $rootScope.$broadcast('objectMetaDataRefresh', { tags: d.tags, shortDesc: d.shortDesc, description: d.description});
                });
            };

            $scope.$watch("selection.selectedObject", function(nv, ov) {
                if (!nv) return;
                $scope.notebookData = {
                    notebook: $scope.selection.selectedObject,
                    timeline: $scope.objectTimeline,
                    versioning: Object.assign({}, $scope.objectTimeline, {createdBy: null, createdOn: null})
                };
                if($scope.selection.confirmedItem != $scope.selection.selectedObject) {
                    $scope.objectTimeline = null;
                }
            });

            $scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) return;
                $scope.refreshTimeline();
            });

            $scope.getNotebookIcon = function(item) {
                return NotebooksUtils.getNotebookIcon(item);
            };
        }
    }
});

}());
