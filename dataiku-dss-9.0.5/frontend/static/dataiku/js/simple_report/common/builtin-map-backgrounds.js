(function() {
    'use strict';

    /**
     * This file declares the builtin map backgrounds stored in window.dkuMapBackgrounds
     * Plugins can add their own map backgrounds with window.dkuMapBackgrounds.addCustom & addMapbox
     */

    window.dkuMapBackgrounds = {
        backgrounds: [
            {
                "id": "cartodb-positron",
                "name": "Black & White (light)",
                "getTileLayer": function () {
                    return new L.tileLayer(
                        'http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
                            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
                        })
                },
                "fadeColor": "#333"
            },
            {
                "id": "cartodb-dark",
                "name": "Black & White (dark)",
                "getTileLayer": function () {
                    return new L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
                        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
                    });
                },
                "fadeColor": "#EEE"
            }
        ],


        /*
         *   The following is used in plugins to add new map backgrounds, don't rename those methods
         */

        addCustom: function (background) {
            if (window.dkuMapBackgrounds.backgrounds.find(b => b.id === background.id)) {
                console.warn("Map background '" + background.id + "' already exists, it will be overriden."); /*@console*/  // NOSONAR: OK to use console.
                window.dkuMapBackgrounds.backgrounds = window.dkuMapBackgrounds.backgrounds.filter(b => b.id !== background.id);
            }
            window.dkuMapBackgrounds.backgrounds.push(background);
        },

        addMapbox: function (mapId, label, accessToken) {
            var name;
            if (!label) {
                name = mapId.split('.')[mapId.split('.').length - 1];
                name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
            } else {
                name = label;
            }

            window.dkuMapBackgrounds.addCustom({
                id: mapId,
                name: name,
                category: "Mapbox",
                getTileLayer: function () {
                    return L.tileLayer('https://api.mapbox.com/v4/' + mapId + '/{z}/{x}/{y}.png?access_token=' + accessToken, {
                        attribution: '© <a href="https://www.mapbox.com/feedback/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    });
                }
            });
        },

        addWMS: function (id, name, category, wmsURL, layerId) {
            window.dkuMapBackgrounds.addCustom({
                id: id,
                name: name,
                category: category,
                getTileLayer: function () {
                    return L.tileLayer.wms(wmsURL, {
                        layers: layerId
                    });
                }
            });
        }
    };
})();