(function(){
'use strict';

angular.module('dataiku.charts')
    .service("ChartTooltips", ChartTooltips)
    .service("ChartDrillUtils", ChartDrillUtils)
    .service("ChartTooltipsUtils", ChartTooltipsUtils);


function ChartTooltips($q, $templateCache, $http, $compile, $rootScope, LabelsController, ChartDrillUtils, $timeout) {
    return {
        /**
         * Initialize the tooltip(s) for the given chart and return an object with methods to control them, and enable tooltips on new elements.
         * This also controls the saturation/desaturation of svg elements on hover by keeping a list of registered elements for every color coordinate.
         * @param {jQuery} $container
         * @param {$scope} chartHandler
         * @param {ChartTensorDataWrapper} chartData
         * @param {ChartDef} chartDef
         * @param {array} measureFormatters
         * @return {{showForCoords: showForCoords, hide: hide, fix: fix, unfix: unfix, setAnimationFrame: setAnimationFrame, registerEl: registerEl, addTooltipHandlers: addTooltipHandlers, removeTooltipsHandlers: removeTooltipsHandlers, focusColor: focusColor, resetColors: resetColors}}
         */
        create: function($container, chartHandler, chartData, chartDef, measureFormatters) {
            var templateUrl = '/templates/simple_report/tooltips/std-aggr-nd.html';
            var tooltipScopes = {};
            var $tooltip, divHeight, divWidth;
            var tooltipState = {shown: false, formatters: measureFormatters};

            $q.when($templateCache.get(templateUrl) || $http.get(templateUrl, {cache: true})).then(function (template) {

                if(angular.isArray(template)) {
                    template = template[1];
                } else if(angular.isObject(template)) {
                    template = template.data;
                }

                $container.find('div.chart-wrapper').each(function(f) {
                    var $div = $(this);
                    $tooltip = $(template).appendTo($div);

                    var tooltipScope = chartHandler.$new();
                    tooltipScope.chartData = chartData;
                    tooltipScope.chartDef = chartDef;
                    tooltipScope.facet = f;
                    tooltipScope.tooltipState = tooltipState;
                    LabelsController(tooltipScope);


                    tooltipScope.coords = function() {
                        return angular.extend({}, tooltipState.coords, {facet: f});
                    };
                    tooltipScope.filter = function(dimension){
                        ChartDrillUtils.facetOnDim(chartDef, dimension[0]);
                    };
                    tooltipScope.drill = function(dimension, bin) {
                        ChartDrillUtils.drill(chartDef, dimension[0], bin);
                    };
                    tooltipScope.isDrillable = function(dimension) {
                        return ChartDrillUtils.isDrillable(dimension[0]);
                    };
                    tooltipScope.exclude = function() {
                        var dimensions = [], bins = [];
                        if (chartDef.genericDimension1.length) {
                            dimensions.push(chartDef.genericDimension1[0]);
                            bins.push(chartData.getAxisLabels('color')[tooltipState.coords.color]);
                        }
                        if (chartDef.genericDimension0.length) {
                            dimensions.push(chartDef.genericDimension0[0]);
                            if (chartDef.type === 'pie') {
                                bins.push(chartData.getAxisLabels('color')[tooltipState.coords.color]);
                            } else if (chartDef.type === 'stacked_bars') {
                                bins.push(chartData.getAxisLabels('y')[tooltipState.coords.y]);
                            } else {
                                bins.push(chartData.getAxisLabels('x')[tooltipState.coords.x]);
                            }
                        }
                        if (chartDef.xDimension.length) {
                            dimensions.push(chartDef.xDimension[0]);
                            bins.push(chartData.getAxisLabels('x')[tooltipState.coords.x]);
                        }
                        if (chartDef.yDimension.length) {
                            dimensions.push(chartDef.yDimension[0]);
                            bins.push(chartData.getAxisLabels('y')[tooltipState.coords.y]);
                        }
                        if (chartDef.groupDimension.length) {
                            dimensions.push(chartDef.groupDimension[0]);
                            bins.push(chartData.getAxisLabels('group')[tooltipState.coords.group]);
                        }
                        if (chartDef.facetDimension.length) {
                            dimensions.push(chartDef.facetDimension[0]);
                            bins.push(chartData.getAxisLabels('facet')[f]);
                        }
                        if (chartDef.animationDimension.length) {
                            dimensions.push(chartDef.animationDimension[0]);
                            bins.push(chartData.getAxisLabels('animation')[tooltipState.coords.animation]);
                        }
                        ChartDrillUtils.excludeND(chartDef, dimensions, bins);
                    };

                    tooltipScopes[f] = tooltipScope;

                    $compile($tooltip)(tooltipScope);

                    if (divWidth == undefined) {
                        divWidth = $div.width();
                        divHeight = $div.height();
                    }
                });
            });

            var timeout;

            var ret = {
                /**
                 * Show the tooltip for the given measure/coords
                 * @param {number} measure : measure idx to show data for
                 * @param {array} coords : coords to show data for
                 * @param event : mousemove event
                 * @param color : tooltip color
                 */
                showForCoords: function(measure, coords, event, color) {
                    if (ret.fixed) return;

                    coords.animation = chartHandler.animation.currentFrame;

                    $rootScope.$apply(function() {
                        tooltipState.measure = measure;
                        tooltipState.coords = coords;
                        tooltipState.color = color;
                        tooltipState.shown = true;

                        if (!chartDef.multiTooltips) {
                            tooltipScopes[coords.facet || 0].shown = true;
                        }
                    });

                    timeout = $timeout(function() {

                        var tooltipHeight = $tooltip.height(),
                            left = 'auto',
                            right = 'auto',
                            top = 0;

                        var wrapperOffset = $(event.target).closest('div.chart-wrapper').offset();
                        if (!wrapperOffset) {
                            // can happen if event.target has been detached right after hover and is not a child of .chart-wrapper anymore (in pivot fattable)
                            return;
                        }

                        var offsetX = event.pageX - wrapperOffset.left;
                        var offsetY = event.pageY - wrapperOffset.top;

                        if (offsetX < divWidth/2) {
                            left = (offsetX + 10) + 'px';
                        } else {
                            right = (divWidth - offsetX + 10) + 'px';
                        }

                        top = Math.max(0, Math.min(divHeight - tooltipHeight - 20, offsetY - tooltipHeight/2)) + 'px';

                        $rootScope.$apply(function() {
                            tooltipState.left = left;
                            tooltipState.right = right;
                            tooltipState.top = top;
                            tooltipState.shown = true;

                            if (!chartDef.multiTooltips) {
                                tooltipScopes[coords.facet || 0].shown = true;
                            }
                        });
                    });
                },


                /**
                 * Hide the tooltip
                 */
                hide: function() {
                    if (timeout) {
                        $timeout.cancel(timeout);
                        timeout = null;
                    }

                    if (tooltipState.persistent) return;

                    $rootScope.$apply(function() {
                        if (!chartDef.multiTooltips) {
                            angular.forEach(tooltipScopes, function (tooltipScope) {
                                tooltipScope.shown = false;
                            });
                        }
                        tooltipState.shown = false;
                    });

                    $rootScope.$apply();
                },


                /**
                 * Fix the tooltip (won't follow mouse anymore and won't auto-hide)
                 */
                fix: function() {
                    if (ret.fixed) {
                        ret.unfix();
                        ret.resetColors();
                    } else {
                        $rootScope.$apply(function() {
                            ret.fixed = true;
                            tooltipState.persistent = true;
                        });
                    }
                },


                /**
                 * Unfix the tooltip
                 */
                unfix: function() {
                    if (!ret.fixed) {
                        return ret.hide();
                    }
                    $rootScope.$apply(function() {
                        ret.fixed = false;
                        tooltipState.shown = false;
                        tooltipState.persistent = false;
                        if (!chartDef.multiTooltips) {
                            angular.forEach(tooltipScopes, function(tooltipScope) {
                                tooltipScope.shown = false;
                            });
                        }
                    });
                },


                /**
                 * Update the tooltipState's animation frame
                 * @param {number} frameIdx: animation coordinate
                 */
                setAnimationFrame: function(frameIdx) {
                    if (tooltipState.coords) {
                        tooltipState.coords.animation = frameIdx;
                    }
                },


                /**
                 * Register an element for his color coord and add handlers to show tooltip on mousemove
                 * @param {DOMElement} el
                 * @param {array} coords: coords dict of this element
                 * @param {string} colorAttr: the color attribute to control the element (usually 'fill' or 'stroke')
                 * @param {boolean} noTooltip: only register the element for color change but don't add tooltip handlers
                 */
                registerEl: function(el, coords, colorAttr, noTooltip) {
                    if (chartHandler.noTooltips) return;

                    el._colorAttr = colorAttr;
                    var c = coords.color + coords.measure;
                    if (colorAttr) {
                        chartHandler.legends[0].items[c].elements[0].push(el);
                    }

                    d3.select(el)
                        .attr('tooltip-el', true)
                        .on('mousemove', function() {
                            if (!noTooltip) {
                                ret.showForCoords(coords.measure, coords, d3.event, chartHandler.legends[0].items[c].rgbaColor || chartHandler.legends[0].items[c].color);
                            }
                        })
                        .on('mouseleave', function() {
                            if (!ret.fixed) {
                                if (!noTooltip) {
                                    ret.hide();
                                }
                                if (colorAttr) {
                                    ret.resetColors();
                                }
                            }
                        })
                        .on('click', function() {
                            if (!noTooltip) {
                                ret.fix();
                            }
                        })
                        .on('mouseenter', function() {
                            if (colorAttr && !ret.fixed) {
                                ret.focusColor(c);
                            }
                        });
                },

                unregisterEl: function(el) {
                    d3.select(el)
                        .on('mousemove', null)
                        .on('mouseleave', null)
                        .on('click', null)
                        .on('mouseenter', null);
                },

                /**
                 * Add tooltip handlers to an element
                 * @param el
                 * @param coords
                 * @param color
                 */
                addTooltipHandlers: function(el, coords, color) {
                    if (chartHandler.noTooltips) return;

                    d3.select(el)
                        .attr('tooltip-el', true)
                        .on('mousemove.tooltip', function() {
                            ret.showForCoords(-1, coords, d3.event, color);
                        })
                        .on('mouseleave.tooltip', ret.hide)
                        .on('click', ret.fix);
                },


                /**
                 * Remove tooltip handlers from an element
                 * @param el
                 */
                removeTooltipsHandlers: function(el) {
                    d3.select(el)
                        .on('mousemove.tooltip', null)
                        .on('mouseleave.tooltip', null)
                        .on('click', null);
                },


                /**
                 * Focus on the given color coordinates (ie desaturate all other colors)
                 * @param {number} c: the color coordinate
                 */
                focusColor: function(c) {
                    chartHandler.legends[0].items.forEach(function(item, i) {
                        if (i != c && item.elements) {
                            item.elements.each(function() {
                                d3.select(this).transition(300).attr(this._colorAttr, item.desaturatedColor);
                            });
                        }
                    });
                },


                /**
                 * Unfocus everything
                 */
                resetColors: function() {
                    if (chartHandler.legends[0] && chartHandler.legends[0].items) {
                        chartHandler.legends[0].items.forEach(function(item) {
                            if (item.elements) {
                                item.elements.each(function() {
                                    d3.select(this).transition(300).attr(this._colorAttr, item.color);
                                });
                            }
                        });
                    }
                }
            };

            return ret;
        },
    };
}

function ChartDrillUtils(ChartDimension, LoggerProvider){

    function makeExplicitFilterCond(dim, bin) {
        var cond = {
            columnType : dim.type,
            column :  dim.column
        };

        switch (dim.type){
        case "ALPHANUM":
            // TODO: not a label ...
            cond.singleValue = bin.label;
            break;
        case "NUMERICAL":
        	if (dim.numParams && dim.numParams.mode == 'TREAT_AS_ALPHANUM') {
        		cond.columnType = "ALPHANUM";
                cond.singleValue = bin.label;
        	} else if (dim.numParams && dim.numParams.mode === 'NONE') {
        	    cond.minValue = bin.sortValue;
        	    cond.maxValue = bin.sortValue;
        	} else {
        		cond.minValue = bin.min;
        		cond.maxValue = bin.max;
        	}
            break;
        case "DATE":
            // TODO: assert this
            cond.dateFilterType = "RANGE";
            cond.minValue = bin.min;
            cond.maxValue = bin.max;
            break;
        default:
            throw new Error("unimplemented");
        }
        return cond;
    }

    var Logger = LoggerProvider.getLogger('charts');
    var svc = {
        
        isExcludable : function(dim, type, variant) {
            // For the moment, we do not support these
            if (dim.type == "DATE" && !ChartDimension.isTimelineable(dim)) {
                return false;
            }
            if (ChartDimension.isUnbinnedNumerical(dim)) {
                return false;
            }
            if ( type == 'boxplots' || variant == 'binned_xy_hex' ) {
            	return false;
            }
            return true;
        },
        isDrillable : function(dim) {
            const isAutomatic = ChartDimension.isAutomatic(dim);

            return !isAutomatic && ((ChartDimension.isTimelineable(dim) && dim.dateParams.mode != "HOUR") ||
                ChartDimension.isBinnedNumerical(dim));
        },

        drill : function(chartDef, dim, bin) {
            Logger.info("Drilling on", dim, bin);

            if (dim.type == "DATE") {
                var filter = svc.findDateTimelineFilter(chartDef, dim);
                if (filter == null) {
                    filter = {
                        columnType : dim.type,
                        column :  dim.column,
                        dateFilterType : "RANGE"
                    }
                    chartDef.filters.push(filter);
                }

                filter.minValue = bin.min;
                filter.maxValue = bin.max;

                dim.dateParams.mode = svc.nextDateRange(dim.dateParams.mode);
            } else if (dim.type == "NUMERICAL") {
                var filter = svc.findNumericalFacetFilter(chartDef, dim);
                if (filter == null) {
                    filter = {
                        columnType : dim.type,
                        column :  dim.column,
                    }
                    chartDef.filters.push(filter);
                }
                filter.minValue = bin.min;
                filter.maxValue = bin.max;
            } else{
                throw new Error("unimplemented drill on " + JSON.json(dim));
            }
            filter.filterType = filter.columnType + "_FACET";
        },

        nextDateRange : function(dateRange) {
            switch (dateRange) {
                case "YEAR":
                case "QUARTER":
                    return "MONTH";
                case "MONTH":
                case "WEEK":
                    return "DAY";
                case "DAY":
                    return "HOUR";
                case "HOUR":
                    return "MINUTE"
            }
        },

        findDateFilter : function(chartDef, dim) {
            var col = dim.column;
            return Array.dkuFindFn(chartDef.filters, function(filter) {
                return filter.column == col;
            });
        },

        findDateTimelineFilter : function(chartDef, dim){
            var col = dim.column;
            return Array.dkuFindFn(chartDef.filters, function(filter) {
                return filter.column == col && filter.dateFilterType == "RANGE";
            });
        },

        findNumericalFacetFilter : function(chartDef, dim){
            var col = dim.column;
            return Array.dkuFindFn(chartDef.filters, function(filter) {
                return filter.column == col;
            });
        },
        excludeND :function(chartDef, dimensions, bins) {
            var filter = {
                filterType : "EXPLICIT",
                explicitExclude : true,
                isA : "filter",
                explicitConditions : [],
                column : "NOT "
            };

            for (var i = 0; i < dimensions.length; i++) {
                if (i > 0) {
                    filter.column += " - ";
                }
                filter.column += dimensions[i].column + ": " + bins[i].label;

                filter.explicitConditions.push(makeExplicitFilterCond(dimensions[i], bins[i]));
            }

            chartDef.filters.push(filter);
        },
        exclude2D :function(chartDef, dim0, dim0Bin, dim1, dim1Bin) {
            var filter = {
                filterType : "EXPLICIT",
                explicitExclude : true,
                isA : "filter",
                explicitConditions : [],
                column : "NOT " + dim0.column + ": " + dim0Bin.label + " - " + dim1.column + ": " + dim1Bin.label
            }

            filter.explicitConditions.push(makeExplicitFilterCond(dim0, dim0Bin));
            filter.explicitConditions.push(makeExplicitFilterCond(dim1, dim1Bin));
            chartDef.filters.push(filter);
        },
        exclude1D :function(chartDef, dim, dimBin) {
            var filter = {
                filterType : "EXPLICIT",
                explicitExclude : true,
                isA : "filter",
                explicitConditions : [],
                column : "NOT " + dim.column + ": " + dimBin.label
            }

            filter.explicitConditions.push(makeExplicitFilterCond(dim, dimBin));
            chartDef.filters.push(filter);
        },
        facetOnDim : function(chartDef, dim){
            chartDef.filters.push({
                columnType : dim.type,
                filterType : dim.type + "_FACET",
                column : dim.column
            });
        }
    }
    return svc;
}


/**
 * Older tooltip service, now only used in boxplots.js and graph.js
 */
function ChartTooltipsUtils(LoggerProvider, $q, $templateCache, $http, $timeout, $compile, ChartViewCommon, ChartDrillUtils, NumberFormatter) {
    var globalTooltipId = 0;
    var Logger = LoggerProvider.getLogger('charts');
    var svc = {
        /**
         * Returns a promise to [tooltip (as D3 sel), tooltipScope]
         */

        create : function(parentScope, type, chart) {
            var deferred = $q.defer();
            var tooltipScope, tooltip;
            var location = "/templates/simple_report/tooltips/" + type + ".html"
            $q.when($templateCache.get(location) || $http.get(location, {cache: true})).then(function (template) {

                if (parentScope.noTooltips) {
                    // return fake tooltip scope with marker
                    deferred.resolve([null, {'$apply': function(){}, 'noTooltips': true, 'noClickableTooltips': parentScope.noClickableTooltips}]);
                    return;
                }

                if(angular.isArray(template)) {
                    template = template[1];
                } else if(angular.isObject(template)) {
                    template = template.data;
                }
                globalTooltipId++;

                var newDOMElt = $(template);
                newDOMElt.addClass("ng-cloak");

                newDOMElt.attr("g-tooltip-id", globalTooltipId);

                $("body").append(newDOMElt);

                Logger.info("Create tooltip: " + globalTooltipId + ", now have in DOM: "+ $("[g-tooltip-id]").length);

                tooltip = d3.selectAll(newDOMElt.toArray());
                tooltip.style("top", 0).style("left", "-50%");

                $timeout(function(){
                    $compile(newDOMElt)(parentScope);
                    tooltipScope = angular.element(newDOMElt).scope();

                    tooltipScope.$on("$destroy", function(){
                        Logger.info("Destroying tooltip: " + tooltip.attr("g-tooltip-id"));
                        tooltip.remove();
                    });
                    deferred.resolve([tooltip, tooltipScope]);
                });

                tooltip.on("mouseenter", function(){
                    tooltipScope.mouseOnTooltip = true;
                    tooltipScope.$apply();
                }).on("mouseleave", function(){
                    tooltipScope.mouseOnTooltip = false;
                    if (!tooltipScope.mouseOnElement) {
                        ChartViewCommon.tooltipDisappear(tooltip);
                    }
                    tooltipScope.$apply();
                });

                svc.flagTooltipAndRemoveOrphans(chart, tooltip);

            });
            return deferred.promise;
        },

        createWithStdAggr1DBehaviour : function(parentScope, type, chart) {
            return svc.create(parentScope, type, chart).then(function(x){
                var tooltipScope = x[1];

                if (!tooltipScope.noTooltips) {
                    tooltipScope.facetOnAxis = function(){
                        var chartDef = tooltipScope.chart.def;
                        ChartDrillUtils.facetOnDim(chartDef, chartDef.boxplotBreakdownDim[0]);
                    };
                    tooltipScope.drillOnAxis = function() {
                        var chartDef = tooltipScope.chart.def;
                        ChartDrillUtils.drill(chartDef,
                            chartDef.boxplotBreakdownDim[0], tooltipScope.dimsData[0].bin);
                    };
                    tooltipScope.excludeCurrent = function(){
                        var chartDef = tooltipScope.chart.def;
                        ChartDrillUtils.exclude1D(chartDef,
                            chartDef.boxplotBreakdownDim[0],
                            tooltipScope.dimsData[0].bin);
                    };
                }
                return x;
            })
        },
        appear : function(tooltip, color, event, element, xOffset){
            if (!tooltip) return;

            //initializing tooltip position values to top left of cursor
            var tooltipX = event.pageX + 3 + (xOffset ? xOffset : 0);
            var tooltipY = event.pageY - 28;
            //checking wether there is some better positionning
            var eventSvgX = event.pageX - $(element).offset().left;
            var eventSvgY = event.pageY - $(element).offset().top;
            if (eventSvgX > $(element).outerWidth() / 2) {
                tooltipX = event.pageX - tooltip.node().getBoundingClientRect().width - 3 - (xOffset ? xOffset : 0);
            }
            if (eventSvgY > $(element).outerHeight() / 2) {
                tooltipY = event.pageY - tooltip.node().getBoundingClientRect().height + 28;
            }
            // Border is not transitionable
            tooltip.transition().duration(300)
                .style("opacity", 1)
                .style("left", (tooltipX) + "px")
                .style("top", (tooltipY) + "px");
            tooltip.style("pointer-events", "none");
            return tooltip;
        },

        handleMouseOverElement : function(tooltipScope){
            if (!tooltipScope || tooltipScope.noTooltips) return;
            tooltipScope.mouseOnElement = true;
            tooltipScope.tooltipIsPersistent = false;
        },
        handleMouseOutElement : function(tooltip, tooltipScope, digestInProgress) {
            if (tooltipScope.noTooltips) return;
            tooltipScope.mouseOnElement = false;
            if (!tooltipScope.tooltipIsPersistent) {
                ChartViewCommon.tooltipDisappear(tooltip);
            } else {
                $timeout(function(){
                    if (!tooltipScope.mouseOnTooltip) {
                        ChartViewCommon.tooltipDisappear(tooltip);
                        tooltipScope.tooltipIsPersistent = false;
                        if (!digestInProgress) {
                            tooltipScope.$apply();
                        }
                    }
                }, 150);
            }
            if (!digestInProgress) {
                tooltipScope.$apply();
            }
        },
        handleClickElement : function(tooltip, tooltipScope) {
            if (tooltipScope.noTooltips) return;
            if (tooltipScope.noClickableTooltips) return;
            if (tooltipScope.tooltipIsPersistent){
                 tooltip.style("pointer-events", "none");
                //ChartViewCommon.tooltipDisappear(tooltip);
            } else {
                tooltip.style("pointer-events", "auto");
            }
            tooltipScope.tooltipIsPersistent = !tooltipScope.tooltipIsPersistent;
            tooltipScope.$apply();
        },
        setBoxplotData : function(tooltipScope, chartDef, boxplot) {
            if (tooltipScope.noTooltips) return;
            tooltipScope.dimsData = [{
                label: tooltipScope.dimensionLabel(chartDef.boxplotBreakdownDim[0]),
                value: boxplot.label,
                bin: {}
            }];

            var formatter = ChartViewCommon.getMeasuresFormatter(chartDef, true);

            tooltipScope.recordsCount = boxplot.nbVAlid;

            tooltipScope.tooltipMeasuresData = [];
            tooltipScope.tooltipMeasuresData.push({label : 'Mean',valF : formatter(boxplot.mean)});
            tooltipScope.tooltipMeasuresData.push({label : 'Std. dev.',valF : formatter(boxplot.stddev)});
            tooltipScope.tooltipMeasuresData.push({label : 'Min',valF : formatter(boxplot.min)});
            tooltipScope.tooltipMeasuresData.push({label : '1st quartile',valF : formatter(boxplot.pc25)});
            tooltipScope.tooltipMeasuresData.push({label : 'Median',valF : formatter(boxplot.median)});
            tooltipScope.tooltipMeasuresData.push({label : '3rd quartile',valF : formatter(boxplot.pc75)});
            tooltipScope.tooltipMeasuresData.push({label : 'Max',valF : formatter(boxplot.max)});

            tooltipScope.isDrillable = ChartDrillUtils.isDrillable(chartDef.boxplotBreakdownDim[0]);
            tooltipScope.isExcludable = ChartDrillUtils.isExcludable(chartDef.boxplotBreakdownDim[0], chartDef.type, chartDef.variant);
        },
        flagTooltipAndRemoveOrphans : function(chart, tooltip) {
        	var flagChartAndTooltipTogether = function(chart, tooltip) {
            	var id = Date.now();
            	$(chart).parents('.pivot-chart').attr('data-tooltip-id', id);
            	tooltip.attr('data-tooltip-id', id);
            };

        	var removeOrphanTooltips = function() {
            	$('.chart-tooltip').each(function(index, element) {
            		var id = $(element).data('tooltipId');
            		if ($('.pivot-chart[data-tooltip-id="'+ id +'"]').length <= 0) {
            			$(element).remove();
            		}
            	});
            };

        	flagChartAndTooltipTogether(chart, tooltip);
        	removeOrphanTooltips();
        }
    };
    return svc;
}


})();
