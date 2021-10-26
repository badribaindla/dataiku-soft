(function() {
'use strict';

const app = angular.module('dataiku.shaker');


app.directive("shakerWithLibrary", function() {
    return {
        scope:true,
        controller : function($scope, $timeout, $filter, ListFilter, ShakerPopupRegistry) {

            $scope.$on("paneSelected", function(e, pane) {
            	if ($scope.uiState) {
            		$scope.uiState.shakerLeftPane = pane.slug;
            	}
            });

            /* ******************* Processors library management *************** */

            Mousetrap.bind("esc", function() {
                if ($scope.shakerUIState.showProcessorsLibrary &&
                    !$(".library-search-input").is(":focus")) {
                    $scope.shakerUIState.showProcessorsLibrary = false;
                    $scope.$apply();
                }
            });
            $scope.$on("$destroy", function() {Mousetrap.unbind("esc")});

            $scope.displayProcessor = function(p) {
                $scope.shakerUIState.displayedProcessor = p;
            }

            $scope.toggleLibrary = function(show) {
                if (show === undefined) {
                    show = !$scope.shakerUIState.showProcessorsLibrary;
                }
                if (show) {
                    ShakerPopupRegistry.dismissAllAndRegister(function(){$scope.toggleLibrary(false);})
                    setupLibraryPopup();
                }
                $scope.shakerUIState.showProcessorsLibrary = show;
            }

            function setupLibraryPopup() {
                $timeout(function(){$(".library-search-input").focus()}, 0);

                $(".library-search-input").on("keyup", function(e) {
                    if (e.which == 27) {
                        $scope.toggleLibrary();
                        $scope.$apply();
                    }
                });

                $(".library-search-input").off("keyup").on("keyup", function(e) {
                    var s = $scope.shakerUIState.displayedProcessor;
                    var i = -1;

                    if (e.which === 27) {
                        $scope.shakerUIState.showProcessorsLibrary = false;
                        $scope.$apply();
                    }

                    if (s) {
                        i = $scope.filteredProcessors.indexOf(s);
                    }
                    if (e.which == 13 && s) {
                        $scope.toggleLibrary();
                        $scope.addUnconfiguredStep(s.type);
                        e.preventDefault();
                        e.stopPropagation();
                        $scope.$apply();
                        return false;
                    } else if (e.which == 40 && $scope.filteredProcessors.length) {
                        if (i == -1) {
                            i = 0;
                        } else if (i < $scope.filteredProcessors.length - 1) {
                            i++;
                        }
                        $scope.shakerUIState.displayedProcessor = $scope.filteredProcessors[i];
                    } else if (e.which == 38 && $scope.filteredProcessors.length) {
                        if (i >= 1) {
                            i--;
                            $scope.shakerUIState.displayedProcessor = $scope.filteredProcessors[i];
                        }
                    }
                    $scope.$apply();
                });
            }

            $scope.selectTag = function(tag) {
                if (tag.selected) {
                    $scope.processors.tags.forEach(function(x){x.selected=false});
                } else {
                    $scope.processors.tags.forEach(function(x){x.selected=false});
                    tag.selected = true;
                }
                $scope.refreshLibrarySearch();
            }

            $scope.refreshLibrarySearch = function() {
                if (!$scope.processors) return;

                var selectedTags = $scope.processors.tags.filter(function(tag) {
                    return tag.selected;
                }).map(function(tag) {
                    return tag.id;
                });

                $scope.shakerUIState.tagsCount = {};
                var filteredProcessors = ListFilter.filter(
                        angular.copy($scope.processors.processors),
                        $scope.shakerUIState.libraryQuery);

                /* Facet */
                angular.forEach($scope.processors.tags, function(tag) {
                    $scope.shakerUIState.tagsCount[tag.id] = 0;
                    tag.selected = selectedTags.indexOf(tag.id) >= 0;
                });

                /* If we have a query, make a filtered facet */
                if ($scope.shakerUIState.libraryQuery) {
                    angular.forEach(filteredProcessors, function(processor) {
                        angular.forEach(processor.tags, function(tag) {
                            $scope.shakerUIState.tagsCount[tag]++;
                        });
                    })
                } else {
                    angular.forEach($scope.processors.processors, function(processor) {
                        angular.forEach(processor.tags, function(tag) {
                            $scope.shakerUIState.tagsCount[tag]++;
                        });
                    })

                }

                /* Then only, filter on tags */

                if (selectedTags.length) {
                    angular.forEach(selectedTags, function(tag){
                        filteredProcessors = $.grep(filteredProcessors, function(item){
                            return item.tags && item.tags.indexOf(tag) >= 0;
                        })
                    })
                }

                filteredProcessors = $.grep(filteredProcessors, function(i) {
                    return i.displayInLibrary && !i.disabledByAdmin;
                })

                $scope.filteredProcessors = filteredProcessors;

                //Remove displayed processor if it is not in the filtered results
                if ($scope.shakerUIState.displayedProcessor && filteredProcessors.map(function(p){return p.type}).indexOf($scope.shakerUIState.displayedProcessor.type) < 0) {
                    delete $scope.shakerUIState.displayedProcessor;
                }
            };

            Mousetrap.bind("a", function() {
                $scope.toggleLibrary();
                $scope.$apply();
            })
            $scope.$on("$destroy", function() {
                Mousetrap.unbind("a");
            });

            $scope.$watch("shakerUIState.libraryQuery", $scope.refreshLibrarySearch);
            $scope.$watch("processors", function(nv, ov) {
                if (nv) $scope.refreshLibrarySearch();
            });
        }
    }
});


app.directive("shakerWithProcessors", function($rootScope, Assert, CreateModalFromTemplate, ShakerProcessorsInfo, ShakerProcessorsUtils, Logger) {
    return {
        scope: true,
        controller: function($scope, $stateParams, $state, CachedAPICalls, $filter, TableChangePropagator, WT1, $timeout,$q, Fn, openDkuPopin, ClipboardUtils, ActivityIndicator){

            $scope.shakerUIState  = { selectedTags : [] };
            $scope.shakerState.withSteps = true;
            $scope.groupChanged = {justCreated: false, addedStepsTo: null, removedStepsFrom: []};

            // you're going to need them
            CachedAPICalls.processorsLibrary.success(function(processors){
                $scope.processors = processors;
            }).error(setErrorInScope.bind($scope));

            /*
             * Adding Step
             */

            /* When you add a step, the previous ones are not new anymore */
            function clearNewState(){
                function clearNewState_(step) {
                    if (step.$stepState) {
                        step.$stepState.isNew = false;
                        step.$stepState.isNewCopy = false;
                    }
                    if (step.metaType == "GROUP") {
                        step.steps.forEach(clearNewState_);
                    }
                }
                $scope.shaker.steps.forEach(clearNewState_);
            }

            $scope.addStep = function(processor, params, keepClosed, onOpenCallback) {
                clearNewState();
                if (angular.isString(processor)) {
                    processor = $filter('processorByType')($scope.processors, processor)
                }
                $scope.stopPreview(true);
                var step = {
                    type: processor.type,
                    preview: true,
                    params: params
                };
                if (!keepClosed) {
                    $scope.openStep(step, onOpenCallback);
                }
                $scope.shaker.steps.push(step);
            }

            $scope.addStepAndRefresh = function(processor, params, keepClosed) {
                clearNewState();
                $scope.addStep(processor, params, keepClosed);
                $scope.autoSaveForceRefresh();
            }

            $scope.addStepNoPreview = function(processor, params, keepClosed) {
                clearNewState();
                $scope.addStep(processor, params, keepClosed);
                $scope.shaker.steps[$scope.shaker.steps.length-1].preview = false;
            }

            $scope.addStepNoPreviewAndRefresh = function(processor, params, keepClosed) {
                clearNewState();
                $scope.addStep(processor, params, keepClosed);
                $scope.shaker.steps[$scope.shaker.steps.length-1].preview = false;
                $scope.autoSaveForceRefresh();
            }

            $scope.addUnconfiguredStep = function(type, params) {
                clearNewState();
                var processor = $filter('processorByType')($scope.processors, type);
                if (angular.isUndefined(params)) {
                    if (processor.defaultParams) {
                        params = angular.copy(processor.defaultParams);
                    } else {
                        params = {}
                    }
                    angular.forEach(processor.params, function(pparam){
                        if (pparam.defaultValue) {
                            params[pparam.name] = angular.copy(pparam.defaultValue);
                        }
                    });
                }
                $scope.stopPreview(true);

                var step = {
                    type: processor.type,
                    preview: true,
                    isNew : true,
                    params: params,

                    $stepState:  {
                        isNew : true,
                        change: {
                           columnsBeforeStep: $scope.columns
                        }
                    }
                };
                $scope.shaker.steps.push(step);
                $scope.openStep(step);
            }

            $scope.duplicateStep = function(step){
                $scope.disablePreviewOnAllSteps();
                var newStep = angular.copy(step);
                if (typeof(newStep.name)!=='undefined' && newStep.name.length > 0) {
                    var suffix = ' (copy)';
                    if (newStep.name.indexOf(suffix, newStep.name.length - suffix.length) === -1) {
                        newStep.name += ' (copy)';
                    }
                }
                var stepId = $scope.findStepId(step);
                if (stepId.depth == 1) {
                	var group = $scope.shaker.steps[stepId.id];
                	group.steps.splice(stepId.subIndex + 1, 0, newStep);
                } else {
                	$scope.shaker.steps.splice(stepId.id + 1, 0, newStep);
                }
                $scope.currentStep = newStep;
                $scope.autoSaveForceRefresh();
            }

            $scope.appendGroup = function(){
                $scope.stopPreview(true);
                var group = {
                    metaType : "GROUP",
                    steps : []
                }
                $scope.shaker.steps.push(group);
                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
                $scope.groupChanged.justCreated = true;
            }

            //TODO: to remove ?
            $scope.addStepToPrevGroup = function(step){
                var lastGroup = null, stepIdx = -1;
                for (var i = 0; i < $scope.shaker.steps.length; i++) {
                    if ($scope.shaker.steps[i].metaType == 'GROUP') {
                        lastGroup = $scope.shaker.steps[i];
                    }
                    if ($scope.shaker.steps[i] == step) {
                        stepIdx = i;
                        break;
                    }
                }
                if (!lastGroup) {
                    Logger.error("No group before step!");
                } else {
                    lastGroup.steps.push(step);
                    $scope.shaker.steps.splice(stepIdx, 1);
                }
            }

            /*
             * Removing Step
             */

            var removeStepNoRefresh = function(step) {
                //removing step from shaker.steps
                var stepId = $scope.findStepId(step);
                if (typeof(stepId)!=='undefined') {
                    if (stepId.depth == 0) {
                        $scope.shaker.steps.splice(stepId.id, 1);
                    } else if (stepId.depth == 1) {
                        $scope.shaker.steps[stepId.id].steps.splice(stepId.subId, 1);
                    }
                }
            }

            $scope.removeStep = function(step, saveAndRefresh) {
                removeStepNoRefresh(step);
                $scope.autoSaveForceRefresh();
            };


            /*
             * Reordering Steps
             */

            $scope.afterStepMove = function(){
                $scope.stopPreview(true);
                $scope.autoSaveAutoRefresh();
            }

            $scope.treeOptions = {
                dropped: $scope.afterStepMove,
                accept: function(sourceNodeScope, destNodesScope, destIndex) {
                    return destNodesScope.depth() == 0 || sourceNodeScope.$modelValue.metaType != 'GROUP';
                }
            }

            /*
             * Disabling steps
             */

            $scope.toggleDisable = function(step) {
                toggleDisableNoRefresh(step);
                $scope.autoSaveForceRefresh();
            }

            var toggleDisableNoRefresh = function(step) {
                step.disabled = !step.disabled;
                onDisableChange(step);
            }

            var enableStepNoRefresh = function(step) {
                step.disabled = false;
                onDisableChange(step);
            }

            var disableStepNoRefresh = function(step) {
                step.disabled = true;
                onDisableChange(step);
            }

            $scope.isAllStepsDisabled = function() {
            	return typeof($scope.shaker) === 'undefined' || typeof($scope.shaker.steps) === 'undefined' ||  isAllStepsInArrayDisabled($scope.shaker.steps);
            }

            var isAllStepsInArrayDisabled = function(steps) {
    			for (var id = 0; id < steps.length; id ++) {
    				var step = steps[id];
            		if (!step.disabled) {
            			return false;
            		}
            		if (step.metaType == 'GROUP') {
            			if (!isAllStepsInArrayDisabled(step.steps)) {
            				return false;
            			}
            		}
    			}
    			return true;
            }

            var onDisableChange = function(step) {
                if (step.disabled) {
                    /* This step was enabled, also disable preview on it */
                    step.preview = false;
                    //if it's a group all nested processor are disabled too
                    if (step.metaType == 'GROUP') {
                        for (var i = 0; i<step.steps.length; i++) {
                            step.steps[i].disabled = true;
                            step.steps[i].preview = false;
                        }
                    }
                } else {
                    if (step.metaType == 'GROUP') {
                        for (var i = 0; i<step.steps.length; i++) {
                            step.steps[i].disabled = false;
                        }
                    } else {
                        var stepId = $scope.findStepId(step);
                        if (stepId.depth == 1) {
                            $scope.shaker.steps[stepId.id].disabled = false;
                        }
                    }
                }
            }

            /*
             * Previewing steps
             */

            $scope.togglePreview = function(step) {
                if (step.preview) {
                    /* Disable preview : disable it everywhere */
                    $scope.stopPreview(true);
                } else {
                    $scope.stopPreview(true);

                    /* Enable it here */
                    step.preview = true;
                    /* And mark further steps as softdisabled */
                    $scope.markSoftDisabled();
                }
                $scope.autoSaveForceRefresh();
            }

            $scope.stopPreview = function(norefresh){
                function _disablePreviewOnStep(s) {
                    if (s.metaType == "GROUP") {
                        if (s.steps) {
                            s.steps.forEach(_disablePreviewOnStep);
                        }
                        s.preview = false;
                        if (s.$stepState) s.$stepState.softDisabled=false;
                    } else {
                        s.preview = false;
                        if (s.$stepState) s.$stepState.softDisabled=false;
                    }
                }
                /* Disable preview everywhere */
                $scope.shaker.steps.forEach(_disablePreviewOnStep);

                $scope.stepBeingPreviewed = null;

                if (!norefresh){
                    $scope.autoSaveForceRefresh();
                }
            }

            $scope.computeExtraCoachmarksSerieIds = function() {
                $scope.extraCoachmarksSerieIds = [];

                if ($scope.stepBeingPreviewed && ($scope.topNav.tab == 'code' || $scope.topNav.tab == 'script')) {
                    $scope.extraCoachmarksSerieIds.push("shaker-eye");
                }

                if ($scope.shakerState.isInAnalysis) {
                    $scope.extraCoachmarksSerieIds.push("analysis-deploy");
                }
                else {
                    $scope.extraCoachmarksSerieIds.push("shaker-run");
                  }
            };
            $scope.$watch("stepBeingPreviewed", $scope.computeExtraCoachmarksSerieIds);
            $scope.$watch("topNav.tab", $scope.computeExtraCoachmarksSerieIds);
            $scope.computeExtraCoachmarksSerieIds();


            $scope.getStepBeingPreviewedDescription =function(){
                Assert.inScope($scope, 'stepBeingPreviewed');

                var processor = {
                    enDescription : "UNKNOWN"
                }
                if ($scope.stepBeingPreviewed.metaType == "GROUP") {
                    return $scope.getGroupName($scope.stepBeingPreviewed);
                } else {
                    return ShakerProcessorsUtils.getStepDescription(processor, $scope.stepBeingPreviewed.type, $scope.stepBeingPreviewed.params);
                }
            }
            $scope.getStepBeingPreviewedImpactVerb =function(){
                Assert.inScope($scope, 'stepBeingPreviewed');
                return ShakerProcessorsUtils.getStepImpactVerb($scope.stepBeingPreviewed.type, $scope.stepBeingPreviewed.params);
            }

            $scope.disablePreviewOnAllSteps = function() {
                for (var i = 0; i < $scope.shaker.steps.length; i++) {
                    $scope.shaker.steps[i].preview = false;
                    if ($scope.shaker.steps[i].metaType == 'GROUP' && $scope.shaker.steps[i].steps && $scope.shaker.steps[i].length > 0) {
                        for (var j=0; j<$scope.shaker.steps[i].steps.length; j++) {
                            $scope.shaker.steps[i].steps[j].preview = false;
                        }
                    }
                }
            }

            /*
             * Copy/Paste steps
             */
            let copyType = 'shaker-steps';

            function sanitizeSteps(data) {
                let steps = data;
                // ensure steps are in order they appear in the shaker
                // list so order is preserved when pasting
                steps = sortSteps(steps);
                // if selecting a group, ensure that the substeps
                // aren't included twice in the data
                steps = removeExtraChildren(steps);

                return steps;
            }

            /*
                Copy JSON of steps to clipboard
            */
            $scope.copyData = function(data) {
                let copy = {
                    "type": copyType,
                    "version": $scope.appConfig.version.product_version,
                    "steps": sanitizeSteps(data)
                };

                // this removes all instances of the keys, including substeps
                const dataStr = JSON.stringify(copy, (key, value) => {
                    let keysToRemove = ['$$hashKey', '$stepState', '$translatability'];

                    return keysToRemove.includes(key) ? undefined : value;
                }, 2);
                const stepCount = $scope.getNumberOfSteps(copy.steps);
                const plural = stepCount > 1 ? 's' : '';

                ClipboardUtils.copyToClipboard(dataStr, `Copied ${stepCount} step${plural} to clipboard.`);
            }

            // steps: list of existing steps describing where
            // to insert the new steps
            $scope.openPasteModalFromStep = function(steps) {
                let newScope = $scope.$new();
                // ensure existing steps are in the correct order so
                // we know where to insert the pasted steps
                steps = sortSteps(steps);
                $scope.insertAfter = steps[steps.length - 1];

                CreateModalFromTemplate("/templates/shaker/paste-steps-modal.html", newScope, 'PasteModalController', function(modalScope) {
                    modalScope.copyType = copyType;
                    modalScope.formatData = $scope.formatStepData;
                    modalScope.itemKey = 'steps';
                    modalScope.pasteItems = $scope.pasteSteps;
                });
            };

            $scope.formatStepData = function(steps) {
                if ($scope.insertAfter) {
                    const stepId = $scope.findStepId($scope.insertAfter);
                    
                    if (stepId.depth === 1) {
                        // flatten any groups so we don't have groups within groups
                        steps = steps.reduce((acc, c) => acc.concat(c.metaType === 'GROUP' ? c.steps : c), []);
                    }
                }

                steps.forEach(_ => {
                    const name = _.name;
                    if (typeof name !== 'undefined' && name.length > 0) {
                        const suffix = ' (copy)';
                        if (name.indexOf(suffix, name.length - suffix.length) === -1) {
                            _.name += ' (copy)';
                        }
                    }

                    _.$stepState = _.$stepState || {
                        isNewCopy: true
                    };
                    _.selected = true;
                    _.preview = false;
                });

                return steps;
            };

            $scope.pasteSteps = function(steps) {
                let insertAt = $scope.shaker.steps.length;
                let addTo = $scope.shaker.steps;
                
                if ($scope.insertAfter) {
                    const stepId = $scope.findStepId($scope.insertAfter);
                    insertAt = stepId.id + 1;

                    if (stepId.depth === 1) {
                        insertAt = stepId.subId + 1;
                        addTo = $scope.shaker.steps[stepId.id].steps;
                    }
                }

                if (steps && steps.length) {
                    $scope.pasting = true;
                    $scope.stopPreview();
                    $scope.unselectSteps();
                    clearNewState();

                    addTo.splice(insertAt, 0, ...steps);
                    
                    const stepCount = steps.length;
                    const stepText = stepCount + ' step' + stepCount > 1 ? 's' : '';
                    ActivityIndicator.success(`Pasted ${stepText} successfully.`, 5000);
                    
                    $scope.autoSaveAutoRefresh();
                    $scope.insertAfter = null;

                    $timeout(() => $scope.pasting = false);
                }
            };

            /*
                Called when user uses ctrl + v from within
                the shaker step list (not in the modal)

                Immediately show preview modal since we've already pasted
            */
            $scope.openPasteModalFromKeydown = function(data) {
                try {
                    data = JSON.parse(data);
                } catch(e) {}

                if (data && data.steps && data.steps.length && data.type === copyType) {
                    CreateModalFromTemplate("/templates/shaker/paste-steps-modal.html", $scope, 'PasteModalController', function(modalScope) {
                        modalScope.uiState.editMode = false;
                        modalScope.uiState.items = data.steps;
                        modalScope.uiState.type = data.type;
                        modalScope.pasteItems = $scope.pasteSteps;
                    });
                }
            }

            /*
                Called when user uses ctrl + c from within
                the shaker step list (not in the modal)
            */
            $scope.keydownCopy = function(event) {
                let selectedSteps = $scope.getSelectedSteps();
                        
                if (selectedSteps.length) {
                    $scope.copyData(selectedSteps);
                }
                
                event.currentTarget.focus();
            }

            /*
             * Displaying info to user
             */

            $scope.getGroupName = function(step) {
                if (step.metaType == 'GROUP') {
                    return step.name && step.name.length>0 ? step.name : 'GROUP ' + $scope.findGroupIndex(step);
                }
            }

            $scope.getScriptDesc = function() {
                var nbSteps = $scope.shaker && $scope.shaker.steps ? $scope.shaker.steps.length : 0;
                if (nbSteps == 0) {
                    return 'no step';
                } else if (nbSteps == 1) {
                    return '<strong>1</strong> step';
                } else {
                    return '<strong>' + nbSteps + '</strong> steps';
                }
            };

            $scope.isStepInWarning = function(step) {
                return step.$stepState.change && step.$stepState.change.messages && step.$stepState.change.messages.length > 0;
            };

            $scope.getWarningMessage = function(step) {
                var message = "";
                if (step.metaType == "GROUP") {
                    var warningList = "";
                    step.$stepState.change.messages.forEach(function(e) {
                        if (warningList.indexOf(e.title) == -1) {
                            if (warningList.length > 0) {
                                warningList +=", ";
                            }
                            warningList +="<b>" + e.title + "</b>";
                        }
                    });
                    message = "<h5>" + "Inner warning(s)" + "</h5>" + "<p>" + "Some inner step(s) have warning(s) (" + warningList + "), open group for more information." + "</p>";
                } else {
                    step.$stepState.change.messages.forEach(function(m) {
                        message += "<h5>" + m.title + "</h5>" + "<p>" + m.details + "</p>";
                    });
                }
                return message;
            }

            /*
             * Group Utils: used to situate a step is the steps tree
             */

            // Given a step object, returns its id in the script or undefined if it not in the list.
            // N.B.: the function is 'public' because the formula processors need it to send the position of the
            // step they're validating to the backend.
            $scope.findStepId = function(step) {
                var steps = $scope.shaker.steps;
                for (var stepId=0; stepId <steps.length; stepId++) {
                    if (steps[stepId] === step) {
                        return {'id':stepId, 'subId':undefined, 'depth':0};
                    }
                    if (steps[stepId].metaType == "GROUP") {
                        for (var subStepId=0; subStepId<steps[stepId].steps.length; subStepId++) {
                            var subStep = steps[stepId].steps[subStepId];
                            if (step == subStep) {
                                return {'id':stepId, 'subId':subStepId, 'depth':1};
                            }
                        }
                    }
                }
                return undefined;
            };

            $scope.findStepFlattenIndex = function(step) {
                let counter = 0;
                
                var findStepFlattenIndexInArray = function(arr, step) {
                    for (var i = 0; i<arr.length; i++) {
                        var currStep = arr[i];
                        if (currStep==step) {
                            return counter;
                        } else {
                            counter++;
                            if (currStep.metaType == 'GROUP') {
                                var recRet = findStepFlattenIndexInArray(currStep.steps, step);
                                if (recRet != -1) {
                                    return recRet;
                                }
                            }
                        }
                    }
                    return -1;
                }
                return findStepFlattenIndexInArray($scope.shaker.steps, step);
            }

            $scope.recursiveStepsFilter = function(filteringProp) {
                var recursiveStepsFilterInArray = function(arr, filteringProp) {
                    var filteredList = arr.filter(Fn.prop(filteringProp));
                    var groups = arr.filter(function(s) { return s.metaType === 'GROUP'; })
                    for (var i = 0; i < groups.length; i++) {
                        filteredList = filteredList.concat(recursiveStepsFilterInArray(groups[i].steps, filteringProp));
                    }
                    return filteredList;
                }
                return recursiveStepsFilterInArray($scope.shaker.steps, filteringProp);
            }

            $scope.findGroupIndex = null;
            $scope.$watch('shaker.steps', function(nv, ov) {
                if (nv) {
                    var tmpFindGroupIndex = Array.prototype.indexOf.bind($scope.shaker.steps.filter(function(s) { return s.metaType === 'GROUP'; }));
                    $scope.findGroupIndex = function(step) {
                        const groupIndex = tmpFindGroupIndex(step);
                        return groupIndex < 0 ? '' : groupIndex + 1;
                    }
                }
            }, true);

            var isGroupFatherOfStep = function (group, step) {
                if (group.metaType != 'GROUP' || group.steps.length == 0 || step.metaType != 'PROCESSOR') {
                    return false;
                }
                for (var subId = 0; subId < group.steps.length; subId++) {
                    if (group.steps[subId] == step) {
                        return true;
                    }
                }
                return false;
            }

            // when selecting a group, if its children are also selected, make sure they aren't in both
            // the group's steps and in the main steps
            function removeExtraChildren(steps) {
                steps = angular.copy(steps);

                let groups = steps.filter(_ => _.metaType === 'GROUP');
              
                groups.forEach(group => {
                    const stepCount = group.steps.length;
                    const intersection = steps.filter(step => group.steps.indexOf(step) !== -1);

                    // if some substeps but not all are selected, only keep those
                    if (intersection.length && intersection.length !== stepCount) {
                        group.steps = intersection;
                    }
                });

                // if any group already includes the step, remove it
                return steps.filter(step => !groups.some(group => group.steps.includes(step)));
            }

            /*
                A group counts as 1 step, regardless if its children
                are selected or not
            */
            $scope.getNumberOfSteps = function(steps) {
                steps = removeExtraChildren(steps);
                const groups = steps.filter(_ => _.metaType === 'GROUP' && _.steps && _.steps.length);

                // don't include the group itself in the step count (but include its children)
                return groups.reduce((acc, _) => acc + _.steps.length, steps.length - groups.length);
            }
            
            // returns a sorted subset of steps based on the entire set of shaker steps
            function sortSteps(steps) {
                let indices = steps.map(_ => $scope.findStepFlattenIndex(_));

                return indices
                    .map((_, i) => i) // create array of numbers from 0 to steps.length
                    .sort((a, b) => indices[a] - indices[b]) // sort indices array 
                    .map(_ => steps[_]); // sort steps based on the indices
            }

            /*
             * Selecting
             */

            $scope.openStep = function(step, onOpenCallback) {
                $scope.currentStep = step;
                window.setTimeout(function() {
                	if (onOpenCallback && typeof(onOpenCallback) == "function") {
                		onOpenCallback(step);
                	} else {
                		$("ul.steps").find("div.active input[type='text']").first().focus();
                	}
                }, 0);
            }

            $scope.toggleStep = function(step) {
                if ($scope.currentStep != step) {
                    $scope.openStep(step);
                } else {
                    $scope.currentStep = null;
                }
            }

            $scope.toggleStepSelection = function(step, $event) {
                if (typeof $scope.activeShakerMenu === 'function') {
                    $scope.activeShakerMenu();
                }

                var selectedSteps = $scope.getSelectedSteps();
                if ($event.shiftKey && selectedSteps.length > 0) {
                    var range1 = getRangeStep(step, selectedSteps[0]);
                    var range2 = getRangeStep(step, selectedSteps[selectedSteps.length-1]);
                    var isAllStepInRange1Selected = range1.filter(Fn.prop('selected')).length == range1.length;
                    var isAllStepInRange2Selected = range2.filter(Fn.prop('selected')).length == range2.length;
                    var rangeToSelect;
                    if (isAllStepInRange1Selected && isAllStepInRange2Selected) {
                        rangeToSelect = range2.length < range1.length ? range2 : range1;
                        for (var i = 0; i<rangeToSelect.length; i++) {
                            rangeToSelect[i].selected = false;
                        }
                        step.selected = true;
                    } else {
                        rangeToSelect = range2.length > range1.length ? range2 : range1;
                        $scope.unselectSteps();
                        for (var i = 0; i<rangeToSelect.length; i++) {
                            rangeToSelect[i].selected = true;
                        }
                    }
                } else {
                    step.selected = !step.selected;
                    if (!step.selected && step.metaType == "GROUP") {
                        // unselecting a group => unselect its contents as well, otherwise you could not notice they're still selected (if the group is folded)
                        // in the other direction (selecting) it's fine
                        step.steps.forEach(function(subStep) {subStep.selected = false;});
                    }
                }
            }

            var getRangeStep = function(fromStep, toStep) {
                //Return next step in group, null if stepId is the last step in group
                var getNextStepInGroup = function(stepId, group) {
                    return stepId.depth!=0 && stepId.subId < group.steps.length - 1 ? group.steps[stepId.subId+1] : null;
                }
                //Return next step in level 0, null if stepId is last the last step in level 0
                var getNextStep = function(stepId) {
                    return stepId.depth==0 && stepId.id < $scope.shaker.steps.length - 1 ? $scope.shaker.steps[stepId.id + 1] : null;
                }
                // Return the next visual step
                var getNextStepMultipleLevel = function(step) {
                    var stepId = $scope.findStepId(step);
                    if (stepId.depth == 1) {
                        var group = $scope.shaker.steps[stepId.id];
                        return getNextStepInGroup(stepId, group)!=null ? getNextStepInGroup(stepId, group) : getNextStep({depth: 0, id : stepId.id, subId : undefined});
                    } else {
                        if (step.metaType != "GROUP") {
                            return getNextStep(stepId);
                        } else {
                            if (step.steps.length > 0) {
                                return step.steps[0];
                            } else {
                                return getNextStep(stepId);
                            }
                        }
                    }
                }
                // Returns range of step between toSteps and fromSteps included. fromStep must be before toStep (ie: fromStep's id must be inferior to toStep's id)
                // Returns null if toStep was never found while iterating (ie: toStep does not exist or toStep is before fromStep)
                var getRange = function(fromStep, toStep) {
                   var range = [];
                   var nextStep = fromStep;
                   while (nextStep!=toStep && nextStep!=null) {
                       range.push(nextStep);
                       nextStep = getNextStepMultipleLevel(nextStep);
                   }
                   range.push(nextStep);
                   return nextStep ? range : null;
                }
                // compare fromStep's id and toStep's id and call getRange
                var c = compareStepId($scope.findStepId(fromStep), $scope.findStepId(toStep));
                if (c == 0) {
                    return [fromStep];
                } else if (c < 0 ) {
                    return getRange(fromStep, toStep);
                }  else {
                    return getRange(toStep, fromStep);
                }
            }

            var compareStepId = function(stepId1, stepId2) {
                if (stepId1.id != stepId2.id) {
                    return stepId1.id > stepId2.id ? 1 : -1;
                }
                var subId1 = typeof(stepId1.subId)!=='undefined' ? stepId1.subId : -1;
                var subId2 = typeof(stepId2.subId)!=='undefined' ? stepId2.subId : -1;
                if (subId1 == subId2) {
                    return 0;
                }
                return subId1 > subId2 ? 1 : -1;
            }

            /*
             * Search
             */
            $scope.query = {'val' : ''};

            $scope.searchSteps = function() {

                var searchStepArray = function(arr, processors, query) {
                    query = query.toLowerCase();
                    for (var id = 0; id < arr.length; id ++) {
                        var step = arr[id];
                        var str;
                        if (step.metaType == 'GROUP') {
                            str = $scope.getGroupName(step);
                            searchStepArray(step.steps, processors, query);
                        } else {
                            str = $scope.getStepDescription(step, processors);
                        }
                        str = str.toLowerCase();
                        if (str.indexOf(query)!=-1) {
                            step.match = true;
                        } else {
                            step.match = false;
                        }
                    }
                }

                var removeCloseOnMatchFlag = function() {
                    var stepsToUnflag = $scope.recursiveStepsFilter('closeOnMatch');
                    stepsToUnflag.forEach(function(el) {
                       delete el.closeOnMatch;
                    });
                }

                removeCloseOnMatchFlag();
                var query = $scope.query.val;
                if (query.length > 0) {
                    searchStepArray($scope.shaker.steps, $scope.processors, query);
                    var matchs = $scope.recursiveStepsFilter('match');
                    if (matchs.length > 0) {
                        var firstMatch = matchs[0];
                        var firstMatchDomIndex = $scope.findStepFlattenIndex(firstMatch);
                        $('.processor')[firstMatchDomIndex].scrollIntoView();
                    }
                } else {
                    $scope.unmatchSteps();
                }
            }

            $scope.getStepDescription = function(step, processors) {
                var processor = $filter('processorByType')($scope.processors, step.type);
                return ShakerProcessorsUtils.getStepDescription(processor, step.type, step.params);
            }

            $scope.unmatchSteps = function() {
                var unmatchStepsArray = function(arr) {
                    for (var id = 0; id < arr.length; id++) {
                        var step = arr[id];
                        step.match = false;
                        if (step.metaType == 'GROUP') {
                            unmatchStepsArray(step.steps);
                        }
                    }
                }
                unmatchStepsArray($scope.shaker.steps);
            };

            /*
             * Selecting
             */
            $scope.getSelectedSteps = function() {
                return $scope.recursiveStepsFilter('selected');
            }

            $scope.isAllStepsSelected = function() {
                var isAllStepsSelectedInArray = function(arr) {
                    for (var i=0; i<arr.length; i++) {
                        var step = arr[i];
                        if (!step.selected) {
                            return false;
                        }
                        if (step.metaType == "GROUP" && !isAllStepsSelectedInArray(step.steps)) {
                            return false;
                        }
                    }
                    return true;
                }
                return typeof($scope.shaker) !== 'undefined' && isAllStepsSelectedInArray($scope.shaker.steps);
            }

            $scope.isNoStepSelected = function() {
                var isNoStepSelectedInArray = function(arr) {
                    for (var i=0; i<arr.length; i++) {
                        var step = arr[i];
                        if (step.selected) {
                            return false;
                        }
                        if (step.metaType == "GROUP" && !isNoStepSelectedInArray(step.steps)) {
                            return false;
                        }
                    }
                    return true;
                }
                return typeof($scope.shaker) !== 'undefined' && isNoStepSelectedInArray($scope.shaker.steps);
            }

            $scope.selectAllSteps = function() {
                // on initial selection, only select steps currently filtered by search box
                const steps = $scope.recursiveStepsFilter('match').length && $scope.isNoStepSelected() ? $scope.recursiveStepsFilter('match') : $scope.shaker.steps;
                const selectAllStepsInArray = function(arr) {
                    for (var i=0; i<arr.length; i++) {
                        var step = arr[i];
                        step.selected = true;
                        if (step.metaType == "GROUP") {
                            selectAllStepsInArray(step.steps);
                        }
                    }
                }
                selectAllStepsInArray(steps);
            }

            $scope.unselectSteps = function() {
                var unselectStepsInArray = function(arr) {
                    for (var i=0; i<arr.length; i++) {
                        var step = arr[i];
                        step.selected = false;
                        if (step.metaType == "GROUP") {
                            unselectStepsInArray(step.steps);
                        }
                    }
                }
                unselectStepsInArray($scope.shaker.steps);
            }

            /*
             * Grouping
             */
            $scope.canGroupSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                for (var i = 0; i < selectedSteps.length; i++) {
                    var step = selectedSteps[i];
                    if (step.metaType == 'GROUP' || $scope.findStepId(step).depth == 1) {
                        return false;
                    }
                }
                return selectedSteps.length > 1;
            }

            /*
             * Add to an existing group
             * 
             * Optional to pass a list of steps, otherwise just use what is selected
             */
            $scope.canAddMoreStepsToGroup = function(steps) {
                for (var i = 0; i < steps.length; i++) {
                    var step = steps[i];
                    if (step.metaType == 'GROUP') {
                        return false;
                    }
                }

                return steps.length && $scope.shaker.steps.filter(function(s) { return s.metaType === 'GROUP'; }).length;
            }

            $scope.addMoreStepsToGroup = function(group, steps) {                
                if ($scope.canAddMoreStepsToGroup(steps)) {
                    const newSteps = steps.map(_ => {
                        _.selected = false
                        return _;
                    });                    
                    
                    //removing steps to be grouped from shaker's steps list
                    const removedGroups = [...new Set(steps.map(_ => $scope.findStepId(_)).map(_ => $scope.shaker.steps[_.id]))]
                    $scope.groupChanged.removedStepsFrom = removedGroups;
                    steps.forEach((_) => removeStepNoRefresh(_));

                    group.steps = group.steps.concat(newSteps);
                    $scope.groupChanged.addedStepsTo = group;

                    $scope.autoSaveForceRefresh();
                }
            };

            $scope.groupSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                if ($scope.canGroupSelectedSteps()) {
                    // creating group
                    var group = {
                        metaType : "GROUP",
                        steps : []
                    }
                    //prepopulating its steps list in some extra array
                    var groupSteps = [];
                    for (var i = 0; i<selectedSteps.length; i++) {
                        var step = selectedSteps[i];
                        step.selected = false;
                        groupSteps.push(step);
                    }
                    //placing it in shaker's steps list
                    var groupId = $scope.findStepId(selectedSteps[0]).id;
                    $scope.shaker.steps[groupId] = group;
                    //removing steps to be grouped from shaker's steps list
                    for (var i = 0; i<selectedSteps.length; i++) {
                        var step = selectedSteps[i];
                        removeStepNoRefresh(step);
                    }
                    //finally setting new group's steps list
                    group.steps = groupSteps;
                    //saving
                    $scope.autoSaveForceRefresh();
                    $scope.groupChanged.justCreated = true;
                }
            }

            $scope.canUngroupSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                for (var i = 0; i < selectedSteps.length; i++) {
                    var step = selectedSteps[i];
                    if (step.metaType != 'GROUP' && $scope.findStepId(step).depth == 0) {
                        return false;
                    }
                }
                return selectedSteps.length > 0;
            }

            $scope.ungroupSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                var selectedProcessors = selectedSteps.filter(function(el) {
                    return el.metaType != 'GROUP';
                });
                var selectedGroups = selectedSteps.filter(function(el) {
                    return el.metaType == 'GROUP';
                });
                var unpopedGroups = [];
                for (var i=0; i<selectedProcessors.length; i++) {
                    var step = selectedProcessors[i];
                    var stepId = $scope.findStepId(step);
                    var group = $scope.shaker.steps[stepId.id];
                    //is step is not among list of groups to ungroup we take it out of its group
                    if (selectedGroups.indexOf(group)==-1) {
                        group.steps.splice(stepId.subId, 1);
                        $scope.shaker.steps.splice(stepId.id,0,step);
                        //later we'll check if the group the current step used to belong to is now empty
                        if (unpopedGroups.indexOf(group)==-1) {
                            unpopedGroups.push(group);
                        }
                    }
                }
                //going through all groups unpopulated during previous loop and deleting theme if empty
                for (var i=0; i<unpopedGroups.length; i++) {
                    var group = unpopedGroups[i];
                    if (group.steps.length == 0) {
                        var id = $scope.shaker.steps.indexOf(group);
                        $scope.shaker.steps.splice(id, 1);
                    }
                }
                for (var i = 0; i < selectedGroups.length; i++) {
                    $scope.ungroup(selectedGroups[i], true);
                }
                $scope.autoSaveForceRefresh();
            }

            /*
             * Deletes a group and puts all its steps at its previous index in the same order they used to be in the group
             */
            $scope.ungroup = function(step, noRefresh) {
                if (step.metaType == "GROUP") {
                    var groupIndex = $scope.findStepId(step).id;
                    var spliceArgs = [groupIndex, 1].concat(step.steps);
                    Array.prototype.splice.apply($scope.shaker.steps, spliceArgs);
                    if (!noRefresh) {
                        $scope.autoSaveForceRefresh();
                    }
                }
            }

            /*
             * Disabling
             */
            $scope.toggleDisableSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                var allStepsDisabled = true;
                for (var i = 0; i<selectedSteps.length; i++) {
                    if (!selectedSteps[i].disabled) {
                        allStepsDisabled = false;
                        break;
                    }
                }
                for (var i = 0; i<selectedSteps.length; i++) {
                    if (allStepsDisabled) {
                        enableStepNoRefresh(selectedSteps[i]);
                    } else {
                        disableStepNoRefresh(selectedSteps[i]);
                    }
                }
                $scope.autoSaveForceRefresh();
            }

            /*
             * Deleting
             */
            var inModal = false;
            $scope.deleteSelectedSteps = function(evt) {
                // Delete selected steps, or all if
                // no step is selected.
                if (inModal)
                    return;
                if (evt.type=="keydown") {
                    var $focusedEl = $("input:focus, textarea:focus");
                    if ($focusedEl.length > 0) {
                        return;
                    }
                }

                // TODO prompt the user here.
                var stepsToDelete = $scope.getSelectedSteps();
                if (stepsToDelete.length == 0) {
                    stepsToDelete = $scope.shaker.steps;
                }
                if (stepsToDelete.length > 0) {
                    stepsToDelete = stepsToDelete.slice(0);
                    var dialogScope = $scope.$new();
                    dialogScope.stepsToDelete = stepsToDelete;
                    dialogScope.cancel = function() {
                        inModal = false;
                    }
                    dialogScope.perform = function() {
                        inModal = false;
                        for (var i=0; i<stepsToDelete.length; i++) {
                            var step = stepsToDelete[i];
                            removeStepNoRefresh(step);
                        }
                        $scope.autoSaveForceRefresh();
                    }
                    inModal = true;
                    CreateModalFromTemplate("/templates/widgets/delete-step-dialog.html", dialogScope);
                }
            }


            $scope.remove = function(step) {
                $('.processor-help-popover').popover('hide');//hide any displayed help window
                $scope.removeStep(step.step);
            };

            /*
             * Coloring
             */
            $scope.uncolorStep = function(step) {
                delete step.mainColor;
                delete step.secondaryColor;

                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }

            $scope.colorStep = function(step, main, secondary) {
                step.mainColor = main;
                step.secondaryColor = secondary;

                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }

            $scope.uncolorSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                for (var i = 0; i<selectedSteps.length; i++) {
                    var step = selectedSteps[i];
                    delete step.mainColor;
                    delete step.secondaryColor;
                }
                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }

            $scope.colorSelectedSteps = function(main, secondary) {
                var selectedSteps = $scope.getSelectedSteps();
                for (var i = 0; i<selectedSteps.length; i++) {
                    var step = selectedSteps[i];
                    step.mainColor = main;
                    step.secondaryColor = secondary;
                }
                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }

            /*
             * Validating scipt
             */

            /**
             * Performs JS validation of the whole script.
             * Sets frontError on all invalid steps.
             *
             * Returns true if script is ok, false if script is NOK
             */
            $scope.validateScript = function() {
                var nbBadProc = 0;
                function validateProcessor(proc) {
                    if (!proc.$stepState) proc.$stepState = {}
                    proc.$stepState.frontError = $scope.validateStep(proc);
                    if (proc.$stepState.frontError) {
                        ++nbBadProc;
                    }
                }
                $scope.shaker.steps.forEach(function(step) {
                    if (step.metaType == "GROUP") {
                        step.steps.forEach(validateProcessor);
                    } else {
                        validateProcessor(step);
                    }
                });
                if (nbBadProc > 0) {
                    return false;
                } else {
                    return true;
                }
            }


            /* Perform JS validation of the step. Does not set frontError */
            $scope.validateStep = function(step) {
                if (step.metaType == "GROUP") {
                    if (step.steps != null) {
                        for (var i = 0; i < step.steps; i++) {
                            var subvalidationResult = $scope.validateStep(step.steps[i]);
                            if (subvalidationResult) return subvalidationResult;
                        }
                    }
                } else {
                    var processorType = $filter('processorByType')($scope.processors, step.type);
                    /* If we have some stepParams, then check using them */
                    if (processorType.params) {
                        for (var paramIdx in processorType.params) {
                            var param = processorType.params[paramIdx];
                            var value = step.params[param.name];
                            if (param.mandatory && !param.canBeEmpty && (value == null || value.length === 0)) {
                                return new StepIAE("Missing parameter: " + (param.label || param.name));
                            }
                        }
                    }
                    /* Then also play the specific validation of each step */
                    if (ShakerProcessorsInfo.get(step.type).checkValid){
                        try {
                            ShakerProcessorsInfo.get(step.type).checkValid(step.params);
                        } catch (e) {
                            return e;
                        }
                    }
                }
                return null;
            };

            /*
             * Factorising script steps
             */

            $scope.mergeLastColumnDeleters = function() {
                var deletedColumns = [];
                var deletedFromIndex = $scope.shaker.steps.length;
                for(var i = $scope.shaker.steps.length-1 ; i >= 0; i--) {
                    var step = $scope.shaker.steps[i];
                    if(step.type=='ColumnsSelector' && (step.params.appliesTo === "SINGLE_COLUMN" || step.params.appliesTo === "COLUMNS") && (step.params.keep=="false" || step.params.keep==false)) {
                        deletedColumns = deletedColumns.concat(step.params.columns);
                        deletedFromIndex = i;
                    } else {
                        break;
                    }
                }

                if(deletedColumns.length>0 && deletedFromIndex != $scope.shaker.steps.length) {
                    $scope.shaker.steps.splice(deletedFromIndex,$scope.shaker.steps.length-deletedFromIndex);
                    $scope.addStepNoPreview("ColumnsSelector", {
                        "appliesTo": deletedColumns.length > 1 ? "COLUMNS" : "SINGLE_COLUMN",
                        "keep": false,
                        "columns": deletedColumns
                    });
                }
            }

            $scope.mergeLastColumnRenamers = function() {
                var renamedColumns = [];
                var renamedFromIndex = $scope.shaker.steps.length;
                for(var i = $scope.shaker.steps.length-1 ; i >= 0; i--) {
                    var step = $scope.shaker.steps[i];
                    if(step.type=='ColumnRenamer') {
                        renamedColumns = step.params.renamings.concat(renamedColumns);
                        renamedFromIndex = i;
                    } else {
                        break;
                    }
                }

                if(renamedColumns.length>0 && renamedFromIndex != $scope.shaker.steps.length) {
                    $scope.shaker.steps.splice(renamedFromIndex,$scope.shaker.steps.length-renamedFromIndex);
                    $scope.addStepNoPreview("ColumnRenamer", {
                        "renamings": renamedColumns
                    });
                }
            }

            $scope.mergeLastColumnReorders = function() {
                // We'll only look at the last step and the step before...
                let stepCount = $scope.shaker.steps.length;
                if (stepCount < 2) {
                    return;
                }
                let lastStep = $scope.shaker.steps[stepCount - 1]; // last step
                let penultimateStep = $scope.shaker.steps[stepCount - 2]; // step before last step
                if (lastStep.type !== "ColumnReorder" || penultimateStep.type !== "ColumnReorder") {
                    return;
                }
                if ((lastStep.params.appliesTo !== "SINGLE_COLUMN" && lastStep.params.appliesTo !== "COLUMNS") ||
                    (penultimateStep.params.appliesTo !== "SINGLE_COLUMN" && penultimateStep.params.appliesTo !== "COLUMNS")) {
                    return;
                }
                // At this point the last two steps are ColumnReorder steps dealing with specific columns. Let's merge them if possible.

                // If the new step operates on a column that is already present in the penultimate step,
                // we remove this column from the penultimate step.
                let lastColumns = lastStep.params.columns;
                let lastAction = lastStep.params.reorderAction;
                let lastRefColumn = lastStep.params.referenceColumn;
                let penultimateColumns = penultimateStep.params.columns;
                let penultimateAction = penultimateStep.params.reorderAction;
                let penultimateRefColumn = penultimateStep.params.referenceColumn;

                penultimateColumns = penultimateColumns.filter(col => !lastColumns.includes(col));
                if (penultimateColumns.length === 0) {
                    // Penultimate step is now empty, remove it.
                    $scope.shaker.steps.splice(stepCount - 2, 2);
                    $scope.addStepNoPreview("ColumnReorder", lastStep.params);
                }

                // Merge the 2 steps if they both move the columns at start/end or before/after the same reference column.
                else if ((lastAction === "AT_END" && penultimateAction === "AT_END") ||
                        (lastAction === "BEFORE_COLUMN" && penultimateAction === "BEFORE_COLUMN" && lastRefColumn === penultimateRefColumn) ||
                        (lastAction === "AFTER_COLUMN" && penultimateAction === "AFTER_COLUMN" && lastRefColumn === penultimateRefColumn)) {
                    $scope.shaker.steps.splice(stepCount - 2, 2);
                    penultimateStep.params.columns = penultimateColumns.concat(lastColumns);
                    penultimateStep.params.appliesTo = "COLUMNS";
                    $scope.addStepNoPreview("ColumnReorder", penultimateStep.params);
                }
                else if ((lastAction === "AT_START" && penultimateAction === "AT_START")) {
                    $scope.shaker.steps.splice(stepCount - 2, 2);
                    penultimateStep.params.columns = lastColumns.concat(penultimateColumns);
                    penultimateStep.params.appliesTo = "COLUMNS";
                    $scope.addStepNoPreview("ColumnReorder", penultimateStep.params);
                }

                // Merge the 2 steps if the last step uses - as reference column - a column that is moved by the penultimate step.
                // (but not if one of the columns moved in the last steps are not a reference column in the penultimate step)
                else if ((lastAction === "BEFORE_COLUMN" || lastAction === "AFTER_COLUMN") && penultimateColumns.includes(lastRefColumn)
                        && !((penultimateAction === "BEFORE_COLUMN" || penultimateAction === "AFTER_COLUMN") && lastColumns.includes(penultimateRefColumn))) {
                    let columnIndex = penultimateColumns.indexOf(lastRefColumn);
                    if (lastAction === "AFTER_COLUMN") {
                        columnIndex++;
                    }
                    for (let i = 0; i < lastColumns.length; i++) {
                        let column = lastColumns[i];
                        penultimateColumns.splice(columnIndex + i, 0, column);
                    }

                    $scope.shaker.steps.splice(stepCount - 2, 2);
                    penultimateStep.params.columns = penultimateColumns;
                    penultimateStep.params.appliesTo = "COLUMNS";
                    $scope.addStepNoPreview("ColumnReorder", penultimateStep.params);
                }
            };

            $scope.mergeLastDeleteRows = function() {
                var firstVRProcessorIdx = $scope.shaker.steps.length;
                var relatedColumn = null, relatedAction = null;
                var defaults = {
                    appliesTo: 'SINGLE_COLUMN',
                    normalizationMode: 'EXACT',
                    matchingMode: 'FULL_STRING'
                };

                for(var i = $scope.shaker.steps.length - 1; i >= 0; i--) {
                    var step = $scope.shaker.steps[i];
                    if (step.type === 'FilterOnValue'
                            && step.params.appliesTo         === defaults.appliesTo
                            && step.params.matchingMode      === defaults.matchingMode
                            && step.params.normalizationMode === defaults.normalizationMode
                            && (relatedAction === null || step.params.action === relatedAction)
                            && step.params.columns && step.params.columns.length === 1 && step.params.columns[0]
                            && (relatedColumn === null || step.params.columns[0] === relatedColumn)) {
                        firstVRProcessorIdx = i;
                        relatedColumn = step.params.columns[0];
                        relatedAction = step.params.action;
                    } else {
                        break;
                    }
                }

                // Not enough processors to trigger a merge
                if($scope.shaker.steps.length - firstVRProcessorIdx - 1 < 1) {
                    return; // Not enough processors to trigger a merge
                }

                var valuesTotal = $scope.shaker.steps.slice(firstVRProcessorIdx).reduce(function (arr, step) {
                        return arr.concat(step.params.values);
                    }, []);
                // Remove previous processors
                $scope.shaker.steps.splice(firstVRProcessorIdx, $scope.shaker.steps.length - firstVRProcessorIdx);

                if (valuesTotal.length > 0) {
                    defaults.action = relatedAction;
                    defaults.columns = [relatedColumn];
                    defaults.values = valuesTotal;
                    $scope.addStep("FilterOnValue", defaults);
                }
            };

            $scope.mergeLastFindReplaces = function() {
                var firstVRProcessorIdx = $scope.shaker.steps.length;
                var relatedColumn = null;
                var defaults = {
                    appliesTo: 'SINGLE_COLUMN',
                    normalization: 'EXACT',
                    matching: 'FULL_STRING'
                };

                for (var i = $scope.shaker.steps.length - 1; i >= 0; i--) {
                    var step = $scope.shaker.steps[i];
                    if (step.type === 'FindReplace'
                            && step.params.appliesTo     === defaults.appliesTo
                            && step.params.matching      === defaults.matching
                            && step.params.normalization === defaults.normalization
                            && !step.params.output  // in-place only
                            && step.params.columns && step.params.columns.length === 1 && step.params.columns[0]
                            && (relatedColumn === null || step.params.columns[0] === relatedColumn)) {
                        firstVRProcessorIdx = i;
                        relatedColumn = step.params.columns[0];
                    } else {
                        break;
                    }
                }

                if($scope.shaker.steps.length - firstVRProcessorIdx - 1 < 1) {
                    return; // Not enough processors to trigger a merge
                }

                var mapping = [];
                // Mapping builder & merger
                function addMapping(add) {
                    if (add.from === null || add.from === undefined) return;
                    var updated = false;
                    // Apply transitivity
                    for (var i = 0; i < mapping.length; i++ ) {
                        var map = mapping[i];
                        if (map.to === add.from) {
                            map.to = add.to;
                        }
                    }
                    // Edit existing mapping for this input
                    for (var i = 0; i < mapping.length; i++ ) {
                        var map = mapping[i];
                        if(map.from === add.from) {
                            map.to = add.to;
                            updated = true;
                            break;
                        }
                    }
                    if (!updated) {
                        mapping.push(add);
                    }
                }

                // Build internal mapping
                for(var i = firstVRProcessorIdx; i < $scope.shaker.steps.length ; i++) {
                    $scope.shaker.steps[i].params.mapping.forEach(addMapping);
                }

                // Remove previous processors
                $scope.shaker.steps.splice(firstVRProcessorIdx,$scope.shaker.steps.length - firstVRProcessorIdx);

                if (mapping.length > 0) {
                    defaults.columns = [relatedColumn];
                    defaults.mapping = angular.copy(mapping);
                    defaults.mapping.push({ from: '', to: '' });
                    $scope.addStep("FindReplace", defaults, false, function(step) {
                        const inputs = $(".steps .active .editable-list__input");
                    	if (inputs.length > 1) {
                    	   $(inputs[inputs.length - 2]).focus();
                    	}
                    });
                }
            };

            /*
             * Column Reordering
             */

            // Callback called when dropping a column while reordering (see fatDraggable directive)
            $scope.reorderColumnCallback = function(draggedColumn, hoveredColumn, columnName, referenceColumnName) {
                let columnOldPosition;
                let columnNewPosition;
                let options = {};

                columnOldPosition = $scope.columns.indexOf(columnName);
                columnNewPosition = $scope.columns.indexOf(referenceColumnName);

                if (columnOldPosition < 0 || columnNewPosition < 0) {
                    return;
                }

                if (columnNewPosition === 0) {
                    options.reorderAction = "AT_START";
                } else if (columnNewPosition === $scope.columns.length - 1) {
                    options.reorderAction = "AT_END";
                } else if (columnOldPosition > columnNewPosition) {
                    options.reorderAction = "BEFORE_COLUMN";
                } else {
                    options.reorderAction = "AFTER_COLUMN";
                }

                options.appliesTo = "SINGLE_COLUMN";
                options.columns = [$scope.columns[columnOldPosition]];

                if (options.reorderAction === "BEFORE_COLUMN" || options.reorderAction === "AFTER_COLUMN") {
                    options.referenceColumn = $scope.columns[columnNewPosition];
                }

                $scope.addStepNoPreviewAndRefresh("ColumnReorder", options);
                $scope.mergeLastColumnReorders();
            };

            /*************************** OTHER ************************************/

            $scope.$watch("shaker.exploreUIParams.autoRefresh", function(nv, ov) {
                // tracking usage of the autorefresh button.
                if ((ov !== undefined) && (ov !== null) && (ov !== nv)) {
                    WT1.event("auto-refresh-set", {
                        "ov": ov,
                        "nv": nv
                    });
                }
            });

            /*
                Menu
            */

           $scope.previewTitle = function(step) {
            return step.preview ? "Stop viewing impact" : "View impact";
            };
            
            $scope.disableTitle = function(step) {
                return step.disabled ? 'Enable step' : 'Disable step';
            };

            $scope.openShakerMenu = function($event, step) {
                // only open menu if we aren't right clicking an input field
                if (!($event.target && ($event.target.tagName === 'INPUT' || $event.target.tagName === 'TEXTAREA'))) {
                    const selectedSteps = $scope.getSelectedSteps();
                    if (selectedSteps.length > 1 && step.selected) {
                        $scope.openActionsMenu($event);
                    } else {
                        $scope.openStepMenu($event, step, true);
                    }
                    
                    $event.preventDefault();
                    $event.stopPropagation();
                }
            }
 
            $scope.openStepMenu = function($event, step, showFullMenu) {
                // dismiss existing menu
                if (typeof $scope.activeShakerMenu === 'function') {
                    $scope.activeShakerMenu();
                }
                
                function isElsewhere() {
                    return true;
                }

                let newScope = $scope.$new();
                newScope.step = step;
                newScope.showFullMenu = showFullMenu;
                newScope.toggleComment = function($event) {
                    if (step.metaType === 'GROUP') {
                        $rootScope.$broadcast('openShakerGroup', step);
                    } else {
                        $scope.openStep(step);
                    }
                    $rootScope.$broadcast('toggleEditingComment', $event, step);
                };

                const template = `
                    <ul class="dropdown-menu" processor-footer>
                        <li ng-if="showFullMenu">
                            <a class="previewbutton"  ng-click="togglePreview(step);"
                                title="{{ previewTitle(step) }}" ng-if="!step.disabled" ng-class="{'previewActive': step.preview}">
                                <i alt="Preview" class="icon-eye-open"  /> {{ previewTitle(step) }}
                            </a>
                        </li>
                        <!-- disable -->
                        <li ng-if="showFullMenu">
                            <a class="disablebutton" ng-click="toggleDisable(step);"
                                title="{{ disableTitle(step) }}">
                                <i alt="Disable" class="icon-off" /> {{ disableTitle(step) }}
                            </a>
                        </li>
                        <li class="dropdown-submenu">
                            <a ng-if="canAddMoreStepsToGroup([step])"><i class="icon-plus "></i>&nbsp; Add to Group</a>
                            <ul class="dropdown-menu step-add-to-group-panel">
                                <li ng-repeat="group in shaker.steps | filter: { metaType: 'GROUP' }">
                                    <a ng-click="addMoreStepsToGroup(group, [step])">{{getGroupName(group)}}</a>
                                </li>
                            </ul>
                        </li>
                        <li>
                            <a class="previewbutton" id="qa_prepare_copy-single" ng-click="copyData([step]);"
                                title="Copy step">
                                <i alt="Copy step" class="icon-dku-copy-step"  /> Copy this {{ step.metaType === 'GROUP' ? 'group' : 'step' }}
                            </a>
                        </li>
                        <li>
                            <a class="previewbutton" id="qa_prepare_open-paste-modal-single" ng-click="openPasteModalFromStep([step]);"
                                title="Paste after" >
                                <i alt="Paste after" class="icon-dku-paste-step"  /> Paste after this {{ step.metaType === 'GROUP' ? 'group' : 'step' }}
                            </a>
                        </li>
                        <li>
                            <a title="comment" ng-click="toggleComment($event)">
                                <i class="icon-info-sign" /> Comment
                            </a>
                        </li>
                        <li class="dropup dropdown-submenu step-color-pannel" step-color-picker>
                            <a><i class="icon-dku-color_picker_2"></i> Color</a>
                            <ul class="dropdown-menu">
                                <li ng-click="uncolorStep(step)"><div class="color"></div></li>
                                <li ng-repeat="color in colors" ng-click="colorStep(step, color.main, color.secondary)">
                                    <div class="color" style="background-color:{{color.secondary}};border-color:{{color.main}}"></div>
                                </li>
                            </ul>
                        </li>
                        <li>
                            <a title="Duplicate step" ng-click="duplicateStep(step)">
                                <i class="icon-dku-clone" /> Duplicate step
                            </a>
                        </li>
                        <!-- delete -->
                        <li ng-if="showFullMenu">
                            <a ng-click="console.log('a');remove({step:step});" title="Delete step">
                                <i class="icon-trash"></i> Delete step
                            </a>
                        </li>
                    </ul>
                `
  
                let dkuPopinOptions = {
                    template: template,
                    isElsewhere: isElsewhere,
                    callback: null,
                    popinPosition: 'CLICK',
                    onDismiss: () => {
                        $scope.activeShakerMenu = null;
                        $scope.activeMenuType = null;
                    }
                };

                $scope.activeShakerMenu = openDkuPopin(newScope, $event, dkuPopinOptions);
            }

            $scope.openActionsMenu = function($event, menuType = 'CLICK') {
                // dismiss existing menu
                if (typeof $scope.activeShakerMenu === 'function') {
                    const previousMenuType = $scope.activeShakerMenuType;
                    $scope.activeShakerMenu();

                    // close actions dropdown if we clicked on it again
                    if (previousMenuType === menuType) {
                        return;
                    }
                }

                $scope.activeShakerMenuType = menuType;
                
                function isElsewhere() {
                    return true;
                }
                
                let newScope = $scope.$new();
                newScope.selectedSteps = $scope.getSelectedSteps();

                const template = `
                    <ul class="dropdown-menu shaker-column-row-popup">
                        <li class="dropdown-submenu">
                            <a ng-if="canAddMoreStepsToGroup(getSelectedSteps())"><i class="icon-plus "></i> Add to Group</a>
                            <ul class="dropdown-menu step-add-to-group-panel">
                                <li ng-repeat="group in shaker.steps | filter: { metaType: 'GROUP' }">
                                    <a ng-click="addMoreStepsToGroup(group, getSelectedSteps())">{{getGroupName(group)}}</a>
                                </li>
                            </ul>
                        </li>
                        <li><a ng-if="canGroupSelectedSteps()" ng-click="groupSelectedSteps()"><i class="icon-folder-close-alt "></i> Group</a></li>
                        <li><a ng-if="canUngroupSelectedSteps()" ng-click="ungroupSelectedSteps()"><i class="icon-folder-open-alt "></i> Ungroup</a></li>
                        <li><a id="qa_prepare_copy-selection" ng-click="copyData(selectedSteps)"><i class="icon-dku-copy-step" /> Copy {{ getNumberOfSteps(selectedSteps) }} {{'step' | plurify: getNumberOfSteps(selectedSteps) }}</a></li>
                        <li><a id="qa_prepare_open-paste-modal-selection" ng-click="openPasteModalFromStep(selectedSteps)"><i class="icon-dku-paste-step" /> Paste after selection</a></li>
                        <li><a ng-click="toggleDisableSelectedSteps()"><i class="icon-off" /> Toggle enable/disable</a></li>
                        <li><a ng-click="deleteSelectedSteps($event)"><i class="icon-trash" /> Delete</a></li>
                        <li class="dropup dropdown-submenu step-color-pannel" step-color-picker>
                            <a><i class="icon-dku-color_picker_2"></i> Color</a>
                            <ul class="dropdown-menu">
                                <li ng-click="uncolorSelectedSteps()"><div class="color"></div></li>
                                <li ng-repeat="color in colors" ng-click="colorSelectedSteps(color.main, color.secondary)">
                                    <div class="color" style="background-color:{{color.secondary}};border-color:{{color.main}}"></div>
                                </li>
                            </ul>
                        </li>
                    </ul>
                `

                let dkuPopinOptions = {
                    template: template,
                    isElsewhere: isElsewhere,
                    callback: null,
                    popinPosition: menuType,
                    onDismiss: () => {
                        $scope.activeShakerMenu = null;
                        $scope.activeMenuType = null;
                    }
                };

                $scope.activeShakerMenu = openDkuPopin(newScope, $event, dkuPopinOptions);
            }

        }
    }
});


