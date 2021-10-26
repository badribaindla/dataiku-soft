(function() {
'use strict';

const app = angular.module('dataiku.webapps');

app.controller("CustomWebAppEditController", function($scope, $stateParams, Assert, WT1, TopNav, WebAppsService, DataikuAPI, CreateModalFromTemplate) {
    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'webapps', null, 'edit');
    Assert.inScope($scope, "app");

    WT1.event("custom-webapp-edit", {webappType: $scope.app.type});

    $scope.loadedDesc = WebAppsService.getWebAppLoadedDesc($scope.app.type);
    $scope.desc = $scope.loadedDesc.desc;

    if ($scope.app.apiKey) {
        let accessibleDatasets;
        function updateAccessibleDatasets() {
            DataikuAPI.webapps.getDatasetPrivileges($stateParams.projectKey, $scope.app.apiKey).success(function(data) {
                accessibleDatasets = data.datasets.filter(dp => {
                    return Object.values(dp).some(privilege => privilege === true); // dataset with any privilege
                }).map(dp => dp.datasetName);
                checkAccessibleDatasets();
            }).error(setErrorInScope.bind($scope));
        }
        function checkAccessibleDatasets() {
            if (!accessibleDatasets) {
                return;
            }
            const datasetParams = $scope.desc.params.filter(p => p.type == 'DATASET').map(p => p.name);
            let usedDatasets = datasetParams.map(p => $scope.app.config[p]);
            usedDatasets = usedDatasets.filter((d, i) => usedDatasets.indexOf(d) == i); //dedup
            $scope.unauthorisedUsedDatasets = usedDatasets.filter(d => d && !accessibleDatasets.includes(d));
        }
        updateAccessibleDatasets();

        if (!$scope.app.isVirtual) {
            DataikuAPI.security.listUsers().success(function(data) {
                $scope.allUsers = data;
            }).error(setErrorInScope.bind($scope));
        }

        $scope.$watch('app.config', checkAccessibleDatasets, true);

        $scope.showSettingsModal = function(){
            CreateModalFromTemplate("/templates/webapps/web-app-security-modal.html", $scope).then(updateAccessibleDatasets);
        };
    }
});

app.controller("WebAppEditController", function($scope, $rootScope, $stateParams, $state, $q, $timeout, $controller, Assert, CreateModalFromTemplate, ActivityIndicator, DataikuAPI, WT1, TopNav, FutureWatcher) {
    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'webapps', null, 'edit');

    Assert.inScope($scope, "app");

    $scope.setupTypeSpecificWebAppBehaviour();

    DataikuAPI.security.listUsers().success(function(data) {
        $scope.allUsers = data;
    }).error(setErrorInScope.bind($scope));

    $scope.$on("paneSelected", function(evt, pane) {
        $scope.paneSlug = pane.slug;
    });

    $scope.showSettingsModal = function(){
        CreateModalFromTemplate("/templates/webapps/web-app-security-modal.html", $scope);
    };

    $scope.selectPanes = function(selectPanes) {
        if (selectPanes && selectPanes.length == 2) {
            $scope.editorPanes[0].state.activeTab = selectPanes[0];
            $scope.editorPanes[0].state.paneVisible = true;
            $scope.editorPanes[1].state.activeTab = selectPanes[1];
            $scope.editorPanes[1].state.paneVisible = true;
            $scope.editorPanes[1].state.rightmost = true;
            $scope.editorState = 'splitted';
        }
    };

    $scope.insertSnippet_ = function(snippet) {
        for (var i in snippet.variations) {
            var currentVariation = snippet.variations[i];
            if (typeof(currentVariation.code)!=='undefined') {
                switch (currentVariation.id) {
                    case 'js':
                        $scope.app.params.js += '\n\n\n' + currentVariation.code.replace("__INSIGHT_API_KEY__", $scope.app.apiKey);
                        break;
                    case 'html':
                        $scope.app.params.html += '\n\n\n' + currentVariation.code;
                        break;
                    case 'css':
                        $scope.app.params.css += '\n\n\n' + currentVariation.code;
                        break;
                    case 'py':
                        $scope.app.params.python += '\n' + currentVariation.code;
                        break;
                    case 'ui':
                        $scope.app.params.ui += '\n\n' + currentVariation.code;
                        break;
                    case 'server':
                        $scope.app.params.server += '\n\n' + currentVariation.code;
                        break;
                }
            }
        }
        if (snippet.libraries) {
            for (var lib in snippet.libraries) {
                $scope.libraries[snippet.libraries[lib]] = true;
            }
        }
        $scope.selectPanes(snippet.selectPanes);
    }

    $scope.insertPythonSnippet_ = function(snippetVariation) {
        if (typeof(snippetVariation.code) !== 'undefined') {
            $scope.app.params.python += '\n' + snippetVariation.code;
        }
    }

    /* ********************* Main handling ******************** */


    $scope.disablePythonBackend = function() {
        $scope.app.pyBackendEnabled = false;
        $scope.app.pyBackendMustRun =  false;
        $scope.saveWebApp(true, true);
    };
    $scope.enablePythonBackend = function() {
        $scope.app.params.backendEnabled = true;

        // Adding some example in case no python file specified in template (or empty)
        if (!$scope.app.params.python) {
            $scope.app.params.python =  "# Example:\n";
            $scope.app.params.python += "# From JavaScript, you can access the defined endpoints using\n";
            $scope.app.params.python += "# getWebAppBackendUrl('first_api_call')\n\n";
            $scope.app.params.python += "@app.route('/first_api_call')\ndef first_call():\n";
            $scope.app.params.python += "    return json.dumps({\"status\" : \"ok\", \"data\" : [1,2,3]})\n";
        }
        // and the snippet in the js
        if ($scope.app.params.python.includes('first_api_call') && !$scope.app.params.js.includes('first_api_call')) {
        	$scope.app.params.js += "$.getJSON(getWebAppBackendUrl('/first_api_call'), function(data) {\n";
        	$scope.app.params.js += "    console.log('Received data from backend', data)\n";
        	$scope.app.params.js += "    const output = $('<pre />').text('Backend reply: ' + JSON.stringify(data));\n";
        	$scope.app.params.js += "    $('body').append(output)\n";
        	$scope.app.params.js += "});\n";
        }

        $scope.saveWebAppWithCode();
    };

    $scope.refreshBackendLog = function() {
        DataikuAPI.webapps.getBackendState($scope.app)
        .success(function(result) {
            $scope.setBackendLogs(result);
            $timeout(scrollDownLogs);
        }).error(setErrorInScope.bind($scope));
    };

    function scrollDownLogs() {
        var smartLogTailContent = $('.smart-log-tail-content');
        if (smartLogTailContent.length > 0) {
            smartLogTailContent.scrollTop(smartLogTailContent[0].scrollHeight);
        }
    }

    function focusPreviewOrLogsTab() {
        if (!$scope.editorPanes) return; // not ready for tab switching yet
        if ($scope.errorsInLogs) {
            $scope.editorPanes[1].state.activeTab = 'BACKEND_LOG';
            $timeout(scrollDownLogs);
        } else {
            $scope.editorPanes[1].state.activeTab = 'OUTPUT';
        }
    }
    $scope.$on("previewDataUpdated", focusPreviewOrLogsTab);


    $scope.restartBackend = function(app) {
        $scope.saveWebAppWithCode(null, true);
        $rootScope.$broadcast('backendRestarted');
    };

    $scope.hooks.save = $scope.saveWebAppWithCode;

    var currentCommitMessage;
    $scope.saveWithCustomCommitMessage = function(){
        var deferred = $q.defer();

        CreateModalFromTemplate("/templates/git/commit-message-only-modal.html", $scope, null, function(newScope) {
            newScope.commitData = {};
            /* Reload previous message if any */
            if (currentCommitMessage) {
                newScope.commitData.message = currentCommitMessage;
            }

            newScope.commit = function(){
                deferred.resolve(newScope.commitData);
                newScope.dismiss();
            }
        });

        deferred.promise.then(function(commitData){
            currentCommitMessage = commitData.message;
            $scope.save();
        });
    };

    $scope.commit = function(){
        CreateModalFromTemplate("/templates/git/commit-object-modal.html", $scope, null, function(newScope) {
            newScope.object = {
                objectType : "INSIGHT",
                objectId : $scope.insight.id
            }
        });
    };

    $scope.safeMode = !!$scope.$eval($stateParams['safe-mode']);

    $scope.disableSafeMode = () => {
        $scope.safeMode = false;
        $scope.startUpdatePreview();
    };

    checkChangesBeforeLeaving($scope, $scope.isDirty);

    $scope.startUpdatePreview();

    const backendRestartListener = $rootScope.$on('backendRestarted',function () {$scope.sharedState.backendRunning = true;});
    const backendStopListener = $rootScope.$on('backendStopped',function () {$scope.sharedState.backendRunning = false;});

    $scope.$on("$destroy", function() {
        backendRestartListener();
        backendStopListener();
    });
});


