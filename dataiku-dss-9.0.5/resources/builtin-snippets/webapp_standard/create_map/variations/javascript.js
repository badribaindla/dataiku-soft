// Create a Map
// 10 is the initial zoom level, ranging from 1 (widest) to 19 (highest zoom)
var map = L.map('map').setView([47, 3], 5);

// Add a layer of tiles for the background. These tiles are provided by MapQuest.
var omq = new L.tileLayer(
	'http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
})

map.addLayer(omq);

// Usage examples:

// Add a non-clickable marker to the map:
var marker = L.marker([47, 3], { clickable : false });
map.addLayer(marker);

// Add a translucent circle with a popup on click
// The radius is expressed in meters
var marker = new L.circle([44, 5], 12000, {
  color: 'red',
  fillColor: 'red',
  fillOpacity: 0.9
  }).bindPopup("Name: <strong>South</strong>");
 marker.addTo(map);