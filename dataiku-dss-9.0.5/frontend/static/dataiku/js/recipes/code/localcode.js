(function() {
'use strict';

const app = angular.module('dataiku.recipes');

app.factory("CodeRecipeFillingHelper", function(RecipesUtils) {
    var svc = {
        getIOData: function($scope) {
            const inputItems = RecipesUtils.getInputsForRole($scope.recipe, "main");
            const inputDatasets  = inputItems.map(item => $scope.computablesMap[item.ref]).filter(x => x.type == "DATASET");
            const inputStreamingEndpoints  = inputItems.map(item => $scope.computablesMap[item.ref]).filter(x => x.type == "STREAMING_ENDPOINT");
            const outputItems = RecipesUtils.getOutputsForRole($scope.recipe, "main");
            const outputDatasets  = outputItems.map(item => $scope.computablesMap[item.ref]).filter(x => x.type == "DATASET");
            const outputStreamingEndpoints  = outputItems.map(item => $scope.computablesMap[item.ref]).filter(x => x.type == "STREAMING_ENDPOINT");

            return {
                inputItems: inputItems,
                inputDatasets: inputDatasets,
                inputStreamingEndpoints: inputStreamingEndpoints,
                outputItems: outputItems,
                outputDatasets: outputDatasets,
                outputStreamingEndpoints: outputStreamingEndpoints,
                isOneDatasetToOneDataset: (inputDatasets.length == 1 && outputDatasets.length == 1),
                isOneStreamingEndpointToOneDataset: (inputDatasets.length == 0 && inputStreamingEndpoints.length == 1 && outputDatasets.length == 1 && outputStreamingEndpoints.length == 0),
                isOneDatasetToOneStreamingEndpoint: (inputDatasets.length == 1 && inputStreamingEndpoints.length == 0 && outputDatasets.length == 0 && outputStreamingEndpoints.length == 1),
                isOneStreamingEndpointToOneStreamingEndpoint: (inputDatasets.length == 0 && inputStreamingEndpoints.length == 1 && outputDatasets.length == 0 && outputStreamingEndpoints.length == 1)
            }
        }
    }
    return svc;
})

app.controller("PythonRecipeController", function($scope, $rootScope, CodeBasedEditorUtils, CodeBasedValidationUtils, CodeBasedToPluginConverter, CodeMirrorSettingService, DataikuAPI, $q, TopNav, $state, $stateParams, RecipesUtils, RecipeRunJobService, CreateModalFromTemplate, Dialogs, WT1, $timeout, CodeRecipeFillingHelper) {
    $scope.enableAutoFixup();

    // Editor options
    $scope.identifierQuote = '"';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-python', $scope, true);

    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            if (type == "FLOW") {
                $scope.cm.replaceSelection('dataiku.dku_flow_variables["'+variableName+'"]', "end");
            } else {
                $scope.cm.replaceSelection('dataiku.get_custom_variables()["'+variableName+'"]', "end");
            }
        });
        $scope.cm.focus();
    }

    $scope.autofillCode = function() {
        $scope.script.data = "# -*- coding: utf-8 -*-\n";
        $scope.script.data += "import dataiku\n";
        $scope.script.data += "import pandas as pd, numpy as np\n";
        $scope.script.data += "from dataiku import pandasutils as pdu\n\n";

        const recipeIOData = CodeRecipeFillingHelper.getIOData($scope);

        if (recipeIOData.inputItems.length > 0) {
            $scope.script.data += "# Read recipe inputs\n";
        }
        var modelCount = 1;
        recipeIOData.inputItems.forEach(function(item) {
            var computable = $scope.computablesMap[item.ref];
            if (computable.type == 'DATASET' ) {
                $scope.script.data += cleanupVariable(item.ref) + " = dataiku.Dataset(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(item.ref) + "_df = " + cleanupVariable(item.ref) + ".get_dataframe()\n"
            } else if (computable.type == 'MANAGED_FOLDER' ) {
                var name = computable.box.name;
                $scope.script.data += cleanupVariable(name) + " = dataiku.Folder(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(name) + "_info = " + cleanupVariable(name) + ".get_info()\n"
            } else if (computable.type == 'SAVED_MODEL') {
                $scope.script.data += "# " + computable.label + "\n";
                $scope.script.data += "model_" + modelCount + " = dataiku.Model(\""+ item.ref +"\")\n";
                $scope.script.data += "pred_" + modelCount + " = model_" + modelCount + ".get_predictor()\n"
                modelCount++;
            } else if (computable.type == 'MODEL_EVALUATION_STORE') {
                var name = computable.mes.name;
                $scope.script.data += cleanupVariable(name) + " = dataiku.ModelEvaluationStore(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(name) + "_info = " + cleanupVariable(name) + ".get_info()\n"
                modelCount++;
            }
        })
        $scope.script.data += "\n\n";

        if (recipeIOData.isOneDatasetToOneDataset) {
            // Special case for special people: make the code recipe work without actually writing code.
            $scope.script.data += "# Compute recipe outputs from inputs\n";
            $scope.script.data += "# TODO: Replace this part by your actual code that computes the output, as a Pandas dataframe\n";
            $scope.script.data += "# NB: DSS also supports other kinds of APIs for reading and writing data. Please see doc.\n\n";
            $scope.script.data +=  cleanupVariable(recipeIOData.outputDatasets[0].name) + "_df = " + cleanupVariable(recipeIOData.inputDatasets[0].name) + "_df # For this sample code, simply copy input to output\n";
        } else if (recipeIOData.outputDatasets.length > 0) {
            // Make it very very clear that you have to write code
            $scope.script.data += "# Compute recipe outputs\n";
            $scope.script.data += "# TODO: Write here your actual code that computes the outputs\n";
            $scope.script.data += "# NB: DSS supports several kinds of APIs for reading and writing data. Please see doc.\n\n";
            recipeIOData.outputItems.forEach(function(item) {
                var computable = $scope.computablesMap[item.ref];
                if (computable.type == 'DATASET') {
                    $scope.script.data += cleanupVariable(item.ref) + "_df = ... # Compute a Pandas dataframe to write into " + item.ref + "\n";
                }
            })
        }

        $scope.script.data += "\n\n";

        if (recipeIOData.outputItems.length > 0) {
            $scope.script.data += "# Write recipe outputs\n";
        }
        recipeIOData.outputItems.forEach(function(item) {
            var computable = $scope.computablesMap[item.ref];
            if (computable.type == 'DATASET') {
                $scope.script.data += cleanupVariable(item.ref) + " = dataiku.Dataset(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(item.ref) + ".write_with_schema(" + cleanupVariable(item.ref) + "_df)\n"
            } else if (computable.type == 'MANAGED_FOLDER' ) {
                var name = computable.box.name;
                $scope.script.data += cleanupVariable(name) + " = dataiku.Folder(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(name) + "_info = " + cleanupVariable(name) + ".get_info()\n"
            } else if (computable.type == 'STREAMING_ENDPOINT' ) {
                var name = computable.streamingEndpoint.id;
                $scope.script.data += cleanupVariable(name) + " = dataiku.StreamingEndpoint(\""+ item.ref +"\")\n";
                $scope.script.data += "with " + cleanupVariable(name) + ".get_writer() as " + cleanupVariable(name) + "_writer:\n";
                $scope.script.data += "    # " + cleanupVariable(name) + "_writer.write_row_dict(...)\n";
                $scope.script.data += "    # " + cleanupVariable(name) + "_writer.flush()\n";
            } else if (computable.type == 'MODEL_EVALUATION_STORE' ) {
                var name = computable.mes.name;
                $scope.script.data += cleanupVariable(name) + " = dataiku.ModelEvaluationStore(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(name) + "_info = " + cleanupVariable(name) + ".get_info()\n"
            }
        });
    };

    $scope.hooks.transformToDevPlugin = function(){
        CodeBasedToPluginConverter.transformToDevPlugin($scope, DataikuAPI.flow.recipes.python.convertToCustom, "python");
    }

    $rootScope.$broadcast('transformToDevPlugin',$scope.hooks.transformToDevPlugin);

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            return valResult;
        });
    };
    $scope.hooks.preRunValidate = $scope.validateRecipe;
});


