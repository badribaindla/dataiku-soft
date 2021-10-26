(function(){
    'use strict';

    /* Misc additional directives for Shaker */

    var app = angular.module('dataiku.shaker.misc', ['dataiku.filters', 'platypus.utils']);

    app.directive('dkuListTypeaheadV2', function($parse){
        return {
            templateUrl: '/templates/widgets/dku-list-typeahead-v2.html',
            scope: {
                model: '=ngModel',
                onChange: '&',
                addLabel: '@',
                validate: '=?',
                keepInvalid: '=?',
                typeAhead: '='
            },
            link: function(scope, el, attrs) {
                scope.richModel = {}

                scope.$watch("model", function(nv){
                    if (!nv) return;
                    scope.richModel = scope.model.map(function(x){
                        return { value  : x }
                    });
                }, true);

                if (scope.onChange) {
                    scope.callback = function(){
                        // Update in place instead of replacing, important because
                        // we don't want this to trigger another watch cycle in the
                        // listForm, which watches items non-deeply
                        scope.model.length = 0;
                        scope.richModel.forEach(function(x){
                            scope.model.push(x.value);
                        });
                        scope.onChange.bind(scope)({model : scope.model});
                    }
                }
                if (scope.typeAhead) {
                    scope.$watch("model", function() {
                        scope.remainingSuggests = listDifference(scope.typeAhead, scope.model);
                    }, true);
                }
            }
        };
    });
    
    app.directive('meaningSelect', function(ContextualMenu) {
    	return {
    		restrict: 'A',
    		template: '<div class="select-button">'
    					+'<button ng-click="openMeaningMenu($event)" class="btn  dku-select-button btn--secondary">'
                            +'<span class="filter-option pull-left">{{ngModel|meaningLabel}}</span>'
							+'&nbsp;'
							+'<span class="caret"></span>'
    					+'</button>'
    				 +'</div>',
            scope: {
                ngModel: '=',
                appConfig: '='
            },
            link: function($scope, element, attrs) {
    			$scope.menuState = {};
                $scope.meaningMenu = new ContextualMenu({
                    template: "/templates/shaker/select-meaning-contextual-menu.html",
                    cssClass : "column-header-meanings-menu",
                    scope: $scope,
                    contextual: false,
                    onOpen: function() {
                        $scope.menuState.meaning = true;
                    },
                    onClose: function() {
                        $scope.menuState.meaning = false;
                    }
                });
                $scope.openMeaningMenu = function($event) {
                    $scope.meaningMenu.openAtXY($event.pageX, $event.pageY);
                };

	            $scope.setMeaning = function(meaningId) {
                    $scope.ngModel = meaningId;
                    $(element).trigger('change');
	            };
    		}
    	}
    });

    app.directive('nextOnEnter', function() {
        return {
            score: true,
            priority: 90,
            restrict: 'A',
            link: function(scope, el, attrs) {
                var form = el[0].form;
                $(el).keyup(function (e) {
                    if (e.keyCode === 13) {
                        // on enter, we behave like for tab.
                        // and focus the next element of the form.
                        var tabbables = $(form).find(":tabbable");
                        var elId = tabbables.index(el);
                        if ( (elId >= 0) && (elId < tabbables.length -1) ) {
                            tabbables[elId+1].focus();
                        }
                        else {
                            // reached the last element... Just blur.
                            el.blur();
                        }
                    }
                });
            }
        };
    });
    app.directive('blurOnEnter', function() {
        return {
            score: true,
            priority: 90,
            restrict: 'A',
            link: function(scope, el, attrs) {
                var form = el[0].form;
                $(el).keyup(function (e) {
                    if (e.keyCode === 13) {
                            el.blur();
                    }
                });
            }
        };
    });
    app.directive('blurOnEnterAndEsc', function() {
        return {
            score: true,
            priority: 90,
            restrict: 'A',
            link: function(scope, el, attrs) {
                var form = el[0].form;
                $(el).keyup(function (e) {
                    if (e.keyCode === 13 || e.keyCode === 27) {
                            el.blur();
                    }
                });
            }
        };
    });

    app.directive('shakerProcessorStep', function($filter, CachedAPICalls, ShakerProcessorsInfo, ShakerProcessorsUtils){
        return {
            templateUrl: '/templates/shaker/processor-step.html',
            replace: true,
            /* We have to use prototypal inheritance scope instead of isolate scope because of bug
            https://github.com/angular/angular.js/issues/1941
            *
            * And also because we access a lot of the scope
            *
            * Requires in scope:
            *  - step
            *  - columns (array[string])
            *  - $index
            */
            scope:true,
            link: function(scope, element, attrs){
                // TODO: also linked to the isolate scope issue

                // at instantiation, always scroll to element
                $(element).find(".content").get(0).scrollIntoView(true);

                scope.remove = function(step) {
                    $('.processor-help-popover').popover('hide');//hide any displayed help window
                    scope.removeStep(step.step);
                };
                
                scope.deleteHelper = function(obj, key) {
                    delete obj[key];
                };

                scope.isStepActive = function() {
                	return scope.step == scope.currentStep;
                }

                /**
                 * This is the method called by all forms when a value is changed by the user.
                 * It triggers validation of the step, and, if the step is valid, the refresh.
                 *
                 * This handles a special case: processors that are "new", i.e. that have never been valid.
                 * For them, we don't display their 'in-error' state while they have not been valid at least
                 * once
                 */
                scope.checkAndRefresh = function() {
                    if (!scope.step.$stepState) {
                        scope.step.$stepState = {};
                    }
                    const state = scope.step.$stepState;

                    state.frontError = scope.validateStep(scope.step);

                    if (state.frontError && state.isNew){
                        // Don't do anything for a new processor that is still invalid
                    } else if (!state.frontError && state.isNew) {
                        // No error in new processor -> so it's not new anymore, and we can refresh
                        state.isNew = false;
                        scope.autoSaveAutoRefresh();
                    } else if (state.frontError && !state.isNew) {
                        // Error in non-new processor: Don't refresh
                    } else if (!state.frontError && !state.isNew) {
                        // No error in non-new processor -> the 'normal' case
                        scope.autoSaveAutoRefresh();
                    }
                };

                CachedAPICalls.processorsLibrary.success(function(processors){
                    scope.processors = processors;
                    scope.processor = $filter('processorByType')(scope.processors, scope.step.type);

                    var e = ShakerProcessorsInfo.get(scope.step.type);
                    if (angular.isDefined(e) && angular.isDefined(e.postLinkFn)){
                        e.postLinkFn(scope, element);
                    }

                    scope.$watch("step", function(step, ov) {
                        if (!step.$stepState) {
                            step.$stepState = {};
                        }

                        step.$stepState.frontError = scope.validateStep(scope.step);

                        scope.description = ShakerProcessorsUtils.getStepDescription(scope.processor, step.type, step.params);
                        scope.icon = ShakerProcessorsUtils.getStepIcon(step.type, step.params);
                    }, true);
                });

                scope.types = Object.keys(scope.appConfig.meanings.labelsMap);
            }
        };
    });

    app.directive('shakerGroupStep', function($filter, CachedAPICalls, Fn, $timeout){
        return {
            templateUrl: '/templates/shaker/group-step.html',
            replace: true,
            /*
            * Requires in scope:
            *  - step
            *  - columns (array[string])
            *  - $index
            */
            scope:true,
            link: function(scope, element, attrs){
                scope.remove = function(step) {
                    $('.processor-help-popover').popover('hide');//hide any displayed help window
                    scope.removeStep(step.step);
                };

                scope.hasMatchingSteps = function() {
                    return scope.step.steps.filter(Fn.prop('match')).length > 0;
                }

                scope.isGroupActive = function() {
                   return !scope.isCollapsed() || (scope.hasMatchingSteps() && !scope.step.closeOnMatch);
                }

                scope.toggleGroup = function() {
                    if (scope.isCollapsed() && scope.isGroupActive()) {
                        scope.step.closeOnMatch = !scope.step.closeOnMatch;
                    } else {
                        scope.toggle();
                    }
                }

                scope.$on('openShakerGroup', function(e, step) {
                    if (scope.step === step && scope.isCollapsed()) {
                        scope.toggle();        
                    }
                });

                scope.$watch('groupChanged.addedStepsTo', function() {
                    if (scope.groupChanged.addedStepsTo === scope.step) {
                        if (!scope.isGroupActive()) {
                            scope.toggleGroup();
                        }
                        scrollToStep();
                    } else if (scope.groupChanged.removedStepsFrom.indexOf(scope.step) > -1 && scope.step.steps.length === 0) {
                        if (scope.isGroupActive()) {
                            scope.toggleGroup();
                        }
                    }
                });

                scrollToStep();

                function scrollToStep() {
                    // at instantiation, always scroll to element and start editing
                    $timeout(function() {
                        $(element).get(0).scrollIntoView({
                            behavior: 'auto',
                            block: 'center',
                            inline: 'center'
                        });
                    });
                }


            }
        };
    });


    app.directive('shaker', function($timeout) {
        return {
            restrict: 'C',
            link: function(scope, element, attrs){
                scope.$watch('shaker.explorationFilters.length', function(nv, ov){
                    if (nv && nv > 1) {
                        scope.$broadcast('tabSelect', 'filters');
                    }
                });
                scope.$watch('shaker.steps.length', function(nv, ov){
                    scope.$broadcast('tabSelect', 'script');
                    if (nv > ov) {
                        let ul = $(element).find('ul.steps.accordion');
                        let items = ul.children();
                        let scrollIndex = scope.pasting ? findFirstCopy(scope.shaker.steps) : items.length - 1;

                        $timeout(function() {
                            let addedElement = ul.children().get(scrollIndex);
                            // scroll to element
                            if (addedElement) {
                                addedElement.scrollIntoView({ 'block': 'center' });
                            }
                        });
                    }
                });

                function findFirstCopy(steps) {
                    return steps.findIndex(_ => {
                        return (_.$stepState && _.$stepState.isNewCopy) || (_.steps && findFirstCopy(_.steps) >= 0);
                    });
                }

                scope.clearFFS = function(){
                    scope.ffs = [];
                };
            }
        };
    });

    // small directive meant to replace "-1" by "not set", since -1 is used as a marker of "no limit" in the backend
    // Also handles megabytes
    app.directive('optionalMaxSizeMb', function() { // Warning : this directive cannot handle nulls -> ng-if above it
        return {
            scope: true,
            restrict: 'A',
            link: function($scope, el, attrs) {
                $scope.$optionalState = {};
                var initSize = $scope.$eval(attrs.optionalMaxSizeMb);
                $scope.$optionalState.hasMaxSize = initSize >= 0;
                if ($scope.$optionalState.hasMaxSize) {
                    $scope.$optionalState.maxSize = initSize / (1024 * 1024);
                }
                $scope.$watch('$optionalState.hasMaxSize', function(nv, ov) {
                    if (!$scope.$optionalState.hasMaxSize) {
                        $scope.$eval(attrs.optionalMaxSizeMb + " = -1");
                    } else {
                        /* Put a sane default value */
                        if ($scope.$optionalState.maxSize === undefined || $scope.$optionalState.maxSize < 0) {
                            $scope.$optionalState.maxSize = 1;
                        }
                        $scope.$eval(attrs.optionalMaxSizeMb + " = " + ($scope.$optionalState.maxSize * 1024 * 1024));
                    }
                });
                $scope.$watch('$optionalState.maxSize', function(nv, ov) {
                    if (nv === undefined) return;
                    $scope.$eval(attrs.optionalMaxSizeMb + " = " + ($scope.$optionalState.maxSize * 1024 * 1024));
                });
            }
        };
    });


    var services = angular.module('dataiku.services');

    services.factory('ShakerPopupRegistry', function(Logger) {
        var callbacks = [];
        function register(dismissFunction) {
            callbacks.push(dismissFunction);
        }
        function dismissAll() {
            callbacks.forEach(function(f) {
                try {
                    f();
                } catch (e) {
                    Logger.warn("failed to dismiss shaker popup", e);
                }
            });
            callbacks = [];
        }

        function dismissAllAndRegister(dismissFunction) {
            dismissAll();
            register(dismissFunction);
        }

        return {
            register: register,
            dismissAll: dismissAll,
            dismissAllAndRegister: dismissAllAndRegister
        }
    });

    // to put on the element in which the custom formula editor is supposed to be shown. It provides a function
    // that can be passed to CreateCustomElementFromTemplate in order to insert the formula editor in the DOM,
    // instead of the usual mechanism (which is: append to <body>). This directive sets a boolean in the scope
    // to indicate the formula editor is open (so that you can hide other stuff while it's open, for example)
    app.directive('customFormulaZone', function($rootScope) {
        return {
            scope: true,
            restrict: 'A',
            link: function($scope, el, attrs) {
            	var type = attrs.customFormulaZone || 'replace';
            	$scope.customFormulaEdition.editing = 0;

            	$scope.customFormulaEdition.displayCustomFormula = function(formulaElement) {
            		$scope.customFormulaEdition.editing += 1;

                	$(formulaElement).on("remove", function() {
                		$scope.customFormulaEdition.editing -= 1;
                		if ($scope.customFormulaEdition.editing == 0 ) {
                			if ( type == 'replace' ) {
                				$(el).removeClass("replaced-by-formula");
                			}
                		}
                		$scope.customFormulaEdition.reflowStuff();
                	});

                	if (type == 'replace') {
                		$(el).after(formulaElement);
                		if ( $scope.customFormulaEdition.editing == 1 ) {
                			$(el).addClass("replaced-by-formula");
                		}
                	} else {
                		$(el).append(formulaElement);
                	}
            	};
            }
        };
    });
    // dumb directive to put somewhere above the element providing the custom formula, and the element receiving it.
    // Its purpose is to bridge the scopes of the step using the formula editor and the place where the formula
    // editor is shown (they're most likely in different panes on the screen)
    app.directive('hasCustomFormulaZone', function() {
        return {
            scope: true,
            restrict: 'A',
            link: function($scope, el, attrs) {
            	$scope.customFormulaEdition = {
            		reflowStuff : function() {$scope.$broadcast("reflow");} // reflow just inside the shaker screen, not the entire dss
            	};
            }
        };
    });

})();
