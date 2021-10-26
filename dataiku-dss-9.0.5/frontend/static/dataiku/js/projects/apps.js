(function() {
'use strict';

const app = angular.module('dataiku.controllers');

/*
 * to add new modules to the existing app, some hacking around angular is needed. And
 * this hacking needs to happen in a config block, so that we have access to the
 * providers.
 * see http://benohead.com/angularjs-requirejs-dynamic-loading-and-pluggable-views/ for
 * explanations.
 */
app.config(['$controllerProvider', '$compileProvider', '$filterProvider', '$provide', '$injector',
    function ($controllerProvider, $compileProvider, $filterProvider, $provide, $injector) {
        // only offer one granularity: module (no injecting just a controller, for ex)
        app.registerModule = function (moduleName) {
            var module = angular.module(moduleName);

            if (module.requires) {
                // recurse if needed
                for (var i = 0; i < module.requires.length; i++) {
                    app.registerModule(module.requires[i]);
                }
            }

            var providers = {
                    $controllerProvider: $controllerProvider,
                    $compileProvider: $compileProvider,
                    $filterProvider: $filterProvider,
                    $provide: $provide
                };

            angular.forEach(module._invokeQueue, function(invokeArgs) {
                var provider = providers[invokeArgs[0]];
                provider[invokeArgs[1]].apply(provider, invokeArgs[2]);
            });
            angular.forEach(module._configBlocks, function (fn) {
                $injector.invoke(fn);
            });
            angular.forEach(module._runBlocks, function (fn) {
                $injector.invoke(fn);
            });
        };
    }
]);



app.controller("AppDesignerController", function($scope, $rootScope, $controller, $state, $stateParams, DataikuAPI, Dialogs, TopNav, CreateModalFromTemplate, FutureProgressModal, StateUtils, $filter, ActivityIndicator, $timeout, WT1, CodeMirrorSettingService, StringUtils, PluginsService) {
    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});

    TopNav.setLocation(TopNav.TOP_MORE, "appsdesign", TopNav.TABS_NONE, null);
    TopNav.setNoItem();

    $scope.codeMirrorSettingService = CodeMirrorSettingService;

    $scope.showRemapping = !$rootScope.appConfig.isAutomation;

    $scope.uiState = {tags:{}, instanceTags:{}, toc:{}, useAsRecipe:false};
    
    $scope.tileTypes = [
                            {type:'UPLOAD_DATASET_SET_FILE'},
                            {type:'INLINE_DATASET_EDIT'},
                            {type:'DATASET_EDIT_SETTINGS'},
                            {type:'FILES_BASED_DATASET_BROWSE_AND_PREVIEW'},
                            {type:'CONNECTION_EXPLORER_TO_REPLACE_THE_SETTINGS_OF_A_DATASET_WITH_A_NEW_TABLE_REFERENCE'},
                            {type:'MANAGED_FOLDER_ADD_FILE'},
                            {type:'MANAGED_FOLDER_BROWSE'},
                            {type:'STREAMING_ENDPOINT_EDIT_SETTINGS'},
                            {type:'PROJECT_VARIABLES_EDIT'},
                            {divider:true},
                            {type:'SCENARIO_RUN'},
                            //{type:'GUESS_TRAIN_DEPLOY'},
                            {type:'PERFORM_SCHEMA_PROPAGATION'},
                            {divider:true},
                            {type:'DASHBOARD_LINK'},
                            {type:'MANAGED_FOLDER_LINK'},
                            {type:'DOWNLOAD_DATASET'},
                            {type:'DOWNLOAD_RMARKDOWN'},
                            {type:'DOWNLOAD_MANAGED_FOLDER_FILE'},
                            {type:'DOWNLOAD_DASHBOARD_EXPORT'},
                            {type:'VARIABLE_DISPLAY'}
                        ];
    if (!$rootScope.appConfig.streamingEnabled) {
        $scope.tileTypes = $scope.tileTypes.filter(t => t.type != 'STREAMING_ENDPOINT_EDIT_SETTINGS');
    }
    
    $scope.availableConnections = [];
    DataikuAPI.connections.getTypeAndNames("all").success(function(data) {
         $scope.availableConnections = data;
    }).error(setErrorInScope.bind($scope));
    
    $scope.usedConnections = [];
    DataikuAPI.connections.listUsages($stateParams.projectKey).success(function(data) {
        $scope.usedConnections = data.map(c => c.name);
    }).error(setErrorInScope.bind($scope));

    $scope.availableCodeEnvs = [{envLang:'PYTHON', envName:'Builtin', builtin:true}, {envLang:'R', envName:'Builtin', builtin:true}];
    DataikuAPI.codeenvs.listNames('PYTHON').success(function(data) {
        data.forEach(function(n) {
            $scope.availableCodeEnvs.push({envLang:'PYTHON', envName:n, builtin:false});
        });
    }).error(setErrorInScope.bind($scope));
    DataikuAPI.codeenvs.listNames('R').success(function(data) {
        data.forEach(function(n) {
            $scope.availableCodeEnvs.push({envLang:'R', envName:n, builtin:false});
        });
    }).error(setErrorInScope.bind($scope));
    
    $scope.usedCodeEnvs = [];
    DataikuAPI.codeenvs.listUsages($stateParams.projectKey).success(function(data) {
        $scope.usedCodeEnvs = data.map(c => c.envName);
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.datasets.listHeaders($stateParams.projectKey).success(function(data) {
        $scope.allDatasets = data;
    }).error(setErrorInScope.bind($scope));
    
    DataikuAPI.managedfolder.list($stateParams.projectKey).success(function(data) {
        $scope.allManagedFolders = data;
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.savedmodels.list($stateParams.projectKey).success(function(data) {
        $scope.allSavedModels = data;
    }).error(setErrorInScope.bind($scope));

    $scope.origAppManifest = null;
    $scope.getAppManifest = function() {
        DataikuAPI.projects.getAppManifest($stateParams.projectKey).success(function(data) {
            $scope.uiState.appManifest = data;
            $scope.origAppManifest = angular.copy(data);
            $scope.exportOptions = data.projectExportManifest; // put at the root of the scope for the ng-included export-data-options.html
            $scope.exporterSettings = {exportOptions:data.projectExportManifest} // for the bundle-content-editor
            $scope.getAppSummary();
            $scope.uiState.useAsRecipe = data.useAsRecipeSettings != null;
            regenToc();
        }).error(setErrorInScope.bind($scope));
    }
    
    $scope.origRemapping = null;
    $scope.getAppRemapping = function() {
        if ($scope.showRemapping) {
            DataikuAPI.projects.getAppRemapping($stateParams.projectKey).success(function(data) {
                $scope.uiState.appRemapping = data;
                $scope.origRemapping = angular.copy(data);
            }).error(setErrorInScope.bind($scope));
        }
    };
    
    $scope.appIsDirty = function() {
        let manifestIsDirty = ($scope.origAppManifest != null && !angular.equals($scope.uiState.appManifest, $scope.origAppManifest));
        let remappingIsDirty = ($scope.origRemapping != null && !angular.equals($scope.uiState.appRemapping, $scope.origRemapping));
        return manifestIsDirty || remappingIsDirty;
    };
    // checking for the test instance is done differently, because there is a call to the backend to actually (re)create the instance first
    // and the saves need to be done before that call
    let allowTransitionToTestInstance = data => data.toState.name == 'projects.project.home.regular' && data.toParams.testInstance == "true"
    checkChangesBeforeLeaving($scope, $scope.appIsDirty, null, allowTransitionToTestInstance);
    
    $scope.recipeRoleNamesChanged = function() {
        if (!$scope.uiState.useAsRecipe) return false;
        let oldInputs = (($scope.origAppManifest || {}).useAsRecipeSettings || {}).inputRoles || [];
        let newInputs = (($scope.uiState.appManifest || {}).useAsRecipeSettings || {}).inputRoles || [];
        let oldOutputs = (($scope.origAppManifest || {}).useAsRecipeSettings || {}).outputRoles || [];
        let newOutputs = (($scope.uiState.appManifest || {}).useAsRecipeSettings || {}).outputRoles || [];
        let oldInputsSet = new Set(oldInputs.map(_ => _.objectId));
        let newInputsSet = new Set(newInputs.map(_ => _.objectId));
        let oldOutputsSet = new Set(oldOutputs.map(_ => _.objectId));
        let newOutputsSet = new Set(newOutputs.map(_ => _.objectId));
        let symDiff = function(a, b) {
            let r = new Set();
            for (let x of a) {
                if (!b.has(x)) r.add(x);
            }
            for (let x of b) {
                if (!a.has(x)) r.add(x);
            }
            return r;
        };
        return symDiff(oldInputsSet, newInputsSet).size > 0 || symDiff(oldOutputsSet, newOutputsSet).size > 0;
    };
    
    $scope.getAppSummary = function() {
        return DataikuAPI.apps.getTemplateSummary($scope.uiState.appManifest.id).success(function (data) {
            $scope.uiState.appSummary = data;
        }).error(setErrorInScope.bind($scope));
    }

    $scope.saveApp = function(refetchAppManifest) {
        DataikuAPI.projects.saveAppManifest($stateParams.projectKey, $scope.uiState.appManifest).success(function(data) {
            $scope.origAppManifest = angular.copy($scope.uiState.appManifest);

            if (refetchAppManifest) {
                $scope.getAppManifest();
            }
        }).error(setErrorInScope.bind($scope));
        
        if ($scope.showRemapping && $scope.uiState.appRemapping) {
            DataikuAPI.projects.saveAppRemapping($stateParams.projectKey, $scope.uiState.appRemapping).success(function(data) {
                $scope.origRemapping = angular.copy($scope.uiState.appRemapping);
            }).error(setErrorInScope.bind($scope));
        }
    }

    let init = function() {
        if ($scope.projectSummary.projectAppType == 'APP_TEMPLATE') {
            $scope.getAppManifest();
            $scope.getAppRemapping();
        }
    };
    if ($scope.projectSummary == null || $scope.projectSummary.projectKey != $stateParams.projectKey) {
        // wait until our projectSummary arrives
        let deregisterInit = $scope.$watch('projectSummary', function() {
            if ($scope.projectSummary && $scope.projectSummary.projectKey == $stateParams.projectKey) {
                init();
                deregisterInit();
            }    
        });
    } else {
        init();
    }
    let switchAppType = function(appType, useAsRecipe) {
        DataikuAPI.projects.switchAppType($stateParams.projectKey, appType, {useAsRecipe:useAsRecipe}).success(function(data) {
            WT1.event('app-switch-app-type', {appType:appType})
            $scope.projectSummary.projectAppType = appType; // apply the part we know has changed
            $scope.refreshProjectData(); // start a refresh of the projectSummary (this controller isn't the only one needing it)
            init(); // redo the init, since the app type changed
        }).error(setErrorInScope.bind($scope));
    };
    
    function regenToc() {
        let elems = [];
        elems.push({section:true, label:'Application header', id:'app_header'});
        // elems.push({section:true, label:'Full image', id:'app_image'});
        if (!$scope.uiState.useAsRecipe) {
            elems.push({section:true, label:'Application features', id:'app_features'});
        }
        elems.push({section:true, label:'Included content', id:'app_data'});
        if ($scope.uiState.useAsRecipe) {
            elems.push({section:true, label:'Application-as-recipe', id:'app_as_recipe'});
        } else {
            let itemIdx = 0;
            $scope.uiState.appManifest.homepageSections.forEach(function(section) {
                section.$id = itemIdx++;
                elems.push({section:true, label: function() {return section.sectionTitle || 'Section';}, id:'section_' + section.$id});
                section.tiles.forEach(function(tile) {
                    tile.$id = itemIdx++;
                    elems.push({section:false, label: function() {return tile.prompt || $filter('niceTileType')(tile.type) || 'Tile';}, id:'tile_' + tile.$id});
                });
            });
        }
        $scope.uiState.toc.elems = elems;
    };
    $scope.refreshTocAfterDrag = function() {$timeout(regenToc);}; // timeout to let ui-sortable commit the change 
    
    $scope.addHomepageSection = function() {
        $scope.uiState.appManifest.homepageSections.push({tiles:[]});
        regenToc();
    };
    $scope.removeHomepageSection = function(section) {
        let idx = $scope.uiState.appManifest.homepageSections.indexOf(section);
        if (idx >= 0) {
            $scope.uiState.appManifest.homepageSections.splice(idx, 1);
            regenToc();
        }
    };
    
    $scope.addTile = function(section, type) {
        let tile = {type:type};
        section.tiles.push(tile);
        regenToc();
    };
    $scope.removeTile = function(section, tile) {
        let idx = section.tiles.indexOf(tile);
        if (idx >= 0) {
            section.tiles.splice(idx, 1);
            regenToc();
        }
    };
    
    $scope.convertToApp = function(useAsRecipe) {
        switchAppType('APP_TEMPLATE', useAsRecipe);
    };
    $scope.convertToRegular = function() {
        Dialogs.confirm($scope, 'Project type conversion','Are you sure you want to make the project a regular project again (and lose the application definition) ?').then(function() {
            switchAppType('REGULAR');
        });
    };
    $scope.createOrUpdatePlugin = function() {
        CreateModalFromTemplate("/templates/apps/app-template-to-plugin-modal.html", $scope, null, function(modalScope) {
            modalScope.manifest = $scope.uiState.appManifest;
            WT1.event('app-create-or-update-plugin')
            DataikuAPI.plugindev.list().success(function(data) {
                modalScope.devPlugins = data;
            }).error(setErrorInScope.bind($scope));

            modalScope.convert = {
                mode: 'NEW'
            };
            
            modalScope.isIdValid = function() {
                if (modalScope.convert.mode === 'EXISTING') {
                    if (!modalScope.convert.targetPluginId) return false;
                    const plugin = modalScope.devPlugins.find(_ => _.desc.id === modalScope.convert.targetPluginId);
                    return PluginsService.isValidComponentId(modalScope.convert.targetFolder,
                                                            modalScope.convert.targetPluginId,
                                                            []); // accept that a component exists with the same name, to update it
                } else {
                    if (!modalScope.convert.newPluginId) return false;
                    return PluginsService.isValidComponentId(modalScope.convert.targetFolder,
                                                            modalScope.convert.newPluginId,
                                                            []);
                }
            };

            modalScope.go = function() {
                const params = modalScope.convert;
                const pluginId = params.mode == 'NEW' ? params.newPluginId : params.targetPluginId;
                const appName = params.targetFolder;
                DataikuAPI.projects.createOrUpdatePlugin($stateParams.projectKey, pluginId, appName).success(function(data) {
                    FutureProgressModal.show(modalScope, data, "Creating a plugin application template").then(function(data) {
                        modalScope.dismiss();
                        $scope.reloadPluginConfiguration();
                        StateUtils.go.pluginEditor(data.pluginId, data.pathToFiles);
                    });
                }).error(setErrorInScope.bind($scope));
            };
        });
    };
    
    function checkDirtynessBeforeTesting() {
        if ($scope.appIsDirty()) {
            if (!confirm('You have unsaved changes, are you sure you want to test the previous state and lose changes ?')) { // NOSONAR: Yes we want to display a pop-up
                return false;
            }
        }
        return true;
    };
    
    $scope.goToTestInstanceInNewTabIfNeeded = function($event, projectKey) {
        if ($event.ctrlKey || $event.metaKey) {
            var url = $state.href('projects.project.home.regular', { projectKey: projectKey, testInstance: "true" });
            window.open(url,'_blank');
        } else {
            $state.go('projects.project.home.regular', { projectKey: projectKey, testInstance: "true" });
        }                
    };

    $scope.createOrUpdateTestInstance = function($event) {
        if (!checkDirtynessBeforeTesting()) return;
        WT1.event('app-test-instance', {full:false})
        DataikuAPI.apps.createOrUpdateTestInstance($scope.uiState.appManifest.id, false).success(function(data) {
            FutureProgressModal.show($scope, data, "Creating or updating test instance").then(function(data) {
                if (data.fatal) {
                    Dialogs.infoMessagesDisplayOnly($scope, "Instantiation result", data);
                } else {
                    $scope.goToTestInstanceInNewTabIfNeeded($event, data.targetProjectKey);
                }
            });
        }).error(setErrorInScope.bind($scope));
    }

    $scope.createOrRecreateTestInstance = function($event) {
        if (!checkDirtynessBeforeTesting()) return;
        WT1.event('app-test-instance', {full:true})
        DataikuAPI.apps.createOrUpdateTestInstance($scope.uiState.appManifest.id, true).success(function(data) {
            FutureProgressModal.show($scope, data, "Creating or updating test instance").then(function(data) {
                if (data.fatal) {
                    Dialogs.infoMessagesDisplayOnly($scope, "Instantiation result", data);
                } else {
                    $scope.goToTestInstanceInNewTabIfNeeded($event, data.targetProjectKey);
                }
            });
        }).error(setErrorInScope.bind($scope));
    }

    $scope.goToTestInstance = function($event) {
        if (!checkDirtynessBeforeTesting()) return;
        WT1.event('app-test-instance', {full:null})
        DataikuAPI.apps.getTestInstance($scope.uiState.appManifest.id).success(function(data) {
            if (!data) {
                ActivityIndicator.warning("No test instance found, you must create one first");
            } else {
                $scope.goToTestInstanceInNewTabIfNeeded($event, data);
            }
        }).error(setErrorInScope.bind($scope));
    }
    
    // tags
    $scope.startEditTags  = function() {
        $scope.uiState.tags.newVal = angular.copy($scope.uiState.appManifest.tags);
        $scope.uiState.tags.editing = true;
    };
    $scope.cancelEditTags  = function() {
        $scope.uiState.tags.newVal = null;
        $scope.uiState.tags.editing = false;
    };
    $scope.validateEditTags  = function() {
        if ($scope.uiState.tags.editing) {
            $scope.uiState.appManifest.tags = $scope.uiState.tags.newVal;
            $scope.uiState.tags.editing = false;
        }
    };
    
    // make sure we only edit one field at a time (otherwise it's messy)
    let currentEditingField = {appLabel:null, appShortDesc:null};
    let stopCurrentEdit = function() {
        if (currentEditingField.appLabel) {
            $scope.cancelEditLabel(currentEditingField.appLabel);
        }
        if (currentEditingField.appShortDesc) {
            $scope.cancelEditShortDesc(currentEditingField.appShortDesc);
        }
    };
    
    $scope.startEditLabel = function(manifest) {
        stopCurrentEdit();
        $scope.uiState.$editingLabel = true;
        $scope.uiState.edited = manifest.label;
        currentEditingField.appLabel = manifest;
    };
    $scope.stopEditLabel = function(manifest) {
        $scope.uiState.$editingLabel = false;
        manifest.label = $scope.uiState.edited;
        currentEditingField.appLabel = null;
    };
    $scope.cancelEditLabel = function(manifest) {
        $scope.uiState.$editingLabel = false;
        currentEditingField.appLabel = null;
    };
    $scope.startEditShortDesc = function(manifest) {
        stopCurrentEdit();
        $scope.uiState.$editingShortDesc = true;
        $scope.uiState.edited = manifest.shortDesc;
        currentEditingField.appShortDesc = manifest;
    };
    $scope.stopEditShortDesc = function(manifest) {
        $scope.uiState.$editingShortDesc = false;
        manifest.shortDesc = $scope.uiState.edited;
        currentEditingField.appShortDesc = null;
    };
    $scope.cancelEditShortDesc = function(manifest) {
        $scope.uiState.$editingShortDesc = false;
        currentEditingField.appShortDesc = null;
    };
    
    $scope.addConnectionRemapping = function(name) {
        $scope.uiState.appRemapping.connections.push({
            source: name,
            target: null
        });
    };
    $scope.prepareConnectionRemapping = function(name) {
        return {
            source: name,
            target: null
        };
    };
    $scope.addCodeEnvRemapping = function(name) {
        $scope.uiState.appRemapping.codeEnvs.push({
            source: name,
            target: null
        });
    };
    $scope.prepereCodeEnvRemapping = function(name) {
        return {
            source: name,
            target: null
        };
    };
    
    $scope.hasHelpEditor = function(tile) {
        return tile.$hasHelp || tile.help || tile.helpTitle || tile.$editingHelp || tile.$editingHelpTitle;
    };
    $scope.addHelp = function(tile) {
        tile.$hasHelp = true;
    };
    $scope.removeHelp = function(tile) {
        tile.help = null;
        tile.helpTitle = null;
        tile.$hasHelp = false;
    };
    
    $scope.$watch("uiState.useAsRecipe", function() {
        if ($scope.uiState.appManifest == null) return;
        if ($scope.uiState.useAsRecipe) {
            let defaultUseAsRecipeSettings = {
                                                "icon": "icon-dku-application-as-recipe",
                                                "inputRoles": [],
                                                "outputRoles": [],
                                                "variablesEditionTile": {
                                                   "behavior": "MODAL",
                                                   "params": []
                                                },
                                                "runScenarioTile": {}
                                             }
            $scope.uiState.appManifest.useAsRecipeSettings = $scope.uiState.appManifest.useAsRecipeSettings || defaultUseAsRecipeSettings;
        } else {
            $scope.uiState.appManifest.useAsRecipeSettings = null;
        }
        regenToc();
    });

    $scope.$on("projectImgEdited", function(ev, newState){
        $scope.uiState.appManifest.imgColor = newState.imgColor;
        $scope.uiState.appManifest.imgPattern = parseInt(newState.imgPattern, 10);
        $scope.uiState.appManifest.showInitials = newState.showInitials;
        $scope.saveApp(true);
    });

    function buildNewRoleName(isInput) {
        const newRoleInfo = isInput ?
            {prefix: "Input", existingRoles: $scope.uiState.appManifest.useAsRecipeSettings.inputRoles} :
            {prefix: "Output", existingRoles: $scope.uiState.appManifest.useAsRecipeSettings.outputRoles};
        return StringUtils.transmogrify(newRoleInfo.prefix, newRoleInfo.existingRoles.map(existingRole => existingRole.roleLabel));
    }

    function buildNewRole(isInput) {
        return function () {
            return {roleLabel: buildNewRoleName(isInput), type: 'DATASET', objectId: null};
        };
    }

    $scope.buildNewInputRole = buildNewRole(true);
    $scope.buildNewOutputRole = buildNewRole(false);
});

app.controller('AppsListController', function ($scope, $state, $location, $rootScope, $http, Assert, DataikuAPI, localStorageService, WT1, TopNav, CreateModalFromTemplate, ListFilter, LoggerProvider, Fn, Debounce, DKUConstants, TaggingService, HomePageContextService, openDkuPopin, $q, StateUtils, HomeBehavior) {

    const Logger = LoggerProvider.getLogger('AppsListController');

    $scope.uiState = {};
    $scope.displayMode = {mode: 'mosaic'};
    $scope.query = {tags:[], q:''};
    $scope.sortBy = {mode:'name'};
    $scope.tagsMap = {};
    $scope.tagsList = [];

    TopNav.setLocation(TopNav.DSS_HOME);

    TaggingService.fetchGlobalTags();

    //Items rows for mosaic view
    const getMosaicRows = function (itemsList) {
        /* Compute display characteristics for mosaic mode */
        const tileW = 190;
        const margins = 40;

        let itemsPerRow = 1;
        let ww = window.innerWidth;
        ww -= margins;

        if (ww > tileW) itemsPerRow = Math.floor(ww / tileW);

        const mosaicItemsPerRow = [];
        let i, j;
        for (i = 0, j = itemsList.length; i < j; i += itemsPerRow) {
            mosaicItemsPerRow.push(itemsList.slice(i, i + itemsPerRow));
        }
        return mosaicItemsPerRow;
    };
    
    $scope.prepareApp = function(app, tagsMap) {
        // --- Tags
        //populating tagsMap
        app.tags.forEach(tag => {
            const entry = tagsMap.get(tag);
            if (entry !== undefined) {
                entry.count++;
            } else {
                const tagDef = null; // app.tagsFile.tags[tag] // no tagsFile in apps
                const color = (tagDef == undefined || tagDef.color == undefined) ? TaggingService.getDefaultColor(tag) : tagDef.color;
                tagsMap.set(tag, {count: 1, color: color});
            }
        });
    };
    
    const updateDisplayedItems = function() {
        $scope.filteredAppTemplatesList = filterAppTemplatesList($scope.appTemplatesList, $scope.query);
        $scope.filteredAppTemplatesList = sortAppTemplatesList($scope.filteredAppTemplatesList);

        $scope.filteredAppTemplatesRows = getMosaicRows($scope.filteredAppTemplatesList);
    };

    $scope.appTemplatesList = [];
    $scope.listApps = function () {
        return DataikuAPI.apps.listTemplates().success(function (data) {
            $scope.appTemplatesList = data.items;
            
            const tagsMap = new Map();
            $scope.appTemplatesList.forEach(app => $scope.prepareApp(app, tagsMap));

            $scope.tagsList = [];
            tagsMap.forEach((value, key) => $scope.tagsList.push({ title: key, count: value.count, color: value.color }));
            $scope.tagsList.sort((a, b) => a.title > b.title);
            
            updateDisplayedItems();
        }).error(setErrorInScope.bind($scope));
    };
    $scope.listApps();
        
    var debouncedResizeCB = Debounce().withDelay(200, 200).wrap(updateDisplayedItems);

    $(window).on("resize.appsPageResize", debouncedResizeCB);
    $scope.$on("$destroy", function () {
        $(window).off("resize.appsPageResize", debouncedResizeCB);
    });
    
    $scope.clickOnApp = function(appTemplate, $event) {
        $state.go('apps.app', { appId: appTemplate.appId });
    };
    
    $scope.isFiltering = function () {
        return $scope.query.tags.length > 0 || $scope.isFullStringQuerying();
    };

    $scope.isFullStringQuerying = function () {
        return typeof($scope.query.q) !== "undefined" && $scope.query.q.length > 0;
    };
    
    $scope.clearFilters = function () {
        $scope.query.tags = [];
        $scope.query.q = "";
    };
    
    $scope.toggleTag = function (tagTitle) {
        if (tagTitle) {
            var index = $scope.query.tags.indexOf(tagTitle);
            index > -1 ? $scope.query.tags.splice(index, 1) : $scope.query.tags.push(tagTitle);
        }
    };
   
    $scope.getDefaultTagColor = TaggingService.getTagColor;
    $scope.getAppInstanceOwnerDisplayList = function (contributors, maxDisplayedContributors) {
        if (contributors.length > maxDisplayedContributors) {
            return contributors.slice(0, maxDisplayedContributors - 1);
        }
        return contributors
    };
    
    /**
     * Returns a list of app templates filtered by full text query, tags, users, status, path.
     * Keeps app templates that match at least one condition for each non-empty filtering category (text query, tags, contributors, status, path)
     * @param appTemplatesList: input list to filter
     * @param query: object wrapping query attributes:
     *      - q: textQuery on which projects list will be filtered (looking through all project's attribute)
     *      - tags: list of tags to filter projects list (inclusive filtering - keep items that match at least one tag)
     *      - path: path used to filter projects list (project's path needs to be equal to it, or an extension of it in case of full text filtering)
     * @returns {*}
     */
    function filterAppTemplatesList(appTemplatesList, query) {
        if ($scope.isFiltering()) {
            WT1.event('app-list-fitering', {tags:(query.tags && query.tags.length), fullString:$scope.isFullStringQuerying()})
        }
        // Filtering on full text query
        let filteredAppTemplatesList = ListFilter.filter(appTemplatesList || [], query.q);

        // Keep apps that have at least one of the tag selected in the 'Tags' filter (if there are any)
        if (query.tags && query.tags.length) {
            filteredAppTemplatesList = filteredAppTemplatesList.filter(app => {
                if (!app.tags) {
                    return;
                }
                return query.tags.some(tag => app.tags.includes(tag));
            });
        }

        return filteredAppTemplatesList;
    }

    $scope.$watch("query", function (nv, ov) {
        if (!angular.equals(nv, ov)) {
            updateDisplayedItems();
        }
    }, true);
    $scope.$watch("sortBy", function (nv, ov) {
        if (!angular.equals(nv, ov)) {
            WT1.event('app-list-sort', {by:$scope.sortBy})
            updateDisplayedItems();
        }
    }, true);

    /*
     * Sorting projects list
     */

    $scope.sortByModeTitles = Object.freeze({
        name: "Application Name"
    });

    function sortAppTemplatesList(appTemplatesList) {
        if (!$scope.sortBy) {
            return;
        }
        switch ($scope.sortBy.mode) {
            case "name":
                sortByName(appTemplatesList);
                break;
        }
        if ($scope.sortBy.isReversedSort) {
            appTemplatesList.reverse();
        }
        return appTemplatesList;
    }

    function sortByName(appTemplatesList) {
        appTemplatesList.sort(function (p1, p2) {
            return alphabeticalSort(p1.label || p1.appId, p2.label || p2.appId);
        });
    }

});

app.controller("AppPageController", function($scope, $controller, $state, $stateParams, $rootScope, CreateModalFromTemplate, Dialogs, Logger, DataikuAPI, TopNav, Debounce, ListFilter, Assert, DKUConstants, WT1, TaggingService, StateUtils, openDkuPopin, DetectUtils) {

    $controller('_ProjectsListBaseBehavior', { $scope });

    TopNav.setLocation(TopNav.DSS_HOME);
    TaggingService.fetchGlobalTags();
    $scope.getDefaultTagColor = TaggingService.getTagColor;

    $scope.uiState = {};
    $scope.displayMode = {mode: 'mosaic'};
    $scope.query = {tags:[], projectStatus:[], contributors:[], q:''};
    $scope.sortBy = {mode:'commit'};
    $scope.tagsMap = {};
    $scope.tagsList = [];
    $scope.contributorsMap = {};
    $scope.contributorsList = [];
    
    $scope.os = DetectUtils.getOS();
    
    //Items rows for mosaic view
    const getMosaicRows = function (itemsList) {
        /* Compute display characteristics for mosaic mode */
        const tileW = 310;
        const margins = 40;
        const leftPaneWidth = 400 + 40; // don't forget padding

        let itemsPerRow = 1;
        let ww = window.innerWidth;
        ww -= margins;
        ww -= leftPaneWidth;

        if (ww > tileW) itemsPerRow = Math.floor(ww / tileW);

        const mosaicItemsPerRow = [];
        let i, j;
        for (i = 0, j = itemsList.length; i < j; i += itemsPerRow) {
            mosaicItemsPerRow.push(itemsList.slice(i, i + itemsPerRow));
        }
        return mosaicItemsPerRow;
    };
    
    const updateDisplayedItems = function() {
        $scope.filteredAppInstancesList = filterAppInstancesList($scope.appInstancesList, $scope.query);
        $scope.filteredAppInstancesList = sortAppInstancesList($scope.filteredAppInstancesList);

        $scope.filteredAppInstancesRows = getMosaicRows($scope.filteredAppInstancesList);
    };

    var debouncedResizeCB = Debounce().withDelay(200, 200).wrap(updateDisplayedItems);

    $(window).on("resize.appPageResize", debouncedResizeCB);
    $scope.$on("$destroy", function () {
        $(window).off("resize.appPageResize", debouncedResizeCB);
    });
    

    $scope.appInstancesList = [];
    $scope.fetchAppSummary = function(clearSelectedProjects) {
        $scope.appInstancesList = [];
        return DataikuAPI.apps.getTemplateSummary($stateParams.appId).success(function (data) {
            $scope.appSummary = data;
            $scope.appInstancesList = $scope.appSummary.instances;
            
            const tagsMap = new Map();
            const contributorsMap = new Map();
            $scope.appInstancesList.forEach(p => {
                // --- Tags
                //populating tagsMap will all descendants projects
                p.tags.forEach(tag => {
                    const entry = tagsMap.get(tag);
                    if (entry !== undefined) {
                        entry.count++;
                    } else {
                        const tagDef = p.tagsFile.tags[tag]
                        const color = (tagDef == undefined || tagDef.color == undefined) ? TaggingService.getDefaultColor(tag) : tagDef.color;
                        tagsMap.set(tag, {count: 1, color: color});
                    }
                });

                p.contributors.forEach(contributor => {
                    if (!contributorsMap.has(contributor.login)) {
                        contributorsMap.set(contributor.login, angular.extend({}, contributor, { sortName: contributor.displayName.toLowerCase() }));
                    }
                })
            });

            $scope.tagsList = [];
            tagsMap.forEach((value, key) => $scope.tagsList.push({ title: key, count: value.count, color: value.color }));
            $scope.tagsList.sort((a, b) => a.title > b.title);

            $scope.contributorsList = [];
            contributorsMap.forEach((value) => $scope.contributorsList.push(value));
            $scope.contributorsList.sort((a, b) => a.sortName.localeCompare(b.sortName));

            // don't forget to re-generate the selectedProjects list (and trim it of now-deleted projects at the same time)
            $scope.selectedProjects = [...$scope.appInstancesList.filter(p => $scope.selectedProjects.findIndex(p2 => p.projectKey == p2.projectKey) >= 0)]            
            updateDisplayedItems();
        }).error(setErrorInScope.bind($scope));
    }

    $scope.openInstantiationModal = function() {
        CreateModalFromTemplate("/templates/apps/app-instantiation-modal.html", $scope, "AppInstantiationModalController");
    }

    $scope.fetchAppSummary();
    
    $scope.clickOnAppInstance = function(appInstance, $event) {
        if ($scope.isPopupActive) {
            return;
        }
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
            toggleSelectProject(appInstance);
            window.getSelection().removeAllRanges(); //FF fix for messy text selection
        } else {
            appInstance.effectivePermission == "READER" ? StateUtils.go.pinboard(appInstance.projectKey) : StateUtils.go.project(appInstance.projectKey);
        }
    };

    $scope.selectedProjects = [];
    function toggleSelectProject(project, expectSelected) {
        let index = $scope.selectedProjects.findIndex(p => p.projectKey === project.projectKey);
        if (index == -1) {
            if (expectSelected == true || expectSelected === undefined) {
                $scope.selectedProjects.push(project);
            }
        } else {
            if (expectSelected == false || expectSelected === undefined) {
                $scope.selectedProjects.splice(index, 1);
            }
        }
    }
    $scope.isProjectSelected = project => $scope.selectedProjects.findIndex(sp => sp.projectKey === project.projectKey) !== -1;
    
    $scope.selectAllInstances = function() {
        $scope.filteredAppInstancesList.forEach(p => toggleSelectProject(p, true))
    };
    $scope.unselectAllInstances = function() {
        $scope.filteredAppInstancesList.forEach(p => toggleSelectProject(p, false))
    };
    function toggleAllInstancesStartingFrom(project, selectAfter, expectSelected) {
        let idx = $scope.filteredAppInstancesList.findIndex(p => p.projectKey == project.projectKey);
        if (idx >= 0) {
            let affected = selectAfter ? $scope.filteredAppInstancesList.filter((p,i) => i >= idx) : $scope.filteredAppInstancesList.filter((p,i) => i <= idx);
            affected.forEach(p => toggleSelectProject(p, expectSelected))
        } else {
            // project not found, suspicious
        }
    };

    $scope.getProjectContributorDisplayList = function (contributors, maxDisplayedContributors) {
        if (contributors.length > maxDisplayedContributors) {
            return contributors.slice(0, maxDisplayedContributors - 1);
        }
        return contributors
    };
    
    // refactor status color handling out into a service for easier usage in separated scopes
    $scope.getProjectStatusColor = function(status) {
        return ProjectStatusService.getProjectStatusColor(status);
    }
    
    
    $scope.isFiltering = function () {
        return $scope.query.tags.length > 0 || $scope.query.contributors.length > 0 || $scope.query.projectStatus.length > 0 || $scope.isFullStringQuerying();
    };

    $scope.isFullStringQuerying = function () {
        return typeof($scope.query.q) !== "undefined" && $scope.query.q.length > 0;
    };
    
    $scope.clearFilters = function () {
        $scope.query.tags = [];
        $scope.query.projectStatus = [];
        $scope.query.contributors = [];
        $scope.query.q = "";
    };
    
    $scope.toggleTag = function (tagTitle) {
        if (tagTitle) {
            var index = $scope.query.tags.indexOf(tagTitle);
            index > -1 ? $scope.query.tags.splice(index, 1) : $scope.query.tags.push(tagTitle);
        }
    };
    
    /**
     * Returns a list of app instances filtered by full text query, tags, users, status, path.
     * Keep apps that match at least one condition for each non-empty filtering category (text query, tags, contributors, status, path)
     * @param appInstancesList: input list to filter
     * @param query: object wrapping query attributes:
     *      - q: textQuery on which projects list will be filtered (looking through all project's attribute)
     *      - tags: list of tags to filter projects list (inclusive filtering - keep items that match at least one tag)
     *      - contributors: list of contributors to filter projects list (inclusive filtering - keep items that match at least one contributor)
     *      - projectStatus: list of projectStatus to filter projects list (inclusive filtering - keep items that match at least one project status)
     *      - path: path used to filter projects list (project's path needs to be equal to it, or an extension of it in case of full text filtering)
     * @returns {*}
     */
    function filterAppInstancesList(appInstancesList, query) {
        if ($scope.isFiltering()) {
            WT1.event('app-instances-fitering', {tags:(query.tags && query.tags.length), contributors:(query.contributors && query.contributors.length), projectStatus:(query.projectStatus && query.projectStatus.length), fullString:$scope.isFullStringQuerying()})
        }
        // Filtering on full text query
        let filteredAppInstancesList = ListFilter.filter(appInstancesList || [], query.q).filter(app => {

            // Keep apps that have at least one of the tags selected in the 'Tags' filter (if there are any)
            if (query.tags && query.tags.length) {
                if (!app.tags || !query.tags.some(tag => app.tags.includes(tag))) {
                    return;
                }
            }

            // Keep apps that have at least one of the contributors selected in the 'Users' filter (if there are any)
            if (query.contributors && query.contributors.length) {
                if (!app.contributors || !app.contributors.some(contributor => query.contributors.includes(contributor.login))) {
                    return;
                }
            }

            // Keep apps that have at least one of the project status selected in the 'Status' filter (if there are any)
            if (query.projectStatus && query.projectStatus.length) {
                if (query.projectStatus.indexOf(app.projectStatus) < 0) {
                    return;
                }
            } else if (app.projectStatus === DKUConstants.ARCHIVED_PROJECT_STATUS) {
                return;
            }

            return true;
        });

        return filteredAppInstancesList;
    }

    $scope.$watch("query", function (nv, ov) {
        if (!angular.equals(nv, ov)) {
            updateDisplayedItems();
        }
    }, true);
    $scope.$watch("sortBy", function (nv, ov) {
        if (!angular.equals(nv, ov)) {
            updateDisplayedItems();
        }
    }, true);

    /*
     * Sorting projects list
     */

    $scope.sortByModeTitles = Object.freeze({
        name: "Project Name",
        commit: "Last Modified",
        commit_for_user: "Last Modified By Me",
        status: "Status"
    });

    function sortAppInstancesList(appInstancesList) {
        if (!$scope.sortBy) {
            return;
        }
        switch ($scope.sortBy.mode) {
            case "name":
                sortByName(appInstancesList);
                break;
            case "status":
                sortByStatus(appInstancesList);
                break;
            case "commit":
                sortByCommit(appInstancesList);
                break;
            case "commit_for_user":
                sortByCommitForUser(appInstancesList);
                break;
        }
        if ($scope.sortBy.isReversedSort) {
            appInstancesList.reverse();
        }
        return appInstancesList;
    }

    function sortByName(appInstancesList) {
        appInstancesList.sort(function (p1, p2) {
            return alphabeticalSort(p1.name, p2.name);
        });
    }

    function sortByStatus(appInstancesList) {
        Assert.inScope($rootScope, 'appConfig');
        const projectStatusNames = [];
        $rootScope.appConfig.projectStatusList.forEach(function (s) {
            projectStatusNames.push(s.name);
        })
        appInstancesList.sort(function (p1, p2) {
            if (p1.projectStatus && p2.projectStatus) {
                var indexOfStatus1 = projectStatusNames.indexOf(p1.projectStatus);
                var indexOfStatus2 = projectStatusNames.indexOf(p2.projectStatus);
                return indexOfStatus1 < indexOfStatus2 ? -1 : indexOfStatus1 == indexOfStatus2 ? alphabeticalSort(p1.name, p2.name) : 1;
            } else if (p1.projectStatus) {
                return -1;
            } else if (p2.projectStatus) {
                return 1;
            } else {
                return alphabeticalSort(p1.name, p2.name);
            }
        });
    }

    function sortByCommit(appInstancesList) {
        appInstancesList.sort(function (p1, p2) {
            if (p1.lastCommit && p2.lastCommit) {
                return p1.lastCommit.time < p2.lastCommit.time ? 1 : p1.lastCommit.time == p2.lastCommit.time ? 0 : -1;
            } else if (p1.lastCommit) {
                return -1;
            } else if (p2.lastCommit) {
                return 1;
            } else {
                return 0;
            }
        });
    }

    function sortByCommitForUser(appInstancesList) {
        appInstancesList.sort(function (p1, p2) {
            if (p1.lastCommitForUser && p2.lastCommitForUser) {
                return p1.lastCommitForUser.time < p2.lastCommitForUser.time ? 1 : p1.lastCommitForUser.time == p2.lastCommitForUser.time ? 0 : -1;
            } else if (p1.lastCommitForUser) {
                return -1;
            } else if (p2.lastCommitForUser) {
                return 1;
            } else {
                return 0;
            }
        });
    }
    
    $scope.deleteInstances = function() {
        let projectKeys = $scope.selectedProjects.map(p => p.projectKey);
        DataikuAPI.apps.checkInstancesDeletability($stateParams.appId, projectKeys).success(function(data) {
            if(data.anyMessage) {
                // Some error happened!
                CreateModalFromTemplate("/templates/apps/delete-instances-results.html", $scope, null, function(newScope) {
                    newScope.beforeDeletion = true;
                    newScope.results = data.messages;
                });
            } else {
                CreateModalFromTemplate("/templates/apps/delete-instances-confirm-dialog.html", $scope, null, function(newScope) {
                    newScope.projectKeys = projectKeys;
                    newScope.dropManagedData = true;
                    newScope.dropManagedFoldersOutputOfRecipe = true;
                    newScope.confirmProjectDeletion = function(dropManagedData, dropManagedFoldersOutputOfRecipe) {
                        DataikuAPI.apps.deleteInstances($stateParams.appId, projectKeys, dropManagedData, dropManagedFoldersOutputOfRecipe).success(function(deletionResult) {
                            if (deletionResult.anyMessage) {
                                CreateModalFromTemplate("/templates/apps/delete-instances-results.html", $scope, null, function(newScope) {
                                    newScope.beforeDeletion = false;
                                    newScope.results = deletionResult.messages;
                                    newScope.$on('$destroy',function() {
                                        $scope.fetchAppSummary();
                                    });
                                });
                            } else {
                                $scope.fetchAppSummary();
                            }
                        }).error(setErrorInScope.bind($scope));
                        WT1.event("instances-delete",{dropManagedData:dropManagedData, dropManagedFoldersOutputOfRecipe:dropManagedFoldersOutputOfRecipe});
                    }
                });
            }
        }).error(setErrorInScope.bind($scope));
    };
    

    $scope.openInstanceMenu = function (project, $event) {
        let template = `<ul class="dropdown-menu projects-dropdown-menu" >
        <li><a ng-click="toggleSelection()">{{selectedProjects.indexOf(project) < 0 ? 'Select' : 'Unselect'}}</a></li>
        <li><a ng-click="selectBefore()">Select all before</a></li>
        <li><a ng-click="selectAfter()">Select all after</a></li>
        <li><a ng-click="unselectBefore()">Unselect all before</a></li>
        <li><a ng-click="unselectAfter()">Unselect all after</a></li>
        </ul>`;
        let callback = newScope => {
            newScope.projects = newScope.selectedProjects.length > 0 ? newScope.selectedProjects : [project];
            newScope.project = project;
            newScope.appConfig = $scope.appConfig;
            newScope.toggleSelection = () => toggleSelectProject(project);
            newScope.selectAfter = () => toggleAllInstancesStartingFrom(project, true, true);
            newScope.selectBefore = () => toggleAllInstancesStartingFrom(project, false, true);
            newScope.unselectAfter = () => toggleAllInstancesStartingFrom(project, true, false);
            newScope.unselectBefore = () => toggleAllInstancesStartingFrom(project, false, false);
        };
        let isElsewhere = (_, e) => $(e.target).parents('.dropdown-menu').length == 0;
        $scope.lockForPopup();
        let dkuPopinOptions = {
            template: template,
            isElsewhere: isElsewhere,
            popinPosition: 'CLICK',
            callback: callback,
            onDismiss: $scope.unlockAfterPopup
        };
        $scope.popupDismiss = openDkuPopin($scope, $event, dkuPopinOptions);
    };
    
})

app.controller("AppInstantiationModalController", function($scope, $state, $stateParams, DataikuAPI, Dialogs, FutureProgressModal, WT1) {

    $scope.instantiation = {
        targetProjectKey: "",
        targetProjectLabel: ""
    }

    DataikuAPI.projects.listAllKeys()
        .success(function(data) { $scope.allProjectKeys = data; })
        .error(setErrorInScope.bind($scope));

    function isProjectKeyUnique(value) {
        return !$scope.allProjectKeys || $scope.allProjectKeys.indexOf(value) < 0;
    };

    $scope.$watch("instantiation.targetProjectKey", function(nv, ov) {
        $scope.uniq = !nv || isProjectKeyUnique(nv);
    });

    $scope.$watch("instantiation.targetProjectLabel", function(nv, ov) {
        if (!nv) return;
        var slug = nv.toUpperCase().replace(/\W+/g, ""),
            cur = slug,
            i = 0;
        while (!isProjectKeyUnique(cur)) {
            cur = slug + "_" + (++i);
        }
        $scope.instantiation.targetProjectKey = cur;
    });

    $scope.create = function() {
        WT1.event('app-instantiate')
        DataikuAPI.apps.instantiate($stateParams.appId, $scope.instantiation.targetProjectKey, $scope.instantiation.targetProjectLabel).success(function(future) {
            const targetProjectKey = $scope.instantiation.targetProjectKey;
            const appPageScope = $scope.$parent.$parent;
            FutureProgressModal.show(appPageScope, future, "Creating your own copy of the application").then(function(result) {
                if (!result.done) {
                    Dialogs.infoMessagesDisplayOnly(appPageScope, "Instantiation result", result, undefined, undefined, 'static', false);
                } else {
                    $state.go("projects.project.home.regular", {projectKey: targetProjectKey})
                }
            });
            $scope.dismiss();
        }).error(setErrorInScope.bind($scope));
    }
});

app.controller("AppTilesController", function($scope, $rootScope, $controller, $state, $stateParams, DataikuAPI, Dialogs, TopNav, CreateModalFromTemplate, FutureProgressModal, StateUtils, Debounce, WT1) {
    $scope.uiState = {};

    /******
     * get/set the project variables across all the 'edit variables' tiles
     ******/
    $scope.projectLocalVariables = null;
    
    DataikuAPI.projects.variables.get($stateParams.projectKey).success(function(data) {
        $scope.projectLocalVariables = angular.copy(data.local);
        $scope.uiState.localVariables = data.local;
        $scope.uiState.standardVariables = data.standard;
    }).error(setErrorInScope.bind($scope));
    
    let debouncedUpdate = Debounce().withDelay(100, 500).withScope($scope).wrap(function () {
        if ($scope.projectLocalVariables != null && $scope.uiState.localVariables != null && !angular.equals($scope.projectLocalVariables, $scope.uiState.localVariables)) {
            let newLocalVariables = angular.copy($scope.projectLocalVariables);
            let projectVariables = {standard:$scope.uiState.standardVariables, local:newLocalVariables};
            return DataikuAPI.projects.variables.save($stateParams.projectKey, projectVariables).success(function(data) {
                $scope.uiState.localVariables = newLocalVariables;
            }).error(setErrorInScope.bind($scope));
        }
    });
    $scope.$watch("projectLocalVariables", debouncedUpdate, true);
    
    /******
     * utils
     ******/
    $scope.overtakePromptMargin = function(tile) {
        if (!tile || !tile.type) return false;
        if (tile.prompt) return false;
        if (tile.type == 'PROJECT_VARIABLES_EDIT') {
            return tile.behavior && tile.behavior.startsWith("INLINE_");
        } else {
            return false;
        }
    };
});

/**********************
 * Utilities
 **********************/

app.filter('niceTileType', function () {
    // Keep in sync with:
    //  - com.dataiku.dip.coremodel.AppHomepageTile.AppHomepageTileType
    //  - app-designer.html
    //      - in the drop down of `Add tile`
    //      - in the tiles ng-switch
    const displayableTileTypes = {
        UPLOAD_DATASET_SET_FILE: "Upload file in dataset",
        MANAGED_FOLDER_ADD_FILE: "Upload file in folder",
        INLINE_DATASET_EDIT: "Edit dataset",
        DATASET_EDIT_SETTINGS: "Edit dataset settings",
        STREAMING_ENDPOINT_EDIT_SETTINGS: "Edit streaming endpoint settings",
        FILES_BASED_DATASET_BROWSE_AND_PREVIEW: "Select dataset files",
        CONNECTION_EXPLORER_TO_REPLACE_THE_SETTINGS_OF_A_DATASET_WITH_A_NEW_TABLE_REFERENCE: "Select SQL table",
        DASHBOARD_LINK: "View dashboard",
        MANAGED_FOLDER_LINK: "View folder",
        SCENARIO_RUN: "Run scenario",
        PROJECT_VARIABLES_EDIT: "Edit project variables",
        PERFORM_SCHEMA_PROPAGATION: "Propagate schema",
        DOWNLOAD_DATASET: "Download dataset",
        DOWNLOAD_DASHBOARD_EXPORT: "Download dashboard",
        DOWNLOAD_MANAGED_FOLDER_FILE: "Download file",
        DOWNLOAD_RMARKDOWN: "Download report",
        VARIABLE_DISPLAY: "Variable display",
        GUESS_TRAIN_DEPLOY: "Reguess and retrain model",
        MANAGED_FOLDER_BROWSE: "Select folder files"
    };
    return function (input) {
        if (!input) return input;
        const displayable = displayableTileTypes[input];
        return displayable || input;
    }
});

app.directive("appTilesToc", function(DataikuAPI, $stateParams, $timeout) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/fragments/toc.html',
        scope: {
            toc : '=appTilesToc',
            scrollSelector : '@'
        },
        link : function($scope, element, attrs) {
            let scroller = $($scope.scrollSelector);
            function computeVisibilities() {
                if ($scope.toc == null || $scope.toc.elems == null) return;
                
                let viewTop = scroller.offset().top;
                let viewBottom = viewTop + scroller.height();
                
                $scope.toc.elems.forEach(function(elem) {
                    elem.visible = false;
                    elem.active = false;
                    let elemHtml = $('#' + elem.id);
                    if (elemHtml && elemHtml.offset()) {
                        let elemTop = elemHtml.offset().top;
                        elem.visible = (elemTop <= viewBottom) && (elemTop >= viewTop);
                    } else {
                        elem.visible = false;
                    }
                });

                // find first active
                var foundActive = null;
                $scope.toc.elems.forEach(function(elem) {
                    elem.active = elem.visible && foundActive == null;
                    foundActive = foundActive || (elem.active ? elem : null);
                });
                
                if (foundActive != null) {
                    $scope.toc.part = 'tab_' + foundActive.id;
                }
            };
            $scope.$watch('toc.elems', function() {
                computeVisibilities();
            }); // the array is recreated on changes, don't do a deep watch
            scroller.on('scroll', function() {$timeout(computeVisibilities)});
            computeVisibilities();
            
            $scope.scrollTo = function(elem) {
                let elemHtml = $('#' + elem.id);
                elemHtml[0].scrollIntoView();
            };
            
            $scope.getLabel = function(elem) {
                return angular.isFunction(elem.label) ? elem.label() : elem.label;
            };
        }
    };
});

/**********************
 * Tiles
 **********************/

app.directive("uploadDatasetSetFileAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/upload-dataset-set-file.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.behaviors = [
                                   {name:'GO_TO_DATASET',                    label:'Go to dataset settings'},
                                   {name:'INLINE_UPLOAD_ONLY',               label:'Only upload file'},
                                   {name:'INLINE_UPLOAD_AND_REDETECT',       label:'Upload file and automatically redetect format'},
                                   {name:'INLINE_UPLOAD_REDETECT_AND_INFER', label:'Upload file and automatically redetect format and infer schema'}
                               ];
                               
            DataikuAPI.datasets.listHeaders($stateParams.projectKey).success(function(data) {
                $scope.datasets = data.filter(function(x) {return x.type == 'UploadedFiles';});
            }).error(setErrorInScope.bind($scope));
            
            let init = function() {
                if (!$scope.tile.behavior) {
                    $scope.tile.behavior = 'GO_TO_DATASET'; // the default
                }
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
        }
    }
});