app.controller("WebAppEditSettingsModalController", function($scope, $stateParams, DataikuAPI, Fn) {
    $scope.webAppApiKey = {key:$scope.app.apiKey};
    $scope.modalTabState = {
        active : 'security',
        editingApiKey: 'show'
    };

    function getPrivileges() {
        DataikuAPI.webapps.getDatasetPrivileges($stateParams.projectKey, $scope.webAppApiKey.key).success(function(data){
            $scope.privileges = data;
        }).error(setErrorInScope.bind($scope));
    }

    function init() {
        DataikuAPI.projects.publicApi.listProjectApiKeys($stateParams.projectKey).success(function(response){
            response.forEach(function(o){o.type="project"});
            $scope.availableApiKeys = response;
            DataikuAPI.profile.listPersonalAPIKeys().success(function(response){
                response.forEach(function(o){o.type="personal"});
                $scope.availableApiKeys = $scope.availableApiKeys.concat(response);

                $scope.$watch('webAppApiKey.key',function(nv,ov){
                    if (nv==undefined) {return}
                    $scope.validApiKey = ($scope.availableApiKeys.map(Fn.prop('key')).indexOf(nv)!=-1);
                    $scope.isProjectApiKey = ($scope.validApiKey && $scope.availableApiKeys.filter(function(o){return o.key===nv})[0].type === 'project')
                    if ($scope.isProjectApiKey) {getPrivileges();}
                    if ($scope.modalTabState.editingApiKey == 'list') {
                        $scope.modalTabState.editingApiKey = 'show';
                    }
                });
            }).error(setErrorInScope.bind($scope));
        }).error(setErrorInScope.bind($scope));
    }
    init();

    $scope.save = function() {
        if ($scope.validApiKey) {
            $scope.app.apiKey = $scope.webAppApiKey.key;
        }
        $scope.saveWebAppWithCode();
        if ($scope.isProjectApiKey) {
            $scope._savePrivileges().then($scope.resolveModal);
        } else {
            $scope.resolveModal();
        }
    };

    $scope._savePrivileges = function() {
        return DataikuAPI.webapps.setDatasetPrivileges($stateParams.projectKey, $scope.webAppApiKey.key, $scope.privileges)
            .success(function(data){})
            .error(setErrorInScope.bind($scope));
    };

    $scope.addDatasetSnippet = function(datasetName) {
        let found = false;
        $scope.privileges.datasets.forEach(function(fdataset){
            if (fdataset.datasetName == datasetName) {
                fdataset.readData = true;
                fdataset.readMetadata = true;
                fdataset.readSchema = true;
            }
        });
        $scope.app.params.js += "\n\ndataiku.fetch('" + datasetName  + "', {\n";
        $scope.app.params.js += "        sampling: \"head\",\n";
        $scope.app.params.js += "        limit: 10000\n";
        $scope.app.params.js += "    }, function(dataFrame) {\n"
        $scope.app.params.js += "    /* Process the dataframe */\n})";

        $scope._savePrivileges();
        $scope.resolveModal();
    }
    $scope.$watch('modalTabState.editingApiKey', function(nv,ov){
        if (nv === 'write') {$scope.editedApiKey = angular.copy($scope.webAppApiKey);}
        if (ov === 'write') {$scope.webAppApiKey = $scope.editedApiKey;}
    });
});


