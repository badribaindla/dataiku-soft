(function() {
'use strict';

const app = angular.module('dataiku.plugins', ['dataiku.filters', 'dataiku.plugindev']);

app.filter('extractGitRefGroup', function() {
    return function(input) {
        return input.split('/', 2)[1] === 'heads' ? "Branch" : "Tag";
    }
});


app.filter('extractGitRefName', function() {
    var namePattern = /(?:.+?\/){2}(.+)$/;
    return function(input) {
        let match;
        if (match = namePattern.exec(input)) {
            return match[1];
        } else {
            return input;
        }
    }
});


app.directive('pluginContributionList', function() {
    return {
        restrict : 'E',
        templateUrl : '/templates/plugins/modals/plugin-contribution-list.html',
        scope : {
            pluginContent : '='
        }
    };
});


app.directive('checkNewPluginIdUnique', function() {
    return {
        require: 'ngModel',
        scope : true,
        link: function(scope, elem, attrs, ngModel) {
            function apply_validation(value) {
                ngModel.$setValidity('uniqueness', true);
                // It is fake, but other check will get it.
                if (value == null || value.length === 0) return value;
                var valid = true;
                if(scope.uniquePluginIds) {
                	valid = scope.uniquePluginIds.indexOf(value) < 0;
                }
                ngModel.$setValidity('uniqueness', valid);
                return value;
            }
            //For DOM -> model validation
            ngModel.$parsers.unshift(apply_validation);

            //For model -> DOM validation
            ngModel.$formatters.unshift(function(value) {
                apply_validation(value);
                return value;
            });
        }
    };
});


app.controller("PluginController", function($scope, $controller, $state, $stateParams, DataikuAPI, CreateModalFromTemplate, SpinnerService, TopNav, Assert, FutureWatcher, WT1) {


    TopNav.setLocation(TopNav.DSS_HOME, 'plugin');

    $scope.pluginsUIState = $scope.pluginsUIState || {};

    $controller("PlugindevCommonController", { $scope: $scope });
    $scope.isInstallingOrUpdatingPlugin = function () {
        return $state.includes('plugin.installation') || $state.includes("plugin.installationfromgit") ||
               $state.includes('plugin.update') || $state.includes('plugin.upload') || $state.includes('plugin.upload.update') ||  $state.includes("plugin.updatefromgit")
    };


    $scope.pluginCanBeUninstalled = function() {
        if (!$scope.pluginData) return false;
        return ($scope.pluginData.installedDesc.origin !== 'BUILTIN')
            && ($scope.pluginData.installedDesc.origin !== 'DEV');
    }
    $scope.pluginCanBeMovedToDev = function() {
        if (!$scope.pluginData) return false;
        return $scope.pluginData.installedDesc.origin != 'BUILTIN';
    };

    $scope.pluginCanBeUpdated = function() {
        if (!$scope.pluginData || !$scope.pluginData.storeDesc) return false;
        return $scope.pluginData.storeDesc.storeFlags.downloadable === true;
    };

    $scope.moveToDev = function() {
        CreateModalFromTemplate("/templates/plugins/modals/move-plugin-to-dev.html", $scope, null, function(modalScope) {
            modalScope.go = function() {
                const pluginId = $scope.pluginData.installedDesc.desc.id;
                SpinnerService.lockOnPromise(DataikuAPI.plugins.moveToDev(pluginId)
                    .success(function (data) {
                        if (!data.success){
                            $scope.installationError = data.installationError;
                        } else {
                            $state.transitionTo('plugindev.definition', {pluginId});
                        }
                    }).error(setErrorInScope.bind($scope)));
            };
        });
    };

    $scope.getPlugin = function() {
        DataikuAPI.plugins.get($stateParams.pluginId).then(
            function (data) {
                $scope.pluginData = data.data;
                $scope.initContentTypeList($scope.pluginData);
            },
            setErrorInScope.bind($scope)
        );
    };

    $scope.previewUninstallPlugin = function() {
        Assert.trueish($scope.pluginData.installedDesc.origin !== 'BUILTIN', "Plugin is BUILTIN");
        Assert.trueish($scope.pluginData.installedDesc.origin !== 'DEV', "Plugin is DEV");
        var handlePluginDeleted = function(pluginId) {
            WT1.event("plugin-delete", { pluginId : pluginId });
            $state.transitionTo('plugins.installed');
        }
        var handlePluginDeletionFailed = function(data, status, headers) {
            $scope.state = "FAILED";
            $scope.failure = {
                message: getErrorDetails(data, status, headers).detailedMessage
            }
        }

        CreateModalFromTemplate("/templates/plugins/modals/uninstall-plugin-confirm.html", $scope, null, function(newScope) {
            const pluginId = $scope.pluginData.installedDesc.desc.id;
            DataikuAPI.plugins.prepareDelete(pluginId).success(function(usageStatistics) {
                newScope.pluginName = $scope.pluginData.installedDesc.desc.meta.label;
                newScope.usageStatistics = usageStatistics;
                newScope.confirmPluginUninstall = function() {
                    DataikuAPI.plugins.delete(pluginId, true).success(function(initialResponse) {
                        if (initialResponse && initialResponse.jobId && !initialResponse.hasResult) {                        
                            FutureWatcher.watchJobId(initialResponse.jobId).success(function() {
                                handlePluginDeleted(pluginId);
                            }).error(handlePluginDeletionFailed);
                        } else {
                            handlePluginDeleted(pluginId);
                        }
                    }).error(handlePluginDeletionFailed);
                }
            });
        });
    };

    $scope.validatePluginEnv = function() {
        $scope.pluginEnvUpToDate = true;
    };

    $scope.invalidatePluginEnv = function() {
        $scope.pluginEnvUpToDate = false;
    };

    if ($scope.isInstallingOrUpdatingPlugin()) {
        $scope.pluginLabel = $stateParams.pluginId;
    }

    if (!$scope.isInstallingOrUpdatingPlugin()) {
        $scope.getPlugin();
    }
});


app.controller("PluginSummaryController", function ($scope, $filter) {

    $scope.filterQuery = { userQuery: '' };
    $scope.filteredContent = {};

    function filterContent(pluginInstallDesc) {
        let filteredContent = {};
        let types = $scope.getComponentsTypeList(pluginInstallDesc);
        types.forEach(function(type) {
            let filteredComponents = $filter('filter')(pluginInstallDesc.content[type], $scope.filterQuery.userQuery);
            if (filteredComponents.length) {
                filteredContent[type] = filteredComponents;
            }
        });
        // Add feature flags as "fake components"
        if (pluginInstallDesc.desc.featureFlags) {
            const matchingFeatureFlag = $filter('filter')(pluginInstallDesc.desc.featureFlags, $scope.filterQuery.userQuery);
            if (matchingFeatureFlag.length > 0) {
                filteredContent['featureFlags'] = $filter('filter')(pluginInstallDesc.desc.featureFlags, $scope.filterQuery.userQuery);
                // Put in the same format as other components for simpler templates
                filteredContent['featureFlags'] = filteredContent['featureFlags'].map(featureFlag => ({ id: featureFlag }));
            }
        }
        return filteredContent;
    }

    function filterContentOnChange() {
        let pluginData = $scope.pluginData;

        if (pluginData && pluginData.installedDesc.content) {
            $scope.filteredContent = filterContent(pluginData.installedDesc);
        } else {
            $scope.filteredContent = {};
        }
    }

    $scope.$watch('pluginData', filterContentOnChange, true);

    $scope.$watch('filterQuery.userQuery', filterContentOnChange, true);

    $scope.getComponentsTypeListFiltered = function() {
        return Object.keys($scope.filteredContent);
    };
});


app.controller("PluginSettingsController", function ($scope, PluginConfigUtils, DataikuAPI, WT1, $stateParams, CreateModalFromTemplate, Dialogs) {

    $scope.pluginsUIState = $scope.pluginsUIState || {};
    $scope.pluginsUIState.settingsPane = $stateParams.selectedTab || 'parameters';

    $scope.hooks = {};

    $scope.setPluginSettings = function (settings) {
        $scope.originalPluginSettings = settings;
        $scope.pluginSettings = angular.copy($scope.originalPluginSettings);
        if ($scope.hooks.settingsSet) {
            $scope.hooks.settingsSet();
        }
    }

    function refreshPluginDesc() {

        if (!$stateParams.pluginId || $scope.installed) {
            return;
        }
        DataikuAPI.plugins.get($stateParams.pluginId, $scope.projectKey).success(function(data) {
            $scope.installed = data.installedDesc;

            if ($scope.installed.desc.params && data.settings.config) {
                PluginConfigUtils.setDefaultValues($scope.installed.desc.params, data.settings.config);
            }
            $scope.setPluginSettings(data.settings);
        }).error(setErrorInScope.bind($scope));
    }

    refreshPluginDesc();

    // Provide a project key to save params at project-level. Defaulty saving at global level
    $scope.savePluginSettings = function(projectKey) {
        DataikuAPI.plugins.saveSettings($scope.pluginData.installedDesc.desc.id, projectKey, $scope.pluginSettings).success(function(data) {

            if (data.error) {
                Dialogs.infoMessagesDisplayOnly($scope, "Update result", data);
            } else {
                // make sure dirtyPluginSettings says it's ok to avoid checkChangesBeforeLeaving complaining
                $scope.originalPluginSettings = angular.copy($scope.pluginSettings);
                $scope.pluginData.settings = $scope.originalPluginSettings;
                WT1.event("plugin-settings-changed", { pluginId : $scope.pluginData.installedDesc.desc.id });
            }
        }).error(setErrorInScope.bind($scope));

    };

    $scope.getParameterSetDesc = function(type) {
        return $scope.installed.customParameterSets.filter(function(parameterSetDesc) {return parameterSetDesc.elementType == type;})[0];
    };

    $scope.getAppTemplateDesc = function(type) {
        return $scope.installed.customAppTemplates.filter(function(appTemplateDesc) {return appTemplateDesc.elementType == type;})[0];
    };

    $scope.deletePreset = function(preset) {
        let index = $scope.pluginSettings.presets.indexOf(preset);
        if (index >= 0) {
            $scope.pluginSettings.presets.splice(index, 1);
        }
    };

    $scope.createPreset = function() {
        CreateModalFromTemplate("/templates/plugins/modals/new-preset.html", $scope, "NewPresetController");
    };

    $scope.dirtyPluginSettings = function() {
        return ($scope.originalPluginSettings !== null && !angular.equals($scope.originalPluginSettings, $scope.pluginSettings));
    };

    $scope.$watch("pluginData", function(nv) {
        if (nv && $scope.pluginData && $scope.pluginData.installedDesc.desc && $scope.pluginData.installedDesc.desc.params) {
            PluginConfigUtils.setDefaultValues($scope.pluginData.installedDesc.desc.params, $scope.pluginData.settings.config);
            $scope.pluginSettings = angular.copy($scope.pluginData.settings);
        }
    });


    $scope.presetsByParameterSet = {};
    $scope.hooks.settingsSet = function() {
        $scope.presetsByParameterSet = {};
        $scope.pluginSettings.parameterSets.forEach(function(parameterSet) {$scope.presetsByParameterSet[parameterSet.name] = [];});
        $scope.pluginSettings.presets.forEach(function(preset) {
            let parameterSet = $scope.pluginSettings.parameterSets.filter(function(parameterSet) {return parameterSet.type == preset.type;})[0];
            if (parameterSet) {
                $scope.presetsByParameterSet[parameterSet.name].push(preset);
            }
        });
    };

    checkChangesBeforeLeaving($scope, $scope.dirtyPluginSettings);
});


app.controller("PluginUsagesController", function ($scope, DataikuAPI, StateUtils) {
    $scope.getUsages = function(projectKey) {
        DataikuAPI.plugins.getUsages($scope.pluginData.installedDesc.desc.id, projectKey).success(function(data) {
            $scope.pluginUsages = data;
            $scope.pluginUsages.columns = ['Kind', 'Component', 'Type', 'Project', 'Object'];
            $scope.pluginUsages.columnWidths = [50, 100, 50, 100, 100];
            $scope.pluginUsages.shownHeight = 10 + 25 * (1 + Math.min(10, $scope.pluginUsages.usages.length));
        }).error(setErrorInScope.bind($scope));
    };

    $scope.computeUsageLink = function(usage) {
        return StateUtils.href.dssObject(usage.objectType.toUpperCase(), usage.objectId, usage.projectKey);
    }
});


app.directive('pluginRequirements', function(DataikuAPI, $rootScope, Dialogs, MonoFuture, WT1) {
    return {
        restrict : 'A',
        templateUrl : '/templates/plugins/plugin-requirements.html',
        scope : {
            pluginDesc: '=',
            settings: '=',
            onValid: '=',
            onInvalid: '='
        },
        link : function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;

            $scope.checkValidity = function() {
                if (!$scope.onValid && !$scope.onInvalid) {
                    return;
                }

                const codeEnvOk = !$scope.pluginDesc.frontendRequirements.codeEnvLanguage || $scope.settings.codeEnvName !== undefined;
                const pythonDepsOK = $scope.pluginDesc.frontendRequirements.pythonPackages.length === 0 || $scope.pluginDesc.frontendRequirements.pythonInstalled;
                const rDepsOk = $scope.pluginDesc.frontendRequirements.rPackages.length === 0 || $scope.pluginDesc.frontendRequirements.rInstalled;
                const customInstallOk = !$scope.pluginDesc.frontendRequirements.installScriptCommand || $scope.pluginDesc.frontendRequirements.customInstalled;

                if (codeEnvOk && pythonDepsOK && rDepsOk && customInstallOk) {
                    $scope.onValid && $scope.onValid();
                } else {
                    $scope.onInvalid && $scope.onInvalid();
                }
            }

            $scope.useCodeEnv = function(envName) {
                DataikuAPI.plugins.useCodeEnv($scope.pluginDesc.desc.id, envName).success(function(data) {
                    WT1.event("plugin-settings-changed", { pluginId : $scope.pluginId });
                    $scope.settings.codeEnvName = envName;
                    $scope.checkValidity();
                }).error(function() {
                    setErrorInScope.call($scope);
                    $scope.onInvalid && $scope.onInvalid();
                });
            };

            $scope.codeEnvs = [];
            if ($scope.pluginDesc.codeEnvLang) {
                // otherwise none of this is needed
                $scope.listCodeEnvs = function() {
                    DataikuAPI.codeenvs.listForPlugins($scope.pluginDesc.desc.id).success(function(data) {
                        $scope.codeEnvs = data;
                        $scope.checkValidity();
                    }).error(function() {
                        setErrorInScope.call($scope);
                        $scope.onInvalid && $scope.onInvalid();
                    });
                };
                $scope.listCodeEnvs();
            }


            $scope.installingFuture = null;
            function go(type){
                $scope.failure = null;
                $scope.installationLog = null;
                $scope.installationResult = null;
                MonoFuture($scope).wrap(DataikuAPI.plugins.installRequirements)($scope.pluginDesc.desc.id, type).success(function(data) {
                    $scope.state = data.result.success ? "DONE" : "FAILED";
                    WT1.event("plugin-requirement-install", {success : $scope.state, type: type});
                    $scope.installationResult = data.result;
                    $scope.installationLog = data.log;
                    $scope.installingFuture = null;

                    if (data.result.success) {
                        $scope.pluginDesc.frontendRequirements.pythonInstalled = $scope.pluginDesc.frontendRequirements.pythonInstalled || type == 'PYTHON';
                        $scope.pluginDesc.frontendRequirements.rInstalled = $scope.pluginDesc.frontendRequirements.rInstalled || type == 'R';
                        $scope.pluginDesc.frontendRequirements.customInstalled = $scope.pluginDesc.frontendRequirements.customInstalled || type == 'CUSTOM_SCRIPT';
                        $scope.checkValidity();
                    } else {
                        $scope.onInvalid && $scope.onInvalid();
                    }
                }).update(function(data) {
                    $scope.state = "RUNNING";
                    $scope.installingFuture = data;
                    $scope.installationLog = data.log;
                }).error(function (data, status, headers) {
                    $scope.state = "FAILED";
                    if (data.aborted) {
                        $scope.failure = {
                            message: "Aborted"
                        }
                    } else if (data.hasResult) {
                        $scope.installationResult = data.result;
                    } else {
                        $scope.failure = {
                            message: "Unexpected error"
                        }
                    }
                    $scope.installingFuture = null;
                    $scope.onInvalid && $scope.onInvalid();
                });
            }

            $scope.abort = function() {
                $scope.state = "FAILED";
                $scope.failure = {
                    message: "Aborted"
                }
                DataikuAPI.futures.abort($scope.installingFuture.jobId);
                $scope.onInvalid && $scope.onInvalid();
            };

            $scope.installRequirements = function(type) {
                var message = '';
                if ($scope.pluginDesc.frontendRequirements.disclaimer) {
                    message = $scope.pluginDesc.frontendRequirements.disclaimer;
                } else {
                    let envType = '';
                    if (type == 'PYTHON') envType = 'the Python environment on ';
                    if (type == 'R') envType = 'the R environment on ';
                    if (type == 'CUSTOM_SCRIPT') envType = '';
                    message = 'This operation will alter the setup of ' + envType + 'the machine running the DSS server, and cannot be reverted.';
                }
                Dialogs.confirmDisclaimer($scope,'Dependencies installation', 'Are you sure you want to install these dependencies?', message).then(function() {
                    go(type);
                });
            };

            $scope.checkValidity();
        }
    };
});


app.directive('pluginCodeEnv', function(DataikuAPI, Dialogs, WT1, FutureProgressModal, $rootScope) {
    return {
        restrict : 'A',
        templateUrl : '/templates/plugins/modals/plugin-code-env.html',
        scope : {
            pluginDesc : '=',
            settings : '=',
            onValid: '=',
            onInvalid: '='
        },
        link : function($scope, element, attrs) {
            $scope.uiState = {
                state: "DISPLAY"
            }

            $scope.addLicInfo = $rootScope.addLicInfo;

            $scope.newEnv = {
                deploymentMode: 'PLUGIN_MANAGED', pythonInterpreter: 'PYTHON27',
                allContainerConfs: false, containerConfs : [],
                allSparkKubernetesConfs: false, sparkKubernetesConfs : []
            };

            $scope.useCodeEnv = function(envName, nextState) {
                DataikuAPI.plugins.useCodeEnv($scope.pluginDesc.desc.id, envName).success(function(data) {
                    WT1.event("plugin-settings-changed", { pluginId : $scope.pluginDesc.desc.id });
                    $scope.settings.codeEnvName = envName;
                    $scope.uiState.state = nextState || 'DISPLAY';
                    $scope.onValid && $scope.onValid();
                }).error(function() {
                    $scope.onInvalid && $scope.onInvalid();
                    setErrorInScope.call($scope);
                });
            };

            $scope.containerNames = [];
            DataikuAPI.containers.listNames().success(function(data){
                $scope.containerNames = data;
            }).error(function () {
                $scope.onInvalid && $scope.onInvalid();
                setErrorInScope.call($scope);
            });
            $scope.sparkKubernetesNames = [];
            DataikuAPI.containers.listSparkNames().success(function(data){
                $scope.sparkKubernetesNames = data;
            }).error(function () {
                $scope.onInvalid && $scope.onInvalid();
                setErrorInScope.call($scope);
            });

            $scope.codeEnvs = [];
            $scope.listCodeEnvs = function() {
                DataikuAPI.codeenvs.listForPlugins($scope.pluginDesc.desc.id).success(function(data) {
                    $scope.codeEnvs = data;
                    if (!$scope.settings.codeEnvName && $scope.codeEnvs.length) {
                        $scope.uiState.state = "SELECT";
                    } else if (!$scope.settings.codeEnvName) {
                        $scope.uiState.state = "CREATE";
                    }
                }).error(function () {
                    $scope.onInvalid && $scope.onInvalid();
                    setErrorInScope.call($scope);
                });
            };
            $scope.listCodeEnvs();

            $scope.isCurrentSelectedEnvUpToDate = function() {
                if (!$scope.settings.codeEnvName) return true;
                var env = $scope.codeEnvs.filter(function(e) {return e.envName == $scope.settings.codeEnvName;})[0];
                if (env == null) return true;
                return env.isUptodate;
            };

            $scope.codeEnvDeploymentModes = [
                ['PLUGIN_MANAGED', "Managed by DSS (recommended)"],
                ['PLUGIN_NON_MANAGED', "Managed manually"]
            ];
            $scope.possiblePythonInterpreters = [];
            if ($scope.pluginDesc.codeEnvSpec) {
                const codeEnvSpec = $scope.pluginDesc.codeEnvSpec;
                if (!codeEnvSpec.forceConda) {
                    $scope.possiblePythonInterpreters = $scope.possiblePythonInterpreters.concat(['CUSTOM']);
                }
                if (codeEnvSpec.acceptedPythonInterpreters && codeEnvSpec.acceptedPythonInterpreters.length > 0) {
                    $scope.possiblePythonInterpreters = $scope.possiblePythonInterpreters.concat(codeEnvSpec.acceptedPythonInterpreters);
                    $scope.newEnv.pythonInterpreter = codeEnvSpec.acceptedPythonInterpreters[0];
                }
            }
            $scope.buildNewCodeEnv = function(newEnv) {
                DataikuAPI.codeenvs.createForPlugin($scope.pluginDesc.desc.id, newEnv).success(function(data) {
                    FutureProgressModal.show($scope, data, "Environment creation", undefined, 'static', false, true).then(function(result){
                        Dialogs.infoMessagesDisplayOnly($scope, "Creation result", result.messages, result.futureLog, undefined, 'static', false);
                        $scope.listCodeEnvs();
                        if (result.envName) {
                            $scope.useCodeEnv(result.envName);
                            $scope.onValid && $scope.onValid();
                        }
                        if (result.messages.error) {
                            $scope.onInvalid && $scope.onInvalid();
                        }
                    });
                }).error(function () {
                    $scope.onInvalid && $scope.onInvalid();
                    setErrorInScope.call($scope);
                });
            };
            $scope.updateCodeEnv = function(envName) {
                DataikuAPI.codeenvs.updateForPlugin($scope.pluginDesc.desc.id, envName).success(function(data) {
                    FutureProgressModal.show($scope, data, "Environment update").then(function(result){
                        Dialogs.infoMessagesDisplayOnly($scope, "Update result", result.messages, result.futureLog);
                        $scope.listCodeEnvs();
                    });
                }).error(function () {
                    $scope.onInvalid && $scope.onInvalid();
                    setErrorInScope.call($scope);
                });
            };
        }
    };
});


app.controller("PluginsExploreController", function ($rootScope, $scope, $controller, DataikuAPI, $state, Assert, CreateModalFromTemplate, WT1, TopNav, FutureWatcher, FutureProgressModal, Dialogs) {
    $controller("PlugindevCommonController", { $scope: $scope });

    TopNav.setLocation(TopNav.DSS_HOME, 'plugins');

    $scope.pluginsUIState = {
        filteredStorePlugins: {},
        filteredInstalledPlugins: {},
        filteredDevelopmentPlugins: {},
        searchQuery: '',
        storeTags: new Map(),
        storeTagsQuery: [],
        storeInstallationStatusQuery: [],
        installedTags: new Map(),
        installedTagsQuery: [],
        developmentTags: new Map(),
        developmentTagsQuery: [],
        showAllStoreTags: false,
        showAllInstalledTags: false,
        showAllDevelopmentTags: false,
        storeSupportLevelQuery: [],
        installedSupportLevelQuery: [],
        storeInstallationStatusCount: new Map(),
        storeSupportLevelsCount: new Map(),
        installedSupportLevelsCount: new Map()
    };

    $scope.pluginsUIState.supportLevels = [
        {
            value: 'SUPPORTED',
            label: 'Supported',
            icon: 'icon-dku-supported'
        },
        {
            value: 'TIER2_SUPPORT',
            label: 'Tier 2 Support',
            icon: 'icon-dku-half-supported'
        }
    ];

    $scope.uploadedPlugin = {
        isUpdate: false
    };

    $scope.clonePlugin = {
        devMode: false,
        bootstrapMode: "GIT_CLONE",
        path: null,
        customCheckout: true,
    };

    function toggleShowAllTags(tab) {
        $scope.pluginsUIState['showAll' + tab + 'Tags'] = !$scope.pluginsUIState['showAll' + tab + 'Tags'];
    }

    $scope.toggleShowAllStoreTags = toggleShowAllTags.bind(this, 'Store');
    $scope.toggleShowAllInstalledTags = toggleShowAllTags.bind(this, 'Installed');
    $scope.toggleShowAllDevelopmentTags = toggleShowAllTags.bind(this, 'Development');

    /*
     *  Accessible either from the preview installation modal or directly from a plugin card in the store
     */
    $scope.installPlugin = function(pluginToInstall, isUpdate) {

        if ($rootScope.appConfig.admin && pluginToInstall) {

            if (isUpdate === true) {
                $state.transitionTo('plugin.update', {
                    pluginId: pluginToInstall.id
                });
            } else {
                $state.transitionTo('plugin.installation', {
                    pluginId: pluginToInstall.id
                });
            }
            $scope.dismiss && $scope.dismiss();
        }
    };

    $scope.triggerRestart = function() {
        DataikuAPI.plugins.triggerRestart().success(function(data) {
            // 'disconnected' will be shown while the backend restarts
        }).error(function() {
            // this is expected, if the backend dies fast enough and doesn't send the response back
        });
    };

    $scope.getStoreSupportLevelCount = function(supportLevelValue) {
        return $scope.pluginsUIState.storeSupportLevelsCount.get(supportLevelValue) || 0;
    }

    $scope.getInstalledSupportLevelCount = function(supportLevelValue) {
        return $scope.pluginsUIState.installedSupportLevelsCount.get(supportLevelValue) || 0;
    }

    $scope.toggleStoreInstallationStatusFilter = function(installationStatus, event) {
        const installationStatusQuery = $scope.pluginsUIState.storeInstallationStatusQuery;
        const statusPosition = installationStatusQuery.indexOf(installationStatus);

        if (statusPosition > -1) {
            installationStatusQuery.splice(statusPosition, 1);
        } else {
            if (installationStatusQuery.length > 0) {
                installationStatusQuery.splice(0, 1);
                event.preventDefault();
            } else {
                installationStatusQuery.push(installationStatus);
            }
        }
    }

    $scope.isStoreInstallationStatusSelected = function(installationStatus) {
        return $scope.pluginsUIState.storeInstallationStatusQuery.includes(installationStatus);
    }

    $scope.getStoreInstallationStatusCount = function(installationStatus) {
            return $scope.pluginsUIState.storeInstallationStatusCount.get(installationStatus) || 0;
        }


    function toggleSupportFilter(supportLevel, tab) {
        const supportLevelQuery = $scope.pluginsUIState[tab + 'SupportLevelQuery'];
        let supportLevelPosition = supportLevelQuery.indexOf(supportLevel);

        if (supportLevelPosition > -1) {
            supportLevelQuery.splice(supportLevelPosition, 1);
        } else {
            supportLevelQuery.push(supportLevel);
        }
    }

    $scope.toggleStoreSupportFilter = function(supportLevel) {
        toggleSupportFilter(supportLevel, 'store');
    }

    $scope.toggleInstalledSupportFilter = function(supportLevel) {
        toggleSupportFilter(supportLevel, 'installed');
    }

    $scope.isStoreSupportLevelSelected = function (supportName) {
        return $scope.pluginsUIState.storeSupportLevelQuery.includes(supportName);
    }

    $scope.isInstalledSupportLevelSelected = function (supportName) {
        return $scope.pluginsUIState.installedSupportLevelQuery.includes(supportName);
    }

    function toggleTagQuery(tagName, tab) {
        const tagsQuery = $scope.pluginsUIState[tab + 'TagsQuery'];
        const tagPosition = tagsQuery.indexOf(tagName);

        if (tagPosition > -1) {
            tagsQuery.splice(tagPosition, 1);
        } else {
            tagsQuery.push(tagName);
        }
    }

    $scope.toggleStoreTagQuery = function(tagName) {
        toggleTagQuery(tagName, 'store');
    };

    $scope.toggleInstalledTagQuery = function(tagName) {
        toggleTagQuery(tagName, 'installed');
    };

    $scope.toggleDevelopmentTagQuery = function(tagName) {
        toggleTagQuery(tagName, 'development');
    };

    $scope.isStoreTagSelected = function (tagName) {
        return $scope.pluginsUIState.storeTagsQuery.includes(tagName);
    }

    $scope.isInstalledTagSelected = function (tagName) {
        return $scope.pluginsUIState.installedTagsQuery.includes(tagName);
    }

    $scope.isDevelopmentTagSelected = function (tagName) {
        return $scope.pluginsUIState.developmentTagsQuery.includes(tagName);
    }

    $scope.resetStoreInstallationStatusQuery = function() {
        $scope.pluginsUIState.storeInstallationStatusQuery = [];
    }

    function resetTagsQuery(tab) {
        $scope.pluginsUIState[tab + 'TagsQuery'] = [];
    }

    $scope.resetStoreTagsQuery = function() {
        resetTagsQuery('store');
    };

    $scope.resetInstalledTagsQuery = function() {
        resetTagsQuery('installed');
    };

    $scope.resetDevelopmentTagsQuery = function() {
        resetTagsQuery('development');
    };

    function resetSupportLevelQuery(tab) {
        $scope.pluginsUIState[tab + 'SupportLevelQuery'] = [];
    }

    $scope.resetStoreSupportLevelQuery = function() {
        resetSupportLevelQuery('store');
    };

    $scope.resetInstalledSupportLevelQuery = function() {
        resetSupportLevelQuery('installed');
    };

    $scope.resetStoreQuery = function() {
        $scope.resetStoreTagsQuery();
        $scope.resetStoreSupportLevelQuery();
        $scope.pluginsUIState.searchQuery = '';
    };

    $scope.resetInstalledQuery = function() {
        $scope.resetInstalledTagsQuery();
        $scope.resetInstalledSupportLevelQuery();
        $scope.pluginsUIState.searchQuery = '';
    };

    $scope.resetDevelopmentQuery = function() {
        $scope.resetDevelopmentTagsQuery();
        $scope.pluginsUIState.searchQuery = '';
    };

    $scope.reloadAllPlugins = function() {
        Dialogs.confirmSimple($scope, 'Reload all plugins?').then(function() {
            DataikuAPI.plugindev.reloadAll()
                .success(_ => $scope.refreshList())
                .error(setErrorInScope.bind($scope));
        });
    };

    function filterPluginsByInstallationStatus() {
        return function(plugin) {
            const installationStatusList = $scope.pluginsUIState.storeInstallationStatusQuery;
            const hasUserFiltered = installationStatusList && installationStatusList.length > 0;

            // No filter checks: show the plugin.
            if (!hasUserFiltered) {
                return true;
            }

            // Else check if the plugin has one of the checked installation status.
            return installationStatusList.includes(plugin.installed);
        }
    }

    $scope.filterStorePluginsByInstallationStatus = filterPluginsByInstallationStatus.bind(this);

    function filterPluginsBySupportLevel(tab, supportKey) {
        return function(plugin) {
            const supportList = $scope.pluginsUIState[tab + 'SupportLevelQuery'];
            const pluginSupportLevel = resolveValue(plugin, supportKey); // from utils.js
            const hasUserFiltered = supportList && supportList.length > 0;
            const hasSupportLevel = pluginSupportLevel && pluginSupportLevel.length >= 0;

            // No filter checks: show the plugin.
            if (!hasUserFiltered) {
                return true;
            }

            // Plugin has no "support" field (and some support level filters are checked): don't show.
            if (!hasSupportLevel) {
                return false;
            }

            // Else check if the plugin has one of the checked support filter.
            return supportList.includes(pluginSupportLevel);
        };
    }

    $scope.filterStorePluginsBySupportLevel = filterPluginsBySupportLevel.bind(this, 'store', 'storeDesc.meta.supportLevel');
    $scope.filterInstalledPluginsBySupportLevel = filterPluginsBySupportLevel.bind(this, 'installed', 'installedDesc.desc.meta.supportLevel');

    function filterPluginsByTags(tab, tagsKey) {
        return function(plugin) {

            const tagsList = $scope.pluginsUIState[tab + 'TagsQuery'];
            const pluginTags = resolveValue(plugin, tagsKey);
            const hasUserFiltered = tagsList && tagsList.length > 0;
            const hasTags = pluginTags && pluginTags.length > 0;

            // No tags checks : show the plugin
            if (!hasUserFiltered) {
                return true;
            }

            // Plugin has no tag (and some tags are checked) : don't show
            if (!hasTags) {
                return false;
            }

            // Else check if the plugin has one of the checked tags
            let containsATag = false;

            pluginTags.forEach(tag => {
                // Prevent duplicates like "Time series" and "Time Series"
                tag = tag.split(' ').map(word => { return word.charAt(0).toUpperCase() + word.slice(1); }).join(' ');

                if (tagsList.includes(tag)) {
                    containsATag = true;
                }
            });

            return containsATag;
        };
    }

    $scope.filterStorePluginsByTags = filterPluginsByTags.bind(this, 'store', 'storeDesc.meta.tags');
    $scope.filterInstalledPluginsByTags = filterPluginsByTags.bind(this, 'installed', 'installedDesc.desc.meta.tags');
    $scope.filterDevelopmentPluginsByTags = filterPluginsByTags.bind(this, 'development', 'installedDesc.desc.meta.tags');

    $scope.hasNoResultsForStoreQuery = function() {
        const isListEmpty = $scope.pluginsUIState.filteredStorePlugins && $scope.pluginsUIState.filteredStorePlugins.length === 0;
        const hasSearched = $scope.pluginsUIState.searchQuery && $scope.pluginsUIState.searchQuery.length;
        const hasFilteredTags = $scope.pluginsUIState.storeTagsQuery && $scope.pluginsUIState.storeTagsQuery.length;
        const hasFilteredSupport = $scope.pluginsUIState.storeSupportLevelQuery && $scope.pluginsUIState.storeSupportLevelQuery.length;
        const hasFiltered = hasSearched || hasFilteredTags || hasFilteredSupport;

        return isListEmpty && hasFiltered;
    }

    $scope.hasNoResultsForInstalledQuery = function() {
        const isListEmpty = $scope.pluginsUIState.filteredInstalledPlugins && $scope.pluginsUIState.filteredInstalledPlugins.length === 0;
        const hasSearched = $scope.pluginsUIState.searchQuery && $scope.pluginsUIState.searchQuery.length;
        const hasFilteredTags = $scope.pluginsUIState.installedTagsQuery && $scope.pluginsUIState.installedTagsQuery.length;
        const hasFilteredSupport = $scope.pluginsUIState.installedSupportLevelQuery && $scope.pluginsUIState.installedSupportLevelQuery.length;
        const hasFiltered = hasSearched || hasFilteredTags || hasFilteredSupport;

        return isListEmpty && hasFiltered;
    }

    $scope.computePluginOrigin = function(plugin) {
        let origin = '';

        if (plugin.inStore === true) {
            origin = 'Store';
        } else if (plugin.installedDesc.origin) {
            if (plugin.installedDesc.origin === 'INSTALLED') {
                if (plugin.installedDesc.gitState.enabled === true) {
                    origin = 'Git repository';
                } else {
                    origin = 'Uploaded';
                }
            } else if (plugin.installedDesc.origin === 'DEV') {
                origin = 'Local dev';
            } else {
                origin = plugin.installedDesc.origin;
            }
        } else {
            origin = plugin.installedDesc.origin;
        }

        return origin;
    };

    $scope.refreshTags = function() {
        $scope.pluginsUIState.storeTags.clear()
        $scope.pluginsUIState.installedTags.clear()
        $scope.pluginsUIState.developmentTags.clear()
        $scope.pluginsUIState.storeSupportLevelsCount.clear();
        $scope.pluginsUIState.installedSupportLevelsCount.clear();
        $scope.pluginsUIState.storeInstallationStatusCount.clear();

        $scope.pluginsList.plugins.forEach(plugin => {
            if (plugin.storeDesc) {
                if ($scope.pluginsUIState.storeInstallationStatusCount.has(plugin.installed)) {
                    $scope.pluginsUIState.storeInstallationStatusCount.set(plugin.installed, $scope.pluginsUIState.storeInstallationStatusCount.get(plugin.installed) + 1);
                } else {
                    $scope.pluginsUIState.storeInstallationStatusCount.set(plugin.installed, 1);
                }

                const supportLevelValue = plugin.storeDesc.meta && plugin.storeDesc.meta.supportLevel;
                if (supportLevelValue) {
                    if ($scope.pluginsUIState.storeSupportLevelsCount.has(supportLevelValue)) {
                        $scope.pluginsUIState.storeSupportLevelsCount.set(supportLevelValue, $scope.pluginsUIState.storeSupportLevelsCount.get(supportLevelValue) + 1);
                    } else {
                        $scope.pluginsUIState.storeSupportLevelsCount.set(supportLevelValue, 1);
                    }
                }

                plugin.storeDesc.meta && plugin.storeDesc.meta.tags && plugin.storeDesc.meta.tags.forEach(tag => {
                    // Prevent duplicates like "Time series" and "Time Series"
                    tag = tag.split(' ').map(word => { return word.charAt(0).toUpperCase() + word.slice(1); }).join(' ');

                    if ($scope.pluginsUIState.storeTags.has(tag)) {
                        $scope.pluginsUIState.storeTags.set(tag, $scope.pluginsUIState.storeTags.get(tag) + 1);
                    } else {
                        $scope.pluginsUIState.storeTags.set(tag, 1);
                    }
                });
            }

            if (plugin.installedDesc) {

                const supportLevelValue = plugin.installedDesc.desc.meta && plugin.installedDesc.desc.meta.supportLevel;

                if (supportLevelValue) {
                    if ($scope.pluginsUIState.installedSupportLevelsCount.has(supportLevelValue)) {
                        $scope.pluginsUIState.installedSupportLevelsCount.set(supportLevelValue, $scope.pluginsUIState.installedSupportLevelsCount.get(supportLevelValue) + 1);
                    } else {
                        $scope.pluginsUIState.installedSupportLevelsCount.set(supportLevelValue, 1);
                    }
                }

                plugin.installedDesc.desc.meta && plugin.installedDesc.desc.meta.tags && plugin.installedDesc.desc.meta.tags.forEach(tag => {
                    // Prevent duplicates like "Time series" and "Time Series"
                    tag = tag.split(' ').map(word => { return word.charAt(0).toUpperCase() + word.slice(1); }).join(' ');

                    if ($scope.pluginsUIState.installedTags.has(tag)) {
                        $scope.pluginsUIState.installedTags.set(tag, $scope.pluginsUIState.installedTags.get(tag) + 1);
                    } else {
                        $scope.pluginsUIState.installedTags.set(tag, 1);
                    }

                    if (plugin.installedDesc.origin === 'DEV') {
                        if ($scope.pluginsUIState.developmentTags.has(tag)) {
                            $scope.pluginsUIState.developmentTags.set(tag, $scope.pluginsUIState.developmentTags.get(tag) + 1);
                        } else {
                            $scope.pluginsUIState.developmentTags.set(tag, 1);
                        }
                    }
                });
            }
        });

        // Sort by descending quantity
        $scope.pluginsUIState.storeTags = new Map([...$scope.pluginsUIState.storeTags.entries()].sort((a, b) => b[1] - a[1]));
        $scope.pluginsUIState.installedTags = new Map([...$scope.pluginsUIState.installedTags.entries()].sort((a, b) => b[1] - a[1]));
        $scope.pluginsUIState.developmentTags = new Map([...$scope.pluginsUIState.developmentTags.entries()].sort((a, b) => b[1] - a[1]));
    };

    $scope.refreshList = function(forceFetch) {
        if ($scope.pluginsList && forceFetch === false) {
            return;
        }

        DataikuAPI.plugins.list(forceFetch).success(function(data) {
            $scope.pluginsList = data;

            $scope.refreshTags();

            $scope.pluginsUIState.storePluginsCount = 0;
            $scope.pluginsUIState.developedPluginsCount = 0;
            $scope.pluginsUIState.installedPluginsCount = 0;

            $scope.pluginsList.plugins.forEach(plugin => {
                if (plugin.storeDesc) {
                    $scope.pluginsUIState.storePluginsCount++;
                }

                if (plugin.installedDesc) {
                    $scope.pluginsUIState.installedPluginsCount++;
                    if (plugin.installedDesc.origin === 'DEV') {
                        $scope.pluginsUIState.developedPluginsCount++;
                    }
                    if ( (plugin.installedDesc.origin !== 'BUILTIN') && (plugin.installedDesc.origin !== 'DEV') ) {
                        plugin.uninstallable = true;
                    }
                }
                if (plugin.installed && plugin.installedDesc && plugin.storeDesc && plugin.storeDesc.storeFlags.downloadable === true && plugin.storeDesc.storeVersion && plugin.installedDesc.desc.version && plugin.storeDesc.storeVersion > plugin.installedDesc.desc.version) {
                    plugin.updateAvailable = true;
                }
            });

            const supportLevelMap = {SUPPORTED: 2, TIER2_SUPPORT: 1, NOT_SUPPORTED: 0, NONE: -1};
            function rank(plugin) {
                const updateAvailable = plugin.updateAvailable ? 1 : 0;
                const notInstalled = plugin.installed ? 0 : 1;
                const desc = plugin.storeDesc||{};
                const meta = desc.meta||{};
                const supportLevel = supportLevelMap[meta.supportLevel||'NONE'];
                return [updateAvailable, notInstalled, supportLevel];
            }
            $scope.pluginsList.plugins.sort((a,b) => rank(a) > rank(b) ? -1 : 1);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.previewInstallStorePlugin = function(plugin) {
        Assert.trueish(plugin.inStore, "Plugin not in store");
        CreateModalFromTemplate("/templates/plugins/modals/plugin-install-preview.html", $scope, null, function(newScope) {
            newScope.attachDownloadTo = $scope;
            newScope.isUpdate = plugin.installed;
            if (plugin.installed) {
                newScope.installedVersion = plugin.installedDesc.desc.version;
            }
            newScope.uiState = { activeTab: 'details' };
            $scope.initContentTypeList(plugin);
            newScope.storePlugin = plugin.storeDesc;
            newScope.contentTypes = Object.keys(newScope.storePlugin.content);
        });
    };

    $scope.previewUninstallPlugin = function(plugin) {
        Assert.trueish(plugin.installedDesc.origin !== 'BUILTIN', "Plugin is BUILTIN");
        Assert.trueish(plugin.installedDesc.origin !== 'DEV', "Plugin is DEV");

        var handlePluginDeleted = function(pluginId) {
            WT1.event("plugin-delete", { pluginId : pluginId });
            $scope.reload();
        }

        var handlePluginDeletionFailed = function(data, status, headers) {
            WT1.event("plugin-delete", { pluginId : pluginId });
            $scope.reload();
        }


        CreateModalFromTemplate("/templates/plugins/modals/uninstall-plugin-confirm.html", $scope, null, function(newScope) {
            DataikuAPI.plugins.prepareDelete(plugin.id).success(function(usageStatistics) {
                newScope.pluginName = plugin.installedDesc.desc.meta.label;
                newScope.usageStatistics = usageStatistics;
                newScope.confirmPluginUninstall = function() {
                    DataikuAPI.plugins.delete(plugin.id, true).success(function(initialResponse) {
                        if (initialResponse && initialResponse.jobId && !initialResponse.hasResult) {                        
                            FutureWatcher.watchJobId(initialResponse.jobId).success(function() {
                                handlePluginDeleted(plugin.id);
                            }).error(handlePluginDeletionFailed);
                        } else {
                            handlePluginDeleted(plugin.id);
                        }
                    }).error(handlePluginDeletionFailed);
            }
            }).error(setErrorInScope.bind($scope));
    
        });
    };

    $scope.seePluginStoreDetails = function(plugin) {
        Assert.trueish(plugin.inStore, "Plugin not in store");
        $scope.uiState = { activeTab: 'details' };
        const modal = CreateModalFromTemplate("/templates/plugins/modals/plugin-see-details.html", $scope, null, function(newScope) {
            $state.go('plugins.store', Object.assign({}, $state.params, {pluginid: plugin.id}), { notify: false })
            newScope.attachDownloadTo = $scope;
            newScope.isUpdate = plugin.installed;
            if (plugin.installed) {
                newScope.installedVersion = plugin.installedDesc.desc.version;
            }
            $scope.initContentTypeList(plugin);
            $scope.plugin = plugin;
            newScope.storePlugin = plugin.storeDesc;
            newScope.contentTypes = Object.keys(newScope.storePlugin.content);
        });
        modal.catch(() => {
            $state.go('plugins.store', Object.assign({}, $state.params, {pluginid: null}), { notify: false });
        });
    };

    $scope.newZippedPlugin = function() {
        CreateModalFromTemplate('/templates/plugins/modals/new-plugin-from-desktop.html', $scope);
    };

    $scope.newGitPlugin = function() {
        CreateModalFromTemplate('/templates/plugins/modals/new-plugin-from-git.html', $scope);
    };

    $scope.newDevPlugin = function() {
        CreateModalFromTemplate("/templates/plugins/development/new-devplugin.html", $scope);
    };

    $scope.uploadPlugin = function(){
        if ($scope.uploadedPlugin.file && $scope.uploadedPlugin.file != '') {
            let fileName = $scope.uploadedPlugin.file.name;
            if ($scope.uploadedPlugin.isUpdate) {
                $state.transitionTo('plugin.upload.update', {
                    pluginId: fileName,
                    uploadedPluginFile: $scope.uploadedPlugin.file
                });
            } else {
                $state.transitionTo('plugin.upload', {
                    pluginId: fileName,
                    uploadedPluginFile: $scope.uploadedPlugin.file
                });
            }
        }
    };

    $scope.previewPullPlugin = function(plugin) {
        CreateModalFromTemplate("/templates/plugins/modals/plugin-preview-pull.html", $scope, null, function(newScope) {
            newScope.attachDownloadTo = $scope;
            if (plugin.installed) {
                newScope.installedVersion = plugin.installedDesc.desc.version;
            }
            newScope.gitPlugin = angular.copy(plugin.installedDesc);
            newScope.update = () => {
                $state.transitionTo('plugin.updatefromgit', {
                    uri: newScope.gitPlugin.gitState.repository,
                    checkout: newScope.gitPlugin.gitState.checkout,
                    path: newScope.gitPlugin.gitState.path
                });
            }
        });
    };

    $scope.cloneAndCreate = function() {
        if ($scope.clonePlugin.devMode) {
            DataikuAPI.plugindev.create('', $scope.clonePlugin.bootstrapMode, $scope.clonePlugin.uri,
                $scope.clonePlugin.checkout, $scope.clonePlugin.path).success(function(data) {
                FutureProgressModal.show($scope, data, "Creating plugin", undefined, 'static', false, true).then(function(result){
                    if (result) {
                        WT1.event("plugin-dev-create");
                        $scope.goToDevPluginDetails(result.details);
                    }
                });
            }).error(setErrorInScope.bind($scope));
        } else {
            $state.transitionTo("plugin.installationfromgit", {
                uri: $scope.clonePlugin.uri,
                checkout: $scope.clonePlugin.checkout,
                path: $scope.clonePlugin.path
            })
        }
    };

    $scope.reload = function(){
        location.reload();
    };

    $scope.refreshPluginLists = function() {
        $scope.refreshList(true);
    };

    $scope.goToPluginDetails = function (pluginId) {
        $state.transitionTo('plugin.summary', { pluginId: pluginId });
    }

    $scope.goToDevPluginDetails = function (pluginId) {
        $state.transitionTo('plugindev.definition', { pluginId: pluginId });
    }

    $scope.goToDevPluginEditor = function (pluginId) {
        $state.transitionTo('plugindev.editor', { pluginId: pluginId });
    }

    $scope.deletePluginAndReloadPage = function (pluginId) {
        $scope.deletePlugin(pluginId, $scope.reload);
    }

    // shortcut to force the list refresh
    Mousetrap.bind("r l", function() {
        $scope.refreshList(true);
    });

    $scope.$on("$destroy", function() {
        Mousetrap.unbind("r l");
    });

    $scope.refreshList(false);

    if ($state.is('plugins')) {
        $state.transitionTo('plugins.store');
    }
});

app.controller("PluginsStoreController", ($scope, $stateParams) => {
    let unwatchPluginsList = undefined;
    const displayPlugin = (pluginId = $stateParams.pluginid) => {
        const pluginFound = $scope.pluginsList.plugins.find(p => p.id === pluginId);
        if (pluginFound) {
            $scope.seePluginStoreDetails(pluginFound);
        }
    }

    if ($stateParams.pluginid) {
        if ($scope.pluginsList === undefined) {
            unwatchPluginsList = $scope.$watch('pluginsList', newVal => {
                if (!newVal) {
                    return;
                }
                unwatchPluginsList();
                unwatchPluginsList = undefined;
                displayPlugin();
            });
        } else {
            displayPlugin();
        }
    }

    $scope.$on("$destroy", () => {
        if (unwatchPluginsList) {
            unwatchPluginsList();
        }
    });
});

app.controller("PluginPreviewPullController", function($rootScope, $scope, Assert) {
    $scope.error = null;

    $scope.go = function() {

        if (!$rootScope.appConfig.admin) {
            return;
        }

        Assert.trueish($scope.gitPlugin, "Git plugin not ready");

        $state.transitionTo('plugin.updatefromgit', {
            uri: $scope.gitPlugin.gitState.repository,
            checkout: $scope.gitPlugin.gitState.checkout,
            path: $scope.gitPlugin.gitState.path
        });
    };
});

app.controller("PluginInstallationController", function ($scope, DataikuAPI, MonoFuture, Fn, WT1, $state, $stateParams, FutureWatcher, ProgressStackMessageBuilder) {
    $scope.state = "NOT_STARTED";
    $scope.environmentState = 'NOT_STARTED';
    $scope.pluginId = $stateParams.pluginId;
    $scope.isGit = $state.includes("plugin.installationfromgit") || $state.includes("plugin.updatefromgit");
    $scope.isUpdate = $state.includes('plugin.update') || $state.includes('plugin.upload.update') || $state.includes("plugin.updatefromgit");
    $scope.isUploadUpdate = $state.includes('plugin.upload.update');
    $scope.isUpload = $state.includes('plugin.upload') || $scope.isUploadUpdate;
    $scope.isCodeEnvDefined = false;
    let uploadedPluginFile = $stateParams.uploadedPluginFile;

    function go() {
        MonoFuture($scope).wrap(DataikuAPI.plugins.install)($scope.pluginId, $scope.isUpdate).success(function(data) {
            $scope.state = data.result.success ? "DONE" : "FAILED";
            WT1.event("plugin-download", { success : $scope.state });

            if (!data.result.success) {
                $scope.failure = {
                    message: data.result.installationError.detailedMessage,
                    isAlreadyInstalled: data.result.installationError.detailedMessage.includes('already installed')
                }
            } else {
                $scope.pluginDesc = data.result.pluginDesc;
                $scope.$parent.pluginLabel = data.result.pluginDesc.desc.meta.label;
                $scope.pluginSettings = data.result.settings;
                $scope.needsRestart = data.result.needsRestart
                $scope.isCodeEnvDefined = !!($scope.pluginDesc && ($scope.pluginDesc.frontendRequirements.hasDependencies || $scope.pluginDesc.frontendRequirements.codeEnvLanguage));
            }

            $scope.installingFuture = null;
        }).update(function(data) {
            $scope.state = "RUNNING";
            $scope.installingFuture = data;
        }).error(function (data, status, headers) {
            $scope.state = "FAILED";
            if (data.aborted) {
                $scope.failure = {
                    message: "Aborted"
                }
            } else if (data.hasResult) {
                $scope.failure = {
                    message: data.result.errorMessage
                }
            } else {
                $scope.failure = {
                    message: "Unexpected error"
                }
            }
            $scope.installingFuture = null;
        });
    }

    function goFromGit() {
        $scope.state = 'RUNNING';

        var handleCloneInstallationError = function (data, status, headers) {
            $scope.state = "FAILED";
            $scope.failure = {
                message: getErrorDetails(data, status, headers).detailedMessage
            }
        };

        var handleCloneInstallationResult = function (data) {
            const result = data.result;
            WT1.event("plugin-clone", {success: $scope.state});

            if (!result.success) {
                $scope.state = "FAILED";
                $scope.failure = {
                    message: result.installationError.detailedMessage
                }
            } else {
                $scope.state = "DONE";
                $scope.pluginDesc = result.pluginDesc;
                $scope.$parent.pluginLabel = result.pluginDesc.desc.meta.label;
                $scope.pluginSettings = result.settings;
                $scope.needsRestart = result.needsRestart
                $scope.isCodeEnvDefined = !!($scope.pluginDesc && ($scope.pluginDesc.frontendRequirements.hasDependencies || $scope.pluginDesc.frontendRequirements.codeEnvLanguage));
                unregisterPluginIdWatcher();
                $scope.pluginId = result.pluginDesc.desc.id;
            }
        };
        DataikuAPI.plugins.clonePlugin($stateParams.uri, $stateParams.checkout, $stateParams.path, $scope.isUpdate).success(function(data) {
            FutureWatcher.watchJobId(data.jobId)
                .success(handleCloneInstallationResult)
                .update(function (data) {
                    $scope.clonePercentage = ProgressStackMessageBuilder.getPercentage(data.progress);
                    $scope.cloneLabel = ProgressStackMessageBuilder.build(data.progress, true);
                }).error(handleCloneInstallationError);
        }).error(setErrorInScope.bind($scope));
    }

    function upload () {
        $scope.state = 'RUNNING';
        DataikuAPI.plugins.uploadPlugin(uploadedPluginFile, $scope.isUploadUpdate).then(function (data) {
            data = JSON.parse(data);

            $scope.state = data.success ? 'DONE' : 'FAILED';

            WT1.event('plugin-upload', {success : $scope.state });

            if (!data.success) {
                $scope.failure = {
                    message: data.installationError.detailedMessage
                }
            } else {
                $scope.pluginDesc = data.pluginDesc;
                $scope.$parent.pluginLabel = data.pluginDesc.desc.meta.label;
                $scope.pluginSettings = data.settings;
                $scope.needsRestart = data.needsRestart
                $scope.isCodeEnvDefined = !!($scope.pluginDesc && ($scope.pluginDesc.frontendRequirements.hasDependencies || $scope.pluginDesc.frontendRequirements.codeEnvLanguage));
                unregisterPluginIdWatcher();
                $scope.pluginId = data.pluginDesc.desc.id;
            }

        }, function(payload) {
            $scope.state = "FAILED";
            let errorMessage;

            try {
                const parsedResponse = JSON.parse(payload.response);
                errorMessage = parsedResponse.detailedMessage;
            } catch (exception) {
                errorMessage = 'An unknown error ocurred during the file upload.'
            }

            $scope.failure = {
                message: errorMessage
            }
        });
    }

    $scope.abort = function() {
        $scope.state = "FAILED";
        $scope.failure = {
            message: "Aborted"
        }
        DataikuAPI.futures.abort($scope.installingFuture.jobId);
    };

    $scope.skipEnvironmentCreation = function() {
        $scope.state = 'DONE';
        $scope.environmentState = 'SKIPPED';
    }

    $scope.approveEnvironmentCreation = function() {
        $scope.environmentState = 'WAITING_CONFIRMATION';
    }

    $scope.disapproveEnvironmentCreation = function() {
        $scope.environmentState = 'NOT_STARTED';
    }

    $scope.confirmEnvironmentCreation = function() {
        $scope.environmentState = 'DONE';
    }

    $scope.goToPluginPage = function() {
        window.location = $state.href('plugin.summary', { pluginId: $scope.pluginId });
    };

    $scope.$on("$destroy", function(){
        if ($scope.state == "RUNNING") {
            $scope.abort();
        }
    });

    $scope.triggerRestart = function() {
        $state.go('plugin.summary', { pluginId: $scope.pluginId }, { reload: true });
        DataikuAPI.plugins.triggerRestart().success(function(data) {
            // 'disconnected' will be shown while the backend restarts
        }).error(function() {
            // this is expected, if the backend dies fast enough and doesn't send the response back
        });
    };

    let unregisterPluginIdWatcher = $scope.$watch("pluginId", Fn.doIfNv($scope.isGit ? goFromGit : ($scope.isUpload ? upload : go)));
});


app.controller("PluginLearnMoreController", function ($scope) {
    $scope.customDatasets = $scope.appConfig.customDatasets.filter(function(x){
        return x.ownerPluginId == $scope.pluginDesc.id;
    });
    $scope.customRecipes = $scope.appConfig.customCodeRecipes.filter(function(x){
        return x.ownerPluginId == $scope.pluginDesc.id;
    });
});

/* Permissions */
app.directive('pluginPresetSecurityPermissions', function(PermissionsService) {
    return {
        restrict : 'A',
        templateUrl : '/templates/plugins/plugin-preset-security-permissions.html',
        scope : {
            preset  : '='
        },
        link : function($scope, element, attrs) {
            $scope.ui = {};

            $scope.securityPermissionsHooks = {};
            $scope.securityPermissionsHooks.makeNewPerm = function() {
                return {
                    use: false
                };
            };
            $scope.securityPermissionsHooks.fixupPermissionItem = function(p) {
                p.$useDisabled = false;
            };
            $scope.securityPermissionsHooks.fixupWithDefaultPermissionItem = function(p, d) {
                if (d.use || d.$useDisabled) {
                    p.$useDisabled = true;
                }
            };

            $scope.$watch("preset.owner", function() {
                $scope.ui.ownerLogin = $scope.preset.owner;
            });

            // Ownership mgmt
            $scope.$watch("ui.ownerLogin", function() {
                PermissionsService.transferOwnership($scope, $scope.preset, "preset");
            });
        }
    };
});


app.directive('pluginParameterSetSecurityPermissions', function() {
    return {
        restrict : 'A',
        templateUrl : '/templates/admin/plugins/plugin-parameter-set-security-permissions.html',
        scope : {
            parameterSet  : '='
        },
        link : function($scope, element, attrs) {
            $scope.securityPermissionsHooks = {};
            $scope.securityPermissionsHooks.makeNewPerm = function() {
                return {
                    definableAtProjectLevel: false,
                    definableInline: false
                };
            };
            $scope.securityPermissionsHooks.fixupPermissionItem = function(p) {
                p.$definableAtProjectLevelDisabled = false;
                p.$definableInlineDisabled = false;
            };
            $scope.securityPermissionsHooks.fixupWithDefaultPermissionItem = function(p, d) {
                if (d.definableAtProjectLevel || d.$definableAtProjectLevelDisabled) {
                    p.$definableAtProjectLevelDisabled = true;
                }
                if (d.definableInline || d.$definableInlineDisabled) {
                    p.$definableInlineDisabled = true;
                }
            };
        }
    };
});


app.directive('pluginSecurityPermissions', function() {
    return {
        restrict : 'A',
        templateUrl : '/templates/plugins/plugin-security-permissions.html',
        scope : {
            plugin : '='
        },
        link : function($scope, element, attrs) {
            $scope.securityPermissionsHooks = {};
            $scope.securityPermissionsHooks.makeNewPerm = function() {
                return {
                    admin: true
                };
            };
            $scope.securityPermissionsHooks.fixupPermissionItem = function(p) {
                p.$adminDisabled = false;
            };
            $scope.securityPermissionsHooks.fixupWithDefaultPermissionItem = function(p, d) {
                if (d.admin || d.$adminDisabled) {
                    p.$adminDisabled = true;
                }
            };
        }
    };
});


app.directive('securityPermissionsBase', function(DataikuAPI, $rootScope, PermissionsService) {
    return {
        restrict : 'A',
        scope : false,
        link : function($scope, element, attrs) {
            $scope.appConfig = $rootScope.appConfig;

            function makeNewPerm() {
                $scope.newPerm = $scope.securityPermissionsHooks.makeNewPerm();
            }
            const hooksDeregister = $scope.$watch("securityPermissionsHooks", function() {
                if (!$scope.securityPermissionsHooks) return;
                makeNewPerm();
                hooksDeregister();
            }, false);

            const fixupDefaultPermission = function() {
                if (!$scope[attrs.permissionsBearer]) return;
                /* Handle implied permissions */
                $scope.securityPermissionsHooks.fixupPermissionItem($scope[attrs.permissionsBearer].defaultPermission);
            };
            const fixupPermissions = function() {
                if (!$scope[attrs.permissionsBearer] || !$scope.securityPermissionsHooks) return;
                /* Handle implied permissions */
                $scope[attrs.permissionsBearer].permissions.forEach(function(p) {
                    $scope.securityPermissionsHooks.fixupPermissionItem(p);
                    $scope.securityPermissionsHooks.fixupWithDefaultPermissionItem(p, $scope[attrs.permissionsBearer].defaultPermission);
                });
            };

            DataikuAPI.security.listGroups(false).success(function(allGroups) {
                $scope.allGroups = allGroups;
                DataikuAPI.security.listUsers().success(function(data) {
                    $scope.allUsers = data;
                }).error(setErrorInScope.bind($scope));
                $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope[attrs.permissionsBearer], $scope.allGroups);
            }).error(setErrorInScope.bind($scope));

            $scope.addPermission = function() {
                $scope[attrs.permissionsBearer].permissions.push($scope.newPerm);
                makeNewPerm();
            };

            $scope.$watch(attrs.permissionsBearer + ".permissions", function(nv, ov) {
                if (!nv) return;
                $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope[attrs.permissionsBearer], $scope.allGroups);
                fixupPermissions();
            }, true)
            $scope.$watch(attrs.permissionsBearer + ".permissions", function(nv, ov) {
                if (!nv) return;
                $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope[attrs.permissionsBearer], $scope.allGroups);
                fixupPermissions();
            }, false)
            $scope.$watch(attrs.permissionsBearer + ".defaultPermission", function(nv, ov) {
                if (!nv) return;
                fixupDefaultPermission();
                fixupPermissions();
            }, true)
            $scope.$watch(attrs.permissionsBearer + ".defaultPermission", function(nv, ov) {
                if (!nv) return;
                fixupDefaultPermission();
                fixupPermissions();
            }, false)
            $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope[attrs.permissionsBearer], $scope.allGroups);
            fixupPermissions();
        }
    };
});


