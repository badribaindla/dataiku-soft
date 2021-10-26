(function() {
'use strict';

var app = angular.module('dataiku.recipes');


var PYTHON_SAMPLE_DEPENDENCY = 'def get_dependencies(target_partition_id):\n'
                            + '    return [target_partition_id]';

app.filter('retrievePartitioning', function(){
    return function(computable){
        if (!computable) { return null; }

        switch (computable.type) {
        case 'DATASET':            return computable.dataset.partitioning;
        case 'MANAGED_FOLDER':     return computable.box.partitioning;
        case 'SAVED_MODEL':        return computable.model.partitioning;
        }
        return null;
    };
});

app.directive("partitionedByInfo", function() {
    return {
        templateUrl : '/templates/recipes/io/partitioned-by-info.html',
        scope:true,
        link : function($scope, element, attrs) {
            $scope.lookupRef = $scope.$eval(attrs.ref);
        }
    }
});

app.directive("customPythonDependencyEditor", function(CreateModalFromTemplate,PartitionDeps,DataikuAPI, CodeMirrorSettingService) {
    return {
        restrict:'E',
        template : '<button class="btn" ng-click="openDialog()">Edit</button>',
        scope : {
            pdepIndex : '=',
            recipe : '=',
            input : '='
        },
        link : function(isolatedScope, element, attrs) {
            isolatedScope.openDialog = function() {
                CreateModalFromTemplate("/templates/recipes/fragments/python-dep-editor.html", isolatedScope,null, function(scope) {

                    scope.localRecipe = angular.copy(isolatedScope.recipe);
                    scope.localInput = angular.copy(isolatedScope.input);
                    // replace input in local recipe, to be able to test
                    $.each(isolatedScope.recipe.inputs, function(roleName, inputRole) {
                        var inputIndex = inputRole.items.indexOf(isolatedScope.input);
                        if (inputIndex >= 0) {
                        	scope.localRecipe.inputs[roleName].items[inputIndex] = scope.localInput;
                        }
                    });
                    scope.localPdep = scope.localInput.deps[isolatedScope.pdepIndex];

                    if(!scope.localPdep.params) {
                        scope.localPdep.params = {};
                    }
                    if(!scope.localPdep.params.code) {
                        scope.localPdep.params.code = PYTHON_SAMPLE_DEPENDENCY;
                    }

                    scope.editorOptions = CodeMirrorSettingService.get('text/x-python');

                    scope.saveAndClose = function() {
                        isolatedScope.input.deps[isolatedScope.pdepIndex].params = angular.copy(scope.localPdep.params);
                        scope.dismiss();
                    };

                    scope.test = function() {
                        scope.testResult = undefined;
                        DataikuAPI.flow.recipes.generic.pdepTest(scope.localRecipe, isolatedScope.input.ref, PartitionDeps.prepareForSerialize(scope.localPdep)).success(function(data) {
                            scope.testResults = data;
                        }).error(setErrorInScope.bind(scope));
                    };
                });
            };
        }
    };
});

app.factory("PartitionDeps", function(Assert, DataikuAPI, Logger, RecipesUtils, $filter) {
    function neverNeedsOutput(pdep) {
        return ["values", "all_available", "latest_available"].indexOf(pdep.func) >= 0;
    }
    function mayWorkWithoutOutput(pdep) {
        return ["time_range"].indexOf(pdep.func) >= 0;
    }

    var svc = {
        // Auto fills proper parameters for a single partition dependency
        // This should be called each time the pdep is changed
        autocomplete : function(pdep, outputDimensions, outputDimensionsWithNow) {
            Logger.info("Autocompleting pdep:"  + JSON.stringify(pdep));
            if (pdep.func == "time_range") {
                if (!pdep.params) pdep.params = {};

                if (!pdep.params.fromMode) pdep.params.fromMode = "RELATIVE_OFFSET";
                if (!pdep.params.fromGranularity) pdep.params.fromGranularity = "DAY";
                if (angular.isUndefined(pdep.params.fromOffset)) pdep.params.fromOffset = 0;
                if (!pdep.params.toGranularity) pdep.params.toGranularity = pdep.params.fromGranularity;
                if (angular.isUndefined(pdep.params.toOffset)) pdep.params.toOffset = 0;

                if (pdep.params.fromMode == "FIXED_DATE" && !pdep.params.fromDate) {
                    pdep.params.fromDate = "2014-01-01";
                }

                if (!pdep.$$output) {
                    if (outputDimensions.length) {
                        pdep.$$output = outputDimensions[0];
                    } else {
                        pdep.$$output = outputDimensionsWithNow[0];
                    }
                }
            } else if(pdep.func == 'custom_python') {
                if (!pdep.params) pdep.params = {};
                if (!pdep.params.code) pdep.params.code = PYTHON_SAMPLE_DEPENDENCY;
            }
            Logger.info("Autocompleted pdep:"  + JSON.stringify(pdep));
        },

        // Fixup pdep definitions. This should be called each time inputs or outputs
        // of the recipe are modified.
        // We don't do it with $watch because it actually makes handling corner cases more difficult
        // Returns :
        //  [outputDimensions, outputDimensiosnWithNow]
        fixup : function(recipe, computablesMap) {
            Logger.info("fixup pdep, recipe is ", recipe);
            Assert.trueish(recipe, 'no recipe');
            Assert.trueish(computablesMap, 'no computablesMap');
            RecipesUtils.getFlatInputsList(recipe).forEach(function(input){
                // console.info("CHECKING IF I HAVE " , input.ref, "in", computablesMap);
                Assert.trueish(computablesMap[input.ref], 'input not in computablesMap');
            });
            RecipesUtils.getFlatOutputsList(recipe).forEach(function(output){
                // console.info("CHECKING IF I HAVE " , output.ref, "in", computablesMap);
                Assert.trueish(computablesMap[output.ref], 'output not in computablesMap');
            });
            /* End sanity checks */

            /* Remove pdeps that were only here temporarily.
             * At the moment, it only means empty "values" deps.
             * If they were needed, we'll recreate them later on) */

            RecipesUtils.getFlatInputsList(recipe).forEach(function(input){
                Logger.info("Cleaning up input deps", input.deps);
                input.deps = input.deps.filter(function(dep) {
                    var isTemp =  dep.out == null && dep.func == "values" && !dep.values;
                    return !isTemp;
                });
                Logger.info("cleaned:" , input.deps);
            });

            // Each partition dep points to an (output, odim) couple or to nothing ...
            // So we keep up to date a list of (output, odim) couples
            var outputDimensions = [];
            RecipesUtils.getFlatOutputsList(recipe).forEach(function(output){
                const computable = computablesMap[output.ref];
                const partitioning = $filter('retrievePartitioning')(computable);

                if (partitioning == null) {
                    return;
                }

                partitioning.dimensions.forEach(function(dim) {
                    outputDimensions.push({
                        out: output.ref,
                        odim: dim.name,
                        label: dim.name + " of " + output.ref
                    });
                });
            });

            Logger.info("Valid possible outputs", outputDimensions);

            // Very important: make a shallow copy of the array because the matching
            // of $$output to outputDimensions is not deep
            var outputDimensionsWithNow = outputDimensions.slice();
            var currentTimeDep = {
                "label" :"Current time"
            };
            outputDimensionsWithNow.push(currentTimeDep)

            // Assign in $$output the correct out/odim couple for existing valid dependencies
            RecipesUtils.getFlatInputsList(recipe).forEach(function(input){
                input.deps.forEach(function(pdep) {
                    if (neverNeedsOutput(pdep)) {
                        Logger.info("Pdep does not need an output", pdep);
                        return;
                    }
                	if (pdep.$$output != null) {
                		// try to find it in the 'new' outputDimensions, in case it's
                		// currently being edited
                		var matchingOd;
                		if (pdep.$$output.label == currentTimeDep.label) {
                		    matchingOd = [currentTimeDep];
                		} else {
                            matchingOd = outputDimensions.filter(function(nod) {return nod.out == pdep.$$output.out && nod.odim == pdep.$$output.odim;});
                		}
                		if ( matchingOd.length == 1) {
                			pdep.$$output = matchingOd[0];
                		} else {
                			pdep.$$output = null;
                		}
                	}
                	if (pdep.$$output == null) {
                        for (var i in outputDimensions) {
                            var od = outputDimensions[i];
                            Logger.info("Compare ", od, pdep);
                            if (od.out == pdep.out && od.odim == pdep.odim) {
                                pdep.$$output = od;
                                Logger.info("YES, matches");
                                break;
                            }
                        }
                	}
                    if (!pdep.$$output) {
                        if (mayWorkWithoutOutput(pdep)) {
                            Logger.info("Failed to find a matching output dimension for pdep ", pdep);
                            pdep.$$output = currentTimeDep;
                        } else {
                            Logger.error("Failed to find a matching output dimension for pdep ", pdep);
                        }
                        // This can happen when removing an output ...
                    }
                });
            });

            // Add entries for missing dependencies
            RecipesUtils.getFlatInputsList(recipe).forEach(function(input){
                const computable = computablesMap[input.ref];
                const partitioning = $filter('retrievePartitioning')(computable);

                if (partitioning) {
                    for (var dimIdx in partitioning.dimensions) {
                        var dim = partitioning.dimensions[dimIdx];
                        Logger.info("Searching for pdep setting ", dim.name, "in", angular.copy(input.deps));

                        if ($.grep(input.deps, dep => dep.idim == dim.name).length === 0) {
                            Logger.info("Will add new pdep ...");
                            var recipeFirstOut = RecipesUtils.getFlatOutputsList(recipe)[0];
                            var newPdep = {
                                out: recipeFirstOut ? recipeFirstOut.ref : null,
                                func : 'equals',
                                idim : dim.name
                            };
                            if (newPdep.out && partitioning.dimensions.length) {
                                var outputDimensions = partitioning.dimensions;
                                // try to match with same dimension on the output
                                newPdep.odim = outputDimensions[0].name;
                                outputDimensions.forEach(function(dim) {
                                    if (dim.name == newPdep.idim) {
                                        newPdep.odim = dim.name;
                                        return;
                                    }
                                });
                                // then fetch the $$output
                                for (var i in outputDimensions) {
                                    var od = outputDimensions[i];
                                    if (od.out == newPdep.out && od.odim == newPdep.odim) {
                                        newPdep.$$output = od;
                                        break;
                                    }
                                }
                            } else {
                                newPdep.func = 'values';
                            }

                            Logger.info("Creating missing pdep for " , input, dim.name, angular.copy(newPdep));
                            input.deps.push(newPdep);
                        }
                    }
                }
            });

            /* If we still have some incomplete dependencies, try to fix them.
             * This happens in the following case:
             *  - I0 partitioned by D0, O0 partitioned by D0, equals dep
             *  - Remove O0 as output
             *  - Add a new dep with the same partitioning. Since the pdep
             *    was already here, we didn't create it.
             *
             * The logic is:
             *  - If the pdep needs absolutely an output
             *  - And it does not have a $$output reference
             *  - then: if there is partitioned output dataset, we set the output to it
             *    else: we fallback to a VALUES
             */
            RecipesUtils.getFlatInputsList(recipe).forEach(function(input){
                input.deps.forEach(function(pdep) {
                    if (neverNeedsOutput(pdep)) {
                        Logger.info("Pdep does not need an output", pdep);
                        return;
                    }
                    if (pdep.$$output == null) {
                        Logger.info("Pdep has no valid output", pdep);

                        if (mayWorkWithoutOutput(pdep)) {
                            Logger.info("but it might work without ....");
                            return;
                        }

                        const recipeFirstOut = RecipesUtils.getFlatOutputsList(recipe)[0];
                        const partitioning = $filter('retrievePartitioning')(computablesMap[recipeFirstOut.ref]);

                        if (recipeFirstOut && partitioning.dimensions.length) {
                            pdep.out = recipeFirstOut.ref;
                            pdep.odim = partitioning.dimensions[0].name;
                            Logger.info("Assign as output", pdep);
                            // Assign the $$output
                            for (var i in outputDimensions) {
                                var od = outputDimensions[i];
                                if (od.out == pdep.out && od.odim == pdep.odim) {
                                    pdep.$$output = od;
                                    break;
                                }
                            }
                        } else {
                            pdep.func = 'values';
                        }
                    }
                });
            });

            Logger.info("After fixup, inputs", recipe.inputs, outputDimensions, outputDimensionsWithNow);
            return [outputDimensions, outputDimensionsWithNow];
        },

        /* Rewrite the pdep in serializable form */
        prepareForSerialize : function(pdep, notEdited) {
            var ret = angular.copy(pdep);
            if (ret.$$output) {
                if (ret.$$output.odim) {
                    ret.odim = ret.$$output.odim;
                } else {
                    delete ret.odim;
                }
                if (ret.$$output.out) {
                    ret.out = ret.$$output.out;
                } else {
                    delete ret.out;
                }
                //ret.$$output = null;
            } else if (neverNeedsOutput(ret) || mayWorkWithoutOutput(ret)) {
            } else {
                if (!notEdited) { // under edition => should have the $$output
                    Logger.warn("Saving incomplete pdep", ret);
                }
            }
            if (ret.func != 'values') delete ret.values;
            if (ret.func == 'values' || ret.func == "latest_available" || ret.func == "all_available") {
                delete ret.odim; // Meaningless
            }
            // convert params to string
            if (ret.params) {
                angular.forEach(ret.params, function(value, key) {ret.params[key] = value == null ? null : value.toString();});
            }
            //console.info("Prepare for serialize", pdep, "gives", ret);
            return ret;
        },

        prepareRecipeForSerialize : function(recipe, notEdited) {
            RecipesUtils.getFlatInputsList(recipe).forEach(function(input){
                if (input.deps != null) {
                    input.deps = input.deps.map(function(p) {return svc.prepareForSerialize(p, notEdited);});
                }
            });
            return recipe;
        },

        test : function(recipe, pdepInputRef, pdep, errorScope) {
            var recipeSerialized = angular.copy(recipe);
            svc.prepareRecipeForSerialize(recipeSerialized);
            /* The result of the test is directly written in pdep.$$testResult */
            DataikuAPI.flow.recipes.generic.pdepTest(recipeSerialized,  pdepInputRef, svc.prepareForSerialize(pdep)).success(function(data) {
                pdep.$$testResult = data;
            }).error(setErrorInScope.bind(errorScope));
        },

        timeRangeFromModes : [
            ["RELATIVE_OFFSET", "Offset to reference time"],
            ["FIXED_DATE", "Fixed date"]
        ],
        timeRangeGranularities : [
            ["YEAR", "Year(s)"],
            ["MONTH", "Month(s)"],
            ["DAY", "Day(s)"],
            ["HOUR", "Hour(s)"]
        ],
        depFunctions : [
            ['equals', 'Equals'],
            ['time_range', "Time Range"],
            ['current_week', "Since beginning of week"],
            ['current_month', "Since beginning of month"],
            ['whole_month', "Whole month"],
            ['values', "Explicit values"],
            ['latest_available', 'Latest available'],
            ['all_available', 'All available'],
            ['custom_python','Python dependency function'],
            ['sliding_days', "Sliding days (deprecated, use Time Range)"],

        ],
    }
    return svc;
});

})();