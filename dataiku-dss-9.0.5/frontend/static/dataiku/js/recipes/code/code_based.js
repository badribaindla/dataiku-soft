(function(){
'use strict';

var app = angular.module('dataiku.recipes');


app.factory("CodeBasedEditorUtils", function($rootScope, CodeMirrorSettingService) {
    var svc = {
        editorOptions : function(mode, $scope, enableLint) {
            const hintModeBlacklist = ['text/x-sql', 'text/x-sql2', 'text/x-hivesql', 'text/x-dkupig']; // don't apply recipe autocomplete to these modes
            var options = CodeMirrorSettingService.get(mode, {
                onLoad: function(cm) {$scope.cm = cm;},
                words: getRecipeWords($scope)
            });
            options.extraKeys['Meta-Enter'] = function(cm) {$scope.validateRecipe();};
            options.extraKeys['Ctrl-Enter'] = function(cm) {$scope.validateRecipe();};
            options.gutters = ["CodeMirror-lint-markers","CodeMirror-foldgutter"];

            // computablesMap isn't available if coming from list view, so fire when it is available
            $scope.$on('computablesMapChanged', () => {
                if (hintModeBlacklist.indexOf(mode) < 0) {
                    options.extraKeys[CodeMirrorSettingService.getShortcuts()['AUTOCOMPLETE_SHORTCUT']] = CodeMirrorSettingService.showHint(mode, getRecipeWords($scope));
                }
            })

            if (enableLint) {
                options.lint = {
                    'getAnnotations' : function(cm,updateFunction) {
                        $scope.linterFunction = function(err) {
                            updateFunction(err);
                        };
                    },
                    'async' : true
                };
            }
            return options;
        },

        updateLinter : function(validationResult, linterFunction) {
            var found = [];
            if(validationResult) {
                validationResult.topLevelMessages.messages.forEach(function(err) {
                    if (err.line >= 0) {
                         var lineTo = (err.lineTo >= 0 ? err.lineTo : err.line);
                        found.push({
                            from: CodeMirror.Pos(err.line-1, 0),
                            to: CodeMirror.Pos(lineTo-1, 1000),
                            message: err.message + (err.context ? " (around " + err.context + ")" : ""),
                            severity : err.severity=='WARNING'?'warning':'error'
                        });
                    }
                });
            }
            if(linterFunction) {
                linterFunction(found);
            }
        }
    };

    return svc;

    function getRecipeWords($scope) {
        let inputs = $scope.recipe && $scope.recipe.inputs && $scope.recipe.inputs['main'] ? $scope.recipe.inputs['main'].items : [];
        let outputs = $scope.recipe && $scope.recipe.outputs && $scope.recipe.outputs['main'] ? $scope.recipe.outputs['main'].items : [];
        let computables = $scope.computablesMap || [];
        return inputs.concat(outputs) // [input1 def, output1 def]
                .map(_ => computables[_.ref]) // [input1 computable, output1 computable]
                .filter(_ => _ && _.dataset && _.dataset.schema && _.dataset.schema.columns)
                .map(_ => _.dataset.schema.columns.map(c => c.name)) // [[input1 col names], [output1 col names]]
                .reduce((a, b) => a.concat(b.filter(_ => !a.includes(_))), []); // [deduplicated concatenated col names]
    }
});


app.factory("CodeBasedValidationUtils", function(DataikuAPI, RecipeRunJobService, $stateParams){
    var svc = {
        /* Returns a promise to the validation result (ie CodeBasedRecipeStatus object) */
        getGenericCheckPromise : function($scope) {
            $scope.hooks.resetScope();

            return DataikuAPI.flow.recipes.generic.getStatusWithSpinner($scope.hooks.getRecipeSerialized(),
                $scope.script.data, 1, {
                    targetPartitionSpec : RecipeRunJobService.getTargetPartition($scope, $stateParams)
                })
            .error(setErrorInScope.bind($scope))
            .then(function(resp) {
                var data = resp.data;
                data.allMessagesLength = data.allMessagesForFrontend.messages.reduce(function(acc, msg){
                    return acc + msg.message.length;
                }, 0);
                return data;
            });
        }
    }
    return svc;
});


app.factory("CodeBasedToPluginConverter", function(CreateModalFromTemplate, DataikuAPI, WT1, $state, $rootScope, StateUtils, PluginsService){
    const svc = {
        transformToDevPlugin: function($scope, convertAPIFunc, type) {
            CreateModalFromTemplate("/templates/recipes/custom-code/code-recipe-to-customcode.html", $scope, null, function(modalScope) {
                const getAPICallParams = function(scope) {
                    const params = scope.convert;
                    const pluginId = params.mode == 'NEW' ? params.newPluginId : params.targetPluginId;
                    return [pluginId,
                            params.mode,
                            scope.script.data,
                            params.targetFolder,
                            scope.hooks.getRecipeSerialized()];
                };
                PluginsService.transformToDevPlugin(modalScope, convertAPIFunc, getAPICallParams,
                                                    "plugin-convert-to-customcode", "customCodeRecipes", type);
            });
        }
    }
    return svc;
});



app.directive('codeBasedRecipeBase', function($timeout, $stateParams, DataikuAPI, Assert, StateUtils, TopNav, RecipesUtils) {
    return {
        controller: function($scope) {
            const tabToSelect = StateUtils.defaultTab($scope.creation ? "io" : "code");
            TopNav.setTab(tabToSelect);
            Assert.inScope($scope, 'hooks');

            function insert(text) {
                if(!text) return;

                $timeout(function() {
                    $scope.cm.replaceSelection(text, 'end');
                });
                $scope.cm.focus();
            }

            function checkDatasetFragmentsLoaded(type, dataset) {
                return $scope.insertableFragments && $scope.insertableFragments[type][dataset.name];
            }
            function checkStreamingEndpointFragmentsLoaded(type, streamingEndpoint) {
                return $scope.insertableFragments && $scope.insertableFragments[type][streamingEndpoint.id];
            }

            /**
            * Inserts the column name
            */
            $scope.insertColumn = function(type, dataset, column) {
                if(checkDatasetFragmentsLoaded(type, dataset)) {
                    insert($scope.insertableFragments[type][dataset.name].columnRefs[column.name]);
                }
                if(checkStreamingEndpointFragmentsLoaded(type, dataset)) {
                    insert($scope.insertableFragments[type][dataset.id].columnRefs[column.name]);
                }
            };

            /**
            * Inserts the dataset name
            */
            $scope.insertDataset = function(type, dataset) {
                if(checkDatasetFragmentsLoaded(type, dataset)) {
                    insert($scope.insertableFragments[type][dataset.name].datasetRef);
                }
            }
            $scope.insertStreamingEndpoint = function(type, streamingEndpoint) {
                if(checkStreamingEndpointFragmentsLoaded(type, streamingEndpoint)) {
                    insert($scope.insertableFragments[type][streamingEndpoint.id].datasetRef);
                }
            }

            $scope.$watchGroup(['recipe.inputs', 'recipe.outputs'], function() {
                DataikuAPI.flow.recipes.getInsertableFragments($stateParams.projectKey, $scope.recipe)
                    .success(function(fragments) {
                        $scope.insertableFragments = fragments;
                    }).error(setErrorInScope.bind($scope));
            }, true);

            $scope.rightUIState = { "activeTab" : "datasets"};

            $scope.resolveCodeForPreviewFunc = function (sample) {
            	var inputs = RecipesUtils.getFlatInputsList($scope.recipe);
                var outputs = RecipesUtils.getFlatOutputsList($scope.recipe);

            	var resolveCode = sample.code;
                if (typeof(resolveCode)!=='undefined' &&  inputs.length>0) {
                	var inputRegexp = new RegExp("__FIRST_INPUT__",'g');
                	resolveCode = resolveCode.replace(inputRegexp, inputs[0].ref);
                }
                if (typeof(resolveCode)!=='undefined' && outputs.length>0) {
                	var outputRegexp = new RegExp("__FIRST_OUTPUT__",'g');
                	resolveCode = resolveCode.replace(outputRegexp, outputs[0].ref);
                }
                return resolveCode;
            }

            $scope.resolveCodeForInsertionFunc = function (sample) {
                var code = "\n\n"
		        code += $scope.resolveCodeForPreviewFunc(sample);
                return code;
            }
        }
    }
});


app.directive("codeBasedRecipeAutofill", function() {
    return {
        controller : function($scope, DataikuAPI) {
            // Marks whether the user has started editing
            // the script or not.
            //
            // We allow ourselves to auto-fill the script
            // as long as the user has not started writing anything.
            var no_user_edit = false;
            // flag marking that the current change is coming from auto change.
            var auto_change = false;

            var autofill = function(){
                auto_change = true;
                if ($scope.autofillCode && $scope.computablesMap) $scope.autofillCode();
                window.setTimeout(function() {
                	// there is a nice race condition where the snippet directive links while
                	// this function is run in a digestion cycle, leading to the code mirror
                	// pane not refreshing after the autofill code is set on script.data.
                	// Apparently it works on firefox but not on chrome
                	if ( $scope.cm != null && $scope.script.data != null && $scope.cm.getValue() != $scope.script.data) {
                		// So we force code mirror to update its contents.
                        $scope.cm.setValue($scope.script.data);
                	}
                    auto_change = false;
                }, 0);
            }
            if ($scope.script.data==undefined || !$scope.script.data.length) {
                no_user_edit = true;
                autofill();
            }

            $scope.$watch("script.data", function(nv, ov) {
                if (!auto_change) {
                    no_user_edit = false;
                }
            });

            var onRecipeIoOrComputableChange = function() {
                if (no_user_edit) {
                    var typing = 0;
                    auto_change = true;
                    autofill();
                }
            };
            $scope.$on('computablesMapChanged', onRecipeIoOrComputableChange);
            $scope.$watch("[ recipe.inputs, recipe.outputs ]", onRecipeIoOrComputableChange, true);

        }
    }
});

app.controller("RecipeFromNotebookCreationController", function($scope, $stateParams, StateUtils, DataikuAPI, WT1, Fn, DatasetsService, RecipeComputablesService) {
    $scope.setComputablesMap = function(map) {
        $scope.computablesMap = map;
        $scope.$broadcast('computablesMapChanged');
    };

    $scope.recipeWT1Event = function(type, params) {
        WT1.event(type, params || {});
    };

    $scope.createRecipe = function() {
        $('iframe#jupyter-iframe')[0].contentWindow.IPython.notebook.save_notebook().then(function() {
            WT1.event("notebook-ipython-create-recipe");
            $scope.creatingRecipe = true;
            DataikuAPI.jupyterNotebooks.createRecipeFromNotebook($stateParams.projectKey, $scope.notebookName, $scope.recipe).success(function(data) {
                $scope.creatingRecipe = false;
                $scope.dismiss();
                StateUtils.go.recipe(data.id);
            }).error(function(a, b, c) {
                $scope.creatingRecipe = false;
                setErrorInScope.bind($scope)(a, b, c);
            });
        }).catch(setErrorInScope.bind($scope));
    };

    function init() {
        $scope.recipe = {
            projectKey: $stateParams.projectKey,
            type: $scope.newRecipeType,
            inputs: {},
            outputs: {},
            params: {}
        };

        if ($scope.analyzedDataset) {
            $scope.recipe.inputs.main = {
                items: [
                    {
                        ref: $scope.analyzedDataset,
                        deps: []
                    }
                ]
            };
        }

        RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
            $scope.setComputablesMap(map);
        });
    }

    $scope.$watch("newRecipeType", Fn.doIfNv(init));

    addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);
    fetchManagedDatasetConnections($scope, DataikuAPI);
    DatasetsService.updateProjectList($stateParams.projectKey);
});


