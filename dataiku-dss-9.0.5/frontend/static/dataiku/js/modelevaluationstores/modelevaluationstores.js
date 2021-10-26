(function(){
'use strict';

const app = angular.module('dataiku.modelevaluationstores', []);



/* ************************************ List / Right column  *************************** */

app.controller("ModelEvaluationStorePageRightColumnActions", function($controller, $scope, $state, $rootScope, DataikuAPI, $stateParams, ActiveProjectKey) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    $scope.selection = {};

    DataikuAPI.modelevaluationstores.get(ActiveProjectKey.get(), $stateParams.mesId).success((data) => {
        data.description = data.shortDesc;
        data.nodeType = 'LOCAL_MODELEVALUATIONSTORE';
        data.name = data.id;
        data.interest = {};

        $scope.selection = {
            selectedObject : data,
            confirmedItem : data,
        };

        updateUserInterests();

    }).error(setErrorInScope.bind($scope));

    function updateUserInterests() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "MODEL_EVALUATION_STORE", ActiveProjectKey.get(), $stateParams.mesId).success(function(data) {

            $scope.selection.selectedObject.interest.watching = data.watching;
            $scope.selection.selectedObject.interest.starred = data.starred;

        }).error(setErrorInScope.bind($scope));
    }

    $scope.isOnStoreObjectPage = function() {
        return $state.includes('projects.project.modelevaluationstores.modelevaluationstore');
    }

    const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);
    $scope.$on("$destroy", interestsListener);
});


app.directive('modelEvaluationStoreRightColumnSummary', function($controller, $state, $stateParams, ModelEvaluationStoreCustomFieldsService, $rootScope, FlowGraphSelection,
    DataikuAPI, CreateModalFromTemplate, QuickView, TaggableObjectsUtils, ActiveProjectKey, ActivityIndicator) {

    return {
        templateUrl :'/templates/modelevaluationstores/right-column-summary.html',

        link : function(scope, element, attrs) {
            $controller('_TaggableObjectsMassActions', {$scope: scope});

            scope.$stateParams = $stateParams;
            scope.QuickView = QuickView;

            scope.getSmartName = function (projectKey, name) {
                if (projectKey == ActiveProjectKey.get()) {
                    return name;
                } else {
                    return projectKey + '.' + name;
                }
            }

            scope.refreshData = function() {
                var projectKey = scope.selection.selectedObject.projectKey;
                var name = scope.selection.selectedObject.name;
                DataikuAPI.modelevaluationstores.getFullInfo(ActiveProjectKey.get(), scope.getSmartName(projectKey, name)).success(function(data){
                    if (!scope.selection.selectedObject || scope.selection.selectedObject.projectKey != projectKey || scope.selection.selectedObject.name != name) {
                        return; // too late!
                    }
                    scope.modelEvaluationStoreData = data;
                    scope.modelEvaluationStore = data.evaluationStore;
                    scope.modelEvaluationStore.zone = (scope.selection.selectedObject.usedByZones || [])[0] || scope.selection.selectedObject.ownerZone;
                    scope.isLocalModelEvaluationStore = projectKey == ActiveProjectKey.get();
                }).error(setErrorInScope.bind(scope));
            };

            scope.$on("objectSummaryEdited", function() {
                DataikuAPI.modelevaluationstores.save(scope.modelEvaluationStore, {summaryOnly: true})
                .success(function(data) {
                    ActivityIndicator.success("Saved");
                }).error(setErrorInScope.bind(scope));
            });

            scope.$watch("selection.selectedObject",function() {
                if(scope.selection.selectedObject != scope.selection.confirmedItem) {
                    scope.modelEvaluationStore = null;
                    scope.objectTimeline = null;
                }
            });

            scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) {
                    return;
                }
                if (!nv.projectKey) {
                    nv.projectKey = ActiveProjectKey.get();
                }
                scope.refreshData();
            });

            scope.zoomToOtherZoneNode = function(zoneId) {
                let otherNodeId = scope.selection.selectedObject.id.replace(/zone__.+?__saved/, "zone__" + zoneId + "__saved");
                if ($stateParams.zoneId) {
                    $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId: zoneId }))
                }
                else {
                    scope.zoomGraph(otherNodeId);
                    FlowGraphSelection.clearSelection();
                    FlowGraphSelection.onItemClick(scope.nodesGraph.nodes[otherNodeId], null);
                }
            }

            scope.isMESZoneInput = function() {
                return (scope.selection.selectedObject.usedByZones.length && scope.selection.selectedObject.usedByZones[0] != scope.selection.selectedObject.ownerZone);
            }

            scope.editCustomFields = function() {
                if (!scope.selection.selectedObject) {
                    return;
                }
                DataikuAPI.modelevaluationstores.getSummary(scope.selection.selectedObject.projectKey, scope.selection.selectedObject.name).success(function(data) {
                    let modelEvaluationStore = data.object;
                    let modalScope = angular.extend(scope, {objectType: 'MODEL_EVALUATION_STORE', objectName: modelEvaluationStore.name, objectCustomFields: modelEvaluationStore.customFields});
                    CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                        ModelEvaluationStoreCustomFieldsService.saveCustomFields(modelEvaluationStore, customFields);
                    });
                }).error(setErrorInScope.bind(scope));
            };
            
            scope.buildModelEvaluationStore = function() {
                CreateModalFromTemplate("/templates/modelevaluationstores/build-store-modal.html", scope, "BuildModelEvaluationStoreController", function(newScope) {
                    newScope.projectKey = scope.modelEvaluationStore.projectKey;
                    newScope.mesId = scope.modelEvaluationStore.id;
                });
            };
            

            const customFieldsListener = $rootScope.$on('customFieldsSaved', scope.refreshData);
            scope.$on("$destroy", customFieldsListener);
        }
    }
});

app.service("ModelEvaluationStoreCustomFieldsService", function($rootScope, TopNav, DataikuAPI, ActivityIndicator, WT1){
    let svc = {};

    svc.saveCustomFields = function(modelEvaluationStore, newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'MODEL_EVALUATION_STORE'});
        let oldCustomFields = angular.copy(modelEvaluationStore.customFields);
        modelEvaluationStore.customFields = newCustomFields;
        return DataikuAPI.modelevaluationstores.save(modelEvaluationStore, {summaryOnly: true})
            .success(function(data) {
                ActivityIndicator.success("Saved");
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), modelEvaluationStore.customFields);
                $rootScope.$broadcast('reloadGraph');
            })
            .error(function(a, b, c) {
                modelEvaluationStore.customFields = oldCustomFields;
                setErrorInScope.bind(scope)(a, b, c);
            });
    };

    return svc;
});