/* Presets */
app.controller("NewPresetController", function($scope) {

    $scope.presetTypes = $scope.pluginSettings.accessibleParameterSetDescs.map(function(p) {
    	return {id:p.elementType, label:(p.desc.meta.label || p.elementType)};
    });
    $scope.newPreset = {type:$scope.presetTypes[0].id, name:'Preset ' + ($scope.pluginSettings.presets.length + 1), permissions : [], visibleByAll : true, usableByAll : false, canAdmin : true, canManage : true};
    $scope.presetNameList = $scope.pluginSettings.presets.map(function(p) {return p.name;});

    $scope.create = function(){
    	$scope.pluginSettings.presets.push($scope.newPreset);
        $scope.dismiss();
    }
});


app.controller("NewPresetInParameterSetController", function($scope) {
    $scope.newPreset = {name:'Preset ' + ($scope.allPresets.length + 1), permissions : [], canAdmin : true, canManage : true};
    $scope.presetNameList = $scope.presets.map(function(p) {return p.name;});

    $scope.create = function() {
        $scope.presets.push($scope.newPreset);
        $scope.allPresets.push($scope.newPreset);
        $scope.dismiss();
    };
});


app.directive('pluginParameterSet', function(CreateModalFromTemplate) {
    return {
        restrict : 'A',
        templateUrl : '/templates/plugins/plugin-parameter-set.html',
        scope : {
            parameterSet : '=',
            parameterSetDesc : '=',
            pluginDesc : '=',
            presets : '=',
            remove : '=',
            allPresets : '='
        },
        link : function($scope, element, attrs) {
            $scope.$watch('allPresets', function() {
                if (!$scope.allPresets) return;
                $scope.presets = $scope.allPresets.filter(function(p) {return p.type == $scope.parameterSet.type;});
            }, true);
            $scope.deletePresetInParameterSet = function(preset) {
                var idxInPlugin = $scope.allPresets.indexOf(preset);
                if (idxInPlugin >= 0) {
                    $scope.allPresets.splice(idxInPlugin, 1);
                }
                var idx = $scope.presets.indexOf(preset);
                if (idx >= 0) {
                    $scope.presets.splice(idx, 1);
                }
            };
            $scope.createPresetInParameterSet = function() {
                CreateModalFromTemplate("/templates/plugins/modals/new-preset.html", $scope, "NewPresetInParameterSetController", function(newScope) {
                    newScope.inParameterSet = true;
                    newScope.newPreset.type = $scope.parameterSet.type;
                });
            };
        }
    };
});


