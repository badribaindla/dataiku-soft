(function() {
'use strict';

const app = angular.module('dataiku.recipes');


app.controller("PySparkRecipeController", function($rootScope, $scope, DataikuAPI, CodeBasedEditorUtils, CodeBasedToPluginConverter, CodeBasedValidationUtils, $q, WT1, $state, $stateParams, CreateModalFromTemplate, Dialogs, RecipesUtils, $timeout, CodeRecipeFillingHelper) {
    $scope.enableAutoFixup();
    if ($scope.script.data == null) $scope.script.data = "";

    // Editor settings
    $scope.identifierQuote = '"';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-python', $scope, true);
    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            $scope.cm.replaceSelection('"'+variableName+'"', "end");
        });
        $scope.cm.focus();
    }
    // conversion to custom
    $scope.hooks.transformToDevPlugin = function(){
        CodeBasedToPluginConverter.transformToDevPlugin($scope, DataikuAPI.flow.recipes.pyspark.convertToCustom, "pyspark");
    }

    $rootScope.$broadcast('transformToDevPlugin',$scope.hooks.transformToDevPlugin);

    // Validation: TODO

    // Autofill
    $scope.autofillCode = function() {
        $scope.script.data = "# -*- coding: utf-8 -*-\n";
        $scope.script.data += "import dataiku\n";
        $scope.script.data += "from dataiku import spark as dkuspark\n";
        $scope.script.data += "from pyspark import SparkContext\n";
        $scope.script.data += "from pyspark.sql import SQLContext\n\n";

        const sparkVersion = $scope.appConfig.sparkVersion || "1.X";
        if (sparkVersion.substring(0, 1) == "1") {
        	$scope.script.data += "sc = SparkContext()\n";
        } else {
        	$scope.script.data += "sc = SparkContext.getOrCreate()\n";
        }

        $scope.script.data += "sqlContext = SQLContext(sc)\n\n";

        const recipeIOData = CodeRecipeFillingHelper.getIOData($scope);

        if (recipeIOData.inputItems.length > 0) {
            $scope.script.data += "# Read recipe inputs\n";
        }
        recipeIOData.inputItems.forEach(function(item) {
            var computable = $scope.computablesMap[item.ref];
            if (computable.type == 'DATASET' ) {
                $scope.script.data += cleanupVariable(item.ref) + " = dataiku.Dataset(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(item.ref) + "_df = dkuspark.get_dataframe(sqlContext, " + cleanupVariable(item.ref) + ")\n"
            }
            if (computable.type == 'MANAGED_FOLDER' ) {
                var name = computable.box.name;
                $scope.script.data += cleanupVariable(name) + " = dataiku.Folder(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(name) + "_info = " + cleanupVariable(name) + ".get_info()\n"
            }
        });
        $scope.script.data += "\n";

        if (recipeIOData.isOneDatasetToOneDataset) {
            // Special case for special people: make the code recipe work without actually writing code.
            $scope.script.data += "# Compute recipe outputs from inputs\n";
            $scope.script.data += "# TODO: Replace this part by your actual code that computes the output, as a SparkSQL dataframe\n";
            $scope.script.data +=  cleanupVariable(recipeIOData.outputItems[0].ref) + "_df = " + cleanupVariable(recipeIOData.inputItems[0].ref) + "_df # For this sample code, simply copy input to output\n";
        } else if (recipeIOData.outputDatasets.length > 0) {
            // Make it very very clear that you have to write code
            $scope.script.data += "# Compute recipe outputs\n";
            $scope.script.data += "# TODO: Write here your actual code that computes the outputs as SparkSQL dataframes\n";
            recipeIOData.outputItems.forEach(function(item) {
                var computable = $scope.computablesMap[item.ref];
                if (computable.type == 'DATASET') {
                    $scope.script.data += cleanupVariable(item.ref) + "_df = ... # Compute a SparkSQL dataframe to write into " + item.ref + "\n";
                }
            })
        }

        $scope.script.data += "\n";

        if (recipeIOData.outputItems.length > 0) {
            $scope.script.data += "# Write recipe outputs\n";
        }
        recipeIOData.outputItems.forEach(function(item) {
            var computable = $scope.computablesMap[item.ref];
            if (computable.type == 'DATASET' ) {
                $scope.script.data += cleanupVariable(item.ref) + " = dataiku.Dataset(\""+ item.ref +"\")\n";
                $scope.script.data += "dkuspark.write_with_schema(" + cleanupVariable(item.ref) + ", " + cleanupVariable(item.ref) + "_df)\n"
            }
            if (computable.type == 'MANAGED_FOLDER' ) {
                var name = computable.box.name;
                $scope.script.data += cleanupVariable(name) + " = dataiku.Folder(\""+ item.ref +"\")\n";
                $scope.script.data += cleanupVariable(name) + "_info = " + cleanupVariable(name) + ".get_info()\n"
            }
        });
    };

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            return valResult;
        });
    };
});


