(function(){
    'use strict';

    var app = angular.module('dataiku.directives.widgets', ['dataiku.filters', 'dataiku.services', 'ui.keypress', 'dataiku.common.lists']);

    /* "Generic" widgets */

    app.directive("plusIcon", function(){
        return {
            restrict : 'A',
            replace:true,
            template : '<span class="plus-icon">+</span>'
        }
    });
    app.directive("timesIcon", function(){
        return {
            restrict : 'A',
            replace:true,
            template : '<span style="font-size:1.3em; vertical-align: top">&times</span>'
        }
    });

    const addStarComponentBehaviour = ($ctrl, InterestWording) => {
        const toggle = (nextStatus) => {
            $ctrl.onToggle({ nextStatus });
        };

        $ctrl.isStarring = () => $ctrl.status;
        $ctrl.toggleStar = () => toggle(true);
        $ctrl.toggleUnstar = () => toggle(false);

        const { labels, tooltips } = InterestWording;
        $ctrl.labels = { ...labels };
        $ctrl.tooltips = { ...tooltips };
    };

    app.component('starInterest', {
        templateUrl: '/templates/widgets/star-interest.html',
        bindings: {
            status: '<',
            onToggle: '&',
            tooltipPosition: '@?',
        },
        controller: function(InterestWording) {
            const $ctrl = this;
            addStarComponentBehaviour($ctrl, InterestWording);
        },
    });

    app.component('starButton', {
        templateUrl: '/templates/widgets/star-button.html',
        bindings: {
            status: '<',
            onToggle: '&',
            nbStarred: '<',
            onShowUsersWithStar: '&',
            disabled: '<?',
        },
        controller: function(InterestWording) {
            const $ctrl = this;
            addStarComponentBehaviour($ctrl, InterestWording);

            $ctrl.isDisabled = () => !!($ctrl.disabled);
        },
    });

    const addWatchComponentBehaviour = ($ctrl, InterestWording, WatchInterestState) => {
        const toggle = (nextStatus) => {
            $ctrl.onToggle({ nextStatus });
        };

        const { values: { YES, ENO }, isWatching } = WatchInterestState;
        $ctrl.isWatching = () => isWatching($ctrl.status);
        $ctrl.toggleWatch = () => toggle(YES);
        $ctrl.toggleUnwatch = () => toggle(ENO);

        const { labels, tooltips } = InterestWording;
        $ctrl.labels = { ...labels };
        $ctrl.tooltips = { ...tooltips };
    };

    app.component('watchInterest', {
        templateUrl: '/templates/widgets/watch-interest.html',
        bindings: {
            status: '<',
            onToggle: '&',
            tooltipPosition: '@?',
        },
        controller: function(InterestWording, WatchInterestState) {
            const $ctrl = this;
            addWatchComponentBehaviour($ctrl, InterestWording, WatchInterestState);
        },
    });

    app.component('watchButton', {
        templateUrl: '/templates/widgets/watch-button.html',
        bindings: {
            status: '<',
            onToggle: '&',
            nbWatching: '<',
            onShowWatchingUsers: '&',
        },
        controller: function(InterestWording, WatchInterestState) {
            const $ctrl = this;
            addWatchComponentBehaviour($ctrl, InterestWording, WatchInterestState);
        },
    });

    app.directive("apiErrorAlert", function(){
        return {
            restrict : 'A',
            scope: {
                apiErrorAlert : '=',
                closable : '=',
                errorFoldable : '@',
                canBeUnexpected : '=?'
            },
            link : function($scope) {
                if ($scope.canBeUnexpected === undefined) {
                    $scope.canBeUnexpected = true;
                }
                $scope.options = {
                    canBeUnexpected : $scope.canBeUnexpected,
                    closable : $scope.closable,
                    errorFoldable : $scope.errorFoldable
                }
                $scope.open = true;
                $scope.reset = function() {
                    if ($scope.apiErrorAlert) {
                        $scope.apiErrorAlert.httpCode  = null;
                        $scope.apiErrorAlert.errorType = null;
                    }
                }

            },
            templateUrl : '/templates/api-error-alert.html'
        }
    });

    app.directive("sidekickAlert", function() {
        return {
            restrict : "E",
            transclude: true,
            templateUrl : "/templates/sidekick-alert.html"
        }
    });

    app.filter("detailedMessageOrMessage", function(){
        return function(input) {
            if (!input) return "";
            return input.detailedMessage || input.message;
        }
    });

    app.factory("disableElement", function(getBootstrapTooltipPlacement) {
        return function(element, disabled, message, position) {
            if (disabled === true) {
                element.addClass("disabled");
                element.prop("disabled", "disabled");
                element.css("position", "relative");
                element.css("pointer-events", "auto");
                var div = $('<div>').addClass("fh disabled-if-overlay").attr("title", message).appendTo(element);
                div.on('click', function () { return false; });
                if (message && message.length) {
                    div.tooltip({container: "body", placement: getBootstrapTooltipPlacement(position)});
                }
            } else if (disabled === false) {
                element.removeClass("disabled");
                element.css("pointer-events", null);
                element.prop("disabled", null);
                element.find('.disabled-if-overlay').tooltip('destroy').remove();
            }
        }
    });

    app.directive("disabledIfRo", function(disableElement){
        return {
            restrict : 'A',
            link : function(scope, element, attrs) {
                scope.$watch("!canWriteProject()", function(nv) {
                    if (nv === undefined) return;
                    return disableElement(element, nv, "You don't have write permissions for this project");
                });
            }
        }
    });

    app.directive("disabledIfProjectFolderRo", function($rootScope, disableElement, ProjectFolderContext) {
        return {
            restrict : 'A',
            link : function(scope, element, attrs) {
                scope.$watch(function() {
                    return !$rootScope.isDSSAdmin() && !$rootScope.canWriteInProjectFolder();
                }, function(nv) {
                    if (nv === undefined) return;
                    return disableElement(element, nv, "You don't have write contents permissions on this folder");
                });
            }
        }
    });

    app.directive("disabledIf", function(disableElement){
        return {
            restrict : 'A',
            link: function(scope, element, attrs) {
                scope.$watch(attrs.disabledIf, function(nv) {
                    return disableElement(element, nv, attrs.disabledMessage, attrs.disabledPosition);
                });
            }
        }
    });

    /*
        Sets element as disabled if disabledIfMessage is a non-empty string
        and displays that string as the tooltip
    */
    app.directive("disabledIfMessage", function(disableElement){
        return {
            restrict : 'A',
            scope : {
                disabledIfMessage: '='
            },
            link: function(scope, element, attrs) {
                scope.$watch('disabledIfMessage', function(nv) {
                    return disableElement(element, !!nv, scope.disabledIfMessage, attrs.disabledPosition);
                });
            }
        }
    });

    app.directive("disabledBlockIfRo", function(){
        return {
            restrict : 'A',
            link : function(scope, element, attrs) {
                scope.$watch("canWriteProject()", function(nv, ov) {
                    if (nv === false) {
                        element.addClass("disabled-block");
                    } else if( nv === true) {
                        element.removeClass("disabled-block");
                    }
                });
            }
        }
    });

    /* similar to ng-show but uses CSS visibility rather than display property (no movement in the page) */
    app.directive('visibleIf', function() {
        return {
            restrict: 'A',
            link: function(scope, element, attrs) {
                var toggle = function (show){
                    $(element).css('visibility', show ? 'visible': 'hidden');
                };
                toggle(scope.$eval(attrs.visibleIf));
                scope.$watch(attrs.visibleIf, toggle);
            }
        };
    });

    /* API error that displays as an alert block */
    app.directive('blockApiError', function() {
        return {
            templateUrl: '/templates/block-api-error.html',
            replace: false,
            restrict: 'ECA',
            link: function(scope, element) {
              // can be used by children to report their error.
              scope.setError = setErrorInScope.bind(scope);
            }
        };
    });

     app.directive("dssObjectLink", function(StateUtils, SmartId, TAGGABLE_TYPES) {
        return {
            templateUrl : '/templates/widgets/taggable-object-ref.html',
            scope: {
                item: '=',
                moveToTargetProject: '='
            },
            link: function(scope) {
                scope.StateUtils = StateUtils;
                scope.SmartId = SmartId;
                scope.isLinkableDssObject = item => TAGGABLE_TYPES.includes(item.objectType);
                scope.isTensorboardFuture = item => item.objectType === 'WEB_APP' && item.objectId.startsWith('TENSORBOARD_');
            }
        }
    });

    app.directive("tlUser", function($rootScope){
        return {
            template : '<span class="who"> <a href="/profile/{{item.user}}/">{{item.user == rootScope.appConfig.user.login ? \"You\" : (item.details.userDisplayName ? item.details.userDisplayName : item.user)}}</a></span>',
            scope : false,
            link : function($scope) {
                $scope.rootScope= $rootScope;
            }
        }
    });

    app.directive('metadataObjectModal', function($stateParams, DataikuAPI){
        return {
            scope : true,
            link : function($scope, element, attrs) {
                if ($scope.metadataObjectParent.customMeta && $scope.metadataObjectParent.customMeta.kv) {
                    $scope.localObject = angular.copy($scope.metadataObjectParent.customMeta.kv);
                } else {
                    $scope.localObject = { };
                }
                $scope.save = function() {
                    $scope.metadataObjectParent.customMeta = { 'kv' : angular.copy($scope.localObject) };
                    $scope.$emit("metadataObjectUpdated");
                    $scope.dismiss();
                };
            }
        }
    });

     app.directive('metadataObjectLink', function(CreateModalFromTemplate){
        return {
            restrict : 'AE',
            scope : {
                metadataObjectParent : '='
            },
            template: '<div class="metadata-object-link"><pre class="small-pre">{{metadataObjectParent.customMeta.kv | json}}</pre><button title="Object metadata" class="btn btn--secondary" ng-click="openModal()"><i class="icon-superscript" />&nbsp;Edit</button></div>',
            link : function($scope, element, attrs) {
                $scope.openModal = function(){
                    CreateModalFromTemplate("/templates/widgets/metadata-object-modal.html", $scope,
                        null, null);
                }
            }
        }
    });

     app.directive('overrideTableModal', function($stateParams, DataikuAPI){
        return {
            scope : true,
            // compile/pre to execute before listForm's link (for transcope)
            compile : function(){ return { pre: function($scope, element, attrs) {
                $scope.simplifiedObjectToOverride = {};
                $scope.$watch("objectToOverride", function(nv, ov){
                    if (nv) {
                        $scope.simplifiedObjectToOverride = angular.copy($scope.objectToOverride);
                        $.each($scope.simplifiedObjectToOverride, function(k, v) {
                            if (k.indexOf("$") == 0) {
                                delete $scope.simplifiedObjectToOverride[k];
                            }
                        });
                        delete $scope.simplifiedObjectToOverride["overrideTable"];
                        delete $scope.simplifiedObjectToOverride["change"];
                        delete $scope.simplifiedObjectToOverride["versionTag"];
                    }
                }, true);
                if ($scope.overrideTableParent.overrideTable) {
                    $scope.localTable = angular.copy($scope.overrideTableParent.overrideTable);
                } else {
                    $scope.localTable = { "overrides" : []};
                }
                $scope.save = function() {
                    if ($scope.localTable.overrides.length > 0) {
                        $scope.overrideTableParent.overrideTable = angular.copy($scope.localTable)
                    } else {
                        $scope.overrideTableParent.overrideTable = null;
                    }
                    $scope.$emit("overrideTableUpdated");
                    $scope.dismiss();

                };
                $scope.getValue = (function(override) {
                    DataikuAPI.variables.expandExpr($stateParams.projectKey, override.expr).success(function(data){
                        override.$$computedValue = data.id;
                    }).error(setErrorInScope.bind(this));
                }).bind($scope); // bind on parent scope
            } }; }
        }
    });

    app.directive('overrideTableBtnLink', function(CreateModalFromTemplate){
        return {
            scope : {
                overrideTableParent : '=',
                objectToOverride : '='
            },
            template: '<div class="override-table-link"><pre class="small-pre">{{overrideDesc}}</pre><button title="Override variables" class="btn btn--secondary" ng-click="openModal()"><i class="icon-superscript" />&nbsp;Edit</button></div>',
            link : function($scope, element, attrs) {
                $scope.overrideDesc = '';
                $scope.$watch('overrideTableParent.overrideTable', function(nv) {
                    if ( nv == null) return;
                    var desc = '';
                    if ( $scope.overrideTableParent.overrideTable.overrides != null ) {
                        $scope.overrideTableParent.overrideTable.overrides.forEach(function(override) {
                            desc = desc + override.path + " ";
                        });
                    }
                    $scope.overrideDesc = desc;
                }, true);
                $scope.openModal = function(){
                    CreateModalFromTemplate("/templates/widgets/override-table-modal.html", $scope,
                        null, null);
                }
            }
        }
    });
     app.directive('overrideTableLink', function(CreateModalFromTemplate){
        return {
            scope : {
                overrideTableParent : '=',
                objectToOverride : '='
            },
            template: '<a title="Override variables" ng-class="{\'override-table-link\': true, \'overriden\': overrideTableParent.overrideTable.overrides.length}" ng-click="openModal()"><i class="icon-superscript" /></a>',
            link : function($scope, element, attrs) {
                $scope.openModal = function(){
                    CreateModalFromTemplate("/templates/widgets/override-table-modal.html", $scope,
                        null, null);
                }
            }
        }
    });
    app.directive('dkuIndeterminate', function() {
        return {
            restrict: 'A',
            link: function(scope, element, attributes) {
                scope.$watch(attributes.dkuIndeterminate, function(value) {
                    element.prop('indeterminate', !!value);
                });
            }
        };
    });

    app.directive('validFile',function(){
        return {
            require:'ngModel',
            link:function(scope, el, attrs, ngModel) {
                el.bind('change', function() {
                    var val = 'multiple' in attrs ? this.files : this.files[0];
                    scope.$apply(function() {
                        ngModel.$setViewValue(val);
                        ngModel.$render();
                    });
                });
            }
        };
    });


    app.directive('sparkline', function() {
        return {
            scope: {
                sparkline: '='
            },
            link: function(scope, element) {
                const data = scope.sparkline;
                const rect = element[0].parentElement.getBoundingClientRect();
                const x = d3.scale.linear().domain([0, data.length-1]).range([0, rect.width]);
                const y = d3.scale.linear().domain([0, d3.max(data) || 0]).range([rect.height, 4]);
                const line = d3.svg.line().x((d, i) => x(i)).y(d => y(d || 0));

                d3.select(element[0]).html("")
                    .append("svg:svg")
                    .append("svg:path")
                    .attr("d", line(data))
                    .attr("stroke-width", "2px")
                    .attr("stroke", "#add8e6")
                    .attr("fill", "#add8e6")
                    .attr("fill-opacity", .3);
            }
        }
    });

    app.directive('weekDaysPicker', [function(){
        return {
            scope : {
                selection:'=ngModel',
                onChange:'&?',
            },
            template: `<div class="weekdays-picker">
                <span ng-repeat="day in days" ng-click="toggle(day)" ng-class="[{selected: hasSelected(day)}]">{{day[0]}}</span>
            </div>`,
            link : function($scope) {
                $scope.days = [...WEEKDAYS];

                $scope.hasSelected = (day) => {
                    return $scope.selection.includes(day);
                };

                $scope.toggle = (day) => {
                    if($scope.selection.includes(day)) {
                        $scope.selection = $scope.selection.filter(s => s !== day);
                    } else {
                        $scope.selection = [...$scope.selection, day];
                    
                    }
                    if($scope.onChange) {
                        $scope.onChange($scope.selection);
                    }
                };

                $scope.$watch('selection', () => {
                    if(!Array.isArray($scope.selection)) {
                        $scope.selection = [];
                    }
                });
            }
        }
    }]);

    app.directive('inlineDateRangePicker', ['$timeout', function($timeout){
        return {
            scope : {
                from:'=',
                to:'=',
                tz:'=',
                onChange:'&?',
            },
            template: `<fieldset>
                    <div class="fieldLabel">From</div>
                    <input ng-model="from" ng-blur="onFromBlur()" type="date" name="dateFrom" style="width: 106px" />
                    <input ng-model="from" ng-blur="onFromBlur()" type="time" name="timeFrom" step="1" ng-style="timeInputStyle" />
                </fieldset>
                <fieldset>
                    <div class="fieldLabel">To</div>
                    <input ng-model="to" ng-blur="onToBlur()" type="date" name="dateTo" style="width: 106px" />
                    <input ng-model="to" ng-blur="onToBlur()" type="time" name="timeTo" step="1" ng-style="timeInputStyle" />
                </fieldset>
                <fieldset>
                    <div class="fieldLabel">Timezone</div>
                    <select
                        ng-model="tz"
                        ng-options="item as item for item in timezone_ids"
                    />
            </fieldset>`,
            link : function($scope) {
                $scope.timezone_ids = [
                    "UTC", "Africa/Addis_Ababa", "Africa/Harare", "Africa/Lagos",
                    "America/Adak", "America/Argentina/Buenos_Aires", "America/Bogota", "America/Chicago", "America/Costa_Rica",
                    "America/Dawson_Creek", "America/Denver", "America/Guadeloupe", "America/Halifax", "America/Juneau", "America/Lima",
                    "America/Los_Angeles", "America/New_York", "America/Noronha", "America/Santiago", "America/Sao_Paulo", "America/St_Johns",
                    "Asia/Bangkok", "Asia/Calcutta", "Asia/Dhaka", "Asia/Dubai", "Asia/Hong_Kong", "Asia/Jakarta", "Asia/Kabul",
                    "Asia/Karachi", "Asia/Kathmandu", "Asia/Manila", "Asia/Seoul", "Asia/Singapore", "Asia/Tehran", "Asia/Tokyo",
                    "Atlantic/Azores", "Atlantic/Cape_Verde", "Australia/Adelaide", "Australia/Darwin", "Australia/Eucla", "Australia/Lord_Howe", "Australia/Sydney",
                    "Europe/Athens", "Europe/Istanbul", "Europe/Lisbon", "Europe/London", "Europe/Moscow", "Europe/Paris",
                    "Indian/Cocos", "Pacific/Apia", "Pacific/Auckland", "Pacific/Chatham", "Pacific/Enderbury", "Pacific/Gambier", "Pacific/Honolulu",
                    "Pacific/Kiritimati", "Pacific/Marquesas", "Pacific/Niue", "Pacific/Noumea", "Pacific/Pitcairn", "Pacific/Wallis"
                ];

                // Firefox always displays the milliseconds in the time picker, so give more space to the time picker
                $scope.timeInputStyle = { 'width': (navigator.userAgent.includes("Gecko/") ? '144px' : '111px') };

                $scope.$watch("to", (nv, ov) => {
                    if (ov && !nv) {
                        // Trigger an onChange event when user click on the "clear" button
                        // (side-effect: also trigger an event when user enters an invalid date)
                        $scope.onChange();
                    }
                });

                $scope.$watch("from", (nv, ov) => {
                    if (ov && !nv) {
                        // Trigger an onChange event when user click on the "clear" button
                        // (side-effect: also trigger an event when user enters an invalid date)
                        $scope.onChange();
                    }
                });

                $scope.$watch("tz", () => {
                    $scope.onChange();
                });

                $scope.onFromBlur = () => {
                    if ($scope.from && $scope.to) {
                        if ($scope.from.getTime() > $scope.to.getTime()) {
                            $scope.to = new Date($scope.from.getTime());
                        }
                    }
                    $scope.onChange();
                };

                $scope.onToBlur = () => {
                    if ($scope.from && $scope.to) {
                        if ($scope.from.getTime() > $scope.to.getTime()) {
                            $scope.from = new Date($scope.to.getTime());
                        }
                    }
                    $scope.onChange();
                };
            }
        }
    }]);


    app.directive('chartAlphanumFacet', function($stateParams, $timeout, $rootScope, $filter, DataikuAPI, Debounce){
        return {
            templateUrl :'/templates/simple_report/alphanum_facet.html',
            restrict: 'E',
            scope : {
                values:'=',
                uniqueRowCount:'=?',
                onChange:'&?',
                folded:'='
            },

            link : function($scope) {
                $scope.filteredValues = [];

                function reloadValues() {
                    $scope.filteredValues = [];
                    let q = ($scope.query || "").toLowerCase();
                    if($scope.values) {
                        for(let k in $scope.values) {
                            let v = $scope.values[k];
                            if(!v.label) {
                                v.label = '';
                            }
                            if(v.label.toLowerCase().indexOf(q)!=-1) {
                                $scope.filteredValues.push(v);
                            }
                        }
                        $scope.allSelected = true;
                        for(let k in $scope.filteredValues) {
                            let item = $scope.filteredValues[k];
                            $scope.allSelected = $scope.allSelected && item.included;
                        }

                        // only show unique row count when we aren't filtering by query
                        if ($scope.uniqueRowCount) {
                            const unusedCount = $scope.values.length === $scope.filteredValues.length ? $scope.uniqueRowCount - $scope.values.length : 0;

                            if (unusedCount) {
                                $scope.filteredValues.push({
                                    unusedCount: unusedCount
                                });
                            }
                        }
                    }
                }

                $scope.setAll = function(val) {
                    for(let k in $scope.filteredValues) {
                        let item = $scope.filteredValues[k];
                        item.included = val;
                    }
                    $scope.changed();
                };

                $scope.changed = function() {
                    $scope.allSelected = true;
                    for(let k in $scope.filteredValues) {
                        let item = $scope.filteredValues[k];
                        $scope.allSelected = $scope.allSelected && item.included;
                    }
                    $scope.onChange();
                };

                $scope.$watch("query",Debounce().withScope($scope).withDelay(50,200).wrapWatch(function() {
                    reloadValues();
                }));

                $scope.$watch("widgetHeight",function() {
                    $scope.$broadcast("reflow");
                });
                $scope.$watch("folded",function() {
                    $scope.$broadcast("reflow");
                });

                $scope.$watch("values",function(nv) {
                    if(!nv)return;
                    reloadValues();
                    $scope.widgetHeight=Math.min(Math.max(50,22*nv.length),220)+5;
                },false);

            }
        }
    });

    app.directive('executionPlan', function() {
        return {
            restrict: "AE",
            scope: {
                executionPlan: '=ngModel'
            },
            templateUrl: '/templates/widgets/execution-plan.html',
            link: function(scope, element, attrs) {
                //nothing to do for now...
            }
        };
    });

    // SO : http://stackoverflow.com/questions/18368485/angular-js-resizable-div-directive
    app.directive('resizer', function($document,Throttle,$rootScope) {
        return function($scope, $element, $attrs) {

            $element.addClass('content-resizer');

            $element.on('mousedown', function(event) {
                $element.parent().addClass("resizing");
                event.preventDefault();
                $document.on('mousemove', mousemove);
                $document.on('mouseup', mouseup);
            });

            function mousemove(event) {

                if ($attrs.resizer == 'vertical') {
                    // Handle vertical resizer
                    let x = event.pageX;

                    if ($attrs.resizerMax && x > $attrs.resizerMax) {
                        x = parseInt($attrs.resizerMax);
                    }

                    $element.css({
                        left: x + 'px'
                    });

                    $($attrs.resizerLeft).css({
                        width: x + 'px'
                    });
                    $($attrs.resizerRight).css({
                        left: (x + parseInt($attrs.resizerWidth)) + 'px'
                    });

                } else {
                    // Handle horizontal resizer
                    let y = window.innerHeight - event.pageY;

                    $element.css({
                        bottom: y + 'px'
                    });

                    $($attrs.resizerTop).css({
                        bottom: (y + parseInt($attrs.resizerHeight)) + 'px'
                    });
                    $($attrs.resizerBottom).css({
                        height: y + 'px'
                    });
                }
            }

            function mouseup() {
                $document.unbind('mousemove', mousemove);
                $document.unbind('mouseup', mouseup);
                $element.parent().removeClass("resizing");
                $rootScope.$broadcast('reflow');
            }
        };
    });

    app.directive('fatTable', function($compile,$rootScope,Debounce,$http,$templateCache) {

         return {
            restrict : 'A',
            scope : {
                rows:'=',
                as : '@',
                rowIndexAs:'@',
                headers:'=',
                columnWidths : '=',
                headerTemplate:'@',
                cellTemplate:'@',
                printNewLinesAsSymbols:'@',
                rowHeight:'=',
                headerHeight : '=',
                digestChildOnly:'=?'
            },
            link : function(scope, element, attrs) {
                $http.get(scope.cellTemplate, {cache: $templateCache}).then(function(resp) {
                    let cellTemplateHTML = resp.data;
                    $http.get(scope.headerTemplate, {cache: $templateCache}).then(function(resp) {
                        let headerTemplateHTML = resp.data;
                        // We don't use Debounce here because it always triggers a full digest cycle!
                        var digestTimeout = undefined;
                        function debouncedDigestCycle() {
                            if(digestTimeout === undefined) {
                                digestTimeout = setTimeout(function() {
                                    digestTimeout = undefined;
                                    if(scope.digestChildOnly) {
                                        var elmScope = element.scope();
                                        if(elmScope) {
                                            // Partial digestion
                                            elmScope.$digest();
                                        }
                                    } else {
                                        // Full digestion
                                        $rootScope.$digest();
                                    }
                                },10);
                            }
                        }

                        function cleanDOM(div) {
                            // Destroy the cell's __fat_scope__
                            var fs = div.__fat_scope__;
                            if(fs) {
                                fs.$destroy();
                            }
                            div.__fat_scope__ = undefined;
                            // Make sure there is no refs to the scope in JQuery's cache
                            $(div).data('$scope',null);
                        }

                        function buildModel() {
                           var tableData = new fattable.SyncTableModel();
                           tableData.getCellSync = function(i,j) {
                               var arr = scope.rows;
                               if(!arr || !arr.length || i<0 || i>=arr.length) {
                                   return {i:i,j:j,v:undefined,t:'c'};
                               } else {
                                   var row = arr[i];
                                   if(!row || !row.length || j < 0 || j >=row.length) {
                                        return {i:i,j:j,v:undefined,t:'c'};
                                   }
                                   return {i:i,j:j,v:row[j],t:'c'};
                               }
                           };
                           tableData.getHeaderSync = function(i) {
                               var arr = scope.headers;
                               if(!arr || !arr.length || i<0 || i>=arr.length) {
                                   return {i:i,v:undefined,t:'h'};
                               } else {
                                  return {i:i,v:arr[i],t:'h'};
                               }
                           };
                           return tableData;
                        }

                        var livingCells = [];

                        function buildPainter() {
                           var painter = new fattable.Painter();

                           var prepareElement = function(template) {
                              return function(cellDiv, data) {
                                  if(!cellDiv.__fat_scope__) {
                                      var elementScope = element.scope();
                                      if(elementScope) {
                                          cellDiv.__fat_scope__ = elementScope.$new();
                                          $(cellDiv).append($compile(template)(cellDiv.__fat_scope__));
                                      }
                                  }
                                  if(cellDiv.__fat_scope__) {
                                      let v = data.v;
                                      if (scope.printNewLinesAsSymbols && (typeof v === 'string' || v instanceof String)) {
                                          v = v.replace(/(\r\n|\n)/g, "¶");
                                      }
                                      cellDiv.__fat_scope__[attrs.as] = v;
                                      if(attrs.rowIndexAs && data.t == 'c') {
                                            cellDiv.__fat_scope__[attrs.rowIndexAs] = data.i;
                                      }
                                      debouncedDigestCycle();
                                  }
                               };
                           };

                           painter.fillCell = prepareElement(cellTemplateHTML);
                           painter.fillHeader = prepareElement(headerTemplateHTML);

                           painter.fillCellPending = function(cellDiv, data) {
                               cellDiv.textContent = "";
                               cellDiv.className = "pending";
                           };

                           painter.fillHeaderPending = function(cellDiv, data) {
                              cellDiv.textContent = "";
                              cellDiv.className = "pending";
                           };

                           painter.setupCell = function(div) {
                              livingCells.push(div);
                           };

                           painter.setupHeader = painter.setupCell;

                           painter.cleanUpCell = function(div) {
                               livingCells = livingCells.filter(function(x) {
                                   return x!=div;
                               });
                               cleanDOM(div);
                           };

                           painter.cleanUpHeader = painter.cleanUpCell;

                           return painter;
                        }
                        var oldTable;

                        function redraw() {
                            if(oldTable) {
                                oldTable.cleanUp();
                                // bug in fattable : cleanUp() at line 702 is not checking the variable holding the scroll proxy, so
                                // the scroll elements still try to call onScroll (until the next DOM rebuild where they're removed)
                                if (oldTable.scroll != null) {
                                    oldTable.scroll.onScroll = function() {}; // NOSONAR: noop
                                }
                            }
                            const table = fattable({
                                "container": element[0],
                                "model": buildModel(),
                                "nbRows": scope.rows? scope.rows.length:0,
                                "rowHeight": scope.rowHeight,
                                "headerHeight": scope.headerHeight,
                                "painter": buildPainter(),
                                "columnWidths": scope.columnWidths
                            });
                            if(oldTable && oldTable.scroll) {
                                var y = oldTable.scroll.scrollTop;
                                var x = oldTable.scroll.scrollLeft;
                                table.scroll.setScrollXY(x,y);
                            }
                            oldTable = table;
                        }

                       var debouncedRedraw = Debounce().withDelay(50,200).wrap(redraw);
                       scope.$watch('rows', debouncedRedraw, false);
                       scope.$watch('headers', debouncedRedraw, false);
                       $(window).on('resize', debouncedRedraw);

                       element.scope().$on("reflow", debouncedRedraw);

                       scope.$on("$destroy", function () {
                           if(oldTable) {
                                oldTable.cleanUp();
                                oldTable=null;
                           }
                           for(var i = 0 ; i < livingCells.length ; i++) {
                                cleanDOM(livingCells[i]);
                           }
                           livingCells = [];
                           $(window).off("resize", debouncedRedraw);
                       });
                    });
               });
            }
         };
    });

    app.directive('registerModelForForm', function () {
        return {
            scope: {form: '=registerModelForForm'},
            require: 'ngModel',
            controller: function ($element,$scope) {
                var ngModel = $element.controller('ngModel');
                $scope.form.$addControl(ngModel);
            }
        };
    });

    app.directive('fatRepeat', function($compile, $rootScope, $timeout, Debounce, FatTouchableService, FatDraggableService) {

        return {
            transclude:true,
            scope:{
                fatRepeat:'=', // Array
                fatDraggable:'=?', // If items should be draggable
                fatDraggableOnDrop:'=?', // Callback called when drag ends
                as:'@', // Name of each item
                rowHeight:'=', // Height of each row
                colWidth: '=?', // width of each column
                digestChildOnly:'=?', // If true, doesn't trigger a full digest cycle each time a cell updated, but call
                // $digest() on child scope only. It's generally MUCH faster, but you need to make sure
                // that your watches have no side effects on parent scopes.
                initScope: '=?', // item scope init function
                tableModel: '=?', // Custom fattable Model
                inForm:'=?',
                layoutMode: '@?', //one of row, mosaic (or potentially left blank for list mode)
                listPadding: '=?', // padding to be introduced before first and after last item
                fTrackTable: '&', // to allow containers to control the scroll or other aspect of the underlying table
                disableScrollTo: '@', // Disable scrollToLine event
                enableAsync: '=?',
                nbRows: '=?',
                chunkSize: '=?',
                getRowChunk: '=?',
                pageFromData: '=?'
            },
            restrict:'A',
            compile: function(_element,_attrs,transclude) {

                return function(scope, element, attrs) {
                    const HORIZ_SCROLL_H = 1;
                    const VERT_SCROLL_W = 8;


                    element.addClass(scope.layoutMode ? 'fat-row' : 'fat-repeat');
                    if (scope.layoutMode=="row") {
                        $(element).css('height', (parseInt(scope.rowHeight,10) + HORIZ_SCROLL_H).toString() + 'px');
                    }

                    // We don't use Debounce here because it always triggers a full digest cycle!
                    var digestTimeout = undefined;
                    function debouncedDigestCycle() {
                        if(digestTimeout === undefined) {
                            digestTimeout = setTimeout(function() {
                                digestTimeout = undefined;
                                if(scope.digestChildOnly) {
                                    var elmScope = element.scope();
                                    if(elmScope) {
                                        // Partial digestion
                                        elmScope.$digest();
                                    }
                                } else {
                                    // Full digestion
                                    $rootScope.$digest();
                                }
                            },10);
                        }
                    }

                    function cleanDOM(div) {
                        // Destroy the cell's __fat_scope__
                        var fs = div.__fat_scope__;
                        if(fs) {
                            fs.$destroy();
                        }
                        div.__fat_scope__ = undefined;
                        // Make sure there is no refs to the scope in JQuery's cache
                        $(div).data('$scope',null);
                    }

                    function buildModel() {
                        if (scope.tableModel) {
                            return scope.tableModel.call(scope);
                        }
                        if (scope.enableAsync) {
                            const asyncTableData = new fattable.PagedAsyncTableModel();
                            asyncTableData.fetchCellPage = (pageName, cb) => {
                                var promise = scope.getRowChunk(pageName);
                                promise.then(response => {
                                    cb(scope.pageFromData(pageName, response.data));
                                });
                            };
                            asyncTableData.cellPageName = (row, col) => {
                                return Math.trunc(row / Math.max(1, scope.chunkSize));
                            };
                            if (scope.fatRepeat && scope.fatRepeat.length > 0) {
                                var initialPageName = asyncTableData.cellPageName(0, 0);
                                const initialPage = scope.pageFromData(initialPageName, {items: [...scope.fatRepeat]});
                                asyncTableData.pageCache.set(initialPageName, initialPage);
                            }
                            return asyncTableData;
                        }
                        const tableData = new fattable.SyncTableModel();

                        tableData.getCellSync = function(i,j) {
                            const arr = scope.fatRepeat;
                            const idx = i*scope.numColumns + j;
                            if(!arr || idx<0 || idx>=arr.length) {
                                return undefined;
                            }
                            return arr[idx];
                        };
                        return tableData;
                    }

                    var livingCells = [];

                    function buildPainter() {
                        var painter = new fattable.Painter();
                        painter.fillCell = function(cellDiv, data) {
                            cellDiv.className = '';
                            if(!cellDiv.__fat_scope__) {
                                var elementScope = element.scope();
                                if(elementScope) {
                                    cellDiv.__fat_scope__ = elementScope.$new();
                                    transclude(cellDiv.__fat_scope__,function(clone) {
                                        $(cellDiv).append(clone);
                                    });
                                }
                            }
                            if(cellDiv.__fat_scope__) {
                                cellDiv.__fat_scope__[attrs.as] = data;
                                debouncedDigestCycle();
                                if (scope.initScope) {
                                    scope.initScope(cellDiv.__fat_scope__);
                                }
                            }
                        };
                        painter.fillCellPending = function(cellDiv, data) {
                            cellDiv.className = "fat-repeat-pending-row";
                        };
                        painter.setupCell = function(div) {
                            livingCells.push(div);
                        };
                        painter.cleanUpCell = function(div) {
                            livingCells = livingCells.filter(function(x) {
                                return x!=div;
                            });
                            cleanDOM(div);
                        };
                        return painter;
                    }

                    var oldTable;

                    function redraw() {
                        if (oldTable) {
                            oldTable.cleanUp();
                        }
                        let fatRepeatLength = scope.fatRepeat? scope.fatRepeat.length:0;
                        if (scope.layoutMode=="row") {
                            // row mode
                            scope.numColumns = fatRepeatLength;
                            scope.numRows = 1;
                        }
                        else if (scope.layoutMode=="mosaic") {
                            scope.numColumns = Math.floor((element.innerWidth() - VERT_SCROLL_W)/ scope.colWidth);
                            scope.numRows = Math.ceil(fatRepeatLength / scope.numColumns);
                        }
                        else if (scope.enableAsync) {
                            scope.numRows = scope.nbRows;
                            scope.numColumns = 1;
                        } else {
                            scope.numRows = fatRepeatLength;
                            scope.numColumns = 1;
                        }

                        if (scope.listPadding && scope.layoutMode != "row") { // pad the end via a whole row
                            scope.numRows++
                        }

                        let columnWidths = [element.width() - 11];

                        if (['mosaic','row'].includes(scope.layoutMode)) {
                            columnWidths = Array.from({length: scope.numColumns}, (v, i) => scope.colWidth);
                            if (columnWidths.length>0  && scope.layoutMode=="row" && scope.listPadding) {
                                if (typeof scope.listPadding === 'string') scope.listPadding = parseInt(scope.listPadding, 10);
                                columnWidths[columnWidths.length-1] += 2 * scope.listPadding;
                            }
                        }

                        var table = fattable({
                            "container": element[0],
                            "model": buildModel(),
                            "nbRows": scope.numRows,
                            "rowHeight": scope.rowHeight,
                            "headerHeight": 0,
                            "painter": buildPainter(),
                            "columnWidths": columnWidths
                        });

                        if (attrs.fatDraggable !== undefined && typeof scope.fatDraggableOnDrop === 'function') {
                            FatDraggableService.setDraggable({
                                element: table.container,
                                onDrop: scope.fatDraggableOnDrop,
                                axis: 'y',
                                scrollBar: table.scroll,
                                classNamesToIgnore: ['icon-sort-by-attributes', 'sort-indication', 'pull-right']
                            })

                            // We have to set the fat-draggable__item class to an inner child because fattable re-use
                            // the same cell div for different items
                            for (let cellKey in table.cells) {
                                if (!table.cells.hasOwnProperty(cellKey)) continue;
                                let cellDiv = table.cells[cellKey];
                                let cellDivColumnHeader = cellDiv && cellDiv.children && cellDiv.children[0];
                                cellDivColumnHeader && cellDivColumnHeader.classList.add('fat-draggable__item');
                            }
                        }

                        if (isTouchDevice()) {
                            if (oldTable && typeof(scope.unsetTouchable) === "function") {
                                scope.unsetTouchable();
                            }
                            scope.unsetTouchable = FatTouchableService.setTouchable(scope, element, table);
                        }

                        if (oldTable) {
                            var y = oldTable.scroll.scrollTop;
                            var x = oldTable.scroll.scrollLeft;
                            table.scroll.setScrollXY(x,y);
                        }

                        oldTable = table;

                        if (scope.fTrackTable) scope.fTrackTable({table:oldTable});

                        if (scope.layoutMode=="row" && scope.listPadding) {
                            $(element).find('.fattable-viewport').css('padding-left', scope.listPadding);
                        }

                        if (scope.inForm) {
                            _element.find('[ng-model]').each((idx, el) => {
                                scope.inForm.$addControl(angular.element(el).controller('ngModel'));
                            });
                        }
                    }

                    scope.$on('moveScroll', (event, x, y) => {
                        oldTable.scroll.setScrollXY(oldTable.scroll.scrollLeft + x, oldTable.scroll.scrollTop + y);
                    });

                    scope.$watchCollection('fatRepeat', redraw);

                    scope.$on('redrawFatTable', redraw);
                    scope.$on('repaintFatTable', function () { debouncedRedraw(); }); //works better wrapped in a fnc!

                    if (scope.disableScrollTo === undefined) {
                        scope.$on('scrollToLine', function(e, lineNum) {
                            if (oldTable) {
                                let nbRowsVisible = oldTable.h / oldTable.rowHeight; // we need the float value
                                let firstVisibleRow = oldTable.scroll.scrollTop / oldTable.rowHeight; // we need the float value
                                let x = oldTable.scroll.scrollLeft;
                                if (lineNum == -1) {
                                    let y = oldTable.nbRows * oldTable.rowHeight;
                                    oldTable.scroll.setScrollXY(x, y);
                                } else if (lineNum <= firstVisibleRow) {
                                    let y = Math.max(lineNum, 0) * oldTable.rowHeight;
                                    oldTable.scroll.setScrollXY(x,y);
                                } else if (lineNum >= firstVisibleRow + nbRowsVisible - 1) {
                                    let y = (Math.min(lineNum, oldTable.nbRows) + 1) * oldTable.rowHeight - oldTable.h;
                                    oldTable.scroll.setScrollXY(x,y);
                                }
                            }
                        });
                    }

                    var debouncedRedraw = Debounce().withDelay(50,200).wrap(redraw);
                    $(window).on('resize', debouncedRedraw);

                    element.scope().$on("reflow", debouncedRedraw);

                    scope.$on("$destroy", function () {
                        if(oldTable) {
                            oldTable.cleanUp();
                            oldTable=null;
                        }
                        for(var i = 0 ; i < livingCells.length ; i++) {
                            cleanDOM(livingCells[i]);
                        }
                        livingCells = [];
                        $(window).off("resize", debouncedRedraw);
                    });


                };
            }
        };
    });

    app.directive('spinner', function() {
        return {
            template: '<div class="spinnerContainer"></div>',
            replace: true,
            restrict: 'E',
            link: function(scope, element, attrs) {
                var opts = {
                  lines: 6, // The number of lines to draw
                  length: 0, // The length of each line
                  width: 10, // The line thickness
                  radius: 10, // The radius of the inner circle
                  corners: 1, // Corner roundness (0..1)
                  rotate: 0, // The rotation offset
                  color: '#fff', // #rgb or #rrggbb
                  speed: attrs.speed || 1, // Rounds per second
                  trail: 60, // Afterglow percentage
                  shadow: false, // Whether to render a shadow
                  hwaccel: false, // Whether to use hardware acceleration
                  className: 'spinner', // The CSS class to assign to the spinner
                  zIndex: 2e9, // The z-index (defaults to 2000000000)
                  top: 'auto', // Top position relative to parent in px
                  left: 'auto' // Left position relative to parent in px
              };
              var spinner = new Spinner(opts).spin(element[0]);
          }
       };
    });

    app.directive('formTemplate', function(){
        return {
            templateUrl: '/templates/form-template.html',
            replace: true,
            restrict: 'E',
            link: function(scope, element, attrs){
                function initializeDefaultValues() {
                    if (scope.formDefinition) {
                        for (const formDefinitionElement of scope.formDefinition) {
                            if (!formDefinitionElement.params) {
                                continue;
                            }
                            if (!scope.model.hasOwnProperty(formDefinitionElement.name)) {
                                scope.model[formDefinitionElement.name] = {};
                            }
                            for (const param of formDefinitionElement.params) {
                                if (!scope.model[formDefinitionElement.name].hasOwnProperty(param.name) && param.defaultValue) {
                                    scope.model[formDefinitionElement.name][param.name] = param.defaultValue;
                                }
                            }
                        }
                    }
                }

                if (attrs.monitor) {
                    scope.model = {};
                    scope.$watch(attrs.monitor, function(ov, nv) {
                        const model = scope.$eval(attrs.model);
                        if (model && Object.keys(model).length > 0) {
                            scope.model = model;
                        }
                        scope.formDefinition = scope.$eval(attrs.formDefinition);

                        initializeDefaultValues();
                    });
                } else {
                    scope.model = scope.$eval(attrs.model);
                    scope.formDefinition = scope.$eval(attrs.formDefinition);
                }
            }
        };
    });

    app.directive('formTemplateElement', function(){
        return {
            templateUrl: '/templates/form-template-element.html',
            replace: true,
            restrict: 'EA',
            scope: {
                model: '=',
                field: '=',
                onCoreParamsChanged: '&'
            },
            link: function(scope, element, attrs) {
                // noop
            }
        };
    });

    app.directive('forceInteger', function() {
        return {
            restrict: 'A',
            require: 'ngModel',
            link: function(scope, element, attr, ngModel) {
                function fromUser(text) {
                    return text;
                }

                function toUser(text) {
                    return parseInt(text || 0, 10);
                }
                ngModel.$parsers.push(fromUser);
                ngModel.$formatters.push(toUser);
            }
        };
    });

    app.directive('convertSpecialChar', function() {
         return {
            restrict: 'A',
            require: 'ngModel',
            link: function(scope, element, attr, ngModel) {
                function fromUser(text) {
                    const result = convertSpecialChars(text);
                    ngModel.$setValidity('singleChar', 1 === result.length);
                    return result;
                }
                function toUser(text) {
                    // For the moment we do not convert the unicode character into its ASCII representation as it can
                    // be displayed as-is in text inputs.
                    return text == null ? null : text.replace('\t', '\\t');
                }
                ngModel.$parsers.push(fromUser);
                ngModel.$formatters.push(toUser);
            }
        };
    });

    app.directive('convertPercentage', function() {
         return {
            restrict: 'A',
            require: 'ngModel',
            link: function(scope, element, attr, ngModel) {
                // calling round to avoid long decimal tail after floating point math operations e.g. 0.072*100=7.199999999999999
                function round(n){
                    return Math.round(n * 10 ** 12) / 10 ** 12;
                }

                function fromUser(text) {
                    return text == null ? null : round(parseFloat(text) / 100);
                }
                function toUser(text) {
                    return text == null ? null : round(parseFloat(text) * 100);
                }
                ngModel.$parsers.push(fromUser);
                ngModel.$formatters.push(toUser);
            }
        };
    });
    app.directive('forceDouble', function() {
        return {
            restrict: 'A',
            require: 'ngModel',
            link: function(scope, element, attr, ngModel) {
                function fromUser(text) {
                    return text;
                }

                function toUser(text) {
                    // Don't silently replace empty by zero !
                    if(text!=null && text!=undefined && text!=='') {
                        return parseFloat(text);
                    } else return '';
                }
                ngModel.$parsers.push(fromUser);
                ngModel.$formatters.push(toUser);
            }
        };
    });

    // Droparea is a component that handle file drops on it and callbacks the method defined on its drop parameter
    app.directive("droparea", function($filter, $timeout){
        return {
            restrict: 'E',
            template: '<div class="droparea" ng-class="{candrop: candrop}">'+
                '<form class="upload"></form>'+
                '<div ng-transclude class="nested-template-container"></div>' +
            '</div>',
            replace: true,
            transclude: true,
            scope: {
                drop: '&',
                validate: '&',
                //paramaters used by droparea directive to expose to its parent a candrop flag
                isDroppable: '=?',
            },
            link: function(scope, element, attrs){
                scope.multiple = 'multiple' in attrs;
                scope.noUploadOnClick = 'noUploadOnClick' in attrs;
                scope.candrop = false;
                scope.$watch('candrop', function(nv, ov) {
                    scope.isDroppable = scope.candrop;
                })

                // input fallback
                function addFileManually() {
                    var evt = document.createEvent("MouseEvents");
                    evt.initEvent('click', true, true );
                    input[0].dispatchEvent(evt);
                }

                if (!scope.noUploadOnClick)  {
                    element.click(function(e){
                        e.stopPropagation();
                        addFileManually();
                    });
                }

                element.on('click', 'form.upload input', function(e){
                    e.stopPropagation();
                }).on('change', 'form.upload input', function(e){
                    const files = this.files;
                    scope.$apply(function() {
                        scope.drop({'files': files});
                    });
                    createInput();
                });

                var input;
                function createInput(){
                    element.find('form.upload').find('input').remove();
                    input = $('<input type="file" name="file" id="qa_upload_dataset_input-files" multiple />');
                    element.find('form.upload').append(input);
                }
                createInput();

                // drop file
                function applyDragEnterLeave(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    scope.candrop = false;
                    scope.$apply();
                }
                function cancelEnterLeaveTimeout() {
                    if (scope.enterLeaveTimeout) {
                        $timeout.cancel(scope.enterLeaveTimeout);
                    }
                }
                function dragEnterLeave(e) {
                    cancelEnterLeaveTimeout();
                    //debouncing applyDragEnterLeave to prevent flickering when hovering element's children
                    scope.enterLeaveTimeout = $timeout(function() {
                        applyDragEnterLeave(e);
                    }, 100);
                }
                element.bind("dragenter", dragEnterLeave);
                element.bind("dragleave", dragEnterLeave);
                element.bind("dragover", function(e) {
                    cancelEnterLeaveTimeout();
                    e.stopPropagation();
                    e.preventDefault();
                    scope.$apply(function(){
                        var evt = e.originalEvent;
                        if (evt.dataTransfer &&
                            evt.dataTransfer.types &&
                            (
                                (evt.dataTransfer.types.indexOf && evt.dataTransfer.types.indexOf('Files') >= 0) ||
                                (evt.dataTransfer.types.contains && evt.dataTransfer.types.contains('Files'))
                            )
                        ) {
                            // feedback
                            scope.candrop = true;
                            var af = evt.dataTransfer.effectAllowed;
                            evt.dataTransfer.dropEffect = ('move' == af || 'linkMove' == af) ? 'move' : 'copy';
                        }
                    });
                });
                element.bind("drop", function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    scope.$apply(function(){
                        var evt = e.originalEvent;
                        if (evt.dataTransfer &&
                            evt.dataTransfer.types &&
                            (
                                (evt.dataTransfer.types.indexOf && evt.dataTransfer.types.indexOf('Files') >= 0) ||
                                (evt.dataTransfer.types.contains && evt.dataTransfer.types.contains('Files'))
                            ) &&
                            (scope.multiple || evt.dataTransfer.files.length == 1)
                        ){
                            scope.drop({'files': evt.dataTransfer.files});
                            scope.candrop = false;
                        }
                    });
                });
            }
        };
    });

    app.directive('commaSeparatedView', function (){
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                //For DOM -> model transformations
                ngModel.$parsers.push(function(value) {
                    if (value == null || value.length == 0) return [];
                    return value.split(",");
                });

                //For model -> DOM transformation
                ngModel.$formatters.push(function(value) {
                    if (value == undefined) return "";
                    return value.join(",");
                });
            }
        };
    });
    app.directive('jsonArrayView', function (){
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                //For DOM -> model transformations
                ngModel.$parsers.push(function(value) {
                    ngModel.$setValidity('json', true);
                    if (value == null || value.length == 0) return [];
                    try {
                        return JSON.parse(value);
                    } catch (e) {
                         ngModel.$setValidity('json', false);
                         return null;
                    }
                });

                //For model -> DOM transformation
                ngModel.$formatters.push(function(value) {
                    if (value == undefined) return null;
                    return JSON.stringify(value);
                });
            }
        };
    });
    app.directive('jsonArrayPrettyView', function (){
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                //For DOM -> model transformations
                ngModel.$parsers.push(function(value) {
                    ngModel.$setValidity('json', true);
                    if (value == null) return [];
                    try {
                        return JSON.parse(value);
                    } catch (e) {
                         ngModel.$setValidity('json', false);
                         return null;
                    }
                });

                //For model -> DOM transformation
                ngModel.$formatters.push(function(value) {
                    if (value == undefined) return null;
                    return JSON.stringify(value, undefined, 3);
                });
            }
        };
    });

     app.directive('jsonObjectPrettyView', function (Logger){
            return {
                require: 'ngModel',
                link: function(scope, elem, attrs, ngModel) {
                    var el = elem[0];
                    //For DOM -> model transformations
                    ngModel.$parsers.push(function(value) {
                        ngModel.dkuJSONError = null;
                        ngModel.$setValidity('json', true);
                        if (value == null || value.length == 0) return null;
                        try {
                            return JSON.parse(value);
                        } catch (e) {
                             ngModel.$setValidity('json', false);
                             Logger.info("Error while parsong JSON: ", value, e);
                             ngModel.dkuJSONError = e.toString();
                             if ('keepOldIfInvalid' in attrs) {
                                 return ngModel.$modelValue;
                             } else {
                                 return null;
                             }
                        }
                    });

                    //For model -> DOM transformation
                    ngModel.$formatters.push(function(value) {
                        if (value == undefined) return null;
                        var prevSelStart = el.selectionStart;
                        var prevSelEnd = el.selectionEnd;
                        var prevScroll = el.scrollTop;
                        if(el == document.activeElement) {
                            setTimeout(function() {
                                el.setSelectionRange(prevSelStart,prevSelEnd);
                                el.scrollTop = prevScroll;
                            },0);
                        }
                        return JSON.stringify(value,undefined,3);
                    });

                    if (attrs.deepUpdate) {
                        scope.$watch(attrs.ngModel, function(nv, ov) {
                            try {
                                var formatters = ngModel.$formatters, idx = formatters.length;
                                var viewValue = ngModel.$modelValue;
                                while (idx--) {
                                    viewValue = formatters[idx](viewValue);
                                }
                                if (viewValue != null) {
                                    ngModel.$viewValue = viewValue;
                                    ngModel.$render();
                                }
                            } catch (e) {
                                Logger.info("JSON is invalid, not rendering ...")
                            }
                        }, true);
                    }
                }
            };
     });

    app.directive('jsonObjectView', function (){
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                //For DOM -> model transformations
                ngModel.$parsers.push(function(value) {
                    ngModel.$setValidity('json', true);
                    if (value == null || value.length == 0) return null;
                    try {
                        return JSON.parse(value);
                    } catch (e) {
                         ngModel.$setValidity('json', false);
                         return null;
                    }
                });

                //For model -> DOM transformation
                ngModel.$formatters.push(function(value) {
                    if (value == undefined) return null;
                    return JSON.stringify(value);
                });
            }
        };
    });

    app.directive('commaSeparatedIntegerView', function (){
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                //For DOM -> model transformations
                ngModel.$parsers.push(function(value) {
                    if (value == null) return [];
                    var ret = value.split(",").map(function(x) { return parseInt(x, 10); }).filter(function(x) { return !isNaN(x);});
                    return ret;
                });

                //For model -> DOM transformation
                ngModel.$formatters.push(function(value) {
                    if (value == undefined) return "";
                    return value.join(",");
                });
            }
        };
    });

    app.directive('commaSeparatedFloatView', function (){
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                //For DOM -> model transformations
                ngModel.$parsers.push(function(value) {
                    if (value == null) return [];
                    var ret = value.split(",").map(function(x) { return parseFloat(x, 10); }).filter(function(x) { return !isNaN(x);});
                    return ret;
                });

                //For model -> DOM transformation
                ngModel.$formatters.push(function(value) {
                    if (value == undefined) return "";
                    return value.join(",");
                });
            }
        };
    });


    app.directive('customValidation', function (){
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                function apply_validation(value) {
                    ngModel.$setValidity('customValidation', true);
                    let cv = scope.$eval(attrs.customValidation);
                    var valid = cv && cv(value);
                    ngModel.$setValidity('customValidation', valid);
                    return value;
                }

                //For DOM -> model validation
                ngModel.$parsers.push(apply_validation);

                //For model -> DOM validation
                ngModel.$formatters.push(function(value) {
                    apply_validation();
                    return value;
                });
            }
        };
    });

    app.directive('fixedPanes', function($timeout,$rootScope){
        return {
            restrict: 'A',
            link: function(scope, element, attrs){
                scope.showLeftPane = scope.$eval(attrs.showLeftPane) || false;
                scope.showRightPane = scope.$eval(attrs.showRightPane)  || false;

                scope.setShowLeftPane = function(showLeftPane) {
                    if (scope.showLeftPane != showLeftPane) {
                        scope.showLeftPane = showLeftPane;
                        $timeout(function(){
                            scope.$broadcast('resizePane');
                            $rootScope.$broadcast('reflow');
                        }, 250);

                    }
                }
                scope.openLeftPane = function() {
                    scope.setShowLeftPane(true);
                }
                scope.closeLeftPane = function() {
                    scope.setShowLeftPane(false);
                }
                scope.toggleLeftPane = function(){
                    scope.setShowLeftPane(!scope.showLeftPane);
                };


                scope.setShowRightPane = function(showRightPane) {
                    if (scope.showRightPane != showRightPane) {
                        scope.showRightPane = showRightPane;
                        $timeout(function(){
                            scope.$broadcast('resizePane');
                            $rootScope.$broadcast('reflow');
                        }, 250);
                    }
                }
                scope.openRightPane = function() {
                    scope.setShowRightPane(true);
                }
                scope.closeRightPane = function() {
                    scope.setShowRightPane(false);
                }
                scope.toggleRightPane = function(){
                    scope.setShowRightPane(!scope.showRightPane);
                };
            }
        };
    });

    app.directive('watchScroll', function() {
       return {
           restrict : 'A',
            link: function(scope, element, attrs){
                $(element).addClass("watch-scroll");
                function scrollStart() {
                    $(element).addClass("scrolling");
                }
                function scrollEnd() {
                    $(element).removeClass("scrolling");
                }
                var scrolling = false;
                $(element).scroll(function() {
                    if (!scrolling) scrollStart();
                    clearTimeout($.data(this, 'scrollTimer'));
                    $.data(this, 'scrollTimer', setTimeout(function() {
                        scrollEnd();
                    }, 200));
                });
            }
        };
    });

    app.directive('tabs', function($filter, $location, $compile, $timeout, Logger) {
        return {
            restrict: 'E',
            scope: true,
            // replace: true,
            myTemplateNonScrollable: '<div class="tabbable">' +
                '<ul class="nav nav-tabs">' +
                    '<li ng-repeat="pane in panes|filter:{visible:true}" class="{{ pane.position }}" ng-class="{active:pane.selected}" style="{{ paneHeaderStyle }}">' +
                        '<a href="" ng-click="select(pane, noHashUpdate)" class="qa_generic_widget-tab">' +
                        '<span class="title"><i ng-show="pane.icon" class="icon-{{ pane.icon }}"></i><span fw500-width> {{ pane.title }}</span></span>'+
                        '<br ng-if="pane.subtitle"/><span class="subtitle" ng-if="pane.subtitle" ng-bind-html="pane.subtitle"></span>'+
                        '</a>' +
                    '</li>' +
                '</ul>' +
                '<div class="tab-content" ></div>' +
            '</div>',
            myTemplateScrollable: '<div class="tabbable">' +
                '<div class="scroller scroller-left"><i class="icon-chevron-left"></i></div>'+
                '<div class="scroller scroller-right"><i class="icon-chevron-right"></i></div>'+
                '<div class="tabs-scroll-wrapper">'+
                '<ul class="nav nav-tabs tabs-scroll-zone">' +
                    '<li ng-repeat="pane in panes|filter:{visible:true}" class="{{ pane.position }}" ng-class="{active:pane.selected}" style="{{ paneHeaderStyle }}">' +
                        '<a href="" ng-click="select(pane, noHashUpdate)" class="qa_generic_widget-tab"><i ng-show="pane.icon" class="icon-{{ pane.icon }}"></i> {{ pane.title }}</a>' +
                    '</li>' +
                '</ul></div>' +
                '<div class="tab-content" ></div>' +
            '</div>',
            myTemplateNewStyleScrollable: '<div class="tabbable">' +
                '<div class="scroller scroller-left"><i class="icon-chevron-left"></i></div>'+
                '<div class="scroller scroller-right"><i class="icon-chevron-right"></i></div>'+
                '<div class="tabs-scroll-wrapper">'+
                '<ul class="column-header-tabs tabs-scroll-zone">' +
                    '<li ng-repeat="pane in panes|filter:{visible:true}" class="{{ pane.position }} tab" ng-class="{active:pane.selected}" style="{{ paneHeaderStyle }}">' +
                        '<span class="title" ng-click="select(pane, noHashUpdate)" class="qa_generic_widget-tab"><i ng-show="pane.icon" class="icon-{{ pane.icon }}"></i> {{ pane.title }}</span>' +
                    '</li>' +
                '</ul></div>' +
                '<div class="tab-content" ></div>' +
            '</div>',
             myTemplateNewStyle: '<div class="">' +
                '<ul class="column-header-tabs" style="margin: 0">' +
                    '<li ng-repeat="pane in panes|filter:{visible:true}" class="{{ pane.position }} tab" ng-class="{active:pane.selected}" style="{{ paneHeaderStyle }}">' +
                        '<span class="title" ng-click="select(pane, noHashUpdate)" class="qa_generic_widget-tab"><i ng-show="pane.icon" class="icon-{{ pane.icon }}"></i> {{ pane.title }}</span>' +
                    '</li>' +
                '</ul>' +
                '<div class="tab-content" ></div>' +
            '</div>',
            compile: function(tElement, attrs){
                // get the panes of the tabs
                var originalContent = $('<div></div>').html(tElement.contents()).contents();
                var el;
                if (attrs.newStyle && attrs.scrollable) {
                    el = $(this.myTemplateNewStyleScrollable);
                } else if (attrs.newStyle) {
                    el = $(this.myTemplateNewStyle);
                } else if (attrs.scrollable) {
                    el = $(this.myTemplateScrollable);
                } else  {
                    el = $(this.myTemplateNonScrollable);
                }
                if (tElement.hasClass('vertical-flex')) {
                    el.addClass('vertical-flex h100');
                    el.children(':not(.tab-content)').addClass('noflex');
                    el.children('.tab-content').addClass('flex');
                }
                tElement.replaceWith(el);
                el.find('.tab-content').append(originalContent);
                return this.link;
            },
            controller: function($scope, $element, $rootScope) {
                var panes = $scope.panes = [];
                $scope.select = function(pane, force) {
                    if (!pane.selected){
                        angular.forEach(panes, function(p) {
                            p.selected = false;
                        });
                        pane.selected = true;
                        $timeout(function() {
                            pane.displayed = true;
                        });
                        if ($scope.onSelect) {
                            $scope.onSelect(pane);
                        }
                        $scope.$emit('paneSelected', pane);
                        $scope.$broadcast('paneSelected', pane);
                        $rootScope.$broadcast("reflow");

                        if (!force){
                            // TEMPORARY TEMPORARY :
                            // Disable updating of the location hash, because
                            //  it breaks ui-router's interaction with browser history.
                            //   - If you are on state A with no hash, transitionTo(B), then back takes you back to A
                            //   - If you are on state A with no hash, then on state B with hash, transitionTo(C)
                            //      - will propagate the hash so you will actually be on C#hash, which we don't want
                            //      - back button will take you back to A, the B#hash state has disappeared from browser
                            //        history
                            $location.hash(pane.slug, true).replace(true);
                        }
                    }
                };

                this.select = $scope.select;
                this.addPane = function(pane) {
                    panes.push(pane);
                    if (panes.length == 1) {
                        $scope.select(pane, true);
                    }
                };

                $scope.$on('tabSelect', function(e, slug){
                    var pane = $filter('filter')(panes, {'slug':slug});
                    if(pane && pane.length){
                       $scope.select(pane[0]);
                    } else {
                        Logger.warn("Failed to select a pane for slug ", slug, " amongst", panes, " filtered", pane);
                    }
                });
                this.verticalFlex = $element.hasClass('vertical-flex');
            },
            link : function($scope, element, attrs) {
                $scope.noHashUpdate = "noHashUpdate" in attrs;
                if (attrs.scrollable) {

                    var totalWidth = function(){
                        var itemsWidth = 0;
                        $('.tabs-scroll-zone li', element).each(function(){
                            var itemWidth = $(this).outerWidth();
                            itemsWidth+=itemWidth;
                        });
                        return itemsWidth;
                    };
                    var scrollBarWidths = 46; /* 2x23 */

                    var hiddenWidth = function(){
                        return (
                            ($('.tabs-scroll-wrapper', element).outerWidth()) -
                            totalWidth()-getLeftPosi())
                            -
                            scrollBarWidths;
                    };
                    var getLeftPosi = function(){
                        return $('.tabs-scroll-zone').position().left;
                    };

                    $('.scroller-right', element).click(function() {
                        $('.scroller-left', element).show();
                        $('.scroller-right', element).hide();
                        $('.tabs-scroll-zone', element).animate({left:"+="+hiddenWidth()+"px"});
                    });

                    $(".scroller-left", element).click(function(e) {
                        $('.scroller-right', element).show();
                        $('.scroller-left', element).hide();
                        $('.tabs-scroll-zone', element).animate({left:"-="+getLeftPosi()+"px"});
                    });
                    $timeout(function(){
                        if (($('.tabs-scroll-wrapper', element).outerWidth()) < totalWidth()) {
                            $('.scroller-right').show();
                        }
                    }, 0);
                }
                if (attrs.paneHeaderStyle) {
                    $scope.paneHeaderStyle = attrs.paneHeaderStyle;
                } else {
                    $scope.paneHeaderStyle = '';
                }
            }
        };
    });

    app.directive('pane', function($filter, $location, $timeout, $compile, $rootScope) {
        var paneTemplate = $compile('<div class="tab-pane" ng-class="{active: struct.selected}"></div>');
        return {
            require: '^tabs',
            restrict: 'E',
            terminal: true,
            scope: true,
            compile: function(tElement){
                // get the content of the pane
                var transcludeFunction = $compile(tElement.contents());

                return function(scope, element, attrs, tabsCtrl){

                    // replace the pane by the paneTemplate
                    paneTemplate(scope, function(clone){
                        element.replaceWith(clone);
                        element = clone;
                    });

                    // append the content of the pane
                    transcludeFunction(scope, function(clone){
                        element.append(clone);
                    });

                    scope.struct = {
                        title: attrs.title,
                        subtitle: scope.$eval(attrs.subtitle),
                        slug: $filter('slugify')(attrs.title),
                        icon: attrs.icon,
                        visible: angular.isUndefined(attrs.visiblePane)?true:scope.$eval(attrs.visiblePane),
                        position: attrs.position,
                    };

                    element.addClass("tab-" + scope.struct.slug);
                    if (tabsCtrl.verticalFlex) { element.addClass('fh'); }

                    attrs.$observe('title', function(val){
                        // If the title attribute is modified
                        scope.struct.title = val;
                    });
                    scope.$watch(attrs.subtitle, function(nv, ov){
                        // If the title attribute is modified
                        scope.struct.subtitle = nv;
                    });

                    // Removing the title from the element itself, to prevent a tooltip when hovering anywhere over
                    // the content.
                    element.removeAttr('title');
                    // having a pb when combined with ng-repeat
                    $timeout(function(){element.removeAttr('title');}, 10);

                    // register itself
                    tabsCtrl.addPane(scope.struct);
                    if ($location.hash() == scope.struct.slug && scope.struct.visible){
                        tabsCtrl.select(scope.struct);
                    }

                    attrs.$observe('visiblePane', function(value){
                        scope.struct.visible = angular.isUndefined(value)?true:value=="true";
                    });

                    scope.$watch('struct.selected', function(nv, ov){
                        if (nv){
                            if (attrs.noResizeHack == null) {
                                // ugly hack, this will trigger a window resize event, thus refreshing flowchart layout
                                // and CodeMirror-alikes
                                window.dispatchEvent(new Event('resize'));
                            }
                            $rootScope.$broadcast("reflow");
                        }
                    });
                };
            },
        };
    });

    app.directive("detectIframeClicks", function() {
        return {
            scope: false,
            restrict: "A",
            link: function(scope, element, attrs){
                var overIFrame = false;
                element.mouseenter(function() {
                    overIFrame = true;
                });
                element.mouseleave(function() {
                    overIFrame = false;
                });
                $(window).blur(function() {
                    if (overIFrame) {
                        $(document).trigger("click");
                    }
                });
            }
        }
    })

    app.directive('sortTable', function($rootScope){
        return {
            scope: true,
            controller: function($scope, $element, $attrs){
                this.setSort = function(col) {
                    if($scope.sortColumn){
                        $scope.cols[$scope.sortColumn].removeClass('sort-descending').removeClass('sort-ascending');
                    }
                    if ($scope.sortColumn === col) {
                        $scope.sortDescending = !$scope.sortDescending;
                    } else {
                        $scope.sortColumn = col;
                        $scope.sortDescending = false;
                    }
                    this.refresh();
                };

                this.refresh = function(){
                    if($scope.cols[$scope.sortColumn]){
                        if ($scope.sortDescending) {
                            $scope.cols[$scope.sortColumn].addClass("sort-descending");
                        } else {
                            $scope.cols[$scope.sortColumn].addClass("sort-ascending");
                        }
                        if(! $rootScope.$$phase) $scope.$apply();
                    }
                };

                $scope.sortColumn = $attrs.sortColumn;
                $scope.sortDescending = $scope.$eval($attrs.sortDescending) || false;
                if($attrs.sortTable){
                    if ($attrs.sortTable[0] == "-") {
                        $scope.sortDescending = true;
                        $scope.sortColumn = $attrs.sortTable.substring(1);
                    } else {
                        $scope.sortColumn = $attrs.sortTable;
                    }
                }

                $scope.cols = {};
                this.addCol = function(col, element){
                    $scope.cols[col] = element;
                    element.addClass("sortable");
                    if(angular.isUndefined($scope.sortColumn)){
                        this.setSort(col);
                    } else {
                        this.refresh();
                    }
                };
            }
        };
    });

    /* This is an alternative version of sortTable, featuring a two way binding of sortColumn and sortDescending using
        standard angular features rather than playing with attributes.

        Using it, one can easily pass initial sortColumn and sortDescending as variables, and get back all modifications
        performed by the user.

        Note: when this version is used, one should not use sortColumn and sortDescenging as parameters of the orderBy angular pipe.
        Variables passed as parameters should be used.

        Example:

            <table sort-table-dyn
                sort-column="myScope.mySortColumn" sort-descending="myScope.mySortDescending">
                    ...
                <tbody>
                    <tr ng-repeat="item in selection.filteredObjects | orderBy:myScope.mySortColumn:myScope.mySortDescending">

        It is similar to sortTable. However, adding double binding to the former implementation seemed would lead to a code
        a lot less understandable, especially if we want to avoid a refactoring of all current sort-table usages.
    */
    app.directive('sortTableDyn', function($rootScope){
        return {
            scope:{
                sortColumn: '=',
                sortDescending: '='
            },
            controller: function($scope, $element, $attrs){
                this.setSort = function(col) {
                    if ($scope.sortColumn === col) {
                        $scope.sortDescending = !$scope.sortDescending;
                    } else {
                        $scope.sortColumn = col;
                        $scope.sortDescending = false;
                    }
                    this.refresh();
                };

                this.refresh = function(){
                    Object.values($scope.cols).forEach(e => e.removeClass('sort-descending').removeClass('sort-ascending'));
                    if($scope.cols[$scope.sortColumn]){
                        if ($scope.sortDescending) {
                            $scope.cols[$scope.sortColumn].addClass("sort-descending");
                        } else {
                            $scope.cols[$scope.sortColumn].addClass("sort-ascending");
                        }
                        if(! $rootScope.$$phase) $scope.$apply();
                    }
                };


                $scope.cols = {};
                this.addCol = function(col, element){
                    $scope.cols[col] = element;
                    element.addClass("sortable");
                    this.refresh();
                };
            }
        };
    });

    app.directive('sortCol', function(){
        return {
            scope: true,
            require: '^sortTable',
            link: function(scope, element, attrs, sortTableCtrl){
                sortTableCtrl.addCol(attrs.sortCol, element);
                element.on('click', function(){
                    sortTableCtrl.setSort(attrs.sortCol);
                });
            }
        };
    });

    app.directive('sortColDyn', function(){
        return {
            scope: true,
            require: '^sortTableDyn',
            link: function(scope, element, attrs, sortTableCtrl){
                sortTableCtrl.addCol(attrs.sortColDyn, element);
                element.on('click', function(){
                    sortTableCtrl.setSort(attrs.sortColDyn);
                });
            }
        };
    });

    app.directive('daterangepicker', function($rootScope){
        return {
            restrict: 'A',
            template : ' <div class="input-append" style="margin-bottom:0px;"><input type="text" style="opacity:0;'
                 +'position:absolute;top:-3000px;left:-3000px"/>'
                 +'<input type="text" class="theInput" /> ',
            scope: {
                startDate: '=',
                endDate: '=',
                opensDirection:'@',
                opens: '@',
                format: '@',
                timePickerIncrement : '@',
                presetsToEndOfDay : '=',
                fieldWidth : '@',
                singleDatePicker: '=',
                onChange: "=?",
            },
            replace : true,
            link: function(scope, element, attrs){

                var input = element.find('.theInput');
                var picker = undefined;

                if (scope.fieldWidth) {
                    input.width(scope.fieldWidth);
                }

                element.find('input').keydown(function(e){
                    if(e.keyCode==13 && picker) {
                        picker.hide();
                    }
                });

                // Create the date picker if not already done, and only if the format is set
                function init() {
                    if(!picker && scope.format) {
                        var endOfDayDelta = scope.presetsToEndOfDay ? 1 : 0;
                        picker = input.daterangepicker({
                              format:scope.format,
                              timePickerIncrement: scope.timePickerIncrement ? parseInt(scope.timePickerIncrement) : 60,
                              timePicker: scope.format.indexOf('HH')!=-1,
                              opens: attrs.opens || 'right',
                              timePicker12Hour:false,
                              autoApply:true,
                              separator : ' / ',
                              singleDatePicker: !!scope.singleDatePicker,
                              ranges: {
                                 'Today': [moment(), moment().add('days', endOfDayDelta)],
                                 'Yesterday': [moment().subtract('days', 1), moment().subtract('days', 1 - endOfDayDelta)],
                                 'Last 7 Days': [moment().subtract('days', 6), moment().add('days', endOfDayDelta)],
                                 'Last 30 Days': [moment().subtract('days', 29), moment().add('days', endOfDayDelta)],
                                 'This Month': [moment().startOf('month'), moment().endOf('month')],
                                 'Last Month': [moment().subtract('month', 1).startOf('month'), moment().subtract('month', 1).endOf('month')]
                               },
                               locale: {firstDay: 1},
                               opensDirection: attrs.opensDirection || 'down'
                        },changeDate).data('daterangepicker');

                        picker.element.on('hide.daterangepicker', function (ev, picker) {
                            if (picker.element.val().length === 0) {
                                scope.startDate = null;
                                scope.endDate = null;
                                if(!$rootScope.$$phase) {
                                    $rootScope.$digest();
                                }
                            }
                        });

                        // open upwards if no room below and vice versa
                        if (attrs.opensDirection === 'auto') {
                            picker.element.on('show.daterangepicker', function(ev, picker) {
                                const currentDirection = picker.opensDirection;
                                let newDirection = 'down'

                                if (picker.element.offset().top + picker.element.outerHeight() + picker.container.outerHeight() > $(window).height()) {
                                    newDirection = 'up';
                                }

                                // need to close and reopen for change to take effect
                                if (currentDirection !== newDirection) {
                                    picker.opensDirection = newDirection;
                                    picker.hide();
                                    picker.show();
                                }
                            });
                        }
                    }
                    if(picker)
                        return true;

                    return false;
                }

                var insideWatch = false;
                var insideUserCallback = false;

                // Update the scope from the date picker state
                function changeDate() {

                    if(!init() || insideWatch) return;
                    try {
                        insideUserCallback = true;
                        picker.updateFromControl();
                        if(!scope.format) return;
                        scope.startDate = picker.startDate.format(scope.format);
                        scope.endDate = picker.endDate.format(scope.format);
                        if(!$rootScope.$$phase) {
                            $rootScope.$digest();
                        }
                        if (scope.onChange) {
                            scope.onChange();
                        }
                    } finally {
                        insideUserCallback = false;
                    }
                }

                // Update date picker state from scope
                scope.$watch('[startDate,endDate]',function(nv,ov) {
                    if(!init() || insideUserCallback) return;
                    try {
                        insideWatch = true;
                        if (!nv[0] && !nv[1]){
                            picker.element.val("");
                            return;
                        }
                        if(scope.startDate) {
                            picker.setStartDate(moment(scope.startDate,scope.format));
                        }
                        if(scope.endDate) {
                            picker.setEndDate(moment(scope.endDate,scope.format));
                        }
                    } finally {
                        insideWatch = false;
                    }
                },true);

                scope.$watch('format',function(nv, ov) {
                    if(!picker) {
                        init();
                    } else if (nv != ov) {
                        picker.format = nv;
                        picker.timePicker = nv.indexOf('HH')!=-1;
                        picker.timePickerIncrement= scope.timePickerIncrement ? parseInt(scope.timePickerIncrement) : 60;
                        picker.updateInputText();
                        changeDate();
                        picker.updateCalendars();
                    }

                });

                scope.$on('$destroy',function() {
                    if(picker) {
                        picker.remove();
                        picker = undefined;
                    }
                })
            }
        };
    });


    /*
     *   Very similar to dkuHelpPopover, but the template can be inlined
     *   Usage :
     *
     *   <button class="btn btn-small" dku-inline-popover>
     *        <label>
     *            <span class="icon-question">&nbsp;</span>
     *                      Button text
     *        </label>
     *        <content title="Help me">
     *            <h2>Introduction</h2>
     *            <p>Blablabla</p>
     *        </content>
     *   </button>
     *
     */
    app.directive('dkuInlinePopover',function($timeout, $compile, $interpolate) {
        return {
            restrict : 'A',
            scope : true,
            transclude:true,
            template:'',

            compile:function(_element,_attrs,transclude) {
                return function(scope,element,attrs) {
                    transclude(scope.$new(), function(clone) {

                        var contentFilter = clone.filter("content");
                        var buttonText = clone.filter('label').contents();
                        var popoverContent = contentFilter.contents();
                        var title = contentFilter.attr("title") ? $interpolate(contentFilter.attr("title"))(scope) : null;

                        // I'VE NO FUCKING IDEA OF WHY IT WORKS
                        // timeout is the universal fix :D
                        $timeout(function() {element.append(buttonText);});
                        var shown = false;
                        var options = {
                                html: true,
                                content: popoverContent,
                                placement: (attrs.placement in scope) ? scope[attrs.placement]  : (attrs.placement || 'right'),
                                container: attrs.container?attrs.container:undefined,
                                title: title
                        };

                        if (attrs.on === "hover") {
                            options.animation = false;
                            element.popover(options).on("mouseenter", function () {
                                $(this).popover("show");
                                if (attrs.popoverClass) {
                                    $timeout(() => {
                                        const popover = element.data('popover').$tip;
                                        popover.addClass(attrs.popoverClass);
                                    });
                                }
                            }).on("mouseleave", function () {
                                $(this).popover("hide");
                            });
                        } else {  // click
                            element.popover(options);
                            function show() {
                                shown = true;
                                window.setTimeout(function() {
                                    $("html").click(hide);
                                    const popover = element.data('popover').$tip;
                                    if (attrs.clickable) popover.click(stopPropagation);
                                    if (attrs.popoverClass) popover.addClass(attrs.popoverClass);
                                }, 0);
                            }

                            function stopPropagation($event) {
                                $event.stopPropagation();
                            }

                            function hide() {
                                shown = false;
                                element.popover('hide');
                                $("html").unbind("click", hide);
                                const popover = element.data('popover').$tip;
                                popover.unbind('click', stopPropagation);
                                popover.hide();
                            }

                            element.click(function() {
                                if(shown) {
                                    hide();
                                } else {
                                    show();
                                }
                            });
                        }

                        scope.$on("$destroy", function() {
                          element.popover('destroy');
                        });
                    });
                };
            }
        };
    });

    /**
     * Very similar to dkuHelpPopover, but the template is a Markdown string
     *   Usage :
     *
     *   <button class="btn btn-small" dku-md-popover="# Yeah\n* Markdown" title="popover title">
     *        <label>
     *            <span class="icon-question">&nbsp;</span>
     *                      Button text
     *        </label>
     *        <content title="Help me">
     *            <h2>Introduction</h2>
     *            <p>Blablabla</p>
     *        </content>
     *   </button>
     *
     */
    app.directive('dkuMdPopover',function(MarkedSettingService) {
        return {
            restrict : 'A',
            link : function($scope, element, attrs) {
                var shown = false;
                let destroyPopover;


                var hide = function() {
                    $("html").unbind("click", hide);
                    element.popover('hide');
                    shown=false;
                };

                var show = function() {
                    shown = true;
                    //capturing jquery destroy popover function for the current element, otherwise the method is not available anymore on $destroy of the directive (certainly because the elements got already removed from the DOM at that point)
                    destroyPopover = (element.data('popover')['destroy']).bind(element.data('popover'));

                    marked.setOptions(MarkedSettingService.get($scope, attrs));
                    var contentElt = marked(attrs.dkuMdPopover);
                    var ret = $("<div class=\"" + (attrs.popoverClazz||"") + "\"></div>");
                    ret.html(contentElt);
                    element.popover('show');
                    var popover = element.data('popover');
                    $(popover.$tip)
                        .find('.popover-content')
                        .empty().append(ret)
                        .off("click.dku-pop-over")
                        .on("click.dku-pop-over", function(e) {
                            e.stopPropagation();
                        });
                    element.popover('show');
                    window.setTimeout(function() { $("html").click(hide); }, 0);
                };
                var placement = element.data("placement") || "right";
                var options = {
                    html: true,
                    content: "",
                    placement: placement,
                    title: attrs.dkuMdTitle || "Help"
                };
                var container = element.data("container") || "body";
                if (container) {
                    options.container = container;
                }

                element.popover(options);
                element.click(function() {
                    if(shown) {
                        hide();
                    } else {
                        show();
                    }
                });

                $scope.$on('$destroy', function() {
                    if (typeof destroyPopover === "function") {
                        destroyPopover();
                    }
                });
            }
        };
    });

    /*
     * Usage :
     * bl br tl tr
     *
     *   <button class="btn btn-small" dku-inline-popup position="bl">
     *        <label>
     *            <span class="icon-question">&nbsp;</span>
     *                      Button text
     *        </label>
     *        <content title="Help me">
     *            <h2>Introduction</h2>
     *            <p>Blablabla</p>
     *        </content>
     *   </button>
     *
     * The popup content is created lazily. It is then only hidden. It is removed when
     * parent is destroyed
     */
    app.directive('dkuInlinePopup',function($timeout) {
        return {
            restrict : 'A',
            scope : true,
            transclude:true,
            template:'',
            compile:function(_element,_attrs,transclude) {
                return function(scope,element,attrs) {
                    transclude(scope.$new(), function(clone) {
                        var state = { popupElement : null};
                        var shown = false;
                        var buttonText = clone.filter('label').contents();
                        var popupContent = clone.filter('content').contents();
                        var addClazz = clone.filter('content').attr('class').split(/\s+/);


                        $timeout(function() {element.append(buttonText);});

                        var hide = function() {
                            if (state.popupElement) {
                                state.popupElement.hide();
                            }
                            $("html").unbind("click", hide);
                            shown=false;
                        };
                        var show = function() {
                            shown = true;
                            if (state.popupElement ==null) {
                                state.popupElement = $("<div class='dku-inline-popup' />");
                                $.each(addClazz, function(idx, val) { state.popupElement.addClass(val)});
                                state.popupElement.append(popupContent);
                                $("body").append(state.popupElement);
                            }
                            state.popupElement.css("overflow", "scroll");
                            state.popupElement.css("position", "absolute");
                            state.popupElement.css("left", element.offset().left);
                            var windowh = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
                            var etop = element.offset().top + element.outerHeight();
                            state.popupElement.css("top", etop);
                            state.popupElement.css("max-height", windowh - etop);

                            state.popupElement.off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                                e.stopPropagation();
                            });
                            window.setTimeout(function() { $("html").click(hide) }, 0);

                            state.popupElement.show()
                        };
                        scope.hide = function(){
                            hide();
                        }

                        element.click(function(){
                            if (shown) hide();
                            else show();
                        })
                        scope.$on("$destroy", function() {
                            hide();
                            if (state.popupElement) {
                                state.popupElement.remove();
                                state.popupElement = null;
                            }
                        });
                    });
                };
            }
        };
    });


    app.directive('editableSlider', function($parse, $compile) {
        return {
            restrict : 'A',
            link : function($scope, element, attrs) {
                var tpl = $compile('<div class="ngrs-value-runner">'
                    +'    <div class="ngrs-value ngrs-value-min" style="max-width: 70px;">'
                    +'      <input ng-show="sliderEditManual1" auto-focus="{{sliderEditManual1}}" step="0.1" ng-blur="sliderEditManual1=false;'+attrs.onHandleUp+'()" ng-type="number" next-on-enter blur-model="'+attrs.modelMin+'" ng-disabled="disableEditable" />'
                    +'      <div ng-hide="sliderEditManual1"><a ng-click="sliderEditManual1=true" style="color: inherit; overflow: hidden; text-overflow: ellipsis;" title="{{'+attrs.modelMin+'}}">{{'+attrs.modelMin+'}}</a></div>'
                    +' </div>'
                    +' <div class="ngrs-value ngrs-value-max" style="max-width: 70px;">'
                    +'    <input ng-show="sliderEditManual2" auto-focus="{{sliderEditManual2}}" step="0.1" ng-blur="sliderEditManual2=false;'+attrs.onHandleUp+'()" ng-type="number" next-on-enter blur-model="'+attrs.modelMax+'" ng-disabled="disableEditable" />'
                    +'    <div ng-hide="sliderEditManual2"><a ng-click="sliderEditManual2=true" style="color: inherit; overflow: hidden; text-overflow: ellipsis;" title="{{'+attrs.modelMax+'}}">{{'+attrs.modelMax+'}}</a></div>'
                    +'   </div>'
                    +'</div>');

                $scope.sliderEditManual1 = false;
                $scope.sliderEditManual2 = false;

                $scope.disableEditable = false;
                $scope.disableEditableAsString = attrs.disableEditableAsString;
                if ($scope.disableEditableAsString) {
                    $scope.disableEditable = $scope.$eval($scope.disableEditableAsString);
                    $scope.$watch($scope.disableEditableAsString, function(nv, ov) {
                        $scope.disableEditable = nv;
                    });
                }

                attrs.$set('showValues','false');
                element.append(tpl($scope));
            }
        }
    });

    app.directive('dkuHelpPopover', function($parse, $compile, $http, $timeout, $q, $templateCache) {
        return {
            restrict : 'A',
            scope:true,
            controller: function($scope){
                this.dismissPopover = function() {
                    $scope.dismissPopover();
                }
                this.togglePopover = function() {
                    $scope.togglePopover();
                }
            },
            link : function($scope, element, attrs) {

                // By default, a bootstrap popover is not displayed if it has no title and no content
                // We need to create such popover in some cases!
                function execInPatchedEnv(fn) {
                    var old = $.fn.popover.Constructor.prototype.hasContent;
                    $.fn.popover.Constructor.prototype.hasContent = function() {
                        return true;
                    };
                    try {
                        fn();
                    } finally {
                        $.fn.popover.Constructor.prototype.hasContent = old;
                    }
                }

                var shown = false;
                var getter = $parse(attrs.dkuHelpPopover);
                var templateUrl = getter($scope);

                var hide = function() {
                    $("html").unbind("click", blur);
                    element.popover('hide');
                    shown=false;
                };

                //selector for elements that do not create blur/hide event
                //(all children will block hide event)
                var noBlur = [];
                if (attrs.noBlur) {
                    noBlur = $scope.$eval(attrs.noBlur);
                }
                var blur = function(evt) {
                    var ignore = false;
                    $.each(noBlur, function(idx, selector) {
                        if($(evt.target).is(selector) || $(evt.target).parents(selector).length) {
                            ignore = true;
                        }
                    });
                    ignore || hide();
                }

                $scope.dismissPopover = function(){
                    hide();
                }

                var theTip;

                var show = function() {

                    shown = true;
                    $http.get(templateUrl, {cache: $templateCache}).then(function(response) {

                        var tmplData = $('<div/>').html(response.data).contents();
                        var tmpl = $compile(tmplData);
                        var popover = element.data('popover');
                        var html = tmpl($scope);
                        execInPatchedEnv(function() {
                            element.popover('show');
                            $(popover.$tip)
                                .find('.popover-content')
                                .html(html)
                                .off("click.dku-pop-over")
                                .off("click.dku-pop-over")
                                .off("click",".dropdown-menu")
                                .on("click.dku-pop-over", function(e) {
                                    e.stopPropagation();
                            });
                            theTip = popover.$tip;
                            element.popover('show');

                            if (attrs.noArrow) {
                                $(popover.$tip).find(".arrow").remove();
                                $(popover.$tip).css("top", $(popover.$tip).offset().top-20);
                            }
                            if (attrs.contentClazz) {
                                $(popover.$tip).find('.popover-content').addClass(attrs.contentClazz);
                            }
                            if (attrs.forceTopPositive) {
                                var currentTop = $(popover.$tip).css('top');
                                if (currentTop.charAt(0) === '-') {
                                    $(popover.$tip).css('top', '0px');
                                    // shift arrow accordingly
                                    $(popover.$tip).find('.arrow').css('transform', 'translateY(' + currentTop + ')');
                                }
                            }
                        });
                        window.setTimeout(function() { $("html").click(blur); }, 0);

                    });
                };

                var toggle = function() {
                    if (shown) {
                        hide();
                    }
                    else {
                        show();
                    }
                };

                $scope.togglePopover = function(){
                    return toggle();
                }

                $scope.showPopover = function(){
                    return show();
                }

                $scope.hidePopover = function(){
                    return hide();
                }

                var placement = element.data("placement") || "right";

                var options = {
                    html: true,
                    content: "",
                    placement: placement,
                    title: element.data("title")
                };
                var container = element.data("container");
                if (container) {
                    options.container = container;
                }
                element.popover(options);
                element.click(toggle);
                element[0].showPopover = function() {
                    if (!shown) {
                        show();
                    }
                };

                $scope.$on('$destroy', function() {
                       if(theTip && theTip.remove) {
                            theTip.remove();
                       }
                });

                element[0].hidePopover = function() {
                    if (shown) {
                        hide();
                    }
                };


            }
        };
    });




    app.directive('bzColorPicker', function() {
      var evtFakeDom = $("<div>");
      return {
        restrict: 'E',
        template: "<div class='bz-color-picker' ng-click='toggle($event)'>\
                <div class='iris' style='background-color: {{ color }}'></div>\
                <i class='icon-caret-down'></i>\
                <div class='bz-color-picker-palette'>\
                    <span ng-repeat='colorChoice in colorChoices'>\
                        <div class='color' ng-click='setColor(colorChoice)' style='background-color: {{ colorChoice }}'/>\
                    </span>\
                </div>\
            </div>",
        replace: true,
        scope: {
          color: "=ngModel"
        },
        link: function(scope, element, attrs) {
          var isShown = false;
          var paletteEl = element.find('.bz-color-picker-palette');

          var show = function() {
            if (isShown) return;
            evtFakeDom.trigger("hideAll");
            element.addClass("showPalette");
            isShown = true;
          }

          var hide = function() {
            if (!isShown) return;
            element.removeClass("showPalette");
            isShown = false;
          }

          scope.toggle = function($event) {
            $event.stopPropagation();
            if (isShown) {
              hide();
            }
            else {
              show();
            }
            return false;
          }

          evtFakeDom.on("hideAll", hide);
          $("body").click(function() {
            evtFakeDom.trigger("hideAll");
          })
          scope.$on("$destroy", function(nv, ov) {
            evtFakeDom.off("hideAll", hide);
          });

          scope.setColor = function(color) {
            scope.color = color;
          }

          scope.colorChoices = ["#f06548",
                                "#fdc766",
                                "#7bc9a6",
                                "#64bc93",
                                "#4ec5da",
                                "#548ecb",
                                "#97668f",
                                "#5e2974",
                                "#f6aacb",
                                "#d24773"];
        }
      }
    });

    app.directive('bzGauge', function() {
        return {
            restrict: 'E',
            template: "<div class='bz-gauge'><div class='mercury' style='width: {{ gaugeWidth }}%; background-color: {{ color }};'></div>",
            replace: true,
            scope: {
                color: "=color",
                val: "=val",
                total: "=total"
            },
            link: function(scope, element, attrs) {
                scope.gaugeWidth = (100.* scope.val / scope.total) | 0;
            }
        }
    })

    var debouncer = function(f, delay) {
      var delayer = null;
      return function() {
        if (delayer === null) {
          f();
          delayer = setTimeout(function() {
            delayer = null;
          }, delay)
        }
      }
    }

    app.directive('editableLabel', function() {
      return {
            restrict: 'E',
            template: "<div class='editable-label'><label>{{ val }}</label><input></input></div>",
            replace: true,
            scope: {
                val: '=ngModel',
            },
            link: function(scope, element, attrs) {
                var $label = element.find("label");
                var $input = element.find("input");

                var isEdit = false;

                var enterEdition = function() {
                  isEdit = true;
                  element.addClass("edit");
                  $input.focus();
                  $input.val(scope.val);
                }

                scope.validate = function(val) {
                  var trimmed = val.trim();
                  return (trimmed.length > 0);
                }

                var quitEdition = function() {
                  if (!isEdit) {
                    return;
                  }
                  var candidate = $input.val();
                  if (scope.validate(candidate)) {
                    scope.val = candidate.trim();
                    scope.$apply();
                    element.removeClass("edit");
                  }
                  isEdit = false;
                }

                var toggleEdition = function() {
                  if (isEdit) {
                    quitEdition();
                  }
                  else {
                    enterEdition();
                  }
                }

                toggleEdition = debouncer(toggleEdition, 400);
                $input.blur(toggleEdition);
                $input.change(toggleEdition);
                $label.click(toggleEdition);

            }
        }
    });


    app.directive('editableText', function() {
      return {
            restrict: 'E',
            template: "<div class='editable-text'><div>{{ message() }}</div><textarea></textarea></div>",
            replace: true,
            scope: {
                emptyMessage: '@emptyMessage',
                val: '=ngModel',
            },
            link: function(scope, element, attrs) {
                var $label = element.find("div");
                var $input = element.find("textarea");

                var isEdit = false;

                if (scope.val === undefined) {
                  scope.val = "";
                }
                scope.message = function() {
                  if (scope.val && (scope.val.trim().length > 0)) {
                    return scope.val;
                  }
                  else {
                    return scope.emptyMessage;
                  }
                }

                var enterEdition = function() {
                  isEdit = true;
                  element.addClass("edit");
                  $input.focus();
                  $input.val(scope.val);
                }

                scope.validate = function(val) {
                  var trimmed = val.trim();
                  return (trimmed.length > 0);
                }

                var quitEdition = function() {
                  if (!isEdit) {
                    return;
                  }
                  var candidate = $input.val();
                  if (scope.validate(candidate)) {
                    scope.val = candidate.trim();
                    scope.$apply();
                    element.removeClass("edit");
                  }
                  isEdit = false;
                }

                var toggleEdition = function() {
                  if (isEdit) {
                    quitEdition();
                  }
                  else {
                    enterEdition();
                  }
                }

                toggleEdition = debouncer(toggleEdition, 100);

                $input.blur(toggleEdition);
                $input.change(toggleEdition);
                element.click(toggleEdition);

            }
        }
    });

    app.directive('multiSelect', function(){
        return {
            require: 'ngModel',
            scope: true,
            link: function(scope, element, attrs, ngModel){
                scope.selectedItems = [];
                scope.allToggled = false;
                scope.someToggled = false;

                scope.toggleItem = function(item){
                    if (scope.selectedItems.indexOf(item) < 0) {
                        scope.selectedItems.push(item);
                    } else {
                        scope.selectedItems.splice(scope.selectedItems.indexOf(item), 1);
                    }
                    scope.allToggled = scope.selectedItems.length === ngModel.$viewValue.length;
                    scope.someToggled = scope.selectedItems.length > 0 && !scope.allToggled;

                    item.selected = !item.selected;
                };
                scope.toggleAll = function(){
                    var selected;
                    if(!scope.allToggled){
                        scope.selectedItems = angular.copy(ngModel.$viewValue);
                        selected = true;
                    } else {
                        scope.selectedItems = [];
                        selected = false;
                    }
                    scope.allToggled = scope.selectedItems.length === ngModel.$viewValue.length;
                    scope.someToggled = scope.selectedItems.length > 0 && !scope.allToggled;

                    angular.forEach(ngModel.$viewValue, function(item){
                        item.selected = selected;
                    });
                };
                scope.$on('clearMultiSelect', function(){
                    scope.selectedItems = [];
                    angular.forEach(ngModel.$viewValue, function(item){
                        item.selected = false;
                    });
                    scope.allToggled = false;
                    scope.someToggled = false;
                });
            }
        };
    });


    app.directive('modal', function($window, $timeout){
        // This directive ensure the proper height of the modals
        return {
            restrict: 'C',
            link: function(scope, element, attrs){
                if (attrs.autoSize == "false") return;

                var content = element.find('.modal-body');

                // body height
                content.css('height', 0); //to get the padding height
                var paddingHeight = content.innerHeight();
                content.css('height', '');


                function findOverflown(node){
                    if (node === undefined)
                        return [];
                    var overflownNodes = [];
                    for (var i = node.childNodes.length - 1; i >= 0; i--) {
                        var child = node.childNodes[i];
                        if (child.offsetHeight > 0){
                            var overflowCss = $(child).css('overflow');
                            var overflowYCss = $(child).css('overflow-y');
                            var scrollValues = ['auto', 'scroll'];
                            if (contains(scrollValues, overflowCss) || contains(scrollValues, overflowYCss)) {
                                // Special code mirror cases
                                if(!$(child).hasClass('CodeMirror-hscrollbar') && !$(child).hasClass('CodeMirror-vscrollbar')){
                                    overflownNodes.push(child);
                                }
                            } else {
                                overflownNodes = overflownNodes.concat(findOverflown(child));
                            }
                        }
                    }
                    return overflownNodes;
                }

                var sizeModal = function(){
                    // sometimes the modal-body is not instantiated at load, get it (again) here. If the
                    // modal-body was not there at modal creation time, then padding might be crappy
                    var content = element.find('.modal-body');
                    if (content.hasClass('modal-no-sizing')) return;

                    var oldMinHeight = content.css('minHeight');
                    content.css('height', '');
                    content.css('minHeight', '');
                    // find overflown elements
                    // We maximize the height of overflown content so they'll be the ones with the scrollbar
                    // var overflown = content.find('*').filter(function () {
//                         // select only the overflown content visible (positive height)
//                         return ['auto', 'scroll'].indexOf($(this).css('overflow')) >= 0 && this.offsetHeight > 0;
//                     });
//
                    var overflown = $(findOverflown(content[0]));

                    // remember current scroll position
                    var scrolls = overflown.map(function(){return this.scrollTop;});

                    overflown.css({'maxHeight': 'none', height: 0});
                    // height of non overflown content
                    var nonOverflownHeight = content.innerHeight();

                    overflown.height('');
                    var newHeight;
                    if (element.innerHeight() > $($window).height()) {
                        newHeight = $($window).height() - element.find('.modal-header').innerHeight() - element.find('.modal-footer').innerHeight() - paddingHeight - 10*2;
                    } else {
                        newHeight = content.innerHeight() - paddingHeight;
                    }
                    // preventing borders to be blurry : since modals are going to be centered on the screen, if the
                    // window height ends up being odd, then everything is going to be 1/2 pixel misaligned, and
                    // borders become all blurry messes... So we fix the modal-body height to be even. The rest of
                    // the window height is header+footer, so you have to set their size(s) to obtain a final even height.
                    if ( element.innerHeight() % 2 == 1 ) {
                        var maxHeight = parseInt(content.css('maxHeight'));
                        if ( newHeight + 1 > maxHeight) {
                            content.css('height', newHeight - 1);
                        } else {
                            content.css('height', newHeight + 1);
                        }
                    }

                    if(overflown.length){
                        // dispatch the remaining height between overflown content
                        var heightPerOverflown = (content.innerHeight() - nonOverflownHeight) / overflown.length;
                        if (heightPerOverflown > 0) {
                            overflown.height(heightPerOverflown);
                        }
                        // is the focused element within the modal ?
                        if(! $(document.activeElement).parents(element).length){
                            // focus overflow to allow scroll
                            overflown.attr('tabindex', 0).focus();
                        }
                        overflown.each(function(i){
                            // preserve former scroll
                            $(this).scrollTop(scrolls[i]);
                        });
                    }
                    content.css('minHeight', oldMinHeight);
                };

                // resize when window change
                $($window).on('resize.modal', sizeModal);
                // resize when something change (tab change, form expand...)
                scope.$watch(sizeModal, null);
                // init resize
                sizeModal();


                scope.$on('$destroy', function(){
                    $($window).off('resize.modal');
                });

                // focus first input
                element.find('input').first().focus();
            }
        };
    });

    app.directive('bsTypeahead', function($window){
        return {
            priority: 100,
            link: function(scope,element, attr){
                var typeahead = element.data('typeahead');

                // override show function
                typeahead.show = function () {
                    var pos = $.extend({}, this.$element.offset(), {
                        height: this.$element[0].offsetHeight
                    });

                    $(document.body).append(this.$menu);
                    this.$menu.addClass(attr.class);
                    this.$menu.css({
                        position: 'absolute',
                        top: pos.top + pos.height,
                        left: pos.left,
                        'z-index': 5000
                    }).show();

                    this.shown = true;
                    return this;
                };
            }
        };
    });

    //select diplaying columns of a provided schema together with their types
    app.directive('columnSelect', function($compile){
        return {
            restrict:'E',
            scope: {
                selectedColumn: '=ngModel',
                columns: '=',
                disableTypes: '='
            },
            template: '<select '+
                    ' dku-bs-select="{\'liveSearch\' : true}" '+
                    ' ng-model="uiState.selectedColumn"'+
                    ' class="qa_recipe_split-select-column"'+
                    ' ng-options="column.name as column.name for column in columns"'+
                    ' options-annotations="types" '+
                    ' />',
            link: {
                pre: function(scope, element, attrs) {
                    //compute types in prelink function so that it is available to optionsAnnotations
                    function computeTypes() {
                        scope.types = scope.disableTypes ? [] : scope.columns.map(function(column){ return column.type});
                    }
                    computeTypes();
                    scope.uiState = {selectedColumn: scope.selectedColumn};
                    scope.$watch("columns", computeTypes, true);
                    scope.$watch("uiState.selectedColumn", function(){
                        scope.selectedColumn = scope.uiState.selectedColumn;
                    });
                    scope.$watch("selectedColumn", function(){
                        scope.uiState.selectedColumn = scope.selectedColumn;
                    });
                }
            }
        };
    });

    //select diplaying columns of a provided schema together with their types with provided filter
    app.directive('columnSelectWithFilter', function($compile){
        return {
            restrict:'E',
            scope: {
                selectedColumn: '=ngModel',
                columns: '=',
                disableTypes: '=',
                filterFn: '='
            },
            template: '<select '+
                    ' dku-bs-select="{\'liveSearch\' : true}" '+
                    ' ng-model="uiState.selectedColumn"'+
                    ' class="qa_recipe_split-select-column"'+
                    ' ng-options="column.name as column.name for column in columns | filter: filterFn"'+
                    ' options-annotations="types" '+
                    ' />',
            link: {
                pre: function(scope, element, attrs) {
                    //compute types in prelink function so that it is available to optionsAnnotations
                    function computeTypes() {
                        scope.types = scope.disableTypes ? [] : scope.columns.filter(scope.filterFn).map(function(column){ return column.type});
                    }
                    computeTypes();
                    scope.uiState = {selectedColumn: scope.selectedColumn};
                    scope.$watch("columns", computeTypes, true);
                    scope.$watch("uiState.selectedColumn", function(){
                        scope.selectedColumn = scope.uiState.selectedColumn;
                    });
                    scope.$watch("selectedColumn", function(){
                        scope.uiState.selectedColumn = scope.selectedColumn;
                    });
                }
            }
        };
    });

    app.directive('mlColumnSelectWithType', function() {
        return {
            restrict: 'E',
            scope: {
                perFeature: "=",
                selectedColumn: "=ngModel",
                // authorizedTypes is optional. If not specified, all types are authorized. Otherwise,
                // must be an array of authorized types (e.g ["CATEGORY", "NUMERIC"])
                authorizedTypes: "=",
                // authorizedRoles is optional. If not specified, all roles are authorized. Otherwise,
                // must be an array of authorized roles (e.g ["INPUT", "REJECT"])
                authorizedRoles: "=",
                // alreadyComputedColumns is optional. If specified, must be a Set.
                alreadyComputedColumns: "=",
            },
            template: '<select ng-model="selectedColumn"' +
                      '        dku-bs-select="{\'liveSearch\':true}"' +
                      '        options-annotations="columnsAnnotations">' +
                      '    <option ng-repeat="c in columns"' +
                      '            value="{{c.name}}"' +
                      '            data-content="<div title={{c.name}} class=\'ml-col-select__item\'><div class=\'ml-col-select__icon-wrapper\'>{{c.icon}}</div> {{c.name}}</div>">' +
                      '            {{c.name}}' +
                      '    </option>' +
                      '</select>',
            link: function($scope, element, attrs) {
                function getIconFromType(type) {
                    switch(type) {
                        case "NUMERIC":
                            return "#";
                        case "CATEGORY":
                            return "<span class='icon icon-font'></span>"
                        case "TEXT":
                            return "<span class='icon-italic'></span>"
                        case "VECTOR":
                            return "<span style='font-size: 14px'>[ ]</span>"
                        default:
                            return "";
                    }
                }

                function setUpColumns() {
                    $scope.columns = Object.keys($scope.perFeature)
                        .filter(x => {
                            const isTypeAuthorized = !$scope.authorizedTypes || $scope.authorizedTypes.includes($scope.perFeature[x].type);
                            const isRoleAuthorized = !$scope.authorizedRoles || $scope.authorizedRoles.includes($scope.perFeature[x].role);
                            return isTypeAuthorized && isRoleAuthorized;
                            })
                        .sort()
                        .map(v => {
                            return {
                                name: v,
                                isComputed: ($scope.alreadyComputedColumns && $scope.alreadyComputedColumns.has(v)),
                                icon: getIconFromType($scope.perFeature[v].type)
                            }
                        });

                    $scope.columnsAnnotations = $scope.columns.map(v => v.isComputed ? 'already computed' : '');
                }

                $scope.$watch("perFeature", function(nv) {
                    if (nv !== undefined) {
                        setUpColumns();
                    }
                });

                $scope.$watch("alreadyComputedColumns", function(nv) {
                    if (nv !== undefined) {
                        setUpColumns();
                    }
                });

            }
        }
    });


    app.directive('mappingEditor',function(Debounce, $timeout) {
        return {
            restrict:'E',
            scope: {
                mapping: '=ngModel',
                onChange: '&',
                noChangeOnAdd: '<',
                addLabel: '@',
                validate: '=?',
                withColor: '=?',
                keepInvalid: '=?',
                required: '<',
                typeAhead: '='
            },
            templateUrl : '/templates/shaker/mappingeditor.html',
            compile: () => ({
                pre: function (scope, element, attrs) {
                    const textarea = element.find('textarea');
                    textarea.on('keydown', function (e) {
                        let keyCode = e.keyCode || e.which;
                        //tab key
                        if (keyCode === 9) {
                            e.preventDefault();
                            if (!scope.$$phase) scope.$apply(function () {
                                let tabPosition = textarea[0].selectionStart;
                                scope.bulkMapping = scope.bulkMapping.slice(0, tabPosition) + '\t' + scope.bulkMapping.slice(tabPosition);
                                $timeout(function () {
                                    textarea[0].selectionEnd = tabPosition + 1;
                                });
                            });
                        }
                    });
                    scope.changeMode = function () {
                        if (!scope.showBulk) {
                            scope.bulkMapping = scope.mapping.map(m => (m.from === undefined ? '' : m.from) + '\t' + (m.to === undefined ? '' : m.to)).join('\n');
                        }
                        scope.showBulk = !scope.showBulk;
                    };

                    scope.$watch('bulkMapping', Debounce().withDelay(400, 400).wrap(function (nv, ov) {
                            if (!angular.isUndefined(nv)) {
                                if (!nv.length) {
                                    scope.mapping = [];
                                } else {
                                    scope.mapping = nv.split('\n').map(l => {
                                        //regexp to split into no more than 2 parts (everything to the right of a tab is one piece)
                                        const parts = l.split(/\t(.*)/);
                                        return {from: parts[0], to: parts[1]};
                                    });
                                }
                            }
                        })
                    );
                    if (angular.isUndefined(scope.mapping)) {
                        scope.mapping = [];
                    }
                    if (!scope.addLabel) scope.addLabel = 'Add another';
                    if ('preAdd' in attrs) {
                        scope.preAdd = scope.$parent.$eval(attrs.preAdd);
                    } else {
                        scope.preAdd = Object.keys(scope.mapping).length === 0;
                    }
                    if (scope.onChange) {
                        scope.callback = scope.onChange.bind(scope, {mapping: scope.mapping});
                    }
                }
            })

        };
    });

    /**
     * Simple form form a sampling edition with partitions and no filters.
     * Supports changing dataset on the fly
     * Does not support auto refresh mechanism.
     */
    app.directive("samplingFormWithPartitions", function(DataikuAPI, $stateParams,
                DatasetInfoCache, DatasetUtils, Fn, SamplingData) {
        return {
            scope : {
                selection : '=',
                datasetSmartName : '=',
                backendType : '='
            },
            templateUrl : '/templates/widgets/sampling-form-with-partitions.html',
            link : function($scope) {
                $scope.SamplingData = SamplingData;
                $scope.getPartitionsList = function () {
                    return DataikuAPI.datasets.listPartitions($scope.dataset).error(setErrorInScope.bind($scope))
                        .then(function (ret) {
                            return ret.data;
                        });
                };

                $scope.$watch("datasetSmartName", function(nv, ov) {
                    if (nv) {
                        var loc = DatasetUtils.getLocFromSmart($stateParams.projectKey, $scope.datasetSmartName);
                        var promise = DatasetInfoCache.getSimple(loc.projectKey, loc.name)
                        promise.then(function(data){
                            $scope.dataset = data;
                            if ($scope.dataset.partitioning.dimensions.length == 0){
                                $scope.selection.partitionSelectionMethod = "ALL";
                            }
                            $scope.$broadcast("datasetChange")
                        });
                    }
                });
            }
        }
    });


    /**
     * Simple form for sampling edition with partitions and no filters.
     * Supports changing dataset on the fly
     * Does not support auto refresh mechanism.
     */
    app.directive("partitionedModelForm", function(DataikuAPI, $stateParams,
                                                         DatasetInfoCache, DatasetUtils) {
        return {
            scope : {
                partitionedModel : '=',
                splitPolicy: '=',
                datasetSmartName : '=',
                backendType : '='
            },
            templateUrl : '/templates/widgets/partitioned-model-form.html',
            link : function($scope) {
                $scope.getPartitionsList = function () {
                    return DataikuAPI.datasets.listPartitions($scope.dataset)
                        .error(setErrorInScope.bind($scope))
                        .then(resp => resp.data);
                };

                $scope.partitioningDisabledReason = function () {
                    if (!$scope.dataset) {
                        return "Loading…";
                    } else if ($scope.dataset.partitioning.dimensions.length == 0) {
                        return "input dataset is not partitioned";
                    } else if ($scope.splitPolicy != 'SPLIT_MAIN_DATASET') {
                        return "train/test split policy is not compatible";
                    }
                    return; // not disabled
                };

                $scope.dimensionsList = function() {
                    return $scope.dataset.partitioning.dimensions
                        .map(dim => `<b>${sanitize(dim.name)}</b>`)
                        .join(', ');
                };

                $scope.$watch("datasetSmartName", function(nv) {
                    if (nv) {
                        const loc = DatasetUtils.getLocFromSmart($stateParams.projectKey, $scope.datasetSmartName);
                        DatasetInfoCache.getSimple(loc.projectKey, loc.name).then(function(data){
                            $scope.dataset = data;
                            if ($scope.dataset.partitioning.dimensions.length === 0){
                                $scope.partitionedModel.ssdSelection.partitionSelectionMethod = "ALL";
                            }
                            $scope.$broadcast("datasetChange")
                        });
                    }
                });
            }
        }
    });


    /**
     * Simple form for a sampling edition with no partitions and no filters.
     * Supports changing dataset on the fly
     * Does not support auto refresh mechanism.
     */
    app.directive("samplingFormWithoutPartitions", function(DataikuAPI, $stateParams,
                DatasetInfoCache, DatasetUtils, SamplingData, Fn){
        return {
            scope : {
                selection : '=',
                backendType : '='
            },
            templateUrl : '/templates/widgets/sampling-form-without-partitions.html',
            link : function($scope) {
                $scope.SamplingData = SamplingData;
            }
        }
    });

    /**
     * Simple form for inserting ordering rules for export/sampling
     * which is a list of columns and order (asc or desc)
     */
    app.directive("orderingRulesForm", function() {
        return {
            scope: {
                rules: '='
            },
            templateUrl: '/templates/widgets/ordering-rules-form.html'
        };
    });

    app.directive("ngScopeElement", function () {
        var directiveDefinitionObject = {
            restrict: "A",
            compile: function compile(tElement, tAttrs, transclude) {
                return {
                    pre: function preLink(scope, iElement, iAttrs, controller) {
                        scope[iAttrs.ngScopeElement] = iElement;
                    }
                };
            }
        };
        return directiveDefinitionObject;
    });


    app.directive('customElementPopup', function($timeout, $compile, $rootScope) {
        // Attrs:
        //   - cep-position = align-left-bottom, align-right-bottom, smart
        //   - cep-width = fit-main (adapt size of popover to size of mainzone)
    return {
        restrict: 'A',
        scope: true, // no isolated scope, we want our user to call us
        compile: function(element, attrs) {
            var closeOthers = attrs.closeOthers !== "false",  // opt-out
                closeOnClick = attrs.closeOnClick === "true", // opt-in
                allowModals = attrs.allowModals === "true", // don't close after modal is opened/closed
                popoverTemplate = element.find('.popover').detach(),
                dismissDeregister = null
            return function($scope, element, attrs) {
                var identifier = {}, popover = null,
                    position = attrs.cepPosition || "align-left-bottom",
                    hidePopoverButton = attrs.hidePopoverButton === "true",
                    startMainZone = $(".mainzone", element),
                    popoverShown = false,
                    onHideCallback = attrs.onHideCallback,
                    onShowCallback = attrs.onShowCallback;

                function isChildOfPopup(target) {
                    return $(target).closest(popover).length > 0;
                }

                function hideIfNoIdentifierOrNotMe(event, evtIdentifier) {
                    const isButtonClicked = $(event.target).closest(element).length > 0;
                    if (isButtonClicked || allowModals && $(event.target).closest('.modal-container, .modal-backdrop').length > 0) {
                        return;
                    }
                    const evtIdChange = (!evtIdentifier || identifier !== evtIdentifier);
                    if (evtIdChange && !isChildOfPopup(event.target) && !(evtIdentifier &&  isChildOfPopup(evtIdentifier))){
                        hide();
                    }
                }
                function hide() {
                    if (popover) {
                        popover.hide().detach();
                    }
                    $timeout(() => {popoverShown = false;});
                    $("html").unbind("click", hideIfNoIdentifierOrNotMe);
                    (startMainZone.length ? startMainZone : $(".mainzone", element)).removeClass('popover-shown');
                    if (onHideCallback && $scope.$eval(onHideCallback) instanceof Function) {
                        $scope.$eval(onHideCallback)();
                    }
                }
                function addPositionOffset(direction, value) {
                    try {
                        var res = value + parseInt(attrs['cepOffset' + direction]);
                        return isNaN(res) ? value : res;
                    } catch(e) {
                        return value;
                    }
                }
                function show() {
                    // clear other sub-popovers
                    $rootScope.$broadcast('dismissSubPopovers');
                    var mainZone = startMainZone.length ? startMainZone : $(".mainzone", element),
                        mzOff = mainZone.offset();
                    popoverShown = true;
                    if (popover === null) {
                        popover = $compile(popoverTemplate.get(0).cloneNode(true))($scope);
                        // here the template is compiled but not resolved
                        // => popover.innerWidth() etc. are incorrect until the next $digest
                    }
                    popover.css('visibility', 'hidden').appendTo("body");

                    window.setTimeout(function() {  // see above
                        switch (position) {
                        case 'align-left-bottom':
                            popover.css({
                                left: addPositionOffset('Left',mzOff.left),
                                top: addPositionOffset('Top',mzOff.top + mainZone.innerHeight())
                            });
                            break;
                        case 'align-right-bottom':
                            popover.css({
                                top: addPositionOffset('Top',mzOff.top + mainZone.innerHeight()),
                                left: addPositionOffset('Left', mzOff.left + mainZone.innerWidth() - popover.innerWidth())
                            });
                            break;
                        case 'smart':
                            var offset = { left: 'auto', right: 'auto', top: 'auto', bottom: 'auto' };
                            if (mzOff.left * 2 < window.innerWidth) {
                                offset.left = mzOff.left;
                            } else {
                                offset.right = window.innerWidth - mzOff.left - mainZone.innerWidth();
                            }
                            if (mzOff.top * 2 < window.innerHeight) {
                                offset.top = mzOff.top + mainZone.height();
                            } else {
                                offset.bottom = window.innerHeight - mzOff.top;
                            }
                            popover.css(offset);
                            break;
                        case 'align-left-top':
                            if (hidePopoverButton) {
                                popover.css({ left: mzOff.left, top: mzOff.top, bottom: 'auto' });
                            } else {
                                popover.css({ left: mzOff.left, bottom: window.innerHeight - mzOff.top, top: 'auto' });
                            }
                            break;
                        case 'align-right':
                            popover.css({ left: mzOff.left+mainZone.outerWidth(), top: mzOff.top, bottom: 'auto' });
                            break;
                        case 'align-right-top':
                            popover.css({ left: mzOff.left + mainZone.innerWidth() - popover.innerWidth(),
                                bottom: window.innerHeight - mzOff.top, top: 'auto' });
                            break;
                        }
                        if (attrs.cepWidth === 'fit-main') {
                            popover.css("width", mainZone.innerWidth());
                        }
                        popover.css('visibility', 'visible');
                    }, 0);

                    popover.show();
                    mainZone.addClass('popover-shown');
                    popover.add(".mainzone", element).off("click.dku-pop-over");
                    popover.on("click.dku-pop-over", function(e) {
                            if (closeOthers) {
                                $("html").triggerHandler('click.cePopup', identifier);
                            }
                        });
                    $(".mainzone", element).on("click.dku-pop-over", function(e) {
                        if (closeOthers) {
                            $("html").triggerHandler('click.cePopup', identifier);
                        }
                    });
                    if (closeOnClick) popover.on("click.dku-pop-over", hide);
                    window.setTimeout(function() {
                        $("html").on('click.cePopup', function (event, evtIdentifier) {
                            hideIfNoIdentifierOrNotMe(event, evtIdentifier);
                        });
                    }, 0);

                    if (dismissDeregister) {
                        dismissDeregister();
                    }
                    dismissDeregister = $rootScope.$on("dismissPopovers", function(){
                        if (!allowModals) {
                            hide();
                            if (dismissDeregister) {
                                dismissDeregister();
                                dismissDeregister = null;
                            }
                        }
                    });

                    if (onShowCallback && $scope.$eval(onShowCallback) instanceof Function) {
                        $scope.$eval(onShowCallback)();
                    }
                }

                $scope.showPopover = show;
                $scope.hidePopover = hide;
                $scope.popoverShown = function() { return popoverShown; };
                $scope.togglePopover = function(event) {
                    if (popoverShown) {
                        hide();
                    }
                    else {
                        if (event) $("html").triggerHandler('click.cePopup', identifier);
                        show();
                    }
                };
            };
        } };
    });

    app.directive("sidebarTabL1Link", function($filter, $timeout){
        return {
            template: '<li class="l1" tab-active="{{tabName}}" full-click><a main-click tab-set="{{tabName}}">{{label}}</a></li>',
            replace: true,

            priority: 100,
            scope : {
                tabName : "@",
                label : "@"
            }
        }
    });
    app.directive("sidebarTabL2Link", function($compile){
        return {
            replace: true,

            priority: 100,
            scope : {
                tabName : "@",
                label : "@",
                disabledLink: "@",
                disableMessage: "@",
                sidekickPulsar: "="
            },
            link : function(scope, element, attrs) {
                scope.$watch(() => attrs.disableLink, () => {
                    let template;
                    if (scope.$eval(attrs.disableLink)) {
                        template = `<li toggle="tooltip" container="body" title="{{disableMessage}}" style="opacity: 0.5">
                        <div class="l2">{{label}}</div>
                    </li>`;
                    } else {
                        template = '<li class="l2" tab-active="{{tabName}}" full-click><div class="padded"><a main-click tab-set="{{tabName}}">{{label}}<span class="mleft8 sidekick-pulsar" ng-if="sidekickPulsar"></a></span></a></div></li>';
                    }
                    element.html(template);
                    $compile(element.contents())(scope);
                });
            }
        }
    });
    app.directive("topLevelTabState", function($filter, $timeout, $rootScope){
        return {
            template: '<a class="tab" ng-class="{\'enabled\' : topNav.tab == tabName}" ui-sref="{{sref}}">{{label}}</a>',
            replace: true,
            scope : {
                tabName : "@",
                sref : "@",
                label: '@'
            },
            link : function($scope) {
                $scope.topNav = $rootScope.topNav;
            }
        }
    });

    var getHeaderHideClass = function(makeSeeThrough) {
        return makeSeeThrough ? 'see-through' : 'non-see-through';
    }

    app.directive("dkuModalHeaderHideBtn", function($filter, $timeout) {
        return {
            template : '<button type="button" class="close see-through"  aria-hidden="true" ng-mouseenter="setSeeThrough(true)" ng-mouseleave="setSeeThrough(false)" >&minus;</button>',
            scope : { modalTitle : "@", modalTotem : "@" },
            replace : true,
            link: function(scope, element) {
                scope.isSeeThrough=false;

                scope.setSeeThrough = function (on) {
                    scope.isSeeThrough = on;
                    var divs = $('div.modal-container, div.modal-backdrop, div.popover');
                    var toAdd = getHeaderHideClass(scope.isSeeThrough);
                    var toRemove = getHeaderHideClass(!scope.isSeeThrough);
                    divs.addClass(toAdd).removeClass(toRemove + " restored");
                }
            }
        }
    });

    app.directive("dkuModalHeader", function($filter, $timeout) {
        return {
            template : '<div class="modal-header no-totem {{modalClass}}"  ng-class="{\'has-tabs\': hasTabs()}">'+
            '  <button type="button" class="close" data-dismiss="{{modalClose && modalClose() ? \'\' : \'modal\'}}" ng-click="close()" aria-hidden="true">&times;</button>'+
            '  <dku-modal-header-hide-btn></dku-modal-header-hide-btn>'+
            '  <div ng-if="hasMenu()" ng-transclude="menu"></div>' +
            '  <h4 ng-transclude="title">{{modalTitle}}</h4>' +
            '  <ul ng-if="hasTabs()" class="modal-tabs" ng-transclude="tabs"></ul>'+
            '</div>',
            scope : { modalTitle: "@", modalClass: "@", modalTabs: "@", modalClose: "&"},
            replace : true,
            transclude: {
                'title': '?dkuModalTitle',
                'tabs': '?dkuModalTabs',
                'menu': '?dkuModalMenu'
            },
            link: function (scope, element, $attrs, $thisCtrl, $transclude) {
                scope.close = function () {
                    if (scope.modalClose && scope.modalClose() instanceof Function) return scope.modalClose()();
                    return false;
                };
                scope.has = function (section) {return $transclude.isSlotFilled(section);}
                scope.hasTabs = function() {return scope.has("tabs")}
                scope.hasMenu = function() {return scope.has("menu")}
            }
        }
    });

    app.directive("dkuModalHeaderWithTotem", function($filter, $timeout) {
        return {
            template : '<div class="modal-header has-border {{modalClass}}" ng-class="{\'has-tabs\': hasTabs()}" >'+
                       '  <div class="modal-totem"> <i class="{{modalTotem}}" /></div>'+
                       '  <button type="button" class="close" data-dismiss="{{modalClose && modalClose() ? \'\' : \'modal\'}}" ng-click="close()" aria-hidden="true">&times;</button>' +
                       '  <dku-modal-header-hide-btn></dku-modal-header-hide-btn>'+
                       '  <h4 ng-transclude="title">{{modalTitle}}</h4>' +
                       '  <ul ng-if="hasTabs()" class="modal-tabs" ng-transclude="tabs"></ul>'+
                       '</div>',
            scope : { modalTitle : "@", modalTotem : "@", modalClass: "@", modalTabs: "@", modalClose: "&" },
            replace : true,
            transclude: {
                'title': '?dkuModalTitle',
                'tabs': '?dkuModalTabs'
            },
            link: function (scope, element, $attrs, $thisCtrl, $transclude) {
                scope.close = function () {
                    if (scope.modalClose && scope.modalClose() instanceof Function) return scope.modalClose()();
                    return false;
                }
                scope.hasTabs = function () {return $transclude.isSlotFilled('tabs');}
            }

        }
    });

    app.directive("dkuModalHeaderMinimum", function($filter, $timeout) {
        return {
            template : '<div class="modal-header no-totem {{modalClass}}">' +
            '  <h4 ng-transclude="title">{{modalTitle}}</h4>' +
            '</div>',
            scope : { modalTitle: "@", modalClass: "@"},
            replace : true,
            transclude: {
                'title': '?dkuModalTitle'
            }
        }
    });



    app.directive('dkuEnter', function() {
        return function(scope, element, attrs) {
            element.bind("keydown keypress", function(event) {
                if(event.which === 13) {
                        scope.$apply(function(){
                                scope.$eval(attrs.dkuEnter, {$event: event});
                        });
                        event.preventDefault();
                }
            });
        };
    });


    app.directive('cancelOnEscape', function() {
        return function(scope, element, attrs) {
            var val = element.val();

            element.bind("focus", function(event) {
                val = element.val();
            });

            element.bind("keydown keypress", function(event) {
                if(event.which === 27) {
                    element.val(val);
                    element.blur();
                    event.preventDefault();
                }
            });
        };
    });

    app.directive('svgTitles', function($sanitize) {
        function go(tooltip, stack, evt) {
            if (stack.length) {
                if (evt) {
                    var pos = {};
                    if (evt.clientX * 2 > window.innerWidth ) {
                        pos.right = (window.innerWidth - evt.clientX) + 'px';
                        pos.left  = 'auto';
                    } else {
                        pos.left  = evt.clientX + 'px';
                        pos.right = 'auto';
                    }
                    if (evt.clientY * 2 > window.innerHeight) {
                        pos.bottom = (window.innerHeight - evt.clientY) + 'px';
                        pos.top    = 'auto';
                    } else {
                        pos.top    = evt.clientY + 'px';
                        pos.bottom = 'auto';
                    }
                    tooltip.style(pos);
                }
                tooltip.html($sanitize(stack[stack.length - 1].getAttribute('data-title')));
                tooltip.style({display: 'block'});
            } else {
                tooltip.style({display: 'none', left: '0', top: '0'});
            }
        }
        return { restrict: 'A', scope: false, controller: function($element) {
            var _elt = $element.get(0),
                elt = _elt.tagName.toLowerCase() === 'svg' ? _elt : _elt.querySelector('svg'),
                svg = d3.select(elt),
                stack = [],
                tooltip = d3.select(document.body.insertBefore(document.createElement('div'), null))
                            .attr('class', 'svg-title-tooltip');
            return {
                update: function() {
                    svg.selectAll('[data-title]')
                    .on('mouseover.svgTitle', function mouseover() {
                        var i = stack.indexOf(this);
                        if (stack.length === 0 || i + 1 !== stack.length) {
                            if (i !== -1) { stack.splice(i, 1); }
                            stack.push(this);
                        }
                        go(tooltip, stack, d3.event);
                    }).on('mouseout.svgTitle', function mouseout() {
                        var i = stack.indexOf(this);
                        if (i !== -1) { stack.splice(i, 1); }
                        go(tooltip, stack, d3.event);
                    });
                },
                delete: function() {
                    tooltip.remove();
                }
            };
        }, link: function(scope, element, attrs, ctrl) {
            ctrl.update();
            scope.$on('$destroy', ctrl.delete);
        } };
    });

    app.directive('dkuBetterTooltip', function($timeout, $compile, $rootScope, $sanitize) {
        // Attrs:
        //   - dbt-placement = "top" / "bottom"
        //   - dbt-title
        var ret = {
            restrict : 'A',
        };
        ret.link = function(scope, element, attrs) {
            var tooltip = null;
            function show(){
                tooltip = $("<div />");
                tooltip.html($sanitize(attrs.dbtTitle));
                tooltip.addClass("dbt-tooltip");
                tooltip.css("pointer-events", "none");
                if (attrs.dbtClazz) {
                    tooltip.addClass(attrs.dbtClazz);
                }
                $("body").append(tooltip); //so we have access to dimensions

                var posLeft = 0;
                var posTop = 0;
                var left = $(element).offset().left;
                var top = $(element).offset().top;
                var placement = attrs.dbtPlacement;
                var appendToBody = attrs.appendToThis == undefined ? true: attrs.appendToBody;
                var rect = $(element).get(0).getBoundingClientRect();
                if (placement == "top") {
                    posLeft = left + rect.width / 2 - tooltip.width()/2;
                    posTop = top - tooltip.height() - 10;
                } else if(placement == "top-right"){
                    posLeft = left + rect.width;
                    posTop = top - tooltip.height() - 10;
                } else if(placement == "top-left"){
                    posLeft = left - tooltip.width() - 10;
                    posTop = top - tooltip.height() - 10;
                } else if(placement == "bottom-left"){
                    posLeft = left - tooltip.width() - 10;
                    posTop = top + rect.height;
                } else if(placement == "bottom-right"){
                    posLeft = left + rect.width;
                    posTop = top + rect.height;
                } else if(placement == "bottom"){
                    posLeft = left + rect.width / 2 - tooltip.width()/2;
                    posTop = top + rect.height;
                } else if(placement == "left"){
                    posLeft = left - tooltip.width() - 10;
                    posTop = top + rect.height / 2 - tooltip.height()/2;
                } else if(placement == "right"){
                    posLeft = left + rect.width;
                    posTop = top + rect.height / 2 - tooltip.height()/2;
                }
                tooltip.css("left", posLeft);
                tooltip.css("top", posTop);
                $("body").append(tooltip);
            }
            function hide(){
                tooltip.remove();
            }
            element.on("mouseover.dbt", show);
            element.on("mouseout.dbt", hide);
        };
        return ret;
    });

    app.directive('svgTooltip', function($timeout, $compile, $rootScope, $sanitize) {

        return {
            scope: false,
            restrict: 'A',
            link: function($scope, element, attrs) {

                var $container = $(attrs.container || 'body').filter(':visible');
                var $tooltip = $('<div class="svg-tooltip ' + (attrs.tooltipClass || '') + '"></div>').appendTo($container);

                $scope.setTooltipContent = function(content) {
                    $tooltip.html($sanitize(content));
                };

                $scope.hideTooltip = function() {
                    $tooltip.css("opacity", 0);
                };

                $scope.showTooltip = function(x, y) {
                    let containerOffset = $container.offset();
                    let elOffset = $(element).offset();
                    $tooltip.css("top", (y + elOffset.top - containerOffset.top + 5) + "px");
                    $tooltip.css("left", (x + elOffset.left - containerOffset.left +  5) + "px");
                    $tooltip.css("opacity", 1);
                };

                $scope.$on("$destroy", function() {
                   $tooltip.remove();
                });
            }
        };
    });


    /**
     * In the new dataset page, each dataset name is a link / pseudo-link to create the dataset.
     * This directive creates the link and handles how if should be shown (according to licence, uiCustomisation)
     * A few links should avoid the licence check. they should have a null type
     */
    app.directive('datasetType', function($rootScope, $state, GlobalProjectActions, $stateParams){
        return {
            restrict : 'A',
            replace : true,
            scope : {
                type : "<",
            },
            template: `<li ng-class="{'dataset-disabled': type.status == 'NOT_LICENSED_EE' || type.status == 'NO_CONNECTION', 'dataset-notlicensed-ce' : type.status == 'NOT_LICENSED_CE'}">
                <a ng-if="type.status == 'NOT_LICENSED_CE'" ng-click="showCERestrictionModal(type.label + ' dataset')">{{type.label}}</a>
                <a ng-if="type.status == 'NOT_LICENSED_EE'" toggle="tooltip" title="This dataset is not authorized by your license">{{type.label}}</a>
                <a ng-if="type.status == 'NO_CONNECTION'" toggle="tooltip" title="{{noConnectionTooltip}}">{{type.label}}</a>
                <a ng-if="type.status == 'SHOW' && type.clickCallback" ng-click="type.clickCallback()">{{type.label}}</a>
                <a ng-if="type.status == 'SHOW' && !type.clickCallback" ui-sref="projects.project.datasets.new_with_type.settings({type:type.type, zoneId:$stateParams.zoneId})">{{type.label}}</a>
            </li>`,
            link : function(scope) {
                scope.appConfig = $rootScope.appConfig;
                scope.showCERestrictionModal = $rootScope.showCERestrictionModal;
                scope.$state = $state;
                scope.$stateParams = $stateParams;
                scope.noConnectionTooltip = scope.type.disabledReason || `This dataset requires a connection that is not available. It may be because no such connection has been created by your administrator or because you don't have sufficient authorization`;
            }
        }
    });

    /**
     * This directive watches the width of the new dataset page, and automatically updates the width of a centered container so that the tiles are always centered and aligned.
     * I used this method because there is no way through css alone to guarantee that the tiles will flow correctly, that the plugin block will be aligned with the main block, and that the top-right links are aligned with the tiles.
     */
    app.directive('newDatasetPageAlignmentManager', function() { // new-dataset-page-alignment-manager
        return {
            restrict: 'A',
            link: function($scope, $element) {
                const tileWidth = 300;
                const resizeObserver = new ResizeObserver((el) => {
                    const elementWidth = el[0].contentRect.width;
                    $element.find('.new-dataset-page__centered-container').css('width', tileWidth * Math.floor(elementWidth / tileWidth));
                });

                resizeObserver.observe($element[0]);
                $scope.$on('$destroy', () => {
                    resizeObserver.disconnect();
                })
            }
        }
    })

    app.filter("singleChecklistState", function(){
        return function(input) {
            var total = 0, done = 0;
            input.items.forEach(function(x) {
                total++;
                if (x.done) done++;
            });
            if (total == 0) return "";
            return "<span>(" + done + "/" + total + " done)</span>";
        }
    });
    /** Emits "checklistEdited" on any change */
    app.directive('objectChecklist', function($rootScope, $state){
        return {
            restrict : 'A',
            scope : {
                "checklist" : "=",
                "itemsOnly" : "=",
                "readOnly" : "="
            },
            templateUrl: "/templates/widgets/checklist.html",
            link : function($scope, element, attrs) {
                $scope.state = {
                    addingItem : false,
                    editingItem : null, // The item being edited
                    editingItemText : null // The new text of the item being edited
                };

                $scope.onItemStateChange = function(){
                    $scope.$emit("checklistEdited", "item-state-change");
                };

                $scope.enterEditItem = function(item, $event){
                    if ($event.target.tagName.toLowerCase() == "a") {
                            return;
                    }
                    // Cancel the other one first
                    if ($scope.state.editingItem) {
                        $scope.cancelEditItem();
                    }

                    item.editingText = true;
                    $scope.state.editingItem = item;
                    $scope.state.editingItemText = item.text;

                    window.setTimeout(function() {
                        $(".checklist-items .edit-zone", element).on("click.checklistEditItem", function(e) {
                            e.stopPropagation();
                        });
                        $("html").on("click.checklistEditItem", function(event){
                            if ($(event.target).hasClass('modal-backdrop') || $(event.target.parentNode).hasClass('modal-header') || $(event.target.parentNode).hasClass('modal-footer')) {
                                return;
                            }
                            $scope.$apply(function(){$scope.cancelEditItem()});
                        })
                    }, 0);
                };

                $scope.validateEditItem = function(){
                    $scope.state.editingItem.text = $scope.state.editingItemText;
                    $scope.cancelEditItem();
                    $scope.$emit("checklistEdited", "validate-edit");
                };

                $scope.cancelEditItem = function(){
                    if ($('.codemirror-editor-modal').is(':visible')) {
                        return;
                    }
                    $scope.state.editingItem.editingText = false;
                    $scope.state.editingItem = null;
                    $scope.state.editingItemText = null;
                    $(".checklist-items .edit-zone", element).off("click.checklistEditItem");
                    $("html").off("click.checklistEditItem");
                };

                $scope.deleteItem = function(item) {
                    $scope.checklist.items.splice($scope.checklist.items.indexOf(item), 1);
                    $scope.$emit("checklistEdited", "delete");
                };

                $scope.enterAddItem = function() {
                    $scope.state.addingItem = true;
                    $scope.state.newItemText = "";
                    window.setTimeout(function() {
                        $(".new-item-zone", element).on("click.checklistAddNewItem", function(e) {
                                e.stopPropagation();
                        });

                        $("html").on("click.checklistAddNewItem", function(event){
                            if ($(event.target).hasClass('modal-backdrop') || $(event.target.parentNode).hasClass('modal-header') || $(event.target.parentNode).hasClass('modal-footer')) {
                                return;
                            }
                            $scope.$apply(function(){$scope.leaveAddItem()});
                        })
                    }, 0);
                };

                $scope.leaveAddItem = function(){
                    if ($('.codemirror-editor-modal').is(':visible')) {
                        return;
                    }
                    $scope.state.addingItem = false;
                    $(".new-item-zone", element).off("click.checklistAddNewItem");
                    $("html").off("click.checklistAddNewItem");
                };

                $scope.addNewItem = function() {
                    if ($scope.state.newItemText.length == 0) return;

                    $scope.checklist.items.push({
                        text : $scope.state.newItemText,
                        createdOn : new Date().getTime(),
                        createdBy : $rootScope.appConfig.login
                    });
                    $scope.$emit("checklistEdited", "add");
                    $scope.state.newItemText = "";
                };

                $scope.$watch("checklist", function(nv){
                    if (nv && nv.$newlyCreated) {
                        $scope.enterAddItem();
                        nv.$newlyCreated = false;
                    }
                });

                $scope.$on("$destroy", function(){
                    // noop
                })

            }
        }
    });


