(function(){
    'use strict';

    const app = angular.module('dataiku.ml.explainability', []);

    app.constant('epochShift', 2208988800); // 1900-01-01 (py models) to 1970-01-01 (mllib models)

    /**
     * This directive is used to display the template of the computation params form.
     */
    app.directive("computationParamsForm", function() {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: "/templates/ml/prediction-model/computation-params-form.html",
            scope: true,
            link: function(scope) {
                scope.uiState.computationParams = {};
                angular.copy(scope.computationParams, scope.uiState.computationParams);

                scope.save = function() {
                    angular.copy(scope.uiState.computationParams, scope.computationParams);
                    scope.dismissPopin();
                }
            }
        }
    });

    app.directive("explanationParamsForm", function() {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: "/templates/ml/prediction-model/explanation-params-form.html",
            scope: true,
            link: function(scope) {
                scope.uiState.explanationParams = {};
                angular.copy(scope.explanationParams, scope.uiState.explanationParams);

                scope.save = function() {
                    angular.copy(scope.uiState.explanationParams, scope.explanationParams);
                    if (scope.onExplanationParamsChange) {
                        scope.onExplanationParamsChange();
                    }
                    scope.dismissPopin();
                }
            }
        }
    });

    /**
     * This directive will add function `toggleComputationParamsPopin` in the scope.
     * It needs `computationParams` set in the parent scope.
     * As `dkuPopinOptions` needs a template as a string,
     * to be clearer the directive `computationParamsForm` is created to hold the template
     */
    app.directive("withComputationParamsPopin", function(openDkuPopin) {
        return {
            scope: true,
            restrict: 'A',
            link: function(scope, _, attrs) {
                scope.hideNbJobs = attrs.hideNbJobs;
                scope.popinOpen = false;
                scope.sampleSizeLabel = attrs.sampleSizeLabel ? attrs.sampleSizeLabel : "Sample size";
                scope.sampleSizeHelp = attrs.sampleSizeHelp ? attrs.sampleSizeHelp : "Number of records of the dataset to use for the computation";
                
                scope.toggleComputationParamsPopin = function($event) {
                    if (scope.popinOpen === false) {
                        function isElsewhere(elt, e) {
                            return $(e.target).parents(".dropdown-menu").length == 0;
                        }
                        const dkuPopinOptions = {
                            template: '<computation-params-form></computation-params-form>',
                            isElsewhere,
                            popinPosition: 'SMART',
                            onDismiss: () => {
                                scope.popinOpen = false;
                            }
                        };
                        scope.dismissPopin = openDkuPopin(scope, $event, dkuPopinOptions);
                        scope.popinOpen = true;
                    } else if (scope.dismissPopin) {
                        scope.dismissPopin();
                    }
                };
            }
        }
    });
})();