app.controller("SparkRRecipeController", function($rootScope, $scope, $q, WT1, $stateParams, RecipesUtils, CodeBasedEditorUtils, CodeBasedValidationUtils, Logger, Dialogs, $timeout, CodeRecipeFillingHelper) {
    $scope.enableAutoFixup();

    // Edito options
    if ($scope.script.data == null) $scope.script.data = "";
    $scope.identifierQuote = '"';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-rsrc', $scope);
    $scope.hooks.insertVariable = function(variableName, type) {
        $scope.cm.replaceSelection('"'+variableName+'"', "end");
        $scope.cm.focus();
    }

    $scope.autofillCode = function(mode, transform) {
        var previousCode = ""
        if (transform && $scope.script.data) {
            previousCode = $scope.script.data.split("\n").map(function(x) { return "# " + x }).join("\n")
        }

        const recipeIOData = CodeRecipeFillingHelper.getIOData($scope);

        if (mode == null) mode = "SPARKR";

        if (mode == "SPARKR") {
            $scope.script.data  = "library(SparkR)\nlibrary(dataiku)\n";

            var sparkVersion = $scope.appConfig.sparkVersion || "1.X";
            var sparkVersion = sparkVersion.substring(0, 1);

            if (sparkVersion == "1") {
                $scope.script.data += "library(dataiku.spark)\n\n";
                $scope.script.data += "sc <- sparkR.init()\n";
                $scope.script.data += "sqlContext <- sparkRSQL.init(sc)\n";
            } else {
                $scope.script.data += "library(dataiku.spark2)\n\n";
                $scope.script.data += "sc <- sparkR.session()\n";
            }

            if (recipeIOData.inputItems.length > 0) {
                $scope.script.data += "# Recipe inputs\n";
            }
            recipeIOData.inputItems.forEach(function(item){
                var computable = $scope.computablesMap[item.ref];
                if (computable.type == 'DATASET' ) {
                    if (sparkVersion == "1") {
                        $scope.script.data += cleanupVariable(item.ref) + " <- dkuSparkReadDataset(sqlContext, \""+ item.ref +"\")\n";
                    } else {
                        $scope.script.data += cleanupVariable(item.ref) + " <- dkuSparkReadDataset(\""+ item.ref +"\")\n";
                    }
                }
                if (computable.type == 'MANAGED_FOLDER' ) {
                    var name = computable.box.name;
                    $scope.script.data += cleanupVariable(name) + " <- dkuManagedFolderPath(\""+ item.ref +"\")\n";
                }
            });
            $scope.script.data += "\n";

            if (recipeIOData.isOneDatasetToOneDataset) {
                // Special case for special people: make the code recipe work without actually writing code.
                $scope.script.data += "# Compute recipe outputs from inputs\n";
                $scope.script.data += "# TODO: Replace this part by your actual code that computes the output, as Spark dataframe\n";
                $scope.script.data +=  cleanupVariable(recipeIOData.outputItems[0].ref) + " <- " + cleanupVariable(recipeIOData.inputItems[0].ref) + " # For this sample code, simply copy input to output\n";
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

            if (recipeIOData.outputItems.length > 0) {
                $scope.script.data += "# Recipe outputs\n";
            }
            recipeIOData.outputItems.forEach(function(item){
                var computable = $scope.computablesMap[item.ref];
                if (computable.type == 'DATASET' ) {
                    $scope.script.data +="dkuSparkWriteDataset(" + cleanupVariable(item.ref) + ",\""+item.ref+"\")\n";
                }
                if (computable.type == 'MANAGED_FOLDER' ) {
                    var name = computable.box.name;
                    $scope.script.data += cleanupVariable(name) + " <- dkuManagedFolderPath(\""+ item.ref +"\")\n";
                }
            });
        } else {
            $scope.script.data  = "library(sparklyr)\nlibrary(dplyr)\nlibrary(dataiku.sparklyr)\n\n";
            $scope.script.data += "sc <- dku_spark_connect()\n\n"

            if (recipeIOData.inputItems.length > 0) {
                $scope.script.data += "# Recipe inputs\n";
            }
            recipeIOData.inputItems.forEach(function(item){
                var computable = $scope.computablesMap[item.ref];

                if (computable.type == 'DATASET' ) {
                    $scope.script.data += cleanupVariable(item.ref) + " <- spark_read_dku_dataset(sc, \""+ item.ref +"\", \""+cleanupVariable(item.ref) +"_tbl\")\n";
                }
                if (computable.type == 'MANAGED_FOLDER' ) {
                    var name = computable.box.name;
                    $scope.script.data += cleanupVariable(name) + " <- dkuManagedFolderPath(\""+ item.ref +"\")\n";
                }
            });
            $scope.script.data += "\n";

            if (recipeIOData.isOneDatasetToOneDataset) {
                // Special case for special people: make the code recipe work without actually writing code.
                $scope.script.data += "# Compute recipe outputs from inputs\n";
                $scope.script.data += "# TODO: Replace this part by your actual code that computes the output, as Sparklyr dataframe\n";
                $scope.script.data +=  cleanupVariable(recipeIOData.outputItems[0].ref) + " <- " + cleanupVariable(recipeIOData.inputItems[0].ref) + " # For this sample code, simply copy input to output\n";
            } else if (recipeIOData.outputDatasets.length > 0) {
                // Make it very very clear that you have to write code
                $scope.script.data += "# Compute recipe outputs\n";
                $scope.script.data += "# TODO: Write here your actual code that computes the outputs as Sparklyr dataframes\n";
                recipeIOData.outputItems.forEach(function(item) {
                    var computable = $scope.computablesMap[item.ref];
                    if (computable.type == 'DATASET') {
                        $scope.script.data += cleanupVariable(item.ref) + " <- replace_me # Compute a data frame for the output to write into " + item.ref + "\n";
                    }
                });
            }

            $scope.script.data += "\n";

            var outputDatasets = RecipesUtils.getOutputsForRole($scope.recipe, "main");
            if (recipeIOData.outputItems.length > 0) {
                $scope.script.data += "# Recipe outputs\n";
            }
            recipeIOData.outputItems.forEach(function(item){
                var computable = $scope.computablesMap[item.ref];
                if (computable.type == 'DATASET' ) {
                    $scope.script.data +="spark_write_dku_dataset(" + cleanupVariable(item.ref) + ",\""+item.ref+"\")\n";
                }
                if (computable.type == 'MANAGED_FOLDER' ) {
                    var name = computable.box.name;
                    $scope.script.data += cleanupVariable(name) + " <- dkuManagedFolderPath(\""+ item.ref +"\")\n";
                }
            });
        }

        $scope.script.data += "\n" + previousCode
    };

    $scope.selectRecipeMode = function() {
        var items = [
            { mode: 'SPARKR', title: 'SparkR', desc: "Use SparkR (native Spark) API" },
            { mode: 'SPARKLYR', title: 'Sparklyr', desc: "Use Sparklyr (dplyr) API"}
        ];
        Dialogs.select($scope, 'API', 'Select the API to use', items,
                items[$scope.recipe.params.recipeMode === 'SPARKLYR' ? 1 : 0]
        ).then(function(item) {
            $scope.recipe.params.recipeMode = item.mode;
        });
    };

    $scope.$watch('recipe.params.recipeMode', function(mode, previous) {
        Logger.info("Transform: from " + previous + " to " + mode);
        if (previous != null && mode != null && previous != mode) {
            $scope.autofillCode(mode, true);
            $timeout($scope.cm.setValue.bind($scope.cm, $scope.script.data), 0);
        }
    });

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            return valResult;
        });
    };
});