app.controller("CPythonRecipeController", function($scope, $controller, CodeBasedEditorUtils, CodeBasedValidationUtils, CodeRecipeFillingHelper, CodeBasedToPluginConverter, DataikuAPI, $q, TopNav, $state, $stateParams, RecipesUtils, RecipeRunJobService, CreateModalFromTemplate, Dialogs, WT1, $timeout, Logger) {

    $controller("_ContinuousRecipeInitStartedJobBehavior", {$scope:$scope});

    $scope.enableAutoFixup();

    // Editor options
    $scope.identifierQuote = '"';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-python', $scope, true);
    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            if (type == "FLOW") {
                $scope.cm.replaceSelection('dataiku.dku_flow_variables["'+variableName+'"]', "end");
            } else {
                $scope.cm.replaceSelection('dataiku.get_custom_variables()["'+variableName+'"]', "end");
            }
        });
        $scope.cm.focus();
    }

    $scope.autofillCode = function(functionMode) {
        var suffix;
        if (functionMode !== undefined && $scope.script.data && $scope.script.data.length > 0) {
            let endOfUserCode = $scope.script.data.indexOf('# Previous code');
            if (endOfUserCode < 0) {
                suffix = '\n\n# Previous code \n"""\n' + $scope.script.data.trim() + '\n"""\n';
            } else {
                suffix = '\n\n# Previous code since code mode change\n"""\n' + $scope.script.data.substring(0, endOfUserCode).trim() + '\n"""\n';
            }
        } else {
            suffix = '';
        }        
        if (functionMode) {
            $scope.script.data = '';
        } else {
            $scope.script.data = "# -*- coding: utf-8 -*-\n";  // don't use in function mode
        }
        
        $scope.script.data += "import dataiku\n";
        $scope.script.data += "import pandas as pd, numpy as np, json\n";
        $scope.script.data += "from dataiku import pandasutils as pdu\n\n";

        const recipeIOData = CodeRecipeFillingHelper.getIOData($scope);

        if (recipeIOData.inputItems.length > 0) {
            $scope.script.data += "# Read recipe inputs\n";
        }
        var modelCount = 1;
        recipeIOData.inputItems.forEach(function(item) {
            var computable = $scope.computablesMap[item.ref];
            if (computable.type == 'DATASET' ) {
                $scope.script.data += cleanupVariable(item.ref) + " = dataiku.Dataset(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(item.ref) + "_df = " + cleanupVariable(item.ref) + ".get_dataframe()\n"
            } else if (computable.type == 'STREAMING_ENDPOINT' ) {
                $scope.script.data += cleanupVariable(item.ref) + " = dataiku.StreamingEndpoint(\""+ item.ref +"\")\n";
                if (functionMode) {
                } else {
                    // setup the iterators
                    if (computable.streamingEndpoint.type == 'kafka') {
                        $scope.script.data += cleanupVariable(item.ref) + "_messages = "+ cleanupVariable(item.ref) +".get_message_iterator() # use as a generator, prefer get_native_kafka_consumer()\n";
                    } else if (computable.streamingEndpoint.type == 'sqs') {
                        $scope.script.data += cleanupVariable(item.ref) + "_messages = "+ cleanupVariable(item.ref) +".get_message_iterator() # use as a generator, prefer get_native_sqs_consumer()\n";
                    } else if (computable.streamingEndpoint.type == 'httpsse') {
                        $scope.script.data += cleanupVariable(item.ref) + "_messages = "+ cleanupVariable(item.ref) +".get_message_iterator() # use as a generator, prefer get_native_httpsse_consumer()\n";
                    }                
                }
            } else if (computable.type == 'MANAGED_FOLDER' ) {
                var name = computable.box.name;
                $scope.script.data += cleanupVariable(name) + " = dataiku.Folder(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(name) + "_info = " + cleanupVariable(name) + ".get_info()\n"
            } else if (computable.type == 'SAVED_MODEL') {
                $scope.script.data += "# " + computable.label + "\n";
                $scope.script.data += "model_" + modelCount + " = dataiku.Model(\""+ item.ref +"\")\n";
                $scope.script.data += "pred_" + modelCount + " = model_" + modelCount + ".get_predictor()\n"
                modelCount++;
            }
        })
        $scope.script.data += "\n\n";

        if (functionMode) {
            if (recipeIOData.outputItems.length > 0) {
                $scope.script.data += "# Write recipe outputs\n";
                
                recipeIOData.outputItems.forEach(function(item) {
                    var computable = $scope.computablesMap[item.ref];
                    if (computable.type == 'DATASET') {
                        $scope.script.data += cleanupVariable(item.ref) + " = dataiku.Dataset(\""+ item.ref +"\")\n";
                    } else if (computable.type == 'STREAMING_ENDPOINT' ) {
                        $scope.script.data += cleanupVariable(item.ref) + " = dataiku.StreamingEndpoint(\""+ item.ref +"\")\n";
                    } else if (computable.type == 'MANAGED_FOLDER' ) {
                        var name = computable.box.name;
                        $scope.script.data += cleanupVariable(name) + " = dataiku.Folder(\""+ item.ref +"\")\n";
                        $scope.script.data += cleanupVariable(name) + "_info = " + cleanupVariable(name) + ".get_info()\n"
                    }
                });

                $scope.script.data += "def init():\n";
                $scope.script.data += "    # called once, before the main loop of calls to process() starts\n";
                
                let schemaSuggested = recipeIOData.inputStreamingEndpoints.length == 1 ? (cleanupVariable(recipeIOData.inputStreamingEndpoints[0].smartName) + '.get_schema()') : '...';
                recipeIOData.outputItems.forEach(function(item) {
                    var computable = $scope.computablesMap[item.ref];
                    if (computable.type == 'DATASET') {
                        $scope.script.data += "    " + cleanupVariable(item.ref) + ".write_schema(" + schemaSuggested + ") # construct the list of columns in the output dataset\n"
                    } else if (computable.type == 'STREAMING_ENDPOINT' ) {
                        $scope.script.data += "    " + cleanupVariable(item.ref) + ".set_schema(" + schemaSuggested + ") # construct the list of columns in the output streaming endpoint\n"
                    }
                });
            }
            $scope.script.data += "\n\n";
     
            // Make it very very clear that you have to write code
            $scope.script.data += "# Process input in batches\n";
            $scope.script.data += "def process(inputs, outputs):\n";
            $scope.script.data += "    # TODO: Write here your actual code that computes the outputs\n";
            recipeIOData.inputItems.forEach(function(item) {
                var computable = $scope.computablesMap[item.ref];
                if (computable.type == 'STREAMING_ENDPOINT' ) {
                    $scope.script.data += "    df_" + cleanupVariable(item.ref) + " = inputs.get(" + cleanupVariable(item.ref) + ")\n"
                }
            });
            let dataSuggested = recipeIOData.inputStreamingEndpoints.length == 1 && recipeIOData.inputDatasets.length == 0 ? ('df_' + cleanupVariable(recipeIOData.inputStreamingEndpoints[0].smartName)) : '...';
            recipeIOData.outputItems.forEach(function(item) {
                var computable = $scope.computablesMap[item.ref];
                if (computable.type == 'DATASET') {
                    $scope.script.data += "    outputs.set(" + cleanupVariable(item.ref) + ", " + dataSuggested + ")\n"
                } else if (computable.type == 'STREAMING_ENDPOINT' ) {
                    $scope.script.data += "    outputs.set(" + cleanupVariable(item.ref) + ", " + dataSuggested + ")\n"
                }
            });
        } else {
            // Make it very very clear that you have to write code
            $scope.script.data += "# Compute recipe outputs\n";
            $scope.script.data += "# TODO: Write here your actual code that computes the outputs\n";
            $scope.script.data += "# NB: DSS supports several kinds of APIs for reading and writing data. Please see doc.\n\n";
    
            if (recipeIOData.outputItems.length > 0) {
                $scope.script.data += "# Write recipe outputs\n";
            }
            if (recipeIOData.isOneDatasetToOneStreamingEndpoint) {
                // Special case for special people: make the code recipe work without actually writing code.
                let item = recipeIOData.outputItems[0];
                var computable = $scope.computablesMap[item.ref];
                let inputItem = recipeIOData.inputItems[0];
                $scope.script.data += cleanupVariable(item.ref) + " = dataiku.StreamingEndpoint(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(item.ref) + ".set_schema(" + cleanupVariable(inputItem.ref) + ".read_schema()) # construct the list of columns in the output streaming endpoint\n"
                $scope.script.data += "with " + cleanupVariable(item.ref) + ".get_writer() as " + cleanupVariable(item.ref) + "_writer:\n";
                $scope.script.data += "    cnt = 0\n";
                $scope.script.data += "    for i, row in " + cleanupVariable(inputItem.ref) + "_df.iterrows(): # iterate over rows to write \n";
                $scope.script.data += "        " + cleanupVariable(item.ref) + "_writer.write_row_dict(row.to_dict())\n";
                $scope.script.data += "        cnt += 1\n";
                $scope.script.data += "        if cnt > 100:\n";
                $scope.script.data += "            cnt = 0\n";
                $scope.script.data += "            " + cleanupVariable(item.ref) + "_writer.flush()\n";
                $scope.script.data += "\n";
                $scope.script.data += "raise Exception('No more data to read')\n";
            } else if (recipeIOData.isOneStreamingEndpointToOneStreamingEndpoint) {
                // Special case for special people: make the code recipe work without actually writing code.
                let item = recipeIOData.outputItems[0];
                var computable = $scope.computablesMap[item.ref];
                let inputItem = recipeIOData.inputItems[0];
                $scope.script.data += cleanupVariable(item.ref) + " = dataiku.StreamingEndpoint(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(item.ref) + ".set_schema(" + cleanupVariable(inputItem.ref) + ".get_schema()) # construct the list of columns in the output streaming endpoint\n"
                $scope.script.data += "with " + cleanupVariable(item.ref) + ".get_writer() as " + cleanupVariable(item.ref) + "_writer:\n";
                $scope.script.data += "    cnt = 0\n";
                $scope.script.data += "    for row in " + cleanupVariable(inputItem.ref) + "_messages: # iterate over rows to write \n";
                $scope.script.data += "        " + cleanupVariable(item.ref) + "_writer.write_row_dict(row)\n";
                $scope.script.data += "        cnt += 1\n";
                $scope.script.data += "        if cnt > 100:\n";
                $scope.script.data += "            cnt = 0\n";
                $scope.script.data += "            " + cleanupVariable(item.ref) + "_writer.flush()\n";
            } else if (recipeIOData.isOneStreamingEndpointToOneDataset) {
                // Special case for special people: make the code recipe work without actually writing code.
                let item = recipeIOData.outputItems[0];
                var computable = $scope.computablesMap[item.ref];
                let inputItem = recipeIOData.inputItems[0];
                $scope.script.data += cleanupVariable(item.ref) + " = dataiku.Dataset(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(item.ref) + ".write_schema(" + cleanupVariable(inputItem.ref) + ".get_schema()) # construct the list of columns in the output dataset\n"
                $scope.script.data += "with " + cleanupVariable(item.ref) + ".get_continuous_writer('" + $stateParams.recipeName + "') as " + cleanupVariable(item.ref) + "_writer:\n";
                $scope.script.data += "    cnt = 0\n";
                $scope.script.data += "    for row in " + cleanupVariable(inputItem.ref) + "_messages: # iterate over rows to write \n";
                $scope.script.data += "        " + cleanupVariable(item.ref) + "_writer.write_row_dict(row)\n";
                $scope.script.data += "        cnt += 1\n";
                $scope.script.data += "        if cnt > 100:\n";
                $scope.script.data += "            cnt = 0\n";
                $scope.script.data += "            " + cleanupVariable(item.ref) + "_writer.checkpoint(str(cnt))\n";
            } else {
                recipeIOData.outputItems.forEach(function(item) {
                    var computable = $scope.computablesMap[item.ref];
                    if (computable.type == 'DATASET') {
                        $scope.script.data += cleanupVariable(item.ref) + " = dataiku.Dataset(\""+ item.ref +"\")\n";
                        $scope.script.data += cleanupVariable(item.ref) + ".write_schema(...) # construct the list of columns in the output dataset\n"
                        $scope.script.data += "with " + cleanupVariable(item.ref) + ".get_continuous_writer() as " + cleanupVariable(item.ref) + "_writer:\n"
                        $scope.script.data += "    " + cleanupVariable(item.ref) + "_writer.write_row_dict(...) # generate data to write \n";
                    } else if (computable.type == 'STREAMING_ENDPOINT' ) {
                        $scope.script.data += cleanupVariable(item.ref) + " = dataiku.StreamingEndpoint(\""+ item.ref +"\")\n";
                        $scope.script.data += cleanupVariable(item.ref) + ".set_schema(...) # construct the list of columns in the output streaming endpoint\n"
                        $scope.script.data += "with " + cleanupVariable(item.ref) + ".get_writer() as " + cleanupVariable(item.ref) + "_writer:\n";
                        $scope.script.data += "    " + cleanupVariable(item.ref) + "_writer.write_row_dict(...) # generate data to write \n";
                    } else if (computable.type == 'MANAGED_FOLDER' ) {
                        var name = computable.box.name;
                        $scope.script.data += cleanupVariable(name) + " = dataiku.Folder(\""+ item.ref +"\")\n";
                        $scope.script.data += cleanupVariable(name) + "_info = " + cleanupVariable(name) + ".get_info()\n"
                    }
                });
            }
        }
        
        $scope.script.data += "\n\n";
        $scope.script.data += suffix;
    };

    $scope.transformToDevPlugin = function(){
        CodeBasedToPluginConverter.transformToDevPlugin($scope, DataikuAPI.flow.recipes.python.convertToCustom, "python");
    }

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            return valResult;
        });
    };
    $scope.hooks.preRunValidate = $scope.validateRecipe;
    
    $scope.selectCodeMode = function() {
        var items = [
            { mode: 'FREE_FORM', title: 'Free-Form', desc: "The code is a script." },
            { mode: 'FUNCTION', title: 'Function', desc: "The code defines a process function, taking in batches of input rows and producing batches of output rows." }
        ];
        Dialogs.select($scope, 'Code mode', 'Select the mode for the code:', items,
                items[$scope.recipe.params.codeMode === 'FUNCTION' ? 1 : 0]
        ).then(function(item) {
            $scope.recipe.params.codeMode = item.mode;
        }, function() {});
    };
    
    $scope.$watch('recipe.params.codeMode', function(mode, previous) {
        Logger.info("Transform: from " + previous + " to " + mode);
        if (mode === 'FUNCTION' && previous === 'FREE_FORM') {
            $scope.autofillCode(true);
            $timeout($scope.cm.setValue.bind($scope.cm, $scope.script.data), 0);
        } else if (mode === 'FREE_FORM' && previous === 'FUNCTION') {
            $scope.autofillCode(false);
            $timeout($scope.cm.setValue.bind($scope.cm, $scope.script.data), 0);
        }
    });
    
    
    let setupFeedParams = function() {
        if (!$scope.recipe) return;
        if ($scope.recipe.params.codeMode != 'FUNCTION') return;
        if (!$scope.computablesMap) return;
        
        // add outputs not yet listed in the production settings
        $scope.recipe.outputs['main'].items.forEach(function(output) {
            var production = $scope.recipe.params.feedParams.outputs.filter(function(o) {return o.ref == output.ref})[0];
            if (production == null) {
                production = {ref:output.ref, checkpointingType:'none', checkpointingParams:{}}
                let computable = $scope.computablesMap[output.ref];
                if (computable != null && computable.type == 'DATASET') {
                    production['checkpointingType'] = 'dataset'; // that's the only guaranteed option
                    production['checkpointingParams']['checkpointInterval'] = 10000
                    production['checkpointingParams']['checkpointMaxRows'] = 100000
                }
                $scope.recipe.params.feedParams.outputs.push(production);
            }
        });
        
        // add inputs not yet listed in the consumptions settings
        if ($scope.recipe.inputs.main && $scope.recipe.inputs['main'].items) {
            $scope.recipe.inputs['main'].items.forEach(function(input) {
                var consumption = $scope.recipe.params.feedParams.inputs.filter(function(i) {return i.ref == input.ref})[0];
                if (consumption == null) {
                    consumption = {ref:input.ref, withWindow:false}
                    let computable = $scope.computablesMap[input.ref];
                    if (computable != null && computable.type == 'STREAMING_ENDPOINT') {
                        $scope.recipe.params.feedParams.inputs.push(consumption);
                    }
                }
            });
        }
        
        // remove production settings not listed in the outputs
        $scope.recipe.params.feedParams.outputs = $scope.recipe.params.feedParams.outputs.filter(function(production) {
            let output = $scope.recipe.outputs['main'].items.filter(function(o) {return o.ref == production.ref;})[0];
            return output != null;
        });
        
        // remove consumption settings not listed in the inputs
        $scope.recipe.params.feedParams.inputs = $scope.recipe.params.feedParams.inputs.filter(function(consumption) {
            let input = $scope.recipe.inputs['main'].items.filter(function(i) {return i.ref == consumption.ref;})[0];
            return input != null;
        });
    };
    setupFeedParams();
    
    $scope.$watch("recipe.params.codeMode", setupFeedParams, false);
    $scope.$watch("recipe.inputs.main.items", setupFeedParams, true);
    $scope.$watch("recipe.outputs.main.items", setupFeedParams, true);
    $scope.$watch("computablesMap", setupFeedParams, false);
});

