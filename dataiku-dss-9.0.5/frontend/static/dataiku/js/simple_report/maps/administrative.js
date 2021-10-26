(function(){
'use strict';

var app = angular.module('dataiku.charts')

app.factory("AdministrativeMap", function(ChartViewCommon, ChartDimension, _MapCharts, ChartLegendUtils, ChartColorUtils, ChartColorScales) {
    return function($container, chartDef, data, chartHandler) {

        var elt = _MapCharts.getOrCreateMapContainer($container);
        var geo = JSON.parse(data.geoJson);

        var aggrVals = function (aggregId) {
            var feat, featIdx, arr = [];
            for (featIdx in geo.features) {
                feat = geo.features[featIdx];
                if (feat.properties[aggregId]) {
                    arr.push(feat.properties[aggregId]);
                }
            }
            return arr;
        };

        var aggrBounds = function (aggregId) {
            var arr = aggrVals(aggregId);
            return [d3.min(arr), d3.max(arr)]
        };

        var colorScale, singleColor;
        if (chartDef.colorMeasure.length) {
            colorScale = ChartColorScales.continuousColorScale(chartDef, aggrBounds("color")[0], aggrBounds("color")[1], aggrVals("color"), false);
            colorScale.type = 'MEASURE';
        } else {
            singleColor = ChartColorUtils.toRgba(chartDef.colorOptions.singleColor, chartDef.colorOptions.transparency);
        }

        ChartLegendUtils.initLegend(chartDef, null, chartHandler, colorScale);
        ChartLegendUtils.drawLegend(chartDef, chartHandler, $container).then(function () {

            _MapCharts.adjustLegendPlacement(chartDef, $container);

            var map = _MapCharts.createMapIfNeeded(elt, chartHandler.chartSpecific, chartDef);
            if (elt.data("leaflet-data-layer")) {
                map.removeLayer(elt.data("leaflet-data-layer"));
            }
            _MapCharts.repositionMap(map, elt, data);

            var sizeScale = d3.scale.sqrt().range([chartDef.bubblesOptions.defaultRadius, chartDef.bubblesOptions.defaultRadius*5]).domain(aggrBounds("size"));
            var valuesFormatterLong = ChartViewCommon.getMeasuresFormatter(chartDef, true);
            //var colorScale = d3.scale.log().range(['#9999CC', '#0000AA'])
            //          .interpolate(d3.interpolateLab).domain(aggrBounds("a_0"));

            var ml = chartHandler.measureLabel;
            function onEachFeature(feature, layer) {
                if (chartHandler.noTooltips) return;

                var html = "<h4>" + feature.properties.label+"</h4>";

                if (feature.properties.color) {
                    html += ml(chartDef.colorMeasure[0]);
                    html += ": <strong>";
                    html += valuesFormatterLong(feature.properties.color) +"</strong><br />";

                }
                if (feature.properties.size) {
                    html += ml(chartDef.sizeMeasure[0]);
                    html += ": <strong>";
                    html += valuesFormatterLong(feature.properties.size) +"</strong><br />";
                }
                if (feature.properties.count !== undefined) {
                    html += "Value count" + ": <strong>";
                    html += valuesFormatterLong(feature.properties.count ) +"</strong><br />";
                }

                if (chartDef.tooltipMeasures.length > 0) {
                    html += "<hr/>"
                }
                chartDef.tooltipMeasures.forEach(function(measure, j) {
                    html += ml(measure) + ": <strong>" + valuesFormatterLong(feature.properties[j]) + "</strong><br/>";
                });

                layer.bindPopup(html);
            }
            if (chartDef.variant == "filled_map") {
                chartDef.sizeMeasure = [];
                var myStyle = function(feature) {
                    return {
                        "color": singleColor || colorScale(feature.properties["color"]),
                        "fillColor": singleColor || colorScale(feature.properties["color"]),
                        "fillOpacity" : chartDef.fillOpacity,
                        "weight": 1,
                        "opacity": 1,
                    }
                };
                var layer = L.geoJson(geo.features, {
                    style: myStyle,
                    onEachFeature : onEachFeature
                });
                map.addLayer(layer);
            } else {
                var layer = L.geoJson(geo.features, {
                    pointToLayer : function(feature, latlng) {
                        var size = feature.properties["size"] != null ? sizeScale(feature.properties["size"]) : chartDef.bubblesOptions.defaultRadius;
                        var color = singleColor || (feature.properties["color"] != null ? colorScale(feature.properties["color"]) : "#666");

                        return L.circleMarker(latlng, {
                            radius : size,
                            "color": color,
                            "fillColor": color,
                            "opacity" : 0.85,
                            "fillOpacity" : 0.85
                        })
                    },
                    onEachFeature : onEachFeature
                });
                map.addLayer(layer);
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