app.controller("SparkSQLQueryRecipeController", function($rootScope, $scope, DataikuAPI, RecipeRunJobService, RecipesUtils, $q, WT1, $stateParams, $timeout, CodeBasedEditorUtils, CodeBasedValidationUtils, ComputableSchemaRecipeSave, Fn, CodeMirrorSettingService, SQLRecipeHelperService) {
    $scope.enableAutoFixup();

    // Editor
    $scope.noPrefixForeign = true;
    $scope.identifierQuote = '`';
    if ($scope.script.data == null) $scope.script.data = "";
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-sql2', $scope);
    $scope.editorOptions.extraKeys[CodeMirrorSettingService.getShortcuts()['AUTOCOMPLETE_SHORTCUT']] = function(cm) {
        return $scope.autocompleteSQL(cm, 'spark_sql_query-recipe');
    };

    $scope.anyPipelineTypeEnabled = function() {
        return $rootScope.projectSummary.sparkPipelinesEnabled;
    };

    $scope.autocompleteSQL = function(cm, type) {
        if (!$scope.tables) {   // cache recipe "tables" and fields
            $scope.tables = [].concat($scope.recipe.inputs.main.items, $scope.recipe.outputs.main.items)
                .map(function(t) { return {table: t.ref}; });
            $scope.fields = [].concat.apply([], $scope.tables.map(function(f) {
                return $scope.computablesMap[f.table].dataset.schema.columns
                    .map(function(c) { return {table: f.table, name: c.name}; });
            }));
            // deduplicate fields by name
            $scope.fields = $scope.fields.filter(function(f) { return !(f.name in this) && (this[f.name] = true); }, {});
        }
        CodeMirror.showHint(cm, function(editor) {
            return CodeMirror.sqlNotebookHint(editor, type+"-notebook", $scope.tables.map(Fn.prop("table")), $scope.fields);
        }, {completeSingle:false});
    };

    $scope.sqlFormat = SQLRecipeHelperService.sqlFormat.bind(this, $scope);

    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            $scope.cm.replaceSelection('${'+variableName+'}', "end");
        });
        $scope.cm.focus();
    }

    $scope.autofillCode = function() {
        //Nothing to do: SparkSQL recipes are prefilled on creation
    };

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            $scope.recipeWT1Event("sparksql-query-validate", { ok : !valResult.topLevelMessages.error});

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