app.directive("webAppEditorPane", function () {
    return {
        scope: true,
        templateUrl: '/templates/webapps/web-app-editor-pane.html',
        link: function ($scope, element, attrs) {
            $scope.outputTabEnabled = attrs.outputTabEnabled == "true" ? true : false;
            $scope.state = {};
            $scope.editorPanes.push($scope);
            $scope.maximize = function () {
                $scope.parentMaximize($scope);
            };

            $scope.$on("previewDataUpdated", function(evt, pane) {
                var iframe = $('.htmlResult', element);
                $scope.renderPreview(iframe);
            });

            $scope.uiState = { codeSamplesSelectorVisible: false };
        }
    }
});


app.directive("webAppEditor", function($rootScope, CodeMirrorSettingService) {
    return {
        scope: false,
        link: function($scope, element, attrs) {
            $scope.editorPanes = [];
            $scope.editorState = 'splitted';
            $scope.leftWidth = 0;

            $scope.$watch("editorPanes.length", function(nv, ov) {
                if ($scope.editorPanes.length == 2) {
                    $scope.editorPanes[0].state.paneVisible = true;
                    $scope.editorPanes[1].state.paneVisible = true;
                    $scope.editorPanes[1].state.activeTab = 'OUTPUT';
                    $scope.editorPanes[1].state.rightmost = true;
                    $scope.editorState = 'splitted';

                    $scope.editorPanes[0].state.activeTab = $scope.defaultLeftTab;
                }
            });

            $scope.createEditorOptions = function(mode){
                var options = CodeMirrorSettingService.get(mode);
                return options;
            };

            $scope.splitEditor = function() {
                var leftPane = element.find(".left-pane");
                var rightPane = element.find(".right-pane");
                $scope.editorPanes[0].state.paneVisible = true;
                $scope.editorPanes[1].state.paneVisible = true;
                $scope.editorState = 'splitted';
                leftPane.css({width: $scope.leftWidth + "px"});
                rightPane.css({left: $scope.leftWidth + 3, right: "0", width: "auto"});
            };

            $scope.parentMaximize = function(pane) {
                var leftPane = element.find(".left-pane");
                var rightPane = element.find(".right-pane");
                $scope.leftWidth = leftPane.width();
                $scope.rightWidth = rightPane.width();

                $scope.editorState = 'maximized';

                if ($scope.editorPanes[0] == pane) {
                    leftPane.css({width: '100%'});
                    rightPane.css({width: '0'});
                    $scope.editorPanes[0].state.paneVisible = true;
                    $scope.editorPanes[1].state.paneVisible = false;
                } else if ($scope.editorPanes[1] == pane) {
                    leftPane.css({width: '0'});
                    rightPane.css({width: '100%', left: '0'});
                    $scope.editorPanes[0].state.paneVisible = false;
                    $scope.editorPanes[1].state.paneVisible = true;
                }
            }
        }
    }
});

})();
