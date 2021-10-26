(function() {
'use strict';

const app = angular.module('dataiku.services', []);

// Mapping DOMRect to Object for better usability
function getBoundingClientRect(element) {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y
    };
}

app.factory("DKUConstants", function($rootScope) {
    const cst = {
        ARCHIVED_PROJECT_STATUS: "Archived",
        design: {
            alertClasses: {
                SUCCESS: 'alert-success',
                FATAL: 'alert-danger',
                ERROR: 'alert-danger',
                WARNING: 'alert-warning',
                INFO: 'alert-info'
            }
        }
    };
    $rootScope.DKUConstants = cst;

    return cst;
});


app.service('AppConfig', function() {
    let config;
    this.set = function(cfg) {
        logger.info('Set appConfig')
        config = cfg;
    };
    this.get = function() {
        return config;
    }
});

app.service('FeatureFlagsService', function($rootScope) {
    this.featureFlagEnabled = function(flagName) {
        return $rootScope.appConfig && $rootScope.appConfig.featureFlags.includes(flagName);
    };

    // put in rootScope for easy use in templates
    $rootScope.featureFlagEnabled = this.featureFlagEnabled;
});

app.service('uiCustomizationService', ['$rootScope', 'DataikuAPI', '$q', function($rootScope, DataikuAPI, $q) {
    const datasetTypeStatus = { HIDE: 'HIDE', SHOW: 'SHOW', NO_CONNECTION: 'NO_CONNECTION'};
    const computeDatasetTypeStatusCache = {}; // this is project-dependant, we cache for each project

    this.datasetTypeStatus = datasetTypeStatus;

    // returns a promise resolving into a function (type) => datasetTypeStatus
    this.getComputeDatasetTypesStatus = (scope, projectKey) => {
        if(! computeDatasetTypeStatusCache[projectKey]) {
            const deferred = $q.defer();
            DataikuAPI.datasets.listCreatableDatasetTypes(projectKey).success((datasetTypes) => {
                const uiCustomization = $rootScope.appConfig.uiCustomization; // just a shortcut

                deferred.resolve((type) => {
                    const typeIsIn = (array) => array.indexOf(type) !== -1;

                    // Hive is always hidden if showTraditionalHadoop is unchecked
                    if(!uiCustomization.showTraditionalHadoop && type === 'hiveserver2') {
                        return datasetTypeStatus.HIDE;
                    }

                    if(uiCustomization.hideDatasetTypes && uiCustomization.hideDatasetTypes.length !== 0) {
                        // we hide datasets that are blackListed except if they are allowed by personal connections
                        const isBlackListed = typeIsIn(uiCustomization.hideDatasetTypes);
                        const fromPersonalConnections = typeIsIn(datasetTypes.fromPersonalConnections);
                        if(isBlackListed && !fromPersonalConnections) {
                            return datasetTypeStatus.HIDE;
                        }
                    }

                    if(! uiCustomization.showDatasetTypesForWhichThereIsNoConnection) {
                        // we hide / disable dataset that have no adequate connection available
                        let hasConnection = typeIsIn(datasetTypes.fromAllConnections) || typeIsIn(datasetTypes.outsideOfConnections);

                        // if user is admin we consider all connections are available since he could create them
                        if($rootScope.isDSSAdmin()) {
                            hasConnection = true;
                        }
                        // if user can create personal connections, we consider all connections except Filesystem and hiveserver2 are available since he could create them
                        if($rootScope.appConfig.globalPermissions.mayCreateAuthenticatedConnections && type !== 'Filesystem' && type !== 'hiveserver2') {
                            hasConnection = true;
                        }

                        if(!hasConnection) {
                            return datasetTypeStatus.NO_CONNECTION;
                        }

                    }

                    return datasetTypeStatus.SHOW;
                });
            }).error(setErrorInScope.bind(scope))
            .catch(() => {
                // In case of API error, we resolve the promise with a filter that will show every dataset type
                // not ideal, but better than showing nothing
                deferred.resolve(() => datasetTypeStatus.SHOW);
            });
            computeDatasetTypeStatusCache[projectKey] = deferred.promise;
        }
        return computeDatasetTypeStatusCache[projectKey];
    }
}]);

    /**
     * ActiveProjectKey is intended to replace explicit references to $stateParams.projectKey references
     * that litter the current code base.  These references make it impossible to use many directives outside
     * of an opened project.
     * The service get() method will return $stateParams.projectKey whenever possible, but when this is not
     * defined it will return a value previously saved via the set() method.
     */
    app.service('ActiveProjectKey', function($stateParams) {
    let explicitProjectKey;
    this.set = function(projectKey) {
        explicitProjectKey = projectKey;
    };
    this.get = function() {
        let key = $stateParams.projectKey;
        if (typeof(key) === 'undefined') key = explicitProjectKey;
        return key;
    }
});

app.factory("TableChangePropagator", function() {
    var svc = {seqId: 0};
    svc.update = function() {
        svc.seqId++;
    };
    return svc;
});

app.factory("executeWithInstantDigest", function($timeout) {
    return function executeWithInstantDigest(fn, scope) {
        $timeout(function(){
            scope.$apply(fn);
        });
    }
});




app.factory("textSize", function() {
    // if text is a string returns its length
    // if text is a list of texts returns the maximum width.
    // if container is not undefined, append it to container
    // element will be added and then remove before any repaint.
    return function(texts, tagName, className, container) {
        if (texts.length === undefined) {
            texts = [texts];
        }
        if (className === undefined) {
            className = "";
        }
        className += " text-sizer";
        if (container === undefined) {
            container = $("body");
        }
        else {
            container = $(container);
        }
        var maxWidth = 0;
        var elements = [];
        for (var i = 0; i < texts.length; i++) {
            var text = texts[i];
            var el = document.createElement(tagName);
            el.className = className;
            var $el = $(el);
            $el.text(text);
            container.append($el);
            elements.push($el);
        }
        ;
        for (var i = 0; i < elements.length; i++) {
            var $el = elements[i];
            maxWidth = Math.max(maxWidth, $el.width());
            $el.remove();
        }
        ;
        return maxWidth;
    }
});


app.factory("CollectionFiltering", function(Fn) {
    // service to filter collection with complex filters
    // i.e. magic around $filter('filter')

    // usage : CollectionFiltering.filter([obj,obj,obj], filterQuery, params)

    // filterQuery is an object that's matched against objects from the list
    // JS objects : {} means a logical AND
    // JS arrays : [] means a logical OR
    // string/Regex properties are then matched against each others with a substr logic

    // ** Parameters **
    // * filterQuery.userQuery : special str property that's matched against all properties of the object
    //    with an OR behaviour.
    // * property:value strings are extracted from filterQuery.userQuery and added to the filterQuery object
    // * params.userQueryTargets : single (or list of) dotted property paths to restrict the match of userQuery
    // * params.propertyRules : if you want to give the user shortcuts for properties (replace dict)

    // params are enriched with :
    // * params.userQueryResult : a list of Regex+str that where used in the matching (for highlight in list)
    // * params.userQueryErrors : a dict : {str:errMessage} that occurred during parsing

    var matchString = function(query, obj, exactMatch) {
        if (query instanceof RegExp) {
            return query.test(obj);
        } else {
            return !exactMatch ? ('' + obj).toLowerCase().indexOf(query) > -1 : ('' + obj).toLowerCase() === query;
        }
    }

    var filterFilterAllProperties = function(qQuery, obj) {
        if ($.isArray(obj)) {
            for (var i in obj) {
                if (filterFilterAllProperties(qQuery, obj[i])) {
                    return true;
                }
            }
            return false;
        } else if ($.isPlainObject(obj)) {
            for (var objKey in obj) {
                if (objKey.charAt(0) !== '$' && hasOwnProperty.call(obj, objKey) && filterFilterAllProperties(qQuery, obj[objKey])) {
                    return true;
                }
            }
            return false;
        } else if (qQuery instanceof RegExp || ((typeof(qQuery) === "string" || typeof(query) === "number") && qQuery !== "")) {
            return matchString(qQuery, obj);
        } else {
            return true;
        }
    };
    var filterFilter = function(query, params, obj, queryArrayIsAND, exactMatch) {
        if ($.isArray(query)) {
            if (query.length == 0) {
                return true
            }
            if (!queryArrayIsAND) {
                for (var i in query) {
                    if (filterFilter(query[i], params, obj, undefined, exactMatch)) {
                        return true
                    }
                }
                return false;
            } else {
                for (var i in query) {
                    if (!filterFilter(query[i], params, obj, undefined, exactMatch)) {
                        return false
                    }
                }
                return true;
            }
        } else if ($.isArray(obj)) {
            if (obj.length == 0 && query != "") {
                return false;
            }
            for (var i in obj) {
                if (filterFilter(query, params, obj[i], undefined, exactMatch)) {
                    return true
                }
            }
            return false;
        } else if ($.isPlainObject(obj) || $.isPlainObject(query)) {
            if (!$.isPlainObject(obj)) {
                return false
            }
            if (!$.isPlainObject(query)) {
                return true
            }
            if (query.userQuery && !filterFilterAllProperties(query.userQuery, obj)) {
                return false
            }
            for (var objKey in query) {
                const requiresExactMatch = params.exactMatch && params.exactMatch.includes(objKey);
                if (objKey.charAt(0) !== '$' && objKey !== 'userQuery') {
                    if (!objKey.endsWith("__not") && !objKey.endsWith("__and") 
                        && !filterFilter(query[objKey], params, Fn.propStr(objKey)(obj), undefined, requiresExactMatch)) {
                        return false;
                    }
                    if (!objKey.endsWith("__not") && objKey.endsWith("__and") 
                        && !filterFilter(query[objKey], params, Fn.propStr(objKey.substr(0,objKey.length-5))(obj), true, requiresExactMatch)) {
                        return false;
                    }
                    if (objKey.endsWith("__not") && !objKey.endsWith("__and") 
                        && filterFilter(query[ objKey ], params, Fn.propStr(objKey.substr(0,objKey.length-5))(obj), undefined, requiresExactMatch)) { 
                        return false;
                    }
                }
            }
            return true;
        } else if (query instanceof RegExp || ((typeof(query) === "string" || typeof(query) === "number") && query !== "")) {
            return matchString(query, obj, exactMatch);
        } else {
            return true;
        }
    };

    var prepareStringKey = function(params, a) {
        if (a.endsWith("/") && a.startsWith("/") && a.length > 2) {
            try {
                return new RegExp(a.substr(1, a.length - 2));
            } catch (err) {
                if (params) {
                    params.userQueryErrors = params.userQueryErrors || {};
                    params.userQueryErrors[a] = err;
                }
                return a;
            }
        } else {
            return a.toLowerCase();
        }
    };

    var cleanFilterQuery = function(obj, params) {
        if ($.isPlainObject(obj)) {
            for (var k in obj) {
                obj[k] = cleanFilterQuery(obj[k], params);
                if (($.isEmptyObject(obj[k]) && !(obj[k] instanceof RegExp) && (typeof obj[k] !== 'boolean')) || obj[k] === "") {
                    delete obj[k]
                }
            }
        } else if ($.isArray(obj)) {
            for (var k = obj.length - 1; k >= 0; k--) {
                obj[k] = cleanFilterQuery(obj[k], params);
                if (($.isEmptyObject(obj[k]) && !(obj[k] instanceof RegExp) && (typeof obj[k] !== 'boolean')) || obj[k] === "") {
                    obj.splice(k, 1)
                }
            }
        } else if (typeof(obj) === "string" || typeof(obj) === "number" || typeof(obj) === "boolean") {
            obj = prepareStringKey(params, ''+obj);
        }
        return obj;
    };


    var translatePropertyName = function(params, propName) {
        if (propName === 'not') {
            return propName
        }
        propName = (params.propertyRules || {})[propName] || propName;
        if (propName.charAt(0) === '-') {
            propName = ((params.propertyRules || {})[propName.substr(1)] || propName.substr(1)) + "__not"
        } else {
            propName = propName + "__and"
        }
        return propName;
    }

    var safePushProp = function(obj, propStr, value) {
        if (!obj || !propStr) {
            return
        }
        var initialValue = Fn.propStrSafe(propStr)(obj);
        if (!$.isArray(initialValue)) {
            if (initialValue) {
                Fn.setPropStr([initialValue], propStr)(obj)
            }
            else {
                Fn.setPropStr([], propStr)(obj)
            }
            initialValue = Fn.propStr(propStr)(obj);
        }
        if ($.isArray(value)) {
            value.forEach(function(o) {
                initialValue.push(o)
            })
        }
        else {
            initialValue.push(value)
        }
    }

    var handleUserQuery = function(filterQuery, params) {
        if (!filterQuery.userQuery) {
            return filterQuery
        }
        var remainingUserQuery = [];
        filterQuery.userQuery.split(" ").filter(function(o) {
            return o !== ""
        }).forEach(function(dottedProp) {
            if (dottedProp.indexOf(':') > -1 && !( dottedProp.startsWith("/") && dottedProp.endsWith("/") )) {
                var fqelem = dottedProp.split(":");
                var propName = translatePropertyName(params, fqelem.shift());
                safePushProp(filterQuery, propName, fqelem.join(":"));
            } else {
                remainingUserQuery.push(dottedProp);
            }
        });
        filterQuery.userQuery = remainingUserQuery.join(" ").trim();
        return filterQuery;
    };

    var handleUserQueryTargets = function(filterQuery, params) {
        if (!params.userQueryTargets || !filterQuery) {
            return filterQuery
        }
        var userQueryTargets = $.isArray(params.userQueryTargets) ? params.userQueryTargets : [params.userQueryTargets];
        // TODO : there should be a proper "summary of the query after the whole processing"
        params.userQueryResult = ('' + filterQuery.userQuery).split(" ").filter(function(a) {
            return a != ""
        }).map(prepareStringKey.bind(null, null));

        // Add appropriate filters if user imputed not:something
        if (filterQuery.not) {
            userQueryTargets.forEach(function(userQueryTarget) {
                safePushProp(filterQuery, userQueryTarget + "__not", filterQuery.not)
            });
            delete filterQuery.not;
        }

        // dispatch the userQuery remains
        var userQuery = filterQuery.userQuery;
        if (!userQuery) {
            return filterQuery
        }
        delete filterQuery.userQuery;
        var result = [];
        var userQueryValues = userQuery.split(" ").filter(function(o) {
            return o !== ''
        });
        Fn.pow(userQueryTargets, userQueryValues.length).forEach(function(userQueryTargetCombination) {
            var filterQueryOption = angular.copy(filterQuery);
            userQueryTargetCombination.forEach(function(userQueryTarget, i) {
                safePushProp(filterQueryOption, userQueryTarget + "__and", userQueryValues[i]);
            });
            result.push(filterQueryOption);

        });

        return result;
    };

    var filterWrapper = function(collection, query, params) {
        var filterQuery = angular.copy(query || {});
        if (!params) {
            params = {}
        } else {
            delete params.userQueryErrors;
            delete params.userQueryResult;
        }
        filterQuery = handleUserQuery(filterQuery, params);
        // console.info('HANDLE',JSON.stringify(filterQuery));
        filterQuery = handleUserQueryTargets(filterQuery, params);
        // console.info('TARGETS',JSON.stringify(filterQuery));
        filterQuery = cleanFilterQuery(filterQuery, params);
        // console.info('CLEANED',JSON.stringify(filterQuery));
        return collection.filter(function(o) {
            return filterFilter(filterQuery, params, o);
        });
    };

    return {
        filter: filterWrapper,
    }
});


app.factory("algorithmsPalette", function() {
    var COLORS =  [
        "#f07c48", // poppy red (no, it's actually orange)
        "#fdc766", // chicky yellow
        "#7bc9a6", // turquoisy green
        "#4ec5da", // sky blue
        "#548ecb", // sea blue
        "#d848c0", // lilas
        "#41bb15" // some no name green
        //"#97668f", // lilas
        //"#5e2974", // dark purple
    ];
    return function(i) {
        return COLORS[i % COLORS.length];
    }
});


app.factory("categoricalPalette", function() {  // Keep in sync with PaletteFactory/categorical
    var COLORS = [
        "#f06548", // poppy red
        "#fdc766", // chicky yellow
        "#7bc9a6", // turquoisy green
        "#4ec5da", // sky blue
        "#548ecb", // sea blue
        "#97668f", // lilas
        "#5e2974", // dark purple
    ];
    return function(i) {
        return COLORS[i % COLORS.length];
    }
});


app.factory("divergingPalette", function() {
    /* given a value going from -1 to 1
     returns the color associated by a diverging palette
     going form blue to red. */
    var rgbToHsl = function(s) {
        return d3.rgb(s).hsl();
    };
    var RED_SCALE = ["#fbefef", "#FBDAC8", "#F3A583", "#D75D4D", "#B11F2C"].map(rgbToHsl);
    var BLUE_SCALE = ["#f0f1f1", "#CFE6F1", "#94C5DE", "#4793C3", "#2966AB"].map(rgbToHsl);

    var divergingPalette = function(r) {
        var SCALE = (r > 0) ? RED_SCALE : BLUE_SCALE;
        if (r < 0) {
            r = -r;
        }
        if (r >= 1.) r = 0.99;
        var N = SCALE.length - 1;
        var bucket = r * N | 0;
        var low_color = SCALE[bucket];
        var high_color = SCALE[bucket + 1];
        r = r * N - bucket;
        var h = high_color.h;
        var l = low_color.l * (1 - r) + high_color.l * r;
        var s = low_color.s * (1 - r) + high_color.s * r;
        return d3.hsl(h, s, l);
    };
    return divergingPalette;
});


app.factory("AnyLoc", function(Assert) {
    return {
        makeLoc : function(projectKey, localId) {
            return {
                    projectKey: projectKey,
                    localId: localId,
                    fullId: projectKey + "." + localId
            }
        },
        getLocFromSmart: function(contextProjectKey, name) {
            if (name.indexOf(".") >= 0) {
                return {
                    projectKey: name.split("\.")[0],
                    localId: name.split("\.")[1],
                    fullId: name
                }
            } else {
                return {
                    projectKey: contextProjectKey,
                    localId: name,
                    fullId: contextProjectKey + "." + name
                }
            }
        },
        getLocFromFull: function(fullName) {
            Assert.trueish(fullName.includes('.'), 'no dot in fullname');
            return {
                projectKey: fullName.split("\.")[0],
                localId: fullName.split("\.")[1],
                fullId: fullName
            };
        },
    }
});

app.factory("AutomationUtils", function() {
    const svc = {
        pythonEnvImportTimeModes: [
            ["INSTALL_IF_MISS", "Create new if not present"],
            ["FAIL_IF_MISS", "Fail if not present"],
            ["DO_NOTHING", "Ignore"]
         ],
         pythonEnvImportTimeModeDescs: [
             "When the bundle declares a dependency on a code env that does not exist on this instance, create a new code env with that name",
             "When the bundle declares a dependency on a code env that does not exist on this instance, stop the preloading",
             "Do not take action if a code env is missing"
         ],
         envImportSpecificationModes: [
             ["SPECIFIED", "User-specified list of packages"],
             ["ACTUAL", "Actual list of packages"]
         ],
         envImportSpecificationModeDescs: [
             "Use the list of packages that the user specified, and the default list of required packages",
             "Use the list of packages built by inspecting the environment"
         ]
    }

    return svc;
});

app.factory("ConnectionUtils", function() {
    const connectionSqlTypes =
        ["hiveserver2", "MySQL", "PostgreSQL", "Vertica", "Greenplum", "Redshift", "Teradata", "Oracle", "SQLServer", "Synapse", "Netezza", "BigQuery", "SAPHANA", "Snowflake", "JDBC", "Athena"]; //TODO @datasets remove
    return {
        isIndexable: function(connection) {
            return connection && connection.type && connectionSqlTypes.includes(connection.type);
        }
    }
});
app.factory("DatasetUtils", function(Assert, DataikuAPI, $q, Logger, $rootScope, SmartId, RecipesUtils) {
    var sqlTypes = ["MySQL", "PostgreSQL", "Vertica", "Greenplum", "Redshift", "Teradata", "Oracle", "SQLServer", "Synapse", "Netezza", "BigQuery", "SAPHANA", "Snowflake", "JDBC", "Athena"]; //TODO @datasets remove
    const sqlAbleTypes = ["S3"];
    var svc = {
        canUseSQL: function(dataset) {
            if (sqlTypes.indexOf(dataset.type) >= 0 &&
                dataset.params.mode == "table") {
                return true;
            }
            if (sqlAbleTypes.indexOf(dataset.type) >= 0) {
                return true;
            }
            if (dataset.type == "HDFS" || dataset.type == "hiveserver2") {// && $scope.appConfig.impalaEnabled) {
                return true;
            }
            Logger.info("Dataset is not SQL-capable: " + dataset.type);
            return false;
        },
        canUseSparkSQL: function(dataset) {
            if ($rootScope.appConfig.interactiveSparkEngine == "DATABRICKS") {
                return dataset.type == "HDFS";
            } else {
                if (sqlTypes.indexOf(dataset.type) >= 0 && dataset.params.mode == "table") {
                    return false;
                }
                return true;
            }
        },

        hasSizeStatus: function(dataset) {
            return svc.getKindForConsistency(dataset) == "files";
        },

        isSQL: function(dataset) {
            return sqlTypes.indexOf(dataset.type) >= 0;
        },
        isSQLTable: function(dataset) {
            return sqlAbleTypes.indexOf(dataset.type) >= 0 ||
                sqlTypes.indexOf(dataset.type) >= 0 && (!dataset.params || dataset.params.mode == "table"); // A bit hackish, when we don't have the params, let's not block functionality
        },

        supportsReadOrdering : function(dataset) {
            return svc.isSQLTable(dataset);
        },

        getKindForConsistency : function(dataset) {
            if (sqlTypes.indexOf(dataset.type) >= 0) {
                return "sql";
            } else if (dataset.type == "MongoDB") {
                return "mongodb";
            } else if (dataset.type == "DynamoDB") {
                return "dynamodb";
            } else if (dataset.type == "Cassandra") {
                return "cassandra";
            } else if (dataset.type == "Twitter") {
                return "generic";
            } else if (dataset.type == "ElasticSearch") {
                return "generic";
            } else if (dataset.type == "Kafka") {
                return "generic";
            } else if (dataset.type == "SQS") {
                return "generic";
            } else {
                return "files";
            }
        },

        getLocFromSmart: function(contextProjectKey, name) {
            if (name.indexOf(".") >= 0) {
                return {
                    projectKey: name.split("\.")[0],
                    name: name.split("\.")[1],
                    fullName: name
                };
            } else {
                return {
                    projectKey: contextProjectKey,
                    name: name,
                    fullName: contextProjectKey + "." + name
                };
            }
        },
        getLocFromFull: function(fullName) {
            Assert.trueish(fullName.includes('.'), 'no dot in fullname');
            return {
                projectKey: fullName.split("\.")[0],
                name: fullName.split("\.")[1],
                fullName: fullName
            };
        },
        makeLoc: function(datasetProjectKey, datasetName) {
            return {
                projectKey: datasetProjectKey,
                name: datasetName,
                fullName: datasetProjectKey + "." + datasetName
            };
        },
        makeSmart: function(loc, contextProjectKey) {
            if (loc.projectKey == contextProjectKey) {
                return loc.name;
            } else {
                return loc.fullName;
            }
        },

        makeHeadSelection: function(lines) {
            return {
                partitionSelectionMethod: "ALL",
                samplingMethod: "HEAD_SEQUENTIAL",
                maxRecords: lines
            };
        },

        getSchema: function(scope, datasetName) {
            if (!scope.computablesMap || !scope.computablesMap[datasetName]) {
                return;
            }
            var it = scope.computablesMap[datasetName];
            if (!it || !it.dataset) {
                throw Error('dataset is not in computablesMap');
            }
            return it.dataset.schema;
        },

        updateRecipeComputables: function(scope, recipe, projectKey, contextProjectKey) {
            if (!scope.computablesMap) return Promise.resolve();
            let references = new Set(RecipesUtils.getFlatIOList(recipe).map(role => role.ref));
            references = [...references].filter(ref => (ref in scope.computablesMap) && ((scope.computablesMap[ref].dataset && !scope.computablesMap[ref].dataset.schema) || (scope.computablesMap[ref].streamingEndpoint && !scope.computablesMap[ref].streamingEndpoint.schema)));
            return $q.all(references
                .map(name => {
                    let resolvedSmartId = SmartId.resolve(name, contextProjectKey);
                    if (scope.computablesMap[name].dataset) {
                        return DataikuAPI.datasets.get(resolvedSmartId.projectKey, resolvedSmartId.id, contextProjectKey).success(function(data){
                            scope.computablesMap[name].dataset = data;
                        }).error(setErrorInScope.bind(scope));
                    } else if (scope.computablesMap[name].streamingEndpoint) {
                        return DataikuAPI.streamingEndpoints.get(resolvedSmartId.projectKey, resolvedSmartId.id, contextProjectKey).success(function(data){
                            scope.computablesMap[name].streamingEndpoint = data;
                        }).error(setErrorInScope.bind(scope));
                    }
                })
            );
        },

        updateDatasetInComputablesMap: function(scope, dsName, projectKey, contextProjectKey) {
            let resolvedSmartId = SmartId.resolve(dsName, contextProjectKey);
            return DataikuAPI.datasets.get(resolvedSmartId.projectKey, resolvedSmartId.id, contextProjectKey).success(function(data){
                scope.computablesMap[dsName].dataset = data;
            }).error(setErrorInScope.bind(scope));
        },

        listDatasetsUsabilityForAny: function(contextProjectKey) {
            return DataikuAPI.flow.listUsableComputables(contextProjectKey, {
                datasetsOnly: true
            });
        },

        listFoldersUsabilityForOutput : function(contextProjectKey, recipeType) {
            var d = $q.defer();
            DataikuAPI.flow.listUsableComputables(contextProjectKey, {
                datasetsOnly : false,
                forRecipeType : recipeType,
            }).success(function(data) {
                data.forEach(function(x) {
                    x.usable = x.usableAsInput;
                    x.usableReason = x.inputReason;
                });
                d.resolve(data);
            });
            return d.promise;
        },

        listDatasetsUsabilityForInput: function(contextProjectKey, recipeType) {
            var d = $q.defer();
            DataikuAPI.flow.listUsableComputables(contextProjectKey, {
                datasetsOnly: true,
                forRecipeType: recipeType,
            }).success(function(data) {
                data.forEach(function(x) {
                    x.usable = x.usableAsInput;
                    x.usableReason = x.inputReason;
                });
                d.resolve(data);
            });
            return d.promise;
        },

        /**
         * Returns a promise on an arry of two array, "availableInputDatasets" and "availableOutputDataset"
         * On each, the "usable" and "usableReason" are set
         */
        listDatasetsUsabilityInAndOut: function(contextProjectKey, recipeType, datasetsOnly) {
            var d = $q.defer();
            DataikuAPI.flow.listUsableComputables(contextProjectKey, {
                datasetsOnly: datasetsOnly == null ? true : datasetsOnly,
                forRecipeType: recipeType,
            }).success(function(data) {
                var avlIn = angular.copy(data);
                var avlOut = angular.copy(data);
                avlIn.forEach(function(x) {
                    x.usable = x.usableAsInput;
                    x.usableReason = x.inputReason;
                });
                avlOut.forEach(function(x) {
                    x.usable = x.usableAsOutput;
                    x.usableReason = x.outputReason;
                });
                d.resolve([avlIn, avlOut]);
            });
            return d.promise;
        },

        /**
         * Returns a promise on an arry of two array, "availableInputDatasets" and "availableOutputDataset"
         * On each, the "usable" and "usableReason" are set
         */
        listUsabilityInAndOut: function(contextProjectKey, recipeType) {
            var d = $q.defer();
            DataikuAPI.flow.listUsableComputables(contextProjectKey, {
                forRecipeType: recipeType
            }).success(function(data) {
                var avlIn = angular.copy(data);
                var avlOut = angular.copy(data);
                avlIn.forEach(function(x) {
                    x.usable = x.usableAsInput;
                    x.usableReason = x.inputReason;
                });
                avlOut.forEach(function(x) {
                    x.usable = x.usableAsOutput;
                    x.usableReason = x.outputReason;
                });
                d.resolve([avlIn, avlOut]);
            });
            return d.promise;
        }
    }
    return svc;
});


app.factory("Breadcrumb", function($stateParams, $rootScope) {
    var ret = {}
    $rootScope.masterBreadcrumbData = {}

    ret.setProjectSummary = function(projectSummary) {
        $rootScope.currentProjectSummary = projectSummary;
    }

    ret.setData = function(k, v) {
        $rootScope.masterBreadcrumbData[k] = v;
    }

    ret.projectBreadcrumb = function() {
        return [
            //{ "type" : "home" },
            {"type": "project", "projectKey": $stateParams.projectKey}
        ]
    }
    ret.datasetBreadcrumb = function() {
        return ret.projectBreadcrumb().concat([
            //{"type" : "datasets", projectKey : $stateParams.projectKey},
            {
                "type": "dataset", projectKey: $stateParams.projectKey, id: $stateParams.datasetName,
                displayName: $stateParams.datasetName
            }
        ]);
    }
    ret.recipeBreadcrumb = function() {
        return ret.projectBreadcrumb().concat([
            {"type": "recipes", projectKey: $stateParams.projectKey},
            {
                "type": "recipe", projectKey: $stateParams.projectKey, id: $stateParams.recipeName,
                displayName: $stateParams.recipeName
            }
        ]);
    }
    ret.insightBreadcrumb = function(insightName) {
        return ret.projectBreadcrumb().concat([
            {"type": "insights", "projectKey": $stateParams.projectKey},
            {
                "type": "insight",
                "projectKey": $stateParams.projectKey,
                "id": $stateParams.insightId,
                displayName: insightName
            }
        ]);
    }

    ret.set = function(array) {
        $rootScope.masterBreadcrumb = array;
    }

    ret.setWithProject = function(array) {
        ret.set(ret.projectBreadcrumb().concat(array));
    }
    ret.setWithDataset = function(array) {
        ret.set(ret.datasetBreadcrumb().concat(array));
    }
    ret.setWithInsight = function(insightName, array) {
        ret.set(ret.insightBreadcrumb(insightName).concat(array));
    }
    ret.setWithRecipe = function(array) {
        ret.set(ret.recipeBreadcrumb().concat(array));
    }
    ret.setWith
    return ret;
});


app.service('LocalStorage', ['$window', function($window) {
    return {
        set: function(key, value) {
            if (value !== undefined) {
                $window.localStorage[key] = JSON.stringify(value);
            }
        },
        get: function(key) {
            var ret = $window.localStorage[key];
            if (ret !== undefined) {
                ret = JSON.parse(ret);
            }
            return ret;
        }
    }
}]);


app.factory("ContextualMenu", function($compile, $rootScope, $templateCache, $window, $http) {
        // Class describing a menu.
        // Can be used for both contextual menu and
        // regular menues.
        //
        function Menu(params) {
            /*
             Contextual or not, only one menu can be visible at the same time
             on the screen.
             The contextual menu content does not live in the DOM until it is displayed
             to the user.

             Parameters contains the following options
             - template (required) : template path for the content of the menu.
             - controller (optional) : name of the controller
             - scope  (optional) : if not added, a new scope will be created.
             - contextual (option, true|false, default:true
             in contextual menu mode, all clicks outside of the
             popup is captured.
             - onOpen (optional): called on menu open
             - onClose (optional): called on menu close
             - cssClass: CSS class on the ul
             */
            this.template = params.template;
            if (typeof this.template != "string") {
                throw "Template parameter is required";
            }
            this.cssClass = params.cssClass;
            this.controller = params.controller;
            this.contextual = params.contextual;
            if (this.contextual === undefined) {
                this.contextual = true;
            }
            this.enableClick = params.enableClick;
            if (this.enableClick === undefined) {
                this.enableClick = false;
            }
            this.handleKeyboard = params.handleKeyboard;
            if (this.handleKeyboard === undefined) {
                this.handleKeyboard = true;
            }
            this.scope = params.scope;
            this.tmplPromise = $http.get(this.template, {cache: $templateCache});
            this.onClose = params.onClose || function() {
                };
            this.onOpen = params.onOpen || function() {
                };
        }

        Menu.prototype.newScope = function() {
            if (this.scope) {
                return this.scope.$new();
            }
            else {
                return $rootScope.$new(true);
            }
        };

        Menu.prototype.globalOnClose = function() {
        };
        Menu.prototype.globalOnOpen = function() {
        };

        // close any popup currently visible on the screen.
        Menu.prototype.closeAny = function(e) {
            // remove and unbind any overlays
            Menu.prototype.$overlay.unbind("click");
            Menu.prototype.$overlay.unbind("contextmenu");
            Menu.prototype.$overlay.remove();

            // remove the document click
            $(document).off(".closeMenu");

            Menu.prototype.$menu.remove();
            Menu.prototype.globalOnClose();
            Menu.prototype.globalOnClose = function() {
            };
            Menu.prototype.globalOnOpen = function() {
            };
            Menu.prototype.$menu.removeClass();
            Menu.prototype.$menu.addClass('dropdown-menu');
            if (e) e.preventDefault();
            return false;
        };

        Menu.prototype.setup = function($menu) {
            var me = this;

            Menu.prototype.globalOnClose = this.onClose;
            Menu.prototype.globalOnOpen = this.onOpen;
            var index = -1;
            var currentMenu = Menu.prototype.$menu;

            if (me.contextual) {
                $menu.before(Menu.prototype.$overlay);
                $(Menu.prototype.$overlay).bind("contextmenu", me.closeAny.bind(me));
                Menu.prototype.$overlay.click(me.closeAny.bind(me));
            } else {
                window.setTimeout(function() {
                    // handle click when menu is open
                    $(document)
                        .on('click.closeMenu', function(evt) {
                            if ($(evt.target).parents().index(Menu.prototype.$menu) === -1) {
                                Menu.prototype.closeAny();
                            }
                        });
                }, 0);
            }
            if (!me.enableClick) {
                $menu.on('click.ctxmenu', function(e) {
                    me.closeAny();
                });
            }

            window.setTimeout(function() {
                // makes the links focusable
                Menu.prototype.$menu.find('a').attr('tabindex', -1);

                var handleKey = function(evt) {
                    if (Menu.prototype.$menu.height()) {
                        if (evt.which === 27) {
                            // esc
                            Menu.prototype.closeAny();
                        }
                        if (evt.which === 40) {
                            // down
                            const items = currentMenu.find('>li>a');
                            if (items.length) {
                                index = Math.min(items.length - 1, index + 1);
                                items[index].focus();
                            }
                            evt.preventDefault();
                            evt.stopPropagation();
                        }
                        if (evt.which === 38) {
                            // up
                            index = Math.max(0, index - 1);
                            const items = currentMenu.find('>li>a, >*>li>a');
                            if (items.length) {
                                items[index].focus();
                            }
                            evt.preventDefault();
                            evt.stopPropagation();
                        }

                        if (evt.which === 37) {
                            // left
                            // Go up one menu
                            if (currentMenu != Menu.prototype.$menu) {
                                index = currentMenu.parents('ul').eq(0).find('>li>a').index(currentMenu.parent('li.hover').removeClass('hover').find('>a'));
                                currentMenu = currentMenu.parents('ul').eq(0);
                                const items = currentMenu.find('>li>a');
                                if (items.length) {
                                    items[index].focus();
                                }
                            }
                            evt.preventDefault();
                            evt.stopPropagation();
                        }
                        if (evt.which === 39) {
                            // right
                            // go into submenu
                            const items = currentMenu.find('>li>a');
                            const submenus = items.eq(index).siblings('ul');
                            if (submenus.length) {
                                items.eq(index).parent().addClass('hover');
                                currentMenu = submenus.eq(0);
                                index = 0;
                                items[index].focus();
                            }
                            evt.preventDefault();
                            evt.stopPropagation();
                        }
                        if (evt.which === 13) {
                            // enter
                            currentMenu.find('>li>a').eq(index).trigger('click');
                            Menu.prototype.closeAny();
                        }
                    }
                };
                if (me.handleKeyboard) {
                    $(document).on('keydown.closeMenu', handleKey); // handle keypress while the menu doesn't have the focus
                    Menu.prototype.$menu.on('keydown', handleKey);
                }
                Menu.prototype.$menu.on('mouseenter', 'a', function(e) {
                    Menu.prototype.$menu.find('.hover').removeClass('hover');
                    currentMenu = $(this).parents('ul').eq(0);
                    index = currentMenu.find('>li>a').index($(this));
                });

            });
        };

        // Fill the shared menu element with menu instance
        // content.
        //
        // Template is compiled against the scope
        // at each call.
        //
        Menu.prototype.fill = function(cb) {
            var me = this;
            this.tmplPromise.success(function(tmplData) {
                if (me.controller !== undefined) {
                    me.$menu.attr("ng-controller", me.controller);
                }
                else {
                    me.$menu.removeAttr("ng-controller");
                }
                me.$menu.html(tmplData);
                Menu.prototype.destroyCurrentScope();
                var newScope = me.newScope();
                $compile(me.$menu)(newScope);
                Menu.prototype.currentScope = newScope;
                if (cb !== undefined) {
                    cb(me.$menu);
                }
                if (me.cssClass) {
                    me.$menu.addClass(me.cssClass);
                }
            });
        };

        Menu.prototype.destroyCurrentScope = function() {
            if (Menu.prototype.currentScope != undefined) {
                Menu.prototype.currentScope.$destroy();
            }
            Menu.prototype.currentScope = undefined;
        };

        Menu.prototype.openAlignedWithElement = function(alignElement, callback, followScroll, exactAlignment) {
            var me = this;
            me.closeAny();
            me.fill(function($menu) {
                // place the element.
                var $body = $("body");
                var $alignElement = $(alignElement);
                var alignElementOffset = $alignElement.offset();
                var scrollOffsetLeft = alignElementOffset.left;
                var scrollOffsetTop = alignElementOffset.top;

                var box = $alignElement.offset();
                box.width = $alignElement.width();
                box.height = $alignElement.outerHeight();
                $body.append($menu);
                var left = Math.max(0, box.left - (exactAlignment ? 0 : 10));

                // we also want to move the dropdown menu to the left
                // to stay on the screen.
                var menuWidth = $menu.width();
                var bodyWidth = $body.width();

                $menu.detach();

                left = Math.min(left, bodyWidth - menuWidth - 10);

                if (bodyWidth - left - menuWidth < 180) {
                    // let's step into bizarro land
                    // where submenues open to the left.
                    $menu.addClass("bizarro");
                }
                else {
                    $menu.removeClass("bizarro");
                }

                var position = {
                    left: left,
                    top: box.top + box.height,
                    bottom: "auto",
                    right: "auto"
                };

                var containerElement = $body;

                if (followScroll) {
                    var containerElement = $(alignElement).offsetParent();
                    var alignElementPosition = $alignElement.position();
                    var scrollOffsetLeft = alignElementPosition.left - box.left;
                    var scrollOffsetTop = alignElementPosition.top - box.top;
                    position.left += scrollOffsetLeft;
                    position.top += scrollOffsetTop;
                }

                $menu.appendTo(containerElement);
                $menu.css(position);

                me.setup($menu);
                if (callback !== undefined) {
                    callback($menu);
                }
                Menu.prototype.globalOnOpen();
            });
        };

        Menu.prototype.openAtXY = function(left, top, callback, dummyLateralPosition, dummyVerticalPosition) {
            var me = this;
            me.closeAny();
            me.fill(function($menu) {
                $("body").append($menu);
                var offset = {};
                if (left < $($window).width() / 2 || dummyLateralPosition) {
                    offset.left = left;
                    offset.right = 'auto';
                } else {
                    offset.left = 'auto';
                    offset.right = $($window).width() - left;
                }
                if (top < $($window).height() / 2 || dummyVerticalPosition) {
                    offset.top = top;
                    offset.bottom = 'auto';
                } else {
                    offset.top = 'auto';
                    offset.bottom = $($window).height() - top;
                }
                $menu.css(offset);
                me.setup($menu);
                if (callback !== undefined) {
                    callback($menu);
                }
                Menu.prototype.globalOnOpen();
            });
        };

        Menu.prototype.openAtEventLoc = function (evt) {
            if (!evt) return;
            this.openAtXY(evt.pageX, evt.pageY);
        }

        // TODO get rid of the id
        Menu.prototype.$menu = $('<ul id="dku-contextual-menu" class="dropdown-menu" style="position:absolute" role="menu">');
        // overlay element that helps capturing any click
        // outside of the menu.
        // Used in ContextualMenu mode.
        Menu.prototype.$overlay = $('<div class="contextualMenuOverlay"></div>');
        // Menu.prototype.$overlay

        return Menu;
    });


app.factory("ActivityIndicatorManager", ["$timeout", function($timeout) {
    function hide(activityIndicator) {
        activityIndicator.hidden = true;
    }

    function getActivityIndicatorType(type) {
        switch (type) {
            case 'waiting':
            case 'info':
                return 'progress';
            case 'success':
                return 'success';
            case 'warning':
                return 'warning';
            case 'error':
                return 'error';
            default:
                throw new Error('Unknown type: ' + type);
        }
    }

    return {
        hide,
        configureActivityIndicator: function (activityIndicator, type, text, time, faded = true) {
            activityIndicator.hidden = false;
            activityIndicator.text = text;
            activityIndicator.type = getActivityIndicatorType(type);
            activityIndicator.faded = faded;

            if (type === 'waiting') {
                activityIndicator.spinner = true;
            } else {
                activityIndicator.spinner = false;
                if (!time) {
                    time = 2000;
                }
                $timeout(function () {
                    hide(activityIndicator);
                }, time);
            }
        },
        buildDefaultActivityIndicator: function (inChartPanel) {
            return {
                inChart: inChartPanel,
                hidden: true,
                text: '',
                type: 'progress',
                spinner: false,
                faded: true
            };
        }
    };
}]);

app.factory("ActivityIndicator", ["$rootScope", "ActivityIndicatorManager", function($rootScope, ActivityIndicatorManager) {
    $rootScope.activityIndicator = ActivityIndicatorManager.buildDefaultActivityIndicator(false);
    return {
        waiting: function(text) {
            ActivityIndicatorManager.configureActivityIndicator($rootScope.activityIndicator, 'waiting', text);
        },
        hide: function() {
            ActivityIndicatorManager.hide($rootScope.activityIndicator);
        },
        success: function(text, time) {
            ActivityIndicatorManager.configureActivityIndicator($rootScope.activityIndicator,'success', text, time);
        },
        warning: function(text, time) {
            ActivityIndicatorManager.configureActivityIndicator($rootScope.activityIndicator,'warning', text, time);
        },
        info: function(text, time) {
            ActivityIndicatorManager.configureActivityIndicator($rootScope.activityIndicator,'info', text, time);
        },
        error: function(text, time) {
            ActivityIndicatorManager.configureActivityIndicator($rootScope.activityIndicator,'error', text, time);
        }
    };
}]);

app.factory("ChartActivityIndicator", ["ActivityIndicatorManager", function(ActivityIndicatorManager) {
    return {
        buildDefaultActivityIndicator: function () {
            return ActivityIndicatorManager.buildDefaultActivityIndicator(true)
        },
        displayBackendError: function (chartActivityIndicator, errorMessage) {
            ActivityIndicatorManager.configureActivityIndicator(chartActivityIndicator, 'error', errorMessage, 5000, false);
        }
    };
}]);

app.factory("APIXHRService", ["$rootScope", "$http", "$q", "Logger", "HistoryService", function($rootScope, $http, $q, Logger, HistoryService) {
    $rootScope.httpRequests = [];

    var unloadingState = false;

    $(window).bind("beforeunload", function() {
        unloadingState = true;
    });

    // Return a proxified promise that can be disabled
    function disableOnExit(promise) {

        function isEnabled() {
            return !unloadingState;
        }

        var deferred = $q.defer();

        // $q promises
        promise.then(function(data) {

                if (isEnabled()) {
                    deferred.resolve(data);
                }
            },
            function(data) {
                if (isEnabled()) {
                    deferred.reject(data);
                }
            },
            function(data) {
                if (isEnabled()) {
                    deferred.notify(data);
                }
            });

        // $http specific
        if (promise.success) {
            deferred.promise.success = function(callback) {
                promise.success(function(data, status, headers, config, statusText, xhrStatus) {
                    if (isEnabled()) {
                        callback(data === 'null' ? null : data, status, headers, config, statusText, xhrStatus);
                    }
                });
                return deferred.promise;
            };
        }

        if (promise.error) {
            promise.error(function(data, status, headers) {
                var apiError = getErrorDetails(data, status, headers);
                Logger.error("API error: ", apiError.errorType + ": " + apiError.message);
            })
            deferred.promise.error = function(callback) {
                promise.error(function(data, status, headers, config, statusText, xhrStatus) {
                    if (isEnabled()) {
                        callback(data, status, headers, config, statusText, xhrStatus);
                    }
                });
                return deferred.promise;
            };
        }

        if (promise.noSpinner) {
            deferred.promise.noSpinner = promise.noSpinner;
        }

        return deferred.promise;
    }

    return function(method, url, data, spinnerMode) {
        var headers = {
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
        };

        var start = new Date().getTime();
        Logger.debug("[S] " + method + ' ' + url);

        var params = {
            method: method,
            url: url,
            headers: headers,
            transformRequest: function(data) {
                return angular.isObject(data) && String(data) !== '[object File]' ? jQuery.param(data) : data;
            },
        };
        if ($rootScope.appConfig) {
            params.xsrfCookieName = $rootScope.appConfig.xsrfCookieName;
        }
        if (method == 'GET') {
            params.params = data;
        } else {
            params.data = data;
        }

        var promise = $http(params);
        var disableSpinner = spinnerMode && spinnerMode == "nospinner";

        var logDone = function(result) {
            var end = new Date().getTime();
            Logger.debug("[D] " + method + ' ' + url + " (" + (end - start) + "ms)");
        }
        promise.then(logDone, logDone);

        if (!disableSpinner) {
            promise.spinnerMode = spinnerMode;
            $rootScope.httpRequests.push(promise);

            var removeRequest = function(result) {
                var idx = $rootScope.httpRequests.indexOf(promise);
                if (idx == -1) Logger.info("Unable to remove request"); /*@console*/
                if (idx != -1) $rootScope.httpRequests.splice(idx, 1);
            };

            promise.noSpinner = function() {
                removeRequest();
                safeApply($rootScope);
                return promise;
            };

            promise.then(removeRequest, removeRequest);
        }

        if (method=="POST") HistoryService.recordItemPost(url, data);

        return app.addSuccessErrorToPromise(promise);
    };
}]);


app.factory("CreateModalFromDOMElement", function(CreateModalFromHTML) {
    return function(selector, scope, controller, afterCompileCallback) {
        return CreateModalFromHTML($(selector).html(), scope, controller, afterCompileCallback, false);
    };
});

app.factory("CreateModalFromTemplate", function(CreateModalFromHTML, $http, $templateCache, $q) {
    return function(location, scope, controller, afterCompileCallback, noFocus, backdrop, keyboard) {
        var deferred = $q.defer();
        $q.when($templateCache.get(location) || $http.get(location, {cache: true})).then(function(template) {
            if (angular.isArray(template)) {
                template = template[1];
            } else if (angular.isObject(template)) {
                template = template.data;
            }
            deferred.resolve(CreateModalFromHTML(template, scope, controller, afterCompileCallback, noFocus, backdrop, keyboard));
        });
        return deferred.promise;
    }
});

app.factory("CreateModalFromHTML", function($timeout, $compile, $q, $rootScope) {
    let activeModals = [];

    $rootScope.$on('dismissModals', function() {
        activeModals.forEach((modalScope)=> unregisterModal(modalScope));
    });

    function registerModal(modalScope) {
        activeModals.unshift(modalScope);
    }

    function unregisterModal(modalScope) {
        activeModals = activeModals.filter((activeModalScope)=> {
            if(modalScope == activeModalScope) {
                modalScope.dismiss();
                return false;
            }
            return true;
        });
    }

    return function(template, scope, controller, afterCompileCallback, noFocus, backdrop, keyboard) {
        var deferred = $q.defer();
        var newDOMElt = $(template);
        if (controller != null) {
            newDOMElt.attr("ng-controller", controller);
        }
        newDOMElt.addClass("ng-cloak");

        const $existingModal = $('div.modal-container');
        let stackedClass = "";
        let waitForTransition = 0;
        if ($existingModal.length>0) {
            $existingModal.addClass('aside').removeClass('restored'); //move aside any existing modal in case of stacking
            waitForTransition = 250;
            stackedClass = "new-stacked"
        }

        var wrapper = $("<div>").addClass("modal-container " + stackedClass).append(newDOMElt);
        $("body").append(wrapper);

        /* Now, compile the modal, set its scope, call the callback and show it */
        $timeout(function() {
            var newScope = scope.$new();
            $compile(newDOMElt)(newScope);

            var modalScope = angular.element(newDOMElt).scope();

            if (afterCompileCallback) {
                modalScope.$apply(afterCompileCallback(modalScope, newDOMElt));
            }
            newDOMElt.on('hidden', function(e) {
                if (e.target == newDOMElt.get(0)) {
                    unregisterModal(modalScope);
                    wrapper.remove();
                    modalScope.$destroy();
                    if (deferred != null) {
                        deferred.reject("modal hidden");
                        deferred = null;
                    }
                }
            });

            var prepareForModalStack = function () {
                $('div.modal-backdrop').addClass('modal-rollup').removeClass('non-see-through'); //mjt in the event of stacking a modal
                $("div.modal-container.new-stacked").addClass("modal-stacked-on-top").removeClass("new-stacked");
            }
            prepareForModalStack();

            if (backdrop) {
                newDOMElt.attr('data-backdrop', backdrop);
            }

            if (keyboard) {
                newDOMElt.attr('data-keyboard', keyboard);
            }

            newDOMElt.modal("show");
            $rootScope.$broadcast("dismissPopovers");

            modalScope.unwindModalStack = function (newDOMElt) {
                $('div.modal-backdrop.modal-rollup').removeClass('modal-rollup').click(modalScope.dismiss);
                $('div.modal-container.aside').removeClass('aside').addClass('restored'); //move aside any existing modal in case of stacking
            };
            modalScope.dismiss = function() {
                newDOMElt.modal("hide");
                if (deferred != null) {
                    deferred.reject("dismissed modal");
                    deferred = null;
                }
            };

            registerModal(modalScope);

            modalScope.resolveModal = function(value) {
                if (deferred != null) {
                    deferred.resolve(value);
                    deferred = null;
                }
                newDOMElt.modal("hide");
            };
            modalScope.$modalScope = modalScope;

            $(newDOMElt).on('hide.bs.modal', function (e) {
                if (modalScope && modalScope.canCloseModal && typeof modalScope.canCloseModal === 'function') {
                    if (!modalScope.canCloseModal()) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        return false;
                    }
                }
                modalScope.unwindModalStack(newDOMElt);
            });

            modalScope.$on("dismissModal", modalScope.dismiss);

            if (!noFocus) {
                // the first form of the modal, should contain the modal-body in 99% of cases
                var firstForm = newDOMElt.find('form').first();
                // list of focusable elements we want to try, in order of preference
                var focusCandidateFinders = [];
                focusCandidateFinders.push(function() {
                    return firstForm.find('input[type="text"]').first();
                });
                focusCandidateFinders.push(function() {
                    return firstForm.find('button:submit').first();
                });
                focusCandidateFinders.push(function() {
                    return firstForm.find('button:button').first();
                });
                // if the modal has no form, or footer buttons are not in the form, look in the full modal
                focusCandidateFinders.push(function() {
                    return newDOMElt.find('input[type="text"]').first();
                });
                focusCandidateFinders.push(function() {
                    return newDOMElt.find('button:submit').first();
                });
                focusCandidateFinders.push(function() {
                    return newDOMElt.find('button:button').first();
                });
                focusCandidateFinders.push(function() {
                    return newDOMElt.find('.close').first();
                });

                var focusCandidate;
                for (var i = 0; i < focusCandidateFinders.length; i++) {
                    var focusCandidateFinder = focusCandidateFinders[i];
                    focusCandidate = focusCandidateFinder();
                    if (focusCandidate.length > 0) {
                        focusCandidate.focus();
                        // in some cases the element is disabled by a ng-disabled, and the focus behavior becomes a bit erratic
                        // so for safety we focus once more
                        $timeout(function() {
                            focusCandidate.focus();
                        });
                        break;
                    }
                }

                // in case the submit button is dangerous, prevent submit-on-enter
                if (firstForm.length > 0 && focusCandidate.hasClass('btn--danger')) { //NOSONAR: focusCandidate always initialized thanks to jquery first() specs
                    focusCandidate.bind("keydown keypress", function(event) {
                        if (event.which === 13) {
                            event.preventDefault();
                        }
                    });
                }
            }
        }, waitForTransition);

        return deferred.promise;
    };
});