app.controller("SparkScalaRecipeController", function($rootScope, $scope, DataikuAPI, $q, TopNav, $state, $stateParams, RecipesUtils, RecipeRunJobService, CreateModalFromTemplate,
        Logger, Dialogs, WT1, $timeout, CodeBasedEditorUtils, CodeBasedValidationUtils, CodeBasedToPluginConverter) {
    $scope.enableAutoFixup();

    // Editor
    $scope.identifierQuote = '"';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-scala', $scope, true);
    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            var dic = (type == "FLOW" ? "dkuContext.flowVariables":  "dkuContext.customVariables");
            $scope.cm.replaceSelection(dic + '("' + variableName + '")', "end");
        });
        $scope.cm.focus();
    }

    $scope.anyPipelineTypeEnabled = function() {
        return $rootScope.projectSummary.sparkPipelinesEnabled;
    };

    // conversion to custom
    $scope.hooks.transformToDevPlugin = function(){
        CodeBasedToPluginConverter.transformToDevPlugin($scope, DataikuAPI.flow.recipes.scala.convertToCustom, "spark_scala");
    }

    $rootScope.$broadcast('transformToDevPlugin',$scope.hooks.transformToDevPlugin);

    function getComputablesOfType(list, type) {
        return list.map(function(_) { return { ref: _.ref, computable: $scope.computablesMap[_.ref] }; })
                   .filter(function(_) { return _.computable.type === type; });
    }

    $scope.autofillCode = function(functionMode) {
        var suffix = $scope.script.data;
        if (functionMode) {
            $scope.script.data  = "// The code below is the body of a function with signature:\n";
            $scope.script.data += "// def transform(inputDatasets: Map[String, DataFrame],\n"
            $scope.script.data += "//   sparkContext: SparkContext, sqlContext: SQLContext, dkuContext: DataikuSparkContext\n";
            $scope.script.data += "// ): Map[String, DataFrame]\n\n";
            $scope.script.data += "import org.apache.spark.sql.functions._\n\n";
            suffix = '\n\n/** Previous code */\n' + suffix.replace(/^/gm, '// ');
        } else {
            $scope.script.data  = "import com.dataiku.dss.spark._\n";
            $scope.script.data += "import org.apache.spark.SparkContext\n";
            $scope.script.data += "import org.apache.spark.sql.SQLContext\n";
            $scope.script.data += "import org.apache.spark.sql.functions._\n\n";
            $scope.script.data += "val sparkConf    = DataikuSparkContext.buildSparkConf()\n";

            const sparkVersion = $scope.appConfig.sparkVersion || "1.X";
            if (sparkVersion.substring(0, 1) == "1") {
                $scope.script.data += "val sparkContext = new SparkContext(sparkConf)\n";
            } else {
                $scope.script.data += "val sparkContext = SparkContext.getOrCreate(sparkConf)\n";
            }
            $scope.script.data += "val sqlContext   = new SQLContext(sparkContext)\n";
            $scope.script.data += "val dkuContext   = DataikuSparkContext.getContext(sparkContext)\n\n";
            suffix = '';
        }

        var inputDatasets = RecipesUtils.getInputsForRole($scope.recipe, "main");
        if (inputDatasets.length > 0) {
            $scope.script.data += "// Recipe inputs\n";
        }
        getComputablesOfType(inputDatasets, 'MANAGED_FOLDER').forEach(function (_) {
            $scope.script.data += "val " + cleanupVariable(_.computable.box.name) +
                ' = dkuContext.getManagedFolderRoot("'+ _.computable.box.id +
                (_.computable.box.projectKey === $scope.recipe.projectKey ? '' : '", "' + _.computable.box.projectKey) +
                '")\n';
        });
        getComputablesOfType(inputDatasets, 'DATASET').forEach(function (_) {
            $scope.script.data += "val " + cleanupVariable(_.ref) + ' = ' +
                (functionMode ? 'inputDatasets(' : 'dkuContext.getDataFrame(sqlContext, ') +
                '"' + _.ref + '")\n';
        });
        $scope.script.data += "\n";

        var outputDatasets = RecipesUtils.getOutputsForRole($scope.recipe, "main");

        $scope.script.data += "// TODO: Write here your actual code that computes the outputs\n"
        getComputablesOfType(outputDatasets, 'DATASET').forEach(function (_) {
            $scope.script.data += "val " + cleanupVariable(_.ref) + ' = replace_me_by_your_code\n';
        });
        $scope.script.data += "\n";

        if (outputDatasets.length > 0) {
            $scope.script.data += "// Recipe outputs\n";
        }
        getComputablesOfType(outputDatasets, 'MANAGED_FOLDER').forEach(function (_) {
            $scope.script.data += "val " + cleanupVariable(_.computable.box.name) +
                ' = dkuContext.getManagedFolderRoot("'+ _.computable.box.id +
                (_.computable.box.projectKey === $scope.recipe.projectKey ? '' : '", "' + _.computable.box.projectKey) +
                '")\n';
        });
        if (functionMode) {
            $scope.script.data += "// The returned Map must contain (dataset name -> dataframe) pairs\n"
            $scope.script.data += "Map(" +
                getComputablesOfType(outputDatasets, 'DATASET').map(function (_) {
                    return '"' + _.ref + '" -> ' + cleanupVariable(_.ref);
                }).join(',\n    ') +
                ")\n";
        } else {
            getComputablesOfType(outputDatasets, 'DATASET').forEach(function (_) {
                $scope.script.data += 'dkuContext.save("' + _.ref + '", ' + cleanupVariable(_.ref) + ');\n';
            });
        }
        $scope.script.data += suffix;
    };

    $scope.selectCodeMode = function() {
        var items = [
            { mode: 'FREE_FORM', title: 'Free-Form', desc: "The code is a script. " +
                "It must instantiate its Spark context and SQL context, load its input datasets and save its output datasets." },
            { mode: 'FUNCTION', title: 'Function', desc: "The code is the body of a function. " +
                "It recieves pre-instantiated Spark context, SQL context, and input datasets and must return its output datasets. " +
                "This mode is compatible with Spark pipelines." }
        ];
        Dialogs.select($scope, 'Code mode', 'Select the mode for the code:', items,
                items[$scope.recipe.params.codeMode === 'FUNCTION' ? 1 : 0]
        ).then(function(item) {
            $scope.recipe.params.codeMode = item.mode;
        });
    };

    var transformCode = true;
    $scope.$watch('recipe.params.codeMode', function(mode, previous) {
        Logger.info("Transform: from " + previous + " to " + mode);
        if (transformCode && mode === 'FUNCTION' && previous === 'FREE_FORM') {
            transformCode = false; // only once
            $scope.autofillCode(true);
            $timeout($scope.cm.setValue.bind($scope.cm, $scope.script.data), 0);
        }
    });

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            $scope.recipeWT1Event("spark-scala-validate", {
                ok : !valResult.topLevelMessages.error,
                firstError : (valResult.topLevelMessages.messages.length ? valResult.topLevelMessages.messages[0].message : null)
            });
            return valResult;
        });
    };
    $scope.hooks.preRunValidate = $scope.validateRecipe;
});


