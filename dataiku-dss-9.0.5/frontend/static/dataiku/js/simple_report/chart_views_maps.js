(function(){
'use strict';


const app = angular.module('dataiku.charts')
    .factory("AggrFilledMap", function(ChartViewCommon, ChartColorScales) {
        return function(elt, chartDef, data, chartHandler) {

            var map = elt.data("leaflet-map");

            if (!map) {
                map = L.map(elt.find(".map-container")[0]).setView([20,0], 2)
                //map.fitWorld();
                //.setView([47, 3], 5);
                // Add an OpenStreetMap(c) based background
                var omq = new L.TileLayer(
                    'http://otile2.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', {
                    maxZoom: 18,
                    attribution: '<a href="http://osm.org/">OpenStreetMap</a> and <a href="http://open.mapquest.com/">MapQuest</a>',
                    opacity: 0.9
                });
                map.addLayer(omq);
                chartHandler.chartSpecific.leafletMap = map;
                elt.data("leaflet-map", map);
            }

            if (elt.data("leaflet-data-layer")) {
                map.removeLayer(elt.data("leaflet-data-layer"));
            }

            if (!elt.data("leaflet-map-positioned") && data.minLat > -90.0) {
                elt.data("leaflet-map-positioned", 1);
                map.fitBounds([
                    [data.minLat, data.minLon],
                    [data.maxLat, data.maxLon]
                ], {padding : [10,10]} );
            }

            var geo = JSON.parse(data.geoJson);

            var aggrVals = function(aggregId) {
                var feat, featIdx, arr = [];
                for (featIdx in geo.features) {
                    feat = geo.features[featIdx];
                    if (feat.properties[aggregId]) {
                        arr.push(feat.properties[aggregId]);
                    }
                }
                return arr;
            }
            var aggrBounds = function(aggregId) {
                var arr = aggrVals(aggregId);
                return [d3.min(arr),  d3.max(arr)]
            }

            var colorScale = ChartColorScales.continuousColorScale(chartDef,aggrBounds("color")[0], aggrBounds("color")[1]);
            var sizeScale = d3.scale.sqrt().range([2, 20]).domain(aggrBounds("size"));

//            aggregationBoundaries(colorMeasure));
                //return d3.scale.linear().range(['#f6f8fb', '#00003c']).interpolate(d3.interpolateLab).

            var valuesFormatterLong = ChartViewCommon.getMeasuresFormatter(chartDef, true);

            //var colorScale = d3.scale.log().range(['#9999CC', '#0000AA'])
              //          .interpolate(d3.interpolateLab).domain(aggrBounds("a_0"));

                function onEachFeature(feature, layer) {
                    var html = "<h4>" + feature.properties.label+"</h4>";

                    if (feature.properties.color) {
                        html += chartHandler.measureLabel(chartDef.typedMeasures.mapColor[0]);
                        html += ": <strong>";
                        html += valuesFormatterLong(feature.properties.color) +"</strong><br />";

                    }
                    if (feature.properties.size) {
                        html += (chartHandler.measureLabel(chartDef.typedMeasures.mapSize[0]));
                        html += ": <strong>";
                        html += valuesFormatterLong(feature.properties.size) +"</strong><br />";
                    }
                    if (feature.properties.count !== undefined) {
                        html += "Value count" + ": <strong>";
                        html += valuesFormatterLong(feature.properties.count ) +"</strong><br />";
                    }

                    layer.bindPopup(html);
                }
            if (chartDef.filledMap) {
                var myStyle = function(feature) {
                    return {
                        "color": colorScale(feature.properties["color"]),
                        "fillColor": colorScale(feature.properties["color"]),
                        "fillOpacity" : 0.9,
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
                        var size = feature.properties["size"] ? sizeScale(feature.properties["size"]) : 16;
                        return L.circleMarker(latlng, {
                            radius : size,
                            "color": colorScale(feature.properties["color"]),
                            "fillColor": colorScale(feature.properties["color"]),
                            "opacity" : 0.85,
                            "fillOpacity" : 0.85
                        })
                    },
                    onEachFeature : onEachFeature
                });
                 map.addLayer(layer);
            }

            elt.data("leaflet-data-layer", layer)
            return;
        }
    });

})();