/**
 * Create a custom body-attached DOM element within a new scope.
 * The new scope is fitted with a "dismiss" function, which destroys the DOM
 * element and the scope.
 */
app.factory("CreateCustomElementFromTemplate", ["$http", "$timeout", "$compile", "$templateCache", "$q", "$window",
    function($http, $timeout, $compile, $templateCache, $q, $window) {
        return function(location, scope, controller, afterCompileCallback, domInsertionCallback) {
            $q.when($templateCache.get(location) || $http.get(location, {cache: true})).then(function onSuccess(template) {
                if (angular.isArray(template)) {
                    template = template[1];
                } else if (angular.isObject(template)) {
                    template = template.data;
                }
                var newDOMElt = $(template);
                if (controller != null) {
                    newDOMElt.attr("ng-controller", controller);
                }

                if (domInsertionCallback != null) {
                    domInsertionCallback(newDOMElt);
                } else {
                    $("body").append(newDOMElt);
                }

                /* Now, compile the element, set its scope, call the callback */
                $timeout(function() {
                    var newScope = scope.$new();
                    $compile(newDOMElt)(newScope);
                    var newScope2 = angular.element(newDOMElt).scope();

                    if (afterCompileCallback) {
                        newScope2.$apply(afterCompileCallback(newScope2));
                    }
                    newScope2.$on("dismissModalInternal_", function() {
                        $timeout(function() {
                            newScope2.dismiss();
                        }, 0);
                    });
                    newScope2.dismiss = function() {
                        newDOMElt.remove();
                        newScope2.$destroy();
                    };
                    scope.$on("$destroy", newScope2.dismiss);
                });
            });
        };
    }
]);


