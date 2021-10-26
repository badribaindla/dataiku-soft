(function() {
'use strict';

const app = angular.module('dataiku.directives.widgets');


app.directive('visualRecipe', function($rootScope, $timeout, $parse) {
    return {
        restrict: 'A',
        scope: true,
        link : function(scope, element, attrs) {
            var lastJobRunningState;
            scope.$watch("startedJob", function(){
                var jobRunningState = scope.isJobRunningOrStarting();
                if (!lastJobRunningState && jobRunningState) {
                    if (scope.uiState && scope.uiState.currentStep != 'output') {
                        scope.uiState.currentStep = 'output';
                    }
                }
                lastJobRunningState = jobRunningState;
            }, true);
        }
    };
});


app.factory("RecipeStatusHelper", function() {
    function dedup(list) {
        var ret = [];
        $.each(list, function(idx, el) {
            if (el && ret.indexOf(el) < 0) {
                ret.push(el);
            }
        })
        return ret;
    }

    var svc = {
        getStepMessages : function(stepName, recipeStatus) {
            if (!recipeStatus || !recipeStatus[stepName]) {
                return;
            }
            var status = recipeStatus[stepName];
            return status.messages;
        },
        getStepStatus : function(stepName, recipeStatus) {
            if (!recipeStatus || !recipeStatus[stepName]) {
                return;
            }
            return recipeStatus[stepName];
        },
        getStepErrors : function(stepName, recipeStatus) {
            return svc.getErrors(svc.getStepMessages(stepName, recipeStatus));
        },
        getStepWarnings : function(stepName, recipeStatus) {
            return svc.getWarnings(svc.getStepMessages(stepName, recipeStatus));
        },
        getStepConfirmations : function(stepName, recipeStatus) {
            return svc.getConfirmations(svc.getStepMessages(stepName, recipeStatus));
        },
        getStepStatusClass : function(stepName, recipeStatus) {
            return svc.getStatusClass(svc.getStepStatus(stepName, recipeStatus));
        },
        getErrors : function(statusMessages) {
            if (statusMessages) {
                return dedup(statusMessages.filter(function(x) { return x.severity == "ERROR"}));
            }
        },
        getWarnings : function(statusMessages) {
            if (statusMessages) {
                return dedup(statusMessages.filter(function(x) { return x.severity == "WARNING"}));
            }
        },
        getConfirmations : function(statusMessages) {
            if (statusMessages) {
                return dedup(statusMessages.filter(function(x) { return x.severity == "INFO"}));
            }
        },
        getStatusClass : function(status) {
            if (!status) {
                return "";
            }
            if (status.error) {
                return "invalid-step"
            }
            if (status.warning) {
                return "step-with-warnings"
            }
            return "valid-step"
        }
    };
    return svc;
});

/*
Pipline elements indincating the steps of a recipe step
- the parent scope must have a 'uiState.currentStep' variable
- the parent scope should have a recipeStatus variable and a updateRecipeStatusLater function
*/
app.directive('recipeStep', function($timeout, RecipeStatusHelper) {
    return {
        restrict: 'EA',
        templateUrl: "/templates/recipes/visual-recipes-fragments/visual-recipe-step.html",
        scope: true,
        link : function(scope, element, attrs) {
            scope.stepName = attrs.recipeStep;
            scope.stepLabel = attrs.stepLabel;

            scope.changeStep = function(stepName) {
                if (stepName && scope.$parent.uiState.currentStep != stepName) {
                    scope.$parent.uiState.currentStep = stepName;
                    if (scope.updateRecipeStatusLater) {
                        scope.updateRecipeStatusLater();
                    }
                    $timeout(function() {
                        scope.$parent.$broadcast('redrawFatTable');
                    });
                }
            };

            scope.getStepStatusClass = function(stepName) {
                return RecipeStatusHelper.getStepStatusClass(stepName, scope.recipeStatus);
            };

            scope.getStepErrors = function(stepName) {
                return RecipeStatusHelper.getStepErrors(stepName, scope.recipeStatus);
            };

            scope.getStepWarnings = function(stepName) {
                return RecipeStatusHelper.getStepWarnings(stepName, scope.recipeStatus);
            };

            scope.getStepConfirmations = function(stepName) {
                return RecipeStatusHelper.getStepConfirmations(stepName, scope.recipeStatus);
            };
        }
    };
});


/*
Widget for output columns computed with formulas (DSS or SQL)
*/
app.directive('computedColumnEditor', function($rootScope, $timeout, $parse, CodeMirrorSettingService) {
    return {
        restrict: 'EA',
        scope: true,
        link : function(scope, element, attrs) {
            //finish codemirror setup when the UI is ready
            $timeout(function(){
                $('.CodeMirror', element).each(function(idx, el) {
                    var cm = el.CodeMirror;
                    cm.on("blur", function(){
                        scope.blur();
                    });
                    cm.refresh();
                });
            });

            scope.blur = function() {
                $timeout(function() {
                    if ($('*', element).is(":focus")) {
                        return;
                    }
                    scope.hooks.updateRecipeStatus();
                });
            };

            var columns;
            if(attrs.columns) {
                //columns attribute shouls be a function!
                columns = $parse(attrs.columns);
            }

            scope.dssEditorOptions = {
                mode:'text/grel',
                theme:'elegant',
                indentUnit: 4,
                variables: columns,
                lineNumbers : false,
                lineWrapping : true,
                autofocus: true,
                onLoad: function(cm) {
                    cm.on("keyup", function(cm, evt) {
                        /* Ignore tab, esc, and navigation/arrow keys */
                        if (evt.keyCode == 9 || evt.keyCode == 27 || (evt.keyCode>= 33 && evt.keyCode <= 40)) {
                            return;
                        } else {
                            var options = {
                                columns: columns,
                                completeSingle: false
                            }
                            CodeMirror.commands.autocomplete(cm, null, options);
                        }
                    });
                }
            };

            scope.sqlEditorOptions = CodeMirrorSettingService.get('text/x-sql');
            scope.sqlEditorOptions.autofocus = true;
        }
    };
});


app.directive("visualRecipesErrorsPopover", function($window) {
    return {
        scope : true,
        link : function(scope, element, attrs) {
            var popover = $(element).find(".popover");
            popover.detach();
            var shown = false;
            var hide = function() {
                popover.hide();
                shown = false;
                element.removeClass('open');
                popover.detach();
            };
            var show = function() {
                shown = true;
                $("body").append(popover);
                popover.show();
                popover.css("top", $window.Math.min($(element).offset().top, $($window).height() - popover.height()));
                element.addClass('open');
            }

            scope.errors = null;
            scope.warnings = null;

            scope.onenter = function() {
                if (!($.isEmptyObject(scope.errors) && $.isEmptyObject(scope.warnings) && $.isEmptyObject(scope.confirmations))) {
                    show();
                }
            }
            scope.onleave = function() {
                hide();
            }


            var updateErrorsAndWarnings = function() {
                scope.errors = scope.getStepErrors(scope.stepName);
                scope.warnings = scope.getStepWarnings(scope.stepName);
                scope.confirmations = scope.getStepConfirmations(scope.stepName);
            }

            var lastStatus = null;
            scope.$watch("recipeStatus", function(recipeStatus){
                if (!recipeStatus || angular.equals(recipeStatus[scope.stepName], lastStatus)) return;
                lastStatus = recipeStatus;
                updateErrorsAndWarnings();
            }, true);

        }
    }
});

})();