app.directive("feedProductionSettings", function() {
    return {
        scope: {
            computablesMap: '=',
            production: '='
        },
        templateUrl: "/templates/recipes/fragments/feed-production-settings.html",
        link: function($scope, element, attrs) {
            let init = function() {
                $scope.possibleTypes = [];
                $scope.possibleTypesDescriptions = [];
                if (!$scope.computablesMap) return;
                if (!$scope.production) return;
                $scope.computable = $scope.computablesMap[$scope.production.ref];
                if ($scope.computable.type == 'DATASET') {
                    $scope.possibleTypes.push({type:'dataset', label:'In the dataset'});
                    $scope.possibleTypesDescriptions.push('Store checkpoint alongside the data if possible: as a hidden file for file-based dataset, in a dedicated table for sql dataset');
                } else if ($scope.computable.type == 'STREAMING_ENDPOINT') {
                    $scope.possibleTypes.push({type:'none', label:"Don't store checkpoints"});
                    $scope.possibleTypesDescriptions.push('');
                    if ($scope.computable.streamingEndpoint.type == 'kafka') {
                        $scope.possibleTypes.push({type:'kafka_transaction', label:'In a Kafka topic'});
                        $scope.possibleTypesDescriptions.push('Store checkpoints in a second topic');
                    }
                }
                $scope.possibleTypes.push({type:'file', label:'In a file'});
                $scope.possibleTypesDescriptions.push('Store checkpoints in a file on the local filesystem');
            };
            init();
            $scope.$watch('computablesMap', init, false);
            $scope.$watch('production', init, false);
            
            let fixupCheckpointingParams = function() {
                if (['dataset', 'file'].indexOf($scope.production.checkpointingType) >= 0) {
                    $scope.production.checkpointingParams['checkpointInterval'] = $scope.production.checkpointingParams['checkpointInterval'] || 10000;
                    $scope.production.checkpointingParams['checkpointMaxRows'] = $scope.production.checkpointingParams['checkpointMaxRows'] || 100000;
                }
                if (['kafka_transaction'].indexOf($scope.production.checkpointingType) >= 0) {
                    $scope.production.checkpointingParams['checkpointInterval'] = $scope.production.checkpointingParams['checkpointInterval'] || 100;
                }
            };
            $scope.$watch('production.checkpointingType', fixupCheckpointingParams)
        }
    };
});