app.controller("ModelEvaluationStoreSummaryController", function($scope, $rootScope, $stateParams, $timeout, DataikuAPI, TopNav, ActivityIndicator, ActiveProjectKey, ModelEvaluationStoreCustomFieldsService) {
    TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_MODEL_EVALUATION_STORE, TopNav.TABS_MODEL_EVALUATION_STORE, "summary");
    TopNav.setItem(TopNav.ITEM_MODEL_EVALUATION_STORE, $stateParams.mesId);

    DataikuAPI.modelevaluationstores.getSummary(ActiveProjectKey.get(), $stateParams.mesId).success(function(data) {
        $scope.objectInterest = data.interest;
        $scope.objectTimeline = data.timeline;

        TopNav.setItem(TopNav.ITEM_MODEL_EVALUATION_STORE, $stateParams.mesId, {name: $scope.modelEvaluationStore.name});
        TopNav.setPageTitle($scope.modelEvaluationStore.name + " - Evaluation store");
    }).error(setErrorInScope.bind($scope));

    $scope.refreshTimeline = function() {
        DataikuAPI.timelines.getForObject(ActiveProjectKey.get(), "MODEL_EVALUATION_STORE", $scope.modelEvaluationStore.id)
        .success(function(data){
            $scope.objectTimeline = data;
        })
        .error(setErrorInScope.bind($scope));
    };

    var save = function() {
        DataikuAPI.modelevaluationstores.save($scope.modelEvaluationStore, {summaryOnly: true})
            .success(function(data) {
                ActivityIndicator.success("Saved");
            })
            .error(setErrorInScope.bind($scope));
    };

    if ($scope.$root.projectSummary.canWriteProjectContent) {
        /* Auto save */
        $scope.$watch("modelEvaluationStore", function(nv, ov) {
            if (nv && ov) {
                save();
            }
        }, true);
    }

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        ModelEvaluationStoreCustomFieldsService.saveCustomFields($scope.modelEvaluationStore, customFields);
    });

    checkChangesBeforeLeaving($scope, $scope.dirtySettings);

});


