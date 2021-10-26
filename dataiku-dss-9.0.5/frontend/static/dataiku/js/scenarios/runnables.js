(function(){
'use strict';


var app = angular.module('dataiku.runnables',[]);

app.controller("RunnableCoreController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav) {

});

app.controller("RunnablesListController", function($scope, $controller, $stateParams, DataikuAPI, $state, TopNav, CreateModalFromTemplate, ProgressStackMessageBuilder, WT1, Dialogs, $q, $timeout, FutureWatcher) {
    TopNav.setLocation(TopNav.TOP_MORE, "runnables", TopNav.TABS_RUNNABLE, null);
    TopNav.setNoItem();

    $scope.runnables = [];
    const refreshList = function () {
        DataikuAPI.runnables.listAccessible($stateParams.projectKey).success(function(data) {
            const runnables = data.runnables
                .filter(runnable => {
                    return !runnable.desc.macroRoles
                        || runnable.desc.macroRoles.length === 0
                        || runnable.desc.macroRoles.some(macroRole => macroRole.type === 'PROJECT_MACROS');
                })
                .sort((first, second) => {
                    const firstName = first.desc.meta.label || first.id;
                    const secondName = second.desc.meta.label || second.id;
                    return firstName.localeCompare(secondName);
                })
                .reduce((map, obj) => {
                    const cat = (obj.desc && obj.desc.meta && obj.desc.meta.category) || 'Misc';
                    (map[cat] = map[cat] || []).push(obj);
                    return map;
                }, {});

            let miscRunnables  = [];
            let categorizedRunnables = [];

            $.each(runnables, function (category, runnables) {
                if (category === 'Misc') {
                    miscRunnables = runnables;
                } else {
                    categorizedRunnables.push({
                        label: category,
                        items: runnables
                    });
                }
            });

            categorizedRunnables.sort((a, b) => a.label.localeCompare(b.label));

            $scope.miscRunnables = miscRunnables;
            $scope.categorizedRunnables = categorizedRunnables;
            initializeFilteredCategories();
        }).error(setErrorInScope.bind($scope));
    };
    refreshList();

    function initializeFilteredCategories () {
        $scope.filteredCategories = ($scope.categorizedRunnables || []).map(category => ({
            label: category.label,
            enabled: true,
            macros: category.items.map(macro => ({macro: macro, enabled: true}))
        }));
    }

    $scope.hasEnabledMacros = function (category) {
        return category.macros.some(macro => macro.enabled);
    };

    $scope.anyMacroAvailable = function () {
        return ($scope.filteredCategories || [])
            .filter(category => category.enabled)
            .some(category => $scope.hasEnabledMacros(category));
    };

    $scope.noCategoryFiltered = function () {
        return ($scope.filteredCategories || []).every(category => category.enabled);
    };

    $scope.resetFilter = function() {
        $scope.filteredCategories.forEach(category => category.enabled = true);
    };

    $scope.selectCategory = function (category) {
        // Unselect all categories if it is the first click (ie. all categories are enabled)
        if ($scope.filteredCategories.every(category => category.enabled)) {
            $scope.filteredCategories.forEach(category => category.enabled = false);
        }

        category.enabled = !category.enabled;

        // If the click unselects the last category than we reset the filter
        if ($scope.filteredCategories.every(category => !category.enabled)) {
            $scope.resetFilter();
        }
    };

    function searchMacros(oldValue, newValue) {
        if (oldValue === newValue || ! $scope.filteredCategories) return;
        const searchText = $scope.searchQuery.toLowerCase();
        for (let category of $scope.filteredCategories) {
            for (let macroWrapper of category.macros) {
                macroWrapper.enabled =
                    macroWrapper.macro.desc.meta.label.toLowerCase().includes(searchText)
                    || macroWrapper.macro.desc.meta.description.toLowerCase().includes(searchText);
            }
        }
    }

    $scope.$watch("searchQuery", searchMacros);

    $scope.$watch("appConfig.customRunnables", refreshList);

});

app.controller("RunnableController", function ($scope, $rootScope, $controller, $stateParams, $anchorScroll, Assert, Fn, DataikuAPI, $state, TopNav,
                                               PluginConfigUtils, CreateModalFromTemplate, ProgressStackMessageBuilder, ProjectFolderContext,
                                               WT1, Dialogs, $q, $timeout, FutureWatcher, LocalStorage) {
    let localStorageKey, localStorageAdminKey;

    function fillRoleTarget() {
        if (angular.isDefined($scope.targetKey) && angular.isDefined($scope.targetValue)) {
            if (angular.isArray($scope.targetKey) && angular.isArray($scope.targetValue)) {
                for (let i = 0; i < $scope.targetValue.length; i++) {
                    $scope.runnable.$config[$scope.targetKey[i]] = $scope.targetValue[i];
                }
            } else {
                $scope.runnable.$config[$scope.targetKey] = $scope.targetValue;
            }
        }
    }

    function init() {
        $scope.runnable.$config = $scope.runnable.$config || {};
        $scope.runnable.$adminConfig = $scope.runnable.$adminConfig || {};
        $scope.desc = $scope.runnable.desc;

        PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.runnable.$config);
        PluginConfigUtils.setDefaultValues($scope.desc.adminParams, $scope.runnable.$adminConfig);

        /* In addition to default values, set properly the columns stuff */
        $scope.desc.params.forEach(function(param) {
            if ($scope.runnable.$config[param.name] === undefined && param.type === "DATASETS") {
                // the dku-list-typeahead expects something not null
                $scope.runnable.$config[param.name] = [];
            }
        });

        $scope.pluginDesc = $rootScope.appConfig.loadedPlugins.filter(function (x) {
            return x.id == $scope.runnable.ownerPluginId;
        })[0];

        $scope.icon = $scope.runnable.desc.meta.icon || ($scope.pluginDesc.meta ? $scope.pluginDesc.meta.icon : 'icon-gears');

        const hasRegularParams = $scope.desc.params && $scope.desc.params.length > 0;
        const hasAdminParams = $scope.desc.adminParams && $scope.desc.adminParams.length > 0;
        const hasCustomForm = $scope.desc.paramsTemplate && $scope.desc.paramsTemplate.length > 0;
        $scope.hasSettings = $scope.pluginDesc.hasSettings || hasRegularParams || hasAdminParams || hasCustomForm;

        $scope.runOutput = {};

        localStorageKey = $stateParams.projectKey + "." + $scope.runnable.runnableType;
        localStorageAdminKey = localStorageKey + ".admin";

        const old = LocalStorage.get(localStorageKey);
        if (old) {
            angular.extend($scope.runnable.$config, old);
        }

        const oldAdmin = LocalStorage.get(localStorageAdminKey);
        if (oldAdmin) {
            angular.extend($scope.runnable.$adminConfig, oldAdmin);
        }

        fillRoleTarget();
    }

    $scope.$watch("runnable", Fn.doIfNv(init));

    $scope.resetSettings = function () {
        $scope.runnable.$config = {};
        $scope.runnable.$adminConfig = {};
        PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.runnable.$config);
        PluginConfigUtils.setDefaultValues($scope.desc.adminParams, $scope.runnable.$adminConfig);

        if ($scope.runnable.$config) {
            LocalStorage.set(localStorageKey, $scope.runnable.$config);
        }
        if ($scope.runnable.$adminConfig) {
            LocalStorage.set(localStorageAdminKey, $scope.runnable.$adminConfig);
        }
        fillRoleTarget();
    };

    $scope.closing = false;
    $scope.canCloseModal = function() {
        if (!$scope.closing && $scope.runState && $scope.runState.running) {
            $scope.closing = true;
            const modalScope = $scope.$new();
            modalScope.canCloseModal = true; // otherwise inherits the method from the present scope
            CreateModalFromTemplate('/templates/macros/exit-runnable-modal.html', modalScope, null, function(newScope) {
                newScope.abortMacro = function() {
                	if ($scope.runState && $scope.runState.running) {
                		// no need to abort if macro is already done
                		$scope.abort($scope.runnable);
                	}
                	newScope.dismiss();
                	$scope.dismiss();
                };
                newScope.keepMacro = function() {
                	newScope.dismiss();
                	$scope.dismiss();
                };
                newScope.cancelClose = function() {
                    $scope.closing = false;
                	newScope.dismiss();
                };
            });
            return false;
        } else {
            return true;
        }
    };

    $scope.$on('runnable-run', function (event, data) {
        if (angular.equals(data, $scope.runnable) && $scope.runnable.$config) {
            LocalStorage.set(localStorageKey, $scope.runnable.$config);
        }
        if (angular.equals(data, $scope.runnable) && $scope.runnable.$adminConfig) {
            LocalStorage.set(localStorageAdminKey, $scope.runnable.$adminConfig);
        }
    });

    $scope.runState = { running: false };

    $scope.run = function(runnable) {
        $scope.$emit('runnable-run', $scope.runnable); // to trigger the config save
        WT1.event("runnable-run", {type : runnable.runnableType});
        $scope.runState.running = true;
        var runCall;
        if ($scope.mode == "PROJECT_CREATION") {
            runCall = DataikuAPI.runnables.projectCreationRun(runnable.runnableType, runnable.$config, ProjectFolderContext.getCurrentProjectFolderId());
        } else if ($scope.insight) {
            runCall = DataikuAPI.runnables.insightRun($stateParams.projectKey, $scope.insight.id);
        } else if ($scope.cluster) {
            runCall = DataikuAPI.runnables.clusterRun($stateParams.clusterId, runnable.runnableType, runnable.$config, runnable.$adminConfig);
        } else {
            runCall = DataikuAPI.runnables.manualRun($stateParams.projectKey, runnable.runnableType, runnable.$config, runnable.$adminConfig);
        }
        runCall.success(function(initialResponse) {
            $scope.runState.jobId = initialResponse.jobId;
            $scope.runOutput.resultType = null;
            $scope.runOutput.resultData = null;
            $scope.runOutput.error = null;
            $scope.runOutput.failure = null;
            $scope.runOutput.logTail = null;
            var fillResultFields = function(data) {

                $scope.runOutput.aborted = data.aborted;
                $scope.runOutput.resultType = data.result.type;
                $scope.runOutput.resultData = data.result.data;
                $scope.runOutput.resultLabel = data.result.label;
                $scope.runOutput.error = data.result.error;
                $scope.runOutput.failure = data.result.failure;
                $scope.runOutput.logTail = data.result.logTail;
                $scope.runState.percentage = null;
                $scope.runState.stateLabels = null;
                $scope.runOutput.showResult = true;
                // prepare it for api-error-alert
                if ($scope.runOutput.error) {
                    $scope.runOutput.error.errorType = $scope.runOutput.error.clazz;
                }
                if ($scope.runOutput.failure) {
                    $scope.runOutput.failure.errorType = $scope.runOutput.failure.clazz;
                }

                if ($scope.mode == "PROJECT_CREATION" && data.result.data) {
                    const dataObj = data.result.data.object;
                    $scope.dismiss();
                    $state.go("projects.project.home.regular", {projectKey: dataObj.projectKey})
                }

            };
            if (initialResponse.hasResult) {
                $scope.runState.running = false;
                fillResultFields(initialResponse);
            } else {
                FutureWatcher.watchJobId(initialResponse.jobId)
                    .success(function(data) {
                        $scope.runState.running = false;
                        fillResultFields(data);
                    }).update(function(data){
                    $scope.runState.percentage  = ProgressStackMessageBuilder.getPercentage(data.progress);
                    $scope.runState.stateLabels = ProgressStackMessageBuilder.build(data.progress, true);
                }).error(function(data, status, headers) {
                    $scope.runState.running = false;
                    setErrorInScope.bind($scope)(data, status, headers);
                }).finally(function() {
                    if ($scope.mode != "PROJECT_CREATION") {
                        $timeout(() => $('.runnable-modal .modal-body div.oa').scrollTop($('.runnable-modal .modal-body div.oa').scrollTop() + $('#runnable-output').position().top - 20), 100);
                    }
                });
            }
        }).error(function(a, b, c) {
            $scope.runState.running = false;
            $scope.runOutput.error = a;

        }).finally(function() {
            $timeout(() => $('.runnable-modal .modal-body div.oa').scrollTop($('.runnable-modal .modal-body div.oa').scrollTop() + $('#runnable-output').position().top - 20), 100);
        });
    };

    $scope.abort = function(runnable) {
        DataikuAPI.futures.abort($scope.runState.jobId).success(function(data) {
            WT1.event("runnable-abort", {type : runnable.runnableType});
        }).error(setErrorInScope.bind($scope));
    };
});

