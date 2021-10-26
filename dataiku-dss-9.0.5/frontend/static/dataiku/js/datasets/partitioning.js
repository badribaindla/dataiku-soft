(function() {
'use strict';

var app = angular.module('dataiku.datasets.partitioning', []);

app.controller("GeneralEditPartitioningCtrl", function($scope, DataikuAPI) {
    $scope.isPartitioned = function () {
        return $scope.dataset.partitioning != null && $scope.dataset.partitioning.dimensions.length > 0;
    };

    $scope.hasTimeDimension = function () {
        if(! $scope.isPartitioned()){
            return false;
        }
        return $.grep($scope.dataset.partitioning.dimensions, function(item){return item.type == 'time'}).length > 0;
    };

    $scope.activatePartititioning = $scope.dataset.partitioning.dimensions.length > 0;

    $scope.testPartitioning = {};
    $scope.runTestPartitioning = function(){
        DataikuAPI.datasets.testGeneralPartitioning($scope.dataset).success(function(data){
            $scope.testPartitioning = data;
        })
    }
});

app.directive('panePartitioning', function() {
    return {
        restrict: 'A',
        replace: true,
        templateUrl: '/templates/datasets/pane-partitioning.html',
        scope: {
            dataset : '=',
            detectScheme : '=',
            testScheme : '='
        },
        link: function($scope, element, attrs){
            $scope.isPartitioned = function () {
                return $scope.dataset.partitioning != null && $scope.dataset.partitioning.dimensions.length > 0;
            };

            $scope.hasTimeDimension = function () {
                if(! $scope.isPartitioned()){
                    return false;
                }
                return $.grep($scope.dataset.partitioning.dimensions, function(item){return item.type == 'time'}).length > 0;
            };

            $scope.uiState = {
                partitioningActivated: $scope.dataset.partitioning && $scope.dataset.partitioning.dimensions.length > 0
            }


            $scope.$watch('uiState.partitioningActivated', function(nv, ov){
                if(nv !== ov && nv){
                    // run detection
                    $scope.detectScheme().success(function(data){
                        $scope.detectedScheme = data.detectedScheme;
                    }).error(setErrorInScope.bind($scope));
                }
            })

            $scope.detectedScheme = {};

            $scope.$patterns = [];

            $scope.$watch('dataset.partitioning.dimensions', function(nv, ov){
                $scope.$patterns = [];
                angular.forEach(nv, function(dimension){
                   var pattern;
                   dimension.$patterns = [];
                    if(dimension.type == 'value') {
                        pattern = {name: dimension.name + " (%{" + dimension.name + "})", pattern: '%{' + dimension.name + '}'};
                        $scope.$patterns.push(pattern);
                        dimension.$patterns.push(pattern);
                    } else {
                        pattern = {name: 'YEAR (%Y)',pattern: '%Y'};
                        $scope.$patterns.push(pattern);
                        dimension.$patterns.push(pattern);
                        if(dimension.params.period == 'MONTH'){
                            pattern = {name: 'MONTH (%M)', pattern: '%M'};
                            dimension.$patterns.push(pattern);
                            $scope.$patterns.push(pattern);
                        } else if(dimension.params.period == 'DAY'){
                            pattern = {name: 'MONTH (%M)', pattern: '%M'};
                            $scope.$patterns.push(pattern);
                            dimension.$patterns.push(pattern);
                            pattern = {name: 'DAY (%D)', pattern: '%D'};
                            $scope.$patterns.push(pattern);
                            dimension.$patterns.push(pattern);
                        } else if(dimension.params.period == 'HOUR') {
                            pattern = {name: 'MONTH (%M)', pattern: '%M'};
                            dimension.$patterns.push(pattern);
                            $scope.$patterns.push(pattern);
                            pattern = {name: 'DAY (%D)', pattern: '%D'};
                            $scope.$patterns.push(pattern);
                            dimension.$patterns.push(pattern);
                            pattern = {name: 'HOUR (%H)', pattern: '%H'};
                            $scope.$patterns.push(pattern);
                            dimension.$patterns.push(pattern);
                        }
                    }
                })

                // if we delete the last dimension and there is no detection yet, trigger one
                // do not run this test on initialization
                var noFilePathPattern = !$scope.detectedScheme || !$scope.detectedScheme.filePathPattern;
                if((nv == null || nv.length == 0) && nv !== ov && noFilePathPattern){
                    // run detection
                    $scope.detectScheme().success(function(data){
                        $scope.detectedScheme = data.detectedScheme;
                    }).error(setErrorInScope.bind($scope));
                }
                $scope.usedPatterns();
            },true)

            $scope.usedPatterns = function(){
                angular.forEach($scope.$patterns, function(pattern){
                    pattern.used = $scope.dataset.partitioning.filePathPattern && $scope.dataset.partitioning.filePathPattern.indexOf(pattern.pattern) >= 0;
                })
            };

            $scope.hasPatternsToInsert = function (dimension) {
                var hasPatternToInsert=false;
                angular.forEach(dimension.$patterns, function(pattern) {
                   if (!pattern.used) {
                      hasPatternToInsert = true;
                   }
                });
                return hasPatternToInsert;
            }

            $scope.insertPattern = function (pattern) {
              var filePathPattern = $scope.dataset.partitioning.filePathPattern;
               if (filePathPattern) {
                    if (filePathPattern.indexOf("/.*", filePathPattern.length -3) != -1) {
                        $scope.dataset.partitioning.filePathPattern = filePathPattern.substring(0, filePathPattern.length-3) + "/" + pattern.pattern + "/.*";
                    } else {
                        $scope.dataset.partitioning.filePathPattern = $scope.dataset.partitioning.filePathPattern + pattern.pattern;
                    }
               } else {
                    $scope.dataset.partitioning.filePathPattern = pattern.pattern + "/.*";
               }
            }

            $scope.$watch('$patterns', function(nv, ov){
                // remove patterns not used anymore
                angular.forEach(ov, function(pattern){
                    if($.grep(nv, function(p){return p.pattern == pattern.pattern}).length == 0){
                        $scope.dataset.partitioning.filePathPattern = $scope.dataset.partitioning.filePathPattern ? $scope.dataset.partitioning.filePathPattern.replace(pattern.pattern, '') : '';
                    }
                })
            })

            // update patterns usage when filePathPattern is changed
            $scope.$watch('dataset.partitioning.filePathPattern', function(nv, ov){
                $scope.usedPatterns();
            })

            $scope.testPartitioning = {};
            $scope.runTestPartitioning = function(){
                $scope.testScheme().success(function(data){
                    $scope.testPartitioning = data;
                }).error(setErrorInScope.bind($scope));
            }
        }
    };
});

})();
