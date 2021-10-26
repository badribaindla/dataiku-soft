(function(){
'use strict';


    angular.module('dataiku.charts')
    .factory("DKUPivotCharts", function(
        GroupedColumnsChart,
        StackedColumnsChart,
        StackedAreaChart,
        LinesChart,
        LinesZoomer,
        MultiplotChart,
        StackedBarsChart,
        ScatterPlotChart,

        ChartDimension,
        BinnedXYChart,
        GroupedXYChart,
        LiftChart,
        AdministrativeMap,
        ScatterMapChart,
        DensityHeatMapChart,
        GridMapChart,
        BoxplotsChart,
        PivotTableChart,
        Density2DChart,
        PieChart,
        GeometryMapChart,
        WebappChart) {
        return {
            GroupedColumnsChart: GroupedColumnsChart,
            StackedColumnsChart: StackedColumnsChart,
            StackedAreaChart: StackedAreaChart,
            LinesChart: LinesChart,
            LinesZoomer: LinesZoomer,
            MultiplotChart: MultiplotChart,
            StackedBarsChart: StackedBarsChart,
            PivotTableChart: PivotTableChart,
            ScatterPlotChart : ScatterPlotChart,

            BinnedXYChart: BinnedXYChart,
            GroupedXYChart: GroupedXYChart,
            LiftChart: LiftChart,
            AdministrativeMap:AdministrativeMap,
            ScatterMapChart : ScatterMapChart,
            DensityHeatMapChart : DensityHeatMapChart,
            GridMapChart:GridMapChart,
            BoxplotsChart:BoxplotsChart,
            Density2DChart:Density2DChart,
            PieChart : PieChart,
            GeometryMapChart: GeometryMapChart,
            WebappChart : WebappChart
        };
    });

    var app = angular.module('dataiku.directives.insights', ['dataiku.filters', 'dataiku.charts']);

    app.directive('pivotChartResult', function($rootScope, $timeout, Assert, $q, DKUPivotCharts, Logger, ChartUtils, ChartFeatures, CanvasUtils) {

        return {
            templateUrl: '/templates/simple_report/pivot-chart-result.html',
            scope: true,
            link: function(scope, element) {
                var buildAxesDef = function(dims) {
                    var axesDef = {};
                    var i = 0;
                    dims.forEach(function(dim) {
                        if (ChartUtils.has(scope.chart.def[dim[1]])) {
                            axesDef[dim[0]] = i++;
                        }
                    });
                    return axesDef;
                };

                var redrawChart = function() {
                    var axesDef;
                    scope.uiDisplayState = scope.uiDisplayState || {};
                    scope.uiDisplayState.displayBrush = false;
                    scope.uiDisplayState.brushData = {};
                    switch (scope.chart.def.type) {
                        case "grouped_columns":
                            axesDef = buildAxesDef([
                                ['x', 'genericDimension0'],
                                ['color', 'genericDimension1'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.GroupedColumnsChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "multi_columns_lines":
                            axesDef = buildAxesDef([
                                ['x', 'genericDimension0'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.MultiplotChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "stacked_columns":
                            axesDef = buildAxesDef([
                                ['x', 'genericDimension0'],
                                ['color', 'genericDimension1'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.StackedColumnsChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;


                        case "lines":
                            axesDef = buildAxesDef([
                                ['x', 'genericDimension0'],
                                ['color', 'genericDimension1'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.LinesChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse, scope.getExecutePromise, {disableChartInteractivityGlobally: scope.disableChartInteractivityGlobally}, scope.uiDisplayState, scope.chartActivityIndicator, DKUPivotCharts.LinesZoomer);
                            break;


                        case "stacked_bars":
                            axesDef = buildAxesDef([
                                ['y', 'genericDimension0'],
                                ['color', 'genericDimension1'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.StackedBarsChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "stacked_area":
                            axesDef = buildAxesDef([
                                ['x', 'genericDimension0'],
                                ['color', 'genericDimension1'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.StackedAreaChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case 'binned_xy':
                            axesDef = buildAxesDef([
                                ['x', 'xDimension'],
                                ['y', 'yDimension'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.BinnedXYChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case 'grouped_xy':
                            axesDef = buildAxesDef([
                                ['group', 'groupDimension'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.GroupedXYChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "pie":
                            axesDef = buildAxesDef([
                                ['color', 'genericDimension0'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.PieChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case 'lift':
                            axesDef = buildAxesDef([
                                ['group', 'groupDimension'],
                                ['facet', 'facetDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.LiftChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "scatter":
                            DKUPivotCharts.ScatterPlotChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope, scope.response.result.pivotResponse);
                            break;

                        case "pivot_table":
                            axesDef = buildAxesDef([
                                ['x', 'xDimension'],
                                ['y', 'yDimension'],
                                ['animation', 'animationDimension']
                            ]);
                            DKUPivotCharts.PivotTableChart(element.find(".pivot-table-container").css('display', ''), scope.chart.def, scope, axesDef, scope.response.result.pivotResponse);
                            break;

                        case "boxplots":
                            element.find(".boxplots-container").show();
                            DKUPivotCharts.BoxplotsChart(element.find(".boxplots-container"), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "admin_map":
                            DKUPivotCharts.AdministrativeMap(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "grid_map":
                            DKUPivotCharts.GridMapChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "scatter_map":
                            DKUPivotCharts.ScatterMapChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "density_heat_map":
                            DKUPivotCharts.DensityHeatMapChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "geom_map":
                            DKUPivotCharts.GeometryMapChart(element.find(".pivot-charts").css('display', ''), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "density_2d":
                            element.find(".direct-svg").show();
                            DKUPivotCharts.Density2DChart(element.find(".direct-svg").get(0), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;

                        case "webapp":
                            element.find(".webapp-charts-container").show();
                            DKUPivotCharts.WebappChart(element.find(".webapp-charts-container"), scope.chart.def, scope.response.result.pivotResponse, scope);
                            break;


                        default:
                            throw new Error("Unknown chart type: " + scope.chart.def.type);
                    }
                };

                var redraw =  function() {

                    if (!scope.response || !scope.response.hasResult) return;
                    element.children().children().hide();

                    scope.response.graphValid = true;
                    // for debug
                    element.attr("chart-type", scope.chart.def.type);

                    try {
                        Logger.info("Draw", scope.chart.def.type);
                        redrawChart();
                    } catch (err) {
                        if (err instanceof ChartIAE) {
                            Logger.warn("CHART IAE", err);
                            scope.validity.valid = false;
                            scope.validity.type = "DRAW_ERROR";
                            scope.validity.message = err.message;
                        } else {
                            throw err;
                        }
                    }

                    scope.updateThumbnail();
                };

                scope.updateThumbnail = function() {
                    if (ChartFeatures.isExportableToImage(scope.chart.def) && !scope.noThumbnail) {
                        Logger.info("Computing thumbnail");

                        var updateEl = function(bigCanvas) {
                            var small = document.createElement("canvas");
                            small.setAttribute("width", 60);
                            small.setAttribute("height", 40);
                            var smCtx = small.getContext("2d");
                            smCtx.drawImage(bigCanvas, 0, 0, 60, 40);

                            scope.chart.def.thumbnailData = small.toDataURL();
                            Logger.info("Done")
                        };

                        var w, h;
                        if (scope.chart.def.type === "boxplots") {
                            scope.exportBoxPlots().then(updateEl);
                            return;
                        }

                        if (scope.chart.def.type === "density_2d") {
                            w = element.find("svg.direct-svg").width();
                            h = element.find("svg.direct-svg").height();
                        } else {
                            if (element.find("svg.chart-svg").children().size() === 0) {
                                return;  // the chart might not have been drawn yet
                            }
                            w = element.find("svg.chart-svg").width();
                            h = element.find("svg.chart-svg").height();
                        }
                        scope.exportData(w, h, true).then(updateEl);
                    } else {
                        delete scope.chart.def.thumbnailData;
                    }
                };

                scope.$on('resize', redraw);
                scope.$on('redraw', redraw);

                function redrawThis(e, ui) {
                    if (e.target === window) {
                        redraw();
                    }
                }

                $(window).on('resize', redrawThis);
                scope.$on('$destroy', function() {
                    $(window).off('resize', redrawThis);
                });

                scope.$on("export-chart", function() {
                    scope.export();
                });

                scope.export = function() {
                    if (scope.chart.def.type === 'boxplots') {
                        scope.exportBoxPlots().then(function (canvas) {
                            CanvasUtils.downloadCanvas(canvas, scope.chart.def.name + ".png");
                        });
                        return;
                    }

                    var $svg;
                    if (scope.chart.def.type === 'density_2d') {
                        $svg = element.find("svg.direct-svg");
                    } else {
                        $svg = element.find("svg.chart-svg");
                    }

                    var w = $svg.width();
                    var h = $svg.height();
                    scope.exportData(w, h).then(function(canvas) {
                        CanvasUtils.downloadCanvas(canvas, scope.chart.def.name + ".png");
                    });
                };

                scope.exportData = function(w, h, simplified, svgEl, noTitle) {
                    /**
                     * Compute a multiplier coefficient enabling to scale passed dimensions to reach an image containing the same amount of pixels as in a 720p image.
                     * @param w: width of original image that we'd like to scale to HD
                     * @param h: height of original image that we'd like to scale to HD
                     * @returns c so that (w * c) * (h * c) = 921600, the number of pixels contained in a 720p image
                     */
                    function getCoeffToHD(w, h) {
                        const nbPixelsHD = 921600; //nb pixels contained in a 720p image
                        const multiplier =Math.sqrt(nbPixelsHD / (w*h)); // so that (w*multiplier) * (h*multiplier) = nbPixelsHD
                        return multiplier;
                    }

                    /**
                     * @returns a canvas that fits the passed dimensions
                     */
                    function generateCanvas(w, h) {
                        var canvas = document.createElement("canvas");
                        canvas.setAttribute("width", w);
                        canvas.setAttribute("height", h);
                        return canvas;
                    }

                    /**
                     * @returns the svg that contains the chart.
                     */
                    function getChartSVG() {
                        var svg;
                        if (angular.isDefined(svgEl)) {
                            svg = svgEl.get(0);
                        } else if (scope.chart.def.type === 'density_2d') {
                            svg = element.find("svg.direct-svg").get(0);
                        } else {
                            svg = element.find("svg.chart-svg").get(0);
                        }
                        return svg;
                    }

                    /**
                     * Adapted from https://code.google.com/p/canvg/issues/detail?id=143
                     * @param svg: the SVG to get cloned
                     * @returns a clone of the passed SVG
                     */
                    function cloneSVG(svg) {
                        var clonedSVG = svg.cloneNode(true);
                        var $clonedSVG = $(clonedSVG);
                        let $svg = $(svg);
                        $clonedSVG.width($svg.width());
                        $clonedSVG.height($svg.height());
                        return clonedSVG;
                    }

                    /**
                     * @returns A style element containing all the CSS rules relative to charts
                     */
                    function getChartStyleRules() {
                        const svgNS = "http://www.w3.org/2000/svg";
                        let style = document.createElementNS(svgNS, "style");
                        style.textContent += "<![CDATA[ .totallyFakeClassBecauseCanvgParserIsBuggy  {}\n"; // Yes it's ugly
                        for (var i=0;i<document.styleSheets.length; i++) {
                            var str = document.styleSheets[i].href;
                            if (str != null && str.substr(str.length-10) === "charts.css"){
                                var rules = document.styleSheets[i].cssRules;
                                for (var j=0; j<rules.length; j++){
                                    style.textContent += (rules[j].cssText);
                                    style.textContent += "\n";
                                }
                                break;
                            }
                        }
                        style.textContent += "{]]>"; // "{" is here to workaround CanVG parser brokenness
                        return style;
                    }

                    /**
                     * Looks for a canvas hosted in a foreignObject element in the passed svg, scale it, and add it to the passed canvas
                     * @params svg: the svg that might contain a canvas in a foreignObject
                     * @param canvas: the canvas that we want to add the scatter canvas to
                     * @params scale: the scaling coefficient that we want to apply to the scatter canvas
                     */
                    function addInnerCanvasToCanvas(svg, canvas, scale, verticalOffset) {
                        let $svg = $(svg);
                        var $foreignObject = $svg.find('foreignObject'),
                            x = parseFloat($foreignObject.attr('x')),
                            y = parseFloat($foreignObject.attr('y')),
                            width = parseFloat($foreignObject.attr('width')),
                            height = parseFloat($foreignObject.attr('height'));
                        var origCanvas = $foreignObject.find('canvas').get(0);
                        canvas.getContext('2d').drawImage(origCanvas, x * scale, (y + verticalOffset) * scale, width * scale, height * scale);
                    }

                    /**
                     * Add the passed title to the passed canvas
                     * @param canvas: canvas that we want to add a title to
                     * @param title: title that will be added to the canvas
                     * @params scale: the scaling coefficient that we want to apply to the title
                     */
                    function addTitleToCanvas(canvas, title, titleHeight, scale) {
                        let ctx = canvas.getContext('2d');
                        ctx.textAlign = "center";
                        ctx.textBaseline="middle";
                        ctx.font='normal normal 100 ' + 18*scale + 'px sans-serif';
                        ctx.fillStyle = "#777";
                        ctx.fillText(title, canvas.width/2, titleHeight*scale / 2);
                    }

                    /**
                     * @param canvas: the canvas that we want to add the legend to
                     * @params scale: the scaling coefficient that we want to apply to the DOM's legend
                     * @returns A promise that will resolve when the legend is added to the canvas
                     */
                    function addLegendToCanvas(canvas, scale, verticalOffset) {
                        let d = $q.defer();
                        let $legendDiv = element.find('.legend-zone');
                        if ($legendDiv.size() === 0) {
                            d.resolve()
                        } else {
                            let legendOffset = $legendDiv.offset();
                            let wrapperOffset = element.find('.chart-wrapper').offset();

                            let legendX = legendOffset.left - wrapperOffset.left;
                            let legendY = legendOffset.top - wrapperOffset.top + verticalOffset;
                            CanvasUtils.htmlToCanvas($legendDiv, scale).then(function(legendCanvas) {
                                canvas.getContext('2d').drawImage(legendCanvas, legendX*scale, legendY*scale, legendCanvas.width, legendCanvas.height)
                                d.resolve();
                            })
                        }
                        return d.promise;
                    }

                    // -- BEGINNING OF FUNCTION --

                    let deferred = $q.defer();
                    const chartTitle = simplified ? false : scope.chart.def.name;
                    const verticalOffset = chartTitle ? 50 : 0;
                    const dimensions = {w:w, h:h + verticalOffset};

                    // Creating a HD canvas that will "receive" the svg element
                    const scale = getCoeffToHD(dimensions.w, dimensions.h);
                    let canvas = generateCanvas(dimensions.w * scale, dimensions.h * scale);

                    if (!simplified) {
                        CanvasUtils.fill(canvas, "white");
                    }

                    // Getting a clone SVG to inject in the canvas
                    let svg = getChartSVG();
                    Assert.trueish(svg, "The chart was not found in the page");
                    let clonedSVG = cloneSVG(svg);
                    clonedSVG.insertBefore(getChartStyleRules(), clonedSVG.firstChild); //adding css rules

                    clonedSVG.setAttribute("transform", "scale("+ scale +")"); // scaling the svg samely as we scaled the canvas
                    if (simplified){
                        d3.select(clonedSVG).selectAll("text").remove();
                        d3.select(clonedSVG).selectAll(".axis").remove();
                        d3.select(clonedSVG).selectAll(".hlines").remove();
                        d3.select(clonedSVG).selectAll(".legend").remove();
                    }

                    // Filling the canvas element that we created with the svg
                    const svgText = new XMLSerializer().serializeToString(clonedSVG);
                    canvg(canvas, svgText, {offsetY: chartTitle ? 50 : 0, ignoreDimensions: true, ignoreClear: true, renderCallback: function() { $timeout(canvas.svg.stop); } });

                    // In the case of scatter chart, the all chart content is already a canvas hosted in a foreignObject. Yet canvg doesn't handle foreignObjects, we'll manually copy the scatter canvas in the canvg canvas
                    if (scope.chart.def.type === 'scatter') {
                        addInnerCanvasToCanvas(svg, canvas, scale, verticalOffset);
                    }

                    // Adding chart's title
                    if (chartTitle && !noTitle) {
                        addTitleToCanvas(canvas, chartTitle, verticalOffset, scale);
                    }

                    // Adding chart's legend
                    if (!simplified && scope.chart.def.legendPlacement.startsWith('INNER')) {
                        addLegendToCanvas(canvas, scale, verticalOffset).then(_ => deferred.resolve(canvas));
                    } else {
                        deferred.resolve(canvas);
                    }

                    return deferred.promise;
                };

                scope.exportBoxPlots = function() {
                    var deferred = $q.defer();

                    var svg1 = element.find("svg.noflex");
                    var svg2 = element.find("div.flex.oa > svg");

                    scope.exportData(svg1.width(), svg1.height(), false, svg1, true).then(function(canvas1) {
                        scope.exportData(svg2.width(), svg2.height(), false, svg2).then(function(canvas2) {
                            var canvas = document.createElement("canvas");
                            canvas.setAttribute("width", parseInt(canvas1.getAttribute("width")) + parseInt(canvas2.getAttribute("width")));
                            canvas.setAttribute("height", parseInt(canvas1.getAttribute("height")) + (scope.chart.def.name ? 50 : 0));
                            canvas.getContext('2d').drawImage(canvas1, 0, 0);
                            canvas.getContext('2d').drawImage(canvas2, parseInt(canvas1.getAttribute("width")), 0);

                            deferred.resolve(canvas);
                        });
                    });

                    return deferred.promise;
                };

                scope.$watch("response", function(nv, ov) {
                    if (nv == null) return;
                    if (!scope.response.hasResult) return;
                    $timeout(redraw);
                });
            }
        };
    });
})();