app.directive("runnableRunButton", function($stateParams, DataikuAPI, FutureWatcher, ProgressStackMessageBuilder, WT1){
    return {
        scope : {
            runnable : '=',
            insight : '=',
            cluster : '=',
            runOutput : '='
        },
        templateUrl : '/templates/scenarios/runnable-run-button.html',
        replace : true,
        link : function($scope, element, attrs) {
            $scope.runState = {};
            $scope.run = function(runnable) {
                $scope.$emit('runnable-run', $scope.runnable); // to trigger the config save
                WT1.event("runnable-run", {type : runnable.runnableType});
                $scope.runState.running = true;
                var runCall;
                if ($scope.insight) {
                    runCall = DataikuAPI.runnables.insightRun($stateParams.projectKey, $scope.insight.id);
                } else if ($scope.cluster) {
                    runCall = DataikuAPI.runnables.clusterRun($stateParams.cluster.id, runnable.runnableType, runnable.$config, runnable.$adminConfig);
                } else {
                    runCall = DataikuAPI.runnables.manualRun($stateParams.projectKey, runnable.runnableType, runnable.$config, runnable.$adminConfig);
                }
                runCall.success(function(initialResponse) {
                    $scope.runState.jobId = initialResponse.jobId;
                    $scope.runOutput.resultType = null;
                    $scope.runOutput.resultData = null;
                    $scope.runOutput.error = null;
                    $scope.runOutput.failure = null;
                    $scope.runOutput.logTail = null;
                    var fillResultFields = function(data) {
                        $scope.runOutput.aborted = data.aborted;
                        $scope.runOutput.resultType = data.result.type;
                        $scope.runOutput.resultData = data.result.data;
                        $scope.runOutput.resultLabel = data.result.label;
                        $scope.runOutput.error = data.result.error;
                        $scope.runOutput.failure = data.result.failure;
                        $scope.runOutput.logTail = data.result.logTail;
                        $scope.runState.percentage = null;
                        $scope.runState.stateLabels = null;
                        $scope.runOutput.showResult = true;
                        // prepare it for api-error-alert
                        if ($scope.runOutput.error) {
                            $scope.runOutput.error.errorType = $scope.runOutput.error.clazz;
                        }
                        if ($scope.runOutput.failure) {
                            $scope.runOutput.failure.errorType = $scope.runOutput.failure.clazz;
                        }
                    };
                    if (initialResponse.hasResult) {
                        $scope.runState.running = false;
                        fillResultFields(initialResponse);
                    } else {
                        FutureWatcher.watchJobId(initialResponse.jobId)
                            .success(function(data) {
                                $scope.runState.running = false;
                                fillResultFields(data);
                            }).update(function(data){
                            $scope.runState.percentage  = ProgressStackMessageBuilder.getPercentage(data.progress);
                            $scope.runState.stateLabels = ProgressStackMessageBuilder.build(data.progress, true);
                        }).error(function(data, status, headers) {
                            $scope.runState.running = false;
                            setErrorInScope.bind($scope)(data, status, headers);
                        });
                    }
                }).error(function(a, b, c) {
                    $scope.runState.running = false;
                    $scope.runOutput.error = a;
                    setErrorInScope.bind($scope)(a,b,c);
                });
            };

            $scope.abort = function(runnable) {
                DataikuAPI.futures.abort($scope.runState.jobId).success(function(data) {
                    WT1.event("runnable-abort", {type : runnable.runnableType});
                }).error(setErrorInScope.bind($scope));
            };
        }
    };
});