app.directive("sparkOverrideConfig", function($rootScope){
    return { // task = holder of sparkPreparedDFStorageLevel, MLTask or MLLib recipe desc
        scope : { config: '=', task: '=', taskType: '@' },
        templateUrl : '/templates/widgets/spark-override-config.html',
        link : function($scope, elem, attrs) {
            $scope.rootAppConfig = $rootScope.appConfig;
            /* Initialize with first Spark conf */
            $scope.$watch("config", function(nv, ov) {
                if (nv && nv.inheritConf == null) {
                    if ($rootScope.appConfig.sparkExecutionConfigs.length) {
                        nv.inheritConf = $rootScope.appConfig.sparkExecutionConfigs[0];
                    }
                }
            });
        }
    }
})

app.directive("dkuSlider", function($window, $timeout){
    return {
        scope : {
            min : '=',
            max : '=',
            value : '=',
            nbDecimalPlaces : '=?',
            onChange: '&?'
        },
        link: function($scope, elem, attrs) {

            $scope.sliding = false;

            $scope.startSliding = function($event) {
                $scope.computeNewCursorPosition($event);
                $scope.sliding = true;
                $($window).on('mouseup', $scope.stopSliding);
                $($window).on('mousemove', $scope.slideCursor);
            }

            $scope.slideCursor = function($event) {
                $event.preventDefault(); //useful to avoid selecting content on vertical mouse move while sliding
                if ($scope.sliding) {
                    $scope.computeNewCursorPosition($event);
                }
            }

            $scope.stopSliding = function() {
                $scope.sliding = false;
                $($window).off('mouseup', $scope.stopSliding);
                $($window).off('mousemove', $scope.slideCursor);
                $scope.value = $scope.cursorValue;
                if ($scope.onChange) {
                    $scope.onChange();
                }
                $timeout(function(){$scope.value = $scope.cursorValue;});
            }


            $scope.computeNewCursorPosition = function($event) {
                var sliderWidth = $(elem).width() - $(elem).find('.cursor').width() - 1;
                var sliderXPosition = $(elem).offset().left;
                var xPosition = $event.pageX - sliderXPosition;
                if (xPosition < 0) {
                    xPosition = 0;
                }
                if (xPosition > sliderWidth) {
                    xPosition = sliderWidth;
                }
                $(elem).find('.cursor').css('left',xPosition + 'px');
                $scope.computeNewScopeValue(xPosition, sliderWidth);
                $scope.fixExtremityVisibility();
            }

            $scope.roundAccordingToNbDecimalPlaces = function(num) {
                if (typeof($scope.nbDecimalPlaces)==='undefined') {
                    $scope.nbDecimalPlaces = 0;
                }
                return Number(Math.round(num + "e+"+$scope.nbDecimalPlaces) + "e-"+$scope.nbDecimalPlaces);
            }

            $scope.computeNewScopeValue = function(xPosition, sliderWidth) {
                var range = $scope.max - $scope.min;
                $scope.cursorValue = $scope.roundAccordingToNbDecimalPlaces(range*xPosition/sliderWidth + $scope.min);
                $(elem).find('.cursor-value').html($scope.cursorValue);
            }

            $scope.initCursorPosition = function() {
                if (typeof($scope.value)==='undefined') {
                    $scope.value = $scope.roundAccordingToNbDecimalPlaces(($scope.max - $scope.min)/2 + $scope.min);
                }
                $scope.cursorValue = $scope.value;
                var range = $scope.max - $scope.min;
                var xPosition = ($scope.value - $scope.min)*100/range;
                $(elem).find(".cursor").css("left", "auto");
                $(elem).find(".cursor").css("right", "auto");
                if (xPosition<50) {
                    $(elem).find('.cursor').css('left',xPosition + '%');
                } else {
                    $(elem).find('.cursor').css('right',100-xPosition + '%');
                }
                if (xPosition>90) {
                    $(elem).find('.range-max').css('opacity',0);
                }
                if (xPosition<10) {
                    $(elem).find('.range-min').css('opacity',0);
                }
            }

            $timeout(function() {
                $scope.initCursorPosition();
            });

            $scope.$watch("value", function(nv, ov) {
                if (!nv || !ov) return;
                $scope.initCursorPosition();
            });

            $scope.fixExtremityVisibility = function() {
                var cursorValueLeft = $(elem).find('.cursor-value').offset().left;
                var cursorValueRight = $(elem).find('.cursor-value').offset().left + $(elem).find('.cursor-value').width();
                var rangeMinRight = $(elem).find('.range-min').offset().left + $(elem).find('.range-min').width();
                var rangeMaxLeft = $(elem).find('.range-max').offset().left;
                var confortableGap = 5;
                if (rangeMinRight + confortableGap > cursorValueLeft) {
                    $(elem).find('.range-min').stop(true, false).fadeTo(40, 0);
                } else {
                    $(elem).find('.range-min').stop(true, false).fadeTo(40, 1);
                }
                if (rangeMaxLeft - confortableGap < cursorValueRight) {
                    $(elem).find('.range-max').stop(true, false).fadeTo(40, 0);
                } else {
                    $(elem).find('.range-max').stop(true, false).fadeTo(40, 1);
                }
            }

        },
        templateUrl : '/templates/widgets/dku-slider.html'
    }
});


