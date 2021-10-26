(function() {
'use strict';

const app = angular.module('dataiku.directives.bootstrap', ['dataiku.filters']);


app.factory("getBootstrapTooltipPlacement", function() {
    return function(force_position) {
        if (!force_position || force_position.indexOf('tooltip-')==-1) {
            return function(tip, element) {
                var overflowParent = $(element).overflowParent()
                var overflowParentOffset = $(overflowParent).offset()

                var offset = $(element).offset();
                var top = offset.top + $(element).height() * 0.5 - overflowParentOffset.top;
                var left = offset.left + $(element).width() * 0.5 - overflowParentOffset.left;

                var height = $(overflowParent).outerHeight();
                var width = $(overflowParent).outerWidth();

                if (left < width * 0.33) {return 'right'}
                else if (left > width * 0.66) {return 'left'}
                else if (top < height * 0.5) {return 'bottom'}
                else if (top >= height * 0.5) {return 'top'}
                else {return 'bottom'}

            }
        } else {
            return force_position.replace("tooltip-","");
        }
    }
});


app.directive("toggle", function(getBootstrapTooltipPlacement) {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            switch (attrs.toggle) {
                case "tooltip-bottom":
                case "tooltip-top":
                case "tooltip-left":
                case "tooltip-right":
                case "tooltip":
                    var params = {
                        placement: attrs.placement ? attrs.placement : getBootstrapTooltipPlacement(attrs.toggle),
                        animation: attrs.animation ? scope.$eval(attrs.animation) : false,
                    };
                    if (attrs.container) params.container = attrs.container;
                    if (attrs.trigger) params.trigger = attrs.trigger;
                    element.tooltip(params);
                    // Remove other tooltips on hover out
                    element.hover(function() { $(this).tooltip('show'); }, function() {
                        $('.tooltip').not(element.next()).remove();
                    });
                    attrs.$observe('title', function() {
                        element.attr('data-original-title', attrs.title);
                        element.attr('title', '');
                    })
                    break;
                case "popover":
                    var content = scope.$eval(attrs.content)
                    var closePopover = function() {
                        element.popover('destroy');
                    }
                    var openPopover = function() {
                        var opts = {
                            placement: getBootstrapTooltipPlacement(),
                            container: attrs.container || 'body',
                            html: true,
                            trigger: 'manual',
                            content: content,
                            title: '<a class="close"><i class="icon-remove"></i></a> ' + attrs.title
                        }
                        element.popover(opts);
                        element.popover('show');
                        element.data('popover').$tip.find('.popover-title > .close').click(closePopover);
                        /* Don't close the popover when clicking on it */
                        element.data('popover').$tip.click(function(e) {
                            e.stopPropagation();
                        });
                    }
                    var justOpened = false;
                    $(element).click(function(e) {
                        if (element.data('popover')) {
                            closePopover()
                        } else {
                            openPopover()
                            justOpened = true;
                        }
                    });
                    $(document).on('click', function(e) {
                        if (!justOpened && element.data('popover')) {
                            closePopover();
                        }
                        justOpened = false;

                    });
                    break;
                case "dropdown":
                    $(element).click(function() {
                        var overflowParent = element.overflowParent()
                        var overflowParentOffset = $(overflowParent).offset()
                        var height = $(overflowParent).outerHeight();
                        var width = $(overflowParent).outerWidth();

                        var offset = $(element).offset();

                        var vert = 0.5 * height - (offset.top - overflowParentOffset.top);
                        var horiz = 0.5 * width - (offset.left - overflowParentOffset.left);

                        if (vert > 0) {
                            element.closest('.dropup,.dropdown').removeClass('dropup').addClass('dropdown')
                        } else {
                            element.closest('.dropup,.dropdown').removeClass('dropdown').addClass('dropup')
                        }

                        if (horiz > 0) {
                            element.closest('.dropup,.dropdown').find('.dropdown-menu').removeClass('pull-right')
                        } else {
                            element.closest('.dropup,.dropdown').find('.dropdown-menu').addClass('pull-right')
                        }
                    })
                    break;
            }
        }
    }
});