app.directive("uploadDatasetSetFileAppTileView", function(DataikuAPI, $stateParams, MonoFuture, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/upload-dataset-set-file.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            let fetchDataset = function() {
                DataikuAPI.datasets.get($stateParams.projectKey, $scope.tile.datasetName, $stateParams.projectKey).success(function(data){
                    $scope.dataset = data;
                }).error(setErrorInScope.bind($scope));
            };
    
            $scope.uiState = {};
            $scope.files = [];
            $scope.downloadingFiles = 0;
            
            let realFileListChanged = function() {
                if ($scope.tile.behavior == 'INLINE_UPLOAD_AND_REDETECT' || $scope.tile.behavior == 'INLINE_UPLOAD_REDETECT_AND_INFER') {
                    let doInfer = $scope.tile.behavior == 'INLINE_UPLOAD_REDETECT_AND_INFER';
                    MonoFuture($scope).wrap(DataikuAPI.datasets.testAndDetectFormat)($stateParams.projectKey, $scope.dataset, true, doInfer).success(function(data) {
                        $scope.uiState.detecting = false;
                        $scope.detectionResults = data.result;
                        if (data.result.connectionOK && !data.result.empty) {
                            $scope.dataset.formatType = data.result.format.type;
                            $scope.dataset.formatParams = data.result.format.params;
                            if (doInfer) {
                                $scope.dataset.schema = data.result.format.schemaDetection.detectedSchema;
                            }
                            DataikuAPI.datasets.save($stateParams.projectKey, $scope.dataset, {}).success(function(data) {
                                fetchDataset();
                            }).error(setErrorInScope.bind($scope));
                        }
                    }).update(function(data) {
                        $scope.uiState.detecting = true;
                    }).error(function (data, status, headers) {
                        $scope.uiState.detecting = false;
                        setErrorInScope.bind($scope)(data, status, headers);
                    });
                }
            };
        
            $scope.drop = function (uploaded_files) {
                // if its a brand new dataset, instantiate an uploadbox first
                // upload files with progress bar

                WT1.event('app-tile-upload-dataset-drop', {nbFiles:uploaded_files.length})
    
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
                            realFileListChanged();
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
                    } (uploaded_files[i]));
                }
            }
            
            $scope.deleteFile = function (file, e) {
                e.preventDefault();
                e.stopPropagation();
                WT1.event('app-tile-upload-dataset-delete')
                DataikuAPI.datasets.upload.removeFile($stateParams.projectKey, $scope.dataset, file.path).success(function(data) {
                    $scope.files.splice($scope.files.indexOf(file), 1);
                    realFileListChanged();
                }).error(setErrorInScope.bind($scope));
            };
            
            let init = function() {
                fetchDataset();
                DataikuAPI.datasets.upload.listFiles($stateParams.projectKey, $scope.tile.datasetName).success(function (data) {
                    $scope.files = data;
                }).error(setErrorInScope.bind($scope));
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
        }
    }
});

