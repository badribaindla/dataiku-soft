(function(){
'use strict';

var app = angular.module('dataiku.shaker');

function oneWayCompare(small,big) {
    if(small==big) {
        return true;
    } else if(Array.isArray(small)) {
        if(!Array.isArray(big)) {
            return false;
        }
        if(small.length!=big.length) {
           return false;
        }
        for(var i = 0 ; i < small.length; i++) {
            if(!oneWayCompare(small[i],big[i])) {
                return false;
            }
        }
        return true;
    } else if(typeof small=='object'){
        if(typeof big!='object') {
            return false;
        }
        for(var k in small) {
            if(!k.startsWith('$') && !oneWayCompare(small[k], big[k])) {
                return false;
            }
        }
        return true;
    }
}


app.controller("ShakerRecipeCreationController", function($scope, Fn, $stateParams, DataikuAPI, $controller) {
    $scope.recipeType = "shaker";
    $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

    $scope.autosetName = function() {
        if ($scope.io.inputDataset) {
            var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
            $scope.maybeSetNewDatasetName(niceInputName + "_prepared");
        }
    };
});


app.directive("shakerRecipe", function($rootScope, $filter, $timeout, $q, Assert, DataikuAPI, WT1, TopNav, PartitionDeps, RecipesUtils, StateUtils, AnyLoc, Dialogs, Logger, ComputableSchemaRecipeSave, computeColumnWidths) {
    return {
        scope: true,
        controller: function($scope, $stateParams, $state, $controller) {
            $controller("_RecipeWithEngineBehavior", {$scope});

            TopNav.setTab(StateUtils.defaultTab("code"));

            WT1.event("shaker-script-open");

            $scope.hooks.getShaker = function() {
                return $scope.shaker;
            };

            $scope.hooks.onRecipeLoaded = function(){
                Logger.info("On Recipe Loaded");
                $scope.hooks.updateRecipeStatus();
            };

            $scope.hooks.updateRecipeStatus = function(forceUpdate, exactPlan) {
                var deferred = $q.defer();
                var payload = $scope.hooks.getPayloadData();
                var outputSchema = {columns:[]};
                if ($scope.table && $scope.table.headers) {
                	$scope.table.headers.forEach(function(h) {
                		if (h.recipeSchemaColumn && h.recipeSchemaColumn.column) {
                			var c = angular.copy(h.recipeSchemaColumn.column)
                			if (!c.name) {
                				c.name = h.name;
                			}
                			outputSchema.columns.push(c);
                		}
                	});
                }
                $scope.updateRecipeStatusBase(exactPlan, payload, {reallyNeedsExecutionPlan: exactPlan, outputSchema: outputSchema}).then(function() {
                    // $scope.recipeStatus should have been set by updateRecipeStatusBase
                    if (!$scope.recipeStatus) return deferred.reject();
                    deferred.resolve($scope.recipeStatus);
                    $scope.updateStepTranslatabilities();
                });
                return deferred.promise;
            };

            $scope.hooks.getPayloadData = function() {
                return JSON.stringify($scope.hooks.getShaker());
            };

            $scope.hooks.save = function() {
                var deferred = $q.defer();

                $scope.fixPreview();

                if ($scope.hasAnySoftDisabled()){
                    Dialogs.error($scope, "Cannot save", "Cannot save this prepare recipe: please disable Step preview");
                    deferred.reject();
                    return deferred.promise;
                }

                /* Complete the partition deps from the "fixedup" version */
                var recipeSerialized = angular.copy($scope.recipe);
                PartitionDeps.prepareRecipeForSerialize(recipeSerialized);

                var shaker = $scope.hooks.getShaker();

                ComputableSchemaRecipeSave.handleSaveShaker($scope, recipeSerialized, shaker, $scope.recipeOutputSchema, deferred);
                return deferred.promise;
            };

            $scope.hooks.recipeIsDirty = function() {
                if (!$scope.recipe) return false;
                if ($scope.creation) {
                    return true;
                } else {
                    var dirty = !angular.equals($scope.recipe, $scope.origRecipe);
                    dirty = dirty || $scope.schemaDirtiness.dirty;
                    var shaker = $scope.hooks.getShaker();
                    dirty = dirty || !oneWayCompare($scope.origShaker.steps,shaker.steps);
                    // FIXME That is ugly. oneWayCompare is used to ignore "stepStep" on steps,
                    // but we do want to notice when override table changes
                    if (!dirty) {
                        for(var i in $scope.origShaker.steps) {
                            var oldS = $scope.origShaker.steps[i];
                            var newS = shaker.steps[i];
                            dirty = dirty || !angular.equals(oldS.overrideTable, newS.overrideTable);
                            dirty = dirty || !angular.equals(oldS.comment, newS.comment);
                        }
                    }
                    dirty = dirty || !angular.equals($scope.origShaker.explorationFilters, shaker.explorationFilters)
                    dirty = dirty || !angular.equals($scope.origShaker.explorationSampling, shaker.explorationSampling)
                    return dirty;
                }
            };

            $scope.shakerHooks.setColumnMeaning = function(column, newMeaning) {
                Assert.inScope($scope, 'shaker');
                Assert.inScope($scope, 'recipeOutputSchema');

                var colData = $scope.recipeOutputSchema.columns[column.name];
                if (!colData){
                    Logger.warn("Column " + column.name + " not found");
                    return;
                }
                colData.column.meaning = newMeaning;
                $scope.schemaDirtiness.dirty = true;

                $scope.refreshTable(false);
            };

            $scope.shakerHooks.getSetColumnStorageTypeImpact = function(column, newType){
                var deferred = $q.defer();
                deferred.resolve({justDoIt:true});
                return deferred.promise;
            };
            $scope.shakerHooks.setColumnStorageType = function(column, newType, actionId){
                var colData = $scope.recipeOutputSchema.columns[column.name];
                if (!colData){
                    Logger.warn("Column " + column.name + " not found");
                    return;
                }
                colData.column.type = newType;
                colData.persistent = true;
                $scope.schemaDirtiness.dirty = true;
                $scope.refreshTable(true);
            };

            $scope.shakerHooks.updateColumnDetails = function(column) {
                var colData = $scope.recipeOutputSchema.columns[column.name];
                if (!colData){
                    Logger.warn("Column " + column.name + " not found");
                    return;
                }
                colData.column = column;
                colData.persistent = true;
                $scope.schemaDirtiness.dirty = true;
                $scope.refreshTable(true);
            };

            $scope.shakerHooks.updateColumnWidth = function(name, width) {
                Assert.inScope($scope, 'shaker');
                Assert.trueish($scope.shaker.columnWidthsByName, 'columnWidthsByName is null');

                $scope.shaker.columnWidthsByName[name] = width;
                $scope.schemaDirtiness.dirty = true;
                $scope.refreshTable(false);
            };

            $scope.clearResize = function() {
                Assert.inScope($scope, 'shaker');
                Assert.trueish($scope.shaker.columnWidthsByName, 'columnWidthsByName is null');

                const minColumnWidth = 100;
                $scope.shaker.columnWidthsByName = computeColumnWidths($scope.table.initialChunk, $scope.table.headers, minColumnWidth, $scope.hasAnyFilterOnColumn, $scope.shaker.columnWidthsByName, true)[1];
                $scope.schemaDirtiness.dirty = true;
                $scope.refreshTable(false);
            }

            $scope.isRecipe = true;
            $scope.table = undefined;
            $scope.processors = undefined;
            $scope.scriptId = "I don't need a script id"
            $scope.shakerWithSteps = true;
            $scope.shakerWritable = $scope.isProjectAnalystRW();

            $scope.schemaDirtiness = { dirty : false};

            var input = RecipesUtils.getSingleInput($scope.recipe, "main").ref;
            if (input.indexOf(".") > -1) {
                $scope.inputDatasetProjectKey = input.split(".")[0];
                $scope.inputDatasetName = input.split(".")[1];
            } else {
                $scope.inputDatasetProjectKey = $stateParams.projectKey;
                $scope.inputDatasetName = input;
            }

            $scope.shaker = JSON.parse($scope.script.data);
            $scope.shaker.origin = "PREPARE_RECIPE";
            $scope.origShaker = angular.copy($scope.shaker);
            $scope.fixupShaker();
            $scope.requestedSampleId = null;

            $scope.shakerState.writeAccess = $scope.isProjectAnalystRW();
            $scope.$watch("projectSummary", function(nv, ov) {
                $scope.shakerWritable = $scope.isProjectAnalystRW();
                $scope.shakerState.writeAccess = $scope.isProjectAnalystRW();
            });
            $scope.shakerState.withSteps = true;

            $scope.shakerHooks.onTableRefresh = function() {
                $scope.updateRecipeStatusLater();
            }
            $scope.shakerHooks.afterTableRefresh = function() {
            	// for steps with a report, because the report comes back from the table report
                $scope.updateRecipeStatusLater();
            }

            $scope.updateStepTranslatabilities = function() {
            	if (!$scope.recipeStatus) return;
            	if (!$scope.shaker.steps) return;
            	var flattenEnabledSteps = function(steps) {
            		steps.forEach(function(s) {delete s.$translatability;});
            		var flatList = [];
            		return steps.map(function(s) {
                		if (!s.disabled) {
                			if (s.metaType == 'GROUP') {
                				return flattenEnabledSteps(s.steps);
                			} else {
                				return [s];
                			}
                		} else {
                			return [];
                		}
                	}).reduce(function(acc, a) {return acc.concat(a);}, []);
            	};
            	var flatStepList = flattenEnabledSteps($scope.shaker.steps);
            	if (!$scope.recipeStatus.translatabilities) return; // do it here so that the translabilites are reset if the status is failed
            	if (flatStepList.length == $scope.recipeStatus.translatabilities.length) {
            		flatStepList.forEach(function(s, i) {s.$translatability = $scope.recipeStatus.translatabilities[i];});
            	}
            };

            var outputRef = RecipesUtils.getSingleOutput($scope.recipe, "main").ref;
            var outputLoc = AnyLoc.getLocFromSmart($stateParams.projectKey, outputRef);

            /* Set the initial dataset output schema as current recipe output schema */
            DataikuAPI.datasets.get(outputLoc.projectKey, outputLoc.localId, $stateParams.projectKey)
            .success(function(outputDataset) {
                $scope.recipeOutputSchema = { columns : {}, columnsOrder : [], outputDatasetType : outputDataset.type }
                angular.forEach(outputDataset.schema.columns, function(col) {
                    $scope.recipeOutputSchema.columns[col.name] = {
                        column: col,
                        persistent : true
                    };
                    $scope.recipeOutputSchema.columnsOrder.push(col.name);
                });
                $scope.refreshTable(false);
                $scope.baseInit();
            }).error(setErrorInScope.bind($scope));

            $scope.enableAutoFixup();

            /* When the "running job" alert is shown or removed, we need to force the
             * fat table to redraw itself */
            $scope.$watch("startedJob.jobId", function(){
                Logger.info("Forcing shaker table resize");
                $rootScope.$broadcast("forcedShakerTableResizing");
            });

            //TODO @recipes32 remove?
            $scope.$watch("recipe.params.engine", function(nv, ov) {
                if (nv == "SPARK" && !$scope.recipe.params.sparkConfig) {
                    $scope.recipe.params.sparkConfig = {}
                }
            });
            // params is not in the same place
            $scope.$watch("recipe.params.engineParams", $scope.updateRecipeStatusLater, true);
        }
    }
});
})();
