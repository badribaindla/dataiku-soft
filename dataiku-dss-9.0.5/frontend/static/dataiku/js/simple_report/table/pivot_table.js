(function() {
'use strict';

const app = angular.module('dataiku.charts');


app.factory("PivotTableChart", function(Assert, ChartViewCommon, Fn, ChartLabels, Logger, smartNumberFilter, ChartTensorDataWrapper, ChartTooltips, ChartLegendUtils, ChartColorScales, ChartDataUtils){
    return function ($element, chartDef, chartHandler, axesDef, data) {
        $element.children().remove();
        var $container = $("<div class='h100 table-pivot-table chart-wrapper' />");

        var chartData = ChartTensorDataWrapper(data, axesDef);
        $element.append($container);

        var hasX = chartDef.xDimension.length > 0;
        var hasY = chartDef.yDimension.length > 0;
        var is2D= hasX && hasY;

        var TYPE_CELL       = 0;
        var TYPE_ROW_HEADER = 1;
        var TYPE_ROW_TOTALS = 2;
        var TYPE_COL_TOTALS = 3;
        var TYPE_MEASURE_HEADERS = 4;
        var OVERFLOW = 5;
        var CORNER_CELL = 6;

        //For colored table
        var isColoredTable = chartDef.variant == 'colored';
        var colorMeasureIndex = -1;
        var hasColorMeasure = false;
        if (isColoredTable && data.aggregations.length > 0){
        	if (chartDef.colorMeasure.length == 0) {
        		colorMeasureIndex = 0;
        	} else {
        		hasColorMeasure = true;
        		colorMeasureIndex = data.aggregations.length - 1;
        		chartDef.colorMeasure.$mIdx = colorMeasureIndex;
        	}


            // Create color scale
            var colorScale = ChartColorScales.createColorScale(chartData, chartDef, {type: 'MEASURE', measureIdx: colorMeasureIndex, withRgba: true});
            ChartLegendUtils.initLegend(chartDef, chartData, chartHandler, colorScale);
        } else {
            chartHandler.legends.length = 0;
        }

        var hasLineMeasureHeader = false;
        if (isColoredTable) {
        	hasLineMeasureHeader = data.aggregations.length - chartDef.colorMeasure.length > 1;
        } else {
        	hasLineMeasureHeader = data.aggregations.length > 1;
        }

        /* I have only columns, so:
            - 1 header line
            - 1 line per measure
         */
        function buildModel1DX(){
            var tableData = new fattable.SyncTableModel();
            var labels = chartData.getAxisLabels('x');

            /* naggr rows, labels +1 columns */
            tableData.getCellSync = function(ri, cj) {
                if (ri >= chartDef.genericMeasures.length) {
                    return { ri:ri, cj:cj, type : OVERFLOW};
                }
                if (cj == 0) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_MEASURE_HEADERS,
                        labels : [ChartLabels.longMeasureLabel(chartDef.genericMeasures[ri])]
                    }
                } else {
                	var cell = {
	        			 ri:ri,
	        			 cj:cj,
	                     type : TYPE_CELL,
	                     aggrs : [chartData.aggr(ri).get({x: cj-1})]
                	}
                	if (isColoredTable) {
                		cell.aggrs.push(chartData.aggr(colorMeasureIndex).get({x: cj-1}));
                	}
                	return cell;
                }
            };
            tableData.getHeaderSync = function(cj) {
                var ret;
                if (cj == 0) {
                    return { label : ""};
                } else {
                    return  labels[cj-1];
                }
           };
           return tableData;

        }

        /* Header line contains measure names, then one line per value */
        // NB: margin not yet handled here.
        function buildModel1DY(){
            var tableData = new fattable.SyncTableModel();
            var labels = chartData.getAxisLabels('y');
            /* naggr cols, Y rows */
            tableData.getCellSync = function(ri, cj) {
                if (ri >= labels.length) {
                    return { ri:ri, cj:cj, type : OVERFLOW};
                }
                if (cj == 0 && ri == labels.length) {
                    Assert.trueish(false, 'no margin space'); // reserved for margin usage
                } else if (cj == 0) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_ROW_HEADER,
                        label : labels[ri]
                    }
                } else if (ri == labels.length) {
                    Assert.trueish(false, 'no margin space'); // reserved for margin usage
                } else {
                	var cell = {
                        ri:ri,
                        cj:cj,
                        type : TYPE_CELL,
                        aggrs : [chartData.aggr(cj - 1).get({y: ri})]
                    }
                	if (isColoredTable) {
                		cell.aggrs.push(chartData.aggr(colorMeasureIndex).get({y: ri}));
                	}
                	return cell;
                }
            };
            tableData.getHeaderSync = function(cj) {
                if (cj == 0) {
                    return { label : ""};
                } else {
                    return { label : ChartLabels.longMeasureLabel(chartDef.genericMeasures[cj-1])}
                }
           };
           return tableData;
        }


        function buildModel2D(){
            var xLabels = chartData.getAxisLabels('x');
            var yLabels = chartData.getAxisLabels('y');
            var colMarginCol = hasLineMeasureHeader ? xLabels.length + 2 : xLabels.length + 1;
            var colOffset = hasLineMeasureHeader ? 2 : 1;
            var tableData = new fattable.SyncTableModel();
            /* X+2 cols, Y+1 rows */
            tableData.getCellSync = function(ri, cj) {
                if (ri > yLabels.length) {
                    return { ri:ri, cj:cj, type : OVERFLOW};
                }
                if (cj == 0 && ri == yLabels.length) {
                     return {
                        ri:ri, cj:cj,
                        type : CORNER_CELL
                    }
                } else if (cj == 0) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_ROW_HEADER,
                        label : yLabels[ri]
                    }
                } else if (cj == 1 && hasLineMeasureHeader) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_MEASURE_HEADERS,
                        labels : chartDef.genericMeasures.map(ChartLabels.longMeasureLabel)
                    }
                } else if (cj == colMarginCol && ri == yLabels.length) {
                    // summary-summary
                    return {
                        ri:ri, cj:cj,
                        type : CORNER_CELL
                    }
                } else if (cj == colMarginCol) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_ROW_TOTALS,
                        aggrs : data.aggregations.map(function(aggrData, aggrIdx){
                            return chartData.aggr(aggrIdx).getAxisValue('y', ri);
                        })
                    }
                } else if (ri == yLabels.length) {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_COL_TOTALS,
                        aggrs : data.aggregations.map(function(aggrData, aggrIdx){
                            return chartData.aggr(aggrIdx).getAxisValue('x', cj - colOffset);
                        })
                    }
                } else {
                    return {
                        ri:ri, cj:cj,
                        type : TYPE_CELL,
                        aggrs : data.aggregations.map(function(aggrData, aggrIdx){
                            var dd = chartData.aggr(aggrIdx).get({x: cj-colOffset, y: ri});
                            if (dd == undefined) {
                                Logger.warn("UNDEFINED CELL", ri, cj, idx, dd);
                            }
                            return dd;
                        })
                    }
                }
            };
            tableData.getHeaderSync = function(cj) {
                var ret;
                if (cj == 0) {
                    ret = { label : ""};
                } else if (cj == 1 && hasLineMeasureHeader) {
                    ret = { label : ""};
                } else if (cj == colMarginCol) {
                    ret = { label : ""};
                } else {
                    ret = xLabels[cj - colOffset];
                }
                return ret;
           };
           return tableData;
        }

        var labelify = ChartViewCommon.labelify;

        var measuresFormatter = [];
        var isPercentageOnly = true;
        for (var i = 0; i < chartDef.genericMeasures.length; i++) {
        	if (chartDef.genericMeasures[i].computeMode == "PERCENTAGE") {
        		measuresFormatter.push(d3.format(".0%"));
        	} else {
        		measuresFormatter.push(smartNumberFilter);
        		isPercentageOnly = false;
        	}
        }

        function buildPainter() {
           var painter = new fattable.Painter();
           var xLabels = chartData.getAxisLabels('x');
           if (is2D) {
               var colMarginCol = hasLineMeasureHeader ? xLabels.length + 2 : xLabels.length + 1;
           }

           painter.setupHeader = function(el) {}

           painter.fillHeader = function(el, data){
               var $el = $(el);
               $el.empty();
               $el.removeClass();
               $el.addClass("headercell");
               $el.attr("title", labelify(data.label));
               el.textContent = labelify(data.label);
           }
           painter.fillCell = function(el, data) {
               var $el = $(el);
               $el.empty();

               $el.removeClass();
               if (chartDef.variant == 'colored') {
            	   $el.addClass("colored");
               } else {
            	   $el.addClass(data.ri % 2 == 0 ? "even" :"odd");
               }

               $el.attr("celltype", data.type);
               $el.attr("cellri", data.ri);
               $el.attr("cellcj", data.cj);

               if (data.type == CORNER_CELL) {
            	   if (isPercentageOnly) {
            		   $el.remove();
            	   }
                   return; // margin-margin, not handled
               }

               if (data.type == OVERFLOW) {
                   $el.html("OVERFLOW");
                   return;
               }

               var colorValueIndex;
               if (chartDef.variant == 'colored') {
            	   if (is2D) {
            		   colorValueIndex = colorMeasureIndex;
            	   } else {
            		   colorValueIndex = 1;
            	   }
               }

               if (is2D) {
                   tooltips.removeTooltipsHandlers($el[0]);
               }
               $el.off("mouseover mouseout click");

               if (data.type == TYPE_CELL) {
                   $el.addClass("maincell");
                   var content = "";
                   data.aggrs.forEach(function(d, i){
                	   if (!isColoredTable || !hasColorMeasure || i!=colorMeasureIndex ) {
                		   var measureFormatterIndex = 0;
                		   if (is2D) {
                			   measureFormatterIndex = i;
                		   } else if (hasX) {
                			   measureFormatterIndex = data.ri;
                		   } else if (hasY) {
                			   measureFormatterIndex = data.cj-1;
                		   }
                		   content += measuresFormatter[measureFormatterIndex](d);
                           if (i != data.aggrs.length - 1) content += "<br />";
                	   }
                   });
                   if (chartDef.variant == 'colored') {
                	   content = "<div class='colored-content-wrapper' style='background-color: "+ colorScale(data.aggrs[colorValueIndex]) +"'>" + content + "</div>";
                   }
                   $el.html( content);

                   // Tooltip
                   if (is2D) {
                       var coords = {x: data.cj - (hasLineMeasureHeader ? 2 : 1), y: data.ri};
                       tooltips.addTooltipHandlers($el[0], coords, isColoredTable ? colorScale(chartData.aggr(colorMeasureIndex).get(coords)) : null);
                   }

               } else if (data.type == TYPE_ROW_HEADER) {
                   $el.addClass("rowheadercell");
                   $el.html("<strong>" + sanitize(labelify(data.label.label)) +"</strong>");
                   $el.attr("title", labelify(data.label.label));
               } else if (data.type == TYPE_COL_TOTALS || data.type == TYPE_ROW_TOTALS) {
            	   if (isPercentageOnly) {
            		   $el.remove();
            	   } else {
            		   $el.addClass("margincell");
                       if (data.type == TYPE_COL_TOTALS){
                           $el.addClass("colmargincell");
                       } else {
                           $el.addClass("rowmargincell");
                       }
                	   var content = "";
                       data.aggrs.forEach(function(d, i){
                    	   if (!isColoredTable || !hasColorMeasure || i!=colorMeasureIndex ) {
	                    	   if (chartDef.genericMeasures[i].computeMode != "PERCENTAGE") {
                                   content += sanitize(measuresFormatter[i](d));
	                    	   } else {
	                    		   content += "NA";
	                    	   }
	                    	   if (i != data.aggrs.length - chartDef.colorMeasure.length - 1) content += "<br />";
                    	   }
                       });
                	   $el.html( "<strong>" + content + "</strong>");
            	   }
               } else {
                   var content = "";
                   data.labels.forEach(function(d, i){
                       content += sanitize(d);
                       if (i != data.labels.length - 1) content += "<br />";
                   });
                   $el.addClass("measure-labels");
                   $el.html(content);
                }
           }
           return painter;
        }

        var lineHeight = 16;

        var thetable = null;
        if (is2D){
            $container.addClass("has-tooltip");
            var measureFormatters = ChartViewCommon.createMeasureFormatters(chartDef, chartData, 1000);
            var tooltips = ChartTooltips.create($element, chartHandler, chartData, chartDef, measureFormatters);
            $container.on('click', function(evt) {
                if (evt.target.hasAttribute('data-legend') || evt.target.hasAttribute('tooltip-el')) return;
                tooltips.unfix();
            });

            var colWidths = [100];
            if (hasLineMeasureHeader) {
                colWidths.push(100);
            }
            colWidths = colWidths
                .concat(chartData.getAxisLabels('x').map(function(x){return 90;}))
                .concat([90]);

            //var maxHeaderTextLen = d3.max(data.getAxisLabels('x').map(function(x){return x.label.length}));
            var headerHeight = 25; // Math.ceil(maxHeaderTextLen / 12) * lineHeight + 14;

            var nbRows = data.aggregations.length;
            if (isColoredTable) {
            	nbRows = nbRows - chartDef.colorMeasure.length;
            }
            var rowHeitgh = lineHeight * nbRows + 10

            thetable = fattable({
                        "container": $container[0],
                        "model": buildModel2D(),
                        "nbRows": (chartData.getAxisLabels('y').length + 1),
                        "headerHeight": headerHeight,
                        "rowHeight":  rowHeitgh,
                        "columnWidths": colWidths,
                        "painter": buildPainter()
                    });

        } else if(hasY){
            var colWidths = [120];
            var nbCols = data.aggregations.length;
            // If table is colored and colorMeasure was set, last aggregation is made of colorMeasure and should not be counted as a column
            if (isColoredTable && hasColorMeasure) {
            	nbCols = nbCols - chartDef.colorMeasure.length;
            }
            for (var i = 0; i<nbCols; i++) {
            	colWidths.push(120);
            }

            var headerHeight = 24;

            thetable = fattable({
                        "container": $container[0],
                        "model": buildModel1DY(),
                        "nbRows": (chartData.getAxisLabels('y').length),
                        "headerHeight": headerHeight,
                        "rowHeight":  lineHeight + 10,
                        "columnWidths": colWidths,
                        "painter": buildPainter()
                    });
        } else {
            var colWidths = [120].concat(chartData.getAxisLabels('x').map(function(x){return 90;}));

            //var maxHeaderTextLen = d3.max(chartData.getAxisLabels('x').map(function(x){return x.label.length}));
            var headerHeight = 25; // Math.ceil(maxHeaderTextLen / 12) * lineHeight + 14;

            var nbRows = data.aggregations.length;
            if (isColoredTable) {
            	nbRows = nbRows - chartDef.colorMeasure.length;
            }

            thetable = fattable({
                        "container": $container[0],
                        "model": buildModel1DX(),
                        "nbRows": nbRows,
                        "headerHeight": headerHeight,
                        "rowHeight":  lineHeight + 10,
                        "columnWidths": colWidths,
                        "painter": buildPainter()
                    });
        }

        thetable.setup();
        thetable.scroll.setScrollXY(0,0);

        // Signal to the callee handler that the chart has been successfully loaded. Dashboards use it to determine when all insights are completely loaded.
        if (typeof(chartHandler.loadedCallback) === 'function') {
            chartHandler.loadedCallback();
        }
    };
})

})();