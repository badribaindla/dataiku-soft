(function(){
'use strict';

/**
 * Services related to sampling
 */

var app = angular.module('dataiku.common.sampling', []);

app.service("SamplingData", function(){
	var svc = {

		memSamplingMethods : [
	        ["HEAD_SEQUENTIAL", "First records"],
	        ["RANDOM_FIXED_NB_EXACT", "Random (nb. records)"],
	        ["RANDOM_FIXED_RATIO", "Random (approx. ratio)"],
	        /*["RANDOM_FIXED_RATIO_EXACT", "Random (target ratio of data)"],*/
	        ["COLUMN_BASED", "Column values subset (approx. nb. records)"],
	        ["STRATIFIED_TARGET_NB_EXACT", "Stratified (nb. records)"],
	        ["STRATIFIED_TARGET_RATIO_EXACT", "Stratified (ratio)"],
			["RANDOM_FIXED_NB", "Random (approx. nb. records)"],
	        ["CLASS_REBALANCE_TARGET_NB_APPROX", "Class rebalance (approx. nb. records)"],
	        ["CLASS_REBALANCE_TARGET_RATIO_APPROX", "Class rebalance (approx. ratio)"],
	        ["TAIL_SEQUENTIAL", "Last records"]
	    ],

	    memSamplingMethodsDesc : [
	        "Takes the first N rows of the dataset. Very fast (only reads N rows) but may result in a very biased view of the dataset.",
	        "Randomly selects N rows. Requires a full pass reading the data.",
	        "Randomly selects approximately X% of the rows. Requires a full pass reading the data.",
	       /* "Randomly selects X% of the rows. Requires 2 full passes reading the data.",*/
	        "Randomly selects a subset of values and chooses all rows with these values, in order to obtain approximately N rows. This is useful for selecting a subset of customers, for example. Requires 2 full passes.",
	        "Randomly selects N rows, ensuring that the repartition of values in a column is respected in the sampling. Ensures that all modalities of the column appear in the output. May return a few more than N rows. Requires 2 full passes reading the data.",
	        "Randomly selects X% of the rows, ensuring that the repartition of values in a column is respected in the sampling. Ensures that all modalities of the column appear in the output. May return a bit more than X% rows. Requires 2 full passes reading the data.",
	        "Randomly selects approximately N rows. Requires 2 full passes reading the data. ",
	        "Randomly selects approximately N rows, trying to rebalance equally all modalities of a column. Does not oversample, only undersample (so some rare modalities may remain under-represented). Rebalancing is not exact. Requires 2 full passes.",
	        "Randomly selects approximately X% of the rows, trying to rebalance equally all modalities of a column. Does not oversample, only undersample  (so some rare modalities may remain under-represented). Rebalancing is not exact. Requires 2 full passes.",
	        "Takes the last N rows of the dataset. Requires a full pass."
	    ],

	    streamSamplingMethods : [
	    	["FULL", "No sampling (whole data)"],
            ["HEAD_SEQUENTIAL", "First records"],
	        ["RANDOM_FIXED_RATIO", "Random (approx. ratio)"],
	        ["RANDOM_FIXED_NB", "Random (approx. nb. records)"],
	        ["COLUMN_BASED", "Column values subset (approx. nb. records)"],
	        ["CLASS_REBALANCE_TARGET_NB_APPROX", "Class rebalance (approx. nb. records)"],
	        ["CLASS_REBALANCE_TARGET_RATIO_APPROX", "Class rebalance (approx. ratio)"],
	    ],

	    streamSamplingMethodsDesc : [
	    	"Takes the whole data",
        	"Takes the first N rows of the dataset. Very fast (only reads N rows) but may result in a very biased view of the dataset.",
        	"Randomly selects approximately X% of the rows. Requires a full pass reading the data.",
        	"Randomly selects approximately N rows. Requires 2 full passes.",
	        "Randomly selects a subset of values and chooses all rows with these values, in order to obtain approximately N rows. This is useful for selecting a subset of customers, for example. Requires 2 full passes.",
	        "Randomly selects approximately N rows, trying to rebalance equally all modalities of a column. Does not oversample, only undersample (so some rare modalities may remain under-represented). Rebalancing is not exact. Requires 2 full passes.",
	        "Randomly selects approximately X% of the rows, trying to rebalance equally all modalities of a column. Does not oversample, only undersample  (so some rare modalities may remain under-represented). Rebalancing is not exact. Requires 2 full passes."
	    ],

	    partitionSelectionMethods : [
	        ["ALL", "All partitions"],
    	    ["SELECTED", "Select partitions"],
    	    ["LATEST_N", "Latest partitions"]
    	],

    	partitionSelectionMethodsDesc : [
    		"Use all partitions of the dataset",
    		"Use an explicitly selected list of partitions",
    		"Use the 'latest' partitions currently available in the dataset. This option is only defined for single-dimension time-based partitioning. This method is slower because the list of partitions needs to be recomputed often."
    	],

    	needsColumn : function(method) {
    		return [
    			"STRATIFIED_TARGET_NB_EXACT", "STRATIFIED_TARGET_RATIO_EXACT",
    			"CLASS_REBALANCE_TARGET_NB_APPROX", "CLASS_REBALANCE_TARGET_RATIO_APPROX",
    			"COLUMN_BASED"].indexOf(method) >= 0;
    	},

    	needsRatio : function(method) {
    		return [
    			"RANDOM_FIXED_RATIO",
    			"RANDOM_FIXED_RATIO_EXACT",
    			"STRATIFIED_TARGET_RATIO_EXACT",
    			"CLASS_REBALANCE_TARGET_RATIO_APPROX",
    			].indexOf(method) >= 0;
    	},

    	needsMaxRecords : function(method) {
    		return [
    			"HEAD_SEQUENTIAL",
    			"TAIL_SEQUENTIAL",
    			"RANDOM_FIXED_NB",
    			"RANDOM_FIXED_NB_EXACT",
    			"STRATIFIED_TARGET_NB_EXACT",
    			"CLASS_REBALANCE_TARGET_NB_APPROX",
    			"COLUMN_BASED"].indexOf(method) >= 0;
    	},

    	// Warning: must be kept in sync with Java code in PivotTablesService
    	makeStreamableFromMem : function(memSelection) {
    		var ret = angular.copy(memSelection);
            if (ret.samplingMethod == "RANDOM_FIXED_NB_EXACT") {
                ret.samplingMethod = "RANDOM_FIXED_NB";
            } else if (ret.samplingMethod == "STRATIFIED_TARGET_NB_EXACT") {
                ret.samplingMethod = "RANDOM_FIXED_NB";
            } else if (ret.samplingMethod == "STRATIFIED_TARGET_RATIO_EXACT") {
                ret.samplingMethod = "RANDOM_FIXED_RATIO";
            } else if (ret.samplingMethod == "TAIL_SEQUENTIAL") {
            	ret.samplingMethod = "HEAD_SEQUENTIAL";
            }
            return ret;
    	},

        getSamplingMethodForDocumentation: function (samplingMethod, mlTaskDesign) {
            let samplingMethodDoc = 'No sampling (whole data)';

            switch (samplingMethod) {
                case 'HEAD_SEQUENTIAL':
                    samplingMethodDoc = `First ${mlTaskDesign.splitParams.ssdSelection.maxRecords || 0} records`;
                break;
                case 'RANDOM_FIXED_NB_EXACT':
                    samplingMethodDoc = `Random (${mlTaskDesign.splitParams.ssdSelection.maxRecords || 0} records)`;
                break;
                case 'RANDOM_FIXED_RATIO':
                    samplingMethodDoc = `Random (approximately ${Math.round(mlTaskDesign.splitParams.ssdSelection.targetRatio * 100) || 0}%)`;
                break;
                case 'COLUMN_BASED':
                    samplingMethodDoc = `Column values subset (approximately ${mlTaskDesign.splitParams.ssdSelection.maxRecords || 0} records)`;
                break;
                case 'STRATIFIED_TARGET_NB_EXACT':
                    samplingMethodDoc = `Stratified (${mlTaskDesign.splitParams.ssdSelection.maxRecords || 0} records)`;
                break;
                case 'STRATIFIED_TARGET_RATIO_EXACT':
                    samplingMethodDoc = `Stratified (${Math.round(mlTaskDesign.splitParams.ssdSelection.targetRatio * 100) || 0}%)`;
                break;
                case 'RANDOM_FIXED_NB':
                    samplingMethodDoc = `Random (approximately ${mlTaskDesign.splitParams.ssdSelection.maxRecords || 0} records)`;
                break;
                case 'CLASS_REBALANCE_TARGET_NB_APPROX':
                    samplingMethodDoc = `Class rebalance (approximately ${mlTaskDesign.splitParams.ssdSelection.maxRecords || 0} records)`;
                    break;
                case 'CLASS_REBALANCE_TARGET_RATIO_APPROX':
                    samplingMethodDoc = `Class rebalance (approximately ${Math.round(mlTaskDesign.splitParams.ssdSelection.targetRatio * 100) || 0}%)`;
                break;
                case 'TAIL_SEQUENTIAL':
                    samplingMethodDoc = `Last ${mlTaskDesign.splitParams.ssdSelection.maxRecords || 0} records`;
                    break;
            }

            return samplingMethodDoc;
        }
    }

	return svc;
})

app.directive("datasetSelectionSamplingDetailsFields", function(SamplingData){
	return {
		templateUrl : "/templates/widgets/dataset-selection-sampling-details-fields.html",
		scope : {
			selection : '=',
		},
		link : function($scope) {
			$scope.SamplingData = SamplingData;
		}
	}
})

app.directive("datasetSelectionSorting", function(SamplingData){
	return {
		templateUrl : "/templates/widgets/dataset-selection-sampling-details-fields.html",
		scope : {
			selection : '=',
		},
		link : function($scope) {
			$scope.SamplingData = SamplingData;
		}
	}
})

app.directive("datasetSelectionSamplingDetailsControlgroups", function(SamplingData){
	return {
		templateUrl : "/templates/widgets/dataset-selection-sampling-details-controlgroups.html",
		scope : {
			selection : '=',
		},
		link : function($scope) {
			$scope.SamplingData = SamplingData;
		}
	}
})


app.directive("datasetSelectionOrderingFields", function(){
	return {
		templateUrl : "/templates/widgets/dataset-selection-ordering-fields.html",
		scope : {
			selection : '=',
			datasetSupportsReadOrdering: '=',
			shakerState : '='
		},
		link : function($scope) {
		}
	}
})


app.directive("datasetSelectionPartitionsSelectionFields", function(SamplingData){
	return {
		templateUrl : "/templates/widgets/dataset-selection-partitions-selection-fields.html",
		scope : {
			selection : '=',
			partitioned : '=',
			getPartitionsList: '=',
		},
		link : function($scope) {
			$scope.SamplingData = SamplingData;

			$scope.loadPartitionsList = function(){
				$scope.getPartitionsList().then(function(data){
					$scope.partitionsList = data.sort(function(a,b){
						if ($.isNumeric(a) && $.isNumeric(b)) {return b - a}
						else {return a === b ? 0 : (a < b ? 1 : -1)}
					});
				})
			}
		}
	}
})
app.directive("datasetSelectionPartitionsSelectionControlgroups", function(SamplingData, $timeout){
	return {
		templateUrl : "/templates/widgets/dataset-selection-partitions-selection-controlgroups.html",
		scope : {
            selection: '=',
            partitioned: '=',
            getPartitionsList: '=',
        },
		link : function($scope) {
			$scope.SamplingData = SamplingData;
            $scope.$on('datasetChange', function () {
                $scope.partitionsList = null;
            });
			$scope.loadPartitionsList = function(){
                $scope.getPartitionsList().then(function (data) {
                    $scope.partitionsList = data.sort(function (a, b) {
                        if ($.isNumeric(a) && $.isNumeric(b)) {
                            return b - a
                        }
                        else {
                            return a === b ? 0 : (a < b ? 1 : -1)
                        }
                    });
                });
			}
		}
	}
})
})();