app.directive("folderSetFileAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/folder-set-file.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.behaviors = [
                                   {name:'GO_TO_FOLDER',  label:'Go to folder'},
                                   {name:'INLINE_UPLOAD', label:'Upload file'}
                               ];

            DataikuAPI.managedfolder.list($stateParams.projectKey).success(function(data) {
                $scope.folders = data;
            }).error(setErrorInScope.bind($scope));
            
            let init = function() {
                if (!$scope.tile.behavior) {
                    $scope.tile.behavior = 'GO_TO_FOLDER'; // the default
                }
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
        }
    }
});

app.directive("folderSetFileAppTileView", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/folder-set-file.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            let fetchFolder = function() {
                DataikuAPI.managedfolder.get($stateParams.projectKey, $stateParams.projectKey, $scope.tile.folderId).success(function(data) {
                    $scope.folder = data;
                }).error(setErrorInScope.bind($scope));
            };
    
            $scope.uiState = {};
            $scope.files = [];
            $scope.downloadingFiles = 0;
            
            $scope.drop = function (uploaded_files) {
                // upload files with progress bar
                WT1.event('app-tile-upload-folder-drop', {nbFiles:uploaded_files.length})
                for (var i = uploaded_files.length - 1; i >= 0; i--) {
                    (function (uploaded_file) {
                        var file = {
                                progress: 0,
                                name: '/' + uploaded_file.name,
                                fullPath: uploaded_file.name,
                                length: uploaded_file.size
                            };
                        $scope.files.push(file);
                        $scope.downloadingFiles++;
                        DataikuAPI.managedfolder.uploadItem($stateParams.projectKey, $scope.tile.folderId, file.fullPath, uploaded_file, true, function (e) {
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
                                // replace stub file object by result of upload
                                $scope.files = $scope.files.slice(0, index).concat(data).concat($scope.files.slice(index + 1));
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
                    } (uploaded_files[i]));
                }
            }
            
            $scope.getIconClass = function(item) {
                if (!item) return '';
                if (item.directory) return 'icon-folder-close colored-folder-icon';
                return 'icon-file';
            };
            
            $scope.deleteFile = function (file, e) {
                e.preventDefault();
                e.stopPropagation();
                WT1.event('app-tile-upload-folder-delete')
                DataikuAPI.managedfolder.deleteItems($stateParams.projectKey, $scope.tile.folderId, [file.fullPath]).success(function(data) {
                    $scope.files.splice($scope.files.indexOf(file), 1);
                }).error(setErrorInScope.bind($scope));
            };
            
            let init = function() {
                fetchFolder();
                DataikuAPI.managedfolder.browse($stateParams.projectKey, $scope.tile.folderId, '/').success(function (data) {
                    $scope.files = data.children;
                }).error(setErrorInScope.bind($scope));
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }            
            
        }
    }
});

