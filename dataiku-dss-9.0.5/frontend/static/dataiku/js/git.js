(function() {
'use strict';

/** This module provides global Git capabilities that are shared between projects, plugins, git references, ... */
const app = angular.module('dataiku.git', []);

app.controller("CommitObjectModalController", function($scope, $stateParams, Assert, DataikuAPI) {
    $scope.uiState = {
        activeTab: "message"
    };

    function fetch() {
        Assert.inScope($scope, 'object');
        DataikuAPI.git.prepareObjectCommit($stateParams.projectKey,
        	$scope.object.objectType,
        	$scope.object.objectId).success(function(data){
            $scope.preparationData = data;
        }).error(setErrorInScope.bind($scope))
    }

    $scope.$watch("object", function(nv, ov){
        if (!nv) {
            return;
        }
        fetch();
    });

    $scope.commit = function() {
    	Assert.inScope($scope, 'object');
    	DataikuAPI.git.commitObject($stateParams.projectKey,
        	$scope.object.objectType,
        	$scope.object.objectId, $scope.uiState.message).success(function(data){
        	$scope.dismiss();
        }).error(setErrorInScope.bind($scope))
    };
});

app.controller("_gitLogControllerBase", function($scope, DataikuGitAPI, element, objectType, $document, $state, $timeout, CreateModalFromTemplate, $stateParams, Dialogs, $filter, DKUtils) {
    let $element = $(element[0]);
    let $line = $element.find('.line-selected');

    $scope.compare = {};

    $scope.setCompareFrom = function(day, commit) {
        $scope.compare.from = {day: day, commit: commit};
        $scope.compare.to = null;
        $timeout(function() { $document.on('click', $scope.exitCompare); });
    };

    $scope.exitCompare = function() {
        safeApply($scope, function() { $scope.compare = {}; });
        $document.off('click', $scope.exitCompare)
    };

    $scope.$on('$destroy', function() {
        $document.off('click', $scope.exitCompare)
    });

    $scope.setCompareTo = function(day, commit) {
        if (!$scope.compare.from) return;
        $scope.compare.to = {day: day, commit: commit};
    };

    $scope.dayInCompareRange = function(day) {
        if (!$scope.compare.from) return true;
        if (!$scope.compare.to) return $scope.compare.from.day == day;
        return day >= $scope.compare.top.day && day <= $scope.compare.bottom.day;
    };

    $scope.commitInCompareRange = function(day, commit) {
        if (!$scope.compare.from) return true;
        if (!$scope.compare.to) return $scope.compare.from.day == day && $scope.compare.from.commit == commit;

        var afterTop = day > $scope.compare.top.day || (day == $scope.compare.top.day) && commit > $scope.compare.top.commit;
        var beforeBottom = day < $scope.compare.bottom.day || (day == $scope.compare.bottom.day) && commit < $scope.compare.bottom.commit;
        return afterTop && beforeBottom;
    };

    $scope.clickIsOnTag = function($event) {
        return $event.target && $event.target.tagName && $event.target.tagName.toLowerCase() == 'a';
    };
    $scope.openCompareModal = function() {
        if (!$scope.compare.from || !$scope.compare.to) return;

        var commitFrom = $scope.days[$scope.compare.bottom.day].changes[$scope.compare.bottom.commit].commitId;
        var commitTo = $scope.days[$scope.compare.top.day].changes[$scope.compare.top.commit].commitId;

        if (commitFrom === commitTo) return $scope.exitCompare();

        CreateModalFromTemplate("/templates/git/git-compare-modal.html", $scope, null, function(newScope) {
            DataikuGitAPI.getRevisionsDiff(commitFrom, commitTo).success(function (data) {
                newScope.diff = data;
            }).error(setErrorInScope.bind($scope));
        }).then($scope.exitCompare, $scope.exitCompare);
    };

    $scope.isElementA = function($event) {
        return $event.target.tagName.toLowerCase() == 'a';
    };
    $scope.openDiffModal = function(commitId) {
        CreateModalFromTemplate("/templates/git/git-diff-modal.html", $scope, null, function(newScope) {
            // You can't revert an object/project to its last change (#7271)
            newScope.objectRevertable &= commitId !== $scope.logEntries[0].commitId;
            newScope.projectRevertable &= commitId !== $scope.logEntries[0].commitId;

            DataikuGitAPI.getCommitDiff(commitId).success(function(data) {
                newScope.commit = data;

                if (DataikuGitAPI.createBranchFromCommit) {
                    newScope.createBranch = function() {
                        newScope.dismiss();
                        DataikuGitAPI.createBranchFromCommit(commitId);
                    }
                }

                if (newScope.objectRevertable) {
                    newScope.revertTo = function(){
                        newScope.dismiss();
                        $scope.revertObjectToHash(commitId);
                    }
                }
                if (newScope.projectRevertable) {
                    newScope.revertTo = function(){
                        newScope.dismiss();
                        $scope.revertProjectToHash(commitId);
                    }
                }
                if (newScope.commitRevertable) {
                    newScope.revertCommit = function(){
                        newScope.dismiss();
                        $scope.revertSingleCommit(commitId);
                    }
                }
            }).error(setErrorInScope.bind($scope));
        });
    };

    $scope.revertObjectToHash = function(hash) {
        let msg = "Are you sure you want to revert " + $filter("taggableObjectRef")($scope.objectRef) +"?";
        if ($scope.objectRef.projectKey) {
            msg += "\nReverting a single object can lead to inconsistent state. It is recommended to prefer reverting the complete project.";
        }
        Dialogs.confirm($scope, "Revert: " + $filter("taggableObjectRef")($scope.objectRef), msg).then(function(){
            DataikuGitAPI.revertObjectToRevision(hash).success(function(data){
                DKUtils.reloadState();
            }).error(setErrorInScope.bind($scope));
        })
    };

    $scope.revertProjectToHash = function(hash) {
        Dialogs.confirm($scope, "Revert " + objectType,
            "Are you sure you want to revert " + objectType + " to this revision?").then(function(){
            DataikuGitAPI.revertProjectToRevision(hash).success(function(data){
                DKUtils.reloadState();
            }).error(setErrorInScope.bind($scope));
        })
    };

    $scope.revertSingleCommit = function(hash) {
        Dialogs.confirm($scope, "Revert " + hash,
            "Are you sure you want to revert this revision? " +
            "Reverting a single revision can lead to an inconsistent state. It is recommended to prefer reverting "+
            "the complete " + objectType
        ).then(function(){
            DataikuGitAPI.revertSingleCommit(hash).success(function(data){
                Dialogs.infoMessagesDisplayOnly($scope, "Merge results", data).then(function(){
                    DKUtils.reloadState();
                })
            }).error(setErrorInScope.bind($scope));
        })
    };

    $scope.$watch('compare', function(compare) {
        if (!compare || !compare.from || !compare.to) return;

        var days = $element.find('.day');

        if (compare.to.day > compare.from.day || (compare.to.day == compare.from.day) && compare.to.commit > compare.from.commit) {
            compare.bottom = compare.to;
            compare.top = compare.from;
        } else {
            compare.bottom = compare.from;
            compare.top = compare.to;
        }

        var topEl = days.eq(compare.top.day).find('.commit-log-entry').eq(compare.top.commit);
        var bottomEl = days.eq(compare.bottom.day).find('.commit-log-entry').eq(compare.bottom.commit);

        $line.css('top', topEl.position().top + topEl.height()/2);
        $line.css('bottom', $line.parent().height() - bottomEl.position().top - bottomEl.height()/2);
    }, true);

    $scope.$watch("logEntries", function(nv) {
        $scope.days = [];

        if (!nv) return;
        var currentDay = {changes:[]};

        nv.forEach(function(change) {
            var date = new Date(change.timestamp).setHours(0,0,0,0);
            if (date == currentDay.date) {
                currentDay.changes.push(change);
            } else {
                if (currentDay.changes.length) $scope.days.push(currentDay);
                currentDay = {changes: [change], date: date};
            }
        });

        if(currentDay.changes.length) $scope.days.push(currentDay);
    });
});

app.directive("gitLog", function($controller, DataikuAPI, $stateParams) {
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
            const projectGitAPI = {
                getRevisionsDiff: (commitFrom, commitTo) => DataikuAPI.git.getRevisionsDiff($stateParams.projectKey, commitFrom, commitTo, $scope.objectRef),
                getCommitDiff: (commitId) => DataikuAPI.git.getCommitDiff($stateParams.projectKey, $scope.objectRef, commitId),
                revertObjectToRevision: (hash) => DataikuAPI.git.revertObjectToRevision($scope.objectRef.projectKey, $scope.objectRef.type, $scope.objectRef.id, hash),
                revertProjectToRevision: (hash) => DataikuAPI.git.revertProjectToRevision($stateParams.projectKey, hash),
                revertSingleCommit: (hash) => DataikuAPI.git.revertSingleCommit($stateParams.projectKey, $scope.objectRef, hash),
                createBranchFromCommit: $scope.createBranchFromCommit
            };

            $controller('_gitLogControllerBase', {$scope: $scope, element: element, DataikuGitAPI: projectGitAPI,
                                                objectType: "project"});
        }
    }
});

