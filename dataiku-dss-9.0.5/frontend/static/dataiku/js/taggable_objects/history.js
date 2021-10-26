(function(){
    'use strict';

    var app = angular.module('dataiku.services');

    app.factory('HistoryService',["$rootScope", "$state", "$stateParams", "LocalStorage", "TopNav", "Logger", "TAGGABLE_TYPES",
        function ($rootScope, $state, $stateParams, LocalStorage, TopNav, Logger, TAGGABLE_TYPES) {
            function getHistory() {
                var dssHistory = LocalStorage.get('dssHistory');
                if (dssHistory && dssHistory.dss_history_version != 2) {
                    Logger.warn("flush old local dss history")
                    dssHistory = {dss_history_version: 2};
                    LocalStorage.set('dssHistory', dssHistory);
                }
                dssHistory = dssHistory || {};

                var user = $rootScope.appConfig.login;
                return dssHistory[user] || {};
            }

            function truncateUserHistoryList(userHistory) {
                const maximumSize = 60;
                const clearedSize = 30; // when maximumSize is reached, keep only the clearedSize most recent

                // we now keep 5 projects and 5 dashboards whenever we can, to improve the population of
                // personal home page.
                const keepProjDbdTarget = 5;

                if (Object.keys(userHistory).length > maximumSize) {
                    let items = Object.keys(userHistory).map(function(key) {return userHistory[key];});
                    items = sortByLastView(items);
                    userHistory = {};

                    let projectsCount = 0;
                    let dashboardsCount = 0;
                    let keptCount = 0;

                    items.forEach(function(item) {
                        let keep = (keptCount < clearedSize);
                        if (!keep && item.type=='PROJECT') keep = (++projectsCount <= keepProjDbdTarget);
                        if (!keep && item.type=='DASHBOARD') keep = (++dashboardsCount <= keepProjDbdTarget);

                        if (keep) {
                            keptCount++;
                            userHistory[item.key] = item;
                        }
                    });
                }
                return userHistory;

            }
            function clean(userHistory) {
                // fix on-going sporadic issue that impacts Personal home page
                if (userHistory.hasOwnProperty("undefined")) {
                    delete userHistory["undefined"];
                }
            }

            function cleanOldWikiArticles(userHistory, savedItem) {
                // cleaning old wiki articles with same projectKey
                if (savedItem.type !== 'ARTICLE') return;

                Object.keys(userHistory).forEach(function(key) {
                    const item = userHistory[key];

                    if (item.type === 'ARTICLE'
                        && item.projectKey === savedItem.projectKey) {
                        delete userHistory[key];
                    }
                });
            }

            function persist(userHistory) {

                clean(userHistory);

                userHistory = truncateUserHistoryList(userHistory);

                var dssHistory = LocalStorage.get('dssHistory') || {};
                var user = $rootScope.appConfig.login;
                dssHistory[user] = userHistory;
                LocalStorage.set('dssHistory', dssHistory);
            }

            /*
                Saved items:
                {
                    key (unique),
                    displayName,
                    type,
                    subtype,
                    projectKey,
                    views,
                    lastViewed (timestamp),

                    [any content saved in TopNav item]
                }
            */
            function doSave(item, incrementView, incrementUpdate) {
                let key = getKey(item);
                if (String(key) === "undefined") return; //unclear how this happens, but it's problematic

                let dssHistory = getHistory();
                let savedItem = dssHistory[key];
                let views = 0;
                let data = {};
                let updates = 0;

                if (savedItem) {
                    views = savedItem.views;
                    data = savedItem.data;
                    updates = savedItem.updates;
                }

                savedItem = $.extend(savedItem, item, {
                    views: views + (incrementView ? 1 : 0),
                    updates: updates + (incrementUpdate ? 1 : 0),
                    lastViewed: Date.now(), //UTC timestamp
                    lastUpdated: !savedItem ? 0 : (incrementUpdate ? Date.now() : savedItem.lastUpdated)
                });

                //avoid overwriting data with
                if (item.data.loading) {
                    savedItem.data = data;
                } else {
                    savedItem.data = $.extend({}, data, savedItem.data);
                }

                savedItem.displayName = savedItem.data.name || savedItem.displayName;
                savedItem.subtype = getSubtype(item) || savedItem.subtype ;
                if (!savedItem.projectKey) savedItem.projectKey = $stateParams.projectKey;

                cleanOldWikiArticles(dssHistory, savedItem);
                dssHistory[key] = savedItem;
                persist(dssHistory);
            }

            function saveItem(item) {
                doSave(item, true);
            }

            function saveItemWithoutViewIncrement(item) {
                doSave(item, false);
            }

            function getKey(item) {
                var projectKey = item.projectKey || $stateParams.projectKey;
                var type = item.type ? item.type : "";
                return projectKey + ':' + type + ':' + item.id;
            }

            function getSubtype(item) {
                if (!item || !item.data) {
                    return;
                }
                if (item.type == "ANALYSIS") {
                    return "ANALYSIS";
                }
                if (item.type == "JUPYTER_NOTEBOOK" || item.type == "SQL_NOTEBOOK") {
                    return item.type;
                }
                var data = item.data;
                return data.datasetType || data.recipeType || data.type;
            }

            var trackedType = TAGGABLE_TYPES;
            function isTracked(item) {
                if (item.data && item.data.dummy) {
                    return false;
                }
                return trackedType.indexOf(item.type) >= 0;
            }

            function hasUpdatedData(itemOld, itemNew) {
                if (!itemNew.data || itemNew.data.loading) {
                    return false;
                } else if (!itemOld.data) {
                    return true;
                } else {
                    return !angular.equals(itemOld.data, $.extend({}, itemOld.data, itemNew.data));
                }
            }

            function onItemChange(item) {
                if (item && item.id && (item.displayName || (item.data && item.data.name)) && isTracked(item)) {
                    if (!TopNav.sameItem(currentItem, item)) {
                        saveItem(item);
                    } else if (hasUpdatedData(currentItem, item)) {
                        saveItemWithoutViewIncrement(item);
                    }
                }
                currentItem = item;
            }

            function sort(items, fn) {
                function compare(a,b) {
                    var fa = fn(a), fb = fn(b);
                    if (fa < fb)
                       return 1;
                    if (fa > fb)
                      return -1;
                    return 0;
                }
                return items.sort(compare);
            }

            function sortByLastView(items) {
                return sort(items, function(item){return item.lastViewed});
            }

            function sortByMostViewed(items) {
                return sort(items, function(item){return item.views});
            }

            var currentItem = $rootScope.topNav.item;
            $rootScope.$watch('topNav.item', onItemChange, true);
            onItemChange(currentItem);



            // ********* Public interface ********

            function getRecentlyViewedItems (n, requestedType, requestedProject, includeCurrentItem) {
                if (requestedType == 'ANY') {
                    requestedType = null;
                }

                var dssHistory = getHistory();
                // Change unwound to help automated testing with older version of Chrome var items = Object.values(dssHistory);
                let items = Object.keys(dssHistory).map(function(key) {return dssHistory[key];});
                items = sortByLastView(items);

                // Filter types and remove the current item from history.
                // Note: using $rootScope.topNav.item directly instead of currentItem because getRecentlyViewedItems
                // can be called before onItemChange is triggered (so before currentItem is updated)
                if ($rootScope.topNav.item || requestedType) {
                    items = items.filter(function(item) {
                        if (!includeCurrentItem && $rootScope.topNav.item && getKey(item) == getKey($rootScope.topNav.item)) {
                            return false;
                        }
                        if (requestedProject && item.projectKey != requestedProject) {
                            return false
                        }
                        item.key = getKey(item);//DEBUG
                        return (
                            !requestedType ||
                             requestedType == 'ANY' ||
                            (requestedProject && item.type=='PROJECT') ||
                            (requestedType == item.type) ||
                            (requestedType == 'NOTEBOOK' && (item.type == 'SQL_NOTEBOOK' || item.type == 'JUPYTER_NOTEBOOK'))
                        );
                    });
                }
                return items.slice(0,n);
            }

            function getHistoryInfo(item) {
                var dssHistory = getHistory();
                var savedItem = dssHistory[getKey(item)];
                return $.extend({}, item, savedItem);
            }

            function notifyRenamed(oldItem, newName) {
                // the following three types are required in oldItem
                if (!oldItem) return;
                var newType = oldItem.type;
                var newId = oldItem.id;
                var newProjectKey = oldItem.projectKey;
                if (!newId || !newType || !newProjectKey) {
                    return;
                }

                var oldKey = getKey(oldItem);
                var dssHistory = getHistory();
                var savedItem = dssHistory[oldKey] || {};
                if (newType == "DATASET" || newType == "RECIPE") {
                    newId = newName; //for these types, id == name
                }

                savedItem.id = newId;
                savedItem.displayName = newName;

                var newKey = getKey({
                    type: newType,
                    id: newId,
                    projectKey: newProjectKey
                });
                if (oldKey != newKey) {
                    delete dssHistory[oldKey];
                }
                dssHistory[newKey] = savedItem;

                persist(dssHistory);

                if (TopNav.sameItem(oldItem, currentItem)) {
                    currentItem.id = newId;
                    currentItem.displayName = newName;
                }
            }


            function notifyRemoved(item, impact) {
                var key = getKey(item);
                var dssHistory = getHistory();

                if (dssHistory.hasOwnProperty(key)) {
                    delete dssHistory[key];
                }

                if (impact) {
                    if (impact.deletedRecipes) {
                        impact.deletedRecipes.forEach(function(recipe){
                            var key = getKey({
                                type: "RECIPE",
                                id: recipe.name,
                                projectKey: recipe.projectKey
                            });

                            if (dssHistory.hasOwnProperty(key)) {
                                delete dssHistory[key];
                            }
                        })
                    }
                    if (impact.deletedAnalyses) {
                        impact.deletedAnalyses.forEach(function(analysis){
                            var key = getKey({
                                type: "ANALYSIS",
                                id: analysis.id,
                                projectKey: analysis.projectKey
                            });

                            if (dssHistory.hasOwnProperty(key)) {
                                delete dssHistory[key];
                            }
                        })
                    }
                }

                persist(dssHistory);
            }

            function itemUpdated(method, data) {
                // most REST API POST commands represent an item update or other interesting action.
                //  A few, though, need to be ignored.
                const ignoredAction  = ['/get', 'pop-', '/refresh', '/prepare', '/check', '/search'].find((s) =>  method.indexOf(s) >=0 );
                if  (ignoredAction || !currentItem || !currentItem.hasOwnProperty("data") || currentItem.data==null || currentItem.id =="New dataset"){
                    return;
                }

                doSave(currentItem, false, true);
            }

            function itemEnriched(item) {
                doSave(item, false, false);
            }

            function projectOpened(project) {
                saveItem( {projectKey: project.projectKey, id: project.projectKey, type:'PROJECT', data: project });

                // current item can be missing project data due to delayed loading
                if (currentItem && currentItem.type=='PROJECT' && currentItem.projectKey==project.projectKey) currentItem.data = project;
            }

            return {
                getRecentlyViewedItems: getRecentlyViewedItems,
                getHistoryInfo: getHistoryInfo,
                // getHistoryInfoAndSort: getHistoryInfoAndSort,
                notifyRenamed: notifyRenamed,
                notifyRemoved: notifyRemoved,
                recordItemPost:  itemUpdated,
                recordProjectOpen: projectOpened,
                recordEnrichment: itemEnriched
            };
    }]);

})();