/**
 * On text overflow detection, this directive displays a tooltip on hover containing the original text and formats the text with an ellipsis.
 *
 * Note: The element on which this directive is applied must already have the correct target width.
 * Overflow detection happens when the width of the text is larger than the width of the container element.
 *
 * @param {string}      textTooltip           - The text to display
 * @param {string}      tooltipDirection      - Position of tooltip (default: tooltip-right; other possible values: tooltip, tooltip-top, tooltip-bottom, tooltip-left)
 * @param {string}      textOverflowClass     - CSS class to be applied to text (if overflow)
 * @param {boolean}     observeResize         - True (default) to re-detect overflow when the element is resized or text changes. Consider using false for static content (may improve performance)
 * @param {boolean}     allowHtml             - The text to display contains HTML
 */
app.directive("showTooltipOnTextOverflow", function ($compile, $timeout, $filter, $sanitize) {
    const template = `
        <div class="{{ getTooltipClass() }}"
             ng-show="textTooltip"
             ng-bind-html="getHtmlContent()"
             title="{{ getTooltipTitle() }}"
             toggle="{{ getTooltipDirection() }}"
             container="body"
        >
        </div>`;

    const stripHtml = (unsafeHtml) => {
        // DOMParser evaluates in another HTMLDocument with scripting disabled.
        const doc = new DOMParser().parseFromString(unsafeHtml, 'text/html');
        return doc.body.innerText || "";
    };

    return {
        restrict: 'A',
        scope: {
            textTooltip: '<',
            allowHtml: '<',
            tooltipDirection: '<?',
            textOverflowClass: '@',
            observeResize: '<?'
        },
        template: template,
        controller: ($scope) => {
            // At the very beginning, initialize the template with as much
            // width as possible. Then, if the content is cropped with an
            // ellipsis, show a tooltip with the whole content.
            $scope.withEllipse = false;

            $scope.getTooltipClass = () => {
                if ($scope.withEllipse) {
                    return $scope.textOverflowClass || "ellipsed";
                }

                // We need this when the template is initialized so that it is
                // later possible to determine if the content is cropped (with
                // an ellipsis). See IntersectionObserver usages below.
                return "width-fit-content";
            };

            $scope.getTooltipTitle = () => {
                if (!$scope.withEllipse) {
                    // The content fits entirely, no need to show the tooltip.
                    return "";
                }

                if ($scope.allowHtml) {
                    return stripHtml($scope.textTooltip);
                }

                return $scope.textTooltip;
            };

            $scope.getTooltipDirection = () => {
                return $scope.tooltipDirection || 'tooltip-right';
            };

            // Set the tooltip content, depending on whether it supports
            // html or plain text.
            $scope.getHtmlContent = () => {
                if ($scope.allowHtml) {
                    return $scope.textTooltip;
                }

                return sanitize($scope.textTooltip);
            };
        },
        link: (scope, element) => {
            if (!('IntersectionObserver' in window)) {
                return;
            }

            // Use better names to refer to the html elements.
            const directiveTargetElement = element[0];
            if (!angular.isObject(directiveTargetElement)) {
                return;
            }

            const thisElement = directiveTargetElement.lastChild;
            directiveTargetElement.classList.add("ellipsed");

            // Object to detect when the tooltip overflows its container element.
            let intersectObserver = null;

            // Object to detect when the container element is resized.
            let resizeObserver = null;

            const onIntersectChange = (intersections) => {
                const anyIntersection = intersections
                    .some((it) => it.intersectionRatio > 0 && it.intersectionRatio < 1);

                if (anyIntersection) {
                    // We know that the content overflows its container, no need
                    // to monitor it anymore.
                    intersectObserver.disconnect();

                    // This handler can be called outside of AngularJS cycles,
                    // so we notify it that something has changed.
                    scope.$applyAsync(() => {
                        scope.withEllipse = true;
                    });
                }
            }

            intersectObserver = new IntersectionObserver(onIntersectChange, {
                root: directiveTargetElement,
                rootMargin: '2px', // Tolerance margin.
                threshold: 1,
            });

            const connectObservers = () => {
                intersectObserver.observe(thisElement);

                if (resizeObserver != null) {
                    resizeObserver.observe(directiveTargetElement);
                }
            };

            const disconnectObservers = () => {
                intersectObserver.disconnect();

                if (resizeObserver != null) {
                    resizeObserver.disconnect();
                }
            };

            // Reset to initial template and re-observe
            const resetToInitialRender = () => {
                disconnectObservers();

                // This handler can be called outside of AngularJS cycles,
                // so we notify it that something has changed.
                scope.$applyAsync(() => {
                    scope.withEllipse = false;
                });

                connectObservers();
            };

            // Detect when the container element is resized.
            const observeResize = angular.isDefined(scope.observeResize) ?
                scope.observeResize : true;

            if (observeResize) {
                // Computing the width of the element can be expensive, so we set elWidth to 0 for the
                // first resizing check. Then we will rely on the width provided by the resizeObserver.
                scope.elWidth = 0;

                resizeObserver = new ResizeObserver(entries => {
                    entries.forEach(entry => {
                        if (entry.contentRect.width > scope.elWidth) {
                            // We use setTimeout to change observed element out of the loop to prevent error
                            // in safari : "ResizeObserver loop completed with undelivered notifications"
                            setTimeout(() => resetToInitialRender());
                        }

                        scope.elWidth = entry.contentRect.width;
                    });
                });
            }

            scope.$watch('textTooltip', (newVal, oldVal) => {
                if (newVal !== oldVal) {
                    resetToInitialRender();
                }
            });

            scope.$on('$destroy', () => {
                disconnectObservers();
                $('.tooltip').remove();
            });

            // Set the tooltip content and start monitoring for resize
            // and / or intersection events.
            resetToInitialRender();
        }
    }
});

