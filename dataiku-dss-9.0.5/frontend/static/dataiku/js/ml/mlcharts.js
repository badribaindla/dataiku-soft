(function(){
'use strict';

var app = angular.module('dataiku.ml.core');

app.factory("MLChartsCommon", function() {

    function linspace(start, end, n) {
        if (n === 1) {
            return [start];
        }
        return Array.from(Array(n), (_, i) => start + (i * (end - start)) / (n - 1));
    }

    // TODO: replace trimTrailingZeros with '~' based formatter when updating d3js version to 5+ (e.g. d3.format(".4~g"))
    // From https://github.com/d3/d3-format/blob/v2.0.0/src/formatTrim.js (incorporated in d3 in version 5)
    function trimTrailingZeros(s) {
        out: for (var n = s.length, i = 1, i0 = -1, i1; i < n; ++i) {
            switch (s[i]) {
                case '.':
                    i0 = i1 = i;
                    break;
                case '0':
                    if (i0 === 0) i0 = i;
                    i1 = i;
                    break;
                default:
                    if (!+s[i]) break out;
                    if (i0 > 0) i0 = 0;
                    break;
            }
        }
        return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
    }

    /**
     * Returns a numeric formatter function in exponent notation, with maximum `fractionDigits` after the decimal point
     * @param {number} fractionDigits : Maximum number of digits after the decimal point (integer)
     */
    function exponentFormat(fractionDigits) {
        return (_) => trimTrailingZeros(d3.format(`.${fractionDigits}e`)(_));
    }

    /**
     * Returns a numeric formatter function in fixed point notation, with maximum `fractionDigits` after the decimal point
     * @param {number} fractionDigits : Maximum number of digits after the decimal point (integer)
     */
    function fixedPointFormat(fractionDigits) {
        return (_) => trimTrailingZeros(d3.format(`.${fractionDigits}f`)(_));
    }

    /**
     * Returns a numeric formatter function in decimal notation, rounded to `significantDigits` significant digits
     * @param {number} significantDigits : Maximum number of significant digits (integer)
     */
    function decimalRoundedFormat(significantDigits) {
        return (_) => trimTrailingZeros(d3.format(`.${significantDigits}r`)(_));
    }

    /**
     * Returns a numeric formatter function, mostly useful for axes.
     * It behaves in the following way:
     *  - For extreme values higher than 10**(exponentThreshold) or lower than 10**(-exponentThreshold) we use the exponent
     *    notation with exponentFractionDigits digits after the decimal point
     *  - Otherwise we use fixed point notation and make sure that our formatter is precise enough by computing the order of
     *    magnitude of the difference between min and max values, and adapting the precision of the formatter accordingly
     * @param {number} min : Minimum value in the data
     * @param {number} max : Maximum value in the data
     * @param {number} exponentThreshold : Order of magnitude at which we switch to exponent notation
     * @param {number} exponentFractionDigits : Maximum number of digits after the decimal point in exponent notation (integer)
     */
    function makeAxisNumericFormatter(min, max, exponentThreshold, exponentFractionDigits) {
        const absoluteMin = Math.min(Math.abs(min), Math.abs(max));
        const absoluteMax = Math.max(Math.abs(min), Math.abs(max));
        if ((absoluteMin !== 0 && absoluteMin <= 10 ** -exponentThreshold) || absoluteMax >= 10 ** exponentThreshold) {
            return exponentFormat(exponentFractionDigits);
        } else {
            // Here we compute the difference of max and min, NOT absoluteMax and absoluteMin
            // because we are formatting an axis and only care about extreme values of the axis
            // range.
            const differenceOrderOfMagnitude = Math.floor(Math.log10(max - min));
            if (differenceOrderOfMagnitude < 0) {
                return fixedPointFormat(-differenceOrderOfMagnitude + 1);
            } else {
                return fixedPointFormat(Math.max(0, -Math.floor(Math.log10(absoluteMin))));
            }
        }
    }

    return {
        // Helper to install the redraw event on window resize, reflow event, and install the unregisterer
        installRedrawListener : function installRedrawListener(scope, redrawFn) {
            $(window).on('resize', redrawFn);
            scope.$on('$destroy', function() {
                $(window).off('resize', redrawFn);
            });
            scope.$on('reflow',redrawFn);
            scope.$on('resize',redrawFn);
        },
        /**
         * Callback maker for areas on multiLineChart.
         * @param computeAreas (scope) => Array of area series
         *     [{color: string, values: [{x, y0, y1}, ...][, yScale: d3 scale]}, ...]
         *     if yScale is not specified, the chart's yScale is used
         */
        makeSvgAreaCallback: function makeSvgAreaCallback(computeAreas) {
            return function svgAreaCallback(svg, scope) {
                const areas = computeAreas(scope);
                const area = (xScale, yScale) =>
                    d3.svg.area()
                        .x (_ => xScale(_.x))
                        .y0(_ => yScale(_.y0))
                        .y1(_ => yScale(_.y1));
                if (svg.select('.tubes').empty()) {
                    svg.append('g').attr('class', 'tubes').attr('transform',
                        `translate(${scope.margin.left}, ${scope.margin.top + 20})`);
                }

                const areaFn = _ => area(scope.chart.xScale(), _.yScale || scope.chart.yScale())(_.values),
                    paths = svg.select('.tubes').selectAll('path').data(areas);
                paths.transition().duration(scope.chart.duration()).attr('d', areaFn);
                paths.enter().append("path").attr('d', areaFn).attr('fill', _ => _.color);
                paths.exit().remove();

                function setAreaOpacity(fadeDelay){
                    let disabled = [];
                    svg.selectAll('.nv-legend .nv-series')
                        .each(function(_, i) { disabled[i] = this.classList.contains('nv-disabled'); });
                    let paths_ = svg.select('.tubes').selectAll('path');
                    if (fadeDelay) {
                        paths_ = paths_.transition().duration(fadeDelay);
                    }
                    paths_.attr('style', (_, i) => `opacity: ${disabled[i] ? '0' : '.3'}`);
                }
                setAreaOpacity(0);

                // must come after stateChange switched .nv-disabled
                scope.chart.dispatch.on('stateChange.tubes', function (e) {
                    // can't use e.disabled, bugged on data update: http://stackoverflow.com/questions/23015095
                    setTimeout(setAreaOpacity.bind(null, 100), 100);
                });
            }
        },
        /**
         * Builds a color scale legend
         * @param {d3 selection} svg : d3 selection where the color legend is to be drawn
         * @param {number} width : Width of the color bar
         * @param {number} height : Height of the color bar
         * @param {Object} margins : Object containing top, right, bottom, left margins, in pixels
         * @param {nTicks} nTicks : Number of ticks to be drawn on the legend
         * @param {Array} colorScaleArray : Array containing the hex codes of the colors to be used
         * @param {number} minValue : Minimum value of the scale
         * @param {number} maxValue : Maximum value of the scale
         * @param {boolean} isLog : true if scale is logarithmic, false otherwise
         * @param {string} label : legend label
         * @param {boolean} hideLabel : boolean to hide the color scale label
         */
        makeColorScale: function (svg, width, height, margins, nTicks, colorScaleArray, minValue, maxValue, isLog, label, hideLabel) {
            let numericFormat = makeAxisNumericFormatter(minValue, maxValue, 2, 1);

            if (isLog) {
                minValue = Math.log10(minValue);
                maxValue = Math.log10(maxValue);
            }

            svg = svg.append('g').attr('transform', `translate(${margins.left}, ${margins.top})`);
            // Fill color scale legend
            // append gradient bar
            let gradientUUID = window.crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
            let gradient = svg
                .append('defs')
                .append('linearGradient')
                .attr('id', `gradient-${gradientUUID}`)
                .attr('x1', '0%') // bottom
                .attr('y1', '100%')
                .attr('x2', '0%') // to top
                .attr('y2', '0%')
                .attr('spreadMethod', 'pad');

            // programatically generate the gradient for the legend
            // this creates an array of [pct, colour] pairs as stop
            // values for legend
            let pct = linspace(0, 100, colorScaleArray.length).map(function (d) {
                return Math.round(d) + '%';
            });

            let colourPct = d3.zip(pct, colorScaleArray);

            colourPct.forEach(function (d) {
                gradient.append('stop').attr('offset', d[0]).attr('stop-color', d[1]).attr('stop-opacity', 1);
            });

            svg.append('rect')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('width', width)
                .attr('height', height)
                .style('fill', `url(#gradient-${gradientUUID})`);

            // create a scale and axis for the legend
            var scale = d3.scale.linear().domain([minValue, maxValue]).range([height, 0]);

            let axis = d3.svg.axis().scale(scale).orient('right').ticks(nTicks).tickSize(width);
            if (isLog) {
                axis.tickFormat((_) => numericFormat(10 ** _));
            } else {
                axis.tickFormat(numericFormat);
            }

            svg.append('g').call(axis).selectAll('line').style('fill', 'none').style('stroke', 'black');

            if (!hideLabel) {
                svg.append('g')
                    .attr(
                        'transform',
                        `translate(-5, ${0.2 * height})`
                    )
                    .append('text')
                    .style('text-anchor', 'middle')
                    .style('font-weight', 'bold')
                    .attr('transform', 'rotate(-90)')
                    .text(isLog ? `${label} (log)` : label);
            }

            svg.select('.domain').remove();
        },
        /**
         * Returns a numeric formatter function, mostly useful for tooltips.
         * @param {number} exponentThreshold : Order of magnitude at which we switch to exponent notation
         * @param {number} precision : Precision (either number of digits after decimal point for exponent
         *                             notation, or significant digits for decimal notation) (integer)
         */
        makeTooltipNumericFormatter: function(exponentThreshold, precision){
            return function (value) {
                const absValue = Math.abs(value);
                if ((absValue !== 0 && absValue <= 10 ** -exponentThreshold) || absValue >= 10 ** exponentThreshold) {
                    return exponentFormat(precision)(value);
                } else {
                    return decimalRoundedFormat(precision + 1)(value);
                }
            }
        },
        linspace: linspace,
        trimTrailingZeros: trimTrailingZeros,
        decimalRoundedFormat: decimalRoundedFormat,
        exponentFormat: exponentFormat,
        fixedPointFormat: fixedPointFormat,
        makeAxisNumericFormatter: makeAxisNumericFormatter
    };
});

/* Register a ML chart directive with standard setup.
 * Includes: No-Op on empty data, defered + debounced redraw, resize/reflow listener.
 * Note: `watcher` & `draw` are $injected, may have `scope` & `element` arguments.
 *       `watcher` can ask new & old `watch`ed values with `newValue` & `oldValue` args/$inject.
 */
function chartDirective(name, scopeDef, watch, watcher, draw, ext, destroy) {
    app.directive(name, function ($timeout, $injector, MLChartsCommon, Debounce) {
        return angular.extend({ restrict: 'A', scope: scopeDef, link: function(scope, element, attrs, ctrl) {
            var locals = { scope: scope, element: element, attrs: attrs, ctrl: ctrl },
                locals2 = angular.extend({}, locals),
                redrawLater = Debounce().withDelay(100,100).wrap($timeout.bind(app, function() {
                    if (scope.theData) {
                        $injector.invoke(draw, this, locals);
                        // Signal that the content of the element has been loaded and is thus available for content extraction (for Model Document Generator)
                        const loadedStateField = scope.loadedStateField ? scope.loadedStateField : "puppeteerHook_elementContentLoaded";
                        console.info("Marking chart as loaded using " + loadedStateField + " scope field");
                        scope[loadedStateField] = true;
                        if (scope.$parent) {
                            scope.$parent[loadedStateField] = true;
                        }
                    }
                }, 10));
            function addWatcher(w) {
                scope.$watch(w, function (newValue, oldValue) {
                    if (!newValue) { return; }
                    locals2.newValue = newValue;
                    locals2.oldValue = oldValue;
                    scope.theData = $injector.invoke(watcher, this, locals2);
                    redrawLater();
                }, true);
            }
            if ($.isArray(watch)) {
                for (var i=0;i<watch.length;i++) {
                    addWatcher(watch[i]);
                }
            } else {
                addWatcher(watch);
            }
            MLChartsCommon.installRedrawListener(scope, redrawLater);
            if (typeof destroy === "function") {
                scope.$on('$destroy', destroy);
            }
        } }, ext || {});
    });
}

// prefixes: bc = binary classification, r = regression

/** 
 * Vertical or horizontal bar chart
 * Accept as data either an array of tuple2 [[k, v], ...] for ordered data,
 *      or an object {k: v} for unordered data.
 * `colors` can be replaced with a `color` attribute for constant color.
 */
chartDirective('discreteBarChart',
    { 
        data: '=', 
        colors: '=', 
        format: '@', 
        horizontal: '=?',
        loadedStateField: "=?", disableTransitions: "=?"
    }, 
    "data",
    function(scope, attrs, Fn) {
        const LABELS_MIN_WIDTH = 10;
        const LABELS_MAX_WIDTH = 200;
        const LABELS_MARGIN = 8;
        const isHorizontal = !!scope.horizontal;
        const color = attrs.color;
        const useKey = !Array.isArray(scope.colors);
        const data = (Array.isArray(scope.data) ? scope.data : obj2arr(scope.data)).map((k, i) => {
            return { 
                value: k[1], 
                label: k[0],
                color: color || scope.colors[useKey || typeof k === 'number' ? k : i] 
            }; 
        });

        scope.settings = angular.extend({ maxLabel: 30 }, scope.$eval(attrs.discreteBarChart) || {});
        scope.maxLength = Math.min(scope.settings.maxLabel,
            Math.max.apply(Math, data.map(Fn(Fn.prop('label'), Fn.prop('length')))));

        scope.margins = {};

        if (isHorizontal) {            
            scope.margins.top = 0;
            scope.margins.bottom = 20; 
            const longestLabelWidth = Math.max(...data.map(d => getTextWidth(d.label)));
            scope.margins.left = Math.max(LABELS_MIN_WIDTH, Math.min(LABELS_MAX_WIDTH, longestLabelWidth)) + LABELS_MARGIN;
        } else {
            scope.margins.top = 10;
            scope.margins.bottom = 30; 
            scope.margins.left = 50;
        }

        return [{ values: data }];
    }, function(scope, element, attrs, ctrl, Fn) {
        const width = element.width();
        const height = element.height();
        const isHorizontal = !!scope.horizontal;
        const chart = nv.models[isHorizontal ? 'multiBarHorizontalChart' : 'discreteBarChart']()
            .height(height)
            .width(width)
            .margin(scope.margins)
            .x(Fn.prop('label'))
            .y(Fn.prop('value'))
            .color(Fn.prop('color'))
            .showValues(true);
        const fmt = d3.format(scope.format);
        const svg = d3.select(element.get(0));

        let transitionDuration = 500;
        if (scope.disableTransitions) {
            console.info("Disabling chart transitions");
            chart.duration(0);
            transitionDuration = 0;
        }

        chart.tooltip.enabled(false);

        if (chart.staggerLabels) { chart.staggerLabels(false); }

        chart.valueFormat(fmt);
        chart.yAxis.tickFormat(fmt);

        if (scope.settings.scale) { chart.forceY(scope.settings.scale); }

        svg.datum(scope.theData).transition().duration(transitionDuration).call(chart);

        if ('svgTitles' in attrs && scope.maxLength >= scope.settings.maxLabel) {
            svg.selectAll('.nv-axis.nv-' + (isHorizontal ? 'x' : 'y') + ' .tick text')[0].forEach((text) => {
                var elt = d3.select(text), t = elt.text();
                if (t.length > scope.settings.maxLabel) {
                    elt.attr('data-title', sanitize(t));
                    elt.text(t.substr(0, scope.settings.maxLabel - 2) + '\u2026');
                }
            });
            ctrl.update();
        }

        if (isHorizontal) { // hack to get the wanted color
            svg.selectAll('.nv-bar rect').each(function(d, i) {
                d3.select(this).style("fill", d.color); 
            });
        }
    }, { require: '?svgTitles' });


/*
function chartDirective(name, scopeDef, watch, watcher, draw, ext, destroy) {

    
*/
chartDirective('predictionBarChart',
    { data: '=', colors: '=', threshold: '=?'  }, "data",
    function(scope, attrs, Fn) {
        return scope.data.map((d, i) => ({
            key: d.name,
            values: [{
                x: '',
                y: d.value * 100,
                color: d.color
            }]
        }));
    }, function(scope, element, $filter, $timeout) {
        const width = element.width();
        const height = element.height();
        const margin = 200;
        const tickFormat = d3.format('d');
        const chart = nv.models['multiBarHorizontalChart']()
                .height(height)
                .width(width - margin)
                .forceY([0,1])
                .showLegend(false)
                .showControls(false)
                .showValues(true)
                .groupSpacing(0.4); // for height of bar
        const svg = d3.select(element.get(0)).attr('class', 'prediction-chart');
        svg.select(".prediction-chart__legend").remove();
        svg.select(".prediction-chart__threshold").remove();
        d3.selectAll(".nvtooltip").remove();

        chart.yAxis.tickFormat(tickFormat);
        chart.yAxis.ticks(6, 'd');

        chart.tooltip.enabled(true);
        chart.multibar.stacked(true);

        // create custom legend
        const RECT_SIZE = 16;
        const RECT_SPACING = 24;
        const legend = svg.append('g')
            .attr('class', 'prediction-chart__legend')
            .attr('transform', `translate(${width - margin + 20}, ${height - margin})`)  
        // generate legend marker
        legend.selectAll('rect')
            .data(scope.theData)
            .enter()
            .append('rect')
            .attr('width', RECT_SIZE)
            .attr('height', RECT_SIZE)
            .attr('y', (d, i) => {
                return i * RECT_SPACING;
            })
            .style('fill', function(d) { 
                return d.values[0].color;
            });

        // add legend text
        const legendText = legend.selectAll('text')
            .data(scope.theData)
            .enter()
            .append('text')
            .attr('class', 'prediction-chart__legend-label')
            .attr('dx', RECT_SPACING)
            .attr('dy', (d, i) => {
                return i * RECT_SPACING + RECT_SPACING / 2;
            });
        // to allow a mix of bold and normal text
        legendText.append('tspan')
            .attr('style', 'font-weight: 500;')
            .text(function(d) {
                return $filter("gentleTruncate")(d.key, 30) + ' - ';
            });
        legendText.append('tspan')
            .text(function(d) {
                return formatPercentage(d.values[0].y)
            });
        // for hovering in case of truncated text
        legendText.append('title')
            .text(function(d) {
                return d.key;
            });

        chart.tooltip.contentGenerator(selection => {
            return `
                <div class="prediction-chart__tooltip">
                    ${sanitize(selection.data.key)} - ${sanitize(formatPercentage(selection.data.y))}
                </div>
            `;
        });

        svg.datum(scope.theData).transition().duration(500).call(chart);

        // draw threshold line if it exists
        if (typeof scope.threshold !== 'undefined') {
            // ensure bar is visible before adding threshold line
            $timeout(() => {
                const barHeight = d3.select('.nv-bar rect').node().getBoundingClientRect().height;
                const THRESHOLD_MARGIN = 20;
                const thresholdPercentage = scope.threshold * 100;

                svg.append('rect')
                    .attr('class', 'prediction-chart__threshold')
                    .attr('x', chart.margin().left + chart.yAxis.scale()(thresholdPercentage))
                    .attr('y', chart.margin().top + chart.xAxis.scale()('') - THRESHOLD_MARGIN / 2)
                    .attr('width', 1)
                    .attr('height', barHeight + THRESHOLD_MARGIN);
            });

            legend.append('line')
                .attr('class', 'prediction-chart__legend-threshold')
                .attr('x1', RECT_SIZE / 2)
                .attr('x2', RECT_SIZE / 2)
                .attr('y1', -RECT_SIZE / 2)
                .attr('y2', -RECT_SIZE - RECT_SIZE / 2);
            legend.append('text')
                .attr('class', 'prediction-chart__legend-label')
                .attr('dx', RECT_SPACING)
                .attr('dy', (d, i) => {
                    return -RECT_SPACING / 2;
                })
                .text('Threshold - ' + d3.format(".1f")(scope.threshold*100) + '%');
        }
        
        svg.selectAll('.nv-group rect').each(function(d) {
            d3.select(this).style("fill", d.color); 
        });

        function formatPercentage(value) {
            return d3.format(".2f")(value) + '%';
        }
    });

/* Draw a multi grouped horizontal bar chart with a horizontal bar chart next to it. Both has the same size. 
   Each group of the first one is the same size than one group in the second one.
   - `chart1Data`: the main data to build the multi bar chart, has to be like: 
    [
        {
            "key": "Class 1",
            "color": "#d67777",
            "values": [
            { 
                "label" : "Modality A" ,
                "value" : -1.8746444827653
            } ...
            ]
        },
        {
            "key": "Class 2",
            "color": "#4f99b4",
            "values": [
            { 
                "label" : "Modality A" ,
                "value" : 25.307646510375
            } ...
        } ...
    ]
    - `chart2Data`: the data to built the distribution chart, has to be like `chart1Data` but with a length of one
    - `chart1SvgId`: the id of the svg element in the HTML where you want the multi bar chart
    - `chart2SvgId`: the id of the svg element in the HTML where you want the simple bar chart
    - `chart1Title`: the title of the first chart
    - `chart2Title`: the title of the second chart
*/
chartDirective('multiGroupedHBarChartWithHBarChart',
    { chart1Data: '=', chart2Data: '=', chart1SvgId: '=', chart2SvgId: '=', chart1Title: '=', chart2Title: '=' }, "chart1Data",
    function(scope) {
        return scope.chart1Data;
    }, function(scope) {
        d3.selectAll(".nvtooltip").remove(); // bug of nvd3, tooltip stays
        const nbOfGroups = scope.chart1Data[0].values.length;
        const groupSpacing = 0.2;
        const fmt = d3.format(".3n");
        const defaultMarginTop = 50;
        const marginBottom = 50;
        const chart2Svg = d3.select(`#${scope.chart2SvgId}`);
        const chart2Format = d3.format(",.1%");

        const mainChart = nv.models.multiBarHorizontalChart()
                .groupSpacing(groupSpacing)
                .x(d => d.label)
                .y(d => d.value)
                .margin({ top: scope.legendHeight || defaultMarginTop, right: 20, bottom: marginBottom, left: 175 })
                .showValues(false)
                .showControls(false)
                .valueFormat(fmt);
        mainChart.yAxis.tickFormat(fmt);
        mainChart.yAxis.axisLabel(scope.chart1Title);

        const svg = d3.select(`#${scope.chart1SvgId}`);
        if (scope.height) {
           mainChart.height(scope.height);
        }

        svg.datum(scope.chart1Data).transition().call(mainChart).each("end", () => {
            scope.legendHeight = mainChart.legend.height();
            mainChart.margin({ top: scope.legendHeight });
            mainChart.update();
            buildHBarChart(scope.chart2Title , chart2Svg, scope.chart2Data, scope.height, scope.legendHeight, chart2Format);
            const maxHeight = parseInt(svg.style("height").split("px")[0]);
            const height = scope.height || maxHeight;
            translateTicksVertically(svg, height - marginBottom - scope.legendHeight, nbOfGroups, groupSpacing);

            // Watch legend change, if new class has been (de)selected
            mainChart.dispatch.on("stateChange", function(e) {
                const numberSelectedClasses = e.disabled.filter(d => !d).length;
                scope.height = numberSelectedClasses * nbOfGroups * 15 + 400;
                translateTicksVertically(svg, scope.height - scope.legendHeight - marginBottom, nbOfGroups, groupSpacing);
                mainChart.height(scope.height);
                mainChart.update();
                buildHBarChart(scope.chart2Title, chart2Svg, scope.chart2Data, scope.height, scope.legendHeight, chart2Format);
            });
        });
    }
)

function translateTicksVertically(svg, innerChartHeight, nbOfGroup, groupSpacing) {
    const spaceSize = (innerChartHeight * groupSpacing) / nbOfGroup;
    const groupSize = (innerChartHeight * (1 - groupSpacing)) / nbOfGroup;
    const yTranslation = (spaceSize + groupSize) / 2;
    svg.selectAll(".tick line").attr("transform", "translate(0, " + yTranslation + ")");
}

function buildHBarChart(title, svg, data, height, marginTop, format) {
    const chart = nv.models.multiBarHorizontalChart()
                .groupSpacing(0.2)
                .margin({ top: marginTop, bottom: 50, left: 5 })
                .showValues(true)
                .x((d) => d.label)
                .y(d => d.value)
                .showXAxis(false)
                .showLegend(false)
                .showControls(false);
    if (height) {
        chart.height(height);
    }

    chart.yAxis.axisLabel(title);
    chart.yAxis.tickFormat(format);
    chart.tooltip.enabled(false);
    chart.valueFormat(format);

    svg.datum(data).transition().duration(500).call(chart);
}

/* Draw a multi lines chart (on the left axis) with a vertical bar chart (on the right axis)
   - `data`: the data used to draw the lines and the bar chart
    [
        {
            "key": "Class 1",
            "color": "#d67777",
            "type": "line",
            "values": [
                [x1, y2],
                [x2, y2]
            ]
        },{
            "key": "Distribution",
            "color": "#D5D9D9",
            "type": "bar",
            "values": [
                [x1, y2],
                [x2, y2]
            ]
        }(...)
    ]
    - `xlabel`: the label of the x axis
    - `y1Label`: the label of the left axis
    - `y2Label`: the label of the right axis
    - `isDate`: boolean - are the x values dates ?
*/
chartDirective('multiLinesWithBarChart',
    { data: '=', xlabel: "=", isDate: '=' , y1Label: '=', y2Label: '='}, "data",
    function(scope) {
        return scope.data;
    }, function(scope, element) {
        d3.selectAll(".nvtooltip").remove(); // bug of nvd3, tooltip stays
        const svg = d3.select(element.get(0))
        const distanceBetweenXTicks = scope.data[0].values[1][0] - scope.data[0].values[0][0];
        const chart = nv.models.multiChart()
            .margin({ top: 0, right: 50, bottom: 100, left: 100 })
            .x(d => d[0])
            .y(d => d[1])
            .height(svg.style.height)
        const yAxis1Fmt = d3.format('.3n');
        const yAxis2Fmt = d3.format(".1%");
        
        //The chart changes its internal id every time data is reloaded. 
        // This breaks the tooltips in Firefox (but not in Chrome for some reason).
        // Need to lock it down.
        chart.bars2.id(scope.xlabel.replace(/\W+/, '-'));

        chart.tooltip.contentGenerator(data => {
            let yvalue, xvalue = data.value;
            const color = data.series[0].color;
            const key = data.series[0].key;
            if (data.point) { // data from a point of a line
                xvalue = formatFloat(scope.isDate, xvalue)
                yvalue = yAxis1Fmt(data.series[0].value)
            } else { // data from a bar
                xvalue = "[{0}, {1})".format(formatFloat(scope.isDate, xvalue), formatFloat(scope.isDate, xvalue + distanceBetweenXTicks))
                yvalue = yAxis2Fmt(data.series[0].value);
            }
            return tooltipHTML(xvalue, color, key, yvalue);
        });
        chart.bars2.groupSpacing(0);
        chart.legendRightAxisHint("");
        
        chart.xAxis.axisLabel(scope.xlabel || "Values")
                    .showMaxMin(false)
                    .axisLabelDistance(40)
                    .tickFormat(d => formatFloat(scope.isDate, d));

        if (scope.isDate) {
            chart.xAxis.rotateLabels(-45);
        }

        chart.yAxis1.axisLabel(scope.y1Label)
                    .tickFormat(yAxis1Fmt)
                    .showMaxMin(false)
                    .axisLabelDistance(40);
        
        chart.yAxis2.axisLabel(scope.y2Label)
                    .tickFormat(yAxis2Fmt)
                    .showMaxMin(true)
                    .tickValues([0]);

        svg.datum(scope.data)
            .transition()
            .duration(500)
            .call(chart).each("end", () => {
                chart.margin({ top: chart.legend.height() });
                chart.update();
            });
});

function formatFloat(isDate, d) {
    if (isDate) {
        return d3.time.format("%Y-%m-%d %H:%M")(new Date(d));
    } else {
        return d3.format('.3n')(d); 
    }
}

function tooltipHTML(xvalue, color, key, yvalue) {
    return `
    <table>
        <thead>
            <tr>
                <td colspan="3">
                    <strong class="x-value">${xvalue}</strong>
                </td>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="legend-color-guide">
                    <div style="background-color:${color}"></div>
                </td>
                <td class="key">${key}</td>
                <td class="value">${yvalue}</td>
            </tr>
        </tbody>
    </table>`
}


/** Generic multi-line plot, possibly with second y-axis and x-markers.
 * ys*      Array(N) of primary value series
 * ys2*     Array(M) of secondary value series. Keep M <= 1 to avoid confusion
 *          (right axis is labelled with the first y2 color).
 * x or xs* Array(N + M) (if xs) of abscissa series, or a single series (if x).
 * xMarks   Array(P) of x values to mark
 * xMarkLabelPosition   String ('top' | 'bottom') containing position of x-mark label
 * xTicks   Array(Q) of x values to tick on x axis
 * labels*  Array(N + M) of label for curves.
 * colors*  Array(N + M [+ P]) of colors for curves and markers.
 * formats* String or Array(1-4) of format strings (x, [y1, [y2, y2 values in tooltip]]])
 *          single string = same for all, array < 4 = each one falls back to the previous
 * options  Object of Array(N+M) of objects: line options, will be added as-is
 *          single object = same for all lines
 * axes     Array (1-3) of axis labels (x, [y1, [y2]])
 * scale    Array([y1min, y1max]) for a linear Y scale to force
 * scale2   Array([y2min, y2max]) same for right axis
 * callback Function(svg, scope) to be called after (re)drawing
 **/
chartDirective('multiLineChart',
    { ys: '=', x: '=?', xs: '=?', labels: '=', colors: '=', format: '=',
        ys2: '=?', xMarks: '=?', xMarkLabelPosition: '=?', xTicks: '=?', options: '=?', axes: '=?',
        scale: '=?', scale2: '=?', xScale: '=?', callback: '=?', disableInteractiveLayer: '=?', hideLegend: "=?",
        loadedStateField: "=?", disableTransitions: "=?", disableInteractiveGuideline: "=?"},
    '[ys, ys2, axes, xScale]',
    function(scope, attrs, Fn) {
        if (scope.x && scope.x.length) { scope.xs = [scope.x]; }
        if (!scope.xs || !scope.xs.length || !scope.ys || !scope.ys.length
            || !scope.labels || !scope.labels.length) { return null; }
        scope.scale = scope.scale || // fatten ys = [[y1], [y2], ...]
            (function(_) { return [d3.min(_),d3.max(_)]; })([].concat.apply([], scope.ys));
        if (scope.ys2 && scope.ys2.length && scope.ys2[0] && scope.ys2[0].length) {
            var y2 = [].concat.apply([], scope.ys2), scale2;
            scope.ys2.scale = scale2 = d3.scale.linear().range(scope.scale)
                .domain(scope.scale2 || [Math.min.apply(null, y2), Math.max.apply(null, y2)]);
        }
        if (scope.xScale == null) {
            scope.xScale = d3.scale.linear().domain(function(_) { return [d3.min(_),d3.max(_)]; }([].concat.apply([], scope.xs)));
        }
        scope.callback = typeof scope.callback === 'function' ? scope.callback : Fn.NOOP;
        return scope.ys.concat(scope.ys2 || []).map(function(ys, i){
            var t = i < scope.ys.length ? Fn.SELF : scale2;
            return angular.extend({
                    key: scope.labels[i],
                    values: ys.map(function(y, j) {
                        return { x: scope.xs[i % scope.xs.length][j], y: t(y) }; }),
                    color: scope.colors[i]
                }, !this ? {} : Array.isArray(this) ? this[i] : this);
        }, scope.options);
    },
    function(scope, element, Fn) {
        var width = element.width(),
            height = element.height(),
            scale2 = scope.ys2 && scope.ys2.scale.copy(),
            margin = {top: 10, right: scale2 ? 80 : 20, bottom: 60, left: 70},
            cw = width - margin.left - margin.right,
            ch = height - margin.top - margin.bottom - (scope.hideLegend ? 0 : 20),
            axes = (Array.isArray(scope.axes) ? scope.axes : []).concat(['', '', '']),
            fmts = (Array.isArray(scope.format) ? scope.format : [scope.format]),
            chart = nv.models.lineChart() .margin(margin),
            elt = element.get(0),
            par = elt.parentElement,
            svg = d3.select(elt);
        // cleanup
        chart.useInteractiveGuideline(!scope.disableInteractiveGuideline);
        chart.interactiveLayer.tooltip.enabled(!scope.disableInteractiveLayer);
        chart.interactiveLayer.showGuideLine(!scope.disableInteractiveLayer);
        chart.showLegend(!scope.hideLegend);
        svg.select(".secondary-axis").remove();
        svg.selectAll(".x.mark").remove();

        fmts = fmts.map(_ => typeof _ === 'function' ? _ : d3.format(_));
        chart.forceY(scope.scale);
        if (scope.disableTransitions) {
            console.info("Disabling chart transitions");
            chart.duration(0);
        }
        chart.forceX(scope.xScale.domain());    // force chart X domain
        chart.xDomain(scope.xScale.domain());   // force-preserve X domain down the line
        chart.xScale(scope.xScale.copy().range([0, cw]));
        chart.xAxis.axisLabel(axes[0]) .tickFormat(fmts[0]);
        chart.yAxis.axisLabel(axes[1]) .tickFormat(fmts[1 % fmts.length]);
        if (scope.xTicks) {
            chart.xAxis.tickValues(scope.xTicks);
        }
        svg.datum(scope.theData).call(chart);

        // y2 (different scale normalized on the first, axis displayed on the right)
        if (scale2) {
            // display a second y axis
            var format2 = fmts.length > 2 ? fmts[2] : chart.yAxis.tickFormat();
            svg.select(".nv-lineChart").append("g").attr("class", "y axis secondary-axis")
                .style("fill", scope.colors[scope.ys.length])
                .attr("transform", "translate(" + cw + ", 0)")
                .call(d3.svg.axis().scale(scale2.range([ch, 0])).tickFormat(format2).orient("right"));
            if (axes.length > 2) {
                svg.select(".secondary-axis").append("text").text(axes[2]).attr("text-anchor", "middle")
                    .attr("x", 0 - ch / 2).attr("y", 60).attr("transform", "rotate(-90)");
            }
            // hack the tooltip to adjust the scale of the ys2 series, using a non-replaceable formatter
            var tt = chart.interactiveLayer.tooltip, vf = tt.valueFormatter();
            scale2 = scope.ys2.scale.copy().range(scale2.domain()).domain(scope.scale);
            if (fmts.length > 3) {
                format2 = fmts[3];
            }
            tt.valueFormatter(function(y, i) {
                return i < scope.ys.length ? vf(y, i) : format2(scale2(y)); });
            tt.valueFormatter = function(_) { if (_) { vf = _; return tt; } return vf; };
        }

        // Vertical markers
        (scope.xMarks || []).filter(Fn.unique()).forEach(function (xMark, i) {
            scope.xMarkLabelPosition = scope.xMarkLabelPosition || 'bottom';
            const xMarkColor = scope.colors[scope.theData.length + i];
            const xMarkG = svg.select(".nv-lineChart").append("g").attr("class", "x mark")
                    .attr("transform", "translate(" + chart.xScale()(xMark) + ", 0)");
            const xMarkLabelXOffset = scope.xMarkLabelPosition === 'bottom' ? 0 : 4;
            const xMarkLabelYOffset = (scope.xMarkLabelPosition === 'bottom' ? ch : 0) + 16;
            const textAnchor = scope.xMarkLabelPosition === 'bottom' ? 'middle' : 'start';

            xMarkG.append("path").attr('d', "M0,0 V" + ch)
                .attr('stroke-width', 1).attr('stroke', xMarkColor).attr('stroke-dasharray', '5,3');
            xMarkG.append("text").attr('x', xMarkLabelXOffset).attr('y', xMarkLabelYOffset).attr("text-anchor", textAnchor)
                .attr('fill', xMarkColor).text(chart.xAxis.tickFormat()(xMark));
        });

        // Fix horizontal position bug when SVG's parent has position: relative
        var parStyle = window.getComputedStyle(par);
        if (parStyle.position === 'relative' && !par.querySelector('style.nvTooltipFix')) {
            var st = document.createElement('style');
            if (!par.id) { par.id = chart.interactiveLayer.tooltip.id() + 'p'; }
            st.innerHTML = ['#', par.id, ' .nvtooltip { margin-left: -', par.offsetLeft, 'px; }'].join('');
            par.insertBefore(st, null);
        }

        scope.callback(svg, angular.extend(scope, {chart: chart, margin: margin, axisHeight:ch}));
    });


chartDirective('distributionChart', { data: '=', xMarks: '=?', colors: '=', xFormat: '@?', yFormat: '@?' , axes: '=?'}, "data",
    function(scope, element, Fn) { return {
        xScale: d3.scale.linear().domain([scope.data[0].min, scope.data[scope.data.length - 1].max]),
        yScale: d3.scale.linear().domain([0, d3.max(scope.data, Fn.prop('count'))]).nice()
    }; }, function (scope, element, Fn) {
        var margin = {top: 20, right: 20, bottom: 40, left: 40}, gap = 6,
            w = element.width() - margin.left - margin.right,
            h = element.height() - margin.top - margin.bottom,
            xs = scope.theData.xScale.range([margin.left, w + margin.left]),
            ys = scope.theData.yScale.range([h + margin.top, margin.top]),
            bw = xs(scope.data[0].max) - xs(scope.data[0].min),     y0 = ys(0),
            xFormat = scope.xFormat ? d3.format(scope.xFormat) : scope.theData.xScale.tickFormat(),
            yFormat = scope.yFormat ? d3.format(scope.yFormat) : scope.theData.yScale.tickFormat(),
            xAxis = d3.svg.axis().scale(xs).orient('bottom').tickFormat(xFormat)
                    .tickValues([0, scope.data[0].min].concat(scope.data.map(Fn.prop('max')))),
            yAxis = d3.svg.axis().scale(ys).orient('left').tickFormat(yFormat)
                    .tickValues(ys.ticks(10)).tickSize(w),
            svg = d3.select(element.get(0)).html('');
        
        if (scope.axes) {

            // Increase margins to let space for axis labels
            margin.left += 5;
            margin.bottom += 5;

            let xAxisLabel = scope.axes[0];
            svg.append('g').attr('class', 'x-axis-labels')
               .append('text')
               .style("font-size", "13px")
               .attr('text-anchor', "middle")
               .attr('x', margin.left + w / 2)
               .attr('y', 35 + h + margin.top)
               .text(xAxisLabel);
            
            let yAxisLabel = scope.axes[1];
            svg.append('g').attr('class', 'y-axis-labels')
                .append('text')
                .attr("transform", "rotate(-90, 12, " + (margin.top + h / 2) + ")")
                .attr('text-anchor', "middle")
                .style("font-size", "13px")
                .attr('x', 12)
                .attr('y', margin.top + h / 2)
                .text(yAxisLabel);
        }

        
        svg .append('g').attr('class', 'x axis')
            .attr('transform', 'translate(0, ' + (h + margin.top) + ')').call(xAxis);
        svg .append('g').attr('class', 'y axis')
            .attr('transform', 'translate(' + (w + margin.left) + ', 0)').call(yAxis)
            .select('.domain').attr('d', 'M-' + w + ',' + margin.top + 'v' + h);
        svg.append('g').attr('class', 'bars') //.transition().duration(500)
            .selectAll('.bar').data(scope.data).enter().append('rect').attr('class', 'bar')
                .attr('x', function(d) { return xs(d.min) + gap / 2; }) .attr('width', bw - gap)
                .attr('y', Fn(Fn.prop('count'), ys))
                .attr('height', function(d) { return y0 - ys(d.count); })
                .attr('fill', scope.colors[0]);
        svg.append('g').attr('class', 'labels')
            .selectAll('.label').data(scope.data).enter().append('text').attr('class', 'label')
                .attr('x', Fn(Fn.prop('min'), xs)) .attr('dx', bw / 2)
                .attr('y', Fn(Fn.prop('count'), ys)) .attr('dy', -6)
                .attr('text-anchor', 'middle') .text(Fn(Fn.prop('count'), yFormat));
        svg.append('g').attr('class', 'marks')
            .selectAll('.mark').data((scope.xMarks || []).filter(Fn.unique())).enter().append('path')
                .attr('class', 'mark').attr('stroke', Fn.from(scope.colors.slice(1), 1))
                .attr('stroke-dasharray', '5,3')
                .attr('d', function(d) { return ['M', xs(0), ',', margin.top, 'v', h].join(''); })
    });


chartDirective('bcPerBinLiftChart', { data: "=", loadedStateField: "=?", disableTransitions: "=?" }, "data",
    function(scope, element) {
        return [{
            key: "Per-bin lift chart",
            values: scope.data.bins.map(function(p) { return { x: p.percentile_idx + 1, y: p.bin_lift }; })
        }];
    }, function (scope, element, Fn) {
        var width = element.width(),
            height = element.height(),
            margin = {top: 10, right: 20, bottom: 60, left: 70},
            max = Math.ceil(d3.max(scope.theData[0].values, Fn.prop('y'))),
            chart = nv.models.discreteBarChart()
                .width(width) .height(height) .margin(margin)
                .color(function(d) { return d.y > 1 ? 'steelblue' : 'lightblue' })
                .showValues(true) .staggerLabels(false)
                .forceY([0, max]),
            svg = d3.select(element.get(0)).html('');

        chart.tooltip.enabled(false);
        chart.xAxis.axisLabel("Observations by decreasing probability decile") ;
        chart.yAxis.axisLabel("Lift on bin") ;
        let transitionDuration = 500;
        if (scope.disableTransitions) {
            console.info("Disabling chart transitions");
            chart.duration(0);
            transitionDuration = 0;
        }
        svg.datum(scope.theData).transition().duration(transitionDuration).call(chart);
        var heightOfOne = chart.yAxis.scale()(1);
        svg.append('g').attr('class','liftmedline').append('path') // Median line
            .attr('d', ['M', margin.left, ',', heightOfOne + margin.top, ' H', width - margin.right].join(''))
            .style("stroke", "LightCoral").style("stroke-width", "2").style("stroke-dasharray", "3");
    });


chartDirective('bcPerBinProbaDistribChart', 
    {data: "=", bins: "=", threshold: "=", modelClasses: "=", colors: "="},
    "data",
    function(scope) {
        return {"probaDistribs": scope.data.probaDistribs.map((probaDistrib, i) => {
                                    return {
                                        key: "actual " + scope.modelClasses[i], 
                                        values: probaDistrib.map(d => ({value: d})),
                                        color: scope.colors[i]
                                    }
                                 }), 
                 "bins": scope.data.bins, 
                 "threshold": scope.threshold
                }
    },
    function(scope, element) {
        let width = element.width(),
            height = element.height(),
            margin = {top: 25, right: 20, bottom: 40, left: 60},
            max = scope.theData.probaDistribs.reduce((acc, curr) => Math.max(acc, curr.values.reduce((acc2, curr2) => Math.max(acc2, curr2.value), 0)), 0);

        let chart = nv.models.multiBarChart()
                             .width(width)
                             .height(height)
                             .margin(margin)
                             .x((_, i) => {
                                 return ((scope.theData.bins[i] + scope.theData.bins[i + 1]) / 2).toFixed(2);
                             })
                             .y((d) => d.value)
                             .staggerLabels(false)
                             .showControls(false)
                             .forceY([0, max]);
        
        let svg = d3.select(element.get(0)).html('');
        
        
        chart.xAxis.axisLabel("Predicted probability");
        chart.yAxis.axisLabel("# of rows");

        chart.tooltip.contentGenerator( function(data) {
            var index = data.index;
            return [
                        "<p><strong>" + data.data.key + "</strong></p>",
                        "<p>Predicted probability: " + scope.theData.bins[index] + " - " + scope.theData.bins[index + 1] + "</p>",
                        "<p># of rows: " + data.data.value
                   ].join('');
        });
        chart.options({tooltip: {chartContainer: document.body }});


        svg.datum(scope.theData.probaDistribs).transition().duration(500).call(chart);

        let chartHeight = height - margin.top - margin.bottom,
            chartWidth = width - margin.left - margin.right;
        let xScale = d3.scale.linear().domain([scope.theData.bins[0], scope.theData.bins[scope.theData.bins.length - 1]])
                                      .range([0, chartWidth]);
        var thresholdMarkColor = "#9467bd";
        var thresholdMarkG = svg.select(".nv-multibar").append("g").attr("class", "threshold mark")
                .attr("transform", "translate(" + xScale(scope.theData.threshold) + ", 0)");
        thresholdMarkG.append("path").attr('d', "M0,0 V" + chartHeight)
            .attr('stroke-width', 1).attr('stroke', thresholdMarkColor).attr('stroke-dasharray', '5,3');    
        thresholdMarkG.append("text")
                      .attr("x", 0)
                      .attr("y", chartHeight + 15)
                      .attr("text-anchor", "middle")
                      .text(scope.theData.threshold.toFixed(2))
                      .attr("fill", thresholdMarkColor);
        }
);


app.directive('bcGainChart', function (Fn) { return {
    priority: 10, // before multi-line-chart
    scope: false,
    link: function(scope, elt, attrs) { scope.$watch(attrs.data, function(data) {
        if (!data) return;

        var ys = data.folds && data.folds.length ? data.folds : [data.bins];
        function remap(y) { return [0].concat(y.map(this)); }
        scope.xs = ys.map(remap, Fn.prop('cum_size'));
        scope.ys = ys.map(remap, Fn.prop('cum_lift'));

        // wizard: linear until 1, precise break point appended to avoid linear interpolation
        var wizSlope = data.wizard.total / data.wizard.positives,
            wizard = scope.xs[0].map(function(x, i) { return Math.min(x * wizSlope, 1); }),
            wizX   = scope.xs[0].slice(0), x1 = wizard.indexOf(1);
        wizard.splice(x1, 0, 1);   wizX.splice(x1, 0, 1 / wizSlope);
        scope.ys.push(wizard);     scope.xs.push(wizX);

        scope.ys.push(scope.xs[0].map(Fn.SELF)); // Random: y(x) = x

        scope.labels = ys.length === 1
            ? ['Cumulative Gain', 'Wizard (perfect model)', 'Random model']
            : ys.map(function(_, i) { return 'Cumul. Gain, fold ' + (i+1); })
                .concat('Wizard', 'Random model');
    }); }
}; });


app.controller("PMLTaskModelsRankingController", function ($scope) {
        function sortModelsForDisplay() {
            $scope.orderedModels = ($scope.selection.sessionModels || [])
                .map(x => {
                    if (x.trainInfo && x.trainInfo.state !== "DONE") {
                        x.sortMainMetric = -999999999;
                    }
                    return x;
                }).sort((a, b) => -(a.sortMainMetric - b.sortMainMetric));
        }

        $scope.$watch("selection.sessionModels", sortModelsForDisplay, true);
    }
);

chartDirective('gridsearchResults',
    {selectedModel: '=', allModels: '=', currentMetric: '=', sessionId: '='},
    ["selectedModel", "allModels", "currentMetric", 'sessionId'],
    function(scope, Collections) {
        return scope.allModels.filter(function(model){ return model.sessionId === scope.sessionId && model.mainMetric });
    }, function(scope, element, $filter, Fn) {
        var changeSelectedModel = function(nv) {
            scope.selectedModel = nv;
            scope.$apply();
        };
        var margin = {top: 0, right: 0, bottom: 50, left: 5},
            width = element.width() - margin.left - margin.right,
            height = element.height() - margin.top - margin.bottom,
            chart = d3.select(element.get(0)).html(''),
            miny = d3.min(scope.theData.map(function(c){ return c.mainMetric })),
            maxy = d3.max(scope.theData.map(function(c){ return c.mainMetric })),
            ydiff = Math.max(maxy - miny, Math.abs(0.01*miny));

        maxy = maxy + 0.15 * ydiff;

        chart.attr('viewBox','0 0 '+width+' '+height);
        var main = chart.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
            .attr('width', width).attr('height', height).attr('class', 'main');

        var y = d3.scale.linear().domain([miny, maxy]).range([ height, 0 ]);


        var threshold = 10; // in px
        // If there are some overlapping texts adapt smoothly to threshold
        // compute distances between scores, min with threshold and compensate with greater y
        scope.theData = scope.theData.sort(function(a,b){ return b.mainMetric-a.mainMetric }); // ascending mainMetric order
        var dists = [], i;
        for (i=1;i<scope.theData.length;i++) {
            dists.push(y(scope.theData[i].mainMetric) - y(scope.theData[i-1].mainMetric));
        }
        var distToGet = 0;
        dists = dists.map(function(o){ distToGet += Math.max(threshold-o, 0); return Math.max(threshold, o) });
        var totalOverDist = dists.filter(function(o){return o>threshold}).reduce(Fn.SUM,0);
        dists = dists.map(function(o) { return o>threshold ? o - (o/totalOverDist)*distToGet : o });
        if (scope.theData.length>0) {
            scope.theData[0].y = y(scope.theData[0].mainMetric);
        }
        for (i=1;i<scope.theData.length;i++) {
            scope.theData[i].y = scope.theData[i-1].y + dists[i-1];
        }

        var textx = width - 20,
        mins = d3.min(scope.theData.map(function(c){ return c.mainMetric })),
        maxs = d3.max(scope.theData.map(function(c){ return c.mainMetric }));
        main.append('line').attr({x1:textx,x2:textx,y1:height-10,y2:10,class:'domain','stroke-dasharray': '2,5'});
        main.append('text').attr({x:textx,y:0}).style('text-anchor','middle').text(maxs ? maxs.toFixed(2) : '');
        main.append('text').attr({x:textx,y:height+10}).style('text-anchor','middle').text(mins ? mins.toFixed(2) : '');
        main.append('text').attr({x:0,y:height+20}).text(function(d){
            var txt = 'Final model score on test set';
            txt += scope.theData.length==0 ? '' : ' ('+$filter('mlMetricName')(scope.currentMetric, scope.theData[0])+')';
            return txt;
        });

        var div = d3.select('body').selectAll('div.gridsearch.tooltip').data([0]);
        div.enter().append('div').attr("class", "tooltip gridsearch").style("opacity", 0);

        var pointlines = main.selectAll("g.doctor-results-graph-line")
            .data(scope.theData).enter().append("g")
            .attr('transform', function(d){ return 'translate(0 ' + d.y + ')' })
            .attr('class', function(d){ return (d.fullModelId === (scope.selectedModel||{}).fullModelId) ?
                "selected doctor-results-graph-line" : "doctor-results-graph-line";
            });
        var showPopup = function(d) {
            changeSelectedModel(d);
            div.transition().duration(200).style("opacity", 1);
            div.html(d.mainMetric.toFixed(3)).style("left", (d3.event.pageX - 22) + "px").style("top", (d3.event.pageY - 32) + "px");
        };
        var hidePopup = function(d) {
            div.transition().duration(500).style("opacity", 0);
        };
        pointlines.append("line")
            .attr({x1:0,y1:0,x2:20,y2:0,fill:"#2d2d2d"})
            .attr("stroke", function(d){ return d.color })
            .on("mouseover", showPopup).on("mouseout", hidePopup);
        pointlines.append("circle")
            .attr({cx:0,cy:0,r:3})
            .attr("fill", "#2d2d2d")
            .attr("stroke", function(d){ return d.color })
            .on("mouseover", showPopup).on("mouseout", hidePopup);
        pointlines.append("circle")
            .attr({cx:20,cy:0,r:3,fill:"#2d2d2d"})
            .attr("stroke", function(d){ return d.color })
            .on("mouseover", showPopup).on("mouseout", hidePopup);

        pointlines.append("text").attr({x:30,y:4})
            .text(function(d){ return d.userMeta.name })
            .attr("fill", function(d){ return d.color })
            .on("mouseover", function(d) { changeSelectedModel(d) });
    }, {}, function() {
        d3.select('body').selectAll('div.gridsearch.tooltip').remove();
    }
);

function objdiff(a,b) {
    var diff = {};
    angular.forEach(a, function(v,k){
        if (a[k] != b[k] && a[k] !== undefined && b[k] !== undefined) {
            diff[k] = [a[k], b[k]];
        }
    });
    return diff;
}

chartDirective('gridsearchCurve',
    { sessionId: '=', selectedModel: '=', allModels: '=', currentMetric: '=', lowerIsBetter: '=', showEveryResult: '=', customEvaluationMetricGib: '='},
    ["sessionId", "selectedModel", "allModels", "currentMetric"],
    function(scope, Collections) {
        return Object.values(scope.allModels).filter(function(snippet){
            return snippet.sessionId === scope.sessionId && snippet.gridsearchData && snippet.gridsearchData.gridPoints.length > 0;
        }).map(function(snippet){
            var values = [], cumTime = 0, bestParams = {}, lastbestParams = {};
            var metric = snippet.gridsearchData.metric;
            var maxScore = scope.lowerIsBetter(metric, scope.customEvaluationMetricGib) ? Number.MAX_VALUE : -1 * Number.MAX_VALUE;
            snippet.gridsearchData.gridPoints.sort(function(a,b){ return (a.finishedAt-b.finishedAt) })
            .forEach(function(gridPoint){
                const thisPointTrainTime = gridPoint.time / 1000 / snippet.gridsearchData.nSplits || 1;
                cumTime += thisPointTrainTime;
                if (scope.showEveryResult) {
                    maxScore = gridPoint.score;
                } else {
                    maxScore = scope.lowerIsBetter(metric, scope.customEvaluationMetricGib) ? Math.min(maxScore, gridPoint.score) : Math.max(maxScore, gridPoint.score);
                }
                lastbestParams = bestParams;
                if (values.length == 0) {
                    values.push({x:0, y:maxScore, p:{}, pd:{}});
                }
                bestParams = maxScore == gridPoint.score ? gridPoint.parameters : bestParams;
                values.push({x:cumTime, y:maxScore, time: thisPointTrainTime, p:angular.copy(bestParams), pd:objdiff(lastbestParams, bestParams)});
            });
            return {
                values: values,
                metric: metric,
                model: snippet,
                xlast: values.length>0 ? values[values.length-1].x : 0,
                ylast: values.length>0 ? values[values.length-1].y : 0,
            };
        });
    }, function(scope, element, $filter) {
        var changeSelectedModel = function(nv) {
            scope.selectedModel = nv;
            scope.$apply();
        };
        let maxx = d3.max(scope.theData.map(function(c){ return d3.max(c.values, function(d){ return d.x }) })),
            maxy = d3.max(scope.theData.map(function(c){ return d3.max(c.values, function(d){ return d.y }) })),
            miny = d3.min(scope.theData.map(function(c){ return d3.min(c.values, function(d){ return d.y }) })),
            yAxisFormatFn = d3.format('04.3f'),
            yAxisLabelChars = Math.max(yAxisFormatFn(maxy).length, yAxisFormatFn(miny).length),
            margin = {top: 0, right: 10, bottom: 15, left: 23 + Math.round(yAxisLabelChars * 5.5)},
            width = element.width() - margin.left - margin.right,
            height = element.height() - margin.top - margin.bottom,
            chart = d3.select(element.get(0)).html(''),
            baseTime = 30, powTime = 2, minx = -1,
            ydiff = Math.max(maxy - miny, Math.abs(0.01*miny)),
            tooltipScope = scope.$parent;

        maxy = maxy + 0.3 * ydiff;
        miny = miny - 0.3 * ydiff;
        maxx = Math.pow(powTime,(Math.max(0,Math.ceil(
            log10(maxx/baseTime)/log10(powTime)
        ))))*baseTime;
        var minFormat = maxx > 120;

        // the main object where the chart and axis will be drawn
        var main = chart.append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
            .attr('width', width).attr('height', height).attr('class', 'main');

        var x = d3.scale.linear().domain([minx, maxx]).range([ 0, width ]);
        var xAxis = d3.svg.axis().scale(x).orient('bottom').ticks(8).tickSize(0,0).tickFormat(function(d){
            var m = Math.floor(d/60), s = Math.floor(d) % 60;
            if (!minFormat && m < 1) { return s + 's' }
            else if (!minFormat && m < 2) { return m + ':' + ("0" + s).slice(-2) }
            else { return m }
        });
        main.append('g').attr('transform', 'translate(0,' + height + ')').attr('class', 'main axis date').call(xAxis);

        //attr('x',width-60).attr('y',height-5)

        var y = d3.scale.linear().domain([miny, maxy]).range([ height, 0 ]);
        var yAxis = d3.svg.axis().scale(y).orient('left').ticks(4).tickSize(0,0).tickFormat(yAxisFormatFn);
        main.append('g').attr('transform', 'translate(0,0)').attr('class', 'main axis date').call(yAxis);


        chart.append('text').attr('text-anchor','middle').attr("transform", "rotate(-90, 12, " + height/2 + ")").attr('fill','#9d9d9d').attr('x',12).attr('y',height/2).text(function(){
            let txt = $filter('mlMetricName')(scope.theData[0].metric, scope.theData[0].model);
            if (!txt.toLowerCase().endsWith('score')) {
                txt += " score";
            }
            if(scope.theData[0].model.sampleWeightsEnabled) txt += " (weighted)";
            return txt;
        });

        main.selectAll("line.horizontalGrid").data(y.ticks(6)).enter().append("line").attr({
            class:"horizontalGrid", x1 : x(minx), x2 : width, y1 : y, y2 : y});

        main.selectAll("line.verticalGrid").data(x.ticks(6)).enter().append("line").attr({
            class:"verticalGrid", x1: x, x2: x, y1: y(maxy), y2: y(miny)});

        main.append('text').attr('text-anchor','end').attr('x',width).attr('y',height-8).text('Time '+ (minFormat ? '(min)':'(s)'));

        var pointlines = main.append("svg:g").selectAll("g").data(scope.theData).enter().append("g")
            .attr('class', function(d){ return d.model.fullModelId === (scope.selectedModel||{}).fullModelId ?
                    "selected gridsearch-scores-graph-line" : "gridsearch-scores-graph-line";
            });
        var line = d3.svg.line()
            .interpolate("monotone")
            .x(function(d) { return x(d.x); })
            .y(function(d) { return y(d.y); });
        var showPopup = function(d, model) {
            changeSelectedModel(model || d3.select(this.parentNode).datum().model);
            var html = '<table class="tooltip-table"><tr><td></td><td>' + sanitize($filter('mlMetricName')(scope.theData[0].metric, scope.theData[0].model)) + "</td><td>" +
                sanitize((d.y||d.ylast||0).toFixed(3)) + "</td></tr>";

            angular.forEach(d.p, function(v,k) {
                if (d.pd[k]) {
                    html += "<tr><td></td><td>" + sanitize(k) + "</td><td>" + sanitize(v) + "<span style='font-weight: normal'> (was " + sanitize(d.pd[k][0]) + ")</span></td></tr>";
                } else {
                    html += "<tr><td></td><td>" + sanitize(k) + "</td><td>" + sanitize(v) + "</td></tr>";
                }
            });
            html += "<tr><td></td><td>Train time</td><td>" + sanitize(durationHHMMSS(d.time)) + "</td></tr>";
            html += "</table>";

            tooltipScope.setTooltipContent(html);
            tooltipScope.showTooltip(margin.left + x(d.xlast || d.x), margin.top + y(d.ylast || d.y));
        };
        var hidePopup = function() {
            tooltipScope.hideTooltip();
        };
        pointlines.append("path").datum(function(d){return d.values})
            .attr("d", line).attr("zzstroke-width", 2).attr("fill", "none")
            .attr('stroke', function(d){ return d3.select(this.parentNode).datum().model.color })
            .on("mouseover", function(d) {
                changeSelectedModel(d3.select(this.parentNode).datum().model);
            });
        pointlines.selectAll("circle")
            .data(function(d){ return d.values })
            .enter().append("circle")
                .attr("opacity", function(d, i) { // Hide if there is going to be a X instead
                    var p = d3.select(this.parentNode).datum();
                    return (i === p.values.length - 1 && p.model.trainInfo.state === "FAILED") ? 0 : 1;
                })
                .attr('stroke', function(d){ return d3.select(this.parentNode).datum().model.color })
                .attr('fill', function(d){ return d3.select(this.parentNode).datum().model.color }) // overriden by css if :not(:hover)
                .attr("r", (d, i) => i == 0 ? 0 : 3)
                .attr("cx", function(e) { return x(e.x) }).attr("cy", function(e) { return y(e.y) })
                .attr("stroke-width","2px").on("mouseover", showPopup).on("mouseout", hidePopup);

        pointlines.append("g").each(function(d) {
            var g = d3.select(this);
            if (d.model.trainInfo.state === 'FAILED') {
                // Draw a nice X with 2 lines
                g.append("line")
                    .attr("x1", -5).attr("y1", 5).attr("x2", 5).attr("y2", -5)
                    .attr('stroke', function(d){ return d.model.color; })
                    .attr("stroke-width", "3px");

                g.append("line")
                    .attr("x1", -5).attr("y1", -5).attr("x2", 5).attr("y2", 5)
                    .attr('stroke', function(d){ return d.model.color; })
                    .attr("stroke-width", "3px");

                g.attr("transform", function(d) {
                    return "translate(" + x(d.xlast) + "," + y(d.ylast) + ")";
                });
            } else {
                g.append("circle")
                    .attr('cx',function(d){ return x(d.xlast) }).attr('cy',function(d){ return y(d.ylast) })
                    .attr('stroke', function(d){ return d.model.color; }) // overriden by css if :not(.DONE)
                    .attr('fill', function(d){ return d.model.color })
                    .attr("stroke-width","2px")
                    .attr('r', 5)
                    .attr('class', function(d){ return 'end-circle ' + d.model.trainInfo.state })
                    .on("mouseover", function(d) { showPopup(d.values[d.values.length-1], d.model); }).on("mouseout", hidePopup);
            }
        });
    }, {}, function() {
        d3.select('body').selectAll('div.gridsearch.tooltip').remove();
    }
);


chartDirective('kerasEpochCurve',
    { sessionId: '=', allModels: '=', currentMetric: '=', lowerIsBetter: '=', showEveryResult: '=', customEvaluationMetricGib: '='},
    ["sessionId", "allModels", "currentMetric"],
    function(scope) {
        let selectedModel =  Object.values(scope.allModels).filter(function(snippet){
            return snippet.sessionId === scope.sessionId && snippet.modelTrainingInfo && snippet.modelTrainingInfo.epochs.length > 0;
        })[0];

        let testValues = [];
        let trainValues = [];
        let cumTime = 0;
        let metric = selectedModel.modelTrainingInfo.metric;
        selectedModel.modelTrainingInfo.epochs
                     .sort(function(a,b){ return a.epoch-b.epoch })
                     .forEach(function(epochPoint){
                            const thisPointTrainTime = epochPoint.time / 1000;
                            cumTime += thisPointTrainTime;
                            const testScoreWithSign = scope.lowerIsBetter(metric, scope.customEvaluationMetricGib) ? - epochPoint.testScore : epochPoint.testScore;
                            const trainScoreWithSign = scope.lowerIsBetter(metric, scope.customEvaluationMetricGib) ? - epochPoint.trainScore : epochPoint.trainScore;
                            testValues.push({x: parseInt(epochPoint.epoch), y: testScoreWithSign, time: thisPointTrainTime, epoch: epochPoint.epoch, type: "Test"});
                            trainValues.push({x: parseInt(epochPoint.epoch), y: trainScoreWithSign, time: thisPointTrainTime, epoch: epochPoint.epoch, type:"Train"});
                     });

        const trainData = {
                metric: metric,
                model: selectedModel,
                values: trainValues,
                xlast: trainValues.length>0 ? trainValues[trainValues.length-1].x : 0,
                ylast: trainValues.length>0 ? trainValues[trainValues.length-1].y : 0,
                color: "#00bcd4"
        };

        const testData = {
                metric: metric,
                model: selectedModel,
                values: testValues,
                xlast: testValues.length>0 ? testValues[testValues.length-1].x : 0,
                ylast: testValues.length>0 ? testValues[testValues.length-1].y : 0,
                color: "#4caf50"
        };

        return [trainData, testData];

    }, function(scope, element, $filter) {

        let maxx = d3.max(scope.theData.map(function(c){ return d3.max(c.values, function(d){ return d.x }) })),
            maxy = d3.max(scope.theData.map(function(c){ return d3.max(c.values, function(d){ return d.y }) })),
            miny = d3.min(scope.theData.map(function(c){ return d3.min(c.values, function(d){ return d.y }) })),
            yAxisFormatFn = d3.format('04.3f'),
            yAxisLabelChars = Math.max(yAxisFormatFn(maxy).length, yAxisFormatFn(miny).length),
            margin = {top: 0, right: 10, bottom: 15, left: 23 + Math.round(yAxisLabelChars * 5.5)},
            width = element.width() - margin.left - margin.right,
            height = element.height() - margin.top - margin.bottom,
            chart = d3.select(element.get(0)).html(''),
            minx = -1,
            ydiff = Math.max(maxy - miny, Math.abs(0.01*miny)),
            tooltipScope = scope.$parent,
            numEpochs = (scope.theData && scope.theData.length > 0) ? scope.theData[0].values.length : 0;

        maxy = maxy + 0.3 * ydiff;
        miny = miny - 0.3 * ydiff;
        maxx = (maxx == 0) ? 1 : maxx + 1;

        // the main object where the chart and axis will be drawn
        var main = chart.append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
            .attr('width', width).attr('height', height).attr('class', 'main');

        var x = d3.scale.linear().domain([minx, maxx]).range([ 0, width ]);
        var xAxis = d3.svg.axis().scale(x).orient('bottom').ticks(Math.min(numEpochs + 1, 8)).tickSize(0,0).tickFormat(function(d) { return d;});

        main.append('g').attr('transform', 'translate(0,' + height + ')').attr('class', 'main axis date').call(xAxis);

        var y = d3.scale.linear().domain([miny, maxy]).range([ height, 0 ]);
        var yAxis = d3.svg.axis().scale(y).orient('left').ticks(4).tickSize(0,0).tickFormat(yAxisFormatFn);
        main.append('g').attr('transform', 'translate(0,0)').attr('class', 'main axis date').call(yAxis);


        chart.append('text').attr('text-anchor','middle').attr("transform", "rotate(-90, 12, " + height/2 + ")").attr('x',12).attr('y',height/2).text(function(){
            let txt = $filter('mlMetricName')(scope.theData[0].metric, scope.theData[0].model);
            if (!txt.toLowerCase().endsWith('score')) {
                txt += " score";
            }
            if(scope.theData[0].model.sampleWeightsEnabled) txt += " (weighted)";
            return txt;
        });

        main.selectAll("line.horizontalGrid").data(y.ticks(6)).enter().append("line").attr({
            class:"horizontalGrid", x1 : x(minx), x2 : width, y1 : y, y2 : y});

        main.selectAll("line.verticalGrid").data(x.ticks(6)).enter().append("line").attr({
            class:"verticalGrid", x1: x, x2: x, y1: y(maxy), y2: y(miny)});

        main.append('text').attr('text-anchor','end').attr('x',width).attr('y',height-8).text('Epoch #');

        var pointlines = main.append("svg:g").selectAll("g").data(scope.theData).enter().append("g").attr("class", "keras-epoch-scores-graph-line");

        var line = d3.svg.line()
            .interpolate("monotone")
            .x(function(d) { return x(d.x); })
            .y(function(d) { return y(d.y); });

        var showPopup = function(d, model) {
            var html = '<table class="tooltip-table"><tr><td></td><td><strong style="color: #333">'+d.type+'</strong></td></tr>';

            html+='<tr><td></td><td>' + sanitize($filter('mlMetricName')(scope.theData[0].metric, scope.theData[0].model)) + "</td><td>" +
                sanitize((d.y||d.ylast||0).toFixed(3)) + "</td></tr>";

            html += "<tr><td></td><td>Epoch #</td><td>" + sanitize(d.epoch) + "</td></tr>";
            html += "<tr><td></td><td>Train time</td><td>" + sanitize(durationHHMMSS(d.time)) + "</td></tr>";
            html += "</table>";

            tooltipScope.setTooltipContent(html);


            // Placing tooltip
            let xTooltip = margin.left + x(d.xlast || d.x);
            const yTooltip = margin.top + y(d.ylast || d.y);

            // Put tooltip on left if would go out of svg
            const tooltipWidth = $(".svg-tooltip").outerWidth();
            const svgWidth = $('svg.keras-epoch-curve').width();

            if (xTooltip + tooltipWidth > svgWidth) {
                xTooltip -= $(".svg-tooltip").outerWidth() + 3;
            }
            tooltipScope.showTooltip(xTooltip, yTooltip);

        };
        var hidePopup = function() {
            tooltipScope.hideTooltip();
        };

        pointlines.append("path").datum(function(d){return d.values})
            .attr("d", line).attr("zzstroke-width", 2).attr("fill", "none")
            .attr('stroke', function(d){ return d3.select(this.parentNode).datum().color; })
            .attr('stroke-width', "2px")
            .attr('stroke-opacity', "1")
        pointlines.selectAll("circle")
            .data(function(d){ return d.values })
            .enter().append("circle")
                .attr("opacity", function(d, i) { // Hide if there is going to be a X instead
                    var p = d3.select(this.parentNode).datum();
                    return (i === p.values.length - 1 && p.model.trainInfo.state === "FAILED") ? 0 : 1;
                })
                .attr('stroke', function(d){ return d3.select(this.parentNode).datum().color; })
                .attr("r", 3)
                .attr("cx", function(e) { return x(e.x) }).attr("cy", function(e) { return y(e.y) })
                .attr('fill', function(d){ return d3.select(this.parentNode).datum().color; }) // overriden by css if :not(:hover)
                .attr("stroke-width","2px").on("mouseover", showPopup).on("mouseout", hidePopup)
                .attr('stroke-opacity', "1")

        pointlines.append("g").each(function(d) {
            var g = d3.select(this);
            if (d.model.trainInfo.state === 'FAILED') {
                // Draw a nice X with 2 lines
                g.append("line")
                    .attr("x1", -5).attr("y1", 5).attr("x2", 5).attr("y2", -5)
                    .attr('stroke', function(d){ return d.color; })
                    .attr("stroke-width", "3px");

                g.append("line")
                    .attr("x1", -5).attr("y1", -5).attr("x2", 5).attr("y2", 5)
                    .attr('stroke', function(d){ return d.color; })
                    .attr("stroke-width", "3px");

                g.attr("transform", function(d) {
                    return "translate(" + x(d.xlast) + "," + y(d.ylast) + ")";
                });
            } else {
                g.append("circle")
                    .attr('cx',function(d){ return x(d.xlast) }).attr('cy',function(d){ return y(d.ylast) })
                    .attr('stroke', function(d){ return d.color; }) // overriden by css if :not(.DONE)
                    .attr('fill', function(d){ return d.color; })
                    .attr("stroke-width","2px")
                    .attr('r', 5)
                    .attr('class', function(d){ return 'end-circle ' + d.model.trainInfo.state })
                    .on("mouseover", function(d) { showPopup(d.values[d.values.length-1], d.model); }).on("mouseout", hidePopup);
            }
        });
    }, {}, function() {
        d3.select('body').selectAll('div.gridsearch.tooltip').remove();
    }
);

app.directive('kerasEpochProgress', function (Fn, MLChartsCommon) { return {
    scope: {sessionId: "=", allModels: "="},
    link: function(scope, element, attrs) {

        // Graph parameters

        let width,
            height,
            main,
            gradientArcIntervalID = null;


        const perEpochArc = {
            radius: 57,
            arcWidth: 2,
            startAngle: 0,
            endAngle: 2 * Math.PI
        };

        const globalArc = {
            radius: 68,
            arcWidth: 4,
            startAngle: 230 * Math.PI / 180,
            endAngle: 2 * Math.PI + 130 * Math.PI / 180,
        };


        function buildGraph() {

            let chart = d3.select(element.get(0)).html('');

            width = element.width();
            height = element.height();

            main = chart.append('g')
                        .attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')')
                        .attr('class', 'main');

            // Text inside progress chart

            let text = main.append("text")
                .attr("class", "epoch-number")
                .attr("fill", "#ffffff")
                .attr("text-anchor", "middle");

            text.append("tspan")
                .text("Epoch")
                .attr("style", "font-size: 18px;")
                .attr("y", -15);

            text.append("tspan")
                .attr("class", "epoch-number")
                .attr("style", "font-size: 18px;")
                .attr("y", 5)
                .attr("x", 0);

            text.append("tspan")
                .attr("class", "epoch-progress")
                .attr("style", "font-size: 14px;")
                .attr("y", 25)
                .attr("x", 0);

            // Background arc for global arc

            let backgroundArc = d3.svg.arc()
                .innerRadius(function(d) { return d.radius - d.arcWidth;})
                .outerRadius(function(d) { return d.radius;})
                .startAngle(function(d) { return d.startAngle;})
                .endAngle(function(d) { return d.endAngle;})

            main.append("path")
                .attr('class', 'arc-complementary')
                .attr("fill", "#708a97")
                .attr("d", backgroundArc(globalArc));


            // Background arc with moving gradient for perEpoch arc
            // To achieve the result, we draw a lot of small adjacent arcs with evolving colors
            // and make them move periodically

            function getGradientArcData(numArcs, arc) {

                const colorScale = d3.scale
                                   .linear()
                                   .domain([0, 0.25, 0.5, 0.75, 1])
                                   .range(["#5F7D8C", "#AABFCA", "#5F7D8C", "#AABFCA", "#5F7D8C"]);

                let data = [];
                for (let i = 0; i < (numArcs - 1); i++) {
                    data[i] = {
                        i: i,
                        radius: arc.radius,
                        arcWidth: arc.arcWidth,
                        color: colorScale(i / numArcs)
                    };
                }

                return data;

            }

            const numArcsInGradient = 200;
            const gradientData = getGradientArcData(numArcsInGradient, perEpochArc);

            let gradientArc = d3.svg.arc()
                .innerRadius(function(d) { return d.radius - d.arcWidth;})
                .outerRadius(function(d) { return d.radius;})
                .startAngle(function(d) { return d.i / numArcsInGradient * 2 * Math.PI;})
                .endAngle(function(d) { return 1.01 * (d.i + 1) / numArcsInGradient * 2 * Math.PI;}) // We multiply by 1.01 to make arcs overlap

            main.selectAll("path.gradient-arc")
                .data(gradientData, function(d) { return d.i;})
                .enter()
                .append("path")
                .attr("class", "gradient-arc")
                .attr("fill", function(d) { return d.color;})
                .attr("d", gradientArc);

            if (gradientArcIntervalID !== null) {
                clearInterval(gradientArcIntervalID);
            }

            gradientArcIntervalID = setInterval(function() {
                gradientData.forEach(function(d) {
                    d.i = (d.i + 1) % numArcsInGradient;
                });
                main.selectAll("path.gradient-arc")
                    .data(gradientData, function(d) { return d.i;})
                    .attr("fill", function(d) { return d.color;})
                    .attr("d", gradientArc);
            }, 10);

        }

        // Retrieving data

        function getData() {
            let selectedModel =  Object.values(scope.allModels).filter(function(snippet){
                return snippet.sessionId === scope.sessionId && snippet.modelTrainingInfo;
            })[0];

            const currentTraining = selectedModel.modelTrainingInfo.currentNumStepsTraining;
            const totalTraining = selectedModel.modelTrainingInfo.nbStepsTrainingPerEpoch;

            const currentScoring = selectedModel.modelTrainingInfo.currentNumStepsScoring;
            const totalScoring = selectedModel.modelTrainingInfo.nbStepsScoringPerEpoch;

            // We split the time spent on one epoch between training and scoring and
            // empirically decide how to split it
            const shareTraining = 90;
            const percentagePerEpoch = Math.floor(shareTraining * currentTraining / totalTraining + (100 - shareTraining) * currentScoring / totalScoring);

            const currentEpoch = selectedModel.modelTrainingInfo.currentEpoch + 1;
            const totalEpochs = selectedModel.modelTrainingInfo.nbEpochs;
            const percentageGlobal = Math.floor( 100 * ((currentEpoch - 1) + (percentagePerEpoch / 100))/ totalEpochs );

            return {
                currentEpoch: currentEpoch,
                totalEpochs: totalEpochs,
                percentagePerEpoch: percentagePerEpoch,
                percentageGlobal: percentageGlobal
            }

        }

        // Moving arcs (perEpoch and global) and change text

        function customInterpolate(startArc, endArc) {
            const start = startArc.percentage;
            let end = endArc.percentage;

            if (start > end) {
                end += 100;
            }

            const i = d3.interpolate(start, end);

            const newArcValue = angular.copy(startArc);
            return function(t) {
                const newPercentage = i(t)
                newArcValue.percentage = (newPercentage != 100) ? newPercentage % 100 : 100;
                return newArcValue;
            }
        }

        function arcTween(d) {
            let interpolator = customInterpolate(this._current, d);
            this._current = interpolator(0);
            return function (t) {
                return progressArc(interpolator(t));
            };
        }

        let progressArc = d3.svg.arc()
            .innerRadius(function(d) { return d.radius - d.arcWidth;})
            .outerRadius(function(d) { return d.radius;})
            .startAngle(function(d) { return d.minAngle;})
            .endAngle(function(d) { return d.minAngle + (d.maxAngle - d.minAngle) * d.percentage / 100; });


        const textPercentFormat = d3.format("02f");

        function drawMovingArcs(data) {

            const arcs = [
                {
                    type : "perEpoch",
                    radius: 57,
                    arcWidth: 2,
                    minAngle: 0,
                    maxAngle: 2 * Math.PI,
                    percentage: data.percentagePerEpoch
                },
                {
                    type : "global",
                    radius: 68,
                    arcWidth: 4,
                    minAngle: 230 * Math.PI / 180,
                    maxAngle: 2 * Math.PI + 130 * Math.PI / 180,
                    percentage: data.percentageGlobal
                },
            ];


            main.selectAll("path.arc")
                .data(arcs, function(d) {return d.type;})
                .enter()
                .append("path")
                .attr('class', 'arc')
                .attr("fill", "#ffffff")
                .attr("d", progressArc)
                .each(function(d) {this._current = d;})

            main.selectAll("path.arc")
                .data(arcs, function(d) {return d.type;})
                .transition()
                .duration(500)
                .attrTween("d", arcTween);


            main.select("tspan.epoch-number")
                .text(data.currentEpoch + "/" + data.totalEpochs);

            main.select("tspan.epoch-progress")
                .text(textPercentFormat(data.percentagePerEpoch) + "%");

        }


        // Init & watchers

        buildGraph();

        scope.$watch("allModels", function(nv) {
            let data = getData();
            drawMovingArcs(data);
        }, true);

        scope.$watch("sessionId", function(nv) {
            let data = getData();
            drawMovingArcs(data);
        }, true);

        MLChartsCommon.installRedrawListener(scope, function() {
            let data = getData();
            buildGraph();
            drawMovingArcs(data);
        });

    }
}; });

chartDirective('bcRocCurve', { data: '=', colors: '=', loadedStateField: "=?", disableTransitions: "=?" }, "data",
    function(scope) { return scope.data.map(function(d, i, a) {
        return { values: d, key: "Fold #" + (i+1), color: a.length > 1 ? scope.colors[i] : 'url(#ppg)' }; });
    }, function(scope, element) {
        d3.selectAll('.nvtooltip').style('opacity', '0');
        var width = element.width(),
            height = element.height(),
            margin = {top: 10, right: 20, bottom: 50, left: 60},
            folds = scope.theData.length > 1,
            chart = nv.models.lineChart()
                .width(width) .height(height) .margin(margin)
                .forceX([0, 1]) .forceY([0, 1])
                .showLegend(false);
                
        chart.tooltip.contentGenerator( function(data) {
            var p = parseFloat(data.point.p);
            return ['<p>', folds ? '<strong>' + data.series[data.point.series].key + '</strong><br>' : '',
                'At p = ' + (Math.round(p * 100) / 100), '</p>',
                '<ul class="unstyled" style="padding-left: 0.8em; padding-right: 0.8em;">',
                '  <li>', Math.round(parseFloat(data.point.y) * 100), '% true  positive</li>',
                '  <li>', Math.round(parseFloat(data.point.x) * 100), '% false positive</li>',
                '</ul>'].join('');
        });
        const svg = d3.select(element.get(0)).html('');
        chart.xAxis.axisLabel(scope.data.xlabel).tickFormat(d3.format('%'));
        chart.yAxis.axisLabel(scope.data.ylabel).tickFormat(d3.format('%'));
        chart.options({tooltip: {chartContainer: document.body }});

        // Median line
        svg.append('g').attr('class','rocmedline').append("path")
            .attr('d', ['M', margin.left, ',', height - margin.bottom,
                       ' L',  width - margin.right, ',', margin.top].join(''))
            .style("stroke", "LightCoral").style("stroke-width", "2").style("stroke-dasharray", "3");

        if (! folds) { // Color gradient, skewed to reflect predicted probability
            var colorScale = d3.scale.linear().range(scope.colors.slice(0, 2));
            svg.append("linearGradient").attr("id", "ppg").attr("gradientUnits", "userSpaceOnUse")
                .attr("x1", "0%").attr("y1", "100%").attr("x2", "100%").attr("y2", "0%")
                .selectAll("stop").data(scope.theData[0].values).enter().append("stop")
                    .attr("offset", function(d) { return Math.round((d.x + d.y) * (1-d.p) * 50) + '%'; })
                    .attr("stop-color", function(d) { return colorScale(d.p); });
        }

        let transitionDuration = 500;
        if (scope.disableTransitions) {
            console.info("Disabling chart transitions");
            chart.duration(0);
            transitionDuration = 0;
        }

        svg.datum(scope.theData).transition().duration(transitionDuration).call(chart);

        if (! folds) { // Append color legend
            var legend = svg.append("g"),
                llg = legend.append("linearGradient").attr("id", "ppgl");
            llg.append("stop").attr("offset", "0%"  ).attr("stop-color", colorScale(0));
            llg.append("stop").attr("offset", "100%").attr("stop-color", colorScale(1));
            legend.attr("transform", "translate(" + (width - 200) + "," + (height - 100) + ")");
            legend.append("rect").attr("x", 10).attr("y", 5).
                attr("width", 100).attr("height", 20).attr("fill", "url(#ppgl)");
            legend.append("text").text("Predicted proba.").attr("x", 60).attr('text-anchor', 'middle');
            legend.append("text").text("0").attr("y", 20);
            legend.append("text").text("1").attr("y", 20).attr("x", 115);
        }
    });

chartDirective('bcCalibrationCurve', { data: '=', colors: '=', loadedStateField: "=?", disableTransitions: "=?" }, "data",
    function(scope) { return scope.data.map(function(d, i, a) {
        return { values: d, key: "Fold #" + (i+1), color: a.length > 1 ? scope.colors[i] : 'url(#ppg)' }; });
    }, function(scope, element) {
        d3.selectAll('.nvtooltip').style('opacity', '0');
        var width = element.width(),
            height = element.height(),
            margin = {top: 10, right: 20, bottom: 50, left: 60},
            folds = scope.theData.length > 1,
            chart = nv.models.lineChart()
                .width(width) .height(height) .margin(margin)
                .forceX([0, 1]) .forceY([0, 1])
                .showLegend(false);
            chart.tooltip.contentGenerator( function(data) {
                return ['<p>', folds ? '<strong>' + data.series[data.point.series].key + '</strong><br>' : '',
                    '</p>',
                    '<ul class="unstyled" style="padding-left: 0.8em; padding-right: 0.8em;">',
                    '  <li>', Math.round(parseFloat(data.point.y)*100), '% frequency of positives</li>',
                    '  <li>', Math.round(parseFloat(data.point.x)*100), '% average probability of predicted positive</li>',
                    '  <li>', Math.round(parseFloat(data.point.n)), ' test elements in bin</li>',
                    '</ul>'].join('');
            });
        const svg = d3.select(element.get(0)).html('');
        chart.xAxis.axisLabel(scope.data.xlabel).tickFormat(d3.format('%'));
        chart.yAxis.axisLabel(scope.data.ylabel).tickFormat(d3.format('%'));
        chart.options({tooltip: {chartContainer: document.body }});

        // Median line
        svg.append('g').attr('class','calmedline').append("path")
            .attr('d', ['M', margin.left, ',', height - margin.bottom,
                       ' L',  width - margin.right, ',', margin.top].join(''))
            .style("stroke", scope.colors[0]).style("stroke-width", "2").style("stroke-dasharray", "3");

        var colorScale = d3.scale.linear().range(scope.colors.slice(0, 2));
        svg.append("linearGradient")
           .attr("id", "ppg")
           .attr("x1", "0").attr("y1", "0").attr("x2", "1").attr("y2", "0")
           .selectAll("stop").data(scope.theData[0].values).enter().append("stop")
                .attr("offset", function(d, i) { return d.x; })
                .attr("stop-color", function(d) { return colorScale(Math.abs(2*(d.y - d.x))); });

        let transitionDuration = 500;
        if (scope.disableTransitions) {
            console.info("Disabling chart transitions");
            chart.duration(0);
            transitionDuration = 0;
        }

        svg.datum(scope.theData).transition().duration(transitionDuration).call(chart);

        // Append color legend
        var legend = svg.append("g"),
            llg = legend.append("linearGradient").attr("id", "ppgl");
        llg.append("stop").attr("offset", "0%"  ).attr("stop-color", colorScale(0));
        llg.append("stop").attr("offset", "100%").attr("stop-color", colorScale(1));
        legend.attr("transform", "translate(" + (width - 200) + "," + (height - 100) + ")");
        legend.append("rect").attr("x", 10).attr("y", 5).
            attr("width", 100).attr("height", 20).attr("fill", "url(#ppgl)");
        legend.append("text").text("Calibration loss").attr("x", 60).attr('text-anchor', 'middle');
        legend.append("text").text("0").attr("y", 20);
        legend.append("text").text("0.5").attr("y", 20).attr("x", 115);
});

chartDirective('rScatterPlot', { data: '=', colors: '=', loadedStateField: "=?", disableTransitions: "=?" }, "data",
    function(scope) {
        var errors = scope.data.x.map(function(x, i) { return Math.abs(x - this[i]); }, scope.data.y),
            maxErr = d3.max(errors),
            colorScale = d3.scale.linear().range(['green', 'orange', 'red']).domain([0, maxErr / 2, maxErr])
        return [{
            key: "Values",
            values: scope.data.x.map((x, i) => { return { x: x, y: scope.data.y[i], error: errors[i], color: colorScale(errors[i])}})
        }]
    }, function(scope, element, $timeout) {
        var all = [].concat.apply(scope.data.x, scope.data.y);
        var width = element.width(),
            height = element.height(),
            margin = {top: 10, right: 20, bottom: 40, left: 60},
            fmt = d3.format('.3s'),
            domain = [d3.min(all), d3.max(all)],
            chart = nv.models.scatterChart()
                .width(width) .height(height) .margin(margin)
                .forceX(domain).forceY(domain).showLegend(false),
            elt = element.get(0),
            svg = d3.select(elt).html('');

        chart.tooltip.contentGenerator( function(data) {
                return ['<p>Error = ' + fmt(data.point.error), '</p>'].join(''); })
        chart.xAxis.axisLabel('Actual values').tickFormat(fmt);
        chart.yAxis.axisLabel('Predicted values').tickFormat(fmt);

        let transitionDuration = 500;
        if (scope.disableTransitions) {
            console.info("Disabling chart transitions x2");
            // Does not work - as of nvd3 1.8.6 - (see https://github.com/novus/nvd3/issues/2048)...
            chart.duration(0);
            // ...so we work around the issue with the following lines:
            chart.xAxis.duration(0);
            chart.yAxis.duration(0);
            chart.distX.duration(0);
            chart.distY.duration(0);
            chart.scatter.duration(0);
            transitionDuration = 0;
        }

        svg.datum(scope.theData).transition().duration(transitionDuration).call(chart);

        svg.append('g').datum(scope.theData).transition().duration(transitionDuration).call(chart);
        svg.append('g').attr('class','scattermedline').append("path") // Median line
            .style("stroke", "LightCoral").style("stroke-width", "2").style("stroke-dasharray", "3")
            .attr('d', ['M', margin.left, ',', height - margin.bottom,
                        'L', width - margin.right, ',', margin.top].join(''));
        d3.selectAll('.nv-point')
        .attr({
            'fill':   (d) => d[0].color
        })
    });

/** Generic categorical heatmap with tooltip.
 * x        Array of x values (categorical)
 * y        Array of y values (categorical)
 * values   Array of values to fill the heatmap
 * xLabel   X axis label
 * yLabel   Y axis label
 * valuesLabel   Values label
 * callback Function(svg, scope) to be called after (re)drawing [Optional]
 * hideTooltip Boolean to disable tooltip [Optional]
 * hideLegend Boolean to hide the legend [Optional]
 * hideXLabel Boolean to hide the x axis label [Optional]
 * hideYLabel Boolean to hide the y axis label [Optional]
 * hideValuesLabel Boolean to hide the y color scale label [Optional]
 **/
chartDirective('categoriesHeatmap',
    {
        x: '=',
        y: '=',
        values: '=',
        xLabel: '=',
        yLabel: '=',
        valuesLabel: '=',
        callback: '=?',
        hideTooltip: '=?',
        hideLegend: '=?',
        hideXLabel: '=?',
        hideYLabel: '=?',
        hideValuesLabel: '=?',
    },
    '[x, y, values]',
    function (scope, Fn) {
        if (!scope.x || !scope.y || !scope.values || !scope.xLabel || !scope.yLabel || !scope.valuesLabel) {
            return null;
        }
        scope.callback = typeof scope.callback === 'function' ? scope.callback : Fn.NOOP;
        return scope.x.map((xVal, i) => ({ x: xVal, y: scope.y[i], value: scope.values[i] }));
    },
    function (scope, element, MLChartsCommon) {
        element.css('position', 'relative');

        // Compute min and max values
        let minValue = Math.min(...scope.values),
            maxValue = Math.max(...scope.values);
        // set the dimensions and margins of the graph and legend
        let fullWidth = element.width();
        let fullHeight = element.height();
        let legendFullWidth = !scope.hideLegend ? 57 : 0;
        let margin = { top: 15, right: 15, bottom: 40, left: 55 };
        let width = fullWidth - margin.left - margin.right - legendFullWidth;
        let height = fullHeight - margin.top - margin.bottom;
        let elt = element.get(0);
        // Initialize graph, legend, and tooltip
        let containerSvg = d3
            .select(elt)
            .html('')
            .append('svg')
            .attr('width', fullWidth)
            .attr('height', fullHeight);
        let svg = containerSvg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

        // Build X scale and axis:
        let xScale = buildXScaleAxis();


        // Build Y scale and axis:
        let yScale = buildYScaleAxis();

        // Build color scale
        // Sequential color scale from https://colorbrewer2.org/#type=sequential&scheme=GnBu&n=9
        let colorScaleArray = ['#f7fcf0', '#e0f3db', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#0868ac', '#084081'];

        const valueslog = (minValue > 0) && (maxValue / minValue > 10);

        let colorScale = d3.scale.linear().range(colorScaleArray);

        if (valueslog) {
            colorScale.domain(
                MLChartsCommon.linspace(Math.log10(minValue), Math.log10(maxValue), colorScaleArray.length)
            );
        } else {
            colorScale.domain(MLChartsCommon.linspace(minValue, maxValue, colorScaleArray.length));
        }

        // If not hidden, build color legend
        if (!scope.hideLegend) {
            let legendMargin = { top: 25, right: 37, bottom: 50, left: 12 };
            let legendWidth = legendFullWidth - legendMargin.left - legendMargin.right;
            let legendHeight = fullHeight - legendMargin.top - legendMargin.bottom;
            let legendSvg = containerSvg
                .append('g')
                .attr('transform', `translate(${margin.left + width + margin.right}, 0)`);

            // Set number of ticks, not to clutter the plot for small dimensions
            let nVerticalTicks = Math.floor(fullHeight / 100) + 3;

            MLChartsCommon.makeColorScale(
                legendSvg,
                legendWidth,
                legendHeight,
                legendMargin,
                nVerticalTicks,
                colorScaleArray,
                minValue,
                maxValue,
                valueslog,
                scope.valuesLabel,
                scope.hideValuesLabel
            );
        }

        // Draw the color rectangles in the graph with or without tooltip
        drawRectsAndTooltip(
            svg,
            scope.xLabel,
            scope.yLabel,
            scope.valuesLabel,
            scope.theData,
            xScale,
            yScale,
            colorScale,
            margin,
            scope.hideTooltip
        );

        // Final callback
        scope.callback(svg, scope);

        function buildXScaleAxis() {
            let xUnique = d3.map(scope.theData, (d) => d.x).keys();

            let xScale = d3.scale.ordinal().domain(xUnique).rangeRoundBands([0, width], 0.05);
            let xAxis = svg
                .append('g')
                .attr('transform', `translate(0, ${height})`)
                .call(d3.svg.axis().scale(xScale).orient('bottom').tickSize(0));
            xAxis.selectAll('text').style('text-anchor', 'middle');
            xAxis.select('.domain').remove();

            if (!scope.hideXLabel) {
                svg.append('text')
                    .style('text-anchor', 'middle')
                    .attr('x', 0.5 * width)
                    .attr('y', height + 30)
                    .style('font-weight', 'bold')
                    .text(scope.xLabel);
            }

            return xScale
        }

        function buildYScaleAxis() {
            let yUnique = d3.map(scope.theData, (d) => d.y).keys();

            let yScale = d3.scale.ordinal().domain(yUnique).rangeRoundBands([height, 0], 0.05);
            let yAxis = svg
                .append('g')
                .attr('transform', 'translate(-7, 0)')
                .call(d3.svg.axis().scale(yScale).orient('left').tickSize(0));
            yAxis.selectAll('text').attr('transform', 'rotate(-90)').style('text-anchor', 'middle');
            yAxis.select('.domain').remove();

            if (!scope.hideYLabel) {
                svg.append('g')
                    .attr('transform', `translate(${-0.5 * margin.left}, ${0.5 * height})`)
                    .append('text')
                    .style('text-anchor', 'middle')
                    .style('font-weight', 'bold')
                    .attr('transform', 'rotate(-90)')
                    .text(scope.yLabel);
            }

            return yScale;
        }

        /**
         * Function that draws the colored rectangles and moves/updates/shows/hides the tooltip
         * @param {d3 selection} svg : d3 selection of the plot
         * @param {string} xLabel x axis label
         * @param {string} yLabel y axis label
         * @param {string} valuesLabel values label
         * @param {Object[]} theData Array of objects { x, y, value }
         * @param {d3 scale} xScale Scaling function for x Axis
         * @param {d3 scale} yScale Scaling function for y Axis
         * @param {d3 scale} colorScale Scaling function for values colors
         * @param {Object} margin svg margins
         * @param {boolean} hideTooltip Boolean to disable tooltip
         */
        function drawRectsAndTooltip(
            svg,
            xLabel,
            yLabel,
            valuesLabel,
            theData,
            xScale,
            yScale,
            colorScale,
            margin,
            hideTooltip
        ) {
            // Draw the colored rectangles
            svg.selectAll()
            .data(theData, function (d) {
                return d.x + ':' + d.y;
            })
            .enter()
            .append('rect')
            .attr('x', function (d) {
                return xScale(d.x);
            })
            .attr('y', function (d) {
                    return yScale(d.y);
                })
                .attr('rx', 4)
                .attr('ry', 4)
                .attr('width', xScale.rangeBand())
                .attr('height', yScale.rangeBand())
                .style('fill', function (d) {
                    return colorScale(d.value);
                })
                .style('stroke-width', 4)
                .style('stroke', 'none')
                .style('opacity', 0.8);

            if (!hideTooltip) {
                // Tooltip values formatters
                const tooltipNumericFormat = MLChartsCommon.makeTooltipNumericFormatter(3, 4);

                const tooltip = d3
                    .select(elt)
                    .append('div')
                    .style('opacity', 0)
                    .style('background-color', 'rgba(255,255,255,0.9)')
                    .style('border', 'solid')
                    .style('border-width', '1px')
                    .style('border-radius', '5px')
                    .style('position', 'absolute')
                    .style('padding', '5px');

                const getTooltipHtml = function (x, y, value, xLabel, yLabel, valuesLabel) {
                    return `
                        <table class="mlchart-tooltip__table">
                            <tr>
                                <td class="mlchart-tooltip__label">${valuesLabel}</td>
                                <td class="mlchart-tooltip__value">${value}</td>
                            </tr>
                            <tr>
                                <td class="mlchart-tooltip__label">${xLabel}</td>
                                <td class="mlchart-tooltip__value">${x}</td>
                            </tr>
                            <tr>
                                <td class="mlchart-tooltip__label">${yLabel}</td>
                                <td class="mlchart-tooltip__value">${y}</td>
                            </tr>
                        </table>`;
                };

                // Three function that change the tooltip when user hover / move / leave a cell
                const mouseover = function (d) {
                    tooltip
                        .html(
                            getTooltipHtml(
                                d.x,
                                d.y,
                                tooltipNumericFormat(d.value),
                                xLabel ? xLabel : 'x',
                                yLabel ? yLabel : 'y',
                                valuesLabel ? valuesLabel : 'value'
                            )
                        )
                        .style('opacity', 1);
                    d3.select(this).style('stroke', 'black');
                };

                const mousemove = function (d) {
                    let mousePosition = d3.mouse(this);
                    let distance = 5; // Shift the tooltip from the cursor
                    let leftOffset = -0.7 * tooltip.node().offsetWidth + margin.left - distance;
                    let topOffset = -tooltip.node().offsetHeight + margin.top - distance;

                    if (mousePosition[0] + leftOffset < 0) {
                        leftOffset = -0.3 * tooltip.node().offsetWidth + margin.left + distance;
                    }
                    if (mousePosition[1] + topOffset < 0) {
                        topOffset = margin.top + distance;
                    }

                    tooltip
                        .style('left', mousePosition[0] + leftOffset + 'px')
                        .style('top', mousePosition[1] + topOffset + 'px');
                };

                const mouseleave = function (d) {
                    tooltip.style('opacity', 0).style('left', '0').style('top', '0').html('');
                    d3.select(this).style('stroke', 'none');
                };

                svg.selectAll('rect').on('mouseover', mouseover).on('mousemove', mousemove).on('mouseleave', mouseleave);
            }
        }

    }
);


/** Generic contour plot based on plotly.js contour plot algorithms
 * x        Array of x values (numerical)
 * y        Array of y values (numerical)
 * values   Array of values to fill the contourplot
 * xLabel   X axis label
 * yLabel   Y axis label
 * valuesLabel   Values label
 * nContours: Number of contours to be computed [Optional, 15 by default]
 * callback Function(svg, scope) to be called after (re)drawing [Optional]
 * hideLegend Boolean to hide the legend [Optional]
 * hidePoints Boolean to hide the points [Optional]
 * hideXLabel Boolean to hide the x axis label [Optional]
 * hideYLabel Boolean to hide the y axis label [Optional]
 * hideValuesLabel Boolean to hide the y color scale label [Optional]
 **/
chartDirective('contourPlot',
    {
        x: '=',
        y: '=',
        values: '=',
        xLabel: '=',
        yLabel: '=',
        valuesLabel: '=',
        nContours: '=?',
        callback: '=?',
        hideLegend: '=?',
        hidePoints: '=?',
        hideXLabel: '=?',
        hideYLabel: '=?',
        hideValuesLabel: '=?',
    },
    '[x, y, values]',
    function (scope, Fn) {
        if (!scope.x || !scope.y || !scope.values || !scope.xLabel || !scope.yLabel || !scope.valuesLabel) {
            return null;
        }
        scope.nContours = typeof scope.nContours === 'number' ? scope.nContours : 15;
        scope.callback = typeof scope.callback === 'function' ? scope.callback : Fn.NOOP;
        return scope.x.map((xVal, i) => ({ x: xVal, y: scope.y[i], value: scope.values[i] }));
    },
    function (scope, element, ContourPlotFactory, MLChartsCommon) {
        element.css('position', 'relative');

        // Compute min and max values
        let minValue = Math.min(...scope.values);
        let maxValue = Math.max(...scope.values);
        // set the dimensions and margins of the graph
        let fullWidth = element.width();
        let fullHeight = element.height();
        let legendFullWidth = !scope.hideLegend ? 57 : 0;
        let margin = { top: 15, right: 15, bottom: 40, left: 55 };
        let width = fullWidth - margin.left - margin.right - legendFullWidth;
        let height = fullHeight - margin.top - margin.bottom;
        let elt = element.get(0);
        // Initialize graph, legend, and tooltip
        let containerSvg = d3
            .select(elt)
            .html('')
            .append('svg')
            .attr('width', fullWidth)
            .attr('height', fullHeight);
        let svg = containerSvg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

        // Set number of ticks, not to clutter the plot for small dimensions
        let nHorizontalTicks = Math.floor(fullWidth / 100) + 2;
        let nVerticalTicks = Math.floor(fullHeight / 100) + 3;

        /**
         * @typedef {Object} Axis
         * @property {d3 axis} axis d3 axis to be called by the svg selection
         * @property {boolean} isLog True if the axis is logarithmic, False otherwise
         * @property {d3 scale} scale d3 scaling function (value -> pixel)
         */

        /**
         * Function that builds a generic d3 numerical axis
         * @param {number[]} data Array of numeric values
         * @param {number} nTicks Number of ticks on the axis
         * @param {number} size Size of the axis in pixels (height or width typically)
         * @param {boolean} vertical Whether it is a vertical axis or not
         * @returns {Axis}
         */
        let buildAxis = function (data, nTicks, size, vertical) {
            const min = Math.min(...data);
            const max = Math.max(...data);
            const numericFormat = MLChartsCommon.makeAxisNumericFormatter(min, max, 3, 1);

            const isLog = min > 0 && max / min > 10;

            const rangeInterval = vertical ? [size, 0] : [0, size];
            const domainInterval = isLog ? [Math.log10(min), Math.log10(max)] : [min, max];
            const scale = d3.scale.linear().range(rangeInterval).domain(domainInterval);

            const tickFormat = isLog ? (_) => numericFormat(10 ** _) : numericFormat;
            let axis = d3.svg.axis().scale(scale).tickSize(4).ticks(nTicks).tickFormat(tickFormat);
            if (vertical) {
                axis.orient('left');
            }

            return { axis, isLog, scale };
        };

        // Build X scale and axis:
        const xAxis = buildAxis(scope.x, nHorizontalTicks, width, false);

        let xAxisSvg = svg
            .append('g')
            .attr('transform', `translate(0, ${height})`)
            .call(xAxis.axis);
        xAxisSvg.select('.domain').remove();
        xAxisSvg.selectAll('line').style('stroke', 'black');

        if (!scope.hideXLabel) {
            svg.append('text')
                .style('text-anchor', 'middle')
                .attr('x', 0.5 * width)
                .attr('y', height + 30)
                .style('font-weight', 'bold')
                .text(xAxis.isLog ? `${scope.xLabel} (log)` : scope.xLabel);
        }

        // Build Y scale and axis:
        const yAxis = buildAxis(scope.y, nVerticalTicks, height, true);

        let yAxisSvg = svg.append('g').attr('transform', 'translate(0, 0)').call(yAxis.axis);
        yAxisSvg.select('.domain').remove();
        yAxisSvg.selectAll('line').style('stroke', 'black');

        if (!scope.hideYLabel) {
            svg.append('g')
                .attr('transform', `translate(-43, ${0.5 * height})`)
                .append('text')
                .style('text-anchor', 'middle')
                .style('font-weight', 'bold')
                .attr('transform', 'rotate(-90)')
                .text(yAxis.isLog ? `${scope.yLabel} (log)` : scope.yLabel);
        }

        // Build color scale

        // Sequential color scale from https://colorbrewer2.org/#type=sequential&scheme=GnBu&n=9
        let colorScaleArray = ['#f7fcf0', '#e0f3db', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#0868ac', '#084081'];

        const valueslog = (minValue > 0) && (maxValue / minValue > 10);

        let colorScale = d3.scale.linear().range(colorScaleArray);

        if (valueslog) {
            colorScale.domain(
                MLChartsCommon.linspace(Math.log10(minValue), Math.log10(maxValue), colorScaleArray.length)
            );
        } else {
            colorScale.domain(MLChartsCommon.linspace(minValue, maxValue, colorScaleArray.length));
        }

        // If not hidden, build color legend
        if (!scope.hideLegend) {
            let legendMargin = { top: 25, right: 37, bottom: 50, left: 12 };
            let legendWidth = legendFullWidth - legendMargin.left - legendMargin.right;
            let legendHeight = fullHeight - legendMargin.top - legendMargin.bottom;
            let legendSvg = containerSvg
                .append('g')
                .attr('transform', `translate(${margin.left + width + margin.right}, 0)`);

            MLChartsCommon.makeColorScale(
                legendSvg,
                legendWidth,
                legendHeight,
                legendMargin,
                nVerticalTicks,
                colorScaleArray,
                minValue,
                maxValue,
                valueslog,
                scope.valuesLabel,
                scope.hideValuesLabel
            );
        }

        // Draw the contours and fills
        ContourPlotFactory.drawContours(
            svg,
            scope.x,
            scope.y,
            scope.values,
            xAxis.isLog,
            yAxis.isLog,
            valueslog,
            width,
            height,
            colorScale,
            scope.nContours
        );

        // If not hidden, draw the points with tooltip
        if (!scope.hidePoints) {
            let tooltip = d3
                .select(elt)
                .append('div')
                .style('opacity', 0)
                .style('background-color', 'rgba(255,255,255,0.9)')
                .style('border', 'solid')
                .style('border-width', '1px')
                .style('border-radius', '5px')
                .style('position', 'absolute')
                .style('padding', '5px');

            drawPointsWithTooltip(
                svg,
                tooltip,
                scope.xLabel,
                scope.yLabel,
                scope.valuesLabel,
                scope.theData,
                margin,
                xAxis,
                yAxis
            );
        }

        // Final callback
        scope.callback(svg, scope);

        /**
         * Function that draws the data points and moves/updates/shows/hides the tooltip
         * @param {d3 selection} svg : d3 selection of the plot
         * @param {d3 selection} tooltip d3 selection of the tooltip div
         * @param {string} xLabel x axis label
         * @param {string} yLabel y axis label
         * @param {string} valuesLabel values label
         * @param {Object[]} theData Array of objects { x, y, value }
         * @param {Object} margin svg margins
         * @param {Axis} xAxis
         * @param {Axis} yAxis
         */
        function drawPointsWithTooltip(
            svg,
            tooltip,
            xLabel,
            yLabel,
            valuesLabel,
            theData,
            margin,
            xAxis,
            yAxis
        ) {
            // Tooltip values formatters, more precise than axes
            let tooltipNumericFormat = MLChartsCommon.makeTooltipNumericFormatter(3, 4);

            let getTooltipHtml = function (x, y, value, xLabel, yLabel, valuesLabel) {
                return `
                    <table class="mlchart-tooltip__table">
                        <tr>
                            <td class="mlchart-tooltip__label">${valuesLabel}</td>
                            <td class="mlchart-tooltip__value">${value}</td>
                        </tr>
                        <tr>
                            <td class="mlchart-tooltip__label">${xLabel}</td>
                            <td class="mlchart-tooltip__value">${x}</td>
                        </tr>
                        <tr>
                            <td class="mlchart-tooltip__label">${yLabel}</td>
                            <td class="mlchart-tooltip__value">${y}</td>
                        </tr>
                    </table>`;
            };

            // Three function that change the tooltip when user hover / move / leave a cell
            let mouseover = function (d) {
                tooltip
                    .html(
                        getTooltipHtml(
                            tooltipNumericFormat(d.x),
                            tooltipNumericFormat(d.y),
                            tooltipNumericFormat(d.value),
                            xLabel ? xLabel : 'x',
                            yLabel ? yLabel : 'y',
                            valuesLabel ? valuesLabel : 'value'
                        )
                    )
                    .style('opacity', 1);
                d3.select(this).attr('r', 5).style('stroke', 'white');
            };

            let mousemove = function (d) {
                let mousePosition = d3.mouse(this);
                let distance = 5; // Shift the tooltip from the cursor
                let leftOffset = -0.7 * tooltip.node().offsetWidth + margin.left - distance;
                let topOffset = -tooltip.node().offsetHeight + margin.top - distance;

                if (mousePosition[0] + leftOffset < 0) {
                    leftOffset = -0.3 * tooltip.node().offsetWidth + margin.left + distance;
                }
                if (mousePosition[1] + topOffset < 0) {
                    topOffset = margin.top + distance;
                }

                tooltip
                    .style('left', mousePosition[0] + leftOffset + 'px')
                    .style('top', mousePosition[1] + topOffset + 'px');
            };

            let mouseleave = function (d) {
                tooltip.style('opacity', 0).style('left', '0').style('top', '0').html('');
                d3.select(this).attr('r', 3).style('stroke', 'none');
            };

            // Draw the points
            svg.selectAll('.dot')
                .data(theData)
                .enter()
                .append('circle')
                .attr('r', 3)
                .attr('cx', (d) => (xAxis.isLog ? xAxis.scale(Math.log10(d.x)) : xAxis.scale(d.x)))
                .attr('cy', (d) => (yAxis.isLog ? yAxis.scale(Math.log10(d.y)) : yAxis.scale(d.y)))
                .style('fill', 'black')
                .style('opacity', 0.7)
                .style('stroke-width', 1.5)
                .on('mouseover', mouseover)
                .on('mousemove', mousemove)
                .on('mouseleave', mouseleave);
        }
    }
);

chartDirective('univariateDataDistributionChart',
    {data: "=", colors: "="},
    "data",
    function(scope) {
        let binNames;
        if (scope.data.binNames) {
            binNames = scope.data.binNames.slice();
            binNames.push("Others");
        }
        return {
            "binNames": binNames,
            "binCounts": [scope.data.binCountsReference, scope.data.binCountsCurrent].map(
                (serial, i) => {
                    let sum = serial.reduce((acc, curr) => acc + curr, 0);
                    return {
                        values: serial.map( (v, j) => {
                            return {
                                value: v/sum,
                                count: v,
                                category: binNames?binNames[j]:undefined,
                                binIndex: j
                            }
                        }),
                        key: i?"Reference":"Current",
                        color: scope.colors[i]
                    }
                }
            ),
            "binEdges": scope.data.binEdges
        };
    },
    function(scope, element) {
        let width = element.width(),
            height = element.height(),
            margin = {top: 5, right: 5, bottom: 5, left: 5},
            max = scope.theData.binCounts.reduce((acc, curr) => Math.max(acc, curr.values.reduce((acc2, curr2) => Math.max(acc2, curr2.value), 0)), 0);

        let binX;
        if (scope.theData.binNames) {
            binX = scope.theData.binNames;
        } else {
            binX = [];
            for (let i = 0 ; i < scope.theData.binEdges.length -1 ; i++) {
                binX.push(((scope.theData.binEdges[i] + scope.theData.binEdges[i+1])/2).toFixed(2));
            }
        }
        let chart = nv.models.multiBarChart()
                             .width(width)
                             .height(height)
                             .margin(margin)
                             .x((_, i) => binX[i])
                             .y((d) => d.value)
                             .staggerLabels(false)
                             .showControls(false)
                             .showLegend(false)
                             .forceY([0, max])
                             .showXAxis(false)
                             .showYAxis(false)
                             .wrapLabels(true);

        let svg = d3.select(element.get(0)).html('');

        chart.tooltip.contentGenerator( function(data) {
            if (scope.theData.binNames) {
                return [
                    "<p><strong>Origin:</strong>&nbsp;" + data.data.key + "</p>",
                    "<p><strong>Category:</strong>&nbsp;" + data.data.category + "</p>",
                    "<p><strong>Count:</strong>&nbsp;" + data.data.count + "</p>",
                    "<p><strong>%:</strong>&nbsp;" + (data.data.value*100.).toFixed(2) + "</p>"
                ].join('');
            } else {
                return [
                    "<p><strong>Origin:</strong>&nbsp;" + data.data.key + "</p>",
                    "<p><strong>Bin:</strong>&nbsp;" + scope.theData.binEdges[data.data.binIndex] + " - " + scope.theData.binEdges[data.data.binIndex + 1] + "</p>",
                    "<p><strong>Count:</strong>&nbsp;" + data.data.count + "</p>",
                    "<p><strong>%:</strong>&nbsp;" + (data.data.value*100.).toFixed(2) + "</p>"
                ].join('');
            }
        });
        chart.options({tooltip: {chartContainer: document.body }});

        svg.datum(scope.theData.binCounts).transition().duration(100).call(chart);
    }
);
})();