app.controller("ModelEvaluationStoreController", function($scope, Assert, DataikuAPI, CreateModalFromTemplate, $state, $stateParams, ActiveProjectKey, StateUtils, TopNav) {
    $scope.versionsContext = {}
    $scope.mesContext = {};
    $scope.uiState = {};
    $scope.clearVersionsContext = function(){
        clear($scope.versionsContext);
    };

    $scope.$on("$destroy", $scope.clearVersionsContext);

    $scope.savedSettings = {}
    DataikuAPI.modelevaluationstores.getFullInfo(ActiveProjectKey.get(), $stateParams.mesId).success(function(data){
        $scope.modelEvaluationStoreFullInfo = data;
        $scope.modelEvaluationStore = data.evaluationStore;
        if (!$scope.modelEvaluationStore.displayParams.sortColumn) {
            $scope.modelEvaluationStore.displayParams.sortColumn = "runId";
        }
        if (!$scope.modelEvaluationStore.displayParams.xLabel) {
            $scope.modelEvaluationStore.displayParams.xLabel = DEFAULT_X_LABEL;
            $scope.modelEvaluationStore.displayParams.yLabels = DEFAULT_Y_LABELS;
        }
        $scope.savedSettings = angular.copy($scope.modelEvaluationStore);
        TopNav.setItem(TopNav.ITEM_MODEL_EVALUATION_STORE, $stateParams.mesId, {name: data.name});
    }).error(setErrorInScope.bind($scope));

    $scope.save = function() {
        DataikuAPI.modelevaluationstores.save($scope.modelEvaluationStore).success(function(data) {
            $scope.savedSettings = angular.copy($scope.modelEvaluationStore);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.dirtySettings = function() {
        return !angular.equals($scope.savedSettings, $scope.modelEvaluationStore);
    }

    $scope.goToEvaluatedModel = function() {
        if (!$scope.mesContext.evaluationFullInfo.evaluation) return;
        const modelRef = $scope.mesContext.evaluationFullInfo.evaluation.modelRef;
        StateUtils.go.savedModel(modelRef.smId, modelRef.projectKey);
    };

    $scope.goToEvaluatedModelVersion = function() {
        if (!$scope.mesContext.evaluationFullInfo.evaluation) return;
        const modelRef = $scope.mesContext.evaluationFullInfo.evaluation.modelRef;
        StateUtils.go.savedModelVersion('PREDICTION', modelRef.smId, modelRef.fullId, modelRef.projectKey);
    }

    $scope.goToEvaluatedDataset = function() {
        if (!$scope.mesContext.evaluationFullInfo.evaluation) return;
        StateUtils.go.dssObject('DATASET', $scope.mesContext.evaluationFullInfo.evaluation.dataParams.ref);
    };
});


/* ************************************ Settings *************************** */

app.controller("ModelEvaluationStoreSettingsController", function($scope, DataikuAPI, $q, CreateModalFromTemplate, $state, $stateParams, TopNav, $controller, ActivityIndicator, ComputableSchemaRecipeSave, ActiveProjectKey){
    TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_MODEL_EVALUATION_STORE, TopNav.TABS_MODEL_EVALUATION_STORE, "settings");
    TopNav.setItem(TopNav.ITEM_MODEL_EVALUATION_STORE, $stateParams.mesId);
});


app.controller("ModelEvaluationsMetricsHandlingCommon", function($scope, PMLFilteringService, PMLSettings) {
    $scope.sortValue = function(sortColumn) {
        const metricsPattern = /^metrics\./;
        const labelsPattern = /^labels\./;
        if(metricsPattern.exec(sortColumn)) {
            return me => me.metrics[sortColumn.replace(metricsPattern, '')];
        }
        if(labelsPattern.exec(sortColumn)) {
            return me => me.labels.get(sortColumn.replace(labelsPattern, ''));
        }
    };

    $scope.refreshMetrics = function(predictionType) {
        $scope.possibleMetrics = [];
        if (!predictionType) {
            return;
        }
    
        let toDropdownElems = function(a) {
            return a.map(function(m) { return [m, PMLSettings.names.evaluationMetrics[m]] });
        };
        if ('BINARY_CLASSIFICATION' === predictionType) {
            $scope.possibleMetrics.push([null, 'Binary classification']);
            $scope.possibleMetrics = $scope.possibleMetrics.concat(toDropdownElems(['ACCURACY', 'PRECISION', 'RECALL', 'F1', 'COST_MATRIX', 'LOG_LOSS', 'ROC_AUC', 'CALIBRATION_LOSS', 'CUMULATIVE_LIFT', 'CUSTOM']));
        }
        if ('MULTICLASS' === predictionType) {
            $scope.possibleMetrics.push([null, 'Multiclass classification']);
            $scope.possibleMetrics = $scope.possibleMetrics.concat(toDropdownElems(['ACCURACY', 'PRECISION', 'RECALL', 'F1', 'LOG_LOSS', 'ROC_AUC', 'CALIBRATION_LOSS', 'CUSTOM']));
        }
        if ('REGRESSION' === predictionType) {
            $scope.possibleMetrics.push([null, 'Regression']);
            $scope.possibleMetrics = $scope.possibleMetrics.concat(toDropdownElems(['EVS', 'MAPE', 'MAE', 'MSE', 'RMSE', 'RMSLE', 'R2', 'PEARSON', 'CUSTOM']));
        }
        if ($scope.uiState.currentMetric && $scope.possibleMetrics.filter(_ => _[0] == $scope.uiState.currentMetric).length == 0) {
            // old selected metric isn't possible anymore
            $scope.uiState.currentMetric = null;
        }
        if ($scope.uiState.currentMetric == null) {
            if ('BINARY_CLASSIFICATION' === predictionType) {
                $scope.uiState.currentMetric = 'ROC_AUC';
            }
            if ('MULTICLASS' === predictionType) {
                $scope.uiState.currentMetric = 'ROC_AUC';
            }
            if ('REGRESSION' === predictionType) {
                $scope.uiState.currentMetric = 'R2';
            }
        }
        if (!$scope.modelEvaluationStore.displayParams.displayedMetrics) {
            $scope.modelEvaluationStore.displayParams.displayedMetrics = $scope.possibleMetrics.map(pm => pm[0]).filter(x => x);
        }
        $scope.refreshCurrentMetricNames();
    }

    $scope.refreshCurrentMetricNames = function() {
        if ($scope.modelEvaluationStore && $scope.modelEvaluationStore.displayParams.displayedMetrics && $scope.possibleMetrics) {
            $scope.uiState.currentFormattedNames = $scope.modelEvaluationStore.displayParams.displayedMetrics.map(cur => {
                return {
                    key: PMLFilteringService.metricMap[cur],
                    label: $scope.possibleMetrics.find(x => x[0] === cur)[1]
                };
            });
        } else {
            $scope.uiState.currentFormattedNames = [];
        }
        $scope.refreshMetricsValues();
    }

    $scope.refreshMetricsValues = function() {
        let refs;
        if ($scope.uiState.refs && $scope.uiState.refs.length) {
            refs = $scope.uiState.refs;
        } else if ($scope.ctrl && $scope.ctrl.refs && $scope.ctrl.refs.length) {
            refs = $scope.ctrl.refs;
        }
        if (refs) {
            for (let item of refs) {
                item.formattedMetrics = {};
                for (let metric of $scope.modelEvaluationStore.displayParams.displayedMetrics) {
                    item.formattedMetrics[PMLFilteringService.metricMap[metric]] = $scope.getMetricValue(item, metric);
                }
            }
        }
    }
});

/* ************************************ Evaluations list and perf drift *************************** */

app.controller("ModelEvaluationStoreListCommon", function($scope, DataikuAPI, $stateParams, TopNav, PMLFilteringService, PMLSettings, ActiveProjectKey, Fn, $filter, ModelEvaluationUtils, $controller) {
    $controller("ModelEvaluationsMetricsHandlingCommon", {$scope, PMLFilteringService, PMLSettings});

    TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_MODEL_EVALUATION_STORE, TopNav.TABS_MODEL_EVALUATION_STORE, "evaluations");
    TopNav.setItem(TopNav.ITEM_MODEL_EVALUATION_STORE, $stateParams.mesId);

    $scope.uiState = {
        refs: [],
        titleLabels: []
    };

    $scope.refreshStatus = function() {
        DataikuAPI.modelevaluationstores.listEvaluations(ActiveProjectKey.get(), $stateParams.mesId).success(function(data) {
            $scope.evaluations = data.evaluations;
            TopNav.setItem(TopNav.ITEM_MODEL_EVALUATION_STORE, $stateParams.mesId, {name: data.modelEvaluationStore.name});
            $scope.predictionType = $scope.evaluations && $scope.evaluations.length?$scope.evaluations[0].evaluation.predictionType:null;
            $scope.refreshMetrics($scope.predictionType);
        }).error(setErrorInScope.bind($scope));
    };

    $scope.$watch("modelEvaluationStore", (nv) => { if (nv) $scope.refreshStatus(); });

    $scope.selection = $.extend({
        filterQuery: {
            userQuery: ''
        },
        filterParams: {
            userQueryTargets: ["runId", "trainDataSetName", "modelName", "evaluationDatasetName", "value"],
            propertyRules: {}
        },
        orderQuery: "-value",
        orderReversed: false
    }, $scope.selection || {});

    $scope.deleteSelectedEvaluations = function() {
        DataikuAPI.modelevaluationstores.deleteEvaluations(ActiveProjectKey.get(), $stateParams.mesId,
                $scope.selection.selectedObjects.filter(function(o){return !o.active}).map(Fn.prop('ref')).map(Fn.prop('runId')))
            .success($scope.refreshStatus)
            .error(setErrorInScope.bind($scope));
    };

    $scope.computeRefs = function() {
        if ($scope.evaluations) {
            $scope.uiState.refs = $scope.evaluations.map(x => {
                let ret = ModelEvaluationUtils.makeRefDisplayItemFromEvaluation(x.evaluation);
                ret.metrics = x.metrics;
                return ret;
            });
        } else {
            $scope.uiState.refs = [];
        }
        $scope.refreshMetricsValues();
    }

    $scope.getMetricValue = function(item,metric) {
        let ret = $filter('nicePrecision')(item.metrics[PMLFilteringService.metricMap[metric]],2);
        if (!ret) {
            ret = '-';
        }
        return ret;
    }

    DataikuAPI.modelevaluationstores.listWithAccessible($stateParams.projectKey).success(function(data){
        $scope.storeList = data;
    });

    $scope.computeTitleLabels = function() {
        $scope.uiState.titleLabels = ($scope.uiState.shownLabels && $scope.uiState.shownLabels.length)?generateTitleLabelsFromRefs($scope.uiState.shownLabels):[];
    }

    $scope.$watch("uiState.shownLabels", $scope.computeTitleLabels);

    $scope.computeAllLabels = function() {
        $scope.uiState.possibleLabels = _.sortBy(_.uniq(_.flatten($scope.uiState.refs.map(r => Array.from(r.labels.keys())))));
        if ($scope.uiState.possibleLabels && $scope.uiState.possibleLabels.length && !$scope.uiState.shownLabels) {
            $scope.uiState.shownLabels = [DEFAULT_X_LABEL].concat(DEFAULT_Y_LABELS);
        }
        if ($scope.uiState.shownLabels && $scope.uiState.shownLabels.length) {
            $scope.uiState.shownLabels = $scope.uiState.shownLabels.filter(l => $scope.uiState.possibleLabels.includes(l));
        }
    }

    $scope.$watch('evaluations', $scope.computeRefs);
    $scope.$watch('uiState.refs', $scope.computeAllLabels);

    $scope.labelPrefix = function(labelKey) {
        return getDomainLabel(labelKey);
    }

    $scope.labelSuffix = function(labelKey)  {
        return getDomainSubLabel(labelKey);
    }

    $scope.shouldSaveDisplaySettings = function() {
        return $scope.$root && $scope.$root.projectSummary && $scope.$root.projectSummary.canWriteProjectContent
            && $scope.savedSettings && $scope.modelEvaluationStore && !angular.equals($scope.savedSettings.displayParams, $scope.modelEvaluationStore.displayParams);
    }


    $scope.$watch("shouldSaveDisplaySettings()", (dirty) => { if (dirty) { $scope.save(); } });

});

app.controller("ModelEvaluationStoreEvaluationsController", function($scope, DataikuAPI, $stateParams, TopNav, $controller, ActivityIndicator, PMLFilteringService, PMLSettings, ActiveProjectKey, Fn, $filter) {
    $controller("ModelEvaluationStoreListCommon", {$scope});
    TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_MODEL_EVALUATION_STORE, TopNav.TABS_MODEL_EVALUATION_STORE, "evaluations");
    TopNav.setItem(TopNav.ITEM_MODEL_EVALUATION_STORE, $stateParams.mesId);
    $scope.$watch("modelEvaluationStore.displayParams.displayedMetrics", $scope.refreshCurrentMetricNames)
});

