(function(){
'use strict';
/**
 * Services for building computables
 */

var app = angular.module('dataiku.common.build', []);

app.service('PartitionSelection', ['LocalStorage', '$stateParams', 'Logger', function(LocalStorage, $stateParams, Logger) {
    function get() {
        if ($stateParams.projectKey) {
        	var stored = LocalStorage.get($stateParams.projectKey + '.partitionSettings') || {};
            Logger.info("reading partitionSettings", stored);
            return stored;
        }
        throw new Error("projectKey not defined");
    }
    function set(partitionSettings) {
        //TODO cleanup mechanism to avoid growing partitionSettings too much
        Logger.info("saving partitionSettings", partitionSettings);
        LocalStorage.set($stateParams.projectKey + '.partitionSettings', partitionSettings);
    }
    function save(dimName, value) {
        var partitionSettings = get();
        if (value != null && (value.start !== undefined || value.end !== undefined || value.explicit !== undefined)) {
            var startKey = dimName+"_start_"+value.format;
            partitionSettings[startKey] = value.start;
            var endKey = dimName+"_end_"+value.format;
            partitionSettings[endKey] = value.end;
            var explicitKey = dimName+"_explicit_"+value.format;
            partitionSettings[explicitKey] = value.explicit;
            var useExplicitKey = dimName+"_useExplicit_"+value.format;
            partitionSettings[useExplicitKey] = value.useExplicit;
        } else {
            partitionSettings[dimName] = value;
        }
        set(partitionSettings);
    }
    function getTimeFormat(dimType, params) {
        var format;
        if (dimType == 'time' && params.period != 'YEAR') {
            var format = 'YYYY';
            if(params.period == 'MONTH'){
                format = 'YYYY-MM';
            } else if(params.period == 'DAY'){
                format = 'YYYY-MM-DD';
            } else if(params.period == 'HOUR'){
                format = 'YYYY-MM-DD-HH';
            }
        }
        return format;
    }

    //Legacy
    function getPartitionsFromCookie(dimName, timeFormat) {
        var dimName2 = 'partition_' + dimName;
        var ret, found;
        if (timeFormat) {
            var start = getCookie(dimName2 + "_start_" + timeFormat);
            var end = getCookie(dimName2 + "_end_" + timeFormat);
            var explicit = getCookie(dimName2 + "_explicit" + timeFormat);
            var useExplicit = getCookie(dimName2 + "_useExplicit" + timeFormat);
            ret = {
                'start': start || moment().format(timeFormat),
                'end': end || moment().format(timeFormat),
                'explicit': explicit || moment().format(timeFormat),
                'useExplicit': useExplicit || false,
                'format': timeFormat
            };
            found = start !== undefined || end !== undefined;
        } else {
            ret = getCookie(dimName2) || undefined;;
            found = ret !== undefined;
        }
        return found ? ret : undefined;
    }

    function getPartitions(dimName, timeFormat) {
        var partitionSettings = get();
        var ret, found;
        if (timeFormat) {
            var start = partitionSettings[dimName + "_start_" + timeFormat];
            var end = partitionSettings[dimName + "_end_" + timeFormat];
            var explicit = partitionSettings[dimName + "_explicit_" + timeFormat];
            var useExplicit = partitionSettings[dimName + "_useExplicit_" + timeFormat];
            ret = {
                'start': start || moment().format(timeFormat),
                'end': end || moment().format(timeFormat),
                'explicit': explicit || moment().format(timeFormat),
                'useExplicit': useExplicit || false,
                'format': timeFormat
            };
            found = start !== undefined || end !== undefined;
        } else {
            ret = partitionSettings[dimName];
            found = ret !== undefined;
        }
        if (!found) {
            var fromCookie = getPartitionsFromCookie(dimName, timeFormat);
            if (fromCookie !== undefined) {
                ret = fromCookie;
                save(dimName, fromCookie);
            }
        }
        return ret;
    }

    return {
        getBuildPartitions: function(partitioning) {
            const buildPartitions = {};
            if (partitioning) {
                angular.forEach(partitioning.dimensions, function(dim) {
                    const timeFormat = getTimeFormat(dim.type, dim.params);
                    buildPartitions[dim.name] = getPartitions(dim.name, timeFormat);
                });
            }
            return buildPartitions;
        },
        saveBuildPartitions: function(partitioning, buildPartitions) {
            if (partitioning) {
                angular.forEach(partitioning.dimensions, function(dim) {
                    save(dim.name, buildPartitions[dim.name]);
                });
            }
        },
    }
}]);


app.service("JobDefinitionComputer", function(AnyLoc, $stateParams){
    var svc = {
        computeTargetPartition : function(partitioning, buildPartitions = {}) {
            if (partitioning && partitioning.dimensions.length > 0) {
                var dimensionValuesList = []; // will do a cartesian product of these
                angular.forEach(partitioning.dimensions, function(dimension, index){
                    var bp = buildPartitions[dimension.name];
                    if (!bp) {
                        return;
                    }
                    if (dimension.type == 'time') {
                         if (dimension.params.period == "YEAR") {
                             dimensionValuesList.push([bp]);
                         } else if (bp.useExplicit) {
                             if (bp.explicit.indexOf(',') >= 0) {
                                 dimensionValuesList.push(bp.explicit.split(','))
                             } else {
                                 dimensionValuesList.push([bp.explicit]);
                             }
                         } else {
                             if(bp.start != bp.end) {
                                 dimensionValuesList.push([bp.start + '/' + bp.end]);
                             } else {
                                 dimensionValuesList.push([bp.start]);
                             }
                         }
                    } else {
                        dimensionValuesList.push([bp]);
                    }
                });
                var partitionIds = [''];
                dimensionValuesList.forEach(function(dimensionValues) {
                    var newPartitionIds = [];
                    dimensionValues.forEach(function(dimensionValue) {
                        partitionIds.forEach(function(partitionId) {
                            newPartitionIds.push(partitionId + (partitionId ? '|' : '') + dimensionValue);
                        });
                    });
                    Array.prototype.splice.apply(partitionIds, [0, partitionIds.length].concat(newPartitionIds));
                });
                return partitionIds.join(',');
            } else {
                return null;
            }
        },

        computeOutputForDataset : function(dataset, buildPartitions) {
            var output =  {
                targetDataset : dataset.name,
                targetDatasetProjectKey : dataset.projectKey,
                type : 'DATASET',
                targetPartition : svc.computeTargetPartition(dataset.partitioning, buildPartitions)
            };
            return output;
        },

        computeOutputForSavedModel : function(model, buildPartitions) {
            return {
                targetDataset : model.id,
                targetDatasetProjectKey : model.projectKey,
                type : 'SAVED_MODEL',
                targetPartition : svc.computeTargetPartition(model.partitioning, buildPartitions)
            };
        },

        computeJobDefForSavedModel : function(projectKey, mode, model, buildPartitions, triggeredFrom, recipe) {
            var jd = {};
            jd.type = mode;
            jd.refreshHiveMetastore = true;
            jd.projectKey = projectKey;
            jd.outputs = [svc.computeOutputForSavedModel(model, buildPartitions)];
            if (recipe) {
                jd.recipe = recipe;
            }
            if (triggeredFrom) {
                jd.triggeredFrom = triggeredFrom;
            }
            return jd;
        },

        computeOutputForBox : function(box, buildPartitions) {
           return {
               targetDataset : box.id,
               targetDatasetProjectKey : box.projectKey,
               type : 'MANAGED_FOLDER',
               targetPartition : svc.computeTargetPartition(box.partitioning, buildPartitions)
           };
        },

        computeOutputForModelEvaluationStore : function(store, buildPartitions) {
           return {
               targetDataset : store.id,
               targetDatasetProjectKey : store.projectKey,
               type : 'MODEL_EVALUATION_STORE',
               targetPartition : svc.computeTargetPartition(store.partitioning, buildPartitions)
           };
        },


       //TODO is that deprecated?
       computeJobDefForSingleDataset: function(projectKey, mode, dataset, buildPartitions, triggeredFrom, recipe){
           var svc = this;
           var jd = {
               type: mode,
               refreshHiveMetastore: true,
               projectKey: projectKey,
               outputs: [svc.computeOutputForDataset(dataset, buildPartitions)]
           }
           if (triggeredFrom) {
               jd.triggeredFrom = triggeredFrom;
           }
           if (recipe) {
               jd.recipe = recipe;
           }
           return jd;
       },
       computeJobDefForBox : function(projectKey, mode, box, buildPartitions, triggeredFrom, recipe) {
           var jd = {};
           jd.type = mode;
           jd.refreshHiveMetastore = true;
           jd.projectKey = projectKey;
           jd.outputs = [svc.computeOutputForBox(box, buildPartitions)];
           if (recipe) {
               jd.recipe = recipe;
           }
           if (triggeredFrom) {
               jd.triggeredFrom = triggeredFrom;
           }
           return jd;
        },
       computeJobDefForModelEvaluationStore : function(projectKey, mode, store, buildPartitions, triggeredFrom, recipe) {
           var jd = {};
           jd.type = mode;
           jd.refreshHiveMetastore = true;
           jd.projectKey = projectKey;
           jd.outputs = [svc.computeOutputForModelEvaluationStore(store, buildPartitions)];
           if (recipe) {
               jd.recipe = recipe;
           }
           if (triggeredFrom) {
               jd.triggeredFrom = triggeredFrom;
           }
           return jd;
        },
        computeOutputForStreamingEndpoint : function(projectKey, streamingEndpointId) {
            return {
                targetDataset : streamingEndpointId,
                targetDatasetProjectKey : projectKey,
                type : 'STREAMING_ENDPOINT'
            };
        },

        computeJobDefForStreamingEndpoint : function(projectKey, mode, streamingEndpoint, buildPartitions, triggeredFrom, recipe) {
           var jd = {};
           jd.type = mode;
           jd.refreshHiveMetastore = true;
           jd.projectKey = projectKey;
           jd.outputs = [svc.computeOutputForStreamingEndpoint(projectKey, streamingEndpoint.id)];
           if (recipe) {
               jd.recipe = recipe;
           }
           if (triggeredFrom) {
               jd.triggeredFrom = triggeredFrom;
           }
           return jd;
        }
    }
	return svc;
});

})();