app.directive("editInlineDatasetAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/edit-inline-dataset.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            DataikuAPI.datasets.listHeaders($stateParams.projectKey).success(function(data) {
                $scope.datasets = data.filter(function(x) {return x.type == 'Inline';});
            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("editInlineDatasetAppTileView", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/edit-inline-dataset.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
        }
    }
});

app.directive("editAnyDatasetAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/edit-any-dataset.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            DataikuAPI.datasets.listHeaders($stateParams.projectKey).success(function(data) {
                $scope.datasets = data;
            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("editAnyDatasetAppTileView", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/edit-any-dataset.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
        }
    }
});

app.directive("editAnyStreamingEndpointAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/edit-any-streaming-endpoint.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            return DataikuAPI.streamingEndpoints.listHeads($stateParams.projectKey, {}, true).success(function (data) {
                $scope.streamingEndpoints = data;
            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("editAnyStreamingEndpointAppTileView", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/edit-any-streaming-endpoint.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
        }
    }
});

app.directive("editFsDatasetAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/edit-fs-dataset.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.behaviors = [
                                   {name:'GO_TO_DATASET',                    label:'Go to dataset settings'},
                                   {name:'INLINE_BROWSE_ONLY',               label:'Only browse file'},
                                   {name:'INLINE_BROWSE_AND_REDETECT',       label:'Browse file and automatically redetect format'},
                                   {name:'INLINE_BROWSE_REDETECT_AND_INFER', label:'Browse file and automatically redetect format and infer schema'},
                                   {name:'MODAL_BROWSE_REDETECT_AND_INFER',  label:'Modal to browse file and automatically redetect format and infer schema'}
                               ];
                               
            DataikuAPI.datasets.listHeaders($stateParams.projectKey).success(function(data) {
                $scope.datasets = data.filter(function(x) {return ["HDFS", "Filesystem", "SCP", "SFTP", "FTP", "S3", "GCS", "Azure"].indexOf(x.type) >= 0;});
            }).error(setErrorInScope.bind($scope));
            
            let init = function() {
                if (!$scope.tile.behavior) {
                    $scope.tile.behavior = 'GO_TO_DATASET'; // the default
                }
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
        }
    }
});