// Initialy taken from angular-strap but with some fixes (ng options parser accepts filters + fix the dropdown opening problem)
if (/\bdisable_dku_fancy=true\b/.test(document.cookie)) {
    // Selenium: disable this directive + don't hide the <select> inputs
    console.warn("Disabling dkuBsSelect"); /*@console*/ // NOSONAR: OK to use console.
    $(function() {
        document.body.classList.add('disable-dku-fancy');
    });
} else {
app.directive('dkuBsSelect', function($timeout) {
    var NG_OPTIONS_REGEXP = /^\s*(.*?)(?:\s+as\s+(.*?))?(?:\s+group\s+by\s+(.*))?\s+for\s+(?:([\$\w][\$\w\d]*)|(?:\(\s*([\$\w][\$\w\d]*)\s*,\s*([\$\w][\$\w\d]*)\s*\)))\s+in\s+(.*)$/;

    return {
        restrict: 'A',
        require: '?ngModel',
        link: function(scope, element, attrs, controller) {
            element.css('visibility', 'hidden');
            var magicContainer = $('<div></div>');
            element.magicContainer = magicContainer;
            $('body').append(magicContainer);
            var lastDisabled;
            var refresh = function(newValue, oldValue) {
                if (magicContainer) {
                    scope.$applyAsync(function() {
                        // data-content is cached in jQuery's .data('content') and .selectpicker('refresh') won't pick up the new content if we don't refresh that (https://github.com/silviomoreto/bootstrap-select/issues/298)
                        element.find('option[data-content]').each(function() {
                            var $this = $(this);
                            $this.data('content', $this.attr('data-content'));
                        });

                        element.selectpicker('refresh');
                    }, 0);
                }
            };
            var refreshIfChanged = function(newValue, oldValue) {
                if (!angular.equals(newValue, oldValue)) {
                    refresh(newValue, oldValue);
                }
            };

            const refreshStyle = function(newValue, oldValue) {
                if (!angular.equals(newValue, oldValue)) {
                    element.selectpicker('updateStyle', newValue);
                }
            };

            scope.$on('selectPickerRefresh', refresh);

            // Hide the empty element
            var fixupEmptyOption = function() {
                var disabled = $('option', element).map(function(idx, op) {
                    return $(op).attr('disabled') == "disabled"
                }).get();
                if (lastDisabled == null) {
                    lastDisabled = disabled;
                } else if (lastDisabled.join() != disabled.join()) {
                    refresh();
                    lastDisabled = disabled;
                }
                scope.$evalAsync(function() {
                    magicContainer.find('ul>li>a>span[class=text]:empty').parent().parent().css('display', 'none');
                });
            };

            function addWatches() {
                var options = $.extend({
                    container: magicContainer,
                    style: 'dku-select-button btn--secondary'
                }, scope.$eval(attrs.dkuBsSelect) || {});
                
                element.selectpicker(options);
                element.selectpicker('updateStyle', scope.$eval(attrs.dkuStyle))
                if (options.titlePrefix) {
                    element.next().find('>button>span:first-child').attr('title-prefix', options.titlePrefix);
                }
                element.next().find('>button').click(fixupEmptyOption);
                if (options.pullRight) {
                    element.parent().find("div.dropdown-menu").addClass("pull-right");
                }
                if (options.customDropdownAttrs) {
                    for (var attr in options.customDropdownAttrs) {
                        element.parent().find("div.dropdown-menu").attr(attr, options.customDropdownAttrs[attr]);
                    }
                }
                scope.$watch(attrs.dkuStyle, refreshStyle);

                // If we have a controller (i.e. ngModelController) then wire it up
                if (controller) {
                    // Watch for changes to the model value
                    scope.$watch(attrs.ngModel, refresh);

                    // Update the select menu when another model change
                    // It's supposed to be used whenever the ng-options is too complicated to parse
                    if (attrs.watchModel) {
                        scope.$watch(attrs.watchModel, refreshIfChanged, true);
                        scope.$watchCollection(attrs.watchModel, refreshIfChanged);
                    } else {
                        // Watch for changes to the options
                        // We try to detect the underlying model variable using regexps
                        // It is not robust
                        if (attrs.ngOptions) {
                            var match = attrs.ngOptions.match(NG_OPTIONS_REGEXP);

                            if (match && match[7]) {
                                var variable = match[7].split('|')[0];
                                if(variable) {
                                    scope.$watch(variable, refreshIfChanged, true);
                                }
                            }
                        }
                        if (attrs.ngDisabled) {
                            scope.$watch(attrs.ngDisabled, refreshIfChanged);
                        }
                    }
                }
            }

            // if the attributes asynchronousLoad is set, watches are added without 
            // waiting for the rendering to finish 
            if (attrs.asynchronousLoad) {
                addWatches()
            } else {
                $timeout(addWatches);
            }

            scope.$on('$destroy', function() {
                element.selectpicker('destroy');
                if (magicContainer) {
                    magicContainer.remove();
                    magicContainer = null;
                    element.magicContainer = null;
                }
            });
        }
    };
});
}