app.directive('groupNameEditor', [ '$timeout', function($timeout) {
    return {
        scope: true,
        restrict: 'A',
        link : function($scope, element, attrs) {
            $scope.showGroupNameForm = false;

            $scope.toggleGroupNameForm = function($event) {
                $scope.showGroupNameForm = !$scope.showGroupNameForm;
                if ($scope.showGroupNameForm) {
                    $timeout(function() {
                        $($event.target).siblings('fieldset').find('input').focus();
                    }, false);
                }
            }

            if ($scope.groupChanged.justCreated) {
                $timeout(function() {
                    angular.element(element).find('.show-group').triggerHandler('click');
                });
                $scope.groupChanged.justCreated = false;
            }
        }
    };
}]);


app.directive('processorFooter', [ '$timeout', function($timeout) {
    return {
        scope: true,
        restrict : 'A',
        link : function($scope, element, attrs) {

            //flag for edition state
            $scope.editingComment = false;

            /*
             * Display/Hide methods
             */

            $scope.showFooter = function (expanded) {
                return expanded || $scope.showComment(expanded) || $scope.showCommentEditor(expanded);
            }

            $scope.showComment = function(expanded) {
                return $scope.hasComment() && ($scope.step.alwaysShowComment || expanded) && !$scope.showCommentEditor(expanded);
            }

            $scope.showCommentEditor = function(expanded) {
                return $scope.editingComment && expanded;
            }

            /*
             * Display/Hide utils
             */

            $scope.hasComment = function() {
                return typeof($scope.step.comment) !== 'undefined' && $scope.step.comment.length > 0;
            }

            /*
             * Comment editor utils
             */

            $scope.toggleEditingComment = function ($event) {
                $scope.editingComment = !$scope.editingComment;
                if (!$scope.editingComment) {
                    $scope.saveComment();
                }
            }
            
            $scope.$on('toggleEditingComment', (e, $event, step) => {
                if ($scope.step === step) {
                    $scope.toggleEditingComment($event);
                }
            });

            $scope.saveComment = function() {
                $scope.editingComment = false;
                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }

            $scope.deleteComment = function() {
                $scope.step.comment = undefined;
                $scope.editingComment = false;
                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }


        }
    }
}]);
app.directive('stepColorPicker', [ 'ContextualMenu', function(ContextualMenu) {
   return {
       scope: true,
       restrict : 'A',
       link : function($scope, element, attrs) {
           $scope.colors = [
                {
                    main: '#ff9c00',
                    secondary: '#f4e0c1'
                },
                {
                    main: '#ffdc00',
                    secondary: '#f4edc1'
                },
                {
                    main: '#30c2ff',
                    secondary: '#cae8f4'
                },

                {
                    main: '#61c1b0',
                    secondary: '#d4e7e4'
                },
                {
                    main: '#90d931',
                    secondary: '#deeccb'
                },

           ];

           $scope.colorMenu = new ContextualMenu({
               template: "/templates/shaker/step-color-picker.html",
               cssClass : "step-color-picker",
               scope: $scope,
               contextual: false,
               onClose: function() {
                   $scope.stepToColor = undefined;
               }
           });

           $scope.openColorPicker = function(step, $event) {
               $scope.colorMenu.openAtXY($($event.target).offset().left, $($event.target).offset().top + $($event.target).height(), function() {}, true, false);
               $scope.stepToColor = step;
           }

           $scope.setStepColor = function(main, secondary) {
               $scope.stepToColor.mainColor = main;
               $scope.stepToColor.secondaryColor = secondary;
               if (!$scope.isRecipe){
               	$scope.saveOnly();
               }
           }

           $scope.removeStepColor = function() {
               delete $scope.stepToColor.mainColor;
               delete $scope.stepToColor.secondaryColor;
               if (!$scope.isRecipe){
               	$scope.saveOnly();
               }
           }
       }
   }
}]);


})();
