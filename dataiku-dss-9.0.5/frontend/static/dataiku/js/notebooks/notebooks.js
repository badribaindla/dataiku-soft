(function() {
'use strict';

var app = angular.module('dataiku.notebooks', ['dataiku.services', 'dataiku.filters', 'dataiku.controllers']);

app.controller('NotebooksCommons', ($scope) => {
    $scope.getCodeEnvHint = item => {
        if (item.type === 'JUPYTER' ) {
            if (item.displayKernelSpec && item.displayKernelSpec.envName) {
                return ' in ' + item.displayKernelSpec.envName;
            } else {
                return ' in builtin env'
            }
        } else {
            return null;
        }
    };
    $scope.getContainerHint = item => {
        if (item.type === 'JUPYTER' && item.displayKernelSpec) {
            if (item.displayKernelSpec.containerConf) {
                return ' in ' + item.displayKernelSpec.containerConf;
            } else if (item.displayKernelSpec.remoteKernelType === 'DATABRICKS') {
                return ' via Databricks';
            } else if (item.displayKernelSpec.remoteKernelType === 'LIVY') {
                return ' via Livy';
            }
        }
        return null;
    };
});

app.controller('NotebooksController', function($scope, $rootScope, $stateParams, $state, $controller, TaggableObjectsUtils,
               DataikuAPI, CreateModalFromTemplate, TaggableObjectsService, TaggingService, Dialogs, TopNav, DatasetUtils, NotebooksUtils, FutureProgressModal) {

    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});
    $controller('NotebooksCommons', { $scope: $scope });

    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'notebooks', TopNav.TABS_NONE, null);
    TopNav.setNoItem();

    $scope.projectKey = $stateParams.projectKey

    $scope.sortBy = [
        { value: 'name', label: 'Name' },
        { value: 'type', label: 'Type' },
        { value: '-lastModifiedOn', label: 'Last modified'},
        { value: 'niceConnection', label: 'SQL connection'}
    ];
    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
            tags: [],
            interest: {
                starred: '',
            },
            analyzedDataset: [],
            gitReference: ''
        },
        filterParams: {
            userQueryTargets: ["name","type","language","connection","tags"],
            propertyRules: {tag: "tags",conn:"connection",lang:"language"},
            exactMatch: ['analyzedDataset']
        },
        orderQuery: "-lastModifiedOn",
        orderReversed: false,
    }, $scope.selection || {});
    $scope.sortCookieKey = 'notebooks';
    $scope.maxItems = 20;

    if ($stateParams.datasetId) {
        $scope.selection.filterQuery.analyzedDataset.push($stateParams.datasetId);
    }

    DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success(data => {
    	// Move the usable flag where it's going to be read
        data.forEach(x => {
            x.usable = x.usableAsInput;
            x.usableReason = x.inputReason;
        });
        $scope.availableDatasets = data;
    }).error(setErrorInScope.bind($scope));

    $scope.getNotebookIcon = function(item) {
    	return NotebooksUtils.getNotebookIcon(item);
    };

    $scope.list = function() {
        $scope.uiState = {activeTab : "actions"};
    	DataikuAPI.sqlNotebooks.listHeads($stateParams.projectKey, $rootScope.tagFilter).success(function(sqlNotebooks) {
            sqlNotebooks.items.forEach(function(sqln) {
                var parsedConnection = NotebooksUtils.parseConnection(sqln.connection);
                sqln.type = parsedConnection.type;
                sqln.niceConnection = parsedConnection.niceConnection;
            });
            $scope.listItems = sqlNotebooks.items;

            if ($scope.mayCreateActiveWebContent()) { // Only list jupyter notebooks if user has rights to create web content
                DataikuAPI.jupyterNotebooks.listHeads($stateParams.projectKey, $rootScope.tagFilter).success(function(jupyterNotebooks) {
                    //TODO @notebooks move to backend
                    jupyterNotebooks.items.forEach(function(ipn) {
                        ipn.type = "JUPYTER";
                        ipn.id = ipn.name;
                    });

                    $scope.listItems = sqlNotebooks.items.concat(jupyterNotebooks.items);
                    $scope.restoreOriginalSelection();

                }).error(setErrorInScope.bind($scope));
            } else {
                $scope.restoreOriginalSelection();
            }
            //since we cannot get notebook taggable type from angular state in taggable_objects.js, set it here to use in tag filter
            if (!$scope.listItemType && $scope.listItems.length) $scope.listItemType = TaggableObjectsUtils.taggableTypeFromAngularState($scope.listItems[0]);
        }).error(setErrorInScope.bind($scope));
    };
    $scope.list();

    /* Tags handling */

    $scope.$on('selectedIndex', function(e, index){
        // an index has been selected, we unselect the multiselect
        $scope.$broadcast('clearMultiSelect');
    });

    /* Specific actions */
    $scope.goToItem = function(notebook) {
        if (notebook.type == "JUPYTER") {
            $state.transitionTo('projects.project.notebooks.jupyter_notebook', {projectKey: $scope.projectKey, notebookId:notebook.name})
        } else {
            $state.transitionTo('projects.project.notebooks.sql_notebook', {projectKey: $scope.projectKey, notebookId:notebook.id})
        }
    };

    $scope.newNotebook = function() {
        CreateModalFromTemplate("/templates/notebooks/new-notebook-modal.html", $scope);
    };

    $scope.newNotebookFromFile = function() {
        CreateModalFromTemplate("/templates/notebooks/new-notebook-from-file-modal.html", $scope);
    };

    $scope.newNotebookFromGit = function() {
        CreateModalFromTemplate("/templates/notebooks/new-notebook-from-git-modal.html", $rootScope, null, newScope => {
            newScope.gitRef = {
            };

            newScope.isItemSelectable = item => {
                return item && item.nbFormat >= 4;
            }

            newScope.listNotebooks = () => {
                DataikuAPI.jupyterNotebooks.git.listRemoteNotebooks(newScope.gitRef.repository, newScope.gitRef.ref)
                .success(data => {
                    FutureProgressModal.show(newScope, data, "List remote notebooks").then(notebooks => {
                        if (notebooks) {
                            newScope.remoteNotebooks = notebooks
                                .filter(notebook => {
                                    if(notebook.language === 'R' || notebook.language === 'ir') {
                                        return $rootScope.appConfig.uiCustomization.showR;
                                    } else if(notebook.language === 'scala' || notebook.language === 'toree') {
                                        return $rootScope.appConfig.uiCustomization.showScala;
                                    } else if(notebook.language.toLowerCase().startsWith('julia')) {
                                        return $rootScope.featureFlagEnabled('julia');
                                    } else {
                                        return true; // other languages are not hidden
                                    }
                                })
                                .map(notebook => Object.assign({$selected: notebook.nbFormat >= 4, type: "JUPYTER"}, notebook));
                        }
                    });
                }).error(setErrorInScope.bind(newScope));
            }

            newScope.importNotebooks = () => {
                DataikuAPI.jupyterNotebooks.git.importNotebooks($stateParams.projectKey, newScope.gitRef.repository, newScope.gitRef.ref, newScope.selection.selectedObjects).success(data => {
                    const parentScope = newScope.$parent;
                    newScope.dismiss();
                    FutureProgressModal.show(parentScope, data, "Import remote notebooks").then(() => {
                        $scope.list();
                    })
                }).error(setErrorInScope.bind(newScope));
            }
        });
    };

	$scope.unloadJupyterNotebook = function(session_id) {
        Dialogs.confirm($scope, 'Unload Jupyter kernel', 'Are you sure you want to stop this notebook?').then(function () {
    		DataikuAPI.jupyterNotebooks.unload(session_id).success(function(data) {
    			$scope.list();
    		}).error(setErrorInScope.bind($scope));
        });
	};

    $scope.startApplyTagging = function() {
        var items =  $scope.selection.selectedObjects.map(function(item) {
            return {
                id : getNotebookId(item),
                displayName: item.name,
                type: getTaggableType(item),
                projectKey: $stateParams.projectKey
            };
        });
        TaggingService.startApplyTagging(items).then($scope.list, setErrorInScope.bind($scope));
    };

    $scope.duplicateNotebook = function(notebook) {
        DataikuAPI.sqlNotebooks.copy($stateParams.projectKey, notebook.id, notebook.name+'_copy').success(function(data) {
            $state.transitionTo("projects.project.notebooks.sql_notebook", {projectKey: $stateParams.projectKey, notebookId: data.id});
        }).error(setErrorInScope.bind($scope));
    };

    function getTaggableType(item) {
        return item.type == 'JUPYTER' ? 'JUPYTER_NOTEBOOK' : 'SQL_NOTEBOOK';
    }

    function getNotebookId(item) {
        return item.type == 'JUPYTER' ? item.name : item.id;
    }

    // Not the generic handling for all other types since we have two taggable types on that page
    $scope.deleteSelected = function() {
        var deletionRequests;
        if($scope.selection.single) {
            var item = $scope.selection.selectedObject;
            deletionRequests = [{
                type: getTaggableType(item),
                projectKey: $stateParams.projectKey,
                id: item.id,
                displayName: item.name,
                activeSessions: item.activeSessions //TODO @flow hack, remove
            }];
        } else {
            deletionRequests = $scope.selection.selectedObjects.map(function(item){
                return {
                    type: getTaggableType(item),
                    projectKey: $stateParams.projectKey,
                    id: item.id,
                    displayName: item.name,
                    activeSessions: item.activeSessions //TODO @flow hack, remove
                };
            });
        }

        TaggableObjectsService.delete(deletionRequests)
            .then($scope.list, setErrorInScope.bind($scope));
    };

    $scope.allRemoteNotebooks = selectedObjects => {
        return selectedObjects.every(obj => obj.gitReference && obj.type == 'JUPYTER');
    }

    $scope.pushNotebooksToRemote = NotebooksUtils.pushNotebooksToRemote($scope);
    $scope.pullNotebooksFromRemote = NotebooksUtils.pullNotebooksFromRemote($scope);
    $scope.editNotebookReference = NotebooksUtils.editNotebookReference($scope)($scope.list);
    $scope.unlinkNotebookReference = NotebooksUtils.unlinkNotebookReference($scope)($scope.list);
    $scope.hasRemoteNotebooks = list => list.some(o => o.gitReference && o.type == 'JUPYTER');
});