app.controller("ModelEvaluationStorePerfDriftController", function($scope, $filter, $stateParams, TopNav, $controller, ModelEvaluationUtils, PMLFilteringService, DataikuAPI) {
    $controller("ModelEvaluationStoreListCommon", {$scope});
    TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_MODEL_EVALUATION_STORE, TopNav.TABS_MODEL_EVALUATION_STORE, "perfdrift");
    TopNav.setItem(TopNav.ITEM_MODEL_EVALUATION_STORE, $stateParams.mesId);
});

const DEFAULT_X_LABEL = "evaluation:date";
const DEFAULT_Y_LABELS = ["model:algorithm", "model:date", "evaluationDataset:dataset-name"];
const DEFAULT_SELECTED_LABELS = [DEFAULT_X_LABEL].concat(DEFAULT_Y_LABELS); // in 'driftReferencesSelector'


function generateTitleLabelsFromRefs(refLabels) {
    var titleLabels = [];
    let curDomainTitle = null;
    for (const curLabel of refLabels) {
        const labelParts = curLabel.split(":");
        if (1 == labelParts.length) {
            curDomainTitle = null;
            titleLabels.push({
                domain: "-",
                subLabel: curLabel,
                fullLabel: curLabel
            });
            continue;
        }
        titleLabels.push({
            domain: labelParts[0] !== curDomainTitle?labelParts[0]:null,
            subLabel: labelParts.slice(1).join(":"),
            fullLabel: curLabel
        });
        curDomainTitle = labelParts[0];
    }

    let curDomainCount = 1;
    for (let i = titleLabels.length-1 ; i >=0 ; i--) {
        if (!titleLabels[i].domain) {
            curDomainCount++;
        } else {
            titleLabels[i].span = curDomainCount;
            curDomainCount = 1;
        }
    }
    return titleLabels;
}



function getDomainLabel(labelKey) {
    const labelParts = labelKey.split(":");
    if (1 >= labelParts.length) {
        return "(no domain)";
    }
    return labelParts[0];
}

function getDomainSubLabel(labelKey) {
    const labelParts = labelKey.split(":");
    if (1 >= labelParts.length) {
        return labelKey;
    }
    return labelParts.slice(1).join(":");
}

app.controller('DriftReferencesSelectorModalController', function($scope, CollectionFiltering) {
    $scope.filterQuery = { userQuery: '' };

    $scope.save = function() {
        if($scope.driftModalState.selectedReference) {
            $scope.acceptDeferred.resolve($scope.driftModalState.selectedReference);
        }
        $scope.dismiss();
    }

    $scope.sortValue = sortColumn => me => me.labels.get(sortColumn);

    $scope.$watch('filterQuery.userQuery', ()=> {
        $scope.driftModalState.filteredCompatibleReferences = CollectionFiltering.filter($scope.driftModalState.compatibleReferences, $scope.filterQuery);
    });

    $scope.labelPrefix = function(labelKey) {
        return getDomainLabel(labelKey);
    }

    $scope.labelSuffix = function(labelKey)  {
        return getDomainSubLabel(labelKey);
    }
});

app.component('driftReferencesSelector',{
    bindings: {
        ref: '=',
        cur: '<',
        compatibleReferences: '<',
        action: '<',
        fnLabel: '<',
        refLabels: '=',
        driftParams: '<' // Used to show the configuration popover within this directive
    },
    templateUrl: '/templates/modelevaluationstores/drift-references-selector.html',
    controller: function ctrlModelLikesInfo($scope, ClipboardUtils, openDkuPopin, $q, CreateModalFromTemplate) {
        $scope.$ctrl = this;

        $scope.uiState = {
            titleLabels: [],
            selectedLabels: [], 
            allLabels: []
        };

        $scope.labelPrefix = function(labelKey) {
            return getDomainLabel(labelKey);
        }

        $scope.labelSuffix = function(labelKey)  {
            return getDomainSubLabel(labelKey);
        }

        $scope.changeReference = function() {
            const deferred = $q.defer();
            CreateModalFromTemplate("/templates/modelevaluationstores/drift-references-selector-modal.html", $scope, "DriftReferencesSelectorModalController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.driftModalState = {
                    selectedLabels: angular.copy($scope.uiState.selectedLabels),
                    selectedReference: $scope.$ctrl.ref,
                    currentMe: $scope.$ctrl.cur,
                    compatibleReferences: $scope.$ctrl.compatibleReferences,
                    allLabels: $scope.uiState.allLabels,
                }
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            deferred.promise.then((newRef)=> {
                $scope.$ctrl.ref = newRef;
                $scope.$applyAsync(() => $scope.$ctrl.action());
            });
        };

        $scope.computeAllLabels = function() {
            $scope.uiState.allLabels = [];
            if ($scope.$ctrl.compatibleReferences) {
                $scope.uiState.allLabels = [...new Set($scope.$ctrl.compatibleReferences.flatMap(me => [...me.labels.keys()]))];
            }
            $scope.uiState.allLabels.sort((v1,v2) => {
                const domainV1 = getDomainLabel(v1);
                const domainV2 = getDomainLabel(v2);
                const cmp = domainV1.localeCompare(domainV2);
                if (domainV1 === domainV2) {
                    const subLabelV1 = getDomainSubLabel(v1);
                    const subLabelV2 = getDomainSubLabel(v2);
                    return subLabelV1.localeCompare(subLabelV2);
                }
                return cmp;
            })

            if($scope.uiState.selectedLabels.length == 0) {
                // No label is selected (likely, initial state) => set defaults if they exist
                $scope.uiState.selectedLabels = DEFAULT_SELECTED_LABELS.filter(label=> $scope.uiState.allLabels.includes(label));
            }
        }

        $scope.computeTitleLabels = function() {
            $scope.uiState.titleLabels = generateTitleLabelsFromRefs($scope.uiState.selectedLabels);
        }

        $scope.$watch("$ctrl.compatibleReferences", $scope.computeAllLabels);
        $scope.$watch("uiState.selectedLabels", $scope.computeTitleLabels);

        $scope.copyDataDriftParamsToClipboard = function() {
            ClipboardUtils.copyToClipboard(JSON.stringify($scope.$ctrl.driftParams, null, 2));
        };

        let dismissComputeParamsPopin = null;
        $scope.toggleComputationParamsPopin = function($event) {
            if (!dismissComputeParamsPopin) {
                function isElsewhere(elt, e) {
                    return $(e.target).parents(".dropdown-menu").length == 0;
                }
                const dkuPopinOptions = {
                    template: `
                        <ul class="dropdown-menu" style="padding: 15px;" listen-keydown="{'enter': 'save()', 'esc': 'dismiss()' }">
                            <form class="dkuform-horizontal">
                                <div class="control-group">
                                    <label for="" class="control-label">Confidence level</label>
                                    <div class="controls">
                                        <input type="number" required ng-model="$ctrl.driftParams.confidenceLevel" min="0.5" max="0.999"
                                            step="0.001" />
                                        <div class="help-inline">
                                            Used to compute confidence interval and determine significance level of statistical tests
                                        </div>
                                    </div>
                                </div>

                                <div class="control-group">
                                    <label for="" class="control-label">PSI threshold</label>
                                    <div class="controls">
                                        <input type="number" required ng-model="$ctrl.driftParams.psiThreshold" min="0" max="1"
                                            step="0.001" />
                                        <div class="help-inline">Using a fixed random seed allows for reproducible result</div>
                                    </div>
                                </div>

                                <button type="button" class="pull-right btn btn--secondary" ng-click="copyDataDriftParamsToClipboard()">
                                    <i class="icon-copy interactive-scoring__edit-icon"></i>
                                    Copy settings to clipboard
                                </button>
                            </form>
                        </ul>
                    `,
                    isElsewhere,
                    popinPosition: 'SMART',
                    onDismiss: () => {
                        dismissComputeParamsPopin = null;
                    }
                };
                dismissComputeParamsPopin = openDkuPopin($scope, $event, dkuPopinOptions);
            } else {
                dismissComputeParamsPopin();
                dismissComputeParamsPopin = null;
            }
        };
    }
});