app.directive("feedConsumptionSettings", function() {
    return {
        scope: {
            computablesMap: '=',
            consumption: '='
        },
        templateUrl: "/templates/recipes/fragments/feed-consumption-settings.html",
        link: function($scope, element, attrs) {
            let init = function() {
                if (!$scope.computablesMap) return;
                if (!$scope.consumption) return;
                $scope.computable = $scope.computablesMap[$scope.consumption.ref];
            };
            init();
            $scope.$watch('computablesMap', init, false);
            $scope.$watch('consumption', init, false);
            
            $scope.canWindow = function() {
                return $scope.computable && $scope.computable.type == 'STREAMING_ENDPOINT' && $scope.computable.streamingEndpoint.type.toLowerCase() == 'kafka';
            };
        }
    };
});

app.controller("KsqlRecipeController", function($scope,  $controller, CodeBasedEditorUtils, CodeBasedValidationUtils, CodeRecipeFillingHelper, CodeBasedToPluginConverter, ComputableSchemaRecipeSave, DataikuAPI, $q, TopNav, $state, $stateParams, RecipesUtils, RecipeRunJobService, CreateModalFromTemplate, Dialogs, WT1, $timeout) {
    
    $controller("_ContinuousRecipeInitStartedJobBehavior", {$scope:$scope});

    $scope.enableAutoFixup();

    // Editor options
    $scope.identifierQuote = '`';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-sql', $scope, true);
    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            if (type == "FLOW") {
                $scope.cm.replaceSelection('${"'+variableName+'"}', "end");
            } else {
                $scope.cm.replaceSelection('${"'+variableName+'"}', "end");
            }
        });
        $scope.cm.focus();
    }

    $scope.autofillCode = function() {
        $scope.script.data = "// code";
    };

    $scope.synchronizeInput = function(loc) {
        DataikuAPI.streamingEndpoints.syncKsql(loc.projectKey, loc.id, true).success(function(data) {
            $scope.validateRecipe();
        }).error(setErrorInScope.bind($scope));
    };

    $scope.validateRecipe = function() {
        var preValidate = new Date().getTime();

        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            
            $scope.recipeWT1Event("ksql-validate", {
                ok : !valResult.topLevelMessages.error,
                time : (new Date().getTime() - preValidate),
                schemaChange : (valResult.schemaResult ? (valResult.schemaResult.totalIncompatibilities > 0) : false),
                firstError : (valResult.topLevelMessages.messages.length ? valResult.topLevelMessages.messages[0].message : null)
            });

            return ComputableSchemaRecipeSave.handleSchemaUpdateWithPrecomputed($scope, valResult.schemaResult).then(function(changeResult){
                if (changeResult.changed) {
                    // Validate again
                    return $scope.validateRecipe();
                } else {
                    return valResult;
                }
            });
        });
    };
    
    $scope.hooks.preRunValidate = $scope.validateRecipe;
});


