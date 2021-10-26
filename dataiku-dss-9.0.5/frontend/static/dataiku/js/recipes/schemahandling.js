(function() {
    'use strict';
	var app = angular.module('dataiku.recipes');

	app.factory("ComputableSchemaRecipeSave", function(DataikuAPI, CreateModalFromTemplate, $q, $stateParams, ActivityIndicator, Logger, Dialogs) {
		var setFlags = function(datasets, stricter) {
            $.each(datasets, function(idx, val) {
                val.dropAndRecreate = val.incompatibilities.length > 0;
                val.synchronizeMetastore = val.incompatibilities.length > 0 && val.isHDFS;
            });
		}

		var getUpdatePromises = function(computables){
			var promises = [];
            $.each(computables, function(idx, val) {
                let extraOptions = {};
                if (val.type == 'STREAMING_ENDPOINT') {
                    extraOptions.ksqlParams = val.ksqlParams;
                }
                promises.push(DataikuAPI.flow.recipes.saveOutputSchema($stateParams.projectKey,
                    val.type, val.type == "DATASET" ? val.datasetName : val.id, val.newSchema,
                    val.dropAndRecreate, val.synchronizeMetastore, extraOptions));
            });
            return promises;
        }
        var getRecipePromises = function(data){
            var promises = [];
            if (data.updatedRecipe && data.updatedPayload) {
                promises.push(DataikuAPI.flow.recipes.save($stateParams.projectKey,
                    data.updatedRecipe, data.updatedPayload,
                    "Accept recipe update suggestion"));
            }
            return promises;
        }

        var displayPromisesError = function(errRet) {
            var scope = this;
            if (errRet.data) {
                var errDetails = getErrorDetails(errRet.data, errRet.status, errRet.headers, errRet.statusText);
            } else {
                var errDetails = getErrorDetails(errRet[0].data, errRet[0].status, errRet[0].headers, errRet[0].statusText);
            }
            Dialogs.displaySerializedError(scope, errDetails)
        }

		return {
            decorateChangedDatasets: setFlags,
            getUpdatePromises: getUpdatePromises,
            getRecipePromises: getRecipePromises,

			// The scope must be a recipe scope and contain the "doSave" function
			handleSave : function($scope, recipeSerialized, serializedData, deferred) {
	            var doSave = function(){
	                $scope.baseSave(recipeSerialized, serializedData).then(function(){
	                    deferred.resolve("Save done");
	                }, function(error) {
	                	Logger.error("Could not save recipe");
	                	deferred.reject("Could not save recipe");
	                })
	            }

	            DataikuAPI.flow.recipes.getComputableSaveImpact($stateParams.projectKey,
	             recipeSerialized, serializedData).success(function(data) {
	             	var allPreviousSchemasWereEmpty = data.computables.every(x => x.previousSchemaWasEmpty)

	             	if (data.totalIncompatibilities > 0 && allPreviousSchemasWereEmpty) {
						Logger.info("Schema incompatibilites, but all previous schemas were empty, updating and saving");
                        setFlags(data.computables, true);
                        $q.all(getUpdatePromises(data.computables)).then(function() {
                            doSave();
                        }).catch(displayPromisesError.bind($scope));
	             	} else if (data.totalIncompatibilities > 0) {
	             		Logger.info("Schema incompatibilites detected, and some schemas were not empty, displaying modal", data);
	                    $scope.schemaChanges = data;
                        var closedWithButton = false;
	                    CreateModalFromTemplate("/templates/recipes/fragments/recipe-incompatible-schema-multi.html", $scope, null,
	                        function(newScope) {
	                        	setFlags($scope.schemaChanges.computables, false);
	                            newScope.cancelSave = function(){
                                    closedWithButton = true;
	                                newScope.dismiss();
	                                Logger.info("Save cancelled");
	                                deferred.reject("Save cancelled");
	                            };
	                            newScope.updateSchemaFromSuggestion = function() {
                                    closedWithButton = true;
	                                var promises = getUpdatePromises($scope.schemaChanges.computables);
	                                $q.all(promises).then(function() {
	                                    newScope.dismiss();
	                                    doSave();
	                                }).catch(function(data){
	                                	setErrorInScope.bind($scope)(data.data, data.status, data.headers)
	                                });
	                            };
	                            newScope.ignoreSchemaChangeSuggestion = function() {
                                    closedWithButton = true;
	                                newScope.dismiss();
	                                doSave();
	                            };
	                        }
	                    ).then(function(){}, function(){if (!closedWithButton) {deferred.reject("Modal closed impolitely");}});
	                } else {
	                    Logger.info("No incompatible change, saving");
	                    doSave();
	                }
	            }).error(function(data, status, header){
                    Logger.error("Failed to compute recipe save impact");
                    // Failed to compute impact, don't block recipe save but ask user
                    var closedWithButton = false;
                    CreateModalFromTemplate("/templates/recipes/fragments/compute-save-impact-failed.html", $scope, null,
                            function(newScope) {
                                setErrorInScope.bind(newScope)(data, status, header);

                                newScope.cancelSave = function(){
                                    closedWithButton = true;
                                    newScope.dismiss();
                                    Logger.info("Save cancelled");
                                    deferred.reject("Save cancelled");
                                };
                                newScope.saveAnyway = function() {
                                    closedWithButton = true;
                                    newScope.dismiss();
                                    doSave();
                                };
                            }
                        ).then(function(){}, function(){if (!closedWithButton) {deferred.reject("Modal closed impolitely");}});
	            });
			},

			// Specialized version for the Shaker that needs to call a different API
			handleSaveShaker : function($scope, recipeSerialized, shaker, recipeOutputSchema, deferred) {
                const doSave = function(){
                    $scope.baseSave(recipeSerialized, JSON.stringify(shaker)).then(function() {
                        $scope.origShaker = angular.copy(shaker);
                        $scope.schemaDirtiness.dirty = false;
                        deferred.resolve("Save done");
                    });
                }

                $scope.waitAllRefreshesDone().then(function() {
                    DataikuAPI.flow.recipes.getShakerSaveImpact($stateParams.projectKey,
                        $scope.recipe, shaker, $scope.recipeOutputSchema).success(function (data) {

                            var allPreviousSchemasWereEmpty = data.computables.every(x => x.previousSchemaWasEmpty)

                            if (data.totalIncompatibilities > 0 && allPreviousSchemasWereEmpty) {
                                Logger.info("Schema incompatibilites, but all previous schemas were empty, updating and saving");
                                setFlags(data.computables, true);
                                $q.all(getUpdatePromises(data.computables)).then(function () {
                                    doSave();
                                }).catch(displayPromisesError.bind($scope));
                            } else if (data.totalIncompatibilities > 0) {
                                $scope.schemaChanges = data;

                                CreateModalFromTemplate("/templates/recipes/fragments/recipe-incompatible-schema-multi.html", $scope, null,
                                    function (newScope) {
                                        setFlags($scope.schemaChanges.computables, false);
                                        newScope.cancelSave = function () {
                                            newScope.dismiss();
                                            Logger.info("Save cancelled");
                                            deferred.reject("Save cancelled");
                                        }
                                        newScope.updateSchemaFromSuggestion = function () {
                                            var promises = getUpdatePromises($scope.schemaChanges.computables);
                                            $q.all(promises).then(function () {
                                                newScope.dismiss();
                                                doSave();
                                            }).catch(function (data) {
                                                setErrorInScope.bind($scope)(data.data, data.status, data.headers)
                                            });
                                        }
                                        newScope.ignoreSchemaChangeSuggestion = function () {
                                            newScope.dismiss();
                                            doSave();
                                        }
                                    }
                                );
                            } else {
                                Logger.info("No incompatible change, saving");
                                doSave();
                            }
                        }).error(function (data, status, header) {
                            setErrorInScope.bind($scope)(data, status, header);
                            deferred.reject("failed to execute getComputableSaveImpact");
                        });
                });
            },


			handleSchemaUpdateFromAnywhere : function(parentScope, recipeProjectKey, recipeName) {
				var serviceScope = parentScope.$new();
	            DataikuAPI.flow.recipes.getSchemaUpdateResult(recipeProjectKey, recipeName).success(function(data) {
					var allPreviousSchemasWereEmpty = data.computables.every(x => x.previousSchemaWasEmpty)

                   if (data.totalIncompatibilities > 0 && allPreviousSchemasWereEmpty) {
                        Logger.info("Schema incompatibilites, but all previous schemas were empty, updating and saving");
                        setFlags(data.computables, true);
                        $q.all(getUpdatePromises(data.computables)).then(function() {
                            // Nothing to do
                        }).catch(displayPromisesError.bind(parentScope));
	             	}  else if (data.totalIncompatibilities > 0) {
	             		Logger.info("Schema incompatibilites detected, and some schemas were not empty, displaying modal", data);
	                    serviceScope.schemaChanges = data;

	                    CreateModalFromTemplate("/templates/recipes/incompatible-schema-external-modal.html", serviceScope, null,
	                        function(newScope) {
	                        	setFlags(serviceScope.schemaChanges.computables, true);

	                            newScope.updateSchemaFromSuggestion = function() {
	                                var promises = getUpdatePromises(serviceScope.schemaChanges.computables);
	                                $q.all(promises).then(function() {
	                                    newScope.dismiss();
	                                }).catch(function(data){
	                                	setErrorInScope.bind(newScope)(data.data, data.status, data.headers)
	                                });
	                            }
	                            newScope.ignoreSchemaChangeSuggestion = function() {
	                                newScope.dismiss();
	                            }
	                        }
	                    );
	                } else {
	                    ActivityIndicator.success("Schema is already up-to-date");
	                }
	            }).error(function(data, status, header){
	            	CreateModalFromTemplate("/templates/recipes/propagate-schema-changes-failed-modal.html", serviceScope, null,
	                        function(newScope) {
	            		setErrorInScope.bind(newScope)(data, status, header);
	            	});
	            });
			},

            handleSchemaUpdateWithPrecomputedUnattended : function(parentScope, data) {
                var deferred = $q.defer();

                if (data && (data.totalIncompatibilities > 0 || data.recipeChanges.length > 0)) {
                    Logger.info("Schema incompatibilities, unattended mode, updating and saving");
                    setFlags(data.computables, true);
                    $q.all(getUpdatePromises(data.computables).concat(getRecipePromises(data))).then(function() {
                        deferred.resolve({changed:true});
                    }).catch(displayPromisesError.bind(parentScope));
                } else {
                    deferred.resolve({changed:false});
                }
                return deferred.promise;
            },

			handleSchemaUpdateWithPrecomputed : function(parentScope, data) {
				var deferred = $q.defer();
				var serviceScope = parentScope.$new();
                var allPreviousSchemasWereEmpty = data && data.computables.every(x => x.previousSchemaWasEmpty)

	            if (data && data.totalIncompatibilities > 0 && allPreviousSchemasWereEmpty && data.recipeChanges.length == 0) {
                    Logger.info("Schema incompatibilites, but all previous schemas were empty, updating and saving");
                    setFlags(data.computables, true);
                    $q.all(getUpdatePromises(data.computables).concat(getRecipePromises(data))).then(function() {
                        deferred.resolve({changed:true});
                    }).catch(displayPromisesError.bind(parentScope));
             	} else if (data && (data.totalIncompatibilities > 0 || data.recipeChanges.length > 0)) {
             		Logger.info("Schema incompatibilites detected, and some schemas were not empty, displaying modal", data);
                    serviceScope.schemaChanges = data;

                    CreateModalFromTemplate("/templates/recipes/incompatible-schema-external-modal.html", serviceScope, null,
                        function(newScope) {
                        	setFlags(serviceScope.schemaChanges.computables, true);

                            newScope.updateSchemaFromSuggestion = function() {
                                var promises = getUpdatePromises(serviceScope.schemaChanges.computables).concat(getRecipePromises(serviceScope.schemaChanges));
                                $q.all(promises).then(function() {
                                    newScope.dismiss();
                                    deferred.resolve({changed: true});
                                }).catch(function(data){
                                	setErrorInScope.bind(newScope)(data.data, data.status, data.headers)
                                	deferred.reject("Change failed");
                                });
                            }
                            newScope.ignoreSchemaChangeSuggestion = function() {
                                newScope.dismiss();
                                deferred.resolve({changed:false});
                            }
                        }
                    );
                } else {
                	deferred.resolve({changed:false});
                }
                return deferred.promise;
			},
		}
	});

	app.directive('codeRecipeSchemaList', function(DataikuAPI, Dialogs, $stateParams, CreateModalFromTemplate) {
    	return {
	        link : function($scope, element, attrs) {
	        	$scope.beginEditSchema = function(datasetSmartName) {
                    const computable = $scope.computablesMap[datasetSmartName];
                    if (!computable) {
                        throw new Error("Dataset not in computablesMap, try reloading the page");
                    }
	        		const dataset = computable.dataset;
                    DataikuAPI.datasets.get(dataset.projectKey, dataset.name, $stateParams.projectKey)
                        .success(function(data){
    	        			CreateModalFromTemplate("/templates/recipes/code-edit-schema.html", $scope,
    	        				null, function(newScope) {
    	        					newScope.dataset = data;
                                }).then(function(schema) {
                                    dataset.schema = schema;
                                });
    	        		}).error(setErrorInScope.bind($scope));
	        	}
	        }
	    }
	});

	app.directive("schemaEditorBase", function(DatasetUtils, $timeout, CreateModalFromTemplate, ContextualMenu, ExportUtils, ColumnTypeConstants, ActivityIndicator) {
		return {
			scope : true,
			link : function($scope, element, attrs) {
				$scope.columnTypes = ColumnTypeConstants.types;
				$scope.menusState = {meaning:false};
				$scope.startEditName = function(column, $event) {
					$scope.dataset.schema.columns.forEach(function(x){
						x.$editingName = false;
						x.$editingComment = false;
					});

					var grandpa = $($event.target.parentNode.parentNode.parentNode);
					$timeout(function() { grandpa.find("input").focus(); });
				}
				$scope.blur = function(event) {
					$timeout(function() { event.currentTarget.blur(); });
				}
				$scope.setSchemaUserModifiedIfDirty = function() {
					if ($scope.datasetIsDirty && $scope.datasetIsDirty()) {
						$scope.setSchemaUserModified()
					}
				}

				function arrayMove(arr, from, to) {
					arr.splice(to, 0, arr.splice(from, 1)[0]);
				}

				$scope.moveColumnUp = function(column){
					var index = $scope.dataset.schema.columns.indexOf(column);
					if (index > 0) {
						arrayMove($scope.dataset.schema.columns, index, index - 1);
						$scope.setSchemaUserModified();
					}
				}
				$scope.moveColumnDown = function(column){
					var index = $scope.dataset.schema.columns.indexOf(column);
					if (index >= 0 && index < $scope.dataset.schema.columns.length - 1) {
						arrayMove($scope.dataset.schema.columns, index, index + 1);
						$scope.setSchemaUserModified();
					}
				}

				$scope.startEditComment = function(column, $event) {
					$scope.dataset.schema.columns.forEach(function(x){
						x.$editingName = false;
						x.$editingComment = false;
					});
					column.$editingComment = true;
					$timeout(function(){
	        			$($event.target).find("input").focus()
	        		}, 50);
				}
				$scope.addNew = function() {
					if ($scope.dataset.schema == null) {
						$scope.dataset.schema = { "columns" : []};
					}
					if ($scope.dataset.schema.columns == null) {
						$scope.dataset.schema.columns = [];
					}
					$scope.setSchemaUserModified();
					$scope.dataset.schema.columns.push({$editingName : true, name: '', type: 'string', comment: '', maxLength: 1000});
                    $scope.clearFilters();
                    $timeout(function(){
	                    $scope.$broadcast('scrollToLine', -1);
	                });
				}
				$scope.selection.orderQuery = "$idx";

				/** meanings **/
				$scope.openMeaningMenu = function($event, column) {
					$scope.meaningMenu.openAtXY($event.pageX, $event.pageY);
					$scope.meaningColumn = column;
				};

				// use delete instead of '... = null' because when it comes as json, the property is just not there when null
				$scope.setColumnMeaning = function(meaningId) {
					if ($scope.meaningColumn == null) {
	                	$scope.selection.selectedObjects.forEach(function(c) {
							if (meaningId == null) {
								delete c.meaning;
							} else {
			                	c.meaning = meaningId;
							}
	                	});
					} else {
						if (meaningId == null) {
							delete $scope.meaningColumn.meaning;
						} else {
		                	$scope.meaningColumn.meaning = meaningId;
						}
					}
                    $(".code-edit-schema-box").css("display", "block");
                    if ($scope.setSchemaUserModified) $scope.setSchemaUserModified();
                };

                $scope.editColumnUDM = function(){
                    CreateModalFromTemplate("/templates/meanings/column-edit-udm.html", $scope, null, function(newScope){
                    // $(".code-edit-schema-box").css("display", "none");
                    	var columnName;
			if ($scope.meaningColumn == null) {
				columnName = $scope.selection.selectedObjects[0].name;
			} else {
				columnName = $scope.meaningColumn.name;
			}
                        newScope.initModal(columnName, $scope.setColumnMeaning);
                    })
                }

				$scope.exportSchema = function() {
                    if (!$scope.dataset.schema || !$scope.dataset.schema.columns) {
                        ActivityIndicator.error('Empty schema.');
                        return;
                    }
					ExportUtils.exportUIData($scope, {
						name: "Schema of " + $scope.dataset.name,
						columns: [
							{ name: "name", type: "string" },
							{ name: "type", type: "string" },
							{ name: "meaning_id", type: "string" },
							{ name: "description", type: "string" },
							{ name: "max_length", type: "int" }
						],
						data: $scope.dataset.schema.columns.map(function(c){
							return [c.name, c.type, c.meaning, c.comment, c.maxLength >= 0 ? c.maxLength : "" ]
						})
					}, "Export schema");
				}

                $scope.meaningMenu = new ContextualMenu({
                    template: "/templates/shaker/edit-meaning-contextual-menu.html",
                    cssClass : "column-header-meanings-menu pull-right",
                    scope: $scope,
                    contextual: false,
                    onOpen: function() {
                    },
                    onClose: function() {
                    }
                });

                var reNumberColumns = function() {
                	var columns = $scope.$eval(attrs.ngModel);
                	if (!columns) return;
                	// columns.forEach(function(c, i) {c.$idx = i;});
                };

                /** column type **/
                $scope.setColumnsType = function(columnType) {
            		$scope.selection.selectedObjects.forEach(function(c) {
            			c.type = columnType;
            		});
                };
                /** renaming **/
                $scope.doRenameColumns = function(renamings) {
                	renamings.forEach(function(renaming) {
                		$scope.selection.selectedObjects.forEach(function(c) {
                			if (c.name == renaming.from) {
                				c.name = renaming.to;
                			}
                		});
                	});
                };

                $scope.renameColumns = function() {
                	CreateModalFromTemplate('/templates/shaker/modals/shaker-rename-columns.html', $scope, 'MassRenameColumnsController', function(newScope) {
                   		newScope.setColumns($scope.selection.selectedObjects.map(function(c) {return c.name;}));
                   		newScope.doRenameColumns = function(renamings) {
                   			$scope.doRenameColumns(renamings);
                   		};
                    });
                };
                /** data for the right pane **/
                var commonBaseTypeChanged = function() {
                	if (!$scope.selection || !$scope.selection.multiple) return;
                	if (!$scope.multipleSelectionInfo || !$scope.multipleSelectionInfo.commonBaseType) return;
                	var columns = $scope.selection.selectedObjects;
                	columns.forEach(function(column) {column.type = $scope.multipleSelectionInfo.commonBaseType.type;});
                };
                var commonTypeChanged = function() {
                	if (!$scope.selection || !$scope.selection.multiple) return;
                	if (!$scope.multipleSelectionInfo || !$scope.multipleSelectionInfo.commonType) return;
                	var columns = $scope.selection.selectedObjects;
                	var setFullType = function(column, commonType) {
            			column.type = commonType.type;
            			column.maxLength = commonType.maxLength;
            			column.objectFields = commonType.objectFields ? angular.copy(commonType.objectFields) : null;
            			column.arrayContent = commonType.arrayContent ? angular.copy(commonType.arrayContent) : null;
            			column.mapKeys = commonType.mapKeys ? angular.copy(commonType.mapKeys) : null;
            			column.mapValues = commonType.mapValues ? angular.copy(commonType.mapValues) : null;
                	};
                	columns.forEach(function(column) {setFullType(column, $scope.multipleSelectionInfo.commonType);});
                };
                var updateInfoForMultipleTab = function() {
                	if ($scope.commonTypeChangedDeregister) {
                		$scope.commonTypeChangedDeregister();
                		$scope.commonTypeChangedDeregister = null;
                	}
                	if ($scope.commonBaseTypeChangedDeregister) {
                		$scope.commonBaseTypeChangedDeregister();
                		$scope.commonBaseTypeChangedDeregister = null;
                	}
                	if (!$scope.selection || !$scope.selection.multiple) return;
                	var getFullType = function(column) {
                		return {
                			type:column.type ? column.type : null,
                			maxLength:column.maxLength ? column.maxLength : null,
                			objectFields:column.objectFields ? column.objectFields : null,
                			arrayContent:column.arrayContent ? column.arrayContent : null,
                			mapKeys:column.mapKeys ? column.mapKeys : null,
                			mapValues:column.mapValues ? column.mapValues : null
                		};
                	};
                	var columns = $scope.selection.selectedObjects;
                	var names = columns.map(function(column) {return column.name;});
                	var meanings = columns.map(function(column) {return column.meaning;});
                	var types = columns.map(function(column) {return column.type;});
                	var fullTypes = columns.map(function(column) {return getFullType(column);});
                	var firstFullType = fullTypes[0];
                	var sameTypes = fullTypes.map(function(t) {return angular.equals(t, firstFullType);}).reduce(function(a,b) {return a && b;});
                	var commonType = sameTypes ? firstFullType : null;
                	$scope.multipleSelectionInfo = {sameTypes: sameTypes, commonType : commonType, commonBaseType : null};

                    $scope.commonBaseTypeChangedDeregister = $scope.$watch('multipleSelectionInfo.commonBaseType', commonBaseTypeChanged);
                    $scope.commonTypeChangedDeregister = $scope.$watch('multipleSelectionInfo.commonType', commonTypeChanged, true);
                };
                $scope.$watch('selection.multiple', updateInfoForMultipleTab);
                $scope.$watch('selection.selectedObjects', updateInfoForMultipleTab, true);


                $scope.$watch(attrs.ngModel, reNumberColumns); // for when the schema is inferred again (but nothing changes)
                $scope.$watch(attrs.ngModel, reNumberColumns, true);
			}
		}
	});

	app.directive('codeRecipeSchemaEditing', function(DataikuAPI, DatasetUtils, DatasetsService,
		Dialogs, $stateParams, $timeout, Logger){
    	return {
	        link : function($scope, element, attrs) {
	        	$scope.overwriteSchema = function(newSchema) {
	        		$scope.dataset.schema = angular.copy(newSchema);
	        		$scope.schemaJustModified = false;
	        		$scope.consistency = null;
	        	};

	        	$scope.saveSchema = function() {
	        		DataikuAPI.datasets.save($scope.dataset.projectKey, $scope.dataset).success(function(data){
                        $scope.resolveModal($scope.dataset.schema);
	        		}).error(setErrorInScope.bind($scope));
	        	};

	        	$scope.discardConsistencyError= function(){
	        		$scope.consistency = null;
	        	};

	        	$scope.setSchemaUserModified = function() {
            		$scope.schemaJustModified = true;
              		$scope.dataset.schema.userModified = true;
              		$scope.consistency = null;
          		};

                $scope.addColumn = function(){
                    if ($scope.dataset.schema == null) {
                        $scope.dataset.schema = { "columns" : []};
                    }
                    $scope.setSchemaUserModified();
                    $scope.dataset.schema.columns.push({$editingName : true, name: '', type: 'string', comment: '', maxLength: 1000});
                };

	        	$scope.checkConsistency = function () {
			        Logger.info('Checking consistency');
			        $scope.schemaJustModified = false;

			        DataikuAPI.datasets.testSchemaConsistency($scope.dataset).success(function (data) {
            			Logger.info("Got consistency result", data);
            			$scope.consistency = data;
            			$scope.consistency.kind = DatasetUtils.getKindForConsistency($scope.dataset);
            		});
	        	};
	        }
        }
    });
})();
