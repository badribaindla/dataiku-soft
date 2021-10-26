(function() {
'use strict';

let app = angular.module('dataiku.controllers');

const tileTypes =  {
    myItem: "my-item",
    project: "project",
    app: "app",
    dashboard: "dashboard",
    promotedWiki: "promoted-wiki",
    skeleton: "skeleton",
    projectFolders: "project-folders",
};

const exportedTiles = [
    { heading: "Projects", type: tileTypes.project },
    { heading: "Applications", type: tileTypes.app },
    { heading: "Project Folders", type: tileTypes.projectFolders },
    { heading: "Dashboards", type: tileTypes.dashboard },
    { heading: "Wikis", type: tileTypes.promotedWiki },
    // Always add new tiles at the end
];

// Export some tiles to the settings
app.constant("EXPORTED_TILES", exportedTiles);

const personalHomeRefreshEvents = {
    project: 'project-home-list-refresh',
    app: 'app-home-list-refresh',
    starred: 'starred-home-list-refresh',
    dashboard: 'dashboard-home-list-refresh',
    promotedWiki: 'promoted-wiki-home-list-refresh',
    projectFolders: 'project-folders-home-list-refresh',
};

app.service('PersonalHomeService', function($rootScope, DataikuAPI, Logger, HistoryService, DKUConstants) {
    const svc = this;
    const noSpinner = true;

    /* subscribe-style wrapper for notifications
     *
     */
    let subscribe = (function() {
        let unregisterMap = {};

        /**
         * Return an ID for a specific callerScope and eventName combination.
         * @param callerScope
         * @param eventName
         */
        function getSubscriptionId(callerScope, eventName) {
            return callerScope.$id + "_" + eventName;
        };

        /**
         * If an unregister function was registered to a specific callerScope and eventName combination, it is executed
         * before being removed from unregisterMap.
         * @param callerScope
         * @param eventName
         */
        function unregisterIfAny(callerScope, eventName) {
            let subscriptionId = getSubscriptionId(callerScope, eventName);
            let unregister = unregisterMap[subscriptionId];
            if (typeof(unregister) === "function") {
                unregister();
            }
            delete unregisterMap[subscriptionId];
        };

        /**
         * Map callerScope and eventName to an unregister function.
         * If an unregister function was already mapped to that combination, it is executed before being replaced by the new function.
         * @param callerScope
         * @param eventName
         * @param unregister
         */
        function setUnregisterFn(callerScope, eventName, unregister) {
            let subscriptionId = getSubscriptionId(callerScope, eventName);
            unregisterIfAny(callerScope, eventName);
            unregisterMap[subscriptionId] = unregister;
            callerScope.$on('$destroy', () => {
                unregisterIfAny(callerScope, eventName);
            });
        }

        /**
         * Add a listener to rootScope to execute a callback function (passed in parameter) for a specific event (passed in parameter).
         * If the same scope (passed in parameter) registers another callback to the same event,
         * we make sure the previous callback is removed from rootScope's callback stack for this specific event.
         * @param callerScope: scope asking to register a callback
         * @param eventName: event that will trigger the callback
         * @param callback: callback executed when the event is triggered
         */
        let subscribe = function(callerScope, eventName, callback) {
            let unregister = $rootScope.$on(eventName, callback);
            setUnregisterFn(callerScope, eventName, unregister);
        }

        return subscribe;
    })();

    function notify(eventName, data, errorLoading) {
        $rootScope.$emit(eventName, {data: data, errorLoading: errorLoading});
    }

    /* data used to populate tile lists is held separately, allowing
    * some cross populations:
    *  - starred data into projects, dashboards, recently used
    *  - project titles into other items
    *  - recently used dates into other items
    */
     const defaultloadedItems = {
        recentlyUsed: {
            byType: [], // ie dashboards, myitems, projects
            map: {}
        },
        starred: {
            byType: [],
            map: {},
        },
        projects: {
            list: [],
            map: {},
        },
        apps: {
            list: [],
            map: {},
        },
        dashboards: {
            list: [],
            map: {}
        },
        promotedWikis: {
            list: [],
            map: {}
        },
        projectFolders: {
            list: [],
            map: {}
        },
    };

    let loadedItems = {};

    svc.clearData = function() {
        angular.copy(defaultloadedItems, loadedItems);
    };

    /**
     * Recently used items are an extract of the local HistoryService. Depending on the type of item
     * we are interested in when it was last view or when it was last edited
     */
    /*NOSONAR function trackItemByViewDate(item) {
        return ['DASHBOARD', 'REPORT', 'PROJECT' ].includes(item.type)
    }*/

    function getRowForItemType(type, isPromotedWiki) {
        switch (type) {
            case 'PROJECT':
                return tileTypes.project;
            case 'APP':
                return tileTypes.app;
            case 'DASHBOARD':
                return tileTypes.dashboard;
            case 'ARTICLE':
                return isPromotedWiki ? tileTypes.promotedWiki : tileTypes.myItem;
            default:
                return tileTypes.myItem;
        }
    }

    function initByTypeLists(listsRoot) {
        listsRoot.isLoaded = false;
        Object.keys(tileTypes).forEach(element => {
            listsRoot.byType[tileTypes[element]] = []
        });
        listsRoot.map = {};
    }


    function taggableItemKey(interest) {
        return interest.projectKey + ':' + interest.type + ':' + interest.id;
    }

    /** Enrich other lists with data from newlty populated lists
     *  Specifically, we want to add project names into the list of starred items,
     *  and the starred/watched data into projects, dashboards and recently used items
     *
     * @param lists = the lists to be enriched
     * @param f = the function to enrich an item, typically using the .map of the source objects
     *
     */
    function enrichLists(lists, f) {
        let enriched = false;
        lists.forEach(list => {
            if (!list) return;
            angular.forEach(list, item => {
                enriched |= f(item)
            });
        });
        return enriched;
    }

    /**
     *  enrichMapFromRecentlyUsedItems - enrich a list of projects, starred items or dashboards with info
     *  from the recentlyused list - specifically the usage datetime
     * @param listType - one of tileTypes enum
     * @param map - a map of items (projects, dashboards etc) in the loadedItems structure
     * @param fKey - a function get the key into the map from a recently used item
     */
    function enrichMapFromRecentlyUsedItems(listType, map, fKey) {
        if (!loadedItems.recentlyUsed.byType.hasOwnProperty(listType)) return;

        loadedItems.recentlyUsed.byType[listType].forEach(item => {
            const key = fKey(item);
            if (map.hasOwnProperty(key)) {
                enrichItemFromRecentlyUsed(map[key], item);
            } else {
                // looks like invalid History item that no longer exists
                HistoryService.notifyRemoved(item);
                item.isDeleted = true;
            }
        });
    }

    function findItemViaMap(sourceItem, map) {
        const key = sourceItem.mapKey || taggableItemKey(sourceItem);
        if (!map.hasOwnProperty(key)) return;
        return map[key];
    }

    function enrichItemFromStarred(otherItem, starredItem) {
        if (!starredItem) starredItem = findItemViaMap(otherItem, loadedItems.starred.map);
        if (!starredItem) return;

        otherItem.starred = starredItem.starred;
        otherItem.watching = starredItem.watching;
    }

    function enrichItemFromRecentlyUsed(otherItem, ruListItem) {
        if (!ruListItem) ruListItem = findItemViaMap(otherItem, loadedItems.recentlyUsed.map);
        if (!ruListItem) return;

        otherItem.myItemsDate = ruListItem.myItemsDate;
        otherItem.isRecentlyUsed = true;
    }

    function enrichItemFromProject(item) {
        let isEnriched = false;
        if (loadedItems.projects.list.length==0) return false; // projects not loaded yet (or simply none)

        if (loadedItems.projects.map.hasOwnProperty(item.projectKey)) {
            const project = loadedItems.projects.map[item.projectKey];


            if (project.name != item.projectName) {
                item.projectName = project.name;
                isEnriched = true;
            }

            if (item.isRecentlyUsed && item.type == "PROJECT" && !item.lastCommit) {
                item.lastCommit = project.lastCommit;
                isEnriched = true;
            }

            if (isEnriched && item.isRecentlyUsed) {
                HistoryService.recordEnrichment(item);
            }

        } else if (item.isRecentlyUsed) {
            // project should exist, assume deleted project - looks like invalid History item that no longer exists
            HistoryService.notifyRemoved(item);
            item.isDeleted = true;
            isEnriched = true;
            loadedItems.recentlyUsed.isStale = true;
        }
        return isEnriched;
    }

    function enrichItemFromPromotedWiki(item) {
        if (loadedItems.promotedWikis.list.length==0) return; // wikis not loaded yet (or simply none)

        if (item.type=="ARTICLE") {
            const key = promotedWikiKey(item.projectKey, item.id);
            if (loadedItems.promotedWikis.map.hasOwnProperty(key)) {
                const wiki = loadedItems.promotedWikis.map[key];
                let isEnriched = false;

                if (wiki.homeArticle.object.id == item.id && !item.isPromotedWiki) {
                    item.isPromotedWiki = true;
                    isEnriched = true;
                }

                if (isEnriched && item.isRecentlyUsed) {
                    HistoryService.recordEnrichment(item);
                }

                if (item.isRecentlyUsed) loadedItems.recentlyUsed.isStale = true;
            }
            return item;
        }
    }

    /* end enrichment functions */

    /**
     * recentlyUsedAlignProperties
     * Tidy up the items from the HistoryService so their properties match with all the other
     * tile data items used.
     * @param item - item from the HistoryService
     * @returns 'aligned' item
     */
    function recentlyUsedAlignProperties(item) {
        const LOADING_PLACEHOLDER = "Loading...";
        //NOSONAR const isTrackByView = trackItemByViewDate(item);

        item.isRecentlyUsed = true;
        item.myItemsDate = item.lastViewed; //NOSONAR isTrackByView ?  item.lastViewed : item.lastUpdated;

        if (!item.projectName) item.projectName = LOADING_PLACEHOLDER;
        item.catalogItemType = item.type.toLowerCase();

        if (!item.displayName && item.id) item.displayName = item.id;
        item.displayName = item.displayName.replace(/_/g, " ");

        switch (item.type) {

            case "DATASET":
                item.datasetType = item.type_raw = item.subtype; // datasetType used by right-column controllers, type_raw is used by the CatalogItemService
                break;

            case "STREAMING_ENDPOINT":
                item.streamingType = item.type_raw = item.data.type;
                break;

            case "RECIPE":
                item.recipeType = item.type_raw = item.subtype;
                break;

            case "INSIGHT":
                item.name = item.displayName;
                item.insightType = item.type_raw = item.subtype;
                break;

            case "MANAGED_FOLDER":
                if (!item.description) item.description = item.displayName;
                item.type_raw = item.type;
                break;

            case "PROJECT":
                item.name = item.data.name || item.projectName;
                item.objectImgHash = item.data.objectImgHash;
                item.defaultImgColor = item.data.defaultImgColor;
                item.shortDesc = item.data.shortDesc;
                item.description = item.data.description;
                item.projectStatus = item.data.projectStatus;
                item.type_raw = item.type;
                break;

            case "APP":
                item.type_raw = item.type;
                break;

            case "DASHBOARD":
                item.type_raw = item.type;
                item.pages = item.data.pages;
                break;

            case "ARTICLE":
                item.type_raw = item.type;
                item.name = item.id;
                break;

            case "JOB":
                item.type_raw = undefined; //ignore these items
                break;

            case "CONTINUOUS_ACTIVITY":
                item.id = item.data.name;
                break;

            default:
                if (item.type.indexOf("NOTEBOOK") >= 0) {
                    item.catalogItemType = "notebook";
                    if (!item.type_raw) item.type_raw = item.type;
                }
                else {
                    item.type_raw = item.type;
                }
        }

        if (item.type_raw) {
            item.tileType = getRowForItemType(item.type, item.isPromotedWiki);
            if (!item.name && item.id) item.name = item.id;
            enrichItemFromProject(item);
        }

        return item;
    }

    /**
     * getRecentlyUsedItems
     * Gets the recently-used item history for the user from the HistoryService.  This holds the
     * data in localstorage. Unlike the other data 'gets' this is synchronous and fast.
     * We split the data into three lists suitable for the row tile rows: my-items, projects and dashboards.
     * It's not really critical to do this, but simplifies the controller a little.
     *
     * @returns {{byType: Array, map: {}}|recentlyUsed|{byType, map}}
     */
    svc.getRecentlyUsedItems = function(forceReload) {
        if (!forceReload && loadedItems.recentlyUsed.isLoaded) return loadedItems.recentlyUsed;

        initByTypeLists(loadedItems.recentlyUsed);
        const ruItems = loadedItems.recentlyUsed;

        HistoryService.getRecentlyViewedItems(undefined, undefined, undefined, true).forEach( (item) => {
            try {
                if (!item.hasOwnProperty("projectKey")) return; // unclear where these come from, but irritating!

                item = recentlyUsedAlignProperties(item);

                // Don't load archived projects from recently-used
                if (item.type_raw == "PROJECT" && item.projectStatus == DKUConstants.ARCHIVED_PROJECT_STATUS) {
                    return;
                }

                if (item.type_raw && !ruItems.map.hasOwnProperty(item.key)) { //missing subtype can lead to missing type_raw; ignore these items //skip duplicates
                    ruItems.byType[item.tileType].push(item);
                    ruItems.map[item.key] = item;
                }
            } catch (e) {
                Logger.error(e);
            }
        });

        Object.keys(ruItems.byType).forEach(function (key) {
            ruItems.byType[key] = ruItems.byType[key].filter(item => !item.isDeleted && item.myItemsDate>0);
            ruItems.byType[key].sort((a,b) => b.myItemsDate - a.myItemsDate)
        });

        ruItems.isLoaded = true;
        return ruItems;
    };

    svc.discardRecentlyusedItem = function (item) {
        HistoryService.notifyRemoved(item);
        svc.getRecentlyUsedItems(true);
        refreshMyItemsList();
    };

    /*************************
     *
     * Stared item ('Interests') data processing
     *
     */

    /**
     * interestAlignProperties
     *
     * Tidy up an starred interest item so that it has a set of properties consistent data retrieved from
     * other sources such as Catalog.
     *
     * @param interest - the original format data for one starred interest as returnd by the REST API
     * @returns interest data with properties aligned to usage by the personal home page
     */

    function interestAlignProperties(interest) {

        interest.catalogItemType = interest.objectType.toLowerCase();
        interest.displayName = interest.details.objectDisplayName ? interest.details.objectDisplayName.replace(/_/g, " ") : interest.objectId;
        if (!interest.name) interest.name = interest.details.objectDisplayName || interest.objectId;

        interest.lastModifiedOn  = interest.modifiedDate;
        interest.type = interest.objectType;
        interest.id = interest.objectId;
        interest.tileType = getRowForItemType(interest.type);

        if (interest.type=="DATASET")  {
            interest.datasetType = interest.details.datasetType; //used by right-column controllers
            interest.type_raw = interest.datasetType;  //type_raw is used by the CatalogItemService
        } else if (interest.type=="STREAMING_ENDPOINT")  {
            interest.streamingType = interest.details.streamingType;
            interest.type_raw = interest.streamingType;  //type_raw is used by the CatalogItemService
        } else if(interest.type=="RECIPE") {
            interest.recipeType = interest.details.recipeType;
            interest.type_raw = interest.recipeType;

        } else if (interest.type=="INSIGHT")  {
            interest.name = interest.details.objectDisplayName;
            interest.insightType = interest.details.insightType;
            interest.type_raw = interest.insightType;

        } else if (interest.type.indexOf("NOTEBOOK") >=0) {
            interest.catalogItemType = "notebook";
            if (!interest.type_raw) interest.type_raw = interest.type;

        } else if (interest.type == "MANAGED_FOLDER") {
            if (!interest.description) interest.description = interest.displayName;
        }

        interest.mapKey = taggableItemKey(interest);
        enrichItemFromProject(interest);

        return interest;
    }

    /**
     * buildMyItemsList
     * Join the recently used data (excluding projects and dashboards)
     * with the starred data. This is the myItems row data
     *
     * @returns list of items to populate the myItems row
     */
    function buildMyItemsList() {
        const MAX_RECENTLY_USED_IN_MY_ITEMS = 10;

        let starredMyItems = loadedItems.starred.byType[tileTypes.myItem];
        if (!starredMyItems) starredMyItems = [];

        const totalStarred = starredMyItems.length;

        //list is combination of recentlyUsed and starred items
        const ruItems = loadedItems.recentlyUsed.byType[tileTypes.myItem];
        const list = ruItems.slice(0, totalStarred==0 ? undefined : MAX_RECENTLY_USED_IN_MY_ITEMS).filter(item => !item.isDeleted && item.myItemsDate>0 && !item.isPromotedWiki);

        starredMyItems.forEach(item => {
            if (ruItems.map(item => item.key).indexOf(item.mapKey) == -1) list.push(item);
        });
        list.forEach((item, idx) => item.ordinal = idx); //add key for 'recently-used' sort order
        return list;
    }

    /**
     * updateListsDependingOnStarredData
     * if we have already receieved the projects/dashboards then we need enrich those list and re-sort,
     * since starred items get priority over non-starred.
     * The revised list will then need to be displayed, so notify the watchers.
     */
    function updateListsDependingOnStarredData() {
        enrichLists([loadedItems.recentlyUsed.map, loadedItems.projects.map, loadedItems.dashboards.map], enrichItemFromStarred);
        sortDashboardItems();
        sortProjectItems();

        if (loadedItems.dashboards.list.length>0) notify(personalHomeRefreshEvents.dashboard, loadedItems.dashboards.list);
        if (loadedItems.projects.list.length>0) notify(personalHomeRefreshEvents.project, loadedItems.projects.list);
    }

    function refreshMyItemsList() {
        loadedItems.recentlyUsed.isStale = false;
        notify(personalHomeRefreshEvents.starred, buildMyItemsList());
    }

    /**
     * getStarredItems
     * Get the users 'interests' data - both starred and watches.  The REST API does not provide a way to get just the
     * starred items and adding it is non-trivial. Currently considered by CS to not be worth effort since watches rarely used.
     *
     * @param callback - the onRowDataRefreshed function in the controller to repopulate the tile lists
     * @param callerScope -  the scope of the caller.
     * @returns a promise to complete when the data is received and processed.  Not used currently by controller, which now
     *          uses the subscribe/notify mechanism only, since this deals with refreshes, dependong on the order data is received
     */
    svc.getStarredItems = function(callback, callerScope) {
        const INTERESTS_PAGE_SIZE = 100; //only get 100 stars max.  Seems reasonable?
        const INTERESTS_OFFSET = 0;

        subscribe(callerScope, personalHomeRefreshEvents.starred, callback);

        return DataikuAPI.interests.getUserInterests($rootScope.appConfig.login, INTERESTS_OFFSET, INTERESTS_PAGE_SIZE, undefined, true, noSpinner).then((data) => {

            initByTypeLists(loadedItems.starred);

            data.data.interests.forEach(function(interest) {
                if (!interest.starred) return;

                interest = interestAlignProperties(interest);
                loadedItems.starred.byType[interest.tileType].push(interest);
                loadedItems.starred.map[taggableItemKey(interest)] = interest;
            });

            updateListsDependingOnStarredData();

            notify(personalHomeRefreshEvents.starred, buildMyItemsList());

        }, () => setErrorInScope.bind(callerScope));
    };


    /***************************
     *
     * Dashboard data processing
     *
     */

    /**
     * dashboardAlignProperties
     *
     * Tidy up the dashboard items from the Catalog so their properties match with all the other
     * tile data items used, and the needs of the dashboard tiles e.g. miniatureBoxes
     *
     * @param dashboard - returned from the Catalog
     * @returns 'aligned' item
     */
    function dashboardAlignProperties (dashboard) {
        dashboard.tileType = tileTypes.dashboard;
        dashboard.type = "DASHBOARD";
        dashboard.displayName = dashboard.name;
        dashboard.catalogItemType = 'dashboard';
        dashboard.mapKey = taggableItemKey(dashboard);

        const tiles = [];
        if (dashboard.miniatureBoxes) {
            const boxLayouts = JSON.parse(dashboard.miniatureBoxes);
            boxLayouts.boxes.forEach((box, i) => {
                tiles.push({'box': box, insightType: boxLayouts.insightTypes[i]});
            });
        }
        dashboard.pages = [{'grid': {'tiles': tiles}}];
    }

    /**
     * sortDashboardItems
     * Order: recently used; starred; most recently modified (by anyone)
     */
    function sortDashboardItems() {

        loadedItems.dashboards.list.sort((a,b) => {
            //recently used at the front
            if (a.isRecentlyUsed != b.isRecentlyUsed) return a.isRecentlyUsed ? -1 : 1;
            if (a.isRecentlyUsed) return b.myItemsDate - a.myItemsDate ;

            //starred status ahead of non-starred
            if (a.starred != b.starred) return a.starred ? -1 : 1;

            return b.lastModifiedOn - a.lastModifiedOn;
        });
    }

    /**
     * getDashboardItems
     * Retrieve the dashboard items from the Catalog.
     *
     * @param callback - callback function for the notification
     * @param callerScope - scope of the caller
     * @returns promise to complete then the data is processed.  Not used by the controller, which now uses notifications.
     */
    svc.getDashboardItems = function(callback, callerScope) {
        subscribe(callerScope, personalHomeRefreshEvents.dashboard, callback);

        return DataikuAPI.catalog.listDashboards().then((data) => {
            loadedItems.dashboards.list = [];
            loadedItems.dashboards.map = {};

            const dashboardHits = data.data.hits.hits;
            const list = loadedItems.dashboards.list;
            const map = loadedItems.dashboards.map;

            angular.forEach(dashboardHits, function(dashboardHit) {
                const dashboard = dashboardHit._source;
                dashboardAlignProperties(dashboard);
                enrichItemFromStarred(dashboard);
                list.push(dashboard);
                map[dashboard.mapKey] = dashboard;
            });

            enrichMapFromRecentlyUsedItems(tileTypes.dashboard, loadedItems.dashboards.map, item => item.key);
            sortDashboardItems();

            notify(personalHomeRefreshEvents.dashboard, loadedItems.dashboards.list);

        }, () => {
            notify(personalHomeRefreshEvents.dashboard, [], true);
            setErrorInScope.bind(callerScope)}
        );
    };

    /***************************
     *
     * Projects data processing
     */

    /**
     * projectAlignProperties
     *
     * Tidy up the project items so their properties match with all the other
     * tile data items used
     *
     * @param project item
     * @returns 'aligned' item
     */
    function projectAlignProperties(project) {
        project.tileType = tileTypes.project;
        project.type = "PROJECT";
        project.id = project.projectKey;
        project.mapKey = taggableItemKey(project);
    }

    /**
     * sortProjectItems
     * Order:
     * - recently used;
     * - starred; projects
     * - updated  by the user (user update time order);
     * - projects not update by the user (time last updated order)
     */
    function sortProjectItems () {

        const compareCommitObjTimes = function (a, b, prop) {
            const aObj = a[prop];
            const bObj = b[prop];

            if (aObj && !bObj) return -1;
            if (!aObj && bObj) return 1;

            if (aObj && bObj) {
                return aObj.time==bObj.time ? 0 : (aObj.time > bObj.time ? -1 : 1);
            }
            return undefined;
        };

        loadedItems.projects.list.sort((a,b) => {
            //recently used status
            if (a.isRecentlyUsed != b.isRecentlyUsed) return a.isRecentlyUsed ? -1 : 1;
            if (a.isRecentlyUsed) return b.myItemsDate - a.myItemsDate ;

            //starred status
            if (a.starred != b.starred) return a.starred ? -1 : 1;

            // last update times - by current user else generally
            let result = compareCommitObjTimes(a, b, "lastCommitForUser");
            if (result!= undefined) return result;

            result = compareCommitObjTimes(a, b, "lastCommit");
            if (result!= undefined) return result;

            // backstop in case we don't have sensible data
            return a.name == b.name ? 0 : (a.name < b.name ? -1 : 1);

        });
    }

    /**
     * getProjectItems
     * Get list of projects
     * @param callback - callback function for the notification
     * @param callerScope - scope of the caller
     * @returns promise to complete then the data is processed.  Not used by the controller, which now uses notifications.
     */
    svc.getProjectItems = function(callback, callerScope) {
        if (callback) subscribe(callerScope, personalHomeRefreshEvents.project, callback);

        return DataikuAPI.projects.listExtended(true, noSpinner).then(function(data) {
            loadedItems.projects.list = [];
            loadedItems.projects.map = {};

            const projects = data.data;
            const list = loadedItems.projects.list;
            const map = loadedItems.projects.map;

            projects.forEach(function(project) {
                projectAlignProperties(project);
                enrichItemFromStarred(project);
                list.push(project);
                map[project.id] = project;
            });

            enrichMapFromRecentlyUsedItems(tileTypes.project, loadedItems.projects.map, item => item.projectKey);
            sortProjectItems();

            // Don't show archived projects on personal home page
            loadedItems.projects.list = loadedItems.projects.list.filter(p => p.projectStatus !=  DKUConstants.ARCHIVED_PROJECT_STATUS);

            // enrich the other lists with project data
            const isEnriched = enrichLists([loadedItems.recentlyUsed.map, loadedItems.starred.map], enrichItemFromProject);
            if (isEnriched || loadedItems.recentlyUsed.isStale) refreshMyItemsList();

            notify(personalHomeRefreshEvents.project, loadedItems.projects.list);
        }, () => setErrorInScope.bind(callerScope));
    };

   /***************************
     *
     * Apps data processing
     */

    /**
     * appAlignProperties
     *
     * Tidy up the project items so their properties match with all the other
     * tile data items used
     *
     * @param project item
     * @returns 'aligned' item
     */
    function appAlignProperties(app) {
        app.tileType = tileTypes.app;
        app.type = "APP";
        app.id = app.appId;
        app.disableStar = true;
        app.mapKey = taggableItemKey(app);
    }

    /**
     * sortAppItems
     * Order:
     * - recently used;
     * - starred; projects
     * - updated  by the user (user update time order);
     * - projects not update by the user (time last updated order)
     */
    function sortAppItems () {

        loadedItems.apps.list.sort((a,b) => {
            // backstop in case we don't have sensible data
            let al = (a.label || a.id).toLowerCase()
            let bl = (b.label || b.id).toLowerCase()
            return al == bl ? 0 : (al < bl ? -1 : 1);
        });
    }

    /**
     * getAppItems
     * Get list of apps
     * @param callback - callback function for the notification
     * @param callerScope - scope of the caller
     * @returns promise to complete then the data is processed.  Not used by the controller, which now uses notifications.
     */
    svc.getAppItems = function(callback, callerScope) {
        if (callback) subscribe(callerScope, personalHomeRefreshEvents.app, callback);

        return DataikuAPI.apps.listTemplates(noSpinner).then(function(data) {
            loadedItems.apps.list = [];
            loadedItems.apps.map = {};

            const apps = data.data.items;
            const list = loadedItems.apps.list;
            const map = loadedItems.apps.map;
            apps.forEach(function(app) {
                appAlignProperties(app);
                list.push(app);
                map[app.appId] = app;
            });

            sortAppItems();

            notify(personalHomeRefreshEvents.app, loadedItems.apps.list);
        }, () => setErrorInScope.bind(callerScope));
    };


        /**
     * getProjectItems
     * Get list of projects
     * @param callback - callback function for the notification
     * @param callerScope - scope of the caller
     * @returns promise to complete then the data is processed.  Not used by the controller, which now uses notifications.
     */
    svc.getProjectFolderItems = (callback, callerScope) => {
        if (callback) {
            subscribe(callerScope, personalHomeRefreshEvents.projectFolders, callback);
        }
        return DataikuAPI.projectFolders.listExtended(noSpinner).then(data => {
            loadedItems.projectFolders.list = data.data.map(e => {
                const mergedItems = e.projects.map(p => Object.assign({ itemType: 'project' }, p)).concat(e.folder.children.map(f => Object.assign({ itemType: 'folder' }, f)));
                const filteredItems = mergedItems.slice(0, mergedItems.length > 6 ? 5 : 6);
                let path = '';
                let parent = e.folder.parent;
                do {
                    path = (!parent.name && !parent.parent ? 'Projects' : parent.name) + (path == '' ? '' : ' > ') + path;
                    parent = parent.parent;
                } while (parent);
                return Object.assign({path: path}, e.folder, { tileType: tileTypes.projectFolders,  type: "PROJECT_FOLDERS", filteredItems: filteredItems, nbExtraItems: mergedItems.length - filteredItems.length, disableStar: true, nbFolders: e.folder.children.length, nbProjects: e.projects.length});
            });
            loadedItems.projectFolders.map = {};

            notify(personalHomeRefreshEvents.projectFolders, loadedItems.projectFolders.list);
        }, () => setErrorInScope.bind(callerScope));
    };


    /***************************
     *
     * Promoted wiki data processing
     */


    function getPromotedWikiDate(promotedWiki) {
        if (promotedWiki.homeArticle &&  promotedWiki.homeArticle.object) return promotedWiki.homeArticle.object.creationTag.lastModifiedOn;
        return 0;
    }

    /**
     * promotedWikiAlignProperties
     *
     * Tidy up the promoted wiki items so their properties match with all the other
     * tile data items used
     *
     * @param promotedWiki item
     * @returns 'aligned' item
     */
    function promotedWikiAlignProperties(promotedWiki) {
        promotedWiki.tileType = tileTypes.promotedWiki;
        promotedWiki.type = "ARTICLE"; //Well, OK, it's not, but that's where you want to redirect
        setWikiDisplayNameAndId(promotedWiki);
        promotedWiki.mapKey = taggableItemKey(promotedWiki);
        promotedWiki.disableStar = true;
        promotedWiki.myItemsDate = getPromotedWikiDate(promotedWiki);
        promotedWiki.catalogItemType = promotedWiki.type.toLowerCase();
        promotedWiki.name = promotedWiki.displayName;
    }

    /**
     * setWikiDisplayNameAndId
     *
     * Set the diplayName and the id of the wiki. Check if the wiki has at least one article.
     * 
     *
     * @param promotedWiki item
     */
    function setWikiDisplayNameAndId(promotedWiki) {
        if (promotedWiki.homeArticle) {
            promotedWiki.id = promotedWikiKey(promotedWiki.projectKey, promotedWiki.homeArticle.object.id);
            promotedWiki.displayName = promotedWiki.homeArticle.object.id;
        } else {
            promotedWiki.id = promotedWiki.projectKey;
            promotedWiki.displayName = promotedWiki.projectKey
        }
    }

    /**
     * sortPromotedWikiItems
     * Order: recently used; then in the myItemsdate.
     * This is  the recently-used date where available, or the lastModifiedBy
     * in the promoted wiki record.
     *
     */
    function sortPromotedWikiItems() {

        loadedItems.promotedWikis.list.sort((a,b) => {
            //recently used at the front
            if (a.isRecentlyUsed != b.isRecentlyUsed) return a.isRecentlyUsed ? -1 : 1;
            return a.myItemsDate - b.myItemsDate;
        });
    }

    function promotedWikiKey(projectKey, articleId) {
        return projectKey + ":" + articleId;
    }
    /**
     * getPromotedWikiItems
     * Get list of projects
     * @param callback - callback function for the notification
     * @param callerScope - scope of the caller
     * @returns promise to complete then the data is processed.  Not used by the controller, which now uses notifications.
     */
    svc.getPromotedWikiItems = function(callback, callerScope) {
        if (callback) subscribe(callerScope, personalHomeRefreshEvents.promotedWiki, callback);

        return DataikuAPI.projects.listPromotedWikis(true, noSpinner).then(function(data) {
            loadedItems.promotedWikis.list = [];
            loadedItems.promotedWikis.map = {};

            const wikis = data.data.wikis;
            const list = loadedItems.promotedWikis.list;
            const map = loadedItems.promotedWikis.map;

            wikis.forEach(function(wiki) {
                promotedWikiAlignProperties(wiki);
                list.push(wiki);
                map[wiki.id] = wiki;
            });

            enrichMapFromRecentlyUsedItems(tileTypes.promotedWiki, loadedItems.promotedWikis.map, item => promotedWikiKey(item.projectKey, item.id));
            sortPromotedWikiItems();

            // enrich the other lists with promoted wiki data
            enrichLists([loadedItems.recentlyUsed.map], enrichItemFromPromotedWiki);

            if (loadedItems.recentlyUsed.isStale) refreshMyItemsList(); // needed when enrichment detects stale ru item data

            notify(personalHomeRefreshEvents.promotedWiki, loadedItems.promotedWikis.list);
        }, () => setErrorInScope.bind(callerScope));
    };



});

app.controller('PersonalHomeController', function($scope, $state, $rootScope, $timeout, WT1, TopNav, CreateModalFromTemplate, Fn, DKUConstants, TaggingService, HomePageContextService, PersonalHomeService, DataikuAPI, HomeBehavior, Throttle) {

    const throttle = Throttle().withScope($scope).withDelay(200);
    // Root allows us to detect the need for a login without first redirecting to home
    if ($state.current.name == "root") {
        $state.go('home');
        return;
    }

    // Automation node as Deployer
    if  ($rootScope.appConfig.isAutomation && !$rootScope.appConfig.projectsModuleEnabled) {
        $state.go('deployer');
        return;
    }

    /*
     * UI Models
     */

    const MAX_RECENTLY_USED_PER_ROW = 8;

    const dataLoadStates = {
        none: 0,
        partial: 1, //standalone mode
        full: 2
    };

    const tileDisplayModes = {
        oneRowOfTiles : "null",
        rowsOfTiles: "row",
        rectangleOfTiles: "mosaic",
        listOfText: "list"
      };

    const infoPaneModes = {
        initial : 'initial',
        expanded : 'expanded',
        compressed : 'compressed'
    };

    const rowTypes = {
        myItems: "my-items",
        projects: "projects",
        apps: "apps",
        dashboards: "dashboards",
        promotedWikis: "wikis",
        projectFolders: "project-folders",
    };

    const tileRowIds = {
        myItems: 0,
        myProjects: 1,
        myApps: 2,
        projectFolders: 3,
        myDashboards: 4,
        myPromotedWikis: 5,
    };

    const defaultSharedUiState = {
        shared : {
            searchFilter: "",
            gettingStartedTabIdx: 0,
            infoPaneMode: infoPaneModes.initial,
            infoPaneModeComplete: infoPaneModes.initial
        }
    };

    const defaultUiStateForRoute = {
        showTileRow: 0,
        tileDisplayMode: tileDisplayModes.rowsOfTiles
    };

    const displayModeByRouteName = {
        "home" : tileDisplayModes.rowsOfTiles,
        "home.expandedlist" : tileDisplayModes.listOfText,
        "home.expandedmosaic": tileDisplayModes.rectangleOfTiles,
        "wikis.list" : tileDisplayModes.listOfText, //standalone mode
        "wikis": tileDisplayModes.rectangleOfTiles //standalone mode
    };

    $scope.uiState = angular.extend ({} , defaultSharedUiState, defaultUiStateForRoute);
    let dataLoadState = dataLoadStates.none;

    /*
     * Info pane
     */

    /**
     * Add or remove an overlay between "getting started with DSS" panel and the rest of the screen to prevent tiles / list
     * items from being clicked when this panel is expanded
     * @param isDisable
     */
    let toggleOverlay = function(isDisable) {
        $('.pane-top-glass.full-screen').css('display', isDisable ? 'block' : 'none');
    };

    $scope.$on('lock-overlay', (event, isLock) => {
        toggleOverlay(isLock);
    });

    $scope.clickOnOverlay = function(event) {
        $scope.toggleInfoPane(event, false);
        $scope.$broadcast("overlay-clicked");
    }

    /**
     * Change inforPane size according to uiState.shared.infoPaneMode
     * @param to
     */
    let refreshInfoPaneSize = function () {
        const modes = infoPaneModes;
        const mode = $scope.uiState.shared.infoPaneMode;
        $rootScope.$broadcast('dismissPopovers');

        $('.pane-bottom').removeClass(modes.initial + " " + modes.expanded + " " + modes.compressed)
            .addClass(mode)
            .one("transitionend", () => toggleOverlay(mode==infoPaneModes.expanded));

        $scope.uiState.shared.infoPaneModeComplete = mode;
    };

    let isGrowInfoPaneEnabled = true; //will be disabled when user is dragging row to scroll them horizontally
    $scope.$on('onDragScrollAction', function(event, args) {
        isGrowInfoPaneEnabled = !args.isDragging;
    });

    /**
     * Grow or compress the info pane, depending on the value of isGrow.
     * If isGrow is undefined, infoPane will be reversed.
     * @param e: the event that triggered this function
     * @params: isGrow
     */
    $scope.toggleInfoPane = function(e, isGrow) {
        if (!isGrowInfoPaneEnabled) return;

        const ui = $scope.uiState;
        if (isGrow == undefined) isGrow = (ui.shared.infoPaneMode == 'compressed');

        const newMode = isGrow ? infoPaneModes.expanded: infoPaneModes.compressed;
        if (ui.shared.infoPaneMode==newMode) return;

        ui.shared.infoPaneMode = newMode;
        refreshInfoPaneSize();

        if (!!isGrow && ui.activeRoute.tileDisplayMode==tileDisplayModes.oneRowOfTiles) ui.activeRoute.tileDisplayMode = tileDisplayModes.rowsOfTiles;
        e.stopPropagation();
        $timeout(saveUiState, 600);
    };

    $scope.isInfoPaneVisible = function (){
        return $scope.uiState.shared.infoPaneModeComplete != infoPaneModes.compressed;
    };

    /*
     * Utils
     */

    /**
     * Scroll personal home page to i in pixels
     * @param i
     */
    let scrollPaneTopTo = function(i) {
        $('.pane-top').scrollTop(i);
    };

    $scope.isThemed = function () {
        return !!$rootScope.appConfig.theme;
    };

    /*
     * Switching view mode (rows, mosaic, list)
     */

    /**
     * Return 'my-items', 'projects', 'dashboards', 'wikis', or 'home',
     * depending on what state of the personal home page we are.
     * @returns {string}
     */
    function getStateRoute() {
        return $state.params && $state.params.row ? $state.params.row : 'home';
    }

    function isArrivingFromHomePages(fromState) {
        return ['ProjectsListController', 'PersonalHomeController', 'ProjectFolderController', 'AppsListController'].includes(fromState.controller);
    }

    /**
     * Configure uiState depending on the current route
     * @param fromState
     */
    function setUIState(fromState) {
        const route = getStateRoute();
        $scope.uiState = HomePageContextService.getFullCtx(fromState);
        $scope.uiState.activeRoute = $scope.uiState[route];

        if (!$scope.uiState.shared || !$scope.uiState.shared.hasOwnProperty("infoPaneMode")) {
            angular.extend($scope.uiState, defaultSharedUiState);
        }
        if (!$scope.uiState[route] || !$scope.uiState[route].hasOwnProperty("tileDisplayMode")) {
            if (!$scope.uiState.hasOwnProperty(route)) $scope.uiState[route] = {};
            angular.extend($scope.uiState[route], defaultUiStateForRoute);
        }

        $scope.uiState.activeRoute = $scope.uiState[route];
        $scope.uiState.activeRoute.tileDisplayMode = displayModeByRouteName[$state.current.name];
        $rootScope.topNav.homeSearchFilter = (fromState && isArrivingFromHomePages(fromState))  ? $scope.uiState.shared.searchFilter : "";
    //    $timeout (_ => {
    //        let y = $rootScope.topNav.homeSearchFilter; $rootScope.topNav.homeSearchFilter+="x"; $rootScope.topNav.homeSearchFilter=y
    //    }, 2000);

        let rowType = $state.params.row ? $state.params.row : tileDisplayModes.rowsOfTiles;
        $scope.uiState.activeRoute.showTileRow = $scope.tileRows.findIndex(e => e.rowType == rowType);
    }

    function ensureDataLoaded() {
        if (!$scope.isStandaloneMode() &&  dataLoadState != dataLoadStates.full) loadData();
    }

    /**
     * Update the whole view to match with the current route
     * @param fromState
     */
    function updateView(fromState) {
        ensureDataLoaded();
        setUIState(fromState);
        refreshInfoPaneSize();
        scrollPaneTopTo(0);
    }

    $scope.$on('$stateChangeSuccess', (e, toState, toParams, fromState) => {
        updateView(fromState)
        if ($scope.appConfig.userSettings.home.behavior === HomeBehavior.LAST)
            HomePageContextService.setLastVisitedState(toState.name, toParams);
    });

    function saveUiState() {
        HomePageContextService.saveRouteCtx(getStateRoute(), $scope.uiState.activeRoute, $scope.uiState.shared);
    }

    $scope.$on('$stateChangeStart', () => {
        saveUiState();
    });

    $scope.$watch('$root.topNav.homeSearchFilter', function() {
        $scope.uiState.shared.searchFilter = $rootScope.topNav.homeSearchFilter;
    });

    /*
     * Loading and displaying data
     */

    /**
     * Standalone mode is for wiki listing - or any other jump to an expandlisted
     * We don't load all the data, just what is needed, and the UI is adjusted
     */
    $scope.isStandaloneMode = function() {
        return $state.params.standalone;
    }

    /**
     * Fill row passed in parameter (rowSet) with recently used item of the class passed in parameter (tileType)
     * @param tileType: type of items to fill row with
     * @param rowSet: row to fill
     */
    function fillRowWithRecentlyUsed(tileType, rowSet) {
        let list = PersonalHomeService.getRecentlyUsedItems().byType[tileType].slice(0, MAX_RECENTLY_USED_PER_ROW);
        list.forEach((o) => rowSet.push(o));

        rowSet.push({tileType: tileTypes.skeleton, forTileType: tileType, disableStar: true});
    }

    /**
     * Callback used when data are retrieved to fill a row (or a mosaic, or a list), whatever its type (my-items, projects, dashboards, wikis)
     * @param event
     * @param args
     */
    function onRowDataRefresh(event, args) {
        const list = args.data;

        let rowId;
        switch (event.name) {
            case personalHomeRefreshEvents.project:
                rowId = tileRowIds.myProjects;
                break;
            case personalHomeRefreshEvents.app:
                rowId = tileRowIds.myApps;
                break;
            case personalHomeRefreshEvents.dashboard:
                rowId = tileRowIds.myDashboards;
                break;
            case personalHomeRefreshEvents.promotedWiki:
                rowId = tileRowIds.myPromotedWikis;
                break;
            case personalHomeRefreshEvents.projectFolders:
                rowId = tileRowIds.projectFolders;
                break;
            default:
                rowId = tileRowIds.myItems;
                break;
        }

        if (!args.errorLoading) {
            if ($scope.tileRows[rowId].checkExistence) {
                DataikuAPI.taggableObjects.checkDeletedObjects($scope.tileRows[rowId].rowSet).success(function(data){
                    let toUnStar=[];
                    data.forEach( (o) => {
                        if (o.id && o.projectKey && o.type) {
                            toUnStar.push({id: o.id, projectKey:o.projectKey, type: o.type });
                        }
                        PersonalHomeService.discardRecentlyusedItem(o);
                    });
                    if (toUnStar.length > 0) {
                        DataikuAPI.interests.star(toUnStar, false);
                    }
                });
            }
            $scope.tileRows[rowId].rowSet = list;
            $scope.tileRows[rowId].fullyPopulated = true;
        }

        $scope.tileRows[rowId].errorLoading = args.errorLoading;
    }

    /**
     * Fill the tileRow passed in parameter (row) with data (from server and from local storage for recently used items)
     * @param row : tileRow to fill
     * @param isStandaloneListing : if true, recently used itemps won't be added
     */
    function loadDataForTileRow(row, isStandaloneListing) {
        const rowSet = [];
        row.rowSet = rowSet;

        PersonalHomeService[row.fGetData](onRowDataRefresh, $scope);
        if (!isStandaloneListing) fillRowWithRecentlyUsed(row.tileType, rowSet);
    }

    $scope.reloadData = row => {
        if (row !== undefined) {
            throttle.exec(() => {
                loadDataForTileRow(row, true);
            })
        }
    }

    /**
     * Returns tileRow matching the current route
     */
    $scope.getCurrentTileRow = function() {
        return $scope.tileRows[$scope.uiState.activeRoute.showTileRow];
    }

    function loadData() {
        const isStandalone = $scope.isStandaloneMode();
        if (isStandalone) {
            loadDataForTileRow(tileRowMap[$state.params.row], isStandalone);
            dataLoadState = dataLoadStates.partial;
        }
        else {
            $scope.tileRows.filter(row => row.visible === true).forEach(row => loadDataForTileRow(row, isStandalone));
            dataLoadState = dataLoadStates.full;
        }
    }

    /**
     * Main start-up
     *
     */
    $scope.tileRows = [
        {rowSet: [], heading: "My items", rowType:rowTypes.myItems, scrollInterval: 300, expandUrl: undefined, tileWidth: 280, tileHeight: 90, itemPlural: 'items',
            tileType: tileTypes.myItem, fGetData: 'getStarredItems', checkExistence: true,
            sortOptions: {
            sortBy: [{ value: 'name', label: 'Name' },{ value: 'type', label: 'Type' }, { value : 'ordinal', label : 'Recently used' }],
            default: 'ordinal'},
            emptyStateShort: 'Your favorite and last-used items will appear here', starrable: true},

        {rowSet: [], heading: "Projects", rowType:rowTypes.projects, scrollInterval: 300, expandUrl: 'project-list', tileWidth: 280, tileHeight: 160, itemPlural: 'projects',
            tileType: tileTypes.project, fGetData: 'getProjectItems',
            emptyStateLong:['No projects have been shared with you.'], starrable: true},

        {rowSet: [], heading: "Applications", rowType:rowTypes.apps, scrollInterval: 300, expandUrl: 'apps.list', tileWidth: 160, tileHeight: 200, itemPlural: 'apps',
            tileType: tileTypes.app, fGetData: 'getAppItems',
            emptyStateLong:['No applications have been shared with you.'], starrable: false},

        {rowSet: [], heading: "Project Folders", rowType:rowTypes.projectFolders, scrollInterval: 300, expandUrl: 'project-list', tileWidth: 280, tileHeight: 130, itemPlural: 'project folders',
            tileType: tileTypes.projectFolders, fGetData: 'getProjectFolderItems',
            emptyStateLong: ['No Project Folders have been created.'], starrable: false},

        {rowSet: [], heading: "Dashboards", rowType:rowTypes.dashboards, scrollInterval: 300, expandUrl: undefined, tileWidth: 280, tileHeight: 160, itemPlural: 'dashboards',
            tileType: tileTypes.dashboard, fGetData: 'getDashboardItems',
            sortOptions: {
            sortBy :[ { value: 'name', label: 'Name' }, { value : '-lastModifiedOn', label : 'Last modified' }],
            default: 'name'
            },
            emptyStateLong:['No dashboards have been shared with you.', 'Dashboards share elements of a data project with users.'],
            loadError: 'A full list of dashboards is not currently available.  Please try again later.' , starrable: true},

        {rowSet: [], heading: "Wikis", rowType:rowTypes.promotedWikis, scrollInterval: 300, expandUrl: undefined,
            tileWidth: 280, tileHeight: 80, tileWidthMosaic: 384, tileHeightMosaic: 216, itemPlural: 'wikis', standaloneTitle: 'wikis',
            tileType: tileTypes.promotedWiki, fGetData: 'getPromotedWikiItems',
            sortOptions: {
                sortBy :[ { value: 'name', label: 'Name' }, { value : '-lastModifiedOn', label : 'Last modified' }],
                default: 'name'
            },
            emptyStateLong:['No wikis have been shared with you.', 'Go to the settings screen for a project to share its wiki'], starrable: false}
    ];

    let tileRowMap = {};
    let shiftIndex = 0;

    $scope.tileRows.forEach((row, index) => {
        const found = ($scope.appConfig.userSettings.home.rows || []).find(r => r.tileType === row.tileType);
        const foundIndex = ($scope.appConfig.userSettings.home.rows || []).findIndex(r => r.tileType === row.tileType);
        let newIndex;
        if (found === undefined) {
            newIndex = index;
            shiftIndex++;
        } else {
            newIndex = shiftIndex + foundIndex
        }
        Object.assign(row, {position: newIndex, visible: !found || found.visible});
        tileRowMap[row.rowType] = row;
    });

    TopNav.setLocation(TopNav.DSS_HOME, $scope.isStandaloneMode() ? tileRowMap[$state.params.row].standaloneTitle : false);

    PersonalHomeService.clearData();

    loadData();
    updateView();
    $timeout(() => refreshInfoPaneSize(), 100);

});

}());