app.directive("dkuArrowSlider",['$timeout', function($timeout) {
    return {
        restrict: "A",

        link: function(scope, elem, attrs) {

          /*
           * Inner variables
           */

            let frameSelector = attrs.frameSelector;
            let sliderSelector = attrs.sliderSelector;
            let slidingElementsSelector = sliderSelector + ' > *:visible';

            let minOffsetLeft = 0;
            let maxOffsetRight = 0;

            let modelListName = attrs.modelListName;

            scope.canSlideRightFlag = false;
            scope.canSlideLeftFlag = false;

          /*
           * Watchers / init
           */

            scope.$watch(modelListName, function(nv, ov) {
                let nvLength = nv ? nv.length : 0;
                let ovLength = ov ? ov.length : 0;
                //$timeout is needed to make sure slideToEnd is called after the currently processing $digest is done,
                //ie once the ng-repeat refresh is done and the new chip has been added
                $timeout(function() {
                    scope.computeNeedSlider();
                    if (scope.needSlider()) {
                        scope.initArrowSlider();
                    }
                    //$timeout to make sure arrow slider initialization is done (otherwise positioning computations may be off)
                    $timeout(function() {
                        if (nvLength < ovLength) {
                            if (!scope.needSlider()) {
                                slideToBegining();
                                removeArrowSliderStyle();
                            } else if (!isLastChipBeyondSliderBottom()) {
                                slideToEnd();
                            }
                        } else if (nvLength > ovLength) {
                            if (scope.needSlider()) {
                                slideToEnd();
                            } else {
                                scope.$broadcast('DKU_ARROW_SLIDER:animation_over');
                            }
                        }
                    }, 0);
                }, 0, false);
            }, true);

            scope.onResize = function() {
                scope.computeNeedSlider();
                if (!scope.needSlider()) {
                    slideToBegining();
                } else {
                    initOffsetsExtremas();
                    if (!isLastChipBeyondSliderBottom()) {
                        slideToEnd();
                    }
                    setCanSlideTags(scope.canSlideLeft(), scope.canSlideRight());
                }
                $timeout(function() {
                    scope.$apply();
                });
            }

            let loop;
            function resizeHandler() {
                clearTimeout(loop);
                loop = setTimeout(scope.onResize, 30);   //so that resize callback is called only once resize is done for good
            }

            $(window).on("resize.dkuArrowSlider", resizeHandler);
            scope.$on("$destroy", function(){
                $(window).off("resize.dkuArrowSlider", resizeHandler);
            });

            scope.$on("slideToId", function(event, frameSelectorAttr, sliderSelectorAttr, targetId) {
                if (frameSelector == frameSelectorAttr && sliderSelector == sliderSelectorAttr) {
                    slideToId(targetId);
                }
            });

            scope.initArrowSlider = function () {
                if (scope.needSlider()) {
                    $(frameSelector).css('position', 'relative');
                    $(sliderSelector).css('position', 'absolute');
                    $(sliderSelector).css('will-change', 'left');
                    $(sliderSelector).css('transition', 'left 150ms ease-out, right 150ms ease-out');
                    if (isNaN($(sliderSelector).css('left').replace('px', ''))) {
                        $(sliderSelector).css('left', '0px');
                        setCanSlideTags(false, true);
                    }
                    initOffsetsExtremas();
                    $timeout(function() {
                        scope.$broadcast("DKU_ARROW_SLIDER:arrow_slider_initialized");
                    });
                }
            };

           function removeArrowSliderStyle() {
                $(frameSelector).removeAttr("style");
                $(sliderSelector).removeAttr("style");
            }

            function initOffsetsExtremas() {
                minOffsetLeft = $(frameSelector).offset().left;
                maxOffsetRight = minOffsetLeft + $(frameSelector).width();
            }

            /*
            * Animation functions
            */

            scope.slideLeft = function() {
                let lastHiddenElement;
                let slidingElement = $(slidingElementsSelector);
                if (!slidingElement) return;
                for (let i = 0; i < slidingElement.length; i++) {
                    let elem = slidingElement[i];
                    if (!isElementVisible(elem)) {
                        lastHiddenElement = elem;
                    } else {
                        //if the element we wanna display is not the last one, make sure user can see there is more to come
                        if (i-1 > 0) {
                            let newSlidingElementLeft = getLeftAsNumber(sliderSelector) + getHiddenWidth(lastHiddenElement) + 20;
                            animatedSlide(newSlidingElementLeft);
                            setCanSlideTags(true, true);
                        } else {
                            slideToBegining();
                        }
                        break;
                    }
                }
            };

            scope.slideRight = function() {
                let lastHiddenElement;
                let slidingElement = $(slidingElementsSelector);
                if (!slidingElement) return;
                for (let i = slidingElement.length - 1; i >= 0; i--) {
                    let elem = slidingElement[i];
                    if (!isElementVisible(elem)) {
                        lastHiddenElement = elem;
                    } else {
                        //if the element we wanna display is not the last one, make sure user can see there is more to come
                        if (i + 1 < slidingElement.length - 1) {
                            let newSlidingElementLeft = getLeftAsNumber(sliderSelector) - getHiddenWidth(lastHiddenElement) - 20;
                            animatedSlide(newSlidingElementLeft);
                            setCanSlideTags(true, true);
                        } else {
                            slideToEnd();
                        }
                        break;
                    }
                }
            };

            function slideToBegining() {
                animatedSlide(0);
                setCanSlideTags(false, true);
            }

            function slideToEnd() {
                let newSlidingElementLeft = - (getTrueSliderWidth() - $(frameSelector).width()) -1 ;
                animatedSlide(newSlidingElementLeft);
                setCanSlideTags(true, false);
            }

            function slideToId(id) {
                let targetElementSelector = sliderSelector + ' > [id="'+ id +'"]:visible';
                if ($(targetElementSelector).length > 0 && !isElementVisible(targetElementSelector)) {
                    let targetElementOffsetLeft = $(targetElementSelector).offset().left;
                    let sliderOffsetLeft = $(sliderSelector).offset().left;

                    let sliderWidth = getTrueSliderWidth();
                    let frameWidth = $(frameSelector).width();

                    let targetElementPosition = targetElementOffsetLeft - sliderOffsetLeft - 20;
                    let widthAfterTargetElement =  sliderWidth - targetElementPosition;

                    if ($(targetElementSelector).is(':first-child')) {
                        slideToBegining();
                    } else if (widthAfterTargetElement > frameWidth) {
                        animatedSlide(-targetElementPosition, true);
                    } else {
                        slideToEnd();
                    }
                } else {
                    scope.$broadcast('DKU_ARROW_SLIDER:animation_over');
                }
            }

            function animatedSlide(newPosition, checkCanSlide) {
                $(sliderSelector).on('transitionend', function() {
                    scope.$broadcast('DKU_ARROW_SLIDER:animation_over');
                    if (checkCanSlide) {
                        setCanSlideTags(scope.canSlideLeft(), scope.canSlideRight());
                    }
                    $(sliderSelector).off('transitionend');
                });
                $(sliderSelector).css('left', newPosition + 'px');
            }

          /*
           * Double Click Handler
           */

            function dblClickHandler(counter, timer, clickFunc, dblClickFunc) {
                return function() {
                    if (counter <= 2) {
                        counter++;
                    }
                    if (counter == 1) {
                        clickFunc();
                        timer = $timeout(function(){
                            counter = 0;
                        }, 150);
                    }
                    if (counter == 2) {
                        dblClickFunc();
                        $timeout.cancel(timer);
                        counter = 0;
                    }
                };
            }

            let leftClickCounter = 0;
            let leftClickTimer;
            scope.slideLeftClickHandler = dblClickHandler(leftClickCounter, leftClickTimer, scope.slideLeft, slideToBegining);

            let rightClickCounter = 0;
            let rightClickTimer;
            scope.slideRightClickHandler = dblClickHandler(rightClickCounter, rightClickTimer, scope.slideRight, slideToEnd);

            /*
             * Checking if sliding is needed / possible functions
             */

            function neededDomElementsExist () {
                return $(sliderSelector).length > 0 && $(slidingElementsSelector).length > 0;
            }

            let isNeedSlider = false;
            scope.computeNeedSlider = function() {
                isNeedSlider =  neededDomElementsExist() && getTrueSliderWidth() > $(frameSelector).width();
            };

            scope.needSlider = function() {
                return isNeedSlider;
            };

            scope.canSlideRight = function() {
                return scope.needSlider() && !isElementVisible($(slidingElementsSelector)[$(slidingElementsSelector).length - 1]);
            };

            scope.canSlideLeft = function() {
                return scope.needSlider() && !isElementVisible($(slidingElementsSelector)[0]);
            };

            function setCanSlideTags(canSlideLeftFlag, canSlideRightFlag) {
                scope.canSlideLeftFlag = canSlideLeftFlag;
                scope.canSlideRightFlag = canSlideRightFlag;
            }

            /*
             * Private visual computing helpers
             */

            function isElementVisible(elem) {
                elem = $(elem);
                if (elem.length > 0) {
                    var elemOffsetLeft = elem.offset().left;
                    var elemOffsetRight = elemOffsetLeft + elem.innerWidth();
                    return !scope.needSlider() || (minOffsetLeft <= elemOffsetLeft && elemOffsetRight <= maxOffsetRight);
                }
            }

            function isLastChipBeyondSliderBottom() {
                var lastEl = $(slidingElementsSelector)[$(slidingElementsSelector).length - 1];
                var lastElRightOffset = $(lastEl).offset().left + $(lastEl).outerWidth();
                return lastElRightOffset >= maxOffsetRight;
            }

            function getTrueSliderWidth() {
                var maxIndex = $(slidingElementsSelector).length - 1;
                return $($(slidingElementsSelector)[maxIndex]).offset().left + $($(slidingElementsSelector)[maxIndex]).outerWidth() - $($(slidingElementsSelector)[0]).offset().left;
            }

            function getHiddenWidth(elem) {
                var elemOffsetLeft = $(elem).offset().left;
                var elemOffsetRight = elemOffsetLeft + $(elem).outerWidth();

                if (elemOffsetLeft < minOffsetLeft) {
                   return  minOffsetLeft - elemOffsetLeft;
                } else if (maxOffsetRight < elemOffsetRight) {
                    return elemOffsetRight - maxOffsetRight;
                }
                return 0;
            }

            function getLeftAsNumber(elem) {
                var left = $(elem).css('left');
                left = left.replace('px', '');
                if (!isNaN(left)) {
                    return parseInt(left);
                }
                return 0;
            }

	  /*
           * Initialisation
           */
            $timeout(function() {
                scope.computeNeedSlider();
                if (scope.needSlider()) {
                    scope.initArrowSlider();
                }
            }, 0);

        }
    };
}]);