/** Keeps a map of promises for static API calls */
app.factory("CachedAPICalls", function(DataikuAPI, Assert, $http, $rootScope) {
    return {
        processorsLibrary: DataikuAPI.shakers.getProcessorsLibrary().success(function(processors) {
            // Inject the doc link at this point so it is only done once.
            processors.processors.forEach(function(p) {
                if (p.docPage) {
                    p.help = p.help + "\n\nFor more info, <a target=\"_blank\" href=\""+
                    $rootScope.versionDocRoot + "preparation/processors/" + p.docPage + ".html"+
                    "\">please see the processor's reference</a>\n"
                }
            });
            return processors
        }),
        customFormulasFunctions: DataikuAPI.shakers.listCustomFormulasFunctions(),
        customFormulasReference: DataikuAPI.shakers.getCustomFormulasReference(),
        datasetTypes: DataikuAPI.datasets.get_types(),
        datasetCommonCharsets: DataikuAPI.datasets.get_common_charsets(),
        datasetFormatTypes: DataikuAPI.datasets.get_format_types(),
        flowIcons: $http.get("/static/dataiku/flow-iconset.json"),
        emojisTable: $http.get("/static/third/emoji.json").then(function(response) {
            Assert.trueish(response.data, 'No emoji returned');
            Assert.trueish(angular.isArray(response.data), 'Emojis were not returned as an array');
            const emojisTable = {};
            response.data.forEach(function(x) {
                emojisTable[x['sn']] = x['code'].split('-').map(x => '&#x' + x + ';').join('');
            });
            return emojisTable;
        })
    };
});


app.service('ComputablesService', function(CreateModalFromTemplate, DataikuAPI, TaggableObjectsUtils, Dialogs) {
    this.clear = function(scope, taggableItems) {
        return CreateModalFromTemplate("/templates/taggable-objects/clear-data-modal.html", scope, null, function(modalScope) {
            modalScope.taggableItems = taggableItems;
            modalScope.itemsType = TaggableObjectsUtils.getCommonType(taggableItems, it => it.type);

            modalScope.confirm = function() {
                DataikuAPI.taggableObjects.clear(taggableItems).success(function(data) {
                    if (data.anyMessage && !data.success) {
                        modalScope.dismiss();
                        Dialogs.infoMessagesDisplayOnly(scope, "Clear result", data);
                    } else {
                        modalScope.resolveModal(data);
                    }
                }).error(setErrorInScope.bind(scope));
            }
        });
    };
});


