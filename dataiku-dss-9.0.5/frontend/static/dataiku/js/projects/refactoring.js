(function () {
'use strict';

var app = angular.module('dataiku.projects.actions');


app.service('DatasetConnectionChangeService', function($rootScope, $q, $stateParams, CreateModalFromTemplate, DataikuAPI, TaggableObjectsCapabilities, TaggableObjectsUtils) {
    this.start = function(allSelectedObjects) {

        return CreateModalFromTemplate("/templates/datasets/change-connection-modal.html", $rootScope, null, function(modalScope) {
            modalScope.selectedObjects = allSelectedObjects.filter(TaggableObjectsCapabilities.canChangeConnection);
            modalScope.commonTaggableType = TaggableObjectsUtils.getCommonType(modalScope.selectedObjects, it => it.type);
            modalScope.options = {
                useExistingParams: false,
                specificSettings: {}
            };

            DataikuAPI.flow.refactoring.startChangeConnections($stateParams.projectKey, modalScope.selectedObjects).success(function(data) {
                modalScope.connections = data.connections.filter(c => c.usable); //TODO @flow, display unsable connections with reason

                modalScope.connectionsMap = {};
                modalScope.connections.forEach(function(c) {
                    modalScope.connectionsMap[c.name] = c;
                });

                modalScope.messages = data.messages;
            }).error(function(...args) {
                modalScope.fatalError = true;
                setErrorInScope.apply(modalScope, args);
            });


            modalScope.test = function() {
                delete modalScope.messages;
                resetErrorInScope(modalScope);
                const deferred = $q.defer();
                DataikuAPI.flow.refactoring.testChangeConnections($stateParams.projectKey, modalScope.selectedObjects, modalScope.options).success(function(data) {
                    modalScope.messages = data;
                    if (data.anyMessage) {
                        deferred.reject();
                    } else {
                        deferred.resolve(data)
                    }
                }).error(setErrorInScope.bind(modalScope));
                return deferred.promise;
            };

            modalScope.ok = function(force) {
                if (force) {
                    performChange();
                } else {
                    modalScope.test().then(performChange);
                }
            };

            modalScope.preselectFormatIfOnlyOne = function() {
                const formats = modalScope.connectionsMap[modalScope.options.connection].formats;
                if (formats && formats.length == 1) {
                    modalScope.options.formatOptionId = formats[0].id;
                }
            }

            function performChange() {
                DataikuAPI.flow.refactoring.changeConnections($stateParams.projectKey, modalScope.selectedObjects, modalScope.options).success(function(data) {
                    modalScope.resolveModal();
                }).error(setErrorInScope.bind(modalScope));
            }
        });
    };
});


app.service('SubFlowCopyService', function($rootScope, $q, $state, $stateParams, CreateModalFromTemplate, DataikuAPI, TaggingService, LoggerProvider, $compile, $timeout, $interpolate, PromiseService) {
    var logger = LoggerProvider.getLogger('refactoring');

	this.start = function(selectedObjects, itemsByZone) {

		CreateModalFromTemplate("/templates/projects/subflow-copy-modal.html", $rootScope, null, function(modalScope) {
            modalScope.selectedObjects = [...selectedObjects];
            modalScope.projectTags = Object.keys({ ...TaggingService.getProjectTags(), ...TaggingService.getGlobalTags() });
            modalScope.options = {
                targetMode: 'CURRENT_PROJECT',
                targetProjectKey: '',
                targetProjectFolderId: '',
                datasetNames: {},
                streamingEndpointNames: {}
            };

            modalScope.dataCanBeCopiedElements = selectedObjects.filter(el =>
                (el.type === 'MANAGED_FOLDER' && el.smType === 'Filesystem') ||
                (el.type === 'DATASET' && ['Inline', 'UploadedFiles'].includes(el.smType)) ||
                el.type === 'SAVED_MODEL' ||
                el.type === 'MODEL_EVALUATION_STORE'
            );

            var copyDataTooltipHtml = `<div>
                            <span>Data will be copied for {{dataCanBeCopiedElements.length > 1? 'these elements:' : 'this element:'}} </span>
                            <ul><li ng-repeat="el in dataCanBeCopiedElements"><i class="{{el.type|typeToIcon}}" /> {{el.displayName}}</li></ul>
                            <div class="help-inline">
                                <span>Copying data is supported for:</span>
                                <ul>
                                    <li>Editable and uploaded datasets</li>
                                    <li>Local filesystem folders</li>
                                    <li>Saved models</li>
                                </ul>
                            </div>

                        </div>  `;

            var el = angular.element(copyDataTooltipHtml);
            $compile(el)(modalScope);

            $timeout(function() {
                modalScope.copyDataTooltipHtml = el.html();
            });

            function reloadSelectionStats() {
                modalScope.hasAnyDataset = !!modalScope.selectedObjects.filter(to => to.type == 'DATASET').length;
                modalScope.hasAnyStreamingEndpoint = !!modalScope.selectedObjects.filter(to => to.type == 'STREAMING_ENDPOINT').length;
                modalScope.selectedZones = modalScope.selectedObjects.filter(to => to.type == 'FLOW_ZONE');
                modalScope.hasAnyZone = !!modalScope.selectedZones.length;
                modalScope.hasComputables = modalScope.hasAnyDataset || modalScope.hasAnyStreamingEndpoint;
            }

            function transmogrifyNames() {
                let projectKey;
                if (modalScope.options.targetMode == 'CURRENT_PROJECT') {
                    projectKey = $stateParams.projectKey;
                } else if (modalScope.options.targetMode == 'EXISTING_PROJECT') {
                    projectKey = modalScope.options.targetProjectKey;
                }
                if (!projectKey) {
                    return;
                }
                DataikuAPI.datasets.listNames(projectKey).success(function(existingNames) {
                    modalScope.options.datasetNames = {};
                    const usedNames = angular.copy(existingNames);

                    modalScope.selectedObjects.forEach(function(to) {
                        if (to.type != 'DATASET') {
                            return;
                        }
                        let newName = to.id;
                        if (!usedNames.includes(newName)) {
                            modalScope.options.datasetNames[to.id] = newName;
                            usedNames.push(newName);
                            return;
                        }
                        for (let i = 1; i < 100; i++) {
                            newName = to.id+'_'+i;
                            if (!usedNames.includes(newName)) {
                                modalScope.options.datasetNames[to.id] = newName;
                                usedNames.push(newName);
                                return;
                            }
                        }
                        logger.error("Failed to transmogrify "+to.id);
                    });
                });
                DataikuAPI.streamingEndpoints.listNames(projectKey).success(function(existingNames) {
                    modalScope.options.streamingEndpointNames = {};
                    const usedNames = angular.copy(existingNames);

                    modalScope.selectedObjects.forEach(function(to) {
                        if (to.type != 'STREAMING_ENDPOINT') {
                            return;
                        }
                        let newName = to.id;
                        if (!usedNames.includes(newName)) {
                            modalScope.options.streamingEndpointNames[to.id] = newName;
                            usedNames.push(newName);
                            return;
                        }
                        for (let i = 1; i < 100; i++) {
                            newName = to.id+'_'+i;
                            if (!usedNames.includes(newName)) {
                                modalScope.options.streamingEndpointNames[to.id] = newName;
                                usedNames.push(newName);
                                return;
                            }
                        }
                        logger.error("Failed to transmogrify "+to.id);
                    });
                });
            }
            transmogrifyNames();
            reloadSelectionStats()

            modalScope.$watch("options.targetMode", transmogrifyNames);
            modalScope.$watch("options.targetProjectKey", transmogrifyNames);

			DataikuAPI.projects.list().success(function (data) {
	            modalScope.projects = data;
	        });

            DataikuAPI.flow.refactoring.startCopySubFlow(selectedObjects).success(function(data) {
                modalScope.messages = data;
            }).error(function(...args) {
                modalScope.fatalError = true;
                setErrorInScope.apply(modalScope, args);
            });


            modalScope.test = function() {
                const deferred = $q.defer();
                delete modalScope.messages;
                resetErrorInScope(modalScope);
                DataikuAPI.flow.refactoring.testCopySubFlow(modalScope.selectedObjects, modalScope.options, $stateParams.projectKey).success(function(data) {
                    modalScope.messages = data;
                    if (data.anyMessage) {
                        deferred.reject();
                    } else {
                        deferred.resolve(data)
                    }
                }).error(setErrorInScope.bind(modalScope));
                return deferred.promise;
            };

            modalScope.ok = function(force) {
                if (force) {
                    performCopy();
                } else {
                    modalScope.test().then(performCopy);
                }
            };

            function performCopy() {
                DataikuAPI.flow.refactoring.copySubFlow(modalScope.selectedObjects, modalScope.options, $stateParams.projectKey).success(function(data) {
                    modalScope.resolveModal();
                    $rootScope.$emit('stopCurrentTool');

                    if (modalScope.options.targetMode != 'CURRENT_PROJECT' && modalScope.options.targetProjectKey != $stateParams.projectKey) {
                        $state.transitionTo("projects.project.flow", {projectKey: modalScope.options.targetProjectKey});
                    } else {
                        $rootScope.$emit('reloadGraph');
                    }
                }).error(setErrorInScope.bind(modalScope));
            }

            modalScope.uniqueProjectKey = true;

            DataikuAPI.projects.listAllKeys()
                .success(function(data) {
                    modalScope.allProjectKeys = data;
                })
                .error(setErrorInScope.bind(modalScope));

            function isProjectKeyUnique(value) {
                return !modalScope.allProjectKeys || modalScope.allProjectKeys.indexOf(value) < 0;
            };

            modalScope.$watch("options.targetProjectKey", function(nv, ov) {
                modalScope.uniqueProjectKey = !nv || isProjectKeyUnique(nv);
            });
            modalScope.$watch("options.copyZoneContent", function(nv, ov) {
                if (nv == ov) {
                    return;
                }
                modalScope.selectedZones.forEach(to => {
                    const items = itemsByZone.get(to.id);
                    if (!items) {
                        return
                    }
                    items.forEach(it => {
                        const found = selectedObjects.find(so => it.type === so.type && it.id === so.id);
                        if (found !== undefined) {
                            return;
                        }
                        if (nv) {
                            modalScope.selectedObjects.push(it);
                        } else {
                            const index = modalScope.selectedObjects.findIndex(sel => sel.id === it.id);
                            if (index != -1) {
                                modalScope.selectedObjects.splice(index, 1);
                            }
                        }
                    });
                });
                transmogrifyNames();
                reloadSelectionStats();
            });


            modalScope.folder = {};

            modalScope.$watch("options.targetProjectName", function(nv, ov) {
                if (!nv) return;
                var slug = nv.toUpperCase().replace(/\W+/g, ""),
                    cur = slug,
                    i = 0;
                while (!isProjectKeyUnique(cur)) {
                    cur = slug + "_" + (++i);
                }
                modalScope.options.targetProjectKey = cur;
            });

            modalScope.browse = folderIds =>  {
                return PromiseService.qToHttp($q(resolve => {
                    const ids = folderIds.split('/');
                    const destination = ids[ids.length - 1];
                    DataikuAPI.projectFolders.listContents(destination, true, 1, true).success(data => {
                        const folders = data.folder.children.map(f => angular.extend({}, f, { directory: true, fullPath: f.id }))
                        const pathElts = treeToList(data.folder, item => item.parent);

                        resolve({
                            children: folders,
                            pathElts: pathElts.map(f => angular.extend({}, f, { toString: () => f.id })),
                            exists: true,
                            directory: true,
                        });
                    }).error(setErrorInScope.bind(modalScope));
                }));
            };

            modalScope.canSelect = item => item.canWriteContents;

            modalScope.getName = item => item.name;
        });
    };
});



})();