app.directive("uiCheckbox", function() {
    return {
        scope: {},
        require: "ngModel",
        restrict: "A",
        replace: "true",
        template: "<button type=\"button\"  ng-class=\"{'chkbox-btn-normal' : true, 'btn' : true, 'checked': checked===true}\">" +
            "<i ng-class=\"{'icon-ok': checked===true}\"></span>" +
            "</button>",
        link: function(scope, elem, attrs, modelCtrl) {
            scope.size = "default";
            // Default Button Styling
            scope.stylebtn = {};
            // Default Checkmark Styling
            scope.styleicon = {"width": "10px", "left": "-1px"};
            // If size is undefined, Checkbox has normal size (Bootstrap 'xs')
            if(attrs.large !== undefined) {
                scope.size = "large";
                scope.stylebtn = {"padding-top": "2px", "padding-bottom": "2px", "height": "30px"};
                scope.styleicon = {"width": "8px", "left": "-5px", "font-size": "17px"};
            }
            if(attrs.larger !== undefined) {
                scope.size = "larger";
                scope.stylebtn = {"padding-top": "2px", "padding-bottom": "2px", "height": "34px"};
                scope.styleicon = {"width": "8px", "left": "-8px", "font-size": "22px"};
            }
            if(attrs.largest !== undefined) {
                scope.size = "largest";
                scope.stylebtn = {"padding-top": "2px", "padding-bottom": "2px", "height": "45px"};
                scope.styleicon = {"width": "11px", "left": "-11px", "font-size": "30px"};
            }

            var trueValue = true;
            var falseValue = false;

            // If defined set true value
            if(attrs.ngTrueValue !== undefined) {
                trueValue = attrs.ngTrueValue;
            }
            // If defined set false value
            if(attrs.ngFalseValue !== undefined) {
                falseValue = attrs.ngFalseValue;
            }

            // Check if name attribute is set and if so add it to the DOM element
            if(scope.name !== undefined) {
                elem.name = scope.name;
            }

            // Update element when model changes
            scope.$watch(function() {
                if(modelCtrl.$modelValue === trueValue || modelCtrl.$modelValue === true) {
                    modelCtrl.$setViewValue(trueValue);
                } else {
                    modelCtrl.$setViewValue(falseValue);
                }
                return modelCtrl.$modelValue;
            }, function(newVal, oldVal) {
                scope.checked = modelCtrl.$modelValue === trueValue;
            }, true);

            // On click swap value and trigger onChange function
            elem.bind("click", function() {
                scope.$apply(function() {
                    if(modelCtrl.$modelValue === falseValue) {
                        modelCtrl.$setViewValue(trueValue);
                    } else {
                        modelCtrl.$setViewValue(falseValue);
                    }
                });
            });
        }
    };
});

