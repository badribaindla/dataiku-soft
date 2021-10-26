(function(){
    'use strict';

        angular.module('dataiku.charts')
            .factory('LinesChart',  LinesChart)
            .factory('LinesDrawer', LinesDrawer)
            .factory('LinesBrushDrawer', LinesBrushDrawer)
            .factory('LinesZoomer',  LinesZoomer)
            .factory('LinesUtils',  LinesUtils);

        const CLIP_PATH_ID = 'chart-clip-path';

        function LinesChart(ChartViewCommon, ChartTensorDataWrapper, LinesDrawer, LinesBrushDrawer, LinesUtils, ChartDataUtils, MonoFuture, ChartDimension) {
            return function ($container, chartDef, chartHandler, axesDef, data, pivotRequest, zoomUtils, uiDisplayState, chartActivityIndicator, zoomer) {

                var initialChartData = ChartTensorDataWrapper(data, axesDef);
                var executePivotRequest = MonoFuture().wrap(pivotRequest);

                var facetLabels = initialChartData.getAxisLabels('facet') || [null], // We'll through the next loop only once if the chart is not facetted
                    yExtents = ChartDataUtils.getMeasureExtents(chartDef, data),
                    y1Domain = yExtents.y1.extent,
                    y2Domain = yExtents.y2.extent;

                var linesData = LinesUtils.prepareData(chartDef, initialChartData);
                let isInteractive = ChartDimension.isInteractiveChart(chartDef, zoomUtils.disableChartInteractivityGlobally);
                let handleZoom;

                if (isInteractive && zoomer) {
                    handleZoom = function (xAxis, svgs, chartDef, chartBase, showLoader) {
                        zoomer(xAxis, svgs, chartDef, chartBase, showLoader, drawFrame, executePivotRequest, axesDef, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator, drawBrush);
                    };
                    chartHandler.forceRotation = 0.5;
                } else {
                    chartHandler.forceRotation = undefined;
                }

                var drawFrame = function (frameIdx, chartBase, redraw, chartData = initialChartData) {

                    chartData.fixAxis('animation', frameIdx);

                    if (isInteractive) {
                        chartBase.zoomUtils = chartBase.zoomUtils || {};
                        chartBase.zoomUtils.frameIndex = frameIdx;
                    }

                    facetLabels.forEach(function (facetLabel, facetIndex) {
                        var g = d3.select(chartBase.$svgs.eq(facetIndex).find('g.chart').get(0));
                        LinesDrawer(g, chartDef, chartData.fixAxis('facet', facetIndex), chartBase, linesData, facetIndex, redraw, isInteractive);
                    });
                };

                var cleanFrame = function (chartBase) {
                    facetLabels.forEach(function (facetLabel, facetIndex) {
                        var g = d3.select(chartBase.$svgs.eq(facetIndex).find('g.chart').get(0));
                        LinesUtils.cleanChart(g, chartBase);
                    });
                };

                var drawBrush = function (chartBase, g, brushAxes) {
                    const isAnimated = chartBase.chartData.axesDef.animation !== undefined;
                    const hasSubcharts = facetLabels && facetLabels.length > 1;

                    if (isAnimated || hasSubcharts) {
                        return;
                    }
                    
                    LinesBrushDrawer(g, chartDef, initialChartData, chartBase, linesData, 0, brushAxes);
                }

                let xSpec = { type: 'DIMENSION', mode:'POINTS', dimension: chartDef.genericDimension0[0], name: 'x' };
                if (zoomUtils && zoomUtils.displayInterval) {
                    xSpec.initialInterval = { min: zoomUtils.displayInterval[0], max: zoomUtils.displayInterval[1] }
                }

                ChartViewCommon.initChart(chartDef, chartHandler, initialChartData, $container, drawFrame,
                    xSpec,
                    { type: 'MEASURE', domain: y1Domain, isPercentScale: yExtents.y1.onlyPercent },
                    { type: 'MEASURE', domain: y2Domain, isPercentScale: yExtents.y2.onlyPercent },
                    { type: 'DIMENSION', name: 'color', dimension: chartDef.genericDimension1[0] },
                    handleZoom,
                    zoomUtils
                );
            };
        }
    
        function LinesDrawer(Fn, LinesUtils, ChartDimension) {

            return function(g, chartDef, chartData, chartBase, linesData, facetIndex, redraw, isInteractive) {
                        
                const xDimension = chartDef.genericDimension0[0];
                const emptyBinsMode = xDimension.numParams.emptyBinsMode;
                const xLabels = chartData.getAxisLabels('x');
                const xAxis = chartBase.xAxis;
                const yAxis = chartBase.yAxis;
                const y2Axis = chartBase.y2Axis;
                
                chartBase.DOMUtils = chartBase.DOMUtils || {};
                chartBase.DOMUtils[facetIndex] = chartBase.DOMUtils[facetIndex] || {};

                const wrappers = LinesUtils.drawWrappers(chartDef, chartBase, linesData, g, isInteractive, redraw, 'wrapper', true);

                // During interaction, prevent re-drawing the points and remove them from the DOM for performances.
                if (!redraw) {
                    chartBase.DOMUtils[facetIndex].points = LinesUtils.drawPoints(chartDef, chartBase, chartData, facetIndex, wrappers, xAxis, xLabels, yAxis, y2Axis, xDimension, emptyBinsMode, 5, true);
                } else if (isInteractive && !chartBase.DOMUtils[facetIndex].pointsHaveBeenRemoved) {
                    chartBase.DOMUtils[facetIndex].points.remove();
                    chartBase.DOMUtils[facetIndex].pointsHaveBeenRemoved = true;
                }

                const [lineGenerator, lineGs, lineDashGs] = LinesUtils.configureLines(chartDef, chartData, facetIndex, wrappers, chartBase.DOMUtils[facetIndex].lineGenerator, xAxis, yAxis, y2Axis, xDimension, xLabels, emptyBinsMode, redraw);
    
                chartBase.DOMUtils[facetIndex].lineGenerator = lineGenerator;

                // Add thicker, invisible lines to catch mouseover event
                [lineGs, lineDashGs].forEach(lineGs => {
                    var hiddenLines = lineGs.selectAll('path.masked');

                    if (!redraw) {
                        hiddenLines = hiddenLines.data(function(d) { return [d]; })
                        hiddenLines.enter()
                            .insert('path')
                            .attr('class', 'line masked')
                            .attr('fill', 'none')
                            .attr('stroke-width', '10')
                            .attr('stroke', 'transparent');
                        hiddenLines.exit().remove();
                    }

                    hiddenLines.attr('d', Fn.SELF);
                });
    
                LinesUtils.drawPaths(chartDef, chartBase, chartData, facetIndex, lineGs, xDimension, xLabels, xAxis, yAxis, y2Axis, emptyBinsMode, redraw, !isInteractive, chartDef.strokeWidth, lineDashGs);

                if (!redraw) {
                    const isInteractive = ChartDimension.isInteractiveChart(chartDef, chartBase.zoomUtils && chartBase.zoomUtils.disableChartInteractivityGlobally);
                    // Clip paths to prevent lines from overlapping axis during offline zoom. Not necessary if not interactive.
                    isInteractive && LinesUtils.clipPaths(chartBase, g, wrappers);
                    // Handle hover on line : increase the stroke width by 1 px and show points.
                    let jWrappers = $('g.wrapper');
                    jWrappers.on('mouseover.line', event => LinesUtils.onLineMouseover(event, chartDef));
                    jWrappers.on('mouseout.point', event => LinesUtils.onPointMouseout(event, chartDef));
                }
            }
        }

        function LinesBrushDrawer(LinesUtils) {
            return function(g, chartDef, chartData, chartBase, linesData, facetIndex, brushAxes) {
                
                const xDimension = chartDef.genericDimension0[0];
                const emptyBinsMode = xDimension.numParams.emptyBinsMode;
                const xLabels = chartData.getAxisLabels('x');
                const xAxis = brushAxes.xAxis;
                const yAxis = brushAxes.yAxis;
                const y2Axis = brushAxes.y2Axis;
                const pointsRadius = 1;
                const lineStrokeWidth = 1;

                const wrappers = LinesUtils.drawWrappers(chartDef, chartBase, linesData, g, false, false, 'brush-wrapper', false);

                LinesUtils.drawPoints(chartDef, chartBase, chartData, facetIndex, wrappers, xAxis, xLabels, yAxis, y2Axis, xDimension, emptyBinsMode, pointsRadius, false);

                const [, lineGs, lineDashGs] = LinesUtils.configureLines(chartDef, chartData, facetIndex, wrappers, undefined, xAxis, yAxis, y2Axis, xDimension, xLabels, emptyBinsMode);

                LinesUtils.drawPaths(chartDef, chartBase, chartData, facetIndex, lineGs, xDimension, xLabels, xAxis, yAxis, y2Axis, emptyBinsMode, false, false, lineStrokeWidth, lineDashGs);
            } 
        }

        function LinesZoomer(Debounce, ChartRequestComputer, Logger, LinesChart, ChartDimension, ChartDataUtils, ChartAxes,
                             ChartActivityIndicator, ChartSetErrorInScope) {
            var executePivotRequest, loading, initialCursorPosition, cursorPosition;

            // The greyed out areas that represent missing data in the current aggregation level.
            // They appear when zooming out and panning.
            function createMissingDataArea(g) {
                const area = g.append('rect')
                    .attr('opacity', '0.6')
                    .attr('class', 'missing-data-area')
                    .attr('x', '0')
                    .attr('width', '0')
                    .attr('y', '0')
                    .attr('height', '0')
                    .attr('clip-path', 'url(#' + CLIP_PATH_ID + ')')
                    .style('-webkit-clip-path', 'url(#' + CLIP_PATH_ID + ')')
                    .style('pointer-events', 'none');

                return area;
            }

            function updateMissingDataAreas(chartBase) {
                if (chartBase.zoomUtils.displayIntervalBeforeInteraction && chartBase.zoomUtils.displayIntervalBeforeInteraction !== chartBase.zoomUtils.dataInterval) {
                    const dataIntervalMin = chartBase.zoomUtils.dataInterval[0];
                    const dataIntervalMax = chartBase.zoomUtils.dataInterval[1];
                    const displayIntervalBeforeInteractionMin = chartBase.zoomUtils.displayIntervalBeforeInteraction[0];
                    const displayIntervalBeforeInteractionMax = chartBase.zoomUtils.displayIntervalBeforeInteraction[1];

                    if (displayIntervalBeforeInteractionMin > dataIntervalMin) {
                        const scaledDataIntervalMin = chartBase.xAxis.scale()(dataIntervalMin);
                        const scaledIntervalBeforeInteractionMin = chartBase.xAxis.scale()(displayIntervalBeforeInteractionMin);

                        chartBase.zoomUtils.leftMissingDataAreas.forEach(area => {
                            area.attr('x', scaledDataIntervalMin)
                                .attr('width', scaledIntervalBeforeInteractionMin - scaledDataIntervalMin)
                                .attr('height', chartBase.vizHeight)
                        });
                    }
    
                    if (displayIntervalBeforeInteractionMax < dataIntervalMax) {
                        const scaledDataIntervalMax = chartBase.xAxis.scale()(dataIntervalMax);
                        const scaledIntervalBeforeInteractionMax = chartBase.xAxis.scale()(displayIntervalBeforeInteractionMax);

                        chartBase.zoomUtils.rightMissingDataAreas.forEach(area => {
                            area.attr('x', scaledIntervalBeforeInteractionMax)
                                .attr('width', scaledDataIntervalMax - scaledIntervalBeforeInteractionMax)
                                .attr('height', chartBase.vizHeight)
                        });
                    }
                }
            }

            function cleanZoomListeners(zoom) {
                zoom && zoom.on('zoomstart', null);
                zoom && zoom.on('zoom', null);
                zoom && zoom.on('zoomend', null);
                zoom = null;
            }

            function cleanMissingDataAreas(chartBase) {
                chartBase.zoomUtils.leftMissingDataAreas.forEach(area => {
                    area.attr('x', '0')
                    .attr('y', '0')
                    .attr('width', '0')
                    .attr('height', '0');
                });           
                
                chartBase.zoomUtils.rightMissingDataAreas.forEach(area => {
                    area.attr('x', '0')
                    .attr('y', '0')
                    .attr('width', '0')
                    .attr('height', '0');   
                });
            }

            function addDateToTitle(chartDef, additionalText) {
                let label = chartDef.genericDimension0[0].column;
                if (additionalText) {
                    label += ' (' + additionalText + ')';
                }
                document.querySelectorAll('.x.axis-label').forEach(elem => {
                    elem.textContent = label;
                }); 
            }

            function updateTicksFormat(chartDef, chartBase) {
                let xAxis = chartBase.xAxis;
                const xDomain = xAxis.scale().domain();
                const xMin = xDomain[0];
                const xMax = xDomain[1];

                if (!isFinite(xMin) || !isFinite(xMax)) { return; }

                const computedDateDisplayUnit = ChartDataUtils.computeDateDisplayUnit(xMin, xMax);
                addDateToTitle(chartDef, computedDateDisplayUnit.formattedMainDate);

                xAxis.tickFormat(date => {
                    return computedDateDisplayUnit.formatDateFn(date, computedDateDisplayUnit.dateFormat);
                });
            }

            /**
             * Wrapper for ChartDataUtils.getMeasureExtents().
             *
             * @param {ChartDef.java}   chartDef    - The chart definition.
             * @param {Object}          chartBase   - Everything that the chart might need.
             * @param {Array}           interval    - The x min and max values to use as filter when computing the extents.
             */
            function getYExtentsForInterval(chartBase, chartDef, interval) {

                const xMin = interval[0];
                const xMax = interval[1];
                const chartData = chartBase.chartData
                let results = {};

                const yExtents = ChartDataUtils.getMeasureExtents(chartDef, chartData.data, [xMin, xMax]);
                results.recordsCount = yExtents.recordsCount;
                results.pointsCount = yExtents.pointsCount;

                if (chartBase.yAxis) {
                    results.yExtent = [yExtents.y1.extent[0], yExtents.y1.extent[1]];
                }

                if (chartBase.y2Axis) {
                    results.y2Extent = [yExtents.y2.extent[0], yExtents.y2.extent[1]];
                }

                return results;
            }

            // Scale a given y axis to the given extent and update DOM accordingly.
            function setYDomain(chartDef, yAxis, selector, yExtent) {
                if (!yExtent) { return; }
                let yMin = yExtent[0];
                let yMax = yExtent[1];

                if (chartDef.includeZero) {
                    if (yMin > 0) {
                        yMin = 0;
                    } else if (yMax < 0) {
                        yMax = 0;
                    }
                }

                yAxis.scale().domain([yMin, yMax]);

                [...d3.selectAll(selector)[0]].forEach(yG => {
                    d3.select(yG).call(yAxis);
                });

            }

            function setYDomains(chartDef, chartBase) {
                setYDomain(chartDef, chartBase.yAxis, '.y1.axis', chartBase.zoomUtils.yExtent);
                setYDomain(chartDef, chartBase.y2Axis, '.y2.axis', chartBase.zoomUtils.y2Extent);
            }

            // Constructs the horizontal lines that help readability of chart points. From left axis values in priority, fallback on right axis.
            function updateHLines(chartBase) {
                let yAxis, yMin, yMax;

                if (chartBase.yAxis) {
                    yAxis = chartBase.yAxis;
                    yMin = chartBase.zoomUtils.yExtent[0];
                    yMax = chartBase.zoomUtils.yExtent[1];
                } else if (chartBase.y2Axis) {
                    yAxis = chartBase.y2Axis;
                    yMin = chartBase.zoomUtils.y2Extent[0];
                    yMax = chartBase.zoomUtils.y2Extent[1];
                } else {
                    return; 
                } 

                if (!isFinite(yMin) || !isFinite(yMax)) {
                    return;
                }

                const hLines = document.querySelectorAll('.hlines');

                if (hLines && hLines.length) {
                    hLines.forEach(hLine => hLine.parentNode && hLine.parentNode.removeChild(hLine));
                }
                [...chartBase.zoomUtils.svgs].forEach(svg => {
                    let g = d3.select(svg).select('g');

                    g.insert('g', ':first-child').attr('class', 'hlines')
                        .selectAll('.hline').data(yAxis.tickValues() || yAxis.scale().ticks(yAxis.ticks()[0]))
                        .enter().append('line')
                        .attr('class', 'hline')
                        .attr('y1', function (d) {
                            return yAxis.scale()(d);
                        })
                        .attr('y2', function (d) {
                            return yAxis.scale()(d);
                        })
                        .attr('x1', 0)
                        .attr('x2', chartBase.vizWidth);
                });

                // Also update the x axis domain path (that could move when the chart has both positive and negative values)
                const scaledZero = chartBase.yAxis.scale()(0);
                const pathTranslation = scaledZero - chartBase.vizHeight;
                d3.selectAll('.x.axis path.domain')
                    .attr('transform', `translate(0, ${pathTranslation})`);
            }

            function updateXAxes(xAxis) {
                [...d3.selectAll('.chart-svg .x.axis')[0]].forEach(xG => {
                    xG = d3.select(xG);
                    xG.call(xAxis);
                    xG.selectAll('.tick text')
                        .attr('transform', function() {
                            let labelAngle = 0.5
                            let translateValue = '-33, 15';
                            let rotateValue = labelAngle * -180 / Math.PI;

                            return 'translate(' + translateValue + '), rotate(' + rotateValue + ', 0, 0)';
                        });
                });
            }

            function setXDomain(chartDef, chartBase, xAxis) {
                updateTicksFormat(chartDef, chartBase);
                updateXAxes(xAxis);
            }

            /**
             * Compare a previously saved zoom event to a newer one to know what we are currently doing (zooming, panning...).
             *
             * @param {d3.event} previousZoomEvent  - Previously saved d3 event.
             * @param {d3.event} currentZoomEvent   - Current d3 event.
             *
             * @returns {zoomState} zoomState
             */
            function getCurrentZoomState(previousZoomEvent, currentZoomEvent) {
                let zoomState = {};

                const isZooming = currentZoomEvent.scale !== previousZoomEvent.scale;

                zoomState.isZoomingIn = isZooming && currentZoomEvent.scale > previousZoomEvent.scale;
                zoomState.isPanningLeft = !isZooming && currentZoomEvent.translate[0] > previousZoomEvent.translate[0];
                zoomState.isPanningRight = !isZooming && currentZoomEvent.translate[0] < previousZoomEvent.translate[0];

                return zoomState;
            }

            /**
             * Check if extents of left and right axis are valid ie have:
             *  * Finite numbers
             *  * Different mix and max values
             *
             * @param {Array} yExtent        - Min and max interval for y axis.
             * @param {Array} y2Extent       - Min and max interval for y2 axis.
             *
             * @returns {Boolean} True if both y extents are valid.
             */
            function hasValidYExtents(yExtent, y2Extent) {
                const isYExtentFinite = yExtent && isFinite(yExtent[0]) && isFinite(yExtent[1]);
                const isY2ExtentFinite = y2Extent && isFinite(y2Extent[0]) && isFinite(y2Extent[1]);
                const isYExtentValid = !yExtent || (isYExtentFinite && yExtent[0] !== yExtent[1]);
                const isY2ExtentValid = !y2Extent || (isY2ExtentFinite && y2Extent[0] !== y2Extent[1]);

                return isYExtentValid && isY2ExtentValid;
            }

            /**
             * From a given zoom domain, decide what to do for incoming offline zoom.
             *
             * 1 - (If necessary) adapts the zoomed domain to create a valid display interval:
             *  * Composed of finite numbers.
             *  * Included in the data range.
             *  * Displaying more than one point.
             *
             * 2 - Check if we should rescale x domain for this display interval.
             * 3 - Check if we should prevent the current offline zoom.
             * 4 - Check if we should prevent backend refresh.
             *
             * @param {ChartDef.java}           chartDef        - The chart definition.
             * @param {Object}                  chartBase        - Everything that the chart might need.
             * @param {Array}                   zoomedDomain    - The d3 domain currently zoomed.
             * @param {d3.behavior.zoom}        zoom            - The d3 zoom behavior instance.
             *
             * @returns {Object} { displayInterval: Array, yExtents: Object, shouldRescale: Boolean, preventOfflineZoom: Boolean, preventNextPivotRequest: Boolean }
             */
            function inspectZoom(chartDef, chartBase, zoomedDomain) {
                const zoomedIntervalMin = zoomedDomain[0];
                const zoomedIntervalMax = zoomedDomain[1];
                const dataIntervalMin = chartBase.zoomUtils.dataInterval[0];
                const dataIntervalMax = chartBase.zoomUtils.dataInterval[1];
                const currentPointsCount = chartBase.zoomUtils.pointsCount;

                let inspectedZoom = {
                    displayInterval: [zoomedIntervalMin, zoomedIntervalMax],
                    yExtents: getYExtentsForInterval(chartBase, chartDef, [zoomedIntervalMin, zoomedIntervalMax]),
                    shouldRescale: false,
                    preventOfflineZoom: false,
                    preventNextPivotRequest: false
                }

                const zoomState = getCurrentZoomState(chartBase.zoomUtils.previousZoomEvent, d3.event);
                const isDomainIntervalFinite = isFinite(zoomedDomain[0]) && isFinite(zoomedDomain[1]);

                const isTooMuchOnLeft = zoomedDomain[0] <= dataIntervalMin;
                const isTooMuchOnRight = zoomedDomain[1] >= dataIntervalMax;
                const isPanningLeftTooMuch = zoomState.isPanningLeft && isTooMuchOnLeft;
                const isPanningRightTooMuch = zoomState.isPanningRight && isTooMuchOnRight;
                const isZoomingOutTooMuch = isTooMuchOnLeft && isTooMuchOnRight;
                const hasAlreadyInteracted = (chartBase.zoomUtils.displayIntervalBeforeInteraction[0] !== dataIntervalMin) || (chartBase.zoomUtils.displayIntervalBeforeInteraction[1] !== dataIntervalMax);

                if (!isDomainIntervalFinite) {
                    inspectedZoom.displayInterval = chartBase.zoomUtils.lastValidDisplayInterval;
                }

                if (isTooMuchOnLeft) {
                    inspectedZoom.displayInterval[0] = dataIntervalMin;
                }

                if (isTooMuchOnRight) {
                    inspectedZoom.displayInterval[1] = dataIntervalMax;
                }

                if (isPanningLeftTooMuch || isPanningRightTooMuch) {
                    inspectedZoom.preventOfflineZoom = true;
                }

                if (isZoomingOutTooMuch) {
                    inspectedZoom.displayInterval = chartBase.zoomUtils.dataInterval;
                    if (hasAlreadyInteracted) {
                        inspectedZoom.disableZoomFiltering = true;
                    } else {
                        inspectedZoom.preventNextPivotRequest = true;
                    }
                }

                if (currentPointsCount <= 1 && zoomState.isZoomingIn) {
                    inspectedZoom.preventOfflineZoom = true;
                    inspectedZoom.preventNextPivotRequest = true;
                }

                if (inspectedZoom.displayInterval === undefined) {
                    inspectedZoom.preventOfflineZoom = true;
                }

                inspectedZoom.shouldRescale = (zoomedIntervalMin !== inspectedZoom.displayInterval[0]) || (zoomedIntervalMax !== inspectedZoom.displayInterval[1]);

                return inspectedZoom;
            }

            // Simply updates any useful zoom info for incoming zoom actions.
            function updateZoomUtils(chartBase, inspectedZoom) {

                chartBase.zoomUtils.displayInterval = inspectedZoom.displayInterval;

                if (inspectedZoom.shouldRescale) {
                    chartBase.xAxis.scale().domain([inspectedZoom.displayInterval[0], inspectedZoom.displayInterval[1]]);
                }

                const isDisplayIntervalValid = inspectedZoom.yExtents.pointsCount > 1
                    && hasValidYExtents(inspectedZoom.yExtents.yExtent, inspectedZoom.yExtents.y2Extent)
                    && inspectedZoom.displayInterval[0] !== inspectedZoom.displayInterval[1];

                if (isDisplayIntervalValid) {
                    chartBase.zoomUtils.lastValidDisplayInterval = inspectedZoom.displayInterval;
                }

                chartBase.zoomUtils = { ...chartBase.zoomUtils, ...inspectedZoom.yExtents }
                chartBase.zoomUtils.disableZoomFiltering = inspectedZoom.disableZoomFiltering;
                chartBase.zoomUtils.previousZoomEvent = d3.event;
            }

            function updateBrush(chartBase, uiDisplayState) {
                uiDisplayState.brushData.displayInterval = { from: chartBase.zoomUtils.displayInterval[0], to: chartBase.zoomUtils.displayInterval[1] };
            }

            function redrawChart(chartDef, chartBase, drawFrame, xAxis) {
                setXDomain(chartDef, chartBase, xAxis);
                setYDomains(chartDef, chartBase);
                drawFrame(chartBase.zoomUtils.frameIndex, chartBase, true);
                updateHLines(chartBase);
                updateMissingDataAreas(chartBase);
            }

            /**
             * Listener attached to the chart zoom to perform the offline zooming.
             *
             * @param {ChartDef.java}           chartDef        - The chart definition.
             * @param {Object}                  chartBase       - Everything that the chart might need.
             * @param {d3.behavior.zoom}        zoom            - The d3 zoom behavior instance.
             * @param {Function}                drawFrame       - The callback that will redraw the chart.
             *
             */
            function handleOfflineZoom(chartDef, chartBase, zoom, drawFrame, uiDisplayState) {
                if (chartBase.zoomUtils.offlineZoomDisabled) { return; }
                chartBase.zoomUtils.sequenceId++;
                cursorPosition = d3.event;
                const xAxis = chartBase.xAxis;
                const zoomedDomain = xAxis.scale().domain();
                const inspectedZoom = inspectZoom(chartDef, chartBase, zoomedDomain, zoom);
                chartBase.zoomUtils.preventNextPivotRequest = inspectedZoom.preventNextPivotRequest;
                if (inspectedZoom.preventOfflineZoom) { 
                    if (chartBase.zoomUtils.pointsCount === 0) {
                        uiDisplayState.chartTopRightLabel = ChartDataUtils.computeNoRecordsTopRightLabel();
                    }
                    return; 
                }
                uiDisplayState.hideAggregationsMetrics = true;
                updateZoomUtils(chartBase, inspectedZoom);
                updateBrush(chartBase, uiDisplayState);
                redrawChart(chartDef, chartBase, drawFrame, xAxis);
            }

            function buildChartInteractionErrorMessage(data, status, headers) {
                const knownError = ChartSetErrorInScope.buildValidityForKnownError(data, status, headers);
                if (knownError !== undefined) {
                    return knownError.message;
                } else if (data.message) {
                    return data.message; 
                }
                return 'An unknown error occurred while interacting with the chart.';
            }

            /**
             * Asks for new data inside the given display interval and create a new one accordingly.
             *
             *
             * @param {ChartDef.java}           chartDef                - The chart definition.
             * @param {Object}                  chartBase               - Everything that the chart might need.
             * @param {d3.behavior.zoom}        zoom                    - The d3 zoom behavior instance.
             * @param {Function}                cleanFrame              - The callback that will remove the chart from DOM.
             * @param {Object}                  uiDisplayState          - Everything the UI might need.
             * @param {Object}                  chartActivityIndicator  - Activity indicator displayed in chart
             */
            function computePivotRequest(chartDef, chartBase, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator, request) {

                loading();      
                executePivotRequest(request, false, true).success(function(data) {
    
                    if (data.result.pivotResponse.axisLabels[0] && data.result.pivotResponse.axisLabels[0].length === 1) {
                        Logger.info('Not enough data in the result: chart won\'t be refreshed.');
                        cleanOfflineFeedbacks(chartBase, uiDisplayState);
                        return;
                    }
                    
                    const responseSequenceId = data.result.pivotResponse.sequenceId;
                    
                    if (responseSequenceId === chartBase.zoomUtils.sequenceId) {
                        Logger.info('Sequence ids match (' + responseSequenceId + '). Deactivate offline zoom and refresh the chart.');
                        cleanAll(chartBase, cleanFrame, uiDisplayState);
                        chartBase.zoomUtils.preventThumbnailUpdate = true;
                        chartBase.zoomUtils.offlineZoomDisabled = true;
                        LinesChart($('.pivot-charts').css('display', ''), chartDef, chartHandler, chartBase.zoomUtils.axesDef, data.result.pivotResponse, executePivotRequest, chartBase.zoomUtils, uiDisplayState, chartActivityIndicator, zoomer);
                        uiDisplayState.chartTopRightLabel = ChartDataUtils.computeChartTopRightLabel(
                            data.result.pivotResponse.afterFilterRecords,
                            ChartDimension.getComputedMainAutomaticBinningModeLabel(
                                uiDisplayState, data.result.pivotResponse,
                                chartDef, chartBase.zoomUtils.disableChartInteractivityGlobally)
                        );
                    } else {
                        Logger.info('Sequence ids do not match (' + responseSequenceId + ', ' + chartBase.zoomUtils.sequenceId + '): chart won\'t be refreshed.');
                    }
                }).error(function(data, status, headers) {
                    Logger.info("An error occurred during zoom pivot request");
                    ChartActivityIndicator.displayBackendError(
                        chartActivityIndicator,
                        buildChartInteractionErrorMessage(data, status, headers)
                    );
                    uiDisplayState.chartTopRightLabel = ChartDataUtils.computeNoRecordsTopRightLabel();
                    cleanOfflineFeedbacks(chartBase, uiDisplayState);
                });
            }

            const debouncedPivotRequest = Debounce()
                .withDelay(300, 300)
                .wrap(computePivotRequest);

            function handleOfflineZoomend(chartDef, chartBase, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator) {

                if (chartBase.zoomUtils.offlineZoomDisabled) { 
                    cleanOfflineFeedbacks(chartBase, uiDisplayState);
                    return;
                }

                if (chartBase.zoomUtils.preventNextPivotRequest) {
                    cleanOfflineFeedbacks(chartBase, uiDisplayState);
                    chartBase.zoomUtils.preventNextPivotRequest = false;
                    return;
                }

                let request;
                let wasClick = (initialCursorPosition === cursorPosition);

                initialCursorPosition = {};
                cursorPosition = {};

                if (wasClick) { 
                    cleanOfflineFeedbacks(chartBase, uiDisplayState);
                    return; 
                }

                try {
                    let chartZone = document.querySelector('.chart-zone');
                    let width = chartZone.getBoundingClientRect().width;
                    let height = chartZone.getBoundingClientRect().height;
                    request = ChartRequestComputer.compute(chartDef, width, height, { zoomUtils: chartBase.zoomUtils });
                    request.useLiveProcessingIfAvailable = chartDef.useLiveProcessingIfAvailable;
                    Logger.info('Zoom request is', request);
                } catch(error) {
                    cleanOfflineFeedbacks(chartBase, uiDisplayState);
                    Logger.info('Not executing zoom request, chart is not ready', error);
                }    
            
                debouncedPivotRequest(chartDef, chartBase, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator, request);
            }

            /**
             * Clean every visual feedbacks the user may have when interacting:
             *  - Grey areas for missing data
             *  - Grey text color for top-right aggregations info.
             * 
             * @param {Object}  chartBase       - Everything that the chart might need.
             * @param {Object}  uiDisplayState  - Everything the UI might need.
             */
            function cleanOfflineFeedbacks(chartBase, uiDisplayState) {
                uiDisplayState.hideAggregationsMetrics = false;
                loading(false);
                cleanMissingDataAreas(chartBase);
            }

            /**
             * Clean offline feedbacks, the chart, and every listeners previously attached for interactivity.
             * 
             * @param {Object}      chartBase       - Everything that the chart might need.
             * @param {Function}    cleanFrame      - Function that removes the chart.
             * @param {Object}      uiDisplayState  - Everything the UI might need.
             */
            function cleanAll(chartBase, cleanFrame, uiDisplayState) {
                cleanOfflineFeedbacks(chartBase, uiDisplayState);
                cleanZoomListeners(chartBase.zoomUtils.zoom);
                cleanFrame(chartBase);
            }

            function initZoomUtils(chartDef, chartBase, svgs, axesDef) {
                
                const xAxisDomain = chartBase.xAxis.scale().domain();

                chartBase.zoomUtils = chartBase.zoomUtils || {};
                chartBase.zoomUtils.disableChartInteractivityGlobally = false;

                // DOM related
                chartBase.zoomUtils.svgs = svgs;
                chartBase.zoomUtils.leftMissingDataAreas = [];
                chartBase.zoomUtils.rightMissingDataAreas = [];
                chartBase.zoomUtils.wrappers = null;

                // Axis related
                chartBase.zoomUtils.axesDef = axesDef;
                chartBase.zoomUtils.dataInterval = chartBase.zoomUtils.dataInterval || xAxisDomain;
                chartBase.zoomUtils.displayInterval = chartBase.zoomUtils.displayInterval || chartBase.zoomUtils.dataInterval;
                chartBase.zoomUtils.displayIntervalBeforeInteraction = xAxisDomain;
                chartBase.zoomUtils.lastValidDisplayInterval = chartBase.zoomUtils.displayIntervalBeforeInteraction;
                chartBase.zoomUtils.disableZoomFiltering = false;
                // Will update the counts
                chartBase.zoomUtils = {...chartBase.zoomUtils , ...getYExtentsForInterval(chartBase, chartDef, chartBase.zoomUtils.displayInterval)};

                // Zoom related
                chartBase.zoomUtils.previousZoomEvent = { scale: 1, translate: [0, 0] };
                chartBase.zoomUtils.zoomState = {};
                chartBase.zoomUtils.preventThumbnailUpdate = chartBase.zoomUtils.preventThumbnailUpdate || false;
                if (!chartBase.zoomUtils.sequenceId) {
                    chartBase.zoomUtils.sequenceId = 0;
                }
                chartBase.zoomUtils.offlineZoomDisabled = false;
            } 

            function configureZoom(chartDef, chartBase, chartHandler, xAxis, drawFrame, cleanFrame, uiDisplayState, chartActivityIndicator) {
                const zoom = d3.behavior.zoom();

                chartBase.zoomUtils.zoom = zoom;

                zoom.x(xAxis.scale())
                    .on('zoomstart', () => {
                        if (chartBase.zoomUtils.offlineZoomDisabled) { return; }
                        chartBase.zoomUtils.sequenceId++;
                        cursorPosition = d3.event;
                        initialCursorPosition = cursorPosition;
                        if (!chartBase.zoomUtils.previousZoomEvent) {
                            chartBase.zoomUtils.previousZoomEvent = { scale: 1, translate: [0, 0] };
                        }
                    })
                    .on('zoom', handleOfflineZoom.bind(this, chartDef, chartBase, zoom, drawFrame, uiDisplayState))
                    .on('zoomend', handleOfflineZoomend.bind(this, chartDef, chartBase, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator));

                // Compute the max possible zoom scale for the finest aggregation level (seconds for now) thus preventing zooming too much.
                const finestRangeInSeconds = (chartBase.zoomUtils.displayInterval[1] - chartBase.zoomUtils.displayInterval[0]) / 1000;
                chartBase.zoomUtils.maxScale = Math.log2(finestRangeInSeconds);

                if (chartBase.zoomUtils.dataInterval === chartBase.zoomUtils.displayInterval) {
                    zoom.scaleExtent([1, chartBase.zoomUtils.maxScale]);
                } else {
                    zoom.scaleExtent([0.1, chartBase.zoomUtils.maxScale]);
                }
                
                [...chartBase.zoomUtils.svgs].forEach(svg => {
                    const g = d3.select(svg).select('g.chart');
                    g.call(zoom);
                
                    // d3 won't trigger zoom events on the whole g.chart group. It zooms only on filled elements.
                    // This will enable zoom on the whole chart.
                    g.append('rect')
                        .attr('opacity', '0')
                        .attr('x', '0')
                        .attr('width', chartBase.vizWidth)
                        .attr('y', '0')
                        .attr('height', chartBase.vizHeight)

                    const areaLeft = createMissingDataArea(g);
                    const areaRight = createMissingDataArea(g);

                    chartBase.zoomUtils.leftMissingDataAreas.push(areaLeft);
                    chartBase.zoomUtils.rightMissingDataAreas.push(areaRight);

                    areaLeft.call(zoom);
                    areaRight.call(zoom);
                });

                // Will display more accurate labels
                setXDomain(chartDef, chartBase, xAxis);
            }

            function handleBrushChanged(chartDef, chartBase, drawFrame, chartHandler, xAxis, zoom, cleanFrame, uiDisplayState, chartActivityIndicator) {
                
                const brushInterval = uiDisplayState.brushData.displayInterval;
                
                if (chartBase.zoomUtils.displayInterval[0] === brushInterval.from && chartBase.zoomUtils.displayInterval[1] === brushInterval.to) { return; }
                if (chartBase.zoomUtils.dataInterval[0] === brushInterval.from && chartBase.zoomUtils.dataInterval[1] === brushInterval.to) { chartBase.zoomUtils.disableZoomFiltering = true; }

                chartBase.zoomUtils.sequenceId++;
                chartBase.zoomUtils.displayInterval = [brushInterval.from, brushInterval.to];
                
                xAxis.scale().domain(chartBase.zoomUtils.displayInterval);
                zoom.x(xAxis.scale());
                uiDisplayState.hideAggregationsMetrics = true;
                
                const yExtents = getYExtentsForInterval(chartBase, chartDef, [chartBase.zoomUtils.displayInterval[0], chartBase.zoomUtils.displayInterval[1]]);
                chartBase.zoomUtils = { ...chartBase.zoomUtils, ...yExtents };
                
                redrawChart(chartDef, chartBase, drawFrame, xAxis);
                handleOfflineZoomend(chartDef, chartBase, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator);
            }

            function computeBrushDimensions() {
                let brushDimensions = {};

                const chartDOM = document.querySelector('.graphWrapper');
                const chartClientRect = chartDOM.getBoundingClientRect();
                const chartLeft = chartClientRect.left;

                const hLinesDom = chartDOM.querySelector('.hlines');
                const hLinesClientRect = hLinesDom.getBoundingClientRect();
                const hLinesLeft = hLinesClientRect.left;
                const hLinesWidth = hLinesClientRect.width;

                brushDimensions.paddingLeft = hLinesLeft - chartLeft;
                brushDimensions.width = hLinesWidth;

                return brushDimensions;
            }

            function onBrushInit(chartBase, chartDef, drawBrush) {
                return function(brushContentG, brushContentHeight, brushContentWidth) {

                    const xAxisLogScale = (chartBase.xSpec && chartBase.xSpec.type == "MEASURE" && chartDef.axis1LogScale);

                    const xAxis = ChartAxes.createAxis(chartBase.chartData, chartBase.xSpec, chartBase.isPercentChart, xAxisLogScale);
                    const yAxis = ChartAxes.createAxis(chartBase.chartData, chartBase.ySpec, chartBase.isPercentChart, chartDef.axis1LogScale, chartDef.includeZero);
                    const y2Axis = ChartAxes.createAxis(chartBase.chartData, chartBase.y2Spec, chartBase.isPercentChart, chartDef.axis2LogScale, chartDef.includeZero);

                    xAxis.setScaleRange([0, brushContentWidth]);

                    if (yAxis) {
                        if (chartBase.ySpec.ascendingDown) {
                            yAxis.setScaleRange([0, brushContentHeight]);
                        } else {
                            yAxis.setScaleRange([brushContentHeight, 0]);
                        }
                    }

                    if (y2Axis) {
                        y2Axis.setScaleRange([brushContentHeight, 0]);
                    }

                    const brushAxes = {
                        xAxis: xAxis,
                        yAxis: yAxis,
                        y2Axis: y2Axis
                    }

                    drawBrush(chartBase, brushContentG, brushAxes);
                    chartBase.zoomUtils.hasBrushBeenDrawn = true;
                }
            }

            function configureBrush(chartDef, chartBase, chartHandler, drawFrame, xAxis, zoom, cleanFrame, uiDisplayState, drawBrush, chartActivityIndicator) {

                if (!chartDef.brush) {
                    return;
                }

                if (chartBase.zoomUtils.hasBrushBeenDrawn) {
                    uiDisplayState.brushData.onChange = handleBrushChanged.bind(this, chartDef, chartBase, drawFrame, chartHandler, chartBase.xAxis, zoom, cleanFrame, uiDisplayState, chartActivityIndicator);
                } else {
                    const brushDimensions = computeBrushDimensions();

                    uiDisplayState.brushData = {
                        dataInterval: { from: chartBase.zoomUtils.dataInterval[0], to: chartBase.zoomUtils.dataInterval[1] },
                        displayInterval: { from: chartBase.zoomUtils.displayInterval[0], to: chartBase.zoomUtils.displayInterval[1] },
                        snapRanges: { from: chartBase.zoomUtils.displayInterval[0], to: chartBase.zoomUtils.displayInterval[1] },
                        onChange: handleBrushChanged.bind(this, chartDef, chartBase, drawFrame, chartHandler, xAxis, zoom, cleanFrame, uiDisplayState, chartActivityIndicator),
                        paddingLeft: brushDimensions.paddingLeft,
                        width: brushDimensions.width,
                        onInit: onBrushInit(chartBase, chartDef, drawBrush)
                    }
                }

                uiDisplayState.displayBrush = true;
            }

            function zoomer(xAxis, svgs, chartDef, chartBase, showLoader, drawFrame, pivotRequestCallback, axesDef, chartHandler, cleanFrame, uiDisplayState, chartActivityIndicator, drawBrush) {
                loading = showLoader;
                executePivotRequest = pivotRequestCallback;
                initZoomUtils(chartDef, chartBase, svgs, axesDef);
                configureZoom(chartDef, chartBase, chartHandler, xAxis, drawFrame, cleanFrame, uiDisplayState, chartActivityIndicator);
                configureBrush(chartDef, chartBase, chartHandler, drawFrame, xAxis, chartBase.zoomUtils.zoom, cleanFrame, uiDisplayState, drawBrush, chartActivityIndicator);
            }

            return zoomer;
        }

        function LinesUtils(ChartDimension, Fn) {
            const svc = {

                drawPaths: function(chartDef, chartBase, chartData, facetIndex, lineGs, xDimension, xLabels, xAxis, yAxis, y2Axis, emptyBinsMode, redraw, transition, strokeWidth, lineDashGs) {

                    const paths = lineGs.selectAll('path.visible').data(function(d) { return [d]; });

                    paths.enter()
                        .insert('path')
                        .attr('class', 'line visible')
                        .attr('fill', 'none')
                        .attr('stroke-width', strokeWidth);

                    paths.exit().remove();

                    const dashPaths = lineDashGs.selectAll('path.visible').data(function(d) { return [d]; });

                    dashPaths.enter()
                        .insert('path')
                        .attr('class', 'line visible')
                        .attr('fill', 'none')
                        .attr('stroke-dasharray', 12)
                        .attr('stroke-width', strokeWidth);
                    dashPaths.exit().remove();
                    dashPaths.attr('d', Fn.SELF)

                    if (!transition) {
                        paths.attr('d', Fn.SELF)
                            .each(function() {
                                let path = d3.select(this);
                                let wrapper = d3.select(this.parentNode.parentNode);
                                svc.drawPath(path, wrapper, emptyBinsMode, redraw, chartBase, svc.xCoord, svc.yCoord, chartData, chartDef, xDimension, xLabels, xAxis, yAxis, y2Axis);
                            });
                    } else {
                        paths.transition().attr('d', Fn.SELF)
                            .each('end', function() {
                                let path = d3.select(this);
                                let wrapper = d3.select(this.parentNode.parentNode);
                                svc.drawPath(path, wrapper, emptyBinsMode, redraw, chartBase, svc.xCoord, svc.yCoord, chartData, chartDef, xDimension, xLabels, xAxis, yAxis, y2Axis);
                            });
                    }
                },

                /**
                 * - Build a d3 line generator if none provided.
                 * - In the wrappers, creates <g>s with class "line". 
                 * - Bind to them the data computed by the line generator for the given points data.
                 */
                configureLines: function(chartDef, chartData, facetIndex, wrappers, lineGenerator, xAxis, yAxis, y2Axis, xDimension, xLabels, emptyBinsMode) {
                                
                    if (!lineGenerator) {
                        lineGenerator = d3.svg.line()
                        .x(d => svc.xCoord(xDimension, xLabels, xAxis)(d))
                        .y(d => svc.yCoord(d, chartDef, chartData, yAxis, y2Axis))
                         // in DASHED mode, the dashed lines are drawn separately => we must remove missing values from the main line
                        .defined(x => emptyBinsMode === 'ZEROS' || svc.nonZeroCountFilter(x, facetIndex, chartData));
                        // If smoothing, change the interpolation mode (the process of adding new points between existing ones) to cubic interpolation that preserves monotonicity in y.
                        if (chartDef.smoothing) lineGenerator.interpolate('monotone');
                    }

                    const lineGs = wrappers.selectAll('g.line').data(function(d) {
                        d.filteredPointsData = d.pointsData.filter(d => svc.nonZeroCountFilter(d, facetIndex, chartData));
                        const data = (emptyBinsMode === 'ZEROS' || emptyBinsMode == 'DASHED') ? d.pointsData : d.filteredPointsData;
                        return [lineGenerator(data)];
                    });

                    const lineDashGs = wrappers.selectAll('g.dashedline').data(function(d) {
                        if(emptyBinsMode === 'DASHED') {
                            // null is added after every segment in order to make them disconnected (using defined() below)
                            const data = svc.getEmptySegments(d.pointsData).flatMap(s => [s[0], s[1], null])
                            const segmentGenerator = d3.svg.line()
                                .x(d => svc.xCoord(xDimension, xLabels, xAxis)(d))
                                .y(d => svc.yCoord(d, chartDef, chartData, yAxis, y2Axis))
                                .defined(d => d != null);
                            return [segmentGenerator(data)];
                        }
                        return [];
                    });

                    lineGs.enter().insert('g', ':first-child').attr('class', 'line');
                    lineGs.exit().remove();

                    lineDashGs.enter().insert('g', ':first-child').attr('class', 'dashedline');
                    lineDashGs.exit().remove();

                    return [lineGenerator, lineGs, lineDashGs];
                }, 

                /**
                 * - In the given line wrappers, create <circle> with class "point", a given radius for each points of the lines.
                 * - These points will have a color defined by the color scale and an attached tooltip if requested.
                 */
                drawPoints: function(chartDef, chartBase, chartData, facetIndex, wrappers, xAxis, xLabels, yAxis, y2Axis, xDimension, emptyBinsMode, radius, registerTooltips) {

                    let points = wrappers.selectAll('circle.point');

                    points = points.data(function(d) {
                        return (emptyBinsMode === 'ZEROS') ? d.pointsData : (d.filteredPointsData = d.pointsData.filter(d => svc.nonZeroCountFilter(d, facetIndex, chartData)));
                    }, Fn.prop('x'));
    
                    points.enter().append('circle')
                        .attr('class', 'point point--masked')
                        .attr('r', radius)
                        .attr('fill', function(d) { 
                            return chartBase.colorScale(d.color + d.measure); 
                        })
                        .attr('cy', (yAxis || y2Axis).scale()(0))
                        .attr('opacity', 0)                    
                    
                    if (registerTooltips) {
                        points.each(function(d) { 
                            chartBase.tooltips.registerEl(this, { measure: d.measure, x: d.x, color: d.color, facet: facetIndex }, 'fill', false); 
                        });
                    }
    
                    // Remove potential duplicates
                    points.exit().remove();

                    points.attr('cx', d => svc.xCoord(xDimension, xLabels, xAxis)(d))
                        .attr('cy', d => svc.yCoord(d, chartDef, chartData, yAxis, y2Axis));

                    // Remove points that are not linked to others through lines.
                    wrappers.selectAll('circle.lonely').remove();

                    return points;
                },

                /**
                 * - Creates a <g> (group) element with class "wrapper" for each line to be drawn.
                 * - Joins the lines data with these wrappers.
                 * - Strokes them according to the chart's color scale, set the opacity as per the options, and attach tooltips if requested.
                 * - We need to add a key selector (id) to ensures consistent binding between lines data to lines DOM while zooming.
                 */
                drawWrappers: function(chartDef, chartBase, linesData, g, isInteractive, redraw, className, registerTooltips) {
                    let wrappers = g.selectAll('g.' + className);

                    if (!redraw) {
                        wrappers = wrappers.data(linesData, d => d.id);
                        wrappers.enter().append('g').attr('class', className)
                            .attr('stroke', function(d) { return chartBase.colorScale(d.color + d.measure); })
                            .attr('opacity', chartDef.colorOptions.transparency);

                        if (registerTooltips) {
                            wrappers.each(function(d) { chartBase.tooltips.registerEl(this, { measure: d.measure, color: d.color}, 'stroke', true, isInteractive); });
                        }

                        // Remove the exiting selection ie existing DOM elements for which no new data has been found to prevent duplicates.
                        wrappers.exit().remove();
                    }

                    return wrappers;
                },

                drawPath: function(path, wrapper, emptyBinsMode, redraw, chartBase, xCoord, yCoord, chartData, chartDef, xDimension, xLabels, xAxis, yAxis, y2Axis) {

                    var lineData = wrapper.data()[0];
    
                    // Data points that are not part of a line segment and need to be drawn explicitly
                    let lonelyPoints = [];
                    if (lineData.filteredPointsData.length === 1) {
                        lonelyPoints = [lineData.filteredPointsData[0]];
                    }

                    if (emptyBinsMode === 'DASHED' && !redraw) {
                        let emptySegments = svc.getEmptySegments(lineData.pointsData);

                        if (lineData.filteredPointsData.length > 1) {
                            emptySegments.forEach(function (seg, i) {
                                if (i === 0) {
                                    if (seg[0].$idx === 0) lonelyPoints.push(seg[0]);
                                } else if (i === emptySegments.length - 1 && seg[1].$idx === lineData.filteredPointsData[lineData.filteredPointsData.length - 1].$idx) {
                                    lonelyPoints.push(seg[1]);
                                }
                                if (emptySegments[i+1] && emptySegments[i][1] === emptySegments[i+1][0]) {
                                    lonelyPoints.push(emptySegments[i][1]);
                                }
                            });
                        }
                    }

                    const lonelyCircles = wrapper.selectAll('circle.lonely')
                        .data(lonelyPoints, Fn.prop('x'));

                    lonelyCircles.remove();

                    lonelyCircles.enter().append('circle')
                            .attr('opacity', 1)
                            .attr('class', 'lonely')
                            .attr('fill', function(d) { return chartBase.colorScale(d.color + d.measure); })
                            .style('pointer-events', 'none');

                    if (emptyBinsMode === 'DASHED') {
                        lonelyCircles.attr('r', 2.5)
                            .attr('cy', (chartBase.yAxis || chartBase.y2Axis).scale()(0));
                    } else {
                        // If not in dashed mode, lonely circles are lonely normal points
                        lonelyCircles
                            .attr('r', 4)
                            .attr('opacity', 1)
                    }

                    lonelyCircles.exit().remove();
                    lonelyCircles
                        .attr('cx', d => xCoord(xDimension, xLabels, xAxis)(d))
                        .attr('cy', d => yCoord(d, chartDef, chartData, yAxis, y2Axis));
                },

                // Prevent chart to overlap axes
                clipPaths: function(chartBase, g, wrappers) {
                    const defs = g.append('defs');

                    // Add a bit of margin to handle smoothing mode.
                    defs.append('clipPath')
                        .attr('id', CLIP_PATH_ID)
                        .append('rect')
                        .attr('width', chartBase.vizWidth)
                        .attr('y', -10)
                        .attr('height', chartBase.vizHeight + 10)

                    wrappers.attr('clip-path', 'url(#' + CLIP_PATH_ID + ')');
                    wrappers.style('-webkit-clip-path', 'url(#' + CLIP_PATH_ID + ')');
                },
    
                nonZeroCountFilter: function(d, facetIndex, chartData) {
                    d.$filtered = chartData.getNonNullCount({ x: d.x, color: d.color, facet: facetIndex }, d.measure) === 0;
                    return !d.$filtered;
                },

                xCoord: function(xDimension, xLabels, xAxis) {
                    return svc.getXCoord(xDimension, xAxis, xAxis.ordinalScale, xLabels)
                },

                yCoord: function(d, chartDef, chartData, yAxis, y2Axis) {
                    var val = chartData.aggr(d.measure).get({ x: d.x, color: d.color });
                    if (chartDef.yAxis1LogScale && val == 0) {
                        val = 1;
                    }

                    if (chartDef.genericMeasures[d.measure].displayAxis === 'axis1') {
                        return yAxis.scale()(val);
                    } else {
                        return y2Axis.scale()(val);
                    }
                },

                onLineMouseover: function(event, chartDef) {
                    const wrapper = $(event.target).closest('.wrapper');
                    const parent = wrapper.parent();

                    d3.select(wrapper[0]).select('path.line.visible').attr('stroke-width', chartDef.strokeWidth + 1);
                    parent[0].insertBefore(wrapper[0], parent.find('g.legend')[0]);
                    d3.select(wrapper[0]).selectAll("circle.point").transition(500).attr('opacity', 1);
                },

                onPointMouseout: function(event, chartDef) {
                    const wrapper = $(event.target).closest('.wrapper');
                    d3.select(wrapper[0]).select('path.line.visible').attr('stroke-width', chartDef.strokeWidth);
                    d3.select(wrapper[0]).selectAll("circle.point").transition(250).attr('opacity', 0);
                },

                cleanChart: function(g, chartBase) {
                    const d3Wrappers = g.selectAll('g.wrapper');
                    const wrappers = $('g.wrapper');

                    d3Wrappers.each(function(d) { chartBase.tooltips.unregisterEl(this) });
                    d3Wrappers.selectAll('.point').each(function(d) { chartBase.tooltips.unregisterEl(this) });
                    wrappers.off();
                },
    
                prepareData: function(chartDef, chartData, measureFilter) {
                    var xLabels = chartData.getAxisLabels('x'),
                        colorLabels = chartData.getAxisLabels('color') || [null],
                        linesData = [];
    
                    colorLabels.forEach(function (colorLabel, colorIndex) {
                        chartDef.genericMeasures.forEach(function (measure, measureIndex) {
                            if (measureFilter && !measureFilter(measure)) return;
    
                            linesData.push({
                                id: _.uniqueId('line_'),
                                color: colorIndex,
                                measure: measureIndex,
                                pointsData: xLabels.map(function (xLabel, xIndex) {
                                    return { x: xIndex, color: colorIndex, measure: measureIndex, filtered: true };
                                })
                            });
                        });
                    });
    
                    return linesData;
                },

                // Returns the right accessor for the x-coordinate of a label
                getXCoord: function(dimension, xAxis, ordinalXScale, labels) {
                    if (ChartDimension.isTimeline(dimension)) {
                        return function(d) { return xAxis.scale()(labels[d.x].tsValue);};
                    }  else if ((ChartDimension.isBinnedNumerical(dimension) && !dimension.oneTickPerBin) || ChartDimension.isUnbinnedNumerical(dimension)) {
                        return function(d) { return xAxis.scale()(labels[d.x].sortValue);};
                    } else {
                        return function(d) {
                            return ordinalXScale(d.x) + (ordinalXScale.rangeBand() / 2);
                        };
                    }
                },
                
                getEmptySegments: function(labels) {
                    var emptySegments = [];
                    var segment = [];
                    var inSegment = false;
                    var inLine = false;
                    labels.forEach(function(label, i) {
                        label.$idx = i;
                        if (inLine && label.$filtered) {
                            inSegment = true;
                        } else {
                            inLine = true;
                            if (inSegment) {
                                segment[1] = label;
                                emptySegments.push(segment);
                                segment = [label];
                            } else {
                                segment = [label];
                            }
                            inSegment = false;
                        }
                    });
                    return emptySegments;
                }
            };
            return svc;
        }
    })();