app.directive("editFsDatasetAppTileView", function(DataikuAPI, $stateParams, $state, MonoFuture, CreateModalFromTemplate, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/edit-fs-dataset.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {};
            let fetchDataset = function() {
                DataikuAPI.datasets.get($stateParams.projectKey, $scope.tile.datasetName, $stateParams.projectKey).success(function(data){
                    $scope.dataset = data;
                }).error(setErrorInScope.bind($scope));
            };
        
            $scope.browse = function (path) {
                if (path == null) path = '';
                var configAnchoredAtRoot = angular.copy($scope.dataset.params);
                // We discard stuff to have a shorter serialized version of our dataset
                configAnchoredAtRoot.path = '';
                
                WT1.event('app-tile-fs-dataset-browse')

                // Ugly workaround. Angular 1.2 unwraps promises (don't understand why)
                // Except if the promise object has a $$v.
                // See https://github.com/angular/angular.js/commit/3a65822023119b71deab5e298c7ef2de204caa13
                // and https://github.com/angular-ui/bootstrap/issues/949
                var promise = DataikuAPI.fsproviders.browse($scope.dataset.type, configAnchoredAtRoot, $stateParams.projectKey, {}, path);
                promise.$$v = promise;
                return promise;
            };
            
            $scope.doTest = function() {
                let doInfer = $scope.tile.behavior.indexOf('INFER') >= 0;
                let doDetect = $scope.tile.behavior.indexOf('REDETECT') >= 0;
                let commitChangesDirectly = $scope.tile.behavior.startsWith("INLINE_");
                WT1.event('app-tile-fs-dataset-test', {infer:doInfer, detect:doDetect, save:commitChangesDirectly})
                if (doDetect) {
                    MonoFuture($scope).wrap(DataikuAPI.datasets.testAndDetectFormat)($stateParams.projectKey, $scope.dataset, doDetect, doInfer).success(function(data) {
                        $scope.detectionResults = data.result;
                        if (data.result.connectionOK && !data.result.empty) {
                            $scope.dataset.formatType = data.result.format.type;
                            $scope.dataset.formatParams = data.result.format.params;
                            if (doInfer) {
                                $scope.dataset.schema = data.result.format.schemaDetection.detectedSchema;
                            }
                            if (commitChangesDirectly) {
                                DataikuAPI.datasets.save($stateParams.projectKey, $scope.dataset, {}).success(function(data) {
                                    fetchDataset();
                                }).error(setErrorInScope.bind($scope));
                            }
                        }
                    }).update(function(data) {
                    }).error(function (data, status, headers) {
                        setErrorInScope.bind($scope)(data, status, headers);
                    });
                } else {
                    if (commitChangesDirectly) {
                        DataikuAPI.datasets.save($stateParams.projectKey, $scope.dataset, {}).success(function(data) {
                            fetchDataset();
                        }).error(setErrorInScope.bind($scope));
                    }
                }
            };
            
            $scope.openModal = function() {
                WT1.event('app-tile-fs-dataset-modal')
                CreateModalFromTemplate("/templates/apps/tiles/view/edit-fs-dataset-modal.html", $scope, null, function(modalScope) {
                    modalScope.goToDataset = function() {
                        modalScope.dismiss();
                        $state.go('projects.project.datasets.dataset.settings', {datasetName : $scope.tile.datasetName});
                    };
                    modalScope.doTestIfNeeded = function() {
                        if ($scope.uiState.autoTestOnFileSelection) {
                            $scope.doTest();
                        }
                    };
                    modalScope.commit = function() {
                        DataikuAPI.datasets.save($stateParams.projectKey, $scope.dataset, {}).success(function(data) {
                            fetchDataset();
                        }).error(setErrorInScope.bind($scope));
                        modalScope.dismiss();
                    };
                    
                    modalScope.$watch('dataset.params.previewFile', modalScope.doTestIfNeeded, true);
                    modalScope.$watch('dataset.params.filesSelectionRules', modalScope.doTestIfNeeded, true);
                });
            };
        
            let init = function() {
                fetchDataset();
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
        
        }
    }
});

