(function(){
    'use strict';

    var app = angular.module('dataiku.directives.snippetEditor', ['dataiku.filters', 'dataiku.services', 'ui.keypress', 'dataiku.common.lists']);

	app.directive('codeSnippetEditorSwitch', function() {
		return {
			scope: {
				codeSamplesSelectorVisible: '='
			},
			controller : function($scope, $timeout) {
				//showing and hiding the codeSnippetEditorSampleSelector
	        	$scope.switchCodeSamplesSelectorVisibility = function() {
	        		$scope.codeSamplesSelectorVisible = ! $scope.codeSamplesSelectorVisible;

	        		$timeout(function(){
	        			$($('.sample-search input:visible')[0]).focus();
	            	});
	        	}
			},
			templateUrl : '/templates/widgets/code-snippet-editor-switch.html'
		}
	});


	app.directive('codeSnippetSampleSelector', function() {
		return {
			restrict: 'E',
			replace: true,
			templateUrl : '/templates/widgets/code-snippet-sample-selector.html',
			scope : {
				insertCodeFunc : '=',
				codeSamplesSelectorVisible : '=',
				sampleType : '=',
				categories : '=',
				saveCategory : '=',
				insertButtonLabel : '=?'
			},
			controller : function($scope, $timeout, DataikuAPI, ListFilter, WT1) {
				//Preparing parameters for nested directive

				//--resolveCodeForPreviewFunc: code sample previewing
				$scope.resolveCodeForPreviewFunc = function(variation) {
			    	return variation.code;
			    };

	        	//-- reloadSampleListFunc: method used to reload the code sample list
	        	$scope.reloadSampleListFunc = function() {
	            	DataikuAPI.flow.snippets.getSnippets($scope.sampleType, $scope.categories).success(function(data) {
	            		$scope.recipeSamples = data;
	                }).error(setErrorInScope.bind($scope));
	        	}

	        	//--recipeSamples: code samples list to populate the code sample selector in the first place
	        	$scope.reloadSampleListFunc();

	        	//-- insertCodeOnEnterKeyFunc: insert displayed sample's when enter key is pressed
	        	$scope.insertCodeOnEnterKeyFunc = function(sample) {
	        		if (typeof(sample)!=='undefined' && typeof(sample.variations)!=='undefined' && sample.variations.length>0) {
	        			var hasCodeToInsert = false;
	        			for (var i = 0; i<sample.variations.length; i++) {
	        				if (typeof(sample.variations[i])!=='undefined' && typeof(sample.variations[i].code)!=='undefined' && sample.variations[i].code!='') {
	        					hasCodeToInsert = true;
	        					break;
	        				}
	        			}
	        			if (hasCodeToInsert) {
	        				$scope.insertCodeFunc(sample);
	        				WT1.event("insert-snippet", {sampleType : $scope.sampleType, saveCategory : $scope.saveCategory, id : sample.id});
							return true;
	        			}
					}
	        		return false;
	        	}

	        	//Filtering
	        	$scope.recipeSamples = [];
	        	$scope.filteredRecipeSamples = [];

	        }
		}
	});

	app.directive('codeSnippetEditor', function($rootScope) {
		return {
			restrict: 'AE',
			replace: true,
			templateUrl : '/templates/widgets/code-snippet-editor.html',
			transclude: true,
			scope : {
				//CM parameters
				code : '=',
				editorOptions : '=?',
				//Loading samples parameters
	            sampleType : '=',
	            categories : '=',
	            saveCategory : '=',
	            //Previewing and inserting samples parameters
	            resolveCodeForPreviewFunc : '=?',
	            resolveCodeForInsertionFunc : '=?',
	            displayed : '='
	        },
	        controller : function($scope, $element, $timeout, DataikuAPI, ListFilter, WT1, CodeMirrorSettingService) {
	        	//Checking editorOptions parameters
	        	if (typeof($scope.editorOptions)==='undefined') {
                    $scope.editorOptions = CodeMirrorSettingService.get('text/x-python', {onLoad: function(cm) {$scope.codeMirror = cm;}});
	        	} else if (typeof($scope.editorOptions.onLoad)!=='function') {
	        		$scope.editorOptions.onLoad = function (cm) {
	        			 $scope.codeMirror = cm;
	        		}
	        	} else {
	        		var passedOnloadFunc = $scope.editorOptions.onLoad;
	        		$scope.editorOptions.onLoad = function(cm) {
	        			passedOnloadFunc(cm);
	        			$scope.codeMirror = cm;
	        		}
	        	}

	        	//Preparing parameters for nested directive

	        	//--insertCodeFunc: method used to insert code sample into code mirror instance
	        	var insertCode = function (codeToInsert) {
	        		//timeout to make sure of an angular safe apply
	        		$timeout(function() {
	        			$scope.codeMirror.replaceSelection(codeToInsert + '\n\n', "around");
	        		});

	                $scope.codeMirror.focus();
	            }

	        	if (typeof($scope.resolveCodeForInsertionFunc)==='function') {
	            	$scope.insertCodeFunc = function (sample) {
	            		var code = $scope.resolveCodeForInsertionFunc(sample);
	            		insertCode(code);
	            	}
	            } else {
	            	 $scope.insertCodeFunc = function(sample) {
	            		 var code = sample.code;
	            		 insertCode(code);
	                 }
	            }

	        	//-- insertCodeOnEnterKeyFunc: insert displayed sample's first variation when enter key is pressed
	        	$scope.insertCodeOnEnterKeyFunc = function(sample) {
	        		if (typeof(sample.variations)!=='undefined'
					&& sample.variations.length>0
					&& typeof(sample.variations[0])!='undefined'
					&& typeof(sample.variations[0].code)!='undefined'
					&& sample.variations[0].code != "") {
						$scope.insertCodeFunc(sample.variations[0]);
						WT1.event("insert-snippet", {sampleType : $scope.sampleType, saveCategory : $scope.saveCategory, id : sample.id});
						return true;
					}
	        		return false;
	        	}

	        	//-- reloadSampleListFunc: method used to reload the code sample list
	        	$scope.reloadSampleListFunc = function() {
	        		$scope.recipeSamples = [];
	        		DataikuAPI.flow.snippets.getSnippets($scope.sampleType, $scope.categories).success(function(data) {
	            		$scope.recipeSamples = data;
	                }).error(setErrorInScope.bind($scope));
	        	}

	        	//--recipeSamples: code samples list to populate the code sample selector in the first place
	        	$scope.reloadSampleListFunc();

	        	//--filtering: query bar
	        	$scope.recipeSamples = [];
	        	$scope.filteredRecipeSamples = [];

	        	//--filtering: tag filter
	        	$scope.snippetTags = [];
	    		$scope.snippetTagsMap = {};

	        	//Wrapping parameters needed by the view for scope issue
	        	$scope.editorParams = $scope;

		        // UI state for codeSamplesSelectorVisible
		        $scope.codeSamplesSelectorVisible = false;

	        	// attribute to listen on so that we can refresh the codemirror when
	        	// display is toggled between 'none' and 'visible' (for custom python model)
	        	$scope.$watch("displayed", function() {
	        		$element.find('.CodeMirror').each(function(i, el){
	        			if (el.CodeMirror != undefined) {
	        	        	setTimeout(function() {el.CodeMirror.refresh();}, 0);
	        	        }
	        		});
	        	}, true);
	        }
		}
	});

	/*
	 * ------------------------- READING -------------------------
	 */

	app.directive('codeSnippetEditorSampleList', function($timeout, $window, Logger) {
		return {
			link : function($scope, element) {

				$scope.displayedSample = {};

				/*
				 * display and hide sample preview
				 */
				$scope.isSampleDisplayedFunc = function(sample) {
					return typeof($scope.displayedSample)!=='undefined' && sample.id == $scope.displayedSample.id;
				}

				$scope.isAnySampleDisplayed = function() {
					return typeof($scope.displayedSample)!=='undefined' && typeof($scope.displayedSample.id)!=='undefined';
				}

				$scope.displaySampleFunc = function(displayedSample) {
					$scope.displayedSample = displayedSample;
				}

				$scope.hideSampleFunc = function() {
					$scope.displayedSample = {};
				}

				$scope.hideSampleOrCloseSelector = function() {
					if ($scope.isAnySampleDisplayed()) {
						$scope.hideSampleFunc();
					} else {
						$scope.codeSamplesSelectorVisible = false;
					}
				}

				$scope.hideSampleAndCloseSelector = function() {
					$scope.hideSampleFunc();
					$scope.codeSamplesSelectorVisible = false;
				}

				$scope.$watch('displayedSample', function(nv, ov) {
					if (ov.id !== nv.id) {
						if (typeof(nv.id)!=='undefined') {
							displaySample();
						}
					}
				}, true);

				$scope.$watch('filteredRecipeSamples', function(nv) {
					if ($scope.isAnySampleDisplayed()) {
						var displayedSampleStillInList = false;
						for (var i in nv) {
							var currentSample = nv[i];
							if (currentSample.id == $scope.displayedSample.id) {
								displayedSampleStillInList = true;
								break;
							}
						}
						if (!displayedSampleStillInList) {
							$scope.hideSampleFunc();
						}
					}
				}, true);

				var displaySample = function() {
					$timeout(function(){
	            		if(element.find(".sample-details .CodeMirror").length == 0) {
	            			var textAreas = element.find("textarea");
	            			for (var i=0; i<textAreas.length; i++) {
	            				Logger.info("Create a CodeMirror with lang ", $(textAreas[i]).data().codeMirrorLanguage);
	            				CodeMirror.fromTextArea(textAreas[i], createEditorOptions($(textAreas[i]).data().codeMirrorLanguage));
	            			}
	            		} else {
	            			var codeMirrors = element.find('.CodeMirror');
	            			for (var i=0; i<codeMirrors.length; i++) {
	            				codeMirrors[i].CodeMirror.refresh();
	            			}
	            		}
	            		//give focus back to the search query bar so keyboard navigation keeps on working
	            		$($('.sample-search input:visible')[0]).focus();
	            	});
				}

				//-- codeMirror editor option used to display code sample
	            var createEditorOptions = function(language){
	                var options = {
	                    readOnly : true,
	                    lineWrapping: true
	                };
	                if (typeof(language)!=='undefined') {
	                	options.mode = computeCodeMirrorMode(language);
	                }
	                return options;
	            };


				/*
				 * click listeners
				 */

				var isPartOfCodeSnippetEditor = function(node){
					return $(node).closest('.code-sample-selector, .create-sample-modal').length > 0;
            	}

				$scope.addClickListener = function() {
					angular.element($window).on('click', function(e) {
						if (!isPartOfCodeSnippetEditor(e.target)) {
            				$scope.hideSampleOrCloseSelector();
            				$scope.$apply();
            			}
            		});
            		$scope.$on('$destroy', function(){
            			$scope.removeClickListener();
            		});
				}

				$scope.removeClickListener = function() {
        			angular.element($window).off('click');
				}

				$scope.$watch('codeSamplesSelectorVisible', function(nv, ov) {
					if (nv) {
						$timeout($scope.addClickListener);
					} else {
						$timeout($scope.removeClickListener);
					}
				});

				/*
				 * keyboard navigation
				 */

				$scope.displayPreviousSample = function() {
					if (typeof($scope.displayedSample.id)!=='undefined') {
						var sampleToDisplay = {};
						var previousSample = {};
						for (var i=0; i<$scope.filteredRecipeSamples.length; i++) {
							var currentSample = $scope.filteredRecipeSamples[i];
							if (currentSample.id === $scope.displayedSample.id) {
								if (i==0) {
									sampleToDisplay = $scope.filteredRecipeSamples[$scope.filteredRecipeSamples.length-1];
								} else {
									sampleToDisplay = previousSample;
								}
								break;
							} else {
								previousSample = currentSample;
							}
						}
						if (typeof(sampleToDisplay.id)!=='undefined') {
							$scope.displaySampleFunc(sampleToDisplay);
						}
					}
				}

				$scope.displayNextSample = function() {
					var sampleToDisplay = {};
					if (typeof($scope.displayedSample.id)!=='undefined') {
						for (var i=0; i<$scope.filteredRecipeSamples.length; i++) {
							var currentSample = $scope.filteredRecipeSamples[i];
							if (currentSample.id === $scope.displayedSample.id) {
								if (i<$scope.filteredRecipeSamples.length-1) {
									sampleToDisplay = $scope.filteredRecipeSamples[i+1];
								} else {
									sampleToDisplay = $scope.filteredRecipeSamples[0];
								}
								break;
							}
						}
					} else {
						sampleToDisplay = $scope.filteredRecipeSamples[0];
					}
					if (typeof(sampleToDisplay.id)!=='undefined') {
						$scope.displaySampleFunc(sampleToDisplay);
					}
				}

				/*
				 * keyboard sample insert
				 */

				$scope.insertSampleShortcut = function() {
					if ($scope.isAnySampleDisplayed()) {
						var codeInserted = $scope.insertCodeOnEnterKeyFunc($scope.displayedSample);
						if (codeInserted) {
							$scope.hideSampleAndCloseSelector();
						}
					}
				}
			}
		}
	});

	app.directive("codeSnippetEditorInsertableSample", function($window, WT1) {
	    return {
	    	transclude: true,
	        scope : {
	        	resolveCodeForPreviewFunc : '=',
	            insertCodeFunc : '=',
	            reloadSampleListFunc : '=',

	            displaySampleFunc : '=',
	            hideSampleFunc : '=',
	            isSampleDisplayedFunc : '=',

	            sample : '=',
	            sampleType : '=',
	            saveCategory : '=',
	            mode : '=',
            	insertButtonLabel : '=?'
	        },
	        link : function($scope, element, attrs) {

	            //hiding and showing sample preview and documentation
	            $scope.showSample = function() {
	            	$scope.displaySampleFunc($scope.sample);
	            }
	            $scope.hideSample = function() {
	            	$scope.hideSampleFunc();
	            }

	            //inserting code into editor
	            $scope.insert = function (sample) {
	            	$scope.insertCodeFunc(sample);
	                $scope.hideSample();
	                $scope.$parent.$parent.codeSamplesSelectorVisible = false;
	                WT1.event("insert-snippet", {sampleType : $scope.sampleType, saveCategory : $scope.saveCategory, id : sample.id});
	            }

	            $scope.useMultiLanguageInsert = function() {
	                return $scope.sampleType === 'webapp_standard' || $scope.sampleType === 'webapp_shiny'
	            }

	            //--resolveCodeForPreviewFunc
	        	if (typeof($scope.resolveCodeForPreviewFunc)==='undefined') {
	        		$scope.resolveCodeForPreviewFunc = function(variation) {
				    	return variation.code;
				    };
	        	}
	        },
			templateUrl : '/templates/widgets/code-snippet-editor-insertable-sample.html'
	    }
	});

	/*
	 *  ------------------------- CREATION / EDITION / DELETION -------------------------
	 */

	app.directive('codeSnippetEditorCreateEditModalButton', function(Assert, CreateModalFromTemplate) {
		return {
			scope: {
				sampleType: '=',
				category: '=',
	            sample: '=',
	            template: '=',
	            controller: '=',
	            reloadSampleListFunc: '=',
	            hideSampleFunc:'=',
	            forceMode: '='
			},
			controller: function($scope) {
				Assert.inScope($scope, 'category');
				$scope.MODES = {
					CREATE : 'CREATE',
					EDIT : 'EDIT',
					CREATE_FROM : 'CREATE_FROM'
				};

				if (typeof($scope.sample)==='undefined') {
					$scope.mode = $scope.MODES.CREATE;
				} else if (typeof($scope.forceMode)!=='undefined' && ($scope.forceMode === $scope.MODES.CREATE || $scope.forceMode === $scope.MODES.EDIT || $scope.forceMode === $scope.MODES.CREATE_FROM)) {
					$scope.mode = $scope.forceMode;
				} else if ($scope.sample.origin === 'CUSTOM') {
					$scope.mode = $scope.MODES.EDIT;
				} else {
					$scope.mode = $scope.MODES.CREATE_FROM;
				}

				$scope.displayPopover = function() {
					 CreateModalFromTemplate($scope.template, $scope, $scope.controller, function(newScope) {
						newScope.sampleType = $scope.sampleType;
						newScope.category  = $scope.category;
						newScope.reloadSampleListFunc = $scope.reloadSampleListFunc;
						newScope.mode = $scope.mode;
						if ($scope.mode === $scope.MODES.EDIT || $scope.mode === $scope.MODES.CREATE_FROM) {
							newScope.sample = {};
							angular.copy($scope.sample, newScope.sample);
							if ($scope.mode === $scope.MODES.CREATE_FROM) {
								delete newScope.sample.id;
							}
						}
						//not beautiful : next line is to prevent window click listener to close the code sample preview pannel
						angular.element('.create-sample-form, .modal-backdrop').on('click', function(e) {
							e.stopPropagation();
						});
		            }).then(function() {
		            	$scope.hideSampleFunc();
		            });
				}
			},
			templateUrl : '/templates/widgets/code-snippet-editor-creation-button.html'
		}
	});

	app.controller('CreateEditSampleController', function($scope, Assert, DataikuAPI, ActivityIndicator, $timeout, WT1, CodeMirrorSettingService) {
		Assert.inScope($scope, 'category');

		$scope.multiLanguageSnippet = $scope.sampleType == 'webapp_standard' || $scope.sampleType == 'webapp_shiny';

		if ($scope.mode == 'CREATE') {
			$scope.sample = {
        		variations : [{}],
        		tags : [{name:'custom', color : '#17BECF'}],
        		isShared : true,
        		libraries : []
	        };

			if ($scope.sampleType == 'webapp_standard') {
				$scope.sample.variations = [
				     {
				    	 id:'js',
				    	 title:'Javascript'
				     },
				     {
				    	 id:'html',
				    	 title:'HTML'
				     },
				     {
				    	 id:'css',
				    	 title:'CSS'
				     },
				     {
				    	 id:'py',
				    	 title:'Python'
				     }
				];
			} else if ($scope.sampleType == 'webapp_shiny') {
				$scope.sample.variations = [
				     {
				    	 id:'ui',
				    	 title:'ui'
				     },
				     {
				    	 id:'server',
				    	 title:'server'
				     }
				];
			}
	    }

		$scope.modalTabState = { active : 'code'};

		if ($scope.mode === 'CREATE_FROM') {
			$scope.sample.isShared = true;
		}
		if (typeof($scope.sample.tags)==='undefined') {
			$scope.sample.tags = [];
		}

		$scope.getEditorOptions = function(variation) {
			if (variation && variation.id) {
				return CodeMirrorSettingService.get(computeCodeMirrorMode(variation.id));
			} else {
                return CodeMirrorSettingService.get(computeCodeMirrorMode($scope.sampleType));
			}
		}

	    $scope.addVariation = function() {
	    	var newVariation = {};
	    	$scope.sample.variations.push(newVariation);
	    }

	    $scope.deleteVariation = function(index) {
	    	$scope.sample.variations.splice(index, 1);
	    }

	    $scope.toggleLib = function (lib) {
	    	var idx = $scope.sample.libraries.indexOf(lib);
	    	if (idx==-1) {
	    		$scope.sample.libraries.push(lib);
	    	} else {
	    		$scope.sample.libraries.splice(idx, 1);
	    	}
	    }

	    $scope.hasLib = function (lib) {
	    	return $scope.sample.libraries.indexOf(lib) != -1;
	    }

	    $scope.saveSample = function() {
	    	DataikuAPI.flow.snippets.saveSnippet(JSON.stringify($scope.sample), $scope.sampleType, $scope.category).success(function(data) {
	    		$scope.reloadSampleListFunc();
	    		ActivityIndicator.success("Sample saved!");
	    		$scope.dismiss();
                WT1.event("save-snippet", {sampleType : $scope.sampleType, saveCategory : $scope.saveCategory, id : $scope.sample.id});
	        }).error(setErrorInScope.bind($scope));
	    }
	});

	app.directive('codeSnippetEditorTagManager', function(TaggingService) {
		return {
			scope : {
				sample: '='
			},
			controller: function($scope, $timeout) {

				$scope.isCreatingTag = false;
				$scope.newTag = {};

				$scope.deleteTag = function(tag) {
					for (var i = 0; i<$scope.sample.tags.length; i++) {
						if ($scope.sample.tags[i].name === tag.name) {
							$scope.sample.tags.splice(i, 1);
							break;
						}
					}
				}

				$scope.displayNewTagForm = function() {
					$scope.isCreatingTag = true;
					$scope.newTag = {};
					$timeout(function(){
						$($('.create-sample-zone input')[0]).focus();
					}, 15);
				}

				$scope.hideNewTagForm = function() {
					$scope.isCreatingTag = false;
					$scope.newTag = {};
				}

				$scope.isDuplicatedTag = false;

				$scope.checkDuplicatedTag = function() {
					$scope.isDuplicatedTag = false;
					for (var i = 0; i<$scope.sample.tags.length; i++) {
						if ($scope.sample.tags[i].name === $scope.newTag.name) {
							$scope.isDuplicatedTag = true;
							break;
						}
					}
				}

				$scope.onBlur = function() {
					if (typeof($scope.newTag.name)!=='undefined' && $scope.newTag.name.length!=0 && !$scope.isDuplicatedTag) {
						$scope.createTag();
					}
					$scope.hideNewTagForm();
				}

				$scope.onKeyPressed = function(event) {
					$scope.checkDuplicatedTag();
					if (event.keyCode === 13 && typeof($scope.newTag.name)!=='undefined' && $scope.newTag.name.length!=0 && !$scope.isDuplicatedTag) {
						$scope.createTag();
					} else if (event.keyCode === 8 && (typeof($scope.newTag.name)==='undefined' || $scope.newTag.name.length==0)) {
						$scope.hideNewTagForm();
					}
				}

				$scope.createTag = function() {
					$scope.newTag.color = TaggingService.getDefaultColor($scope.newTag.name);
					$scope.sample.tags.push($scope.newTag);

					$scope.newTag = {};
				}

			},
			templateUrl : '/templates/widgets/code-snippet-editor-tag-manager.html'
		};
	});

	app.directive('codeSnippetEditorDeleteSampleButton', function() {
		return {
			controller : function($scope, DataikuAPI, ActivityIndicator, $rootScope, WT1) {

				$scope.deleteSample = function() {
					DataikuAPI.flow.snippets.deleteSnippet($scope.sample.id, $scope.sampleType).success(function(data) {
			       		$scope.reloadSampleListFunc();
			       		ActivityIndicator.success("Sample deleted !");
                        WT1.event("delete-snippet", {sampleType : $scope.sampleType, saveCategory : $scope.saveCategory, id : $scope.sample.id});
		            }).error(setErrorInScope.bind($rootScope));	//not amazing to give it to rootscope but no elegant way was found to give it to the parent scope of all those nested directives..
		        }

			}
		}
	});

	/*
	 *  ------------------------- FILTERING -------------------------
	 */

	app.directive('codeSnippetEditorQueryBar', function() {
		return {
			controller : function($scope, ListFilter) {

				$scope.query = {q : ""};
				$scope.selectedTags = [];

				//--computing snippetTags and snippetTagsMap by parsing recipeSamples
				var computeTagsList = function () {
					$scope.snippetTags = [];
					$scope.snippetTagsMap = {};
					for (var i = 0; i < $scope.recipeSamples.length; i++) {
	        			var currentSnippet = $scope.recipeSamples[i];
	        			if (typeof(currentSnippet.tags) !== 'undefined' ) {
	        				for (var j = 0; j < currentSnippet.tags.length; j++ ) {
	            				var currentTag = currentSnippet.tags[j];
	            				if (currentTag && typeof($scope.snippetTagsMap[currentTag.name]) === 'undefined') {
	            					$scope.snippetTagsMap[currentTag.name] = currentTag;
	            					$scope.snippetTags.push(currentTag);
	            				}
	            			}
	        			}
	        		}
					// If some tags were deleted we must take them of the selectedTags list
					$scope.selectedTags = [];
				}

				//--filtering samples based on query and selected tags
	        	var updateFiltered = function(){
	        		$scope.filteredRecipeSamples = [];
	                var filteredRecipeSamplesByQuery = ListFilter.filter($scope.recipeSamples, $scope.query.q);
	                for (var j = 0; j<filteredRecipeSamplesByQuery.length; j++) {
	                	var currentSample = filteredRecipeSamplesByQuery[j];
	                	if ($scope.selectedTags.length > 0 && typeof(currentSample.tags)!=='undefined') {
	                		var commonTags = computeIntersection(currentSample.tags, $scope.selectedTags);
	                		if (commonTags.length == $scope.selectedTags.length) {
	                			$scope.filteredRecipeSamples.push(currentSample);
	                		}
	                	} else if ($scope.selectedTags.length == 0) {
	                		$scope.filteredRecipeSamples.push(currentSample);
	                	}
	                }
	            }

	        	//--util to compute intersection bewteen two lists of tags
	        	var computeIntersection = function(tagList1, tagList2) {
	        		var tagMap = {};
	        		var intersection = [];
	        		for (var i in tagList1) {
	        			if (!tagList1[i]) continue;
	        			tagMap[tagList1[i].name] = true;
	        		}
	        		for (var j in tagList2) {
	        			if (!tagList2[j]) continue;
	        			if (tagMap[tagList2[j].name]) {
	        				intersection.push(tagList2[j]);
	        			}
	        		}
	        		return intersection;
	        	}

	        	$scope.switchTag = function(tag) {
	        		var index = $scope.selectedTags.indexOf(tag);
	        		if (index<0) {
	        			$scope.selectedTags.push(tag);
	        		} else {
	        			$scope.selectedTags.splice(index, 1);
	        		}
	        		updateFiltered();
	        	}

	        	$scope.showTagList = false;
	        	$scope.toggleTagList = function() {
	        		$scope.showTagList = !$scope.showTagList;
	        	}

	            //--watching query in order to refilter whenever it changes
	            $scope.$watch("query.q", updateFiltered);
	            $scope.$watch("recipeSamples", function() {
	            	computeTagsList();
	            	updateFiltered();
	            }, true);
			},
			templateUrl : '/templates/widgets/code-snippet-editor-query-bar.html'
		}
	});

})();