app.controller('NewNotebookModalController', function($scope, $rootScope, $stateParams, DataikuAPI, WT1, $state, DatasetUtils, GlobalProjectActions, NotebooksUtils) {
    // choose-type, sql, hive, spark, impala, python, r, scala, customjupyter
    $scope.uiState = {
        step : "choose-type"
    }

    function getSQLNotebookType(step) {
        return ['hive', 'impala'].includes(step) ? step + '-jdbc' : step;
    }

    function createSQLNotebookWithoutDataset() {
        DataikuAPI.sqlNotebooks.create($scope.newNotebook.projectKey, $scope.newNotebook.connection, $scope.newNotebook.name).success(data => {
            WT1.event('notebook-sql-create', {
                notebookId : data.id,
                type: getSQLNotebookType($scope.uiState.step),
                withDataset: false
            });
            $scope.dismiss();
            $state.transitionTo("projects.project.notebooks.sql_notebook", { projectKey: $scope.newNotebook.projectKey, notebookId : data.id });
        }).error(setErrorInScope.bind($scope));
    }

    function createSQLNotebookWithDataset() {
        const type = getSQLNotebookType($scope.uiState.step);
        DataikuAPI.sqlNotebooks.createForDataset($stateParams.projectKey, $scope.datasetSmartName, type, $scope.newNotebook.name)
            .success(data => {
                WT1.event('notebook-sql-create', {
                    notebookId : data.id,
                    type: type,
                    withDataset: true
                });
                $state.go("projects.project.notebooks.sql_notebook", { projectKey : $stateParams.projectKey, notebookId: data.id });
                $scope.dismiss();
            }).error(setErrorInScope.bind($scope));
    }

    function createJupyterNotebookWithoutDataset() {
        DataikuAPI.jupyterNotebooks.newNotebookWithTemplate($stateParams.projectKey,
            $scope.newNotebook.name,
            $scope.newNotebook.template, $scope.newNotebook.codeEnv, $scope.newNotebook.containerConf).success(data => {

            WT1.event('notebook-jupyter-create', {
                notebookId : data.name,
                language: $scope.newNotebook.template.language,
                template : $scope.newNotebook.template.id,
                withDataset: false,
                useCodeEnv: !!data.displayKernelSpec.name
            });

            $scope.dismiss();
            $state.transitionTo("projects.project.notebooks.jupyter_notebook", { projectKey : $stateParams.projectKey, notebookId : data.name })
        }).error(setErrorInScope.bind($scope));
    }

    function createJupyterNotebookWithDataset() {
        DataikuAPI.jupyterNotebooks.newNotebookForDataset($stateParams.projectKey,
            $scope.newNotebook.name,
            $scope.datasetSmartName, $scope.newNotebook.template, $scope.newNotebook.codeEnv, $scope.newNotebook.containerConf)
            .success(data => {
                WT1.event('notebook-jupyter-create', {
                    language: data.language,
                    template : $scope.newNotebook.template.id,
                    withDataset: true,
                    useCodeEnv: !!data.displayKernelSpec.name
                });
                $state.go('projects.project.notebooks.jupyter_notebook', { notebookId: data.name });
                $scope.dismiss();
            }).error(setErrorInScope.bind($scope));
    }

    function createNotebookWithDataset() {
        if (NotebooksUtils.sqlNotebooksTypes.includes($scope.uiState.step)) {
            createSQLNotebookWithDataset();
        } else {
            createJupyterNotebookWithDataset();
        }
    }

    function installSQLFunctions() {
        let autoNotebookName = 'New notebook';
        let userModifiedName = false;
        $scope.connections = [];

        $scope.newNotebook = {
            projectKey: $stateParams.projectKey,
            name: autoNotebookName
        };

        $scope.$watch("newNotebook.name", (nv) => {
            if (nv != null && nv != autoNotebookName) {
                userModifiedName = true;
            }
        });

        //  When creating a sql notebook from a dataset (if datasetSmartName), the connection is automatically chosen by the backend so we do not fetch the list.
        if (!$scope.datasetSmartName) {
            DataikuAPI.sqlNotebooks.listConnections($stateParams.projectKey).success(data => {
                $scope.connections = data.nconns;
                $scope.hiveError = data.hiveError;
            }).error(setErrorInScope.bind($scope));

            $scope.$watch("newNotebook.connection", (nv) => {
                if (!userModifiedName) {
                    for(var k in $scope.connections) {
                        var conn = $scope.connections[k];
                        if (conn.name == nv) {
                            autoNotebookName = $scope.appConfig.login + "'s notebook on " + conn.label;
                            $scope.newNotebook.name = autoNotebookName;
                        }
                    }
                }
            });
        } else {
            $scope.newNotebook.name = `${$scope.appConfig.login}'s sql notebook on ${$scope.datasetSmartName}`;
        }

        $scope.createAndRedirect = function() {
            if ($scope.datasetSmartName) {
                createNotebookWithDataset();
            } else {
                createSQLNotebookWithoutDataset();
            }
        };
    }

    const NICE_TYPES = {r: "R", python: "Python", scala: "Scala (Spark)", julia: "Julia"};

    function installJupyterStd(type) {
        let userModifiedName = false;
        const niceType = NICE_TYPES[type] || type;
        const autoNotebookName = $scope.appConfig.user.login.replace(/\.+/g, ' ') + "'s " + niceType + " notebook";

        $scope.newNotebook = {
            name : autoNotebookName,
            language: type,
            containerConf: ''
        };

        $scope.$watch("newNotebook.name", nv => {
            if (nv != null && nv != autoNotebookName) {
                userModifiedName = true;
            }
        });

        if ($scope.datasetSmartName) {
            $scope.newNotebook.name += ' on ' + $scope.datasetSmartName;
        }

        DataikuAPI.notebooks.listTemplates($scope.datasetSmartName ? 'DATASET' : 'STANDALONE', type).success(data => {
            $scope.availableTemplates = data.templates;
            $scope.newNotebook.template = $scope.availableTemplates[0];
        }).error(setErrorInScope.bind($scope));

        $scope.$watch("newNotebook", function(nv, ov) {
            if (!nv) return;
            if ($scope.availableCodeEnvs == null) {
            	if (nv.language == "python" || nv.language == "r" || nv.language == "julia") {
                    $scope.availableCodeEnvs = []; // so that you only do the call once
                    DataikuAPI.codeenvs.listNamesWithDefault(nv.language.toUpperCase(), $stateParams.projectKey).success(function(data){
                        $scope.availableCodeEnvs =
                            [["__BUILTIN__", "Default builtin env"]].concat(data.envs.map(function(ce){
                                return [ce.envName, ce.envName];
                            }))
                        $scope.newNotebook.codeEnv = data.resolvedInheritDefault || "__BUILTIN__";
                    }).error(setErrorInScope.bind($scope));
            	} else {
            		$scope.availableCodeEnvs = [];
                }
            }
            if ($scope.containerConfs == null) {
                if (nv.language == "python" || nv.language == "r" || nv.language == "julia") {
                    $scope.containerConfs = [{id:'', label:"Run locally"}]
                    if ($scope.appConfig.databricksEnabled) {
                        $scope.containerConfs.push({id:'__SPECIAL_DATABRICKS__', label:"Run on Databricks"});
                    }
                    DataikuAPI.containers.listNamesWithDefault($stateParams.projectKey).success(function(data) {
                        data.containerNames.forEach(function(n) { $scope.containerConfs.push({id:n, label:n});});

                        if (data.resolvedInheritValue) {
                            $scope.newNotebook.containerConf = data.resolvedInheritValue;
                        }

                    }).error(setErrorInScope.bind($scope));
            	} else {
            		$scope.containerConfs = []
                }
            }
        }, true);

        $scope.createAndRedirect = function() {
            if ($scope.datasetSmartName) {
                createNotebookWithDataset();
            } else {
                createJupyterNotebookWithoutDataset();
            }
        };
    }

    $scope.$watch("uiState.step", function(nv, ov) {
        switch (nv) {
            case "sql":
            case "impala":
            case "hive":
            case "sparksql":
                installSQLFunctions(nv);
                break;
            case "python":
            case "julia":
            case "r":
            case "scala":
                installJupyterStd(nv);
                break;
        }
    });

    if ($scope.datasetSmartName) {
        DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success(data => {
            // move the usable flag where it's going to be read
            data.forEach(x => {
                x.usable = x.usableAsInput;
                x.usableReason = x.inputReason;
            });
            $scope.availableDatasets = data;
            // set the usable flag here instead of in the UsabilityComputer, like the other places seem to do
            angular.forEach($scope.availableDatasets, x => {
                x.usable = true;
            });
        }).error(setErrorInScope.bind($scope));

        $scope.usability = {};

        const parts = $scope.datasetSmartName.match(/([^\.]+)\.(.+)/) || [$scope.datasetSmartName, $stateParams.projectKey, $scope.datasetSmartName]; // [smart, project, dataset]

        DataikuAPI.datasets.getFullInfo($stateParams.projectKey, parts[1], parts[2])
            .success(data => {
                var hasSql = false;

                // Check which languages are available
                ['sql', 'hive', 'impala', 'pig', 'sql99'].forEach(thing => {
                    $scope.usability[thing] = GlobalProjectActions.specialThingMaybePossibleFromDataset(data.dataset, thing);
                    hasSql = hasSql || $scope.usability[thing].ok;
                });

                $scope.usability.spark = { ok: true };

                if (!$rootScope.appConfig.sparkEnabled) {
                    if (!$rootScope.addLicInfo.sparkLicensed) {
                        $scope.usability.spark.ok = false;
                        $scope.usability.spark.reason = 'Spark is not licensed';
                    } else {
                        $scope.usability.spark.ok = false;
                        $scope.usability.spark.reason = 'Spark is not configured';
                    }
                }
            }).error(setErrorInScope.bind($scope));
    }

    $scope.canUseLanguage = function(language) {
        if (!$scope.usability || !$scope.usability[language]) {
            return true;
        } else {
            return $scope.usability[language].ok;
        }
    }

    $scope.getDisabledReason = function(language) {
        if (!$scope.usability || !$scope.usability[language] || !$scope.usability[language].reason) {
            return;
        } else {
            return $scope.usability[language].reason.iconDisabledReason;
        }

    }
});