app.component('perfDrift', {
    bindings: {
        refs: '<',
        predictionType: '<',
        labels: '<',
        storeList: '<',
        refreshStatus: '<',
        excludedLabels: '<',
        hideStore: '<',
        displayParams: '=',
        possibleMetrics: '<'
    },
    templateUrl: '/templates/modelevaluationstores/perfdrift-component.html',
    controller: ['$scope', 'PMLSettings', '$filter', 'PMLFilteringService', '$state', '$stateParams', '$controller', 'ChartIconUtils', '$sanitize',
        function ctrlPerfDrift($scope, PMLSettings, $filter, PMLFilteringService, $state, $stateParams, $controller, ChartIconUtils, $sanitize) {
            $scope.$state = $state;
            $scope.$stateParams = $stateParams;
            let ctrl = this;
            $scope.ctrl = ctrl;

            $scope.uiState = {
                query:  null,
                titleLabels: [],
                focusedLabels: []
            };

            ctrl.$onChanges = function(changes) {
                $scope.labels= ctrl.labels;
                $scope.refreshLabels();
                $scope.refreshTableData();
                $scope.refreshEchartsData();
            }

            $scope.graphData = [];
        
            $scope.selection = $.extend({
                filterQuery: {
                    userQuery: ''
                },
                filterParams: {
                    userQueryTargets: ["runId", "trainDataSetName", "modelName", "evaluationDatasetName", "value"],
                    propertyRules: {}
                },
                orderQuery: "-value",
                orderReversed: false
            }, $scope.selection || {});

            $scope.computeChartIcone = function(type, variant, webAppType) {
                return ChartIconUtils.computeChartIcon(type, variant, $scope.isInAnalysis, webAppType);
            }

            $scope.setGraphTypes = function() {
                $scope.uiState.graphStyle = ($scope.selection.filteredSelectedObjects && $scope.selection.filteredSelectedObjects.length > 2)?'LINE':'BAR';
            }

            $scope.generateTitleLabels = function() {
                var labels = [];
                if (ctrl.displayParams.xLabel) {
                    labels.push(ctrl.displayParams.xLabel);
                }
                if (ctrl.displayParams.yLabels) {
                    labels = labels.concat(ctrl.displayParams.yLabels);
                }
                if (ctrl.displayParams.alsoDisplayedLabels) {
                    labels = labels.concat(ctrl.displayParams.alsoDisplayedLabels);
                }
                labels.sort();
                $scope.uiState.titleLabels = generateTitleLabelsFromRefs(labels);
            }

            $scope.refreshLabels = function() {
                let labelKeys = _.sortBy(_.uniq(_.flatten(ctrl.refs.map(r => Array.from(r.labels.keys())))));
                if ($scope.ctrl.excludedLabels) {
                    labelKeys = labelKeys.filter(l => !$scope.ctrl.excludedLabels.includes(l));
                }
                $scope.possibleXLabels = labelKeys;
                if (ctrl.displayParams.xLabel && !$scope.possibleXLabels.includes(ctrl.displayParams.xLabel)) {
                    ctrl.displayParams.xLabel = undefined;
                }
                if (!ctrl.displayParams.xLabel && !$scope.ctrl.excludedLabels) {
                    ctrl.displayParams.xLabel = (labelKeys && labelKeys.length)?(labelKeys.includes(DEFAULT_X_LABEL)?DEFAULT_X_LABEL:labelKeys[0]):undefined;
                }
                $scope.possibleYLabels = $scope.possibleXLabels.slice().filter(x => x !== ctrl.displayParams.xLabel);
                $scope.possibleOtherLabels = $scope.possibleYLabels.slice().filter(x => ctrl.displayParams.yLabels?!ctrl.displayParams.yLabels.includes(x):true);
            }


            $scope.$watch("ctrl.displayParams.xLabel", function() {
                $scope.setGraphTypes();
                $scope.possibleYLabels = $scope.possibleXLabels.slice().filter(x => x !== ctrl.displayParams.xLabel);
                if (!ctrl.displayParams.yLabels || !ctrl.displayParams.yLabels.length) {
                    ctrl.displayParams.yLabels = DEFAULT_Y_LABELS.filter(l => $scope.possibleYLabels.includes(l));
                }
                if (ctrl.displayParams.yLabels && ctrl.displayParams.yLabels.length) {
                    ctrl.displayParams.yLabels = ctrl.displayParams.yLabels.filter(x => (x !== ctrl.displayParams.xLabel) && $scope.possibleYLabels.includes(x));
                }
                if (ctrl.displayParams.alsoDisplayedLabels && ctrl.displayParams.alsoDisplayedLabels.length) {
                    ctrl.displayParams.alsoDisplayedLabels = ctrl.displayParams.alsoDisplayedLabels.filter(x => x !== ctrl.displayParams.xLabel);
                }
            });

            $scope.$watch("ctrl.displayParams.yLabels", function() {
                $scope.possibleOtherLabels = $scope.possibleYLabels.slice().filter(x => !ctrl.displayParams.yLabels.includes(x));
                if (ctrl.displayParams.alsoDisplayedLabels && ctrl.displayParams.alsoDisplayedLabels.length) {
                    ctrl.displayParams.alsoDisplayedLabels = ctrl.displayParams.alsoDisplayedLabels.filter(x => !ctrl.displayParams.yLabels.includes(x));
                }
            });

            $scope.$watch("uiState.graphStyle", function(nv, ov) {
                if (nv === ov) return;
                if ('BAR' == nv) {
                    $scope.uiState._yLabels = ctrl.displayParams.yLabels;
                    ctrl.displayParams.yLabels = [];
                } else {
                    if (!ctrl.displayParams.yLabels) {
                        ctrl.displayParams.yLabels = $scope.uiState._yLabels || [];
                    }
                }
            });

            $scope.labelPrefix = function(labelKey) {
                return getDomainLabel(labelKey);
            }

            $scope.labelSuffix = function(labelKey)  {
                return getDomainSubLabel(labelKey);
            }

            $scope.computeMergedObject = function() {
                let keyObjects = _.uniqWith(ctrl.refs.map((v) => {
                    let ret = {};
                    const foundXLabel = v.labels.get(ctrl.displayParams.xLabel);
                    ret[ctrl.displayParams.xLabel] = foundXLabel?foundXLabel:null;
                    if (ctrl.displayParams.yLabels) {
                        for (let key of ctrl.displayParams.yLabels) {
                            const foundYLabel = v.labels.get(key);
                            ret[key] = foundYLabel?foundYLabel:null;
                        }
                    }
                    return ret;
                }), _.isEqual);
                $scope.mergedObjects = ctrl.refs.length - keyObjects.length;
            }

            $scope.refreshTableData = function() {
                $scope.mergedObjects = 0;
                if (ctrl.refs && ctrl.labels) {
                    $scope.tableData = ctrl.refs.map((v,i) => { v.id = i+1; v.$selected = true; return v;});
                } else if (ctrl.refs && ctrl.refs.length > 0) {
                    $scope.tableData = ctrl.refs.map((v,i) => { v.id = i+1; v.$selected = true; return v;});
                } else {
                    $scope.tableData = null;
                }
            }

            const ISO8861_RE = /\d{4}-[01]\d(-[0-3]\d(( |T)[0-2]\d(:[0-5]\d(:[0-5]\d(\.\d+([+-][0-2]\d:[0-5]\d|Z)?)?)?)?)?)?/;
            const X_VALUE_CACHE_ATTR = "_xValue";
            const DISPLAY_LABEL_CACHE_ATTR = "_displayLabel";
            const DISPLAY_LABELS_CACHE_ATTR = "_displayLabels";

            $scope.computeChartOptionsLines = function() {
                $scope.chartsOptions = ctrl.displayParams.displayedMetrics.map((currentMetric, idx) => {
                    const xAxisLabel = ctrl.displayParams.xLabel || "";
                    const yLabels = (ctrl.displayParams.yLabels && ctrl.displayParams.yLabels.length)?ctrl.displayParams.yLabels: [];
        
                    const valuesWithTag = _.filter($scope.selection.filteredSelectedObjects, item => item.labels.has(xAxisLabel)).map(item => {
                        let copy = _.cloneDeep(item);
                        copy[X_VALUE_CACHE_ATTR] = copy.labels.get(xAxisLabel);
                        return copy;
                    });
                    let isNumeric = valuesWithTag.reduce((acc,cur) => acc && !isNaN(cur[X_VALUE_CACHE_ATTR]), true);
                    let isTemporal = valuesWithTag.reduce((acc,cur) => acc && ISO8861_RE.test(cur[X_VALUE_CACHE_ATTR]), true);
                    const convertedValuesWithTag = valuesWithTag.map(v => {
                        if (!isTemporal && !isNumeric) return v;
                        let copy = _.cloneDeep(v);
                        if (isTemporal) {
                            copy[X_VALUE_CACHE_ATTR] = moment(copy[X_VALUE_CACHE_ATTR]).valueOf();
                        } else {
                            copy[X_VALUE_CACHE_ATTR] = parseFloat(copy[X_VALUE_CACHE_ATTR]);
                        }
                        return copy;
                    });
        
                    const sortedValuesWithTag = _.orderBy(convertedValuesWithTag, item => item[X_VALUE_CACHE_ATTR], 'asc');

                    sortedValuesWithTag.forEach(item => {
                        let labelValues = [];
                        let curLabels = new Map();
                        for (let curYLabel of yLabels) {
                            const found = item.labels.get(curYLabel);
                            if (found && "" != found) {
                                labelValues.push(found);
                                curLabels.set(curYLabel, found);
                            }
                        }
                        let ret = labelValues.join("-");
                        if ("" === ret) {
                            ret = "(no labels)"
                        }
                        item[DISPLAY_LABEL_CACHE_ATTR] = ret;
                        item[DISPLAY_LABELS_CACHE_ATTR] = curLabels;
                    });
                    // generate unique label list
                    let labels = _.uniq(sortedValuesWithTag.map(item => item[DISPLAY_LABEL_CACHE_ATTR]));
    
                    // assign colors to the labels
                    let labelColors = new Map();
                    labels.forEach((label,index) => {
                        labelColors.set(label, $scope.colors[index%$scope.colors.length]);
                    });

                    // let's generate line segments
                    let currentLabel = null;
                    let series = [];
                    let currentSerie = null;
                    let mapSegments = new Map();
                    let mapSegmentsLabels = new Map();

                    let evaluationColors = new Map();
                    for (const currentItem of sortedValuesWithTag) {
                        if (currentLabel != currentItem[DISPLAY_LABEL_CACHE_ATTR]) {
                            currentLabel = currentItem[DISPLAY_LABEL_CACHE_ATTR];
                            currentSerie = mapSegments.get(currentLabel);
                            if (!currentSerie) {
                                currentSerie = {
                                    data: [],
                                    name: currentLabel,
                                    type: 'line',
                                    symbol: 'roundRect',
                                    symbolSize: 5,
                                    color: labelColors.get(currentLabel)
                                };
                                series.push(currentSerie);
                                mapSegments.set(currentLabel, currentSerie);
                                mapSegmentsLabels.set(currentLabel, currentItem[DISPLAY_LABELS_CACHE_ATTR]);
                            }
                        }
                        currentSerie.data.push([currentItem[X_VALUE_CACHE_ATTR],currentItem.metrics[PMLFilteringService.metricMap[currentMetric]],currentItem["id"]]); // NOSONAR
                        evaluationColors.set(currentItem["id"], currentSerie.color);

                    }

                    $scope.colormap(evaluationColors);
                    $scope.mapSegmentsLabels = mapSegmentsLabels;
    
                    return {
                        animation: false,
                        tooltip: {
                            trigger: 'item',
                            confine: true,
                            axisPointer: { type: 'none' },
                            formatter: (params) => {
                                $scope.uiState.hoverId = (params.data && params.data.length > 2)?params.data[2]:undefined;
                                $scope.$apply();
                                const serieLabels = $scope.mapSegmentsLabels.get(params.seriesName);
                                const X = isTemporal?moment(params.data[0]).format("YYYY-MM-DDTHH:mm:ss.SSSZ"):params.data[0];
                                if (!serieLabels || !serieLabels.size) {
                                    return `${params.seriesName} - ${X}: ${params.data[1].toFixed(2)}`;
                                } else {
                                    let ret = "<table style='background: none;'><tbody>";
                                    for (const labelEntry of serieLabels) {
                                        const labelName = $sanitize(labelEntry[0]);
                                        const labelValue = $sanitize(labelEntry[1]);
                                        ret += `<tr><td>${labelName}</td><td>${labelValue}</td></tr>`;
                                    }
                                    ret += `<tr><td>X</td><td>${X}</td></tr>`;
                                    const value = $sanitize(params.data[1].toFixed(2));
                                    ret += `<tr><td>Value</td><td>${value}</td></tr>`;
                                    ret += '</tbody></table>';
                                    return ret;
                                }
                            }
                        },
                        xAxis: [{
                            type: isTemporal?'time':(isNumeric?'value':'category'),
                            axisLine: { show: true },
                            axisTick: { show: true },
                            axisLabel: ctrl.displayParams.xLabel || "",
                            scale: true
                        }],
                        yAxis: [{
                            type: 'value',
                            axisTick: { show: true },
                            axisLine: { show: true },
                            scale: true
                        }],
                        series,
                        grid: {
                            top: 10,
                            bottom: 20,
                            left: 40,
                            right: 3
                        },
                        metric: ctrl.possibleMetrics.find(x => x[0] === currentMetric)
                    };
                });
            }

            $scope.computeChartOptionsBars = function() {
                let objects;
                if (ctrl.refs && ctrl.labels) {
                    objects = ctrl.refs;
                } else {
                    objects = $scope.selection.filteredSelectedObjects;
                }
                $scope.chartsOptions = ctrl.displayParams.displayedMetrics.map((currentMetric) => {
                    const series = objects.map(
                        (v, idx) => {
                            return {
                                name: $scope.labels?$scope.labels[idx]:v.ref.runId,
                                type: 'bar',
                                data: [v.metrics[PMLFilteringService.metricMap[currentMetric]]]
                            };
                        });
                    return {
                        animation: false,
                        tooltip: {
                            trigger: 'item',
                            confine: true,
                            axisPointer: { type: 'none' },
                            formatter: (params) => {
                                return `${params.seriesName}: ${params.value.toFixed(2)}`;
                            }
                        },
                                    xAxis: [{
                            type: 'category',
                            axisLine: { show: true },
                            axisTick: { show: true }
                        }],
                        yAxis: [{
                            type: 'value',
                            axisTick: { show: true },
                            axisLine: { show: true },
                        }],
                        series,
                        color: $scope.colors,
                        grid: {
                            top: 10,
                            bottom: 20,
                            left: 40,
                            right: 0
                        },
                        metric: ctrl.possibleMetrics.find(x => x[0] === currentMetric)
                   };
                });
                const evaluationColors = new Map();
                objects.forEach((v,i) => {
                    evaluationColors.set(v.id, $scope.colors[i]);
                });
                $scope.colormap(evaluationColors);
            }

            $scope.refreshEchartsData = function() {
                if (ctrl.refs && ctrl.labels) {
                    $scope.computeChartOptionsBars();
                } else if ($scope.selection.filteredSelectedObjects && $scope.selection.filteredSelectedObjects.length) {
                    if ('LINE' === $scope.uiState.graphStyle) {
                        $scope.computeChartOptionsLines();
                    } else {
                        // 'BAR'
                        $scope.computeChartOptionsBars();
                    }
                } else {
                    $scope.chartsOptions = [];
                }
            }

            $scope.refreshCurrentMetricNames = function() {
                if (ctrl.displayParams.displayedMetrics) {
                    $scope.uiState.currentFormattedNames = ctrl.displayParams.displayedMetrics.map(cur => {
                        return {
                            key: PMLFilteringService.metricMap[cur],
                            label: ctrl.possibleMetrics.find(x => x[0] === cur)[1]
                        };
                    });
                } else {
                    $scope.uiState.currentFormattedNames = [];
                }
                $scope.refreshMetricsValues();
            }

            $scope.refreshMetricsValues = function() {
                let refs = $scope.ctrl.refs;
                if (refs) {
                    for (let item of refs) {
                        item.formattedMetrics = {};
                        for (let metric of ctrl.displayParams.displayedMetrics) {
                            item.formattedMetrics[PMLFilteringService.metricMap[metric]] = $scope.getMetricValue(item, metric);
                        }
                    }
                }
            }

            $scope.$watch("ctrl.displayParams.displayedMetrics", $scope.refreshTableData);
            $scope.$watch("ctrl.displayParams.displayedMetrics", $scope.refreshEchartsData);
            $scope.$watch("ctrl.displayParams.displayedMetrics", $scope.refreshCurrentMetricNames);
            $scope.$watch("ctrl.displayParams.xLabel", $scope.computeMergedObject);
            $scope.$watch("ctrl.displayParams.yLabels", $scope.computeMergedObject);
            $scope.$watch("ctrl.displayParams.xLabel", $scope.refreshEchartsData);
            $scope.$watch("ctrl.displayParams.yLabels", $scope.refreshEchartsData);
            $scope.$watch("selection.filteredSelectedObjects", $scope.setGraphTypes);
            $scope.$watch("selection.filteredSelectedObjects", $scope.refreshEchartsData);
            $scope.colors = window.dkuColorPalettes.discrete[0].colors.filter((x,idx) => idx%2 === 0);
            $scope.$watch("ctrl.displayParams.xLabel", $scope.generateTitleLabels);
            $scope.$watch("ctrl.displayParams.yLabels", $scope.generateTitleLabels);
            $scope.$watch("ctrl.displayParams.alsoDisplayedLabels", $scope.generateTitleLabels);


            $scope.uiState.hoverId = null;

            $scope.mouseovergraph = function(val) {
                $scope.uiState.hoverId = val.data.id;
                $scope.$digest();
            }

            $scope.mouseoutgraph = function() {
                $scope.uiState.hoverId = null;
                $scope.$digest();
            }

            $scope.colormap = function(obj) {
                $scope.uiState.colormap = obj;
            }

            $scope.styleKeyColor = function(item) {
                let color = "#FFFFFF";
                if ($scope.uiState.colormap) {
                    color = $scope.uiState.colormap.get(item.id);
                }
                return { "background-color": color };
            }


            $scope.getMetricValue = function(item,metric) {
                let ret = $filter('nicePrecision')(item.metrics[PMLFilteringService.metricMap[metric]],2);
                if (!ret) {
                    ret = '-';
                }
                return ret;
            }

            $scope.getStoreName = function(storeId) {
                if (!storeId) {
                    return null;
                }
                if (ctrl.storeList && ctrl.storeList.length) {
                    let store = ctrl.storeList.find(s => s.id === storeId);
                    if (store) {
                        return store.name;
                    }
                }
                return storeId;
            }

            $scope.addFocusedGraphLabel = function(label) {
                if (ctrl.displayParams.pinnedMetrics.includes(label)) return;
                ctrl.displayParams.pinnedMetrics.push(label);
            }

            $scope.removeFocusedGraphLabel = function(label) {
                ctrl.displayParams.pinnedMetrics = ctrl.displayParams.pinnedMetrics.filter(e => e !== label);
            }

            $scope.showBigGraph = function(label) {
                return ctrl.displayParams.pinnedMetrics.includes(label);
            }

            $scope.firstMetricOfDomain = function(label) {
                const labels = $scope.uiState.currentFormattedNames.map(metric => metric.label);
                return [
                    labels.find(l => $scope.showBigGraph(l)),
                    labels.find(l => !$scope.showBigGraph(l))
                ].includes(label);
            }
        }
    ]
});