app.directive("editFolderAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/edit-folder.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.behaviors = [
                                   {name:'GO_TO_FOLDER',  label:'Go to folder settings'},
                                   {name:'INLINE_BROWSE', label:'Browse folder location'},
                                   {name:'MODAL_BROWSE', label:'Modal to browse folder location'}
                               ];
                               
            DataikuAPI.managedfolder.list($stateParams.projectKey).success(function(data) {
                $scope.folders = data;
            }).error(setErrorInScope.bind($scope));
            
            let init = function() {
                if (!$scope.tile.behavior) {
                    $scope.tile.behavior = 'GO_TO_FOLDER'; // the default
                }
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
        }
    }
});

app.directive("editFolderAppTileView", function(DataikuAPI, $state, $stateParams, MonoFuture, CreateModalFromTemplate, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/edit-folder.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {};
            let fetchFolder = function() {
                DataikuAPI.managedfolder.get($stateParams.projectKey, $stateParams.projectKey, $scope.tile.folderId).success(function(data){
                    $scope.folder = data;
                }).error(setErrorInScope.bind($scope));
            };

            $scope.browse = function (path) {
                if (path == null) path = '';
                var configAnchoredAtRoot = angular.copy($scope.folder.params);
                // We discard stuff to have a shorter serialized version of our folder
                configAnchoredAtRoot.path = '';

                WT1.event('app-tile-folder-browse')

                // Ugly workaround. Angular 1.2 unwraps promises (don't understand why)
                // Except if the promise object has a $$v.
                // See https://github.com/angular/angular.js/commit/3a65822023119b71deab5e298c7ef2de204caa13
                // and https://github.com/angular-ui/bootstrap/issues/949
                var promise = DataikuAPI.fsproviders.browse($scope.folder.type, configAnchoredAtRoot, $stateParams.projectKey, {odbId:$scope.tile.folderId}, path);
                promise.$$v = promise;
                return promise;
            };
            
            $scope.doTest = function() {
                WT1.event('app-tile-folder-save')
                DataikuAPI.managedfolder.save($scope.folder).success(function(data) {
                    fetchFolder();
                }).error(setErrorInScope.bind($scope));
            };
            
            $scope.openModal = function() {
                WT1.event('app-tile-folder-modal')
                CreateModalFromTemplate("/templates/apps/tiles/view/edit-folder-modal.html", $scope, null, function(modalScope) {
                    modalScope.goToFolder = function() {
                        modalScope.dismiss();
                        $state.go('projects.project.managedfolders.managedfolder.settings', { odbId: $scope.tile.folderId});
                    };
                    modalScope.commit = function() {
                        $scope.doTest();
                        modalScope.dismiss();
                    };
                });
            };
        
            let init = function() {
                fetchFolder();
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
        
        }
    }
});

app.directive("editSqlDatasetAppTileEdit", function(DataikuAPI, $stateParams, DatasetUtils, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/edit-sql-dataset.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.behaviors = [
                                   {name:'GO_TO_DATASET',                    label:'Go to dataset settings'},
                                   {name:'INLINE_BROWSE_ONLY',               label:'Only browse table'},
                                   {name:'INLINE_BROWSE_AND_INFER',          label:'Browse table and automatically redetect schema'},
                                   {name:'MODAL_BROWSE_AND_INFER',           label:'Modal to browse table and automatically redetect schema'}
                               ];
                               
            DataikuAPI.datasets.listHeaders($stateParams.projectKey).success(function(data) {
                $scope.datasets = data.filter(function(x) {return DatasetUtils.isSQLTable(x) && !x.managed;});
            }).error(setErrorInScope.bind($scope));
            
            let init = function() {
                if (!$scope.tile.behavior) {
                    $scope.tile.behavior = 'GO_TO_DATASET'; // the default
                }
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
        }
    }
});

app.directive("editSqlDatasetAppTileView", function(DataikuAPI, $state, $stateParams, FutureWatcher, CreateModalFromTemplate, WT1, Logger, $q) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/edit-sql-dataset.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {fetching:false};

            let fetchDataset = function() {
                DataikuAPI.datasets.get($stateParams.projectKey, $scope.tile.datasetName, $stateParams.projectKey).success(function(data){
                    $scope.dataset = data;
                }).error(setErrorInScope.bind($scope));
            };
        
            $scope.uiState.tableList = null;
            $scope.uiState.schemaList = null;
            $scope.fetchTableList = function() {
                WT1.event('app-tile-sql-dataset-fetch-tables', {type:$scope.dataset.type})
                $scope.uiState.fetching = true;
                if ($scope.dataset.type == 'hiveserver2') {
                    DataikuAPI.connections.listHiveMassImportTables($scope.dataset.params.connection, $stateParams.projectKey).success(function(data) {
                        if (data.hasResult) {
                            $scope.uiState.fetching = false;
                            $scope.uiState.tableList = data.result.tables;
                        } else {
                            FutureWatcher.watchJobId(data.jobId)
                                .success(function(data) {
                                    $scope.uiState.fetching = false;
                                    $scope.uiState.tableList = data.result.tables;
                                }).update(function(data) {
                                    $scope.uiState.fetching = true;
                                }).error(function(a, b, c) {
                                    $scope.uiState.fetching = false;
                                    setErrorInScope.bind($scope)(a, b, c);    
                                });
                        }
                    }).error(function(a, b, c) {
                        $scope.uiState.fetching = false;
                        setErrorInScope.bind($scope)(a, b, c);    
                    });
                } else {
                    DataikuAPI.connections.listSQLMassImportTables($scope.dataset.params.connection, $scope.dataset.params.catalog, $scope.dataset.params.schema, $stateParams.projectKey).success(function(data) {
                        if (data.hasResult) {
                            $scope.uiState.fetching = false;
                            $scope.uiState.tableList = data.result.tables;
                        } else {
                            FutureWatcher.watchJobId(data.jobId)
                                .success(function(data) {
                                    $scope.uiState.fetching = false;
                                    $scope.uiState.tableList = data.result.tables;
                                }).update(function(data) {
                                    $scope.uiState.fetching = true;
                                }).error(function(a, b, c) {
                                    $scope.uiState.fetching = false;
                                    setErrorInScope.bind($scope)(a, b, c);    
                                });
                        }
                    }).error(function(a, b, c) {
                        $scope.uiState.fetching = false;
                        setErrorInScope.bind($scope)(a, b, c);    
                    });
                }
            };
            $scope.fetchSchemaList = function() {
                WT1.event('app-tile-sql-dataset-fetch-schemas')
                if ($scope.dataset.type == 'hiveserver2') {
                    DataikuAPI.connections.getHiveNames($stateParams.projectKey).success(function(data) {
                        $scope.uiState.schemaList = data;
                    }).error(function(a, b, c) {
                        setErrorInScope.bind($scope)(a, b, c);    
                    });
                } else {
                    DataikuAPI.connections.listSQLMassImportSchemas($scope.dataset.params.connection, $stateParams.projectKey).success(function(data) {
                        $scope.uiState.schemaList = data;
                    }).error(function(a, b, c) {
                        setErrorInScope.bind($scope)(a, b, c);    
                    });
                }
            };
                    
            $scope.doTest = function(dataset) {
                var deferred = $q.defer();
                let doInfer = $scope.tile.behavior.indexOf('INFER') >= 0;
                WT1.event('app-tile-sql-dataset-test', {infer:doInfer})
                if (doInfer) {
                    DataikuAPI.datasets.externalSQL.test($stateParams.projectKey, dataset, 10, false, true).success(function(data) {
                        $scope.detectionResults = data;
                        if (data.connectionOK) {
                            dataset.schema = data.schemaDetection.detectedSchema;
                            deferred.resolve('done inference');
                        } else {
                            deferred.reject('failed inference');
                        }
                    }).error(function (data, status, headers) {
                        setErrorInScope.bind($scope)(data, status, headers);
                        deferred.reject('failed test');
                    });
                } else {
                    deferred.resolve('no inference');
                }
                return deferred.promise;
            };
            $scope.doTestAndCommit = function(dataset) {
                $scope.doTest(dataset).then(function() {
                    DataikuAPI.datasets.save($stateParams.projectKey, dataset, {}).success(function(data) {
                        fetchDataset();
                    }).error(setErrorInScope.bind($scope));
                }, function(msg) {
                    Logger.error("Not saving dataset, " + msg);
                });
            };
            
            $scope.openModal = function() {
                WT1.event('app-tile-sql-dataset-modal')
                CreateModalFromTemplate("/templates/apps/tiles/view/edit-sql-dataset-modal.html", $scope, null, function(modalScope) {
                    modalScope.dataset = angular.copy($scope.dataset);
                    
                    modalScope.goToDataset = function() {
                        modalScope.dismiss();
                        $state.go('projects.project.datasets.dataset.settings', {datasetName : $scope.tile.datasetName});
                    };
                    modalScope.commit = function() {
                        $scope.dataset = modalScope.dataset;
                        modalScope.dismiss();
                    };
                    
                    modalScope.doTestNow = function() {
                        $scope.doTest(modalScope.dataset);
                    };
                    modalScope.doTestIfNeeded = function() {
                        if ($scope.uiState.autoTestOnTableSelection) {
                            $scope.doTest(modalScope.dataset);
                        }
                    };
                    
                    modalScope.$watch('dataset.params.table', modalScope.doTestIfNeeded);
                    modalScope.$watch('dataset.params.schema', modalScope.doTestIfNeeded);
                });
            };
            
            
            let init = function() {
                fetchDataset();
                $scope.$watch("dataset.params.table", function(nv, ov) {
                    if (ov && nv && ov != nv) {
                        $scope.doTestAndCommit($scope.dataset);
                    }
                });
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
        }
    }
});