app.controller("JuliaRecipeController", function($scope, CodeBasedEditorUtils, CodeBasedValidationUtils, CodeBasedToPluginConverter, CodeMirrorSettingService, DataikuAPI, $q, TopNav, $state, $stateParams, RecipesUtils, RecipeRunJobService, CreateModalFromTemplate, Dialogs, WT1, $timeout, CodeRecipeFillingHelper) {
    $scope.enableAutoFixup();

    // Editor options
    $scope.identifierQuote = '"';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-julia', $scope);
    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            var fn = (type == "FLOW" ? "get_flow_variable" : "get_custom_variable");
            $scope.cm.replaceSelection("Dataiku." + fn + '("'+variableName+'")', "end");
        });
        $scope.cm.focus();
    }

    $scope.autofillCode = function() {
        $scope.script.data = "using Dataiku\n";
        $scope.script.data += "import Dataiku: get_dataframe\n\n";

        const recipeIOData = CodeRecipeFillingHelper.getIOData($scope);

        if (recipeIOData.inputItems.length > 0) {
            $scope.script.data += "# Read recipe inputs\n";
        }
        var modelCount = 1;
        recipeIOData.inputItems.forEach(function(item) {
            var computable = $scope.computablesMap[item.ref];
            if (computable.type == 'DATASET' ) {
                $scope.script.data += cleanupVariable(item.ref) + "_df = get_dataframe(dataset\""+ item.ref +"\")\n"
            } else if (computable.type == 'MANAGED_FOLDER' ) {
                var name = computable.box.name;
                $scope.script.data += cleanupVariable(name) + "_info = Dataiku.get_settings(folder\"" + item.ref + "\")\n"
            } else if (computable.type == 'SAVED_MODEL') {
                $scope.script.data += "# " + computable.label + "\n";
                $scope.script.data += "pred_" + modelCount + " = Dataiku.get_active_version(model\"" + item.ref + "\")\n"
                modelCount++;
            }
        })
        $scope.script.data += "\n\n";

        if (recipeIOData.isOneDatasetToOneDataset) {
            // Special case for special people: make the code recipe work without actually writing code.
            $scope.script.data += "# Compute recipe outputs from inputs\n";
            $scope.script.data += "# TODO: Replace this part by your actual code that computes the output, as a Julia DataFrame\n\n";
            $scope.script.data +=  cleanupVariable(recipeIOData.outputDatasets[0].name) + "_df = " + cleanupVariable(recipeIOData.inputDatasets[0].name) + "_df # For this sample code, simply copy input to output\n";
        } else if (recipeIOData.outputDatasets.length > 0) {
            // Make it very very clear that you have to write code
            $scope.script.data += "# Compute recipe outputs\n";
            $scope.script.data += "# TODO: Write here your actual code that computes the outputs\n\n";
            recipeIOData.outputItems.forEach(function(item) {
                var computable = $scope.computablesMap[item.ref];
                if (computable.type == 'DATASET') {
                    $scope.script.data += cleanupVariable(item.ref) + "_df = ... # Compute a Julia DataFrame to write into " + item.ref + "\n";
                }
            })
        }

        $scope.script.data += "\n\n";

        if (recipeIOData.outputItems.length > 0) {
            $scope.script.data += "# Write recipe outputs\n";
        }
        recipeIOData.outputItems.forEach(function(item) {
            var computable = $scope.computablesMap[item.ref];
            if (computable.type == 'DATASET') {
                $scope.script.data += "Dataiku.write_with_schema(dataset\""+ item.ref +"\", " + cleanupVariable(item.ref) + "_df)\n"
            } else if (computable.type == 'MANAGED_FOLDER' ) {
                var name = computable.box.name;
                $scope.script.data += cleanupVariable(name) + "_info = Dataiku.get_settings(folder\""+ item.ref +"\")\n"
            }
        });

    };

    $scope.transformToDevPlugin = function() {
        CodeBasedToPluginConverter.transformToDevPlugin($scope, DataikuAPI.flow.recipes.julia.convertToCustom, "julia");
    };

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            return valResult;
        });
    };
    $scope.hooks.preRunValidate = $scope.validateRecipe;
});

