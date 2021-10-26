(function() {
    'use strict';
    var app = angular.module('dataiku.webapps');

    app.controller("BokehWebAppController", function($scope, $controller, $rootScope, $q, DataikuAPI) {
        $controller("_BokehDashOrShinyLikeWebAppController", {$scope: $scope});
        $scope.defaultLeftTab = 'PYTHON';

        $scope.getViewURL = function(app) {
            const deferred = $q.defer();
            app = app || $scope.app;
               DataikuAPI.webapps.getBackendUrl(app.projectKey, app.id, app.apiKey).success(function(data) {
                   const suffix = data.location ? data.location + 'backend' : 'webapp-error-not-running.html';
                   if ($rootScope.appConfig.webappsIsolationMode === "ALTERNATIVE_ORIGIN") {
                       deferred.resolve($rootScope.appConfig.webappsIsolationOrigin + suffix);
                   } else {
                       deferred.resolve(suffix);
                   }
               }).error(setErrorInScope.bind($scope));
            return deferred.promise;
        };
    });
})();