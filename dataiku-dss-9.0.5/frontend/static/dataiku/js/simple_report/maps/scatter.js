/* jshint loopfunc: true*/
(function(){
'use strict';

var app = angular.module('dataiku.charts')

app.factory("ScatterMapChart", function(ChartViewCommon, ChartUADimension, _MapCharts, ChartLabels, _ScatterCommon, ChartLegendUtils, ChartColorUtils) {
    return function($container, chartDef, data, chartHandler) {

        var elt = _MapCharts.getOrCreateMapContainer($container);

        var layerGroup, colorScale;

        // Build color scale
        var hasUAColor = _ScatterCommon.hasUAColor(chartDef);
        if (hasUAColor) {
            colorScale = _ScatterCommon.makeColorScale(chartDef, data, chartHandler);
        } else {
            var resultingColor = _ScatterCommon.makeSingleColor(chartDef);
        }

        // Build legend
        if (hasUAColor && (ChartUADimension.isAlphanumLike(chartDef.uaColor[0]) || ChartUADimension.isDiscreteDate(chartDef.uaColor[0]))) {
            var legend = {
                type : "COLOR_DISCRETE",
                items : []
            };

            var baseFadeColor = dkuMapBackgrounds.backgrounds.find(b => b.id === chartDef.mapOptions.tilesLayer).fadeColor || "#333";
            var fadeColor = ChartColorUtils.toRgba(baseFadeColor,.5*chartDef.colorOptions.transparency);

            data.values.color.str.sortedMapping.forEach(function(value, v) {
                legend.items.push({
                    label :  data.values.color.str.sortedMapping[v],
                    color: colorScale(v),
                    focusFn : function(){
                        layerGroup.getLayers().forEach(function(layer) {
                            var opts = layer.options;
                            if(!opts.actualFillColor) opts.actualFillColor = opts.fillColor;

                            if (opts.colorIdx !== v) {
                                opts.fillColor = fadeColor;
                            } else {
                                opts.fillColor = opts.actualFillColor;
                            }

                            layer.setStyle(opts);
                        });
                    },
                    unfocusFn : function(){
                        layerGroup.getLayers().forEach(function(layer) {
                            var opts = layer.options;
                            opts.fillColor = opts.actualFillColor;
                            layer.setStyle(opts);
                        });
                    },
                    focused : false
                });
            });

            chartHandler.legends.length = 0;
            chartHandler.legends.push(legend);
        } else {
            if (colorScale) {
                colorScale.type = 'MEASURE';
            }
            ChartLegendUtils.initLegend(chartDef, null, chartHandler, colorScale);
            if (colorScale) {
                if (ChartUADimension.isDateRange(chartDef.uaColor[0])) {
                    chartHandler.legends[0].formatter = function(d) { return d3.time.format('%Y-%m-%d')(new Date(d)); }
                } else {
                    chartHandler.legends[0].formatter = ChartViewCommon.createMeasureFormatter(chartDef.colorMeasure[0], colorScale.innerScale.domain(), 10);
                }
            }
        }

        // Draw legend, then map
        ChartLegendUtils.drawLegend(chartDef, chartHandler, $container).then(function() {
            _MapCharts.adjustLegendPlacement(chartDef, $container);

            var map = _MapCharts.createMapIfNeeded(elt, chartHandler.chartSpecific, chartDef);
            if (elt.data("leaflet-data-layer")) {
                map.removeLayer(elt.data("leaflet-data-layer"));
            }
            _MapCharts.repositionMap(map, elt, data);

            var hasUASize = _ScatterCommon.hasUASize(chartDef);
            if (hasUASize) {
                var sizeScale = _ScatterCommon.makeSizeScale(chartDef, data, 1);
            }

            var vf = ChartViewCommon.getMeasuresFormatter(chartDef);
            var uaLFn = ChartLabels.uaLabel;

            layerGroup = L.layerGroup();
            var colorCache = {};

            data.xAxis.num.data.forEach(function(x, i) {
                var y = data.yAxis.num.data[i];
                var r = _ScatterCommon.makeSize(chartDef, data, i, sizeScale);
                var c = _ScatterCommon.makeColor(chartDef, data, i, colorScale, resultingColor, colorCache);

                var options = {
                    radius : r,
                    fillOpacity: 1
                };

                // Used for the legend to highlight everything with the same color label
                if (ChartUADimension.isAlphanumLike(chartDef.uaColor[0]) || ChartUADimension.isDiscreteDate(chartDef.uaColor[0])) {
                    options.colorIdx = data.values.color.str.data[i];
                }

                if (chartDef.bubblesOptions.singleShape == "EMPTY_CIRCLE") {
                    options.stroke = true;
                    options.fill = false;
                    options.color = c;
                } else {
                    options.stroke = false;
                    options.fill = true;
                    options.fillColor = c;
                }

                // LatLng
                var pointLayer = L.circleMarker([y, x],options);

                if (!chartHandler.noTooltips) {

                    var html = "";
                    html += "Lon: <strong>" + vf(x) +"</strong><br />";
                    html += "Lat: <strong>" + vf(y) +"</strong><br />";
                    if (hasUAColor) {
                        html += uaLFn(chartDef.uaColor[0]) + ": <strong>" +
                            _ScatterCommon.formattedColorVal(chartDef, data, i) +"</strong><br />";
                    }
                    if (hasUASize && (!hasUAColor || (chartDef.uaSize[0].column !== chartDef.uaColor[0].column || chartDef.uaColor[0].dateMode !== 'RANGE'))) {
                        html += uaLFn(chartDef.uaSize[0]) + ": <strong>" +
                            _ScatterCommon.formattedSizeVal(chartDef, data, i) +"</strong><br />";
                    }

                    if (chartDef.uaTooltip.length > 0) {
                        html += "<hr/>";
                    }

                    chartDef.uaTooltip.forEach(function(ua, j) {
                        html += uaLFn(ua) + ": <strong>" + _ScatterCommon.formattedVal(chartDef, data.values["tooltip_" + j], ua, i) + "</strong><br/>";
                    });

                    pointLayer.bindPopup(html);
                }

                layerGroup.addLayer(pointLayer);
            });

            layerGroup.addTo(map);
            elt.data("leaflet-data-layer", layerGroup);
        }).finally(function(){
            // Signal to the callee handler that the chart has been loaded.
            // Dashboards use it to determine when all insights are completely loaded.
            if (typeof(chartHandler.loadedCallback) === 'function') {
                chartHandler.loadedCallback();
            }
        });
    }
});

app.factory("GridMapChart", function(ChartViewCommon, ChartUADimension, _MapCharts, ChartLabels, _ScatterCommon, ChartLegendUtils, ChartColorScales) {
    return function($container, chartDef, data, chartHandler) {

        var elt = _MapCharts.getOrCreateMapContainer($container);
        var map = _MapCharts.createMapIfNeeded(elt, chartHandler.chartSpecific, chartDef);
        if (elt.data("leaflet-data-layer")) {
            map.removeLayer(elt.data("leaflet-data-layer"));
        }
        _MapCharts.repositionMap(map, elt, data);

        // Build color scale
        var hasColor = chartDef.colorMeasure.length;
        var colorScale, resultingColor;
        if (hasColor) {
            colorScale = ChartColorScales.continuousColorScale(chartDef, data.aggregations.color.min, data.aggregations.color.max, data.aggregations.color.data);
            colorScale.type = 'MEASURE';
        } else {
            resultingColor = _ScatterCommon.makeSingleColor(chartDef);
        }

        ChartLegendUtils.initLegend(chartDef, null, chartHandler, colorScale);
        ChartLegendUtils.drawLegend(chartDef, chartHandler, $container).then(function () {
            _MapCharts.adjustLegendPlacement(chartDef, $container);

            var vf = ChartViewCommon.getMeasuresFormatter(chartDef);
            var ml = chartHandler.measureLabel;

            var layerGroup = L.layerGroup();

            data.cellMinLat.forEach(function (x, i) {
                var minLat = data.cellMinLat[i];
                var minLon = data.cellMinLon[i];
                var maxLat = minLat + data.gridLatDeg;
                var maxLon = minLon + data.gridLonDeg;

                var c = hasColor ? colorScale(data.aggregations.color.data[i]) : resultingColor;

                var rect = L.rectangle([[minLat, minLon], [maxLat, maxLon]], {
                    stroke: false,
                    fill: true,
                    fillColor: c,
                    fillOpacity: 1
                });

                if (!chartHandler.noTooltips) {
                    var html = "";
                    html += "Lon: <strong>" + vf(minLon + (maxLon - minLon) / 2) + "</strong><br />";
                    html += "Lat: <strong>" + vf(minLat + (maxLat - minLat) / 2) + "</strong><br />";
                    if (hasColor) {
                        html += ChartLabels.longMeasureLabel(chartDef.colorMeasure[0])
                            + ": <strong>" + vf(data.aggregations.color.data[i]) + "</strong>";
                    }
                    if (chartDef.tooltipMeasures.length > 0) {
                        html += "<hr/>"
                    }
                    chartDef.tooltipMeasures.forEach(function(measure, j) {
                        html += ml(measure) + ": <strong>" + vf(data.aggregations['tooltip_' + j].data[i]) + "</strong><br/>";
                    });
                    rect.bindPopup(html);
                }

                layerGroup.addLayer(rect);
            });
            layerGroup.addTo(map);

            elt.data("leaflet-data-layer", layerGroup);
        }).finally(function(){
            // Signal to the callee handler that the chart has been loaded.
            // Dashboards use it to determine when all insights are completely loaded.
            if (typeof(chartHandler.loadedCallback) === 'function') {
                chartHandler.loadedCallback();
            }
        });
    }
});


app.factory("DensityHeatMapChart", function(ChartViewCommon, ChartUADimension, _MapCharts, ChartLabels, _ScatterCommon, ChartLegendUtils, ChartColorScales) {
    return function($container, chartDef, data, chartHandler) {

        const elt = _MapCharts.getOrCreateMapContainer($container);
        // Handle the scatter map diverging color paletter after transition to density map
        chartHandler.legends.pop();
        chartDef.colorOptions.paletteType = "CONTINUOUS";

        ChartLegendUtils.drawLegend(chartDef, chartHandler, $container, ChartColorScales).then(function() {
            _MapCharts.adjustLegendPlacement(chartDef, $container);

            // Create leaflet layer
            let layerGroup = L.layerGroup();

            // Get map
            let map = _MapCharts.createMapIfNeeded(elt, chartHandler.chartSpecific, chartDef);
            _MapCharts.repositionMap(map, elt, data);

            // Remove the existing layer to avoid multiple layers
            if (elt.data("leaflet-data-layer")) {
                map.removeLayer(elt.data("leaflet-data-layer"));
            }


            // Remove the existing heatmap is there is one
            let existingHeatMapLayer;
            map.eachLayer(function(layer){
                if (layer.options && layer.options.id) {
                    if (layer.options.id === "heatmap"){
                        existingHeatMapLayer = layer;
                    }
                }
            })
            if (existingHeatMapLayer){
                map.removeLayer(existingHeatMapLayer)
            }

            // Get the gradient for leaflet heatmap
            let paletteId = chartDef.colorOptions.colorPalette;
            let chartSpec = {colorOptions: {colorPalette: paletteId, transparency: 1}};
            let scale = ChartColorScales.continuousColorScale(chartSpec, 0, 1);
            let gradient = {};
            for (let i=0; i <= 9; i++) {
                gradient[i/10] = scale(i/10);
            }

            let vf = ChartViewCommon.getMeasuresFormatter(chartDef);
            let uaLFn = ChartLabels.uaLabel;
            let hasUAColor = false;

            // Intermediate operation for the scale computation in the scatter plot
            const makeIntensityScale = function(chartDef, data) {
                if (ChartUADimension.isTrueNumerical(chartDef.uaSize[0])) {
                    return d3.scale.sqrt().range([1, 100])
                        .domain([data.values.size.num.min, data.values.size.num.max]);
                } else if (ChartUADimension.isDateRange(chartDef.uaSize[0])) {
                    return d3.scale.sqrt().range([1, 100])
                        .domain([data.values.size.ts.min, data.values.size.ts.max]);
                } else {
                    throw new ChartIAE("Cannot use ALPHANUM as size scale");
                }
            }

            // If a column is given as a size in the front bar, create the helper function to get the right weight
            const hasUASize = _ScatterCommon.hasUASize(chartDef);
            let intensityScale;
            let getScaleWeight;
            if (hasUASize) {
                intensityScale = makeIntensityScale(chartDef, data);
                getScaleWeight = function(chartDef, data, i, sizeScale){
                    if (chartDef.uaSize.length) {
                        let sizeValue;
                        if (ChartUADimension.isTrueNumerical(chartDef.uaSize[0])) {
                            sizeValue = data.values.size.num.data[i];
                        } else if (ChartUADimension.isDateRange(chartDef.uaSize[0])) {
                            sizeValue = data.values.size.ts.data[i];
                        }
                        return sizeScale(sizeValue);
                    } else {
                        return 1;
                    }
                };
            }

            // Tuning values for the visual parameters
            const intensityRangeMultiplier = 1000;
            const radiusRangeMultiplier = 40;

            // Create the core data that will be displayed by Leaflet.heat
            let geopoints = [];
            data.xAxis.num.data.forEach(function(x, i) {
                let y = data.yAxis.num.data[i];
                let r;
                if (hasUASize){
                    r = getScaleWeight(chartDef, data, i, intensityScale);
                } else {
                    r = 1;
                }
                geopoints.push([y, x, r*chartDef.colorOptions.heatDensityMapIntensity*intensityRangeMultiplier]);
            });

            // Create the heatmap and add it as a layer
            let heatMapLayer = L.heatLayer(geopoints, {radius: chartDef.colorOptions.heatDensityMapRadius*radiusRangeMultiplier, id: "heatmap", gradient: gradient});
            heatMapLayer.addTo(map);

            // Options of the Leaflet CircleMarker
            let options = {
                stroke: false,
                color: "rgb(0,0,0)",
                opacity: 1,
                fill: false,
                fillColor: "rgb(255,0,0)",
                fillOpacity: 1,
                radius : 5,
            };

            // Create tooltip
            data.xAxis.num.data.forEach(function(x, i) {

                let y = data.yAxis.num.data[i];

                let pointLayer = L.circleMarker([y, x], options);

                let html = "";
                html += "Lon: <strong>" + vf(x) +"</strong><br />";
                html += "Lat: <strong>" + vf(y) +"</strong><br />";

                if (hasUASize && (!hasUAColor || (chartDef.uaSize[0].column !== chartDef.uaColor[0].column || chartDef.uaColor[0].dateMode !== 'RANGE'))) {
                    html += uaLFn(chartDef.uaSize[0]) + ": <strong>" +
                        _ScatterCommon.formattedSizeVal(chartDef, data, i) +"</strong><br />";
                }
                if (chartDef.uaTooltip.length > 0) {
                    html += "<hr/>";
                }
                chartDef.uaTooltip.forEach(function(ua, j) {
                    html += uaLFn(ua) + ": <strong>" + _ScatterCommon.formattedVal(chartDef, data.values["tooltip_" + j], ua, i) + "</strong><br/>";
                });

                pointLayer.bindPopup(html);
                pointLayer.on('mouseover', function (e) {
                    this.setStyle({
                        stroke: true,
                        fill: true
                    });
                    this.openPopup();
                });
                pointLayer.on('mouseout', function (e) {
                    this.setStyle({
                        stroke: false,
                        fill: false
                    });
                    this.closePopup();
                });
                layerGroup.addLayer(pointLayer);
            });

            // Add layer to map
            layerGroup.addTo(map);
            elt.data("leaflet-data-layer", layerGroup);

        }).finally(function(){
            // Signal to the callee handler that the chart has been loaded.
            // Dashboards use it to determine when all insights are completely loaded.
            if (typeof(chartHandler.loadedCallback) === 'function') {
                chartHandler.loadedCallback();
            }
        });
    }
});

})();
