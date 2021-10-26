(function(){
    'use strict';
    var app = angular.module('dataiku.directives.styling', ['dataiku.filters', 'dataiku.services', 'ui.keypress']);

    app.directive('autoFocus', function($timeout){
        return {
            restrict: 'A',
            link: function(scope, element, attr){
                attr.$observe('autoFocus', function(){
                    if ((attr.autoFocus === "true") || (attr.autoFocus === true) || (attr.autoFocus===undefined)) {
                        $timeout(function(){element.focus();}, 0);
                    }
                });
            }
        };
    });

    app.directive('remainingHeight', function($timeout, $rootScope, Logger) {
        return {
            scope: true,
            link: function(scope, element) {
                Logger.warn("Used deprecated remainingHeight on", element);
                var resize = function(){
                    scope.remainingHeight = $(window).height() - element.offset().top
                        - parseInt($(element).css('padding-top')) - parseInt($(element).css('padding-bottom'));
                    if(!$rootScope.$$phase) scope.$apply();
                };

                $(window).on('resize', resize);
                $timeout(resize, 0);
                //$timeout(resize, 3000);

                scope.$on('reflow',function() { resize(); }); // Force remainingHeight recomputation
                scope.$on('$destroy', function() {
                    $(window).off('resize', resize);
                });
            }
        };
    });

    app.directive('remainingHeightNoScope', function($timeout, $rootScope, Logger) {
        return {
            link: function(scope, element) {
                Logger.warn("Used deprecated remainingHeightNoScope")
                var resize = function(){
                    scope.remainingHeight = $(window).height() - element.offset().top;
                    if(!$rootScope.$$phase) scope.$apply();
                };
                $(window).on('resize', resize);
                $timeout(resize, 0);
                scope.$on('$destroy', function() {
                    $(window).off('resize', resize);
                });
            }
        };
    });

    app.directive('scrollableToBottom', function() {
        return {
            template : '<div remaining-height style="overflow: auto; max-height: {{remainingHeight}}px;" ng-transclude></div>',
            transclude : true
        };
    });

    app.directive('scrollToMe', function($timeout){
        return {
            scope: {
                onScrollTriggered: '&',
                scrollToMeDuration: '<?'
            },
            link: function(scope, element, attrs){

                attrs.$observe('scrollToMe', function() {
                    if(attrs.scrollToMe === 'true') {
                        if (attrs.scrollAlign === 'center') {
                            $timeout(function() {
                                element[0].scrollIntoView({
                                    behavior: 'auto',
                                    block: 'center',
                                    inline: 'center'
                                });
                            });
                        } else {
                            /*
                            *  Checking for vertical scroll and doing it if possible 
                            */
                            var $scrollParent = element.parents().filter(function() {
                              return (/(auto|scroll)/).test(($.css(this, 'overflow')) + ($.css(this, 'overflow-y')));
                            }).eq(0);
                            if (!isNaN($scrollParent.length) && $scrollParent.length > 0) {
                                // only if not already visible
                                var offsetWithinScroll = $(element[0]).offset().top - $($scrollParent[0]).offset().top;
    
                                if (offsetWithinScroll < 0){ // Element is above parent
                                    $scrollParent.clearQueue();
                                    $scrollParent.animate({
                                        scrollTop: $scrollParent.scrollTop() + offsetWithinScroll,
                                    }, scope.scrollToMeDuration);
                                } else if (offsetWithinScroll + element.outerHeight() > $scrollParent.innerHeight()) { // element is under parent
                                    $scrollParent.clearQueue();
                                    $scrollParent.animate({
                                        scrollTop: $scrollParent.scrollTop() + Math.min(offsetWithinScroll, offsetWithinScroll + element.outerHeight() - $scrollParent.innerHeight()),
                                    }, scope.scrollToMeDuration);
                                }
                            }
    
                            /*
                             * Then checking for horizontal scroll and doing it if possible
                             */
                            var $scrollParent = element.parents().filter(function() {
                              return (/(auto|scroll)/).test($.css(this, 'overflow-x'));
                            }).eq(0);
                            if (!isNaN($scrollParent.length) && $scrollParent.length > 0) {
                                // only if not already visible
                                var offsetWithinScroll = element[0].offsetLeft - $scrollParent[0].offsetLeft;
    
                                if (offsetWithinScroll < $scrollParent.scrollLeft()){
                                    // left
                                    $scrollParent.clearQueue();
                                    $scrollParent.animate({
                                        scrollLeft:offsetWithinScroll,
                                    }, scope.scrollToMeDuration);
                                }
                                if((offsetWithinScroll + element.outerWidth()) > ($scrollParent.scrollLeft() + $scrollParent.width())){
                                    // right
                                    $scrollParent.clearQueue();
                                    $scrollParent.animate({
                                        scrollLeft:offsetWithinScroll - $scrollParent.innerWidth() + element.outerWidth(),
                                    }, scope.scrollToMeDuration);
                                }
                            }
                        }

                        scope.onScrollTriggered();
                    }
                });
            }
        };
    });

})();