app.directive("gitDiff", function(DiffFormatter) {
    return {
        templateUrl : "/templates/git/git-diff.html",
        scope: {
            diffEntries : '='
        },
        link: function($scope, element, attrs) {
            $scope.showAll = function() {
                $scope.diffEntries.forEach(function(file) {
                    file.rendered = DiffFormatter.formatChange(file.fileChange);
                    file.shown = true;
                });
            };

            $scope.hideAll = function() {
                $scope.diffEntries.forEach(function(file) {
                    file.shown = false;
                });
            };

            $scope.toggle = function toggle(file) {
                file.shown = !file.shown;
                if (file.shown && !file.rendered) {
                    file.rendered = DiffFormatter.formatChange(file.fileChange);
                }
            };
        }
    }
});

app.directive("objectGitHistory", function($stateParams, DataikuAPI) {
    return {
        scope: {
            objectType: '@',
            objectId: '=',
            projectKey: '=?', // defaults to $stateParams.projectKey
            objectRevertable: '=?'
        },
        templateUrl : "/templates/git/object-git-history.html",
        link: function($scope) {
            var PAGE_SIZE = 20;
            $scope.hasMore = true;

            $scope.objectRef = {
                projectKey: $scope.projectKey || $stateParams.projectKey,
                type: $scope.objectType,
                id: $scope.objectId
            };

            $scope.$watch('objectId', function(nv) {
                $scope.objectRef.id = nv;
            });

            $scope.loadMore = function () {
                if ($scope.hasMore && !$scope.loading) {
                    $scope.loading = true;
                    DataikuAPI.git.getObjectLog($scope.projectKey || $stateParams.projectKey, $scope.objectType, $scope.objectId || $stateParams.webAppId, $scope.nextCommit, PAGE_SIZE).success(function(data){
                        $scope.logEntries = ($scope.logEntries || []).concat(data.logEntries);
                        $scope.nextCommit = data.nextCommit;
                        if (!$scope.nextCommit) {
                            $scope.hasMore = false;
                        }
                        $scope.loading = false;
                    }).error(setErrorInScope.bind($scope));
                }
            };
        }
    };
});

