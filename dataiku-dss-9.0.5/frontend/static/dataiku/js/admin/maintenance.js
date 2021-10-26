(function(){
'use strict';


var app = angular.module('dataiku.admin.maintenance', []);


app.constant("TAIL_STATUS", {
    DEBUG: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3
});


app.controller("AdminScheduledTasksController", function($scope, $rootScope, $state, DataikuAPI, ActivityIndicator, TopNav){
	TopNav.setLocation(TopNav.DSS_HOME, "administration");
	$scope.refresh = function() {
        DataikuAPI.admin.scheduledTasks.getStatus().success(function(data){
            $scope.status = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.fireTask = function(task){
        DataikuAPI.admin.scheduledTasks.fire(task.jobGroup, task.jobName).success(function(data){
            ActivityIndicator.success("Task fired");
            $scope.refresh();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.refresh();
});


app.controller("AdminMaintenanceInfoController", function($scope, DataikuAPI, TopNav) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");

    DataikuAPI.admin.getInstanceInfo().success(function(data){
        $scope.data = data;
    });
});


app.controller("AdminLogsController", function($scope, $state, $rootScope, $window, $timeout,
               Logs, Diagnostics, DataikuAPI, ActivityIndicator, TopNav, TAIL_STATUS) {
    TopNav.setLocation(TopNav.DSS_HOME, "administration");
    //save JS data to file
    var saveData = (function () {
        var a = document.createElement("a");
        a.style.display = "none";
        document.body.appendChild(a);
        return function (data, fileName) {
            var blob = new Blob([data], {type: "octet/stream"}),
                url = window.URL.createObjectURL(blob);
            a.href = url;
            a.download = fileName;
            a.click();

            //give Firefox time...
            setTimeout(function(){
                window.URL.revokeObjectURL(url);
            }, 1000);
        };
    }());

    $scope.uiState = {
        active:  'logs',
        dState: null
    };

    $scope.TAIL_STATUS = TAIL_STATUS;

    $scope.loadLogsList = function() {
        $scope.uiState.loadingLogsList = true;
        Logs.list().success(function(data) {
            $scope.uiState.loadingLogsList = false;
            $scope.logs = data;
        });
    };

    $scope.loadLog = function(log) {
        $scope.uiState.currentLog = log;
        $scope.uiState.loadingLog = log;
        Logs.cat(log.name).success(function(data) {
            $scope.uiState.loadingLog = null;
            $scope.logData = data;
            $scope.logDataHTML = smartLogTailToHTML(data.tail, false);
            $timeout(function(){
                var content = $('.log-container .scrollable')[0];
                content.scrollTop = content.scrollHeight;
            })
        });
    };

    $scope.reloadLog = function() {
        if ($scope.uiState.currentLog) {
            $scope.loadLog($scope.uiState.currentLog);
        }
    };

    $scope.downloadExtract = function() {
        var text = $scope.logData.tail.lines.join('\n');
        var filename = 'extractof_'+$scope.uiState.currentLog.name;
        saveData(text, filename);
    };

    $scope.downloadCurrentLogFile = function() {
        if ($scope.uiState.currentLog) {
            Logs.download($scope.uiState.currentLog.name);
        }
    };


    $scope.downloadBackendLog = function() {
        Logs.download("backend.log");
    };


    $scope.downloadAllLogFiles = function() {
        Logs.downloadAll();
    };
    $scope.loadLogsList();

});

app.controller("AdminDiagnosticsController", function($scope, $state, $rootScope, $window, $timeout,
               Logs, Diagnostics, DataikuAPI, ActivityIndicator, TopNav, TAIL_STATUS, FutureProgressModal) {

    $scope.now = new Date().getTime()

    $scope.options = {
        includeConfigDir: true,
        includeIOVM: true,
        includeBackendStacks: true,
        includeDockerImagesListing: true,
        includeFullLogs: false,
        includeFullDataDirListing: true
    };

    $scope.getLatestDiagnosis = function () {
        Diagnostics.getLatest(function(data) {
            if (data.exists) {
                $scope.latestDiagnosis = data;
            }
        });
    }

    $scope.downloadLatestDiagnosis = function () {
        Diagnostics.downLoadLatest();
    }

    $scope.runDiagnosis = function() {
        DataikuAPI.admin.diagnostics.run($scope.options).success(function(data) {
            FutureProgressModal.show($scope, data, "Running diagnosis...", null, 'static', false, true).then(function(result) {
                if (result) {
                    $scope.downloadLatestDiagnosis();
                }
                $scope.getLatestDiagnosis();
                    
            })
        }).error(setErrorInScope.bind($scope));
    }

    $scope.getLatestDiagnosis();
});

})();