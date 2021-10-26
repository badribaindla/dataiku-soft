(function(){
    "use strict";
    var app = angular.module('platypus.utils', []);

    app.directive("yesNo", function(){
        return {
            scope : {
                yesNo : '='
      },
            template : '<span ng-show="yesNo == true" class="text-success">Yes</span>'+
                        '<span ng-show="yesNo == false" class="text-error">No</span>'
        }
    });
    app.directive("yesNoPartial", function(){
        return {
            scope : {
                yesNoPartial : '='
            },
            link : function($scope) {
                $scope.$watch("yesNoPartial", function(){
                    const input = $scope.yesNoPartial;
                    if (input.every(_ => _)) $scope.response = 2;
                    else if (input.some(_ => _))$scope.response = 1;
                    else $scope.response = 0;
                });
            },
            template : '<span ng-show="response == 2" class="text-success">Yes</span>'+
             '<span ng-show="response == 1" class="text-warning">Partial</span>'+
             '<span ng-show="response == 0" class="text-error">No</span>'
        }
    });

    app.directive('debug', function(){
        return {
            restrict: 'E',
            template: '<div title="data" class="debug" json-formater="debugData"></div>',
            scope: {
                data: '='
            },
            link: function(scope, element) {
                scope.debugData = [];
                var callback = function() {
                      if (scope.debugData.length === 0){
                          scope.$apply(scope.debugData = scope.data);
                      } else {
                          scope.$apply(scope.debugData = []);
                      }
                };
                $(document).bind('debugRefresh',callback);

                scope.$on('$destroy',function(){
                    $(document).unbind('debugRefresh',callback);
                });
            }
        };
    });
    $(window).on('load', function(){
        $(document.body).on('keypress', function(e){
            if (e.charCode == 68 && e.altKey && e.shiftKey && !$(e.target).is('input, select, textarea') && $(e.target).attr('contenteditable') !== 'true') { //command + D
                $(document.body).toggleClass('showDebug');
                $(document).trigger('debugRefresh');
            }
        });
    });

    app.directive('connectionType', function($rootScope, $state){
        return {
            restrict : 'A',
            replace : true,
            scope : {
                "type" : "@",
                "title" : "@"
            },
            template: `<div class="connection-type" disabled-if="appConfig.licensedFeatures.allowedConnectionTypes.indexOf(type) < 0" disabled-message="This connection type is not authorized by your license">
                            <div class="connection-type__inner" style="height: 100%;">
                                <div ng-click="click(type)" class="connection-type__icon-text-wrapper">
                                    <i class="{{type | connectionTypeToIcon}}" style="font-size: 30px;"></i>
                                    <div style="padding-top: 10px; height: 40px">{{type | connectionTypeToNameForList}}</div>
                                </div>
                            </div>
                        </div>`,
            link : function(scope, element, attrs) {
                scope.click = function (type) {
                    if ($rootScope.appConfig.licensedFeatures.allowedConnectionTypes.indexOf(type) >= 0) {
                       $state.go('admin.connections.new',  {type:type})
                    }
                };
                scope.appConfig = $rootScope.appConfig;
                scope.$state = $state;
            }
        }
    });

    app.directive('jsonFormater', function(Logger){
        return {
            restrict: 'A',
            scope: {
                "data": '=jsonFormater'
            },
            link: function(scope, element, attrs){
                scope.$watch('data', function(nv, ov){
                    element.html('');
                    if (nv !== null && nv !== undefined) {
                        json2HTML(nv, element[0]);
                    }
                });

                function json2HTML(json, element){
                    // Doing everything with vanilla JS to keep the fastest rendering possible
                    // instantiating $() takes a long time
                    // using setAttribue & createTextNode has the side effect of escaping HTML
                    var group = document.createElement('div');
                    group.className = 'group';
                    var list = document.createElement('ul');
                    var temp;
                    if(!(json instanceof HTMLElement) && $.isArray(json)){
                        list.className = 'array';
                        temp = document.createElement('div');
                        temp.className = 'bracket start';
                        temp.innerHTML = '[';
                        group.appendChild(temp);
                        group.appendChild(list);
                        temp = document.createElement('div');
                        temp.className = 'bracket end';
                        temp.innerHTML = ']';
                        group.appendChild(temp);
                    } else if (!(json instanceof HTMLElement) && typeof(json) == 'object' && json !== null){
                        list.className = 'object';
                        temp = document.createElement('div');
                        temp.className = 'bracket start';
                        temp.innerHTML = '{';
                        group.appendChild(temp);
                        group.appendChild(list);
                        temp = document.createElement('div');
                        temp.className = 'bracket end';
                        temp.innerHTML = '}';
                        group.appendChild(temp);
                    } else {
                        Logger.error('JSON must either be Object or Array :', json, element);
                    }
                    element.appendChild(group);

                    if (json) {
                        var last_comma;
                        $.each(json, function(key, value){
                            var item = document.createElement('li');
                            list.appendChild(item);

                            if(!(json instanceof HTMLElement) && typeof(json) == 'object' &&  !$.isArray(json)){
                                // prefix with the key value if its a dict
                                item.innerHTML = '<span class="key">"' + sanitize(key) + '":</span>';
                            }

                            if (value instanceof HTMLElement) {
                                // special case for DOM elements to avoid infinite loops
                                var valueWrapper = document.createElement('span');
                                var attributes = '';
                                angular.forEach(value.attributes, function(elt){
                                   attributes += ' ' + elt.nodeName + '="' + elt.nodeValue + '"';
                                });
                                valueWrapper.appendChild(document.createTextNode('<' + value.tagName.toLowerCase() + attributes + '>...</' + value.tagName.toLowerCase() + '>'));
                                valueWrapper.className = valueWrapper.className + ' ' + 'html';
                                item.appendChild(valueWrapper);

                            } else if($.isArray(value)) {
                                if(value.length){
                                    json2HTML(value, item);
                                } else {
                                    // empty array speedup
                                    item.innerHTML = item.innerHTML + '<div class="group"><div class="bracket start">[</div><div class="bracket end">]</div></div>';
                                }
                            } else if (value !== null && typeof(value) == 'object'){
                                json2HTML(value, item);
                            } else {
                                var valueWrapper = document.createElement('span');
                                valueWrapper.className = 'value';
                                if (typeof(value) == 'string'){
                                    // innerText to avoid xss
                                    valueWrapper.innerText = value;
                                } else if (typeof(value) == 'boolean'){
                                    valueWrapper.innerHTML = value ? 'true': 'false';
                                } else if (value === null){
                                    valueWrapper.innerHTML = 'null';
                                    valueWrapper.className = valueWrapper.className + ' ' + 'null';
                                } else if (value === undefined){
                                    valueWrapper.innerHTML = 'undefined';
                                    valueWrapper.className = valueWrapper.className + ' ' + 'undefined';
                                } else {
                                    valueWrapper.innerHTML = value;
                                }
                                valueWrapper.className = valueWrapper.className + ' ' + typeof(value);
                                item.appendChild(valueWrapper);
                            }

                            last_comma = document.createElement('span');
                            last_comma.innerHTML = ',';
                            last_comma.className = 'comma';
                            item.appendChild(last_comma);
                        });
                        if (last_comma){
                            last_comma.remove();
                        }
                    } else {
                        var li = document.createElement('li');
                        var span = document.createElement('span');
                        span.className = 'value';
                        span.innerHTML = 'null';
                        li.appendChild(span);
                        list.appendChild(li);
                    }
                }

                element.on('click', '.group', function(e){
                    e.stopPropagation();
                    $(this).removeClass('folded');
                });
                element.on('click', '.bracket', function(e){
                    e.stopPropagation();
                    $(this).closest('.group').toggleClass('folded');
                });
                element.on('click', '.key', function(e){
                    e.stopPropagation();
                    $(this).next('.group').toggleClass('folded');
                });
                element.on('mouseenter', '.key', function(e){
                    element.find('.hovered').removeClass('hovered');
                    $(this).next('.group').addClass('hovered');
                });
                element.on('mouseleave', function(e){
                    element.find('.hovered').removeClass('hovered');
                });
            }
        };
    });

    app.directive('suggestions', function($timeout, $compile){
    /**
     * Suggestions directive that will transclude a result layout.
     * @param {object} ngModel - The model to bind to.
     * @param {function} suggestions - The function to query to get suggestions, it will be queried with a 'q' parameter, it should return a promise.
     * @param {function} [suggestionsBlur] - Callback called on blur.
     * @param {function} callback - The function to trigger once a choice has been made. If not set, the ng-model is set.
     * @param {string} [placeholder] - An optional placeholder for the input.
     * @param {boolean} [floatingSuggestions=true] - False to have the suggestions in full width under the input instead of following the input.
     * @param {boolean} [filterSuggestionsOnType=false] - True to filter suggestions list according to input value.
    */
        return {
            restrict: 'A',
            transclude: true,
            template: '<div class="suggestions">' +
                '<input type="text" autocomplete="false" ng-model="ngModel" placeholder="{{ placeholder }}" scroll-to-me="{{scrollToMe}}" ng-blur="suggestionBlur($event)" ng-disabled="suggestionDisabled"/>' +
            '</div>',
            replace: true,
            scope: {
                ngModel: '=',
                suggestions: '&',
                suggestionBlur: '=?',
                callback: '&',
                placeholder: '@',
                forbiddenSuggestions: '=?',
                floatingSuggestions: '=?'
            },
            link: function(scope, element, attrs){
                // stash in a field for sub-elements
                scope.suggestionDisabled = false;
                attrs.$observe("disabled", function() {
                    scope.suggestionDisabled = "disabled" in attrs && attrs.disabled !== false;
                });

                scope.items = [];
                scope.hasFocus = false;
                scope.placeholder = attrs.placeholder;
                var input = element.find('input');
                let className = 'items suggestions-list';
                (scope.floatingSuggestions == false) && (className += ' suggestions-list--fixed');
                const parentElement = input[0].parentElement.parentElement;

                let suggestionsTemplate = '<ul class="' + className + '" ng-class="{focus: hasFocus, visible: items.length }" ng-disabled="suggestionDisabled">' +
				'    <li ng-repeat="item in items track by $index" ng-class="{active: $index == itemsIndex, selected: item.selected}" ng-click="setSuggestion($event)" ng-disabled="suggestionDisabled"><span ng-bind-html="(item.label || item) | sanitize"></span></li>' +
                '</ul>';

                let filterableSuggestionsTemplate = '<ul class="' + className + '" ng-class="{focus: hasFocus, visible: items.length }" ng-disabled="suggestionDisabled">' +
				'    <li ng-repeat="item in items | filter:ngModel as filteredItems track by $index" ng-class="{active: $index == itemsIndex, selected: item.selected}" ng-click="setSuggestion($event)" ng-disabled="suggestionDisabled"><span ng-bind-html="(item.label || item) | sanitize"></span></li>' +
                '</ul>';

                var ul;
                if (attrs.filterSuggestionsOnType === undefined) {
                    ul = $compile(suggestionsTemplate)(scope);
                } else {
                    ul = $compile(filterableSuggestionsTemplate)(scope);
                }

                $('body').append(ul);

                scope.itemsIndex = -1;

                var resizeInput = function(){
                    let span = $('<span class="itemPlaceholder"></span>');
                    let inputValue = input.val();
                    let placeholderLength = (attrs.placeholder && attrs.placeholder.length > 0) ? attrs.placeholder.length : 0;
                    element.append(span);
                    span.html(sanitize(inputValue));
                    // When the input is created and has a placecholder, prevent cropping it
                    if (inputValue.length === 0 && placeholderLength > 0) {
                        input.size(placeholderLength);
                        input.width(placeholderLength * 6);
                    } else {
                        input.width(Math.max(span.width() + 20, 50));
                    }
                    span.remove();
                };

                resizeInput();

                scope.safeApply = function(fn) {
                  var phase = this.$root.$$phase;
                  if(phase == '$apply' || phase == '$digest')
                    this.$eval(fn);
                  else
                    this.$apply(fn);
                };

                input.on('focus', function(){
                    scope.hasFocus = true;
                    resizeInput();
                    if (attrs.showSuggestionsOnFocus !== undefined) {
                        showSuggestions();
                    }
                });

                input.on('blur', function() {
                    resizeInput();
                });

                ul.on('mouseenter', ' > li', function(e){
                    scope.itemsIndex = ul.find(' > li').index(this);
                    scope.$apply();
                });
                element.find('input').on('keydown', function(e){
                    // up arrows
                    if (e.keyCode == 38){
                        scope.itemsIndex = Math.max(scope.itemsIndex - 1, -1);
                        scope.$apply();
                    }
                    // down arrows
                    if (e.keyCode == 40){
                        scope.itemsIndex = Math.min(scope.itemsIndex + 1, scope.items.length - 1);
                        scope.$apply();
                    }

                    // ensure it is visible
                    if ((e.keyCode == 38 || e.keyCode == 40) && scope.itemsIndex >= 0){
                        var current_li = ul.find(' > li').eq(scope.itemsIndex);
                        var offset = current_li.position().top;
                        var step = current_li.height();

                        if (offset < step) {
                            ul.scrollTop(Math.max(ul.scrollTop() - step, 0));
                        } else if (offset > ul.height() - step) {
                            ul.scrollTop(ul.scrollTop() + step);
                        }
                        e.preventDefault();
                    }

                    // enter
                    if (e.keyCode == 13){
                        scope.setSuggestion(e);
                        scope.$apply();
                    }
                });

                element.find('input').on('keyup', function(e){
                    resizeInput();
                });
                scope.setSuggestion = function(event){
                    if (scope.itemsIndex >= 0) {

                        const item = attrs.filterSuggestionsOnType === undefined ? scope.items[scope.itemsIndex] : scope.filteredItems[scope.itemsIndex];
                        if (attrs.callback) {
                            scope.callback({ value: item, event: event });
                        } else {
                            scope.ngModel = item;
                        }
                    } else if (attrs.allowNoSuggestions !== undefined) {
                        if (attrs.callback) {
                            scope.callback({ value: input[0].value, event: event });
                        }
                    }
                    // deselect everything
                    $timeout(function(){scope.itemsIndex = -1;}, 0);
                };

                var showSuggestions = function(nv) {
                    scope.suggestions({q:nv}).then(function(response){
                        scope.items = response;

                        if (scope.forbiddenSuggestions) {
                            scope.forbiddenSuggestions.forEach(function(e) {
                                var index = scope.items.indexOf(e)
                                if (index > -1) {
                                    scope.items.splice(index,1);
                                }
                            })
                        }

                        if (scope.items.length) {

                            if (scope.floatingSuggestions !== false) {
                                var offset = input.offset();
                                var height = input.outerHeight();
                                ul.css(
                                    {
                                        position: 'absolute',
                                        left: offset.left,
                                        top: offset.top + height
                                    }
                                );
                            } else {
                                let parentDimensions = parentElement.getBoundingClientRect();
                                ul.css(
                                    {
                                        position: 'absolute',
                                        left: parentDimensions.left,
                                        top: parentDimensions.top + parentDimensions.height,
                                        width: parentDimensions.width
                                    }
                                )
                            }
                        }
                    });
                };
                scope.$on('showSuggestions', showSuggestions);
                scope.$watch('ngModel', function(nv, ov){
                    if (nv !== ov){
                        if (nv){
                            showSuggestions(nv);
                        } else {
                            scope.items = [];
                        }
                        scope.itemsIndex = -1;
                    }
                });

                var resetOnEventElsewhere = function(ev) {
                	var el = ev.target;
                	if (!ul.get(0).contains(el)) {
                		scope.items = [];
                		scope.$apply();
                	}
                };

                // Using $timeout so that this code get executed after the current digest cycle.
                // Otherwise the $(element).parents() won't go further than the parent directive's element
                // b/c this parent directive's element is not in the DOM yet
                $timeout(function() {
                    $(element).parents().scroll(resetOnEventElsewhere);
                    scope.scrollToMe = !attrs.hasOwnProperty('noScrollToMe');
                }, 0);

                $('html').click(resetOnEventElsewhere);

                scope.$on('$destroy', function() {
                	element.parents().unbind('scroll', resetOnEventElsewhere);
                	$('html').unbind('click', resetOnEventElsewhere);
                	ul.remove();
                })

            }
        };
    });

    app.directive('tags', function($rootScope){
        return {
            template: `<div class="tags" >
                    <div ng-repeat="tag in tags" class="tag" style="background-color:{{ tagColor(tag) }}" >
                        <span ui-global-tag="tag" object-type="objectType"/>
                    </div>
                    <div ng-if="tags.length === 0 && !emptyText" class="help-text"><i plus-icon /> add tags </div>
                    <div ng-if="tags.length === 0 && emptyText" class="help-text">{{emptyText}}</div>
                </div>`,
            scope: {
                tags: '=tags',
                objectType: '=?',
                emptyText: '@?'
            },
            link: function(scope, element, attrs){
                if ($rootScope.activeProjectTagColor) {
                     scope.tagColor = $rootScope.activeProjectTagColor;
                } else {
                    scope.tagColor = function(){
                        return "#999";
                    }
                }
                if ($rootScope.activeGlobalTagsCategory) {
                     scope.getGlobalTagCategory = $rootScope.activeGlobalTagsCategory;
                } else {
                    scope.getGlobalTagCategory = function(){
                        return null;
                    }
                }
            }
        };
    });

    /**
    * Display tags with global tag category ui if it applies.
    *
    * <span ui-global-tag="TAG_TITLE" object-type="OBJECT_TYPE"/>
    */
    app.directive('uiGlobalTag', function($rootScope, TaggingService){
        return {
            template: `<span ng-if="globalTagCategory" class="global-tag-category-label mright4">{{globalTagCategory}}</span>{{tagTitle}}`,
            scope: {
                tag: '=uiGlobalTag',
                objectType: '=?'
            },
            link: function(scope, element, attrs) {

                scope.$watch('tag', function(nv, ov){
                    if (nv !== null && nv !== undefined) {
                        scope.globalTagCategory = TaggingService.getGlobalTagCategory(nv, scope.objectType);
                        scope.tagTitle = nv;
                        if (scope.globalTagCategory) {
                            var regexp = new RegExp(`${scope.globalTagCategory.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}:(.+)`,"g");
                            scope.tagTitle = scope.tag.split(regexp)[1];
                        }
                        const tagElement = element.parent();
                        const tagBackgroundColor = tagElement[0].style.backgroundColor;
                        if (tagBackgroundColor && typeof d3 !== 'undefined') {
                            const tagBgColorRGB = d3.rgb(tagBackgroundColor);
                            $(element).css("color", tagBgColorRGB.r*0.299 + tagBgColorRGB.g*0.587 + tagBgColorRGB.b*0.114 >= 186 ? "#333" : "#FFF");
                        }
                    }
                });
            }
        }
    });

    app.directive('draggable', function($parse) {
        // <div draggable="OBJECT" [draggable-mode="move"]>...</div>
        return {
            link: function(scope, element, attrs) {
                var el = element[0];

                el.draggable = true;

                el.addEventListener('dragstart', function(e) {
                    e.dataTransfer.effectAllowed = attrs.draggableMode || 'copy';
                    e.dataTransfer.setData('json', JSON.stringify(scope.$eval(attrs.draggable)));
                    // FIXME highlight droppable
                    this.classList.add('drag');
                    return false;
                },false);

                el.addEventListener('dragend', function(e) {
                    if (e.dataTransfer.dropEffect === 'move' && attrs.draggableRemove) {
                        // The element has been moved and should be removed from here
                        $parse(attrs.draggableRemove)(scope.$parent || scope);
                    }
                    this.classList.remove('drag');
                    return false;
                },false);
            }
        };
    });

    // From http://rogeralsing.com/2013/08/26/angularjs-directive-to-check-that-passwords-match-followup/
    app.directive('passwordMatch', [function () {
            return {
                restrict: 'A',
                scope:true,
                require: 'ngModel',
                link: function (scope, elem , attrs,control) {
                    var checker = function () {

                        //get the value of the first password
                        var e1 = scope.$eval(attrs.ngModel);

                        //get the value of the other password
                        var e2 = scope.$eval(attrs.passwordMatch);
                        return e1 == e2;
                    };
                    scope.$watch(checker, function (n) {

                       //set the form control to valid if both
                       //passwords are the same, else invalid
                       control.$setValidity("unique", n);
                });
            }
         };
    }]);

    app.directive('copyClipboardButton', function($timeout, ClipboardUtils) {
        return {
            template: '<a class="link-std" ng-click="copyClipboard()"><i class="icon-copy"/></a>',
            scope: {
                copyClipboardButton: '<'
            },
            link: function(scope, element, attrs) {
                scope.copyClipboard = function() {
                    ClipboardUtils.copyToClipboard(scope.copyClipboardButton);
                };
            }
        };
    });

    // Note : this zone capture the focus on click
    // Once focused, all keyboards event are forwarded to an hidden input
    // (it prevents keyboard capture !!)
    app.directive('copyPasteZone',function($timeout) {
        return {
            scope : {
                copyFrom:'&',
                pasteTo:'&'
            },
            link: function(scope, element, attrs) {
                var fakeInput = $('<textarea style="position:absolute;top:-20000px; left:-20000px;">');
                $('body').append(fakeInput);

                element.bind('click',function(e) {
                    var prevActiveElement = document.activeElement;
                    $timeout(function() {
                        // Some heuristics to avoid taking the focus unnecessarily. It's avoided if:
                        // - The focused element has changed after clicking
                        if(prevActiveElement == document.activeElement
                        // - The focused element has been clicked on
                        && document.activeElement != e.target
                        // - The focused element is a child of the copy paste zone
                        && $(e.target).has(document.activeElement).length==0
                        // - The clicked element is inside a button or a link
                        && $(e.target).parents('a, button').length==0
                        // - The clicked element is a button or a link
                        && ['a','button','input','textarea'].indexOf(e.target.tagName.toLowerCase())==-1) {
                            fakeInput.focus();
                        }
                    },0);
                });
                scope.$on('$destroy',function() {
                    fakeInput.remove();
                });

                function copyOrCut(cut) {
                    scope.$apply(function(){
                        var contentToWrite = scope.copyFrom({cut:cut});
                        fakeInput.val(contentToWrite?contentToWrite:'');
                        fakeInput.select();
                        fakeInput.focus();
                    });
                }

                fakeInput.on('beforecopy',function(e) {
                    copyOrCut(false);
                });

                fakeInput.on('beforecut',function(e) {
                    copyOrCut(true);
                });

                fakeInput.bind('paste',function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    scope.$apply(function() {
                        var originalEvent = e.originalEvent;
                        var data = originalEvent.clipboardData.getData('text/plain');
                        scope.pasteTo({data:data});
                    });
                });
            }
        };
    });

    /**
     * Copied from https://github.com/angular-ui/ui-utils/pull/152
     *
     * Executes an event after an 'intended hover'.
     * The delay can be optionally specified
     * Example
     * <div ui-hoverintent="menu.open = true" ui-hoverintent-delay="1000" ui-hoverintent-resetonclick></div>
     *
     * @param {function} uiHoverintent - The event handler function.
     * @param {int} [uiHoverintentDelay=500] - The intent delay in ms
     * @param {boolean} [uiHoverintentResetonclick] - Reset the intent delay timer, when the element is clicked
     */
    app.directive('uiHoverintent', ['$timeout', function($timeout){
        return {
            restrict: 'A',
            link: function(scope, element, attributes){

                var hoverIntentPromise;

                element.bind('mouseenter', triggerDelayedEvent);
                element.bind('mouseleave', cancelDelayedEvent);
                element.bind('$destroy', cancelDelayedEvent);
                if(attributes.hasOwnProperty('uiHoverintentResetonclick')){
                    element.bind('click', triggerDelayedEvent);
                }

                /**
                 * Triggers the eventHandler after the specified delay, or the default delay.
                 * Cancels the existing pending trigger (if any).
                 */
                function triggerDelayedEvent(event){
                    cancelDelayedEvent();

                    var delay = scope.$eval(attributes.uiHoverintentDelay);
                    if(delay === undefined){
                        delay = 500;
                    }

                    hoverIntentPromise = $timeout(function(){
                        scope.$eval(attributes.uiHoverintent, { $event: event });
                    }, delay);
                }

                /**
                 * Cancels the triggering the event.
                 */
                function cancelDelayedEvent(){
                    $timeout.cancel(hoverIntentPromise);
                }
            }
        };
    }]);

    app.directive("ngInject", function($injector) {
        return {
            scope: false,
            priority: 100,
            link: function($scope, element, attrs) {
                $scope[attrs.ngInject] = $injector.get(attrs.ngInject);
            }
        }
    });

    app.directive("dkuFor", function($injector) {
        return {
            scope : {
                dkuFor : '@'
            },
            link: function($scope, element, attrs) {
                element.click(function() {
                    $($scope.dkuFor).click();
                    return false;
                });
            }
        }
    });

    // Make the item always take up the width it has when its font-weight is 500
    // Useful to avoid weird shifting when tabs become active
    app.directive("fw500Width", function() {
        return {
            scope: false,
            link: function($scope, $element) {
                $element.addClass("dku-fw500-width");
                $element.attr("text-content", $element.text());
            }
        }
    });

    app.directive("dkuFadeIn", function($timeout) {
        return {
            scope: false,
            link: function($scope, $element, attrs) {
                $element.addClass("dku-fade-in");
                $timeout(function() {
                    $element.addClass("dku-fade-in-start");
                    if (attrs.fadeAll !== undefined) {
                        $element.addClass('dku-fade-all-in-start');
                    }
                });
            }
        }
    });

    app.directive('onScroll', function() {
        return {
            scope: {
                onScroll: '='
            },
            link: function($scope, $element) {
                const handler = $element.bind('scroll', function(evt) {
                    if (!$scope.onScroll) return;
                    $scope.onScroll(evt);
                });
                $scope.$on('$destroy', function() {
                    $element.unbind('scroll', handler);
                });
            }
        };
    });

    app.directive('pasteRegion', function(ClipboardUtils) {
        return {
            scope: {
                copyCallback: '&',
                pasteCallback: '&'
            },
            link: function($scope, element, attrs) {
                const copyCallback = $scope.copyCallback();
                const pasteCallback = $scope.pasteCallback();

                element.on('keydown', (event) => {
                    if (event.currentTarget === event.target) {
                        if(event.ctrlKey || event.metaKey) {
                            // ctrl + c
                            if (event.which === 67) {
                                copyCallback(event);
                                $scope.$apply();
                            // ctrl + v
                            } else if (event.which === 86) {
                                ClipboardUtils.pasteFromClipboard(event, pasteCallback);
                                $scope.$apply();
                            }
                        }
                    }
                });
            }
        };
    })

})();