app.directive("runnableResult", function($stateParams, DataikuAPI, PluginConfigUtils, $rootScope, $timeout,ExportUtils){
    return {
        scope : {
            resultData : '=',
            resultType : '=',
            resultLabel : '=',
            runnable : '=',
            scenarioRun : '=',
            stepRun : '='
        },
        templateUrl : '/templates/scenarios/runnable-result.html',
        replace : true,
        link : function($scope, element, attrs) {
            // 2 possible contexts : in a runnable (then runnable != null) or in a stepRun (then scenarioRun and stepRun != null)
            $scope.loaded = null;
            $scope.previewedItem = null;
            var update = function() {
                if ($scope.resultType == 'FOLDER_FILE') {
                    $scope.odb = {id:$scope.resultData.folderId};
                    $scope.skinState = {itemSkins:[]};
                    DataikuAPI.managedfolder.previewItem($stateParams.projectKey, $stateParams.projectKey, $scope.odb.id, $scope.resultData.itemPath).success(function(data){
                        $scope.previewedItem = data;
                    }).error(setErrorInScope.bind($scope));
                } else if ($scope.resultType == 'URL') {

                } else if ($scope.resultType == 'FILE') {
                    if ($scope.runnable != null) {
                        $scope.downloadUrl = DataikuAPI.runnables.getDownloadURL($stateParams.projectKey, $scope.runnable.runnableType, $scope.resultData, $stateParams.clusterId);
                    } else if ($scope.scenarioRun != null && $scope.stepRun != null) {
                        $scope.downloadUrl = DataikuAPI.scenarios.getDownloadURL($stateParams.projectKey, $scope.scenarioRun.scenario.id, $scope.scenarioRun.runId, $scope.stepRun.step.name, $scope.resultData);
                    }
                } else if ($scope.resultType == 'HTML') {
                    // if lighter than 1Ko, then it was inlined
                    if ($scope.resultData.type == 'INLINE_HTML') {
                        $scope.loaded = $scope.resultData.data;
                    } else {
                        if ($scope.runnable != null) {
                            DataikuAPI.runnables.loadKeptFile($stateParams.projectKey, $scope.runnable.runnableType, $scope.resultData, $stateParams.clusterId).success(function(data){
                                $scope.loaded = data[0]; // sent as json, so it's the 1st element in a list
                            }).error(setErrorInScope.bind($scope));
                        } else if ($scope.scenarioRun != null && $scope.stepRun != null) {
                            DataikuAPI.scenarios.loadKeptFile($stateParams.projectKey, $scope.scenarioRun.scenario.id, $scope.scenarioRun.runId, $scope.stepRun.step.name, $scope.resultData).success(function(data){
                                $scope.loaded = data[0]; // sent as json, so it's the 1st element in a list
                            }).error(setErrorInScope.bind($scope));
                        }
                    }
                } else if ($scope.resultType == "RESULT_TABLE") {
                    if ($scope.resultData.type == "INLINE_RESULT_TABLE") {
                        $scope.resultTable = $scope.resultData.table;
                    } else {
                        if ($scope.runnable != null) {
                            DataikuAPI.runnables.loadKeptFile($stateParams.projectKey, $scope.runnable.runnableType, $scope.resultData, $stateParams.clusterId).success(function(data){
                                $scope.resultTable = JSON.parse(data[0]); // sent as json, so it's the 1st element in a list
                            }).error(setErrorInScope.bind($scope));
                        } else if ($scope.scenarioRun != null && $scope.stepRun != null) {
                            DataikuAPI.scenarios.loadKeptFile($stateParams.projectKey, $scope.scenarioRun.scenario.id, $scope.scenarioRun.runId, $scope.stepRun.step.name, $scope.resultData).success(function(data){
                                $scope.resultTable = JSON.parse(data[0]); // sent as json, so it's the 1st element in a list
                            }).error(setErrorInScope.bind($scope));
                        }
                    }
                }
            };
            update();

            function downloadHTMLBlob(data) {
                var blob = new Blob([data], {type: "octet/stream"});
                var url = window.URL.createObjectURL(blob);

                var a = document.createElement("a");
                a.style.display = "none";
                document.body.appendChild(a);

                a.href = url;
                a.download = "report.html";
                a.click();

                //give Firefox time...
                setTimeout(function(){
                    window.URL.revokeObjectURL(url);
                }, 1000);
            }

            $scope.downloadHtml = function() {
                if ($scope.resultType == 'HTML') {
                    $timeout(function() {downloadHTMLBlob($scope.loaded);});
                }
            };
            function prepareColumnValueForExport(idx, field) {
                var type = $scope.resultTable.columns[idx].type;
                switch (type){
                    case 'LOCAL_DATASET_WITH_TYPE':
                    case 'FQ_DATASET_WITH_TYPE':
                        return field.split(':')[1];
                    case 'STRING_LIST':
                        return field.join(',');
                    default :
                        return field;
                }
            }
            function resultTableTypeToDSSType(c) {
                // Simplification
                return "string";
            }

            $scope.exportResultTable = function () {
                ExportUtils.exportUIData($scope, {
                    name : "Result of " + $scope.resultTable.name,
                    columns: $scope.resultTable.columns.map(function (c) {
                        var type = resultTableTypeToDSSType(c);
                        return {name:c.displayName, type:type}
                    }),
                    data : $scope.resultTable.records.map(function (r) {
                        return r.map(function (field, idx) {
                            return prepareColumnValueForExport(idx, field);
                        });
                    })

                }, "Export macro result");

            };

            $scope.downloadResultTableAsHTML = function(){
                var html = "<table>";
                html += "<tr>"
                $scope.resultTable.columns.forEach(function(col){
                    html += "<th>" + col.displayName + "</th>";
                });
                html += "</tr>"
                $scope.resultTable.records.forEach(function(rec, recIdx){
                    html += "<tr>";
                    rec.forEach(function(cell, cellIdx){
                        html += "<td>" + prepareColumnValueForExport(cellIdx,cell) + "</td>";
                    });
                    html += "</tr>";
                });
                html += "</table>"
                downloadHTMLBlob(html);
            }

            $scope.$watch("resultType", update);
            $scope.$watch("resultData", update);
        }
    };
});


})();
