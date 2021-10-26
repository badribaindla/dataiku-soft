(function () {
'use strict';

var app = angular.module('dataiku.admin', []);


app.controller("AdminGeneralSettingsController", function ($scope, $state, $stateParams, $timeout, $q, DataikuAPI, WT1, ActivityIndicator, TopNav, CodeMirrorSettingService, TaggingService, FutureProgressModal, Dialogs, $rootScope, $filter, GlobalProjectActions) {


    if ($state.is('admin.general')) {
        $state.go('admin.general.themes');
    }

    $scope.httpMethods = ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'HEAD'];

    $scope.virtualWebAppBackendSettingsModes = [{id:"USE_DEFAULT", label:"Run as local processes"}, {id:"EXPLICIT", label:"Run in container"}];
    
	if ($stateParams.uiState && uiStates.indexOf($stateParams.uiState) > -1) {
		$scope.uiState.active = $stateParams.uiState;
	}

    $scope.globalVariables = {}
    TopNav.setLocation(TopNav.DSS_HOME, "administration");

    $scope.alationRegister = {
    }

    DataikuAPI.security.listUsers().success(function(data) {
        $scope.allUsers = data;
    }).error(setErrorInScope.bind($scope));

	var savedGeneralSettings, savedGlobalVariables, savedChannels;
    $scope.dirtySettings = function () {
        return !angular.equals($scope.generalSettings, savedGeneralSettings) ||
            !angular.equals($scope.globalVariables.asJSON, savedGlobalVariables) ||
            !angular.equals($scope.channels, savedChannels);
    };
    
    function allowedTransitionsFn(data) {
        return (data.toState && data.fromState && data.toState.name.startsWith('admin.general') && data.fromState.name.startsWith('admin.general'));
    }
    checkChangesBeforeLeaving($scope, $scope.dirtySettings, null, allowedTransitionsFn);


    $scope.load = function () {

    	var promises = [];
    	promises.push(DataikuAPI.admin.getGeneralSettings());
    	promises.push(DataikuAPI.admin.getGlobalVariables());
    	promises.push(DataikuAPI.admin.integrationChannels.list());
    	promises.push(DataikuAPI.admin.getThemes());

    	$scope.promises = $q.all(promises).then(
			function (values) {
				//general settigns
				$scope.generalSettings = values[0].data;
	            savedGeneralSettings = angular.copy($scope.generalSettings);
	            //global variables
	            $scope.globalVariables.asJSON = JSON.stringify(values[1].data, null, 2);
	            savedGlobalVariables = angular.copy($scope.globalVariables.asJSON);
	            //messaging channels
	            $scope.channels = values[2].data;
	            savedChannels = angular.copy($scope.channels);
	            //themes
	            $scope.themes = values[3].data;

                // fixup customFieldsPluginComponentOrder
                $scope.generalSettings.customFieldsPluginComponentOrder = $scope.generalSettings.customFieldsPluginComponentOrder
                    .filter(ref1 => $scope.appConfig.customFieldsPluginComponentRefs.find(ref2 => ref2.pluginId == ref1.pluginId && ref2.componentId == ref1.componentId));
                for (let i = 0; i < $scope.appConfig.customFieldsPluginComponentRefs.length; i++) {
                    const ref1 = $scope.appConfig.customFieldsPluginComponentRefs[i];
                    const existingRef = $scope.generalSettings.customFieldsPluginComponentOrder.find(ref2 => ref2.pluginId == ref1.pluginId && ref2.componentId == ref1.componentId);
                    if (!existingRef) {
                        $scope.generalSettings.customFieldsPluginComponentOrder.push(ref1);
                    }
                }
                // fixup customPolicyHooksPluginComponentOrder
                $scope.generalSettings.customPolicyHooksPluginComponentOrder = $scope.generalSettings.customPolicyHooksPluginComponentOrder
                    .filter(ref1 => $scope.appConfig.customPolicyHooksPluginComponentRefs.find(ref2 => ref2.pluginId == ref1.pluginId && ref2.componentId == ref1.componentId));
                for (let i = 0; i < $scope.appConfig.customPolicyHooksPluginComponentRefs.length; i++) {
                    const ref1 = $scope.appConfig.customPolicyHooksPluginComponentRefs[i];
                    const existingRef = $scope.generalSettings.customPolicyHooksPluginComponentOrder.find(ref2 => ref2.pluginId == ref1.pluginId && ref2.componentId == ref1.componentId);
                    if (!existingRef) {
                        $scope.generalSettings.customPolicyHooksPluginComponentOrder.push(ref1);
                    }
                }
	    	},
	    	function (errors) {
	    		setErrorInScope.bind($scope);
	    	}
    	);
    };

    $scope.$watchCollection("channels", function (nv) {
        if (nv) {
            $scope.mailChannels = $scope.channels.filter(function (channel) {
                return ["smtp", "aws-ses-mail"].includes(channel.type);
            });
            if ($scope.generalSettings && $scope.mailChannels.map(c => c.id).indexOf($scope.generalSettings.notifications.emailChannelId) < 0) {
                $scope.generalSettings.notifications.emailChannelId = void 0;
            }
        }
    });

    $scope.load();

    $scope.autofillStudioUrl = function() {
        $scope.generalSettings.studioExternalUrl = urlWithProtocolAndHost();
    };

    function removeEmptyGitConfigurationOptions() {
        $scope.generalSettings.git.enforcedConfigurationRules.forEach((configRule) => {
            configRule.gitConfigurationOptions = configRule.gitConfigurationOptions.filter(option => !option.$invalid);
        });
    }

    $scope.invalidTabs = new Set();

    $scope.$on("$stateChangeStart", function(event, toState, toParams, fromState) {
        // We do not set 'Resource control' tab as invalid to avoid weird UI behavior. For this tab, a ng-model is not
        // changed if the new input value is not valid. Hence if a user exits the 'Resource control' tab with some
        // invalid fields and then switch back to it, the fields will no longer be invalid, which can be confusing.
        if ($scope.adminGeneralIndexForm.$invalid && fromState.name !== 'admin.general.limits') {
            $scope.invalidTabs.add(fromState.name);
        }
        $timeout(function() {
            $scope.invalidTabs.delete(toState.name);
        });
    });

    $scope.isAdminGeneralIndexFormInvalid = function() {
        return $scope.adminGeneralIndexForm.$invalid || $scope.invalidTabs.size;
    }

    function fetchGlobalTagsIfChanged() {
        if (!angular.equals($scope.generalSettings.globalTagsCategories, savedGeneralSettings.globalTagsCategories)) {
            TaggingService.fetchGlobalTags(true);
        }
    }

    function checkForDuplicateNames (list, type) {
        let names = [];

        list.forEach(function(element) {
            if (!element.name) {
                throw({message: "Found empty " + type + " name"});
            }
            if (names.includes(element.name)) {
                throw({message: "Found duplicate " + type + " names: " + element.name});
            }
            names.push(element.name);
        });
    }

	$scope.saveGeneralSettings = function () {
		return DataikuAPI.admin.saveGeneralSettings($scope.generalSettings).success(function (data) {
		    fetchGlobalTagsIfChanged();
            savedGeneralSettings = angular.copy($scope.generalSettings);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.updateGlobalTags = function() {
        if (angular.equals($scope.generalSettings.globalTagsCategories, savedGeneralSettings.globalTagsCategories)) return;
        let updatedGlobalTagsMap = {};
        let update = false;
        const toDelete = ['isEdited', 'isNew', 'originalTagName', 'removeUsage'];
        //Map the global tags with their original- and updated name to update the tag on object across the instance
        $scope.generalSettings.globalTagsCategories.forEach(function(category, index) {
            category.globalTags.forEach(function(tag, idx) {
                let originalCategoryName = savedGeneralSettings.globalTagsCategories[index] && savedGeneralSettings.globalTagsCategories[index].name;
                if (originalCategoryName && (tag.originalTagName || originalCategoryName != category.name)) {
                    let oldGlobalTagName = `${originalCategoryName}:${tag.originalTagName || tag.name}`
                    updatedGlobalTagsMap[oldGlobalTagName] = {color: tag.color, updatedTagName: `${category.name}:${tag.name}`, globalTagsCategory: category.name, removeUsage: tag.removeUsage};
                    update = true;
                }
                var it = $scope.generalSettings.globalTagsCategories[index].globalTags[idx];
                toDelete.forEach(k => delete it[k]);
            });
            delete category.isNew;
        });
        if (update) DataikuAPI.admin.globalTags.updateGlobalTags(updatedGlobalTagsMap);
        return updatedGlobalTagsMap;
    };

    $scope.invalidateConfigCache = function() {
        var options = {type: 'text'};
        $scope.cacheInvalidationError = {};
        Dialogs.prompt($scope, "Invalidate cache", "Path to invalidate", "", options)
               .then(function(path) {
                   DataikuAPI.admin.invalidateConfigCache(path).error(setErrorInScope.bind($scope.cacheInvalidationError));
                });
    };

    /**
    *   Save the generalSettings, global variables and integrations channels and perform all checks prior to that
    *   Needs to return a promise and shouldn't just return, as cmd+s serves a fallback to force save
    */
    $scope.save = function () {
        try {
            removeEmptyGitConfigurationOptions();

            checkForDuplicateNames($scope.generalSettings.containerSettings.executionConfigs, "container configuration");
            checkForDuplicateNames($scope.generalSettings.sparkSettings.executionConfigs, "Spark configuration");
            checkForDuplicateNames($scope.generalSettings.globalTagsCategories, "global category");

            var updatedGlobalTagsMap = $scope.updateGlobalTags();

            var gv = JSON.parse($scope.globalVariables.asJSON || '{}');
            return $scope.saveGeneralSettings().then(function () {
            	return DataikuAPI.admin.integrationChannels.saveAll($scope.channels).success(function (data) {
                    $scope.channels = data;
                    savedChannels = angular.copy(data);
                    return DataikuAPI.admin.saveGlobalVariables(gv).success(function (data) {
                        savedGlobalVariables = angular.copy($scope.globalVariables.asJSON);
                        $scope.$broadcast('generalSettingsSaved', updatedGlobalTagsMap);
                        if ($scope.isAdminGeneralIndexFormInvalid()) {
                            const allInvalidTabs = Array.from($scope.invalidTabs).map(tab => $state.get(tab).pageTitle());
                            if ($scope.adminGeneralIndexForm.$invalid) {
                                allInvalidTabs.push($state.current.pageTitle());
                            }
                            const warningMessage = "Saved with some invalid fields in tab" +
                                ($scope.invalidTabs.size + $scope.adminGeneralIndexForm.$invalid > 1 ? "s '" : " '") +
                                allInvalidTabs.join("', '") + "'";
                            ActivityIndicator.warning(warningMessage);
                        } else {
                            ActivityIndicator.success("Saved!");
                        }
                        // special cases: flags that need to be in appConfig for the corresponding options to be available
                        // in the frontend: impalaEnabled, etc
                        // note : settings are not sent back from the backend, but that's fine because they are saved as is
                        $scope.appConfig.impalaEnabled = $scope.generalSettings.impalaSettings.enabled && $scope.appConfig.hadoopEnabled;
                        $scope.appConfig.pluginDevExplicitCommit = $scope.generalSettings.pluginDevExplicitCommit;
                        $scope.appConfig.npsSurveyEnabled = $scope.generalSettings.npsSurveyEnabled;
                        $scope.appConfig.nodeName = $scope.generalSettings.nodeName;
                        $scope.appConfig.helpIntegrationEnabled = $scope.generalSettings.helpIntegrationEnabled;
                        $scope.appConfig.projectStatusList = $scope.generalSettings.projectStatusList;
                        $scope.appConfig.homeMessages = $scope.generalSettings.homeMessages;
                        $scope.appConfig.apiDeployerStages = $scope.generalSettings.apiDeployerServerSettings.stages;
                        $scope.appConfig.studioForgotPasswordUrl = $scope.generalSettings.studioForgotPasswordUrl;
                    }).error(setErrorInScope.bind($scope));
            	}).error(setErrorInScope.bind($scope));
            }).catch(setErrorInScope.bind($scope));
        } catch (err) {
            ActivityIndicator.error("Invalid format: "+err.message);
        }
    };

    $scope.registerAlationOpener = function(){
        $scope.save().then(function(){
            DataikuAPI.connections.registerAlationOpener($scope.alationRegister.alationAPIToken).success(function(){
                ActivityIndicator.success("Alation registration done")
            }).error(setErrorInScope.bind($scope));
        })
    }

    DataikuAPI.connections.getNames('SQL')
        .success(function (data) { $scope.sqlConnections = data; })
        .error(setErrorInScope.bind($scope));

    $scope.lambdaDevServerPoll = function () {
        DataikuAPI.lambda.devServer.getStatus().success(function (data) {
            $scope.lambdaDevServerStatus = data;
        });
    };
    $scope.lambdaDevServerPoll();

    $scope.lambdaDevServerStop = function () {
        DataikuAPI.lambda.devServer.stop().success(function (data) {
            $scope.lambdaDevServerStatus = data;
        });
    };

	$scope.testLdapSettings = function () {
        $scope.ldapTesting = true;
        $scope.ldapTestResult = null;
		DataikuAPI.admin.testLdapSettings($scope.generalSettings.ldapSettings).success(function (data) {
            $scope.ldapTestResult = data;
        }).error(setErrorInScope.bind($scope));
        $scope.ldapTesting = false;
    };

    $scope.testLdapGetUserDetails = function (userName) {
        $scope.ldapTesting = true;
        $scope.ldapTestUserDetails = null;
		DataikuAPI.admin.testLdapGetUserDetails({
            settings:$scope.generalSettings.ldapSettings,
            username:userName
        }).success(function (data) {
            $scope.ldapTestUserDetails = data;
        }).error(
            setErrorInScope.bind($scope)
        ).finally(
            $scope.ldapTesting = false
        );
	};

    $scope.addGroupProfile = function () {
        var groupProfiles = $scope.generalSettings.ldapSettings.groupProfiles

        if (!groupProfiles || !$.isArray(groupProfiles)) {
            $scope.generalSettings.ldapSettings.groupProfiles = []
        }
        $scope.generalSettings.ldapSettings.groupProfiles.push({key: '', value: $scope.generalSettings.ldapSettings.userProfile});
    };

    $scope.deleteGroupProfile = function (index) {
        $scope.generalSettings.ldapSettings.groupProfiles.splice(index, 1)
    };

    $scope.getChannelTypeLabel = function (type) {
        if (!type) {
            return "Unknown";
        } else if (type === 'msft-teams') {
            return "Microsoft Teams";
        } else if (type === 'aws-ses-mail') {
            return "Mail (via Amazon SES)";
        } else if (type === 'smtp') {
            return "Mail (SMTP)";
        } else {
            return type.charAt(0).toUpperCase() + type.slice(1);
        }
    };

	$scope.addChannel = function (type) {
	    var definition = {
            type : type,
            configuration : {
                sessionProperties: []
            },
            $creation : true //flag to allow id edition only on creation
        };
        if (type === 'slack' || type === 'webhook' || type === 'twilio' || type === 'msft-teams') {
            definition.configuration.useProxy = true;
        }
        if (type === 'slack') {
            definition.configuration.mode = 'WEBHOOK';
        }
		$scope.channels.push(definition)
	};

	$scope.removeChannel = function (channel) {
		var index = $scope.channels.indexOf(channel);
        if (index >= 0) {
            $scope.channels.splice(index, 1);
        }
	};

    DataikuAPI.admin.clusters.listAccessible('HADOOP').success(function(data){
        $scope.clusters = [{id:null, name:'No override'}].concat(data);
    }).error(setErrorInScope.bind($scope));

    DataikuAPI.admin.clusters.listAccessible('KUBERNETES').success(function(data){
        $scope.k8sClusters = [{id:null, name:'No override'}].concat(data);
    }).error(setErrorInScope.bind($scope));

    $scope.DEPLOYER_MODES = [
        ["DISABLED", "Disabled"],
        ["LOCAL", "Local"],
        ["REMOTE", "Remote"]
    ]
    $scope.DEPLOYER_MODES_DESCRIPTIONS = [
        "Disable ability to publish models and projects on the Deployer",
        "Use this DSS instance as Deployer",
        "Publish models and projects on a remote Deployer"
    ]


    $scope.pushBaseImages = function(){
        if($scope.dirtySettings()) {
            $scope.save().then($scope.pushBaseImages_NoCheckDirty());
        } else {
            $scope.pushBaseImages_NoCheckDirty();
        }
    }

    $scope.pushBaseImages_NoCheckDirty = function(){
        DataikuAPI.admin.containerExec.pushBaseImages().success(function(data) {
            // FutureProgressModal.show($scope, data, "Pushing base images");
            FutureProgressModal.show($scope, data, "Pushing base images").then(function(result){
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly($scope, "Push result", result.messages, result.futureLog);
                }
            })
        }).error(setErrorInScope.bind($scope));
    }

    $scope.hideDatasetTypesOptions = (() => {
        const datasetName = $filter('datasetTypeToName');
        const rawDatasetsTiles = GlobalProjectActions.getAllDatasetByTilesNoFilter(); // call without scope is valid because we won't use the clickCallbacks fields.
        const res = [];
        rawDatasetsTiles.forEach(tile => {
            const allTypes = tile.types.concat(tile.types2 || [])
            allTypes.forEach(type => {
                if(type === undefined) return; // ignore the ones hidden by feature-flags.
                res.push({
                    tile: tile.title,
                    value: type.type,
                    displayName: type.label !== undefined ? type.label : datasetName(type.type),
                });
            });
        });

        // this is a special case, the 'search_and_import' behaviour doesn't exist in the new dataset page.
        res.push({
            tile: 'Import existing',
            value: 'search_and_import',
            displayName: 'Search and import\u2026',
        });
        return res;
    })();

});


app.controller("AdminVariablesController", function ($scope, $state, $stateParams, DataikuAPI, WT1, TopNav) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");
    $scope.executeVariablesUpdate = function () {
        $scope.save().then(function () {
            DataikuAPI.admin.executeVariablesUpdate().success(function () {
                $state.transitionTo( $state.current, angular.copy($stateParams), { reload: true, inherit: true, notify: true } );
            }).error(setErrorInScope.bind($scope));
        });
    }
});


app.controller("AdminThemeController", function ($scope, $rootScope, TopNav) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");

    $scope.getThemeThumbnailUrl = function (theme) {
        var uri = $scope.getThemeUri(theme);
        return uri + theme.thumbnail;
    };

    $scope.setCurrentTheme = function (theme) {
        // saving theme content in app config
    	if (theme) {
    		$scope.generalSettings.themeId = theme.id;
    	} else {
    		delete $scope.generalSettings.themeId;
    	}
        $scope.saveGeneralSettings().then(function () {
            // visualy setting theme
        	$rootScope.appConfig.theme = theme;
        	$scope.setTheme(theme);
        }).catch(setErrorInScope.bind($scope));
    };

    $scope.removeHomeMessage = function (homeMessage) {
		var index = $scope.generalSettings.homeMessages.indexOf(homeMessage);
    	if (index != -1) {
    		$scope.generalSettings.homeMessages.splice(index, 1);
    	}
    };
});


app.controller("DeleteGlobalCategoryModalController", function ($scope, $rootScope, $controller) {

    function remove(index) {
        let items = $scope.generalSettings.globalTagsCategories[index].globalTags;
        items.forEach(function(item) {
            item.originalTagName = item.name;
            item.name = "";
            item.removeUsage = true;
        });
        $scope.updateGlobalTags();
        deleteKeep(index);
    };

    function deleteKeep(index) {
        $scope.generalSettings.globalTagsCategories.splice(index, 1);
        // setTimeout : when the form was invalid but is valid after deleting the category
        // give time to update or it will fail on checkFormValidity
        setTimeout(() => $scope.save());
    };

    function reassign(index, reassignTo) {
        if (reassignTo === undefined) return;
        $scope.generalSettings.globalTagsCategories[index].name = $scope.generalSettings.globalTagsCategories[reassignTo].name;
        $scope.updateGlobalTags();
        const tagsName = $scope.generalSettings.globalTagsCategories[reassignTo].globalTags.map(it => it.name);
        var mergedGlobalTags = angular.copy($scope.generalSettings.globalTagsCategories[reassignTo].globalTags);
        $scope.generalSettings.globalTagsCategories[index].globalTags.forEach(function(tag) {
            if (!tagsName.includes(tag.name)){
                mergedGlobalTags.push(tag);
            }
        });
        $scope.generalSettings.globalTagsCategories[reassignTo].globalTags = mergedGlobalTags;
        deleteKeep(index);
    }

    $scope.doDeleteGlobalCategory = function() {
        switch ($scope.deletionMode) {
            case 'remove':
                remove($scope.index);
                break;
            case 'reassign':
                reassign($scope.index, $scope.reassignTo);
                break;
            case 'keep':
                deleteKeep($scope.index);
                break;
        }
        $scope.dismiss();
    };

});

app.controller("MergeGlobalTagsModalController", function ($scope, $rootScope, $controller) {

    $scope.doMergeTags = function() {
        $scope.items.forEach(function(item) {
            item.originalTagName = item.name;
            item.name = $scope.outputTag.name;
            item.color = $scope.outputTag.color;
        });
        if (!$scope.generalSettings.globalTagsCategories[$scope.index].globalTags.find(it => (it.originalTagName || it.name) === $scope.outputTag.name)) {
            $scope.items.shift();
        }
        $scope.updateGlobalTags();
        let indexes = $scope.items.map(it => it.$idx);
        $scope.generalSettings.globalTagsCategories[$scope.index].globalTags = $scope.generalSettings.globalTagsCategories[$scope.index].globalTags.filter((it, index) => !indexes.includes(index));
        $scope.save();
        $scope.dismiss();
    }
});

app.controller("DeleteGlobalTagsModalController", function ($scope, $rootScope) {

    function remove(items) {
        items.forEach(function(item) {
            item.originalTagName = item.name;
            item.name = "";
            item.removeUsage = true;
        });
        $scope.updateGlobalTags();
        deleteKeep(items);
    };

    function deleteKeep(items) {
        let indexes = items.map(it => it.$idx);
        $scope.generalSettings.globalTagsCategories[$scope.index].globalTags = $scope.generalSettings.globalTagsCategories[$scope.index].globalTags.filter((it, index) => !indexes.includes(index));
        // setTimeout : when the form was invalid but is valid after deleting the tag(s)
        // give time to update or it will fail on checkFormValidity
        setTimeout(() => $scope.save());
    };

    function reassign(items, reassignTo) {
        if (reassignTo === undefined) return;
        items.forEach(function(item) {
            item.originalTagName = item.name;
            item.name = reassignTo;
        });
        $scope.updateGlobalTags();
        deleteKeep(items);
    }

    $scope.doDeleteGlobalTags = function() {
        switch ($scope.deletionMode) {
            case 'remove':
                remove($scope.items);
                break;
            case 'reassign':
                reassign($scope.items, $scope.reassignTo);
                break;
            case 'keep':
                deleteKeep($scope.items);
                break;
        }
        $scope.dismiss();
    };
});

app.controller("GlobalTagsController", function ($scope, $element, $timeout, TaggingService, CreateModalFromTemplate, TAGGABLE_TYPES, DataikuAPI) {
    $scope.taggableTypes = [ // Must be kept in sync with ITaggingService.TaggableType
        'PROJECT',
        'ANALYSIS',
        'SAVED_MODEL',
        'DATASET',
        'RECIPE',
        'MANAGED_FOLDER',
        'STREAMING_ENDPOINT',
        'FLOW_ZONE',
        'SQL_NOTEBOOK',
        'JUPYTER_NOTEBOOK',
        'STATISTICS_WORKSHEET',
        'SCENARIO',
        'DASHBOARD',
        'INSIGHT',
        'ARTICLE',
        'WEB_APP',
        'REPORT',
        'LAMBDA_SERVICE'
    ];

    $scope.computeItemTemplate = function() {
        return {name: '', color: TaggingService.getDefaultColor(Math.random().toString(36).slice(2)), isNew: true};
    };

    $scope.addCategory = function() {
        $scope.generalSettings.globalTagsCategories.push({name: '', globalTags: [], appliesTo: $scope.taggableTypes, isNew: true});
        //focus new category name
        $timeout(function() {
            const focusable = $element.find('input[ng-model="category.name"]').last();
            if (focusable) {
                focusable.focus()
            }
        });
    };

    $scope.calcGlobalTagUsage = function() {
        DataikuAPI.catalog.search("", {scope:['dss'], _type:['ALL']}, true).then((data) => {
            $scope.tagUsageMap = data.data.aggregations["tag.raw"].agg.buckets.reduce(function(map, obj) {
                map[obj.key] = obj.doc_count;
                return map;
            }, {});
        });
    };
    $scope.calcGlobalTagUsage();

    $scope.$on('generalSettingsSaved', $scope.calcGlobalTagUsage);

    $scope.getGlobalTagUsage = function(category, item) {
        if (!$scope.tagUsageMap) return 0;
        let tagName = item.originalTagName || item.name;
        return $scope.tagUsageMap[`${category}:${tagName}`];
    };

    $scope.linkToCatalog = function(category, item) {
        const tagName = item.originalTagName || item.name;
        const globalTagName = (`${category}:${tagName}`).replace(/\\/g,'%5C').replace(/\//g,'~2F').replace(/&/g, '%5C&');
        return `/catalog/search/scope=all&tag.raw=${globalTagName}`;
    };

    $scope.updateItem = function(category, originalTagName, item) {
        if (!item.isEdited) {
            item.isEdited = true;
            item.originalTagName = originalTagName;
        }
    }

    $scope.mergeTags = function(index, items) {
        CreateModalFromTemplate("/templates/global-tags/merge-global-tags-modal.html", $scope, "MergeGlobalTagsModalController", function(modalScope) {
            modalScope.index = index;
            modalScope.items = items;

            modalScope.outputTag = angular.copy(items[0]);
        });
    };

    $scope.deleteGlobalCategory = function(index, categoryName) {
        if ($scope.generalSettings.globalTagsCategories[index].isNew) {
            $scope.generalSettings.globalTagsCategories.splice(index, 1);
            return;
        }
        CreateModalFromTemplate("/templates/global-tags/delete-global-category-modal.html", $scope, "DeleteGlobalCategoryModalController", function(modalScope) {
            modalScope.deletionMode = "remove";
            modalScope.index = index;
            modalScope.categoryName = categoryName;
            modalScope.assignableCategoryList = $scope.generalSettings.globalTagsCategories.filter(cat => cat.name != categoryName).map((cat, idx) => idx >= index ? idx + 1 : idx);
        });
    };

    $scope.deleteGlobalTags = function(index, items) {
        CreateModalFromTemplate("/templates/global-tags/delete-global-tags-modal.html", $scope, "DeleteGlobalTagsModalController", function(modalScope) {
            modalScope.modalTitle = `Delete global tag${items.length > 1 ? 's' : ''}`;
            modalScope.deletionMode = "remove";
            modalScope.index = index;
            modalScope.items = items;
            modalScope.assignableTagsList = $scope.generalSettings.globalTagsCategories[index].globalTags.filter(it => !items.includes(it)).map(it => it.name);
        });
    };
});

app.controller("ProjectStatusController", function ($scope, $rootScope, TopNav, DKUConstants, TaggingService) {
    $scope.defaultTagColor = TaggingService.getDefaultColor;

    $scope.newStatus = {
        name: '',
        defaultColor: TaggingService.getDefaultColor('')
    };

    //Isolating the archived status so that it does not get deleted nor reorder
    $scope.projectStatusList = [];
    $scope.promises.then(function (values) {
        $scope.projectStatusList = angular.copy($scope.generalSettings.projectStatusList);
        var archivedStatusIndex =  $scope.projectStatusList.findIndex(function (status) {
            return status.name ==  DKUConstants.ARCHIVED_PROJECT_STATUS;
        });
        var archivedStatus = archivedStatusIndex > -1 ? $scope.projectStatusList.splice(archivedStatusIndex, 1) : [];

        //On local projectStatusList change recomputing generalSettings.projectStatusList with the archived status at its end
        $scope.$watch('projectStatusList', function () {
            $scope.generalSettings.projectStatusList = $scope.projectStatusList.concat(archivedStatus);
        }, true);
    });
});


app.controller("AdminLicensingController", function ($scope, $state, CreateModalFromTemplate, TopNav, DataikuAPI) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");
    $scope.$state = $state;

	$scope.enterLicense = function () {
		CreateModalFromTemplate("/templates/admin/enter-license.html", $scope, "EnterLicenseController");
	};

    $scope.getLimits = function () {
        if ($scope.isDSSAdmin()) {
            DataikuAPI.admin.getLimitsStatus().success(function (data) {
                $scope.limits = data;
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.getLimits();
});


app.controller("EnterLicenseController", function ($scope, $state, $rootScope, DataikuAPI, Assert, TopNav) {
	TopNav.setLocation(TopNav.DSS_HOME, "administration");
    Assert.inScope($scope, "appConfig");

    $scope.existingKey = {}

    $scope.reloadMe = function () {
        $scope.dismiss();
        location.reload();
    };

    $scope.setLicense = function () {
        DataikuAPI.registration.setOfflineLicense($scope.existingKey.license).success(function (data) {
            $scope.registrationSuccessful = {};
        }).error(setErrorInScope.bind($scope));
    };
});


//Integration channels to report info outside of dss:


app.controller("SMTPChannelController", function ($scope, $state, $stateParams, DataikuAPI) {

});


app.controller("SlackChannelController", function ($scope, $state, $stateParams, DataikuAPI) {

});


app.controller("TeamsChannelController", function ($scope, $state, $stateParams, DataikuAPI) {
    if ($scope.channel.configuration.useProxy === undefined) {
        $scope.channel.configuration.useProxy = false;
    }
});

app.controller("WebhookChannelController", function ($scope, $state, $stateParams, DataikuAPI) {

});


app.controller("ShellChannelController", function ($scope, $state, $stateParams, DataikuAPI, TopNav, CodeMirrorSettingService) {
	TopNav.setLocation(TopNav.DSS_HOME, "administration");
	$scope.channel.configuration.type = $scope.channel.configuration.type || 'COMMAND';
	$scope.editorOptions = CodeMirrorSettingService.get('text/x-sh', {onLoad: function(cm) {$scope.cm = cm;}});

	$scope.shellSenderTypes = [{type:'FILE',name:'Script file'}, {type:'COMMAND',name:'Command'}];

	$scope.getCommandLine = function () {
	    if ( $scope.channel.configuration.type == 'FILE' ) {
	        if ( $scope.channel.configuration.command ) {
	            return "sh -c " + $scope.channel.configuration.command + " script_file";
	        } else {
	            return "sh script_file";
	        }
	    } else {
	        return $scope.channel.configuration.command;
	    }
	};
});


app.controller("DatasetChannelController", function ($scope, $state, $stateParams, DataikuAPI, TopNav) {
	TopNav.setLocation(TopNav.DSS_HOME, "administration");

    DataikuAPI.projects.list().success(function (data) {
        $scope.projectsList = data;
    }).error(setErrorInScope.bind($scope));

    $scope.$watch('channel.configuration.projectKey', function () {
    	if ($scope.channel.configuration.projectKey == null ) return;
        DataikuAPI.datasets.list($scope.channel.configuration.projectKey).success(function (data) {
            $scope.datasetsList = data;
        }).error(setErrorInScope.bind($scope));
    });
});

app.controller("ContainerSettingsController", function($scope, DataikuAPI, Dialogs, Assert, TopNav, FutureProgressModal, CodeMirrorSettingService) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");
    Assert.inScope($scope, "appConfig");
    Assert.inScope($scope, "addLicInfo");
    Assert.inScope($scope, "generalSettings");

    $scope.codeMirrorSettingService = CodeMirrorSettingService;
    $scope.settings = $scope.generalSettings.containerSettings;

    $scope.getNewContainerConfig = function() {
        return {
            type: 'KUBERNETES',
            usableBy: 'ALL', allowedGroups: [],
            dockerNetwork: 'host',
            dockerResources: [],
            kubernetesResources: {
                memRequestMB: -1, memLimitMB: -1,
                cpuRequest: -1, cpuLimit: -1,
                customRequests: [], customLimits: [],
                hostPathVolumes: []
            },
            properties: []
        };
    };

    DataikuAPI.security.listGroups(false)
        .success(data => {
            if (data) {
                data.sort();
            }
            $scope.allGroups = data;
        })
        .error(setErrorInScope.bind($scope));

    $scope.isBaseImageNameSuspicious = function(baseImage) {
        return /^(?:[\w-_]+\.)+\w+(?::\d+)?\//.test(baseImage);
    };

    $scope.installJupyterSupport = function(){
        DataikuAPI.admin.containerExec.installJupyterSupport().success(function(data) {
            FutureProgressModal.show($scope, data, "(Re)Installing kernels").then(function(result){
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly($scope, "Update result", result.messages, result.futureLog);
                }
            })
        }).error(setErrorInScope.bind($scope));
    }

    $scope.removeJupyterSupport = function(){
        DataikuAPI.admin.containerExec.removeJupyterSupport().success(function(data) {
            FutureProgressModal.show($scope, data, "Removing kernels").then(function(result){
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly($scope, "Update result", result.messages, result.futureLog);
                }
            })
        }).error(setErrorInScope.bind($scope));
    }

    $scope.applyK8SPolicies = function() {
        DataikuAPI.admin.containerExec.applyK8SPolicies().success(function(data) {
            FutureProgressModal.show($scope, data, "Applying Kubernetes policies").then(function(result){
                if (result) {
                    Dialogs.infoMessagesDisplayOnly($scope, "Policies applied", result, result.futureLog, true);
                }
            });
        }).error(setErrorInScope.bind($scope));
    }
});


app.controller('AdminPersonalHomePagesController', function($scope) {});

})();
