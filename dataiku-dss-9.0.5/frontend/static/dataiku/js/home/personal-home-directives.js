(function() {
    'use strict';

    const app = angular.module('dataiku.personal-home.directives', ['dataiku.filters']);

    app.service('HomePageContextService', function($timeout, $stateParams, localStorageService) {
        const svc = this;
        const ctxKey = "dssHomePage";

        function saveCtx(ctx) {
            ctx.timestamp = new Date();
            localStorageService.set(ctxKey, ctx);
        }

        function getCtx() {
            let ctx = localStorageService.get(ctxKey);
            if (!ctx) ctx = {};
            if (!ctx.hasOwnProperty("shared")) ctx.shared = {};
            return ctx;
        }

        svc.saveRouteCtx = function(routeName, routeCtx, sharedCtx) {
            const ctx = getCtx();

            angular.copy(sharedCtx, ctx.shared);

            if (ctx[routeName]==undefined) ctx[routeName] = {};
            angular.copy(routeCtx, ctx[routeName]);

            return saveCtx(ctx);
        };

        svc.getRouteCtx = function(routeName, fromState) {
            const fullCtx = getCtx();
            const routeCtx = {shared: fullCtx.shared};
            return angular.extend(routeCtx , fullCtx[routeName]);
        };

        svc.getFullCtx = function(fromState) {
            return getCtx();
        };

        svc.getSharedCtx = function () {
            return getCtx().shared;
        };

        svc.saveSharedCtx = function(sharedCtx) {
            const ctx = getCtx();

            angular.copy(sharedCtx, ctx.shared);
            return saveCtx(ctx);
        }

        svc.setLastVisitedState = (name, toParams) => {
            const ctx = getCtx();
            ctx.lastVistedState = { name, params: toParams };
            saveCtx(ctx);
        };

        svc.getLastVisitedState = () => getCtx().lastVistedState;
    });

    app.directive('searchBar', function() {
      return {
        restrict: 'E',
        scope: {
          projects: '='
        },
        replace: true,
        template: `<div class="search-bar" >
              <div class="icon-search" />
              <input type="text" />
            </div>`,
        link: function(scope, $e, attrs) { }
      };
    });

    app.component('newProjectBtn', {
        bindings: {
            asTiles: '@'
        },
        templateUrl: '/templates/personal-home/new-project-btn.html',
        controller:  function newProjectBtnCtrl($scope, $rootScope, $state, $stateParams, $timeout, PersonalHomeService, CreateModalFromTemplate) {
                const ctrl = this;

                const pluginsById = $rootScope.appConfig.loadedPlugins.reduce(function (map, obj) {
                    map[obj.id] = obj;
                    return map;
                }, {});
                
                ctrl.projectCreationMacros = []

                $rootScope.appConfig.customRunnables.forEach(function(runnable) {
                    if (!runnable.desc.macroRoles) return;

                    const plugin = pluginsById[runnable.ownerPluginId];
                    if (!plugin) return; // plugin might have been deleted

                    runnable.desc.macroRoles.forEach(function(macroRole) {
                        if (macroRole.type != 'PROJECT_CREATOR') return;
                        
                        ctrl.projectCreationMacros.push({
                            label: runnable.desc.meta.label || runnable.id,
                            description: runnable.desc.meta.description || "",
                            icon: runnable.desc.meta.icon || plugin.icon,
                            runnable: runnable
                        });
                    });
                });

                ctrl.getPermissions = function(){
                    return $rootScope.appConfig.globalPermissions;
                }

                ctrl.newProject = function () {
                    CreateModalFromTemplate("/templates/projects/new-project.html", $scope, "NewProjectController");
                };

                ctrl.newProjectFromMacro = function(runnable) {
                     CreateModalFromTemplate('/templates/macros/runnable-modal.html', $scope, null, function(newScope) {
                        newScope.runnable = runnable;
                        newScope.mode = "PROJECT_CREATION";
                    });
                }

                ctrl.newTutorial = function () {
                    CreateModalFromTemplate("/templates/projects/tutorials-samples.html", $scope, "NewTutorialProjectController", function (newScope) {
                        newScope.attachDownloadTo = $scope;
                        newScope.uiState = {
                            currentType: 'TUTORIAL'
                        };
                    });
                };

                ctrl.newSample = function () {
                    CreateModalFromTemplate("/templates/projects/tutorials-samples.html", $scope, "NewTutorialProjectController", function (newScope) {
                        newScope.attachDownloadTo = $scope;
                        newScope.uiState = {
                            currentType: 'SAMPLE'
                        };
                    });
                };

                ctrl.importProject = function () {
                    CreateModalFromTemplate("/templates/projects/import-project.html", $scope, "ImportProjectController");
                };

                ctrl.newAutomationProject = function() {
                    CreateModalFromTemplate("/templates/bundles/automation/new-automation-project.html", $scope, null);
                };

                ctrl.isAutomationNode = function () {
                    return $rootScope.appConfig && $rootScope.appConfig.isAutomation;
                }

            }
    });

    app.component('newFolderBtn', {
        bindings: {
            asTiles: '@',
            listContentFn: '&',
        },
        templateUrl: '/templates/personal-home/new-folder-btn.html',
        controller: ['$scope', 'CreateModalFromTemplate',
            function ($scope, CreateModalFromTemplate) {
                const ctrl = this;
                ctrl.listContentFn = ctrl.listContentFn === undefined ? () => { } : ctrl.listContentFn; // NOSONAR empty function required to avoid crash
                ctrl.displayCreateProjectFolderModal = () => {
                    CreateModalFromTemplate("/templates/projects-list/modals/create-project-folder-modal.html", $scope, "CreateProjectFolderModalController", newScope => {
                        newScope.listContentFn = ctrl.listContentFn;
                    });
            };
        }]
    });

    app.controller("CreateProjectFolderModalController", ($scope, $rootScope, $controller, DataikuAPI, ProjectFolderContext) => {
        $controller("NameFolderCommonController", { $scope });

        let providedItemCount = 0;

        function moveItemCount() {
            if (providedItemCount == 0) {
                providedItemCount = $scope.projectKeys ? $scope.projectKeys.length : 0;
                providedItemCount += $scope.folderPaths ? $scope.folderPaths.length : 0;
            }
            return providedItemCount;
        }

        $scope.moveItemCountText = function () {
            if (moveItemCount() == 1)
                return "1 item";
            else
                return providedItemCount + " items";
        };

        $scope.newFolder = {content: []};

        $scope.canSelect = () => true;

        $scope.canBrowse = () => false;

        $scope.canConfirm = () => $scope.isNameValid($scope.newFolderForm.name, $scope.parentPath, false);

        $scope.confirm = () => {
            const promise = DataikuAPI.projectFolders.create(ProjectFolderContext.getCurrentProjectFolderId(), $scope.newFolder.name);
            promise.success(() => {
                    $scope.listContentFn();
                    $rootScope.$emit('reloadGraph');
                    $scope.dismiss();
                })
                .error(setErrorInScope.bind($scope));
        };
    });
    app.component('gettingStartedTablist', {
        bindings: {
            tabItemList: '=',
            selectedTabIdx: '='
        },
        templateUrl: '/templates/personal-home/getting-started/tab-list.html',
        controller: [function ctlrGettingStartedTablist() {
            const ctrl = this;

            ctrl.$onInit = function () {
            };

            ctrl.selectTab = function (e, idx) {
                ctrl.selectedTabIdx = idx;
                e.stopPropagation();
            }
        }]
    });

    app.component('gettingStartedWikiArticle', {
        bindings: {
            articleId: '<',
            projectKey: '<',
            isVisible: '<'
        },
        templateUrl:'/templates/personal-home/getting-started/wiki-article.html',
        controller: ['$scope', 'WikiUtilsService', 'DataikuAPI', '$timeout', 'SmartId', 'StateUtils', '$state', function ctlrGettingStartedWikiArticle(scope, WikiUtilsService, DataikuAPI, $timeout, SmartId, StateUtils, $state) {
            const ctrl = this;

            ctrl.$onInit = function () {
                scope.uiState = {activeArticleTab: 'view'};
                scope.wikiScope = scope;
                scope.StateUtils = StateUtils; //used via article-attachments.html
             };

            scope.getArticleDisplayMode = function () { //called from deep in the wiki article attachment templates
                return "view";
            }

            scope.getArticleProjectKey = function () { //called from deep in the wiki article attachment templates
                ctrl.projectKey;
            }

            scope.getAttachmentViewTarget = function () {
                return "_blank";
            }

            function getWikiData(delay) {
                if (!ctrl.isVisible || !ctrl.projectKey) return;

                $timeout(_ => {
                    if (!scope.wiki || ctrl.projectKey !== scope.wiki.projectKey) {
                        getWiki(ctrl.projectKey).then (_ => getSummary(ctrl.projectKey, ctrl.articleId));
                    } else if (!scope.article
                            || scope.article.id !== ctrl.articleId
                            || scope.article.projectKey !== ctrl.projectKey) {
                            getSummary(ctrl.projectKey, ctrl.articleId);
                    }
                }, delay || 0);
            }

            scope.$watchGroup(['$ctrl.articleId', '$ctrl.projectKey'], function () {
                getWikiData(0);
            }, true);

            scope.$watch("$ctrl.isVisible", function () {
                getWikiData(500);
            }, true);

            scope.wikiLink = function() {
                if (ctrl.articleId) {
                    StateUtils.go.article(ctrl.articleId, ctrl.projectKey);
                } else {
                    $state.go('projects.project.wiki', {projectKey: ctrl.projectKey});
                }
            };

            scope.onSideBarNodeClick = function (node) {
                getSummary(ctrl.projectKey, node.id);
            };

            scope.nodeTreeToDisplay = function () {
                return scope.articleNodeAsArray ? scope.articleNodeAsArray : scope.wiki.taxonomy;
            };

            scope.isShowContentsOutline = function () {
                if (!scope.wiki) return;
                const nodeTree = scope.nodeTreeToDisplay();
                return (nodeTree && nodeTree.length>0 && nodeTree[0].children && nodeTree[0].children.length>0)
            };

            scope.isShowAttachments = function() {
                return (scope.wiki && scope.article && scope.article.attachments && scope.article.attachments.length>0);
            };

            scope.getUploadHref = function(attachment) {
                try {
                    const ref = SmartId.resolve(attachment.smartId, ctrl.projectKey);
                    return `/dip/api/projects/wikis/get-uploaded-file/${attachment.details.objectDisplayName}?projectKey=${ref.projectKey}&uploadId=${ref.id}`;
                } catch (e) {
                    logger.warn('Failed to resolve uploadId');
                    return '';
                }
            };

            function setSummary(data) {
                scope.article = data.object; // We set it in the global wiki scope to be able to use the main toolbar
                scope.articlePayload = data.payload;
                scope.uiState.editedPayload = data.payload;
                scope.uiState.editedLayout = (data.object || {}).layout;

                if(!scope.article) return;

                scope.articleNode = WikiUtilsService.getArticleNodeById(ctrl.articleId, scope.article, scope.wiki.taxonomy);
                scope.articleNodeAsArray = [scope.articleNode]; // used by nodeTreeToDisplay:  if we built array dynamically it will cause a digest loop
            }

            function getSummary(projectKey, articleId) {
                scope.selectedArticleId = articleId;
                return DataikuAPI.wikis.getArticleSummary(projectKey, articleId).then (
                    (data) => setSummary(data.data), function(data, status, headers) {
                    if (status != 404) {
                        setErrorInScope.apply(scope.wikiScope, arguments);
                    } else {
                        scope.articleNotFound = articleId;
                    }});
            }

            function getWiki (projectKey) {
                return DataikuAPI.wikis.getWiki(projectKey)
                    .success(function(wikiSummary) {
                        scope.wiki = wikiSummary.wiki;
                        scope.wikiTimeline = wikiSummary.timeline;
                        scope.articleMapping = wikiSummary.articleMapping;
                        scope.articlesIds = [];

                        scope.emptyWiki = !scope.wiki.taxonomy || !scope.wiki.taxonomy.length;
                        if (scope.emptyWiki) {
                            return;
                        }
                        WikiUtilsService.addArticlesToList(scope.wiki.taxonomy, scope.articlesIds)

                        if (!ctrl.articleId && scope.articlesIds.length>0) ctrl.articleId = scope.articlesIds[0];
                    })
                    .error(setErrorInScope.bind(scope));
            }

        }]
    });

    app.component('gettingStartedPanel', {
        bindings: {
            selectedTabIdx: '=',
            isVisible: '<'
        },
        templateUrl: '/templates/personal-home/getting-started/panel.html',
        controller: ['$scope', '$element', 'DataikuAPI', function ctlrTileRow(scope, $e, DataikuAPI) {
            const ctrl = this;

            ctrl.$onInit = function () {
                scope.tabItemList = [{title: 'Learn DSS'}];
                DataikuAPI.getHomeArticles(true)
                    .success(function(homeArticles) {
                        scope.homeArticles = homeArticles;
                        if (scope.homeArticles.length > 0) {
                            scope.tabItemList = scope.tabItemList.concat(homeArticles.map(article => ({title: article.name})));
                        }
                        else {
                            scope.tabItemList.push({title: 'Add wiki...'});
                            scope.wikiOnboarding = true;
                        }

                    })
                    .error(setErrorInScope.bind(scope));
            };

            ctrl.isAdmin = function () {
                return scope.$parent.isDSSAdmin();
            }
        }]
    });

    app.component('tileRow', {
        bindings: {
            rowDesc: '<',
            displayMode: "@",
            rowIndex: "@",
            fatListPadding: "@",
            settings: "=",
            onReload: "=",
        },
        transclude: true,
        templateUrl: '/templates/personal-home/tile-row.html',
        controller: ['$scope', '$element', '$timeout', 'localStorageService', 'WT1', 'ProjectFolderContext',
            function ctlrTileRow(scope, $e, $timeout, localStorageService, WT1, ProjectFolderContext) {
            const ctrl = this;
            const sortByStarLSKey = "phpSortByStar-" + ctrl.rowDesc.rowType;
            const ROW_V_MARGINS = 16; // adds extra height to space allocated in fat-repeat for a tile, e.g. for dropshadow
            const TILE_H_MARGINS = 32; // adds extra height to space allocated in fat-repeat for a tile, e.g. for dropshadow

            ctrl.$onInit = function () {
                ctrl.isClickable = true;
                ctrl.rowHeight = ctrl.rowDesc.tileHeight + ROW_V_MARGINS; // used to fix the row height before it's populated with tiles
                ctrl.rowTileWidth = ctrl.rowDesc.tileWidth + TILE_H_MARGINS; // used to fix the row height before it's populated with tiles
            };

            ctrl.canCreateProjectsInAnyWay = function() {
                const gp = scope.$parent.appConfig.globalPermissions;
                // No Dataiku Apps here by design
                return gp.mayCreateProjects || gp.mayCreateProjectsFromMacros || gp.mayCreateProjectsFromTemplates;
            }

            ctrl.canCreateProjectsHereInAnyWay = function() {
                return ctrl.canCreateProjectsInAnyWay() && scope.$parent.canWriteInProjectFolder();
            }

            ctrl.canCreateProjectsUsingNiceTiles = function(){
                const gp = scope.$parent.appConfig.globalPermissions;
                // No macros since they don't have nice tiles
                return gp.mayCreateProjects || gp.mayCreateProjectsFromTemplates;
            }

            ctrl.canCreateProjects = ctrl.canCreateProjectsHereInAnyWay;

            scope.$watch("$ctrl.settings.shared.searchFilter", function(nv, ov) {
                scope.selection.filterQuery.userQuery = ctrl.settings.shared.searchFilter;
            }, true);

            ctrl.canClick = function () {return ctrl.isClickable !== false;};

            ctrl.hookTable = function (table) {
                scope.childFatTable = table;
            };

            function scrollbar() {
                if (scope.childFatTable) return scope.childFatTable.scroll;
                return {scrollLeft: 0 , scrollWidth: 100};
            }

            const edgeMargin = 30;
            ctrl.isShowRightScroll = function() {
                const scroll = scrollbar();
                return  scroll.scrollLeft  < scroll.maxScrollHorizontal - edgeMargin;
            };

            ctrl.isShowLeftScroll = function () {
                return  scrollbar().scrollLeft > edgeMargin;
            };
            scope.$on("autoScrollEnd", function() {scope.$apply();});

            ctrl.scrollByTile = function(e, titleCount) {
                e.stopPropagation();
                const deltaPos = titleCount * ctrl.rowDesc.scrollInterval;
                scope.$broadcast("scrollPage", deltaPos);
                $timeout(() => scope.$apply(),100); //force scrollbar arrow update before end of transition
                $(scrollbar().horizontalScrollbar).animate( { scrollLeft: '+=' + deltaPos }, 500, 'swing', () => scope.$apply());// update scrollbar arrows at end of transition
            };

            ctrl.scrollByPage = function(e, pageCount) {
                ctrl.scrollByTile(e, pageCount * 3);
            };

            ctrl.scrollToEndPoint = function(e, isGotoFront) {
                ctrl.scrollByPage(e,  (isGotoFront ? -1 : 1) * 10000);
            };

            ctrl.expandUiSref = function() {
                if (ctrl.rowDesc.expandUrl) return ctrl.rowDesc.expandUrl;

                let displayMode = 'mosaic';
                if (ctrl.settings.hasOwnProperty(ctrl.rowDesc.rowType)) {
                    const dm = ctrl.settings[ctrl.rowDesc.rowType].tileDisplayMode;
                    if (dm) displayMode = dm;
                }

                return "home.expanded" + displayMode + "({ row:'" + ctrl.rowDesc.rowType + "'})";
            };

            ctrl.noItemsText = function() {
                const items = ctrl.rowDesc.itemPlural;
                return `No ${items} found`;
            };

            ctrl.isShowEmpyRowMsg = function () {
                if (ctrl.rowDesc.rowSet.length>0) return false;
                if (ctrl.rowDesc.errorLoading) return true;
                return ctrl.rowDesc.emptyStateLong && (ctrl.rowDesc.rowType!='projects' || ctrl.canCreateProjectsUsingNiceTiles()==false);
            }

            // boolean values are stored as strings in localstorage <:(
            scope.isSortedByStar = localStorageService.get(sortByStarLSKey) === 'true';

            function sortByStar() {
                if (scope.isSortedByStar) {
                    // boolean properties are reverse sorted by orderBy, hence the `!`
                    scope.selection.orderQuery = ['!starred', '$idx'];
                } else {
                    // updateOrderQuery doesn't allow empty-like values so we order by index
                    scope.selection.orderQuery = '$idx';
                }
            }

            ctrl.toggleSortByStar = function () {
                scope.isSortedByStar = !scope.isSortedByStar;
                sortByStar();
                localStorageService.set(sortByStarLSKey, scope.isSortedByStar);
                WT1.event("php-sort-by-star", {type: ctrl.rowDesc.rowType, state: scope.isSortedByStar});
            }

            // Can't be called immediately because 'scope.selection' is not defined (yet)
            $timeout(sortByStar);
      }]
    });

    app.component('tileMosaic', {
        bindings: {
            rowDesc: '<',
            fatListPadding: "@",
            settings: "="
        },
        transclude: true,
        templateUrl: '/templates/personal-home/tile-mosaic.html',
        controller: ['$scope', '$element', function ctrlTileMosaic($scope) {
            const ctrl = this;
            const ROW_V_MARGINS = 32;
            const ROW_H_MARGINS = 32;

            ctrl.$onInit = function () {
                // homeExpandedHeader is a directive with no scope, so we need to pass in the context...
                $scope.heading = ctrl.rowDesc.heading;
                $scope.rowType = ctrl.rowDesc.rowType;
                $scope.displayMode = 'mosaic';
                $scope.settings = ctrl.settings;
                $scope.sortOptions = ctrl.rowDesc.sortOptions;

                ctrl.rowHeight = (ctrl.rowDesc.tileHeightMosaic || ctrl.rowDesc.tileHeight) + ROW_V_MARGINS;
                ctrl.rowWidth = (ctrl.rowDesc.tileWidthMosaic || ctrl.rowDesc.tileWidth) + ROW_H_MARGINS;
            };

            ctrl.noItemsText = function() {
                const items = ctrl.rowDesc.itemPlural;
                return `No ${items} found`;
            };

      }]
    });

    app.directive('homeExpandedHeader', function($state) {
        return {
            restrict: 'E',
            scope: false,
            replace: true,
            templateUrl:'/templates/personal-home/expanded-header.html',
            link: function ($scope) {

                $scope.$watch("settings.shared.searchFilter", function(nv, ov) {
                    if ($scope.selection.filterQuery.userQuery != $scope.settings.shared.searchFilter) $scope.selection.filterQuery.userQuery = $scope.settings.shared.searchFilter;
                }, true);

                $scope.$watch("selection.filterQuery.userQuery", function(nv, ov) {
                    if ($scope.settings.shared.searchFilter != nv) $scope.settings.shared.searchFilter = nv;
                });

                $scope.$watch("selection.orderQuery", function(nv, ov) {
                    if ($scope.settings.activeRoute.sortBy != nv) $scope.settings.activeRoute.sortBy = nv;
                });

                $scope.$watch("selection.orderReversed", function(nv, ov) {
                    if (ov!=nv && $scope.settings.activeRoute.sortRev != nv) $scope.settings.activeRoute.sortRev = nv;
                });

                $scope.changeDisplayMode = function(e, newState) {
                    e.stopPropagation();
                    const filter = $scope.selection.filterQuery.userQuery;

                    $state.go(newState, {row: $scope.rowType, filterBy: filter, standalone: $scope.isStandalone()});
                };

                $scope.isStandalone = function() {
                    return $state.params.standalone;
                }

            }
        }
    });

    app.directive('tileList', function($state, CatalogItemService, $controller, InterestsService, DataikuAPI, ActiveProjectKey) {
        return {
            restrict: 'E',
            scope: {
                listItems: '<',
                rowDesc: '<',
                fatListPadding: "@",
                settings: "="
            },
            replace: true,
            templateUrl: '/templates/personal-home/tile-list.html',
            link: function ($scope) {

                $controller('_TaggableObjectsListPageCommon', {$scope: $scope}); // important for capturing metadata for notebooks and analyses

                $scope.displayMode = 'list';
                $scope.CatalogItemService = CatalogItemService;
                $scope.heading = $scope.rowDesc.heading;
                $scope.sortOptions = $scope.rowDesc.sortOptions;
                $scope.rowType = $scope.rowDesc.rowType;
                $scope.updateActiveProjectKey = true; // used by filteredMultiSelectRows to flag the need to update the ActiveProjectKey service when a list item is selected

                $scope.rightColumnTypeType = function () {
                    if (!$scope.selection || !$scope.selection.selectedObject) return;
                    const item = $scope.selection.selectedObject;
                    if (item.catalogItemType == "notebook") return item.type_raw.toLowerCase();
                    return item.catalogItemType;
                };

                function makeTagObjId(item) {
                    if (!item.id || !item.projectKey || !item.type) return undefined;
                    return {id: item.id, projectKey:item.projectKey, type: item.type} ;
                }

                $scope.starObject = function(star, item) {
                    const idObj = makeTagObjId(item);
                    if (idObj){
                        InterestsService.star($scope, [idObj], star).then(() => {
                            item.starred = star;
                        });
                    }
                };

                $scope.watchObject = function(watch, item) {
                    const idObj = makeTagObjId(item);
                    if (idObj){
                        InterestsService.watch($scope, [idObj], watch).then(() => {
                            item.watching = watch;
                        });
                    }
                };

                // Records whether the current user has write access to the projects.
                const canWriteContentInProject = {};

                DataikuAPI.projects.list()
                    .success((projects) => {
                        projects.forEach((it) => {
                            canWriteContentInProject[it.projectKey] = it.canWriteProjectContent;
                        });
                    })
                    .error(setErrorInScope.bind($scope));

                $scope.canWriteProject = function() {
                    const selectedItemProjectKey = ActiveProjectKey.get();

                    if (!selectedItemProjectKey) {
                        return false;
                    }

                    const canWriteContent = canWriteContentInProject[selectedItemProjectKey];
                    return !!canWriteContent;
                };
            }
        }
    });

    app.component('tile',{
        bindings: {
            object: '<',
            isClickable: '<'
        },
        templateUrl: '/templates/personal-home/tile.html',
        controller: ['$scope', '$element', 'InterestsService', 'PersonalHomeService', 'openDkuPopin', function ctlrTile(scope, el, InterestsService, PersonalHomeService, openDkuPopin) {
            const ctrl = this;

            ctrl.$onInit = function () {
                scope.isClickable = ctrl.isClickable;
            };

            ctrl.starObject = function(star) {
                const o = ctrl.object;
                if (o.id && o.projectKey && o.type){
                    InterestsService.star(scope, [{id: o.id, projectKey:o.projectKey, type: o.type }], star).then(() => {
                        o.starred = star;
                        scope.$emit('refresh-list');
                    });
                }
            };

            ctrl.removeItem = function() {
                PersonalHomeService.discardRecentlyusedItem(ctrl.object);
            }

            ctrl.isShowMenuCaret = function() {
                return ctrl.object.isRecentlyUsed && ctrl.object.tileType=='my-item';
            }

            ctrl.toggleMenu = function($event) {
                if (ctrl.overlayWatcherDereg)  {
                    ctrl.endPopup();
                }
                else {
                    ctrl.openContextMenu($event);
                }
                $event.stopPropagation();
            };

            ctrl.endPopup = function()  {
                if (ctrl.overlayWatcherDereg) ctrl.overlayWatcherDereg();
                if (ctrl.dismissPopUp) ctrl.dismissPopUp(true);

                ctrl.overlayWatcherDereg = undefined;
                ctrl.dismissPopUp = undefined;
                scope.$emit("lock-overlay", false);
            };

            ctrl.startPopup = function() {
                ctrl.overlayWatcherDereg = scope.$on('overlay-clicked', ctrl.endPopup)
                scope.$emit("lock-overlay", true);
            };

            ctrl.openContextMenu = function($event) {
                if (!ctrl.isShowMenuCaret()) return;

                let template = `<ul class="dropdown-menu projects-dropdown-menu">
                    <li class="qa_homepage-tile_delete">
                        <a ng-click="$ctrl.removeItem(); $ctrl.endPopup();"><i class="icon-remove"></i> Remove this item from the list</a>
                    </li>
                </ul>`;

                let isElsewhere = function(elt, e) {
                    return $(e.target).parents('.dropdown-menu').length == 0;
                };

                let dkuPopinOptions = {
                    template: template,
                    isElsewhere: isElsewhere,
                    popinPosition: 'CLICK',
                    onDismiss: ctrl.endPopup
                };
                ctrl.dismissPopUp = openDkuPopin(scope, $event, dkuPopinOptions);
                ctrl.startPopup();
            };


        }]
    });

    app.component('subtileMyItem', {
        bindings: {
            item: '<'
        },
        templateUrl: '/templates/personal-home/subtile/my-item.html',
        controller: ['$scope', '$element', 'CatalogItemService', function ctlrSubtileMyItem(scope, $e, CatalogItemService) {
            const ctrl = this;

            ctrl.$onInit = function () {
                ctrl.CatalogItemService = CatalogItemService;
            };

        }]
    });

    app.component('subtileSkeleton', {
        bindings: {
            skeleton: '<'
        },
        templateUrl: '/templates/personal-home/subtile/skeleton.html'
    });

    app.component('subtileDashboard', {
        bindings: {
            dashboard: '<'
        },
        templateUrl: '/templates/personal-home/subtile/dashboard.html',
        controller: ['$scope', '$element', 'StateUtils', function ctlrSubtileDashboard(scope, $e, StateUtils) {
            const ctrl = this;

            ctrl.viewLink = function () {
                const dbd = ctrl.dashboard;
                return StateUtils.href.dashboard(dbd.id, dbd.projectKey, {name: dbd.name});
            }

        }]
    });

    app.component('subtileProject', {
        bindings: {
            project: '<'
        },
        templateUrl: '/templates/personal-home/subtile/project.html',
        controller: ['$scope', '$element', '$state', 'PersonalHomeService', 'ProjectStatusService', function ctlrSubtileProject(scope, $e, $state, PersonalHomeService, ProjectStatusService) {
            const ctrl = this;

            ctrl.$onInit = function () {
                ctrl.$state = $state;
                ctrl.projectService = ProjectStatusService;
            };

        }]
    });

    app.component('subtileApp', {
        bindings: {
            app: '<'
        },
        templateUrl: '/templates/personal-home/subtile/app.html',
        controller: ['$scope', '$element', '$state', 'PersonalHomeService', 'ProjectStatusService', function ctlrSubtileProject(scope, $e, $state, PersonalHomeService, ProjectStatusService) {
            const ctrl = this;

            ctrl.$onInit = function () {
                ctrl.$state = $state;
            };

        }]
    });

    app.component('subtileProjectFolder', {
        bindings: {
            folder: '<'
        },
        templateUrl: '/templates/personal-home/subtile/project-folder.html',
        controller: ['$scope', '$element', '$state', function ctrlSubtileProjectFolder(scope, $e, $state) {
            const ctrl = this;

            ctrl.$onInit = function () {
                ctrl.$state = $state;
            };
        }]
    });

    app.component('subtilePromotedWiki', {
        bindings: {
            promotedWiki: '<',
            isClickable: '<'
        },
        templateUrl: '/templates/personal-home/subtile/promoted-wiki.html',
        controller: ['$scope', '$element', '$state', 'PersonalHomeService', function ctlrSubtilePromotedWiki(scope, $e, $state, PersonalHomeService) {
            const ctrl = this;

            ctrl.$onInit = function () {
                ctrl.$state = $state;
            };

            ctrl.clickToWiki = function(event) {
                if (ctrl.isClickable && !ctrl.isClickable()) {return false;}
                ctrl.$state.go('projects.project.wiki', {projectKey : ctrl.promotedWiki.projectKey})
            }

        }]
    });
    
    app.directive('dragScroll', function ($document, $window, $parse, $interval, $timeout) {
        return {
            restrict: 'A',
            link: function($scope, $element, $attributes) {
                const DELTA = 5;
                let allowedClickOffset = 5;
                let axis = $attributes.axis || 'x';
                let clientPosIdx = !axis || axis==="x" ? "clientX" : "clientY";
                let moveAttrIdx = !axis || axis==="x" ? "scrollLeft" : "scrollTop";
                let $elUnderMouse;
                let lastPos;
                let startPos;
                let offsetPos = 0; //the currently-set scroll posn

                function startVeloTracker (e) {

                    let veloTrack = {
                            frame: 0,
                            velocity: 0,
                            timestamp: 0,
                            amplitude:0,
                            ticker: undefined,
                            target: 0,
                            timeConstant: 80,
                            endSignalled: false
                        };


                    let autoScroll = function() {
                        if (veloTrack.amplitude) {
                            const elapsed = Date.now() - veloTrack.timestamp;
                            const delta = -veloTrack.amplitude * Math.exp(-elapsed / veloTrack.timeConstant);
                            if (!veloTrack.endSignalled && (delta < 25 && delta > -25)) {
                                veloTrack.endSignalled = true;
                                $scope.$emit("autoScrollEnd");
                            }
                            if (delta > 5 || delta < -5 ) {
                                scroll(veloTrack.target + delta);
                                requestAnimationFrame(autoScroll);
                            } else {
                                scroll(veloTrack.target+delta);
                            }
                        }
                    }

                    let track = function() {
                        let now, elapsed, delta, v;

                        now = Date.now();
                        elapsed = now - veloTrack.timestamp;
                        veloTrack.timestamp = now;
                        delta = offsetPos - veloTrack.frame;
                        veloTrack.frame = offsetPos;

                        v = 1000 * delta / (1 + elapsed);
                        veloTrack.velocity = 0.8 * v + 0.2 * veloTrack.velocity;
                    }

                    let getPos = function(e) {
                        if (e.targetTouches && (e.targetTouches.length >= 1)) { // touch event
                            return e.targetTouches[0][clientPosIdx];
                        }
                        return e[clientPosIdx]; // mouse event
                    }

                    let movePos = function(e) {
                        const currentPos = getPos(e);
                        const delta = lastPos - currentPos;
                        let moved = false;
                        if (delta > DELTA || delta < -DELTA) {
                            scroll(offsetPos + delta);
                            lastPos = currentPos;
                            moved = true;
                        }
                        e.preventDefault();
                        return moved;
                    }

                    let stop = function() {

                        cancelTicker();

                        let vel = veloTrack.velocity;
                        if (vel > 10 || vel < -10) {
                            vel = Math.max(Math.min(vel, 1800), -1800);
                            veloTrack.amplitude = 0.6 * vel;
                            veloTrack.target = Math.round(limitToScrollBounds(offsetPos + veloTrack.amplitude * 0.6));
                            veloTrack.amplitude = veloTrack.target - offsetPos;
                            veloTrack.endSignalled = false;

                            veloTrack.timestamp = Date.now();
                            requestAnimationFrame(autoScroll);
                        }
                    }

                    let cancelTicker = function() {
                        $interval.cancel(veloTrack.ticker);
                    }

                    let start = function(e) {
                        lastPos = startPos = getPos(e);
                        offsetPos = getCurrentScrollPos();
                        veloTrack.velocity = 0;
                        veloTrack.amplitude = 0;
                        veloTrack.frame = offsetPos;
                        veloTrack.timestamp = Date.now();
                        veloTrack.ticker = $interval(track, 25);
                    }
                    start(e);

                    return  {
                        autoScroll: autoScroll,
                        stop: stop,
                        cancelTicker: cancelTicker,
                        movePos: movePos
                    }
                }

                let veloTracker;

                const $scrolledE = $element;

                $scope.$on("scrollPage", function(ev, deltaPos) {
                    if (veloTracker) veloTracker.cancelTicker();
                    offsetPos = limitToScrollBounds(offsetPos + deltaPos);
                    lastPos = offsetPos;
                });

                $element.on('mousedown', onMouseDown);
                $element.on('wheel', onMouseWheel);

                $scope.$on('$destroy', destroy);

                let lastForcedUpdate = Date.now();
                function onMouseWheel(e) {
                    // Prevent futile scroll on Chrome/OSX, which would trigger the Back/Next page event
                    if (e.originalEvent.deltaX < 0 && getCurrentScrollPos()==0) {
                        e.preventDefault();
                    }

                    // forced a refresh of the row to reset the arrow panels at the end of the rows
                    const now = Date.now();
                    if (now - lastForcedUpdate >  500) {
                        $scope.$emit("autoScrollEnd");
                        lastForcedUpdate = now;
                    }
                };

                function setDragListeners () {
                    $timeout(() => {if ($elUnderMouse) $elUnderMouse.addClass("dragme")}, 200);
                    angular.element($window).on('mouseup', onMouseUp);
                    angular.element($window).on('mousemove', onMouseMove);
                }

                function removeDragListeners () {
                    if ($elUnderMouse){
                        $elUnderMouse.removeClass("dragme");
                        $elUnderMouse = undefined;
                    }
                    angular.element($window).off('mouseup', onMouseUp);
                    angular.element($window).off('mousemove', onMouseMove);
                }

                function onMouseDown (e) {
                    if (veloTracker) veloTracker.cancelTicker();

                    $elUnderMouse = angular.element(e.target);

                    setDragListeners();

                    veloTracker = startVeloTracker(e);

                    e.preventDefault();
                    e.stopPropagation();
                }

                function onMouseMove (e) {
                    if (veloTracker) {
                        if (veloTracker.movePos(e)) {
                            suppressClickEvent(e);
                        }
                    }
                }

                function onMouseUp (e) {
                    if (!veloTracker) return;
                    veloTracker.stop();
                    removeDragListeners();
                    reenableClickEvent();
                }

                function calcMaxPos() {
                    if ($scope.childFatTable) {
                        return (axis=='x' ? $scope.childFatTable.scroll.maxScrollHorizontal : $scope.childFatTable.scroll.maxScrollVertical);
                    }
                    else {
                        return (axis=='x' ? $scrolledE[0].scrollWidth - $scrolledE[0].offsetWidth : $scrolledE[0].scrollHeight - $scrolledE[0].offsetHeight);
                    }
                }

                function getCurrentScrollPos() {
                    if ($scope.childFatTable)  {
                        return $scope.childFatTable.scroll[moveAttrIdx];
                    }
                    else {
                        return $scrolledE[0][moveAttrIdx];
                    }
                }

                function limitToScrollBounds(p) {
                    let maxPos = calcMaxPos();
                    const minPos = 0;
                    return (p > maxPos) ? maxPos : (p < minPos) ? minPos : p;
                }

                function scroll(p) {
                    offsetPos = limitToScrollBounds(p);
                    if ($scope.childFatTable)  {
                        $scope.childFatTable.scroll.setScrollXY(offsetPos, 0);
                    }
                    else {
                        $scrolledE[0][moveAttrIdx] = offsetPos;
                    }
                }

                function suppressClickEvent () {
                    // stop the mouse-up event at the end of the drag from triggering a tile-click e.g. opening a project
                    $scope.$ctrl.isClickable = false;
                    $scope.$emit("onDragScrollAction", {isDragging: true});
                }

                function reenableClickEvent() {
                    $timeout(() => {
                        $scope.$ctrl.isClickable = true;
                        $scope.$emit("onDragScrollAction", {isDragging: false});
                    }, 100);
                }

                function destroy () {
                    $element.off('mousedown', onMouseDown);
                    angular.element($window).off('mouseup', onMouseUp);
                    angular.element($window).off('mousemove', onMouseMove);
                    angular.element($window).off('mousewheel', onMouseWheel);
                    angular.element($window).off('touchstart', onMouseWheel);                }

            }
        };
    });
    
})();
