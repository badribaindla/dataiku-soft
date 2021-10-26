(function() {
'use strict';

const app = angular.module('dataiku.controllers');


app.controller('ProfileController', function($scope, $state, $stateParams, $rootScope, AchievementService, ActivityIndicator, DataikuAPI, TopNav, MessengerUtils, WT1, $anchorScroll) {
    var tab = $state.current.data ? $state.current.data.selectedTab : null;
    TopNav.setNoItem();
    TopNav.setLocation(TopNav.DSS_HOME, "administration", null, tab);
    $scope.uiState = $scope.uiState || {};

    $scope.$on("$stateChangeSuccess", function() {
        var tab = $state.current.data ? $state.current.data.selectedTab : null;
        TopNav.setNoItem();
        TopNav.setLocation(TopNav.DSS_HOME, "administration", null, tab);
    });

    $scope.requestedProfile = $rootScope.appConfig.login;
    if ($stateParams.userLogin) {
        $scope.requestedProfile = $stateParams.userLogin;
    }

    $scope.profile = {};

    $scope.logout = function() {
        DataikuAPI.logout().success(function(data) {
            // Violent redirect to avoid keeping a cached appConfig
            window.location = "/login/";
        }).error(setErrorInScope.bind($scope));
    };

    function loadProfile() {
        DataikuAPI.profile.get($scope.requestedProfile).success(function(data) {
            $scope.profile.user = data;
            $anchorScroll();
        }).error(setErrorInScope.bind($scope));

        DataikuAPI.profile.achievements($scope.requestedProfile).success(function(data) {
            // enrich the data
            var achievements = [];
            for(var k in data.achievements) {
                var x = AchievementService.getAchievement(data.achievements[k].id);
                if (x) {
                    var achievement = data.achievements[k];
                    achievement.icon = x.icon;
                    achievement.title = x.title;
                    achievement.text = x.text;
                    achievements.push(achievement);
                }
            }
            $scope.profile.achievements = data;
            $scope.profile.achievements.achievements = achievements;
        }).error(setErrorInScope.bind($scope));
    }

    WT1.event("user-profile-load", {});
    loadProfile();
    $scope.$on("UPDATED_PROFILE", function() {
        loadProfile();
    });

    $scope.oldUserSettings = angular.copy($rootScope.appConfig.userSettings);
    $scope.userSettings = angular.copy($rootScope.appConfig.userSettings);

    $scope.isDirtyUserSettings = function () {
        return !angular.equals($scope.userSettings, $scope.oldUserSettings);
    };

    $scope.isEnableFlowZoomTracking = function (isOn) { // avoid presenting negative names, but store as 'disable' flag to avoid need to migrate settings
        if (angular.isDefined(isOn)) {
            $scope.userSettings.disableFlowZoomTracking = !isOn ;
        } else {        
            return !$scope.userSettings.disableFlowZoomTracking;
        }
    };

    $scope.saveUserSettings = function () {
        DataikuAPI.profile.setUserSettings($scope.userSettings).success(function () {
            if (!angular.equals(($scope.userSettings.home || {}).rows, ($scope.oldUserSettings.home || {}).rows)) {
                WT1.event("user-profile-set-home-row", {rows: ($scope.userSettings.home || {}).rows});
            }
            $rootScope.appConfig.userSettings = $scope.userSettings;
            $scope.oldUserSettings = angular.copy($scope.userSettings);
        })
        .error(setErrorInScope.bind($scope));

        WT1.event("user-profile-save-settings", {
            digests: $scope.userSettings.digests.enabled,
            mentionEmails: $scope.userSettings.mentionEmails.enabled,
            offlineQueue: $scope.userSettings.offlineQueue.enabled,
            frontendNotifications: $scope.userSettings.frontendNotifications,
            codeEditor: $scope.userSettings.codeEditor,
            home: $scope.userSettings.home,
            disableFlowZoomTracking: $scope.userSettings.disableFlowZoomTracking
        });
    };

    $scope.sampleMessengerNotification = function () {
        MessengerUtils.post({
          message: "Here is your example! <br/> So, what do you want to be notified of?",
          hideAfter: 2,
          id: 'sampleNotification'
        });
    };

    $scope.hooks = {save : null, isDirty : null};
});


app.controller('MyProfileEditController', function($scope, $state, $stateParams, DataikuAPI, $rootScope, TopNav, WT1) {
    $scope.user = {};
    $scope.oldUser = {};
    $scope.image = {};

    DataikuAPI.profile.get()
        .success(function(data) {
            $scope.user = data;
            $scope.user.passwordConfirmation='';
            $scope.user.password='';
            $scope.oldUser = angular.copy($scope.user);
        })
        .error(setErrorInScope.bind($scope));

    $scope.isDirtyUser = function() {
        return !angular.equals($scope.user, $scope.oldUser) && $scope.user.passwordConfirmation == $scope.user.password && !$scope.userDescriptionForm.$invalid;
    };

    $scope.saveUser = function() {
        WT1.event("user-profile-save-user", {});
        DataikuAPI.profile.edit($scope.user).success(function(data) {
             $scope.errorMessage ='';
             if($scope.image.file) {
                 DataikuAPI.profile.uploadPicture($scope.image.file).then(function(data) {
                     $state.go("profile.my.view");
                     $rootScope.$broadcast('UPDATED_PROFILE');
                 }, setErrorInScope.bind($scope));
             } else {
                 $rootScope.$broadcast('UPDATED_PROFILE');
                 $state.go("profile.my.view");
             }
        }).error(function(a, b, c) {
            if(a.code == "666") {
                // user error
                $scope.errorMessage = a.message;
            } else {
                // api error
                setErrorInScope.bind($scope)(a, b, c)
            }
        });
    }

    $scope.hooks.save = $scope.saveUser;
    $scope.hooks.isDirty = $scope.isDirtyUser;
});


app.controller('MyProfileAchievementsController', function($scope) {
    $scope.hooks.save = null;
    $scope.hooks.isDirty = null;
});


app.controller('MyProfileStarsController', function($scope, $rootScope, $state, DataikuAPI, TopNav, InterestsService, WT1) {
    $scope.hooks.save = null;
    $scope.hooks.isDirty = null;

    function getUserInterests(offset) {
        DataikuAPI.interests.getUserInterests($rootScope.appConfig.login, offset, 100, $scope.filters).success(function(data) {
            $scope.results = data;
        }).error(setErrorInScope.bind($scope));
    }
    getUserInterests(0);

    $scope.previousResults = function() {
        getUserInterests($scope.results.offset - $scope.results.pageSize);
    };

    $scope.nextResults = function() {
        getUserInterests($scope.results.offset + $scope.results.pageSize);
    };

    function getTaggableObjects(object) {
        return [{
            type: object.objectType,
            projectKey: object.projectKey,
            id: object.objectId
        }];
    }

    $scope.starObject = function(object, star) {
        WT1.event("user-profile-star", {});
        InterestsService.star($scope, getTaggableObjects(object), star).success( () => object.starred = star);
    };

    $scope.watchObject = function(object, watch) {
        WT1.event("user-profile-watch", {});
        InterestsService.watch($scope, getTaggableObjects(object), watch).success( () => object.watching = watch);
    };

    $scope.getProjectName = function(projectKey) {
        if (!projectKey || !projectsMap) return;
        return (projectsMap[projectKey] || {}).name;
    };

    var projectsMap;
    $scope.filters = {projectKey: null, taggableType: null};

    DataikuAPI.projects.list().success(function(data) {
        projectsMap = {};
        data.forEach(function(p) {
            projectsMap[p.projectKey] = p;
        });
        $scope.projects = data;
        $scope.projects.push({projectKey: null, name: 'All projects'});
    }).error(setErrorInScope.bind($scope));

    $scope.$watch("filters", function() { getUserInterests($scope.results ? $scope.results.offset : 0)}, true);
});


app.controller("MyProfilePersonalAPIKeysController", function ($scope, $state, DataikuAPI, CreateModalFromTemplate, Dialogs, TopNav, WT1) {
    $scope.hooks.save = null;
    $scope.hooks.isDirty = null;

    $scope.refreshApiKeysList = function () {
        DataikuAPI.profile.listPersonalAPIKeys().success(function (data) {
            $scope.apiKeys = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.refreshApiKeysList();

    $scope.createAPIKey = function () {
        WT1.event("user-profile-create-API-key", {});
        DataikuAPI.profile.createPersonalAPIKey().success(function(data) {
            $scope.refreshApiKeysList();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.deleteAPIKey = function (key) {
        Dialogs.confirm($scope, "Remove API key", "Are you sure you want to remove this API key?").then(function () {
            WT1.event("user-profile-delete-API-key", {});
            DataikuAPI.profile.deletePersonalAPIKey(key).success(function (data) {
                $scope.refreshApiKeysList();
            }).error(setErrorInScope.bind($scope));
        });
    };

    $scope.viewQRCode = function (key) {
        CreateModalFromTemplate("/templates/admin/security/api-key-qrcode-modal.html", $scope, null, function (newScope) {
            newScope.apiKeyQRCode = JSON.stringify({
                k : key.key,
                u : $scope.appConfig.dssExternalURL
            });
        });
    };
});

app.controller("MyProfileConnectionCredentialsController", function ($scope, $state, DataikuAPI, CreateModalFromTemplate, Dialogs, TopNav, WT1, ActivityIndicator, $window) {
    $scope.hooks.save = null;
    $scope.hooks.isDirty = null;

    $scope.refreshCredentials = function () {
        DataikuAPI.profile.listConnectionCredentials().success(function (data) {
            $scope.credentials = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.refreshCredentials();

    $scope.editCredential = function (credential) {
        WT1.event("user-profile-edit-credentials", {});

        if ($scope.isConnectionCredential(credential)) {
            $scope.modalTitle = (credential.connection || $scope.cleanConnectionName) + " (" + credential.connectionType + ")"
        } else if (credential.requestSource === 'PLUGIN') {
            var pluginInfo = credential.pluginCredentialRequestInfo
            $scope.modalTitle = pluginInfo.paramName + " (" + pluginInfo.presetId + ")"
        }

        if (credential.type === "SINGLE_FIELD" || credential.type === "BASIC") {
            CreateModalFromTemplate("/templates/profile/edit-connection-credential-modal.html", $scope, null, function (newScope) {
                newScope.credential = credential;
                newScope.credential.password = "";

                newScope.modalTitle = $scope.modalTitle;
                newScope.passwordFieldTitle = credential.type === 'BASIC' ? "Password" : "Credential";

                newScope.confirm = function() {
                    var apiCall;
                    if ($scope.isConnectionCredential(credential)) {
                        apiCall = DataikuAPI.profile.setBasicConnectionCredential(newScope.credential.connection,
                                      newScope.credential.user, newScope.credential.password)
                    } else {
                        var pluginInfo = credential.pluginCredentialRequestInfo
                        apiCall = DataikuAPI.profile.pluginCredentials.setBasicCredential(pluginInfo.pluginId,
                                      pluginInfo.paramSetId, pluginInfo.presetId, pluginInfo.paramName,
                                      newScope.credential.user, newScope.credential.password)
                    }

                    apiCall.success(function (data) {
                        newScope.dismiss();
                        ActivityIndicator.success("Credential saved");
                        $scope.refreshCredentials();
                    }).error(setErrorInScope.bind($scope));
                }
            });
        } else if (credential.type === "AZURE_OAUTH_DEVICECODE") {
            resetErrorInScope($scope);
            CreateModalFromTemplate("/templates/profile/edit-azure-oauth-connection-credential-modal.html", $scope, null, function (newScope) {
                newScope.uiState = {
                    step: "STARTUP"
                }
                newScope.credential = credential;

                newScope.startStep1 = function() {
                    DataikuAPI.profile.connectionCredentials.azureOAuthDeviceCodeDanceStep1(
                                newScope.credential.connection).success(function (data) {
                        newScope.uiState.step = "STEP1_COMPLETE";
                        newScope.uiState.deviceCode = data;
                        if (data.message) {
                            data.htmlMessage = marked(data.message).replace("<a href", "<a target='_blank' href");
                        }
                    }).error(setErrorInScope.bind($scope));
                }
                newScope.startStep2 = function() {
                    DataikuAPI.profile.connectionCredentials.azureOAuthDeviceCodeDanceStep2(
                                newScope.credential.connection, newScope.uiState.deviceCode).success(function (data) {
                        newScope.dismiss();
                        ActivityIndicator.success("Credential obtained")
                    }).error(setErrorInScope.bind($scope));
                }

                newScope.startStep1();
            });
        } else if (credential.type === "OAUTH_REFRESH_TOKEN") {
            resetErrorInScope($scope);
            CreateModalFromTemplate("/templates/profile/edit-oauth-connection-credential-modal.html", $scope, null, function (newScope) {
                newScope.modalTitle = $scope.modalTitle;

                if ($scope.isConnectionCredential(credential)) {
                    newScope.connection = credential.connection;

                    newScope.confirm = function() {
                        DataikuAPI.profile.connectionCredentials.getOAuth2AuthorizationEndpoint(
                            urlWithProtocolAndHost(),
                            $state.current.name,
                            newScope.connection)
                        .success(function (data) {
                            // Redirect to begin authorization process
                            $window.location.href = data;
                        }).error(setErrorInScope.bind($scope));
                    }
                } else if (credential.requestSource === 'PLUGIN') {
                    newScope.credential = credential.pluginCredentialRequestInfo;

                    newScope.confirm = function() {
                        DataikuAPI.profile.pluginCredentials.getOAuth2AuthorizationEndpoint(
                            urlWithProtocolAndHost(),
                            $state.current.name,
                            newScope.credential.pluginId,
                            newScope.credential.paramSetId,
                            newScope.credential.presetId,
                            newScope.credential.paramName)
                        .success(function (data) {
                            // Redirect to begin authorization process
                            $window.location.href = data;
                        }).error(setErrorInScope.bind($scope));
                    }
                }
            });
        }
    };

    $scope.deleteConnectionCredential = function (connection) {
        WT1.event("user-profile-delete-credentials", {});
        Dialogs.confirm($scope, "Remove personal credential", "Are you sure you want to remove this connection credential?").then(function () {
            DataikuAPI.profile.setBasicConnectionCredential(connection, null, null).success(function (data) {
                ActivityIndicator.success("Credential removed")
                $scope.refreshCredentials();
            }).error(setErrorInScope.bind($scope));
        });
    };

    $scope.deletePluginCredential = function (pluginCredentialRequestInfo) {
        WT1.event("user-profile-delete-credentials", {});
        Dialogs.confirm($scope, "Remove personal credential", "Are you sure you want to remove this plugin credential?").then(function () {
            DataikuAPI.profile.pluginCredentials.setBasicCredential(pluginCredentialRequestInfo.pluginId,
                pluginCredentialRequestInfo.paramSetId, pluginCredentialRequestInfo.presetId,
                pluginCredentialRequestInfo.paramName, null, null).success(function (data) {
                ActivityIndicator.success("Credential removed")
                $scope.refreshCredentials();
            }).error(setErrorInScope.bind($scope));
        });
    };

    $scope.isConnectionCredential = function(credential) {
        return ['CONNECTION', 'VIRTUAL_CONNECTION', 'DATABRICKS_INTEGRATION'].includes(credential.requestSource)
    }

    $scope.connectionCredentials = function () {
        if ($scope.credentials) {
            return $scope.credentials.credentials.filter($scope.isConnectionCredential)
        }
    }

    $scope.pluginCredentials = function () {
        if ($scope.credentials) {
            return $scope.credentials.credentials.filter(credential => credential.requestSource == 'PLUGIN')
        }
    }
});


app.controller('MyProfileExportController', function($scope, $rootScope, $state, DataikuAPI, TopNav, WT1, Dialogs) {
    $scope.hooks.save = null;
    $scope.hooks.isDirty = null;

    function list() {
        DataikuAPI.exports.list().success(function(data) {
            $scope.userExports = data;
        }).error(setErrorInScope.bind($scope));
    }

    $scope.downloadExport = function(exportId) {
        WT1.event("user-profile-download-export", {});
        downloadURL(DataikuAPI.exports.getDownloadURL(exportId));
    };

    $scope.deleteExport = function(exportId) {
        WT1.event("user-profile-delete-export", {});
        DataikuAPI.exports.remove(exportId).error(setErrorInScope.bind($scope)).then(list);
    };


    $scope.clearExports = function() {
        WT1.event("user-profile-clear-exports", {});
        Dialogs.confirm($scope,"Remove all exports","Are you sure you want to remove all finished exports ?").then(function() {
            DataikuAPI.exports.clear().error(setErrorInScope.bind($scope)).then(list);
        });
    };


    list();
});

app.controller('MyProfileAccountController', function($scope, $rootScope, CodeMirrorSettingService, HomeBehavior, EXPORTED_TILES) {
    $scope.hooks.save = $scope.saveUserSettings;
    $scope.hooks.isDirty = $scope.isDirtyUserSettings;

    $scope.initCodeEditorSettings = function() {
        if (!$scope.userSettings.codeEditor) {
            $scope.userSettings.codeEditor = {
                theme: 'default',
                fontSize: 13,
                autoCloseBracket: true,
                keyMap: 'default'
            };
        }
    };
    $scope.initCodeEditorSettings();

    /*
     * Preview
     */

    $scope.initEditor = function() {
        $scope.sample = 'def process(dataset, partition_id):\n    parameter1_value = config.get("parameter1", None)\n    # return a dict of the metrics\' values\n    metric_values = {}\n    # type is inferred automatically from the object type\n    metric_values[\'name1\'] = 15\n    # type can be forced using the values in the MetricDataTypes enum\n    metric_values[\'name2\'] = (15, MetricDataTypes.STRING)\n    return metric_values\ntest';
        $scope.editorOptions = CodeMirrorSettingService.get("text/x-python", {onLoad: function(cm){$scope.codeMirror = cm;}});
    };
    $scope.initEditor();

    $scope.updatePreview = function() {
        $scope.codeMirror.setOption('theme', $scope.userSettings.codeEditor.theme);
        $scope.codeMirror.setOption('keyMap', $scope.userSettings.codeEditor.keyMap);
        $scope.codeMirror.setOption('matchBrackets', $scope.userSettings.codeEditor.matchBrackets);
        $($($scope.codeMirror.getTextArea()).siblings('.CodeMirror')[0]).css('font-size', $scope.userSettings.codeEditor.fontSize + 'px');
    };

    /*
     * Options
     */

    $scope.fontSizes = [];
    for (var i = 8; i<=30; i++) {
        $scope.fontSizes.push(i);
    }

    $scope.codeMirrorThemeList = [
        "default",
        "3024-day",
        "3024-night",
        "ambiance",
        "base16-dark",
        "base16-light",
        "blackboard",
        "cobalt",
        "eclipse",
        "elegant",
        "erlang-dark",
        "lesser-dark",
        "mbo",
        "mdn-like",
        "midnight",
        "monokai",
        "neat",
        "neo",
        "night",
        "paraiso-dark",
        "paraiso-light",
        "pastel-on-dark",
        "rubyblue",
        "solarized",
        "the-matrix",
        "tomorrow-night-eighties",
        "twilight",
        "vibrant-ink",
        "xq-dark",
        "xq-light"
    ];

    $scope.homeBehaviorList = [
        {
            label: 'Default',
            state: HomeBehavior.DEFAULT,
        },
        {
            label: 'Projects',
            state: HomeBehavior.PROJECTS,
        },
        {
            label: 'Last homepage',
            state: HomeBehavior.LAST,
        },
    ];

    // Take the potentially new tiles and override with the existing
    $scope.userSettings.home.rows = $scope.userSettings.home.rows || [];
    EXPORTED_TILES.forEach(tile => {
        const found = $scope.userSettings.home.rows.find(row => row.tileType == tile.type);
        if (found) {
            Object.assign(found, { name: tile.heading, tileType: tile.type });
        } else {
            $scope.userSettings.home.rows.push({ name: tile.heading, tileType: tile.type, visible: true });
        }
    });
    $scope.oldUserSettings.home.rows = angular.copy($scope.userSettings.home.rows); // Trick for the save button
    $scope.nonVisibleRows = $scope.userSettings.home.rows.filter(r => r.visible === false);

    $scope.removeRow = (row, idx) => {
        row.visible = false;
        $scope.userSettings.home.rows.push($scope.userSettings.home.rows.splice(idx, 1)[0]);
        $scope.nonVisibleRows = $scope.userSettings.home.rows.filter(r => r.visible === false);
    };

    $scope.addNewRow = selectedOption => {
        if (!selectedOption) { return; }
        const found = $scope.userSettings.home.rows.find(r => r.tileType === selectedOption.tileType);
        const foundIndex = $scope.userSettings.home.rows.findIndex(r => r.tileType === selectedOption.tileType);
        if (found !== undefined) {
            found.visible = true;
            $scope.nonVisibleRows = $scope.userSettings.home.rows.filter(r => r.visible === false);
            $scope.userSettings.home.rows.splice(foundIndex, 1);
            const newPosition = $scope.userSettings.home.rows.length - $scope.nonVisibleRows.length;
            $scope.userSettings.home.rows.splice(newPosition, 0, found);
        }
    };

    $scope.treeOptions = {
        dropped: () => {
            // Rebuild position based on index of the list as the component has already updated their index
            $scope.userSettings.home.rows.forEach((r, index) => r.position = index);
        },
    }
});



app.service("AchievementService", ['$rootScope', function () {
    const achievements = {
        LOL: {
            icon: 'icon-bell',
            title: "I lol on you",
            text: "You clicked the lol button"
        },
        // This is buggy
        // ACTIVE_5_MINUTES : {
        //     icon : 'icon-bell',
        //     title : "Eager discoverer",
        //     text : "Use Dataiku DSS for 5 minutes"
        // },
        // ACTIVE_30_MINUTES : {
        //     icon : 'icon-bell',
        //     title : "Wanna-be addict",
        //     text : "Use Dataiku DSS for 30 minutes"
        // },
        LETS_GET_COOKING: {
            icon: 'icon-book',
            title: "Let's get cooking",
            text: "Create your first recipe"
        },
        APPRENTICE_BARTENDER: {
            icon: 'icon-visual_prep_cleanse_recipe',
            title: "Apprentice bartender",
            text: "Create a shaker script with 5 steps"
        },
        NOT_QUITE_PARKINSON: {
            icon: 'icon-visual_prep_cleanse_recipe',
            title: "Eidetic memory",
            text: "Shake with more than 20 steps"
        },
        ALL_ON_BOARD: {
            icon: 'icon-group',
            title: "All on board !",
            text: "Connect at least 3 times to DSS"
        },
        OH_NOES_JOB_FAILED: {
            icon: 'icon-frown',
            title: 'Oh noes ! Job failed !',
            text: 'Fail your first job'
        },
        MY_FIRST_JOB: {
            icon: 'icon-rocket',
            title: 'My first job !',
            text: 'Make your first job success'
        },
        STING_OF_THE_BEE: {
            icon: 'icon-code_hive_recipe',
            title: 'Sting of the bee',
            text: 'Fail a Hive job'
        },
        SLOW_SHAKE_1: {
            icon: 'icon-visual_prep_cleanse_recipe',
            title: 'I almost had to wait',
            text: 'Make a Shaker script last more than 10 seconds'
        },
        SLOW_SHAKE_2: {
            icon: 'icon-visual_prep_cleanse_recipe',
            title: 'I guess I could grab a coffee',
            text: 'Make a Shaker script last more than 30 seconds'
        },
        SLOW_SHAKE_3: {
            icon: 'icon-visual_prep_cleanse_recipe',
            title: "Almost fell asleep",
            text: 'Make a Shaker script last more than 1 minute'
        },
        CODE_SAMPLE_WIZZARD: {
            icon: 'icon-code',
            title: "My first code sample !",
            text: 'Congrats ! Even better when it\'s shared ;) '
        },
        LIGHT_THE_SPARK: {
            icon: 'icon-magic',
            title: "Homo Erectus",
            text: "Light the first Spark"
        },
        IT_HAD_TO_BE_DONE: {
            icon: 'icon-list-ol',
            title: "It had to be done !",
            text: "Complete your first todo list"
        },
        TEAM_PLAYER: {
            icon: 'icon-thumbs-up-alt',
            title: "Teammate of the month",
            text: "Add description and tags to DSS objects"
        },
        COLORS_OF_THE_WIND: {
            icon: 'icon-sun',
            title: "Paint with all the colors of the wind",
            text: "Color the flow based on various metadata"
        },
        WE_ARE_ALCHEMISTS: {
            icon: 'icon-beaker',
            title: "It's science, we're alchemists",
            text: "Create a recipe from a notebook"
        }
    };

    this.getAchievement = function(id) {
        return achievements[id];
    };
}]);


app.directive('achievements', function(AchievementService, Notification, Logger, $http, $templateCache, $compile) {
    const templatePath = "/templates/achievement.html";

    return {
        restrict : 'A',
        link : function($scope, element, attrs) {
            Notification.registerEvent("achievement-unlocked", function(evt, message) {
                Logger.info("Achievement unlocked", message);

                $http.get(templatePath, {cache: $templateCache}).then(function(response) {
                    const a = $('<div class="achievement" />').html(response.data).css('pointer-events', 'none');
                    const contents = a.contents();
                    $("body").append(a);
                    const newScope = $scope.$new();

                    const achievement = AchievementService.getAchievement(message.achievementId);
                    newScope.achievementId = message.achievementId;
                    newScope.achievementText = achievement.text;
                    newScope.achievementTitle = achievement.title;
                    newScope.achievementIcon = achievement.icon;

                    $compile(contents)(newScope);
                    window.setTimeout(function() {a.addClass("active");}, 800);
                    window.setTimeout(function() {a.addClass("gone");}, 5000);
                });
            });
        }
    };
});

app.factory('InterestWording', () => {
    const labels = {
        WATCH: 'Watch',
        UNWATCH: 'Unwatch',
        STAR: 'Star',
        UNSTAR: 'Unstar',
    };

    const tooltips = {
        WATCH: 'Receive notifications when this object changes',
        UNWATCH: 'Stop receiving notifications when this object changes',
        STAR: 'Mark this object as favorite - favorites can be easily filtered/searched in various places, including your profile',
        UNSTAR: 'Remove this object from your list of favorites',

        plural: {
            WATCH: 'Receive notifications when these objects change',
            UNWATCH: 'Stop receiving notifications when these objects change',
            STAR: 'Mark these objects as favorites - favorites can be easily filtered/searched in various places, including your profile',
            UNSTAR: 'Remove these objects from your list of favorites',
        },
    };

    return {
        labels,
        tooltips,
    };
});

app.factory('WatchInterestState', () => {
    const values = {
        YES: 'YES',
        SHALLOW: 'SHALLOW',
        ENO: 'ENO',
        INO: 'INO',
    };

    const { YES, SHALLOW } = values;
    const isShallowWatching = (state) => SHALLOW == state;
    const isFullyWatching = (state) => YES == state;
    const isWatching = (state) => isFullyWatching(state) || isShallowWatching(state);

    return {
        values,
        isShallowWatching,
        isFullyWatching,
        isWatching,
    };
});

app.service('InterestsService', function($state, WT1, DataikuAPI, WatchInterestState) {
    this.watch = function(scope, taggableObjects, watch) {
        // Note: watch is not a boolean, please see WatchInterestState
        let w;
        if (watch === true) {
            w = WatchInterestState.values.YES;
        } else if (watch === false) {
            w = WatchInterestState.values.ENO;
        } else {
            w = watch;
        }

        WT1.event("watch-object", {watch: w, state: $state.current.name, objects: taggableObjects.length});
        return DataikuAPI.interests.watch(taggableObjects, w)
            .success(function() {})
            .error(setErrorInScope.bind(scope));
    };

    this.star = function(scope, taggableObjects, star) {
        WT1.event("star-object", {star: star, state: $state.current.name, objects: taggableObjects.length});
        return DataikuAPI.interests.star(taggableObjects, star)
            .success(function() {})
            .error(setErrorInScope.bind(scope));
    };
});

}());