/**
 * This service provides common support for parts of DSS that support "full-repository push-pull" interaction, i.e
 *   - projects
 *   - plugins in development
 */ 
app.service("FullGitSupportService", function(DataikuAPI, $state, $stateParams, CreateModalFromTemplate,
                                                   Dialogs, FutureProgressModal, DKUtils, $filter, WT1) {

    var svc = {};

    svc.getFullStatus = function($scope, apiPromise, cb) {
        return apiPromise.then(function(resp) {
            $scope.gitStatus = resp.data;
            $scope.gitStatus.remoteOrigin = resp.data.remotes.find(r => r.name === 'origin');
            $scope.gitStatus.hasRemoteOrigin = !$.isEmptyObject($scope.gitStatus.remoteOrigin);
            $scope.gitStatus.hasTrackingCount = !$.isEmptyObject($scope.gitStatus.trackingCount);

            if (cb) { cb() }
        },
        setErrorInScope.bind($scope));
    };

    svc.getBranches = function($scope, apiPromise) {
        apiPromise.then(function(resp) {
            $scope.gitBranches = resp.data.sort();
            $scope.gitBranchesFiltered = $scope.gitBranches;
        }, setErrorInScope.bind($scope));
    };

    svc.fetch = function($scope, apiPromise) {
        apiPromise.then(function(resp) {
            FutureProgressModal.show($scope, resp.data, "Fetching Git changes").then(function(result){
                if (result) {
                    Dialogs.infoMessagesDisplayOnly($scope, "Fetch result", result.messages, result.futureLog, true).then(function() {
                        // We're dismissing the first modal when it has succeeded.
                        if (result.commandSucceeded) {
                            DKUtils.reloadState();
                        }
                    }, null);
                }
            });
        }, setErrorInScope.bind($scope));
    };

    svc.editRemote = function($scope, saveCallback) {
        let url = "";
        let action = "Add";
        if ($scope.gitStatus.remoteOrigin && $scope.gitStatus.remoteOrigin.url) {
            url = $scope.gitStatus.remoteOrigin.url;
            action = "Edit";
        }
        Dialogs.prompt($scope, action + " remote origin", "Remote URL", url, { placeholder: "git@github.com:user/repo.git"}).then(function(newURL) {
            if (!newURL || newURL === url) {
                return;
            }
            saveCallback("origin", newURL);
        });
    };

    svc.removeRemote = function($scope, saveCallback) {
        Dialogs.confirm($scope, "Remove remote origin",
            "Are you sure you want to unlink this local repository from the remote repository?").then(function() {
            saveCallback("origin");
        });
    };

    svc.pull = function($scope, apiPromise) {
        apiPromise.then(function(resp) {
            FutureProgressModal.show($scope, resp.data, "Pulling Git changes").then(function(result){
                if (result) {
                    Dialogs.infoMessagesDisplayOnly($scope, "Pull result", result.messages, result.futureLog, true).then(function() {
                        // We're dismissing the first modal & reloading the state when it has succeeded
                        if (result.commandSucceeded) {
                            DKUtils.reloadState();
                        }
                    }, null);
                }
            });
        }, setErrorInScope.bind($scope));
    };

    svc.push = function($scope, apiPromise) {
        apiPromise.then(function(resp) {
            FutureProgressModal.show($scope, resp.data, "Pushing Git changes").then(function(result){
                if (result) {
                    Dialogs.infoMessagesDisplayOnly($scope, "Push result", result.messages, result.futureLog, true).then(function() {
                        // We're dismissing the first modal when it has succeeded.
                        if (result.commandSucceeded) {
                            $scope.getGitFullStatus();
                        }
                    }, null);
                }
            });
        }, setErrorInScope.bind($scope));
    };

    svc.switchToBranch = function($scope, apiPromise) {
        apiPromise.then(function() {
            $state.reload();
        }, setErrorInScope.bind($scope));
    };

    svc.deleteBranches = function($scope, callback) {
        CreateModalFromTemplate("/templates/git/delete-branches-modal.html", $scope, null, function (newScope) {
            newScope.selectedGitBranches = [];
            newScope.deleteOptions = { remoteDelete: false, forceDelete : false };
            newScope.deleteBranches = function () {
                callback(newScope, newScope.selectedGitBranches, newScope.deleteOptions);
            };
        });
    };

    return svc;
})

})();