// this select menu is actually a dkuBsSelect with a replacement for the dropdown menu element
app.directive('optionsDescriptions', function($timeout, Logger, $sanitize) {

    var delayed = function(f,x){return function(){$timeout(f,x)}};

    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            var lastOriginalDropDownHTML; // save dropdown menu state to manage updates
            var content;

            var clicked  = function(i) {
                $($('ul.dropdown-menu>li>a', element.magicContainer)[i]).trigger('click');
            };
            
            // Check if first item is a header
            const isHeader = firstItem => $('.text', firstItem).text() == "";

            // Get class from orginal dropdown lines and set it to current description lines
            const setOriginalLinesClass = () => { 
                const items = $('ul.dropdown-menu>li', element.magicContainer); // Lines of original dropdown
                const newLines = attrs.layout == "list"? $("li", content) : $('tr', content);
                let headerOffset = isHeader(items[0]) ? 1 : 0;

                for (let i = headerOffset; i < items.length; i++) {
                    $(newLines[i - headerOffset]).toggleClass('selected', $(items[i]).is('.selected'));
                    $(newLines[i - headerOffset]).toggleClass('hide', $(items[i]).is('.hide'));
                }
                // Show empty results line from original dropdown if it exists
                $('li.no-results', content).removeClass('hide'); 
            }

            var setPopup = function() {
                $("div.dropdown-menu.open", element.magicContainer).css("overflow-y", "scroll");
                var originalDropDownHTML = $('div.dropdown-menu', element.magicContainer).html();

                if (originalDropDownHTML != lastOriginalDropDownHTML) { // update the menu if any change was made in the original dropdown menu
                    var items = $('ul.dropdown-menu>li', element.magicContainer); // the labels of the original popup have class "text"
                    var disabled =  $('option', element).map(function(idx, op){return $(op).attr('disabled') == "disabled"}).get();
                    const hasHeader = isHeader(items[0]);

                    // Enable use of searchbox from original dropdown if it exists
                    const searchbox = $(element.magicContainer).find('input'); 
                    if (items.length == 1 && hasHeader) { // List is empty (there is only a placeholder header)
                        searchbox && searchbox.hide(); 
                    } else {
                        searchbox && searchbox.show() && searchbox.on('input propertychange', setOriginalLinesClass);
                    }
                    

                    if (content) {
                        content.remove();
                    }
                    if (items.length > 0) {
                        var descriptions = scope.$eval(attrs.optionsDescriptions)
                        if (!descriptions) {
                            Logger.error("No description provided for the select options");
                        }

                        if (attrs.layout == "list") {
                            content = $('<ul class="dku-bs-select-options-descriptions-listlayout">');

                            // Items descriptions begin after header if present
                            let headerOffset = hasHeader ? 1 : 0;

                            for (var i = headerOffset; i < items.length; i++) {
                                var label = $('.text', items[i]).text();
                                if (label && label.length) {
                                    var line = $('<li>').click((function(n){return function(){clicked(n)}; })(i));
                                    if (disabled[i]) {
                                        line.addClass('disabled');
                                    }
                                    line.html('<div class="main-label">'+sanitize(label)+'</div><div class="description">'+$sanitize(descriptions[i - headerOffset])+'</div>');
                                    content.append(line);
                                }
                            }
                        } else {
                            content = $('<table class="dku-bs-select-options-descriptions-tablelayout">');
                            for (var i = 0; i < items.length; i++) {
                                var label = $('.text', items[i]).text();
                                if (label && label.length) {
                                    var line = $('<tr>').click((function(n){return function(){clicked(n)}; })(i));
                                    if (disabled[i]) {
                                        line.addClass('disabled');
                                    }
                                    line.html('<td class="main-label"><div>'+sanitize(label)+'</div></td><td class="description">'+$sanitize(descriptions[i])+'</td>');
                                    content.append(line);
                                }
                            }
                        }
                    } else {
                        content = $('<div>').text('No available options');
                    }
                    $('div.dropdown-menu', element.magicContainer).append(content);
                    setOriginalLinesClass();
                    lastOriginalDropDownHTML = originalDropDownHTML;
                }
            };

            setTimeout(function() {
                element.next().find('>button').click(delayed(setPopup, 0));
                $(element.magicContainer).addClass('select-with-descriptions');
            }, 500);

            scope.$on('$destroy',function() {
                content = null;
            });
        }
    }
});