app.service('DatasetsService', function($rootScope, $q, DataikuAPI, Logger, Notification, ComputablesService, FutureProgressModal, CreateModalFromTemplate) {
    const svc = this;

    svc.listPerProject = {};
    function ensureListPerProject(projectKey) {
        if (svc.listPerProject[projectKey] == null) {
            svc.updateProjectList(projectKey);
            svc.listPerProject[projectKey] = []; // this prevents multiple calls to updateProjectList()
        }
    }

    svc.listPromise = function(projectKey) {
        return DataikuAPI.datasets.list(projectKey);
    };

    svc.updateProjectList = function(projectKey) {
        return DataikuAPI.datasets.listNames(projectKey).success(function(data) {
            svc.listPerProject[projectKey] = data;
        });
    }

    svc.isRenamingValid = function(projectKey, oldName, newName) {
        if (!newName) return false;
        if (oldName == newName) return true;
        if (!newName.match(/^[\w_]+$/)) return false;

        ensureListPerProject(projectKey);
        for (let k in svc.listPerProject[projectKey]) {
            if (svc.listPerProject[projectKey][k].toLowerCase() == newName.toLowerCase()) {
                return false;
            }
        }
        return true;
    };

    svc.cleanupAndTransmogrify = function(projectKey, name) {
        name = name.replace(/[^A-z0-9_]/, "_");
        ensureListPerProject(projectKey);

        let cur = name;
        let i = 0;
        while (true) {
            if (!(cur in Object.keys(svc.listPerProject[projectKey]))) {
                return cur
            }
            cur = name + "_" + (++i)
        }
    };

    svc.clear = function(scope, projectKey, datasetName) {
        return ComputablesService.clear(scope, [{
            type: 'DATASET',
            projectKey: projectKey,
            id: datasetName,
            displayName: datasetName
        }]);
    };

    svc.refreshSummaries = function(scope, selectedItems, computeRecords = true, forceRecompute = false) {
        const deferred = $q.defer();
        DataikuAPI.datasets.refreshSummaries(selectedItems, computeRecords, forceRecompute).success(function(data) {
            FutureProgressModal.show(scope, data, "Refresh datasets status")
                .then(data => deferred.resolve(data), data => deferred.reject(data));
        }).error(setErrorInScope.bind(scope));
        return deferred.promise;
    };

    svc.setVirtualizable = function(scope, selectedItems, virtualizable) {
        const datasets = selectedItems.filter(it => it.type == 'DATASET');
        return DataikuAPI.datasets.setVirtualizable(datasets, !!virtualizable)
            .error(setErrorInScope.bind(scope));
    };

    svc.startSetAutoCountOfRecords = function(selectedItems) {
        return CreateModalFromTemplate("/templates/datasets/set-auto-count-of-records-modal.html", $rootScope, null, function(modalScope) {
            modalScope.autoCountOfRecords = false;

            modalScope.ok = function(vitualizable) {
                svc.setAutoCountOfRecords(selectedItems, modalScope.autoCountOfRecords)
                    .then(modalScope.resolveModal, setErrorInScope.bind(modalScope));
            };
        });
    };

    svc.setAutoCountOfRecords = function(selectedItems, autoCountOfRecords) {
        return DataikuAPI.datasets.setAutoCountOfRecords(selectedItems, autoCountOfRecords);
    };

    Notification.registerEvent("datasets-list-changed", function(evt, message) {
        Logger.info("Datasets list changed, updating");
        //svc.updateProjectList(message.projectKey);
        delete svc.listPerProject[message.projectKey]; // just invalidate
    });
});

/** Cached access to datasets information */
app.factory("DatasetInfoCache", function($stateParams, DataikuAPI, $q, Notification, Logger) {
    // Cache for results of datasets/get
    var simpleCache = {}
    Notification.registerEvent("websocket-status-changed", function() {
        Logger.info("Websocket status change, dropping dataset cache");
        simpleCache = {};
    });
    Notification.registerEvent("datasets-list-changed", function(evt, message) {
        Logger.info("Datasets list changed, dropping cache for ", message.projectKey);
        delete simpleCache[message.projectKey];
    });
    var svc = {
        getSimple: function(projectKey, name) {
            var projectCache = simpleCache[projectKey];
            if (projectCache != null) {
                var data = projectCache[name];
                if (data != null) {
                    Logger.info("Cache hit: " + projectKey + "." + name);
                    return $q.when(data);
                }
            } else {
                simpleCache[projectKey] = {};
            }
            Logger.info("Cache miss: " + projectKey + "." + name);
            return DataikuAPI.datasets.get(projectKey, name, $stateParams.projectKey).then(function(data) {
                simpleCache[projectKey][name] = data.data;
                return data.data;
            });
        }
    }
    return svc;
});


/** This service maintains a cache of recipe names per project */
app.factory("RecipesService", ["DataikuAPI", "$q", "Notification", "Logger", function(DataikuAPI, $q, Notification, Logger) {
    var ret = {}
    ret.listPerProject = {}

    Notification.registerEvent("recipes-list-changed", function(evt, message) {
        Logger.info("Recipes list changed, updating");
        ret.updateProjectList(message.projectKey);
    });

    ret.listPromise = function(projectKey) {
        return DataikuAPI.flow.recipes.list(projectKey);
    };

    ret.updateProjectList = function(projectKey) {
        var deferred = $q.defer();
        ret.listPromise(projectKey).success(function(data) {
            ret.listPerProject[projectKey] = $.map(data, function(recipe) {
                return recipe.name;
            });
            deferred.resolve();
        });
        return deferred.promise;
    };

    ret.isRenamingValid = function(projectKey, oldName, newName) {
        if (!newName) return false;
        if (oldName == newName) return true;

        if (!ret.listPerProject[projectKey]) return true;
        for (var k in ret.listPerProject[projectKey]) {
            if (ret.listPerProject[projectKey][k].toLowerCase() == newName.toLowerCase()) {
                return false;
            }
        }
        return true;
    };

    return ret;
}]);


app.service("extractInsightChart", function() {
    return function(chartScope) {
        var retainedFields = [
            "genericMeasures",
            "dimensions",
            "type",
            "includeZero",
            "yAxisMode",
            "xAxisMode",
            "computeMode",
            "filters",
            "colorMeasures",
            "sizeMeasures",
            "measures",
            "typedMeasures",
            "hexbin",
            "hexbinRadius",
            "chartOptions",
            "includeZero",
            "smoothing"
        ];
        var chart = {};
        for (var i = 0; i < retainedFields.length; i++) {
            var fieldKey = retainedFields[i];
            chart[fieldKey] = chartScope.data[fieldKey];
        }
        //return chart;
        return angular.copy(chartScope.data);
    }
});


// Queue
//
// var lockable = Queue();
// lockable.exec(function() { alert('A'); }); // Executed right now
// var unlock = lockable.lock(); // Lock the object
// lockable.exec(function() { alert('B'); }); // Not executed
// lockable.exec(function() { alert('C'); }); // Not executed
// unlock(); // Execute alert('A') & alert('B');
//
// The queue can be tied to a promise
// lockable.lockOnPromise(DataikuAPI.xxx(yyy,zzz).success(function() {
//     ...
// }));
//
app.factory("Queue", function() {

    return function() {

        var semaphore = 0;
        var queue = [];
        var destroyed = false;
        var scopeUnregisterer = undefined;
        var inside = false;

        var processQueue = function() {
            while (!destroyed && semaphore == 0 && queue.length > 0) {
                if (!inside) {
                    try {
                        inside = true;
                        queue.splice(0, 1)[0]();
                    } finally {
                        inside = false;
                    }
                } else {
                    break;
                }
            }
        };

        var exec = function(fn) {
            if (fn && !destroyed) {
                queue.push(fn);
                processQueue();
            }
        };

        var destroy = function() {
            destroyed = true;
            queue = [];
        };

        var wrap = function(func) {
            return function() {
                var args = arguments;
                exec(function() {
                    if (func) {
                        func.apply(null, args);
                    }
                });
            };
        };

        var lock = function() {
            if (destroyed) {
                return;
            }
            semaphore++;
            var unlocked = false;
            return function() {
                if (!unlocked) {
                    semaphore--;
                    unlocked = true;
                    processQueue();
                }
            };
        };

        var ret = {

            withScope: function(scope) {
                if (scopeUnregisterer) {
                    scopeUnregisterer();
                }
                if (scope) {
                    scopeUnregisterer = scope.$on('$destroy', destroy);
                }
                return ret;
            },
            locked: function() {
                return destroyed || semaphore > 0;
            },
            exec: function(fn) {
                exec(fn);
            },
            wrap: function(fn) {
                return wrap(fn);
            },
            lockOnPromise: function(promise) {
                if (promise && promise['finally']) {
                    var unlocker = lock();
                    promise['finally'](function() {
                        unlocker();
                    });
                }
                return promise;
            },
            lock: function() {
                return lock();
            }
        };
        return ret;
    };

});

// MonoFuture
//
// - Wait for future result
// - Abort the previous future as soon as a new one is started
//
// Usage :
//
// var monoFuture = MonoFuture(scope); // If a scope is passed, life time of monofuture = life time of the scope
// monoFuture.exec(DataikuAPI.xxx.getYYYFuture(zzz)).success(function(data) {
// ...
// }).update(function(data) {
// ...
// }).error(...);
//
//  OR by wrapping the DataikuAPI function directly
//
//  var apiCall = MonoFuture().wrap(DataikuAPI.xxx.getYYYFuture);
//  apiCall(zzz).success(...);
//
//
//
app.factory("MonoFuture", ["$q", "DataikuAPI", "Throttle", function($q, DataikuAPI, Throttle) {

    return function(scope) {

        var promises = [];
        var destroyed = false;

        // Refresh the state of the last promise
        var refreshFutureState = Throttle().withDelay(1000).wrap(function() {

            updateInternalState();

            if (promises.length > 0) {
                var last = promises[promises.length - 1];
                if (!last.hasResult && !last.waiting) {
                    last.waiting = true;
                    DataikuAPI.futures.getUpdate(last.id).success(function(data, status, headers) {

                        last.waiting = false;
                        last.result = {data: data, status: status, headers: headers};
                        if (data.hasResult) {
                            last.hasResult = true;
                        } else {
                            if (!last.aborted) {
                                last.deferred.notify(last.result);
                            }
                            refreshFutureState();
                        }

                        updateInternalState();

                    }).error(function(data, status, headers) {

                        last.failed = true;
                        last.result = {data: data, status: status, headers: headers};
                        last.hasResult = true;
                        last.waiting = false;

                        updateInternalState();
                    });
                }
            }
        });

        // Update current state
        var updateInternalState = function() {
            // Abort all abortable futures & remove them
            var loop = false;
            do {
                loop = false;
                for (var i = 0; i < promises.length; i++) {
                    var isLast = i == (promises.length - 1);
                    var promise = promises[i];
                    promise.aborted |= !isLast;
                    if (promise.aborted && !promise.waiting) {

                        // We have the future id, and not the result meaning that the future is running
                        if (promise.id && !promise.hasResult) {
                            // Abort me
                            DataikuAPI.futures.abort(promise.id);
                        }

                        promises.splice(i, 1);
                        loop = true;
                        break;
                    }
                }
            } while (loop);

            // Check last one : finished?
            if (promises.length > 0) {
                var last = promises[promises.length - 1];
                if (last.hasResult && !last.aborted) {
                    promises.splice(promises.length - 1, 1);
                    if (last.failed) {
                        last.deferred.reject(last.result);
                    } else if (last.result && last.result.data && last.result.data.aborted) {
                        // The future has been aborted by someone
                        last.deferred.reject(last.result);
                    } else {
                        last.deferred.resolve(last.result);
                    }
                }
            }
        };

        var fakePromise = function() {
            var promise = $q.defer().promise;
            promise.success = function() {
                return promise;
            };
            promise.error = function() {
                return promise;
            };
            promise.update = function() {
                return promise;
            };
            return promise;
        };

        var exec = function(apiPromise) {
            if (destroyed || !apiPromise || !apiPromise.success) {
                return fakePromise();
            }
            var deferred = $q.defer();
            var promise = {
                id: null,
                hasResult: false,
                result: undefined,
                deferred: deferred,
                aborted: false,
                failed: false,
                waiting: true,
                noSpinner: apiPromise.noSpinner
            };
            promises.push(promise);
            updateInternalState();
            apiPromise.success(function(data, status, headers) {
                promise.waiting = false;
                promise.result = {data, status, headers};
                if (data) {
                    promise.id = data.jobId;
                }
                if (data.hasResult) {
                    promise.hasResult = true;
                } else {
                    refreshFutureState();
                }
                updateInternalState();
            }).error(function(data, status, headers) {
                promise.failed = true;
                promise.result = {data, status, headers};
                if (data) {
                    promise.id = data.jobId;
                }
                promise.hasResult = true;
                promise.waiting = false;
                updateInternalState();
            });

            deferred.promise.success = function(fn) {
                deferred.promise.then(function(data) {
                    fn(data.data, data.status, data.headers);
                });
                return deferred.promise;
            };

            deferred.promise.error = function(fn) {
                deferred.promise.then(null, function(data) {
                    fn(data.data, data.status, data.headers);
                });
                return deferred.promise;
            };

            deferred.promise.update = function(fn) {
                deferred.promise.then(null, null, function(data) {
                    fn(data.data, data.status, data.headers);
                });
                return deferred.promise;
            };

            deferred.promise.noSpinner = function() {
                promises.forEach(function(p) {
                    if (p.noSpinner) p.noSpinner();
                });
                return deferred.promise;
            };

            return deferred.promise;
        };

        var abort = function() {
            if (promises.length > 0) {
                promises[promises.length - 1].aborted = true;
                updateInternalState();
            }
        };

        var destroy = function() {
            abort();
            destroyed = true;
        };

        const active = function() {
            return promises.length > 0;
        };

        if (scope && scope.$on) {
            scope.$on('$destroy', destroy);
        }

        return {

            exec: exec,
            wrap: function(func) {
                return function() {
                    return exec(func.apply(func, arguments));
                };
            },
            abort: abort,
            destroy: destroy,
            active: active
        };
    };
}]);

// Provide a way to take/release the spinner
//
// Usage:
//
//  var spinner = SpinnerService();   // The spinner is permanently released automatically when scope is destroyed
//  spinner.acquire();
//  /* spinning... */
//  spinner.release(); // It's safe to release it multiple time
//
//
//  The spinner can be tied to a promise like that:
//  SpinnerService.lockOnPromise(promise);
app.factory("SpinnerService", ["$rootScope", function($rootScope) {
    let fakeReq = {}; // Doesn't matter what this object is, it's never used anyway...
    let actives = 0; // Number of active spinners
    let scopeUnregisterer = null;

    // TODO : implement this properly
    // (currently it's  is a little hack around $rootScope.httpRequests)
    function update() {
        // Reset
        let idx = $rootScope.httpRequests.indexOf(fakeReq);
        if (idx != -1) {
            $rootScope.httpRequests.splice(idx, 1);
        }
        // Activate
        if (actives > 0) {
            $rootScope.httpRequests.push(fakeReq);
        }
    }

    function fnr() {
        let acquired = false;
        let destroyed = false;
        function acquire() {
            if (destroyed) {
                return;
            }
            if (!acquired) {
                acquired = true;
                actives++;
                update();
            }
        }
        function release() {
            if (acquired) {
                acquired = false;
                actives--;
                update();
            }
        }
        function destroy() {
            destroyed = true;
            release();
        }

        const ret = {
            acquire: acquire,
            release: release,
            destroy: destroy,
            withScope: function(scope) {
                if (scopeUnregisterer) {
                    scopeUnregisterer();
                }
                if (scope) {
                    scopeUnregisterer = scope.$on('$destroy', destroy);
                }
                return ret;
            }
        };
        return ret;
    };

    fnr.lockOnPromise = function(promise) {
        if (promise && promise['finally']) {
            var lock = fnr();
            lock.acquire();
            promise['finally'](function() {
                lock.release();
            });
        }
    }
    return fnr;
}]);


// Ability to merge watch calls into one (old value is kept, new value is updated)
function wrapWatchHelper(ctrl, fn) {
    var isSet = false;
    var oldVal = undefined;
    var newVal = undefined;

    var trueExec = ctrl.wrap(function() {
        if (!angular.equals(newVal, oldVal)) {
            isSet = false;
            fn(newVal, oldVal);
        }
    });

    return function(nv, ov) {
        if (isSet) {
            newVal = angular.copy(nv);
        } else {
            isSet = true;
            oldVal = angular.copy(ov);
            newVal = angular.copy(nv);
        }
        trueExec();
    };
};

// Debounce
// API is similar to Throttle but it implements a behavior similar to the "onSmartChange" directive as a service
//
// var fn = Debounce
//    .withDelay(500,1000)   // initial delay = 500ms, then delay = 1000ms
//    .withSpinner(true)
//    .wrap(function() {
//        console.log('hello');
//     });
//
// Example 1:
//
// fn(); // Will be executed in 500ms
//
// Example 2 :
// fn();  // Will be dropped
// [sleep less than 100ms]
// fn();  // Will be executed in 1000s
//
//
app.factory("Debounce", ["SpinnerService", "$rootScope", function(SpinnerService, $rootScope) {

    return function(scope) {

        var initialDelay = 0;
        var delay = 0;
        var destroyed = false;
        var spinner = SpinnerService();
        var enableSpinner = false;
        var stdTimer = null;
        var initTimer = null;
        var scopeUnregisterer = null;

        var exec = function(func) {

            if (destroyed) {
                return;
            }

            var wrapped = function debounceExecWrapped() {
                var toBeExec;
                if (func) {
                    spinner.release();
                    toBeExec = func;
                    func = null;
                }
                if (toBeExec) {
                    $rootScope.$apply(function debounceExec() {
                        toBeExec();
                    });
                } else {
                    // Important because the activity state may have changed!
                    $rootScope.$digest();
                }
            };

            var isFirst = true;
            if (stdTimer) {
                clearTimeout(stdTimer.key);
                stdTimer = null;
                isFirst = false;
            }

            if (initTimer) {
                clearTimeout(initTimer.key);
                initTimer = null;
                isFirst = false;
            }

            if (enableSpinner) {
                spinner.acquire();
            }

            if (isFirst) {

                initTimer = {
                    key: setTimeout(function() {
                        initTimer = null;
                        wrapped();
                    }, initialDelay)
                };

                stdTimer = {
                    key: setTimeout(function() {
                        stdTimer = null;
                        wrapped();
                    }, delay)
                };

            } else {

                stdTimer = {
                    key: setTimeout(function() {
                        stdTimer = null;
                        wrapped();
                    }, delay)
                };
            }
        }

        var abort = function() {
            spinner.release();
            if (initTimer) {
                clearTimeout(initTimer.key);
                initTimer = null;
            }
            if (stdTimer) {
                clearTimeout(stdTimer.key);
                stdTimer = null;
            }
        };

        var wrap = function debounceWrap(func) {
            return function debounceWrapped() {
                var args = arguments;
                exec(function debounceWrappedCB() {
                    func.apply(null, args);
                });
            };
        };

        var destroy = function() {
            console.info("Destroy debounce on scope", scope); // NOSONAR
            destroyed = true;
            abort();
        };

        var ret = {
            exec: function(func) {
                exec(func);
            },
            wrap: function(func) {
                return wrap(func);
            },
            wrapWatch: function(fn) {
                return wrapWatchHelper(ret, fn);
            },
            active: function() {
                return !!(initTimer || stdTimer);
            },
            abort: function() {
                abort();
            },
            destroy: function() {
                destroy();
            },
            withDelay: function(newInitialDelay, newDelay) {
                delay = newDelay;
                initialDelay = newInitialDelay;
                return ret;
            },
            withSpinner: function(enabled) {
                enableSpinner = enabled;
                return ret;
            },
            withScope: function(scope) {
                if (scopeUnregisterer) {
                    scopeUnregisterer();
                }
                if (scope) {
                    scopeUnregisterer = scope.$on('$destroy', destroy);
                }
                spinner.withScope(scope);
                return ret;
            }
        };
        return ret;

    };
}]);