app.controller("ModelEvaluationStoreEvaluationController", function($scope, DataikuAPI, $q, CreateModalFromTemplate, $state, $stateParams, TopNav, $controller, PMLFilteringService, PMLSettings, ActiveProjectKey, ModelEvaluationUtils){
    $controller("ModelEvaluationsMetricsHandlingCommon", {$scope, PMLFilteringService, PMLSettings});
    $scope.noMlReportTourHere = true; // the tabs needed for the tour are not present

    TopNav.setLocation(TopNav.TOP_FLOW, TopNav.ITEM_MODEL_EVALUATION_STORE, "MODEL_EVALUATION_STORE-EVALUATION", "report");
    TopNav.setItem(TopNav.ITEM_MODEL_EVALUATION_STORE, $stateParams.mesId, {runId: $stateParams.runId});

    $scope.refreshStatus = function() {
        DataikuAPI.modelevaluationstores.getEvaluation(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId).success(function(data) {
            $scope.mesContext.evaluationFullInfo = data.evaluation;

            $scope.versionsContext.activeMetric = data.evaluation.evaluation.metricParams.evaluationMetric;
            $scope.evaluation = data.evaluation;
            $scope.refreshMetrics($scope.evaluation.evaluation.predictionType);
            TopNav.setItem(TopNav.ITEM_MODEL_EVALUATION_STORE, $stateParams.mesId, {name: data.modelEvaluationStore.name, runId: $stateParams.runId});

            $scope.modelData = data.evaluation.details;
            $scope.modelData.modelEvaluation = data.evaluation.evaluation;
            $scope.evaluatedDataStatistics = data.evaluation.evaluatedDataStatistics;
            $controller("_PredictionModelReportController",{$scope:$scope});

            $scope.isPartitionedModel = function() { return false; };

            let fme = makeFullModelEvalutionIdString(ActiveProjectKey.get(), $stateParams.mesId, $stateParams.runId);
            DataikuAPI.modelevaluations.get(fme).success(function(data) {
                $scope.modelEvaluation = data;
                $scope.fullModelEvaluationId = fme;
                $scope.currentMEReference = ModelEvaluationUtils.makeRefDisplayItemFromEvaluation($scope.modelEvaluation, $scope.storeList);
            }).error(setErrorInScope.bind($scope));
            DataikuAPI.modelevaluations.listCompatibleReferencesForDrift(ActiveProjectKey.get(), fme, false).success(function(data) {
                $scope.compatibleReferences = ModelEvaluationUtils.computeReferenceLabels(ModelEvaluationUtils.makeRefDisplayItemFromModelLikeInfo(data.compatibleReferences, $scope.storeList, $scope.modelList));
                $scope.driftState.selectedReference = $scope.driftState.selectedReference || $scope.compatibleReferences.find(me => data.defaultReference && me.ref.fullId == data.defaultReference.fullId);
            }).error(setErrorInScope.bind($scope));
            if ($scope.modelData.classes) {
                $scope.driftState.currentClass = $scope.modelData.classes[0];
            }
        }).error(setErrorInScope.bind($scope));
    };
    $scope.refreshStatus();

    $scope.driftState = {
        selectedReference: null
    };

    $scope.resetDriftResults = function(nv, ov) {
        if (nv != ov) {
            $scope.driftState.dataDriftResult = null;
            $scope.driftState.perfDriftRefs = null;
            $scope.driftState.pdfs = null;
            $scope.driftState.pdd = null;
            $scope.driftState.refDensityData = null;
            $scope.driftState.refPredValueCount = null;
            $scope.driftState.curPredValueCount = null;
            $scope.driftState.univariateCols = [];
            $scope.driftState.predHistogramOptions = null;
            $scope.driftState.classes = null;
        }
    }
    $scope.resetDriftResults();

    $scope.refreshCurrentMEReference = function() {
        $scope.currentMEReference = ModelEvaluationUtils.makeRefDisplayItemFromEvaluation($scope.modelEvaluation, $scope.storeList);
    }

    DataikuAPI.modelevaluationstores.listWithAccessible($stateParams.projectKey).success(function(data){
        $scope.storeList = data;
    });

    DataikuAPI.savedmodels.listWithAccessible($stateParams.projectKey).success(function(data){
        $scope.modelList = data;
    });

    $scope.$watch('driftState.selectedReference', $scope.resetDriftResults);
    $scope.$watch('modelEvaluation', $scope.refreshCurrentMEReference);
    $scope.$watch('storeList', $scope.refreshCurrentMEReference);

    $scope.$watch('storeList', $scope.refreshCompatibleReferences);
    $scope.$watch('modelList', $scope.refreshCompatibleReferences);

    $scope.$on("$destroy", function() {
        $scope.mesContext.evaluationFullInfo = null;
    });
    
});