app.directive('optionsAnnotations', function($timeout, Logger) {

    var delayed = function(f,x){return function(){$timeout(f,x)}};

    return {
        restrict: 'A',
        require: ['select', 'ngModel'],
        link: function(scope, element, attrs) {
            var annotations;
            var updateAnnotations = function() {
                annotations = scope.$eval(attrs.optionsAnnotations);
                setPopup();
            };

            var annotate = function(elt, annotation) {
                if ($('.annotation', elt).length == 0) {
                    elt.append('<span class="annotation">'+(annotation||'')+'<span>');
                } else {
                    $('.annotation', elt).text(annotation||'');
                }
            };

            // var annotateAfter = function(elt, annotation) {
            //   var parent = elt.parent();
            //   if ($('.annotation', parent).length == 0) {
            //     elt.after('<span class="annotation"><span>');
            //   }
            //   $('.annotation', parent).text(annotation);
            // }

            var initMainLableAnnotation = function() {
                var options = $('option', element);
                var selectedValue = $(element).find(":selected").text();
                var mainLabel = element.next().find('>button>span:first-child'); //element indicating selected item

                //TODO perform options annotation in one or two DOM changes

                // when the select is first loaded, we don't know, from the selected value, which option is selected
                // if only one option has a value corresponding to the selected value, we can determine which one is selected
                var guess;
                options.each(function(idx, item) {
                    if ($(item).text() == selectedValue) {
                guess = (guess === void 0 || guess == annotations[idx]) ? annotations[idx] : null; //null if several items have the same value as the selected one but different annotations
                }
                });
                // if (guess != null) {
                //   annotateAfter(mainLabel, guess);
                // }

                //update mainLabel annotation
                // scope.$watch('selectedColumn', function(nv,ov) {
                //   var selectedIndex = $('option', element).get().indexOf($(element).find(":selected").get(0));
                //   annotateAfter(mainLabel, annotations[selectedIndex]);
                // });
            };

            var setPopup = function() {
                var items = $('ul.dropdown-menu>li:visible', element.magicContainer); // the labels of the original popup have class "text", select picker creates invisible items, don't know why
                if (items.length > 0) {// TODO check if update is needed
                    if (!annotations) {
                        Logger.error("No description provided for the select options");
                    }
                    items.each(function(idx, item) {
                        annotate($('a', item), annotations[idx]);
                    });
                }
            };

            updateAnnotations();
            scope.$watch(attrs.optionsAnnotations, updateAnnotations, true);

            setTimeout(function() {
                element.next().find('>button').click(delayed(setPopup));
                $(element.magicContainer).addClass('select-with-annotations');
                $(element).next().addClass('select-with-annotations');
                initMainLableAnnotation();
            }, 500);
        }
    }
});


