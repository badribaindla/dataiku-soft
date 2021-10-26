(function(){
'use strict';

const app = angular.module('dataiku.directives.simple_report', [ 'dataiku.charts']);

    app.service("ChartSetErrorInScope", function() {
        function buildErrorValidityObject(message, showRevertEngineButton) {
            return {
                message,
                showRevertEngineButton,
                valid: false,
                type: "COMPUTE_ERROR"
            };
        }

        function buildValidityForKnownError(data, status, headers) {
            var errorDetails = getErrorDetails(data, status, headers);
            if (errorDetails.errorType === "com.dataiku.dip.pivot.backend.model.SecurityAbortedException") {
                return buildErrorValidityObject("Too much data to draw. Please adjust chart settings (" + errorDetails.message + ")", false);
            } else if (errorDetails.errorType === "ApplicativeException") {
                return buildErrorValidityObject(errorDetails.message, false);
            } else if (errorDetails.errorType === "com.dataiku.dip.exceptions.EngineNotAvailableException") {
                return buildErrorValidityObject(errorDetails.message, true);
            }
            return undefined;
        }
        var svc = {
            buildValidityForKnownError: buildValidityForKnownError,
            defineInScope : function(scope) {
                if ('chartSetErrorInScope' in scope) return; // already defined in a higher scope
                scope.validity = {valid : true};
                scope.setValidity = function(validity) {scope.validity = validity;};
                scope.chartSetErrorInScope = function(data, status, headers) {
                    const validity = buildValidityForKnownError(data, status, headers);
                    if (validity) {
                        scope.validity = validity;
                    } else {
                        setErrorInScope.bind(scope)(data, status, headers);
                    }
                };
            }
        };
        return svc;
    });

    // Need in the scope :
    // - "chart" : the chart object, which must contain at least
    //       - data, a ChartSpec object
    //       - summary
    // - "getExecutePromise(request)" : a function that returns a promise
    // DO NOT USE AN ISOLATE SCOPE as there is some communication with drag-drop
    // stuff
    app.directive('chartConfiguration', function(MonoFuture, Debounce, DataikuAPI, LabelsController,
                                                 ChartDimension, ChartRequestComputer, $state, $stateParams, $timeout, DKUtils, PluginsService, Logger,
                                                 ChartChangeHandler, ChartUADimension, _MapCharts, ChartsStaticData, CreateModalFromTemplate, ChartIconUtils, ChartSetErrorInScope, ChartFeatures, ChartActivityIndicator, ChartDataUtils) {
        return {
            restrict: 'AE',
            templateUrl : '/templates/simple_report/chart-configuration.html',
            link: function(scope, element) {
                scope.chartActivityIndicator= ChartActivityIndicator.buildDefaultActivityIndicator();
                ChartSetErrorInScope.defineInScope(scope);
                scope.isInAnalysis = $state.current.name.indexOf('analysis')!=-1;
                scope.isInPredicted = $state.current.name.indexOf('predicted')!=-1;

                if (!scope.chartBottomOffset) {
                    scope.chartBottomOffset = 0;
                }
                scope.optionsFolds = {
                    legend : true,
                    chartMode : true,
                    showTopBar : true
                };
                scope.PluginsService = PluginsService;

                Mousetrap.bind("s h h" , function() {
                    scope.$apply(function(){
                        scope.bigChartSwitch();
                    });
                });
                scope.$on("$destroy", function(){
                    Mousetrap.unbind("s h h");
                });

                scope._MapCharts = _MapCharts;

                scope.fixupCurrentChart = function(){
                    ChartChangeHandler.fixupChart(scope.chart.def);
                };

                scope.bigChart = false;
                scope.bigChartSwitch = function() {
                    scope.bigChart = !scope.bigChart;
                    $('.graphWrapper').fadeTo(0, 0);
                    if (scope.bigChart) {
                        $('.charts-container').addClass('big-chart');
                    } else {
                        $('.charts-container').removeClass('big-chart');
                    }
                    //waiting for the css transition to finish (0.25s, we use 300ms, extra 50ms is fore safety)
                    $timeout(function() {
                        //for binned_xy_hex we need to recompute beacause width and height are taken into account in chart data computing
                        if (scope.chart.def.type=='binned_xy' && scope.chart.def.variant=='binned_xy_hex') {
                            scope.recomputeAndUpdateData();
                            scope.executeIfValid();
                        } else {
                            scope.$broadcast("redraw");
                        }
                        $('.graphWrapper').fadeTo(0, 1);
                    }, 250);
                }

                scope.chartSpecific = {}

                scope.droppedData = [];

                scope.ChartChangeHandler = ChartChangeHandler;
                scope.ChartsStaticData = ChartsStaticData;

                // ------------------------------------------------------
                // only trigger this code once, when the chart is initialized
                var unregister = scope.$watch("chart", function(nv, ov) {
                    if (nv == null) return;
                    unregister();

                    scope.executedOnce = false;

                    if (angular.isUndefined(scope.chart.def)) {
                        Logger.warn("!! BAD CHART !!");
                    }

                    // scope.chart.spec.unregisterWatch = 1;

                    scope.fixupCurrentChart();
                    scope.chartOptionsState = scope.chartOptionsState || { zeroEnabled : true };

                    // STATIC DATA
                    scope.staticData = {}
                    scope.staticData.multiplotDisplayModes = [
                        "column", "line"
                    ];

                    scope.chartTypes = [
                        {
                            type: "grouped_columns",
                            title: "Grouped columns",
                            description: "Use to create a grouped bar chart.<br/> Break down once to create one group of bars per category. Measures provide bars.<br/> Break down twice to create one group of bars per category and one bar for each subcategory."
                        },
                        {
                            type: "stacked_columns",
                            title: "Stacked columns",
                            description: "Use to display data that can be summed.<br/> Break down once with several measures to stack the measures.<br/>  Break down twice to create one stack element per value of the second dimension."
                        },
                        {

                            type: "stacked_area",
                            title: "Stacked area",
                            description: "Use to display data that can be summed.<br/> Break down once with several measures to stack the measures.<br/>  Break down twice to create one stack element per value of the second dimension."
                        },
                        {
                            type: "lines",
                            title: "Lines",
                            description: "Use to compare evolutions.<br/> Break down once with several measures to create one line per measure.<br/>  Break down twice to create one line per value of the second dimension."
                        },
                        {
                            type: "scatter_1d",
                            title: "Grouped scatter plot",
                            description: "Use to view each value of a category as a single circle.<br/> Break down once.<br/> Two measures provide the circle’s X and Y  coordinates. Additional measures provide circle radius and color."
                        },
                        {
                            type: "scatter_2d",
                            title: "Binned XY plot",
                            description: "Use to view the repartition of your data along two axis.<br/> Break down twice to create the X and Y axis of the grid.<br/>  Two measures provide the radius and color of your points."
                        },
                        {
                            type: "diminishing_returns",
                            title: "Diminishing returns chart",
                            description: "Use to compare the weight of different categories in cumulative totals.<br/> Break down once to create categories.<br/> Two  measures provide the X and Y axis, which are displayed cumulatively."
                        },
                        {
                            type : "scatter",
                            title : "Scatter plot",
                            description : "Scatterize"
                        }
                    ];
                    if (PluginsService.isPluginLoaded("geoadmin")){
                        scope.chartTypes.push({
                            type : "map",
                            title : "World map (BETA)",
                            description : "Use to plot and aggregate geo data",
                        });
                    } else {
                        scope.chartTypes.push({
                            type : "map",
                            title : "World map (BETA)",
                            description : "Use to plot and aggregate geo data",
                            disabled : true,
                            disabledReason : "You need to install the 'geoadmin' plugin. Please see documentation"
                        });
                    }

                    scope.allYAxisModes = {
                        "NORMAL": { value : "NORMAL", label : "Normal", shortLabel : "Normal" },
                        "LOG"  : { value : "LOG", label : "Logarithmic scale", shortLabel : "Log" },
                        "PERCENTAGE_STACK" : { value : "PERCENTAGE_STACK", label : "Normalize stacks at 100%", shortLabel: "100% stack" }
                    };
                    scope.allXAxisModes = {
                        "NORMAL": { value : "NORMAL", label : "Normal", shortLabel : "Normal" },
                        "CUMULATIVE" : { value : "CUMULATIVE", label : "Cumulative values", shortLabel : "Cumulative" },
                        "DIFFERENCE" : { value : "DIFFERENCE", label : "Difference (replace each value by the diff to the previous one)",
                                     shortLabel: "Difference" }
                    }
                    scope.allComputeModes = {
                        "NONE": { value : "NONE", label : "No computation", shortLabel : "None" },
                        "LIFT_AVG" : {value : "LIFT_AVG", shortLabel : "Ratio to AVG",
                                     label : "Compute ratio of each value relative to average of values"},
                        "AB_RATIO" : {value : "AB_RATIO", shortLabel : "a/b ratio",
                                    label : "Compute ratio of measure 1 / measure 2"},
                        "AB_RATIO_PCT" : {value : "AB_RATIO_PCT", shortLabel : "a/b ratio (%)",
                                    label : "Compute ratio of measure 1 / measure 2, as percentage"},
                    }

                    scope.legends = [];
                    scope.animation = {};
                    scope.tooltips = {};

                    scope.chartPicker = {};
                    scope.graphError = { error : null };

                    // TODO: this is a temporary fix while we wait for updating the date filters on chart logic as well
                    // We should move back to getDateFilterTypes when this is done
                    scope.dateFilterTypes = ChartDimension.getDateChartFilterTypes();

                    scope.numericalBinningModes = [
                        ["FIXED_NB", "Fixed number of equal intervals"],
                        ["FIXED_SIZE", "Fixed-size intervals"],
                        ["NONE", "None, use raw values"],
                        ["TREAT_AS_ALPHANUM", "Treat as alphanum"]
                    ];

                    scope.emptyBinsModes = [
                        ["ZEROS", "Replace with zeros"],
                        ["AVERAGE", "Link neighbors"],
                        ["DASHED", "Interrupt line"]
                    ];

                   scope.familyToTypeMap = {
                        'basic' : ['grouped_columns', 'stacked_bars', 'stacked_columns', 'multi_columns_lines', 'lines', 'stacked_area', 'pie'],
                        'table' : ['pivot_table'],
                        'scatter' : ['scatter', 'grouped_xy', 'binned_xy'],
                        'map' : ['scatter_map', 'admin_map', 'scatter_map', 'grid_map', 'geom_map', 'density_heat_map'],
                        'other' : ['boxplots', 'lift', 'density_2d'],
                        'webapp' : ['webapp']
                    };

                    scope.isExportableToExcel = ChartFeatures.isExportableToExcel;
                    scope.isExportableToImage = ChartFeatures.isExportableToImage;

                    scope.getDownloadDisabledReason = function() {
                        return ChartFeatures.getExportDisabledReason(scope.chart.def);
                    }

                    scope.canDownloadChart = function() {
                        return scope.validity.valid && (scope.isExportableToExcel(scope.chart.def) || scope.isExportableToImage(scope.chart.def));
                    };

                    scope.typeAndVariantToImageMap = ChartIconUtils.typeAndVariantToImageMap;

                    scope.computeChartPreview = function(type, variant) {
                        var imageName = '';
                        if (typeof(variant)==='undefined') {
                            variant = 'normal';
                        }
                        if (typeof(scope.typeAndVariantToImageMap[type])!=='undefined'
                            && typeof(scope.typeAndVariantToImageMap[type][variant])!=='undefined'
                            && typeof(scope.typeAndVariantToImageMap[type][variant].preview)!=='undefined') {
                            imageName = scope.typeAndVariantToImageMap[type][variant].preview;
                        }
                        if (imageName!='') {
                            return '/static/dataiku/images/charts/previews/' + imageName + '.png';
                        }
                        return false;
                    }

                    scope.request = {};

                    // ------------------------------------------------------
                    // Property accessors and helpers

                    scope.isBinnedNumericalDimension = ChartDimension.isBinnedNumerical.bind(ChartDimension);
                    scope.isTimelineable = ChartDimension.isTimelineable.bind(ChartDimension);
                    scope.isUnbinnedNumericalDimension =  ChartDimension.isUnbinnedNumerical.bind(ChartDimension);
                    scope.isAlphanumLikeDimension =  ChartDimension.isAlphanumLike.bind(ChartDimension);
                    scope.isNumericalDimension = ChartDimension.isNumerical.bind(ChartDimension);

                    scope.ChartUADimension = ChartUADimension;

                    scope.acceptStdAggrTooltipMeasure = function(data){
                        return ChartChangeHandler.stdAggregatedAcceptMeasure(scope.chart.def, data);
                    }

                    scope.acceptUaTooltip  = function(data) {
                        return ChartChangeHandler.uaTooltipAccept(scope.chart.def, data);
                    }

                    scope.acceptFilter = function(data) {
                       var ret = ChartChangeHandler.stdAggregatedAcceptDimension(scope.chart.def, data);
                       if (!ret.accept) return ret;
                       if (data.type == "GEOMETRY" || data.type == "GEOPOINT") {
                            return {
                                accept : false,
                                message : "Cannot filter on Geo dimensions"
                            }
                       }
                       return ret;
                    }

                    scope.dimensionBinDescription = function (dimension) {
                        if (!dimension) return;
                        if (dimension.type == 'NUMERICAL') {
                            if (scope.chart.def.hexbin) {
                                return "";
                            } else if (dimension.numParams) {
                                if (dimension.numParams.mode == 'FIXED_NB') {
                                    return "(" + dimension.numParams.nbBins + " bins)";
                                } else if (dimension.numParams.mode == 'FIXED_SIZE') {
                                    return "(fixed bins)";
                                } else if (dimension.numParams.mode == "TREAT_AS_ALPHANUM") {
                                    return "(text)";
                                }
                            }
                        }
                        return "";
                    };

                    scope.dateModeDescription = ChartDimension.getDateModeDescription;

                    scope.dateModeSuffix = function(mode) {
                        return `(${scope.dateModeDescription(mode)})`;
                    };

                    scope.geoDimDescription = function(dim) {
                         for (var i = 0; i < ChartsStaticData.mapAdminLevels.length; i++){
                            if (dim.adminLevel == ChartsStaticData.mapAdminLevels[i][0]) {
                                return "by " + ChartsStaticData.mapAdminLevels[i][1];;
                            }
                        }
                        return "Unknown";
                    }

                    scope.isFilterDateRange =  ChartDimension.isFilterDateRange;
                    scope.isFilterDatePart =  ChartDimension.isFilterDatePart;
                    scope.isFilterDiscreteDate = ChartDimension.isFilterDiscreteDate;
                    scope.hasFil = ChartFeatures.isExportableToImage;

                    // ------------------------------------------------------
                    // Response handling / Facets stuff

                    scope.filterTmpDataWatchDeregister = null;

                    LabelsController(scope);

                    scope.onResponse = function() {
                        scope.setValidity({valid : true});
                        scope.uiDisplayState = scope.uiDisplayState || {};
                        scope.uiDisplayState.chartTopRightLabel = ChartDataUtils.computeChartTopRightLabel(
                            scope.response.result.pivotResponse.afterFilterRecords,
                            ChartDimension.getComputedMainAutomaticBinningModeLabel(
                                scope.uiDisplayState, scope.response.result.pivotResponse,
                                scope.chart.def, scope.disableChartInteractivityGlobally
                            )
                        );

                        if (scope.chart.summary && scope.response.result.updatedSampleId) {
                            scope.chart.summary.requiredSampleId = scope.response.result.updatedSampleId;
                        }

                        if (scope.filterTmpDataWatchDeregister) {
                            scope.filterTmpDataWatchDeregister();
                        }
                        scope.filterTmpData = [];
                        for (var fIdx = 0; fIdx < scope.chart.def.filters.length; fIdx++ ) {
                            var filter = scope.chart.def.filters[fIdx];
                            var responseFacet = scope.response.result.pivotResponse.filterFacets[fIdx];
                            var tmpData = {values : []};
                            if (filter.filterType == "ALPHANUM_FACET" || filter.columnType == 'ALPHANUM' || ChartDimension.isFilterDiscreteDate(filter)) {
                                for (var v = 0 ; v < responseFacet.values.length; v++) {
                                    var facetVal = responseFacet.values[v];
                                    var excluded = filter.excludedValues[facetVal.id];
                                    tmpData.values.push({id : facetVal.id,
                                                            label : facetVal.label,
                                                             count : facetVal.count,
                                                              included : !excluded});
                                }
                            } else if (filter.columnType == 'NUMERICAL' || ChartDimension.isFilterDateRange(filter)) {
                                tmpData.response = responseFacet;
                                if (filter.minValue != null) {
                                    tmpData.minValue = filter.minValue;
                                } else {
                                    tmpData.minValue = responseFacet.minValue;
                                }
                                if (filter.maxValue != null) {
                                    tmpData.maxValue = filter.maxValue;
                                } else {
                                    tmpData.maxValue = responseFacet.maxValue;
                                }
                            }
                            else {
                                // Nothing to do
                                //console.error("We haven't thought of this case have we?", filter);
                            }
                            scope.filterTmpData.push(tmpData);
                        }

                        scope.filterTmpDataWatchDeregister =  scope.$watch("filterTmpData", function(nv, ov) {
                            for (var fIdx = 0; fIdx < scope.chart.def.filters.length; fIdx++ ) {
                                var filter = scope.chart.def.filters[fIdx];
                                var tmpData = scope.filterTmpData[fIdx];
                                if (filter.filterType == "ALPHANUM_FACET"|| filter.columnType == 'ALPHANUM' || ChartDimension.isFilterDiscreteDate(filter)) {
                                    filter.excludedValues = {};
                                    for (var v = 0; v < tmpData.values.length; v++) {
                                        if (!tmpData.values[v].included) {
                                            filter.excludedValues[tmpData.values[v].id] = true;
                                        }
                                    }
                                } else if (filter.columnType == 'NUMERICAL' || ChartDimension.isFilterDateRange(filter)) {
                                    if (tmpData.minValue != tmpData.response.minValue) {
                                        filter.minValue = tmpData.minValue;
                                    } else {
                                        filter.minValue = null;
                                    }
                                    if (tmpData.maxValue != tmpData.response.maxValue) {
                                        filter.maxValue = tmpData.maxValue;
                                    } else {
                                        filter.maxValue = null;
                                    }
                                }
                            }
                        }, true);
                    };

                    // Wraps scope.getExecutePromise
                    // and add supports for automatic abortion
                    var executePivotRequest = MonoFuture(scope).wrap(scope.getExecutePromise);

                    scope.executeIfValid = function(){
                        var validity = ChartChangeHandler.getValidity(scope.chart);
                        scope.setValidity(validity);
                        // clear the response as well, otherwise when changing the chart, it will
                        // first run once with the new settings and the old response, producing
                        // js errors when something drastic (like chart type) changes
                        scope.previousResponseHadResult = (scope.response && scope.response.hasResult);
                        scope.response = null;

                        if (validity.valid) {
                            Logger.info("Chart is OK, executing");
                            scope.execute();
                        } else {
                            Logger.info("Chart is NOK, not executing", scope.validity);
                        }
                    }

                    // fetch the response
                    scope.execute = Debounce()
                        .withDelay(1,300)
                        .withScope(scope)
                        .withSpinner(true)
                        .wrap(function() {

                            Logger.info("Debounced, executing");
                            scope.executedOnce = true;

                            var request = null;

                            try {
                                var wrapper = element.find('.chart-zone');
                                var width = wrapper.width();
                                var height = wrapper.height();
                                request = ChartRequestComputer.compute(scope.chart.def, width, height, scope.chartSpecific);
                                request.useLiveProcessingIfAvailable = scope.chart.def.useLiveProcessingIfAvailable;
                                Logger.info("Request is", request);
                                scope.graphError.error = null;
                            } catch(error) {
                                Logger.info("Not executing, chart is not ready", error);
                                scope.graphError.error = error;
                            }
                            // We are sure that request is valid so we can generate the name
                            if (!scope.chart.def.userEditedName) {
                                var newName = ChartChangeHandler.computeAutoName(scope.chart.def, scope);
                                if (newName.length > 0) {
                                    scope.chart.def.name = newName;
                                }
                            }

                            scope.filter = {"query" : undefined};
                            resetErrorInScope(scope);

                            scope.excelExportableChart = undefined;
                            var chartDefCopy = angular.copy(scope.chart.def);

                            executePivotRequest(request).update(function(data) {
                                scope.request = request;
                                scope.response = data;

                            }).success(function(data) {
                                // For Excel export
                                scope.excelExportableChart =  {
                                    pivotResponse : data.result.pivotResponse,
                                    chartDef : chartDefCopy
                                };

                                scope.request = request;
                                scope.response = data;
                                scope.onResponse();

                            }).error(function(data,status,headers){
                                scope.response = undefined;
                                if(data && data.hasResult && data.aborted) {
                                    // Manually aborted => do not report as error
                                } else {
                                    scope.chartSetErrorInScope(data, status, headers);
                                }
                            });
                    });

                    var onChartImportantDataChanged = function(nv, ov, lnv, lov){
                        Logger.info("Chart important data changed:" + this + "\nbefore: " + JSON.stringify(lov) +"\nafter:   " + JSON.stringify(lnv));
                        if (nv) {

                            var dataBefore = angular.copy(scope.chart.def);
                            scope.recomputeAndUpdateData();

                            if (!angular.equals(dataBefore, scope.chart.def)) {
                                Logger.info("Data has been modified, not executing --> will execute at next cycle");
                                return;
                            }
                            Logger.info("Triggering executeIfValid");
                            scope.executeIfValid();
                        }
                    }

                    // TODO: Don't forget to update this each time ...

                    // Update of these attributes triggers save + recompute + redraw
                    var important = [
                        "type", "variant", "webAppType",
                        "genericDimension0", "genericDimension1", "facetDimension", "animationDimension", "genericMeasures",
                        "xDimension", "yDimension",
                        "uaXDimension", "uaYDimension",
                        "sizeMeasure", "colorMeasure", "tooltipMeasures",
                        "uaSize", "uaColor", "uaTooltip", "uaShape",
                        "groupDimension", "xMeasure", "yMeasure",
                        "geometry", "boxplotBreakdownDim", "boxplotValue",
                        "filters",
                        "stdAggregatedChartMode", "stdAggregatedMeasureScale",
                        "includeZero", "hexbinRadius", "hexbinRadiusMode", "hexbinNumber", "smoothing", "brush",
                        "axis1LogScale",
                        "useLiveProcessingIfAvailable",
                        "bubblesOptions", "mapGridOptions", "scatterOptions"
                    ];

                    var onChartFrontImportantDataChanged = function(nv, ov, lnv, lov){
                        Logger.info("Chart important front data changed:" + this + "\nbefore: " + JSON.stringify(lnv) +"\nafter:   " + JSON.stringify(lov));
                        if (nv) {
                            scope.saveChart();
                            scope.$broadcast("redraw");
                        }
                    }

                    // Update of these attributes triggers save + redraw
                    var frontImportant = [
                        "colorOptions", "yAxisLabel", "xAxisLabel", "showLegend", "pieOptions", "legendPlacement",
                        "mapOptions", "showXAxis", "strokeWidth", "fillOpacity", "chartHeight", "singleXAxis",
                        "showInChartValues", "showInChartLabels", "showXAxisLabel", "showYAxisLabel", "geoWeight",
                        "webAppConfig"
                    ];

                    var onChartFrontImportantNoRedrawDataChanged = function(nv, ov, lnv, lov){
                        Logger.info("Chart important front data changed:" + this + "\nbefore: " + JSON.stringify(lnv) +"\nafter:   " + JSON.stringify(lov));
                        if (nv) {
                            scope.saveChart();
                        }
                    }

                    // Update of these attributes triggers save
                    var frontImportantNoRedraw = [
                        "animationFrameDuration", "animationRepeat"
                    ];

                    scope.$watch('chart.def', function(nv, ov) {
                        if (!nv) return;
                        if (!ov) {
                            onChartImportantDataChanged.bind("initial")(nv, ov);
                        }
                        var called = false;
                        important.forEach(function(x){
                            if (!angular.equals(nv[x], ov[x])) {
                                if (!called){
                                    onChartImportantDataChanged.bind(x)(nv, ov, nv[x], ov[x]);
                                }
                                called = true;
                            }
                        });
                        if (!called) {
                            var frontImportantCalled = false;
                            frontImportant.forEach(function(x){
                                if (!angular.equals(nv[x], ov[x])) {
                                    if (!frontImportantCalled){
                                        onChartFrontImportantDataChanged.bind(x)(nv, ov, nv[x], ov[x]);
                                    }
                                    frontImportantCalled = true;
                                }
                            });
                        }
                        if (!frontImportantCalled) {
                            var frontImportantNoRedrawCalled = false;
                            frontImportantNoRedraw.forEach(function(x){
                                if (!angular.equals(nv[x], ov[x])) {
                                    if (!frontImportantNoRedrawCalled){
                                        onChartFrontImportantNoRedrawDataChanged.bind(x)(nv, ov, nv[x], ov[x]);
                                    }
                                    frontImportantNoRedrawCalled = true;
                                }
                            });
                        }
                    }, true);

                    scope.$watch("chart.def.thumbnailData", function(nv, ov){
                        if (nv && ov) {
                            scope.saveChart();
                        }
                    });

                    $(window).on('resize.chart_logic', function(e){
                        if (scope.chart.def.type == 'binned_xy' && scope.chart.def.variant == 'binned_xy_hex') {
                            scope.recomputeAndUpdateData();
                            scope.executeIfValid();
                        } else {
                            scope.$broadcast("redraw");
                        }
                        scope.$apply();
                    });
                    scope.$on("$destroy",function() {
                        $(window).off("resize.chart_logic");
                    });

                    scope.forceExecute = function(){
                        scope.recomputeAndUpdateData();
                        scope.executeIfValid();
                    };

                    scope.$on("forceExecuteChart", function(){
                        scope.forceExecute();
                    });
                    scope.$emit("listeningToForceExecuteChart"); // inform datasetChartBase directive that forceExecute() can be triggered through broadcast

                    scope.redraw = function() {
                        scope.$broadcast('redraw');
                    };

                    scope.revertToLinoEngineAndReload = function(){
                        scope.chart.engineType = "LINO";
                        scope.forceExecute();
                    }


                    // ------------------------------------------------------
                    // Recompute/Update handlers
                    scope.recomputeAndUpdateData = function() {
                        ChartChangeHandler.fixupSpec(scope.chart, scope.chartOptionsState);

                        scope.canHasTooltipMeasures = [
                            "multi_columns_lines",
                            "grouped_columns",
                            "stacked_columns",
                            "stacked_bars",
                            "grid_map",
                            "lines",
                            "stacked_area",
                            "admin_map",
                            "pie",
                            "binned_xy"].includes(scope.chart.def.type);

                        scope.canAnimate = ChartFeatures.canAnimate(scope.chart.def.type);
                        scope.canFacet = ChartFeatures.canFacet(scope.chart.def.type, scope.chart.def.variant, scope.chart.def.webAppType);
                        scope.canFilter = ChartFeatures.canFilter(scope.chart.def.type, scope.chart.def.variant, scope.chart.def.webAppType);

                        scope.canHaveUaTooltips = ["scatter", "scatter_map", "geom_map", "density_heat_map"].includes(scope.chart.def.type);

                        return;
                    };

                    scope.setChartType = function(type, variant, webAppType) {
                        if (scope.chart.def.type === type && scope.chart.def.variant === variant && scope.chart.def.webAppType === webAppType) {
                            return;
                        }
                        element.find('.pivot-charts .mainzone').remove(); // avoid flickering
                        Logger.info("Set chart type");
                        ChartChangeHandler.onChartTypeChange(scope.chart.def, type, variant, webAppType);
                        Logger.info("AFTER chart type", scope.chart.def);
                        scope.chart.def.type = type;
                        scope.chart.def.variant = variant;
                        scope.chart.def.webAppType = webAppType;
                        onChartImportantDataChanged.bind("type")(type);
                    }
                });

                scope.export = function() {
                    scope.$broadcast("export-chart");
                    if (scope.displayDownloadPanel) {
                        scope.switchDownloadHandler();
                    }
                };

                scope.exportToExcel = function() {
                    if(scope.excelExportableChart) {
                        var animationFrameIdx;
                        if (scope.excelExportableChart.chartDef.animationDimension.length) {
                            animationFrameIdx = scope.animation.currentFrame;
                        }
                        DataikuAPI.shakers.charts.exportToExcel(scope.excelExportableChart.chartDef,
                         scope.excelExportableChart.pivotResponse, animationFrameIdx).success(function(data) {
                           downloadURL(DataikuAPI.shakers.charts.downloadExcelUrl(data.id));
                        }).error(setErrorInScope.bind(scope));
                        if (scope.displayDownloadPanel) {
                            scope.switchDownloadHandler();
                        }
                    }
                };

                scope.displayDownloadPanel = false;
                scope.downloadHandler = function() {
                    if (scope.isExportableToExcel(scope.chart.def) && scope.isExportableToImage(scope.chart.def)) {
                        scope.switchDownloadHandler();
                    } else if (scope.isExportableToExcel(scope.chart.def)) {
                        scope.exportToExcel();
                    } else if (scope.isExportableToImage(scope.chart.def)) {
                        scope.export();
                    }
                };

                scope.switchDownloadHandler = function() {
                    scope.displayDownloadPanel = !scope.displayDownloadPanel;
                    if (scope.displayDownloadPanel) {
                        $timeout(function() {
                            $(window).on('click', scope.switchDownloadHandlerOnClick);
                        });
                    } else {
                        $(window).off('click', scope.switchDownloadHandlerOnClick);
                    }
                }

                scope.switchDownloadHandlerOnClick = function(e) {
                    var clickedEl = e.target;
                    if ($(clickedEl).closest('.download-wrapper').length <= 0 && scope.displayDownloadPanel) {
                        scope.switchDownloadHandler();
                        scope.$apply();
                    }
                }

                scope.blurElement = function(inputId) {
                    $timeout(function() { $(inputId).blur(); });
                }

                scope.blurTitleEdition = function() {
                    scope.editTitle.editing = false;
                    scope.chart.def.userEditedName = true;
                    $timeout(scope.saveChart);
                    if (scope.excelExportableChart) {
                        scope.excelExportableChart.chartDef.name = scope.chart.def.name;
                    }
                }
            }
        };
    });

    app.factory("ChartFeatures", function(WebAppsService) {
        return {
            canAnimate: function(chartType) {
                return ['multi_columns_lines', 'grouped_columns', 'stacked_columns',
                        'stacked_bars', 'lines', 'stacked_area', 'pie',
                        'binned_xy', 'grouped_xy', 'lift'].indexOf(chartType) !== -1;
            },

            canFacet: function(chartType, variant, webAppType) {
                if (chartType == 'webapp') {
                    var loadedDesc = WebAppsService.getWebAppLoadedDesc(webAppType) || {};
                    var pluginChartDesc = loadedDesc.desc.chart || {};
                    return pluginChartDesc.canFacet == true;
                } else {
                    return ['multi_columns_lines', 'grouped_columns', 'stacked_columns',
                            'stacked_bars', 'lines', 'stacked_area', 'pie',
                            'binned_xy', 'grouped_xy', 'lift'].indexOf(chartType) !== -1;
                }
            },

            canFilter: function(chartType, variant, webAppType) {
                if (chartType == 'webapp') {
                    var loadedDesc = WebAppsService.getWebAppLoadedDesc(webAppType) || {};
                    var pluginChartDesc = loadedDesc.desc.chart || {};
                    return pluginChartDesc.canFilter == true;
                } else {
                    return true;
                }
            },

            hasSmoothing: function (chartType) {
                return ['lines', 'stacked_area'].indexOf(chartType) !== -1;
            },

            hasStrokeWidth: function(chartType) {
                return ['lines', 'multi_columns_lines', 'geom_map'].indexOf(chartType) !== -1
            },

            hasFillOpacity: function(chartDef) {
                return chartDef.type == 'geom_map' || (chartDef.type == 'admin_map' && chartDef.variant == 'filled_map');
            },

            canDisableXAxis: function(chartType) {
                return chartType === 'stacked_bars';
            },

            hasInChartValues: function(chartType) {
                return ['grouped_columns', 'stacked_columns', 'pie', 'stacked_bars'].indexOf(chartType) !== -1;
            },

            hasInChartLabels: function(chartType) {
                return ['pie'].indexOf(chartType) !== -1;
            },

            hasAxisLabels: function(chartType) {
                return ['pie', 'scatter_map', 'webapp', 'density_heat_map'].indexOf(chartType) === -1;
            },

            isExportableToExcel: function(chartDef) {
                if (chartDef.facetDimension.length) {
                    return false;
                }
                return ['stacked_columns', 'stacked_area', 'grouped_columns', 'lines',
                        'pivot_table', 'grouped_xy'].indexOf(chartDef.type) !== -1;
            },
            getExportDisabledReason: function(chartDef) {
                if (chartDef.facetDimension.length) {
                    return 'Download is not available for subcharts.';
                }
            },
            isExportableToImage: function(chartDef) {
                if (chartDef.facetDimension.length) {
                    return false;
                }
                return ['pivot_table', 'scatter_map', 'admin_map', 'grid_map', 'webapp', 'density_heat_map'].indexOf(chartDef.type) === -1;
            },

            hasSingleXAxis: function(chartDef) {
                return ['pie'].indexOf(chartDef.type) === -1;
            },

            hasMultipleYAxes: function(chartDef) {
                return ['multi_columns_lines', 'grouped_columns', 'lines'].indexOf(chartDef.type) !== -1;
            },

            hasOneTickPerBin: function(chartDef) {
                return !(chartDef.type === 'pie' || chartDef.type === 'pivot_table' || chartDef.hexbin);
            }
        }
    })

    app.controller('ChartSliderController', function ($scope, ChartDataUtils, ChartDimension) {
        /**
         * Handles the date range display for the filter.
         * If the interval is on the same day, then the corresponding day is added to
         * the selected filter type (free range).
         * The slider min and max labels are also updated to display meaningful date depending on the interval range.
         */
        function handleDateRangeFilterDisplay(minTimestamp, maxTimestamp) {
            const computedDateDisplayUnit = ChartDataUtils.computeDateDisplayUnit(minTimestamp, maxTimestamp);
            if ($scope.facetUiState.sliderDateFilterOption !== computedDateDisplayUnit.dateFilterOption) {
                // We have a new date filter option:
                //  since the two-way bindings is not done for the filter options, we need to trick the slider component
                //  into refreshing itself by slightly changing the min and/or the max
                $scope.facetUiState.sliderDateFilterOption = computedDateDisplayUnit.dateFilterOption;
                $scope.facetUiState.sliderModelMin += 1;
            }
            ChartDimension.updateDateFreeRangeFilterType($scope.dateFilterTypes, computedDateDisplayUnit.formattedMainDate);
        }

        $scope.$watch("filterTmpData", function(nv, ov) {
            if (!nv || nv.length == 0) return;
            var filterData = $scope.filterTmpData[$scope.$index];
            if (filterData == null) return; // when a filter is added, you have to wait for the response from the backend before filterTmpData is here
            filterData.response = filterData.response || {};
            var lb = filterData.response.minValue;
            var ub = filterData.response.maxValue;

            $scope.facetUiState = $scope.facetUiState || {};
            $scope.facetUiState.sliderLowerBound = lb !== undefined ? lb : $scope.facetUiState.sliderLowerBound;
            $scope.facetUiState.sliderUpperBound = ub !== undefined ? ub : $scope.facetUiState.sliderUpperBound;
            $scope.facetUiState.sliderModelMin = filterData.minValue;
            $scope.facetUiState.sliderModelMax = filterData.maxValue;
            if (ChartDimension.isFilterDateRange($scope.filter)) {
                handleDateRangeFilterDisplay(filterData.minValue, filterData.maxValue);
            }

            // 10000 ticks
            $scope.sliderStep = Math.round(10000*($scope.facetUiState.sliderModelMax-$scope.facetUiState.sliderModelMin))/100000000;

            // Handle min=max
            if($scope.sliderStep == 0) {
                $scope.sliderStep = 1;
            }

            $scope.sliderDecimals = Math.max( (''+($scope.sliderStep - Math.floor($scope.sliderStep))).length-2, 0);
        }, true);

        $scope.slideEnd = function() {
            var filterData = $scope.filterTmpData[$scope.$index];
            if (filterData == null) return; // when a filter is added, you have to wait for the response from the backend before filterTmpData is here
            filterData.minValue = $scope.facetUiState.sliderModelMin;
            filterData.maxValue = $scope.facetUiState.sliderModelMax;
            if(!$scope.$$phase) {
                $scope.$apply();
                $scope.$emit("filterChange");
            }
        };
    });

})();

function ChartIAE(message) {
    this.message = message;
    this.name = "ChartIAE";
}
ChartIAE.prototype = new Error;