app.controller("CodeBasedRecipeCreationController", function($scope, $stateParams, $state, $controller, Fn,
        DataikuAPI, WT1, RecipesUtils, RecipeDescService, DatasetsService, RecipeComputablesService, PartitionDeps, BigDataService) {

    $controller("_RecipeCreationControllerBase", {$scope:$scope});

    function init(){
        $scope.recipeName = {};
        $scope.script = "";
        $scope.recipe = {
            projectKey : $stateParams.projectKey,
            type: $scope.newRecipeType,
            inputs : {},
            outputs : {},
            params: {}
        };

        // recipePrefillKey is a handle (throught "BigDataService" :) ) to an initial script for the recipe (from notebook)
        if($scope.recipePrefillKey) {
            var prefill = BigDataService.fetch($scope.recipePrefillKey);

            if(prefill) {
                if(prefill.script) {
                    $scope.script = prefill.script;
                }
                if(prefill.input) {
                    prefill.input.forEach(function(x){
                        RecipesUtils.addInput($scope.recipe, "main", x);
                    })
                }
                if(prefill.output) {
                    prefill.output.forEach(function(x){
                        RecipesUtils.addOutput($scope.recipe, "main", x);
                    });
                }
            }
        }

        if ($scope.preselectedInputs) {
            if (angular.isArray($scope.preselectedInputs)) {
                $scope.preselectedInputs.forEach(function(input){
                    RecipesUtils.addInput($scope.recipe, "main", input);
                })
            } else {
                RecipesUtils.addInput($scope.recipe, "main", $scope.preselectedInputs);
            }
        }

        RecipeComputablesService.getComputablesMap($scope.recipe, $scope).then(function(map){
            $scope.setComputablesMap(map);
        });
    }

    // we will autofill the name if needed
    $scope.$watch("[recipe.inputs, recipe.outputs]", function(nv, ov) {
        if (nv && $scope.recipe && $scope.recipe.inputs && $scope.recipe.outputs){
            if ($scope.preselectedInputs && $scope.recipe.inputs.main.items.map(it => it.ref)[0] != $scope.preselectedInputs[0]) {
                $scope.zone = null;
            }
            var outputs = RecipesUtils.getFlatOutputsList($scope.recipe);
            if (outputs.length && RecipeDescService.hasValidRequiredRoles($scope.recipe)) {
                $scope.recipeName.name = "compute_" + outputs[0].ref;
            } else {
            	// erase the name to make the modal not ready to close
                $scope.recipeName.name = null;
            }
        }
    }, true);


    $scope.$watch("newRecipeType", Fn.doIfNv(init));

    addDatasetUniquenessCheck($scope, DataikuAPI, $stateParams.projectKey);
    fetchManagedDatasetConnections($scope, DataikuAPI);
    DatasetsService.updateProjectList($stateParams.projectKey);

});