// Limit the maximum update frequency to 1/delay
// Some calls will be dropped in order to limit update frequency
//
// Usage:
//
// var throttle = Throttle().withScope(scope).withDelay(1000);  // If a scope is passed, life time of monofuture = life time of the scope
//
// throttle.exec(func1); // Executed now (= after the current event loop)
// throttle.exec(func2); // Dropped (because of func3)
// throttle.exec(func3); // Dropped (because of func4)
// throttle.exec(func4); // Executed 1 second later
//
// It's also possible to permanently wrap a function :
// myFunc = Throttle().wrap(function() {
//    ...
// });
// myFunc(); // executed (= after the current event loop)
// myFunc(); // dropped
// myFunc(); // delayed
//
app.factory("Throttle", ["$timeout", function($timeout) {

    return function() {

        var delay = 0;
        var currentlyWaitingOn = null;
        var storedFunc = null;
        var destroyed = false;
        var scopeUnregisterer = null;

        var waitCallback = function() {
            var toBeExec;
            if (storedFunc) {
                toBeExec = storedFunc;
                storedFunc = null;
                currentlyWaitingOn = $timeout(waitCallback, delay);
            } else {
                currentlyWaitingOn = null;
            }
            // Re-entrant safe
            if (toBeExec) {
                toBeExec();
            }
        }
        var exec = function(func) {
            if (destroyed) {
                return;
            }
            if (!func) {
                func = function() {
                };
            }
            if (currentlyWaitingOn) {
                storedFunc = func;
                // It will be called later :)
            } else {
                // Execute now
                // ... and setup a timeout to drop further calls for 'delay' ms
                $timeout(func);
                storedFunc = null;
                currentlyWaitingOn = $timeout(waitCallback, delay);
            }
        };

        var wrap = function(func) {
            return function() {
                var args = arguments;
                exec(function() {
                    func.apply(null, args);
                });
            };
        };

        var abort = function() {
            if (currentlyWaitingOn) {
                $timeout.cancel(currentlyWaitingOn);
                currentlyWaitingOn = null;
            }
            storedFunc = null;
        };

        var destroy = function() {
            abort();
            destroyed = true;
        };


        var ret = {
            exec: function(func) {
                exec(func);
            },
            wrap: function(func) {
                return wrap(func);
            },
            wrapWatch: function(fn) {
                return wrapWatchHelper(ret, fn);
            },
            active: function() {
                return !!storedFunc;
            },
            abort: function() {
                abort();
            },
            destroy: function() {
                destroy();
            },
            withDelay: function(newDelay) {
                delay = newDelay;
                return ret;
            },
            withScope: function(scope) {
                if (scopeUnregisterer) {
                    scopeUnregisterer();
                }
                if (scope) {
                    scopeUnregisterer = scope.$on('$destroy', destroy);
                }
                return ret;
            }
        };
        return ret;
    };

}]);


app.factory("DKUtils", function($rootScope, $state, $stateParams, $timeout, Logger) {
    return {
        /* Reflows at current digest */
        reflowNow: function() {
            $rootScope.$broadcast("reflow");
        },

        /* Reflows at next digest */
        reflowNext: function() {
            $timeout(function() {
                $rootScope.$broadcast("reflow")
            }, 0);
        },
        /* It's probably bad if you need this */
        reflowLater: function() {
            $timeout(function() {
                Logger.info("delayed reflow");
                $rootScope.$broadcast("reflow")
            }, 400);
        },
        /* Reload current state. Works around broken $state.reload() */
        reloadState: function() {
            $state.transitionTo($state.current,
                angular.copy($stateParams),
                {reload: true, inherit: true, notify: true});
        }
    }
});


app.factory("PluginsService", function($rootScope, DataikuAPI, WT1, StateUtils) {
    const namingConvention = '^[a-z][a-z0-9-]*$';
    const isValidComponentId = function(newComponentId, pluginId, pluginComponentsOfSameType) {
        if (!newComponentId) return false;
        if (newComponentId.startsWith(pluginId)) return false;
        return !pluginComponentsOfSameType.some(_ => _.id ==  newComponentId
                                              || (pluginId + "_" + _.id) === newComponentId
                                              || _.id === (pluginId + "_" + newComponentId)
                                              || (pluginId + "_" + _.id) === (pluginId + "_" + newComponentId));
    };
    var svc = {
        namingConvention: namingConvention,
        transformToDevPlugin: function(modalScope, convertAPIFunc, getAPICallParams, eventWT1Name, componentType, originalType) {
            DataikuAPI.plugindev.list().success(function(data) {
                modalScope.devPlugins = data;
            }).error(setErrorInScope.bind(modalScope));

            modalScope.convert = {
                mode: 'NEW',
                pattern: namingConvention
            };

            modalScope.isIdValid = function() {
                if (modalScope.convert.mode === 'EXISTING') {
                    if (!modalScope.convert.targetPluginId) return false;
                    const plugin = modalScope.devPlugins.find(_ => _.desc.id === modalScope.convert.targetPluginId);
                    return isValidComponentId(modalScope.convert.targetFolder,
                                                            modalScope.convert.targetPluginId,
                                                            plugin.content[componentType]);
                }
                if (!modalScope.convert.newPluginId) return false;
                return isValidComponentId(modalScope.convert.targetFolder,
                                                        modalScope.convert.newPluginId,
                                                        []);
            };

            modalScope.go = function() {
                resetErrorInScope(modalScope);
                convertAPIFunc(...getAPICallParams(modalScope)).success(function(data) {
                    WT1.event(eventWT1Name, {original: originalType});
                    modalScope.reloadPluginConfiguration();
                    StateUtils.go.pluginEditor(data.pluginId, data.relativePathToOpen);
                }).error(setErrorInScope.bind(modalScope));
            };
        },
        isValidComponentId: isValidComponentId,
        getPluginDesc(pluginId) {
            return $rootScope.appConfig.loadedPlugins.find(x => x.id == pluginId);
        },
        isPluginLoaded: function(pluginId) {
            var i, plugin;
            for (i = 0; i < $rootScope.appConfig.loadedPlugins.length; i++) {
                plugin = $rootScope.appConfig.loadedPlugins[i];
                if (plugin.id == pluginId) return true;
            }
            return false;
        },
        getDatasetLoadedDesc : function(datasetType) {
            return $rootScope.appConfig.customDatasets.find(x => x.datasetType == datasetType);
        },
        getFSProviderLoadedDesc : function(fsProviderType) {
            return $rootScope.appConfig.customFSProviders.find(x => x.fsProviderType == fsProviderType);
        },
        getRecipeLoadedDesc : function(recipeType) {
            return $rootScope.appConfig.customCodeRecipes.find(x => x.recipeType == recipeType);
        },
        getOwnerPluginDesc: function(loadedDesc) {
            if (loadedDesc != null) {
                return $rootScope.appConfig.loadedPlugins.find(x => x.id == loadedDesc.ownerPluginId);
            } else {
                return null; // plugin most likely removed
            }
        },
        getRecipeIcon: function(recipeType) {
            var loadedDesc = svc.getRecipeLoadedDesc(recipeType);
            if (loadedDesc && loadedDesc.desc && loadedDesc.desc.meta && loadedDesc.desc.meta.icon) {
                return loadedDesc.desc.meta.icon;
            } else {
                var pluginDesc = svc.getOwnerPluginDesc(loadedDesc);
                if (pluginDesc) {
                    return pluginDesc.icon || "icon-visual_prep_sync_recipe";
                } else {
                    return "icon-visual_prep_sync_recipe"; // plugin has been removed
                }
            }
        },
        getDatasetIcon: function(datasetType) {
            var loadedDesc = svc.getDatasetLoadedDesc(datasetType);
            if (loadedDesc == null) {
                loadedDesc = svc.getFSProviderLoadedDesc(datasetType);
            }
            if (loadedDesc == null ) {
                return "icon-question-sign";
            }
            if (loadedDesc && loadedDesc.desc && loadedDesc.desc.meta && loadedDesc.desc.meta.icon) {
                return loadedDesc.desc.meta.icon;
            } else {
                var pluginDesc = svc.getOwnerPluginDesc(loadedDesc);
                if (pluginDesc) {
                    return pluginDesc.icon || "icon-puzzle-piece";
                } else {
                    return "icon-puzzle-piece"; // plugin has been removed
                }
           }
        },
        getDatasetLabel : function(datasetType) {
            var loadedDesc = svc.getDatasetLoadedDesc(datasetType);
            if (loadedDesc == null) {
                loadedDesc = svc.getFSProviderLoadedDesc(datasetType);
            }
            if (loadedDesc == null ) return null;

            if (loadedDesc.desc && loadedDesc.desc.meta && loadedDesc.desc.meta.label) {
                return loadedDesc.desc.meta.label;
            } else {
               return datasetType;
            }
        }
    };
    return svc;
});


app.factory("PluginConfigUtils", function() {
    return {
        setDefaultValues: function(params, customConfig) {
            if (!customConfig) {
                return;
            }
            params.forEach(function(param) {
                if (customConfig[param.name] === undefined) {
                    if (param.defaultValue) {
                        // the type is not checked, so if the default is not of the right type, strange things can happen
                        customConfig[param.name] = param.defaultValue;
                    } else if (param.type == 'BOOLEAN') {
                        customConfig[param.name] = false;
                    } else if (param.type == 'INT' || param.type == 'DOUBLE') {
                        customConfig[param.name] = 0;
                    } else if (param.type == 'MAP') {
                        customConfig[param.name] = {};
                    } else if (param.type == 'KEY_VALUE_LIST') {
                        customConfig[param.name] = [];
                    } else if (param.type == 'ARRAY') {
                        customConfig[param.name] = [];
                    } else if (param.type == 'OBJECT_LIST') {
                        customConfig[param.name] = [];
                    }
                }
            });
        }
    }
});


app.factory("FutureProgressUtils", function() {
    var svc = {
        getTotalProgressPercentage: function(progress) {
            var percentage = 0;
            var fractionOf = 100;
            if (progress && progress.states) {
                angular.forEach(progress.states, function(state) {
                    if (state.target > 0) {
                        fractionOf = fractionOf / (state.target + 1);
                        percentage += fractionOf * state.cur;
                    }
                });
            }
            return percentage;
        }
    }
    return svc;
})

// Store large things, and give them a unique ID. It's backed by a very small LRU cache, and its purpose is
// to overcome the limitations of $stateParams when trying to pass big data in the URL
app.factory("BigDataService", ['$cacheFactory', function($cacheFactory) {
    var cache = $cacheFactory('BigDataServiceCache', {
        number: 20
    });
    return {
        store: function(bigdata) {
            var id = generateRandomId(10);
            cache.put(id, {data: bigdata});
            return id;
        },
        fetch: function(id) {
            var val = cache.get(id);
            if (!val) {
                return undefined;
            }
            return val.data;
        }
    };
}]);


app.factory("SQLExplorationService", ['$rootScope', '$cacheFactory', '$q', '$stateParams', 'Logger', 'DataikuAPI',
            function($rootScope, $cacheFactory, $q, $stateParams, Logger, DataikuAPI) {

    var cache = $cacheFactory('SQLExplorationServiceCache', {
        number: 50
    });

    var sep = '^~\n$* \\#';

    function connectionKey(connectionName) {
        return 'CNX' + sep + connectionName + sep;
    }

    function tableKey(projectKey, connection, schema, table) {
        if (!schema) {
            schema = '';
        }
        return 'TBL' + sep + schema + sep + table + sep + connection + sep + projectKey;
    }

    function listFieldsForTable(connection, table, projectKey) {
        var deferred = $q.defer();

        var key = tableKey(projectKey, connection, table.schema, table.table);
        var cached = cache.get(key);
        if (cached) {
            deferred.resolve(cached);
            Logger.info("Loaded fields of table " + table.table + " from cache");
        } else {
            DataikuAPI.connections.listSQLFields(connection, [table], projectKey).success(function(data) {
                cache.put(key, data);
                deferred.resolve(data);
                Logger.info("Loaded fields of table " + table.table + " from backend");
            }).error(setErrorInScope.bind($rootScope));
        }

        return deferred.promise;

    }

    return {
        listTables: function(connectionName, projectKey) {
            var deferred = $q.defer();
            var id = connectionKey(connectionName) + '__all__' + projectKey;
            var cached = cache.get(id);

            if (cached) {
                deferred.resolve(cached);
                Logger.info("Loaded tables list for connection " + connectionName + " from cache");
            } else {
                DataikuAPI.connections.listSQLTables(connectionName, projectKey).success(function(data) {
                    cache.put(id, data);
                    deferred.resolve(angular.copy(data));
                    Logger.info("Loaded tables list for connection " + connectionName + " from backend");
                }).error(setErrorInScope.bind($rootScope));
            }
            return deferred.promise;
        },
        listTablesFromProject: function(connectionName, projectKey) {
            var deferred = $q.defer();
            var id = connectionKey(connectionName) + '__fromProject__' + projectKey;
            var cached = cache.get(id);

            if (cached) {
                deferred.resolve(cached);
                Logger.info("Loaded tables list for connection " + connectionName + " and projectKey " + projectKey + " using cache");
            } else {
                DataikuAPI.connections.listSQLTablesFromProject(connectionName, projectKey).success(function(data) {
                    cache.put(id, data);
                    deferred.resolve(angular.copy(data));
                    Logger.info("Loaded tables list for connection " + connectionName + " and projectKey " + projectKey + " from backend");
                }).error(setErrorInScope.bind($rootScope));
            }
            return deferred.promise;
        },
        clearCache: function() {
            cache.removeAll();
        },
        listFields: function(connectionName, tables) {
            var promises = [];
            for (var i = 0; i < tables.length; i++) {
                promises.push(listFieldsForTable(connectionName, tables[i], $stateParams.projectKey));
            }
            var deferred = $q.defer();
            $q.all(promises).then(function(results) {
                var out = [];
                for (var i in results) {
                    out = out.concat(results[i]);
                }
                deferred.resolve(angular.copy(out));
            });
            return deferred.promise;
        }
    };
}]);


app.factory("SmartId", function($stateParams) {
    return {
        create: function(id, contextProjectKey) {
            if (contextProjectKey == $stateParams.projectKey) {
                return id;
            } else {
                return contextProjectKey + "." + id;
            }
        },

        resolve: function(smartId, contextProject) {
            if (contextProject === undefined) {
                contextProject = $stateParams.projectKey
            }
            if (smartId && smartId.indexOf(".") > 0) {
                var chunks = smartId.split(".");
                return {projectKey: chunks[0], id: chunks[1]}
            } else {
                return {projectKey: contextProject, id: smartId};
            }
        },

        fromRef: function(smartObjectRef, contextProject) {
            if (contextProject === undefined) {
                contextProject = $stateParams.projectKey
            }
            if (smartObjectRef.objectType == 'PROJECT') {
                return smartObjectRef.objectId;
            }
            if (!smartObjectRef.projectKey || !smartObjectRef.projectKey.length || smartObjectRef.projectKey == contextProject) {
                return smartObjectRef.objectId;
            } else {
                return smartObjectRef.projectKey + "." + smartObjectRef.objectId;
            }
        },

        fromTor: function(tor, contextProject) {
            if (contextProject === undefined) {
                contextProject = $stateParams.projectKey
            }
            if (tor.taggableType == 'PROJECT') {
                return tor.id;
            }
            if (!tor.projectKey || !tor.projectKey.length || tor.projectKey == contextProject) {
                return tor.id;
            } else {
                return tor.projectKey + "." + tor.id;
            }
        }
    }
});


app.service("FeatureNameUtils", function($filter, Fn) {

    /*
     Returns an object with :
     .elements, an array of strings representing
     consecutive elements of processed the feature name.
     .isCode, an array of booleans with same length indicating whether the corresponding
     element should be treated as "code"
     .value, an optional value for the feature. Defaults to null.
     .operator, the operator describing the operation when there is a value. Defaults to null.
     .no_operator, the inverse operator. Defaults to null.
     */
    var getAsElements = function(input, asHtml) {
        if (asHtml === undefined) {
            asHtml = false;
        }
        if (input == null) {
            input = "";
        }
        // Formatting
        var esc = asHtml ? $filter('escapeHtml') : Fn.SELF;
        var code = [];
        var els = [];
        var value = null, rawValue = null;
        var operator = null;
        var no_operator = null;
        var type = null;

        var addCode = function(c) {
            code.push(true);
            els.push(esc(c));
        };

        var addText = function(c) {
            code.push(false);
            els.push(esc(c));
        };

        var match;
        if (match = input.match(/^dummy:([^:]+):(.*)/)) {
            addCode(match[1]);
            switch (match[2].trim()) {
                case '':
                    value = "empty";
                    operator = "is";
                    no_operator = "is not";
                    break;
                case '__Others__':
                    value = "other";
                    operator = "is";
                    no_operator = "is not";
                    break;
                default:
                    value = esc(match[2]);
                    operator = "is";
                    no_operator = "is not";
            }
        } else if (match = input.match(/^(?:thsvd|hashvect):(.+):(\d+)$/)) {
            addCode(match[1]);
            addText('[text #' + match[2] + ']');
        } else if (match = input.match(/^unfold:([^:]+):(.*)$/)) {
            addCode(match[1]);
            addText('[element #' + match[2] + ']');
        } else if (input.startsWith("impact:")) {
            var elts = input.split(":");
            /*reg: impact:ft:impact*/
            /*multi: impact:ft:impact:i*/
            if (elts.length == 4) {
                addCode(elts[1]);
                addText('[impact #' + elts[3] + ']');
            } else {
                addCode(elts[1]);
                addText("(impact on target)");
            }
        } else if (match = input.match(/^poly_int:(.*)$/)) {
            addCode(match[1]);
            addText("(computed)");
        } else if (match = input.match(/^pw_linear:(.*)$/)) {
            addCode(match[1]);
            addText("(computed)");
        } else if (match = input.match(/countvec:(.+):(.+)$/)) {
            addCode(match[1]);
            operator = 'contains';
            no_operator = "does not contain";
            value = match[2];
            type = "countvec";
        } else if (match = input.match(/tfidfvec:(.+):(.+):(.+)$/)) {
            addCode(match[1]);
            operator = 'contains';
            no_operator = "does not contain";
            value = match[3] + "(idf=" + match[2] + ")";
            rawValue = match[3];
            type = "tfidfvec";
        } else if(input.startsWith("hashing:")) {
            elts = input.split(":");
            addCode(elts[1]);
            value = elts[2];
            operator = "hashes to";
            no_operator = "does not hash to";
            type = "hashing";
        } else if (input.startsWith("interaction")) {
            elts = input.split(":");
            if (elts.length == 3) {
                addCode(elts[1]);
                addText("x");
                addCode(elts[2]);
            } else if (elts.length == 4) {
                addCode(elts[1]);
                addText("x");
                addCode(elts[2] + " = " + elts[3]);
            } else {
                addCode(elts[1] + " = " + elts[3]);
                addText("and");
                addCode(elts[2] + " = " + elts[4]);
            }
        } else {
            addCode(input);
        }

        return {
            elements: els,
            isCode: code,
            value: value,
            operator: operator,
            no_operator: no_operator,
            type : type,
            rawValue : rawValue
        };
    }

    var getAsHtmlString = function(feature) {
        var els = getAsElements(feature, true);
        var htmlArray = [];
        for (var i = 0; i < els.elements.length; i++) {
            if (els.isCode[i]) {
                htmlArray.push("<code>" + els.elements[i] + "</code>")
            } else {
                htmlArray.push(els.elements[i]);
            }
        }
        if (els.value != null) {
            htmlArray.push(els.operator, "<code>" + els.value + "</code>");
        }
        return htmlArray.join(" ");
    };

    var getAsTextElements = function(feature) {
        var els = getAsElements(feature);
        return {
            feature: els.elements.join(" "),
            operator: els.operator,
            no_operator: els.no_operator,
            value: els.value,
            type : els.type,
            rawValue : els.rawValue
        };
    };

    var getAsText = function(feature, negate) {
        if (negate === undefined) {
            negate = false;
        }
        var els = getAsElements(feature);
        if (els.value == null) {
            return els.elements.join(" ");
        } else {
            return els.elements.concat([negate ? els.no_operator : els.operator, els.value]).join(" ");
        }
    }

    return {
        getAsElements: getAsElements,
        getAsHtmlString: getAsHtmlString,
        getAsTextElements: getAsTextElements,
        getAsText: getAsText
    };

})