const EDITABLE_LIST_ITEM_PREFIX = 'it'; // this is the property name used for items in the editableList* directives

/**
 * This directive is a fork of list-form that implements the new editable lists specifications.
 * 
 * @param {Array}       ngModel                         - The list to bind to display.
 * @param {boolean}     [sortable=false]                - True to make the list sortable. Allows to rearrange list order by drag-and-dropping.
 * @param {Function}    [onAdd]                         - The function called when adding an item.
 * @param {Function}    [onRemove]                      - The function called when removing an item.
 * @param {Function}    [onChange]                      - Callback called on change.
 * @param {boolean}     [noChangeOnAdd=false]           - True to prevent the callback onChange to be called when an item is added.
 * @param {boolean}     [required=false]                - Can the items of the list be empty. Used with the 'editable-list-input' component.
 * @param {Object}      [template]                      - Template of the items in the list. Used when the list items are objects.
 * @param {Function}    [prepare]                       - The function called on list update, to set items default value.
 * @param {Function}    [transcope]                     - Functions/objects to pass to the editableList scope.
 * @param {Array}       [suggests]                      - List of possible values of an item of the list. Can be displayed in a dropdown under a text input for instance.
 * @param {boolean}     [hasDivider=true]               - False to hide the divider line between items.
 * @param {string}      addLabel                        - Text to display in the add button; Optional if disableAdd is true.
 * @param {boolean}     [disableAdd=false]              - True to hide the Add button.
 * @param {boolean}     [disableRemove=false]           - True to hide the Remove buttons.
 * @param {boolean}     [disableCreateOnEnter=false]    - True to prevent creating a new item when pressing Enter in the last focused item of the list. Focus the first item of the list instead.
 * @param {boolean}     [skipToNextFocusable=false]     - True to focus the next focusable item on Enter if the immediate next item can't be focused (e.g. deleted item).
 * @param {boolean}     [fullWidthList=false]           - True to make the list fill the full width available in the container.
 * @param {boolean}     [compareByEquality=false]       - True to match ngModel changes with object equality instead of reference equality.
 */