app.controller("RRecipeController", function($rootScope, $scope, DataikuAPI, CodeBasedValidationUtils, CodeBasedEditorUtils, CodeBasedToPluginConverter, CodeMirrorSettingService, $state, $stateParams, RecipesUtils, Dialogs, CreateModalFromTemplate, WT1, $q, RecipeRunJobService, $timeout, CodeRecipeFillingHelper) {
    $scope.enableAutoFixup();

    // Editor
    $scope.identifierQuote = '"';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-rsrc', $scope);
    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            var fn = (type == "FLOW" ? "dkuFlowVariable" : "dkuCustomVariable");
            $scope.cm.replaceSelection(fn + '("'+variableName+'")', "end");
        });
        $scope.cm.focus();
    }

    $scope.autofillCode = function() {
        $scope.script.data = "library(dataiku)\n\n";
        const recipeIOData = CodeRecipeFillingHelper.getIOData($scope);

        if (recipeIOData.inputItems.length > 0) {
            $scope.script.data += "# Recipe inputs\n";
        }
        recipeIOData.inputItems.forEach(function(item){
            var computable = $scope.computablesMap[item.ref];
            if (computable.type == 'DATASET' ) {
                $scope.script.data += cleanupVariable(item.ref) + " <- dkuReadDataset(\""+ item.ref +"\", samplingMethod=\"head\", nbRows=100000)\n";
            }
            if (computable.type == 'MANAGED_FOLDER') {
                var name = computable.box.name;
                $scope.script.data += cleanupVariable(name) + " <- dkuManagedFolderPath(\""+ item.ref +"\")\n";
            }
        });
        $scope.script.data += "\n";

        if (recipeIOData.isOneDatasetToOneDataset) {
            // Special case for special people: make the code recipe work without actually writing code.
            $scope.script.data += "# Compute recipe outputs from inputs\n";
            $scope.script.data += "# TODO: Replace this part by your actual code that computes the output, as a R dataframe or data table\n";
            $scope.script.data +=  cleanupVariable(recipeIOData.outputDatasets[0].name) + " <- " + cleanupVariable(recipeIOData.inputDatasets[0].name) + " # For this sample code, simply copy input to output\n";
        } else if (recipeIOData.outputDatasets.length > 0) {
            // Make it very very clear that you have to write code
            $scope.script.data += "# Compute recipe outputs\n";
            $scope.script.data += "# TODO: Write here your actual code that computes the outputs\n";
            recipeIOData.outputItems.forEach(function(item) {
                var computable = $scope.computablesMap[item.ref];
                if (computable.type == 'DATASET') {
                    $scope.script.data += cleanupVariable(item.ref) + " <- replace_me # Compute a data frame for the output to write into " + item.ref + "\n";
                }
            });
        }

        $scope.script.data += "\n\n";

        var outputDatasets = RecipesUtils.getOutputsForRole($scope.recipe, "main");
        if (recipeIOData.outputItems.length > 0) {
            $scope.script.data += "# Recipe outputs\n";
        }
        recipeIOData.outputItems.forEach(function(item){
            var computable = $scope.computablesMap[item.ref];
            if (computable.type == 'DATASET' ) {
                $scope.script.data +="dkuWriteDataset(" + cleanupVariable(item.ref) + ",\""+item.ref+"\")\n";
            }
            if (computable.type == 'MANAGED_FOLDER' ) {
                var name = computable.box.name;
                $scope.script.data += cleanupVariable(name) + " <- dkuManagedFolderPath(\""+ item.ref +"\")\n";
            }
        });
    };

    $scope.hooks.transformToDevPlugin = function(){
        CodeBasedToPluginConverter.transformToDevPlugin($scope, DataikuAPI.flow.recipes.r.convertToCustom, "r");
    }

    $rootScope.$broadcast('transformToDevPlugin',$scope.hooks.transformToDevPlugin);

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            return valResult;
        });
    };
    $scope.hooks.preRunValidate = $scope.validateRecipe;
});