app.directive("dashboardLinkAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/dashboard-link.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            DataikuAPI.dashboards.listHeads($stateParams.projectKey, {}).success(function(data) {
                $scope.dashboards = data.items;
            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("dashboardLinkAppTileView", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/dashboard-link.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.dashboard = null;
            $scope.$watch('tile.dashboardId', function() {
                if ($scope.dashboard == null && $scope.tile && $scope.tile.dashboardId) {
                    DataikuAPI.dashboards.get($stateParams.projectKey, $scope.tile.dashboardId).success(function(data) {
                        $scope.dashboard = data;
                    }).error(setErrorInScope.bind($scope));
                }
            });
        }
    }
});

app.directive("runScenarioAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/run-scenario.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            DataikuAPI.scenarios.listAccessible().success(function(data) {
                $scope.scenarios = data.filter(function(s) {return s.projectKey == $stateParams.projectKey;});
            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("runScenarioAppTileView", function(DataikuAPI, $stateParams, $state, Notification, FutureWatcher, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/run-scenario.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {};
            
            $scope.runNow = function() {
                WT1.event('app-tile-scenario-run')
                $scope.uiState.running = false; // start from a clean state. You shouldn't be able to arrive here if $scope.uiState.running = true
                // run and send to scenario's "last runs" tab
                DataikuAPI.scenarios.manualRun($stateParams.projectKey, $scope.tile.scenarioId, {}, true, true).success(function(data) {
                    if (data.hasResult) {
                        $scope.uiState.running = false;
                        $scope.uiState.lastRun = data.result.scenarioRun;
                    } else {
                        FutureWatcher.watchJobId(data.jobId)
                            .success(function(data) {
                                $scope.uiState.running = false;
                                $scope.uiState.lastRun = data.result.scenarioRun;
                            }).update(function(data) {
                                $scope.uiState.running = true;
                                $scope.uiState.lastRun = data.scenarioRun;
                            }).error(function(a, b, c) {
                                $scope.uiState.running = false;
                                setErrorInScope.bind($scope)(a, b, c);    
                            });
                    }
                }).error(setErrorInScope.bind($scope));
            };
            
            $scope.goToCurrentRun = function() {
                WT1.event('app-tile-scenario-current-run')
                $state.go('projects.project.scenarios.scenario.runs.list', {projectKey : $stateParams.projectKey, scenarioId : $scope.tile.scenarioId});
            };
            $scope.goToLastRun = function() {
                WT1.event('app-tile-scenario-last-run')
                $state.go('projects.project.scenarios.scenario.runs.list.run', {projectKey : $stateParams.projectKey, scenarioId : $scope.tile.scenarioId, runId : $scope.uiState.lastRun.runId});
            };
            
            // get the current state (running or not) to show the 
            DataikuAPI.scenarios.getLastScenarioRuns($stateParams.projectKey, $scope.tile.scenarioId, true, 1).success(function(data) {
                $scope.uiState.lastRun = data.length > 0 ? data[0] : null;
                $scope.uiState.running = $scope.uiState.lastRun && $scope.uiState.lastRun.futureId != null;
                if ($scope.uiState.running) {
                    // wait for the notif
                    var unRegister = Notification.registerEvent("scenario-state-change", function(evt, message) {
                        if (message.scenarioId != $scope.tile.scenarioId || message.projectKey != $stateParams.projectKey) return;
                        $scope.uiState.running = message.state == 'RUNNING';
                    });
                    $scope.$on("$destroy", unRegister);
                }
            }).error(setErrorInScope.bind($scope)).noSpinner();
        }
    }
});

app.directive("editProjectVariablesAppTileEdit", function(CodeMirrorSettingService) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/edit-project-variables.html',
        scope: {
            tile : '=',
            noBehavior: '='
        },
        link : function($scope, element, attrs) {
            $scope.codeMirrorSettingService = CodeMirrorSettingService;
            $scope.behaviors = [
                                   {name:'MODAL',                label:'Open modal to edit'},
                                   {name:'INLINE_EXPLICIT_SAVE', label:'Edit inline with explicit save'},
                                   {name:'INLINE_AUTO_SAVE',     label:'Edit inline with auto-save'}
                               ];
            $scope.hasCustomUI = function(tile) {
                if (tile.$useCustomUI !== undefined) return tile.$useCustomUI;
                return tile.html || tile.js || tile.python;
            };
            $scope.useCustomUI = function(tile) {
                tile.$useCustomUI = true;
            };
            $scope.dontUseCustomUI = function(tile) {
                tile.$useCustomUI = false;
                tile.html = null;
                tile.js = null;
                tile.python = null;
            };
            
            let init = function() {
                if (!$scope.tile.behavior) {
                    $scope.tile.behavior = 'MODAL'; // the default
                }
                if (!$scope.tile.params) {
                    $scope.tile.params = [
                                             {name:"variable1", label:"nice label in the form", type:"STRING", description:"Help text for the variable"},
                                             {name:"variable2", label:"another label", type:"INT"},
                                             {name:"variable3", label:"some selector", type:"SELECT", selectChoices:[{value:"val1", label:"First"}, {value:"val2", label:"Second"}]}
                                         ];
                }
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
            
        }
    }
});

app.directive("editProjectVariablesAppTileView", function(DataikuAPI, $stateParams, Debounce, $q, $templateCache, CreateModalFromTemplate, PluginConfigUtils, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/edit-project-variables.html',
        scope: {
            tile : '=',
            sharedConfig: '=',
            columnsPerInputRole: '=', // passed in app-as-recipe forms
            recipeConfig: '=' // passed in app-as-recipe forms
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {isCustom:null, standardVariables:null, localVariables:null, pluginId:null, componentId:null, sessionId:null};
            if ($scope.recipeConfig && $scope.recipeConfig.type) {
                // form in an app-as-recipe instance
                $scope.uiState['pluginId'] = '__dku_app_as_recipe_tile_' + $scope.recipeConfig.type.substring(4); // trim the "App_" prefix
            } else {
                // form in an app instance
                $scope.uiState['pluginId'] = '__dku_app_tile_' + $stateParams.projectKey;
            }
            $scope.config = null;
            
            let doInit = function() {
                if ($scope.tile == null || $scope.sharedConfig == null) return;
                
                PluginConfigUtils.setDefaultValues($scope.tile.params, $scope.sharedConfig);
                /* In addition to default values, set properly the columns stuff */
                $scope.tile.params.forEach(function(param) {
                    if ($scope.sharedConfig[param.name] === undefined) {
                        if ( param.type == "COLUMNS" ) {
                            // the dku-list-typeahead expects something not null
                            $scope.sharedConfig[param.name] = [];
                        }
                    }
                    if (param.columnRole != null) {
                        $scope.columnsPerInputRole[param.columnRole] = [];
                    }
                });
                
                $scope.uiState.isCustom = $scope.tile.html != null && $scope.tile.html.trim().length > 0;
                // let's abuse the componentId, but not send the entire tile (otherwise you'd be able to do remote python exec)
                if ($scope.recipeConfig && $scope.recipeConfig.type) {
                    $scope.uiState.componentId = JSON.stringify({});
                } else {
                    $scope.uiState.componentId = JSON.stringify({section:$scope.tile.$sectionIdx, tile:$scope.tile.$tileIdx});
                }
                if ($scope.tile.js) {
                    eval($scope.tile.js);
                    if ($scope.tile.module) {
                        app.registerModule($scope.tile.module);
                    }
                }
                if ($scope.tile.html) {
                    $scope.uiState.templateKey = 'app_tile_template_' + $stateParams.projectKey + '_' + $scope.tile.$sectionIdx + '_' + $scope.tile.$tileIdx + '.html';
                    $templateCache.put($scope.uiState.templateKey, $scope.tile.html);
                }
                
                if ($scope.tile.behavior == 'INLINE_EXPLICIT_SAVE') {
                    // edit a separate object, that is commited when the save button is clicked
                    $scope.config = angular.copy($scope.sharedConfig);
                    $scope.originalConfig = angular.copy($scope.sharedConfig);
                } else {
                    $scope.config = $scope.sharedConfig;
                }
            };
            
            if ($scope.tile == null || $scope.sharedConfig == null) {
                $scope.deregisterInit = $scope.$watch("[tile,sharedConfig]", function() {
                    if ($scope.tile == null || $scope.sharedConfig == null) return;
                    
                    doInit();
                    
                    if ($scope.deregisterInit) {
                        $scope.deregisterInit();
                    }
                }, true);
            } else {
                doInit();
            }

            // commiting for the 'explicit save' behavior                    
            $scope.save = function() {
                WT1.event('app-tile-project-variables-save')
                if ($scope.tile.behavior == 'INLINE_EXPLICIT_SAVE') {
                    // only copy what has changed w.r.t. the beginning of the edition (ie only the params that this tile touches)
                    let oldKeys = Object.keys($scope.originalConfig);
                    let newKeys = Object.keys($scope.config);
                    let deleted = oldKeys.filter(k => newKeys.indexOf(k) < 0)
                    let updated = oldKeys.filter(k => newKeys.indexOf(k) >= 0 && !angular.equals($scope.originalConfig[k], $scope.config[k]))
                    let created = newKeys.filter(k => oldKeys.indexOf(k) < 0)
                    deleted.forEach(k => delete $scope.sharedConfig[k]);
                    created.forEach(k => $scope.sharedConfig[k] = angular.copy($scope.config[k]));
                    updated.forEach(k => $scope.sharedConfig[k] = angular.copy($scope.config[k]));
                }
            };
            
            /*****
             * python callback
             *****/
            // This function is called when fetching data for custom forms.
            // See in the documentation: Fetching data for custom forms.
            // the pluginId and componentId are "fakes" that the backend redirects to the appropriate tile
            $scope.callPythonDo = function(payload) {
                var deferred = $q.defer();
                DataikuAPI.plugins.callPythonDo($scope.uiState.sessionId, $scope.uiState.pluginId, $scope.uiState.componentId, $scope.config, payload, $scope.recipeConfig, $stateParams.projectKey, null).success(function(data) {
                    $scope.uiState.sessionId = data.sessionId;
                    deferred.resolve(data.data);
                }).error(function(a, b, c) {
                    setErrorInScope.bind($scope)(a,b,c);
                    deferred.reject("Failed to get test result for ui");
                });
                return deferred.promise;
            };
            
            /*****
             * for edition in a modal
             *****/
             $scope.openVariableEditor = function() {
                WT1.event('app-tile-project-variables-modal')
                CreateModalFromTemplate("/templates/apps/tiles/view/edit-project-variables-modal.html", $scope, null, function(modalScope) {
                    modalScope.tile = $scope.tile;
                    modalScope.uiState = $scope.uiState;
                    modalScope.config = angular.copy($scope.config);
                    modalScope.commit = function() {
                        angular.copy(modalScope.config, $scope.config); // deepcopy in place :D
                        modalScope.dismiss();
                    };
                });
             };
        }
    }
});