app.directive('editableList', function($timeout) { return {
    restrict: 'E',
    transclude: true, replace: true,
    templateUrl: '/templates/widgets/editable-list.html',
    require: '?ngModel',
    scope: {
        ngModel: '<',
        sortable: '=',
        onAdd: '<',
        onRemove: '<',
        onChange: '=',
        noChangeOnAdd: '<',
        required: '<',
        template: '=',
        prepare: '=',
        transcope: '=',
        suggests: '=',
        hasDivider: '<',
        addLabel: '@',
        disableAdd: '<',
        disableRemove: '<',
        disableCreateOnEnter: '<',
        skipToNextFocusable: '<',
        fullWidthList: '<',
        compareByEquality: '<'
    },
    compile: function(elt, attrs, transclude) {
        const ITEMS_CLASSNAME = 'editable-list__items';
        const ITEM_CLASSNAME = 'editable-list__item'; 
        const DIVIDER_CLASSNAME = 'editable-list__item--divider';
        const DRAG_ICON_CLASSNAME = 'editable-list__drag-icon';
        const DRAG_ICON_QA_SELECTOR = 'data-qa-editable-list-drag';
        const DELETE_BUTTON_CLASSNAME = 'editable-list__delete';
        const DELETE_BUTTON_QA_SELECTOR = 'data-qa-editable-list-delete';
        const ITEM_TEMPLATE_CLASSNAME = 'editable-list__template'; 
        const EDITING_CLASSNAME = 'editable-list__template--editing';

        var itemsExpr = attrs.ngModel,
            klass = attrs['class'],
            focusableInputs = ['input:not([type=checkbox])', 'textarea', 'select'];

        return function(scope, elt){
            var lis = []; // the LIs

            if (klass) { // report CSS classes
                elt.className += ' ' + klass;
            }

            var insertTranscope = function(into) {
                if (typeof scope.transcope === 'object') {
                    for (var k in scope.transcope) {
                        into[k] = scope.transcope[k];
                    }
                }
            };

            insertTranscope(scope);
            scope.ngModel = [];

            scope.$parent.$watch(itemsExpr, function(v) {
                scope.ngModel = v || [];
            });

            // default hasDivider to true
            if (!angular.isDefined(scope.hasDivider)) {
                scope.hasDivider = true;
            }

            // Utilities
            function parentOf(child, className) {
                while (child && !child.classList.contains(className)) {
                    child = child.parentElement;
                }
                return angular.element(child);
            }

            function templateOf(child) {
                return parentOf(child, ITEM_TEMPLATE_CLASSNAME);
            }

            function liOf(child) {
                return parentOf(child, ITEM_CLASSNAME);
            }

            function indexOf(li) {
                for (var i = 0; i < lis.length; i++) {
                    if (lis[i].element[0] === li) return i;
                }
                // cond always true, prevent error w/ CodePen loop
                if (i || !lis.length) return -1;
            }

            function prepare(it) {
                if (scope.prepare) {
                    scope.prepare(it);
                }
            }

            function template() {
                switch(typeof scope.template) {
                    case 'function': return scope.template();
                    case 'object': return angular.extend({}, scope.template);
                    case 'string' : return scope.template;
                    default: return {};
                }
            }

            function regularEnter(evt) {  // press button, return in textarea...
                return evt.target.tagName.toLowerCase() !== 'input'
                        || evt.target.type === 'button';
            }

            // Remove & update DOM
            scope.remove = function(i) {
                scope.ngModel.splice(i, 1);
                update(scope.ngModel);
                scope.$parent.$apply();
                scope.onRemove && scope.onRemove(i);
            };

            var changing = false;

            function updateSuggests() {
                for (var i = lis.length; i-- > 0;) {
                    lis[i].scope.suggests = scope.suggests;
                }
            }

            function update(items, noChangeOnAdd) {
                var change = !changing && scope.onChange && !noChangeOnAdd;

                changing = true;

                for (var i = lis.length; i-- > 0;) {
                    lis[i].element.remove();
                    lis[i].scope.$destroy();
                    lis.splice(i, 1);
                }

                for (i = items.length - 1; i >= 0; i--) {
                    var childScope = scope.$new(),
                        childLi = angular.element('<li class="' + ITEM_CLASSNAME + (scope.hasDivider ? ' ' + DIVIDER_CLASSNAME : '') + '"></li>'),
                        childDrag = angular.element('<i ' + DRAG_ICON_QA_SELECTOR + ' class="' + DRAG_ICON_CLASSNAME +' icon-reorder"></i>'),
                        childDelete = angular.element('<button type="button" ' + DELETE_BUTTON_QA_SELECTOR + ' class="btn btn--text btn--danger btn--icon ' + DELETE_BUTTON_CLASSNAME + ' " tabindex="-1"> <i class="icon-trash"></i></button>'),
                        childTemplate = angular.element('<div class="' + ITEM_TEMPLATE_CLASSNAME + '"></div>');

                    childScope[EDITABLE_LIST_ITEM_PREFIX] = items[i];
                    childScope.suggests = scope.suggests;
                    prepare(childScope[EDITABLE_LIST_ITEM_PREFIX]);
                    childScope.$index = i;
                    childDelete.click(scope.remove.bind(this, i));

                    scope.sortable && childLi.append(childDrag);
                    childLi.append(childTemplate);
                    !scope.disableRemove && childLi.append(childDelete);

                    transclude(childScope, function(clone) {
                        childTemplate.prepend(clone);
                    });
                    
                    lis.unshift({ element: childLi, scope: childScope });
                    itemsContainerEl.prepend(childLi);
                }

                const children = itemsContainerEl.children();
                const lastChild = children[children.length - 1];
                itemsContainerEl[0].scrollTop = lastChild && lastChild.offsetTop || 0;

                if (change) {
                    scope.onChange(scope.ngModel);
                }
                
                changing = false;
            }
            
            if (scope.onChange) {
                // Use a jQuery event handler, not a DOM one, because we want
                // the .trigger("change") in the bs-typeahead to trigger this
                $(elt[0]).on('change', function(evt) {
                    function doIt(){
                        changing = true;
                        scope.onChange(scope.ngModel);
                        changing = false;
                    }

                    if (!changing) {
                        /* This is the same hack that we did to fix #1222.
                         * When you have a bs-typeahead, you have an non-empty field, then
                         * you chnage data to get a suggestion. Clicking on the suggestion
                         * will exit the input field, triggering a change event.
                         * However, the change event triggers before the click has its own actions:
                         * which is, changing the value of the input and triggering another
                         * "change" and "input" event.
                         * By delaying the taking into account of this, we leave time to the browser
                         * to process the click and to have it repercuted to the Angular model
                         */
                        var uglyBSHack = $(evt.target).attr("bs-typeahead") != null;
                        if (uglyBSHack) {
                            window.setTimeout(doIt, 150);
                        } else {
                            doIt();
                        }
                    }
                });
            }

            scope.$watch('ngModel', update, scope.compareByEquality);
            if (scope.suggests) { scope.$watch('suggests', updateSuggests, true); }

            // Editing row, focus & blur
            var editing = null;

            function edit(li) {
                if (editing === li) return;
                if (editing) editing.removeClass(EDITING_CLASSNAME);
                editing = li;
                if (editing) {
                    editing.addClass(EDITING_CLASSNAME);
                }
            }

            elt[0].addEventListener('focus', function(evt) {
                if (focusableInputs.indexOf(evt.target.tagName.toLowerCase()) >= 0) {
                    edit(templateOf(evt.target));
                    evt.target.select();
                }
            }, true);

            elt[0].addEventListener('blur', function(evt) {
                if (focusableInputs.indexOf(evt.target.tagName.toLowerCase()) >= 0) {
                    edit(null);
                    window.getSelection().removeAllRanges();
                }
            }, true);

            function skipToNextFocusable(next) {
                let nextElement = lis[next].element[0];
                let focusable = nextElement.querySelector(focusableInputs.join(', '));
                while (next > -1 && !focusable) {
                    next = indexOf(nextElement.nextSibling);
                    if (next < 0) {
                        break;
                    }
                    nextElement = lis[next].element[0];
                    focusable = nextElement.querySelector(focusableInputs.join(', '));
                }
                return next;
            }

            elt.on('keydown', function(evt) {
                var next = null;
                switch (evt.keyCode) {
                    case 27:
                        evt.target.blur();
                        return true;
                    case 13:
                         if (regularEnter(evt)) return true;
                         evt.target.blur();
                         next = indexOf(templateOf(evt.target)[0].parentElement.nextSibling);
                         break;
                    default:
                        return true;
                }
                if (scope.skipToNextFocusable && next > -1) {
                    next = skipToNextFocusable(next);
                }
                next = scope.disableCreateOnEnter && next != null && next < 0 ? 0 : next;
                if (next > -1) {
                    const nextElement = lis[next].element[0];
                    const focusable = nextElement.querySelector(focusableInputs.join(', '));
                    if (focusable) focusable.focus();
                } else {
                    scope.add();
                }

                evt.preventDefault();
                evt.stopPropagation();
                return false;
            });

            var itemToAdd = template();

            prepare(itemToAdd);

            var deregWatchPrepare = scope.$watch('prepare', function() {
                if (scope.prepare) {
                    prepare(itemToAdd);
                    deregWatchPrepare();
                }
            });

            const itemsContainerEl = elt.find('.' + ITEMS_CLASSNAME);

            scope.add = function() {
                scope.ngModel.push(itemToAdd);
                itemToAdd = template();
                prepare(itemToAdd);
                scope.hasAddedItem = true;
                update(scope.ngModel, scope.noChangeOnAdd);
                const addedElement = lis[lis.length - 1].element[0];
                $timeout(function() {
                    const focusable = addedElement.querySelector(focusableInputs.join(', '));
                    if (focusable) focusable.focus();
                });
                scope.onAdd && scope.onAdd();
            }

            // Drag / drop
            if (!scope.sortable) return;

            elt.addClass('editablie-list--sortable');

            var dragging = null, draggingIndex = null, draggingOpacityTimeout = null;

            // Only allow dragging on handles
            elt.on('mouseover', function(evt) {
                if (evt.target.classList.contains(DRAG_ICON_CLASSNAME)) {
                    liOf(evt.target).prop('draggable', true);
                }
            });

            elt.on('mouseout', function(evt) {
                if (evt.target.classList.contains(DRAG_ICON_CLASSNAME) && !dragging) {
                    liOf(evt.target).prop('draggable', false);
                }
            });

            // Actual drag/drop code
            elt.on('dragstart', function(evt) {
                (evt.originalEvent || evt).dataTransfer.setData('text/plain', null);
                (evt.originalEvent || evt).dataTransfer.effectAllowed = 'move';
                dragging = liOf(evt.target)[0];
                draggingIndex = indexOf(dragging);
                itemsContainerEl.addClass('dragging');
                evt.target.classList.add('dragging');
                draggingOpacityTimeout = window.setTimeout(function() { 
                    dragging.style.opacity = 0; 
                }, 200); // later to let time for snapshot
            });

            elt.on('dragenter', function(evt) {
                if (!dragging || evt.target === elt[0]) return;
                var li = liOf(evt.target)[0];
                if (!li || li === dragging) return;
                li.classList.add(draggingIndex < indexOf(li) ? 'drag-below' : 'drag-above');
            });

            elt.on('dragleave', function(evt) {
                evt.target.classList.remove('drag-above', 'drag-below');
            });

            elt.on('dragover', function(evt){
                if (!dragging || evt.target === elt[0]) return;
                var li = liOf(evt.target)[0];
                if (!li || li === dragging) return;
                evt.preventDefault();
                (evt.originalEvent || evt).dataTransfer.dropEffect = 'move';
            });

            elt.on('drop', function(evt) {
                if (!dragging) return;
                evt.preventDefault();
                const dropIndex = indexOf(evt.target), dragIndex = draggingIndex;
                const itemsContainer = elt.find('.' + ITEMS_CLASSNAME)[0];
                if (dropIndex > draggingIndex) { // insert after
                    itemsContainer.insertBefore(dragging, evt.target.nextSibling);
                } else { // insert before
                    itemsContainer.insertBefore(dragging, evt.target);
                }
                dragEnd();
                scope.$apply(function() {
                    scope.ngModel.splice(dropIndex, 0, scope.ngModel.splice(dragIndex, 1)[0]);
                    update(scope.ngModel);
                });
            });

            elt.on('dragend', dragEnd);

            function dragEnd() {
                dragging.style.opacity = 1;
                itemsContainerEl.removeClass('dragging');
                dragging.classList.remove('dragging');
                if (draggingOpacityTimeout != null) {
                    window.clearTimeout(draggingOpacityTimeout);
                }
                dragging = null;
                draggingIndex = null;
                draggingOpacityTimeout = null;
                elt.find('.drag-above').removeClass('drag-above');
                elt.find('.drag-below').removeClass('drag-below');
            }
        };
    }
}; });


app.directive('checkCategoryNameUnique', function() {
    return {
        require: 'ngModel',
        scope: false,
        compile: function() {
            return function(scope, elt, attrs, ngModel) {
                const index = scope.$index;

                function checkUnique(nv, ov) {
                    const isUnique = !scope.generalSettings.globalTagsCategories.find((it, idx) => it.name == nv[index].name && idx != index);
                    ngModel.$setValidity('unique', isUnique);
                    return nv;
                }

                scope.$watch('generalSettings.globalTagsCategories', checkUnique, true);
            }
        }
    }

});

app.directive('editableListInput', function ($parse, $timeout) {
    return {
        replace: true,
        require: '?ngModel',
        restrict: 'E',
        scope: {
            ngModel: '=',
            type: '@',
            onChange: '&',
            onKeyUpCallback: '&',
            placeholder: '@',
            required: '<',
            bsTypeahead: '=',
            classes: '@',
            unique: '<',
            trimParam: '<',
            checkWarning: '=', // needs to be a function that evaluates fast, it's not debounced
            disableFormValidation: '<' // if true, this item  being invalid doesn't make the parent form invalid
        },
        templateUrl: '/templates/widgets/editable-list-input.html',
        compile: function() {

            return function(scope, elt, attrs, ngModel) {
                const propertyToCompare = attrs.ngModel.split(EDITABLE_LIST_ITEM_PREFIX + '.')[1];

                var setItemValidity;
                var $elt = $(elt);

                function updateModel(evt) {
                    const localScope = angular.element(evt.target).scope();
                    if (localScope) {
                        $parse(attrs.ngModel).assign(scope.$parent, localScope.ngModel);
                    }
                    if (setItemValidity) {
                        setItemValidity();
                    }
                }

                scope.onKeyUp = function(evt) {
                    updateModel(evt);
                    setTimeout(() => $elt.trigger("keyup"));
                    if (scope.onKeyUpCallback) {
                        scope.onKeyUpCallback();
                    }
                };

                var editableListScope = scope.$parent.$parent;
                scope.parentListItems = editableListScope ? editableListScope.ngModel : [];
                const index = scope.$parent.$index;
                if (editableListScope.editableListForm) {
                    if (scope.disableFormValidation) {
                        editableListScope.editableListForm.$removeControl(ngModel.$$parentForm);
                    } else {
                        editableListScope.editableListForm.$addControl(ngModel.$$parentForm);
                    }
                }

                function checkUnique(nv, ov) {
                    if (!scope.ngModel) {
                        return;
                    }
                    const isUnique = !scope.parentListItems.find((it, idx) => resolveValue(it, propertyToCompare) === scope.ngModel && idx != index);
                    ngModel.$setValidity('unique', isUnique);
                }

                if (scope.unique || scope.required) {
                    setItemValidity = () => {
                        $timeout(() => scope.$parent[EDITABLE_LIST_ITEM_PREFIX].$invalid = ngModel.$$parentForm.$invalid);
                    }
                    setItemValidity();
                }

                //Since we delete and recreate the editableList items on update (add/remove) we loose information on which one have been touched/modified.
                //For validation we need this information to keep displaying the error message when recreated so we store it in the item
                if (scope.required) {
                    //if parentScope contains different editableListInput we need to differentiate $touched
                    scope.touchedId = `$touched.${attrs.ngModel}`;

                    scope.onBlur = function() {
                        scope.$parent[EDITABLE_LIST_ITEM_PREFIX][scope.touchedId] = true;
                    }

                    // if an already saved input is empty/invalid we want to display the error message even if not touched
                    if (!editableListScope.hasAddedItem) {
                        scope.onBlur();
                    }
                }

                if (scope.unique) {
                    scope.$watch('parentListItems', checkUnique, true);
                }

                let changing = false;
                $(elt[0]).on('change', function(evt) {
                    function doIt(){
                        changing = true;
                        updateModel(evt);
                        $elt.trigger("change");
                        changing = false;
                    }

                    if (!changing) {
                        /* This is the same hack that we did to fix #1222.
                         * When you have a bs-typeahead, you have an non-empty field, then
                         * you chnage data to get a suggestion. Clicking on the suggestion
                         * will exit the input field, triggering a change event.
                         * However, the change event triggers before the click has its own actions:
                         * which is, changing the value of the input and triggering another
                         * "change" and "input" event.
                         * By delaying the taking into account of this, we leave time to the browser
                         * to process the click and to have it repercuted to the Angular model
                         */
                        var uglyBSHack = $(evt.target).attr("bs-typeahead") != null;
                        if (uglyBSHack) {
                            window.setTimeout(doIt, 200);
                        } else {
                            doIt();
                        }
                    }
                });
            }
        }
    }
});

app.directive("timeZoneList", function(DataikuAPI){
    return {
        restrict : 'A',
        link : function(scope, element, attrs) {
            DataikuAPI.timezone.list().success(function(data){
                scope.timezone_ids = data.ids;
            }).error(setErrorInScope.bind(this));
        }
    }
});

// Performance-oriented one-way binding
// Raw (unescaped) HTML only, no expression, must be updated explicily
// Must be bound in a map, e.g. {a: "Label", b: "<strong>error</strong>"}
app.directive('fastBind', function() {
    return {
        scope: false,
        priority: -1,
        link: function(scope, element, attrs) {
            var elts = [], keys = [], root = element[0];
            function set(key, map) { this.innerHTML = map[key]; }
            element.find('[fast-bound]').each(function(i){
                elts[i] = this;
                keys[i] = this.getAttribute('fast-bound');
            });
            scope[attrs.fastBind] = function(map) {
                if (!map) {
                    element[0].style.visibility = 'hidden';
                } else {
                    for (let i = elts.length - 1; i>=0; i--) {
                        elts[i].innerHTML = map[keys[i]];
                    }
                    root.style.visibility = 'visible';
                }
            };
        }
    };
});

app.directive("smartLogTail", function(){
    return {
        restrict : 'A',
        replace:true,
        scope : {
            smartLogTail : '=',

        },
        template : '<pre class="smart-log-tail-content">'+
                '<span ng-repeat="line in smartLogTail.lines track by $index" '+
                    'ng-class="{\'text-error\':  smartLogTail.status[$index] == TAIL_STATUS.ERROR,'+
                           '\'text-warning\': smartLogTail.status[$index] == TAIL_STATUS.WARNING,'+
                           '\'text-success\': smartLogTail.status[$index] == TAIL_STATUS.SUCCESS, }">'+
                    '{{line}}'+
                '</span>'+
                '</pre>',
        link : function(scope){
             scope.TAIL_STATUS = {
                DEBUG: 0,
                INFO: 1,
                WARNING: 2,
                ERROR: 3,
                SUCCESS: 4
            };
        }
    }
});

app.directive("automationEditOverlay", function(){
    return {
        replace:true,
        template : '<div ng-cloak ng-if="appConfig.isAutomation" class="automation-edit-overlay"><div class="text"><div class="line1">Automation node</div><div class="line2">Edits will be lost at next bundle import</div></div></div>',
    }
});

app.directive("infoMessagesList", function(){
    return {
        restrict : 'A',
        scope : {
            infoMessagesList : '='
        },
        template : '<ul class="info-messages-list"><li ng-repeat="message in infoMessagesList">'+
                    '<div ng-class="\'message-\' + (message.severity.toLowerCase())">'+
                        '<div ng-if="message.title && message.details">'+
                            '<h4 >{{message.title}}</h4>'+
                            '<span>{{message.details}}</span>'+
                            '<span ng-show="message.line"> (at line {{message.line}})'+
                        '</div>'+
                        '<div ng-if="message.title && !message.details">'+
                            '<span>{{message.title}}</span>'+
                            '<span ng-show="message.line"> (at line {{message.line}})'+
                        '</div>'+

                    '</div>'+
                '</li></ul>',
    }
});

app.directive('masterBreadcrumb', function($rootScope, Breadcrumb) {
    return {
        templateUrl: '/templates/master-breadcrumb.html',
        scope: true,
        link: function($scope, element, attrs) {
            $scope.breadcrumbData = $rootScope.masterBreadcrumbData;
        }
    }
});

app.service("InfoMessagesModal", function($q, CreateModalFromTemplate, ProgressStackMessageBuilder){
    var InfoMessagesModal = {
        /* Shows only if there is a message */
        showIfNeeded : function(parentScope, messages, modalTitle) {

            if (messages.messages.length > 0) {
                CreateModalFromTemplate("/templates/widgets/info-messages-display.html", parentScope, null, function(newScope){
                    newScope.modalTitle = modalTitle;
                    newScope.messages = messages;
                });
            }
        }
    }
    return InfoMessagesModal;
});


app.service("APIErrorModal", function($q, CreateModalFromTemplate, ProgressStackMessageBuilder){
    var InfoMessagesModal = {
        showCB : function showCB(data, status, headers) {
            CreateModalFromTemplate("/templates/widgets/api-error-modal.html", parentScope, null, function(newScope){
                newScope.apiError = getErrorDetails(data, status, headers);
            });
        },
        show : function show(apiError){
            CreateModalFromTemplate("/templates/widgets/api-error-modal.html", parentScope, null, function(newScope){
                newScope.apiError = apiError;
            });
        }
    };
    return InfoMessagesModal;
});

app.directive("refreshCodemirrorOn", function($timeout){
    return {
        link : function($scope, element, attrs) {
            $scope.$watch(attrs.refreshCodemirrorOn, function(nv, ov){
                $timeout(function(){
                    element.find(".CodeMirror").each(function(i, e) {
                        if (e.CodeMirror) e.CodeMirror.refresh();
                    });
                }, 0);
            });
        }
    }
})

app.filter("infoMessageAlertClass", function(){
    return function(input){
        var dict = {
            'ERROR': 'alert-danger',
            'WARNING': 'alert-warning',
            'INFO': 'alert-info'
        };
        return dict[input.severity];
    }
})

app.filter("severityAlertClass", function(){
    return function(input){
        var dict = {
            'ERROR': 'alert-danger',
            'WARNING': 'alert-warning',
            'INFO': 'alert-info'
        };
        return input != null ? dict[input] : 'alert-info';
    }
})

app.directive("infoMessagesRawListWithAlert", function(){
    return {
        templateUrl : '/templates/widgets/info-messages-raw-list-with-alert.html',
        scope : {
            data : '=infoMessagesRawListWithAlert',
            showReduceAction: '='
        }
    }
})

app.directive("infoMessagesRawList", function(){
    return {
        templateUrl : '/templates/widgets/info-messages-raw-list.html',
        scope : {
            data : '=infoMessagesRawList'
        }
    }
})

app.directive("featureLocked", function(){
    return {
        templateUrl : '/templates/widgets/feature-locked.html',
        restrict : 'EA',
        scope : {
            featureName : '='
        }
    }
});

app.directive("qrCode", function(){
    return {
        scope : {
            qrCode : '='
        },
        template : "<div class='qr'></div>",
        link : function($scope, element, attrs) {
            $scope.$watch("qrCode", function(nv, ov) {
                if (nv) {
                    var qrcode = new QRCode(element.find(".qr")[0], {
                        text : $scope.qrCode,
                        width: 128,
                        height: 128,
                        colorDark : "#000000",
                        colorLight : "#ffffff",
                        correctLevel : QRCode.CorrectLevel.H
                    });
                }
            });
        }
    }
});

app.directive("dkuFoldable", function(){
    return {
        scope : true,
        controller : ['$scope', '$attrs', function($scope, $attrs) {
            $scope.foldableOpen = $scope.$eval($attrs.open);
        }],
        link : function($scope, element, attrs){
            $scope.foldableToggle = function(){
                $scope.foldableOpen = !$scope.foldableOpen;
            };
            function setChevronClazz(){
                $scope.foldableChevronClazz = $scope.foldableOpen ? "icon-chevron-up" : "icon-chevron-down";
            }
            $scope.$watch("foldableOpen", setChevronClazz);
            setChevronClazz();
            $scope.$watch(attrs.open, function(nv, ov){
                if (nv != ov) $scope.foldableToggle();
            });
        }
    }
});

app.directive("dkuFoldableRightPanel", function(LocalStorage, STANDARDIZED_SIDE_PANEL_KEY){
    return {
        scope : true,
        require : "dkuFoldable",
        link : function($scope, element, attrs) {
            let objectType = $scope.objectType !== undefined ? $scope.objectType : "defaultObjectType";
            // Strip the LOCAL_ and FOREIGN_ prefix to have the same expanded/collapsed section in the Flow and in the actual object item view (ex: Dataset).
            if (objectType.startsWith("LOCAL_")) {
                objectType = objectType.substring(6);
            } else if (objectType.startsWith("FOREIGN_")) {
                objectType = objectType.substring(8);
            }
            const key = STANDARDIZED_SIDE_PANEL_KEY + '.' + objectType + '.' + attrs.name;
            let localValue = LocalStorage.get(key);
            if(localValue !== undefined){
                $scope.foldableOpen =  localValue;
            }
            $scope.$watch("foldableOpen", function(nv, ov){
                if (nv != ov) {
                    LocalStorage.set(key, nv);
                }
            });
        }
    }
});

/*
 * Add on for dkuFoldable
 */
app.directive("openOnDragEnter", function($timeout) {
    return {
        restrict: 'A',
        link : function($scope, element, attrs) {
            var previousState = null;
            var nesting = 0;

            element.on('dragenter', function(e) {
                if (nesting++ === 0) {
                    previousState = $scope.foldableOpen;
                    $scope.$apply(function() {
                        $scope.foldableOpen = true;
                    });
                }
            });
            element.on('dragleave', function(e) {
                if (--nesting === 0) {
                    $scope.$apply(function() {
                        $scope.foldableOpen = previousState;
                        previousState = null;
                    });
                }
            });
            $(document).on('dragend', function() {
                $timeout(function() { nesting = 0; });
            });
        }
    }
});

app.directive("rightColumnDescriptionTags", function(){
    return {
        scope : {
            object : '='
        },
        templateUrl : '/templates/widgets/right-column-description-tags.html'
    }
});

/*
 * Verry usefull to repeat template passed through transclude in a ng-repeat directive.
 * In the HTML template 'inject' directive call should be at the same level as 'ng-repeat' directive call
 */

app.directive('dkuInject', function(){
  return {
    link: function($scope, $element, $attrs, controller, $transclude) {
      if (!$transclude) {
        throw minErr('ngTransclude')('orphan',
         'Illegal use of ngTransclude directive in the template! ' +
         'No parent directive that requires a transclusion found. ' +
         'Element: {0}',
         startingTag($element));
      }
      var innerScope = $scope.$new();
      $transclude(innerScope, function(clone) {
        $element.empty();
        $element.append(clone);
        $element.on('$destroy', function() {
          innerScope.$destroy();
        });
      });
    }
  };
});

/*
 * Custom carousel : can take any html template and use it to populate the slides (makes use the dkuInject directive to combine transclude and ngRepeat)
 */

app.directive('dkuCarousel', function($timeout){
    return {
        transclude: true,
        templateUrl: '/templates/projects/dku-carousel.html',
        restrict: 'A',
        scope: {
            entries : '=dkuCarousel',
            initialIndex : '=?'
        },
        link: function($scope, element){

            $scope.element = element;

            $scope.index = 0;
            if ($scope.initialIndex) {
                $scope.index = $scope.initialIndex;
            }

            $scope.slideLeft = function() {
                if (!$scope.entries) return;
                var maxIndex = $scope.entries.length - 1;
                var newIndex = $scope.index - 1;
                if (newIndex < 0) {
                    newIndex = maxIndex;
                }
                slide(newIndex, -1);
            };

            $scope.slideRight = function() {
                if (!$scope.entries) return;
                var maxIndex = $scope.entries.length - 1;
                var newIndex = $scope.index + 1;
                if (newIndex > maxIndex) {
                    newIndex = 0;
                }
                slide(newIndex, 1);
            };

            var slide = function (newIndex, direction) {
                var slider = $(element).find('.slider');

                // In order to give the illusion the carousel is wrapping
                var firstSlideClone = $(element).find('.slide:first-child').clone().addClass('clone');
                var lastSlideClone = $(element).find('.slide:last-child').clone().addClass('clone');
                $(slider).prepend(lastSlideClone);
                $(slider).append(firstSlideClone);

                var slides = $(element).find('.slide');
                var domNbSlides = $scope.entries.length + 2;        //since we've juste added to new slides
                var domIndex = $scope.index + 1;    //since we've just preprended a new slide
                var newDomIndex = domIndex + 1 * direction;

                var leftPosition = -1 * domIndex * 100 / domNbSlides;
                var newLeftPosition = -1 * newDomIndex * 100 / domNbSlides;
                var sliderWidth = domNbSlides * 100;
                $(slider).addClass('animating');
                $(slider).css('width', sliderWidth + '%');
                $(slider).css('transform', 'translate(' + leftPosition + '%, 0)');
                $(slides).css('width', 100/domNbSlides + '%');

                $timeout(function() {
                    $(slider).addClass('transition');
                    $(slider).css('transform', 'translate(' + newLeftPosition + '%, 0)');
                }, 0);

                $timeout(function() {
                    $(slider).removeClass('transition');
                    $scope.index = newIndex;
                    $(slider).removeAttr('style');
                    $(slider).removeClass('animating');
                    $(slides).removeAttr('style');
                    firstSlideClone.remove();
                    lastSlideClone.remove();
                }, 200);
            }
        }
    };
});

app.directive('displayAmount', function(DataikuAPI, $stateParams){
    return {
        template: '<span>{{amount}} {{unit}}<span ng-if="amount > 1">s</span></span>',
        restrict: 'AE',
        scope: {
            unit: '=',
            amount: '='
        },
        link: function($scope, element){
            // noop
        }
    };
});


app.directive('editableText', function($timeout){
    return {
        template: '<div class="dku-editable-text">' +
        '<div ng-show="!editing" ng-click="edit()" class="horizontal-flex">' +
        '<div class="flex mx-textellipsis">{{model || placeholder}}</div><div class="noflex"><i class="icon-pencil" /></div>' +
        '</div>' +
        '<input type="text" ng-model="model" placeholder="{{placeholder}}" ng-blur="editing = false" ng-show="editing" blur-on-enter />' +
        '</div>',
        restrict: 'A',
        scope: {
            model: '=editableText',
            placeholder: '='
        },

        link: function($scope, element){
            var input = $(element.find('input'));
            $scope.edit = function() {
                $scope.editing = true;
                $timeout(function() {
                    input.focus();
                });
            };
        }
    };
});


app.directive("objectSaveButton", function(CreateModalFromTemplate) {
    return {
        scope: {
            'save': '=',                    // function((optional)commitMessage)
            'canSave': '=',                 // boolean
            'isDirty': '=',                 // boolean
            'objectId': '=',
            'objectType': '@',
            'canWriteOverride': '=',         // for when you can save without having the write permission on the project (dashboard)
            'dropdownAlignRight': '='
        },
        templateUrl : '/templates/widgets/object-save-button.html',
        link: function($scope) {
            $scope.saveWithCustomCommitMessage = function () {
                CreateModalFromTemplate("/templates/git/commit-message-only-modal.html", $scope, null, function(newScope) {
                    newScope.commitData = {};
                    /* Reload previous message if any */
                    if ($scope.currentSaveCommitMessage) {
                        newScope.commitData.message = $scope.currentSaveCommitMessage;
                    }

                    newScope.commit = function(){
                        newScope.resolveModal(newScope.commitData);
                    };
                }, true).then(function(commitData){
                    $scope.currentSaveCommitMessage = commitData.message;
                    $scope.save(commitData.message);
                });
            };

            $scope.commit = function() {
                CreateModalFromTemplate("/templates/git/commit-object-modal.html", $scope, null, function(newScope) {
                    newScope.object = {
                        objectType : $scope.objectType,
                        objectId : $scope.objectId
                    };
                }, true);
            };
        }
    }
});

app.directive('ngRightClick', function($parse) {
    return function (scope, element, attrs) {
        var fn = $parse(attrs.ngRightClick);
        element.bind('contextmenu', function (event) {
            scope.$apply(function () {
                if (attrs.ngRightClickPreventDefault !== 'false') {
                    event.preventDefault();
                }
                fn(scope, {$event: event});
            });
        });
    };
});

