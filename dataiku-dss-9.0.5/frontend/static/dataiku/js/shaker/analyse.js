(function(){
'use strict';

const app = angular.module('dataiku.shaker.analyse', ['dataiku.filters', 'platypus.utils']);

    function mesure(attr, def) {
        if (!attr) { return def; }
        var m = parseInt(attr);
        return m && !isNaN(m) ? m : def;
    }
    function svgElement(selector, width, height) {
        return d3.select(selector)
                .style({width: "100%", "max-width": width + "px"})
            .append("div").classed('d3-container', true) // fixed aspect ratio padding trick:
                .style({ position: "relative", "padding-top": (height * 100 / width) + "%" })
            .append("svg")
                .style({ width: "100%", position: "absolute", top: 0, bottom: 0 })
                .attr("viewBox", "0 0 " + width + " " + height)
                .attr("preserveAspectRatio", "xMinYMin meet");
    }
    function dateFormatter(asDate) {
        return (d) => {
            try {
                return (new Date(d)).toISOString().replace(/([^T]+)T(\d\d:\d\d):(\d\d)(\.\d+)?Z(.*)/, asDate);
            }
            catch (e) {
                return d3.format("s")(d);
            }
        }
    }

    app.directive("histogram", function($filter, NumberFormatter) {
        return {
            restrict: 'ECA',
            replace: true,
            template: '<div class="d3graph" />',
            scope: { data: '=', isDate: '=' },
            link: function(scope, element, attrs){
                var selector = $(element).get(0),
                    width  = mesure(attrs.width,  560),
                    height = mesure(attrs.height, 120);

                scope.$watch("data", function() {
                    if (scope.data == null) {
                        return;
                    }
                    d3.select(selector).selectAll('.d3-container').remove();

                    var min = scope.data.min,
                        max = scope.data.max,
                        asDate = scope.isDate,
                        bottom = 40;
                    for(var i in scope.data.chistogram) {
                        var val = scope.data.chistogram[i];
                        min = Math.min(min, val[0]);
                        max = Math.max(max, val[1]);
                    }

                    if (asDate) {
                        var days = (max - min) / 86400000;
                        if (days / 24 <= 1) { asDate = '$2:$3'; bottom = 50; }
                        else if (days <= 2) { asDate = '$2'; }
                        else { asDate = '$1'; bottom = 50; }
                    }

                    var svg = svgElement(selector, width, height + bottom).append("g"),
                        xscale = d3.scale.linear().domain([min, max]).range([0, width]),
                        yscale = d3.scale.linear().domain([0, scope.data.longestHistogramBar]).range([0, height]);

                    var barWidth = width / scope.data.chistogram.length;

                    var tooltip = d3.select("body").append("div")
                            .attr("class", "histogramtooltip")
                            .style("opacity", 0).style("top", "0");

                    /* Each datum is [lb, hb, value]*/
                    var entry = svg.selectAll("g.histogramentry").data(scope.data.chistogram).enter()
                        .append("g").attr("class", "histogramentry")
                        .on("mouseover", function(d, i) {
                            tooltip.transition().duration(400).style("opacity", 1);
                            var lowerBracket = i === 0 ? "[" : "(";
                            var lowerValue = scope.isDate ? $filter('utcDate')(d[0], 'YYYY-MM-DD HH:mm:ss') : d[0].toFixed(2);
                            var upperValue = scope.isDate ? $filter('utcDate')(d[1], 'YYYY-MM-DD HH:mm:ss') : d[1].toFixed(2);
                            tooltip.html(lowerBracket + " {0} , {1} ] - {2} rows".format(lowerValue,
                                         upperValue, Math.round(d[2])))
                                .style("left", (d3.event.pageX) + "px")
                                .style("top", (d3.event.pageY - 28) + "px");
                        })
                        .on("mouseout", function(d) {
                            tooltip.transition().duration(500).style("opacity", 0);
                        });
                    entry.append("rect").attr("class", "histogrambar")
                        .attr("x", function(d) { return xscale(d[0]); })
                        .attr("y", function(d) { return height - yscale(d[2]);})
                        .attr("width", barWidth-1)
                        .attr("height", function(d) { return yscale(d[2]);});
                    entry.append("rect").attr("class", "histogramhover")
                        .attr("x", function(d) { return xscale(d[0]); })
                        .attr("y", 0)
                        .attr("width", barWidth-1)
                        .attr("height", height);

                    const axisFormatter = asDate ? dateFormatter(asDate) : NumberFormatter.get(min, max, 10, false, false);

                    var drawnAxis = svg.append("g")
                        .attr("class", "x axis")
                        .style('fill', '#999')
                        .style('stroke', '#999')
                        .attr("transform", "translate(0," + height + ")")
                        .call(d3.svg.axis().scale(xscale).orient("bottom")
                                .tickFormat(axisFormatter));
                    drawnAxis.selectAll("text")
                        .style('stroke', 'none')
                        .style("text-anchor", "end")
                        .attr("dx", "-.8em")
                        .attr("dy", ".15em")
                        .attr("transform", "rotate(-35)");
                });
            }
        };
    });

    app.directive("miniHistogram", function() {
        return {
            restrict: 'ECA',
            replace: true,
            template: '<div class="d3graph" />',
            scope: { values: '=', activateBar: '=?' },
            link: function(scope, element, attrs){
                var selector = $(element).get(0),
                    width  = mesure(attrs.width,  500),
                    height = mesure(attrs.height, 180);

                scope.$watch("values", function() {
                    if (!scope.values) {
                        return;
                    }
                    d3.select(selector).selectAll('.d3-container').remove();

                    var nBars = Math.max(scope.values.length, 10), // ensure max bar width
                        barWidth = width / nBars,
                        min = Math.min.apply(Math, scope.values),
                        max = Math.max.apply(Math, scope.values);

                    var svg = svgElement(selector, width, height).append("g"),
                        xscale = d3.scale.linear().domain([0, nBars]).range([0, width]),
                        yscale = d3.scale.linear().domain([Math.min(0, min), max]).range([0, height]);

                    /* Each datum is the value */
                    var entry = svg.selectAll("g.histogramentry").data(scope.values).enter()
                        .append("g").attr("class", "histogramentry");
                    if (scope.activateBar) {
                        entry.on("mouseover", scope.activateBar)
                             .on("mouseout", scope.activateBar.bind(null, null));
                    }
                    entry.append("rect").attr("class", "histogrambar")
                        .attr("x", function(d, i) { return xscale(i); })
                        .attr("y", function(d) { return height - yscale(d);})
                        .attr("width", barWidth - 1)
                        .attr("height", yscale);
                    entry.append("rect").attr("class", "histogramhover")
                        .attr("x", function(d, i) { return xscale(i); })
                        .attr("y", 0)
                        .attr("width", barWidth - 1)
                        .attr("height", height);
                });
            }
        };
    });

    app.directive("barChart", function() {
        return {
            restrict: 'ECA',
            replace: true,
            template: '<div class="d3graph" />',
            scope: {
                data: '=data',
                count: '=count'
            },
            link: function(scope, element, attrs){
                var selector = $(element).get(0),
                    width =  mesure(attrs.width,  500),
                    baseHeight = mesure(attrs.height, 180);

                scope.$watch("data", function() {
                    if (!scope.data || !scope.data.percentages || !scope.data.percentages.length) {
                        return;
                    }
                    d3.select(selector).selectAll('.d3-container').remove();
                    const count = Math.min(scope.data.percentages.length, scope.count || 7),
                        height = count * baseHeight / scope.count,
                        svg = svgElement(selector, width, height + 40).append("g"),
                        max = Math.max.apply(Math, scope.data.percentages.slice(0, count)),
                        xscale = d3.scale.linear().domain([0, max]).range([0, width]),
                        yscale = d3.scale.linear().domain([0, count]).range([0, height]),
                        perCent = d3.format(".1%"),
                        barHeight = height / count,
                        ti = 0;

                    svg.selectAll("rect").data(scope.data.percentages.slice(0, count)).enter().append("rect")
                        .attr("class", "histogrambar")
                        .attr("x", 0)
                        .attr("y", function(d, i) { return yscale(i); })
                        .attr("width", function(d) { return xscale(d); })
                        .attr("height", barHeight - 1);

                    svg.append("g").attr("transform", "translate(10, 3)")
                        .selectAll("text").data(scope.data.percentages.slice(0, count)).enter().append("text")
                        .text(function(d, i) { return [scope.data.values[i],
                            " (", perCent(scope.data.percentages[i]), ")"].join(""); })
                        .attr("x", 0)
                        .attr("y", function(d, i) { return yscale(i) + barHeight / 2; });

                    const drawnAxis = svg.append("g")
                        .attr("class", "x axis")
                        .style('fill', '#999')
                        .style('stroke', '#999')
                        .attr("transform", "translate(0," + height + ")")
                        .call(d3.svg.axis().scale(xscale).orient("bottom")
                            .tickFormat(perCent));
                    drawnAxis.selectAll("text")
                        .style('stroke', 'none')
                        .style("text-anchor", "end")
                        .attr("dx", "-.8em")
                        .attr("dy", ".15em")
                        .attr("transform", "rotate(-35)");
                });
            }
        };
    });

    app.directive('boxPlot', function() {
        return {
            restrict: 'ECA',
            replace: true,
            template: '<div class="d3graph" />',
            scope : {
                data : '=data',
            },
            link: function(scope, element, attrs){
                var selector = $(element).get(0),
                    height = mesure(attrs.height, 25),
                    width  = mesure(attrs.width,  560),
                    fill = '#C4E0FE',   // digital-blue-lighten-4
                    stroke = '#000';

                scope.$watch("data", function() {
                    if (scope.data == null) {
                        return;
                    }

                    d3.select(selector).selectAll('.d3-container').remove();

                    var svg = svgElement(selector, width, height).append("g");

                    var x1 = d3.scale.linear()
                    .domain([scope.data.min, scope.data.max])
                    .range([0, width]);

                    var center = svg.selectAll("line.center")
                    .data([scope.data])
                    .enter().insert("svg:line", "rect")
                    .attr("class", "center")
                    .attr("x1", function(d) { return x1(d.lowWhisker); })
                    .attr("y1", height/2)
                    .attr("x2", function(d) { return x1(d.highWhisker); })
                    .attr("y2", height / 2)
                    .style("opacity", 1)
                    .style("stroke", stroke);

                    var box = svg.selectAll("rect.box").data([scope.data])
                    .enter().append("svg:rect")
                    .attr("class", "box")
                    .attr("x", function(d) { return x1(d.quartiles[0]); })
                    .attr("y", 0) // Avoid margin issues
                    .attr("width", function(d) { return x1(d.quartiles[2]) - x1(d.quartiles[0]);})
                    .attr("height", height) // Avoid margin issues
                    .attr("fill", fill)
                    //.attr("stroke", fill)
                    .style("opacity", "1");

                    var median = svg.selectAll("line.median").data([scope.data])
                    .enter().append("svg:line")
                    .attr("class", "median")
                    .attr("y1", 0)
                    .attr("x1", function(d) { return x1(d.median); })
                    .attr("y2", height)
                    .attr("x2", function(d) { return x1(d.median); })
                    .style("stroke", stroke);

                    var whiskers = svg.selectAll("line.whisker").data([scope.data.lowWhisker, scope.data.highWhisker])
                    .enter().append("svg:line")
                    .attr("class", "whisker")
                    .attr("y1", height * 0.3)
                    .attr("x1", function(d) { return x1(d); })
                    .attr("y2", height * 0.7)
                    .attr("x2", function(d) { return x1(d); })
                    .style("stroke", stroke);

                    svg.selectAll("text.whisker").data([scope.data.lowWhisker, scope.data.highWhisker])
                    .enter().append("svg:text")
                    .attr("class", "whisker")
                    .attr("dy", ".3em")
                    .attr("dx", 6)
                    .attr("x", width)
                    .attr("y", x1).style("font-size", "12px")
                    .text(function(d) { return d.toPrecision(3);});

                    svg.selectAll("text.box").data(scope.data.quartiles)
                    .enter().append("svg:text")
                    .attr("class", "box")
                    .attr("dy", ".3em")
                    .attr("dx", function(d, i) { return i & 1 ? 6 : -6; })
                    .attr("x", function(d, i) { return i & 1 ? width : 0; })
                    .attr("text-anchor", function(d, i) { return i & 1 ? "start" : "end"; })
                    .attr("y", x1).style("font-size", "12px")
                    .text(function(d) { return d.toPrecision(3);});
                });
            }
        };
    });

app.directive('analyseFullSampleToggle', function($stateParams, DataikuAPI, CreateModalFromTemplate, FutureWatcher, FutureProgressModal) {
    return {
        scope: false,
        restrict: 'A',
        templateUrl: "/templates/shaker/analyse-full-sample-toggle.html",
        link: function($scope, element, attrs) {
            function generateSampleModes() {
                function makeMode(label, partitionId) {
                    return {
                        useFullSampleStatistics: true,
                        label: label,
                        partitionId: partitionId
                    };
                }
                const modes = [{
                    useFullSampleStatistics:false,
                    label:"Sample"
                }];
                if ($scope.datasetFullInfo.partitioned) {
                    if ($scope.shaker && $scope.shaker.explorationSampling && $scope.shaker.explorationSampling.selection) {
                        const selection = $scope.shaker.explorationSampling.selection;
                        if (selection.partitionSelectionMethod == 'ALL') {
                            modes.push(makeMode("Whole data", "ALL"));
                        } else if (selection.partitionSelectionMethod == 'LATEST_N') {
                            // todo : get the list of the latest n partitions in the front
                            modes.push(makeMode("Whole data", "ALL"));
                        } else {
                            selection.selectedPartitions.forEach(function(partitionId) {
                                modes.push(makeMode("Whole " + partitionId, partitionId));
                            });
                        }
                    } else {
                        modes.push(makeMode("Whole data", "ALL"));
                    }
                } else {
                    modes.push(makeMode("Whole data", "NP"));
                }
                $scope.sampleModes = modes;
                const old = $scope.sampleMode;
                $scope.sampleMode = modes.filter(function(m) {
                    return old && m.useFullSampleStatistics == old.useFullSampleStatistics && m.partitionId == old.partitionId;
                })[0];
                if ($scope.sampleMode == null) {
                    // use the sample as default
                    $scope.sampleMode = $scope.sampleModes[0];
                }
            }
            $scope.sampleModes = [];
            $scope.sampleMode = null;
            generateSampleModes();
            // prepare the data for the partition selection of the full sample pane (if partitioned)
            var updateSampleMode = function() {
                $scope.uiState.useFullSampleStatistics = $scope.sampleMode ? $scope.sampleMode.useFullSampleStatistics : false;
                $scope.uiState.fullPartitionId = $scope.sampleMode ? $scope.sampleMode.partitionId : null;
            };
            updateSampleMode();
            $scope.$watch('sampleMode', updateSampleMode);

            $scope.prefix = attrs.prefix;

            $scope.configureFullSampleStatistics = function(initial) {
                var origFullSampleStatistics = initial ? null : angular.copy($scope.shaker.fullSampleStatistics);
                CreateModalFromTemplate("/templates/shaker/analyze-full-sample-config.html", $scope, "AnalyzeFullSampleConfigController").then(function(decision) {
                    if (decision && decision.save) {
                        if (!angular.equals(origFullSampleStatistics, $scope.shaker.fullSampleStatistics)) {
                            $scope.autoSaveForceRefresh();
                        }
                    }
                    if (decision && decision.compute) {
                        $scope.doComputeFullMetrics($scope.columnName, false); // no need to wait for the shaker refresh, we send the $scope.shaker.fullSampleStatistics in the compute call
                    }
                });
            };
            if ($scope.uiState) {
                // put it also in the uiState to share with links in the modal
                $scope.uiState.configureFullSampleStatistics = $scope.configureFullSampleStatistics;
            }
            $scope.doComputeFullMetrics = function(columnName, forceRefresh) {
                // columnName null means 'do all columns'
                $scope.fatalAPIError = null;
                DataikuAPI.datasets.computeDetailedColumnMetrics($stateParams.projectKey, $stateParams.datasetName, columnName, $scope.shaker.fullSampleStatistics, $scope.uiState.fullPartitionId, forceRefresh).success(function(data) {
                    $scope.computingFullMetrics = data;
                    $scope.computingModalHandle = FutureProgressModal.reopenableModal($scope, $scope.computingFullMetrics, "Computing metrics…");
                    $scope.computingModalHandle.promise.then(function(result) {
                        // success
                        $scope.computingFullMetrics = null;
                        $scope.$eval(attrs.callback)();
                        const errorRuns = result && result.runs && result.runs.filter(_ => _.error);
                        if (errorRuns && errorRuns.length) {
                            $scope.lastComputeResult = {runs: errorRuns, startTime: result.startTime, endTime: result.endTime};
                        } else {
                            $scope.lastComputeResult = null;
                        }
                    }, function(data) {
                        $scope.computingFullMetrics = null;
                    });
                    $scope.showProgressModal();
                }).error(setErrorInScope.bind($scope));
            };

            $scope.showProgressModal = function (jobId) {
                if ($scope.computingModalHandle && $scope.computingModalHandle.open) {
                    $scope.computingModalHandle.open();
                }
            };

            $scope.abortComputingFullMetrics = function() {
                DataikuAPI.futures.abort($scope.computingFullMetrics.jobId).error(setErrorInScope.bind($scope));
            };

            var updateUseFullSampleStatistics = function() {
                if ($scope.uiState.useFullSampleStatistics && (($scope.shaker && $scope.shaker.fullSampleStatistics == null) || ($scope.analysis && $scope.analysis.fullSampleStatistics == null))) {
                    var doConfigure = function() {
                        DataikuAPI.datasets.getFullSampleStatisticsConfig($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName).success(function(data) {
                            if ($scope.shaker) {
                                $scope.shaker.fullSampleStatistics = data;
                            }
                            if ($scope.analysis) {
                                $scope.analysis.fullSampleStatistics = data;
                            }
                            $scope.configureFullSampleStatistics(data); // will do the save
                        }).error(setErrorInScope.bind($scope));
                    };
                
                    // first time activating statistics on the full dataset for this dataset => 
                    if ($scope.columnFilter) {
                        // columns-view mode: all ready, we have the multi-column analysis already
                        doConfigure();
                    } else {
                        // single-column-header mode (ie the modal)
                        // 1) fetch with full-sample statistics
                        $scope.refreshAnalysis().then(function(data) {
                            // 2) if still all empty, ask for the configuration then compute
                            var stillNoGood = false; // whether we have the count of values serves as a check that something was ever computed
                            if (data.fullSampleAnalysis == null) {
                                stillNoGood = true;
                            } else if (data.fullSampleAnalysis.categorical == null) {
                                stillNoGood = true;
                            } else if (data.fullSampleAnalysis.categorical.count == null) {
                                stillNoGood = true;
                            } else if (data.fullSampleAnalysis.categorical.count.value == null) {
                                stillNoGood = true;
                            }
                            if (stillNoGood) {
                                doConfigure();
                            }
                        });
                    }
                }
            };
            $scope.$watch('uiState.useFullSampleStatistics', updateUseFullSampleStatistics);

            $scope.$watch('shaker.explorationSampling.selection', generateSampleModes, true);
        }
    }
});


app.controller("AnalyzeFullSampleConfigController", function($scope, DataikuAPI, $stateParams, $timeout, $filter,
        TableChangePropagator, WT1, LoggerProvider, Fn, CreateModalFromTemplate) {
    WT1.event("analyse-full-sample-configuration-open");

    $scope.uiState = {
        tab: 'METRICS'
    };
});


app.controller("ColumnAnalysisController", function($scope, DataikuAPI, $stateParams, $timeout, $filter,
        Assert, TableChangePropagator, WT1, LoggerProvider, Fn, $q) {

    WT1.event("analyse-open");

    var Logger = LoggerProvider.getLogger('ColumnAnalysisController');

    $scope.tcp = TableChangePropagator;
    $scope.uiState = {
        activeTab: "categorical",
        useFullSampleStatistics: false,
        fullPartitionId: null
    };
    $scope.$watch('uiState.fullPartitionId', function(nv, ov) {
        // note: (null == undefined) = true but (null === undefined) = false
        if (nv != null && ov != null && !angular.equals(ov, nv)) {
            $scope.refreshAnalysis();
        }
    });

    /* Main initialization + column change function */
    $scope.setColumn  = function(column, columns) {
        var changed = $scope.columnName !== column.name;
        $scope.column = column;
        $scope.columnName = column.name;
        $scope.showNumerical = column.isDouble;
        $scope.isDate  = column.selectedType.name === 'Date';
        $scope.showArray = column.selectedType.name === 'JSONArrayMeaning';
        $scope.showText  = column.selectedType.name === 'FreeText' && $scope.shakerHooks && $scope.shakerHooks.fetchTextAnalysis;
        $scope.showClusters = $scope.shakerHooks && $scope.shakerHooks.fetchClusters;

        if (columns) {  // optional columns list for previous/next
            $scope.columns = columns;
        }
        if ($scope.columns && $scope.columns.length) {
            var columnIndex = $scope.columns.indexOf(column);
            if (columnIndex >= 0) {
                $scope.nextColumn = $scope.columns[columnIndex + 1];
                $scope.prevColumn = $scope.columns[columnIndex - 1];
            }
        }

        if (changed) { // Force the auto-select of analysis type to retrigger
            $scope.analysis = null;
        }
        $scope.textAnalysis = null;
        $scope.refreshAnalysis();

        if ($scope.shaker.fullSampleStatistics && $scope.shaker.fullSampleStatistics.updateOnAnalyzeBoxOpen) {
            $scope.doComputeFullMetrics($scope.columnName, false);
        }
    };
    $scope.updateColumn = function(name) {
        var col = null;
        $scope.table.headers.some(function(h) {
            if (h.name === name) {
                col = h;
                return true;
            }
            return false;
        });
        return col;
    };

    $scope.getFullCHistogram = function() {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.numeric) return null;
        var numeric = $scope.analysis.fullSampleAnalysis.numeric;
        if (numeric.histogram && numeric.histogram.value != null) {
            if (numeric.histogramData) return numeric.histogramData; // cache for $watch
            var histogram = numeric.histogram.value;
            var longestHistogramBar = 0;
            histogram.forEach(function(bin) {longestHistogramBar = Math.max(longestHistogramBar, bin[2]);});
            numeric.histogramData = {min:numeric.min.value, max:numeric.max.value, chistogram:histogram, longestHistogramBar:longestHistogramBar};
            return numeric.histogramData;
        } else {
            return null;
        }
    };
    $scope.getFullBoxplot = function() {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.numeric) return null;
        var numeric = $scope.analysis.fullSampleAnalysis.numeric;
        if ($scope.hasNumeric('median') && $scope.hasNumeric('min') && $scope.hasNumeric('max') && $scope.hasNumeric('p75') && $scope.hasNumeric('p25')) {
            if (numeric.boxplotData) return numeric.boxplotData; // cache for $watch
            var min = numeric.min.value;
            var median = numeric.median.value;
            var max = numeric.max.value;
            var p25 = numeric.p25.value;
            var p75 = numeric.p75.value;
            var iqr = p75 - p25;
            var lowWhisker = Math.max(min, p25 - iqr * 1.5);
            var highWhisker = Math.min(max, p75 + iqr * 1.5);
            numeric.boxplotData = {min:numeric.min.value, max:numeric.max.value, median:median, quartiles:[p25,median, p75], lowWhisker:lowWhisker, highWhisker:highWhisker};
            return numeric.boxplotData;
        } else {
            return null;
        }
    };

    $scope.getFullTop10WithCounts = function() {
        var categorical = $scope.analysis.fullSampleAnalysis.categorical;
        if (categorical.top10WithCounts && categorical.top10WithCounts.value) {
            if (categorical.top10WithCountsData) return categorical.top10WithCountsData; // cache for $watch
            var top10WithCounts = categorical.top10WithCounts.value;
            var total = categorical.count != null && categorical.countMissing != null ? (categorical.count.value + categorical.countMissing.value) : null;
            var top10WithCountsData = [];
            var cum = 0;
            var maxCount = top10WithCounts.length > 0 ? top10WithCounts[0][1] : 0;
            top10WithCounts.forEach(function(pair) {
                var value = pair[0], count = pair[1];
                cum += count;
                var top10WithCountsPoint = {value: value, count:count, cum:cum, maxCount:maxCount};
                if (total != null && total > 0) {
                    top10WithCountsPoint.percent = 100.0 * count / total;
                    top10WithCountsPoint.cumPercent = 100.0 * cum / total;
                }
                top10WithCountsData.push(top10WithCountsPoint);
            });
            categorical.top10WithCountsData = top10WithCountsData;
            return categorical.top10WithCountsData;
        } else {
            return null;
        }
    };

    $scope.numericNeedsRecompute = function(p) {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.numeric) return false;
        if (p in $scope.analysis.fullSampleAnalysis.numeric) {
            var v = $scope.analysis.fullSampleAnalysis.numeric[p];
            return !v.current || (v.value == null && v.reason == null); // no 'reason' field == no reason for missing
        } else {
            return false;
        }
    };
    $scope.hasNumeric = function(p) {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.numeric) return false;
        if (p in $scope.analysis.fullSampleAnalysis.numeric) {
            var v = $scope.analysis.fullSampleAnalysis.numeric[p];
            return v.value != null;
        } else {
            return false;
        }
    };
    $scope.numericsNeedRecompute = function(ps) {
        var need = false;
        ps.forEach(function(p) {need |= $scope.numericNeedsRecompute(p);});
        return need;
    };
    $scope.categoricalNeedsRecompute = function(p) {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.categorical) return false;
        if (p in $scope.analysis.fullSampleAnalysis.categorical) {
            var v = $scope.analysis.fullSampleAnalysis.categorical[p];
            return !v.current || (v.value == null && v.reason == null); // no 'reason' field == no reason for missing
        } else {
            return false;
        }
    };
    $scope.hasCategorical = function(p) {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.categorical) return false;
        if (p in $scope.analysis.fullSampleAnalysis.categorical) {
            var v = $scope.analysis.fullSampleAnalysis.categorical[p];
            return v.value != null;
        } else {
            return false;
        }
    };
    $scope.categoricalsNeedRecompute = function(ps) {
        var need = false;
        ps.forEach(function(p) {need |= $scope.categoricalNeedsRecompute(p);});
        return need;
    };

    $scope.updateUseFullSampleStatistics = function() {
        // leave tabs that are not available in full sample
        if ($scope.uiState.useFullSampleStatistics) {
            if ($scope.uiState.activeTab != 'categorical' && $scope.uiState.activeTab != 'numerical') {
                $scope.uiState.activeTab = 'categorical';
            }
        }
    };
    $scope.$watch('uiState.useFullSampleStatistics', $scope.updateUseFullSampleStatistics);

    $scope.$on("$destroy", $scope.$parent.$on("shakerTableChanged", function() {
        // $scope.column[s] stats may be stale but names should not be -> remap
        $scope.setColumn($scope.updateColumn($scope.columnName),
            !$scope.columns ? null :
                $scope.columns.map(Fn(Fn.prop('name'), $scope.updateColumn)).filter(Fn.SELF));
    }));

    $scope.numData = function(d, interval, long) {
        if ($scope.isDate) {
            if (interval === true) {
                return $filter('friendlyDuration' + (long ? '' : 'Short'))(d);
            } else if (long) {
                return moment(d).toISOString().substring(0, 19) + 'Z'; // drop the milliseconds
            } else {
                return $filter('utcDate')(d, 'YYYY-MM-DD HH:mm:ss');
            }
        }
        return long ? d : $filter('nicePrecision')(d, 5);
    };

    $scope.initializeClusterer = function(){
        Assert.inScope($scope, 'analysis');

        var getNumberOfSpaces = function(str){
            return str.split(" ").filter(function(v){return v !== '';}).length - 1;
        }

        var facet = $scope.analysis.alphanumFacet;

        var lengthTotal = 0;
        var spacesTotal = 0;
        for (var i in facet.values) {
            spacesTotal += getNumberOfSpaces(facet.values[i]);
            lengthTotal += facet.values[i].length;
        }

        // Parameters for the clusterer
        $scope.cp.meanLength = Math.round(lengthTotal / facet.values.length);
        $scope.cp.meanSpaces = Math.round(spacesTotal / facet.values.length);
        var nValues = facet.totalNbValues;
        // if average word length is high, clustering is slower

        if (!$scope.cp.initialized){
            if (nValues >= 1500) {
                $scope.cp.blockSize = SpeedLevel.FAST;
            } else {//if (nValues >= 200) {
                $scope.cp.blockSize = SpeedLevel.MID;
            } /*else {
                $scope.cp.blockSize = SpeedLevel.SLOW;
            }*/
        }

        if($scope.cp.meanSpaces < 1){
            $scope.cp.setBased = "false";
        } else {
            $scope.cp.setBased = "true";
        }
    }

    $scope.refreshAnalysis = function() {
        let deferred = $q.defer();
        var first = $scope.analysis == null;
        var setAnalysis = function(data) {
            $scope.analysis = data;

            if (first) {
                if($scope.showNumerical && data.alphanumFacet.totalNbValues > 15) {
                    $scope.uiState.activeTab = 'numerical';
                } else {
                    $scope.uiState.activeTab = 'categorical';
                }
            }

            if ($scope.analysis.numericalAnalysis){
                var na = $scope.analysis.numericalAnalysis;
                $scope.removeBounds = {
                    "1.5 IQR" : [
                        Math.max((na.quartiles[0] - na.iqr * 1.5), na.min),
                        Math.min((na.quartiles[2] + na.iqr * 1.5), na.max)
                    ],
                    "5 IQR" : [
                        Math.max((na.quartiles[0] - na.iqr * 5), na.min),
                        Math.min((na.quartiles[2] + na.iqr * 5), na.max)
                    ]
                };
            }

            data.alphanumFacet.selected = data.alphanumFacet.values.map(Fn.cst(false));
            data.alphanumFacet.maxRatio = data.alphanumFacet.percentages[0];

            if (data.arrayFacet) {
                data.arrayFacet.selected = [];
                data.arrayFacet.values.forEach(function(){
                    data.arrayFacet.selected.push(false);
                })

            }

            $scope.initializeClusterer();
            deferred.resolve(data);
        };
        
        var failAnalysis = function() {
            deferred.reject("failed");
        };
        
        if ( $scope.shakerHooks.fetchDetailedAnalysis ) {
            $scope.shakerHooks.fetchDetailedAnalysis(setAnalysis, failAnalysis, $scope.columnName, 50, $scope.uiState.fullPartitionId, $scope.uiState.useFullSampleStatistics);
        } else {
            deferred.resolve({});
        }
        return deferred.promise;
    };

    $scope.deleteColumn = function() {
        var goner = $scope.columnName,
            col = $scope.nextColumn || $scope.prevColumn;
        if (col) {
            $scope.setColumn(col);
        }

        $scope.addStepNoPreview("ColumnsSelector", { keep: false, columns: [goner], appliesTo: "SINGLE_COLUMN" }, true);
        $scope.mergeLastColumnDeleters();
        $scope.autoSaveForceRefresh();

        if (!col && $scope.dismiss) { //$scope.dismiss is available in the context of a modal
            $scope.dismiss();
        }
    };

    /*******************************************************
     * Generic "current transform" handling
     *******************************************************/

    $scope.currentTransform = null;
    $scope.cancelTransform = function() {
        $scope.currentTransform = null;
        $scope.merge = null;
        $scope.editRow = null;
    };
    // Cancel current transform at each refresh
    $scope.$watch("analysis", $scope.cancelTransform);

    /*******************************************************
     * 'Edit' category view actions
     *******************************************************/

    $scope.startEditValue = function(rowId, objectScope) {
        if($scope.editRow !== rowId) {
            $scope.editRow = rowId;
            objectScope.newValue = $scope.analysis.alphanumFacet.values[$scope.editRow];
            window.setTimeout(function() {
                document.getElementById('analyseCatEdit' + rowId).focus();
            }, 0);
        }
    };
    $scope.handleKey = function($event) {
        switch ($event.keyCode) {
        case 27:
            $scope.editRow = null;
            $event.stopPropagation();
            return;
        case 13:
            $scope.doneEditing($event.delegateTarget.value);
            $event.preventDefault();
            $event.stopPropagation();
            return;
        }
    };
    $scope.doneEditing = function(newValue) {
        if (!newValue) {
            $scope.editRow = null;
            return;
        }
        if ($scope.editRow === null) return;
        Assert.inScope($scope, 'analysis');

        var facets = $scope.analysis.alphanumFacet.values,
            oldValue = facets[$scope.editRow];

        if (newValue !== oldValue) {
            facets[$scope.editRow] = newValue;
            $scope.editRow = null;

            if(oldValue) {
                $scope.addStepNoPreview("FindReplace", {
                    appliesTo: 'SINGLE_COLUMN',
                    columns: [$scope.columnName],
                    mapping: [{from: oldValue, to: newValue}],
                    normalization: 'EXACT',
                    matching: 'FULL_STRING'
                }, true);
            } else {
                $scope.addStepNoPreview("FillEmptyWithValue", {
                    appliesTo: 'SINGLE_COLUMN',
                    columns: [$scope.columnName],
                    value: newValue
                }, true);
            }
            $scope.mergeLastFindReplaces();
            $scope.autoSaveForceRefresh();
            $scope.cancelTransform();
            WT1.event("analyse-category-merge", {mergedVals: 1});
        } else {
            $scope.editRow = null;
        }
    }

    /*******************************************************
     * Regular category view actions
     *******************************************************/

    $scope.nbSelected = function() {
        return $scope.getSelectedValues().length;
    };
    $scope.getSelectedValues = function() {
        if (!$scope.analysis) return [];
        return $scope.analysis.alphanumFacet.values.filter(Fn.from($scope.analysis.alphanumFacet.selected, 1));
    };
    $scope.selectAllValues = function(sel) {
        if (!$scope.analysis) return;
        $scope.analysis.alphanumFacet.selected.forEach(
            function(s, i) { $scope.analysis.alphanumFacet.selected[i] = sel; });
    };

    /* Merging */
    $scope.merge = null;
    $scope.mergeSelected = function(revert) {
        var vals = $scope.getSelectedValues(),
            target = $scope.merge ? $scope.merge.value : (revert ? "Others" : vals[0]),
            hasVals = revert ? vals.length < $scope.analysis.alphanumFacet.totalNbValues : vals.length > 0;
        if (!hasVals) {
            $scope.cancelTransform();
            return;
        }
        $scope.merge = {
            count: revert ? $scope.analysis.alphanumFacet.totalNbValues - vals.length : vals.length,
            index: null, // selection
            revert: !!revert,
            empty: vals.indexOf('') >= 0,
            value: target
        };
        $scope.currentTransform = "merge";
    };
    $scope.mergeTail = function(index) {
        if (typeof index !== 'number') {
            return;
        }
        $scope.merge = {
            count: $scope.analysis.alphanumFacet.totalNbValues - index - 1,
            index: index,
            revert: false,
            empty: $scope.analysis.alphanumFacet.values.slice(0, index + 1).indexOf('') < 0,
            value: "Others"
        };
        $scope.currentTransform = "merge";
    };
    $scope.execMerge = function() {
        Assert.trueish($scope.merge && $scope.merge.value, 'no merge value');
        var vals;
        function filter(v) {
            return v && v !== $scope.merge.value;
        }

        if (typeof $scope.merge.index === 'number') {  // long tail after index
            vals = $scope.analysis.alphanumFacet.values.slice(0, $scope.merge.index + 1).filter(filter);
            if (!$scope.merge.empty) {
                vals.push('');
            }
            if (!vals.length) return;
            $scope.addStepAndRefresh("LongTailGrouper", {
                column: $scope.columnName,
                replace: $scope.merge.value,
                toKeep: vals
            }, true);
            WT1.event("analyse-category-longtailgroup", {keptVals: vals.length, type: 'below'});

        } else if ($scope.merge.revert) {    // long tail (merge unselected)
            vals = $scope.getSelectedValues().filter(filter);
            if (!$scope.merge.empty) {
                vals.push('');
            }
            if (!vals.length) return;
            $scope.addStepAndRefresh("LongTailGrouper", {
                column: $scope.columnName,
                replace: $scope.merge.value,
                toKeep: vals
            }, true);
            WT1.event("analyse-category-longtailgroup", {keptVals: vals.length, type: 'selection'});

        } else {    // merge selected
            vals = $scope.getSelectedValues().filter(filter);
            if (vals.length) {
                $scope.addStepNoPreview("FindReplace", {
                    appliesTo: 'SINGLE_COLUMN',
                    columns: [$scope.columnName],
                    mapping: vals.map(function(v) { return {from: v, to: $scope.merge.value}; }),
                    normalization: 'EXACT',
                    matching: 'FULL_STRING'
                }, true);
                $scope.mergeLastFindReplaces();
            }
            if ($scope.merge.empty) {
                $scope.addStepNoPreview("FillEmptyWithValue", {
                    appliesTo: 'SINGLE_COLUMN',
                    columns: [$scope.columnName],
                    value: $scope.merge.value
                }, true);
            }
            WT1.event("analyse-category-merge", {mergedVals: vals.length + ($scope.merge.empty ? 1 : 0)});
        }
        $scope.autoSaveForceRefresh();
        $scope.cancelTransform();
    };

    /* Removing, Keeping, Clearing */
    function flagValues(action, values) {
        var touched = 0;
        if (values.indexOf('') >= 0) {
            $scope.addStepNoPreview("RemoveRowsOnEmpty",{
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.columnName],
                keep: action === 'KEEP_ROW'
            }, true);
            values = values.filter(Fn.SELF);
            touched++;
        }
        if (values.length) {
            $scope.addStepNoPreview("FilterOnValue", {
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.columnName],
                action: action,
                matchingMode: 'FULL_STRING',
                normalizationMode: 'EXACT',
                values: values
            }, true);
            touched += values.length;
        }
        if (!touched) return 0;
        if (action === 'REMOVE_ROW' || action === 'KEEP_ROW') {
            $scope.mergeLastDeleteRows();
        }
        $scope.autoSaveForceRefresh();
        return touched;
    }
    $scope.removeRowsOnSelection = function() {
        var n = flagValues('REMOVE_ROW', $scope.getSelectedValues());
        WT1.event("analyse-category-removeselected", {removedVals: n});
    }
    $scope.removeValue = function(index) {
        flagValues('REMOVE_ROW', [$scope.analysis.alphanumFacet.values[index]]);
        WT1.event("analyse-category-removeone");
    }
    $scope.keepValue = function(index) {
        flagValues('KEEP_ROW', [$scope.analysis.alphanumFacet.values[index]]);
        WT1.event("analyse-category-keepone");
    };
    $scope.clearValue = function(index) {
        flagValues('CLEAR_CELL'), [$scope.analysis.alphanumFacet.values[index]]
        WT1.event("analyse-category-clearone");
    };
    $scope.clearCellsOnSelection = function() {
        var n = flagValues('CLEAR_CELL', $scope.getSelectedValues().filter(Fn.SELF));
        WT1.event("analyse-category-clearselected", {clearedVals: n});
    };
    $scope.removeEmpty = function() { flagValues('REMOVE_ROW', ['']); };

    /* Filtering */
    $scope.filterViewOnSelection = function() {
        $scope.addColumnFilter($scope.columnName,
            // transform ['a', 'b'] into {a: true, b: true} for facets
            $scope.getSelectedValues().reduce(function(o, k) { o[k] = true; return o; }, {}),
            "full_string", $scope.column.selectedType.name, $scope.column.isDouble);
        $scope.dismiss();
        $scope.autoSaveForceRefresh();
    };
    $scope.handleInvalids = function(action) {  // e.g. REMOVE_ROW or CLEAR_CELL
        $scope.addStepNoPreview("FilterOnBadType", {
            appliesTo: 'SINGLE_COLUMN',
            columns: [$scope.columnName],
            action: action,
            type: $scope.column.selectedType.name
        }, true);
        if (action === 'REMOVE_ROW' || action === 'KEEP_ROW') {
            $scope.mergeLastDeleteRows();
        }
        $scope.autoSaveForceRefresh();
    };

    /* **************************************************************************
     * Categorical clusterer actions
     * **************************************************************************/

    var SpeedLevel = {FAST: 0, MID: 1, SLOW: 2};

    // cp : clustering parameters
    $scope.cp = {blockSize : SpeedLevel.MID, meanLength : 0, meanSpaces : 0,
        fuzziness : 0, nowComputing : false,
        initialized : false, setBased : false, radius : 0,
        timeOut : 15, clusters : [], mergeValues : [],
        allSelected : false, selected : [], hasTimedOut : false};

    $scope.clustersSelectAll = function() {
        $scope.cp.selected = $scope.cp.selected.map(Fn.cst($scope.cp.allSelected));
    };
    $scope.nbClustersSelected = function() {
        return $scope.cp.selected.filter(Fn.SELF).length;
    };
    $scope.refreshClusterer = function(recur) {
        var lastRecur = true;
        $scope.cp.nowComputing = true;

        var blockSize = 0,
            setBased = $scope.cp.setBased === 'true';
        $scope.cp.selected = [];
        $scope.cp.allSelected = false;
        $scope.cp.mergeValues = [];

        if (setBased){
            switch (+$scope.cp.fuzziness) {
                case 0:  $scope.cp.radius = 0.8;   break; // 4 words out of 5
                case 1:  $scope.cp.radius = 0.775; break;
                case 2:  $scope.cp.radius = 0.75;  break; // 3 words out of 4
            }
        } else {
            // we define slightly fuzzy as 0.5 mistake per word, very fuzzy as 1.5
            var nWords = $scope.cp.meanSpaces + 1;
            switch (+$scope.cp.fuzziness) {
                case 0:  $scope.cp.radius = 0.5; break;
                case 1:  $scope.cp.radius = 1.0; break;
                case 2:  $scope.cp.radius = 1.5; break;
            }
            $scope.cp.radius = Math.max(1, Math.round($scope.cp.radius * nWords));

            // a high blocksize => less calculations => relatively faster
            // we are slowed by a high number of distinct values, not by sample size
            if($scope.cp.meanLength >= 40){ // Usually, a bad idea to compute edit distance
                blockSize = 10;
            } else {
                // 1-9 => 2, 10-19 => 3, 20-29 => 4, 30-39 => 5
                var lowBlockSize = Math.floor($scope.cp.meanLength / 10) + 1;
                Logger.log("Low block size" + lowBlockSize);
                if ($scope.cp.blockSize == SpeedLevel.MID){
                    blockSize = lowBlockSize ;
                } else if ($scope.cp.blockSize == SpeedLevel.FAST){
                    blockSize = lowBlockSize * 2;
                }
            } // blockSize should be between 1 & 10
        }

        var setClusters = function(data) {
            $scope.cp.hasTimedOut = data.timedOut;
            $scope.cp.clusters = data.values;
            $scope.cp.initialized = true;
            $scope.cp.mergeValues = data.values.map(Fn.prop(0));
            $scope.cp.selected = data.values.map(Fn.cst(false));
            $scope.cp.nowComputing = false;
        };
        if ( $scope.shakerHooks.fetchClusters ) {
            $scope.shakerHooks.fetchClusters(setClusters, $scope.columnName, setBased, $scope.cp.radius, $scope.cp.timeOut, blockSize);
        }
    };
    $scope.mergeSelectedClusters = function() {
        var mapping = [],
            index = {},
            mergeCount = 0;
        // we have to go backwards to process smallest clusters first
        // so that the rules are effective in case of nested clusters
        for (var cluster = $scope.cp.selected.length - 1; cluster >= 0; cluster--) {
            if (!$scope.cp.selected[cluster]) continue;
            $scope.cp.clusters[cluster].forEach(function(toMerge) {
                if(!toMerge) {
                    $scope.addStepNoPreview("FillEmptyWithValue", {
                        appliesTo: 'SINGLE_COLUMN',
                        columns: [$scope.columnName],
                        value: $scope.cp.mergeValues[cluster]
                    }, true);
                    mergeCount++;
                } else if (toMerge !== $scope.cp.mergeValues[cluster]) {
                    if (toMerge in index){ // remove
                        mapping.splice(index[toMerge], 1);
                        // updating indexes: reduce by 1 all the indexes that are above
                        // the removed index in mapping array
                        for (var toMergeTmp in index) {
                            if (index[toMergeTmp] > index[toMerge]) {
                                index[toMergeTmp] -= 1;
                            }
                        }
                    }
                    index[toMerge] = mapping.push({from: toMerge, to: $scope.cp.mergeValues[cluster]}) - 1;
                    mergeCount++;
                }
            });
        }

        WT1.event("analyse-category-merge", {mergedVals: mergeCount});
        $scope.addStepNoPreview("FindReplace", {
            appliesTo: 'SINGLE_COLUMN',
            columns: [$scope.columnName],
            mapping: mapping,
            matching: 'FULL_STRING',
            normalization: 'EXACT'
        });
        $scope.mergeLastFindReplaces();
        $scope.autoSaveForceRefresh();
        $scope.cancelTransform();
        $scope.dismiss();
    }

     /*******************************************************
     * Text analysis actions
     *******************************************************/

     $scope.textSettings = {
        normalize: true,
        stem: false,
        clearStopWords: true,
        language: 'english'
    };
    var setTextAnalysis = function(data) {$scope.textAnalysis = data;};
    $scope.computeTextAnalysis = function() {
        if ($scope.shakerHooks.fetchTextAnalysis) {
            $scope.shakerHooks.fetchTextAnalysis(setTextAnalysis, $scope.columnName, $scope.textSettings);
        }
    }
    /*******************************************************
     * Numerical analysis actions
     *******************************************************/

    function niceToPrecision(val, p) {
        if (Math.abs(val) < Math.pow(10, p)) {
            return val.toPrecision(p);
        } else {
            return val.toFixed(0);
        }
    }
    $scope.removeOutliers = function(iqrRatio) {
        var na = $scope.analysis.numericalAnalysis;
        Assert.trueish(na, 'no numericalAnalysis');
        var min = Math.max((na.quartiles[0] - na.iqr * iqrRatio), na.min);
        var max = Math.min((na.quartiles[2] + na.iqr * iqrRatio), na.max);
        WT1.event("analyse-numerical-rmoutliers", {iqrRatio: iqrRatio});

        if ($scope.isDate) {
            $scope.addStepNoPreview("FilterOnDate", {
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.column],
                action: 'KEEP_ROW',
                filterType: 'RANGE',
                min: $scope.numData(min, false, true),
                max: $scope.numData(max, false, true),
                timezone_id: "UTC",
                part: 'YEAR',
                option: 'THIS'
            }, true);
        } else {
            $scope.addStepNoPreview("FilterOnNumericalRange", {
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.columnName],
                action: 'KEEP_ROW',
                min: niceToPrecision(min, 4),
                max: niceToPrecision(max, 4)
            }, true);
        }

        $scope.autoSaveForceRefresh();
    };
    $scope.clipOutliers = function(iqrRatio, clear) {
        var na = $scope.analysis.numericalAnalysis;
        Assert.trueish(na, 'no numericalAnalysis');
        var min = Math.max((na.quartiles[0] - na.iqr * iqrRatio), na.min);
        var max = Math.min((na.quartiles[2] + na.iqr * iqrRatio), na.max);
        WT1.event("analyse-numerical-clipoutliers", {iqrRatio: iqrRatio, clear: !!clear});

        if ($scope.isDate) {
            $scope.addStepNoPreview("FilterOnDate", {
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.column],
                action: 'KEEP_ROW',
                filterType: 'RANGE',
                min: $scope.numData(min, false, true),
                max: $scope.numData(max, false, true),
                timezone_id: "UTC",
                part: 'YEAR',
                option: 'THIS'
            }, true);
        } else {
            $scope.addStepNoPreview("MinMaxProcessor", {
                columns: [$scope.columnName],
                clear: !!clear,
                lowerBound: niceToPrecision(min, 4),
                upperBound: niceToPrecision(max, 4)
            }, true);
        }

        $scope.autoSaveForceRefresh();
    };

    /*******************************************************
     * Array view action
     *******************************************************/

    $scope.arraySelectAll = function(sel) {
        $scope.analysis.arrayFacet.selected = $scope.analysis.arrayFacet.values.map(Fn.cst(sel));
    };
    $scope.arrayNbSelected = function() {
        if (!$scope.analysis) return 0;
        return $scope.analysis.arrayFacet.selected.filter(Fn.SELF).length;
    };
    $scope.getArraySelectedValues = function() {
        if (!$scope.analysis) return [];
        return $scope.analysis.arrayFacet.values.filter(Fn.from($scope.analysis.arrayFacet.selected, 1));
    };
    /* Removing */
    $scope.arrayRemoveSelectedRows = function(keep) {
        var vals = $scope.getArraySelectedValues();
        Assert.trueish(vals.length > 0, 'no selected values');

        vals.forEach(function(val) {
            $scope.addStepNoPreview("FilterOnCustomFormula", {
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.columnName],
                action: keep ? 'KEEP_ROW' : 'REMOVE_ROW',
                expression: 'arrayContains(' + $scope.columnName + ', "' + val.replace(/"/g,"\\\"") + '")'
           }, true);
        })
        WT1.event("analyse-array-removeselected", {removedVals: vals.length});
        $scope.mergeLastDeleteRows();
        $scope.autoSaveAutoRefresh();
    };

});
})();
