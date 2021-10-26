(function () {
    'use strict';

    var app = angular.module('dataiku.projects.actions', []);

    app.directive("scrollyMenu", function () {
        return {
             scope: true,
            link: function (scope, element, attrs) {

                scope.posnMenu = function(evt) {
                    var $menuItem = $(evt.currentTarget);
                    var $submenuWrapper = $('> .scrolly-wrapper', $menuItem);
                    if ($submenuWrapper.length==0) return;

                    // grab the menu item's position relative to its positioned parent (position=relative)
                    var menuItemPos = $menuItem.position();

                    var subT = menuItemPos.top;
                    var subH = $submenuWrapper.height();
                    var vH = $(window).height()

                    if (subT + subH > 0.8 * vH) {
                        subT = Math.max(Math.round(0.7 * vH - subH), 0); //shift up submenu to fit on screen
                    }

                    // place submenu relative to the positioned parent
                    $submenuWrapper.css({
                        top: subT,
                        left: menuItemPos.left - Math.round($submenuWrapper.outerWidth())
                    });

                }
            }
        }
    });
    app.directive("newRecipeMenu", function (GlobalProjectActions) {
        return {
            templateUrl: '/templates/recipes/new-recipe-menu.html',
            scope: true,
            link: function (scope, element, attrs) {
                scope.title = attrs.title;
                scope.displayedItems = GlobalProjectActions.getAllRecipesBySection(scope);

                scope.do = function (cb) {
                    cb();
                }
            }
        }
    });
    
    app.directive("newStreamingRecipeMenu", function (GlobalProjectActions, $filter, CreateModalFromTemplate,DataikuAPI,$state) {
        return {
            templateUrl: '/templates/recipes/new-streaming-recipe-menu.html',
            scope: true,
            link: function (scope, element, attrs) {
                scope.title = attrs.title;
                scope.displayedItems = GlobalProjectActions.getStreamingRecipesBySection(scope);
                
                scope.do = function (cb) {
                    cb();
                }
            }
        }
    });
    
    app.directive("zoneSelectionMenu", function (GlobalProjectActions, DataikuAPI, $rootScope, $stateParams, $state) {
        return {
            templateUrl: '/templates/recipes/zone-selection-menu.html',
            scope: true,
            link: function (scope, element, attrs) {
                scope.selectedZone = $stateParams.zoneId;
                scope.$watch(attrs.color, function(nv, ov) {
                    scope.bgColor = nv;
                    scope.fgColor = '#' + getContrastYIQ(stripNumberSign(nv));
                });
                scope.zones = [];
                scope.changeZone = () => {
                    $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId: scope.selectedZone, id: null }));
                };

                scope.listZones = () => {
                    DataikuAPI.flow.zones.list($stateParams.projectKey).then(data => {
                        scope.zones = data.data;
                    });
                };
                scope.listZones();

                const zonesListChangedListener = $rootScope.$on("zonesListChanged", scope.listZones);
                scope.$on('$destroy', zonesListChangedListener);

                function getContrastYIQ(hexcolor) {
                    var r = parseInt(hexcolor.substr(0,2),16);
                    var g = parseInt(hexcolor.substr(2,2),16);
                    var b = parseInt(hexcolor.substr(4,2),16);
                    var yiq = ((r*299)+(g*587)+(b*114))/1000;
                    return (yiq >= 128) ? '000000' : 'FFFFFF';
                };

                function stripNumberSign(color) {
                    if(color[0] === "#") {
                        color = color.substring(1, color.length);
                    }
                    return color;
                };
            }
        }
    });

    app.directive("newDatasetMenu", function (GlobalProjectActions, $filter, CreateModalFromTemplate,DataikuAPI,$state) {
        return {
            templateUrl: '/templates/datasets/new-dataset-menu.html',
            scope: true,
            link: function (scope, element, attrs) {
                scope.title = attrs.title;
                GlobalProjectActions.getAllDatasetsBySection(scope).then((displayedItems) => scope.displayedItems = displayedItems);
                scope.searchAndImport = function(zoneId) {
                    DataikuAPI.connections.countIndexedAndUnindexed().success(function (data) {
                        if (data.indexedConnections > 0) {
                            $state.go('projects.project.catalog.items', {zoneId});
                        } else {
                            $state.go("projects.project.catalog.connectionexplorer", {zoneId})
                        }

                    }).error(setErrorInScope.bind(scope));
                };

                scope.do = function (cb) {
                    cb();
                }
            }
        }
    });

    app.component('newDatasetMenuItemLabel', { // new-dataset-menu-item-label
        bindings: {
            'item': '<',
        },
        template: `
            <span ng-if="!$ctrl.item.em"><i class="icon-fixed-width-small {{$ctrl.item.icon}}" />&nbsp;{{$ctrl.item.label}}</span>
            <em ng-if="$ctrl.item.em"><i class="icon-fixed-width-small {{$ctrl.item.icon}}" />&nbsp;{{$ctrl.item.label}}</em>
        `,
    });

    app.directive("newOtherFlowMenu", function (GlobalProjectActions, $filter, CreateModalFromTemplate,DataikuAPI,$state) {
        return {
            templateUrl: '/templates/flow-editor/new-other-flow-menu.html',
            scope: true,
            link: function (scope, element, attrs) {
                scope.title = attrs.title;
                scope.displayedItems = GlobalProjectActions.getFlowOtherItemsBySection(scope);
                scope.do = function (cb) {
                    cb();
                }
            }
        }
    });

    app.directive("newStreamingEndpointMenu", function (GlobalProjectActions, $filter, CreateModalFromTemplate,DataikuAPI,$state) {
        return {
            templateUrl: '/templates/streaming-endpoints/new-streaming-endpoint-menu.html',
            scope: true,
            link: function (scope, element, attrs) {
                scope.title = attrs.title;
                scope.displayedItems = GlobalProjectActions.getAllStreamingEndpointsBySection(scope);
            
                scope.do = function (cb) {
                    cb();
                }
            }
        }
    });

    app.controller("MassImportConnectionSelectionController", function ($scope, $state, $stateParams, DataikuAPI, TopNav) {
        $scope.connection = null;
        $scope.connections = [];
        DataikuAPI.connections.listMassImportSources($stateParams.projectKey).success(function (data) {
            $scope.connections = data.sources;
            $scope.hiveError = data.hiveError;
        }).error(setErrorInScope.bind($scope));
        $scope.isValid = function () {
            return $scope.connection != null;
        };
        $scope.massImport = function () {
            $state.go("projects.project.catalog.connectionexplorer", {
                projectKey: $stateParams.projectKey,
                connectionName: $scope.connection.name
            });
            $scope.dismiss();
        };
    });

    app.controller("TablesImportProjectSelectionModalController", function ($scope, $state, $stateParams, DataikuAPI) {
        DataikuAPI.projects.list().success(function (data) {
            $scope.projects = data;
        }).error(setErrorInScope.bind($scope));

        $scope.clickImport = function () {
            $scope.dismiss();
            $state.go('projects.project.tablesimport', {
                    projectKey: $scope.project,
                    importData: JSON.stringify($scope.getImportData())
            });
        };
    });

    app.controller("MassImportTablesFromCatalogModalController", function ($scope, $state, $stateParams, DataikuAPI) {
         DataikuAPI.projects.list().success(function (data) {
            $scope.projects = data;
            if ($scope.projects.length === 1) {
                $scope.project = $scope.projects[0].projectKey;
            }
        }).error(setErrorInScope.bind($scope));

        $scope.clickImport = function () {
            $scope.dismiss();
            $state.go('projects.project.tablesimport', {
                    projectKey: $scope.project,
                    importData: JSON.stringify($scope.getImportData())
            });
        }
    });


    app.factory("GlobalProjectActions", function ($stateParams, $rootScope, $filter, $state,
        Assert, CreateModalFromTemplate, DatasetUtils, Logger, Dialogs, DataikuAPI, ComputablesService, TaggableObjectsService, RecipeDescService, uiCustomizationService) {

        function ok(details) {
            return {ok: true, details: details}
        }

        function nok(reason) {
            return {ok: false, reason: reason}
        }

        function makePluginSection(pluginId, items) {
            var plugin = Array.dkuFindFn($rootScope.appConfig.loadedPlugins, function (n) {
                return n.id == pluginId
            });
            if (plugin == null) return null; // could have been deleted on disk
            items.forEach(function (dtype) {
                if (!dtype.icon) dtype.icon = plugin.icon;
            });
            // add an item to point to the info
            items.splice(0, 0, {isInfo: true, pluginId: plugin.id});
            return {
                isSection: true,
                id: "plugin_" + plugin.id,
                icon: plugin.icon,
                label: plugin.label || plugin.id,
                items: items
            };
        }

        function mostFrequentIcon(pluginList) {
            let max = 0, last = 'icon-puzzle-piece', items = {};

            pluginList.some(function(plugin) {
                if (!plugin.icon) return false;

                items[plugin.icon] = !items[plugin.icon] ? 1 : items[plugin.icon] + 1;

                if (max < items[plugin.icon]) {
                    last = plugin.icon;
                    max = items[plugin.icon];

                    if (max > pluginList.length / 2) {
                        return true;
                    }
                }
                return false;
            });

            return last;
        }


        /* **************************************************
         * Recipes that have license restrictions
         *
         * - When you have a CE, we show as enabled and show an upgrade CTA
         * - When you have a real EE, we don't want to show a CTA so we disable the icon
         * if not configured.
         * - The "configured but not licensed mode" should be fairly rare
         */

        function notLicensedCE() {
            return {
                usable: false,
                iconEnabled: true,
                enableStatus: "NOT_LICENSED_CE"
            }
        }

        function notConfigured(reason) {
            return {
                usable: false,
                iconEnabled: false,
                enableStatus: "NOT_CONFIGURED",
                iconDisabledReason: reason
            }
        }

        function notLicensedEE() {
            return {
                usable: false,
                iconEnabled: true,
                enableStatus: "NOT_LICENSED_EE"
            }
        }

        function usable() {
            return {
                usable: true,
                iconEnabled: true,
                enableStatus: "OK"
            }
        }

        function notDataScientist() {
            return {
                usable: false,
                iconEnabled: false,
                enableStatus: "NOT_LICENSED_EE",
                iconDisabledReason: "Your user profile does not allow you to create this kind of recipe"
            }
        }

        function noUnsafeCode() {
            return {
                usable: false,
                iconEnabled: false,
                enableStatus: "NOT_LICENSED_EE",
                iconDisabledReason: "You may not write unisolated code"
            }
        }

        function noSafeCode() {
            return {
                usable: false,
                iconEnabled: false,
                enableStatus: "NOT_LICENSED_EE",
                iconDisabledReason: "You may not write isolated code"
            }
        }


        function getHiveStatus() {
            if ($rootScope.appConfig.communityEdition) {
                return notLicensedCE();
            } else {
                if (!$rootScope.appConfig.hiveEnabled) {
                    return notConfigured("Hive not configured on this DSS instance");
                }
                if (!$rootScope.addLicInfo.hiveLicensed) {
                    return notLicensedEE();
                }
                return usable();
            }
        }

        function getImpalaStatus() {
            if ($rootScope.appConfig.communityEdition) {
                return notLicensedCE();
            } else {
                if (!$rootScope.appConfig.impalaEnabled) {
                    return notConfigured("Impala not configured on this DSS instance");
                }
                if (!$rootScope.addLicInfo.impalaLicensed) {
                    return notLicensedEE();
                }
                return usable();
            }
        }

        function getPigStatus() {
            if ($rootScope.appConfig.communityEdition) {
                return notLicensedCE();
            } else {
                if (!$rootScope.appConfig.pigEnabled) {
                    return notConfigured("Pig not configured on this DSS instance");
                }
                if (!$rootScope.addLicInfo.pigLicensed) {
                    return notLicensedEE();
                }
                return usable();
            }
        }

        function getSparkStatus() {
            if ($rootScope.appConfig.communityEdition) {
                return notLicensedCE();
            } else {
                if (!$rootScope.appConfig.sparkEnabled) {
                    return notConfigured("Spark not configured on this DSS instance");
                }
                if (!$rootScope.addLicInfo.sparkLicensed) {
                    return notLicensedEE();
                }
                return usable();
            }
        }

        var svc = {
            /**
             * Returns [
             *   { isSection : false, ... }
             *   { isSection : true, id, label: icon: item : []}}}
             * ]
             */
            getAllRecipesBySection: function (scope) {
                var ret = [];

                ret.push({
                    isSection: true,
                    id: "visual",
                    label: "Visual",
                    icon: "icon-eye", // TODO
                    items: [
                        {
                            type: "shaker", label: "Data preparation",
                            fn: function () {
                                scope.showCreateShakerModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "sync", label: "Sync",
                            fn: function () {
                                scope.showCreateSyncModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "filter", label: "Sample / Filter",
                            fn: function () {
                                scope.showCreateSamplingModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "grouping", label: "Group",
                            fn: function () {
                                scope.showCreateGroupingModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type : "distinct", label : "Distinct",
                            fn : function(){ scope.showCreateDistinctModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId)); }
                        },
                        {
                            type: "window", label: "Window",
                            fn: function () {
                                scope.showCreateWindowRecipeModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "join", label: "Join",
                            fn: function () {
                                scope.showCreateJoinModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "fuzzyjoin", label: "Fuzzy join",
                            fn: function () {
                                scope.showCreateFuzzyJoinModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "split", label: "Split",
                            fn: function () {
                                scope.showCreateSplitModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "topn", label : "Top N",
                            fn : function(){ scope.showCreateTopNModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId)); }
                        },
                        {
                            type: "sort", label : "Sort",
                            fn : function(){ scope.showCreateSortModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId)); }
                        },
                        {
                            type: "pivot", label : "Pivot",
                            fn : function(){ scope.showCreatePivotModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId)); }
                        },
                        {
                            type: "vstack", label: "Stack vertically",
                            fn: function () {
                                scope.showCreateVStackModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "merge_folder", label: "Merge folders",
                            fn: function () {
                                scope.showCreateMergeFolderModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "update", label: "Push to Editable",
                            fn: function () {
                                scope.showCreateUpdateModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "export", label: "Export",
                            fn: function () {
                                scope.showCreateExportModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type : "download", label : "Download",
                            fn : function(){ scope.showCreateDownloadModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId)); }
                        }
                    ]
                });

                var pyScientistStatus = usable();
                if (!scope.appConfig.userProfile.mayPython) {
                    pyScientistStatus = notDataScientist();
                }
                var rScientistStatus = usable();
                if (!scope.appConfig.userProfile.mayR) {
                    rScientistStatus = notDataScientist();
                }
                var jlScientistStatus = usable();
                if (!scope.appConfig.userProfile.mayJulia) {
                    jlScientistStatus = notDataScientist();
                }

                var scalaScientistStatus = usable();
                if (!scope.appConfig.userProfile.mayScala) {
                    scalaScientistStatus = notDataScientist();
                }

                var unsafeStatus = usable();
                if (!$rootScope.appConfig.globalPermissions || !$rootScope.appConfig.globalPermissions.mayWriteUnsafeCode) {
                    unsafeStatus = noUnsafeCode();
                }
                var safeStatus = usable();
                if ($rootScope.appConfig.impersonationEnabled && (!$rootScope.appConfig.globalPermissions || !$rootScope.appConfig.globalPermissions.mayWriteSafeCode)) {
                    safeStatus = noSafeCode();
                }

                var safeCodeStatus = $rootScope.appConfig.impersonationEnabled ? safeStatus : unsafeStatus;

                const codeRecipeItems = []
                codeRecipeItems.push({
                    type: "python",
                    label: "Python",
                    disabled: !pyScientistStatus.iconEnabled || !safeCodeStatus.iconEnabled,
                    reason: pyScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason,
                    fn: function () {
                        scope.showCreateCodeBasedModal("python", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                    }
                });
                if($rootScope.appConfig.uiCustomization.showR) {
                    codeRecipeItems.push({
                        type: "r",
                        label: "R",
                        disabled: !rScientistStatus.iconEnabled || !safeCodeStatus.iconEnabled || !$rootScope.appConfig.rEnabled,
                        reason: (rScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason) ? (rScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason) : ( $rootScope.appConfig.rEnabled ? null : "R not configured on your DSS instance"),
                        fn: function () {
                            scope.showCreateCodeBasedModal("r", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                        }
                    });
                }
                if($rootScope.featureFlagEnabled('julia')) {
                    codeRecipeItems.push({
                        type: "julia",
                        label: "Julia",
                        disabled: !jlScientistStatus.iconEnabled || !safeCodeStatus.iconEnabled,
                        reason: (jlScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason) ? (jlScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason) : ( $rootScope.featureFlagEnabled('julia') ? null : "Julia plugin not installed"),
                        fn: function () {
                            scope.showCreateCodeBasedModal("julia", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                        }
                    });
                }
                
                codeRecipeItems.push({
                    type: "sql_query",
                    label: "SQL",
                    fn: function () {
                        scope.showSQLRecipeModal(undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                    }
                });
                codeRecipeItems.push({
                    type: "shell",
                    label: "Shell",
                    disabled: !pyScientistStatus.iconEnabled || !safeCodeStatus.iconEnabled,
                    reason: pyScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason,
                    fn: function () {
                        scope.showCreateCodeBasedModal("shell", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                    }
                })

                ret.push({
                    isSection: true,
                    id: "code",
                    label: "Code",
                    icon: "icon-code",
                    items: codeRecipeItems,
                });

                var sparkStatus = getSparkStatus();
                var hiveStatus = getHiveStatus();
                var impalaStatus = getImpalaStatus();
                var pigStatus = getPigStatus();

                const hadoopSparkRecipeItems = [];
                if($rootScope.appConfig.uiCustomization.showTraditionalHadoop) {
                    hadoopSparkRecipeItems.push({
                        type: "hive",
                        icon: "icon-code_hive_recipe",
                        label: "Hive",
                        disabled: !hiveStatus.iconEnabled,
                        reason: hiveStatus.iconDisabledReason,
                        fn: function () {
                            if (hiveStatus.enableStatus == "OK") {
                                scope.showCreateCodeBasedModal("hive", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                            } else if (hiveStatus.enableStatus == "NOT_LICENSED_CE") {
                                scope.showCERestrictionModal("Hadoop / Hive is")
                            }
                        }
                    });

                    hadoopSparkRecipeItems.push({
                        type: "impala",
                        icon: "icon-code_impala_recipe",
                        label: "Impala",
                        disabled: !impalaStatus.iconEnabled,
                        reason: impalaStatus.iconDisabledReason,
                        fn: function () {
                            if (impalaStatus.enableStatus == "OK") {
                                scope.showCreateCodeBasedModal("impala", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                            } else if (impalaStatus.enableStatus == "NOT_LICENSED_CE") {
                                scope.showCERestrictionModal("Hadoop / Impala is")
                            }
                        }
                    });

                    hadoopSparkRecipeItems.push({
                        type: "pig",
                        label: "Pig",
                        disabled: !pigStatus.iconEnabled,
                        reason: pigStatus.iconDisabledReason,
                        fn: function () {
                            if (pigStatus.enableStatus == "OK") {
                                scope.showCreateCodeBasedModal("pig", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                            } else if (pigStatus.enableStatus == "NOT_LICENSED_CE") {
                                scope.showCERestrictionModal("Hadoop / Pig is")
                            }
                        }
                    });

                    hadoopSparkRecipeItems.push({divider: true});
                }

                hadoopSparkRecipeItems.push({
                    type: "spark_sql_query",
                    label: "Spark SQL",
                    disabled: !sparkStatus.iconEnabled,
                    reason: sparkStatus.iconDisabledReason,
                    fn: function () {
                        if (sparkStatus.enableStatus == "OK") {
                            scope.showCreateCodeBasedModal("spark_sql_query", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                        } else if (sparkStatus.enableStatus == "NOT_LICENSED_EE") {
                            scope.showSparkNotLicensedModal();
                        } else if (sparkStatus.enableStatus == "NOT_LICENSED_CE") {
                            scope.showCERestrictionModal("Spark is")
                        }
                    }
                });

                if($rootScope.appConfig.uiCustomization.showScala) {
                    hadoopSparkRecipeItems.push({
                        type: "spark_scala",
                        label: "Spark Scala",
                        disabled: !sparkStatus.iconEnabled || !scalaScientistStatus.iconEnabled || !safeCodeStatus.iconEnabled,
                        reason: sparkStatus.iconDisabledReason || scalaScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason,
                        fn: function () {
                            if (sparkStatus.enableStatus == "OK") {
                                scope.showCreateCodeBasedModal("spark_scala", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                            } else if (sparkStatus.enableStatus == "NOT_LICENSED_EE") {
                                scope.showSparkNotLicensedModal();
                            } else if (sparkStatus.enableStatus == "NOT_LICENSED_CE") {
                                scope.showCERestrictionModal("Spark is")
                            }
                        }
                    });
                }

                hadoopSparkRecipeItems.push({
                    type: "pyspark",
                    label: "PySpark",
                    disabled: !sparkStatus.iconEnabled || !pyScientistStatus.iconEnabled || !safeCodeStatus.iconEnabled,
                    reason: sparkStatus.iconDisabledReason || pyScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason,
                    fn: function () {
                        if (sparkStatus.enableStatus == "OK") {
                            scope.showCreateCodeBasedModal("pyspark", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                        } else if (sparkStatus.enableStatus == "NOT_LICENSED_EE") {
                            scope.showSparkNotLicensedModal();
                        } else if (sparkStatus.enableStatus == "NOT_LICENSED_CE") {
                            scope.showCERestrictionModal("Spark is")
                        }
                    }
                });

                if($rootScope.appConfig.uiCustomization.showR) {
                    hadoopSparkRecipeItems.push({
                        type: "sparkr",
                        label: "SparkR",
                        disabled: !sparkStatus.iconEnabled || !rScientistStatus.iconEnabled || !safeCodeStatus.iconEnabled,
                        reason: sparkStatus.iconDisabledReason || rScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason,
                        fn: function () {
                            if (sparkStatus.enableStatus == "OK") {
                                scope.showCreateCodeBasedModal("sparkr", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                            } else if (sparkStatus.enableStatus == "NOT_LICENSED_EE") {
                                scope.showSparkNotLicensedModal();
                            } else if (sparkStatus.enableStatus == "NOT_LICENSED_CE") {
                                scope.showCERestrictionModal("Spark is")
                            }
                        }
                    });
                }

                ret.push({
                    isSection: true,
                    id: "code",
                    label: "Hadoop & Spark",
                    icon: "icon-HDFS",
                    items: hadoopSparkRecipeItems,
                });

                let pluginsByCategory = {};
                let recipeCategories = {};
                const pluginById = $rootScope.appConfig.loadedPlugins.reduce(function(map, obj) {
                    map[obj.id] = obj;
                    return map;
                }, {});

                $rootScope.appConfig.customCodeRecipes.forEach(function (x) {
                    const plugin = pluginById[x.ownerPluginId];
                    if (angular.isUndefined(plugin)) return; // could have been deleted on disk

                    let category = angular.isDefined(plugin.category) ? plugin.category : 'Misc';

                    if (category.toLowerCase() in recipeCategories) {
                        category = recipeCategories[category.toLowerCase()];
                    } else {
                        recipeCategories[category.toLowerCase()] = category = $filter('capitalize')(category);
                    }

                    pluginsByCategory[category] = pluginsByCategory[category] || {};
                    pluginsByCategory[category][plugin.id] = {
                        label: plugin.label ? plugin.label : plugin.id,
                        icon: plugin.icon,
                        fn: () => scope.showCreateRecipeFromPlugin(plugin.id, null, scope.getRelevantZoneId(scope.$stateParams.zoneId))
                    }
                });

                let appsByCategory = {};
                let appCategories = {};
                $rootScope.appConfig.appRecipes.forEach(function (x) {
                    let category = x.category || "Applications";
                    if (category.toLowerCase() in appCategories) {
                        category = appCategories[category.toLowerCase()];
                    } else {
                        appCategories[category.toLowerCase()] = category = $filter('capitalize')(category);
                    }

                    appsByCategory[category] = appsByCategory[category] || {};
                    appsByCategory[category][x.recipeType] = {
                        label: x.label,
                        icon: x.icon,
                        fn: () => scope.showCreateAppRecipeModal(x.recipeType)
                    }
                });

                let displayedAppSections = [];

                $.each(appsByCategory, function (category, apps) {
                    let appItems = Object.values(apps);
                    appItems.sort(function(a, b) { return a.label.toLowerCase().localeCompare(b.label.toLowerCase()); });

                    displayedAppSections.push({
                        isSection: true,
                        id: "tag_" + category,
                        icon: mostFrequentIcon(appItems),
                        label: category,
                        items: appItems
                    });
                });

                displayedAppSections.sort(function(a, b) { return a.label.toLowerCase().localeCompare(b.label.toLowerCase()); });
                if (displayedAppSections.length > 0) {
                    ret.push({divider: true});
                    Array.prototype.push.apply(ret, displayedAppSections);
                }

                ret.push({divider: true});

                let displayedPluginSections = [];
                let miscPlugins = null;

                $.each(pluginsByCategory, function (category, plugins) {
                    let pluginItems = Object.values(plugins);
                    pluginItems.sort(function(a, b) { return a.label.toLowerCase().localeCompare(b.label.toLowerCase()); });

                    if (category === 'Misc') {
                        miscPlugins = pluginItems;
                    } else {
                        displayedPluginSections.push({
                            isSection: true,
                            id: "tag_" + category,
                            icon: mostFrequentIcon(pluginItems),
                            label: category,
                            items: pluginItems
                        });
                    }
                });

                displayedPluginSections.sort(function(a, b) { return a.label.toLowerCase().localeCompare(b.label.toLowerCase()); });
                Array.prototype.push.apply(ret, displayedPluginSections);

                if (miscPlugins) {
                    Array.prototype.push.apply(ret, miscPlugins);
                }

                var f = $filter("recipeTypeToIcon");

                ret.forEach(function (a1) {
                    if (a1.isSection) {
                        a1.items.forEach(function (a2) {
                            if (!a2.icon) a2.icon = f(a2.type);
                        });

                    } else {
                        if (!a1.icon) a1.icon = f(a1.type);
                    }
                });
                return ret;
            },

            /**
             * Returns [
             *   { isSection : false, type, label, icon, fn?, licenseStatus, disabled?, em? }
             *   { isSection : true, id, label: icon: item : []}
             * ]
             */
            getAllDatasetsBySection: function (scope) {
                var ret = [];

                ret.push({
                    type: 'search_and_import', label: 'Search and import\u2026', icon: 'icon-mail-forward',
                    em: true, fn: () => scope.searchAndImport(scope.getRelevantZoneId($stateParams.zoneId))
                });

                if($rootScope.appConfig.alationSettings.enabled) {
                    ret.push({
                        type: 'import_from_alation', label: 'Import from Alation\u2026', icon: 'icon-book',
                        em: true, fn: () => scope.importFromAlation()
                    });
                }
                ret.push({ divider: true });

                // type, label, disabled, reason, icon
                ret.push({
                    type: "UploadedFiles", label: "Upload your files"
                });
                ret.push({
                    type: "Filesystem", label: "Filesystem"
                });

                ret.push({
                    isSection : true,
                    id : "network",
                    label : "Network",
                    icon : "icon-FTP-HTTP-SSH",
                    items : [
                        { type: "FTP", label: " FTP" },
                        { type: "SFTP", label: " SFTP" },
                        { type: "SCP", label: " SCP" },
                        { type: "HTTP", label: "HTTP" },
                        { type: "CachedHTTP", label: "HTTP (with cache)", fn: () => scope.showCreateUrlDownloadToFolderDataset($stateParams.projectKey)}
                    ]
                });

                ret.push({
                    type: "HDFS", label: "HDFS",
                    disabled: !$rootScope.appConfig.hadoopEnabled,
                    reason: $rootScope.appConfig.hadoopEnabled ? null : "Hadoop not configured on your DSS instance"
                });

                ret.push({divider: true});

                ret.push({
                    type: "hiveserver2", label: "Hive",
                    disabled: !$rootScope.appConfig.hadoopEnabled,
                    reason: $rootScope.appConfig.hadoopEnabled ? null : "Hadoop not configured on your DSS instance"
                });

                var sql = {
                    isSection: true,
                    id: "sql",
                    label: "SQL databases",
                    icon: "icon-database",
                    items: [
                        {
                            type: "Snowflake", label: "Snowflake", section: "SQL Databases"
                        },
                        {
                            type: "Redshift", label: "Amazon Redshift", section: "SQL Databases"
                        },
                        {
                            type: "Synapse", label: "Azure Synapse", section: "SQL Databases"
                        },
                        {
                            type: "BigQuery", label: "Google BigQuery", section: "SQL Databases"
                        },
                        {
                            type: "PostgreSQL", label: "PostgreSQL", section: "SQL Databases"
                        },
                        {
                            type: "MySQL", label: "MySQL", section: "SQL Databases"
                        },
                        {
                            type: "SQLServer", label: "MS SQL Server", section: "SQL Databases"
                        },
                        {
                            type: "Oracle", label: "Oracle", section: "SQL Databases"
                        },
                        {
                            type: "Teradata", label: "Teradata", section: "SQL Databases"
                        },
                        {
                            type: "Greenplum", label: "Greenplum", section: "SQL Databases"
                        },
                        {
                            type: "Vertica", label: "Vertica", section: "SQL Databases"
                        },
                        {
                            type: "Athena", label: "Athena", section: "SQL Databases"
                        },
                        {
                            type: "SAPHANA", label: "SAP HANA", section: "SQL Databases"
                        },
                        {
                            type: "Netezza", label: "IBM Netezza", section: "SQL Databases"
                        }
                    ]
                };

                if ($rootScope.featureFlagEnabled("kdbplus")) {
                    sql.items.push({
                        type: "KDBPlus", label: "KDB+", section: "SQL Databases"
                    })
                }

                sql.items.push({
                    type: "JDBC", label: "Other SQL databases", section: "SQL Databases"
                });
                ret.push(sql);

                ret.push({
                    isSection: true,
                    id: "cloud",
                    label: "Cloud storages & Social",
                    icon: "icon-database",
                    items: [
                        {
                            type: "S3", label: "Amazon S3"
                        },
                        {
                            type: "Azure", label: "Azure Blob Storage"
                        },
                        {
                            type: "GCS", label: "Google Cloud Storage"
                        },
                        {
                            type: "Twitter", label: "Twitter",
                            disabled: !$rootScope.appConfig.twitterEnabled,
                            reason: $rootScope.appConfig.twitterEnabled ? null : "Twitter not configured on your DSS instance"
                        }
                    ]
                })

                let noSQLSection = {
                    isSection: true,
                    id: "nosql",
                    label: "NoSQL",
                    icon: "icon-database",
                    items: [
                        {
                            type: "MongoDB", label: "MongoDB"
                        }, {
                            type: "Cassandra", label: "Cassandra"
                        }, {
                            type: "ElasticSearch", label: "ElasticSearch"
                        }
                    ]
                };
                if ($rootScope.featureFlagEnabled('DynamoDB')) {
                    noSQLSection.items.push({
                        type: "DynamoDB", label: "DynamoDB"
                    });
                }
                ret.push(noSQLSection);

                ret.push({divider: true});
                ret.push({
                    type: "Inline", label: "Editable"
                });
                ret.push({
                    type: "managed_folder", label: "Folder", icon: "icon-box", fn: scope.newManagedFolder
                });
                if ($rootScope.featureFlagEnabled('model_evaluation_stores')) {
                    ret.push({
                        type: "model_evaluation_store", label: "Evaluation store", icon: "icon-model-evaluation-store", fn: scope.newModelEvaluationStore
                    });
                }
                
                ret.push({
                    isSection: true,
                    id: "internal",
                    label: "Internal",
                    icon: "icon-tasks",
                    items: [
                        {
                            type: "JobsDB", label: "Metrics"
                        },
                        {
                            type: "StatsDB", label: "Internal stats"
                        },
                        {
                            type: "FilesInFolder", label: "Files from folder"
                        },
                        {
                            type: "managed", label: "Managed dataset", icon: "icon-beaker", fn: scope.newManagedDataset,
                        },
                        {
                            type: "ForeignDataset", label: "Dataset from another project", icon: "icon-dku-share", fn: () => $state.go('projects.project.catalog.items', {scope: ['dss'], _type: ['dataset']})
                        }
                    ]
                });


                let pluginsByCategory = {};
                let recipeCategories = {};
                const pluginById = $rootScope.appConfig.loadedPlugins.reduce(function (map, obj) {
                    map[obj.id] = obj;
                    return map;
                }, {});

                const orderPluginInCategory = function(dataset, getPluginType) {
                    const plugin = pluginById[dataset.ownerPluginId];
                    if (angular.isUndefined(plugin)) return; // could have been deleted on disk

                    let category = angular.isDefined(plugin.category) ? plugin.category : 'Misc';

                    if (category.toLowerCase() in recipeCategories) {
                        category = recipeCategories[category.toLowerCase()];
                    } else {
                        recipeCategories[category.toLowerCase()] = category = $filter('capitalize')(category);
                    }

                    pluginsByCategory[category] = pluginsByCategory[category] || {};
                    pluginsByCategory[category][plugin.id] = {
                        pluginId: dataset.ownerPluginId,
                        type : getPluginType(dataset),
                        label : plugin.label ? plugin.label : plugin.id,
                        icon : plugin.icon,
                        fn: () => scope.showCreateDatasetFromPlugin(dataset.ownerPluginId)
                    }
                };

                $rootScope.appConfig.customFSProviders.forEach(plugin => orderPluginInCategory(plugin, x => x.fsProviderType));
                $rootScope.appConfig.customDatasets.forEach(plugin => orderPluginInCategory(plugin, x => x.datasetType));

                let displayedPluginSections = [];
                let miscPlugins = null;

                $.each(pluginsByCategory, function (category, plugins) {
                    let pluginItems = Object.values(plugins);
                    pluginItems.sort(function(a, b) { return a.label.toLowerCase().localeCompare(b.label.toLowerCase()); });

                    if (category === 'Misc') {
                        miscPlugins = pluginItems;
                    } else {
                        displayedPluginSections.push({
                            isSection: true,
                            id: "tag_" + category,
                            icon: mostFrequentIcon(pluginItems),
                            label: category,
                            items: pluginItems
                        });
                    }
                });

                ret.push({divider: true});
                ret.push({header: true, label: 'Plugins'});

                displayedPluginSections.sort(function(a, b) { return a.label.toLowerCase().localeCompare(b.label.toLowerCase()); });
                Array.prototype.push.apply(ret, displayedPluginSections);

                if (miscPlugins) {
                    Array.prototype.push.apply(ret, miscPlugins);
                }

                var getIconFromType = $filter("datasetTypeToIcon");


                /**
                 * Enrich the info with items icons, licence status and filter hidden datasets.
                 */
                const postTreat = (items, computeStatus) => {
                    let haveItemBeforeCurrent = false;
                    return items
                        .map((item) => {
                            if(item.isSection) {
                                item.items = postTreat(item.items, computeStatus);
                                return item;
                            } else {
                                if (item.type) {
                                    item.licenseStatus = svc.getDatasetLicenseStatus(item.type);
                                    if (item.licenseStatus.status === 'NOT_LICENSED_EE') {
                                        item.disabled = true;
                                        item.reason = 'This dataset type is not licensed';
                                    }
                                }
                                if (!item.icon) item.icon = getIconFromType(item.type);
                                return item;
                            }
                        })
                        .filter(item => !( // remove hidden dataset type and empty sections (plugins are always shown)
                            item.isSection && item.items.length === 0 ||
                            item.type && item.pluginId === undefined && computeStatus(item.type) !== uiCustomizationService.datasetTypeStatus.SHOW
                        ))
                        .filter((item, index, arr) => { // remove useless dividers
                            if(item.divider && (
                                !haveItemBeforeCurrent ||                   // remove divider if there is not at least one item before
                                index === arr.length - 1 ||                 // remove divider if in last position
                                arr[index + 1] && arr[index + 1].divider    // remove divider if following item is also a divider
                            )) return false;
                            haveItemBeforeCurrent = true;
                            return true;
                        });
                }

                return uiCustomizationService.getComputeDatasetTypesStatus(scope, $stateParams.projectKey)
                    .then((computeStatus) => postTreat(ret, computeStatus));
            },

            /**
             * Raw unfiltered version of getAllDatasetsByTiles, used internally, but also for options.
             * Neat trick: calling this function with and undefined scope will work if you only want the list, but some clickCallback will be broken.
             * @returns {{title: string, icon: string, types: {type: string, label: string, disabledReason?:string}[]}[]} the list of dataset options, by tiles.
             */
            getAllDatasetByTilesNoFilter: function (scope) {
                const hadoopDisabledMessage = $rootScope.appConfig.hadoopEnabled ? undefined : `Hadoop connection is not enabled on your ${$rootScope.wl.productShortName} instance.` + ($rootScope.isDSSAdmin() ? '' : ` Please contact your administrator`);

                const tiles = [{
                    title: 'Files',
                    icon: 'icon-Filesystem',
                    types: [
                        {type: 'UploadedFiles', label: 'Upload your files'},
                        {type: 'Filesystem'},
                    ]
                }, {
                    title: 'Hadoop',
                    icon: 'icon-elephant',
                    types: [
                        {type: 'HDFS', label: 'HDFS', disabledReason: hadoopDisabledMessage},
                        {type: 'hiveserver2', label: 'Hive', disabledReason: hadoopDisabledMessage},
                    ],
                }, {
                    title: 'SQL',
                    icon: 'icon-sql',
                    types: [
                        {type: 'Snowflake'},
                        {type: 'Redshift'},
                        {type: 'Synapse'},
                        {type: 'BigQuery'},
                        {type: 'PostgreSQL'},
                        {type: 'MySQL'},
                        {type: 'SQLServer'},
                        {type: 'Oracle'},
                        {type: 'Teradata'},
                        {type: 'Greenplum'},
                        {type: 'Vertica'},
                        {type: 'Athena'},
                        {type: 'SAPHANA'},
                        {type: 'Netezza'},
                        {type: 'JDBC', label:'Other SQL'},
                    ]
                }, {
                    title: 'Cloud Storages',
                    icon: 'icon-cloud',
                    types: [
                        {type: 'S3'},
                        {type: 'Azure'},
                        {type: 'GCS'},
                    ],
                    types2: [
                        {type: 'FTP'},
                        {type: 'SFTP'},
                        {type: 'SCP'},
                        {type: 'HTTP'},
                        {type: 'CachedHTTP', clickCallback: () => scope.showCreateUrlDownloadToFolderDataset($stateParams.projectKey)},
                    ]
                }, {
                    title: 'NoSQL',
                    icon: 'icon-signal',
                    types: [
                        {type: 'MongoDB'},
                        {type: 'Cassandra'},
                        {type: 'ElasticSearch'},
                        $rootScope.featureFlagEnabled('DynamoDB') ? {type: 'DynamoDB'} : undefined,
                    ]
                }, {
                    title: 'Social',
                    icon: 'icon-twitter',
                    types: [
                        {type: 'Twitter'},
                    ]
                }, {
                    title: $rootScope.wl.productShortName,
                    icon: 'icon-beaker',
                    types: [
                        {type: 'FilesInFolder', label: 'Files in folder'},
                        {type: 'managed', label: 'Managed dataset', clickCallback: () => scope.newManagedDataset()},
                        {type: 'managed_folder', label:'Folder', clickCallback: () => scope.newManagedFolder()},
                        $rootScope.featureFlagEnabled('model_evaluation_stores') ? {type: 'model_evaluation_store', label: 'Evaluation store', clickCallback: () => scope.newModelEvaluationStore()} : undefined,
                        {type: 'JobsDB'},
                        {type: 'StatsDB'},
                        {type: 'Inline'},
                    ]
                }, {
                    title: 'Import existing',
                    icon: 'icon-cloud-download',
                    types: [
                        {type: 'ForeignDataset', label: 'Dataset from another project', clickCallback: () => $state.go('projects.project.catalog.items', {scope: ['dss'], _type: ['dataset']})},
                        {type: 'connection_explorer', label: 'Choose connection to import from', clickCallback: () => $state.go('projects.project.catalog.connectionexplorer')},
                        $rootScope.appConfig.alationSettings.enabled ? {type: 'import_from_alation', label: 'Import from Alation...', clickCallback: () => scope.importFromAlation()} : undefined,
                        {type: 'import_from_catalog', label:'Import from catalog', clickCallback: () => $state.go('projects.project.catalog.items')},
                    ]
                }];

                return tiles;
            },

            /**
             * Similar to getAllDatasetsBySection, but order according to the new dataset page tiles
             * Used by the new dataset page
             * 
             * returns Tile[]
             * 
             * Tile = {
             *  title: string,
             *  icon: string,
             *  types: DatasetType[] (8 max)
             *  types2: DatasetType[] (second column)
             * }
             * 
             * DatasetType = {
             *  type: string,
             *  label: string,
             *  clickCallback: function
             *  status: 'OK' | 'NOT_LICENCIED_CD' | 'NOT_LICENCIED_EE' | 'NO_CONNECTION' | 'HIDDEN'
             *  disabledReason?: string  if status='NO_CONNECTION', overrides the default tooltip message
             * }
             * 
             */
            getAllDatasetsByTiles: function (scope) {
                return uiCustomizationService.getComputeDatasetTypesStatus(scope, $stateParams.projectKey).then((computeStatus) => {
                    const tiles = svc.getAllDatasetByTilesNoFilter(scope);

                    /**
                     * Finds out how the dataset should be displayed in the new dataset page by merging the uiCustomization effect and the license status
                     * @param {string} type 
                     * @returns {string} 'OK', 'HIDDEN', 'NO_CONNECTION', 'NOT_LICENSED_EE' or 'NOT_LICENSED_CE'
                     */
                    const computeStatusWithLicense = (datasetType) => {
                        const uiCustomizationStatus = computeStatus(datasetType.type);
                        const licenseStatus = svc.getDatasetLicenseStatus(datasetType.type).status;

                        if(uiCustomizationStatus === uiCustomizationService.datasetTypeStatus.HIDE) {
                            return uiCustomizationStatus;
                        } else if(licenseStatus !== 'OK') {
                            return licenseStatus;
                        } else if(datasetType.disabledReason !== undefined) {
                            // when Hadoop is disabled, Hive & HDFS should appear disabled with a specific message. We reuse the NO_CONNECTION status
                            return uiCustomizationService.datasetTypeStatus.NO_CONNECTION;
                        } else {
                            return uiCustomizationStatus;
                        }
                    }
                
                    const datasetTypeToName = $filter('datasetTypeToName');
                    const enrichAndFilterTypes = (types) => types
                        .filter((t) => t) // remove undefined (feature flags not enabled)
                        .map((datasetType) => ({
                            ...datasetType,
                            label: datasetType.label || datasetTypeToName(datasetType.type),
                            status: computeStatusWithLicense(datasetType),
                        }))
                        .filter((dt) => dt.status !== uiCustomizationService.datasetTypeStatus.HIDE);
                    
                    const enrichAndFilterTile = (tile) => ({
                        ...tile,
                        types: enrichAndFilterTypes(tile.types),
                        types2: tile.types2 && enrichAndFilterTypes(tile.types2),
                    });

                    return tiles
                        .map(tile => {
                            const tmp = enrichAndFilterTile(tile);
                            if(tmp.types.length > 8) tmp.types2 = tmp.types.splice(8);
                            if(tmp.types2 && tmp.types.length === 0) {
                                tmp.types = tmp.types2; // if first column is empty but 2nd is defined, move the second column in first place
                                tmp.types2 = undefined;
                            }
                            return tmp;
                        })
                        .filter(tile => tile.types.length > 0); // remove empty tiles
                    
                })

            },

            /**
             * Returns [
             *   { isSection : false, ... }
             *   { isSection : true, id, label: icon: item : []}}}
             * ]
             */
            getAllStreamingEndpointsBySection: function (scope) {
                var ret = [];

                // type, label, disabled, reason, icon
                ret.push({
                    type: "kafka", label: "Kafka", icon: "icon-kafka",
                    fn: () => scope.showCreateStreamingEndpointModal("kafka")
                });
                ret.push({
                    type: "sqs", label: "SQS", icon: "icon-sqs",
                    fn: () => scope.showCreateStreamingEndpointModal("sqs")
                });
                ret.push({
                    label: "HTTP Server-Sent-Events", type:"httpsse", icon: "icon-httpsse",
                    fn: () => scope.showCreateStreamingEndpointModal("httpsse")
                });
                if ($rootScope.featureFlagEnabled('kdbplus')) {
                    ret.push({
                        label: "KDB+Tick ticker plant", type:"kdbplustick", icon: "icon-httpsse",
                        fn: () => scope.showCreateStreamingEndpointModal("kdbplustick")
                    });
                }
                return ret;
            },

            getStreamingRecipesBySection: function(scope) {
                var pyScientistStatus = usable();
                if (!$rootScope.appConfig.userProfile.mayPython) {
                    pyScientistStatus = notDataScientist();
                }

                var unsafeStatus = usable();
                if (!$rootScope.appConfig.globalPermissions || !$rootScope.appConfig.globalPermissions.mayWriteUnsafeCode) {
                    unsafeStatus = noUnsafeCode();
                }
                var safeStatus = usable();
                if ($rootScope.appConfig.impersonationEnabled && (!$rootScope.appConfig.globalPermissions || !$rootScope.appConfig.globalPermissions.mayWriteSafeCode)) {
                    safeStatus = noSafeCode();
                }
                
                var safeCodeStatus = $rootScope.appConfig.impersonationEnabled ? safeStatus : unsafeStatus;

                var ret = [
                        {
                            type: "cpython",
                            label: "Python (streaming)",
                            icon: "icon-continuous_python_recipe",
                            disabled: !pyScientistStatus.iconEnabled || !safeCodeStatus.iconEnabled,
                            reason: pyScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason,
                            fn: function () {
                                scope.showCreateCodeBasedModal("cpython", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "ksql",
                            label: "KSQL (streaming)",
                            icon: "icon-continuous_ksql_recipe",
                            disabled: !pyScientistStatus.iconEnabled || !safeCodeStatus.iconEnabled,
                            reason: pyScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason,
                            fn: function () {
                                scope.showCreateCodeBasedModal("ksql", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                        {
                            type: "csync",
                            label: "CSync (streaming)",
                            icon: 'icon-continuous_sync_recipe',
                            fn: function () {
                                scope.showCreateCodeBasedModal("csync", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                            }
                        },
                    ];
                
                if($rootScope.appConfig.uiCustomization.showScala) {
                    ret.push(                        {
                        type: "streaming_spark_scala",
                        label: "Spark Scala (streaming)",
                        icon: "icon-continuous_spark_scala_recipe",
                        disabled: !pyScientistStatus.iconEnabled || !safeCodeStatus.iconEnabled,
                        reason: pyScientistStatus.iconDisabledReason || safeCodeStatus.iconDisabledReason,
                        fn: function () {
                            scope.showCreateCodeBasedModal("streaming_spark_scala", undefined, scope.getRelevantZoneId(scope.$stateParams.zoneId));
                        }
                    });
                }
                return ret;
            },

            getDatasetLicenseStatus: function (type) {
                /* !! Make sure this is synchronized with the backend !! */
                if (['managed_folder', 'managed', 'ForeignDataset', 'import_from_alation', 'search_and_import', 'model_evaluation_store', 'connection_explorer', 'import_from_catalog'].includes(type)) {
                    return {
                        status: "OK"
                    };
                }
                /* Always allowed */
                const isPluginDataset = ['CustomPython_', 'CustomJava_', 'fsprovider_']
                    .some((it) => type.startsWith(it));

                if (isPluginDataset) {
                    return {
                        status: "OK",
                    };
                }

                // Core minimum for DSS to work properly :)
                if (["Filesystem", "UploadedFiles", "Inline", "FilesInFolder"].indexOf(type) >= 0) {
                    return {
                        status: "OK"
                    };
                }
                // Always included
                if (["MySQL", "GCS", "PostgreSQL", "S3", "Azure", "FTP", "SFTP", "SCP", "HTTP", "CachedHTTP"].indexOf(type) >= 0) {
                    return {
                        status: "OK"
                    };
                }
                // Nothing else in CE
                if ($rootScope.appConfig.communityEdition) {
                    return {
                        status: "NOT_LICENSED_CE"
                    };
                }
                var adt = $rootScope.appConfig.licensedFeatures.allowedDatasetTypes;
                if (adt != null && adt.length > 0) {
                    if (adt.indexOf(type) < 0) {
                        return {status: "NOT_LICENSED_EE"};
                    } else {
                        return {status: "OK"};
                    }
                } else {
                    // All allowed
                    return {
                        status: "OK"
                    }
                }
            },

            getAllStatusForDataset: function (dataset) {
                Assert.trueish(dataset, 'no dataset');
                Assert.trueish(dataset.type, 'no dataset type');

                const allRecipeTypes = $.map(RecipeDescService.getDescriptors(), (desc, type) => type).filter(type => !type.startsWith('Custom') && !type.startsWith('App_'));
                const allThings = ["sql", "hive", "impala", "pig", "sql99"];

                var ret = {recipes: {}, things: {}};
                allRecipeTypes.forEach(function (type) {
                    ret.recipes[type] = svc.recipeMaybePossibleFromDataset(dataset, type);
                });
                allThings.forEach(function (type) {
                    ret.things[type] = svc.specialThingMaybePossibleFromDataset(dataset, type);
                });

                return ret;
            },

            getAllStatusForStreamingEndpoint: function (streamingEndpoint) {
                Assert.trueish(streamingEndpoint, 'no streaming endpoint');
                Assert.trueish(streamingEndpoint.type, 'no streaming endpoint type');

                const allRecipeTypes = $.map(RecipeDescService.getDescriptors(), (desc, type) => type).filter(type => !type.startsWith('Custom'));
                const allThings = ["sql", "hive", "impala", "pig", "sql99"];

                var ret = {recipes: {}, things: {}};
                allRecipeTypes.forEach(function (type) {
                    ret.recipes[type] = svc.recipeMaybePossibleFromStreamingEndpoint(streamingEndpoint, type);
                });
                allThings.forEach(function (type) {
                    ret.things[type] = svc.specialThingMaybePossibleFromStreamingEndpoint(streamingEndpoint, type);
                });

                return ret;
            },

            /**
             * Returns whether this recipe *looks* possible from this dataset.
             * Note that additional restrictions might apply and must be checked later.
             *
             * Returns { ok : boolean, reason : String (only if !ok)}
             */
            recipeMaybePossibleFromDataset: function (dataset, recipeType) {
                var pyScientistStatus = usable();
                if (!$rootScope.appConfig.userProfile.mayPython) {
                    pyScientistStatus = notDataScientist();
                }
                var rScientistStatus = usable();
                if (!$rootScope.appConfig.userProfile.mayR) {
                    rScientistStatus = notDataScientist();
                }
                var jlScientistStatus = usable();
                if (!$rootScope.appConfig.userProfile.mayJulia) {
                    jlScientistStatus = notDataScientist();
                }
                var scalaScientistStatus = usable();
                if (!$rootScope.appConfig.userProfile.mayScala) {
                    scalaScientistStatus = notDataScientist();
                }

                var unsafeStatus = usable();
                if (!$rootScope.appConfig.globalPermissions || !$rootScope.appConfig.globalPermissions.mayWriteUnsafeCode) {
                    unsafeStatus = noUnsafeCode();
                }
                var safeStatus = usable();
                if ($rootScope.appConfig.impersonationEnabled && (!$rootScope.appConfig.globalPermissions || !$rootScope.appConfig.globalPermissions.mayWriteSafeCode)) {
                    safeStatus = noSafeCode();
                }

                var safeCodeStatus = $rootScope.appConfig.impersonationEnabled ? safeStatus : unsafeStatus;

                switch (recipeType) {
                    case "hive": {
                        var hiveStatus = getHiveStatus();
                        if (dataset.type != "HDFS" && dataset.type != "hiveserver2") {
                            return nok("Dataset is not on HDFS or Hive");
                        }
                        if (hiveStatus.iconEnabled) return ok(hiveStatus);
                        else return nok(hiveStatus.iconDisabledReason);
                    }
                    case "impala": {
                        var impalaStatus = getImpalaStatus();
                        if (dataset.type != "HDFS" && dataset.type != "hiveserver2") {
                            return nok("Dataset is not on HDFS or Hive");
                        }
                        if (impalaStatus.iconEnabled) return ok(impalaStatus);
                        else return nok(impalaStatus.iconDisabledReason);
                    }
                    case "pig" : {
                        var pigStatus = getPigStatus();
                        if (dataset.type != "HDFS") {
                            return nok("Dataset is not on HDFS");
                        }
                        if (pigStatus.iconEnabled) return ok(pigStatus);
                        else return nok(pigStatus.iconDisabledReason);
                    }
                    case "spark_sql_query":
                        var sparkStatus = getSparkStatus();
                        if (!sparkStatus.iconEnabled) return nok(sparkStatus);
                        else return ok(sparkStatus);

                    case "pyspark":
                        var sparkStatus = getSparkStatus();
                        if (!sparkStatus.iconEnabled) return nok(sparkStatus);
                        if (!pyScientistStatus.iconEnabled) return nok(pyScientistStatus);
                        if (!safeCodeStatus.iconEnabled) return nok(safeCodeStatus);
                        else return ok(sparkStatus)
                    case "sparkr":
                        var sparkStatus = getSparkStatus();
                        if (!sparkStatus.iconEnabled) return nok(sparkStatus);
                        if (!rScientistStatus.iconEnabled) return nok(rScientistStatus);
                        if (!safeCodeStatus.iconEnabled) return nok(safeCodeStatus);
                        else return ok(sparkStatus)
                    case "spark_scala":
                    case "streaming_spark_scala":
                        var sparkStatus = getSparkStatus();
                        if (!sparkStatus.iconEnabled) return nok(sparkStatus);
                        if (!scalaScientistStatus.iconEnabled) return nok(scalaScientistStatus);
                        if (!safeCodeStatus.iconEnabled) return nok(safeCodeStatus);
                        else return ok(sparkStatus);

                    case "sql_query":
                    case "sql_script":
                        if (DatasetUtils.isSQLTable(dataset)) {
                            return ok();
                        } else {
                            return nok({"iconDisabledReason": "Dataset is not a SQL Table"});
                        }
                    case "sql99":
                        if (getSparkStatus().usable) {
                            return ok();
                        }
                        if (dataset.type == "HDFS") {
                            if ($rootScope.appConfig.hiveEnabled) {
                                return ok();
                            } else {
                                return nok("Hive or Spark configuration required");
                            }
                        }
                        if (DatasetUtils.isSQLTable(dataset) && dataset.type != "MySQL") {
                            return ok();
                        }
                        return ok();
                    //return nok("Requires an SQL99-compliant database or Spark");
                    case "python":
                    case "cpython":
                    case "shell":
                        if (!pyScientistStatus.iconEnabled) return nok(pyScientistStatus);
                        if (!safeCodeStatus.iconEnabled) return nok(safeCodeStatus);
                        else return ok();
                    case "r":
                        if (!rScientistStatus.iconEnabled) return nok(rScientistStatus);
                        if (!safeCodeStatus.iconEnabled) return nok(safeCodeStatus);
                        else return ok();
                    case "julia":
                        if (!jlScientistStatus.iconEnabled) return nok(jlScientistStatus);
                        if (!safeCodeStatus.iconEnabled) return nok(safeCodeStatus);
                        else return ok();
                    case 'update':
                    case 'vstack':
                    case 'sort':
                    case 'download':
                    case 'merge_folder':
                    case 'clustering_cluster':
                    case 'prediction_training':
                    case 'evaluation':
                    case 'standalone_evaluation':
                    case 'distinct':
                    case 'clustering_training':
                    case 'grouping':
                    case 'sync':
                    case 'sampling':
                    case 'export':
                    case 'topn':
                    case 'clustering_scoring':
                    case 'join':
                    case 'fuzzyjoin':
                    case 'shaker':
                    case 'window':
                    case 'split':
                    case 'prediction_scoring':
                    case 'pivot':
                        return ok();
                    case "ksql":
                        return nok("Can only run continuously from a streaming endpoint");
                    case 'csync':
                        return nok("Can only sync continuously from a streaming endpoint");
                    default:
                        Logger.error("Recipe usability not implemented for type:", recipeType)
                }
                return ok();
            },

            specialThingMaybePossibleFromDataset: function (dataset, thing) {
                switch (thing) {
                    case "sql":
                        if (DatasetUtils.isSQLTable(dataset)) {
                            return ok();
                        } else {
                            return nok({"iconDisabledReason": "Dataset is not a SQL Table"});
                        }
                    case "hive":
                    case "impala":
                    case "pig":
                        return svc.recipeMaybePossibleFromDataset(dataset, thing);
                    case "sql99":
                        if (getSparkStatus().usable) {
                            return ok(); // In addition a configuration enabling HiveContext is necessary but we don't check it
                        }
                        if (dataset.type == "HDFS") {
                            if ($rootScope.appConfig.hiveEnabled) {
                                return ok();
                            } else {
                                return nok("Hive or Spark configuration required");
                            }
                        }
                        if (DatasetUtils.isSQLTable(dataset) && dataset.type != "MySQL") {
                            return ok();
                        }
                        return ok();
                    //return nok("Requires an SQL99-compliant database or Spark");
                }
                Logger.warn("Unknown thing type", thing);
                return ok();
            },

            /**
             * Returns whether this recipe *looks* possible from this dataset.
             * Note that additional restrictions might apply and must be checked later.
             *
             * Returns { ok : boolean, reason : String (only if !ok)}
             */
            recipeMaybePossibleFromStreamingEndpoint: function (streamingEndpoint, recipeType) {
                var pyScientistStatus = usable();
                if (!$rootScope.appConfig.userProfile.mayPython) {
                    pyScientistStatus = notDataScientist();
                }
                var rScientistStatus = usable();
                if (!$rootScope.appConfig.userProfile.mayR) {
                    rScientistStatus = notDataScientist();
                }
                var jlScientistStatus = usable();
                if (!$rootScope.appConfig.userProfile.mayJulia) {
                    jlScientistStatus = notDataScientist();
                }
                var scalaScientistStatus = usable();
                if (!$rootScope.appConfig.userProfile.mayScala) {
                    scalaScientistStatus = notDataScientist();
                }

                var unsafeStatus = usable();
                if (!$rootScope.appConfig.globalPermissions || !$rootScope.appConfig.globalPermissions.mayWriteUnsafeCode) {
                    unsafeStatus = noUnsafeCode();
                }
                var safeStatus = usable();
                if ($rootScope.appConfig.impersonationEnabled && (!$rootScope.appConfig.globalPermissions || !$rootScope.appConfig.globalPermissions.mayWriteSafeCode)) {
                    safeStatus = noSafeCode();
                }

                var safeCodeStatus = $rootScope.appConfig.impersonationEnabled ? safeStatus : unsafeStatus;

                switch (recipeType) {
                    case "streaming_spark_scala":
                        var sparkStatus = getSparkStatus();
                        if (!sparkStatus.iconEnabled) return nok(sparkStatus);
                        if (!scalaScientistStatus.iconEnabled) return nok(scalaScientistStatus);
                        if (!safeCodeStatus.iconEnabled) return nok(safeCodeStatus);
                        else return ok(sparkStatus);
                    case 'ksql':
                        if (streamingEndpoint.type != 'kafka') return nok("Only applicable to Kafka endpoints");
                        return ok();
                    case 'cpython':
                        return ok();
                    case 'csync':
                        return ok();
                    default:
                        return nok("Only accept continuous recipes");
                }
                return ok(); // NOSONAR: OK to have a fallback instruction
            },

            specialThingMaybePossibleFromStreamingEndpoint: function (streamingEndpoint, thing) {
                Logger.warn("Unknown thing type", thing);
                return ok();
            },

            newPredictionScoringRecipeFromSMID: function (scope, smProjectKey, smId, dsName, zone) {
                scope.zone = zone;
                CreateModalFromTemplate("/templates/savedmodels/new-prediction-scoring-recipe.html", scope, null, function (newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.smId = (smProjectKey === $stateParams.projectKey ? '' : smProjectKey + '.') + smId;
                    if (dsName) {
                        newScope.$broadcast('preselectInputDataset', dsName);
                    }
                });
            },
            newPredictionScoringRecipeFromDataset: function (scope, dsName, zone) {
                scope.zone = zone;
                CreateModalFromTemplate("/templates/savedmodels/new-prediction-scoring-recipe.html", scope, null, function (newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.$broadcast('preselectInputDataset', dsName);
                });
            },
            newEvaluationRecipeFromDataset: function (scope, dsName, zone) {
                scope.zone = zone;
                CreateModalFromTemplate("/templates/savedmodels/new-evaluation-recipe.html", scope, null, function (newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.$broadcast('preselectInputDataset', dsName);
                });
            },
            newEvaluationRecipeFromSMID: function (scope, smProjectKey, smId, dsName, zone) {
                scope.zone = zone;
                CreateModalFromTemplate("/templates/savedmodels/new-evaluation-recipe.html", scope, null, function (newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.recipeParams.smId = (smProjectKey === $stateParams.projectKey ? '' : smProjectKey + '.') + smId;
                    if (dsName) {
                        newScope.$broadcast('preselectInputDataset', dsName);
                    }
                });
            },
            newStandaloneEvaluationRecipeFromDataset: function (scope, dsName, zone) {
                scope.zone = zone;
                CreateModalFromTemplate("/templates/savedmodels/new-standalone-evaluation-recipe.html", scope, null, function (newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.$broadcast('preselectInputDataset', dsName);
                });
            },
            newClusteringScoringRecipeFromSMID: function (scope, smProjectKey, smId, dsName, zone) {
                scope.zone = zone;
                CreateModalFromTemplate("/templates/savedmodels/new-clustering-scoring-recipe.html", scope, null, function (newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.smId = (smProjectKey === $stateParams.projectKey ? '' : smProjectKey + '.') + smId;
                    if (dsName) {
                        newScope.$broadcast('preselectInputDataset', dsName);
                    }
                });
            },

            newClusteringScoringRecipeFromDataset: function (scope, dsName, zone) {
                scope.zone = zone;
                CreateModalFromTemplate("/templates/savedmodels/new-clustering-scoring-recipe.html", scope, null, function (newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.$broadcast('preselectInputDataset', dsName);
                });
            },

            smartNewAnalysis: function smartNewAnalysis(scope, datasetSmartName, forMLTask) {
                CreateModalFromTemplate("/templates/analysis/new-analysis-on-dataset-modal.html", scope, null, function (newScope) {
                    newScope.forMLTask = !!forMLTask;
                    newScope.datasetSmartName = datasetSmartName;
                })
            },

            trainSavedModel: function (scope, id) {
                CreateModalFromTemplate("/templates/savedmodels/build-model-modal.html", scope, "BuildSavedModelController", function(newScope) {
                    newScope.modelId = id;
                });
            },

            deleteTaggableObject: function(scope, taggableType, id, displayName) {
                var deletionRequests = [{
                    type: taggableType,
                    projectKey: $stateParams.projectKey,
                    id: id,
                    displayName: displayName
                }];
                return TaggableObjectsService.delete(deletionRequests)
                    .then(function() {
                        if ($rootScope.topNav.item.id == id) {
                            $state.go("projects.project.flow");
                        } else if (typeof scope.list == "function") {
                            scope.list();
                        }
                    }, setErrorInScope.bind(scope));
            },

            clearDataset: function (scope, id) {
                const taggableItems = [{
                    type: 'DATASET',
                    projectKey: $stateParams.projectKey,
                    id: id,
                    displayName: id
                }];
                return ComputablesService.clear(scope, taggableItems);
            },

            clearManagedFolder: function (scope, id, name) {
                const taggableItems = [{
                    type: 'MANAGED_FOLDER',
                    projectKey: $stateParams.projectKey,
                    id: id,
                    displayName: name
                }];
                return ComputablesService.clear(scope, taggableItems);
            },

            buildManagedFolder: function (scope, id) {
                CreateModalFromTemplate("/templates/managedfolder/build-folder-modal.html", scope, "BuildManagedFolderController", function (newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.odbId = id;
                });
            },

            buildModelEvaluationStore: function (scope, id) {
                CreateModalFromTemplate("/templates/modelevaluationstores/build-store-modal.html", scope, "BuildModelEvaluationStoreController", function (newScope) {
                    newScope.projectKey = $stateParams.projectKey;
                    newScope.mesId = id;
                });
            },

        }
        
        
        svc['getFlowOtherItemsBySection'] = function(scope) {
            var ret = [];

            let streamingEndpoints = {
                isSection: true,
                id: "streaming-endpoints",
                label: "Streaming endpoints",
                icon: "icon-double-angle-right",
                items: [
                    {
                        type: "kafka", label: "Kafka", icon: "icon-kafka",
                        fn: () => scope.showCreateStreamingEndpointModal("kafka")
                    },
                    {
                        type: "sqs", label: "SQS", icon: "icon-sqs",
                        fn: () => scope.showCreateStreamingEndpointModal("sqs")
                    },
                    {
                        label: "HTTP Server-Sent-Events", type:"httpsse", icon: "icon-httpsse",
                        fn: () => scope.showCreateStreamingEndpointModal("httpsse")
                    }
                ]
            };
            if ($rootScope.featureFlagEnabled("kdbplus")) {
                streamingEndpoints.items.push({
                    label: "KDB+Tick ticker plant", type:"kdbplustick", icon: "icon-httpsse",
                    fn: () => scope.showCreateStreamingEndpointModal("kdbplustick")
                });
            }
            ret.push(streamingEndpoints);

            var pyScientistStatus = usable();
            if (!scope.appConfig.userProfile.mayPython) {
                pyScientistStatus = notDataScientist();
            }

            var unsafeStatus = usable();
            if (!$rootScope.appConfig.globalPermissions || !$rootScope.appConfig.globalPermissions.mayWriteUnsafeCode) {
                unsafeStatus = noUnsafeCode();
            }
            var safeStatus = usable();
            if ($rootScope.appConfig.impersonationEnabled && (!$rootScope.appConfig.globalPermissions || !$rootScope.appConfig.globalPermissions.mayWriteSafeCode)) {
                safeStatus = noSafeCode();
            }
            
            var safeCodeStatus = $rootScope.appConfig.impersonationEnabled ? safeStatus : unsafeStatus;

            ret.push({
                isSection: true,
                id: "streaming-recipes",
                label: "Streaming recipes",
                icon: "icon-double-angle-right",
                items: svc.getStreamingRecipesBySection(scope)
            });
            return ret;
        }
        
        return svc;
    });



})();