/************************** creation modal ***************************/

app.controller("NewModelEvaluationStoreController", function($scope, $state, DataikuAPI, WT1, $stateParams) {
    WT1.event("new-model-evaluation-store-modal-open");

    $scope.newMES = {
        name : null,
        settings : {
            zone: $scope.getRelevantZoneId($stateParams.zoneId)
        }
    };

    DataikuAPI.datasets.getModelEvaluationStoreOptionsNoContext($stateParams.projectKey).success(function(data) {
        $scope.managedDatasetOptions = data;
        $scope.partitioningOptions = [
            {"id" : "NP", "label" : "Not partitioned"},
        ].concat(data.projectPartitionings)

        $scope.newMES.settings.partitioningOptionId = "NP";
    }).error(setErrorInScope.bind($scope));

    $scope.create = function(){
        resetErrorInScope($scope);
        WT1.event("new-model-evaluation-store-modal-create");
        DataikuAPI.datasets.newModelEvaluationStore($stateParams.projectKey, $scope.newMES.name, $scope.newMES.settings).success(function(data) {
            $scope.dismiss();
            $state.go("projects.project.modelevaluationstores.modelevaluationstore.evaluations", {mesId: data.id})
        }).error(setErrorInScope.bind($scope));
    }
});

/******************** evaluated data statistics  ********************/
app.directive('evaluatedDataStatistics', function($controller, $state, $stateParams, $rootScope) {
    return {
        scope: false,
        link : function($scope, element, attrs) {
            $scope.uiState = {};
            
            $scope.selection = $.extend({
                    filterQuery: {
                        userQuery: ''
                    },
                    filterParams: {
                        userQueryTargets: ["column", "type", "featureType", "featureRole"],
                        propertyRules: {}
                    },
                    orderQuery: "column",
                    orderReversed: false,
                }, $scope.selection || {});

            $scope.columnList = []; // lighter objects for the list where you select columns, to ease the load on angular watches
            let updateUnivariatesList = function() {
                $scope.univariatesMap = {};
                $scope.columnList.splice(0, $scope.columnList.length);
                if ($scope.evaluatedDataStatistics && $scope.evaluatedDataStatistics.univariate) {
                    Object.keys($scope.evaluatedDataStatistics.univariate).forEach(function(k) {
                        let statistics = $scope.evaluatedDataStatistics.univariate[k];
                        let facet = $scope.evaluation.columns[k] || {};
                        // put a fake "cache" in there, so that the column-analysis directive doesn't do a call to fetch the data
                        let row = {column:k, statistics:statistics, cache:{}};
                        let columnRow = {column:k, type:statistics.type, featureType:statistics.featureType, featureRole:statistics.featureRole};
                        row.isNumeric = statistics.type == 'numeric' || statistics.type == 'date';
                        row.isDate = statistics.type == 'date';
                        row.cache[k] = facet;
                        $scope.univariatesMap[k] = row;
                        $scope.columnList.push(columnRow)
                    });
                }
            };
            $scope.$watch('evaluatedDataStatistics.univariate', updateUnivariatesList, false);
        }
    };
});
})();