app.controller('NewNotebookFromTemplateModalController', function($scope, $rootScope, $state, $stateParams, DataikuAPI, WT1) {

    let templatedTemplateDeregister = null;

    $scope.newTemplatedNotebook = {};

    let templatedBaseName = $rootScope.appConfig.login + "'s "
        + "analysis of " + $scope.datasetSmartName;

    $scope.newTemplatedNotebook.baseName = templatedBaseName.replace(/\.+/g, ' ');

    DataikuAPI.notebooks.listTemplates("DATASET", "pre-built").success(data => {
        $scope.newTemplatedNotebook.availableTemplates = data.templates;
        $scope.newTemplatedNotebook.template = $scope.newTemplatedNotebook.availableTemplates[0];
    }).error(setErrorInScope.bind($scope));

    if (templatedTemplateDeregister != null) {
        templatedTemplateDeregister();
    }

    if ($scope.containerConfs == null) {
        $scope.containerConfs = [{id:'', label:"Run locally"}]
        DataikuAPI.containers.listNamesWithDefault($stateParams.projectKey).success(data => {
            data.containerNames.forEach(n => { $scope.containerConfs.push({ id: n, label: n }); });
        }).error(setErrorInScope.bind($scope));
    }

    templatedTemplateDeregister = $scope.$watch('newTemplatedNotebook.template', () => {
        if ($scope.newTemplatedNotebook.template != null) { // something was selected
            if (templatedBaseName == $scope.newTemplatedNotebook.baseName) { // name was not modified by user (yet)
                templatedBaseName = ($scope.newTemplatedNotebook.template.title || $scope.newTemplatedNotebook.template.label) + " on "  + $scope.datasetSmartName + " (" + $rootScope.appConfig.login + ")";
                $scope.newTemplatedNotebook.baseName = templatedBaseName.replace(/\.+/g, ' ');
            }
        }
    });

    $scope.createTemplatedNotebook = () => {
        DataikuAPI.jupyterNotebooks.newNotebookForDataset($stateParams.projectKey,
            $scope.newTemplatedNotebook.baseName,
            $scope.datasetSmartName, $scope.newTemplatedNotebook.template, $scope.newTemplatedNotebook.codeEnv, $scope.newTemplatedNotebook.containerConf)
            .success(data => {
                WT1.event("notebook-jupyter-create", {
                    notebookId : data.name,
                    // Anonymize custom template ids
                    template:
                        $scope.newTemplatedNotebook.template.origin === 'PLUGIN'
                        ? $scope.newTemplatedNotebook.template.id.dkuHashCode()
                        : $scope.newTemplatedNotebook.template.id,
                    withDataset: true,
                    useCodeEnv: !!data.displayKernelSpec.name
                });
                $state.go('projects.project.notebooks.jupyter_notebook', { notebookId: data.name });
                $scope.dismiss();
            }).error(setErrorInScope.bind($scope));
    };
});