app.controller("ShellRecipeController", function($scope, DataikuAPI, $q, TopNav, $stateParams, RecipesUtils, RecipeRunJobService, CreateModalFromTemplate, Dialogs, $timeout, CodeBasedValidationUtils, CodeBasedEditorUtils, CodeBasedToPluginConverter) {
    $scope.enableAutoFixup();

    $scope.identifierQuote = "'";
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-sh', $scope, true);
    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            var shellName = (type=='USER'?'DKU_CUSTOM_VARIABLES_':'') + variableName;
            var shellVariable = '$' + shellName;
            if (shellName.indexOf('.') >= 0) {
                // . in a variable name will cause sh and friends to stop parsing for a variable name, so
                // we use a trick to retrieve the value
                shellVariable = '$(printenv ' + shellName + ')';
            }
            $scope.cm.replaceSelection(shellVariable, "end");
        });
        $scope.cm.focus();
    }

    $scope.getInputOrOuputLabel = function(ref) {
        if ( ref == null || ref.length == 0 ) {
            return '';
        }
        if ( $scope.computablesMap == null ) {
            return '';
        }
        var computable = $scope.computablesMap[ref];
        return computable.label;
    };
    $scope.inputDatasets = [];
    $scope.outputDatasets = [];
    var onRecipeIoOrComputableChange = function() {
        if ( $scope.computablesMap == null ) {
            return;
        }
        $scope.inputDatasets = [];
        if ($scope.recipe.inputs && $scope.recipe.inputs['main'] && $scope.recipe.inputs['main'].items) {
            var found = null;
            $scope.recipe.inputs['main'].items.forEach(function(input) {
                if (input.ref == $scope.recipe.params.pipeIn) {
                    found = input;
                }
                if ( $scope.computablesMap[input.ref].dataset != null) {
                    $scope.inputDatasets.push(input);
                }
            });
            if (found == null) {
                // dataset piped in has been removed, clear the pipe in
                $scope.recipe.params.pipeIn = null;
            }
        }

        $scope.outputDatasets = [];
        if ($scope.recipe.outputs && $scope.recipe.outputs['main'] && $scope.recipe.outputs['main'].items) {
            var found = null;
            $scope.recipe.outputs['main'].items.forEach(function(output) {
                if (output.ref == $scope.recipe.params.pipeOut) {
                    found = output;
                }
                if ( $scope.computablesMap[output.ref].dataset != null) {
                    $scope.outputDatasets.push(output);
                }
            });
            if (found == null) {
                // dataset piped in has been removed, clear the pipe in
                $scope.recipe.params.pipeOut = null;
            }
        }
        $scope.validateRecipe(true);
    };
    $scope.$on('computablesMapChanged', onRecipeIoOrComputableChange);
    $scope.$watch("[recipe.inputs, recipe.outputs]", onRecipeIoOrComputableChange, true);

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            $scope.recipeWT1Event("shell-recipe-validate", { ok : !valResult.topLevelMessages.error});
            return valResult;
        });
    }
    $scope.hooks.preRunValidate = $scope.validateRecipe;

    var superRecipeIsDirty = $scope.hooks.recipeIsDirty;
    $scope.hooks.recipeIsDirty = function() {
        // cleanup pipeIn and pipeOut in params, which can be null
        if ( $scope.recipe.params.pipeIn == null ) {
            delete $scope.recipe.params.pipeIn;
        }
        if ( $scope.recipe.params.pipeOut == null ) {
            delete $scope.recipe.params.pipeOut;
        }
        return superRecipeIsDirty();
    }
});


})();