app.controller("StreamingSparkScalaRecipeController", function($scope, $controller, DataikuAPI, $q, TopNav, $state, $stateParams, RecipesUtils, RecipeRunJobService, CreateModalFromTemplate,
        Logger, Dialogs, WT1, $timeout, CodeBasedEditorUtils, CodeBasedValidationUtils, CodeBasedToPluginConverter) {
    $scope.enableAutoFixup();

    $controller("_ContinuousRecipeInitStartedJobBehavior", {$scope:$scope});

    // Editor
    $scope.identifierQuote = '"';
    $scope.editorOptions = CodeBasedEditorUtils.editorOptions('text/x-scala', $scope, true);
    $scope.hooks.insertVariable = function(variableName, type) {
        $timeout(function() {
            var dic = (type == "FLOW" ? "dkuContext.flowVariables":  "dkuContext.customVariables");
            $scope.cm.replaceSelection(dic + '("' + variableName + '")', "end");
        });
        $scope.cm.focus();
    }

    // conversion to custom
    $scope.transformToDevPlugin = function(){
        CodeBasedToPluginConverter.transformToDevPlugin($scope, DataikuAPI.flow.recipes.scala.convertToCustom, "spark_scala");
    }

    function getComputablesOfType(list, type) {
        return list.map(function(_) { return { ref: _.ref, computable: $scope.computablesMap[_.ref] }; })
                   .filter(function(_) { return _.computable.type === type; });
    }

    $scope.autofillCode = function(functionMode) {
        var suffix = $scope.script.data;
        if (functionMode) {
            $scope.script.data  = "// The code below is the body of a function with signature:\n";
            $scope.script.data += "// def transform(inputDatasets: Map[String, DataFrame],\n"
            $scope.script.data += "//   sparkContext: SparkContext, sqlContext: SQLContext, dkuContext: DataikuSparkContext\n";
            $scope.script.data += "// ): Map[String, DataFrame]\n\n";
            $scope.script.data += "import org.apache.spark.sql.functions._\n\n";
            suffix = '\n\n/** Previous code */\n' + suffix.replace(/^/gm, '// ');
        } else {
            $scope.script.data  = "import com.dataiku.dss.spark._\n";
            $scope.script.data += "import org.apache.spark.SparkContext\n";
            $scope.script.data += "import org.apache.spark.sql.SQLContext\n";
            $scope.script.data += "import org.apache.spark.sql.functions._\n\n";
            $scope.script.data += "val sparkConf    = DataikuSparkContext.buildSparkConf()\n";
            $scope.script.data += "val sparkContext = new SparkContext(sparkConf)\n";
            $scope.script.data += "val sqlContext   = new SQLContext(sparkContext)\n";
            $scope.script.data += "val dkuContext   = DataikuSparkContext.getContext(sparkContext)\n\n";
            suffix = '';
        }

        var inputDatasets = RecipesUtils.getInputsForRole($scope.recipe, "main");
        if (inputDatasets.length > 0) {
            $scope.script.data += "// Recipe inputs\n";
        }
        getComputablesOfType(inputDatasets, 'MANAGED_FOLDER').forEach(function (_) {
            $scope.script.data += "val " + cleanupVariable(_.computable.box.name) +
                ' = dkuContext.getManagedFolderRoot("'+ _.computable.box.id +
                (_.computable.box.projectKey === $scope.recipe.projectKey ? '' : '", "' + _.computable.box.projectKey) +
                '")\n';
        });
        getComputablesOfType(inputDatasets, 'DATASET').forEach(function (_) {
            $scope.script.data += "val " + cleanupVariable(_.ref) + ' = ' +
                (functionMode ? 'inputDatasets(' : 'dkuContext.getDataFrame(sqlContext, ') +
                '"' + _.ref + '")\n';
        });
        getComputablesOfType(inputDatasets, 'STREAMING_ENDPOINT').forEach(function (_) {
            $scope.script.data += "val " + cleanupVariable(_.ref) + ' = ' +
                (functionMode ? 'inputStreamingEndpoints(' : 'dkuContext.getStream(') + 
                '"' + _.ref + '")\n';
        });
        $scope.script.data += "\n";
        
        var outputDatasets = RecipesUtils.getOutputsForRole($scope.recipe, "main");

        var hasDataframeToOutput = false;
        if (inputDatasets.length == 1 && outputDatasets.length == 1) {
             if (getComputablesOfType(inputDatasets, 'DATASET').length == 1) {
                 hasDataframeToOutput = true;
             } else if (getComputablesOfType(inputDatasets, 'STREAMING_ENDPOINT').length == 1) {
                 hasDataframeToOutput = true;
             }
        }
        var dataframeToOutput = "someStreamingDataframe";
        if (hasDataframeToOutput) {
            $scope.script.data += "// replace by your code\n";
            $scope.script.data += "val df = " + cleanupVariable(inputDatasets[0].ref) + "\n";
            $scope.script.data += "\n";
            dataframeToOutput = "df";
        }

        if (outputDatasets.length > 0) {
            $scope.script.data += "// Recipe outputs\n";
        }
        getComputablesOfType(outputDatasets, 'MANAGED_FOLDER').forEach(function (_) {
            $scope.script.data += "val " + cleanupVariable(_.computable.box.name) +
                ' = dkuContext.getManagedFolderRoot("'+ _.computable.box.id +
                (_.computable.box.projectKey === $scope.recipe.projectKey ? '' : '", "' + _.computable.box.projectKey) +
                '")\n';
        });
        if (functionMode) {
            $scope.script.data += "// The returned Map must contain (dataset or streaming endpoint name -> dataframe) pairs\n"
            $scope.script.data += "Map(" +
                getComputablesOfType(outputDatasets, 'DATASET').concat(getComputablesOfType(outputDatasets, 'STREAMING_ENDPOINT')).map(function (_) {
                    return '"' + _.ref + '" -> ' + dataframeToOutput;
                }).join(',\n    ') +
                ")\n";
        } else {
            getComputablesOfType(outputDatasets, 'STREAMING_ENDPOINT').forEach(function (_) {
                $scope.script.data += "val " + cleanupVariable(_.computable.streamingEndpoint.id) +
                    ' = dkuContext.saveStreamingQueryToStreamingEndpoint("'+ _.computable.streamingEndpoint.id  + '", ' + dataframeToOutput + ')\n';
            });
            getComputablesOfType(outputDatasets, 'DATASET').forEach(function (_) {
                $scope.script.data += "val " + cleanupVariable(_.computable.dataset.name) +
                    ' = dkuContext.saveStreamingQueryToDataset("'+ _.ref + '", ' + dataframeToOutput + ')\n';
            });
        }
        $scope.script.data += suffix;
    };

    $scope.selectCodeMode = function() {
        var items = [
            { mode: 'FREE_FORM', title: 'Free-Form', desc: "The code is a script. " +
                "It must instantiate its Spark context and SQL context, load its input datasets and save its output datasets." },
            { mode: 'FUNCTION', title: 'Function', desc: "The code is the body of a function. " +
                "It recieves pre-instantiated Spark context, SQL context, and input datasets and must return its output datasets. " +
                "This mode is compatible with Spark pipelines." }
        ];
        Dialogs.select($scope, 'Code mode', 'Select the mode for the code:', items,
                items[$scope.recipe.params.codeMode === 'FUNCTION' ? 1 : 0]
        ).then(function(item) {
            $scope.recipe.params.codeMode = item.mode;
        });
    };

    var transformCode = true;
    $scope.$watch('recipe.params.codeMode', function(mode, previous) {
        Logger.info("Transform: from " + previous + " to " + mode);
        if (transformCode && mode === 'FUNCTION' && previous === 'FREE_FORM') {
            transformCode = false; // only once
            $scope.autofillCode(true);
            $timeout($scope.cm.setValue.bind($scope.cm, $scope.script.data), 0);
        }
    });

    $scope.validateRecipe = function() {
        return CodeBasedValidationUtils.getGenericCheckPromise($scope).then(function(valResult) {
            $scope.valCtx.validationResult = valResult;
            CodeBasedEditorUtils.updateLinter(valResult, $scope.linterFunction);
            $scope.recipeWT1Event("spark-scala-validate", {
                ok : !valResult.topLevelMessages.error,
                firstError : (valResult.topLevelMessages.messages.length ? valResult.topLevelMessages.messages[0].message : null)
            });
            return valResult;
        });
    };
    $scope.hooks.preRunValidate = $scope.validateRecipe;
});


})();