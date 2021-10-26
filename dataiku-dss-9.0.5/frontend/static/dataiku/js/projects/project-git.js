(function() {
'use strict';

const app = angular.module('dataiku.controllers');

app.controller('ProjectVersionControlController', function($scope, TopNav, DataikuAPI, Dialogs, FullGitSupportService, $stateParams, $filter, WT1, CreateModalFromTemplate,ActivityIndicator){
    var PAGE_SIZE = 20;

    TopNav.setLocation(TopNav.TOP_MORE, "version-control", "NONE", null);
    TopNav.setItem(TopNav.ITEM_PROJECT, $stateParams.projectKey);

    function warnBeforeGlobalOperation(opName, opText){
        return Dialogs.confirm($scope, opName,
            opText + " will not have any impact on any data. "+
            " This could lead to some data becoming orphan, or to some datasets pointing to stale data");
    }

    $scope.getGitFullStatus = function() {
        return FullGitSupportService.getFullStatus($scope, 
            DataikuAPI.projects.git.getFullStatus($stateParams.projectKey));
    };

    $scope.getGitBranches = function () {
         return FullGitSupportService.getBranches($scope, 
                    DataikuAPI.projects.git.listBranches($stateParams.projectKey));
    };

    $scope.filterBranches = function (query) {
        $scope.gitBranchesFiltered = $filter("filter")($scope.gitBranches, query);
    };

    $scope.formatTrackingCount = function(count) {
        return count != null ? count : "-";
    };

    $scope.switchToBranch = function(branchName) {
        if ($scope.gitStatus.hasRemoteOrigin) {
            DataikuAPI.projects.git.listProjectsMatchingRemoteRepository($stateParams.projectKey, branchName)
                .success(function(projectCandidates) {
                    CreateModalFromTemplate("/templates/projects/git/checkout-branch-modal.html", $scope, "ProjectCheckoutBranchController", function (newScope) {
                        newScope.checkoutModel.createBranch = false;
                        newScope.checkoutModel.targetBranchName = branchName;
                        if (projectCandidates && projectCandidates.length > 0) {
                            newScope.checkoutModel.checkoutMode = "GO_TO_ALTERNATE_PROJECT";
                            newScope.checkoutModel.alternateProjectKey = projectCandidates[0].projectKey;
                            newScope.checkoutModel.alternateProjectName = projectCandidates[0].projectName;
                        } else {
                            newScope.checkoutModel.checkoutMode = "DUPLICATE_PROJECT";
                        }
                    });
                    WT1.event("projects-git-switch-branch");
                })
                .error(setErrorInScope.bind($scope));
        } else {
            CreateModalFromTemplate("/templates/projects/git/checkout-branch-modal.html", $scope, "ProjectCheckoutBranchController", function (newScope) {
                newScope.checkoutModel.createBranch = false;
                newScope.checkoutModel.targetBranchName = branchName;
                newScope.checkoutModel.checkoutMode = "USE_CURRENT_PROJECT";
            });
            WT1.event("projects-git-switch-branch");
        }
    };

    $scope.modalCreateBranch = function(wantedBranch) {
        CreateModalFromTemplate("/templates/projects/git/checkout-branch-modal.html", $scope, "ProjectCheckoutBranchController", function (newScope) {
            newScope.checkoutModel.createBranch = true;
            newScope.checkoutModel.targetBranchName = wantedBranch || "";
            newScope.checkoutModel.checkoutMode = $scope.gitStatus.hasRemoteOrigin ? "DUPLICATE_PROJECT" : "USE_CURRENT_PROJECT";
        });
        WT1.event("projects-git-create-branch", {source: "branch"});
    };

    $scope.createBranchFromCommit = function(commitId) {
        CreateModalFromTemplate("/templates/projects/git/checkout-branch-modal.html", $scope, "ProjectCheckoutBranchController", function (newScope) {
            newScope.checkoutModel.createBranch = true;
            newScope.checkoutModel.targetBranchName = "";
            newScope.checkoutModel.commitId = commitId;
            newScope.checkoutModel.checkoutMode = $scope.gitStatus.hasRemoteOrigin ? "DUPLICATE_PROJECT" : "USE_CURRENT_PROJECT";
        });
        WT1.event("projects-git-create-branch", {source: "commit"});
    };

    $scope.modalDeleteLocalBranches = function() {
        const callback = function(modalScope, branchesToDelete, deleteOptions) {
            DataikuAPI.projects.git.deleteBranches($stateParams.projectKey, branchesToDelete, deleteOptions).then(function() {
                $scope.getGitBranches();
                modalScope.dismiss();
                WT1.event("projects-git-delete-branches");
            }, setErrorInScope.bind(modalScope));
        };
        FullGitSupportService.deleteBranches($scope, callback);
    };

    $scope.modalFetch = function () {
        FullGitSupportService.fetch($scope, DataikuAPI.projects.git.fetch($stateParams.projectKey));
        WT1.event("projects-git-fetch");
    };

    $scope.modalPull = function() {
        warnBeforeGlobalOperation("Pulling project", "Pulling updates from remote").then(function(){
            FullGitSupportService.pull($scope, DataikuAPI.projects.git.pull($stateParams.projectKey, $scope.gitStatus.remoteOrigin.name, $scope.gitStatus.currentBranch));
            WT1.event("projects-git-pull");
        });
    };

    $scope.modalPush = function() {
        FullGitSupportService.push($scope, DataikuAPI.projects.git.push($stateParams.projectKey));
        WT1.event("projects-git-push");
    };

    $scope.modalReset = function() {
        warnBeforeGlobalOperation("Dropping changes", "Dropping changes").then(function(){
            CreateModalFromTemplate("/templates/plugins/development/git/reset-modal.html", $scope, "ProjectGitResetController");
        });
    };

    $scope.modalAddOrEditRemote = function() {
        const callback = function(remoteName, newURL) {
            DataikuAPI.projects.git.setRemote($stateParams.projectKey, remoteName, newURL).then(function() {
                $scope.getGitFullStatus();
                ActivityIndicator.success("Remote saved", 5000);
                WT1.event("projects-git-set-remote");
            }, setErrorInScope.bind($scope));
        };
        FullGitSupportService.editRemote($scope, callback);
    };

    $scope.modalRemoveRemote = function() {
        const callback = function(remoteName) {
            DataikuAPI.projects.git.removeRemote($stateParams.projectKey, remoteName).then(function() {
                $scope.getGitFullStatus();
                $scope.getGitBranches();
                ActivityIndicator.success("Remote removed", 5000);
                WT1.event("projects-git-remove-remote");
            }, setErrorInScope.bind($scope));
        };
        FullGitSupportService.removeRemote($scope, callback);
    };

    $scope.modalCommit = function() {
        CreateModalFromTemplate("/templates/plugins/development/git/commit-modal.html", $scope, "ProjectGitCommitController");
    };

    $scope.getResetModes = function() {
        let modes = [];

        if ($scope.projectSummary && $scope.projectSummary.commitMode !== 'AUTO') {
            modes.push('HEAD');
        }

        if ($scope.gitStatus.hasRemoteOrigin && $scope.gitStatus.hasTrackingCount) {
            modes.push('UPSTREAM');
        }

        return modes;
    };

    $scope.needsExplicitCommit = function(){
        return $scope.projectSummary && $scope.projectSummary.commitMode !== 'AUTO';
    };

    $scope.gitBranchesLoaded = false;
    const updatePermissions = function() {
        if ($scope.projectSummary) {
            $scope.canChangeRemote = $scope.projectSummary.isProjectAdmin;
            $scope.canChangeBranch = $scope.projectSummary.isProjectAdmin;
            $scope.canUpdateContent = $scope.projectSummary.isProjectAdmin;
            if (!$scope.gitBranchesLoaded && $scope.canChangeBranch) {
                $scope.getGitBranches();
                $scope.gitBranchesLoaded = true;
            }
        } else {
            $scope.canChangeRemote = false;
            $scope.canChangeBranch = false;
            $scope.canUpdateContent = false;
        }
    };

    $scope.getGitFullStatus();
    updatePermissions();
    $scope.$watch('projectSummary', updatePermissions);

    $scope.loadMore = function () {
        if ($scope.hasMore && !$scope.loading) {
            $scope.loading = true;
            DataikuAPI.git.getObjectLog($stateParams.projectKey, 'PROJECT', $stateParams.projectKey, $scope.nextCommit, PAGE_SIZE).success(function (data) {
                $scope.logEntries = $scope.logEntries.concat(data.logEntries);
                $scope.nextCommit = data.nextCommit;
                if (!$scope.nextCommit) {
                    $scope.hasMore = false;
                }
                $scope.loading = false;
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.loadLogFromStart = function() {
        $scope.nextCommit = null;
        $scope.logEntries = [];
        $scope.hasMore = true;

        $scope.loadMore();
    };

    $scope.loadLogFromStart();
});

app.controller("ProjectGitCommitController", function($scope, $stateParams, $filter, DataikuAPI, ActivityIndicator, $timeout, WT1) {
    DataikuAPI.git.prepareObjectCommit($stateParams.projectKey, 'PROJECT', $stateParams.projectKey).success(function (data) {
        $scope.preparationData = data;
    }).error(setErrorInScope.bind($scope));

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
        DataikuAPI.git.commitObject($stateParams.projectKey, 'PROJECT', $stateParams.projectKey, $scope.uiState.message)
            .success(function () {
                ActivityIndicator.success('Changes successfully committed.');
                $scope.dismiss();
                $scope.getGitFullStatus();
                $scope.loadLogFromStart();
                WT1.event("projects-git-commit");
            }).error(setErrorInScope.bind($scope));
    };
});

app.controller("ProjectCheckoutBranchController", function($scope, $state, $stateParams, DataikuAPI, FutureWatcher, ProgressStackMessageBuilder, WT1, ProjectFolderContext, PromiseService, Dialogs, $q) {
    function isProjectKeyAlreadyUsed(projectKey) {
        return projectKey && $scope.allProjectKeys && $scope.allProjectKeys.indexOf(projectKey) >= 0;
    }

    function isBranchNameAlreadyUsed(branchName) {
        return branchName && $scope.gitBranches && $scope.gitBranches.indexOf(branchName) >= 0;
    }

    function doesBranchNameContainsInvalidCharacters(branchName) {
        // must not have ASCII control characters (00-40 + DEL=177), space, tilde, caret, colon, at, star, question mark, left square bracket.
        return /[\000-\037\177 ~^:@*?\[\\]/g.test(branchName);
    }

    function isBranchNameValid(branchName) {
        return branchName
            && !doesBranchNameContainsInvalidCharacters(branchName)
            // must not start with slash (/)
            && !/^\//g.test(branchName)
            // must not end with slash (/), dot (.) or ".lock"
            && !/(\/|\.|\.lock)$/g.test(branchName)
            // must not contain "/." or ".." or "//"
            && !/(\/\.|\.\.|\/\/)/g.test(branchName);
    }

    function sanitizeProjectKey(projectKey) {
        return projectKey.toUpperCase().replace(/\W+/g, "_").replace(/_+$/,'');
    }

    function fixProjectKey(newProjectKey) {
        if (!newProjectKey || !$scope.allProjectKeys) { // Not initialized or all project keys not loaded yet
            return;
        }
        const slug = sanitizeProjectKey(newProjectKey);
        let cur = slug;
        let i = 0;
        while (isProjectKeyAlreadyUsed(cur)) {
            cur = slug + "_" + (++i);
        }
        $scope.checkoutModel.projectKey = cur;
    }

    var abortHook = null;

    // Initialize scope variables
    $scope.phase = 'INITIAL';
    $scope.checkoutModel = {
        // Initial phase
        createBranch: false,
        targetBranchName: undefined,
        checkoutMode: "USE_CURRENT_PROJECT",
        branchNameError: false, // true if the branch name already exists or is invalid (only used when creating a new branch)

        // Switch phase
        clearOutputDatasets: false,

        // Duplicate phase
        projectKey: sanitizeProjectKey($scope.projectSummary.projectKey),
        projectName: $scope.projectSummary.name,
        projectKeyAlreadyUsed: false
    };
    $scope.checkoutModel.projectKeyAlreadyUsed = isProjectKeyAlreadyUsed($scope.checkoutModel.projectKey);
    $scope.dupOptions = {
        exportAnalysisModels: true,
        exportSavedModels: true,
        exportModelEvaluationStores: false,
        exportGitRepository: true,
        exportInsightsData: true,
        duplicationMode: 'UPLOADS_ONLY',
        exportUploads: true,
        exportAllInputDatasets: false,
        exportAllInputManagedFolders: false,
        exportAllDatasets: false,
        exportManagedFolders: false,
        targetProjectFolderId: ProjectFolderContext.getCurrentProjectFolderId()
    };

    // Define scope functions
    $scope.setDuplicationMode = function(mode) {
        $scope.dupOptions.duplicationMode = mode;
    };

    $scope.validateInitialPhase = function() {
        if ($scope.checkoutModel.createBranch && !isBranchNameValid($scope.checkoutModel.targetBranchName)) {
            $scope.checkoutModel.branchNameError = true;
            $scope.checkoutModel.branchNameErrorMessage = "This branch name is invalid.";
            return;
        }
        if ($scope.checkoutModel.checkoutMode === "GO_TO_ALTERNATE_PROJECT") {
            $scope.dismiss();
            $state.transitionTo("projects.project.home.regular", {projectKey : $scope.checkoutModel.alternateProjectKey});
        } else if ($scope.checkoutModel.checkoutMode === "DUPLICATE_PROJECT") {
            $scope.moveToDuplicatePhase();
        } else if (!$scope.checkoutModel.createBranch) {
            $scope.moveToSwitchPhase();
        } else {
            $scope.createBranch();
        }
    };

    $scope.moveToInitialPhase = function() {
        $scope.phase = "INITIAL";
        $scope.fatalAPIError = null;
        $scope.duplicateResponse = null;
    };

    $scope.moveToDuplicatePhase = function() {
        $scope.phase = "READY_TO_DUPLICATE";
        $scope.checkoutModel.projectKey = sanitizeProjectKey($scope.projectSummary.projectKey + "_" + $scope.checkoutModel.targetBranchName);
        $scope.checkoutModel.projectName = $scope.projectSummary.name + " (" + $scope.checkoutModel.targetBranchName + ")";
        fixProjectKey($scope.checkoutModel.projectKey);
    };

    $scope.moveToSwitchPhase = function() {
        $scope.phase = "READY_TO_SWITCH";
        DataikuAPI.projects.checkDeletability($stateParams.projectKey).success(function(data) {
            if (data.anyMessage) {
                $scope.hasDependencyWarnings = true;
                $scope.dependencyWarnings = { messages : data.messages };
            }
        });
     };

    $scope.browse = folderIds => {
        return PromiseService.qToHttp($q(resolve => {
            const ids = folderIds.split('/');
            $scope.destination = ids[ids.length - 1];
            DataikuAPI.projectFolders.listContents($scope.destination, true, 1, true).success(data => {
                const folders = data.folder.children.map(f => angular.extend({}, f, { directory: true, fullPath: f.id }))
                const pathElts = treeToList(data.folder, item => item.parent);

                resolve({
                    children: folders,
                    pathElts: pathElts.map(f => angular.extend({}, f, { toString: () => f.id })),
                    exists: true,
                    directory: true,
                });
            }).error(setErrorInScope.bind($scope));
        }));
    };
    $scope.getProjectFolderName = item => item.name;

    $scope.createBranch = function() {
        DataikuAPI.projects.git.createBranch($stateParams.projectKey, $scope.checkoutModel.targetBranchName, $scope.checkoutModel.commitId).then(function () {
            $state.reload();
            $scope.dismiss();
        }, setErrorInScope.bind($scope));
    };

    $scope.switchBranch = function () {
        $scope.duplicateResponse = null;
        DataikuAPI.projects.git.switchBranch($stateParams.projectKey, $scope.checkoutModel.targetBranchName, $scope.checkoutModel.clearOutputDatasets).then(function (result) {
            var parentScope = $scope.$parent;
            $scope.dismiss();
            const success = result.data.commandSucceeded;
            const hasWarnOrErrorMessage = result.data.messages && (result.data.messages.warning || result.data.messages.error);
            const hasInfoMessages = result.data.messages && result.data.messages.messages.length > 1;
            const hasLogMessages = result.data.log && result.data.log.lines && result.data.log.lines.length > 2; // If everything went smoothly, we get 2 lines of logs.
            if (!success || hasWarnOrErrorMessage || hasInfoMessages || hasLogMessages) {
                Dialogs.infoMessagesDisplayOnly(parentScope, "Switch branch result", result.data.messages, result.data.log, true).then(function() {
                    if (success) {
                        $state.reload();
                    }
                }, null);
            } else {
                $state.reload();
            }
        }, setErrorInScope.bind($scope));
    };

    $scope.duplicate = function() {
        $scope.duplicateResponse = null;
        $scope.phase = 'DUPLICATING';
        $scope.dupOptions.targetProjectKey = $scope.checkoutModel.projectKey;
        $scope.dupOptions.targetProjectName = $scope.checkoutModel.projectName;
        $scope.dupOptions.createBranch = $scope.checkoutModel.createBranch;
        $scope.dupOptions.targetBranchName = $scope.checkoutModel.targetBranchName;
        $scope.dupOptions.commitId = $scope.checkoutModel.commitId;
        DataikuAPI.projects.startProjectDuplication(
            $scope.projectSummary.projectKey,
            $scope.dupOptions
        ).success(function(initialResponse){
            abortHook = function() {
                DataikuAPI.futures.abort(initialResponse.jobId).error(setErrorInScope.bind($scope));
            };
            FutureWatcher.watchJobId(initialResponse.jobId).success(function(data){
                abortHook = null;
                $scope.futureResponse = null;
                $scope.duplicateResponse = data.result;
                if (!data.aborted && (data.result.success || data.result.messages == null || data.result.messages.length === 0)) {
                    $scope.gotoResult();
                } else if ((data.result.warning || data.result.error) && !data.result.fatal) {
                    $scope.phase = "SHOW_WARNINGS";
                } else {
                    $scope.phase = "READY_TO_DUPLICATE";
                }
            }).update(function(data){
                $scope.percentage = ProgressStackMessageBuilder.getPercentage(data.progress);
                $scope.futureResponse = data;
                $scope.stateLabels = ProgressStackMessageBuilder.build($scope.futureResponse.progress, true);
            }).error(function(data, status, headers) {
                abortHook = null;
                $scope.futureResponse = null;
                $scope.duplicateResponse = null;
                $scope.phase = "READY_TO_DUPLICATE";
                setErrorInScope.bind($scope)(data, status, headers);
            })
        }).error(function(a,b,c){
            $scope.phase = 'READY_TO_DUPLICATE';
            setErrorInScope.bind($scope)(a,b,c);
            $scope.duplicateResponse = null;
        });
        WT1.event("projects-git-create-branch-and-duplicate", {
            duplicationMode: $scope.dupOptions.duplicationMode,
            exportAnalysisModels: $scope.dupOptions.exportAnalysisModels,
            exportSavedModels: $scope.dupOptions.exportSavedModels,
            exportModelEvaluationStores: $scope.dupOptions.exportModelEvaluationStores,
            exportInsightsData: $scope.dupOptions.exportInsightsData
        });
    };

    $scope.gotoResult = function() {
        $scope.dismiss();
        $state.transitionTo("projects.project.home.regular", {projectKey : $scope.checkoutModel.projectKey});
    };

    $scope.canSelect = item => item.canWriteContents;

    // Add watches
    $scope.$on("$destroy", function() {
        // cancel import if modal dismissed
        if (abortHook) {
            abortHook();
        }
    });
    $scope.$watch("checkoutModel.targetBranchName", function(newBranchName) {
        if ($scope.checkoutModel.createBranch) {
            if (doesBranchNameContainsInvalidCharacters(newBranchName)) {
                $scope.checkoutModel.branchNameError = true;
                $scope.checkoutModel.branchNameErrorMessage = "This branch name contains invalid characters.";
            } else if (isBranchNameAlreadyUsed(newBranchName)) {
                $scope.checkoutModel.branchNameError = true;
                $scope.checkoutModel.branchNameErrorMessage = "This branch name already exists.";
            } else {
                $scope.checkoutModel.branchNameError = false;
            }
        }
    });
    $scope.$watch("checkoutModel.projectName", fixProjectKey);
    $scope.$watch("checkoutModel.projectKey", function(newProjectKey) {
        $scope.checkoutModel.projectKeyAlreadyUsed = isProjectKeyAlreadyUsed(newProjectKey);
    });

    // Call backend to initialize form
    DataikuAPI.projects.listAllKeys()
        .success(function(data) {
            $scope.allProjectKeys = data;
            fixProjectKey($scope.checkoutModel.projectKey);
        })
        .error(setErrorInScope.bind($scope));

    DataikuAPI.projectFolders.listContents($scope.dupOptions.targetProjectFolderId === null ? '' : $scope.dupOptions.targetProjectFolderId, true, 1, true).success(data => {
        const pathElts = treeToList(data.folder, item => item.parent);
        $scope.dupFolder = angular.extend({}, data.folder, { pathElts: pathElts.map(f => f.name).join('/') });
    }).error(setErrorInScope.bind($scope));

});

app.controller("ProjectGitResetController", function($scope, $filter, $stateParams, DataikuAPI, ActivityIndicator, Dialogs, $state, WT1) {
    $scope.resetStrategy = $scope.getResetModes()[0];

    $scope.setStrategy = function(strategy) {
        if ($scope.getResetModes().includes(strategy)) {
            $scope.resetStrategy = strategy;
        }
    };

    $scope.gitReset = function() {
        const resetToUpstream = () => DataikuAPI.projects.git.resetToUpstream($stateParams.projectKey);
        const resetToHead = () => DataikuAPI.projects.git.resetToHead($stateParams.projectKey);
        const resetAPICall = $scope.resetStrategy === 'HEAD' ? resetToHead : resetToUpstream;

        resetAPICall().then(function () {
                ActivityIndicator.success('Reset succeeded.');
                $state.reload();
                $scope.dismiss();
                WT1.event("projects-git-reset", {resetStrategy: $scope.resetStrategy});
            },
            setErrorInScope.bind($scope));
    };
});

}());