//TODO: use this factory in folder_edit.js instead of openMenu() when the two branchs will be merged together
app.factory("openDkuPopin", function($timeout, $compile) {
    //Args in options: template, isElsewhere, callback, popinPosition = "SMART", onDismiss, doNotCompile, arrow
    return function($scope, $event, options) {
        var opts = angular.extend({popinPosition: 'SMART'}, options);
        var newDOMElt = $(opts.template);

        var newScope = $scope.$new();
        if (!opts.doNotCompile) {
            $compile(newDOMElt)(newScope);
        }

        // By default an arrow is displayed if the popin position strategy is SMART
        if (!angular.isDefined(opts.arrow)) {
            opts.arrow = opts.popinPosition == 'SMART';
        }

        newScope.dismiss = function(skipOnDismiss){
            newScope.$destroy();
            newDOMElt.remove();
            $('body').off('click', hideOnClickElsewhere);
            $('body').off('contextmenu', hideOnClickElsewhere);
            if (typeof(opts.onDismiss) === "function" && !skipOnDismiss) {
                opts.onDismiss(newScope);
            }
        };
        newScope.$on("$destroy", function(){
            newDOMElt.remove();
        });

        var hideOnClickElsewhere = function(e) {
            if(typeof(opts.isElsewhere)==="function" && opts.isElsewhere(newDOMElt, e)) {
                $timeout(newScope.dismiss, 0);
            }
        };

        $timeout(function(){
            newScope.$apply(function() {
                $("body").append(newDOMElt);
                switch (opts.popinPosition) {
                    case "SMART":
                        smartPositionning();
                        break;
                    case "CLICK":
                        clickPositionning();
                        break;
                    default:
                        break;
                }
                newDOMElt.show();
                $('body').click(hideOnClickElsewhere);
                $('body').contextmenu(hideOnClickElsewhere);
                if (typeof(opts.callback) === "function") {
                    opts.callback(newScope);
                }
            });
        });


        // Positions the popin so that it is always aligned with one side of the element
        function smartPositionning() {
            var element_X = $($event.target).offset().left;
            var element_Y = $($event.target).offset().top;
            var element_W = $($event.target).outerWidth(true);
            var element_H = $($event.target).outerHeight(true);
            var popin_W = $(newDOMElt).outerWidth(true);
            var popin_H = $(newDOMElt).outerHeight(true);
            var window_W = window.innerWidth;
            var window_H = window.innerHeight;

            var popin_on_bottom = (element_Y + element_H + popin_H < window_H);
            var popin_aligned_on_right = (element_X + popin_W > window_W);

            var popin_X = (popin_aligned_on_right) ? (element_X + element_W - popin_W) : (element_X);
            var popin_Y = (popin_on_bottom) ? (element_Y + element_H) : (element_Y - popin_H);

            newDOMElt.css("top", popin_Y);
            newDOMElt.css("left", popin_X);

            // Add an arrow linking the popin to the element which triggered it
            if (opts.arrow) {
                var cssClass = "";
                cssClass += (popin_on_bottom) ? 'bottom-' : 'top-';
                cssClass += (popin_aligned_on_right) ? 'left' : 'right';
                newDOMElt.addClass(cssClass);
            }
        }

        // Positions the popin so that its content is displayed at the location of the mouse click
        function clickPositionning() {
            var mouse_X = $event.clientX;
            var mouse_Y = $event.clientY;
            var popin_W = $(newDOMElt).outerWidth(true);
            var popin_H = $(newDOMElt).outerHeight(true);
            var window_W = window.innerWidth;
            var window_H = window.innerHeight;

            var popin_on_bottom = (mouse_Y + popin_H < window_H);
            var popin_on_right = (mouse_X + popin_W < window_W);

            var popin_X = (popin_on_right) ? (mouse_X) : (mouse_X - popin_W);
            var popin_Y = (popin_on_bottom) ? (mouse_Y) : (mouse_Y - popin_H);

            newDOMElt.css("top", popin_Y);
            newDOMElt.css("left", popin_X);

            // Add an arrow linking the popin to the element which triggered it
            if (opts.arrow) {
                var cssClass = "";
                cssClass += (popin_on_bottom) ? 'bottom-' : 'top-';
                cssClass += (popin_on_right) ? 'right' : 'left';
                newDOMElt.addClass(cssClass);
            }
        }

        //returning function to remove popin
        return newScope.dismiss;
    }
});

app.factory('TreeViewSortableService', function() {
    let currentNode;
    return {
        setCurrent: (node) => {currentNode = node;},
        getCurrent: () => currentNode
    };
});

app.directive('treeView', function($stateParams, $timeout, openDkuPopin, TreeViewSortableService) {
    return {
        templateUrl: '/templates/widgets/tree-view-node.html',
        restrict: 'AE',
        scope: {
            nodes: '=treeView',
            rootNodes: '=?',
            depth: '<',
            nodeName: '<',
            onClick: '<',
            onArrowClick: '<',
            iconClass: '<',
            iconTitle: '<',
            rightIconClass: '<',
            rightIconTitle: '<',
            nodeClass: '<',
            showDragHandles: '<',
            scrollToNodeFn: '=?',
            getTaxonomyMassExpandCollapseStateFn: '=?',
            expandAllFn: '=?',
            collapseAllFn: '=?',
            setReduceFn: '=?',
            setUnfoldedNodeIdsFn: '<?',
            getUnfoldedNodeIdsFn: '<?',
            getNodeIdsHavingChildrenFn: '<?',
            getRightClickMenuTemplate: '<?',
            contextMenuFns: '=?',
            showContextMenu: '=?'
        },
        link: function($scope, $el) {
            if (!$scope.nodes) {
                throw new Error("No nodes provided to tree view");
            }


            $scope.depth = $scope.depth || 0;
            $scope.MARGIN_PER_DEPTH = 15;
            $scope.uiState = {};

            $scope.activateSortable = function() {
                const parentNode = ($scope.$parent && $scope.$parent.node || $scope.uiState);
                (TreeViewSortableService.getCurrent() || {}).$sortableEnabled = false;
                parentNode.$sortableEnabled = true;
                $scope.nodes.forEach(n => n.$reduced = true);
                TreeViewSortableService.setCurrent(parentNode);
            };

            // disabled dragstart event in order to disable native browser drag'n'drop and allow mouse up event when drag'n'dropping
            $timeout(() => $el.find('> ul > li > div.tree-view-node > div > span.handle-row').each((idx, el) => { el.ondragstart = () => false }));
            $scope.onSortableStop = function() {
                for (let i = 0; i < $scope.nodes.length; i++) {
                    delete $scope.nodes[i].$tempReduced;
                }
            };
            $scope.onNodeMouseDown = function(node) {
                node.$tempReduced = true;
            };
            $scope.treeViewSortableOptions = {
                axis:'y',
                cursor: 'move',
                cancel: '',
                handle: '.tree-view-drag-handle',
                update: $scope.onSortableStop
            };

            $scope.onNodeClick = function(node, evt) {
                if (!$(evt.originalEvent.explicitOriginalTarget).is('i.icon-reorder')) {
                    $scope.onClick(node);
                }
            };

            $scope.openContextMenu = function (node, $event) {
                if (!$scope.showContextMenu) {
                    return;
                }

                node.$rightClicked = true;

                let template = `<ul class="dropdown-menu" ng-click="popupDismiss()">`;
                switch ($scope.getNodeMassExpandCollapseStateFn(node.id)) { //NOSONAR
                    case "EXPAND_ALL":
                        template += `
                            <li class="dku-border-bottom">
                                <a href="#" ng-click="expandChildren('`+node.id+`')">
                                    <i class="icon-dku-expand-all icon-fixed-width" /> Expand all
                                </a>
                            </li>`;
                        break;
                    case "COLLAPSE_ALL":
                        template += `
                            <li class="dku-border-bottom">
                                <a href="#" ng-click="collapseChildren('`+node.id+`');">
                                    <i class="icon-dku-collapse-all icon-fixed-width" /> Collapse children
                                </a>
                            </li>`;
                        break;
                    default:
                        break;
                }
                template += $scope.getRightClickMenuTemplate(node);

                template += `</ul>`;

                let isElsewhere = function (elt, e) {
                    let result = $(e.target).parents('.dropdown-menu').length == 0;
                    if (result) {
                        delete node.$rightClicked;
                    }
                    return result;
                };

                $scope.popupDismiss = openDkuPopin($scope, $event, {template:template, isElsewhere:isElsewhere, popinPosition:'CLICK'});
            };

            // Return an array containing all the parent nodes and the searched node itself
            function getAncestorsOfNodeId(nodeId, nodes = $scope.rootNodes, ancestors=[]) {
                let n = nodes.find(n => n.id == nodeId);

                if (angular.isDefined(n)) {
                    return ancestors.concat(n);
                } else {
                    for (let i=0; i<nodes.length; i++) {
                        let node = nodes[i];
                        if (node.children && node.children.length > 0) {
                            let r = getAncestorsOfNodeId(nodeId, node.children, ancestors.concat(node));
                            if (r) {
                                return r;
                            }
                        }
                    }
                    return null;
                }
            }

            // Return an array containing all the children nodes and the node itself
            function getDescendantsOfNode(node, descendants=[node]) {
                if (node.children.length > 0) {
                    for (let i=0; i<node.children.length; i++) {
                        let child = node.children[i];
                        let r = getDescendantsOfNode(child, [child]);
                        descendants = descendants.concat(r);
                    }
                }
                return descendants;
            }

            function getNodeFromNodeId(nodeId, nodes = $scope.rootNodes) {
                let n = nodes.find(n => n.id == nodeId);

                if (angular.isDefined(n)) {
                    return n;
                } else {
                    for (let i=0; i<nodes.length; i++) {
                        let node = nodes[i];
                        if (node.children && node.children.length > 0) {
                            let r = getNodeFromNodeId(nodeId, node.children);
                            if (r) {
                                return r;
                            }
                        }
                    }
                    return null;
                }
            }


            /*** Folding & Unfolding functions ***/
            $scope.getTaxonomyMassExpandCollapseStateFn = function() {
                let IDsUnfolded = $scope.getUnfoldedNodeIdsFn();
                let IDsHavingChildren = $scope.getNodeIdsHavingChildrenFn();

                if (IDsHavingChildren.length == 0) {
                    return "";
                } else if (IDsHavingChildren.length > IDsUnfolded.length) {
                    return "EXPAND_ALL";
                } else {
                    return "COLLAPSE_ALL";
                }
            };

            $scope.getNodeMassExpandCollapseStateFn = function(nodeId) {
                let node = getNodeFromNodeId(nodeId);
                if (angular.isDefined(node)) {
                    let descendants = getDescendantsOfNode(node).filter(n => n.id != nodeId);
                    let hasDescendants = descendants.length > 0;
                    let hasCollapsedChildren = !!descendants.find(n => n.$reduced == true && angular.isDefined(n.children) && n.children.length > 0);
                    let hasGrandChildren = !!descendants.find(n => angular.isDefined(n.children) && n.children.length > 0);
                    if (!hasDescendants) {
                        return "";
                    } else if (node.$reduced || hasCollapsedChildren) {
                        return "EXPAND_ALL";
                    } else if (hasGrandChildren) {
                        return "COLLAPSE_ALL";
                    } else {
                        return "";
                    }
                }
            }

            $scope.expandAllFn = function() {
                setReduceMultiple($scope.nodes, false);
            };

            $scope.collapseAllFn = function() {
                setReduceMultiple($scope.nodes, true);
            };

            $scope.expandChildren = function(nodeId) {
                let node = getNodeFromNodeId(nodeId);
                setReduceMultiple([node], false);
            };

            $scope.collapseChildren = function(nodeId) {
                let node = getNodeFromNodeId(nodeId);
                if (angular.isDefined(node.children)) {
                    setReduceMultiple(node.children, true);
                }
            };

            function expandNodes(nodes) {
                setReduceMultiple(nodes, false, false);
            }

            function setReduceMultiple(nodes, fold, recursive = true) {
                if (!angular.isDefined(nodes) || !nodes.length || nodes.length == 0) {
                    return;
                }

                angular.forEach(nodes, function(node) {
                    $scope.setReduceFn(node, fold);

                    if (recursive) {
                        setReduceMultiple(node.children, fold, recursive);
                    }
                });
            }

            $scope.setReduceFn = function(node, reduce) {
                // No need to set the value if it hasn't changed
                if (!angular.isDefined(node) || node.$reduced == reduce) {
                    return;
                }

                if (reduce) {
                    node.$reduced = true;
                } else {
                    delete node.$reduced;
                }

                // Keeping parent aware of this change if he gave us some way to.
                if (typeof($scope.getUnfoldedNodeIdsFn)==="function" && typeof($scope.setUnfoldedNodeIdsFn)==="function") {
                    let unfoldedNodeIds = $scope.getUnfoldedNodeIdsFn();
                    let index = unfoldedNodeIds.indexOf(node.id);

                    if (reduce) {
                        if (index > -1) {
                            unfoldedNodeIds.splice(index, 1);
                        }
                    } else {
                        if (index == -1 && node.children.length > 0) {
                            unfoldedNodeIds.push(node.id);
                        }
                    }
                    $scope.setUnfoldedNodeIdsFn(unfoldedNodeIds);
                }
            }


            /*** Scrolling functions ***/
            $scope.scrollToNodeFn = function(nodeId, duration) {
                let ancestors = getAncestorsOfNodeId(nodeId);

                if (ancestors) {
                    let node = ancestors.pop();
                    expandNodes(ancestors);
                    $timeout(() => $scope.triggerScroll(node, duration));
                }
            };

            $scope.shouldScrollToNode = function(node) {
                return node.$scrollToMe;
            };

            $scope.scrollDuration = function(node) {
                return node.$scrollDuration;
            };

            $scope.triggerScroll = function(node, duration) {
                node.$scrollToMe = true;
                node.$scrollDuration = duration;
            };

            $scope.onScrollTriggered = function(node) {
                node.$scrollToMe = false;
                delete node.$scrollDuration;
            };
        }
    };
});


app.directive("dkuHtmlTooltip", function($timeout, openDkuPopin) {
    return {
        template : '<div ng-mouseover="displayTooltip($event)" ng-mouseleave="removeTooltip()" class="dku-html-tooltip-activation-zone {{triggerClass}}"><div ng-transclude="trigger"></div><div style="display: none;" ng-transclude="content"></div></div>',
        restrict: 'A',
        scope: {
            fromModal: '=?',
            tooltipClass: '@',
            triggerClass: '@',
            position: '@?', // if not present, uses openDkuPopin, otherwises sets the position manually
        },
        transclude: {
            'trigger': 'tooltipTrigger',
            'content': 'tooltipContent'
        },
        link: function($scope, elmnt, attrs) {

            var tooltipDisplayed = false;

            /*
             * _removeTooltip will be returned by openDkuPopin service when popin will actually be displayed.
             * This is b/c openDkuPopin create a new $scope and a DOM element when displaying a popin,
             * and returns a method to destroy this specific scope and remove new DOM element from DOM.
             */
            var _removeTooltip = function() {
                // noop
            };

            $scope.removeTooltip = function() {
                _removeTooltip();
                _removeTooltip = function() {
                    // noop
                };
                tooltipDisplayed = false;
            };

            $scope.displayTooltip = function($event) {
                if (!tooltipDisplayed && (!attrs.dkuHtmlTooltipShow || $scope.$parent.$eval(attrs.dkuHtmlTooltipShow))) {
                    var cssClass = $scope.fromModal ? "dku-html-tooltip from-modal" : "dku-html-tooltip";
                    var content = $(elmnt).find('tooltip-content')[0].innerHTML;
                    var template = `<div class="${cssClass} ${$scope.tooltipClass || ''}">${content}</div>`;
                    var isElsewhere = function (tooltipElement, event) {
                        return $(event.target).parents('.dku-html-tooltip').length == 0 || $(event.target).parents('.dku-html-tooltip')[0] != tooltipElement;
                    };
                    if (
                        ['top', 'bottom', 'left', 'right', 'top-right', 'top-left', 'bottom-right', 'bottom-left'].includes(
                            $scope.position
                        )
                    ) {
                        _removeTooltip = openManuallyPositionedTooltip(template, elmnt, $scope.position);
                    } else {
                        var dkuPopinOptions = {
                            template: template,
                            isElsewhere: isElsewhere,
                            doNotCompile: true
                        };
                        _removeTooltip = openDkuPopin($scope, $event, dkuPopinOptions);
                    }
                    tooltipDisplayed = true;
                }
            };

            /*
             * Opens a tooltip for the element, using the template, at a manually set position
             * (top, bottom, right, left, top-right, top-left, bottom-right, bottom-left)
             * Returns a function that removes the tooltip
             */
            function openManuallyPositionedTooltip(template, element, position) {
                let tooltip = $(template);
                $('body').append(tooltip); //so we have access to dimensions

                let posLeft = 0;
                let posTop = 0;
                // left/top offset of the element
                const left = $(element).offset().left;
                const top = $(element).offset().top;
                // (Outer) width/height of the element
                const outerWidth = $(element).outerWidth();
                const outerHeight = $(element).outerHeight();
                // (Outer) width/heigth of the tooltip
                const tooltipOuterWidth = tooltip.outerWidth();
                const tooltipOuterHeight = tooltip.outerHeight();
                // Margin (= 2 * size of the arrow)
                const margin = 10;

                // We set the tooltip left/top offset according to desired position
                if (position == 'top') {
                    posLeft = left + outerWidth / 2 - tooltipOuterWidth / 2;
                    posTop = top - tooltipOuterHeight - 3 * margin / 2;
                } else if (position == 'top-right') {
                    posLeft = left + outerWidth;
                    posTop = top - tooltipOuterHeight - 3 * margin / 2;
                } else if (position == 'top-left') {
                    posLeft = left - tooltipOuterWidth + margin;
                    posTop = top - tooltipOuterHeight - 3 * margin / 2;
                } else if (position == 'bottom-left') {
                    posLeft = left - tooltipOuterWidth + margin;
                    posTop = top + outerHeight + margin / 2;
                } else if (position == 'bottom-right') {
                    posLeft = left + outerWidth;
                    posTop = top + outerHeight + margin / 2;
                } else if (position == 'bottom') {
                    posLeft = left + outerWidth / 2 - tooltipOuterWidth / 2;
                    posTop = top + outerHeight + margin / 2;
                } else if (position == 'left') {
                    posLeft = left - tooltipOuterWidth - margin / 2;
                    posTop = top - tooltipOuterHeight / 2;
                } else if (position == 'right') {
                    posLeft = left + outerWidth + 3 * margin / 2;
                    posTop = top - tooltipOuterHeight / 2;
                }
                tooltip.css('left', posLeft);
                tooltip.css('top', posTop);
                tooltip.addClass(position); // Adds the arrow at the right position

                $('body').append(tooltip);

                function dismiss() {
                    tooltip.remove();
                }

                return dismiss;
            }
        }
    }
});


app.directive("summaryOfError", function(Dialogs){
    return {
        // No isolated scope because we need to attach modals to the parent
        restrict: 'A',
        scope: true,
        template: '<span style="overflow-y: scroll">\n    <span ng-show="error" class="summary-of-error">\n        <span ng-show="error.title"><strong>{{error.title}}</strong>:</span> \n        <span ng-show="error.detailedMessageHTML" ng-bind-html="error.detailedMessageHTML"/>\n        <span ng-show="!error.detailedMessageHTML">{{error|detailedMessageOrMessage}}</span>\n    </span>\n</span><a style="font-weight: 500; margin-top:10px; font-size: 14px;" ng-click="openMoreInfo()">More info about this error</a>',
        link: function($scope, element, attrs) {

            $scope.$watch(attrs.summaryOfError, function(nv, ov) {
                $scope.error = nv;
            });


            $scope.openMoreInfo = function(){
                 Dialogs.displaySerializedError($scope, $scope.error);
            }
        }
    }
});

    app.directive("errorFixability", function($rootScope, $state){
    return {
        restrict: 'A',
        templateUrl: "/templates/errors/error-fixability.html",
        scope: {
            error : "="
        },
        link: function($scope) {
            $scope.$state = $state;
            $scope.$root = $rootScope;
        }
    }
});

app.directive('barMetrics', function () {
    return {
        scope: {data: '=barMetrics', height:'='},
        template: '<svg class="gpu-bar-metrics"></svg>',
        link: function ($scope, el, attrs) {
            const HEIGHT = $scope.height || 10;

            let svg = d3.select(el[0]).select('svg');
            let defs = svg.append('defs');

            let mainGradient = defs.append('linearGradient')
                .attr('id', 'mainGradient');

            mainGradient.append('stop')
                .attr('class', 'gpu-bar-metrics__stop-left')
                .attr('offset', '0');
            mainGradient.append('stop')
                .attr('class', 'gpu-bar-metrics__stop-right')
                .attr('offset', '1');

            let container = d3.select(el[0]).select('svg').append('g').attr('class', 'container').attr('transform', `translate(0, ${Math.max(HEIGHT/2,10)})`);
            $scope.$watchCollection('data', function (data) {
                if (data) {
                    const PREFIX_WIDTH = el[0].clientWidth / 4;
                    const POSTFIX_WIDTH = el[0].clientWidth / 5;
                    const MAX_BAR_WIDTH = el[0].clientWidth-PREFIX_WIDTH-POSTFIX_WIDTH;
                    const scales = data.map(d => d3.scale.linear().domain([d.min, d.max]).range([0, MAX_BAR_WIDTH]));
                    let g = container.selectAll('g.metric').data($scope.data);
                    let SPACE_BETWEEN = 8;
                    let gEnter = g.enter().append('g').attr('class', 'metric').attr('transform', (d, i) => `translate(0, ${i * (HEIGHT + SPACE_BETWEEN )})`);
                    gEnter.append('rect').attr('x',PREFIX_WIDTH).attr('y',-HEIGHT/2).attr('width', MAX_BAR_WIDTH).attr('height', HEIGHT).classed('gpu-bar-metrics__filled', true);
                    gEnter.append('rect').attr('x',PREFIX_WIDTH).attr('y',-HEIGHT/2).attr('class', 'val-inverted').attr('width', MAX_BAR_WIDTH).attr('height', HEIGHT).attr('fill', '#ececec');
                    gEnter.append('text').attr("alignment-baseline","middle").attr('text-anchor','start').attr('y', 0).attr('height', 50).text(d => d.label).attr('x', 0).attr("font-size", "10px").attr("fill", "grey");

                    gEnter.append('text').attr("alignment-baseline","middle").attr('text-anchor', 'end').attr('class', 'percentage').attr('y', 0).attr('x', el[0].clientWidth).attr("font-size", "10px").attr("fill", "grey");
                    g.select('text.percentage').text(d => `${Math.round(d.value * 100 / d.max)} %`);
                    g.select('rect.val-inverted').transition().attr('width', (d, i) => MAX_BAR_WIDTH - scales[i](d.value)).attr('x', (d, i) => PREFIX_WIDTH + scales[i](d.value));
                }
            });
        }
    }
});

app.directive('gitCheckoutSelect', function (SpinnerService, DataikuAPI) {
    return {
        scope: {
            gitCheckout: '=ngModel',
            gitRepository: '=repository'
        },
        templateUrl: '/templates/widgets/git-checkout-select.html',
        link: function ($scope) {
            $scope.gitCustomCheckout = true;
            $scope.gitLoadedRefsRepo = ''; // The repository where the currently loaded references are from

            $scope.$watch('gitRepository', function(nv) {
                if (nv && nv !== '') {
                    // When you change the input repository, you shouldn't have the old references list
                    $scope.gitCustomCheckout = $scope.gitRepository !== $scope.gitLoadedRefsRepo;
                }
            });

            $scope.listRemoteRefs = function () {
                // If the parent scope can show the error (`block-api-error` directive), it'll be better presented that way
                // Otherwise, we'll display it in that directive
                const errorScope = angular.isFunction($scope.$parent.setError) ? $scope.$parent : $scope;

                if ($scope.gitRepository && $scope.gitRepository !== '') {
                    resetErrorInScope(errorScope);

                    SpinnerService.lockOnPromise(DataikuAPI.git.listRemoteRefs($scope.gitRepository)
                        .then(function(response) {
                            $scope.gitCheckoutRefs = response.data;
                            $scope.gitCustomCheckout = false;
                            $scope.gitLoadedRefsRepo = $scope.gitRepository
                        }, function(err) {
                            $scope.gitCheckoutRefs = [];
                            $scope.gitCustomCheckout = true;
                            $scope.gitLoadedRefsRepo = '';
                            errorScope.setError(err);
                        })
                    )
                }
            };
        }
    }
});

app.directive('gpuOnlineStats', function ($interval, Notification,Logger) {
    return {
        scope: {metrics:"=", selected:"=", selectable:"="},
        transclude: true,
        restrict: 'A',
        template: `<div ng-if="gpuCount" class="gpu-online-stats-wrapper">
                        <div ng-show="gpuStats && gpuResponse.status === 'OK'" ng-repeat="i in range(gpuCount)" class="gpu-online-stats__gpu-block" ng-click="selectable && selected && clickOnGpu(i)" ng-class="{selected:isGPUselected(i),'gpu-online-stats__gpu-block--selectable':selectable }">
                            <i class="icon icon-dku-gpu-card"></i>
                            <div>
                                <div class="gpu-online-stats__title"><span>{{gpuResponse.stats[i].name}} [{{gpuResponse.stats[i].index}}]</span><span class="gpu-online-stats__secondary-title">{{gpuResponse.stats[i].memoryTotal}} MB</span></div>
                                <div bar-metrics="gpuStats[i]" class="gpu-online-stats__gpu-graph" height="6"></div>
                            </div>
                        </div>
                    </div>
                    <div class="alert alert-error" ng-show="gpuResponse.status === 'ERROR'" style="text-align: center">
                        <span>{{gpuResponse.error}}</span>
                    </div>`,
        link: function (scope, element, attrs, ctrl, transclude) {
            if (scope.selected && !(scope.selected instanceof Array)) {
                Logger.error(`gpuOnlineStats directive accepts a Array as a <selected> parameter, but ${scope.selected.constructor.name} was given`)
                scope.selected = null;
            }
            Notification.publishToBackend('gpu-monitoring-start');

            let KEEP_ALIVE_INTERVAL_MS = 2*1000;
            let cancelKeepAlive = $interval(function () {
                Notification.publishToBackend('timeoutable-task-keepalive', {
                    taskId: "gpu-monitoring"
                });
            }, KEEP_ALIVE_INTERVAL_MS);
            scope.range = function (n) {
                return Array.range(n);
            };

            scope.clickOnGpu = i => {
                if (!scope.selected.includes(i)){
                    scope.selected.push(i);
                } else {
                    scope.selected.splice(scope.selected.indexOf(i),1);
                }
            };
            scope.isGPUselected = i => scope.selected && scope.selected.includes(i);

            scope.$on('$destroy', function () {
                $interval.cancel(cancelKeepAlive);
            });
            Notification.registerEvent("gpu-stats-response", function (evt, message) {
                scope.gpuResponse = message.response;
                if (scope.gpuResponse.status === 'OK') {

                    scope.gpuStats = message.response.stats.map(g => [{
                        label: 'Memory',
                        value: g.memoryUsed,
                        min: 0,
                        max: g.memoryTotal
                    }, {
                        label: 'GPU',
                        value: g.utilizationGpu,
                        min: 0,
                        max: 100
                    }].filter(d => d.value !== undefined && (!scope.metrics || scope.metrics.includes(d.label))));
                    scope.gpuCount = scope.gpuStats.length;
                }
            });
        }
    }
});
    app.directive('gpuSelector', function (Notification, $rootScope,DataikuAPI, $stateParams) {
        return {
            scope : {gpuSelector:'=', selectedEnv:'=', name:'@', inContainer:'='},
            controller: function ($scope) {
                let lastGpuStats;
                if (!$scope.gpuSelector.perGPUMemoryFraction){
                    $scope.gpuSelector.perGPUMemoryFraction = 0.7;
                }
                $scope.uiState = {};
                if ($scope.inContainer) {
                    $scope.uiState.numGpus = $scope.gpuSelector.gpuList.length;
                }
                $scope.updateGpuSelectionCheckbox = function () {
                    if ($scope.gpuSelector.gpuList.length >= 0 && $scope.gpuSelector.gpuList.length !== $scope.GPUcount) {
                        for (let i = 0; i < $scope.GPUcount; i++) {
                            !$scope.gpuSelector.gpuList.includes(i) && $scope.gpuSelector.gpuList.push(i);
                        }
                    } else {
                        // clear the array
                        $scope.gpuSelector.gpuList.length = 0;
                    }
                };
                Notification.registerEvent("gpu-stats-response", function (evt, message) {
                    $scope.GPUstatus = message.response.status;
                    if (!$scope.GPUcount) {
                        $scope.GPUcount = message.response.stats.length;
                    }
                    lastGpuStats = message.response.stats;
                });
                $scope.$watch('gpuSelector.useGPU', (nv, ov) => {
                    if (!ov && nv && lastGpuStats) {
                        let mostAvailableGpuIdx = lastGpuStats.sort((a, b) => a.memoryUsed - b.memoryUsed)[0].index;
                        $scope.gpuSelector.gpuList = [mostAvailableGpuIdx];
                    }
                });
                $scope.numGpusChange = function() {
                    if ($scope.uiState.numGpus && $scope.uiState.numGpus > 0) {
                        $scope.gpuSelector.gpuList = Array.range($scope.uiState.numGpus);
                    }
                };
                if (!$rootScope.appConfig.isAutomation) {
                    DataikuAPI.codeenvs.listWithVisualMlPackages($stateParams.projectKey).success(function (data) {
                        let env = data.envs.find(el=>el.envName === $scope.selectedEnv);
                        $scope.envSupportsGpu = env && env.deepLearning.supportsGpu;
                        if (!$scope.envSupportsGpu) {
                            $scope.gpuSelector.useGPU = false;
                        }
                    });
                } else {
                    $scope.envSupportsGpu = true;
                }
            },
            // language=HTML
            template: `
                <div>
                    <h2 class="settings-section-title" style="line-height: 27px;">
                        <label class="dku-toggle" style="margin: 0 5px 0 0">
                            <input type="checkbox"
                                   ng-model="gpuSelector.useGPU"
                                   disabled-if="!envSupportsGpu"
                            >
                            <span/>
                        </label>
                        {{name}}
                    </h2>

                    <form class="dkuform-horizontal">
                        <div class="help-inline" ng-if="!gpuSelector.useGPU && !envSupportsGpu">
                            The selected environment ({{selectedEnv}}) doesn't have the required packages installed to activate training on GPU.
                        </div>
                        <div ng-if="gpuSelector.useGPU">
                            <div ng-if="!inContainer" gpu-online-stats selectable="true" metrics="['GPU','Memory']" on-click="clickOnGpu" selected="gpuSelector.gpuList"></div>
                            <div ng-if="inContainer">
                                <div class="dkuform-horizontal">
                                    <div class="control-group">
                                        <label class="control-label">Number of GPU(s)</label>
                                        <div class="controls">
                                            <input type="number" min="1" step="1" required ng-model="uiState.numGpus" ng-change="numGpusChange()"/>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div ng-show="(GPUstatus === 'OK') || inContainer">
                                <div class="dkuform-horizontal">

                                    <div class="control-group">
                                        <label class="control-label">Memory allocation rate per GPU</label>
                                        <div class="controls">
                                            <input type="number" min="0.1" max="1" step="0.1" required ng-model="gpuSelector.perGPUMemoryFraction"/>
                                        </div>
                                    </div>
                                    <div class="control-group">
                                        <label class="control-label">Allow growth</label>
                                        <div class="controls">
                                            <input type="checkbox" ng-model="gpuSelector.gpuAllowGrowth"/>
                                            <div class="help-inline">Allocate only as much GPU memory as needed. Experimental.</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            `
        }

    });

    /*
        See NPSSurveyState for NPS survey timing logic
    */
    app.component('npsSurvey', {
        templateUrl: '/templates/widgets/nps-survey.html',
        bindings: {
            appConfig: '='
        },
        controller: ['$scope', '$timeout', '$filter', 'DataikuAPI', 'WT1',
            function npsSurveyCtrl($scope, $timeout, $filter, DataikuAPI, WT1) {
                const ctrl = this;
                ctrl.Actions = {
                    NEW: 1,
                    SUBMIT: 2,
                    POSTPONE: 3,
                    OPTOUT: 4
                };
                ctrl.showSurvey = false;
                ctrl.active = false;
                ctrl.finished = false;
                ctrl.scores = Array.from({length: 10}, (_, i) => (i + 1));
                ctrl.response = '';

                ctrl.$onInit = function() {
                    if (this.appConfig && this.appConfig.npsSurveyActive) {
                        ctrl.email = this.appConfig.user && this.appConfig.user.email ? this.appConfig.user.email : ''
                        ctrl.showSurvey = true;
                        $timeout(function() { ctrl.active = true; });
                    }
                };

                ctrl.finish = function(action) {
                    // if user clicks on something after submitting
                    if (ctrl.finished) {
                        return;
                    }

                    DataikuAPI.profile.setNPSSettings(action).success((data) => {
                        let eventParams = {
                            action: action,
                            npsState: data && data.state ? data.state : ''
                        };

                        if (action === 'SUBMIT') {
                            WT1.event('nps-survey', angular.extend(eventParams, {
                                score: ctrl.surveyScore,
                                response: $filter('escapeHtml')(ctrl.response || ''),
                                email: $filter('escapeHtml')(ctrl.email || '')
                            }));
                            ctrl.finished = true;
                            // for animation
                            $timeout(function() {
                                ctrl.active = false;
                                $timeout(function() { ctrl.showSurvey = false; }, 1000);
                            }, 1000);
                        } else {
                            // for animation
                            ctrl.active = false;
                            $timeout(function() { ctrl.showSurvey = false; }, 1000);

                            WT1.event('nps-survey-decline', eventParams);
                        }
                    }).error(setErrorInScope.bind($scope));
                };

                ctrl.selectScore = function(score) {
                    ctrl.surveyScore = score;
                };
            }
        ]
    });


