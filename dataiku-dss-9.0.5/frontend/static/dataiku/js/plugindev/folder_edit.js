(function(){
'use strict';

    const app = angular.module('dataiku.folder_edit', []);


    /**
     * @ngdoc directive
     * @name zoneEditCallbacks
     * @description
     *   This directive is composed on the scope above FolderEditController.
     *   It is responsible for setting up the callbacks needed to get/set/list
     *   files in a zone of the admin section.
     */
    app.directive('zoneEditCallbacks', function(DataikuAPI, $stateParams, Dialogs, $state) {
        return {
            scope: false,
            restrict: 'A',
            link: {
                pre: function($scope, $element, attrs) {
                    var zone = attrs.zone;
                    $scope.folderEditCallbacks = {
                        list: function() {
                            return DataikuAPI.admin.folderEdit.listContents(zone);
                        },
                        get: function(content, sendAnyway) {
                            return DataikuAPI.admin.folderEdit.getContent(zone, content.path, sendAnyway);
                        },
                        previewImageURL: function(content) {
                            return '/dip/api/admin/folder-edition/preview-image?type=' + zone + '&path=' + encodeURIComponent(content.path) + '&contentType=' + encodeURIComponent(content.mimeType);
                        },
                        set: function(content) {
                            return DataikuAPI.admin.folderEdit.setContent(zone, content.path, content.data);
                        },
                        // validate: function(contentMap) {
                        //     return DataikuAPI.admin.folderEdit.validate(zone, contentMap);
                        // },
                        setAll: function(contentMap) {
                            return DataikuAPI.admin.folderEdit.setContentMultiple(zone, contentMap);
                        },
                        create: function(path, isFolder) {
                            return DataikuAPI.admin.folderEdit.createContent(zone, path, isFolder);
                        },
                        delete: function(content) {
                            return DataikuAPI.admin.folderEdit.deleteContent(zone, content.path);
                        },
                        decompress: function(content) {
                            return DataikuAPI.admin.folderEdit.decompressContent(zone, content.path);
                        },
                        rename: function(content, newName) {
                            return DataikuAPI.admin.folderEdit.renameContent(zone, content.path, newName);
                        },
                        checkUpload: function(contentPath, paths) {
                            return DataikuAPI.admin.folderEdit.checkUploadContent(zone, contentPath, paths);
                        },
                        upload: function(contentPath, file, callback) {
                            return DataikuAPI.admin.folderEdit.uploadContent(zone, contentPath, file, callback);
                        },
                        move: function(content, to) {
                            return DataikuAPI.admin.folderEdit.moveContent(zone, content.path, (to ? to.path : ''));
                        },
                        copy: function(content) {
                            return DataikuAPI.admin.folderEdit.copyContent(zone, content.path);
                        }
                    };
                    $scope.folderEditSaveWarning = 'You have unsaved changes to a file, are you sure you want to leave?';
                    $scope.rootDescription = attrs.rootDescription || '[' + zone + ']';
                    $scope.description =  $state.includes('libedition.libpython') ? 'lib-python' : $state.includes('libedition.libr') ? 'lib-r' : 'local-static';
                    $scope.headerDescription = $state.includes('libedition.localstatic') ? "Web Resources Content" : "Library Content";
                    $scope.localStorageId = $state.includes('libedition.libpython') ? 'lib-python' : $state.includes('libedition.libr') ? 'lib-r' : 'local-static';
                }
            }
        };
    });

    /**
     * @ngdoc directive
     * @name projectZoneEditCallbacks
     * @description
     *   same as zoneEditCallbacks but for the folders inside a project
     */
    app.directive('projectZoneEditCallbacks', function(DataikuAPI, $stateParams, Dialogs, $state, CreateModalFromTemplate, FutureProgressModal, DKUtils) {
        return {
            scope: false,
            restrict: 'A',
            link: {
                pre: function($scope, $element, attrs) {
                    var zone = attrs.zone;
                    var projectKey = $stateParams.projectKey;
                    $scope.folderEditCallbacks = {
                        list: function() {
                            return DataikuAPI.projects.folderEdit.listContents(projectKey, zone);
                        },
                        get: function(content, sendAnyway) {
                            return DataikuAPI.projects.folderEdit.getContent(projectKey, zone, content.path, sendAnyway);
                        },
                        previewImageURL: function(content) {
                            return '/dip/api/projects/folder-edition/preview-image?projectKey=' + projectKey + '&type=' + zone + '&path=' + encodeURIComponent(content.path) + '&contentType=' + encodeURIComponent(content.mimeType);
                        },
                        set: function(content) {
                            return DataikuAPI.projects.folderEdit.setContent(projectKey, zone, content.path, content.data);
                        },
                        // validate: function(contentMap) {
                        //     return DataikuAPI.projects.folderEdit.validate(projectKey, zone, contentMap);
                        // },
                        setAll: function(contentMap) {
                            return DataikuAPI.projects.folderEdit.setContentMultiple(projectKey, zone, contentMap);
                        },
                        create: function(path, isFolder) {
                            return DataikuAPI.projects.folderEdit.createContent(projectKey, zone, path, isFolder);
                        },
                        delete: function(content) {
                            return DataikuAPI.projects.folderEdit.deleteContent(projectKey, zone, content.path);
                        },
                        decompress: function(content) {
                            return DataikuAPI.projects.folderEdit.decompressContent(projectKey, zone, content.path);
                        },
                        rename: function(content, newName) {
                            return DataikuAPI.projects.folderEdit.renameContent(projectKey, zone, content.path, newName);
                        },
                        checkUpload: function(contentPath, paths) {
                            return DataikuAPI.projects.folderEdit.checkUploadContent(projectKey, zone, contentPath, paths);
                        },
                        upload: function(contentPath, file, callback) {
                            return DataikuAPI.projects.folderEdit.uploadContent(projectKey, zone, contentPath, file, callback);
                        },
                        move: function(content, to) {
                            return DataikuAPI.projects.folderEdit.moveContent(projectKey, zone, content.path, (to ? to.path : ''));
                        },
                        copy: function(content) {
                            return DataikuAPI.projects.folderEdit.copyContent(projectKey, zone, content.path);
                        }
                    };

                    $scope.folderEditSaveWarning = 'You have unsaved changes to a file, are you sure you want to leave?';
                    $scope.description =  "lib";
                    $scope.headerDescription = $state.includes('projects.project.libedition.localstatic') ? "Web Resources Content" : "Library Content"
                    $scope.localStorageId = "lib" + "-" + projectKey;
                }
            }
        };
    });

    /**
     * @ngdoc directive
     * @name projectZoneGitRefCallbacks
     * @description
     *   This directive is composed on the scope above FolderEditController.
     *   It is responsible for setting up the callbacks needed to get/set/list/rm git references.
     */
    app.directive('projectZoneGitRefCallbacks', function(DataikuAPI, $stateParams, WT1) {
        return {
            scope : false,
            restrict : 'A',
            link : {
                pre : function($scope) {
                    $scope.gitRefCallbacks = {
                        set: function (gitRef, gitRefPath, addPythonPath) {
                            WT1.event("project-libs-git-refs-save");
                            return DataikuAPI.git.setProjectGitRef($stateParams.projectKey, gitRef, gitRefPath, addPythonPath);
                        },
                        rm: function (gitRefPath, deleteDirectory) {
                            WT1.event("project-libs-git-refs-rm", {"delete-directory": deleteDirectory});
                            return DataikuAPI.git.rmProjectGitRef($stateParams.projectKey, gitRefPath, deleteDirectory);
                        },
                        pullOne: function (gitRefPath) {
                            WT1.event("project-libs-git-refs-pull-one");
                            return DataikuAPI.git.pullProjectGitRef($stateParams.projectKey, gitRefPath);
                        },
                        pullAll: function () {
                            WT1.event("project-libs-git-refs-pull-all");
                            return DataikuAPI.git.pullProjectGitRefs($stateParams.projectKey);
                        }
                    }
                }
            }
        };
    });

    app.controller('TopLevelFolderEditionController', function($scope, DataikuAPI, $state, $stateParams, CreateModalFromTemplate, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");
        TopNav.setNoItem();

        $scope.pythonEmptyCta = {
            title: "No shared python code on this " + $scope.wl.productLongName + " instance.",
            text: "Create your own libraries or helpers and share them within all the " + $scope.wl.productShortName + " instance. The contents of 'lib-python' are accessible to python recipes and notebooks just like regular python libraries.",
            btnAction: "create",
            btnLabel: "Create your first shared python file"
        }

        $scope.rEmptyCta = {
            title: "No shared R code on this " + $scope.wl.productLongName + " instance.",
            text: "Create your own libraries and share them within all the " + $scope.wl.productShortName + " instance. The contents of 'lib-r' are accessible to R recipes and notebooks just like regular R libraries.",
            btnAction: "create",
            btnLabel: "Create your first shared R file"
        }
    });

    app.controller('TopLevelLocalStaticEditorController', function($scope, DataikuAPI, $state, $stateParams, CreateModalFromTemplate, TopNav, $rootScope) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");
        TopNav.setNoItem();

        $scope.emptyCta = {
            title: "No static web resources on this " + $scope.wl.productLongName + " instance.",
            text: "Create and upload your static web resources and use them for your webapps within all the " + $scope.wl.productShortName + " instance. Right click on local-static root folder and create or upload your files.",
            btnAction: "upload",
            btnLabel: "Upload your first resource"
        }
    });

    app.controller('ProjectFolderEditionController', function($scope, DataikuAPI, $state, $stateParams, CreateModalFromTemplate, TopNav, $rootScope) {
        TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'libraries', TopNav.TABS_NONE, null);
        TopNav.setNoItem();

        $scope.projectNoTabsCta = {
            title: "Project shared code",
            text: "Create your own libraries or helpers and share them within the project. These will be available to Python or R recipes and notebooks"
        };
    });

    app.directive('folderContentEditor', function(DataikuAPI, $stateParams, Dialogs, $state, CreateModalFromTemplate, $q,
                                                  $timeout, LocalStorage, $rootScope, openDkuPopin, Logger, CodeMirrorSettingService,
                                                  FutureProgressModal, DKUtils) {
        return {
            scope: true,
            restrict: 'A',
            templateUrl: '/templates/plugins/development/fragments/folder-content-editor.html',
            link: function($scope, $element, attrs) {
                $scope.editorOptions = null;
                $scope.uiState = {
                    foldRoot: false
                };

                /* Attributes with inherited scope */
                $scope.emptyCta = $scope.$eval(attrs.emptyCta);
                $scope.noTabsCta = $scope.$eval(attrs.noTabsCta);
                $scope.canCommit = $scope.$eval(attrs.canCommit);
                $scope.commitFn = $scope[attrs.commitFn];

                const postSaveCallback = () => {
                    if (attrs.postSaveCallback) {
                        $scope[attrs.postSaveCallback]();
                    }
                };
                const initialPath = attrs.initialPath;

                if (initialPath) {
                    $scope.openOnLoad = initialPath;
                }

                /*
                 * Listing plugin content
                 */

                $scope.listContents = function() {
                    return $scope.folderEditCallbacks.list().success(function(data){
                        // save the expanded states
                        var recGetExpandedState = function(content, map) {
                            if (content.children != null) {
                                map[content.path] = content.expanded || false;
                                content.children.forEach(function(subContent) {recGetExpandedState(subContent, map);});
                            }
                        };
                        var oldStates = {};
                        if ($scope.devContents != null ) {
                            $scope.devContents.forEach(function(content) {recGetExpandedState(content, oldStates);});
                        }
                        recGetExpandedState(oldStates);
                        // set the new state of the contents tree
                        $scope.devContents = data;
                        // put the old expanded states back
                        var recSetExpandedState = function(content, map) {
                            if (content.children != null) {
                                content.expanded = map[content.path] || false;
                                content.children.forEach(function(subContent) {recSetExpandedState(subContent, map);});
                            }
                        };
                        if ($scope.devContents != null ) {
                            $scope.devContents.forEach(function(content) {recSetExpandedState(content, oldStates);});
                        }
                        var recSetDepth = function(content, depth) {
                            content.depth = depth;
                            if (content.children != null) {
                                content.children.forEach(function(subContent) {recSetDepth(subContent, depth + 1);});
                            }
                        };
                        if ($scope.devContents != null ) {
                            $scope.devContents.forEach(function(content) {recSetDepth(content, 1);});
                        }

                        if ($scope.gitRefCallbacks) {
                            const recSetGit = function(externalLibs, content, gitSubPath) {
                                if (gitSubPath || content.path in externalLibs.gitReferences) {
                                    content.fromGit = true;
                                }
                                if (externalLibs.pythonPath.includes(content.path)) {
                                    content.inPythonPath = true;
                                }
                                if (externalLibs.rsrcPath.includes(content.path)) {
                                    content.inRSrcPath = true;
                                }
                                if (content.children != null) {
                                    content.children.forEach(subContent => {recSetGit(externalLibs, subContent, content.fromGit);});
                                }
                            };

                            DataikuAPI.git.getProjectExternalLibs($stateParams.projectKey).then(result => {
                                $scope.externalLibs = result.data;
                                $scope.gitReferences = result.data.gitReferences;

                                if ($scope.devContents != null) {
                                    $scope.devContents.forEach(content => {recSetGit($scope.externalLibs, content, false);});
                                }
                            }, setErrorInScope.bind($scope));
                        }
                    }).error(setErrorInScope.bind($scope));
                };
                $scope.listContents().success(function() {
                    openSavedTabs();
                    if ($scope.openOnLoad) {
                        openFileFromExternal($scope.openOnLoad);
                        $scope.openOnLoad = null;
                    }
                });

                $scope.sortFolder = function(content) {
                    content.sort(function(c1, c2) {
                        if (c1.children && !c2.children) {
                            return -1;
                        }
                        if (!c1.children && c2.children) {
                            return 1;
                        }
                        return c1.name > c2.name ? 1 : -1;
                    });
                    return content;
                };

                /*
                 * Opening and closing tabs
                 */

                $scope.originalContentMap = {};
                $scope.editedContentMap = {};
                $scope.activeTabIndex = -1;

                $scope.openFile = function(file) {
                    if (!$scope.canBeDecompressed(file)) {
                        var tabIndex = $scope.addTab(file);
                        $scope.updateActiveTab(tabIndex);
                        if (typeof($scope.unregisterArrowSliderInit) === "function") {
                            $scope.unregisterArrowSliderInit();
                        }
                    }
                }

                $scope.addTab = function(file) {
                    var tabIndex = $scope.tabsList.map(function(f){return f.path}).indexOf(file.path);
                    if (tabIndex == -1) {
                        $scope.tabsList.push(file);
                        tabIndex = $scope.tabsList.length - 1;
                    }
                    return tabIndex;
                };

                $scope.updateActiveTab = function(tabIndex) {
                    if (tabIndex != -1 && tabIndex < $scope.tabsList.length && $scope.tabsList[tabIndex]) {
                        var fileToOpen = $scope.tabsList[tabIndex];
                        //saving scroll position
                        var currentContent = $scope.getCurrentContent();
                        if (currentContent) {
                            saveTabScrollPosition(currentContent.path, $('.CodeMirror-scroll').scrollTop());
                        }
                        //updating tab index
                        $scope.activeTabIndex = tabIndex;
                        saveActiveTab();
                        //scrolling through tabs if necessary
                        $timeout(function() {
                            if ($scope.needSlider()) {
                                slideToTab(fileToOpen.path);
                            }
                        });
                        //replacing editor's content
                        if ($scope.editedContentMap[fileToOpen.path]) {
                            setCurrentContent(fileToOpen);
                        } else {
                            loadAndSetCurrentContent(fileToOpen, true);
                        }
                    }
                }

                var loadAndSetCurrentContent = function(file, sendAnyway) {
                    $scope.folderEditCallbacks.get(file, sendAnyway).success(function(data){
                        $scope.originalContentMap[file.path] = angular.copy(data);
                        $scope.editedContentMap[file.path] = data;
                        setCurrentContent(file);
                    }).error(setErrorInScope.bind($scope));
                };

                var setCurrentContent = function(file) {
                    var mimeType = selectSyntaxicColoration(file.name, file.mimeType);

                    $scope.editorOptions = CodeMirrorSettingService.get(mimeType, {
                        onLoad: function(codeMirror) {
                            $timeout(function() {
                                codeMirror.scrollTo(0, $scope.getTabScrollPosition(file.path));
                            });
                        }
                    });
                };

                var selectSyntaxicColoration = function(fileName, mimeType) {
                    if (mimeType == 'application/sql' ) {
                        return 'text/x-sql'; // codemirror prefers this one
                    }
                    if (fileName.match(/.*\.java$/)) {
                        return 'text/x-java';
                    }
                    return mimeType
                };

                var refreshSyntaxicColoration = function(fileName, mimeType) {
                    $scope.editorOptions.mode = selectSyntaxicColoration(fileName, mimeType);
                };

                var closeContent = function(file) {
                    var tabIndex = $scope.tabsList.map(function(f){return f.path}).indexOf(file.path);
                    if (tabIndex > -1) {
                        $scope.tabsList.splice(tabIndex, 1);
                        if (tabIndex == $scope.activeTabIndex) {
                            $scope.activeTabIndex = -1;
                            if ($scope.tabsList.length > 0) {
                                var newActiveTabIndex = tabIndex > 0 ? tabIndex - 1 : 0;
                                $scope.updateActiveTab(newActiveTabIndex);
                            }
                        } else if (tabIndex < $scope.activeTabIndex) {
                            $scope.activeTabIndex--;
                        }
                    }
                };

                $scope.closeFile = function(file) {
                    if ($scope.isContentDirty(file) && !file.readOnly ) {
                        CreateModalFromTemplate("/templates/plugins/development/fragments/fileclose-prompt.html", $scope, null, function(newScope) {
                            newScope.closeAndSave = function() {
                                var fileToSave = $scope.editedContentMap[file.path];
                                if (fileToSave) {
                                    $scope.saveContent(fileToSave);
                                }
                                closeContent(file);
                                newScope.dismiss();
                            }
                            newScope.close = function() {
                                closeContent(file);
                                newScope.dismiss();
                            }
                        });
                    } else {
                        closeContent(file);
                    }
                };

                $scope.closeOtherFiles = function(file) {
                    var dirtyFiles = [];
                    var fileToClose = [];
                    $scope.tabsList.forEach(function(f) {
                       if (f.path != file.path) {
                           fileToClose.push(f);
                           if ($scope.isContentDirty(f)) {
                               dirtyFiles.push(f);
                           }
                       }
                    });
                    if (dirtyFiles.length > 0) {
                        Dialogs.confirm($scope,'Discard changes','Are you sure you want to discard your changes?').then(function() {
                            $scope.tabsList = [file];
                            $scope.updateActiveTab(0);
                        });
                    } else {
                        $scope.tabsList = [file];
                        $scope.updateActiveTab(0);
                    }
                };

                $scope.$watch('tabsList', function(nv, ov) {
                    if (nv && ov && nv.length < ov.length) {
                        var nvPath = nv.map(function(file) {
                            return file.path;
                        })
                        ov.forEach(function(file) {
                            if (nvPath.indexOf(file.path) == -1) {
                                delete $scope.originalContentMap[file.path];
                                delete $scope.editedContentMap[file.path];
                            }
                        });
                        cleanTabScrollPosition();
                    }
                    $scope.tabsMap = {};
                    if (nv) {
                        nv.forEach(function(file) {
                            $scope.tabsMap[file.path] = file;
                        });
                    }
                    saveTabsList();
                }, true);

                var searchInDevContents = function(filePath) {
                    var pathFolders = [];
                    var searchRecursively = function(folder) {
                        for (var i = 0; i < folder.length; i++) {
                            var child = folder[i];
                            if (child.children && filePath.startsWith(child.path + "/")) {
                                pathFolders.push(child);
                                return searchRecursively(child.children);
                            } else if (child.path == filePath) {
                                pathFolders.push(child);
                                return pathFolders;
                            }
                        }
                        return null;
                    };
                    return searchRecursively($scope.devContents);
                }

                var openFileFromExternal = function(filePath) {
                    var pathFolders = searchInDevContents(filePath);

                    if (pathFolders && pathFolders.length > 0) {
                        var file = pathFolders[pathFolders.length - 1];
                        $scope.openFile(file);
                        pathFolders.forEach(function(f) {
                            f.expanded = true;
                        });
                        $timeout(function() {
                            $scope.focusedFile = file;
                        });
                    }
                };

                $scope.getCurrentContent = function() {
                    if ($scope.activeTabIndex > -1 && $scope.activeTabIndex < $scope.tabsList.length) {
                        var currentFile = $scope.tabsList[$scope.activeTabIndex];
                        return currentFile ? $scope.editedContentMap[currentFile.path] : null;
                    }
                    return null;
                };

                $scope.isContentFromGit = function() {
                    if ($scope.activeTabIndex > -1 && $scope.activeTabIndex < $scope.tabsList.length) {
                        var currentFile = $scope.tabsList[$scope.activeTabIndex];
                        return currentFile ? currentFile.fromGit : false;
                    }
                    return false;
                };

                $scope.isContentDirty = function(file) {
                    var isFileOpen = file && file.path && $scope.originalContentMap[file.path] && $scope.editedContentMap[file.path];
                    return isFileOpen && $scope.originalContentMap[file.path].data != $scope.editedContentMap[file.path].data;
                };

                $scope.hasDirtyContent = function() {
                    if ($scope.tabsList) {
                        for (var i=0; i<$scope.tabsList.length; i++) {
                            var file = $scope.tabsList[i];
                            if ($scope.isContentDirty(file)) {
                                return true;
                            }
                        }
                    }
                    return false;
                };

                /*
                 * Tab and Folder Explorer Menu
                 */

                $scope.focusOnFile = function(filePath) {
                    var pathFolders = searchInDevContents(filePath);
                    if (pathFolders && pathFolders.length > 0) {
                        pathFolders.forEach(function(content) {
                            content.expanded = true;
                        });
                        $timeout(function() {
                            $scope.focusedFile = pathFolders[pathFolders.length - 1];
                        });
                    }
                };

                var slideToTab = function(path) {
                    $scope.$broadcast('slideToId', "#tabs-frame", "#tabs-slider", path);
                };

                $scope.openTabMenu = function(element, $event) {
                    var template = '<ul class="dropdown-menu">'
                    +    '<li><a ng-click="moveContent(element)">Move</a></li>'
                    +    '<li ng-show="canDuplicateContent"><a ng-click="duplicateContent(element)">Duplicate</a></li>'
                    +    '<li><a ng-click="renameContent(element)">Rename</a></li>'
                    +    '<li><a ng-click="closeOtherFiles(element)">Close other tabs</a></li>'
                    +    '<li><a ng-click="deleteContent(element)" style="border-top: 1px #eee solid;">Delete</a></li>'
                    +'</ul>'

                    openRightClickMenu(element, $event, template);
                };

                const gitRefLocalActionsWarning = '<li> <a class="disabled break-hyphens" style="max-width: 190px; font-size: 13px;">' +
                        'Any changes in this directory from the following actions will be lost in the next update from Git' +
                    '</a> </li>';

                $scope.openFileMenu = function (element, $event) {
                    let template = '<ul class="dropdown-menu">';

                    if (element.fromGit) {
                        template += gitRefLocalActionsWarning;
                    }

                    template += '<li><a ng-click="moveContent(element)">Move</a></li>'
                        + '<li ng-show="canDuplicateContent"><a ng-click="duplicateContent(element)">Duplicate</a></li>'
                        + '<li><a ng-click="renameContent(element)">Rename</a></li>'
                        + '<li><a ng-click="deleteContent(element)">Delete</a></li>'
                        + '</ul>';

                    openRightClickMenu(element, $event, template);
                };

                $scope.openFolderMenu = function(element, $event) {
                    const folderLocalActions = '<li><a ng-click="addInElement(element.path, false)">Create file</a></li>'
                        +	'<li><a ng-click="addInElement(element.path, true)">Create folder</a></li>'
                        +	'<li><a ng-click="moveContent(element)">Move</a></li>'
                        +	'<li ng-show="canDuplicateContent"><a ng-click="duplicateContent(element)">Duplicate</a></li>'
                        +	'<li ng-show="!element.fromGit"><a ng-click="renameContent(element)">Rename</a></li>'
                        +	'<li><a ng-click="uploadElement(element.path)">Upload file</a></li>'
                        +   '<li ng-show="!element.fromGit"><a ng-click="deleteContent(element)">Delete</a></li>';

                    let template = '<ul class="dropdown-menu">';

                    if (element.fromGit) {
                        // This folder has been imported through Git references

                        if (element.path in $scope.gitReferences) {
                           template += '<li><a ng-click="gitRefActions.pullModal(element.path)">Update from Git</a></li>'
                               + '<li><a ng-click="gitRefActions.setModal(gitReferences[element.name], element.name)">Edit Git reference</a></li>'
                               + '<li><a ng-click="gitRefActions.untrackModal(element.name)">Untrack Git reference</a></li>'
                               + '<li><a ng-click="gitRefActions.rmModal(element.name)">Delete</a></li>'
                               + '<li class="divider"></li>';
                        }
                        template += gitRefLocalActionsWarning;
                    }

                    template += folderLocalActions + '</ul>';

                    openRightClickMenu(element, $event, template);
                };

                $scope.openRootMenu = function($event) {
                    var template = '<ul class="dropdown-menu">'
                        +	'<li><a ui-sref="profile.my.settings({\'#\':\'code_editor\'})" target="_blank">Customize editor settings</a></li>'
                        +	'<li><a ng-click="listContents(\'\')">Reload local files</a></li>'
                        +'</ul>'

                    openRightClickMenu(null, $event, template);
                };

                $scope.openAddMenu = function($event) {
                    var template = '<ul class="dropdown-menu">'
                        +   '<li><a ng-if="$state.$current.name == \'plugindev.editor\'" ng-click="newComponentPopin()">Create component</a></li>'
                        +   '<li><a ng-click="addInElement(\'\', false)" id="qa_plugindev_folder-file-add-btn">Create file</a></li>'
                        +	'<li><a ng-click="addInElement(\'\', true)">Create folder</a></li>'
                        +	'<li><a ng-click="uploadElement(\'\')">Upload file</a></li>'
                        +'</ul>'

                    openRightClickMenu(null, $event, template);
                };

                $scope.openGitMenu = function($event) {
                    var template = '<ul class="dropdown-menu">'
                        +	'<li ng-show="gitRefCallbacks"><a ng-click="gitRefActions.setModal()">Import from Git</a></li>'
                        +	'<li ng-show="gitRefCallbacks"><a ng-click="gitRefActions.listModal()">Manage references</a></li>'
                        +'</ul>'

                    openRightClickMenu(null, $event, template);
                };

                var openRightClickMenu = function(element, $event, template) {
                    var callback = function(newScope) {
                        newScope.element = element;
                    };
                    openMenu($event, template, callback);
                };

                var openMenu = function($event, template, callback) {
                    function isElsewhere(elt, e) {
                        return $(e.target).parents('.plugindev-tab-menu').length == 0;
                    }
                    var dkuPopinOptions = {
                        template: template,
                        isElsewhere: isElsewhere,
                        callback: callback
                    };
                    openDkuPopin($scope, $event, dkuPopinOptions);
                };

                /*
                 * Tabs persistency
                 */

                var getFolderEditLocalStorage = function() {
                    var allFolderEditLocalStorage = LocalStorage.get("dss.folderedit");
                    if (!allFolderEditLocalStorage) {
                        allFolderEditLocalStorage = {};
                    }
                    var folderEditLocalStorage = allFolderEditLocalStorage[$scope.localStorageId];
                    if (!folderEditLocalStorage) {
                        folderEditLocalStorage = {"tabsList":[]};
                    }
                    if (!folderEditLocalStorage.tabsList) {
                        folderEditLocalStorage.tabsList = [];
                    }
                    return folderEditLocalStorage;
                }

                var setFolderEditLocalStorage = function(folderEditLocalStorage) {
                    var allFolderEditLocalStorage = LocalStorage.get("dss.folderedit");
                    if (!allFolderEditLocalStorage) {
                        allFolderEditLocalStorage = {};
                    }
                    allFolderEditLocalStorage[$scope.localStorageId] = folderEditLocalStorage;
                    LocalStorage.set("dss.folderedit", allFolderEditLocalStorage);
                }

                var saveTabsList = function() {
                    if ($scope.tabsList) {
                        var folderEditLocalStorage = getFolderEditLocalStorage();
                        folderEditLocalStorage.tabsList = $scope.tabsList.map(function(file) {
                            return file.path;
                        });
                        setFolderEditLocalStorage(folderEditLocalStorage);
                    }
                };

                var saveActiveTab = function() {
                    var folderEditLocalStorage = getFolderEditLocalStorage();
                    folderEditLocalStorage.activeTab = $scope.tabsList[$scope.activeTabIndex].path;
                    setFolderEditLocalStorage(folderEditLocalStorage);
                }

                var saveTabScrollPosition = function(path, scroll) {
                    var folderEditLocalStorage = getFolderEditLocalStorage();
                    if (!folderEditLocalStorage.scrollPositions) {
                        folderEditLocalStorage.scrollPositions = {};
                    }
                    folderEditLocalStorage.scrollPositions[path] = scroll;
                    setFolderEditLocalStorage(folderEditLocalStorage);
                }

                var cleanTabScrollPosition = function() {
                    var folderEditLocalStorage = getFolderEditLocalStorage();
                    var scrollPositions = folderEditLocalStorage.scrollPositions;
                    if (scrollPositions) {
                        var tabsPathList = $scope.tabsList.map(function(f) {
                            return f.path;
                        });
                        Object.keys(scrollPositions).forEach(function(path) {
                            if (tabsPathList.indexOf(path) == -1) {
                                delete scrollPositions[path];
                            }
                        });
                    }
                    setFolderEditLocalStorage(folderEditLocalStorage);
                }

                $scope.getTabScrollPosition = function(path) {
                    var folderEditLocalStorage = getFolderEditLocalStorage();
                    return folderEditLocalStorage.scrollPositions && folderEditLocalStorage.scrollPositions[path] ? folderEditLocalStorage.scrollPositions[path] : 0;
                }

                var openSavedTabs = function() {
                    var folderEditLocalStorage = getFolderEditLocalStorage();
                    var activeTab = null;
                    $scope.tabsList =[];
                    folderEditLocalStorage.tabsList.forEach(function (filePath) {
                        var objPath = searchInDevContents(filePath);
                        if (objPath) {
                            var file = objPath[objPath.length - 1];
                            $scope.addTab(file);
                            if (filePath == folderEditLocalStorage.activeTab) {
                                activeTab = file;
                            }
                        }
                    });
                    var fileToOpen = folderEditLocalStorage.activeTab && activeTab ? activeTab : $scope.tabsList[$scope.tabsList.length - 1];
                    if (fileToOpen) {
                        $scope.focusOnFile(fileToOpen.path);
                        $scope.openFile(fileToOpen);
                        $scope.unregisterArrowSliderInit = $scope.$on("DKU_ARROW_SLIDER:arrow_slider_initialized", function() {
                            slideToTab(fileToOpen.path);
                        });
                    }
                }

                /*
                 * CRUD
                 */

                const updateGitRefsAfterSave = function(cond) {
                    if ($scope.gitRefCallbacks) {
                        $scope.listContents();
                    }
                };

                $scope.saveCurrentContent = function() {
                    var currentContent = $scope.getCurrentContent();
                    $scope.saveContent(currentContent);
                };

                function doSaveContent(content) {
                    $scope.folderEditCallbacks.set(content).success(function(data){
                        $scope.originalContentMap[content.path] = angular.copy(content);
                        postSaveCallback();
                        updateGitRefsAfterSave(content.path === 'external-libraries.json');
                        const dirtyFiles = {
                            [content.path]: content.data
                        };
                        reloadPluginIfNeeded(dirtyFiles);
                    }).error(setErrorInScope.bind($scope));
                }

                function validateAndSaveContent(content) {
                    if (!$scope.folderEditCallbacks.validate) {
                        doSaveContent(content)
                    } else {
                        const dirtyFiles = {
                            [content.path]: content.data
                        };
                        $scope.folderEditCallbacks.validate(dirtyFiles).success(function(data) {
                            if (!data.anyMessage) {
                                doSaveContent(content)
                            } else {
                                CreateModalFromTemplate('/templates/plugins/development/plugin-dev-warning-modal.html', $scope, null, function(modalScope) {
                                    modalScope.messages = data;
                                    modalScope.saveAnyway = function() {
                                        modalScope.dismiss();
                                        doSaveContent(content)
                                    }
                                })
                            }
                        }).error(setErrorInScope.bind($scope));
                    }
                }

                $scope.saveContent = function(content) {
                    if (content.readOnly) { // I keep this "readOnly" thing but looks like it's not a feature anymore (in fact was never a feature)
                        Dialogs.confirm($scope,'Save changes','The file is read-only. Make it writable?').then(function() {
                            validateAndSaveContent(content)
                        });
                    } else {
                        validateAndSaveContent(content)
                    }
                };

                function doSaveAll(dirtyFiles) {
                    $scope.folderEditCallbacks.setAll(dirtyFiles).success(function(data){
                        Object.keys(dirtyFiles).forEach(function(filePath) {
                            $scope.originalContentMap[filePath].data = dirtyFiles[filePath];
                        });
                        postSaveCallback();
                        updateGitRefsAfterSave('external-libraries.json' in dirtyFiles);
                        reloadPluginIfNeeded(dirtyFiles)
                    }).error(setErrorInScope.bind($scope));
                }

                $scope.saveAll = function() {
                    var dirtyFiles = {};
                    $scope.tabsList.forEach(function(file) {
                        if ($scope.isContentDirty(file)) {
                            dirtyFiles[file.path] = $scope.editedContentMap[file.path].data;
                        }
                    });
                    resetErrorInScope($scope);
                    if (!$scope.folderEditCallbacks.validate) {
                        doSaveAll(dirtyFiles);
                    } else {
                        $scope.folderEditCallbacks.validate(dirtyFiles).success(function(data) {
                            if (!data.anyMessage) {
                                doSaveAll(dirtyFiles);
                            } else {
                                CreateModalFromTemplate('/templates/plugins/development/plugin-dev-warning-modal.html', $scope, null, function(modalScope) {
                                    modalScope.messages = data;
                                    modalScope.saveAnyway = function() {
                                        modalScope.dismiss();
                                        doSaveAll(dirtyFiles);
                                    }
                                })
                            }
                        }).error(setErrorInScope.bind($scope));
                    }
                };

                function reloadPluginIfNeeded(dirtyFiles) {
                    if (dirtyFiles) { // not specified in the case of folder rename for example (and then we do want to reload)
                        let hasAnyJson = false;
                        let hasAnyJs = false;
                        for (const f of Object.keys(dirtyFiles)) {
                            if (f.toLowerCase().endsWith('.json')) {
                                hasAnyJson = true;
                                break;
                            }
                            if (f.toLowerCase().endsWith('.js')) {
                                hasAnyJs = true;
                                break;
                            }
                        }
                        if (!hasAnyJson && !hasAnyJs) {
                            return;
                        }
                    }
                    $scope.reloadPlugin && $scope.reloadPlugin($stateParams.pluginId);
                }

                $scope.deleteContent = function(content) {
                    var isNonEmptyFolder = content.children != null && content.children.length > 0;
                    var message = isNonEmptyFolder ? 'Are you sure you want to delete ' + content.name + ' and all its contents?' : 'Are you sure you want to delete ' + content.name + ' ?';
                    Dialogs.confirm($scope,'Delete ' + ( isNonEmptyFolder ? 'folder' : 'file'), message).then(function() {
                        $scope.folderEditCallbacks.delete(content).success(function(data){
                            var toClose = [];
                            $scope.tabsList.forEach(function(file) {
                                if (isIncludedOrEqual(file.path, content.path)) {
                                    toClose.push(file);
                                }
                            });
                            toClose.forEach(function(f) {
                                closeContent(f);
                            });
                            DKUtils.reloadState();
                        }).error(setErrorInScope.bind($scope));
                    });
                };

                $scope.renameContent = function(content) {
                    var popinName = content.children ? "Rename folder" : "Rename file";
                    Dialogs.prompt($scope, popinName, 'New name', content.name).then(function(newName) {
                        $scope.folderEditCallbacks.rename(content, newName).success(function(data){
                            //syntaxic coloration issues
                            if (content.mimeType != data.mimeType) {
                                //refreshing code mirror syntaxic coloration if we renamed current content
                                if ($scope.getCurrentContent() && $scope.getCurrentContent().path == content.path) {
                                    refreshSyntaxicColoration(content.name, data.mimeType);
                                }
                                //necessary if file renamed is among tabs (but not active one), otherwise syntaxic coloration won't be updated when we come back to this tab.
                                if ($scope.tabsMap[content.path]) {
                                    propagatingMimeTypeChange(content.path, data.mimeType);
                                }
                            }
                            // necessary, otherwise it fails when clicking on save after a move
                            propagatingPathChange(content.path, data.path);
                            reloadPluginIfNeeded();
                            DKUtils.reloadState();
                        }).error(setErrorInScope.bind($scope));
                    });
                };

                $scope.moveContent = function(content) {
                    CreateModalFromTemplate("/templates/plugins/development/fragments/filemove-prompt.html", $scope, "MoveContentModalController", function(newScope) {
                        newScope.devContents = angular.copy($scope.devContents); // so that the stat is disconnected from the main display of the hierarchy
                        newScope.toMove = content;
                        newScope.doMove = function(to) {
                            $scope.folderEditCallbacks.move(content, to).success(function(data){
                                // necessary, otherwise it fails when clicking on save after a move
                                propagatingPathChange(content.path, data.path);
                                reloadPluginIfNeeded();
                                DKUtils.reloadState();
                            }).error(setErrorInScope.bind($scope));
                        };
                    });
                };

                $scope.canDuplicateContent = $scope.folderEditCallbacks.copy != null;

                $scope.duplicateContent = function(content) {
                    $scope.folderEditCallbacks.copy(content).success(function(data){
                        DKUtils.reloadState();
                    }).error(setErrorInScope.bind($scope));
                }

                var propagatingPathChange = function(oldPath, newPath) {
                    // In tabslist
                    $scope.tabsList.forEach(function(file) {
                        if (isIncludedOrEqual(file.path, oldPath)) {
                            var oldFilePath = file.path;
                            var newFilePath = file.path.replace(oldPath, newPath);
                            file.path = newFilePath;
                            file.name = file.path.match(/[^\/]+$/)[0] // file name may changed
                            //updating originalContentMap
                            var originalContent = $scope.originalContentMap[oldFilePath];
                            if (originalContent) {
                                originalContent.path = newFilePath;
                                originalContent.name = originalContent.path.match(/[^\/]+$/)[0] // file name may changed
                                $scope.originalContentMap[newFilePath] = originalContent;
                                delete $scope.originalContentMap[oldFilePath];
                            }
                            //updating edtitedContentMap
                            var editedContent = $scope.editedContentMap[oldFilePath];
                            if (editedContent) {
                                editedContent.path = newFilePath;
                                editedContent.name = editedContent.path.match(/[^\/]+$/)[0] // file name may changed
                                $scope.editedContentMap[newFilePath] = editedContent;
                                delete $scope.editedContentMap[oldFilePath];
                            }
                        }
                    });
                    // In localStorage
                    var folderEditLocalStorage = getFolderEditLocalStorage();
                    for (var i=0; i<folderEditLocalStorage.tabsList.length; i++) {
                        var filePath = folderEditLocalStorage.tabsList[i];
                        if (isIncludedOrEqual(filePath, oldPath)) {
                            folderEditLocalStorage.tabsList[i] = filePath.replace(oldPath, newPath);
                        }
                    }
                    if (folderEditLocalStorage.activeTab && isIncludedOrEqual(folderEditLocalStorage.activeTab, oldPath)) {
                        folderEditLocalStorage.activeTab = folderEditLocalStorage.activeTab.replace(oldPath, newPath);
                    }
                    setFolderEditLocalStorage(folderEditLocalStorage);
                };

                var propagatingMimeTypeChange = function(path, mimeType) {
                    for (var i = 0; i<$scope.tabsList.length; i++) {
                        var file = $scope.tabsList[i];
                        if (file.path == path) {
                            file.mimeType = mimeType;
                            break;
                        }
                    }
                }

                var decompressibleMimes = ['application/zip', 'application/x-bzip', 'application/x-bzip2', 'application/x-gzip', 'application/x-tar', 'application/gzip', 'application/bzip', 'application/bzip2', 'application/x-compressed-tar'];
                $scope.canBeDecompressed = function(content) {
                    return content && content.mimeType && decompressibleMimes.indexOf(content.mimeType) >= 0;
                };

                $scope.computeFileIconClass = function(file) {
                    if (file.fromGit) {
                        return 'icon-dku-git-file';
                    } else if ($scope.canBeDecompressed(file)) {
                        return 'icon-dku-file-zip';
                    } else if ($scope.isImage(file)) {
                        return 'icon-picture';
                    } else {
                        return 'icon-file-text-alt';
                    }
                };

                $scope.decompressContent = function(content) {
                    $scope.folderEditCallbacks.decompress(content).success(function(data){
                        $scope.listContents();
                    }).error(setErrorInScope.bind($scope));
                };

                $scope.addInElement = function(contentPath, isFolder) {
                    CreateModalFromTemplate("/templates/plugins/development/fragments/filename-prompt.html", $scope, null, function(newScope) {
                        newScope.isFolder = isFolder;
                        newScope.doCreation = function(fileName) {
                            $scope.folderEditCallbacks.create(contentPath + '/' + fileName, isFolder).success(function(data){
                                $scope.listContents().success(function() {
                                    if (!isFolder) {
                                        var newElPath = contentPath && contentPath.length > 0 ? contentPath + '/' + fileName : fileName;
                                        var newElement = searchInDevContents(newElPath);
                                        if (newElement) {
                                            $scope.openFile(newElement[newElement.length - 1]);
                                        }
                                    }
                                });
                            }).error(setErrorInScope.bind($scope));
                        };
                    });
                };

                var openFirstUpload = function(contentPath, firstUpload) {
                    $scope.listContents().success(function() {
                        var firstUploadPath = contentPath && contentPath.length > 0 ? contentPath + "/" + firstUpload.name : firstUpload.name;
                        var firstUploadPathObj = searchInDevContents(firstUploadPath);
                        if (firstUploadPathObj) {
                            $scope.openFile(firstUploadPathObj[firstUploadPathObj.length - 1]);
                        }
                    });
                };
                $scope.uploadElement = function(contentPath) {
                    CreateModalFromTemplate("/templates/plugins/development/fragments/upload-prompt.html", $scope, "UploadContentModalController", function(newScope) {
                        newScope.folderEditCallbacks = $scope.folderEditCallbacks;
                        newScope.openFirstUpload = openFirstUpload;
                        newScope.contentPath = contentPath;
                    });
                };

                checkChangesBeforeLeaving($scope,  $scope.hasDirtyContent, $scope.folderEditSaveWarning);

                /*
                 * Git references actions
                 */

                $scope.gitRefActions = {
                    setModal: function (gitRef, gitRefPath) {
                        CreateModalFromTemplate("/templates/plugins/development/fragments/git-ref-prompt.html", $scope, "GitReferenceSetController", newScope => {
                            if (gitRef && gitRefPath) {
                                newScope.gitRef = gitRef;
                                newScope.gitRefPath = gitRefPath;
                                newScope.isEditingGitRef = true;
                            }

                            newScope.onSetCallback = () => { $scope.listContents(); };
                        });
                    },
                    listModal: function () {
                        $scope.listContents().then(() => {
                            CreateModalFromTemplate("/templates/plugins/development/fragments/git-ref-list.html", $scope);
                        }, setErrorInScope.bind($scope));
                    },
                    pullModal: function (gitRefPath) {
                        const pullGitRefAPI = gitRefPath ?
                            $scope.gitRefCallbacks.pullOne(gitRefPath) :
                            $scope.gitRefCallbacks.pullAll();

                        pullGitRefAPI.then(pullResult => {
                            FutureProgressModal.show($scope, pullResult.data, "Updating").then(futureResult => {
                                if (futureResult) {
                                    Dialogs.infoMessagesDisplayOnly($scope, "Update result", futureResult).then(() => {
                                        // If at least one of the pulls succeeded, we want to reload the state as files might have changed
                                        if (futureResult.messages.some(message => message['severity'] === 'SUCCESS')) {
                                            DKUtils.reloadState();
                                        }
                                    });
                                }
                            }, setErrorInScope.bind($scope));
                        }, setErrorInScope.bind($scope));
                    },
                    rmModal: function (gitRefPath) {
                        Dialogs.confirm($scope, 'Remove Git reference', 'Are you sure you want to remove this Git reference and the associated folder?').then(() => {
                            $scope.gitRefCallbacks.rm(gitRefPath, true).then(() => {
                                DKUtils.reloadState();
                            }, setErrorInScope.bind($scope))
                        });
                    },
                    untrackModal: function (gitRefPath) {
                        Dialogs.confirm($scope, 'Untrack Git reference', 'Are you sure you want to untrack this Git reference and keep the associated folder?').then(() => {
                            $scope.gitRefCallbacks.rm(gitRefPath, false).then(() => {
                                DKUtils.reloadState();
                            }, setErrorInScope.bind($scope))
                        });
                    }
                };


                /*
                 * UI Utils
                 */

                $scope.getMarginFromDepth = function(depth) {
                    return (depth + 1)*15 + 10;
                }

                $scope.getCarretLeftPosition = function(depth) {
                    return $scope.getMarginFromDepth(depth - 1);
                }

                $scope.containsFolder = function(element) {
                    if (!element.children) {
                        return false;
                    }
                    for (var i=0; i<element.children.length; i++) {
                        var e = element.children[i];
                        if (typeof(e.children) !== "undefined") {
                            return true;
                        }
                    }
                    return false;
                }

                $scope.isImage = function(element) {
                    return element.mimeType.startsWith('image');
                }

                $scope.emptyCtaBtnAction = function() {
                    if ($scope.emptyCta && $scope.emptyCta.btnAction) {
                        switch ($scope.emptyCta.btnAction) {
                            case 'create':
                                $scope.addInElement('', false);
                                break;
                            case 'upload':
                                $scope.uploadElement('');
                                break;
                            default:
                                return false;
                        }
                    }
                }


                /*
                 * Utils
                 */

                var isIncludedOrEqual = function(path, path2) {
                    return path.startsWith(path2 + "/") || path == path2;
                }
            }
        };
    });

    app.controller("NewFileModalController", function($scope, DataikuAPI, $state, $stateParams, WT1){
        $scope.fileName = null;
        $scope.create = function() {
            $scope.doCreation($scope.fileName);
            $scope.dismiss();
        };
    });

    app.controller("GitReferenceSetController", function($scope, $stateParams, DKUtils, DataikuAPI, ActivityIndicator, CreateModalFromTemplate, SpinnerService) {
        $scope.gitRef = $scope.gitRef || {
            remote: '',
            remotePath: '',
            checkout: ''
        };
        $scope.gitRefPath = $scope.gitRefPath || '';
        $scope.addPythonPath = true;
        $scope.isGitRefPathUnique = true;

        $scope.$watch("gitRefPath", function(gitRefPath) {
            if (!$scope.isEditingGitRef) {
                $scope.isGitRefPathUnique = !gitRefPath || !(gitRefPath in $scope.gitReferences);
            }
        });

        $scope.setGitRef = function() {
            $scope.gitRefCallbacks.set($scope.gitRef, $scope.gitRefPath, $scope.addPythonPath).then(() => {
                ActivityIndicator.success('Git reference successfully set.');
                if ($scope.onSetCallback) {
                    $scope.onSetCallback();
                }
                $scope.gitRefActions.pullModal($scope.gitRefPath);
            }, setErrorInScope.bind($scope));
        };
    });

    app.controller("MoveContentModalController", function($scope) {
        $scope.uiState = {moveToTop : false, destination : null};

        $scope.changeDestination = function(to) {
            $scope.uiState.destination = to;
            var recClearMoveToHere = function(l) {
                l.forEach(function(e) {
                    if (e != to) {
                        e.moveToHere = false;
                        if (e.children) {
                            recClearMoveToHere(e.children);
                        }
                    }
                });
            };
            recClearMoveToHere($scope.devContents);
            if (to != null) {
                $scope.uiState.moveToTop = false;
                to.moveToHere = true;
            } else {
                $scope.uiState.moveToTop = true;
            }
        };

        $scope.hasNowhereToGo = function() {
            if ($scope.uiState.moveToTop) {
                return false;
            } else if ($scope.uiState.destination && $scope.uiState.destination.moveToHere) {
                return false;
            } else {
                return true;
            }
        }

        $scope.move = function() {
            if ($scope.uiState.moveToTop) {
                $scope.doMove(null);
            } else if ($scope.uiState.destination && $scope.uiState.destination.moveToHere) {
                $scope.doMove($scope.uiState.destination);
            }
            $scope.dismiss();
        };
    });

    app.controller("UploadContentModalController", function($scope, DataikuAPI, $state, $stateParams, WT1, Logger) {
        $scope.toUpload = [];

        $scope.selectedCount = function() {
            return $scope.toUpload.filter(function(f) {return f.$selected;}).length;
        };
        $scope.startedCount = function() {
            return $scope.toUpload.filter(function(f) {return f.started;}).length;
        };
        $scope.doneCount = function() {
            return $scope.toUpload.filter(function(f) {return f.done;}).length;
        };

        var getPathForFileToUpload = function(fileToUpload) {
            return fileToUpload.name;
        };
        var isAlreadyListed = function(filePath) {
            var found = false;
            $scope.toUpload.forEach(function(u) {
                found |= filePath == u.name;
            });
            return found;
        };
        $scope.uploadFiles = function(files) {
            var filePaths = [];
            var newFiles = [];
            for (var i = 0, len = files.length; i < len ; i++) { // no forEach() on the files :(
                var file = files[i];
                var filePath = getPathForFileToUpload(file);
                if (!isAlreadyListed(filePath)) {
                    filePaths.push(filePath);
                    newFiles.push(file);
                }
            }
            $scope.doCheckUpload(filePaths).success(function(data) {
                for (var i = 0, len = newFiles.length; i < len ; i++) { // no forEach() on the files :(
                    var file = newFiles[i];
                    var feasability = data.feasabilities[i];
                    $scope.toUpload.push({file:file, name:getPathForFileToUpload(file), feasability:feasability, $selected:feasability.canUpload});
                }
            }).error(setErrorInScope.bind($scope));
        };

        $scope.upload = function() {
            $scope.doUpload($scope.toUpload.filter(function(f) {return f.$selected;}));
        };

        $scope.goToFirstUploaded = function() {
            var succeeded = $scope.toUpload.filter(function(f) {return f.succeeded != null;})[0];
            if (succeeded != null) {
                $scope.openFirstUpload($scope.contentPath, succeeded);
            }
            $scope.dismiss();
        };
        var checkUploadCompletion = function() {
            if ($scope.startedCount() == 1 && $scope.startedCount() == $scope.doneCount()) {
                var succeeded = $scope.toUpload.filter(function(f) {return f.succeeded != null;})[0];
                if (succeeded != null) {
                    $scope.goToFirstUploaded();
                }
            }
        };
        $scope.doUpload = function(filesToUpload) {
            filesToUpload.forEach(function(fileToUpload) {
                fileToUpload.started = true;
                $scope.folderEditCallbacks.upload($scope.contentPath, fileToUpload.file, function (e) {
                    if (e.lengthComputable) {
                        $scope.$apply(function () {
                            fileToUpload.progress = Math.round(e.loaded * 100 / e.total);
                        });
                    }
              }).then(function (data) {
                  Logger.info("file " + fileToUpload.name + "uploaded", data);
                  fileToUpload.done = true;
                  fileToUpload.succeeded = JSON.parse(data);
                  checkUploadCompletion();
              }, function(payload){
                  Logger.info("file " + fileToUpload.name + "could not be uploaded", payload);
                  fileToUpload.done = true;
                  fileToUpload.failed = getErrorDetails(JSON.parse(payload.response), payload.status, function(h){return payload.getResponseHeader(h)}, payload.statusText);
                  fileToUpload.failed.html = getErrorHTMLFromDetails(fileToUpload.failed);
                  checkUploadCompletion();
              });
            });
        };
        $scope.doCheckUpload = function(filePaths) {
            return $scope.folderEditCallbacks.checkUpload($scope.contentPath, filePaths);
        };
    });
})();