app.directive('sortOrderButton', function(LocalStorage) {
    function get(orderName, def) {
        if (orderName === undefined || orderName === null) return def;
        return (LocalStorage.get("dssOrders") || {})[orderName];
    }
    function set(orderName, value) {
        if (orderName === undefined || orderName === null) return;
        //TODO cleanup mechanism
        var orders = LocalStorage.get("dssOrders") || {};
        orders[orderName] = value;
        LocalStorage.set("dssOrders", orders);
    }

    return {
        scope : {'val':'=value','rememberChoice':'=', 'disabled':'&'},
        restrict:'E',
        template: '<span style="display: inline-block;vertical-align:middle;font-size:0;">'
        +'<button class="{{buttonClass}}" onfocus="this.blur();" ng-click="change(!val)" ng-disabled="disabled()">'
        +'<i class="icon-sort-by-attributes" ng-show="!val" title="Ascending order"/>'
        +'<i class="icon-sort-by-attributes-alt" ng-show="val" title="Descending order"/>'
        +'</button>'
        +'</span>',

        link: function (scope, element, attrs) {
            var options = $.extend({
                buttonClass: 'btn btn--secondary'
            }, scope.$eval(attrs.sobOpt) || {});
            scope.buttonClass = options.buttonClass;
            scope.val = !!get(scope.rememberChoice, scope.val);
            scope.change = function(v) {
                scope.val = v;
                set(scope.rememberChoice, scope.val);
            };

            if (options.hasOwnProperty('disabledValue')) {
                scope.$watch(scope.disabled, function() {
                    if (scope.disabled()) {
                        scope.change(options.disabledValue);
                    }
                })
            }
        }
    };
});


app.directive('sortDropdown', function () {
    return {
        require: "?ngModel",
        link: function (scope, element, attrs,ngModel) {

            var rememberChoice = function() { return scope.$eval(attrs.rememberChoice); };

            if(rememberChoice()) {
                var cookieKey = 'sort_choice_'+rememberChoice();
                var lastChoice = getCookie(cookieKey);
                if(lastChoice != null) {
                    ngModel.$setViewValue(lastChoice);
                }
            }

            // Watch for any changes from outside the directive and refresh
            scope.$watch(attrs.ngModel, function () {

                if(rememberChoice()) {
                    var expires = 60*24*365;
                    var cookieKey = 'sort_choice_'+rememberChoice();
                    setCookie(cookieKey,ngModel.$viewValue,expires);
                }
            });
        }
    };
});

