(function(){
'use strict';

angular.module('dataiku.charts')
	.factory('PieChart',  PieChart)
	.factory('PieChartUtils', PieChartUtils)
	.factory('PieChartDrawer', PieChartDrawer);

function PieChart(ChartViewCommon, ChartTensorDataWrapper, PieChartUtils, PieChartDrawer) {
    return function ($container, chartDef, chartHandler, axesDef, data) {

        var chartData = ChartTensorDataWrapper(data, axesDef),
            animationData = PieChartUtils.prepareData(chartDef, chartData);

        var drawFrame = function (frameIdx, chartBase) {
            animationData.frames[frameIdx].facets.forEach(function (facetData, f) {
                var g = d3.select(chartBase.$svgs.eq(f).find('g.chart').get(0));
                PieChartDrawer(g, chartDef, chartBase, facetData);
            });
		};

        ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame, null, null, null, {type: 'DIMENSION', name: 'color', dimension: chartDef.genericDimension0[0]});

    };
}

function PieChartDrawer(PieChartUtils, d3Utils, $filter) {
    return function(g, chartDef, chartBase, facetData) {
        var outerR = Math.min(chartBase.vizWidth, chartBase.vizHeight) / 2;
        var r = chartDef.showInChartLabels || chartDef.showInChartValues ? (outerR - 40) : outerR;
        var center = {'x': chartBase.vizWidth / 2, 'y': chartBase.vizHeight / 2};

        var viz = g.selectAll('g.viz').data([null]);
        viz.enter().append('g').attr('class', 'viz');
        viz.attr("transform", "translate(" + center.x + "," + center.y + ")");

        var arc = d3.svg.arc().outerRadius(r);

        var wrappers = viz.selectAll('g.wrapper')
            .data(facetData.pie || [], function (d) {
                return d.data.color + '-' + d.data.measure;
            });

        var newWrappers = wrappers.enter().append('g').attr('class', 'wrapper');


        var drawHole = function() {
            //--------------- Donut hole if necessary -----------------

            var hole = g.selectAll('circle.hole').data([null]);
            if (chartDef.variant === 'donut') {
                var holeRadius = r / 2;
                if (chartDef.pieOptions && chartDef.pieOptions.donutHoleSize && 0 < chartDef.pieOptions.donutHoleSize && chartDef.pieOptions.donutHoleSize < 100) {
                    holeRadius = r * chartDef.pieOptions.donutHoleSize / 100;
                }
                hole.enter().append('circle').attr('class', 'hole')
                    .attr('cx', center.x)
                    .attr('cy', center.y)
                    .attr('r', holeRadius)
                    .style('fill', 'white');
                hole.attr('r', holeRadius);
            } else {
                hole.remove();
            }
        };

        //--------------- Draw labels -----------------

        if (chartDef.showInChartLabels || chartDef.showInChartValues) {
            var outerArc = d3.svg.arc()
                .innerRadius(r)
                .outerRadius(outerR);

            var svgBoundingBox = $(g.node()).closest('svg').get(0).getBoundingClientRect();
            var maxOverflow = 0;

            var transformLabels = function (sel) {
                return sel.attr("transform", function (d) {
                    return "translate(" + outerArc.centroid(d) + ")";
                });
            };

            newWrappers.append('text').attr('class', 'label')
                .call(transformLabels);

            var texts = wrappers.select('text.label');

            texts
                .text(function (d, i) {
                    var text = '';
                    if (chartDef.showInChartLabels) {
                        text += $filter('chartLabelValue')(chartBase.chartData.getAxisLabels('color')[d.data.color].label);
                    }

                    if (chartDef.showInChartLabels && chartDef.showInChartValues) {
                        text += ' - ';
                    }

                    if (chartDef.showInChartValues) {
                        text += chartBase.measureFormatters[d.data.measure](d.data.value);
                    }

                    return text;
                })
                .attr("text-anchor", function (d) {
                    var middleAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
                    if (middleAngle > Math.PI) {
                        return "end";
                    } else {
                        return "start";
                    }
                })
                .attr("fill", "#666")
                .style('display', function (d) {
                    return d.data.value > 0 ? 'block' : 'none';
                })
                .transition()
                .call(transformLabels)
                .call(d3Utils.endAll, function () {
                    if (maxOverflow > 0) {
                        outerR = Math.max(75, outerR - maxOverflow);
                        r = outerR - 40;
                        arc.outerRadius(r);
                        outerArc.innerRadius(r)
                            .outerRadius(outerR);
                    }
                    texts.call(transformLabels);
                    PieChartUtils.hideOverlappingLabels(wrappers[0], (facetData.pie || []).map(function(d) { return d.data.value; }), facetData.total);
                    drawHole();
                }, function (d, i) {
                    if (d.data.value === 0) return;
                    var boundingBox = this.getBoundingClientRect();
                    maxOverflow = Math.max(maxOverflow, svgBoundingBox.left - boundingBox.left, boundingBox.right - svgBoundingBox.right);
                });
        } else {
            drawHole();
        }


        //--------------- Draw arcs -----------------

        var noData = viz.selectAll('text.no-data').data([null]);
        noData.enter().append('text')
            .attr('class', 'no-data')
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'none')
            .style('font-size', '20px')
            .text('No data');


        newWrappers.append('path').attr('class', 'slice')
            .each(function (d) {
                this._current = d;
            })
            .attr("fill", function (d) {
                return chartBase.colorScale(d.data.color + d.data.measure);
            })
            .attr("opacity", chartDef.colorOptions.transparency)
            .each(function (d) {
                chartBase.tooltips.registerEl(this, {
                    measure: d.data.measure,
                    color: d.data.color,
                    animation: d.data.animation,
                    facet: d.data.facet
                }, 'fill');
            });

        var slices = wrappers.select('path.slice');

        function arcTween(a) {
            var i = d3.interpolate(this._current, a);
            this._current = i(0);
            return function (t) {
                return arc(i(t));
            };
        }

        if (facetData.total > 0) {
            wrappers
                .style('pointer-events', 'none')
                .transition()
                .attr('opacity', 1);

            slices
                .style('pointer-events', 'all')
                .transition()
                .attrTween('d', arcTween);
            noData.transition()
                .attr('opacity', 0);

        } else {
            noData.transition()
                .attr('opacity', 1);
            wrappers.exit()
                .style('pointer-events', 'none')
                .transition()
                .attr('opacity', 0);
        }

        drawHole();
    }
}

