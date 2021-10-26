(function(){
'use strict';

var app = angular.module('dataiku.ml.report');


/**
 * Controller for displaying results screen of a clustering model,
 * either in a PMLTask or a PredictionSavedModel
 *
 * Requires: $stateParams.fullModelId or $scope.fullModelId
 *
 * Must be inserted in another controller.
 */
app.controller("_ClusteringModelReportController", function($scope, $controller, DataikuAPI, Debounce, $stateParams, ActivityIndicator, categoricalPalette, CMLFilteringService){
    $controller("_ModelReportControllerBase", {$scope:$scope});

    $scope.fetchModelDetails = function(){
        return DataikuAPI.ml.clustering.getModelDetails($stateParams.fullModelId || $scope.fullModelId).success(function(data){
            $scope.modelData = data;
            onModelLoaded();
            $scope._selectPane();

            if ($scope.mlTasksContext) $scope.mlTasksContext.model = data;
            if ($scope.smContext) $scope.smContext.model = data;

            // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
            $scope.puppeteerHook_elementContentLoaded = true;
        }).error(setErrorInScope.bind($scope));
    };

    if (!$scope.modelData) {
        var p = $scope.fetchModelDetails()
            .success(function() {
                if ($scope.onLoadSuccess) $scope.onLoadSuccess(); // used by saved-model-report-insight-tile
            })
            .error(function(data, status, headers, config, statusText) {
                if ($scope.onLoadError) $scope.onLoadError(data, status, headers, config, statusText);     // used by saved-model-report-insight-tile
            });

        if ($scope.noSpinner) p.noSpinner();
    }


    /* ************ Handling of save **************** */

    function saveMeta() {
        if ($scope.readOnly) return;
        DataikuAPI.ml.saveModelUserMeta($stateParams.fullModelId || $scope.fullModelId, $scope.modelData.userMeta).success(function(){
            ActivityIndicator.success("Saved")
        }).error(setErrorInScope.bind($scope));
    }

    var debouncedSaveMeta = Debounce().withDelay(400,1000).wrap(saveMeta);
    $scope.$watch("modelData.userMeta", function(nv, ov) {
        if (!nv || !ov) return;
        debouncedSaveMeta();
    }, true);

    var onModelLoaded = function(){
        const { clusterMetas } = $scope.modelData.userMeta;
        $scope.clusterMetasSize = 0;
        if (clusterMetas) {
            $scope.clusterMetasSize = Object.keys(clusterMetas).length;
        }
    };

    var generateClusterColor = function(clusterId, i){
        var algo = $scope.modelData.modeling.algorithm;
        if(algo == "PY_ISOLATION_FOREST" || algo == "MLLIB_ISOLATION_FOREST"){
            if(clusterId == "regular"){
                return "green";
            } else if (clusterId == "anomalies") {
                return "orange";
            }
        }
        return categoricalPalette(i);
    }

    $scope.getClusterMeta = function(clusterId) {
        const { clusterMetas } = $scope.modelData.userMeta;
        if (!clusterMetas) {
            return null;
        }
        if (clusterMetas[clusterId] === undefined) {
            clusterMetas[clusterId] = {
                "name": clusterId,
                "color": generateClusterColor(clusterId, $scope.clusterMetasSize),
            }
            $scope.clusterMetasSize += 1;
        }
        return clusterMetas[clusterId];
    };

    $scope.scatterParams = {};

    $scope.hasHierarchy = function(){
        return ['PY_TWO_STEP', 'MLLIB_TWO_STEP'].indexOf($scope.getAlgorithm()) > -1;
    };

    $scope.hasAnomalies = function(){
        return ['PY_ISOLATION_FOREST', 'MLLIB_ISOLATION_FOREST'].indexOf($scope.getAlgorithm()) > -1;
    };

    $scope.getMetricNameFromModel = CMLFilteringService.getMetricNameFromModel.bind(CMLFilteringService);
    $scope.getMetricValueFromModel = CMLFilteringService.getMetricValueFromModel.bind(CMLFilteringService);
});


app.controller("CMLReportTrainController", function($scope, CMLSettings, MLDiagnosticsService) {
    $scope.mti = $scope.modelData.trainInfo;
    $scope.reduce = $scope.modelData.preprocessing.reduce;
    $scope.outliers = angular.extend({}, $scope.modelData.preprocessing.outliers);
    $scope.outliers.nope = $scope.outliers.method === 'NONE';
    $scope.outliers.method = arr2obj(CMLSettings.task.outliersMethods)[$scope.outliers.method]
                                || $scope.outliers.method;
    $scope.diagnostics = MLDiagnosticsService.groupByType($scope.modelData.trainDiagnostics);
    $scope.isMLBackendType = function(mlBackendType) {
        return $scope.modelData.coreParams.backendType === mlBackendType;
    };

    $scope.canDisplayDiagnostics = function() {
        return true;
    };
});

app.controller("ClusterEditController", function($scope){
    $scope.$watch('meta', function(){
        if($scope.meta){
            $scope.details = {
                name: $scope.meta.name,
                description: $scope.meta.description,
                color: $scope.meta.color
            };
        }
    });
    $scope.confirm = function(){
        $scope.meta.name = $scope.details.name;
        $scope.meta.description = $scope.details.description;
        $scope.meta.color = $scope.details.color;
        $scope.dismiss();
        if($scope.callback) $scope.callback();
    };
});

app.controller("CMLModelFactsController", function($scope, $controller, $state, $stateParams, categoricalPalette, Dialogs, DataikuAPI, CreateModalFromTemplate, WT1) {
    $controller("_MLReportSummaryController", {$scope:$scope});
    $controller("EvaluationLabelUtils", {$scope:$scope});

    $scope.$watch("modelData", function(nv, ov) {
        if (nv) $scope.facts = nv.facts;
         main();
    });

    var computeObservations = function(clusterLabel) {
        var observations;
        for (var i = 0; i < $scope.facts.clusters.length; i++) {
            var cluster_facts = $scope.facts.clusters[i];
            if (cluster_facts.cluster == clusterLabel) {
                observations = cluster_facts.facts;
                break;
            }
        };
        if (observations) {
            // prepare for displaying as sentences:
            observations.forEach(function(obs){
                if (obs.type == 'numerical') {
                    // It does not make much sense to compare percentages if signs are opposite
                    obs.sameSign = obs.mean/obs.global_mean > 0;
                    if (obs.sameSign) {
                        obs.negative = obs.global_mean < 0;
                        obs.relative_diff = Math.abs((obs.mean-obs.global_mean) * 100 / obs.global_mean);
                        obs.polarity = (obs.mean > obs.global_mean)? 'greater' : 'smaller';
                    } else {
                        // no formatting?...
                    }
                } else if (obs.type == 'categorical') {
                    obs.polarity = (obs.current_ratio > obs.global_ratio)? 'greater' : 'smaller';
                }
            });
            return observations;
        }
    }

    var main =function(){
        if (!$scope.selectedCluster && $scope.facts.clusters.length) {
            $scope.selectCluster($scope.facts.clusters[0]);
        }
    };

    $scope.selectCluster = function(cluster) {
        $scope.selectedCluster = cluster;
        $scope.observations = computeObservations($scope.selectedCluster.cluster);
    };

    $scope.editClusterDetails = function(meta){
        WT1.event("clustering-facts-edit-node");
        CreateModalFromTemplate("/templates/ml/clustering-model/cluster-details-edit.html", $scope,
            "ClusterEditController", function(newScope){
            newScope.meta = meta;
        });
    };

    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
    $scope.puppeteerHook_elementContentLoaded = true;
});

app.factory('ClusteringHeatmapUtils', function(ExportUtils){
    var utils = {};

    utils.numericalDiff = function(m1, m2, s1, s2, n1, n2){
        var denom = Math.sqrt(s1 * s1 / n1 + s2 * s2 / n2);
        if(denom == 0.0){
            return m1 > m2 ? 100.0 : (m1 < m2 ? -100.0 : 0.0); //maybe a bit too hardcore
        }
        return (m1 - m2)/denom;
    };

    utils.categoricalDiff = function(p1, p2, n1, n2){
        var denom = Math.sqrt((p1 * (1 - p1) / n1) + (p2 * (1 - p2) / n2))
        if(denom == 0.0){
            return p1 > p2 ? 100.0 : (p1 < p2 ? -100.0 : 0.0); //maybe a bit too hardcore
        }
        return (p1 - p2)/denom;
    };

    utils.exportStacked = function(scope, data){
        var columns = [];
        var exportData = [];
        for(var j = 0; j < data.cluster_labels.length; j++){
            var cluster = scope.getClusterMeta(data.cluster_labels[j]).name;
            columns.push({ name : cluster + "_feature", type : "string" });
            columns.push({ name : cluster + "_is_numeric_feature", type : "boolean" });
            columns.push({ name : cluster + "_global_mean", type : "double" });
            columns.push({ name : cluster + "_mean", type : "double" });
            columns.push({ name : cluster + "_global_std", type : "double" });
            columns.push({ name : cluster + "_std", type : "double" });
            columns.push({ name : cluster + "_relative_importance", type : "double" });

            var cluster_data = [];
            for(var i=0; i<data.num_names.length; i++){
                var global_avg = data.num_averages[i];
                var avg = data.cluster_num_averages[j][i];
                var std = data.cluster_num_std_devs[j][i];
                var global_std = data.num_std_devs[i];
                var diff = utils.numericalDiff(avg, global_avg, std, global_std,
                    data.cluster_sizes[j], data.total_size);
                cluster_data.push([data.num_names[i], true, global_avg, avg, global_std, std, diff]);
            }
            for(var i=0; i<data.cat_names.length; i++){
                for(var k=0; k<data.levels[i].length; k++){
                    var name = data.cat_names[i] + "=" + data.levels[i][k];
                    var prop = data.cluster_proportions[j][i][k];
                    var global_prop = data.proportions[i][k];
                    var diff = utils.categoricalDiff(prop, global_prop, data.cluster_sizes[j], data.total_size);
                    cluster_data.push([name, false, prop, global_prop, null, null, diff]);
                }
            }
            cluster_data.sort(function(a,b){
                var da = Math.abs(a[6]);
                var db = Math.abs(b[6]);
                if(da[6] < db[6]){
                    return 1;
                } else if(da[6] > db[6]){
                    return -1;
                } else {
                    return 0;
                }
            });
            for(var t = 0; t < cluster_data.length; t++){
                if(!exportData[t]){
                    exportData.push(cluster_data[t]);
                } else {
                    exportData[t] = exportData[t].concat(cluster_data[t]);
                }
            }
        }

        ExportUtils.exportUIData(scope, {
            name : "Stacked columns clustering report for " + scope.modelData.userMeta.name,
            columns : columns,
            data : exportData
        }, "Export stacked data");

    };

    utils.exportTabular = function(scope, data){
        var exportData = [];
        for(var j = 0; j < data.cluster_labels.length; j++){
            var cluster_label = scope.getClusterMeta(data.cluster_labels[j]).name;

            for(var i = 0; i < data.num_names.length; i++){
                var global_avg = data.num_averages[i];
                var avg = data.cluster_num_averages[j][i];
                var std = data.cluster_num_std_devs[j][i];
                var global_std = data.num_std_devs[i];
                var diff = utils.numericalDiff(avg, global_avg, std, global_std,
                    data.cluster_sizes[j], data.total_size);
                exportData.push([cluster_label, data.num_names[i], true, global_avg, avg, global_std, std, null, null, diff]);
            }

            for(var i = 0; i < data.cat_names.length; i++){
                for(var k = 0; k < data.levels[i].length; k++){
                    var name = data.cat_names[i] + "=" + data.levels[i][k];
                    var prop = data.cluster_proportions[j][i][k];
                    var global_prop = data.proportions[i][k];
                    var diff = utils.categoricalDiff(prop, global_prop, data.cluster_sizes[j], data.total_size);
                    exportData.push([cluster_label, name, false, null, null, null, null, prop, global_prop, diff]);
                }
            }
        }

        //sort by cluster, then absolute diff
        exportData.sort(function(v1, v2){
            if(v1[0] < v2[0]){
                return -1;
            } else if(v1[0] > v2[0]){
                return 1;
            } else {
                var d1 = Math.abs(v1[9]);
                var d2 = Math.abs(v2[9]);
                if(d1 < d2){
                    return 1;
                } else if(d1 > d2){
                    return -1;
                } else {
                    return 0;
                }
            }
        });

        ExportUtils.exportUIData(scope, {
            name : "Tabular clustering report for " + scope.modelData.userMeta.name,
            columns : [
                { name : "cluster_label", type : "string" },
                { name : "feature", type : "string" },
                { name : "is_numeric_feature", type : "boolean" },
                { name : "global_mean", type : "double" },
                { name : "mean", type : "double" },
                { name : "global_std", type : "double" },
                { name : "std", type : "double" },
                { name : "proportion", type : "double" },
                { name : "global_proportion", type : "double" },
                { name : "relative_importance", type : "double" }
            ],
            data : exportData
        }, "Export tabular data");
    };

    return utils;
});

app.controller('ClusteringHeatmapController', function($scope, Dialogs, ClusteringHeatmapUtils, CreateModalFromTemplate, WT1){
    var data = $scope.modelData.heatmap;

    $scope.clusters = data.cluster_labels;

    var square = function(x){return x*x};

    /* Feature selectors */
    var selectNum = function(index){
        for(var i=0; i<data.num_names.length; i++){
            $scope.featureIndex.push(index);
            $scope.featureInfo.push({numerical: true, name: data.num_names[i]});
            index++;
            var dat = [];
            for(var j = 0; j<data.cluster_labels.length; j++){
                var global_avg = data.num_averages[i];
                var avg = data.cluster_num_averages[j][i];
                var std = data.cluster_num_std_devs[j][i];
                var global_std = data.num_std_devs[i];
                var diff = ClusteringHeatmapUtils.numericalDiff(avg, global_avg, std, global_std,
                    data.cluster_sizes[j], data.total_size);
                dat.push({
                    avg: avg,
                    std: std,
                    global_std: global_std,
                    global_avg: global_avg,
                    diff: diff
                });
            }
            $scope.data.push(dat);
        }
        return index;
    };

    //create sorted index of categorical features, so that those with less levels come first, allowing
    //to select "categorical" in the view with less risks of a warning due to many levels.
    $scope.cat_names = [];
    for(var i = 0; i < data.cat_names.length; i++){
        $scope.cat_names.push({index: i, name: data.cat_names[i]});
    }
    $scope.cat_names.sort(function(a,b){
        var l1 = data.levels[a.index].length;
        var l2 = data.levels[b.index].length;
        if(l1 == l2) return 0;
        return l1 < l2 ? -1 : 1;
    });

    var selectCat = function(f, index){
        for(var lev=0; lev<data.levels[f].length; lev++){
            $scope.featureIndex.push(index);
            $scope.featureInfo.push({numerical: false, name: data.cat_names[f] + "=" + data.levels[f][lev]});
            index++;
            var dat = [];
            for(var c=0; c<data.cluster_labels.length; c++){
                var prop = data.cluster_proportions[c][f][lev];
                var global_prop = data.proportions[f][lev];
                var diff = ClusteringHeatmapUtils.categoricalDiff(prop, global_prop, data.cluster_sizes[c], data.total_size);
                dat.push({
                    proportion: prop,
                    global_proportion: global_prop,
                    diff: diff,
                });
            }
            $scope.data.push(dat);
        }
        return index;
    };

    var selectAllCat = function(index){
        for(var f=0; f<data.cat_names.length; f++){
            index = selectCat(f, index);
        }
        return index;
    };

    var init = function(){
        $scope.selectedFeature = -1;
        $scope.selectedCluster = -1;
        $scope.featureIndex = [];
        $scope.data = [];
        $scope.featureInfo = [];
    };

    var createColors = function(){
        var max = 0;
        for(var i=0; i < $scope.data.length; i++){
            for(var j=0; j<$scope.data[i].length; j++){
                var a = Math.abs($scope.data[i][j].diff);
                if(a > max){
                    max = a;
                }
            }
        }
        var globalScale = d3.scale.linear().domain([-max, -10.0, -2.0, 0.0, 2.0, 10.0, max])
                                           .range(['#4285f4','#92abf9','#ccd4fc','#ffffff','#fbbab2','#ea746a','#ce1329']);
        $scope.getElementColor = function(fi, ci){
            return globalScale($scope.data[fi][ci].diff);
        };
    }

    var totalFeatures = data.num_names.length;
    for(var i=0; i<data.levels.length; i++){
        totalFeatures += data.levels[i].length;
    }
    var featureLimit = 100;

    $scope.selectAllFeatures = function(){
        var selection = function(){
            var index = 0;
            init();
            index = selectNum(index);
            selectAllCat(index);
            $scope.selectionMode = "ALL";
            createColors();
        };
        if(totalFeatures > featureLimit){
            Dialogs.confirm($scope, 'View all','There are ' + totalFeatures
            + ' features, viewing them all may cause poor performance.').then(selection);
        } else {
            selection();
        }
    };

    $scope.selectOnlyNumeric = function(){
        init();
        selectNum(0);
        $scope.selectionMode = "NUMERIC";
        createColors();
    };

    $scope.selectSpecificCat = function(f){
        var selection = function(){
            init();
            selectCat(f, 0);
            $scope.selectedCategorical = f;
            $scope.selectionMode = "CAT";
            createColors();
        };
        var nLevels = data.levels[f].length;
        if(nLevels > featureLimit){
            Dialogs.confirm($scope, 'View categorical feature','There are ' + nLevels
            + ' categories, viewing them all may cause poor performance.').then(selection);
        } else {
            selection();
        }

    };

    /* Instantiate indices */
    $scope.clusterIndex = [];
    for(var i =0; i<$scope.clusters.length; i++){
        $scope.clusterIndex.push(i);
    }

    //if too many features we only show numerical by default
    if(totalFeatures > featureLimit){
        $scope.selectOnlyNumeric();
    } else {
        $scope.selectAllFeatures();
    }


    $scope.selectedCluster = -1;
    $scope.selectedFeature = -1;

    /* offset functions for moving labels */

    $scope.tableWidth = 50 * $scope.clusters.length;
    $scope.additionalWidth = 0;
    if ($scope.tableWidth > 400) {
        $scope.additionalWidth = 220; // Leave some space at the end for the tooltip;
    }

    $scope.clusterOffset = function(){
        return - ($scope.selectedFeature == -1 ? 0 : (50 * $scope.featureIndex.indexOf($scope.selectedFeature)));
    };

    $scope.featureOffset = function(){
        return $scope.selectedCluster == -1 ? 0 : (50 * $scope.clusterIndex.indexOf($scope.selectedCluster) + 1);
    };

    /* Line/column sorting */

    $scope.sortDescending = true;

    $scope.sortFeatures = function(index){
        if(index != $scope.selectedCluster){
            $scope.sortDescending = true;
        } else {
            $scope.sortDescending = !$scope.sortDescending;
        }
        $scope.selectedCluster = index;
        $scope.selectedFeature = -1;
        $scope.featureIndex.sort(function(i, j){
            var x1 = Math.abs($scope.data[i][index].diff);
            var x2 = Math.abs($scope.data[j][index].diff);
            if(x1 == x2){
                return 0;
            } else {
                var s = x1 < x2 ? 1 : -1;
                return $scope.sortDescending ? s : -s;
            }
        });
    };

    $scope.sortClusters = function(index){
        if(index != $scope.selectedFeature){
            $scope.sortDescending = true;
        } else {
            $scope.sortDescending = !$scope.sortDescending;
        }
        $scope.selectedFeature = index;
        $scope.selectedCluster = -1;
        $scope.clusterIndex.sort(function(i, j){
            var x1 = Math.abs($scope.data[index][i].diff);
            var x2 = Math.abs($scope.data[index][j].diff);
            if(x1 == x2){
                return 0;
            } else {
                var s = x1 < x2 ? 1 : -1;
                return $scope.sortDescending ? s : -s;
            }
        });
    };

    $scope.reset = function(){
        $scope.selectedFeature = -1;
        $scope.selectedCluster = -1;

        var ftSize = $scope.featureIndex.length;
        $scope.featureIndex = [];
        for(var i =0; i<ftSize; i++){
            $scope.featureIndex.push(i);
        }

        $scope.clusterIndex = [];
        for(var i =0; i<$scope.clusters.length; i++){
                $scope.clusterIndex.push(i);
        }
    }

    $scope.editClusterDetails = function(ci){
        WT1.event("clustering-heatmap-edit-node");
        CreateModalFromTemplate("/templates/ml/clustering-model/cluster-details-edit.html", $scope,
            "ClusterEditController", function(newScope){
            newScope.meta = $scope.getClusterMeta($scope.clusters[ci]);
        });
    };

    /* Tooltips */

    var greyScale = d3.scale.linear().domain([-2, 0, 2]).range(["blue", "grey", "red"]);
    $scope.tooltipHtml = function(fi, ci) {
        var cluster = $scope.getClusterMeta($scope.clusters[ci]).name;
        var info = $scope.featureInfo[fi];

        var html = '<strong>Cluster: </strong>' + sanitize(cluster) + '<br/>' + '<strong>Feature: </strong>'  + sanitize(info.name) + '<br/>';

        var d = $scope.data[fi][ci];
        var diff = null;
        if(info.numerical){
            diff = (d.avg - d.global_avg)/d.global_avg;
        } else {
            diff = (d.proportion - d.global_proportion)/d.global_proportion;
        }
        var sign = diff > 0.0 ? '+' : '';
        var color = greyScale(diff);
        if(info.numerical){
            var stdDiff = (d.std - d.global_std)/d.std;
            var stdColor = greyScale(stdDiff);
            var stdSign = d.std > d.global_std ? '+' : '';
            html += '<strong>Average:</strong> ' + d.avg.toFixed(2) + '<em>(' + d.global_avg.toFixed(2) +
                " globally, <span style='color: " + color + "'>" + sign + (diff * 100).toFixed(2) + '%</span>)</em><br/>';
            html += '<strong>Std. Dev.:</strong> ' + d.std.toFixed(2) + '<em>(' + d.global_std.toFixed(2) +
                " globally, <span style='color: " + stdColor + "'>" + stdSign + (stdDiff * 100).toFixed(2) + '%</span>)</em>';
        } else {
            html += "<strong>" + (d.proportion * 100).toFixed(2) + "% of cluster <em>(" + (d.global_proportion * 100).toFixed(2) +
                "% globally, <span style='color: " + color + "'>" + sign + (diff * 100).toFixed(2) + '%</span>)</em>';
        }

        return "<div style='position: relative; background: white; z-index: 5'>" + html + '</div>';
    };

    /* Exports */

    $scope.exportTabular = function(){ClusteringHeatmapUtils.exportTabular($scope, data);};
    $scope.exportStacked = function(){ClusteringHeatmapUtils.exportStacked($scope, data);};

    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
    $scope.puppeteerHook_elementContentLoaded = true;
    $scope.puppeteerPrepareForExport = function() {
        $scope.modelDocumentExport = true;
        $scope.$apply();
    }

});

app.directive('sortableHeatmap', function(){
    return {
        template: "<div id='content'></div>",
        scope:  {
            data: "=data"
        },
        link: function(scope, element){
            var width = 800;
            var height = 800;
            var tileSize = 50;
        }
    }
});

    (function() {

    var BRICK_STRIDE = 24;
    var BRICK_WIDTH = 22;
    var BRICK_MARGIN_TOP = 15;
    var BRICK_MAX_HEIGHT = 120;
    var LEFT_MARGIN_TO_CHART = 66;
    var RIGHT_MARGIN = 10;
    var possibleNumberOfBricks = [5, 6, 10, 12, 15, 20, 30, 60];

    app.directive("stackedHistograms", function(categoricalPalette, Dialogs, CreateModalFromTemplate, WT1) {
        return {
            restrict: 'E',
            templateUrl : '/templates/ml/clustering-model/cluster-profiling-stacked.html',
            link: function(scope, element) {
                scope.profilingUI = {profilingMode: 'average', variables: [], selectedVariable: null};

                var refresh = function() {
                    scope.profilingUI.variables = scope.modelData.clustersProfiling;
                    if (scope.profilingUI.selectedVariable) {
                        var found = false;
                        for(var k in scope.profilingUI.variables) {
                            var v = scope.profilingUI.variables[k];
                            if(v.variable == scope.profilingUI.selectedVariable.variable) {
                                scope.profilingUI.selectedVariable = v;
                                found = true;
                                break;
                            }
                        }
                        if(!found) {
                            scope.profilingUI.selectedVariable = null;
                        }
                    }
                };

                scope.$watch('profilingUI.profilingMode', refresh, true);

                scope.hover = {"id": -1};

                scope.editClusterDetails = function(meta){
                    WT1.event("clustering-profiling-edit-node");
                    CreateModalFromTemplate("/templates/ml/clustering-model/cluster-details-edit.html", scope,
                        "ClusterEditController", function(newScope){
                        newScope.meta = meta;
                    });
                };

                scope.$watch('modelData',function(nv, ov) {
                    refresh();
                    if(nv!=null && !scope.profilingUI.selectedVariable && scope.profilingUI.variables.length>0) {
                        scope.profilingUI.selectedVariable = scope.profilingUI.variables[0];
                    }
                });

                scope.categoricalPalette = categoricalPalette;

                var brickDataNumerical = function(per_cluster_data, nbBricks) {
                    if (per_cluster_data.distribution === undefined) {
                        return undefined;
                    }
                    var brickData = [];
                    for (var i = 0; i < nbBricks; i++) {
                        brickData.push({
                            x: LEFT_MARGIN_TO_CHART + BRICK_STRIDE * i,
                            y: 0
                        });
                    };
                    var groupSize = 60 / nbBricks;
                    for (var i = 0; i < 60; i++) {
                        var bucketId = (i / groupSize) | 0;
                        brickData[bucketId].y += per_cluster_data.distribution[i];
                    }
                    for (var i = 0; i < brickData.length; i++) {
                        var ratio = brickData[i].y / per_cluster_data.total_no_nan;
                        scope.max_ratio = Math.max(ratio, scope.max_ratio);
                        brickData[i].ratio = ratio;
                    };
                    return brickData;
                }

                var brickDataCategorical = function(per_cluster_data, nbBricks) {
                    if (per_cluster_data.distribution === undefined) {
                        return undefined;
                    }
                    var brickData = [];
                    var nbBricks = Math.min(nbBricks, per_cluster_data.distribution.length);
                    for (var i = 0; i < nbBricks; i++) {
                        var p = per_cluster_data.distribution[i];
                        scope.max_ratio = Math.max(scope.max_ratio, p.ratio);
                        brickData.push({
                            x: LEFT_MARGIN_TO_CHART + BRICK_STRIDE * i,
                            y: p.count,
                            ratio: p.ratio,
                        });
                    };
                    return brickData;
                }

                var aggregateData = function() {
                    if (!scope.profilingUI.selectedVariable.global) return;

                    scope.max_ratio = 0.;
                    var W = element.find(".right-area").first().innerWidth();
                    var maxNbBricks = (W - LEFT_MARGIN_TO_CHART - RIGHT_MARGIN) / 24.0;
                    var nbBricks = 5;

                    for (var i = 0; i < possibleNumberOfBricks.length; i++) {
                        var nbBricksCandidate = possibleNumberOfBricks[i];
                        if (maxNbBricks >= nbBricksCandidate) {
                            nbBricks = nbBricksCandidate;
                        }
                        else {
                            break;
                        }
                    };

                    var makeBrickData = {
                        "numerical": brickDataNumerical,
                        "categorical": brickDataCategorical
                    }[scope.profilingUI.selectedVariable.type];

                    scope.profilingUI.selectedVariable.global.brickData = makeBrickData(scope.profilingUI.selectedVariable.global, nbBricks);
                    for (var k = 0; k < scope.profilingUI.selectedVariable.per_cluster.length; k++) {
                        var per_cluster_data = scope.profilingUI.selectedVariable.per_cluster[k];
                        per_cluster_data.brickData = makeBrickData(per_cluster_data, nbBricks);
                    };

                    scope.profilingUI.selectedVariable.scale.max_ratio = scope.max_ratio;
                }

                scope.$watch("profilingUI.selectedVariable", aggregateData);


                scope.$on("reflow", aggregateData);
                $(window).on("resize", aggregateData);

                scope.$on("$destroy", function() {
                    $(window).off("resize", aggregateData);
                });
            }
        }

    })


    function horizontalLine(x1, x2) {
        return "M" + x1 + "," + 0 + "L" + x2 + "," + 0;
    }

    function whiskerPlot(g, whiskerData, xScale) {
        var height = 18;
        var halfHeight = height / 2;
        var median = whiskerData.median;
        var whiskerPlot = g.append("g")
            .attr("class", "whiskerPlot")
            .attr("transform", "translate(0," + halfHeight + ")")
        whiskerPlot.append("path")
                   .attr("d", horizontalLine(xScale(whiskerData.percentile9), xScale(whiskerData.percentile91)));
        whiskerPlot.append("rect")
                   .attr("x", xScale(whiskerData.percentile25))
                   .attr("y", -halfHeight)
                   .attr("width", Math.max(2, xScale(whiskerData.percentile75) - xScale(whiskerData.percentile25)) )
                   .attr("height", height)
                   .attr("rx", 6)
                   .attr("ry", 4);
        whiskerPlot.append("circle")
            .attr("cx", xScale(whiskerData.percentile9))
            .attr("cy", 0)
            .attr("r", 2)
        whiskerPlot.append("circle")
            .attr("cx", xScale(whiskerData.percentile91))
            .attr("cy", 0)
            .attr("r", 2)
        whiskerPlot.append("circle")
            .attr("cx", xScale(whiskerData.median))
            .attr("cy", 0)
            .attr("r", 2)
        return whiskerPlot;
    };

    app.directive("bzHistogram", function() {
        return {
            restrict: 'E',
            template: '<svg>\
                \
                <defs>\
                <pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="8" height="8">\
                    <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#feffff" stroke-width="1.5"></path>\
                </pattern>\
            </defs>\
            <g id="chart"></g>\
            <rect class="stripe" style="fill: url(#diagonalHatch)"></rect>\
            </svg>',
            scope: {
                data: '=data',
                color: '=color',
                scale: '=scale',
                categorical: '=categorical',
                showScale: '=showScale',
                hover: '=hover',
                whiskerData: '=whiskerData',
                nbBricks: '=nbBricks',
            },
            link: function(scope, element) {
                var svg = d3.select(element[0]).select("svg");
                var yScale, xScale;
                var refreshHistogram = function() {

                    if ((scope.data === undefined) || (scope.data.length == 0)) {
                        return;
                    }

                    xScale = d3
                        .scale
                        .linear()
                        .range([0, BRICK_STRIDE * scope.data.length])
                        .domain([scope.scale.min, scope.scale.max])

                    yScale = d3
                        .scale
                        .linear()
                        .domain([0, scope.scale.max_ratio])
                        .range([BRICK_MAX_HEIGHT, 0]);

                    scope.hover.id = -1;
                    scope.W = element.width();
                    scope.max_ratio = scope.scale.max_ratio;

                    var brickNodes = svg
                        .select("#chart")
                        .selectAll("rect.brick")
                        .data(scope.data)

                    brickNodes
                        .exit().remove()

                    brickNodes.enter()
                        .append("rect")
                        .attr('fill', scope.color)
                        .attr("width", BRICK_WIDTH)
                        .attr("class", "brick")
                        .attr("height", function(val) {
                            return  BRICK_MAX_HEIGHT - yScale(val.ratio);
                        })
                        .on("mouseover", function(val, hoverId) {
                            scope.hover.id = hoverId;
                            scope.$apply();
                        })

                    brickNodes
                        .attr("x", function(val) { return val.x; })
                        .attr('fill', scope.color)
                        .attr("y", function(val) {
                            return BRICK_MARGIN_TOP + yScale(val.ratio);
                        })
                        .attr("height", function(val) {
                            return  BRICK_MAX_HEIGHT - yScale(val.ratio);
                        })

                    scope.hover.id = -1;
                    updateHover();

                    svg.select("g.whisker-container").remove();
                    var whiskerContainer = svg
                       .append("g")
                       .attr("class", "whisker-container")
                       .attr("transform", "translate(" + LEFT_MARGIN_TO_CHART + ", " + (BRICK_MAX_HEIGHT + (scope.showScale ? 35: 15) + BRICK_MARGIN_TOP + 8) + ")")

                        var yAxis = d3.svg
                            .axis()
                            .scale(yScale)
                            .ticks(3)
                            .orient("left")
                            .tickFormat(function(d) { return (d*100 | 0) + "%"; });
                        svg.select("g.yaxis").remove();
                        svg.append("g")
                           .attr("class", "yaxis")
                           .attr("transform", "translate(" + (LEFT_MARGIN_TO_CHART - 26) + ", " + BRICK_MARGIN_TOP + ")")
                           .call(yAxis);

                    svg.select("g.xaxis").remove();
                    var svgAxis = svg.append("g")
                       .attr("class", "xaxis")
                       .attr("transform", "translate(" + LEFT_MARGIN_TO_CHART  + ", " + (BRICK_MAX_HEIGHT + BRICK_MARGIN_TOP + 7) + ")")

                    if (scope.categorical) {
                        if (scope.showScale) {
                        svgAxis
                        .selectAll("text.histogram-label")
                        .data(scope.scale.categories)
                        .enter()
                            .append("text")
                            .attr("class", "histogram-label")
                            .text(function(d) { return d; })
                            .attr("text-anchor", "end")
                            .attr("transform", function(data, i) {
                                var rotation = "rotate(-45) ";
                                var x = 13 + BRICK_STRIDE * i;
                                var y = 0;
                                var translation = "translate(" +  x + "," + y + ")";
                                return translation + rotation;
                            })
                        }
                        svgAxis.append("line")
                                .attr("x1", "0")
                                .attr("y1", "-6")
                                .attr("x2", BRICK_STRIDE * scope.data.length)
                                .attr("y2", "-6")
                                .attr("stroke", "black")
                                .attr("shape-rendering", "crispEdges")

                    } else {
                        whiskerPlot(whiskerContainer, scope.whiskerData, xScale)
                        var xAxis = d3.svg
                            .axis()
                            .scale(xScale)
                            .ticks(3)
                            .orient("bottom");
                        if (!scope.showScale) {
                            svgAxis.attr("class", "xaxis hide-labels");
                        }
                        svgAxis.call(xAxis);
                    }
                }

                function updateHover() {
                    svg.select('rect.stripe')
                       .attr("height", 0)
                       .attr("width", 0)
                    if ((scope.hover.id !== undefined) && (scope.hover.id >= 0) && (scope.data !== undefined) && (scope.hover.id < scope.data.length)) {
                        var val = scope.data[scope.hover.id];
                        if (val != undefined) {
                            svg.select('rect.stripe')
                               .attr("x", val.x)
                               .attr("y", BRICK_MARGIN_TOP + yScale(val.ratio))
                               .attr("height", BRICK_MAX_HEIGHT - yScale(val.ratio))
                               .attr("width", BRICK_WIDTH)
                        }
                    }
                }

                scope.$watch("data", refreshHistogram);
                scope.$watch("hover", updateHover, true);
            }
        }
    })
    })();

    app.directive('clusteringScatterControl', function(Assert, DataikuAPI, $filter,$stateParams) {
        return {
            scope : {
                result : '=',
                getClusterMeta: '=getClusterMeta',
                fullModelId : '=',
                params: '='
            },
            templateUrl : '/templates/ml/clustering-model/scatterplot.html',
            link : function($scope, element) {
                $scope.scatterShowOutliers = true;
                $scope.waiting = true;
                Assert.inScope($scope, 'result');
                Assert.trueish($scope.result.perf, 'No performance metrics');

                $scope.refreshForm = function() {
                    $scope.scatterVars = arrayDedup($.grep($scope.result.perf.cluster_description, function(elt) {
                        // Remove the "fake" variable cluster_size
                        return elt.variable != 'cluster_size';
                    })
                    .map(function(x) {
                        // Keep only variable names
                        return x.variable;
                    })
                    // Add the generated variables (PCA components)
                    .concat($scope.result.perf.reduce_vars));
                    if (($scope.params.scatterVar1 === undefined) && ($scope.params.scatterVar2 === undefined)) {
                        if ($scope.result.perf.reduce_vars.length >= 2) {
                          $scope.params.scatterVar1 = $scope.result.perf.reduce_vars[0];
                          $scope.params.scatterVar2 = $scope.result.perf.reduce_vars[1];
                        }
                        else {
                          $scope.params.scatterVar1 = $scope.scatterVars[Math.min(1,$scope.scatterVars.length-1)];
                          $scope.params.scatterVar2 = $scope.scatterVars[0];
                        }
                    }

                };

                $scope.refreshGraph = function() {
                    $scope.waiting = true;
                    DataikuAPI.ml.clustering.getScatterPlot($stateParams.projectKey,$scope.fullModelId, $scope.params.scatterVar2, $scope.params.scatterVar1).success(function(data) {
                      $scope.scatterData = data.points;
                      $scope.waiting = false;
                    }).error(function(data,status,headers){
                          setErrorInScope.bind($scope)(data, status, headers);
                          $scope.waiting = false;
                     });
                }
                $scope.$watch("runId", function(nv, ov) {
                    $scope.refreshForm();
                    $scope.refreshGraph();
                });
                $scope.$watch("params", $scope.refreshGraph.bind($scope), true);
            }
        }
    });

    app.directive('scatterClusterPlot', function($timeout)  {
        return {
            scope: {
                data: "=",
                axisX : '=',
                axisY : '=',
                showOutliers: '=',
                getClusterMeta: '=getClusterMeta'
            },
            template : '<svg />',
            link: function(scope, element) {

                var tooltip;

                function redrawAll() {
                    $timeout(function() {
                        var svg = element.find("svg").get(0);
                        $(svg).empty();

                        var width = $(element).width();
                        var height = $(element).height();

                        scope.chart = DKUCharts.basicChart(width, height)

                        scope.g = scope.chart.makeTopG(d3.select(svg));
                        updateData();
                    })
                }

                function updateData() {
                    var data = scope.values;
                    var g = scope.g;
                    var chart = scope.chart;

                    var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
                    for (var idx in data) {
                        xmin = Math.min(xmin, data[idx].x)
                        xmax = Math.max(xmax, data[idx].x)
                        ymin = Math.min(ymin, data[idx].y)
                        ymax = Math.max(ymax, data[idx].y)
                    }

                    var axX = scope.axisX;
                    var axY = scope.axisY;

                    var xAxis = d3.svg.axis().scale(chart.xscale).orient("bottom").ticks(10); // axes
                    var yAxis = d3.svg.axis().scale(chart.yscale).orient("left").ticks(10);

                    //var g = d3.select('#chart svg')

                    chart.xscale.domain([xmin, xmax]); // ok domain of axes xmin, max calculated in watch
                    chart.yscale.domain([ymin, ymax]);

                    // X axis and ticks
                    g.append("g")
                    .attr("class", "x axis") // x axis
                    .attr("transform", "translate(0," + chart.height + ")") // reverse it so it's ok i guess
                    .call(xAxis)
                    .append("text")
                    .attr("class", "label")
                    .attr("x", chart.width)
                    .attr("y", -6)
                    .style("text-anchor", "end")
                    .text(axX);
                    // Y axis and ticks
                    g.append("g")
                    .attr("class", "y axis")
                    .call(yAxis)
                    .append("text")
                    .attr("class", "label")
                    .attr("transform", "rotate(-90)")
                    .attr("y", 6)
                    .attr("dy", ".71em")
                    .style("text-anchor", "end")
                    .text(axY) // <--------------------------------------- can i have good text here ?

                    DKUCharts.drawGrid(g, chart.xscale, chart.yscale, chart.width, chart.height); // i'm gonna trust this one

                     $('.regression-scatter-plot-tooltip').remove();

                    var color = d3.scale.category10().domain(d3.range(0,10));

                    //tooltip
                    $('.regression-scatter-plot-tooltip').remove();
                    tooltip = d3.select("body").append("div")
                                .attr("class", "regression-scatter-plot-tooltip").style("left", "0").style("top", "0")
                                .style("opacity", 0)
                                .style("pointer-events", "none");

                    g.selectAll(".dot")
                    .data(data)
                    .enter().append("circle")
                    .attr("r", 3)
                    .attr("cx", function(d) { return chart.xscale(d.x) })
                    .attr("cy", function(d) { return chart.yscale(d.y) })
                    .style("fill", function(d) { return scope.getClusterMeta(d.cluster).color; })
                    .on("mouseover", function(d) {
                        var col = scope.getClusterMeta(d.cluster).color;
                        tooltip.transition()
                        .duration(300)
                        .style("opacity", 1);
                    tooltip.html("<table><tr><td>Cluster</td><th>{0}</th></tr><tr><td>{3}</td><th>{1}</th></tr><tr><td>{4}</td><th>{2}</th></tr></table>"
                        .format(sanitize(scope.getClusterMeta(d.cluster).name), sanitize(d.x), sanitize(d.y), sanitize(axX), sanitize(axY) ))
                        .style("left", (d3.event.pageX) + "px")
                        .style("top", (d3.event.pageY - 28) + "px")
                        .style("border",  "2px " + col + " solid");
                        })
                    .on("mouseout", function(d) {
                        tooltip.transition()
                        .duration(300)
                        .style("opacity", 0);
                    });
                    // Signal to Puppeteer that the content of the element has been loaded and is thus available for content extraction
                    scope.puppeteerHook_elementContentLoaded = true;
                }

                scope.$watch("[data, showOutliers]", function(nval, ov) {
                    if (nval[0] == null) return;
                    if (!scope.showOutliers){
                      scope.values = scope.data.filter(function(el) {
                          return el.cluster != 'cluster_outliers';
                      });
                    }
                    else {
                      scope.values = scope.data;
                    }
                    redrawAll();
                }, true);
                $(window).on('resize', redrawAll);
                scope.$on('$destroy', function() {
                    tooltip.remove();
                    $(window).off('resize', redrawAll);
                });
            }
        }
    });

    app.controller('ClusteringVariableImportanceController', function($scope, $filter, VariablesImportanceService, ExportUtils) {
        $scope.colors  = window.dkuColorPalettes.discrete[0].colors // adjascent colors are too similar
        .filter(function(c, i) { return i % 2 === 0; });        // take only even-ranked ones

        var arr = VariablesImportanceService.build($scope.modelData.perf.variables_importance, $scope.colors);
        $scope.importances = arr[0];
        $scope.fades = arr[1];
        $scope.unfilteredImportances = arr[2];
        $scope.exportImportance = function(){
            var f = $filter("mlFeature");
            var data = $scope.unfilteredImportances.map(function(x){
                return [x.r, x.v, x.i];
            });
            ExportUtils.exportUIData($scope, {
                name : "Variables importance for model:" + $scope.modelData.userMeta.name,
                columns : [
                    { name : "feature_name", type : "string"},
                    { name : "feature_description", type : "string"},
                    { name : "importance", type : "double"}
                ],
                data : data
            }, "Export variable importances");
        };
    });

    app.directive("heatGradient", function(){
        return {
                template: "<div class='heat-gradient'>" +
                            "<div id='text'><div>Low</div><div>High</div></div>" +
                            "<div id='gradient'></div></div>",
                replace: true,
                restrict: 'E'
            }
    })

    app.controller('AnomalyController', function($scope, DataikuAPI, $stateParams, $filter, Dialogs){
        $scope.features = null;
        $scope.data = null;
        $scope.index = 0;

        var cellScale = d3.scale.linear().domain([-3, 0, 3]).range(["#323dff", "#f2f2f2", "#e22828"]);

        //removes constant features
        var cleanData = function(data){
            var toKeep = [];
            var keepAll = true;
            for(var i = 0; i < data.averages.length; i++){
                if(data.standard_deviations[i] > 0.0){
                    toKeep.push(i);
                } else {
                    keepAll = false;
                }
            }
            if(!keepAll) {
                var prune = function(arr){
                    var newArr = [];
                    toKeep.forEach(function(i){newArr.push(arr[i]);});
                    return newArr;
                };
                for(i = 0; i < data.data.length; i++){
                    data.data[i] = prune(data.data[i]);
                }
                if(data.regular_data){
                    for(i = 0; i < data.regular_data.length; i++){
                        data.regular_data[i] = prune(data.regular_data[i]);
                    }
                }
                data.columns = prune(data.columns);
                data.averages = prune(data.averages);
                data.standard_deviations = prune(data.standard_deviations);
            }
        };

        var nVar = 0;
        var maxScore = 0;
        var scoreSd = 0;
        var computeScoreStats = function(scores){
            var scoreMean = 0;
            scores.forEach(function(s){
                scoreMean += s;
                scoreSd += s*s;
            });
            scoreMean /= scores.length;
            scoreSd /= scores.length;
            scoreSd = Math.sqrt(Math.max(0.0, scoreSd - scoreMean * scoreMean));
            if(scoreSd == 0.0){
                scoreSd = 1.0;
            }
            maxScore = Math.max.apply(Math, $scope.data.scores)
        };

        var columnIndex = [];
        var initColumnIndex = function(){
            var imps = $scope.modelData.perf.variables_importance;
            var importanceMapping = {}
            for(var i = 0; i < imps.variables.length; i++){
                importanceMapping[imps.variables[i]] = imps.importances[i];
            }
            for(i = 0; i < nVar; i++){
                columnIndex.push(i);
            }
            var importance = function(i){
                var fi = $scope.data.columns[i];
                if(fi in importanceMapping){
                    return importanceMapping[fi];
                } else {
                    return 0.0;
                }
            };
            columnIndex.sort(function(i, j){
                return importance(j) - importance(i);
            });
        }

        $scope.pagination = [];
        var pageSize = 10;
        var initPageSize = 20;
        var initPagination = function(){
            for(var i = 0; i < Math.min(initPageSize, nVar); i++){
                $scope.pagination.push(columnIndex[i]);
            }
        }

        $scope.seeMore = function(){
            var start = $scope.pagination.length;
            for(var i = start; i < Math.min(start + pageSize, nVar); i++){
                $scope.pagination.push(columnIndex[i]);
            }
        };

        $scope.isMore = function(){
            return $scope.pagination.length < nVar;
        }

        /* Handling of display-only features */
        var initExtra = function(){
            $scope.isExtra =  $scope.data.extra_profiling_columns !== undefined && $scope.data.extra_profiling_columns.length > 0;

            $scope.displayExtra = false;

            $scope.setDisplayExtra = function(b) {
                $scope.displayExtra = b;
            }
        }

        /* we use a (noncanonical) trick to renormalize dummies when computing the zScore. That way,
            we only have a positive z-score when the proba is < 1/nClasses (which makes sense).
            Could do something for negative z-scores, but it's not as bad at all.
        */
        var zScoreRenorm = [];
        var initRenorm = function(){
            var nCats = {};
            var cols = $scope.data.columns;
            for(var i = 0; i < nVar; i++){
                if(cols[i].startsWith("dummy")){
                    var els = cols[i].split(":");
                    var name = els[1];
                    if(name in nCats){
                        nCats[name] = nCats[name] + 1;
                    } else {
                        nCats[name] = 1;
                    }
                }
            }
            for(i = 0; i < nVar; i++){
                if(cols[i].startsWith("dummy")){
                    els = cols[i].split(":");
                    name = els[1];
                    zScoreRenorm.push(1.0 / nCats[name]);
                } else {
                    zScoreRenorm.push(1.0);
                }
            }
        };

        var init = function(){
            nVar = $scope.data.averages.length;
            computeScoreStats($scope.data.scores);
            initColumnIndex();
            initPagination();
            initRenorm();
            initExtra();
        }

        DataikuAPI.ml.clustering.getAnomalies($stateParams.fullModelId || $scope.fullModelId)
            .success(function(data) {
                var setData = function(){
                    cleanData(data);
                    $scope.data = data;
                    init();
                }
                var nCells = (data.data.length + 10) * pageSize;
                if(nCells > 10000){
                    Dialogs.confirm($scope,
                        "Large number of cells",
                        "The number of cells to display initially is very large (" + nCells + "). " +
                        "Displaying them all may lead to poor performance or even a browser crash. Do you wish to continue ?"
                        ).then(function(){
                            setData();
                        });
                } else {
                    setData();
                }



            });

        $scope.nIcons = function(i){
            var zScore = Math.abs((maxScore - $scope.data.scores[i]) / scoreSd);
            var n;
            if(zScore > 3){
                n = 5;
            } else if(zScore > 2) {
                n = 4;
            } else if(zScore > 1.5) {
                n = 3;
            } else if(zScore > 1) {
                n = 2;
            } else {
                n = 1;
            }
            return new Array(n);
        };

        $scope.getCellColor = function(featureIndex, value){
            var zScore = (value * zScoreRenorm[featureIndex] - $scope.data.averages[featureIndex])/$scope.data.standard_deviations[featureIndex];
            return cellScale(zScore);
        };

        $scope.cleanValue = function(x){
            const asNumber = parseFloat(x)
            if (isNaN(asNumber)) {
                return x;
            } else {
                return $filter("smartNumber")(x)
            }
        }

        var namer = $filter("mlFeature");
        $scope.tooltipHtml = function(featureIndex, value){
            var avg = $scope.cleanValue($scope.data.averages[featureIndex]);
            value = $scope.cleanValue(value);
            return '<div><strong>' + sanitize(namer($scope.data.columns[featureIndex])) + '</strong>: ' + value + ' (vs. ' + avg + ' globally)' + '</div>';
        };


    });

})();