app.directive("progressBarWithThreshold", function() {
    return {
        scope : {
            success : '@',
            warning: '@',
            error : '@',
            neutral : '@',
            allowEmpty : '=',
            title: '@',
            active : '=',
            properOrder: '=',
            threshold: '@'
        },
        restrict : "ECA",
        template: '<div style="position: relative;">' +
            '<progress-bar class="progress-validity padbot0" success="{{success || 0}}" ' +
            'warning="{{warning || 0}}" error="{{error || 0}}" title="{{title}}" ng-attr-neutral="{{neutral || 0}}"></progress-bar>' +
            '<div class="progress-bar-with-threshold__threshold" style="left: calc({{threshold}}% - 8px)/* need to subtract half of component width */"></div>' +
            '</div>'
    }
});

app.directive("progressBar", function() {
    return {
        scope : {
            success : '@',
            warning: '@',
            error : '@',
            neutral : '@',
            allowEmpty : '=',
            title: '@',
            active : '=',
            properOrder: '='
        },
        restrict : "ECA",
        template: '<div class="progress mbot4" rel="tooltip" '+
        ' title="{{title}}" ng-class="{active: active}">' +
        '<div class="bar bar-info" ng-show="neutral >0" style="width:{{ humanized_neutral }}%"></div>' +

        '<div class="bar bar-success" ng-show="success >0" style="width:{{ humanized_success }}%"></div>' +
        '<div class="bar bar-warning" ng-if="properOrder" ng-show="warning > 0" style="width:{{ humanized_warning }}%"></div>' +
        '<div class="bar bar-danger" ng-show="error > 0" style="width:{{ humanized_error }}%"></div>' +
        '<div class="bar bar-warning" ng-if="!properOrder" ng-show="warning > 0" style="width:{{ humanized_warning }}%"></div>' +
        '</div>',
        link : function(scope, element, attrs) {
            var HUMAN_THRESHOLD = 5;
            scope.$watch(function(){return scope.success+scope.error+scope.warning+scope.neutral}, function(newValue, oldValue) {

                var error = isNaN(scope.error) ? 0 : parseFloat(scope.error);
                var warning = isNaN(scope.warning) ? 0 : parseFloat(scope.warning);
                var success = isNaN(scope.success) ? 0 : parseFloat(scope.success);
                var neutral = isNaN(scope.neutral) ? 0 : parseFloat(scope.neutral);

                scope.humanized_error = error > 0 ? Math.max(HUMAN_THRESHOLD, error): error
                scope.humanized_warning = warning > 0 ? Math.max(HUMAN_THRESHOLD, warning): warning;
                scope.humanized_success = success > 0 ? Math.max(HUMAN_THRESHOLD, success) : success;
                scope.humanized_neutral = neutral > 0 ? Math.max(HUMAN_THRESHOLD, neutral) : neutral;

                if (!scope.allowEmpty) {
                    var norm = (scope.humanized_success + scope.humanized_error + scope.humanized_warning + scope.humanized_neutral) / 100.;
                    scope.humanized_warning /= norm;
                    scope.humanized_success /= norm;
                    scope.humanized_error /= norm;
                    scope.humanized_neutral /= norm;
                }
            });
        }
    }
});


app.directive("exactSimpleProgressBar", function(){
    return {
        scope : {
            info : '=',
            success : '=',
            warning : '=',
            error : '='
        },
        template : '<div style="margin-bottom:4px" class="progress">'
            +'<div class="bar bar-info" ng-show="info>0" style="width:{{info*100}}%"></div>'
            +'<div class="bar bar-success" ng-show="success>0" style="width:{{success*100}}%"></div>'
            +'<div class="bar bar-warning" ng-show="warning>0" style="width:{{warning*100}}%"></div>'
            +'<div class="bar bar-error" ng-show="error>0" style="width:{{error*100}}%"></div>'
            +'</div>'

    }
});

})();
