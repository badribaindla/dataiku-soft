(function(){
'use strict';

const app = angular.module('dataiku.charts');


app.factory("_MapCharts", function(Assert, ChartViewCommon, ChartDimension, _ScatterCommon, ChartLabels, Logger, ChartLegendUtils, localStorageService, $state, $stateParams) {
    function getLSKey(elt) {
        let lsKey = 'DSSMapPosition.';
        const mapScope = angular.element(elt).scope();
        if ($state.current.name.startsWith('projects.project.datasets.dataset.visualize')) {
            lsKey += 'explore.' + $stateParams.projectKey + '.' + $stateParams.datasetName + '.' + mapScope.currentChart.index;
        } else if ($state.current.name.startsWith('projects.project.analyses.analysis')) {
            lsKey += 'analysis.' + $stateParams.projectKey + '.' + $stateParams.analysisId + '.' + mapScope.currentChart.index;
        } else if ($state.current.name.startsWith('projects.project.dashboards.insights.insight')) {
            lsKey += 'insight.' + $stateParams.projectKey + '.' + $stateParams.insightId;
        } else if ($state.current.name.startsWith('projects.project.dashboards.dashboard')) {
            lsKey += 'insight.' + $stateParams.projectKey + '.' + mapScope.insight.id;
        } else {
            lsKey += 'other.' + $state.current.name;
        }
        return lsKey;
    }

      var svc = {
        createMapIfNeeded : function(elt, chartSpecific, chartDef) {
            var map = elt.data("leaflet-map");

            if (!map) {
                Logger.info("Creating map");
                map = L.map(elt[0]).setView([20,0], 2);
                chartSpecific.leafletMap = map;
                elt.data("leaflet-map", map);
                map.$justCreated = true;
                function mapMoves() {
                    localStorageService.set(getLSKey(elt), {center: map.getCenter(), zoom: map.getZoom()});
                }
                map.on('zoomend', mapMoves);
                map.on('moveend', mapMoves);
            } else {
                map.$justCreated = false;
            }
            var prevLayerId = elt.data("leaflet-tile-layer-id");

            var layerId = "cartodb-positron";
            if (chartDef.mapOptions && chartDef.mapOptions.tilesLayer) {
                layerId = chartDef.mapOptions.tilesLayer;
            }
            var foundLayer = dkuMapBackgrounds.backgrounds.find(b => b.id === layerId);
            if (!foundLayer) {
                layerId = "cartodb-positron";
                foundLayer = dkuMapBackgrounds.backgrounds.find(b => b.id === layerId);
            }

            Logger.info("New layer", layerId, "Previous layer", prevLayerId);

            if (prevLayerId && layerId != prevLayerId) {
                Logger.info("Removing previous layer");;
                var prevLayer = elt.data("leaflet-tile-layer");
                map.removeLayer(prevLayer);
            }
            if (!prevLayerId || layerId != prevLayerId) {
                Logger.info("Adding layer");
                Assert.trueish(foundLayer, 'layer not found');
                var layer = foundLayer.getTileLayer();
                map.addLayer(layer);
                elt.data("leaflet-tile-layer-id", layerId);
                elt.data("leaflet-tile-layer", layer);
            }
            return map;
        },

        repositionMap : function(map, elt, data) {
            if (!elt.data("leaflet-map-positioned") && data.minLat > -90.0) {
                elt.data("leaflet-map-positioned", 1);
                const previousPosition = localStorageService.get(getLSKey(elt));
                if (previousPosition) {
                    map.setView(previousPosition.center, previousPosition.zoom);
                } else {
                    map.fitBounds([[data.minLat, data.minLon], [data.maxLat, data.maxLon]], {padding : [10,10]});
                }
            }
        },

        getOrCreateMapContainer: function($container) {
            var elt = $container.find('.map-container');
            if (!elt.length) {
                elt = $('<div class="map-container mainzone w100 h100">').appendTo($container);
            }
            return elt;
        },

        adjustLegendPlacement: function(chartDef, $container) {

            var margins = {top: 5, bottom: 5, left: 5, right: 5};

            // Avoid collision with leafleft controls
            switch (chartDef.legendPlacement) {
                case 'INNER_TOP_LEFT':
                    margins.top = 10;
                    margins.left = 45;
                    break;
                case 'INNER_BOTTOM_RIGHT':
                    margins.bottom = 20;
                    break;
            }

            return ChartLegendUtils.adjustLegendPlacement(chartDef, $container, margins);
        }
    };

    return svc;
});

app.controller("MapBackgroundPickerController", function($scope) {
   $scope.backgrounds = window.dkuMapBackgrounds.backgrounds;
    $scope.categories = {};
    window.dkuMapBackgrounds.backgrounds.forEach(function(background) {
        if (!$scope.categories[background.category]) {
            $scope.categories[background.category] = [background];
        } else {
            $scope.categories[background.category].push(background);
        }
    });
});

})();
