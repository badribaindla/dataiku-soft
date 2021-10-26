(function() {
'use strict';

const app = angular.module('dataiku.plugindev.git',  ['dataiku.git']);


app.controller("_PlugindevGitController", function($scope, DataikuAPI, $state, $stateParams, CreateModalFromTemplate,
                                                   Dialogs, FutureProgressModal, DKUtils, $filter, WT1, FullGitSupportService) {
    $scope.getGitFullStatus = function(cb) {
        return FullGitSupportService.getFullStatus($scope,
                    DataikuAPI.plugindev.git.getFullStatus($stateParams.pluginId),
                    cb);
    };

    $scope.modalRemoveRemote = function() {
        const callback = function(remoteName) {
            WT1.event("plugindev-git-remove-remote", {pluginId: $stateParams.pluginId});
            DataikuAPI.plugindev.git.removeRemote($stateParams.pluginId, remoteName).then(function() {
                $scope.getGitFullStatus();
                $scope.getGitBranches();
            }, setErrorInScope.bind($scope));
        };
        FullGitSupportService.removeRemote($scope, callback);
    };

    $scope.getGitBranches = function () {
         return FullGitSupportService.getBranches($scope, DataikuAPI.plugindev.git.listBranches($stateParams.pluginId));
    };

    $scope.filterBranches = function (query) {
        $scope.gitBranchesFiltered = $filter("filter")($scope.gitBranches, query);
    };

    $scope.formatTrackingCount = function(count) {
        return count != null ? count : "-";
    };

    $scope.postSaveCallback = function() {
        // We want to update the tracking count after the save when autocommit is enabled
        if ($scope.appConfig.pluginDevExplicitCommit === false && $scope.appConfig.pluginDevGitMode === 'PLUGIN') {
            $scope.getGitFullStatus();
        }
    };

    $scope.modalFetch = function() {
        WT1.event("plugindev-git-fetch", {pluginId: $stateParams.pluginId});
        FullGitSupportService.fetch($scope, DataikuAPI.plugindev.git.fetch($stateParams.pluginId));
    };

    $scope.modalPull = function() {
        WT1.event("plugindev-git-pull", {pluginId: $stateParams.pluginId});
        FullGitSupportService.pull($scope, DataikuAPI.plugindev.git.pull($stateParams.pluginId));
    };

    $scope.modalPush = function() {
        WT1.event("plugindev-git-push", {pluginId: $stateParams.pluginId});
        FullGitSupportService.push($scope, DataikuAPI.plugindev.git.push($stateParams.pluginId));
    };

    $scope.modalAddOrEditRemote = function() {
        const callback = function(remoteName, newURL) {
            WT1.event("plugindev-git-set-remote", {pluginId: $stateParams.pluginId});
            DataikuAPI.plugindev.git.setRemote($stateParams.pluginId, remoteName, newURL).then(function() {
                $scope.getGitFullStatus();
            }, setErrorInScope.bind($scope));
        };
        FullGitSupportService.editRemote($scope, callback);
    };

    $scope.switchToBranch = function(branchName) {
        WT1.event("plugindev-git-switch-branch", {pluginId: $stateParams.pluginId});
        FullGitSupportService.switchToBranch($scope, DataikuAPI.plugindev.git.switchBranch($stateParams.pluginId, branchName));
    };

    $scope.modalDeleteLocalBranches = function() {
        const callback = function(modalScope, branchesToDelete, deleteOptions) {
            WT1.event("plugindev-git-delete-branches", {pluginId: $stateParams.pluginId});
            DataikuAPI.plugindev.git.deleteBranches($stateParams.pluginId, branchesToDelete, deleteOptions).then(function() {
                $state.reload();
                modalScope.dismiss();
            }, setErrorInScope.bind(modalScope));
        };
        FullGitSupportService.deleteBranches($scope, callback);
    };

    $scope.needsExplicitCommit = function(){
        return $scope.appConfig.pluginDevExplicitCommit;
    };

    $scope.modalCommit = function() {
        CreateModalFromTemplate("/templates/plugins/development/git/commit-modal.html", $scope, "PlugindevCommitController");
    };

    $scope.getResetModes = function() {
        let modes = [];

        if ($scope.appConfig.pluginDevExplicitCommit)
            modes.push('HEAD');

        if ($scope.gitStatus.hasRemoteOrigin && $scope.gitStatus.hasTrackingCount)
            modes.push('UPSTREAM');

        return modes;
    };

    $scope.modalReset = function() {
        CreateModalFromTemplate("/templates/plugins/development/git/reset-modal.html", $scope, "PlugindevResetController");
    };

    $scope.$on('pluginReload',function() {
        $scope.getGitBranches();
    });

    $scope.canChangeRemote = true;
    $scope.canChangeBranch = true;
    $scope.canUpdateContent = true;
});


app.controller("PlugindevCreateBranchController", function($scope, $stateParams, DataikuAPI, $state) {
    $scope.createBranch = function() {
        DataikuAPI.plugindev.git.createBranch($stateParams.pluginId, $scope.targetBranchName, $scope.commitId).then(function() {
            $state.reload();
            $scope.dismiss();
        }, setErrorInScope.bind($scope));
    };
});

app.controller("PlugindevCommitController", function($scope, $stateParams, $filter, DataikuAPI, ActivityIndicator, $timeout, WT1) {
    DataikuAPI.plugindev.git.prepareCommit($stateParams.pluginId).then(function(resp) {
        $scope.preparationData = resp.data;
    }, setErrorInScope.bind($scope));

    $scope.uiState = {
        activeTab: 'message',
        message: ''
    };

    $timeout(() => {
        // Magic happens here: if commitEditorOptions is defined too early, the textarea won't properly autofocus
        $scope.commitEditorOptions = {
            mode : 'text/plain',
            lineNumbers : false,
            matchBrackets : false,
            autofocus: true,
            onLoad : function(cm) {$scope.codeMirror = cm;}
        };
    }, 100);


    $scope.gitCommit = function() {
        WT1.event("plugindev-git-commit", {pluginId: $stateParams.pluginId});
        DataikuAPI.plugindev.git.commit($stateParams.pluginId, $scope.uiState.message).then(function() {
                ActivityIndicator.success('Changes successfully committed.');
                $scope.dismiss();
                $scope.getGitFullStatus();
            },
            setErrorInScope.bind($scope));
    };
});


app.controller("PlugindevResetController", function($scope, $filter, $stateParams, DataikuAPI, ActivityIndicator, Dialogs, $state, WT1) {
    $scope.resetStrategy = $scope.getResetModes()[0];

    $scope.setStrategy = function(strategy) {
        if ($scope.getResetModes().includes(strategy)) {
            $scope.resetStrategy = strategy;
        }
    };

    $scope.gitReset = function() {
        const resetToUpstream = () => DataikuAPI.plugindev.git.resetToUpstream($stateParams.pluginId);
        const resetToHead = () => DataikuAPI.plugindev.git.resetToHead($stateParams.pluginId);
        const resetAPICall = $scope.resetStrategy === 'HEAD' ? resetToHead : resetToUpstream;
        WT1.event("plugindev-git-reset", {pluginId: $stateParams.pluginId, resetStrategy: $scope.resetStrategy});

        resetAPICall().then(function () {
                ActivityIndicator.success('Reset succeeded.');
                $state.reload();
                $scope.dismiss();
            },
            setErrorInScope.bind($scope));
    };
});


app.directive("pluginGitLog", function($controller, DataikuAPI, $stateParams) {
    return {
        templateUrl: "/templates/git/git-log.html",
        scope: {
            logEntries: '=',
            lastStatus: '=',
            objectRevertable: '=',
            objectRef: '=',
            projectRevertable: '=',
            commitRevertable: '=',
            noCommitDiff: '=',
            createBranchFromCommit: '='
        },
        link: function ($scope, element) {
            const pluginGitAPI = {
                getRevisionsDiff: (commitFrom, commitTo) => DataikuAPI.plugindev.git.getRevisionsDiff($stateParams.pluginId, commitFrom, commitTo),
                getCommitDiff: (commitId) => DataikuAPI.plugindev.git.getCommitDiff($stateParams.pluginId, commitId),
                revertObjectToRevision: () => console.warn("`revertObjectToRevision` should not be fired on a plugin"),  // NOSONAR: OK to use console.
                revertProjectToRevision: (hash) => DataikuAPI.plugindev.git.revertPluginToRevision($stateParams.pluginId, hash),
                revertSingleCommit: (hash) => DataikuAPI.plugindev.git.revertSingleCommit($stateParams.pluginId, hash),
                createBranchFromCommit: $scope.createBranchFromCommit
            };

            $controller('_gitLogControllerBase', {$scope: $scope, element: element, DataikuGitAPI: pluginGitAPI,
                                                  objectType: "plugin"});
        }
    }
});


app.directive('branchPopup', function ($stateParams, DataikuAPI,$rootScope,$timeout,CreateModalFromTemplate,Dialogs) {
    return {
        controller: function ($scope) {
        },
        link:function (scope, element, attr) {
        },
        templateUrl: '/templates/plugins/development/git/branch-popup.html"'
    };
});


})();