/*
    Tiny directive to handle the display of a sort icon in a table.

    Fields:
      * isSortCol: whether the current col is used for sorting (and the icon should be displayed)
      * ascending: whether the sort is ascending
      * iconOnRight: whether the icon is put on the right of the column name

    Besides, if you want to display a grayer version of the icon when hovering on the column name,
    your must add the .contains-sort-by-column-icon in the container of the column

    Example:
        <div class="my-container contains-sort-by-column-icon">
            <span>My title column</span>
            <sort-by-column-icon isSortCol="isSortCol" ascending="selection.orderReverse" icon-on-right="true"></sort-by-column-icon>
        </div>
*/
app.directive("sortByColumnIcon", function() {
    return {
        scope: {
            isSortCol: "=",
            ascending: "=",
            iconOnRight: "@"
        },
        template: `<div class="sort-by-column-icon__wrapper" ng-class="iconOnright ? 'icon-on-right' : 'icon-on-left'">
                      <i ng-if="!isSortCol" class="icon-sort-by-attributes-alt sort-by-column-icon--display-on-hover"></i>
                      <i ng-if="isSortCol && ascending" class="icon-sort-by-attributes"></i>
                      <i ng-if="isSortCol && !ascending" class="icon-sort-by-attributes-alt"></i>
                   </div>`
    }
});

/*
    Binary Classification Confusion Matrix widget
*/
app.directive("bcConfusionMatrix", function() {
    return {
        templateUrl:"/templates/widgets/bc_confusion_matrix.html",
        scope: {
            modelClasses: "=",
            data: "=",
            displayMode: "=",
            metricsWeighted: "="
        },
        controller: function($scope) {

            $scope.getMaybeWeighted = function(x) {
                if (typeof x !== 'number') {
                    return x; // for when it's percentage
                }
                return $scope.metricsWeighted ? x.toFixed(2) : x.toFixed(0);
            };

            // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
            $scope.puppeteerHook_elementContentLoaded = true;
        }
    }
});

/*
    Multi Classification Confusion Matrix widget
*/
app.directive("mcConfusionMatrix", function() {
    return {
        templateUrl:"/templates/ml/prediction-model/mc_confusion.html",
        scope: {
            modelData: "=",
            displayMode: "="
        },
        controller: 'MultiClassConfusionMatrixController'
    }
});

/**
 * Generic component that displays a d3 brush.
 */
app.directive('rangeBrush', function(Fn) {
    return {
        restrict : 'A',
        templateUrl : '/templates/widgets/range-brush.html',
        scope : {
            range : '=',
            selectedRange : '=',
            onChange : '&',
            onDrillDown : '&',
            snapRanges : '=',
            onInit: '&',
            brushWidth: '@',
            enablePadding: '=?'
        },
        replace : true,
        link : function($scope, element) {
            $scope.enablePadding = angular.isDefined($scope.enablePadding) ? $scope.enablePadding : true;

            const padding = $scope.enablePadding ? 10 : 4; // 4 to be able to display the handles
            const brushHeight = 60;
            const dateLineHeight = 25;
            const triggerHeight = 18;
            const triggerWidth = 0.8 * triggerHeight;
            const handleHeight = 20;
            const handleWidth = 8;
            const separatorHeight = 3;
            const separatorOffset = -2;

            // the svg needs to update when the width changes (different # of ticks, for ex)
            var eventName = 'resize.brush.' + $scope.$id;
            $(window).on(eventName, function() { if ( $scope.range != null ) $scope.refreshRange();});
            $scope.$on('$destroy', function(){$(window).off(eventName)});
            // also add a watch on the width for the cases where the size changes as a result of
            // stuff being shown/hidden
            $scope.$watch(
                function () {return element.width();},
                function (newValue, oldValue) { if ( $scope.range != null ) $scope.refreshRange(); }
            );

            // get the brush : the root of the template
            var brushSvg = d3.select(element[0]);
            // resize
            brushSvg.attr("height", brushHeight);

            // add stuff in the svg (layer in this order: to get the display and click-sensitivity right)
            var xAxisG = brushSvg.append("g").attr("class", "x axis").attr("transform", "translate(0, " + dateLineHeight + ")");
            
            var brushG = brushSvg.append("g").attr("class", "x brush"); // brush (catches mouse events to drag handles and brush extend)
            var triggersG = brushSvg.append("g").attr("class", "x triggers").attr("transform", "translate(0, " + dateLineHeight + ")"); // layer with the triggers, clickable
            var brushInversionG = brushSvg.append("g").attr("class", "x brush-inversion"); // the inverse of the brush (click-through)
            var brushHandlesG = brushSvg.append("g").attr("class", "x brush-handles"); // the brush handles (click-through)
            var brushContentG = brushSvg.append("g").attr("class", "x brush-content"); // where to append stuff (like chart preview)

            const brushContentWidth = $scope.brushWidth - (2 * padding);

            if ($scope.brushWidth) {
                brushSvg.style("width", $scope.brushWidth + 'px');
                brushContentG.attr("transform", "translate(" + padding + ", 0)");
                brushContentG.attr("width", brushContentWidth);
            }

            brushSvg.on('dblclick', function(e) {
                var insideExtent = false;
                if ( xScale != null ) {
                    var pos = d3.mouse(element[0]);
                    var xPos = xScale.invert(pos[0]).getTime();
                    insideExtent = $scope.selectedRange.from < xPos && $scope.selectedRange.to > xPos;
                }
                if (insideExtent && $scope.onDrillDown() != null) {
                    // why can't I pass the first () in the html? dunno...
                    $scope.onDrillDown()($scope.selectedRange.from, $scope.selectedRange.to);
                } else {
                    $scope.selectedRange.from = $scope.range.from;
                    $scope.selectedRange.to = $scope.range.to;
                    $scope.refreshRange();
                    $scope.onChange();
                }
            });

            var xScale = null;

            // update the total range, and then the graph
            $scope.refreshRange = function() {
                if ( $scope.range == null || $scope.selectedRange == null ) {
                    return;
                }
                var width = $(element).innerWidth();
                // the full range we are selecting in
                var axisRange = [new Date($scope.range.from), new Date($scope.range.to)];
                // the selected range
                var extentRange = $scope.selectedRange.from > 0 ? [new Date($scope.selectedRange.from), new Date($scope.selectedRange.to)] : axisRange;
                // make the scale
                xScale = d3.time.scale().domain(axisRange).range([padding, width - padding]);
                // prepare the brush callback
                var brushed = function() {
                    var extent = brush.extent();
                    // If we are simply clicking on the brush (one point interval), go back to previous range.
                    if (extent[1] - extent[0] === 0) { 
                        extent[0] = new Date($scope.selectedRange.from);
                        extent[1] = new Date($scope.selectedRange.to); 
                    }
                    if (d3.event.mode === "move") {
                        if ( $scope.rounding == 'day') {
                            var startDay = d3.time.day.round(extent[0]);
                            var daySpan = Math.round((extent[1] - extent[0]) / (24 * 3600 * 1000));
                            var endDay = d3.time.day.offset(startDay, daySpan);
                            extent = [startDay, endDay];
                        }
                    } else {
                        if ( $scope.rounding == 'day') {
                            extent = extent.map(d3.time.day.round);
                            if (extent[0] >= extent[1] ) {
                                extent[0] = d3.time.day.floor(extent[0]);
                                extent[1] = d3.time.day.ceil(extent[1]);
                            }
                        }
                    }
                    d3.select(this).call(brush.extent(extent));
                    var xS = xScale(extent[0]);
                    var xE = xScale(extent[1]);
                    brushInversionG.selectAll('.s').attr("x", 0).attr("width", xS);
                    brushInversionG.selectAll('.e').attr("x", xE).attr("width", width - xE);
                    brushHandlesG.selectAll(".s").attr("transform", "translate(" + xS + ", 0)");
                    brushHandlesG.selectAll(".e").attr("transform", "translate(" + xE + ", 0)");

                    $scope.selectedRange.from = extent[0].getTime();
                    $scope.selectedRange.to = extent[1].getTime();
                    $scope.onChange();
                };

                // make the brush
                var brush = d3.svg.brush().x(xScale).on("brush", brushed).extent(extentRange);
                // make the axis from the scale
                var xAxis = d3.svg.axis().scale(xScale).tickFormat(Fn.getCustomTimeFormat()).orient("top").tickSize(-(brushHeight - dateLineHeight));
                // and create the svg objects
                var a = xAxisG.call(xAxis);
                var b = brushG.call(brush);
                triggersG.selectAll("*").remove();
                var t = triggersG.selectAll(".trigger").data($scope.snapRanges);

                var xS = xScale(extentRange[0]);
                var xE = xScale(extentRange[1]);

                // draw the triggers
                var triggerPadding = (brushHeight - dateLineHeight - triggerHeight) / 2;
                t.enter().append("path")
                    .classed("trigger", true)
                    .classed("success", function(d) {return d.outcome == 'SUCCESS';})
                    .classed("failed", function(d) {return d.outcome == 'FAILED';})
                    .classed("aborted", function(d) {return d.outcome == 'ABORTED';})
                    .classed("warning", function(d) {return d.outcome == 'WARNING';})
                    .attr("d", function(d) { return "M" + xScale(new Date(d.start)) + "," + triggerPadding + " l"+triggerWidth+","+(triggerHeight/2)+" l-"+triggerWidth+","+(triggerHeight/2)+" z"; })
                    .on("click", function(d){
                        $scope.selectedRange.from = d.start; $scope.selectedRange.to = d.end; $scope.refreshRange(); $scope.onChange();
                    });

                // remove the axis line
                a.selectAll(".domain").remove();

                // style the brush
                b.selectAll("rect").attr("y", 0).attr("height", brushHeight);
                // create the handles the handles
                brushHandlesG.selectAll(".resize").remove();
                brushHandlesG.append("g").classed("resize", true).classed("s", true).attr("transform", "translate(" + xS + ", 0)");
                brushHandlesG.append("g").classed("resize", true).classed("e", true).attr("transform", "translate(" + xE + ", 0)");
                var bh = brushHandlesG.selectAll(".resize");
                bh.append("rect").classed("separator", true).attr("y", 0).attr("height", brushHeight).attr("x", separatorOffset).attr("width", separatorHeight);
                bh.append("rect").classed("handle", true).attr("y", (brushHeight - handleHeight) / 2).attr("height", handleHeight).attr("x", -(handleWidth/2)).attr("width", handleWidth);
                // add the invert of the brush for the overlay outside of the brush
                brushInversionG.selectAll("rect").remove();
                brushInversionG.append("rect").attr("x", 0).attr("width", xS).attr("y", 0).attr("height", brushHeight).classed("s", true);
                brushInversionG.append("rect").attr("x", xE).attr("width", width - xE).attr("y", 0).attr("height", brushHeight).classed("e", true);
            };

            // add event handler to adjust the brush when the selection changes
            $scope.$watch('range', function(nv, ov) {
                if ( nv == null ) return;
                $scope.refreshRange();
            }, true);
            $scope.$watch('snapRanges', function(nv, ov) {
                if ( nv == null ) return;
                $scope.refreshRange();
            }, true);
            $scope.$watch('selectedRange', function(nv, ov) {
                if ( nv == null ) return;
                $scope.refreshRange();
            }, true);
            $scope.$watch('brushWidth', function(nv, ov) {
                brushSvg.style("width", $scope.brushWidth + 'px');
            }, true);

            $scope.onInit && typeof $scope.onInit === 'function' && $scope.onInit({ brushContentG: brushContentG, brushContentHeight: brushHeight, brushContentWidth: brushContentWidth });
        }
    };
});
app.directive('datasetCreatorSelector', function ($parse) {
    return {
        templateUrl: '/templates/widgets/dataset-creator-selector.html',
        require:'^ngModel',
        scope: {
            ngModel: '=',
            managedDatasetOptions: '=',
            newDataset: '=',
            canCreate: '=',
            canSelectForeign: '=',
            markCreatedAsBuilt: '=',
            qa: '@'
        },
        controller: ['$scope', 'DataikuAPI', '$stateParams', 'DatasetUtils', function ($scope, DataikuAPI, $stateParams, DatasetUtils) {
            addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);
            $scope.partitioningOptions = [{id: "NP", label: "Not partitioned"}];
            $scope.io = {"newOutputTypeRadio": "create"};
            $scope.uiState = {mode:'select'};

            $scope.isCreationAllowed = angular.isDefined($scope.canCreate) ? $scope.canCreate : true;

            $scope.getDatasetCreationSettings = function () {
                let datasetCreationSetting = {
                    connectionId: ($scope.newDataset.connectionOption || {}).id,
                    specificSettings: {
                        overrideSQLCatalog: $scope.newDataset.overrideSQLCatalog,
                        overrideSQLSchema: $scope.newDataset.overrideSQLSchema,
                        formatOptionId: $scope.newDataset.formatOptionId,
                    },
                    partitioningOptionId: $scope.newDataset.partitioningOption,
                    inlineDataset: $scope.inlineDataset,
                    zone : $scope.zone,
                    markCreatedAsBuilt: $scope.markCreatedAsBuilt,
                };
                if ($scope.newDataset &&
                    $scope.newDataset.connectionOption &&
                    $scope.newDataset.connectionOption.fsProviderTypes &&
                    $scope.newDataset.connectionOption.fsProviderTypes.length > 1) {
                    datasetCreationSetting['typeOptionId'] = $scope.newDataset.typeOption;
                }
                return datasetCreationSetting;
            };

            $scope.createAndUseNewOutputDataset = function (force) {
                const projectKey = $stateParams.projectKey,
                    datasetName = $scope.newDataset.name,
                    settings = $scope.getDatasetCreationSettings();

                if (force) {
                    doCreateAndUseNewOutputDataset(projectKey, datasetName, settings);
                } else {
                    DataikuAPI.datasets.checkNameSafety(projectKey, datasetName, settings).success(data => {
                        $scope.uiState.backendWarnings = data.messages;
                        if (!data.messages || !data.messages.length) {
                            doCreateAndUseNewOutputDataset(projectKey, datasetName, settings);
                        }
                    }).error(setErrorInScope.bind($scope));
                }
            };

            function doCreateAndUseNewOutputDataset(projectKey, datasetName, settings) {
                DataikuAPI.datasets.newManagedDataset(projectKey, datasetName, settings)
                    .success(dataset => {
                        DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success((data) => {
                            $scope.uiState.mode = 'select';
                            if (!$scope.canSelectForeign) {
                                data = data.filter(fs => fs.localProject);
                            }
                            $scope.availableDatasets = data;
                            $scope.uiState.model = dataset.name;
                        });
                    }).error(setErrorInScope.bind($scope));
            }

            DatasetUtils.listDatasetsUsabilityForAny($stateParams.projectKey).success((data) => {
                if (!$scope.canSelectForeign) {
                    data = data.filter(fs => fs.localProject);
                }
                $scope.availableDatasets = data;
            });

            DataikuAPI.datasets.getManagedDatasetOptionsNoContext($stateParams.projectKey).success(function (data) {
                $scope.managedDatasetOptions = data;
                if (!$scope.newDataset.connectionOption && data.connections.length) {
                    const fsConnection = data.connections.find(e => {
                        return 'Filesystem' === e.connectionType;
                    });
                    if (fsConnection) {
                        $scope.newDataset.connectionOption = fsConnection;
                    } else {
                        $scope.newDataset.connectionOption = data.connections[0];
                    }
                }
                if (!$scope.newDataset.formatOptionId && $scope.newDataset.connectionOption.formats.length) {
                    $scope.newDataset.formatOptionId = $scope.newDataset.connectionOption.formats[0].id;
                }
                $scope.partitioningOptions = [
                    {"id": "NP", "label": "Not partitioned"},
                ].concat(data.projectPartitionings);

            });
        }],
        link: function (scope, el, attrs, ngModel) {
            scope.uiState = scope.uiState || {};
            scope.uiState.model = $parse(attrs.ngModel)(scope.$parent);
            scope.$watch("uiState.model", (nv, ov) => {
                if (ov === nv) return;
                if (nv === ngModel.$viewValue) return;
                // set the new value in the field and render
                ngModel.$setViewValue(nv);
                ngModel.$render();
            });
            scope.$watch("ngModel", (nv, ov) => {
                if (ov === nv) return;
                if (nv === scope.uiState.model) return;
                scope.uiState.model = ngModel.$viewValue;
            });
        }
    }
})

    /**
     * Display tags list if it fits else only one + the rest inside a popover.
     *
     * @param {Array}   items                   - List of the tags to display
     * @param {Object}  tagsMap                 - Map of all the available tags. Used mainly to get the tag colors
     * @param {Array}   globalTagsCategories    - List of existing global tag categories applying to this object type
     * @param {string}  objectType              - Taggable type of the object on which the tags are applied
     *
     * <responsive-tags-list items="item.tags" tags-map="projectTagsMap" object-type="'OBJECT_TYPE'"></responsive-tags-list>
     *
     * (!) The directive will throw an error if the parent's scope does not contain:
     * - selectTag(): the method that will be called on tag click.
     * - selection.filterQuery: the query that will contain the selected tags.
     */
    app.directive('responsiveTagsList', function ($timeout, Assert) {
        return {
            templateUrl: '/templates/analysis/responsive-tags-list.html',
            scope: {
                items: '<',
                tagsMap: '<',
                globalTagsCategories: '<',
                objectType: '<',
                editable: '=?'
            },
            link: function ($scope, $element) {
                const ELLIPSIS_BUTTON_WIDTH = 45;
                let tagsListObserver;
                let tagsListContainer;
                $scope.canTagsFit = true;

                const parentScope = $scope.$parent;
                if ($scope.objectType === 'PROJECT') {
                    Assert.inScope(parentScope, 'onStartTagEdit');
                } else if ($scope.editable) {
                    Assert.inScope(parentScope, 'selectTag');
                    Assert.inScope(parentScope, 'selection.filterQuery');
                }

                // Bootstrap Popover's generated content sometimes looses AngularJS scope.
                // So we cannot rely on the later and therefore have to handle tag click through window object.
                // See https://github.com/angular/angular.js/issues/1323
                if (!window.globalPopoverTagClickCallback) {
                    const startTagEditCallback = function (event) {
                        const category = $(event.target).attr('data-category');
                        parentScope.onStartTagEdit(event, category);
                    }
                    const selectTagCallback = function (event) {
                        const tag = $(event.target).closest('.responsive-tags-list__tag').attr('data-tag');
                        parentScope.selectTag(parentScope.selection.filterQuery, tag.trim());
                        parentScope.$apply();
                        $scope.$apply();
                    };
                    window.globalPopoverTagClickCallback = $scope.objectType === 'PROJECT' ? startTagEditCallback : selectTagCallback;
                    parentScope.$on('$destroy', () => {
                        delete window.globalPopoverTagClickCallback;
                    });
                }

                function computeFittingTags(tagsList) {
                    const fittingTags = { tags: [], categories: [] };
                    const containerHeight = tagsListContainer.offsetHeight;
                    const containerWidth = tagsListContainer.offsetWidth;

                    for (let index = 0; index < tagsList.length; index++) {
                        const tag = $(tagsList[index])[0];
                        const heightFits = tag.offsetTop + tag.offsetHeight < containerHeight;
                        const isLastLine = tag.offsetTop + 2 * tag.offsetHeight > containerHeight;
                        const widthFits = !isLastLine || tag.offsetLeft + tag.offsetWidth + ELLIPSIS_BUTTON_WIDTH < containerWidth;
                        if (heightFits && widthFits) {
                            if (index < $scope.items.length) {
                                fittingTags.tags.push($scope.items[index]);
                            } else if ($scope.globalTagsCategories && index < $scope.items.length + $scope.globalTagsCategories.length) {
                                fittingTags.categories.push($scope.globalTagsCategories[index - $scope.items.length]);
                            }
                        } else if (!heightFits) {
                            break;
                        }
                    }
                    return fittingTags;
                }

                if (!('IntersectionObserver' in window)) {
                    // Graceful degradation: will simply drop the tags in a scrollable area.
                    $scope.hasFitBeenChecked = true;
                } else {
                    const options = {
                        threshold: [0, 0.5, 1],
                        root: $element[0].parentElement
                    };
                    const intersectionCallback = (entries) => {
                        $scope.canTagsFit = entries[0].intersectionRatio === 1;

                        tagsListContainer = $element[0].parentElement;
                        if (!$scope.canTagsFit && entries[0].intersectionRatio > 0) {
                            $scope.fittingTags = computeFittingTags(entries[0].target.children);
                        }
                        $scope.hasFitBeenChecked = true;
                        $scope.$apply();
                    }
                    tagsListObserver = new IntersectionObserver(intersectionCallback, options);
                    // Wait for template to be injected before checking
                    $timeout(() => {
                        tagsListObserver.observe($element[0].querySelector('#tag-list'));
                    }, 0);
                }

                // Detect element resize
                const resizeObserver = new ResizeObserver(entries => {
                    // display #tag-list to trigger intersectionObserver
                    // and see which tags fit if it overflows
                    $scope.canTagsFit = true;
                    $timeout(() => $scope.$apply());
                });
                resizeObserver.observe($element[0].parentElement);

                $scope.$watch("items.length", () => {
                    // display #tag-list to trigger intersectionObserver
                    // and see which tags fit if it overflows
                    $scope.canTagsFit = true;
                });

                $scope.$on('$destroy', () => {
                    tagsListObserver && tagsListObserver.disconnect();
                    resizeObserver && resizeObserver.disconnect();
                });
            }
        }
    });

    app.directive('codeViewer', function() {
        return {
            restrict: 'AE',
            replace: true,
            templateUrl : '/templates/widgets/code-viewer.html',
            scope : {
                code : '<',
                mimeType : '@'
            },
            controller : function($scope, CodeMirrorSettingService) {
                $scope.codeMirrorSettings = CodeMirrorSettingService.get(
                    $scope.mimeType || 'text/plain', {onLoad: function(cm){
                        cm.setOption("readOnly", true);
                        $scope.codeMirror = cm;
                    }}
                )
            }
        }
    });

    /**
     * Directive for managing a list of steps
     * 
     * Example usage:
     * <div stepper="stepperState.stepInfo" current-step="stepperState.currentStep" disable-steps="!disableSteps" />
     * 
     * stepper (steps): An array of step objects
     * - step object:
     *   - label:       step header
     *   - description: step subtitle
     *   - getError(): function which returns an error message if there is one
     *   - getWarning(): function with returns a warning message if there is one (errors take precedence)
     *   - postAction(): function called right after leaving a step
     * currentStep: variable containing the current step (integer)
     * disableSteps: boolean for disabling step interaction (use a function to disable individual steps)
     */
    app.directive('stepper', function() {
        return {
            restrict: 'A',
            templateUrl: "/templates/widgets/stepper.html",
            scope: {
                steps: '<stepper',
                currentStep: '=',
                disableSteps: '<'
            },
            link : function(scope, element, attrs) {
                let previousStep = scope.currentStep;

                function goToStep() {
                    if (previousStep === scope.currentStep) return;

                    const stepInfo = scope.steps[previousStep];
    
                    // perform actions before leaving previous step
                    if (stepInfo && stepInfo.postAction) {
                        stepInfo.postAction();
                    }

                    previousStep = scope.currentStep;
                }

                scope.stepClicked = function(step) {
                    if (!scope.disableSteps && scope.currentStep !== step) {
                        scope.currentStep = step;
                    }
                }

                scope.$watch('currentStep', goToStep);
            }
        };
    });
    app.directive('stepperStep', function() {
        return {
            restrict: 'A',
            templateUrl: "/templates/widgets/stepper-step.html",
            scope: {
                stepNumber: '<',
                step: '<stepperStep',
                isLastStep: '<',
                isCurrentStep: '<',
                isCompletedStep: '<',
                disableStep: '<'
            },
            link: function(scope, element, attrs) {
                scope.step.getError = scope.step.getError || (() => '');
                scope.step.getWarning = scope.step.getWarning || (() => '');
            }
        };
    });

    /** Discrete progress ring with different sections (can be styled in css).
     * values           Array of values (each value is the number of sections for a given class)
     * maximum          Maximum number of sections
     * centerValue      Value to be shown in the center of the progress ring
     * classes          Array of classes for styling
     * classNotFilled   Class of the remaining sections if maximum > sum of values
     * radius           Radius of the progress ring (in px)
     * strokeWidth      Width of the stroke (in px)
     * maxAngle         Maximum angle of the progress ring (180 = half circle / 360 = full circle) (in deg)
     **/
    app.component('progressRing', {
        templateUrl: '/templates/widgets/progress-ring.html',
        bindings: {
            values: '<',
            maximum: '<',
            centerValue: '<',
            classes: '<',
            classNotFilled: '@',
            radius: '<',
            strokeWidth: '<',
            maxAngle: '<',
        },
        controller: [
            function () {
                const ctrl = this;

                ctrl.$onChanges = function (changes) {
                    reDraw();
                };

                function reDraw() {
                    // Compute width and height of the svg depending on the radius and maxAngle
                    ctrl.svgWidth = ctrl.maxAngle > 180 ? 2 * ctrl.radius : (ctrl.maxAngle / 180) * 2 * ctrl.radius;

                    if (ctrl.maxAngle < 90) {
                        ctrl.svgHeight = (ctrl.maxAngle / 90) * ctrl.radius;
                    } else if (ctrl.maxAngle < 180) {
                        ctrl.svgHeight = ctrl.radius;
                    } else if (ctrl.maxAngle < 270) {
                        ctrl.svgHeight = (ctrl.maxAngle / 90 - 1) * ctrl.radius;
                    } else {
                        ctrl.svgHeight = 2 * ctrl.radius;
                    }
                    ctrl.svgHeight += 2; // To make room for the center value

                    const numberOfSections = ctrl.values.reduce((a, b) => a + b);
                    if (numberOfSections > ctrl.maximum) {
                        // If maximum is smaller than sum of values, use sum of values as maximum
                        ctrl.maximum = numberOfSections;
                    }

                    // 0.5px spacing between "sections"
                    let spacingInDegrees = 0.5 * ctrl.maxAngle / ctrl.radius;
                    // Single "section" size in degrees, taking into account the spacing between each one of them
                    let sectionInDegrees =
                        (ctrl.maxAngle - (ctrl.maximum - 1) * spacingInDegrees) / ctrl.maximum;
                    // If resulting section is smaller than 1px, reduce the spacing between them to half the section size
                    if (sectionInDegrees / 180 * ctrl.radius < 1) {
                        spacingInDegrees = 0.5 * sectionInDegrees;
                        sectionInDegrees = (ctrl.maxAngle - (ctrl.maximum - 1) * spacingInDegrees) / ctrl.maximum;
                    }

                    // Fill sections path data (describe and class)
                    ctrl.paths = [];
                    let sectionNumber = 0;
                    for (const [classValue, nSections] of ctrl.classes.map((c, i) => [c, ctrl.values[i]])) {
                        for (const _ of Array(nSections).keys()) {
                            ctrl.paths.push({
                                describe: describeArc(
                                    ctrl.radius,
                                    ctrl.radius,
                                    ctrl.radius - 2 * ctrl.strokeWidth,
                                    180 - sectionNumber * (spacingInDegrees + sectionInDegrees),
                                    180 - sectionNumber * (spacingInDegrees + sectionInDegrees) - sectionInDegrees
                                ),
                                class: classValue,
                            });
                            sectionNumber++;
                        }
                    }

                    // Fill not filled sections if there are some remaining
                    if (numberOfSections < ctrl.maximum) {
                        for (const _ of Array(ctrl.maximum - numberOfSections)){
                            ctrl.paths.push({
                                describe: describeArc(
                                    ctrl.radius,
                                    ctrl.radius,
                                    ctrl.radius - 2 * ctrl.strokeWidth,
                                    180 - sectionNumber * (spacingInDegrees + sectionInDegrees),
                                    180 - sectionNumber * (spacingInDegrees + sectionInDegrees) - sectionInDegrees
                                ),
                                class: ctrl.classNotFilled,
                            });
                            sectionNumber++;
                        }
                    }
                }

                function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
                    const angleInRadians = (-angleInDegrees * Math.PI) / 180.0;

                    return {
                        x: centerX + radius * Math.cos(angleInRadians),
                        y: centerY + radius * Math.sin(angleInRadians),
                    };
                }

                function describeArc(x, y, radius, startAngle, endAngle) {
                    const start = polarToCartesian(x, y, radius, endAngle);
                    const end = polarToCartesian(x, y, radius, startAngle);

                    const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? '0' : '1';

                    const d = ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');

                    return d;
                }
            },
        ],
    });

    /** Text that can be edited once clicked on
     * textValue        Current text value (two-way bound). Gets set to defaultValue on load if empty.
     * defaultValue     (optional) Default text shown when directive first loads (before editing) if textValue is empty
     *                  If defaultValue is passed in, title color will be grayed out if textValue === defaultValue
     * placeholder      (optional) Placeholder text shown in input field while editing
     * fontSize         (optional) Font size to be used in in both view and edit mode; default value matches style guide 
     **/
    app.directive('editableTextField', function() {
        return {
            restrict: 'E',
            templateUrl: '/templates/widgets/editable-text-field.html',
            scope: {
                textValue: '=ngModel',
                defaultValue: '<?',
                placeholder: '<?',
                fontSize: '<?'
            },
            link: function(scope) {
                scope.item = {};
                scope.placeholder = scope.placeholder || 'New name';

                // Comparator item naming
                scope.startEdit = function(item) {
                    item.$editing = true;
                    item.$textValue = scope.textValue === scope.defaultValue ? '' : scope.textValue;
                };

                scope.cancelEdit = function(item) {
                    item.$editing = false;
                };

                scope.validateEdit = function(item) {
                    scope.textValue = item.$textValue || scope.textValue;
                    item.$editing = false;
                };

                scope.$watch('defaultValue', (nv, ov) => {
                    if (!scope.textValue || scope.textValue === ov) {
                        scope.textValue = nv;
                    }
                });
            }
        }
    });

})();
