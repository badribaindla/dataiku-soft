(function(){
    'use strict';

    angular.module('dataiku.charts')
        .factory("ChartLegendUtils", ChartLegendUtils)
        .controller("ChartLegendOptzoneController", ChartLegendOptzoneController)
        .directive("continuousColorLegend", continuousColorLegend)
        .directive("discreteColorLegend", discreteColorLegend);

    function ChartLegendUtils(CreateCustomElementFromTemplate, $q, $timeout, ChartColorUtils) {
        var that = {
            initLegend: function(chartDef, chartData, chartHandler, colorScale) {
                if (!colorScale) {
                    chartHandler.legends.length = 0;
                    return;
                }
                
                switch (colorScale.type) {
                    case 'DIMENSION':
                        return that.initDimensionLegend(chartDef, chartData, chartHandler, colorScale);
                    case 'MEASURE':
                        return that.initMeasureLegend(chartDef, chartData, chartHandler, colorScale);
                    case 'UNAGGREGATED':
                        if (colorScale.isContinuous) {
                            return that.initMeasureLegend(chartDef, chartData, chartHandler, colorScale);
                        }
                        return;
                    default:
                        throw new Error("Unknown scale type: " + colorScale.type);
                }
            },

            initDimensionLegend: function(chartDef, chartData, chartHandler, colorScale) {
                var items = [];

                (chartData.getAxisLabels('color') || chartDef.genericMeasures).forEach(function(colorOrMeasure, c) {
                    var color = colorScale(c);
                    items.push({
                        label: {
                            label: colorOrMeasure.label || chartHandler.measureLabel(colorOrMeasure)
                        },
                        color: color,
                        desaturatedColor: ChartColorUtils.desaturate(color),
                        rgbaColor: ChartColorUtils.toRgba(colorScale(c), chartDef.colorOptions.transparency),
                        focused: false,
                        unfocusFn: function() { /* focus/unfocus on mouseover */ },
                        focusFn: function() { /* focus/unfocus on mouseover */ },
                        id: c,
                        elements: d3.select()
                    });
                });

                chartHandler.legends.length = 0;
                chartHandler.legends.push({
                    type: "COLOR_DISCRETE",
                    items: items
                });
            },

            initMeasureLegend: function(chartDef, chartData, chartHandler, colorScale) {
                chartHandler.legends.length = 0;
                chartHandler.legends.push({
                    type: "COLOR_CONTINUOUS",
                    scale: colorScale
                });
            },

            drawLegend: function(chartDef, chartHandler, $container) {
                var deferred = $q.defer();

                CreateCustomElementFromTemplate('/templates/simple_report/legend/legend-zone.html', chartHandler, null, function() {
                    $timeout(deferred.resolve);
                }, function($el) {
                    $container.find('.legend-zone').remove();
                    $container.attr('legend-placement', chartDef.legendPlacement);
                    $el.appendTo($container);
                });

                return deferred.promise;
            },

            adjustLegendPlacement: function(chartDef, $container, margins) {
                var $legendZone = $container.find('.legend-zone');

                var getEffectiveLeftMargin = function() {
                    if (chartDef.facetDimension.length) {
                        return $('.facet-info').width() + margins.left;
                    } else {
                        return margins.left;
                    }
                };

                var setMaxSize = function() {
                    $legendZone
                        .css('max-height', 'calc(100% - ' + (margins.top + margins.bottom) + 'px)')
                        .css('max-width',  '25%')
                        .css('visibility', 'visible');
                };

                switch (chartDef.legendPlacement) {
                    case 'INNER_TOP_LEFT':
                        $legendZone.css('left', getEffectiveLeftMargin()).css('top', margins.top);
                        setMaxSize();
                        break;
                    case 'INNER_TOP_RIGHT':
                        $legendZone.css('right', margins.right).css('top', margins.top);
                        setMaxSize();
                        break;
                    case 'INNER_BOTTOM_LEFT':
                        $legendZone.css('left', getEffectiveLeftMargin()).css('bottom', margins.bottom);
                        setMaxSize();
                        break;
                    case 'INNER_BOTTOM_RIGHT':
                        $legendZone.css('right', margins.right).css('bottom', margins.bottom);
                        setMaxSize();
                        break;
                    default:
                        break;
                }
            }
        };

        return that;
    }

    function ChartLegendOptzoneController($scope) {
        $scope.categories = {
            'OUTER': ['OUTER_RIGHT', 'OUTER_LEFT', 'OUTER_TOP', 'OUTER_BOTTOM'],
            'INNER': ['INNER_TOP_RIGHT', 'INNER_TOP_LEFT', 'INNER_BOTTOM_LEFT', 'INNER_BOTTOM_RIGHT']
        };

        $scope.$watch("legendPlacementCategory", function(nv, ov) {
            if (!nv) return;

            if (nv === 'SIDEBAR') {
                $scope.chart.def.legendPlacement = 'SIDEBAR';
            } else {
                if ($scope.categories[nv].indexOf($scope.chart.def.legendPlacement) === -1) {
                    $scope.chart.def.legendPlacement = $scope.categories[nv][0];
                }
            }
        });

        $scope.$watch("chart.def.legendPlacement", function(nv, ov) {
            if (!nv) return;

            if (nv === 'SIDEBAR') {
                $scope.legendPlacementCategory = 'SIDEBAR';
            } else {
                for (var cat in $scope.categories) {
                    if ($scope.categories[cat].indexOf(nv) > -1) {
                        $scope.legendPlacementCategory = cat;
                        break;
                    }
                }
            }
        });
    }

    function discreteColorLegend(Logger) {
        return {
            scope: true,
            templateUrl: '/templates/simple_report/legend/discrete-color-legend.html',
            link: function ($scope, element, attrs) {
                $scope.$watch(attrs.legend, function (nv, ov) {
                    $scope.legend = $scope.$eval(attrs.legend);
                });

                $scope.hasFocused = false;

                var unfocusAll = function () {
                    $scope.legend.items.forEach(function (it) {
                        if (it.focused && it.unfocusFn) it.unfocusFn();
                        it.focused = false;
                    })
                }

                $scope.toggleFocus = function ($index) {
                    Logger.info("Toggle focus");
                    console.time("toggleFocus");
                    /*@console*/
                    if ($scope.legend.items[$index].focused) {
                        unfocusAll();
                        $scope.hasFocused = false;
                    } else {
                        unfocusAll();
                        $scope.legend.items[$index].focused = true;
                        if ($scope.legend.items[$index].focusFn) {
                            $scope.legend.items[$index].focusFn();
                        }
                        $scope.hasFocused = true;
                    }
                    $scope.$$postDigest(function() {
                        Logger.info("post-digest");
                        console.timeEnd("toggleFocus");
                        /*@console*/
                    })
                }

            }
        }
    }

    function continuousColorLegend(Fn) {
        return {
            scope: true,
            templateUrl: '/templates/simple_report/legend/continuous-color-legend.html',
            link: function ($scope, element, attrs) {

                var placement = element.closest('.pivot-charts').attr('legend-placement');

                $scope.$watch(attrs.legend, function (nv, ov) {
                    $scope.draw($scope.$eval(attrs.legend));
                });

                var svg = d3.select(element[0]).select('svg'),
                    $svg = element.find('svg'),
                    gradient = svg.select('linearGradient');

                var vertical, orient, barWidth = Math.max(0, $svg.width() - 10), barHeight = Math.max(0, $svg.height() - 10), axisX = 5, axisY = 5, rectX = 0;
                switch (placement) {
                    case 'OUTER_RIGHT':
                        vertical = true;
                        barWidth = 15;
                        axisX  = 15;
                        orient = 'right';
                        break;
                    case 'OUTER_LEFT':
                        vertical = true;
                        barWidth = 15;
                        orient = 'left';
                        break;
                    case 'OUTER_TOP':
                    case 'OUTER_BOTTOM':
                    default: // sidebar or inner
                        vertical = false;
                        $svg.height(45);
                        orient = 'bottom';
                        axisY = 15;
                        barHeight = 15;
                        break;
                }

                if (vertical) {
                    gradient.attr('x2', '0%').attr('y2', '100%');
                }

                svg.select('rect')
                    .attr('width', barWidth)
                    .attr('height', barHeight)
                    .attr('y', vertical ? 5 : 0)
                    .attr('x', vertical ? 0 : 5);

                $scope.draw = function(legend) {

                    var axisScale = legend.scale.innerScale.copy();
                    if (legend.scale.diverging) {
                        axisScale.domain([axisScale.invert(0), axisScale.invert(1)]).range([0, 1]);
                    }
                    axisScale.range(axisScale.range().map(x => vertical ? (barHeight - x*barHeight) : x*barWidth)).interpolate(d3.interpolate);
                    var axis = d3.svg.axis().orient(orient).scale(axisScale).ticks(5);
                    var axisG = svg.select('g.axis');


                    // Force the scale domain limits to appear as ticks in the axes
                    var ticks = angular.copy(axisScale.ticks());
                    axisScale.domain().forEach(function(v) {
                        if (axisScale.ticks().indexOf(v) < 0) {
                            ticks.push(v);
                        }
                    });
                    axis.tickValues(ticks);
                    axis.tickFormat(legend.formatter);
                    axisG.selectAll('*').remove();
                    axisG.call(axis).select('path.domain').remove();

                    if (!vertical) {
                        d3.select(axisG.selectAll('g.tick')[0].reduce(function(min, g) { // find left-most tick (DOM order is not always the tick order)
                            return min.__data__ < g.__data__ ? min : g;
                        })).select('text').style("text-anchor", "start");
                        d3.select(axisG.selectAll('g.tick')[0].reduce(function(max, g) { // find right-most tick (DOM order is not always the tick order)
                            return max.__data__ > g.__data__ ? max : g;
                        })).select('text').style("text-anchor", "end");
                    }

                    // Add a white rectangle under all tick labels so that collisions are not too ugly
                    // Ideally, we could avoid collisions in the first place by carefully removing the right ticks from `ticks`
                    axisG.selectAll('.tick').each(function() {
                        var g = d3.select(this);
                        var bbox = this.getBoundingClientRect();
                        g.insert('rect', ':first-child')
                            .attr('x', vertical ? (orient === 'left' ? -bbox.width : 0) : -bbox.width/2 )
                            .attr('y', vertical ? -bbox.height/2 : 0)
                            .attr('fill', 'white')
                            .attr('stroke-width', 0)
                            .attr('width', bbox.width)
                            .attr('height', bbox.height);
                    });

                    var colors = legend.scale.outerScale.range();
                    var colorStops = [];
                    var numStops = legend.scale.quantizationMode === 'NONE' ? colors.length - 1 : colors.length;

                    if (legend.scale.quantizationMode !== 'QUANTILES') {
                        colors.forEach(function(c, i) {
                            colorStops.push({
                                color: c,
                                offset: i*100/numStops
                            });

                            if (legend.scale.quantizationMode !== 'NONE') {
                                colorStops.push({
                                    color: c,
                                    offset: (i+1)*(100/numStops)
                                });
                            }
                        });
                    } else {
                        var thresholds = legend.scale.outerScale.quantiles();
                        colors.forEach(function(c, i) {
                            colorStops.push({
                                color: c,
                                offset: (i === 0 ? 0 : thresholds[i-1]*100)
                            });
                            colorStops.push({
                                color: c,
                                offset: (i === colors.length-1 ? 100 : thresholds[i]*100)
                            })
                        });
                    }

                    // In the vertical scale, we want the first stop at the bottom
                    if (vertical) {
                        colorStops.forEach(function(stop) {
                            stop.offset = (100-(stop.offset))
                        });
                        colorStops.reverse();
                    }

                    /* This was used to display the color palette with a log/square/square root gradient instead of a linear gradient,
                    but instead we display a linear gradient and let d3 put the ticks at the right places
                    if (scale.mode == 'LINEAR') {
                        points = legend.scale.domain();
                    } else {
                        var NUM_STOPS = 100;
                        var range = axisScale.range();
                        var step = (domain[domain.length-1] - domain[0])/NUM_STOPS;
                        for (var i = 0; i < NUM_STOPS; i++) {
                            points.push(domain[0] + step*i);
                        }
                    }*/

                    gradient.selectAll('stop').data(colorStops)
                        .enter().append('stop')
                        .attr('offset', stop => stop.offset + '%')
                        .attr('stop-color', Fn.prop('color'))
                        .attr('stop-opacity', 1);

                    if (vertical) {
                        var maxWidth = d3.max(axisG.selectAll('g.tick')[0].map(function(itm) {
                            return itm.getBoundingClientRect().width;
                        })) || 0;

                        $svg.css('width', maxWidth + 15);
                    } else {
                        var maxHeight = d3.max(axisG.selectAll('g.tick')[0].map(function(itm) {
                            return itm.getBoundingClientRect().height;
                        })) || 0;

                        $svg.css('height', maxHeight + 15);
                    }

                    if (placement == 'OUTER_LEFT') {
                        rectX = $svg.width() - 15;
                        axisX = rectX;
                    }

                    axisG.attr('transform', 'translate(' + axisX + ',' + axisY + ')');
                    svg.select('rect').attr('transform', 'translate(' + rectX + ', 0)');
                };
            }
        }
    }

})();