app.controller('NewNotebookFromFileModalController', function($scope, $stateParams, DataikuAPI, WT1, $state) {

    $scope.newNotebook = {
        name : $scope.appConfig.user.login.replace(/\.+/g, ' ') + "'s notebook from file"
    };

    function parseNotebook(event) {
        $scope.isParsing = true;
        $scope.$apply();
        // Adding a timeout only for User Experience to display a loader while parsing! It requires using apply for quick refresh.
        window.setTimeout(() => {
            try {
                let fileContent;
                fileContent = JSON.parse(event.target.result);

                $scope.isParsing = false;
                $scope.hasParsingFailed = false;

                const parsedLanguage = fileContent.metadata.kernelspec.language;

                if (parsedLanguage) {
                    $scope.newNotebook.language = parsedLanguage.toLowerCase();
                    $scope.isLanguageSupported = !(['python', 'r', 'scala'].includes($scope.newNotebook.language));
                } else {
                    $scope.hasParsingFailed = true;
                }
                $scope.$apply();
            } catch (exception) {
                $scope.hasParsingFailed = true;
                $scope.isParsing = false;
                $scope.$apply();
            }
        }, 1000);
    }

    $scope.uploadAndRedirect = function() {
        DataikuAPI.jupyterNotebooks.newNotebookFromFile($stateParams.projectKey,
            $scope.newNotebook.name,
            $scope.newNotebook.language,
            $scope.datasetSmartName,
            $scope.newNotebook.file)
                .then(data => {
                    data = JSON.parse(data);

                    WT1.event('notebook-jupyter-upload', {
                        notebookId : data.name,
                        language: $scope.newNotebook.language,
                        withDataset: !!$scope.datasetSmartName
                    });

                    $scope.dismiss();
                    $state.transitionTo('projects.project.notebooks.jupyter_notebook', { projectKey : $stateParams.projectKey, notebookId : data.name })

                }, (error) => {
                    setErrorInScope2.call($scope, error);
                });
    };

    $scope.$watch("newNotebook.file", function(newValue) {
        $scope.newNotebook.language = null;
        $scope.isLanguageSupported = false;
        $scope.hasParsingFailed = false;

        if (newValue) {
            const reader = new FileReader();
            reader.onload = parseNotebook;
            reader.readAsText(newValue);
            $scope.newNotebook.name = newValue.name.replace('.ipynb', '');
        }
    });
});