app.filter("getNameValueFromMLFeature", function(FeatureNameUtils) {
    return function(feature) {
        var els = FeatureNameUtils.getAsTextElements(feature);
        return {
            name: els.feature,
            value: els.value
        };
    }
});


app.factory("InfoMessagesUtils", function() {
    var svc = {
        /* Returns the first of the info messages with a given line, or null if there is none */
        getMessageAtLine: function(im, line) {
            if (!im || !im.messages) return null;
            for (var i = 0; i < im.messages.length; i++) {
                if (im.messages[i].line == line) return im.messages[i];
            }
            return null;
        },
        /* Filter the messages of all categories by line */
        filterForLine : function(im, line) {
            if (!im || !im.messages) return null;
            var fim = {};
            fim.messages = im.messages.filter(function(m) {return m.line == line;});
            fim.anyMessage = fim.messages.length > 0;
            fim.error = fim.messages.filter(function(m) {return m.severity == 'ERROR'}).length > 0;
            fim.warning = fim.messages.filter(function(m) {return m.severity == 'WARNING'}).length > 0;
            fim.maxSeverity = fim.error ? 'ERROR' : (fim.warning ? 'WARNING' : (fim.anyMessage ? 'INFO' : null));
            return fim;
        },
        getMessageAtColumn : function(im, column) {
            if (!im || !im.messages) return null;
            for (var i = 0; i < im.messages.length; i++) {
                if (im.messages[i].column == column) return im.messages[i];
            }
            return null;
        }
    }
    return svc;
});


app.factory("MessengerUtils", function($sanitize) {
    Messenger.options = {
        extraClasses: 'messenger-fixed messenger-on-bottom messenger-on-right',
        theme: 'dss'
    };

    const svc = {
        post: function(options) {
            let msg = null;
            options.actions = options.actions || {};
            if (options.showCloseButton) {
                options.actions.close = {
                    label: "Close",
                    action: function() {
                        msg.hide();
                    }
                };
                delete options.showCloseButton;
            }
            if (options.icon) {
                options.message = '<div style="width: 100%;"><div class="messenger-icon">' + $sanitize(options.icon) + '</div>' + $sanitize(options.message) + '</div>'
                delete options.icon;
            } else {
                options.message = '<div style="width: 100%;">' + $sanitize(options.message) + '</div>'
            }
            msg = Messenger().post(options);
        }
    }
    return svc;
});


// Front-end equivalent of StringNormalizationMode.java
app.factory("StringNormalizer", function() {

    var inCombiningDiatricalMarks = /[\u0300-\u036F]/g;
    var punct = /!"#\$%&'\(\)\*\+,-\.\/:;<=>\?@\[\]\^_`\{\|\}~/g;

    var svc = {
        get: function(stringNormalizationMode) {
            switch(stringNormalizationMode) {
                case 'EXACT':
                    return function(str) {
                        return str;
                    };

                case 'LOWERCASE':
                    return function(str) {
                        return str.toLowerCase();
                    };

                case 'NORMALIZED':
                default:
                    return function(str) {
                        return svc.normalize(str);
                    };
            }
        },

        normalize: function(str) {
            return str.normalize('NFD').replace(inCombiningDiatricalMarks, '');
        },

        removePunct: function(str) {
            return str.replace(punct, '');
        }
    };

    return svc;
});


app.service('HiveService', function($rootScope, Dialogs, ActivityIndicator, DataikuAPI, CreateModalFromTemplate, $q) {
    this.convertToImpala = function(selectedRecipes) {
        var deferred = $q.defer();
        //TODO @flow need a dedicated modal or rather a generic confirm modal that can have errors in scope
        Dialogs.confirm($rootScope, "Convert recipes to Impala", `Are you sure you want to convert ${selectedRecipes.length} Hive recipes to Impala?`).then(function() {
            DataikuAPI.flow.recipes.massActions.convertToImpala(selectedRecipes, true)
                .success(function() {
                    deferred.resolve("converted");
                }).error(function(a,b,c) {
                    deferred.reject("conversion failed");
                    setErrorInScope.bind($rootScope)(a,b,c);
                });
        }, function() {deferred.reject("user cancelled");});
        return deferred.promise;
    };

    this.resynchronizeMetastore = function(selectedDatasets) {
        Dialogs.confirmPositive($rootScope,
            'Hive metastore resynchronization',
            'Are you sure you want to resynchronize datasets to the Hive metastore?')
        .then(function() {
            ActivityIndicator.waiting('Synchronizing Hive metastore...');
            DataikuAPI.datasets.synchronizeHiveMetastore(selectedDatasets).success(function(data) {
                if (data.anyMessage && (data.warning || data.error)) {
                    ActivityIndicator.hide();
                    Dialogs.infoMessagesDisplayOnly($rootScope, "Metastore synchronization", data);
                } else {
                    // nothing to show
                    ActivityIndicator.success('Hive metastore successfully synchronized');
                }
            }).error(function(data, status, headers) {
                ActivityIndicator.hide();
                setErrorInScope.call($rootScope, data, status, headers);
            });
        });
    };

    this.startChangeHiveEngine = function(selectedRecipes) {
        return CreateModalFromTemplate('/templates/recipes/fragments/hive-engine-modal.html', $rootScope, null, function(modalScope) {
            modalScope.options = {executionEngine: 'HIVESERVER2'};

            DataikuAPI.flow.recipes.massActions.startSetHiveEngine(selectedRecipes).success(function(data) {
                modalScope.messages = data;
            }).error(function(...args) {
                modalScope.fatalError = true;
                setErrorInScope.apply(modalScope, args);
            });

            modalScope.ok = function() {
                DataikuAPI.flow.recipes.massActions.setHiveEngine(selectedRecipes, modalScope.options.executionEngine)
                    .success(function() {
                        $rootScope.$emit('recipesHiveEngineUpdated');
                        modalScope.resolveModal();
                    })
                    .error(setErrorInScope.bind(modalScope));
            };
        });
    };

    this.startChangeSparkEngine = function(selectedRecipes) {
        return CreateModalFromTemplate('/templates/recipes/fragments/spark-engine-modal.html', $rootScope, null, function(modalScope) {
            modalScope.options = {executionEngine: 'SPARK_SUBMIT'};

            DataikuAPI.flow.recipes.massActions.startSetSparkEngine(selectedRecipes).success(function(data) {
                modalScope.messages = data;
            }).error(function(...args) {
                modalScope.fatalError = true;
                setErrorInScope.apply(modalScope, args);
            });

            modalScope.ok = function() {
                DataikuAPI.flow.recipes.massActions.setSparkEngine(selectedRecipes, modalScope.options.executionEngine)
                    .success(function() {
                        $rootScope.$emit('recipesSparkEngineUpdated');
                        modalScope.resolveModal();
                    })
                    .error(setErrorInScope.bind(modalScope));
            };
        });
    };
});


app.service('ImpalaService', function($rootScope, Dialogs, CreateModalFromTemplate, DataikuAPI, $q) {

    this.convertToHive = function(selectedRecipes) {
        var deferred = $q.defer();
        //TODO @flow need a dedicated modal or rather a generic confirm modal that can have errors in scope
        Dialogs.confirm($rootScope, "Convert recipes to Hive", `Are you sure you want to convert ${selectedRecipes.length} Impala recipes to Hive?`).then(function() {
            DataikuAPI.flow.recipes.massActions.convertToHive(selectedRecipes, true)
                .success(function() {
                    deferred.resolve("converted");
                }).error(function(a,b,c) {
                    deferred.reject("conversion failed");
                    setErrorInScope.bind($rootScope)(a,b,c);
                });
        }, function() {deferred.reject("user cancelled");});
        return deferred.promise;
    };

    this.startChangeWriteMode = function(selectedRecipes) {
        return CreateModalFromTemplate('/templates/recipes/fragments/impala-write-flag-modal.html', $rootScope, null, function(modalScope) {
            modalScope.options = {runInStreamMode: true};

            DataikuAPI.flow.recipes.massActions.startSetImpalaWriteMode(selectedRecipes).success(function(data) {
                modalScope.messages = data;
            }).error(function(...args) {
                modalScope.fatalError = true;
                setErrorInScope.apply(modalScope, args);
            });

            modalScope.ok = function() {
                DataikuAPI.flow.recipes.massActions.setImpalaWriteMode(selectedRecipes, modalScope.options.runInStreamMode)
                    .success(function() {
                        $rootScope.$emit('recipesImpalaWriteModeUpdated');
                        modalScope.resolveModal();
                    })
                    .error(setErrorInScope.bind(modalScope));
            };
        });
    };
});


app.service('SparkService', function($rootScope, CreateModalFromTemplate, DataikuAPI) {
    this.startChangeSparkConfig = function(selectedItems) {

        return CreateModalFromTemplate('/templates/recipes/fragments/spark-config-modal.html', $rootScope, null, function(modalScope) {
            modalScope.selectedRecipes = selectedItems.filter(it => it.type == 'RECIPE');
            modalScope.options = {};

            DataikuAPI.flow.recipes.massActions.startSetSparkConfig(modalScope.selectedRecipes).success(function(data) {
                modalScope.messages = data;
            }).error(function(...args) {
                modalScope.fatalError = true;
                setErrorInScope.apply(modalScope, args);
            });

            modalScope.ok = function() {
                DataikuAPI.flow.recipes.massActions.setSparkConfig(modalScope.selectedRecipes, modalScope.options.sparkConfig)
                    .success(function() {
                        $rootScope.$emit('recipesSparkConfigUpdated');
                        modalScope.resolveModal();
                    })
                    .error(setErrorInScope.bind(modalScope));
            };
        });
    };
});


app.service('PipelineService', function($rootScope, CreateModalFromTemplate, DataikuAPI) {
    this.startChangePipelineability = function(selectedItems, pipelineType) {
        return CreateModalFromTemplate('/templates/recipes/fragments/pipelineability-modal.html', $rootScope, null, function(modalScope) {
            modalScope.selectedRecipes = selectedItems.filter(it => it.type === 'RECIPE');

            modalScope.pipelineTypeText = (pipelineType === 'SPARK' ? 'Spark' : 'SQL');

            modalScope.options = {
                allowStart: true,
                allowMerge: true
            };

            DataikuAPI.flow.recipes.massActions.startSetPipelineability(modalScope.selectedRecipes, pipelineType).success(function(data) {
                modalScope.messages = data;
            }).error(function(...args) {
                modalScope.fatalError = true;
                setErrorInScope.apply(modalScope, args);
            });

            modalScope.ok = function() {
                DataikuAPI.flow.recipes.massActions.setPipelineability(modalScope.selectedRecipes, pipelineType, modalScope.options.allowStart, modalScope.options.allowMerge)
                    .success(function() {
                        modalScope.resolveModal();
                    })
                    .error(setErrorInScope.bind(modalScope));
            };
        });
    };
});


app.service('ColorPalettesService', function() {

    const svc = this;

    const DEFAULT_COLORS = [
        "#1ac2ab",
        "#0f6d82",
        "#FFD83D",
        "#de1ea5",
        "#9dd82b",
        "#28aadd",
        "#00a55a",
        "#d66b9b",
        "#77bec2",
        "#94be8e",
        "#123883",
        "#a088bd",
        "#c28e1a"
    ];

    svc.fixedColorsPalette = function(name, colors=DEFAULT_COLORS) {
        const colorMap = {};
        return function(key) {
            key = key + ''; //force conversion
            if (colorMap[key]) {
                return colorMap[key];
            }
            colorMap[key] = colors[Object.keys(colorMap).length % colors.length];
        };
    };

});


/*
 * TODO: finally this service is a bit of a duplicate of what CodeBasedEditorUtils was supposed to be. Would be good to merge both at some point...
 */
app.service('CodeMirrorSettingService', function($rootScope) {

    const INDENT_MORE_SHORTCUT = "Tab";
    const INDENT_LESS_SHORTCUT = "Shift-Tab";
    const FIND_SHORTCUT = "Ctrl-F";
    const REPLACE_SHORTCUT = "Ctrl-Alt-F";
    const JUMP_TO_LINE_SHORTCUT = "Ctrl-L";
    const TOGGLE_COMMENT_SHORTCUT_QWERTY = "Cmd-/";
    const TOGGLE_COMMENT_SHORTCUT_AZERTY = "Shift-Cmd-/";
    const TOGGLE_COMMENT_SHORTCUT_RSTUDIO = "Shift-Ctrl-C";
    const AUTOCOMPLETE_SHORTCUT = "Ctrl-Space";
    const FULL_SCREEN_SHORTCUT = "F11";

    this.getShortcuts = function() {
        return {
            "INDENT_MORE_SHORTCUT": INDENT_MORE_SHORTCUT,
            "INDENT_LESS_SHORTCUT": INDENT_LESS_SHORTCUT,
            "FIND_SHORTCUT": FIND_SHORTCUT,
            "REPLACE_SHORTCUT": REPLACE_SHORTCUT,
            "JUMP_TO_LINE_SHORTCUT": JUMP_TO_LINE_SHORTCUT,
            "TOGGLE_COMMENT_SHORTCUT": TOGGLE_COMMENT_SHORTCUT_QWERTY,
            "AUTOCOMPLETE_SHORTCUT": AUTOCOMPLETE_SHORTCUT,
            "FULL_SCREEN_SHORTCUT": FULL_SCREEN_SHORTCUT}
    }

    this.get = function(mimeType, options) {
        var extraKeys = {};

        if (!$rootScope.appConfig.userSettings.codeEditor || !$rootScope.appConfig.userSettings.codeEditor.keyMap || $rootScope.appConfig.userSettings.codeEditor.keyMap == "default") {
            extraKeys[INDENT_MORE_SHORTCUT] = "indentMore";
            extraKeys[INDENT_LESS_SHORTCUT] = "indentLess";
            extraKeys[FIND_SHORTCUT] = "find";
            extraKeys[REPLACE_SHORTCUT] = "replace";
            extraKeys[JUMP_TO_LINE_SHORTCUT] = "jumpToLine";
            extraKeys[TOGGLE_COMMENT_SHORTCUT_QWERTY] = "toggleComment";
            extraKeys[TOGGLE_COMMENT_SHORTCUT_AZERTY] = "toggleComment";
            extraKeys[TOGGLE_COMMENT_SHORTCUT_RSTUDIO] = "toggleComment";
            extraKeys[AUTOCOMPLETE_SHORTCUT] = this.showHint(mimeType, options && options.words ? options.words : []);
        }
        if (!options || !options.noFullScreen) {
            extraKeys[FULL_SCREEN_SHORTCUT] = function(cm) {
                if (cm.getOption("fullScreen")) {
                    cm.setOption("fullScreen", false);
                } else {
                    cm.setOption("fullScreen", !cm.getOption("fullScreen"));
                }
            };
        }


        var settings =  {
            mode: mimeType,
            theme: $rootScope.appConfig.userSettings.codeEditor && $rootScope.appConfig.userSettings.codeEditor.theme ? $rootScope.appConfig.userSettings.codeEditor.theme : 'default',

            //left column
            lineNumbers : true,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],

            //indentation
            indentUnit: $rootScope.appConfig.userSettings.codeEditor && $rootScope.appConfig.userSettings.codeEditor.indentUnit ? $rootScope.appConfig.userSettings.codeEditor.indentUnit : 4,
            tabSize: $rootScope.appConfig.userSettings.codeEditor && $rootScope.appConfig.userSettings.codeEditor.tabSize ? $rootScope.appConfig.userSettings.codeEditor.tabSize : 4,
            indentWithTabs: $rootScope.appConfig.userSettings.codeEditor ? $rootScope.appConfig.userSettings.codeEditor.indentWithTabs : false,

            //edition
            autoCloseBrackets: $rootScope.appConfig.userSettings.codeEditor ? $rootScope.appConfig.userSettings.codeEditor.autoCloseBrackets : true,
            autoCloseTags: $rootScope.appConfig.userSettings.codeEditor ? $rootScope.appConfig.userSettings.codeEditor.autoCloseTags : true,

            //code reading
            matchBrackets: true,
            matchTags: true,
            highlightSelectionMatches: true,
            styleSelectedText: true,
            styleActiveLine: true,

            keyMap: $rootScope.appConfig.userSettings.codeEditor && $rootScope.appConfig.userSettings.codeEditor.keyMap ? $rootScope.appConfig.userSettings.codeEditor.keyMap : 'default',
            extraKeys: extraKeys,
            onLoad: function(cm) {
                if ($rootScope.appConfig.userSettings.codeEditor && $rootScope.appConfig.userSettings.codeEditor.fontSize) {
                    $($(cm.getTextArea()).siblings('.CodeMirror')[0]).css('font-size', $rootScope.appConfig.userSettings.codeEditor.fontSize + 'px');
                }
                if (options && options.onLoad && typeof(options.onLoad) == "function") {
                    options.onLoad(cm);
                }
            }
        };

        return settings;
    }

    this.showHint = function(mode, words) {
        return function(cm) {
            const modes = {
                'text/x-python': CodeMirror.hintWords.python,
                'text/css': CodeMirror.hintWords.css
            };

            CodeMirror.showHint(cm, function(editor) {
                const anyWordHint = CodeMirror.hint.anyword(cm);
                const recipeWords = words || [];
                const codeKeywords = CodeMirror.hintWords[mode] || modes[mode] || [];

                let combinedWords = [recipeWords, [' '], codeKeywords, [' '], anyWordHint && anyWordHint.list ? anyWordHint.list : []]
                    .reduce((a, b) => a.concat(b.filter(_ => _ === ' ' || !a.includes(_)))); // deduplicates

                /*
                    Filter functionality based off of https://github.com/amarnus/ng-codemirror-dictionary-hint/blob/master/lib/ng-codemirror-dictionary-hint.js
                */
                var cur = editor.getCursor();
                var curLine = editor.getLine(cur.line);
                var start = cur.ch;
                var end = start;
                while (end < curLine.length && /[\w$]/.test(curLine.charAt(end))) ++end;
                while (start && /[\w$]/.test(curLine.charAt(start - 1))) --start;
                var curWord = start !== end && curLine.slice(start, end);
                return {
                    list: (!curWord ? combinedWords : combinedWords.filter(_ => _.startsWith(curWord) && _ !== curWord)),
                    from: CodeMirror.Pos(cur.line, start),
                    to: CodeMirror.Pos(cur.line, end)
                }
            }, { completeSingle: false });
        };
    }
});