function PieChartUtils($filter) {
    var that = {
        prepareData: function (chartDef, chartData) {
            var colorLabels = chartData.getAxisLabels('color') || [null],
                facetLabels = chartData.getAxisLabels('facet') || [null],
                animationLabels = chartData.getAxisLabels('animation') || [null],
				pie = d3.layout.pie().value(function(d) { return d.value; });

            var animationData = {frames: []};
            animationLabels.forEach(function (animationLabel, a) {
                chartData.fixAxis('animation', a);

                var frameData = {facets: []};
                facetLabels.forEach(function (facetLabel, f) {
                    chartData.fixAxis('facet', f);

                    var facetData = {slices: [], total: 0};
                    colorLabels.forEach(function (colorLabel, c) {
                        chartData.fixAxis('color', c);

                        chartDef.genericMeasures.forEach(function (measure, m) {
                            var d = chartData.aggr(m).get();
                            if (d < 0) {
                                throw new ChartIAE("Cannot represent negative values on a pie chart. Please use another chart.");
                            }

                            facetData.slices.push({
                                color: c,
                                measure: m,
                                facet: f,
                                animation: a,
                                count: chartData.getCount(),
                                value: d
                            });

                            facetData.total += d;
                        });

                        if (facetData.total > 0) {
                            facetData.slices = $filter('orderBy')(facetData.slices, "value", true);
                            facetData.pie = pie(facetData.slices);
                        }
                    });
					frameData.facets.push(facetData);
                });
				animationData.frames.push(frameData);
            });

            return animationData;
        },

        hideOverlappingLabels: function(slices, values, total) {
            if (slices.length < 2) return;

            var displayedLabelSlices = [];
            var displayedLabelValues = [];
            slices.forEach(function(slice, i) {
                if ($(slice).find('text').css('display') !== 'none') {
                    var sliceValue =  values[i];
                    var nextSliceIndex = (i === slices.length-1) ? 0:i+1;
                    var nextSlice = slices[nextSliceIndex];
                    if (that.slicesOverlap(slice, nextSlice)) {
                        var nextSliceValue = values[nextSliceIndex];
                        var diff = (sliceValue >= nextSliceValue) ? sliceValue - nextSliceValue : nextSliceValue - sliceValue;
                        var diffAngle = 360*diff/total;
                        if (diffAngle < 5) {
                            $(slice).find('text').hide();
                            $(nextSlice).find('text').hide();
                        } else  {
                            var smallerSlice = (sliceValue > nextSliceValue) ? nextSlice :  slice;
                            $(smallerSlice).find('text').hide();
                            if (sliceValue > nextSliceValue) {
                                displayedLabelSlices.push(slice);
                                displayedLabelValues.push(sliceValue);
                            }
                        }
                    } else {
                        displayedLabelSlices.push(slice);
                        displayedLabelValues.push(sliceValue);
                    }
                }
            });
            if (slices.length !== displayedLabelSlices.length) {
                that.hideOverlappingLabels(displayedLabelSlices, displayedLabelValues);
            }
        },

        slicesOverlap: function(slice1, slice2) {
            //coordinates or first slice
            var top1 = $(slice1).find('text').offset().top;
            var left1 = $(slice1).find('text').offset().left;
            var bottom1 = top1 + $(slice1).find('text')[0].getBoundingClientRect().height;	//using getBoundingClientRect b/c jquery's height() function does not work on svg elements with FF
            var right1 = left1 + $(slice1).find('text')[0].getBoundingClientRect().width;
            //coordinates of second slice
            var top2 = $(slice2).find('text').offset().top;
            var left2 = $(slice2).find('text').offset().left;
            var bottom2 = top2 + $(slice2).find('text')[0].getBoundingClientRect().height;
            var right2 = left2 + $(slice2).find('text')[0].getBoundingClientRect().width;
            //Are slices overlapping horizontally ?
            var hOverlapping;
            if (left1 <= left2) {
                hOverlapping = right1 >= left2;
            } else {
                hOverlapping = right2 >= left1;
            }
            //Are slices overlapping vertically ?
            var vOverlapping;
            if (top1 <= top2) {
                vOverlapping = bottom1 >= top2;
            } else {
                vOverlapping = bottom2 >= top1;
            }
            //Overlapping is true if slices are overlapping horizontally and vertically
            return hOverlapping && vOverlapping;
        }
    };

    return that;
}


})();
