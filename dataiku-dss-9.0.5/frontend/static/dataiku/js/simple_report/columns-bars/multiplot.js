(function(){
'use strict';

    const app = angular.module('dataiku.charts');


    app.factory('MultiplotChart', function(ChartViewCommon, ChartTensorDataWrapper, GroupedColumnsDrawer, GroupedColumnsUtils, LinesDrawer, LinesUtils, ChartDataUtils) {
        return function ($container, chartDef, chartHandler, axesDef, data) {

            var chartData = ChartTensorDataWrapper(data, axesDef),
                facetLabels = chartData.getAxisLabels('facet') || [null], // We'll through the next loop only once if the chart is not facetted
                yExtents = ChartDataUtils.getMeasureExtents(chartDef, data),
                y1Domain = yExtents.y1.extent,
                y2Domain = yExtents.y2.extent;

            var columnsData = GroupedColumnsUtils.prepareData(chartDef, chartData, function(measure) { return measure.displayType === 'column'; }),
                linesData = LinesUtils.prepareData(chartDef, chartData, function(measure) { return measure.displayType === 'line'; });

            var drawFrame = function (frameIdx, chartBase) {
                chartData.fixAxis('animation', frameIdx);
                facetLabels.forEach(function (facetLabel, f) {
                    var g = d3.select(chartBase.$svgs.eq(f).find('g.chart').get(0));
                    GroupedColumnsDrawer(g, chartDef, chartHandler, chartData.fixAxis('facet', f), chartBase, columnsData);
                    LinesDrawer(g, chartDef, chartData.fixAxis('facet', f), chartBase, linesData, f);
                });
            };

            ChartViewCommon.initChart(chartDef, chartHandler, chartData, $container, drawFrame,
                {type: 'DIMENSION', mode:'COLUMNS', dimension: chartDef.genericDimension0[0], name: 'x'},
                {type: 'MEASURE', domain: y1Domain},
                {type: 'MEASURE', domain: y2Domain},
                {type: 'DIMENSION', name: 'color'}
            );
        }
    });
})();
