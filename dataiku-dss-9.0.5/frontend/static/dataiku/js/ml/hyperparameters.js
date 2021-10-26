(function(){
    "use strict";
    var app = angular.module('dataiku.ml.hyperparameters', ['platypus.utils']);

    /**
     * Controls for numeric grid search (range and explicit)
     * @param {string} label - The control label
     * @param {string} strategy - the current global strategy used. Can be any of 'GRID', 'BAYESIAN', RANDOM';
     * @param {string} helpInline - optional inline help
     * @param {boolean} required - optional add css class "required" to the directive
     * @param {boolean} decimal - optional to allow decimal values
     * @param {decimal} min - optional min value to check
     * @param {decimal} max - optional max value to check
    */
    app.directive('mlHpNumerical', function($compile, $timeout, $rootScope, $q){
        return {
            restrict: 'E',
            scope: {
                model: '=ngModel',
                placeholder: '@',
            },
            templateUrl: 'templates/ml/ml-hp-numerical.html',
            link: function(scope, element, attrs){

                function getValueOrUndefined(val) {
                    return angular.isUndefined(val) ? undefined : val;
                }

                scope.strategy = attrs.strategy;
                scope.helpInline = attrs.helpInline;
                scope.label = attrs.label;
                scope.required = !!getValueOrUndefined(attrs.required);
                scope.decimal = attrs.hasOwnProperty('decimal');
                scope.min = getValueOrUndefined(scope.model.limit.min);
                scope.max = getValueOrUndefined(scope.model.limit.max);

                scope.getCurrentMode = function() {
                    if (attrs.strategy == 'GRID') {
                        return scope.model.gridMode;
                    } else {
                        return scope.model.randomMode; // all other modes (random, bayesian, ...)
                    }
                };

                scope.isInvalidMinMax = function() {
                    if (angular.isUndefined(scope.model.range)) {
                        return false;
                    }

                    const min = scope.model.range.min;
                    const max = scope.model.range.max;

                    if (angular.isUndefined(min) || angular.isUndefined(max)) {
                        return false;
                    }

                    return min >= max;
                };

                scope.isInvalidValuesCount = function() {
                    const { min, max, nbValues } = scope.model.range;
                    const isNbValuesDecimal = nbValues % 1 !== 0;

                    if (nbValues < 2 || isNbValuesDecimal) {
                        return true;
                    }

                    return scope.decimal ? false : nbValues > max - min + 1;
                };

                scope.changeMode = function(targetMode) {
                    function switchMode(mode) {
                        if (mode == 'EXPLICIT') {
                            return 'RANGE';
                        } else {
                            return 'EXPLICIT';
                        }
                    }

                    if (scope.getCurrentMode() != targetMode) {
                        return;
                    }

                    if (attrs.strategy == 'GRID') {
                        scope.model.gridMode = switchMode(scope.model.gridMode);
                    } else {
                        scope.model.randomMode = switchMode(scope.model.randomMode); // all other strategies (random, bayesian, ...)
                    }
                };
            }
        };
    });

    /**
     * Built on top of Suggestions directive to display numeric suggestions (for grid search).
     * @param {array} tags - The list of selected suggestions displayed as tags in the input.
     * @param {string} placeholder - Optional placeholder of the input.
    */
    app.directive('gsField', function($compile, $timeout, $rootScope, $q){
        return {
            restrict:'A',
            scope: {
                tags: '=ngModel',
                placeholder: '@',
            },
            templateUrl: 'templates/ml/gs-field.html',
            link: function(scope, element, attrs){

                var allowedMultiples = [2,5,10,100];
                var allowedAdditives = [1,2,5,10,20,30,50,100];

                scope.getClassName = function() {
                    var className = 'gsField';

                    if (attrs.notGrid !== undefined) {
                        className += ' gsField--not-grid';
                    }
                    return className;
                };

                function filterSuggestedGS(ls) {
                    return ls.filter(function(o){
                        return scope.tags.indexOf(o) === -1 && o > 0;
                    });
                }

                var getSuggestedGS = function() {
                    if (scope.tags.length > 0) {
                        var a = Math.min(scope.tags[scope.tags.length-1],scope.tags[scope.tags.length-2] || 1),
                            b = Math.max(scope.tags[scope.tags.length-1],scope.tags[scope.tags.length-2] || 1),
                            rev = scope.tags[scope.tags.length-1] < (scope.tags[scope.tags.length-2] || 1),
                            m;
                        if (a<0 || b<0) {
                            return filterSuggestedGS([scope.placeholder || 1])
                        }

                        for (m=0;m<allowedMultiples.length;m++) {
                            var muldif = Math.log(b/a) / Math.log(allowedMultiples[m]);
                            muldif = Math.round(muldif * 1000) / 1000;
                            if (isInteger(muldif)) {
                                if (!rev) {
                                    return filterSuggestedGS([b*allowedMultiples[m], a/allowedMultiples[m]])
                                }
                                else {
                                    return filterSuggestedGS([a/allowedMultiples[m], b*allowedMultiples[m]])
                                }
                            }
                        }

                        for (m=allowedAdditives.length;m>=0;m--) {
                            if ((b-a) % allowedAdditives[m] === 0 && a % allowedAdditives[m] === 0) {
                                if (!rev) {
                                    return filterSuggestedGS([b+allowedAdditives[m], a-allowedAdditives[m]])
                                }
                                else {
                                    return filterSuggestedGS([a-allowedAdditives[m], b+allowedAdditives[m]])
                                }
                            }
                        }

                        return filterSuggestedGS([scope.placeholder || 1])
                    } else {
                        return filterSuggestedGS([scope.placeholder || 1])
                    }
                }

                scope.suggestGS = function(q) {
                    if (attrs.notGrid !== undefined) {
                        return;
                    }

                    var deferred = $q.defer();
                    deferred.resolve(getSuggestedGS());
                    return deferred.promise;
                };

                scope.tagIndex = undefined;
                var input = element.find('.suggestions input');
                scope.hasFocus = function(){
                    return input.is(":focus") || element.find(".fake").is(":focus");
                };
                scope.newTag = '';

                scope.addSuggestion = function(value, e){
                    scope.newTag = value;
                    e.stopPropagation();
                    if (scope.addTag()) {
                        e.preventDefault();
                    }
                };

                scope.selectTag = function(e, idx){
                    e.stopPropagation();
                    scope.tagIndex = idx;
                };

                scope.deleteTag = function(e, idx){
                    if (e){ e.originalEvent.stopPropagation() }

                    var index = idx;
                    if (index === null || index === undefined) {
                        index = scope.tagIndex;
                    }

                    if(! angular.isUndefined(index)){
                        scope.tags.splice(index, 1);
                        $timeout(function(){ scope.$broadcast('showSuggestions') });
                        if(scope.tags.length) {
                            // set tagIndex to former tag
                            scope.tagIndex = Math.max(index - 1, 0);
                        } else {
                            // otherwise set focus to input, but only if this was from a backspace deletion
                            if (!e) { input.focus() }
                        }
                    }
                };

                function isInRange(val) {
                    let inRange = true;
                    if (!angular.isUndefined(attrs.min)) {
                        inRange = inRange && val >= attrs.min;
                    }
                    if (!angular.isUndefined(attrs.max)) {
                        inRange = inRange && val <= attrs.max;
                    }

                    return inRange;
                }

                scope.addTag = function(){
                    var added = false;
                    if(scope.newTag && !isNaN(scope.newTag)){
                        scope.newTag = parseFloat(scope.newTag);

                        const inRange = isInRange(scope.newTag);
                        if (inRange && (attrs.allowDubs || scope.tags.indexOf(scope.newTag) === -1)){
                            // add tag
                            scope.tags.push(scope.newTag);
                            added = true;
                        }
                        // empty field
                        scope.newTag = '';

                        if(! scope.$root.$$phase) scope.$apply();
                        $timeout(function(){ scope.$broadcast('showSuggestions') });
                    }
                    return added;
                };

                scope.$watch('tagIndex', function(){
                    if (!angular.isUndefined(scope.tagIndex)){
                        input.blur();
                        element.find(".fake").focus();
                    }
                });

                input.on('focus', function(){
                    scope.tagIndex = undefined;
                });

                scope.setFocus = function(e){
                    input.focus();
                    e.stopPropagation();
                };

                scope.$on("$destroy", function(){
                    $(element).off("keydown.tags");
                });
                scope.inputBlur = function(e) {
                    if (e) {
                        e.stopPropagation();
                        if (scope.addTag()) {
                            e.preventDefault();
                        }
                    }
                }
                $(element).on('keydown.tags', function(e){
                    if(scope.hasFocus()){
                        if (e.keyCode == 37){ // left arrow
                            if(!angular.isUndefined(scope.tagIndex)){
                                scope.tagIndex = Math.max(scope.tagIndex - 1, 0);
                                scope.$apply();
                            } else {
                                if(scope.newTag.length === 0){
                                    scope.tagIndex = scope.tags.length - 1;
                                    scope.$apply();
                                }
                            }
                        } else if (e.keyCode == 39){ // right arrow
                            if(!angular.isUndefined(scope.tagIndex)){
                                scope.tagIndex = scope.tagIndex + 1;
                                if(scope.tagIndex >= scope.tags.length){
                                    scope.tagIndex = undefined;
                                    input.focus();
                                }
                                scope.$apply();
                            }
                        } else if (e.keyCode == 8){ // delete
                            if(angular.isUndefined(scope.tagIndex)){
                                if(scope.newTag.length === 0){
                                    scope.tagIndex = scope.tags.length - 1;
                                    scope.$apply();
                                }
                            } else {
                                e.preventDefault();
                                scope.deleteTag();
                                scope.$apply();
                            }
                        } else if (e.keyCode == 13 || e.keyCode == 32){ // enter & space : If we added a tag, don't let the "enter" key trigger a form submit
                            e.stopPropagation();
                            e.preventDefault();
                            if (!scope.newTag) {
                                scope.newTag = getSuggestedGS()[0];
                            }
                           scope.addTag();
                        }
                    }
                });

                scope.tags = scope.tags || [];

                scope.$watch('tags', function(nv, ov) {
                    // Sometimes someone rebinds the ngModel to null, in our case the API...
                    if (nv === null || nv === undefined) {
                        scope.tags = [];
                    }
                });
            }
        };
    });
})();