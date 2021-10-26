(function() {
    'use strict';

    const app = angular.module('dataiku.controllers');

    app.constant("NO_PERMISSION_TOOLTIP_MSG", "No permission have been defined on the folder. Only administrators and users who have access to some projects or folders in this folder will be able to see it. Click to define permissions.");

    app.controller('_ProjectsListBaseBehavior', function ($scope, Fn) {
        $scope.prepareProject = function(project, tagsMap, contributorsMap) {
            // --- Commits
            if (project.totalCommits) {
                project.commits = project.totalCommits.dayTS.data.map((ts, i) => {
                    return { date: new Date(ts), value: project.totalCommits.value.data[i]};
                });
                //if there is less than 8 weeks of data we fill missing days with zeros
                if (project.commits.length < 56) {
                    project.commits = project.commits.concat().sort((a, b) => Fn.CMP(a.date, b.date));
                    const oldestDataDate = project.commits[0].date;
                    const missingDays = 56 - project.commits.length;
                    for (var i = 0; i < missingDays; i++) {
                        const timestamp = oldestDataDate.getTime() - (i + 1) * 24 * 60 * 60 * 1000;
                        project.commits.unshift({date: new Date(timestamp), value: -1});
                    }
                }
            }
        };

        $scope.lockForPopup = () => $scope.isPopupActive = true;

        $scope.unlockAfterPopup = () => $scope.isPopupActive = false;
    });

    app.controller('ProjectsListController', function ($scope, $controller, $state, $rootScope, $timeout, $http, Assert, DataikuAPI, localStorageService, WT1, TopNav, ProjectFolderContext, NO_PERMISSION_TOOLTIP_MSG,
                                               CreateModalFromTemplate, ListFilter, LoggerProvider, Debounce, DKUConstants, TaggingService, HomePageContextService, openDkuPopin, StateUtils, HomeBehavior, Throttle, ActivityIndicator) {

        const Logger = LoggerProvider.getLogger('ProjectsListController');

        $controller('_ProjectsListBaseBehavior', { $scope });

        $scope.ProjectFolderContext = ProjectFolderContext;

        $scope.uiState = {};
        $scope.projectsMap = {};
        $scope.projectsList = [];
        $scope.rowHeight = 192;

        $scope.NO_PERMISSION_TOOLTIP_MSG = NO_PERMISSION_TOOLTIP_MSG;


        TopNav.setLocation(TopNav.DSS_HOME);

        /*
         * Initialize projects list
         */

        $scope.exposedObjInit = function () {
            $scope.tagsList = [];
            $scope.contributorsList = [];

            $scope.nbArchivedProjects = 0;
        };

        $scope.onListSuccess = data => {
            $scope.projectsMap = {};
            const tagsMap = new Map();
            const contributorsMap = new Map();

            data.projects.forEach(p => {
                $scope.projectsMap[p.projectKey] = p;

                // --- Tags
                //populating tagsMap will all descendants projects
                p.tags.forEach(tag => {
                    const entry = tagsMap.get(tag);
                    if (entry !== undefined) {
                        entry.count++;
                    } else {
                        const tagDef = p.tagsFile.tags[tag]
                        const color = (tagDef == undefined || tagDef.color == undefined) ? TaggingService.getDefaultColor(tag) : tagDef.color;
                        tagsMap.set(tag, {count: 1, color: color});
                    }
                });

                p.contributors.forEach(contributor => {
                    if (!contributorsMap.has(contributor.login)) {
                        contributorsMap.set(contributor.login, angular.extend({}, contributor, { sortName: contributor.displayName.toLowerCase() }));
                    }
                })
            });
            const projectsList = data.folder.projectKeys.map(projectKey => $scope.projectsMap[projectKey]).filter(p => p != null);
            projectsList.forEach(project => $scope.prepareProject(project, tagsMap, contributorsMap));
            projectsList.forEach(project => {
                if (project.projectStatus === DKUConstants.ARCHIVED_PROJECT_STATUS) {
                    $scope.nbArchivedProjects++;
                }
            });
            tagsMap.forEach((value, key) => $scope.tagsList.push({ title: key, count: value.count, color: value.color }));
            $scope.tagsList.sort((a, b) => a.title > b.title);
            contributorsMap.forEach((value) => $scope.contributorsList.push(value));
            $scope.contributorsList.sort((a, b) => a.sortName.localeCompare(b.sortName));
            $scope.folders = data.folder.children;
            $scope.projectsList = projectsList;
            const list = treeToList(data.folder, item => item.parent);
            ProjectFolderContext.setProjectFoldersInPath(list.slice(1));
            let path = list.filter(fip => fip.name).map(fip => fip.name).join('>');
            if (path) {
                $state.go('.', {'#': path}, {location: 'replace', notify: false, reload: false});
            }
            $scope.updateDisplayedItems();
        };

        $scope.onDragStart = event => {
            WT1.event("project-list-move-dragndrop", {action: 'start'});
            $scope.draggableInfos = { projects: $scope.selectedProjects.map(p => p.projectKey), folders: $scope.selectedFolders.map(f => f.id) };

            if ($scope.selectedFolders.length === 0 && $scope.selectedProjects.length === 0) {
                $scope.draggableInfos[`${event.currentTarget.dataset.type}s`].push(event.currentTarget.dataset.id);
            }

            const draggingFolders = $scope.folders.filter(f => $scope.draggableInfos.folders.includes(f.id));
            const adminFolders = draggingFolders.filter(f => f.isAdmin);
            // In case you are not admin on the folders or you are dragging something not selected
            if (draggingFolders.length !== adminFolders.length || $scope.draggableInfos[`${event.currentTarget.dataset.type}s`].includes(event.currentTarget.dataset.id) === false) {
                event.preventDefault();
                return false;
            }

            let dragImageTarget = event.currentTarget;
            if (($scope.selectedProjects.length + $scope.selectedFolders.length) > 1) {
                const element = document.querySelector('#drag-preview');
                const newDiv = event.currentTarget.cloneNode(true);
                removeClassFromClassName(newDiv, 'selected');
                newDiv.removeAttribute('data-id');
                newDiv.removeAttribute('data-type');
                const shiftDiv = newDiv.cloneNode(false);
                shiftDiv.style.position = 'absolute';
                shiftDiv.style.top = '6px';
                shiftDiv.style.left = '6px';
                shiftDiv.style.zIndex = '-1';
                element.appendChild(shiftDiv);
                element.appendChild(newDiv);
                dragImageTarget = element;
            }

            event.dataTransfer.setDragImage(dragImageTarget, event.offsetX, event.offsetY);
            event.dataTransfer.setData('object/draggables', JSON.stringify($scope.draggableInfos));

            $scope.DOMDraggableOperation($scope.draggableInfos, div => {
                addClassToClassName(div, 'dragging');
            });
            $scope.isDragging =  true;

            const throttle = Throttle().withScope($scope).withDelay(200);

            event.currentTarget.closest('.fat-repeat').ondragover = event => {
                const target = event.currentTarget;
                throttle.exec(() => {
                    const delta = $scope.rowHeight / 2;
                    const clientRect = target.getBoundingClientRect();
                    if (event.clientY < (clientRect.top + delta)) {
                        $scope.$broadcast('moveScroll', 0, -delta);
                    } else if (event.clientY > (clientRect.bottom - delta))  {
                        $scope.$broadcast('moveScroll', 0, delta);
                    }
                });
            };
        };

        function removeClassFromClassName(element, toRemove) {
            element.className = element.className.split(' ').filter(c => c !== toRemove).join(' ');
        }

        function addClassToClassName(element, toAdd) {
            if (!element.className.includes(toAdd)) {
                element.className = element.className.split(' ').concat([toAdd]).join(' ');
            }
        }

        function cleanupTarget(target) {
            removeClassFromClassName(target, 'droppable');
            removeClassFromClassName(target, 'forbidden');
        }

        $scope.onDragEnd = event => {
            WT1.event("project-list-move-dragndrop", {action: 'end'});
            $scope.DOMDraggableOperation($scope.draggableInfos, div => {
                removeClassFromClassName(div, 'dragging');
            });
            if (($scope.draggableInfos.projects.length + $scope.draggableInfos.folders.length) > 1) {
                const element = document.querySelector('#drag-preview');
                element.removeChild(element.lastChild);
                element.removeChild(element.lastChild);
            }
            $scope.isDragging = false;
            $scope.draggableInfos.projects = [];
            $scope.draggableInfos.folders = [];
            delete $scope.draggableInfos.forbidden;
            event.currentTarget.closest('.fat-repeat').ondragover = null;
        };

        function displayError() {
            if ($scope.draggableInfos.forbidden) {
                ActivityIndicator.error(`You don't have permissions to write in project folder <strong>${$scope.draggableInfos.forbidden.folder.name}</strong>`);
            }
        }
        const fnErrDragover = Debounce().withScope($scope).withDelay(0, 500).wrap(displayError);

        $scope.onDragOver = event => {
            delete $scope.draggableInfos.forbidden;
            if (event.currentTarget.dataset.type === 'folder') {
                if (!$scope.draggableInfos.folders.includes(event.currentTarget.dataset.id)) {
                    const overFolder = $scope.filteredFoldersList.find(f => f.id === event.currentTarget.dataset.id);
                    if (overFolder.canWriteContents === false) {
                        $scope.draggableInfos.forbidden = { folder: overFolder };
                        addClassToClassName(event.currentTarget, 'forbidden');
                        fnErrDragover();
                        return false;
                    }
                    addClassToClassName(event.currentTarget, 'droppable');
                    event.preventDefault();
                }
            }
        };

        $scope.onDragLeave = event => {
            cleanupTarget(event.currentTarget);
        };

        $scope.onDrop = event => {
            event.preventDefault();
            const data = event.dataTransfer.getData('object/draggables');
            const draggableInfos = JSON.parse(data);
            const destination = event.currentTarget.dataset.id;
            const destinationFolder = $scope.folders.find(f => f.id === destination);

            if (draggableInfos.folders.includes(destination) === false) {
                DataikuAPI.projectFolders.moveItems(destination, draggableInfos.folders, draggableInfos.projects, ProjectFolderContext.getCurrentProjectFolderId()).success(() => {
                    WT1.event("project-list-move-dragndrop", {action: 'success'});
                    $scope.listContent().then(() => {
                        ActivityIndicator.success(`Selected content has been successfully moved to <strong>${destinationFolder.name}</strong>`);
                        $scope.unselectAll();
                    });
                }).error(setErrorInScope.bind($scope));
                cleanupTarget(event.currentTarget);
            }
        };

        $scope.DOMDraggableOperation = (draggableInfos, func) => {
            draggableInfos.projects.forEach(p => {
                const div = document.querySelector(`div[data-id="${p}"][data-type="project"]`);
                if (div !== undefined && div !== null) {
                    func(div);
                }
            });

            draggableInfos.folders.forEach(f => {
                const div = document.querySelector(`div[data-id="${f}"][data-type="folder"]`);
                if (div !== undefined && div !== null) {
                    func(div);
                }
            });
        }

        $scope.listContent = (bindError = true) => {
            $scope.exposedObjInit();
            const currentFolderId = ProjectFolderContext.getCurrentProjectFolderId();
            const promise = currentFolderId ? DataikuAPI.projectFolders.listContents(currentFolderId, $scope.lightMode) : DataikuAPI.projectFolders.listRootContents($scope.lightMode);
            promise.success($scope.onListSuccess);
            if (bindError) {
                promise.error(setErrorInScope.bind($scope));
            }
            return promise;
        };

        $scope.clickOnProject = (project, event) => {
            if ($scope.isPopupActive) {
                return true;
            }
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                toggleSelectProject(project);
                window.getSelection().removeAllRanges(); //FF fix for messy text selection
            } else {
                project.effectivePermission == "READER" ? StateUtils.go.pinboard(project.projectKey) : StateUtils.go.project(project.projectKey);
            }
        };

        $scope.goToFirstFilteredProject = function () {
            if ($scope.filteredProjectsList && $scope.filteredProjectsList.length > 0) {
                var project = $scope.filteredProjectsList[0];
                $state.go('projects.project.home.regular', {projectKey: project.projectKey}, {reload: true});
            }
        };

        $scope.getProjectContributorDisplayList = function (contributors, maxDisplayedContributors) {
            if (contributors.length > maxDisplayedContributors) {
                return contributors.slice(0, maxDisplayedContributors - 1);
            }
            return contributors
        };

        $scope.getDefaultTagColor = TaggingService.getTagColor;

        $scope.isArchivedProjectsDisplayed = function () {
            return $scope.query.projectStatus.indexOf(DKUConstants.ARCHIVED_PROJECT_STATUS) > -1;
        };

        function getDisplayedProjectsCount(mode) {
            switch (mode) {
                case 'CURRENT_FOLDER_ONLY':
                    return $scope.filteredProjectsList.filter(p => $scope.projectsList.find(prj => prj.projectKey == p.projectKey)).length;
                case 'SUB_FOLDERS_ONLY':
                    return $scope.filteredProjectsList.filter(p => !$scope.projectsList.find(prj => prj.projectKey == p.projectKey)).length;
                case 'ALL':
                default:
                    return $scope.filteredProjectsList.length;
            }
        };

        function updateDisplayedItemsCounts() {
            $scope.uiState.displayedItemCounts = {
                nbTotalProjects: $scope.isFiltering() ? Object.keys($scope.projectsMap || {}).length : ($scope.projectsList ? $scope.projectsList.length : 0),
                nbTotalProjectsInCurrentFolder: ($scope.projectsList || []).length,
                nbFilteredProjects: getDisplayedProjectsCount('ALL'),
                nbFilteredProjectsInCurrentFolder: getDisplayedProjectsCount('CURRENT_FOLDER_ONLY'),
                nbFilteredProjectsInSubFolders: getDisplayedProjectsCount('SUB_FOLDERS_ONLY'),
                nbFolders: $scope.isFiltering() ? 0 : $scope.foldersList.length,
                nbFilteredFolders: $scope.filteredFoldersList.length
            };
        }

        $scope.isSubItemsRow = function (row) {
            return row.filter(p => p.type == "REAL_PROJECT" && !$scope.projectsList.find(prj => prj.projectKey == p.projectKey)).length > 0;
        };

        $scope.isFolderRow = function (row) {
            return Array.isArray(row) && row.length > 0 && row[0].type == "FOLDER";
        };

        /*
         * Filtering projects
         */

        if ($rootScope.appConfig.loggedIn) {
            Assert.trueish($rootScope.appConfig.userSettings, 'no user settings');
            /*
             * Filtering projects list
             */
            var pmvf = $rootScope.appConfig.userSettings.projectManagerViewFilters;

            $scope.query = pmvf.filter;
            /* 'q' is not saved in pmvf, re-add it */
            $scope.query.q = "";
            $scope.sortBy = pmvf.sort;
        }

        $scope.$on('$stateChangeSuccess', (e, toState, toParams, fromState) => {
            const homeSharedCtx = HomePageContextService.getSharedCtx(); //get from personal home page
            $scope.query.q = homeSharedCtx.searchFilter ? homeSharedCtx.searchFilter : "";
            if ($scope.appConfig.userSettings.home.behavior === HomeBehavior.LAST) {
                HomePageContextService.setLastVisitedState(HomeBehavior.PROJECTS, {});
            }
        });

        $scope.$on('$stateChangeStart', (e, toState, toParams, fromState, fromParams) => {
            const homeSharedCtx = HomePageContextService.getSharedCtx(); //get from personal home page
            homeSharedCtx.searchFilter = $scope.query.q;
            HomePageContextService.saveSharedCtx(homeSharedCtx)
            if ($scope.appConfig.userSettings.home.behavior === HomeBehavior.LAST &&
                toState.name !== fromState.name) {
                    HomePageContextService.setLastVisitedState(fromState.name, fromParams);
            }
        });

        $scope.isFiltering = function () {
            return $scope.query.tags.length > 0 || $scope.query.contributors.length > 0 || $scope.query.projectStatus.length > 0 || $scope.isFullStringQuerying();
        };

        $scope.isFullStringQuerying = function () {
            return typeof($scope.query.q) !== "undefined" && $scope.query.q.length > 0;
        };

        $scope.clearFilters = function () {
            $scope.query.tags = [];
            $scope.query.projectStatus = [];
            $scope.query.contributors = [];
            $scope.query.q = "";
            if ($scope.interestsOptions) {
                $scope.interestsOptions.starredOnly = false;
            }
        };

        /**
          * Flatten a list of folder
          */
        function flattenFolders(folders) {
            let ret = [];
            // loop over the list of folders
            (folders || []).forEach(folder => {
                // concatenate the current parent and the corresponding folders for children
                ret = ret.concat([folder]).concat(flattenFolders(folder.children));
            });
            return ret;
        }

        /**
         * Update the list of items (projects, haikus, news, tips..) displayed to the user
         */
        $scope.updateDisplayedItems = function () {
            $scope.itemsRows = [];
            $scope.filteredProjectsList = filterProjectsList($scope.isFullStringQuerying() ? Array.from(Object.values($scope.projectsMap || {})) : $scope.projectsList, $scope.query);
            $scope.filteredProjectsList = sortProjectsList($scope.filteredProjectsList);
            $scope.foldersList = getDisplayableFolderItems();
            $scope.filteredFoldersList = filterFoldersList($scope.foldersList, $scope.query);
            const flattenFilteredFoldersList = flattenFolders($scope.foldersList).filter(pf => pf.name.toLowerCase().includes($scope.query.q.toLowerCase())).map(getDisplayableFolderItem);
            const folderItemsRows =  getMosaicRows($scope.isFullStringQuerying() ? flattenFilteredFoldersList : $scope.filteredFoldersList);

            // -- For list display
            $scope.itemsList = folderItemsRows.concat($scope.filteredProjectsList);

            // -- For mosaic display
            const localProjects = [];
            const subProjects = [];
            angular.forEach($scope.filteredProjectsList, function(p) {
                if ($scope.projectsList.find(prj => prj.projectKey == p.projectKey)) {
                    localProjects.push(p);
                } else {
                    subProjects.push(p);
                }
            });
            //if not filtering and mosaic mode, adding funny things to current (and therefore only) projects bundle
            if (!$scope.isFiltering() && !ProjectFolderContext.getCurrentProjectFolderId()) {
                addNewsAndHaiku(localProjects);
            }
            const projectRows = getMosaicRows(localProjects).concat(getMosaicRows(subProjects));
            $scope.itemsRows = folderItemsRows.concat(projectRows);

            updateDisplayedItemsCounts();
        };

        /**
         * Returns a list of projects filtered by full text query, tags, users, status, path.
         * Keeps projects that match at least one of the selected attribute for each non-empty filtering category (text query, tags, contributors, status, path)
         * @param projectsList: input list to filter
         * @param query: object wrapping query attributes:
         *      - q: textQuery on which projects list will be filtered (looking through all project's attribute)
         *      - tags: list of tags to filter projects list (inclusive filtering - keep items that match at least one tag)
         *      - contributors: list of contributors to filter projects list (inclusive filtering - keep items that match at least one contributor)
         *      - projectStatus: list of projectStatus to filter projects list (inclusive filtering - keep items that match at least one project status)
         *      - path: path used to filter projects list (project's path needs to be equal to it, or an extension of it in case of full text filtering)
         * @returns {*}
         */
        function filterProjectsList(projectsList, query) {
            // Filtering on full text query
            return ListFilter.filter(projectsList || [], query.q).filter(project => {

                // Keep projects that have at least one of the tags selected in the 'Tags' filter (if there are any)
                if (query.tags && query.tags.length) {
                    if (!project.tags || !query.tags.some(tag => project.tags.includes(tag))) {
                        return;
                    }
                }

                // Keep projects that have at least one of the contributors selected in the 'Users' filter (if there are any)
                if (query.contributors && query.contributors.length) {
                    if (!project.contributors || !project.contributors.some(contributor => query.contributors.includes(contributor.login))) {
                        return;
                    }
                }

                // Keep projects that have at least one of the project status selected in the 'Status' filter (if there are any)
                if (query.projectStatus && query.projectStatus.length) {
                    if (query.projectStatus.indexOf(project.projectStatus) < 0) {
                        return;
                    }
                } else if (project.projectStatus === DKUConstants.ARCHIVED_PROJECT_STATUS) { // Hiding archived projects by default
                    return;
                }

                project.type = "REAL_PROJECT";
                return true;
            });
        }

        /**
         * Returns a list of folders filtered by tags, users, and status.
         * @param foldersList: input list to filter
         * @param query: object wrapping query attributes:
         *      - tags: list of tags to filter folders list (inclusive filtering)
         *      - contributors: list of contributors to filter folders list (inclusive filtering)
         *      - projectStatus: list of projectStatus to filter folders list (inclusive filtering)
         * @returns {*}
         */
        function filterFoldersList(foldersList, query) {
            let filteredFoldersList = foldersList.concat([]);
            filteredFoldersList = $.grep(filteredFoldersList, item => {
                let filteredFoldersList = [];
                if (item.folders !== undefined) {
                    filteredFoldersList = filterFoldersList(item.folders, query);
                }
                let filteredSubProjectsList = filterProjectsList(item.projects, query);
                return $scope.isFiltering() ? (filteredSubProjectsList.length > 0 || filteredFoldersList.length > 0): true;
            });
            return filteredFoldersList;
        }

        $scope.$watch("query", function (nv, ov) {
            $scope.updateDisplayedItems();
            if (!angular.equals(nv.tags, ov.tags)
                || !angular.equals(nv.projectStatus, ov.projectStatus)
                || !angular.equals(nv.contributors, ov.contributors)) {
                Logger.info("Filtering query modified, saving user settings");
                DataikuAPI.profile.setUserSettings($rootScope.appConfig.userSettings).error(setErrorInScope.bind($scope));
            }
        }, true);

        $scope.toggleTag = function (tagTitle) {
            if (tagTitle) {
                var index = $scope.query.tags.indexOf(tagTitle);
                index > -1 ? $scope.query.tags.splice(index, 1) : $scope.query.tags.push(tagTitle);
            }
        };

        /*
         * Sorting projects list
         */

        $scope.sortByModeTitles = Object.freeze({
            name: "Project Name",
            commit: "Last Modified",
            commit_for_user: "Last Modified By Me",
            status: "Status"
        });

        function sortProjectsList(projectsList) {
            if (!$scope.sortBy) {
                return;
            }
            switch ($scope.sortBy.mode) {
                case "name":
                    sortByName(projectsList);
                    break;
                case "status":
                    sortByStatus(projectsList);
                    break;
                case "commit":
                    sortByCommit(projectsList);
                    break;
                case "commit_for_user":
                    sortByCommitForUser(projectsList);
                    break;
            }
            if ($scope.sortBy.isReversedSort) {
                projectsList.reverse();
            }
            return projectsList;
        }

        function sortByName(projectsList) {
            projectsList.sort(function (p1, p2) {
                return alphabeticalSort(p1.name, p2.name);
            });
        }

        function sortByStatus(projectsList) {
            Assert.inScope($rootScope, 'appConfig');
            const projectStatusNames = [];
            $rootScope.appConfig.projectStatusList.forEach(function (s) {
                projectStatusNames.push(s.name);
            })
            projectsList.sort(function (p1, p2) {
                if (p1.projectStatus && p2.projectStatus) {
                    var indexOfStatus1 = projectStatusNames.indexOf(p1.projectStatus);
                    var indexOfStatus2 = projectStatusNames.indexOf(p2.projectStatus);
                    return indexOfStatus1 < indexOfStatus2 ? -1 : indexOfStatus1 == indexOfStatus2 ? alphabeticalSort(p1.name, p2.name) : 1;
                } else if (p1.projectStatus) {
                    return -1;
                } else if (p2.projectStatus) {
                    return 1;
                } else {
                    return alphabeticalSort(p1.name, p2.name);
                }
            });
        }

        function sortByCommit(projectsList) {
            projectsList.sort(function (p1, p2) {
                if (p1.lastCommit && p2.lastCommit) {
                    return p1.lastCommit.time < p2.lastCommit.time ? 1 : p1.lastCommit.time == p2.lastCommit.time ? 0 : -1;
                } else if (p1.lastCommit) {
                    return -1;
                } else if (p2.lastCommit) {
                    return 1;
                } else {
                    return 0;
                }
            });
        }

        function sortByCommitForUser(projectsList) {
            projectsList.sort(function (p1, p2) {
                if (p1.lastCommitForUser && p2.lastCommitForUser) {
                    return p1.lastCommitForUser.time < p2.lastCommitForUser.time ? 1 : p1.lastCommitForUser.time == p2.lastCommitForUser.time ? 0 : -1;
                } else if (p1.lastCommitForUser) {
                    return -1;
                } else if (p2.lastCommitForUser) {
                    return 1;
                } else {
                    return 0;
                }
            });
        }

        $scope.$watch("sortBy", function (nv, ov) {
            Assert.trueish(nv, 'no new sortBy value');
            Assert.trueish(ov, 'no old sortBy value');
            if (!angular.equals(nv, ov)) {
                $scope.updateDisplayedItems();
                Logger.info("Sort mode updated, saving user settings");
                DataikuAPI.profile.setUserSettings($rootScope.appConfig.userSettings).error(setErrorInScope.bind($scope));
            }
        }, true);

        /*
         * Folders
         */
        function getDisplayableFolderItem(folder) {
            const displayableFolder = angular.copy(folder);
            displayableFolder.type = "FOLDER";
            displayableFolder.projects = displayableFolder.projectKeys.map(projectKey => $scope.projectsMap[projectKey]).filter(p => p != null);
            displayableFolder.nbProjects = displayableFolder.projectKeys.length;
            displayableFolder.filteredProjects = filterProjectsList(displayableFolder.projects, angular.extend({}, $scope.query));
            displayableFolder.nbFilteredProjects = displayableFolder.filteredProjects.length;
            displayableFolder.folders = displayableFolder.children.map(f => getDisplayableFolderItem(f));
            displayableFolder.nbFolders = displayableFolder.children.length;
            displayableFolder.filteredFolders = filterFoldersList(displayableFolder.folders, $scope.query);
            displayableFolder.nbFilteredFolders = displayableFolder.filteredFolders.length;
            const mergedItems = displayableFolder.filteredProjects.map(p => Object.assign({ itemType: 'project' }, p)).concat(displayableFolder.filteredFolders.map(f => Object.assign({ itemType: 'folder' }, f)));
            displayableFolder.filteredItems = mergedItems.slice(0, mergedItems.length > 6 ? 5 : 6);
            displayableFolder.nbExtraItems = mergedItems.length - displayableFolder.filteredItems.length;
            return displayableFolder;
        }

        /**
         * Return list of folders in current path as displayable items (empty array if no folder)
         */
        function getDisplayableFolderItems() {
            if (!$scope.folders) {
                return [];
            }
            return $scope.folders.map(f => getDisplayableFolderItem(f));
        }

        $scope.clickOnFolder = (folder, event) => {
            if ($scope.isPopupActive) {
                return false;
            }
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                toggleSelectFolder(folder);
                window.getSelection().removeAllRanges(); //FF fix to stop messy text selection across the page
            }
        };

        $scope.toggleMenu = function(item, $event, fOpen, fIsItemSelected) {
            $event.preventDefault();
            if (!fIsItemSelected(item)) {
                $scope.unselectAll();
            }
            if ($scope.isPopupActive) {
                if ($scope.popupDismiss) {
                    $scope.popupDismiss();
                    $scope.popupDismiss = undefined;
                }
            } else {
                fOpen(item, $event);
            }
            $event.stopPropagation();
        };

        $scope.displayDuplicateProjectModal = function (project) {
            DataikuAPI.projects.getSummary(project.projectKey).then(function(response) {
                $scope.projectSummary = response.data.object;
                CreateModalFromTemplate("/templates/projects/duplicate-project-dialog.html", $scope, "DuplicateProjectController");
            });
        };

        $scope.openProjectMenu = function (project, $event) {
            let template = `<ul class="dropdown-menu projects-dropdown-menu" >
            <li><a ng-click="displayMoveItemsModal(projects, folders)" ng-class="{disabled: foldersNotAllAdmin || projectsNotAllAdmin}">Move to...</a></li>
            <li><a ng-click="displayDuplicateProjectModal(project)" ng-if="folders.length === 0 && projects.length === 1 && appConfig.globalPermissions.mayCreateProjects === true" ng-class="{disabled: !project.isAdmin}">Duplicate...</a></li>
            </ul>`;
            let callback = newScope => {
                newScope.projects = newScope.selectedProjects.length > 0 ? newScope.selectedProjects : [project];
                newScope.folders = $scope.selectedFolders;
                newScope.project = project;
                newScope.currentFolder = $scope.currentFolder;
                newScope.foldersNotAllAdmin = newScope.folders.some(f => f.isAdmin === false);
                newScope.projectsNotAllAdmin = newScope.projects.some(p => p.isAdmin === false);
                newScope.appConfig = $scope.appConfig;
            };
            let isElsewhere = (_, e) => $(e.target).parents('.dropdown-menu').length == 0;
            $scope.lockForPopup();
            let dkuPopinOptions = {
                template: template,
                isElsewhere: isElsewhere,
                popinPosition: 'CLICK',
                callback: callback,
                onDismiss: $scope.unlockAfterPopup
            };
            $scope.popupDismiss = openDkuPopin($scope, $event, dkuPopinOptions);
        };

        $scope.openFolderMenu = (folder, $event) => {
            const template = `<ul class="dropdown-menu folders-dropdown-menu" >
                <li><a ng-click="displayMoveItemsModal(projects, folders)" ng-class="{disabled: foldersNotAllAdmin || projectsNotAllAdmin}">Move to...</a></li>
                <li><a ng-click="displayRenameFolderModal(folder)" ng-if="projects.length === 0 && folders.length === 1" ng-class="{disabled: !folder.isAdmin}">Rename...</a></li>
                <li><a ng-click="displayProjectFolderPermissionsModal(folder)" ng-if="projects.length === 0 && folders.length === 1" ng-class="{disabled: !folder.isAdmin}">Permissions...</a></li>
                <li><a ng-click="displayDeleteProjectFolderModal(folders)" ng-if="projects.length === 0" ng-class="{disabled: foldersNotAllAdmin}">Delete...</a></li>
            </ul>`;
            const callback = newScope => {
                newScope.folders = newScope.selectedFolders.length > 0 ? newScope.selectedFolders : [folder];
                newScope.projects = $scope.selectedProjects;
                newScope.folder = folder;
                newScope.currentFolder = $scope.currentFolder;
                newScope.foldersNotAllAdmin = newScope.folders.some(f => f.isAdmin === false);
                newScope.projectsNotAllAdmin = newScope.projects.some(p => p.isAdmin === false)
            };
            const isElsewhere = (_, e) => $(e.target).parents('.dropdown-menu').length === 0;
            $scope.lockForPopup();
            $scope.popupDismiss = openDkuPopin($scope, $event, {
                template: template,
                isElsewhere: isElsewhere,
                popinPosition: 'CLICK',
                callback: callback,
                onDismiss: $scope.unlockAfterPopup
            });
        };

        $scope.displayMoveItemsModal = (projects, folders) => {
            CreateModalFromTemplate("/templates/projects-list/modals/move-project-items-modal.html", $scope, "MoveItemsModalController", newScope => {
                newScope.movingProjects = projects;
                newScope.movingFolders = folders;
                let currentFolder = ProjectFolderContext.getCurrentProjectFolder();
                let defaultDestinationIsCurrentFolder = folders && folders.length == 1 && currentFolder && currentFolder.id && currentFolder.parent && currentFolder.id == folders[0].id;
                newScope.newFolderId = defaultDestinationIsCurrentFolder ? currentFolder.parent.id : currentFolder.id;
            });
        };

        $scope.displayDeleteProjectFolderModal = folders => {
            CreateModalFromTemplate("/templates/projects-list/modals/delete-project-folder-modal.html", $scope, "DeleteProjectFolderModalController", newScope => {
                const allContainedProjects = folders.map(f => f.projectKeys).flat();
                const allContainedFolders = folders.map(f => f.children).flat();
                newScope.containedProjects = allContainedProjects.map(p => p.projectKey);
                newScope.containedFolders = allContainedFolders;
                let currentFolder = ProjectFolderContext.getCurrentProjectFolder();
                let defaultDestinationIsCurrentFolder = folders && folders.length == 1 && currentFolder && currentFolder.id && currentFolder.parent && currentFolder.id == folders[0].id;
                newScope.newFolderId = defaultDestinationIsCurrentFolder ? currentFolder.parent.id : currentFolder.id;
                newScope.folders = folders;
            });
        };

        $scope.displayRenameFolderModal = folder => {
            CreateModalFromTemplate("/templates/projects-list/modals/rename-project-folder-modal.html", $scope, "RenameProjectFolderModalController", newScope => {
                newScope.folder = folder;
                newScope.newName = folder.name;
            });
        };

        $scope.displayProjectFolderPermissionsModal = folder => {
            CreateModalFromTemplate("/templates/projects-list/modals/project-folder-permissions-modal.html", $scope, "ProjectFolderPermissionsModalController", newScope => {
                newScope.folder = folder;
            });
        };

        // Projects and Folders selection

        $scope.selectedProjects = [];
        $scope.selectedFolders = [];

        $scope.setSelectedItems = (selectedProjects, selectedFolders) => {
            $scope.selectedProjects = selectedProjects ? selectedProjects : [];
            $scope.selectedFolders = selectedFolders ? selectedFolders : [];
            onSelectedItemsChange($scope.selectedProjects, $scope.selectedFolders);
        };

        $scope.unselectAll = function () {
            $scope.setSelectedItems([], []);
        };

        function toggleSelectProject(project) {
            if (!project.isAdmin) {
                ActivityIndicator.error(`You are not admin of project <strong>${project.name}</strong>`);
                return;
            }
            let index = $scope.selectedProjects.findIndex(p => p.projectKey === project.projectKey);
            if (index == -1) {
                $scope.selectedProjects.push(project);
            } else {
                $scope.selectedProjects.splice(index, 1);
            }
        }

        function toggleSelectFolder(folder) {
            if (!folder.isAdmin) {
                ActivityIndicator.error(`You are not admin of project folder <strong>${folder.name}</strong>`);
                return;
            }
            const index = $scope.selectedFolders.findIndex(f => f.id === folder.id);
            if (index === -1) {
                $scope.selectedFolders.push(folder);
            } else {
                $scope.selectedFolders.splice(index, 1);
            }
        }

        let unselectItemsListenerOn = false

        function onSelectedItemsChange(selectedProjects, selectedFolders) {
            if ((selectedProjects.length > 0 || selectedFolders.length > 0) && !unselectItemsListenerOn) {
                $(window).on('click contextmenu', onClickWhileSelectedItems);
                unselectItemsListenerOn = true;
            }
            if (selectedProjects.length == 0 && selectedProjects == 0) {
                $(window).off('click contextmenu', onClickWhileSelectedItems);
                unselectItemsListenerOn = false;
            }
        }

        function onClickWhileSelectedItems(e) {
            let isUpdatingSelectedItems = e.type == 'click' && e.which == 1 && (e.originalEvent.ctrlKey || e.originalEvent.metaKey);
            let isRightClickingOnSelectedItem = (e.type == 'contextmenu' || (e.type == 'click' && e.which == 3)) && $(e.target).closest('.selected').length > 0;
            let isClickingOnContextualMenu = $(e.target).closest('.projects-dropdown-menu, .folders-dropdown-menu').length > 0;
            let isModalDisplaed = $('.move-project-modal').length > 0
            if (!isUpdatingSelectedItems && !isRightClickingOnSelectedItem && !isClickingOnContextualMenu && !isModalDisplaed) {
                safeApply($scope, function () {
                    $scope.unselectAll();
                });
            }
        }

        $scope.$watch("selectedProjects", nv => onSelectedItemsChange(nv, $scope.selectedFolders), true);
        $scope.$watch("selectedFolders", nv => onSelectedItemsChange($scope.selectedFolders, nv), true);

        $scope.isProjectSelected = project => $scope.selectedProjects.findIndex(sp => sp.projectKey === project.projectKey) !== -1;

        $scope.isFolderSelected = folder => $scope.selectedFolders.findIndex(sf => sf.id === folder.id) !== -1;

        /*
         * News & Haikus
         */

        function addNewsAndHaiku(itemsList) {
            // If no query active, add haiku and news
            if (!$scope.isFiltering()) {
                //adding haiku and news
                itemsList.splice(3, 0, {"type": "TIPS"});
                itemsList.splice($scope.haikuPos, 0, {"type": "HAIKU"});
                //itemsList.splice(6, 0, {"type" : "NEWS"});

                if ($scope.appConfig.homeMessages && $scope.appConfig.homeMessages.length > 0) {
                    itemsList.splice(0, 0, {"type": "MESSAGE"});
                }

                if ($scope.kitties) {
                    var targetIndexes = itemsList.map(function (x, i) {
                        return i;
                    });
                    var kittenIndexes = Array.dkuShuffle(targetIndexes).slice(0, $scope.kitties.length);

                    kittenIndexes.forEach(function (targetIdx, kittyIdx) {
                        itemsList.splice(targetIdx, 0,
                            {"type": "IMAGE", "url": $scope.kitties[kittyIdx]}
                        );
                    });
                }
            }
        }

        //News

        const NEWS_URL = "https://ajax.googleapis.com/ajax/services/feed/load?v=1.0&q=http://dataiku.com/feed.xml&callback=JSON_CALLBACK";
        $http.jsonp(NEWS_URL).then(function (object) {
            $scope.news = object.data.responseData;
            localStorageService.set("dataikuNews", object.data.responseData);
        }, function (object) {
            $scope.news = localStorageService.get("dataikuNews");
        });

        const UPDATE_URL = "//downloads.dataiku.com/latest_studio.json"
        $http.get(UPDATE_URL).then(function (object) {
            $scope.latest_version = object.data;
        });

        //Tips
        const TIPS_URL = "https://update.dataiku.com/dss/3.1/tips/tips.json"
        $http.get(TIPS_URL).then(function (object) {
            $scope.tipsObj = object.data;
            localStorageService.set("dataikuTips", object);
        }, function (object) {
            $scope.tipsObj = localStorageService.get("dataikuTips");
        }).then(function () {
            if ($scope.tipsObj && $scope.tipsObj.tips) {
                $scope.randomTipsIndex = Math.floor(Math.random() * ($scope.tipsObj.tips.length - 0.1));
            }
        });

        //Haikus

        $scope.haikuPos = 5;

        Mousetrap.bind("q", function () {
            $scope.haikuPos--;
            if ($scope.haikuPos < 0) $scope.haikuPos = 0;
            $scope.$apply($scope.updateDisplayedItems);
        });
        Mousetrap.bind("d", function () {
            $scope.haikuPos++;
            $scope.$apply($scope.updateDisplayedItems);
        });


        Mousetrap.bind("z", function () {
            if ($scope.haikuPos >= 2) {
                $scope.haikuPos -= 3;
            }
            $scope.$apply($scope.updateDisplayedItems);
        });
        Mousetrap.bind("s", function () {
            $scope.haikuPos += 3;
            $scope.$apply($scope.updateDisplayedItems);
        });

        $scope.haiku = get_haiku_of_the_day();

        /*
         * Display mode
         */
        $scope.displayMode = pmvf && pmvf.display;
        $scope.lightMode = $scope.displayMode && $scope.displayMode.mode === "mosaic";
        $scope.listContent();

        $scope.$watch("displayMode", (nv, ov) => {
            if (nv && !angular.equals(nv, ov)) {
                WT1.event("project-list-display-mode", {displayMode: nv});
                Logger.info("Display mode modified, saving user settings", nv, ov, angular.equals(nv, ov));
                DataikuAPI.profile.setUserSettings($rootScope.appConfig.userSettings).error(setErrorInScope.bind($scope));
                // if projects were previously listed in a light mode but new display mode need full projects info (ie commits info) we reload
                if ($scope.lightMode && $scope.displayMode !== "mosaic") {
                    $scope.lightMode = false;
                    $scope.listContent();
                }
            }
        }, true);

        var debouncedResizeCB = Debounce().withDelay(200, 200).wrap($scope.updateDisplayedItems);

        $(window).on("resize.homePageResize", debouncedResizeCB);
        $scope.$on("$destroy", function () {
            $(window).off("resize.homePageResize", debouncedResizeCB);
        });

        //Items rows for mosaic view
        const getMosaicRows = function (itemsList) {
            /* Compute display characteristics for mosaic mode */
            const tileW = 310;
            const margins = 40;

            let itemsPerRow = 1;
            let ww = window.innerWidth;
            ww -= margins;

            if (ww > tileW) itemsPerRow = Math.floor(ww / tileW);

            const mosaicItemsPerRow = [];
            let i, j;
            for (i = 0, j = itemsList.length; i < j; i += itemsPerRow) {
                mosaicItemsPerRow.push(itemsList.slice(i, i + itemsPerRow));
            }
            return mosaicItemsPerRow;
        };

        $scope.flowLayoutEngineTitles = {
            'dot': "Left - Right",
            'neato': "Radial"
        };

        $scope.listModeTitles = {
            contributions: 'Contributions',
            scenarios: 'Scenarios'
        };

        /*
         * Troll Shortcuts
         */

        Mousetrap.bind("k i t t i e s", function () {
            $scope.kitties = ['https://source.unsplash.com/random/280x160/?kitten',
                              'https://source.unsplash.com/random/280x160/?kitty',
                              'https://source.unsplash.com/random/280x160/?lynx',
                              'https://source.unsplash.com/random/280x160/?lion',
                              'https://source.unsplash.com/random/280x160/?tiger'];
            $scope.$apply($scope.updateDisplayedItems);
        });

        Mousetrap.bind("o h n o e s", function () {
            $(".image-project-image").css("transform-origin", "right bottom");
            $(".image-project-image").css("transition", "1s all");
            $(".image-project-image").css("transform", "perspective(800px) rotateX(90deg)");
            $scope.kitties = [];
            $timeout($scope.updateDisplayedItems, 1000);
        });

        $scope.newAutomationProject = function () {
            CreateModalFromTemplate("/templates/bundles/automation/new-automation-project.html", $scope, null);
        };

        TaggingService.fetchGlobalTags();
    });

    app.service('ProjectFolderContext', function($state, $stateParams) {
        let foldersInPath;
        function getCurrentProjectFolderId() {
            if ($state.current.name != 'project-list') {
                return null;
            } else {
                return $stateParams.folderId || null;
            }
        }
        function setProjectFoldersInPath(fip) {
            foldersInPath = fip;
        }
        function getProjectFoldersInPath() {
            return foldersInPath;
        }
        function getCurrentProjectFolder() {
            return foldersInPath && foldersInPath.length > 0 && foldersInPath[foldersInPath.length - 1];
        }
        return {
            getCurrentProjectFolderId: getCurrentProjectFolderId,
            setProjectFoldersInPath: setProjectFoldersInPath,
            getProjectFoldersInPath: getProjectFoldersInPath,
            getCurrentProjectFolder: getCurrentProjectFolder
        };
    });

    //Just a template wrapper so far.
    app.directive('projectFolder', function(NO_PERMISSION_TOOLTIP_MSG) {
        return {
            templateUrl: '/templates/projects-list/project-folder.html',
            replace: true,
            scope: {
                item: "=",
                isFiltering: "&",
                displayProjectFolderPermissionsModal: "&",
                toggleMenu: '&',
                openFolderMenu: "&",
                isFolderSelected: "&",
                disableMenu: "@?"
            },
            link: (scope, elem, attrs) => {
                scope.NO_PERMISSION_TOOLTIP_MSG = NO_PERMISSION_TOOLTIP_MSG;
                if (attrs.disableMenu === undefined) {
                    scope.disableMenu = false;
                } else if (scope.disableMenu === "") {
                    scope.disableMenu = true;
                }
            }
        }
    });

    app.controller("BrowseProjectsCommonController", ($scope, DataikuAPI, $q, PromiseService) => {
        $scope.currentFolder = {};
        $scope.browseDoneFn = folder => {
            $scope.currentFolder = folder;
        }

        $scope.browse = folderIds =>  {
            return PromiseService.qToHttp($q(resolve => {
                const ids = folderIds.split('/');
                $scope.destination = ids[ids.length - 1];
                DataikuAPI.projectFolders.listContents($scope.destination, true, 1, true).success(data => {
                    const projectsMap = {};
                    data.projects.forEach(p => { projectsMap[p.projectKey] = p; });
                    const projectsList = data.folder.projectKeys.map(projectKey => projectsMap[projectKey]).filter(p => p != null);
                    const folders = data.folder.children.map(f => angular.extend({}, f, { directory: true, fullPath: f.id }))
                    const pathElts = treeToList(data.folder, item => item.parent);

                    resolve({
                        children: folders.concat(projectsList),
                        pathElts: pathElts.map(f => angular.extend({}, f, { toString: () => f.id })),
                        exists: true,
                        directory: true,
                    });
                }).error(setErrorInScope.bind($scope));
            }));
        };
        $scope.getName = item => item.name;
    });

    app.controller("ProjectFolderSettings", ($scope, DataikuAPI) => {
        $scope.getSettings = function(folder) {
            DataikuAPI.projectFolders.getSettings(folder.id).success(settings => {
                $scope.projectFolderSettings = settings;
                $scope.oldProjectFolderSettings = angular.copy(settings);
                $scope.ui = $scope.ui || {};
                $scope.ui.owner = settings.owner;
            }).error(setErrorInScope.bind($scope));
        }
    });

    app.controller("MoveItemsModalController", ($scope, $controller, DataikuAPI, ProjectFolderContext, Dialogs, $state) => {
        $controller("BrowseProjectsCommonController", { $scope });

        $scope.ProjectFolderContext = ProjectFolderContext;

        $scope.canBrowse = item => item.directory && $scope.movingFolders.findIndex(mf => mf.id === item.id) === -1;

        $scope.canSelect = () => false;

        $scope.confirm = () => {
            DataikuAPI.projectFolders.moveItems($scope.destination, $scope.movingFolders.map(f => f.id), $scope.movingProjects.map(p => p.projectKey), ProjectFolderContext.getCurrentProjectFolderId()).success(() => {
                $scope.listContent(false).success(() => {
                    $scope.unselectAll();
                    $scope.dismiss();
                }).error(() =>
                {
                    $scope.unselectAll(); // Necessary to avoid a logged error after redirected
                    const go = $state.go.bind($state, "project-list", { folderId: '' });
                    Dialogs.ack($scope, "Not authorized", "Since you don't have permission on this folder anymore, you will be redirected to root").then(go, go);
                });
            }).error(setErrorInScope.bind($scope));
        };
    });

    app.controller("DeleteProjectFolderModalController", ($scope, $controller, $state, DataikuAPI, ProjectFolderContext) => {
        $controller("BrowseProjectsCommonController", { $scope });

        $scope.canBrowse = item => item.directory && $scope.folders.findIndex(mf => mf.id === item.id) === -1;

        $scope.canSelect = () => false;

        $scope.confirm = () => {
            DataikuAPI.projectFolders.delete($scope.folders.map(f => f.id), $scope.destination ? $scope.destination : $scope.newFolderId).success(() => {
                $scope.dismiss();
                if (($scope.folders || []).length == 1 && $scope.folders[0].id == ProjectFolderContext.getCurrentProjectFolderId()) {
                    $state.go('project-list', { folderId: ($scope.folders[0].parent || {}).id || '' });
                } else {
                    $scope.listContent();
                }
            }).error(setErrorInScope.bind($scope));
        };
    });

    app.controller("RenameProjectFolderModalController", ($scope, $controller, DataikuAPI) => {
        $controller("NameFolderCommonController", { $scope });
        $controller("ProjectFolderSettings", { $scope });

        $scope.$watch("folder", function(nv) {
            if (!nv) return;
            $scope.getSettings(nv);
        });

        $scope.confirm = () => {
            DataikuAPI.projectFolders.setSettings($scope.folder.id, angular.extend($scope.projectFolderSettings, { name: $scope.newName })).success(() => {
                $scope.listContent().then(() => $scope.unselectAll());
                $scope.dismiss();
            }).error(setErrorInScope.bind($scope));
        };
    });

    app.controller("ProjectFolderPermissionsModalController", ($scope, $controller, WT1, DataikuAPI, CreateModalFromTemplate,
        PermissionsService) => {
        $controller("ProjectFolderSettings", { $scope });

        function makeNewPerm(){
            $scope.newPerm = {
                read: true
            }
        }
        makeNewPerm();

        $scope.$watch("folder", function(nv) {
            if (!nv) return;
            DataikuAPI.security.listGroups(false).success(function(allGroups) {
                $scope.allGroups = allGroups;
                DataikuAPI.security.listUsers().success(function(data) {
                    $scope.allUsers = data;

                    $scope.allUsers.sort(function(a, b){
                        if (a.displayName < b.displayName) return -1;
                        if (a.displayName > b.displayName) return 1;
                        return 0;
                    });
                    $scope.getSettings(nv);
                }).error(setErrorInScope.bind($scope));
            }).error(setErrorInScope.bind($scope));
        });


        $scope.addPermission = function() {
            $scope.projectFolderSettings.permissions.push($scope.newPerm);
            makeNewPerm();
        };

        $scope.getEffectiveReaders = function() {
            WT1.event("project-list-folder-effective-reader", {});
            DataikuAPI.projectFolders.getEffectiveReaders($scope.folder.id)
                .success((data) => {
                    const newScope = $scope.$new();
                    newScope.effectiveReaders = data;
                    CreateModalFromTemplate("/templates/projects-list/modals/project-folder-effective-readers-modal.html", newScope, null);
                })
                .error(setErrorInScope.bind($scope));
        };

        $scope.$watch("projectFolderSettings.permissions", function(nv, ov) {
            if (!nv) return;

            $scope.unassignedGroups = PermissionsService.buildUnassignedGroups($scope.projectFolderSettings, $scope.allGroups);

            /* Handle implied permissions */
            $scope.projectFolderSettings.permissions.forEach(function(p) {
                p.$readDisabled = false;
                p.$writeContentsDisabled = false;
                p.$adminDisabled = false;

                if (p.admin) {
                    p.$readDisabled = true;
                    p.$writeContentsDisabled = true;
                }
                if (p.writeContents) {
                    p.$readDisabled = true;
                }
            });

        }, true)

        // Ownership mgmt
        $scope.$watch("ui.owner", function() {
            PermissionsService.transferOwnership($scope, $scope.projectFolderSettings, "project folder", "owner");
        });

        $scope.confirm = () => {
            if (!angular.equals($scope.oldProjectFolderSettings.permissions, $scope.projectFolderSettings.permissions)) {
                const perms = angular.copy($scope.projectFolderSettings.permissions);
                perms.forEach(perm => { delete perm.group; });
                WT1.event("project-list-folder-permissions", { permissions: perms });
            }
            DataikuAPI.projectFolders.setSettings($scope.folder.id, $scope.projectFolderSettings).success(() => {
                $scope.listContent().then(() => $scope.unselectAll());
                $scope.dismiss();
            }).error(setErrorInScope.bind($scope));
        };
    });
}());