app.directive("propagateSchemaAppTileEdit", function(DataikuAPI, $stateParams, CodeMirrorSettingService) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/propagate-schema.html',
        scope: {
            tile: '=',
            behaviors: '=?'
        },
        link : function($scope, element, attrs) {
            if (!$scope.behaviors) {
                $scope.behaviors = [
                    {name:'MANUAL',           label:'Run manually'},
                    {name:'AUTO_NO_BUILD',    label:'Run automatically unless building is needed'},
                    {name:'AUTO_WITH_BUILDS', label:'Run fully automatically'}
                ];
            }

            $scope.codeMirrorSettingService = CodeMirrorSettingService;
            let init = function() {
                if (!$scope.tile.behavior) {
                    $scope.tile.behavior = $scope.behaviors[0].name; // the default
                }
                if (!$scope.tile.recipeUpdateOptions) {
                    $scope.tile.recipeUpdateOptions = {};
                }
                if (!$scope.tile.partitionByDim) {
                    $scope.tile.partitionByDim = [];
                }
                if (!$scope.tile.partitionByComputable) {
                    $scope.tile.partitionByComputable = [];
                }
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
            
        }
    }
});

app.directive("propagateSchemaAppTileView", function(DataikuAPI, $stateParams, $state, FutureProgressModal, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/propagate-schema.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {runningId:null};
            $scope.startNow = function() {
                WT1.event('app-tile-propagate-schema', {behavior:$scope.tile.behavior})
                if ($scope.tile.behavior == 'MANUAL') {
                    if ($scope.uiState.runningId) {
                        DataikuAPI.flow.tools.setActive($stateParams.projectKey, $scope.uiState.runningId).success(function(data) {
                            $state.go("projects.project.flow");
                        }).error(setErrorInScope.bind($scope));
                    } else {
                        DataikuAPI.flow.tools.start($stateParams.projectKey, 'PROPAGATE_SCHEMA', {projectKey:$stateParams.projectKey, datasetName:$scope.tile.datasetName, recipeUpdateOptions:$scope.tile.recipeUpdateOptions, excludedRecipes:$scope.tile.excludedRecipes}).success(function(data) {
                            $state.go("projects.project.flow");
                        }).error(setErrorInScope.bind($scope));
                    }
                    DataikuAPI.flow.tools.getSessions($stateParams.projectKey).success(function(data) {
                        angular.forEach(data.active, function(tool, toolId) {
                            if (tool.type == 'PROPAGATE_SCHEMA') {
                                $scope.uiState.runningId = toolId;
                            }
                        });
                    }).error(setErrorInScope.bind($scope));
                } else {
                    DataikuAPI.flow.tools.propagateSchema.runAutomatically($stateParams.projectKey, $scope.tile.datasetName, $scope.tile.behavior == 'AUTO_WITH_BUILDS', $scope.tile.recipeUpdateOptions, $scope.tile.excludedRecipes, $scope.tile.partitionByDim, $scope.tile.partitionByComputable, $scope.tile.markAsOkRecipes).success(function(data) {
                        FutureProgressModal.show($scope, data, "Propagate schema").then(function(data) {
                            console.log("done ok", data);
                        }, function(data) {
                            console.log("done ko", data);
                            setErrorInScope.bind($scope)(data);
                        });
                    }).error(setErrorInScope.bind($scope));
                }
            };
        }
    }
});

app.directive("downloadDatasetAppTileEdit", function(DataikuAPI, $stateParams, ExportService, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/download-dataset.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            DataikuAPI.datasets.listHeaders($stateParams.projectKey).success(function(data) {
                $scope.datasets = data;
            }).error(setErrorInScope.bind($scope));
            
            let setExportParams = function(params) {
                $scope.tile.exportParams = params;
            }
            ExportService.initExportBehavior($scope, {}, {advancedSampling : true, partitionListLoader: null}, $scope.tile, null, $scope.tile.exportParams, setExportParams);
        }
    }
});

app.directive("downloadDatasetAppTileView", function(DataikuAPI, $stateParams, ExportUtils, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/download-dataset.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.downloadNow = function() {
                WT1.event('app-tile-download-dataset')
                DataikuAPI.datasets.exportDS($stateParams.projectKey, $stateParams.projectKey, $scope.tile.datasetName, $scope.tile.exportParams).success(function(data) {
                    ExportUtils.defaultHandleExportResult($scope, $scope.tile.exportParams, data);
                }).error(setErrorInScope.bind($scope));
            };
        }
    }
});

app.directive("downloadDashboardAppTileEdit", function(DataikuAPI, $stateParams, GRAPHIC_EXPORT_OPTIONS, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/download-dashboard.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs, formCtrl) {
            $scope.exportFormController = formCtrl;
            // Utilities that give us all the choices possible
            $scope.paperSizeMap = GRAPHIC_EXPORT_OPTIONS.paperSizeMap;
            $scope.orientationMap = GRAPHIC_EXPORT_OPTIONS.orientationMap;
            $scope.fileTypes = GRAPHIC_EXPORT_OPTIONS.fileTypes;
        
            DataikuAPI.dashboards.listHeads($stateParams.projectKey, {}).success(function(data) {
                $scope.dashboards = data.items;
            }).error(setErrorInScope.bind($scope));
            
            $scope.$watch("tile", function() {
                if ($scope.tile && !$scope.tile.format) {
                    $scope.tile.format = {fileType:'PDF', paperSize:'A4', orientation:'LANDSCAPE'};
                }
            });
        }
    }
});

app.directive("downloadDashboardAppTileView", function(DataikuAPI, $stateParams, FutureProgressModal, ActivityIndicator, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/download-dashboard.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {};
            $scope.downloadNow = function() {
                WT1.event('app-tile-download-dashboard')
                let exported = {dashboardId:$scope.tile.dashboardId};
                DataikuAPI.dashboards.export($stateParams.projectKey, $scope.tile.format, [exported]).success(function (data) {
                    $scope.uiState.running = true;
                    
                    FutureProgressModal.show($scope, data, "Export dashboard").then(function (result) {
                        $scope.uiState.running = false;
                        if (result) { // undefined in case of abort
                            downloadURL(DataikuAPI.dashboards.getExportURL(result.projectKey, result.exportId));
                            ActivityIndicator.success("Dashboard export downloaded!", 5000);
                        } else {
                            ActivityIndicator.error("Export dashboard failed", 5000);
                        }
                    }).finally(function() {
                        $scope.uiState.running = false;
                    });
                }).error(setErrorInScope.bind($scope));
            };
        }
    }
});

app.directive("downloadFolderAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/download-folder.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            DataikuAPI.managedfolder.list($stateParams.projectKey).success(function(data) {
                $scope.folders = data;
            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("downloadFolderAppTileView", function(DataikuAPI, $stateParams, ExportUtils, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/download-folder.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.downloadNow = function() {
                WT1.event('app-tile-download-folder', {full:!$scope.tile.itemPath})
                if ($scope.tile.itemPath) {
                    DataikuAPI.managedfolder.getItemInfo($stateParams.projectKey, $scope.tile.folderId, $scope.tile.itemPath).success(function(data) {
                        if (data.isDirectory) {
                            downloadURL(DataikuAPI.managedfolder.getDownloadFolderURL($stateParams.projectKey, $stateParams.projectKey, $scope.tile.folderId, $scope.tile.itemPath));
                        } else {
                            downloadURL(DataikuAPI.managedfolder.getDownloadItemURL($stateParams.projectKey, $stateParams.projectKey, $scope.tile.folderId, $scope.tile.itemPath));
                        }
                    }).error(setErrorInScope.bind($scope));
                } else {
                    downloadURL(DataikuAPI.managedfolder.getDownloadFolderURL($stateParams.projectKey, $stateParams.projectKey, $scope.tile.folderId, '/'));
                }
            };
        }
    }
});

app.directive("downloadReportAppTileEdit", function(DataikuAPI, $stateParams, RMARKDOWN_ALL_OUTPUT_FORMATS, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/download-report.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.formats = RMARKDOWN_ALL_OUTPUT_FORMATS;
        
            DataikuAPI.reports.listHeads($stateParams.projectKey, {}).success(function(data) {
                $scope.reports = data.items;
            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("downloadReportAppTileView", function(DataikuAPI, $stateParams, FutureProgressModal, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/download-report.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {};
            $scope.downloadNow = function() {
                WT1.event('app-tile-download-report')
                DataikuAPI.reports.prepareDownload($stateParams.projectKey, $scope.tile.reportId, $scope.tile.format).success(function(initialResponse) {
                    $scope.uiState.running = true;
                    
                    FutureProgressModal.show($scope, initialResponse, "Preparing download").then(function(result) {
                        $scope.uiState.running = false;
                        downloadURL(DataikuAPI.reports.getDownloadReportURL($stateParams.projectKey, $scope.tile.reportId, $scope.tile.format));
                    }).finally(function() {
                        $scope.uiState.running = false;
                    });
                }).error(setErrorInScope.bind($scope));
            };
        }
    }
});

app.directive("folderLinkAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/folder-link.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            DataikuAPI.managedfolder.list($stateParams.projectKey).success(function(data) {
                $scope.folders = data;
            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("folderLinkAppTileView", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/folder-link.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.folder = null;
            $scope.$watch('tile.folderId', function() {
                if ($scope.folder == null && $scope.tile && $scope.tile.folderId) {
                    DataikuAPI.managedfolder.get($stateParams.projectKey, $stateParams.projectKey, $scope.tile.folderId).success(function(data) {
                        $scope.folder = data;
                    }).error(setErrorInScope.bind($scope));
                }
            });
        }
    }
});

app.directive("variableDisplayAppTileEdit", function(CodeMirrorSettingService) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/variable-display.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.codeMirrorSettingService = CodeMirrorSettingService;
        }
    }
});

app.directive("variableDisplayAppTileView", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/variable-display.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {};
            
            let init = function() {
                DataikuAPI.variables.expandExpr($stateParams.projectKey, $scope.tile.content || '').success(function(data) {
                    $scope.uiState.expanded = data.id;
                }).error(setErrorInScope.bind($scope));
            };
            if ($scope.tile) {
                init();
            } else {
                let deregister = $scope.$watch('tile', function() {
                    if ($scope.tile) {
                        init();
                        deregister();
                    } 
                });
            }
        }
    }
});

app.directive("guessTrainDeployAppTileEdit", function(DataikuAPI, $stateParams, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/edit/guess-train-deploy.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            DataikuAPI.savedmodels.list($stateParams.projectKey).success(function(data) {
                $scope.models = data.filter(function(m) {return m.projectKey == $stateParams.projectKey;});
            }).error(setErrorInScope.bind($scope));
        }
    }
});

app.directive("guessTrainDeployAppTileView", function(DataikuAPI, $stateParams, $state, Notification, FutureProgressModal, WT1) {
    return {
        restrict: 'A',
        templateUrl : '/templates/apps/tiles/view/guess-train-deploy.html',
        scope: {
            tile : '='
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {};
            
            $scope.runNow = function() {
                WT1.event('app-tile-guess-train-deploy')
                DataikuAPI.savedmodels.guessTrainDeploy($stateParams.projectKey, $scope.tile.modelId).success(function(data) {
                    FutureProgressModal.show($scope, data, "Guess, train and redeploy");
                }).error(setErrorInScope.bind($scope));
            };
            
            $scope.model = null;
            $scope.$watch('tile.modelId', function() {
                if ($scope.model == null && $scope.tile && $scope.tile.modelId) {
                DataikuAPI.savedmodels.get($stateParams.projectKey, $scope.tile.modelId).success(function(data) {
                    $scope.model = data;
                }).error(setErrorInScope.bind($scope));
                }
            });
            
        }
    }
});


}()); 