app.controller("_CodeBasedRecipeControllerBase", function($scope, $stateParams) {
    $scope.enableAutoFixup();
});


app.controller('DummyRecipeController', function ($scope, TopNav, StateUtils) {
    TopNav.setTab(StateUtils.defaultTab("settings"));
    $scope.hooks.recipeIsDirty = function() {
        return false;
    };
});


app.controller('MeaningPopoverController', function ($scope, DataikuAPI, UDM_TYPES) {
    $scope.types = UDM_TYPES;
    $scope.user_defined = !!$scope.col.meaning;

    $scope.getPlacement = function(tip, el) {
        var offset = $(el).offset(),
               top = offset.top,
               height = $(document).outerHeight();
           return 0.5 * height - top > 0 ? 'bottom' : 'top';
    }

    if (!$scope.appConfig.meanings.categories
        .filter(function(cat) { return cat.label === "User-defined"; })[0]
        .meanings.filter(function(mapping) { return mapping.id === $scope.col.meaning; }).length) {
        $scope.hide = true;
        return;
    };

    DataikuAPI.meanings.getUDM($scope.col.meaning).success(function(udm) {
        $scope.selected = {item: {_source: udm}};
        $scope.selected.item._source.udm_type = udm.type;
    });
});


}());


function cleanupVariable(s) {
    var result = s.replace(/^([A-Z]+)/g, function($1){return $1.toLowerCase();});
    return result.replace(/[^A-Za-z0-9_]/g, "_");
}
