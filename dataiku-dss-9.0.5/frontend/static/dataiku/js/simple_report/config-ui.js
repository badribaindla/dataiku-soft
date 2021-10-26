(function(){
'use strict';

/* Directives and controllers for charts configuration UI */

var app = angular.module('dataiku.charts');

app.directive('contextualMenu', function($rootScope, $window, Logger, $compile, $timeout) {
    // $rootScope.globallyOpenContextualMenu;
    $($window).on('click', function(e){
        if(! e.isDefaultPrevented() && !e.target.hasAttribute('no-global-contextual-menu-close')){
            $rootScope.globallyOpenContextualMenu = undefined;
            $rootScope.$apply();
        }
    });
    return {
        scope : true,
        compile : function(element, attrs) {
            var popoverTemplate = element.find(".contextualMenu").detach();
            return function($scope, element, attrs) {
                var popover = null;
                var popoverScope = null;
                $scope.contextualMenu = false;

                function hide(){
                    if (popover) {
                        if(popoverScope) {
                            popoverScope.$destroy();
                            popoverScope = null;
                        }
                        popover.hide().remove();
                        popover = null;
                    }
                }
                function show(){
                    if (popover === null) {
                        // Since Angular 1.6, in a <select>, ng-model is set to null when the corresponding <option> is removed.
                        //
                        // Here is what happens when a contextualMenu containing a select is removed (using hide()):
                        // - The selected <option> is removed from DOM (like the others) triggering its $destroy callback.
                        // - This callback removes the value from the optionsMap and set a digest's call back (ie: $$postDigest function).
                        // - $$postDigest is triggered after angular's digest and checks if its scope (popoverScope in our case) is destroyed.
                        // - If yes it does nothing (return)
                        // - If not, $$postDigest set the select's ngModel to null, because its current value is no longer in optionsMap
                        //
                        // popoverScope prevents any nested <select>'s ngModel to get set to null when a contextualMenu is closed.
                        // This fix work because we destroy popoverScope (where the select lives), before deleting the DOM containing it (along with the <option> elements).
                        // So when $$postDigest positively checks if its scope is $destroyed, it just returns without setting the select's ngModel to null.
                        popoverScope = $scope.$new();
                        // We may need the original scope in some context, e.g. modals opened from a contextualMenu
                        // because clicking on the modal will close the menu and destroyed its scope
                        popoverScope.$contextScope = $scope;
                        popover = $compile(popoverTemplate.get(0).cloneNode(true))(popoverScope);
                    }
                    popover.appendTo("body");

                    var position = attrs.cepPosition || "align-left-bottom";
                    var mainZone = element;
                    var mzOff = element.offset();

                    /* Fairly ugly ... */
                    if (element.parent().parent().hasClass("chartdef-dropped")) {
                        mzOff.top -= 4;
                        mzOff.left -= 10;
                    }

                    switch (position) {
                    case 'align-left-bottom':
                        popover.css({ left: mzOff.left, top: mzOff.top + mainZone.height() });
                        break;
                    case 'align-right-bottom':
                        popover.css({ top: mzOff.top + mainZone.height(),
                            left: mzOff.left + mainZone.innerWidth() - popover.innerWidth() });
                        break;
                    case 'align-right-top':
                        popover.css({ top: mzOff.top ,
                            left: mzOff.left + mainZone.innerWidth() });
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
                    case 'smart-left-bottom':
                        $timeout(function() {
                            // Left-bottom position, except if the menu would overflow the window, then left-top
                            var offset = { left: mzOff.left, right: 'auto', top: 'auto', bottom: 'auto' };

                            if (mzOff.top + mainZone.height() + popover.outerHeight() > window.innerHeight) {
                                offset.bottom = window.innerHeight - mzOff.top;
                            } else {
                                offset.top = mzOff.top + mainZone.height();
                            }
                            popover.css(offset);
                        });
                        break;
                    }
                    if (attrs.cepWidth === 'fit-main') {
                        popover.css("width", mainZone.innerWidth());
                    }
                    popover.show();

                    popover.on('click', function(e){
                        e.stopPropagation();
                    });
                }

                $scope.$watch("contextualMenu", function(nv, ov) {
                    if (nv) show(); else hide();
                });

                $scope.toggleContextualMenu = function(e) {
                    if ($scope.globallyOpenContextualMenu && $scope.globallyOpenContextualMenu[0] === element[0]){
                        $rootScope.globallyOpenContextualMenu = undefined;
                    } else {
                        $rootScope.globallyOpenContextualMenu = element;
                    }
                    e.preventDefault();
                };

                $scope.$on("$destroy", function() {
                    hide();
                });

                $rootScope.$watch('globallyOpenContextualMenu', function(nv, ov){
                    $scope.contextualMenu = ($rootScope.globallyOpenContextualMenu && $rootScope.globallyOpenContextualMenu[0] === element[0]);
                });
            }
        }
    };
});

app.controller("ScatterChartController", function($scope, ChartChangeHandler){
    $scope.scatterAcceptDrop = function(data){
        return ChartChangeHandler.scatterAccept($scope.chart.def, data);
    }
    $scope.scatterAcceptScaleMeasure = function(data) {
    	return ChartChangeHandler.scatterAcceptScaleMeasure($scope.chart.def, data);
    }
})

app.controller("ScatterMapChartController", function($scope, ChartChangeHandler){
    $scope.acceptGeo = function(data){
        if (data.type == "GEOMETRY" || data.type == "GEOPOINT") {
            return {
                accept : true
            }
        } else {
            return {
                accept : false,
                message : "Need a geographic column"
            }
        }
    }
    $scope.acceptMeasure = function(data){
        return ChartChangeHandler.scatterAccept($scope.chart.def, data);
    }
    $scope.acceptScaleMeasure = function(data) {
        return ChartChangeHandler.scatterAcceptScaleMeasure($scope.chart.def, data);
    }
})

app.controller("DensityHeatMapChartController", function($scope, ChartChangeHandler){
        $scope.acceptGeo = function(data){
            if (data.type == "GEOMETRY" || data.type == "GEOPOINT") {
                return {
                    accept : true
                }
            } else {
                return {
                    accept : false,
                    message : "Need a geographic column"
                }
            }
        }
        $scope.acceptScaleMeasure = function(data) {
            return ChartChangeHandler.densityMapAcceptScaleMeasure($scope.chart.def, data);
        }
})

app.controller("AdminMapChartController", function($scope, ChartChangeHandler){
    $scope.acceptGeo = function(data){
        if (data.type == "GEOMETRY" || data.type == "GEOPOINT") {
            return {
                accept : true
            }
        } else {
            return {
                accept : false,
                message : "Need a geographic column"
            }
        }
    }
    $scope.acceptMeasure = function(data){
        return ChartChangeHandler.stdAggregatedAcceptMeasure($scope.chart.def, data);
    }
})

app.controller("StdAggregatedChartDefController", function($scope, ChartChangeHandler, ChartFeatures){
    $scope.acceptMeasure = function(data){
        return ChartChangeHandler.stdAggregatedAcceptMeasure($scope.chart.def, data);
    }
    $scope.acceptDimension = function(data){
        return ChartChangeHandler.stdAggregatedAcceptDimension($scope.chart.def, data);
    }
    $scope.ChartFeatures = ChartFeatures;
});

app.controller("BinnedXYChartDefController", function($scope, ChartChangeHandler, ChartFeatures) {
    $scope.acceptMeasure = function(data) {
        return ChartChangeHandler.stdAggregatedAcceptMeasure($scope.chart.def, data);
    };
    $scope.acceptDimension = function(data) {
        return ChartChangeHandler.binnedXYAcceptDimension($scope.chart.def, data);
    };
    $scope.ChartFeatures = ChartFeatures;
});

app.controller("BoxplotsChartDefController", function($scope, ChartChangeHandler){
    $scope.acceptMeasure = function(data){
        return ChartChangeHandler.boxplotsAcceptMeasure($scope.chart.def, data);
    }
    $scope.acceptDimension = function(data){
        return ChartChangeHandler.boxplotsAcceptBreakdown($scope.chart.def, data);
    }
});

app.controller("Density2DChartDefController", function($scope, ChartChangeHandler){
    $scope.accept = function(data){
        if( data.type == "NUMERICAL" || data.type == "DATE"){
            return {accept : true}
        } else {
            return {accept: false, message : "Can only use numerical or date"};
        }
    }
});


app.directive("monovaluedStdAggrDimensionZone", function($parse, ChartsStaticData){
    return {
        templateUrl : '/templates/simple_report/config/mono-std-aggr-dim-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.isSecondDimension = $parse(attrs.isSecondDimension)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
            $scope.dateModes = function() {
                return ChartsStaticData.dateModes;
            };
        }
    };
})
 .directive("monovaluedStdAggrDimensionZoneNoOpts", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/mono-std-aggr-dim-zone-noopts.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
 .directive("monovaluedStdAggrMeasureZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/mono-std-aggr-measure-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
  .directive("monoUaZoneNoOpts", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/mono-ua-zone-no-opts.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
.directive("multiUaZoneNoOpts", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/multi-ua-zone-no-opts.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
.directive("multivaluedStdAggrMeasureZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/multi-std-aggr-measure-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
.directive("scatterAxisZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/scatter-axis-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
 .directive("scatterDetailZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/scatter-detail-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
});
app.directive("geoNooptsZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/geo-noopts-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})
app.directive("geoAdminZone", function($parse){
    return {
        templateUrl : '/templates/simple_report/config/geo-admin-zone.html',
        scope : true,
        link : function($scope, element, attrs) {
            $scope.list = $parse(attrs.list)($scope);
            $scope.acceptCallback = $parse(attrs.acceptCallback)($scope);
        }
    }
})


app.controller("GridMapGridController", function($scope){
    $scope.uiState = {
        manualInput : false
    }
    $scope.$watch("chart.def.mapGridOptions.gridLatDeg", function(nv, ov){
        if (!nv || !ov) return;
        if ($scope.chart.def.mapOptions.lockSquareGrid) {
            $scope.chart.def.mapGridOptions.gridLonDeg = nv;
        }
    });
    $scope.$watch("chart.def.mapGridOptions.gridLonDeg", function(nv, ov){
        if (!nv || !ov) return;
        if ($scope.chart.def.mapOptions.lockSquareGrid) {
            $scope.chart.def.mapGridOptions.gridLatDeg = nv;
        }
    });
});

app.controller("SingleColorSelectorController", function($scope){
    function makeBlock(baseColor) {
        var rgb = d3.rgb(baseColor);
        return {
            b0 : rgb.toString(),
            b1 : rgb.brighter(4).toString(),
            b2 : rgb.brighter(5.5).toString()
        }
    }

    $scope.colors = [
        '#F03334', '#FF7703', '#F6C762', '#ECD941', '#82D96B', '#63E9C3',
        '#69CEF0', '#1EA8FC', '#2678B1', '#7638AF', '#BE66BF', '#EA3596',
        '#000000', '#8A8A8A', '#BABBBB', '#D2D2D2', '#E8E8E8', '#FFFFFF'
    ];

    $scope.grayBlock = [0,1,2,3,4,5,6,7,8,9].map(function(x){
        var c = x/10 * 255;
        return d3.rgb(c,c,c).toString()
    });
});

})();
