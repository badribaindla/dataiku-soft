(function(){
'use strict';


var app = angular.module('dataiku.report');


app.controller("ReportEditController", function($scope, WT1, TopNav, DataikuAPI, TAIL_STATUS, FutureProgressModal) {
    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'report', null, 'edit');

    $scope.state = $scope.state || {};
    $scope.state.activeTab = 'OUTPUT';
    
    DataikuAPI.security.listUsers().success(function(data) {
        $scope.allUsers = data;
    }).error(setErrorInScope.bind($scope));

    $scope.hooks.saveAndBuild = function(commitMessage) {
        if ($scope.isDirty()) {
            $scope.hooks.save(commitMessage, true);
        } else {
            $scope.hooks.build();
        }
    };

    $scope.hooks.save = function(commitMessage, forceBuild) {
        WT1.event("report-save", {reportId : $scope.report.id});

        return DataikuAPI.reports.save($scope.report, $scope.hooks.script, commitMessage).then(function(result) {
            $scope.hooks.origReport = angular.copy($scope.report);
            $scope.hooks.origScript = angular.copy($scope.hooks.script);
            if ($scope.report.params.buildOnSave || forceBuild) {
                $scope.hooks.build();
            }
        }, setErrorInScope.bind($scope));
    };

    $scope.hooks.build = function() {
        WT1.event("report-build", {reportId : $scope.report.id});

        return DataikuAPI.reports.build($scope.report.projectKey, $scope.report.id).success(function(data) {
            FutureProgressModal.show($scope, data, "Still building report...").then(function(result) {
                $scope.logTail = result.futureLog;
                $scope.state.activeTab = 'OUTPUT';
                updatePreview();
            });
        }).error(function(result, status, headers){
            setErrorInScope.bind($scope)(result, status, headers);
            $scope.logTail = result.logTail || result.futureLog.logTail;

            $scope.errorsInLogs = $scope.logTail && $scope.logTail.maxLevel == TAIL_STATUS.ERROR;

            if ($scope.errorsInLogs) {
                $scope.state.activeTab = 'LOG';
            } else {
                $scope.state.activeTab = 'OUTPUT';
            }

            updatePreview();
        });
    };

    $scope.insertCodeSnippet = function(snippet) {
        var cm = $('.web-app-editor > .left-pane > div > div:not(.code-snippet-editor-wrapper) > .CodeMirror').get(0).CodeMirror;
        cm.replaceSelection(snippet.code);
        var endPos = cm.getCursor(false);
        cm.setCursor(endPos);
        cm.focus();
    };

    function updatePreview() {
        var iframe = $('#report-container');
        iframe.attr('src', $scope.getViewURL());
    }

    $scope.uiState = { codeSamplesSelectorVisible: false };
    
    var initDeregister = $scope.$watch("report", function(nv) {
        if ($scope.report == null) return;
        $scope.report.params.envSelection = $scope.report.params.envSelection || {envMode:'INHERIT'};
        initDeregister();
    });

});


})();