app.service('TimingService', function($rootScope) {
    return {
        wrapInTimePrinter: function(prefix, fn) {
            return function() {
                const before = performance.now();
                const retval = fn.apply(this, arguments);
                const after = performance.now();
                console.info("Timing: " + prefix + ": " + (after - before) + "ms");
                return retval;
            }
        }
    };
});

app.service('PromiseService', function() {
    const svc = this;

    /**
     * Wrap a $q promise in a $http promise (in order to keep the .success and .error methods)
     */
    svc.qToHttp = function(p) {
        return {
            then: p.then,
            success: function (fn) {
                return svc.qToHttp(p.then(fn));
            },
            error: function (fn) {
                return svc.qToHttp(p.then(null, fn));
            }
        }
    }

})

app.service('ProjectStatusService', function(TaggingService, $rootScope)  {
    const svc = this;
    let projectStatusMap = {};

    svc.getProjectStatusColor = function(status) {
        if(projectStatusMap && projectStatusMap[status]) {
            return projectStatusMap[status];
        } else {
            return TaggingService.getDefaultColor(status);
        }
    }

    function computeProjectStatusMap() {
        projectStatusMap = {};
        if ($rootScope.appConfig && $rootScope.appConfig.projectStatusList) {
            $rootScope.appConfig.projectStatusList.forEach(function(projectStatus) {
                projectStatusMap[projectStatus.name] = projectStatus.color;
            });
        }
    }
    $rootScope.$watch('appConfig.projectStatusList', computeProjectStatusMap, true);
});

/**
 * Enhance fattable elements with dragging capabilities.
 * Mandatory class fat-draggable should be added for parent draggable zone.
 * Mandatory class fat-draggable__item should be added for each items that can be dragged.
 * Mandatory class fat-draggable__handler should be added to trigger drag. It should be a child of an item or the item itself.
 * Mandatory data-column-name attribute should be added at fat-draggable__item level to keep a reference to the column when DOM is being recycled.
 *
 * To enable drag on an element, call the setDraggable() method with the following options :
 *
 * @param {Object}              options                         - The available options
 * @param {HTMLElement}         options.element                 - (Mandatory) element containing the draggable items.
 * @param {String}              [options.axis="x"]              - Define the dragging axis. Default to horizontal dragging.
 * @param {Function}            [options.onDrop]                - Drop callback
 * @param {Function}            [options.onPlaceholderUpdate]   - Placeholder dimensions update. Use it to reshape / position the placeholder. Called with the placeholder dimensions
 * @param {ScrollBarProxy}      [options.scrollBar]             - Fattable scrollbar to be updated if necessary
 *
 * @example
 *
 * <div class="fat-draggable">
 *  <div class="fat-draggable__item" data-column-name="{{column.name}}">
 *       <i class="fat-draggable__handler"></i>
 *       ...
 *  </div>
 * </div>
 */
app.factory('FatDraggableService', function() {
    const MAIN_CLASSNAME = 'fat-draggable';
    const HANDLER_CLASSNAME = MAIN_CLASSNAME + '__handler';
    const ITEM_CLASSNAME = MAIN_CLASSNAME + '__item';
    const PLACEHOLDER_CLASSNAME = MAIN_CLASSNAME + '__placeholder';
    const BAR_CLASSNAME = MAIN_CLASSNAME + '__bar';
    const DRAGGING_CLASSNAME = MAIN_CLASSNAME + '--dragging';
    const DRAGGED_CLASSNAME = ITEM_CLASSNAME + '--dragged';
    const COLUMN_NAME_ATTRIBUTE = 'data-column-name';
    const BAR_THICKNESS = 2;
    const MINIMAL_MOVE_TO_DRAG = 10;
    let classNamesToIgnore;
    let scrollBar;
    let element;
    let axis = 'x';
    let axisClassname;
    let placeholderDOM = document.createElement('div');
    let barDOM = document.createElement('div');
    let draggedItem;
    let draggedColumnName;
    let disabledTarget;
    let draggedItemDimensions = {};
    let placeholderDimensions = {};
    let barDimensions = {};
    let elementDimensions = {};
    let hoveredItem;
    let hoveredColumnName;
    let hoveredItemDimensions = {};
    let dragging = false;
    let downing = false;
    let onDrop;
    let onPlaceholderUpdate;
    let cursorInitialPosition = -1;
    let cursorPosition = -1;
    let gap = -1;

    // Ensures requestAnimationFrame cross-browsers support
    window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

    /* HELPERS */

    // Gets the draggable item matching the mouse target
    function getDraggableItem(target) {
        return target.closest('.' + ITEM_CLASSNAME);
    }

    function getColumnName(columnDOM) {
        if (columnDOM) {
            return columnDOM.getAttribute(COLUMN_NAME_ATTRIBUTE) || (columnDOM.firstElementChild && columnDOM.firstElementChild.getAttribute(COLUMN_NAME_ATTRIBUTE));
        }
    }

    function getColumnDOM(columnName) {
        if (columnName) {
            return element.querySelector('[' + COLUMN_NAME_ATTRIBUTE + '="' + columnName + '"]');
        }
    }

    // Returns true if we are dragging before (on top in y axis or on left on x axis) the item being dragged
    function isDraggingBefore() {
        return cursorPosition && draggedItemDimensions && (cursorPosition <= draggedItemDimensions[axis === 'y' ? 'top' : 'left']);
    }

    // Retrieves the item around the cursor position
    function getHoveredItem() {
        let items = element.querySelectorAll('.' + ITEM_CLASSNAME);
        let vertical = (axis === 'y');
        for (let i = 0; i < items.length; i++) {
            let currentItem = items[i];
            let itemDimensions = getBoundingClientRect(currentItem);
            if (vertical) {
                if (itemDimensions.top <= cursorPosition && cursorPosition < itemDimensions.top + itemDimensions.height) {
                    return currentItem;
                }
            } else {
                if (itemDimensions.left <= cursorPosition && cursorPosition < itemDimensions.left + itemDimensions.width) {
                    return currentItem;
                }
            }
        }
        return null;
    }

    // Sets hover style for the draggable item matching the mouse target
    function updateHoveredItem() {
        let draggingBefore = isDraggingBefore();
        let target = getHoveredItem();

        if (!target) {
            return;
        }
        if (hoveredItem && hoveredItem === target) {
            return;
        }

        hoveredItem = target;
        hoveredColumnName = getColumnName(hoveredItem);

        if (hoveredItem !== draggedItem) {
            hoveredItemDimensions = getBoundingClientRect(hoveredItem);
            elementDimensions = getBoundingClientRect(element);

            if (axis === 'y') {
                barDimensions.top = draggingBefore ? hoveredItemDimensions.top : hoveredItemDimensions.top + hoveredItemDimensions.height;
                barDimensions.height = BAR_THICKNESS;
                barDimensions.width = placeholderDimensions.width;
                barDimensions.left = elementDimensions.left;
            } else {
                barDimensions.left = draggingBefore ? hoveredItemDimensions.left : hoveredItemDimensions.left + hoveredItemDimensions.width;
                barDimensions.height = placeholderDimensions.height;
                barDimensions.width = BAR_THICKNESS;
                barDimensions.top = elementDimensions.top;
            }
        } else {
            barDimensions.width = 0;
            barDimensions.height = 0;
        }

        updateBarBoundingBox(barDimensions);
    }

    // Redraw the placeholder according the mouse position
    function updatePlaceholderBoundingBox(dimensions) {

        if (typeof onPlaceholderUpdate === 'function') {
            onPlaceholderUpdate(dimensions);
        }

        if (dimensions.top >= 0) {
            if (dimensions.top <= elementDimensions.top - placeholderDimensions.height / 2) {
                // If overflowing on top
                // Putting at top of parent element - half of the placeholder (for better auto scroll)
                dimensions.top = elementDimensions.top - placeholderDimensions.height / 2;
            } else if (dimensions.top + placeholderDimensions.height - placeholderDimensions.height / 2 >= elementDimensions.top + elementDimensions.height) {
                // If overflowing on bottom
                // Putting at bottom of parent element + half of the placeholder (for better auto scroll)
                dimensions.top = elementDimensions.top + elementDimensions.height - placeholderDimensions.height / 2;
            }
            placeholderDOM.style.top = dimensions.top + 'px';
        }
        if (dimensions.left >= 0) {
            if (dimensions.left <= elementDimensions.left - placeholderDimensions.width / 2) {
                // If overflowing on the left
                // Putting at left of parent element - half of the placeholder (for better auto scroll)
                dimensions.left = elementDimensions.left - placeholderDimensions.width / 2;
            } else if (dimensions.left + placeholderDimensions.width - placeholderDimensions.width / 2 >= elementDimensions.left + elementDimensions.width) {
                // If overflowing on the right
                // Putting at right of parent element + half of the placeholder (for better auto scroll)
                dimensions.left = elementDimensions.left + elementDimensions.width - placeholderDimensions.width / 2;
            }
            placeholderDOM.style.left = dimensions.left + 'px';
        }

        if (dimensions.height >= 0) {
            placeholderDOM.style.height = dimensions.height + 'px';
        }
        if (dimensions.width >= 0) {
            placeholderDOM.style.width = dimensions.width + 'px';
        }
    }

    // Wrap the placeholder position update in a callback for requestAnimationFrame()
    function placeholderDOMRedraw() {
        updatePlaceholderBoundingBox(axis === 'y' ? {top: (cursorPosition - gap)} : {left: (cursorPosition - gap)});
    }

    // Redraw the bar according the given dimensions
    function updateBarBoundingBox(dimensions) {
        if (dimensions.top >= 0) {
            if (dimensions.top <= elementDimensions.top) {
                dimensions.top = elementDimensions.top;
            } else if (dimensions.top >= elementDimensions.top + elementDimensions.height) {
                dimensions.top = elementDimensions.top + elementDimensions.height;
            }
            barDOM.style.top = dimensions.top + 'px';
        }
        if (dimensions.left >= 0) {
            if (dimensions.left <= elementDimensions.left) {
                dimensions.left = elementDimensions.left;
            } else if (dimensions.left >= elementDimensions.left + elementDimensions.width) {
                dimensions.left = elementDimensions.left + elementDimensions.width;
            }
            barDOM.style.left = dimensions.left + 'px';
        }
        if (dimensions.height >= 0) {
            barDOM.style.height = dimensions.height + 'px';
        }
        if (dimensions.width >= 0) {
            barDOM.style.width = dimensions.width + 'px';
        }
    }

    // Generic fatTable scroll update
    function updateScroll () {
        if (!scrollBar) {
            return;
        }
        if (axis === 'y') {
            let elementTop = getBoundingClientRect(element).top;
            let elementBottom = elementTop + element.offsetHeight;
            let placeholderTop= placeholderDOM.offsetTop;
            let placeholderBottom = placeholderTop + placeholderDOM.offsetHeight;

            if (placeholderBottom > elementBottom) {
                scrollBar.setScrollXY(element.scrollLeft, scrollBar.scrollTop + placeholderBottom - elementBottom);
            } else if (placeholderTop < elementTop) {
                scrollBar.setScrollXY(element.scrollLeft, scrollBar.scrollTop + placeholderTop - elementTop);
            }
        } else {
            let elementLeft = getBoundingClientRect(element).left;
            let elementRight = elementLeft + element.offsetWidth;
            let placeholderLeft = placeholderDOM.offsetLeft;
            let placeholderRight = placeholderLeft + placeholderDOM.offsetWidth;

            if (placeholderRight > elementRight) {
                scrollBar.setScrollXY(scrollBar.scrollLeft + placeholderRight - elementRight, element.scrollTop);
            } else if (placeholderLeft < elementLeft) {
                scrollBar.setScrollXY(scrollBar.scrollLeft + placeholderLeft - elementLeft, element.scrollTop);
            }
        }
    }

    // Clean every dragging-related things
    function reset() {
        document.body.contains(placeholderDOM) && document.body.removeChild(placeholderDOM);
        barDOM.style.top = '';
        barDOM.style.left = '';
        barDOM.style.height = '';
        barDOM.style.width = '';
        document.body.removeChild(barDOM);
        draggedItem && draggedItem.classList.remove(DRAGGED_CLASSNAME);
        document.body.classList.remove(DRAGGING_CLASSNAME);

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        disabledTarget.removeEventListener('mouseup', disableClick);
        Mousetrap.unbind("esc", onEscape);

        dragging = false;
        downing = false;
        draggedItem = null;
        draggedColumnName = null;
        hoveredItem = null;
        hoveredColumnName = null;
        disabledTarget = null;
        draggedItemDimensions = {};
        placeholderDimensions = {};
        barDimensions = {};
        hoveredItemDimensions = {};
        elementDimensions = {};
        cursorPosition = -1;
        cursorInitialPosition = -1;
        gap = -1;
    }

    // Prevent the beginning of the drag
    function cancel() {
        if (dragging) {
            reset();
        } else {
            cursorInitialPosition = -1;
            downing = false;
            draggedItem = null;
            draggedColumnName = null;
            window.removeEventListener('mousemove', onMouseMove);
        }
    }

    /* EVENTS LISTENERS */
    function onMouseUp() {

        if (!dragging) {
            cancel();
            return;
        }
        if (typeof onDrop === 'function' && draggedColumnName && hoveredColumnName && draggedColumnName !== hoveredColumnName) {
            onDrop(draggedItem, hoveredItem, draggedColumnName, hoveredColumnName);
        }
        reset();
    }

    // When the dragging has started we do not want any click to be triggered on the element
    function disableClick(event) {
        event.stopImmediatePropagation();
        event.preventDefault();
        onMouseUp();
    }

    // If moving the placeholder, update its position according the given axis
    function onMouseMove(event) {

        // If not yet dragging, initiate drag, else update the placeholder position
        if (!dragging && downing) {
            if (axis === 'y') {
                cursorPosition = event.clientY;
                gap = cursorInitialPosition - draggedItemDimensions.y;
            } else {
                cursorPosition = event.clientX;
                gap = cursorInitialPosition - draggedItemDimensions.x;
            }

            // Do not start drag if the mouse has not moved enough
            if (Math.abs(cursorPosition - cursorInitialPosition) < MINIMAL_MOVE_TO_DRAG) {
                return;
            }

            dragging = true;
            // Bind mouseup for dragging end and click on target to prevent other listeners to be triggered
            window.addEventListener('mouseup', onMouseUp);
            disabledTarget = event.target;
            disabledTarget.addEventListener('click', disableClick);

            // Inject placeholder and bar in DOM and add the drag-related class names
            document.body.appendChild(placeholderDOM);
            document.body.appendChild(barDOM);
            document.body.classList.add(DRAGGING_CLASSNAME);
            draggedItem.classList.add(DRAGGED_CLASSNAME);

            placeholderDimensions = angular.copy(draggedItemDimensions);
            updatePlaceholderBoundingBox(placeholderDimensions);

            Mousetrap.bind("esc", onEscape);
        } else {
            cursorPosition = axis === 'y' ? event.clientY : event.clientX;
            requestAnimationFrame(placeholderDOMRedraw);
            updateScroll();
            // If the dragged column DOM from fattable has been removed try to re-fetch it
            if (!document.body.contains(draggedItem)) {
                let newDraggedItem = getColumnDOM(draggedColumnName);
                if (newDraggedItem) {
                    draggedItem = newDraggedItem;
                    draggedItem.classList.add(DRAGGED_CLASSNAME);
                }
            // If the dragged column DOM and column name are inconsistent, invalidate it and try to refetch it
            } else if (!draggedItem.getAttribute(COLUMN_NAME_ATTRIBUTE) || draggedItem.getAttribute(COLUMN_NAME_ATTRIBUTE) !== draggedColumnName) {
                draggedItem.classList.remove(DRAGGED_CLASSNAME);
                draggedItem = null;
                let newDraggedItem = getColumnDOM(draggedColumnName);
                if (newDraggedItem) {
                    draggedItem = newDraggedItem;
                    draggedItem.classList.add(DRAGGED_CLASSNAME);
                }
            }
        }

        updateHoveredItem();
    }

    // Press escape to stop the current drag
    function onEscape() {
        if (!dragging) {
            return;
        }
        reset();
    }

    function onMouseDown(event) {

        // Do not drag if the selected element has at least one class marking it as not-draggable
        try {
            classNamesToIgnore.forEach(className => {
                if (event.target.closest('.' + className)) {
                    throw PreventDragException;
                }
            });
        } catch (e) {
            return;
        }

        if (!event.target.closest('.' + HANDLER_CLASSNAME)) {
            return;
        }

        // Do not consider right click
        if (event.which === 3) {
            return;
        }

        downing = true;
        draggedItem = getDraggableItem(event.target);
        draggedColumnName = getColumnName(draggedItem);

        window.addEventListener('mousemove', onMouseMove);

        // If a click occurred, prevent dragging
        element.addEventListener('click', cancel);

        // Prevent native drag
        event.preventDefault();

        // Ensure mandatory class name are here
        element.classList.add(MAIN_CLASSNAME);
        element.classList.add(axisClassname);

        draggedItemDimensions = getBoundingClientRect(draggedItem);

        if (axis === 'y') {
            cursorInitialPosition = event.clientY;
        } else {
            cursorInitialPosition = event.clientX;
        }
    }

    return {

        setDraggable: function(options) {
            if (!options || !options.element) { return }
            element = options.element;
            onDrop = options.onDrop;
            onPlaceholderUpdate = options.onPlaceholderUpdate;
            scrollBar = options.scrollBar;
            classNamesToIgnore = options.classNamesToIgnore;

            element.classList.add(MAIN_CLASSNAME);

            axis = options.axis && options.axis === 'y' ? 'y' : 'x';
            axisClassname = axis === 'y' ? 'fat-draggable-y-axis' : 'fat-draggable-x-axis';
            element.classList.add(axisClassname);

            placeholderDOM.className = PLACEHOLDER_CLASSNAME;
            barDOM.className = BAR_CLASSNAME;

            // If clicking on a drag handler, retrieve dragged item data and attach mouse move
            element.addEventListener('mousedown', onMouseDown);
        }
    }
});

/**
 * Enhance fattable elements with resize capabilities.
 * Mandatory class fat-resizable__item should be added for each items that can be dragged.
 * Mandatory class fat-resizable__handler should be added to trigger resize. It should be a child of an item or the item itself.
 * Mandatory data-column-name and data-column-index attributes should be added at fat-resizable__item level to keep a reference to the column when DOM is being recycled.
 *
 * To enable resize on an element, call the setResizable() method with the following options :
 *
 * @param {Object}              options                         - The available options
 * @param {HTMLElement}         options.element                 - (Mandatory) element containing the resizable items.
 * @param {Function}            options.onDrop               - Drop callback. Returns an object containing resized column data: index, name and width.
 *
 * @example
 *
 * <div fat-resizable>
 * ...
 *  <div class="fat-resizable__item" data-column-name="{{column.name}}" data-column-index="{{columnIndex}}">
 *      ...
 *      <span class="fat-resizable__handler"></span>
 *      ... 
 *  </div>
 * ...
 * </div>
 */