app.controller('NotebookGitPushWithConflictModalController', function($scope, $stateParams, DataikuAPI, FutureProgressModal, Dialogs, DKUtils) {
    $scope.hasNoNotebooksSelectedForPush = () => {
        return !$scope.notebookConflictStatus.conflictingNotebooks.some(notebook => notebook.selected)
            && !$scope.notebookConflictStatus.nonConflictingNotebooks.some(notebook => notebook.selected)
            && !$scope.notebookConflictStatus.noLongerOnRemoteNotebooks.some(notebook => notebook.selected);
    }

    // User have chosen notebooks, push force them.
     $scope.forcePushNotebooks = () => {
        const nonConflictingNotebooks = $scope.notebookConflictStatus.nonConflictingNotebooks;
        const conflictingNotebooks =  $scope.notebookConflictStatus.conflictingNotebooks.filter(notebook => notebook.selected);
        const noLongerOnRemoteNotebooks =  $scope.notebookConflictStatus.noLongerOnRemoteNotebooks.filter(notebook => notebook.selected);

        if (!$scope.commitMessage.title) {
            $scope.commitMessage.title = $scope.getDefaultCommmitMessage();
        }
        let commitMessage = $scope.commitMessage.title;
        if ($scope.commitMessage.content && $scope.commitMessage.title) {
            commitMessage = `${$scope.commitMessage.title}\n${$scope.commitMessage.content}`;
        }
        DataikuAPI.jupyterNotebooks.git.pushNotebooksToGit($stateParams.projectKey,
            [...nonConflictingNotebooks, ...conflictingNotebooks, ...noLongerOnRemoteNotebooks],
            commitMessage)
        .success(data => {
            const scope = $scope.$parent;
            $scope.dismiss();
            FutureProgressModal.show(scope, data, "Push notebooks to remote").then(pushReports => {
                if (pushReports) {
                    Dialogs.infoMessagesDisplayOnly(scope, "Report", pushReports, pushReports.futureLog).then(() => {
                        if ($stateParams && $stateParams.notebookId) {
                            DKUtils.reloadState();
                        }
                    })
                }
            });
        }).error(setErrorInScope.bind($scope));
    }
});

