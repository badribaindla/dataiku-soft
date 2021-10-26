/* jshint loopfunc: true*/
(function(){
    'use strict';

    var app = angular.module('dataiku.charts')

    app.factory("GeometryMapChart", function(ChartViewCommon, ChartDimension, _MapCharts, ChartLegendUtils, ChartColorUtils, _ScatterCommon, ChartLabels, ChartUADimension, $timeout) {
        return function($container, chartDef, data, chartHandler) {

            var elt = _MapCharts.getOrCreateMapContainer($container);
            var geo = JSON.parse(data.geoJson);
            var colorScale, singleColor, layer;
            var colorCache = {};

            // Build color scale
            var hasUAColor = _ScatterCommon.hasUAColor(chartDef);
            if (hasUAColor) {
                colorScale = _ScatterCommon.makeColorScale(chartDef, data, chartHandler);
            } else {
                singleColor = _ScatterCommon.makeSingleColor(chartDef);
            }

            // Build legend. Can we make some of this common with other UA color scales ?
            if (hasUAColor && (ChartUADimension.isAlphanumLike(chartDef.uaColor[0]) || ChartUADimension.isDiscreteDate(chartDef.uaColor[0]))) {
                var legend = {
                    type : "COLOR_DISCRETE",
                    items : []
                };

                var baseFadeColor = dkuMapBackgrounds.backgrounds.find(b => b.id === chartDef.mapOptions.tilesLayer).fadeColor || "#333";
                var fadeColor = ChartColorUtils.toRgba(baseFadeColor,.5*chartDef.colorOptions.transparency);

                data.values.color.str.sortedMapping.forEach(function(value, v) {
                    var item = {
                        label :  data.values.color.str.sortedMapping[v],
                        color: colorScale(v),
                        focusFn : function(){
                            layer.setStyle(function(feature) {
                                if (data.values.color.str.data[feature.properties.idx] === v) {
                                    return {color: item.color, opacity: 1, weight: chartDef.strokeWidth};
                                } else {
                                    return {color: fadeColor, opacity: 1, weight: chartDef.strokeWidth};
                                }
                            })
                        },
                        unfocusFn : function(){
                            layer.setStyle(function(feature) {
                                var c = singleColor || _ScatterCommon.makeColor(chartDef, data, feature.properties.idx, colorScale, singleColor, colorCache);
                                return { color: c, opacity: 1, weight: chartDef.strokeWidth};
                            });
                        },
                        focused : false
                    };
                    legend.items.push(item);
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

            ChartLegendUtils.drawLegend(chartDef, chartHandler, $container).then(function () {

                _MapCharts.adjustLegendPlacement(chartDef, $container);

                var map = _MapCharts.createMapIfNeeded(elt, chartHandler.chartSpecific, chartDef);
                if (elt.data("leaflet-data-layer")) {
                    map.removeLayer(elt.data("leaflet-data-layer"));
                }
                _MapCharts.repositionMap(map, elt, data);

                function onEachFeature(feature, layer) {
                    if (chartHandler.noTooltips) return;

                    var html = "";

                    if (hasUAColor) {
                        html += ChartLabels.uaLabel(chartDef.uaColor[0]) + ": <strong>" + _ScatterCommon.formattedColorVal(chartDef, data, feature.properties.idx) +"</strong><br />";
                    }

                    chartDef.uaTooltip.forEach(function(ua, j) {
                        html += ChartLabels.uaLabel(ua) + ": <strong>" + _ScatterCommon.formattedVal(chartDef, data.values["tooltip_" + j], ua, feature.properties.idx) + "</strong><br/>";
                    });

                    if (html.length) {
                        layer.bindPopup(html);
                    }
                }


                layer = L.geoJson(geo.features, {
                    style: function (feature) {
                        var c = singleColor || _ScatterCommon.makeColor(chartDef, data, feature.properties.idx, colorScale, singleColor, colorCache);
                        return { color: c, opacity: 1, weight: chartDef.strokeWidth, fillOpacity: chartDef.fillOpacity };
                    },
                    onEachFeature : onEachFeature,
                    pointToLayer: function (feature, latlng) {
                        var c = singleColor || _ScatterCommon.makeColor(chartDef, data, feature.properties.idx, colorScale, singleColor, colorCache);

                        var geojsonMarkerOptions = {
                            radius: 5,
                            fillColor: c,
                            color: c,
                            weight: chartDef.strokeWidth,
                            opacity: 1,
                            fillOpacity: 1
                        };

                        return L.circleMarker(latlng, geojsonMarkerOptions);
                    }
                });
                map.addLayer(layer);

                if (map.$justCreated) {
                    $timeout(function() {
                        map.fitBounds(layer);
                    });
                }

                elt.data("leaflet-data-layer", layer);
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
