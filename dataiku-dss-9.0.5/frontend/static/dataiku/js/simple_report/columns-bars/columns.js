(function(){
'use strict';

    angular.module('dataiku.charts')
        .factory('GroupedColumnsChart',  GroupedColumnsChart)
        .factory('GroupedColumnsDrawer', GroupedColumnsDrawer)
        .factory('GroupedColumnsUtils',  GroupedColumnsUtils);

    function GroupedColumnsChart(ChartViewCommon, ChartDataUtils, ChartTensorDataWrapper, GroupedColumnsDrawer, GroupedColumnsUtils) {
        return function($container, chartDef, chartHandler, axesDef, data) {

            var chartData = ChartTensorDataWrapper(data, axesDef),
                yExtents = ChartDataUtils.getMeasureExtents(chartDef, data),
                y1Domain = yExtents.y1.extent,
                y2Domain = yExtents.y2.extent;

            var groupsData = GroupedColumnsUtils.prepareData(chartDef, chartData);

            var drawFrame = function (frameIdx, chartBase) {
                chartData.fixAxis('animation', frameIdx);
                chartBase.$svgs.each(function(f, svg) {
                    var g = d3.select($(svg).find('g.chart').get(0));
                    GroupedColumnsDrawer(g, chartDef, chartHandler, chartData.fixAxis('facet', f), chartBase, groupsData, f);
                });
            };

            ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
                {type: 'DIMENSION', mode:'COLUMNS', dimension: chartDef.genericDimension0[0], name: 'x'},
                {type: 'MEASURE', domain: y1Domain, isPercentScale: yExtents.y1.onlyPercent},
                {type: 'MEASURE', domain: y2Domain, isPercentScale: yExtents.y2.onlyPercent},
                {type: 'DIMENSION', name: 'color', dimension: chartDef.genericDimension1[0]});
        };
    }

    function GroupedColumnsDrawer(ChartDimension, Fn) {
        return function(g, chartDef, chartHandler, chartData, chartBase, groupsData, f) {

            var xDimension = chartDef.genericDimension0[0],
                xLabels = chartData.getAxisLabels('x'),
                xAxis = chartBase.xAxis,
                isAxisLogScale = function(d) {
                    return chartDef.genericMeasures[d.measure].displayAxis == 'axis1' ? chartDef.axis1LogScale : chartDef.axis2LogScale;
                },
                getScale = function(d) {
                    return chartDef.genericMeasures[d.measure].displayAxis == 'axis1' ? chartBase.yAxis.scale() : chartBase.y2Axis.scale();
                },
                zeroIsInDomain = function(d) {
                    var axisDomain = getScale(d).domain();
                    return  (axisDomain[0] > 0) != (axisDomain[1] > 0);
                },
                getRectValue = function (d) {
                    return chartData.aggr(d.measure).get(d);
                };



            var groupWidth = ChartDimension.isUnbinnedNumerical(xDimension) ? 10 : Math.max(1, xAxis.ordinalScale.rangeBand()),
                barWidth = groupsData.length > 0 ? groupWidth/groupsData[0].columns.length : groupWidth;

            var groups = g.selectAll('g.group').data(groupsData);
            groups.enter().append('g')
                .attr('class', 'group');
            groups.exit().remove();
            groups.attr('transform', function(d) {
                let hasOneTickPerBin = ChartDimension.hasOneTickPerBin(xDimension);
                let isBinnedNumerical = ChartDimension.isBinnedNumerical(xDimension);
                // Use scale() only if in binned numerical mode. If only one tick should be used per bin then use ordinalScale().
                // When using scale(), half of the barWidth should be deduced.
                let translateBase = isBinnedNumerical && !hasOneTickPerBin ? xAxis.scale()(xLabels[d.x].sortValue) - barWidth / 2 : xAxis.ordinalScale(d.x);
                return 'translate(' + translateBase + ', 0)';
            });

            var positionRects = function(rects) {
                return rects.attr('transform', function(d, i) {
                    var yScale = getScale(d);
                    var v = chartData.aggr(d.measure).get(d), s;
                    if (isAxisLogScale(d) && v === 0) v = 1;
                    if (!isAxisLogScale(d) && (chartDef.includeZero || zeroIsInDomain(d))) {
                        s = Math.min(yScale(v), yScale(0));
                    } else {
                        s = v <= 0 ? yScale.range()[1] : yScale(v);
                    }
                    return "translate(" + (barWidth * i) + ", " + s + ")";
                }).attr("height", function(d) {
                    var yScale = getScale(d);
                    var v = chartData.aggr(d.measure).get(d);
                    var h;
                    if (isAxisLogScale(d)) {
                        if (v === 0) v = 1;
                        h = chartBase.vizHeight - yScale(v);
                    } else {
                        if (chartDef.includeZero || zeroIsInDomain(d)) {
                            h = Math.abs(yScale(v) - yScale(0));
                        } else {
                            h = v <= 0 ? yScale(v) - yScale.range()[1] : yScale.range()[0] - yScale(v);
                        }
                    }
                    return Math.max(h, 1);
                });
            };

            var rects = groups.selectAll('rect').data(Fn.prop('columns'));
            rects.enter().append('rect')
                .attr('width', barWidth)
                .attr('fill', function(d){ return chartBase.colorScale(d.color + d.measure); })
                .attr("opacity", chartDef.colorOptions.transparency)
                .each(function(d) { chartBase.tooltips.registerEl(this,  angular.extend({}, d, {facet: f}), 'fill'); })
                .call(positionRects);
            rects.exit().remove();
            rects.transition().ease('easeOutQuad').call(positionRects);


            if (chartDef.showInChartValues) {
                var rectTexts = groups.selectAll('text.value').data(Fn.prop('columns'));
                rectTexts.enter().append('text')
                    .attr('class', 'value')
                    .attr('x', function(d,i) { return barWidth*(i+0.5); })
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#333')
                    .attr('dominant-baseline', function(d) { return getRectValue(d) >= 0 ? 'text-after-edge' : 'text-before-edge'; })
                    .style('pointer-events', 'none');
                rectTexts.exit().remove();
                rectTexts
                    .text(function(d) { return chartData.getCount(d) > 0 ? chartBase.measureFormatters[d.measure](getRectValue(d)) : ''; })
                    .each(function() {
                        var bbox = this.getBoundingClientRect();
                        if (bbox.width > barWidth) {
                            d3.select(this).attr('visibility', 'hidden');
                        } else {
                            d3.select(this).attr('visibility', null);
                        }
                    })
                    .transition()
                    .ease('easeOutQuad')
                    .attr('y', function(d,i) {
                        var rectValue = getRectValue(d);
                        var scaleValue = getScale(d)(rectValue);
                        if (isNaN(scaleValue)) return 0;
                        else return scaleValue - (rectValue >= 0 ? 2 : -2);
                    }); // TODO @charts if all negative ?
            }
        }
    }

    function GroupedColumnsUtils() {
        return {
            prepareData: function (chartDef, chartData, measureFilter) {
                var xLabels = chartData.getAxisLabels('x'),
                    colorLabels = chartData.getAxisLabels('color') || [null],
                    groupsData = [];

                xLabels.forEach(function (xLabel, x) {
                    var columns = [];
                    colorLabels.forEach(function (colorLabel, c) {
                        chartDef.genericMeasures.forEach(function (measure, m) {
                            if (measureFilter && !measureFilter(measure)) return;
                            columns.push({color: c, measure: m, x: x});
                        });
                    });
                    groupsData.push({x: x, columns: columns});
                });
                return groupsData;
            }
        }
    }

})();