app.controller('NotebookGitPullWithConflictModalController', function($scope, $stateParams, DataikuAPI, FutureProgressModal, DKUtils, Dialogs) {
    $scope.hasNoNotebooksSelectedForPull = () => {
        return !$scope.notebookConflictStatus.conflictingNotebooks.some(notebook => notebook.selected)
            && !$scope.notebookConflictStatus.nonConflictingNotebooks.some(notebook => notebook.selected);
    }

    // User have chosen notebooks, push force them.
     $scope.forcePullNotebooks = () => {
        const nonConflictingNotebookIds = $scope.notebookConflictStatus.nonConflictingNotebooks.map(notebook => notebook.notebookName);
        const conflictingNotebookIds =  $scope.notebookConflictStatus.conflictingNotebooks.filter(notebook => notebook.selected).map(notebook => notebook.notebookName);

        DataikuAPI.jupyterNotebooks.git.pullNotebooks($stateParams.projectKey, [...nonConflictingNotebookIds, ...conflictingNotebookIds])
        .success(data => {
            const scope = $scope.$parent;
            $scope.dismiss();
            FutureProgressModal.show(scope, data, "Pull notebooks from remote").then(pullReports => {
                if (pullReports) {
                    Dialogs.infoMessagesDisplayOnly(scope, "Report", pullReports, pullReports.futureLog).then(() => {
                        if ($stateParams && $stateParams.notebookId) {
                            DKUtils.reloadState();
                        }
                    })
                }
            });
        }).error(setErrorInScope.bind($scope));
    }
});

