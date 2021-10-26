(function() {
'use strict';

    const app = angular.module('dataiku.directives.scope', ['dataiku.filters', 'dataiku.services', 'ui.keypress']);

    /* Includes a template without creating a new scope.
     * This allows to share some small HTML fragments without any semantic side-effect
     * From SO 12393703
     */
    app.directive('includeNoScope', function($http, $templateCache, $compile, $rootScope) {
        return function(scope, element, attrs) {
            const templatePath = attrs.includeNoScope;
            const replace = attrs.replace;

            function handleResponse(response) {
                const contents = $('<div/>').html(response).contents();
                if (replace) {
                    element.replaceWith(contents);
                } else {
                    element.html(contents);
                }
                $compile(contents)(scope);
                $rootScope.$broadcast("reflow");
            }

            const cachedResponse = $templateCache.get(templatePath);
            if (angular.isDefined(cachedResponse)) {
                if (cachedResponse && typeof cachedResponse.then == 'function') {
                    cachedResponse.then((resp) => handleResponse(resp.data));
                } else if (angular.isArray(cachedResponse)) {
                    handleResponse(cachedResponse[1]);
                } else {
                    handleResponse(cachedResponse);
                }
            } else {
                $http.get(templatePath, {cache: $templateCache}).then((resp) => handleResponse(resp.data));
            }
        };
    });

    /** Applies something when any input below is blurred */
    app.directive('onAnyBlur', function() {
        return {
            link: function(scope, elem, attrs) {
                var action = function() {
                    // Using the setTimeout trick
                    // to make sure to defer the action to the end
                    // of the call queue,
                    // and let the other bound function be executed.
                    //
                    // Especially, we need angular to do its magic and
                    // update its model.
                    window.setTimeout(function() {
                        scope.$apply(attrs.onAnyBlur);


                        // Fix #1222
                        // I have NO idea why 150 works and 10 doesn't
                    }, 150);
                };
                scope.$evalAsync(function() {
                    $(elem).on('blur', 'input[type="text"].submit-on-blur, input[type="date"].submit-on-blur, input[type="time"].submit-on-blur, input[type="datetime-local"].submit-on-blur, textarea.submit-on-blur', action);
                    $(elem).on('change', 'ul.suggest-items, div.submit-on-blur, select.submit-on-blur, input[type="radio"].submit-on-blur, input[type="checkbox"].submit-on-blur, input[type="number"].submit-on-blur', action);
                });
            }
        };
    });


    app.directive('onAnyBlurWatch', function($timeout) {
        return {
            link: function(scope, elem, attrs) {
                var action = function() {
                    window.setTimeout(function() {
                        scope.$apply(attrs.onAnyBlurWatch);
                    }, 150);
                };
                scope.$watch(attrs.watch, function() {
                    $(elem).on('blur', 'input[type="text"], input[type="datetime-local"], textarea', action);
                    $(elem).on('change', 'ul.suggest-items, select, input[type="checkbox"], input[type="number"]', action);
                });
            }
        };
    });

    app.directive("blurModel", function($parse) {
        return {
            restrict : 'A',
            link : function($scope, elt, attrs) {
                function set() {
                    modelSet($scope, elt[0].value);
                    $scope.$apply();
                }
                var modelGet = $parse(attrs.blurModel), modelSet = modelGet.assign;
                $scope.$watch(attrs.blurModel, function(nv, ov) {
                    var modelValue = modelGet($scope);
                    if (modelValue == null) {
                        elt[0].value = "";
                    } else if (modelValue !== elt[0].value) {
                        elt[0].value = modelValue;
                    }
                });

                elt.on("blur", function() {
                    set();
                });
                elt.on("keydown", function(e) {
                    if (e.keyCode == 13) {
                        set();
                    }
                });
            }
        };
    });

    app.directive('onSmartChange', function($timeout) {
        return {
            link: function(scope, element, attrs){
                var stop;
                var go = function() {
                    if (stop){
                        $timeout.cancel(stop);
                    }
                    stop = $timeout(function(){
                        scope.$apply(attrs.onSmartChange);
                    }, attrs.hasOwnProperty("delay") ? parseInt(attrs.delay, 10) : 1000);
                };

                scope.$evalAsync(function() {
                    $(element).on('keyup', 'input:not(.exclude-from-smart-change), textarea:not(.exclude-from-smart-change), select:not(.exclude-from-smart-change)', function(e) {
                        var keyCode = e.keyCode;

                        /* Ignore tab, esc, and navigation/arrow keys */
                        if (keyCode == 9 || keyCode == 27 || (keyCode>= 33 && keyCode <= 40)) {
                            return;
                        } else {
                            go();
                        }
                    });
                    $(element).on('change', 'input:not(.exclude-from-smart-change), textarea:not(.exclude-from-smart-change), select:not(.exclude-from-smart-change)', go);
                });
            }
        };
    });

    app.directive('onAnyChange', function($timeout) {
        return {
            link: function(scope, element, attrs){
                var go = function() {
                    scope.$apply(attrs.onAnyChange);
                };

                $(element).on('keyup', 'input, textarea, select', function(e) {
                    var keyCode = e.keyCode;

                    /* Ignore tab, esc, and navigation/arrow keys */
                    if (keyCode == 9 || keyCode == 27 || (keyCode>= 33 && keyCode <= 40)) {
                        return;
                    } else {
                        go();
                    }
                });
                $(element).on('change', 'input, textarea, select', go);
            }
        };
    });

    app.directive("publishInParent", function() {
        return  {
            retrict : 'ECA',
            link: function(scope, element, attrs) {
                var name = attrs.publishInParent;
                scope.$parent[name] = scope[name];
            }
        };
    });
    app.directive("publishInGrandParent", function() {
        return  {
            retrict : 'ECA',
            link: function(scope, element, attrs) {
                var name = attrs.publishInGrandParent;
                scope.$parent.$parent[name] = scope[name];
            }
        };
    });
    /* Stop laughing */
    app.directive("publishInGrandGrandParent", function() {
        return  {
            retrict : 'ECA',
            link: function(scope, element, attrs) {
                var name = attrs.publishInGrandGrandParent;
                scope.$parent.$parent.$parent[name] = scope[name];
            }
        };
    });

    app.directive('dkuIf', function() {
        return {
            transclude:'element',
            priority:1000,
            terminal:true,
            compile:function (element, attr, linker) {
                return function (scope, iterStartElement, attr) {
                    iterStartElement[0].doNotMove = true;
                    var expression = attr.dkuIf;
                    var lastElement;
                    var lastScope;
                    scope.$watch(expression, function (newValue) {
                        if (lastElement) {
                            lastElement.remove();
                            lastElement = null;
                        }
                        if (lastScope) {
                            lastScope.$destroy();
                            lastScope = null;
                        }
                        if (newValue) {
                            lastScope = scope.$new();
                            linker(lastScope, function (clone) {
                                lastElement = clone;
                                iterStartElement.after(clone);
                            });
                        }
                        // Note: need to be parent() as jquery cannot trigger events on comments
                        // (angular creates a comment node when using transclusion, as ng-repeat does).
                        iterStartElement.parent().trigger("$childrenChanged");
                    });
                };
            }
        };
    });

    app.directive('ngModelOnchange', function() {
        return {
            restrict: 'A',
            priority: -10,
            require: 'ngModel',
            link: function(scope, elm, attr, ngModelCtrl) {
                if (attr.type === 'radio' || attr.type === 'checkbox') return;

                elm.unbind('input').unbind('keydown').unbind('change');
                elm.bind('change', function() {
                    scope.$apply(function() {
                        ngModelCtrl.$setViewValue(elm.val());
                    });
                });
            }
        };
    });

    app.directive('ngModelOnblur', function() {
        return {
            priority: 1,
            restrict: 'A',
            require: 'ngModel',
            link: function(scope, elm, attr, ngModelCtrl) {
                if (attr.type === 'radio' || attr.type === 'checkbox') return;

                elm.off('input keydown change');
                elm.on('blur', function() {
                    scope.$apply(function() {
                        ngModelCtrl.$setViewValue(elm.val());
                    });
                });
            }
        };
    });


    app.directive('addRemove', function(){
        return {
            require: 'ngModel',
            restrict: 'A',
            scope: true,
            link: function(scope, element, attrs, ngModel){
                scope.concat = function(array){
                    if (! ngModel.$viewValue){
                        ngModel.$viewValue = [];
                    }
                    ngModel.$viewValue = ngModel.$viewValue.concat(array);
                    ngModel.$setViewValue(ngModel.$viewValue);
                };
                scope.add = function(value){
                    if (! ngModel.$viewValue){
                        ngModel.$viewValue = [];
                    }
                    ngModel.$viewValue.push(angular.copy(value));
                    ngModel.$setViewValue(ngModel.$viewValue);
                };
                scope.remove = function(index){
                    ngModel.$viewValue.splice(index, 1);
                    ngModel.$setViewValue(ngModel.$viewValue);
                };
            }
        };
    });
})();