app.directive('pluginPreset', function() {
    return {
        restrict : 'A',
        templateUrl : '/templates/plugins/plugin-preset.html',
        scope : {
            preset : '=',
            parameterSetDesc : '=',
            pluginDesc : '=',
            remove : '='
        },
        link : function($scope) {
        	$scope.$watch('preset', function() {
        		if (!$scope.preset) return;
        		$scope.preset.config = $scope.preset.config || {};
        		$scope.preset.pluginConfig = $scope.preset.pluginConfig || {};
        	});
        }
    };
});

app.directive('pluginAppTemplate', function(DataikuAPI) {
    return {
        restrict : 'A',
        templateUrl : '/templates/plugins/plugin-app-template.html',
        scope : {
            appTemplate : '=',
            appTemplateDesc : '=',
            pluginDesc : '=',
            remove : '='
        },
        link : function($scope, element, attrs) {
    
            $scope.addConnectionRemapping = function(name) {
                $scope.appTemplate.remapping.connections.push({
                    source: name,
                    target: null
                });
            };
            $scope.addCodeEnvRemapping = function(name) {
                $scope.appTemplate.remapping.codeEnvs.push({
                    source: name,
                    target: null
                });
            };
            
            $scope.availableConnections = [];
            DataikuAPI.admin.connections.list().success(function(data) {
                angular.forEach(data, function(c, n) {
                    $scope.availableConnections.push({name:n, type:c.type});
                });
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
        }
    };
});



})();