app.directive('notebookConflictHit', function() {
    return {
        scope: {
          notebook: '=',
          noSelection: '=?' // When we are not enabling the selection, reduce the margin-left to 36px to have a better style
        },
        template: `
        <div class="hit h100">
            <div class="illustration">
                <span ng-if="notebook.language && notebook.language.startsWith('python')">
                    <i class="icon-code_python_recipe universe-color notebook"></i>
                </span>
                <span ng-if="notebook.language=='ir' || notebook.language=='R'">
                    <i class="icon-code_r_recipe universe-color notebook"></i>
                </span>
                <span ng-if="notebook.language.startsWith('julia')">
                    <i class="icon-code_julia_recipe universe-color notebook"></i>
                </span>
                <span ng-if="notebook.language=='toree' || notebook.language=='scala'">
                    <i class="icon-code_spark_scala_recipe universe-color notebook"></i>
                </span>
            </div>
            <div class="h100 hitContent" ng-class="{'hitContent__no-selection': noSelection}">
                <i class="icon-info-sign text-prompt" style="float: right; margin-top: 10px;" toggle="tooltip" container="body" title="Name on the remote Git: {{notebook.remoteNotebookName}}" />
                <div class="hit-content-main">
                    <p class="hit-content-main__title">{{notebook.notebookName}}</p>
                    <p class="hit-content-main__subtitle">
                        {{notebook.gitUrl}} - {{notebook.gitBranch}}
                    </p>
                </div>
            </div>
        </div>`
    };
});

