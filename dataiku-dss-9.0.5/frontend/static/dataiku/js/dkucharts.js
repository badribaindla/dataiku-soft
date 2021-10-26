(function() {
'use strict';

	window.DKUCharts = {
		basicChart : function(width, height, margins) {
			if (margins == null) {
				margins = {top: 20, right: 20, bottom: 50, left: 50}
			}
			var chartWidth = width - margins.left - margins.right
			var chartHeight = height - margins.top - margins.bottom
			return {
				width : width - margins.left - margins.right,
				height : height - margins.top - margins.bottom,

				xscale : d3.scale.linear().range([0, chartWidth]),
				yscale : d3.scale.linear().range([chartHeight, 0]),

				makeTopG : function(sel) {
					return sel.style("width", width)
					.style("height", height)
					.append("g")
					.attr("transform", "translate(" + margins.left + "," + margins.top + ")");
				}
			}
		},


		drawGrid : function(g, xscale, yscale, width, height, lastY) {
			var xticks = xscale.ticks( )
			var lastX = xticks[xticks.length - 1]
			var yticks = yscale.ticks( )
			lastY = (lastY == null) ? yticks[yticks.length - 1] : lastY;

			g.append("g").attr("class", "vlines")
			.selectAll(".xline")
			.data(xticks)
			.enter().append("line")
			.attr("class", "xline")
			.attr("x1", function(d) {  return xscale(d)})
			.attr("x2", function(d) { return xscale(d)})
			.attr("y1", height)
			.attr("y2", yscale(lastY))
			.attr("stroke", "#cecece")
			.attr("opacity", 0.4);

			g.append("g").attr("class", "hlines")
			.selectAll(".hline")
			.data(yticks)
			.enter().append("line")
			.attr("class", "hline")
			.attr("y1", function(d) {  return yscale(d)})
			.attr("y2", function(d) { return yscale(d)})
			.attr("x1", 0)
			.attr("x2", xscale(lastX))
			.attr("stroke", "#cecece")
			.attr("opacity", 0.4);
		},

		nicePrecision : function(val, p) {
			if (val == undefined) return undefined;
			if (val < Math.pow(10, p)) {
				if (Math.round(val) == val) {
					/* Don't add stuff to integers */
					return val.toFixed(0);
				} else {
					return val.toPrecision(p);
				}
			} else {
				return val.toFixed(0);
			}
		}
	}

})();