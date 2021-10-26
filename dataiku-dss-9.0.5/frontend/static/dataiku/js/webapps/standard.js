(function() {
'use strict';

const app = angular.module('dataiku.webapps');


    app.controller("StandardWebAppController", function($scope, $controller, $sce, Assert, ActivityIndicator, $q, DataikuAPI, $rootScope) {
        $controller("_PreviewWebAppController", {$scope:$scope});

        $scope.defaultLeftTab = 'JS';

        $scope.backendEnabled = function () {
            return $scope.app && $scope.app.params.backendEnabled;
        };

        $scope.showFrontendTabs = function(webapp) {
            return true;
        };

        $scope.getViewURL = function(app) {
            const deferred = $q.defer();
            app = app || $scope.app;
            const suffix = "/dip/api/webapps/view?" + $.param({
                projectKey: app.projectKey,
                webAppId: app.id,
                apiKey: app.apiKey
            });
            let url;
            if ($rootScope.appConfig.webappsIsolationMode == "ALTERNATIVE_ORIGIN") {
                url = $rootScope.appConfig.webappsIsolationOrigin + suffix;
            } else {
                url = suffix;
            }
            deferred.resolve($sce.trustAsResourceUrl(url));
            return deferred.promise;
        };

        // JS libraries:
        // Params use a list of string
        // UI uses map string -> bool
        function prepareLibrariesForUI() {
            if (!$scope.app) return;
            $scope.libraries = {};
            if($scope.app.params.libraries) {
                for (var i = 0; i < $scope.app.params.libraries.length; i++) {
                    var library = $scope.app.params.libraries[i];
                    $scope.libraries[library] = true;
                }
            }
        }

        function fixupLibraries() {
            if ($scope.libraries && $scope.app) {
                $scope.app.params.libraries = [];
                for (var k in $scope.libraries) {
                    if ($scope.libraries[k]) {
                        $scope.app.params.libraries.push(k);
                    }
                }
            }
        }
        $scope.$watch("libraries", fixupLibraries, true);

        prepareLibrariesForUI();
    });
})();