app.service('NotebooksUtils', function(CreateModalFromTemplate, DataikuAPI, DKUtils, $stateParams, $rootScope, FutureProgressModal) {
    var svc = {
        parseConnection: function(connection) {
            var virtualPattern = /^@virtual\((.+)\):(connection:)?(.+)$/;
            var parsed = virtualPattern.exec(connection);
            var niceConnection = connection;
            var type = "SQL";
            if(parsed) {
                if(parsed[1].indexOf('impala')>=0) {
                    niceConnection = parsed[3] + ' (Impala)';
                    type = "IMPALA";
                } else if(parsed[1].indexOf('hive')>=0) {
                    niceConnection = parsed[3] + ' (Hive)';
                    type = "HIVE";
                } else {
                    niceConnection = parsed[3] + ' (SparkSQL)';
                    type = "SPARKSQL";
                }
            }
            return {type: type, niceConnection:niceConnection};
        },

        getNotebookIcon: function(item) {
            const lowerCaseLanguage = item.language.toLowerCase();
            const nbType = item.notebookType || item.type || item.language;
            if (lowerCaseLanguage=='python2' || lowerCaseLanguage=='python3' || lowerCaseLanguage=='python') {return 'icon-code_python_recipe';}
            else if (lowerCaseLanguage=='ir' || lowerCaseLanguage=='r') {return 'icon-code_r_recipe';}
            else if (lowerCaseLanguage.startsWith('julia')) {return 'icon-code_julia_recipe';}
            else if (lowerCaseLanguage=='toree' || lowerCaseLanguage=='scala') {return 'icon-code_spark_scala_recipe';}
            else if (nbType == 'SQL') {return 'icon-code_sql_recipe';}
            else if (nbType == 'HIVE') {return 'icon-code_hive_recipe';}
            else if (nbType == 'IMPALA') {return 'icon-code_impala_recipe';}
            else if (nbType == 'SPARKSQL') {return 'icon-code_sparksql_recipe';}
            else {return 'icon-dku-nav_notebook'}
        },

        pushNotebooksToRemote: function(scope) {
            return function(selectedNotebooks) {
                // Start by investigating if there is some remote notebooks that have changed
                DataikuAPI.jupyterNotebooks.git.getConflictingNotebooks($stateParams.projectKey, selectedNotebooks.filter(n => n.gitReference).map(n => n.id), false)
                .success(data => {
                    FutureProgressModal.show(scope, data, "Checking conflicts").then(notebookConflictStatus => {
                        if (notebookConflictStatus) {
                            // We have conflicting remove notebooks, let's pop a modal to ask the user what we do next
                            CreateModalFromTemplate("/templates/notebooks/notebook-git-push-with-conflict-modal.html", scope, "NotebookGitPushWithConflictModalController", newScope => {
                                newScope.notebookConflictStatus = notebookConflictStatus
                                newScope.getDefaultCommmitMessage = () => {
                                    if (notebookConflictStatus.nonConflictingNotebooks.length + notebookConflictStatus.conflictingNotebooks.length === 1) {
                                        return 'Export ' + notebookConflictStatus.nonConflictingNotebooks.concat(notebookConflictStatus.conflictingNotebooks)[0].notebookName;
                                    } else {
                                        return 'Export %filename%';
                                    }
                                }
                                newScope.commitMessage = {
                                    title: "",
                                    content: ""
                                };
                            });
                        }
                    })
                }).error(setErrorInScope.bind(scope));
            };
        },
        pullNotebooksFromRemote: function(scope) {
            return function(selectedNotebooks) {
                DataikuAPI.jupyterNotebooks.git.getConflictingNotebooks($stateParams.projectKey, selectedNotebooks.filter(n => n.gitReference).map(n => n.id), true)
                .success(data => {
                    FutureProgressModal.show(scope, data, "Checking conflicts").then(notebookConflictStatus => {
                        if (notebookConflictStatus) {
                            // We have conflicting remove notebooks, let's pop a modal to ask the user what we do next
                            CreateModalFromTemplate("/templates/notebooks/notebook-git-pull-with-conflict-modal.html", scope, "NotebookGitPullWithConflictModalController", newScope => {
                                newScope.notebookConflictStatus = notebookConflictStatus
                            });
                        }
                    })
                }).error(setErrorInScope.bind(scope));
            };
        },
        editNotebookReference: function(scope) {
            return function(endCallback = () => {}) {
                return function(notebook) {
                    CreateModalFromTemplate("/templates/notebooks/notebook-git-edit-reference-modal.html", scope, null, newScope => {
                        newScope.isEditMode = notebook.gitReference !== undefined;
                        newScope.notebook = notebook;
                        newScope.gitRef = Object.assign({}, notebook.gitReference);
                        if (!newScope.gitRef.remotePath) {
                            newScope.gitRef.remotePath = notebook.name + ".ipynb";
                        }
                        newScope.save = () => {
                            DataikuAPI.jupyterNotebooks.git.editReference(notebook.projectKey, notebook.name, newScope.gitRef)
                            .success(() => {
                                endCallback();
                                newScope.dismiss();
                            })
                            .error(setErrorInScope.bind(newScope));
                        }
                    });
                };
            };
        },
        unlinkNotebookReference: function(scope) {
            return function(endCallback = () => {}) {
                return function(notebook) {
                    CreateModalFromTemplate("/templates/notebooks/notebook-git-unlink-reference-modal.html", scope, null, newScope => {
                        // transform into NotebooksPushGitDTO
                        newScope.notebook = {
                            notebookName: notebook.name,
                            remoteNotebookName: notebook.gitReference.remotePath,
                            gitUrl: notebook.gitReference.remote,
                            gitBranch: notebook.gitReference.checkout,
                            language: notebook.language
                        };

                        newScope.unlink = () => {
                            DataikuAPI.jupyterNotebooks.git.unlinkReference(notebook.projectKey, notebook.name)
                            .success(() => {
                                endCallback();
                                newScope.dismiss();
                            })
                            .error(setErrorInScope.bind(newScope));
                        }
                    });
                };
            };
        },

        sqlNotebooksTypes: [
            'sql',
            'impala',
            'hive',
            'sparksql'
        ]
    };
    return svc;
});


})();