app.factory('FatResizableService', function () {
    const MAIN_CLASSNAME = 'fat-resizable';
    const ITEM_CLASSNAME = MAIN_CLASSNAME + '__item';
    const HANDLER_CLASSNAME = MAIN_CLASSNAME + '__handler';
    const BAR_CLASSNAME = MAIN_CLASSNAME + '__bar';
    const COLUMN_INDEX_ATTRIBUTE_NAME = 'data-column-index';
    const COLUMN_NAME_ATTRIBUTE_NAME = 'data-column-name';
    const BAR_THICKNESS = 4;
    const ITEM_MIN_WIDTH = 60;

    let element, 
        onDrop, 
        resizing = false,
        downing = false,
        cursorPosition = -1,
        barDimensions = {},
        elementDimensions,
        resizableItem = null,
        resizedItemDimensions = {},
        draggingLowerBound,
        disabledTarget,
        barDOM = document.createElement('div');

    /* HELPERS */

    // Gets the resizable item matching the mouse target
    function getResizableItem(target) {
        return target.closest('.' + ITEM_CLASSNAME);
    } 

    function updateBar() {
        elementDimensions = elementDimensions || getBoundingClientRect(element);
        barDimensions.left = cursorPosition;
        barDimensions.top = elementDimensions.top;
        barDOM.style.top = barDimensions.top + 'px';
        barDOM.style.left = barDimensions.left + 'px';
        barDOM.style.height = barDimensions.height + 'px';
        barDOM.style.width = barDimensions.width + 'px';
    }

    // Clean every resizing-related things
    function reset() {
        barDOM.style.top = '';
        barDOM.style.left = '';
        barDOM.style.height = '';
        barDOM.style.width = '';
        document.body.removeChild(barDOM);

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        disabledTarget.removeEventListener('mouseup', disableClick);
        Mousetrap.unbind("esc", onEscape);

        resizing = false;
        downing = false;
        barDimensions.left = 0;
        barDimensions.right = 0;
        cursorPosition = -1;
        draggingLowerBound = null;
        resizableItem = null;
        resizedItemDimensions = {};
    }

    // Prevent the beginning of the drag
    function cancel() {
        if (resizing) {
            reset();
        } else {
            downing = false;
            resizableItem = null;
            resizedItemDimensions = {};
            window.removeEventListener('mousemove', onMouseMove);
        }
    }

    /* EVENTS LISTENERS */

    function onMouseUp() {

        if (!resizing) {
            cancel();
            return;
        }

        if (typeof onDrop === 'function') {
            let resizedWidth = cursorPosition - resizedItemDimensions.x;
            resizedWidth = resizedWidth > ITEM_MIN_WIDTH ? resizedWidth : ITEM_MIN_WIDTH;
            onDrop({ 
                index: resizableItem.getAttribute(COLUMN_INDEX_ATTRIBUTE_NAME), 
                name: resizableItem.getAttribute(COLUMN_NAME_ATTRIBUTE_NAME), 
                width: resizedWidth 
            });
        }
        reset();
    }

    // When the dragging has started we do not want any click to be triggered on the element
    function disableClick(event) {
        event.stopImmediatePropagation();
        event.preventDefault();
        onMouseUp();
    }

    function onMouseMove(event) {

        // If not yet dragging, initiate drag, else update the placeholder position
        if (!resizing && downing) {

            resizing = true;
            // Bind mouseup for dragging end and click on target to prevent other listeners to be triggered
            window.addEventListener('mouseup', onMouseUp);
            disabledTarget = event.target;
            disabledTarget.addEventListener('click', disableClick);

            // Inject bar in DOM
            document.body.appendChild(barDOM);

            Mousetrap.bind("esc", onEscape);
        } else {
            cursorPosition = event.clientX;
        }

        if (!draggingLowerBound) {
            draggingLowerBound = getBoundingClientRect(resizableItem).x
        }

        // Prevent resizing beyond the previous column
        if (cursorPosition <= draggingLowerBound + ITEM_MIN_WIDTH) { return }

        updateBar();
    }

    function onMouseDown(event) {

        if (!event.target.closest('.' + HANDLER_CLASSNAME)) {
            return;
        }

        // Do not consider right click
        if (event.which === 3) {
            return;
        }

        downing = true;
        resizableItem = getResizableItem(event.target);

        window.addEventListener('mousemove', onMouseMove);

        // If a click occurred, prevent dragging
        element.addEventListener('click', cancel);

        // Prevent native drag
        event.preventDefault();

        resizedItemDimensions = getBoundingClientRect(resizableItem);
    }

    // Press escape to stop the current drag
    function onEscape() {
        if (!resizing) {
            return;
        }
        reset();
    }

    return {

        setResizable: function(options) {
            if (!options || !options.element) { return }

            onDrop = options.onDrop;
            element = options.element;

            // Prepare vertical bar used as feedback while resizing
            barDimensions.height = options.barHeight;
            barDimensions.width = BAR_THICKNESS;
            barDOM.className = BAR_CLASSNAME;

            // If clicking on a drag handler, retrieve dragged item data and attach mouse move
            element.addEventListener('mousedown', onMouseDown);
        }
    }
})

app.service('FatTouchableService', function($timeout) {
    /**
     * Make a fattable/fatrepeat scrollable through touch interaction
     * @param scope: scope of the fattable/fatrepeat directive
     * @param element: DOM element of the fattable/fatrepeat directive
     * @param fattable: fattable object of the fattable/fatrepeat directive
     * @returns function to remove event listeners added by this function
     */
    this.setTouchable = function(scope, element, fattable) {
        /**
         * Return an object wrapping callbacks. This function will be called each time a touchstart is emmited in order
         * to give callbacks to the added the touchmove and touchend event listeners.
         */
        let getOnTouchCallbacks = (function() {
            /*
             * Callbacks
             */

            /**
             * Turns the touchMoveEvent passed in parameter into a scrollOrder to the fattable
             * @param event
             */
            let startScroll;
            let lastScroll;
            let startTouch;
            let lastTouch;
            function scrollFattable(touchMoveEvent) {
                fattable.scroll.dragging = true; //otherwise fattable behaves as user had scrolled using scrollbars, which triggers multiple reflows, which is bad for performances
                touchMoveEvent.preventDefault();
                touchMoveEvent.stopPropagation();
                let newTouch = touchMoveEvent.originalEvent.changedTouches[0];

                // Tracking for direction change
                function getTouchedDistance(t) {
                    return {
                        x: startTouch.screenX - t.screenX,
                        y: startTouch.screenY - t.screenY
                    }
                }
                let touchedDistance = getTouchedDistance(newTouch);
                let lastTouchedDistance = getTouchedDistance(lastTouch);
                if (Math.abs(lastTouchedDistance) - Math.abs(touchedDistance) > 0) {
                    startTouch = lastTouch;
                    startScroll = lastScroll;
                    touchedDistance = getTouchedDistance(newTouch);
                }
                // Scrolling
                requestAnimationFrame(_ => fattable.scroll.setScrollXY(startScroll.x + touchedDistance.x, startScroll.y + touchedDistance.y));
                // Updating memory
                lastTouch = touchMoveEvent.originalEvent.changedTouches[0];
                lastScroll = {
                    x: fattable.scroll.scrollLeft,
                    y: fattable.scroll.scrollTop
                }
            }

            /**
             * Keeps track of touch velocity in order to generate momentum when touchmove will stop.
             * (Tracking will stop at touchEnd)
             * @type {number}
             */
            const SPEED_FILTER = 0.8; // Arbitrary chosen constant
            let prevScroll;
            let velocity;
            let lastTimestamp;
            let keepTrackingVelocity;
            function trackVelocity() {
                // current scroll position
                let scroll = {
                    x: fattable.scroll.scrollLeft,
                    y: fattable.scroll.scrollTop
                };
                // scrolled distance since last track
                let delta = {
                    x: scroll.x - prevScroll.x,
                    y: scroll.y - prevScroll.y
                };
                // if scroll changed direction then we do not take previous velocity into account
                let prevVelocityCoeff = {
                    x: delta.x * velocity.x > 0 ? 0.2 : 0,
                    y: delta.y * velocity.y > 0 ? 0.2 : 0,
                };
                // computing velocity
                let timeStamp = Date.now();
                velocity.x = SPEED_FILTER * delta.x * 1000 / (1 + timeStamp - lastTimestamp) + prevVelocityCoeff.x * velocity.x;
                velocity.y = SPEED_FILTER * delta.y * 1000 / (1 + timeStamp - lastTimestamp) + prevVelocityCoeff.y * velocity.y;
                // updating memory
                lastTimestamp = timeStamp;
                prevScroll = scroll;
                if (keepTrackingVelocity) {
                    $timeout(trackVelocity, 10);
                }
            }

            /**
             * Generates a momentum animation when touch stops
             * @param event
             */
            function animateMomentum() {
                keepTrackingVelocity = false;
                let endTime = Date.now();
                // Momentum appears only if velocity was greater than 10px/s
                if (Math.abs(velocity.x) > 10 || Math.abs(velocity.y) > 10) {
                    // Detach event listeners when momentum ends
                    let onMomentumEnd = function () {
                        element.off('touchstart', stopMomentumAnimation);
                        element.off('touchmove', stopMomentumAnimation);
                        fattable.scroll.dragging = false;
                    }

                    // Stop momentum on new touchevent
                    let interruptedMomentum = false;
                    let stopMomentumAnimation = function () {
                        interruptedMomentum = true;
                        onMomentumEnd();
                    }
                    element.on('touchstart', stopMomentumAnimation);
                    element.on('touchmove', stopMomentumAnimation);

                    // Compute if scroll can go further with inertia
                    let canScroll = function (delta) {
                        let canScrollH = (delta.x < 0 && fattable.scroll.scrollLeft > 0) || (delta.x > 0 && fattable.scroll.scrollLeft < fattable.scroll.maxScrollHorizontal);
                        let canScrollV = (delta.y < 0 && fattable.scroll.scrollTop > 0) || (delta.y > 0 && fattable.scroll.scrollTop < fattable.scroll.maxScrollVertical);
                        return canScrollH || canScrollV;
                    }

                    /*
                     * MOMENTUM (all formulas come from this article: https://ariya.io/2013/11/javascript-kinetic-scrolling-part-2)
                     */

                    // additional distance to scroll while momentum
                    let amplitude = {
                        x: SPEED_FILTER * velocity.x,
                        y: SPEED_FILTER * velocity.y
                    }
                    let previousScroll = {x: 0, y: 0};
                    let autoScroll = function () {
                        const TIME_CONSTANT = 325; // arbitrary constant chosen experimentally
                        let elapsedSinceStop = Date.now() - endTime; // elapsed time since touchend
                        let exponentialDecay = Math.exp(-elapsedSinceStop / TIME_CONSTANT);
                        // where scroll should be at this time (due to inertia)
                        let scroll = {
                            x: amplitude.x * (1 - exponentialDecay),
                            y: amplitude.y * (1 - exponentialDecay)
                        }
                        // missing scroll distance (where scroll should be minus where scroll is now)
                        let delta = {
                            x: scroll.x - previousScroll.x,
                            y: scroll.y - previousScroll.y
                        }
                        // scrolling of missing scrolled distance
                        fattable.scroll.setScrollXY(fattable.scroll.scrollLeft + delta.x, fattable.scroll.scrollTop + delta.y);
                        previousScroll = scroll;
                        // momentum keeps going on until amplitude is almost reached or animation got interrupted by a new touchevent
                        if ((Math.abs(amplitude.x - scroll.x) > 0.5 || Math.abs(amplitude.y - scroll.y) > 0.5) && !interruptedMomentum && canScroll(delta)) {
                            requestAnimationFrame(autoScroll);
                        } else {
                            onMomentumEnd()
                        }
                    }
                    requestAnimationFrame(autoScroll);
                }
            }

            /*
             * Actual getOnTouchCallbacks function
             */
            return function (touchStartEvent) {
                // Initialization of scrollFattable variables
                startScroll = {
                    x: fattable.scroll.scrollLeft,
                    y: fattable.scroll.scrollTop
                };
                lastScroll = {
                    x: fattable.scroll.scrollLeft,
                    y: fattable.scroll.scrollTop
                };
                startTouch = touchStartEvent.originalEvent.changedTouches[0];
                lastTouch = touchStartEvent.originalEvent.changedTouches[0];

                // Initialization of trackVelocity variables
                prevScroll = {
                    x: fattable.scroll.scrollLeft,
                    y: fattable.scroll.scrollTop
                };
                velocity = {x: 0, y: 0};
                lastTimestamp = Date.now();
                keepTrackingVelocity = true;

                return {
                    onTouchStart: function (e) {
                        trackVelocity(e);
                    },
                    onTouchMove: function (e) {
                        scrollFattable(e);
                    },
                    onTouchEnd: function (e) {
                        animateMomentum(e);
                    }
                };
            }
        })();

        function onTouchStart(event) {
            let currentOnTouchCallbacks = getOnTouchCallbacks(event, element);
            currentOnTouchCallbacks.onTouchStart();
            element.on("touchmove", currentOnTouchCallbacks.onTouchMove);
            let onTouchEnd = function(event) {
                currentOnTouchCallbacks.onTouchEnd(event);
                element.off("touchmove", currentOnTouchCallbacks.onTouchMove);
                element.off("touchend", onTouchEnd);
            }
            element.on("touchend", onTouchEnd);
        }

        element.on("touchstart", onTouchStart);

        let removeOnDestroy = scope.$on('$destroy', function() {
            element.off("touchstart", onTouchStart);
        });

        return function() {
            removeOnDestroy();
            element.off("touchstart", onTouchStart)
        }
    }
});

app.service('ClipboardUtils', function(ActivityIndicator) {
    const svc = this;
    svc.copyToClipboard = function(text, successMessage='Successfully copied to the clipboard!', errorMessage='Failed to copy to the clipboard!') {
        if (!text) {
            return;
        }
        var tempInput = document.createElement("textarea");
        tempInput.style = "position: absolute; left: -1000px; top: -1000px";
        tempInput.value = text;
        document.body.appendChild(tempInput);
        tempInput.select();
        try {
            document.execCommand("copy");
            ActivityIndicator.success(successMessage, 5000);
        } catch (err) {
            ActivityIndicator.error(errorMessage, 5000);
        }
        document.body.removeChild(tempInput);
    };
    // for pasting into non-editable element
    // called after capturing ctrl + v keydown event
    svc.pasteFromClipboard = function(event, callback) {
        let tempInput = document.createElement("textarea");
        tempInput.style = 'position: absolute; left: -1000px; top: -1000px';
        document.body.appendChild(tempInput);
        tempInput.select();
        // delay to capture imput value
        window.setTimeout(function() {
            let data = tempInput.value;

            callback(data);

            document.body.removeChild(tempInput);

            if (event) {
                event.currentTarget.focus();
            }
        }, 100);
    }
});

app.factory('DetectUtils', function() {
    const svc = {
        getOS: function() {
            let browser = '';

            if (navigator.appVersion.indexOf("Win") !== -1){
                browser = 'windows';
            }

            if (navigator.appVersion.indexOf("Mac")!=-1){
                browser = 'macos';
            }

            if (navigator.appVersion.indexOf("X11")!=-1){
                browser = 'unix';
            }

            if (navigator.appVersion.indexOf("Linux")!=-1){
                browser = 'linux';
            }

            return browser;
        }
    };

    return svc;
});

app.constant("GRAPHIC_EXPORT_OPTIONS", {
    fileTypes: ['PDF','JPEG','PNG'],
    orientationMap: {
        'LANDSCAPE': 'Landscape',
        'PORTRAIT': 'Portrait'
    },
    paperSizeMap: {
        'A4': 'A4',
        'A3': 'A3',
        'US_LETTER': 'US Letter',
        'LEDGER': 'Ledger (ANSI B)',
        'SCREEN_16_9': '16:9 (Computer screen)',
        'CUSTOM': 'Custom'
    },
    paperSizeMapPage: {
        'A4': 'A4',
        'A3': 'A3',
        'US_LETTER': 'US Letter',
        'LEDGER': 'Ledger (ANSI B)'
    },
    paperInchesMap: {
        'A4': 11.6929,
        'A3': 16.5354,
        'US_LETTER': 11,
        'LEDGER': 17,
        'SCREEN_16_9': 11
    },
    ratioMap: {
        'A4': Math.sqrt(2),
        'A3': Math.sqrt(2),
        'US_LETTER': 11 / 8.5,
        'LEDGER': 17 / 11,
        'SCREEN_16_9': 16 / 9,
        'CUSTOM': 16 / 9
    }
});

app.service('GraphicImportService', function(GRAPHIC_EXPORT_OPTIONS) {
    const svc = this;
    svc.computeHeight = function (width, paperSize, orientation) {
        if (orientation == "PORTRAIT") {
            return Math.round(width * GRAPHIC_EXPORT_OPTIONS.ratioMap[paperSize]);
        } else {
            return Math.round(width / GRAPHIC_EXPORT_OPTIONS.ratioMap[paperSize]);
        }
    };
});

app.service('StringUtils',  function() {
    return {
        transmogrify: function(name, usedNames, makeName) {
            if (! (usedNames instanceof Set)) {
                usedNames = new Set(usedNames);
            }
            if (! usedNames.has(name)) {
                return name;
            }
            if (! makeName) {
                makeName = i => `${name} ${i}`;
            }

            let i = 2;
            while (usedNames.has(makeName(i, name))) {
                i++;
            }
        return makeName(i, name);
        }
    };
});

app.service('PermissionsService', function(Dialogs, Logger) {
    return {
        buildUnassignedGroups: function(item, allGroups) {
            if (!item || !allGroups) return;

            return allGroups.filter(function(groupName) {
                return item.permissions.every(perm => perm.group !== groupName);
            });
        },
        buildUnassignedUsers: function(item, allUsers) {
            return allUsers.filter(user =>
                item.owner !== user.login && item.permissions.every(perm => perm.user !== user.login));
        },
        transferOwnership: function(scope, item, itemName, ownerUiField="ownerLogin") {
            const ownerUi = scope.ui && scope.ui[ownerUiField];
            if (!ownerUi || !item || ownerUi === item.owner) return;
            const newOwnerDisplayName = scope.allUsers.find(user => user.login === ownerUi).displayName || ownerUi;

            Dialogs.confirm(scope, 'Ownership transfer',
                `Are you sure you want to transfer ${itemName} ownership to '${newOwnerDisplayName}' ?`).then(function() {
                Logger.info(`Transferring ${itemName} ownership to ${ownerUi}`);
                item.owner = ownerUi;
            },function() {
                scope.ui[ownerUiField] = item.owner;
            });
        }
    }
});

app.service('FullScreenService', ['$location', '$state', function ($location, $state) {
    return {
        isFullScreen: () => $location.search().fullScreen && $location.search().fullScreen !== "false"
    }
}]);

})();
