(function(){
'use strict';

var app = angular.module('dataiku.admin.security', []);

app.controller("AdminSecurityController", function(){
});


app.directive("projectGrantItem", function(){
    return {
        template : '<div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.readProjectContent" class="grant readProjectContent">RC</div></div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.writeProjectContent" class="grant writeProjectContent">WC</div></div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.runScenarios" class="grant runScenarios">RS</div></div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.readDashboards" class="grant readDashboards">RD</div></div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.writeDashboards" class="grant writeDashboards">WD</div></div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.moderateDashboards" class="grant moderateDashboards">MD</div></div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.manageDashboardAuthorizations" class="grant manageDashboardAuthorizations">DA</div></div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.manageExposedElements" class="grant manageExposedElements">EE</div></div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.manageAdditionalDashboardUsers" class="grant manageAdditionalDashboardUsers">AU</div></div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.executeApp" class="grant executeApp">EA</div></div>'+
                    '<div class="grant-wrapper"><div ng-show="grant.item.admin" class="grant admin">A</div></div>' +
                    '<div class="grant-wrapper"><div class="grant"></div></div>'+
                    '</div>',
        scope : {
            grant : '='
        }
    }
});


app.directive("authorizationMatrixTable", function(){
    return {
        scope : true,
        link : function($scope) {
            $scope.hover = {
                col : null
            }
        }
    }
});


app.controller("AdminSecurityAuthorizationMatrixController", function($scope, $state, $stateParams, DataikuAPI, TopNav) {
	TopNav.setLocation(TopNav.DSS_HOME, "administration");

    function range(n) {
        return Array.apply(null, Array(n)).map(function(_, i) {return i;});
    }

	DataikuAPI.security.getAuthorizationMatrix().success(function(data){
        $scope.authorizationMatrix = data;
        data.perUser.$pageSize = Math.round(2000 / data.perUser.users.length);
        data.perGroup.$pageSize = Math.round(2000 / data.perGroup.groups.length);
        data.perUser.$pages = range(Math.ceil(data.perUser.projectsGrants.length/data.perUser.$pageSize));
        data.perGroup.$pages = range(Math.ceil(data.perGroup.projectsGrants.length/data.perGroup.$pageSize));
        data.perUser.$offset = 0;
        data.perGroup.$offset = 0;
    }).error(setErrorInScope.bind($scope));

    $scope.uiState = $scope.uiState || {};
    $scope.uiState.showPermissionsBy = $scope.uiState.showPermissionsBy || "USERS";
});


app.controller("UsersController", function($scope, $state, $stateParams, DataikuAPI, $route, $modal, $q, Dialogs, TopNav, Logger, CreateModalFromTemplate) {
    function arrayToHtmlList(a) {
        return a.map(e => `<li>${e}</li>`).join('');
    }

    function usersToHtml(users) {
        return users.map(u => `${u.login}: ${u.displayName}`);
    }

	TopNav.setLocation(TopNav.DSS_HOME, "administration");
	$scope.refreshList = function() {
        DataikuAPI.admin.users.list().success(function(data) {
            $scope.users = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.canDoDisableEnableMassAction = function (selectedUsers, activate) {
        return selectedUsers.some(u => u.enabled !== activate);
    };

    $scope.activateDeactivateUsers = function (users, activate) {
        event.preventDefault();
        if (!$scope.canDoDisableEnableMassAction(users, activate)) {
            return;
        }
        users = users.filter(u => u.enabled !== activate);

        const title = `Confirm user${users.length > 1 ? 's' : ''} ${activate ? 'activation' : 'deactivation'}`;
        const loginsText = arrayToHtmlList(usersToHtml(users));
        const text = `Are you sure you want to ${activate ? 'enable' : 'disable'} the following user${users.length > 1 ? 's' : ''}<ul>${loginsText}</ul>`;
        const logins = users.map(u => u.login);

        if (activate) {
            Dialogs.confirmPositive($scope, title, text).then(() => {
                DataikuAPI.admin.users.enableOrDisable(logins, true).success(() => {
                    $scope.refreshList();
                }).error(setErrorInScope.bind($scope));
            });
        } else {
            DataikuAPI.admin.users.prepareDisable(logins).success(data => {
                Dialogs.confirmInfoMessages($scope, title, data, text, false).then(() => {
                    DataikuAPI.admin.users.enableOrDisable(logins, false).success(() => {
                        $scope.refreshList();
                    }).error(setErrorInScope.bind($scope));
                });
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.deleteUsers = function(selectedUsers) {
        const loginsText = arrayToHtmlList(usersToHtml(selectedUsers));
        const text = `Are you sure you want to delete the following users<ul>${loginsText}</ul>`;

        const logins = selectedUsers.map(u => u.login);
        DataikuAPI.admin.users.prepareDelete(logins).success(function(data) {
            Dialogs.confirmInfoMessages($scope, 'Confirm users deletion', data, text, false).then(function() {
                DataikuAPI.admin.users.delete(logins).success(function(data) {
                    $scope.refreshList();
                }).error(setErrorInScope.bind($scope));
            });
        }).error(setErrorInScope.bind($scope));
    };

    $scope.deleteUser = function(user) {
        DataikuAPI.admin.users.prepareDelete([user.login]).success(function(data) {
            Dialogs.confirmInfoMessages($scope, 'Confirm user deletion', data, 'Are you sure you want to delete user '+user.login + '?', false).then(function() {
                DataikuAPI.admin.users.delete([user.login]).success(function(data) {
                    $scope.refreshList();
                }).error(setErrorInScope.bind($scope));
            });
        }).error(setErrorInScope.bind($scope));
    };

    $scope.openAssignUsersToGroupModal = function(users, groups) {
        CreateModalFromTemplate("/templates/admin/security/assign-users-groups-modal.html", $scope, null, function(newScope) {
            newScope.users = users;
            const newGroups = {};

            groups.forEach(group => {
                const empty = ! users.some(u => u.groups.includes(group));
                const full = users.every(u => u.groups.includes(group));
                newGroups[group] = {
                    name: group,
                    selected: full,
                    originallyAssigned: !empty,
                    indeterminate: !empty && !full
                };
            });

            newScope.groups = newGroups;

            let newAssignedGroups = {};
            newScope.assignGroup = function(group) {
                if (!group.selected && group.originallyAssigned) {
                    newAssignedGroups[group.name] = false;
                } else if (group.selected && !group.originallyAssigned) {
                    newAssignedGroups[group.name] = true;
                } else if (group.selected && group.indeterminate) {
                    newAssignedGroups[group.name] = true;
                } else {
                    delete newAssignedGroups[group.name];
                }
            };

            newScope.wereGroupsChanged = function() {
                return Object.keys(newAssignedGroups).length > 0;
            };


            newScope.assignGroups = function(users) {
                const groupsToAdd = Object.keys(newAssignedGroups).filter(k => newAssignedGroups[k]);
                const groupsToRemove = Object.keys(newAssignedGroups).filter(k => ! newAssignedGroups[k]);


                const loginsText = arrayToHtmlList(usersToHtml(users));
                let text = `The following users <ul>${loginsText}</ul>`;
                if (groupsToAdd.length > 0) {
                    const groupsToAddText = arrayToHtmlList(groupsToAdd);
                    text += `will be added to groups <ul>${groupsToAddText}</ul>`;
                }
                if (groupsToRemove.length > 0) {
                    const groupsToRemoveText = arrayToHtmlList(groupsToRemove);
                    text += `will be removed from groups <ul>${groupsToRemoveText}</ul>`;
                }

                const logins = users.map(u => u.login);
                DataikuAPI.admin.users.prepareAssignUsersGroups(logins, groupsToAdd, groupsToRemove).success(function(data) {
                    Dialogs.confirmInfoMessages($scope, 'Confirm reassigning users to groups', data, text, false).then(function() {
                        newScope.dismiss();  // close first modal
                        Logger.info("Adding users", logins, "to group", groupsToAdd, " and removing from groups", groupsToRemove);
                        DataikuAPI.admin.users.assignUsersGroups(logins, groupsToAdd, groupsToRemove).success(function(data) {
                            $scope.refreshList();
                        }).error(setErrorInScope.bind($scope));
                    });
                }).error(setErrorInScope.bind($scope));
            };
        });
    };

    $scope.refreshList();

    DataikuAPI.security.listGroups(false).success(function(data) {
        if (data) {
            data.sort();
        }
        $scope.groups = data;
    }).error(setErrorInScope.bind($scope));
});


app.controller("UserController", function($scope, $state, $stateParams, DataikuAPI, $route, TopNav, Dialogs) {
	TopNav.setLocation(TopNav.DSS_HOME, "administration");
    let savedUser;
    $scope.user = {
            groups: [],
            login:'',
            sourceType: 'LOCAL',
            displayName:'',
            userProfile : 'DATA_SCIENTIST',
            //codeAllowed : true,
            password:''
    };
    if ($scope.appConfig && $scope.appConfig.licensing && $scope.appConfig.licensing.userProfiles) {
        $scope.user.userProfile = $scope.appConfig.licensing.userProfiles[0];
    }

    if ($stateParams.login) {
        $scope.creation = false;
        DataikuAPI.security.listGroups(true).success(function(data) {
            if (data) {
                data.sort();
            }
            $scope.allGroups = data;
            DataikuAPI.admin.users.get($stateParams.login).success(function(data) {
                $scope.user = data;
                savedUser = angular.copy(data);
            }).error(setErrorInScope.bind($scope));
        }).error(setErrorInScope.bind($scope));

    } else {
        $scope.creation = true;
        DataikuAPI.security.listGroups(true).success(function(data) {
            if (data) {
                data.sort();
            }
            $scope.allGroups = data;
        }).error(setErrorInScope.bind($scope));
    }

    $scope.prepareSaveUser = function() {
        if ($scope.creation) {
            $scope.saveUser();
        } else {
            DataikuAPI.admin.users.prepareUpdate($scope.user).success(function(data) {
                Dialogs.confirmInfoMessages($scope,
                    'Confirm user edition', data, 'Are you sure you want to edit user '+$scope.user.login + '?', true
                ).then($scope.saveUser);
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.saveUser = function() {
        if ($scope.creation) {
            DataikuAPI.admin.users.create($scope.user).success(function(data) {
                $state.go("admin.security.users.list");
            }).error(setErrorInScope.bind($scope));
        } else {
            DataikuAPI.admin.users.update($scope.user).success(function(data) {
                $state.go("admin.security.users.list");
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.userIsDirty = function() {
        return !angular.equals(savedUser, $scope.user);
    };

    var getGeneralSettings = function() {
    	DataikuAPI.admin.getGeneralSettings().success(function(gs) {
            $scope.generalSettings = gs;
    	}).error(setErrorInScope.bind($scope));
    }

    $scope.$watch('user', function() {
        if (! $scope.user.adminProperties) {
            $scope.user.adminProperties = {};
        }
        if (! $scope.user.userProperties) {
            $scope.user.userProperties = {};
        }
    });
    // Init
    getGeneralSettings();
});


app.controller("GroupsController", function($scope, $state, $stateParams, DataikuAPI, $route, $modal, $q, Dialogs, TopNav) {
	TopNav.setLocation(TopNav.DSS_HOME, "administration");
    // Populate UI
    var loadGroups = function() {
        DataikuAPI.security.listGroupsFull().success(function(groups) {
            DataikuAPI.security.listUsers().success(function(users) {
                for(var groupIdx in groups) {
                    var group = groups[groupIdx];
                    group.userCount = 0;
                    for(var userIdx in users) {
                        var userDesc = users[userIdx];
                        for(var userGroupIdx in userDesc.groups) {
                            var userGroup = userDesc.groups[userGroupIdx];
                            if(userGroup == group.name) {
                                group.userCount++;
                            }
                        }
                    }
                }
                $scope.groups = groups;
            }).error(setErrorInScope.bind($scope));
        }).error(setErrorInScope.bind($scope));
    };

    // Delete a group
    $scope.deleteGroup = function(group) {
        DataikuAPI.security.prepareDeleteGroup(group.name).success(function(data) {
            Dialogs.confirmInfoMessages($scope, 'Delete group', data, 'Are you sure you want to delete group "' + group.name + '" ?', false).then(function () {
                DataikuAPI.security.deleteGroup(group.name).success(function (data) {
                    loadGroups();
                }).error(setErrorInScope.bind($scope));
            });
        }).error(setErrorInScope.bind($scope));
    };

    // Init
    loadGroups();
});


app.controller("GroupController",function($scope, $state, $stateParams, DataikuAPI, $route, TopNav, Dialogs) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");
    let savedGroup;
    if ($stateParams.name) {
        $scope.creation = false;
        DataikuAPI.security.getGroup($stateParams.name).success(function(data) {
            $scope.group = data;
            savedGroup = angular.copy(data);
        }).error(setErrorInScope.bind($scope));
    } else {
        $scope.creation = true;
        $scope.group = {
            sourceType: 'LOCAL',
            mayWriteSafeCode : true,
            mayWriteInRootProjectFolder: true,
            mayCreateActiveWebContent: true
        };
    }

    $scope.prepareSaveGroup = function() {
        if ($scope.creation) {
            $scope.saveGroup();
        } else {
            DataikuAPI.security.prepareUpdateGroup($scope.group).success(function(data) {
                Dialogs.confirmInfoMessages($scope, 'Confirm user edition', data, 'Are you sure you want to edit group '+$scope.group.name + '?', true)
                    .then($scope.saveGroup);
            }).error(setErrorInScope.bind($scope));
        }
    };

    // Create or update a group
    $scope.saveGroup = function() {
        if ($scope.creation) {
            DataikuAPI.security.createGroup($scope.group).success(function(data) {
                $state.go("admin.security.groups.list");
            }).error(setErrorInScope.bind($scope));
        } else {
            DataikuAPI.security.updateGroup($scope.group).success(function(data) {
                $state.go("admin.security.groups.list");
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.groupIsDirty = function() {
        return !angular.equals(savedGroup, $scope.group);
    };

    var getGeneralSettings = function() {
        DataikuAPI.admin.getGeneralSettings().success(function(gs) {
            $scope.generalSettings = gs;
        }).error(setErrorInScope.bind($scope));
    }

    // Init
    getGeneralSettings();
});

app.directive("globalPermissionsEditor", function() {
    return {
        scope: {
            'permissions': '='
        },
        templateUrl: '/templates/admin/security/global-permissions-editor.html',
        link: function($scope) {
            $scope.$watch("permissions", function(nv, ov) {
                if (!nv) return;
                /* Handle implied permissions */
                nv.$mayCreateProjectsFromMacrosDisabled = false;
                nv.$mayCreateProjectsFromTemplatesDisabled = false;

                if (nv.mayCreateProjects || nv.admin) {
                    nv.$mayCreateProjectsFromMacrosDisabled = true;
                    nv.$mayCreateProjectsFromTemplatesDisabled = true;
                }
            }, true);
        }
    }
});

app.controller("AdminSecurityAuditBufferController",function($scope, $state, $stateParams, DataikuAPI, $route, TopNav, Dialogs) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");

    $scope.uiState = {
        includeAllCalls: false
    }

    $scope.refreshList = function(){
        DataikuAPI.security.getAuditBuffer($scope.uiState.includeAllCalls).success(function(data) {
            $scope.auditBuffer = data;
        }).error(setErrorInScope.bind($scope));
    }

    $scope.refreshList();
});

app.filter('auditBufferEventDetails', function() {
    return function(obj) {
        var sa = []
        Object.keys(obj).forEach(function(x) {
            if (x != "callPath" && x != "msgType" && x != "authSource" && x != "authUser"
                && x != "clientIP" && x != "originalIP") {
                sa.push(x + ": " + obj[x]);
            }
        });
        return sa.join(", ");
    };
});


app.controller("GlobalPublicAPIKeysController", function ($scope, $state, DataikuAPI, CreateModalFromTemplate, Dialogs, TopNav) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");
    $scope.refreshApiKeysList = function () {
        DataikuAPI.admin.publicApi.listGlobalKeys().success(function (data) {
            $scope.apiKeys = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.refreshApiKeysList();

    $scope.deleteGlobalKey = function (key) {
        Dialogs.confirm($scope, "Remove API key", "Are you sure you want to remove this API key?").then(function () {
            DataikuAPI.admin.publicApi.deleteGlobalKey(key).success(function (data) {
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


app.controller("EditGlobalPublicAPIKeyController", function ($scope, $state, DataikuAPI, TopNav, $stateParams) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");
    if ($stateParams.id) {
        $scope.creation = false;
        DataikuAPI.admin.publicApi.getGlobalKey($stateParams.id).success(function(data) {
            $scope.apiKey = data;
        }).error(setErrorInScope.bind($scope));
    } else {
        var sampleProjectsPrivileges = {
            '__YOUR__PROJECTEY__' : {
                admin: false,
                readProjectContent: true,
                writeProjectContent: false,
                exportDatasetsData: true,
                readDashboards: true,
                writeDashboard: false,
                moderateDashboards: false,
                runScenarios: false,
                manageDashboardAuthorizations: false,
                manageExposedElements: false,
                manageAdditionalDashboardUsers: false,
                executeApp: false
            }
        };

        var sampleProjectFoldersPrivileges = {
            '__YOUR__PROJECT_FOLDER_ID__': {
                admin: false,
                writeContents: false,
                read: true
            }
        };

        $scope.creation = true;
        $scope.apiKey = {
            label : "New key",
            globalPermissions : {admin: true},
            projects : sampleProjectsPrivileges,
            projectFolders: sampleProjectFoldersPrivileges
        };
    }

    $scope.create = function () {
        DataikuAPI.admin.publicApi.createGlobalKey($scope.apiKey).success(function (data) {
            $state.go("admin.security.globalapi.list");
        }).error(setErrorInScope.bind($scope));
    };

    $scope.save = function () {
        DataikuAPI.admin.publicApi.saveGlobalKey($scope.apiKey).success(function (data) {
            $state.go("admin.security.globalapi.list");
        }).error(setErrorInScope.bind($scope));
    };
});

app.controller("AdminPersonalPublicAPIKeysController", function ($scope, $state, DataikuAPI, CreateModalFromTemplate, Dialogs, TopNav) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");
    $scope.refreshApiKeysList = function () {
        DataikuAPI.admin.publicApi.listPersonalKeys().success(function (data) {
            $scope.apiKeys = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.refreshApiKeysList();

    $scope.deletePersonalAPIKey = function (key) {
        Dialogs.confirm($scope, "Remove API key", "Are you sure you want to remove this personal API key?").then(function () {
            DataikuAPI.admin.publicApi.deletePersonalKey(key).success(function (data) {
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

})();
