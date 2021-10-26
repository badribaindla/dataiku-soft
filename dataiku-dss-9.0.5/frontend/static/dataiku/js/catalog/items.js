(function() {
'use strict';

const app = angular.module('dataiku.catalog');


const FACET_FIELDS_DISPLAY_NAMES = Object.freeze({
    'projectName': 'Project',
    'type_raw': 'Type',
    'numColumns': 'Columns',
    'usedIn': 'Used in',
    'user': 'Contributors',
    'storedAs': 'Stored as',
    'projectKey.raw': 'Project',
    'tag.raw': 'Tags',
    'catalog.raw': 'Database Catalog',
    'connection.raw': 'Connection',
    'schema.raw': 'Schema',
    'partitioned': 'Partitioned',
    'closed': 'Discussion status'
});


const DISPLAY_NAMES = Object.freeze({
    recipeTypes: {
        'shaker': 'Prepare'
    },
    notebookTypes: {
        'SQL_NOTEBOOK': 'SQL',
        'JUPYTER_NOTEBOOK': 'Jupyter',
        'IPYTHON_NOTEBOOK': 'Jupyter' //Legacy
    },
    notebookLanguages: {
        'SQL': 'SQL',
        'python2': 'Python 2',
        'python3': 'Python 3',
        'ir': 'R',
        'toree': 'Scala'
    }
});

/**
     * CatalogItemService makes a set of simple re-useable functions for displaying/formatting catalog-items
     * available to other controllers e.g. personal home page.
     */
    app.service('CatalogItemService', function( StateUtils, $location, Navigator, $filter, $state, FLOW_COMPUTABLE_TYPES) {
        const svc = this;

        svc.getLink = function (_type, _source, discussionId) {
            if (!_type || !_source) return;

            switch (_type) {
                case 'article':
                    return StateUtils.href.dssObject(_type.toUpperCase(), _source.id, _source.projectKey);

                case 'dashboard':
                    return StateUtils.href.dashboard(_source.id, _source.projectKey, {name: _source.name});

                case 'column':
                    return $state.href(
                        'projects.project.datasets.dataset.explore',
                        {projectKey: _source.projectKey, datasetName: _source.dataset}
                    );

                case 'comment':
                    return StateUtils.href.dssObject(
                        _source.objectType.toUpperCase(),
                        _source.objectId,
                        _source.projectKey
                    );
                case 'table':
                    return $state.href(
                        'external-table',
                        {
                            connection: _source.virtualConnection ? _source.virtualConnection : _source.connection,
                            catalog: _source.catalog,
                            schema: _source.schema,
                            table: _source.name
                        }
                    );
                case 'discussion':
                    const obj = {
                        type: _source.objectType.toUpperCase(),
                        id: _source.objectId,
                        projectKey: _source.projectKey
                    };
                    return StateUtils.href.taggableObject(obj, {moveToTargetProject: false, discussionId: _source.discussionId});
                case 'flow_zone':
                    return StateUtils.href.flowZone(_source.id, _source.projectKey, _source.name);
                default:
                    return StateUtils.href.dssObject(
                        (_type === 'notebook') ? _source.type_raw.toUpperCase() : _type.toUpperCase(),
                        _source.hasOwnProperty('id') ? _source.id : _source.name,
                        _source.projectKey
                    )
            }
        };

        svc.goToItem = function (_type, _source) {
            $location.path(svc.getLink(_type, _source));
        };

        svc.hasNavigator = function (_type) {
            return ['dataset', 'recipe', 'saved_model', 'model_evaluation_store', 'managed_folder', 'streaming_endpoint'].indexOf(_type) > -1;
        };

        svc.openNavigator = function (_type, _source) {
            return function () {
                Navigator.show(_source.projectKey, _type.toUpperCase(), _source.id);
            };
        };

        svc.getFlowLink = function (_type, _source, _contextProjectKey) {
            if (!_type || !_source) return;

            var id = "";

            const flowProjectKey = _contextProjectKey ||_source.projectKey;

            switch (_type) {
                case 'dataset':
                    id = "dataset_" + _source.projectKey + '.' + _source.id;
                    break;
                case 'managed_folder':
                    id = "managedfolder_" + _source.projectKey + '.' + _source.id;
                    break;
                case 'model_evaluation_store':
                    id = "modelevaluationstore_" + _source.projectKey + '.' + _source.id;
                    break;
                case 'saved_model':
                    id = "savedmodel_" + _source.projectKey + '.' + _source.id;
                    break;
                case 'streaming_endpoint':
                    id = "streamingendpointl_" + _source.projectKey + '.' + _source.id;
                    break;
                case 'recipe':
                    id = "recipe_" + _source.id;
                    break;
            }

            return $state.href(
                'projects.project.flow',
                {projectKey: flowProjectKey, id: id}
            );
        };

        svc.hasFlowLink = function (_type) {
            return FLOW_COMPUTABLE_TYPES.includes(_type.toUpperCase()) || _type === 'recipe';
        };

        svc.itemToIcon = function (_type, _source, inList) {
            if (!_type || !_source) {
                return;
            }

            switch (_type) {
                case 'dataset':
                    return inList ? $filter('typeToIcon')(_source.type_raw) : $filter('datasetTypeToIcon')(_source.type_raw);
                case 'notebook':
                    return $filter('typeToIcon')(_source.type_raw);
                case 'web_app':
                    return $filter('subTypeToIcon')(_source.subtype || _source.type_raw, _type);
                default:
                    return $filter('subTypeToIcon')(_source.type_raw, _type);
            }
        };

        svc.itemToColor = function (_type, _source) {
            if (!_type || !_source) return;
            if (_type == 'insight') {
                return $filter('insightTypeToColor')(_source.type_raw) + ' insight-icon';
            } else if (_type == 'recipe') {
                return 'recipe-' + $filter('recipeTypeToIcon')(_source.type_raw).split('_')[0].split('icon-')[1];
            } else {
                return _type.toLowerCase();
            }
        };
    });



app.controller('CatalogItemsController', function($controller, $scope, $injector, $state, $stateParams, $route,
    $q, $location, $filter, $timeout,
    DataikuAPI, CreateModalFromTemplate, WT1, TopNav, DatasetsService, StateUtils, Debounce,
    CatalogUtils, Navigator, DashboardUtils, CachedAPICalls, CatalogItemService) {

    const overridenCatalogUtils = {
        getHash: CatalogUtils.getHash,
        getLink: CatalogUtils.getLink,
        parseHash: function($scope, hash) {
            CatalogUtils.parseHash($scope, hash);
            if (!$scope.query.facets['scope']) {
                $scope.query.facets['scope'] = $stateParams.scope ? $stateParams.scope : ['dss'];
            }
            if (!$scope.query.facets['_type'] && $stateParams._type) {
                $scope.query.facets['_type'] = $stateParams._type;
            }
        }
    };

    $controller("_CatalogControllerBase", {
        $scope: $scope,
        searchEndpoint: DataikuAPI.catalog.search,
        CatalogUtils: overridenCatalogUtils
    });

    $scope.getCatalogScope = () => $scope;

    $scope.tableComparator = function(one, other) {
        return one && other && one._id === other._id;
    };

    $scope.getNames = function(tables) {
        return tables.map(el => el._source.name);
    };

    $scope.getImportData = function (tables) {
        const selectedTables = tables || $scope.selection.selectedObjects;

        const tableKeys = selectedTables.map(t => ({
            connectionName: t._source.connection,
            catalog: t._source.catalog,
            schema: t._source.schema,
            name: t._source.name
        }));
        return {
            workflowType : "KEYS",
            tableKeys : tableKeys
        };
    };

    $scope.importTables = function (tables, zoneId) {
        const selectedTables = tables && !angular.isArray(tables) ? [tables] : tables;
        if ($stateParams.projectKey) {
            $state.go('projects.project.tablesimport', {
                projectKey: $stateParams.projectKey,
                importData : JSON.stringify($scope.getImportData(selectedTables)),
                zoneId
            });
        } else {
            let newScope;
            if (selectedTables) {
                newScope = $scope.$new();
                newScope.getImportData = () => $scope.getImportData(selectedTables)
            } else {
                newScope = $scope;
            }
            CreateModalFromTemplate("/templates/datasets/tables-import-project-selection-modal.html", newScope, "TablesImportProjectSelectionModalController");
        }
    };

    $scope.goToConnectionsExplorer = function() {
        if ($state.includes('projects.project')) {
            $state.go('projects.project.catalog.connectionexplorer');
        } else {
            $state.go('catalog.connectionexplorer');
        }
    };

    $scope.hasUnindexedConnections = function() {
        const iau = $scope.indexedAndUnindexed;
        if (!iau) {
            return;
        }
        return (iau.possiblyUnscannedHive || iau.unindexedButIndexableConnections > 0) &&
            ($scope.query.facets.scope[0] === "external" || $scope.query.facets.scope[0] === "all" );
    };

    const parentResetSearch = $scope.resetSearch;
    $scope.resetSearch = function() {
        const facetsScope = $scope.query.facets.scope;
        parentResetSearch();
        $scope.query.facets.scope = facetsScope || ['dss'];
    };

    $scope.isItemSelectable = function(item) {
        return item._type === 'table';
    };

    $scope.clickShowSelected = function() {
        $scope.showSelectedOnly = !$scope.showSelectedOnly;
    };

    $scope.isFunction = angular.isFunction;

    // Init

    $scope.showSelectedOnly = false;

    $scope.showAllTypes = false;

    $scope.projectKey = $stateParams.projectKey;
    $scope.itemsPage = true;

    $scope.locations = [
        {name: 'DSS', id: 'dss'},
        {name: 'External tables', id: 'external'}
    ];

    $scope.sortBy = [
        {
            label: 'Relevance',
            value: '_score'
        },
        {
            label: 'Type',
            value: i => i._type + i._source.type_raw
        },
        {
            label: 'Creation',
            value: i => i._source.createdOn
        },
        {
            label: 'Last modification',
            value: i => i._source.lastModifiedOn
        }
    ];


    const projectNames = {};

    $scope.types = [];
    $scope.tagMaps = {};
    $scope.users = {};

    // Watches

    $scope.$watch('selection.selectedObjects.length', function(nv, ov) {
        if (ov > 0 && nv === 0) {
            $scope.showSelectedOnly = false;
        }
    });

    function init() {
        DataikuAPI.connections.countIndexedAndUnindexed()
            .success(function(response) {
                $scope.indexedAndUnindexed = response;
            })
            .error(setErrorInScope.bind($scope));

        DataikuAPI.taggableObjects.listAllTags()
            .success(function(response) {
                $scope.tagMaps = response;
            })
            .error(setErrorInScope.bind($scope));

        DataikuAPI.security.listUsers()
            .success(function(response) {
                angular.forEach(response, function(user) {
                    $scope.users[user.login] = user.displayName;
                })
            })
            .error(setErrorInScope.bind($scope));

        DataikuAPI.projects.list()
            .success(function(response) {
                angular.forEach(response, function(project) {
                    projectNames[project.projectKey] = project.name;
                })
            })
            .error(setErrorInScope.bind($scope));
    }

    // Make sure that active facets are displayed even if their doc_count is 0
    function addFacets(aggs) {
        for (const field in aggs) {
            angular.forEach($scope.query.facets[field], function(value) {
                if (field == '_type' && value == 'all') return;
                if (!aggs[field].agg.buckets.filter(function(bucket) {
                        return bucket.key == value;
                    }).length) {
                    aggs[field].agg.buckets.push({key: value, doc_count: 0});
                }
            });
        }
    }

    $scope.getLink = function (input, discussionId) {
        if (!input) return;
        return CatalogItemService.getLink(input._type, input._source, discussionId);
    };

    $scope.goToItem = function(item) {
        if (!item) return;
        return CatalogItemService.goToItem(input._type, input._source);
    };

    $scope.hasNavigator = function(item) {
        if (!item) return;
        return CatalogItemService.hasNavigator(input._type);
    };

    $scope.openNavigator = function(item) {
        if (!item) return;
        return CatalogItemService.openNavigator(input._type, input._source);
    };

    $scope.getFlowLink = function(input) {
        if (!input) return;
        return CatalogItemService.getFlowLink(input._type, input._source);
    };

    $scope.hasFlowLink = function(input) {
        if (!input) return;
        return CatalogItemService.hasFlowLink(input._type, input._source);
    };

    $scope.formatFacetField = function(field) {
        return FACET_FIELDS_DISPLAY_NAMES[field] || $filter('capitalize')(field);
    };

    $scope.formatFacetValue = function(value, facet) {
        switch (facet) {
            case 'closed':
                return value ? 'Closed' : 'Open';
            case 'projectKey.raw':
                return projectNames[value] || value;
            case '_type':
                return $filter('capitalize')(value.replace(/_/g, " "));
            case 'user':
                return $scope.users[value] || value;
            case 'owner':
                return $scope.users[value] || value;
            case 'language':
                return DISPLAY_NAMES.notebookLanguages[value] || value;
            case 'connection.raw':
                return $filter('connectionNameFormatter')(value);
            case 'type_raw':
                if (!$scope.query.facets._type) {
                    return value;
                }
                switch ($scope.query.facets._type[0]) {
                    case 'dataset':
                        return $filter('capitalize')(value);
                    case 'recipe':
                        return DISPLAY_NAMES.recipeTypes[value] || $filter('capitalize')(value.replace(/_/g, " "));
                    case 'notebook':
                        return DISPLAY_NAMES.notebookTypes[value];
                    case 'saved_model':
                        return $filter('capitalize')(value);
                    case 'model_evaluation_store':
                        return $filter('capitalize')(value);
                    case 'insight':
                        return DashboardUtils.getInsightHandler(value).name || 'Unknown';
                    default:
                        return value;
                }
            case 'partitioned':
                return value === 0 ? 'No' : 'Yes';
        }
        return value;
    };

    // Override to allow to search for project by both name and key in the project list facet
    $scope.facetValueMatching = function(field) {
        return function(search) {
            search = (search || '').toLowerCase();
            return function(item) {
                if (!search || !search.length) {
                    return true;
                }
                if (item.key.toLowerCase().indexOf(search) != -1) {
                    return true;
                } else if (field == "projectKey.raw") {
                    return (projectNames[item.key] || '').toLowerCase().indexOf(search) != -1;
                }
                return false;
            }
        }
    };

    $scope.itemToIcon = function(item, inList) {
        if (!item) return;
        return CatalogItemService.itemToIcon(item._type, item._source, inList);
    };

    $scope.formatItemName = function(item, inList) {
        if (item._type == 'discussion') {
            const src = item._source;
            // Comes from _source, encode HTML entities in order to display attributes like <stuff
            const topic = (item.highlight && item.highlight['discussions.topic']) ? item.highlight['discussions.topic'][0] : ($filter('escapeHtml')(((src.discussions && src.discussions.length && src.discussions[0].topic) ? src.discussions[0].topic : "Unnamed discussion")));
            const title = topic + " <small>on " + src.objectType.replace('_', ' ') + "</small> " + $filter('escapeHtml')(src.objectName);
            return title;
        }
        if (item.highlight) {
            if (item.highlight.name && item.highlight.name.length) {
                return item.highlight.name[0];
            }
            if (item.highlight['name.raw'] && item.highlight['name.raw'].length) {
                return item.highlight['name.raw'][0];
            }
        }
        // Comes from _source, encode HTML entities in order to display attributes like <stuff
        return $filter('encodeHTML')(item._source.name);
    };

    $scope.getCommentLink = function(item) {
        const tor = {
            type: item._source.objectType.toUpperCase(),
            id: item._source.objectId,
            projectKey: item._source.projectKey
        };
        return StateUtils.href.taggableObject(tor, {moveToTargetProject: false});
    };

    $scope.highlightedAttachmentsList = function(item) {
        if (!item.hasOwnProperty('highlightedAttachments')) {
            item.highlightedAttachments = [];
            let strippedAttachments = [];
            if (item.highlight && item.highlight['attachments.displayName']) {
                strippedAttachments = item.highlight['attachments.displayName'].map(str => str.replace(/<\/?em>/g, ''));
            }
            angular.forEach(item._source.attachments, function(attachment) {
                const index = strippedAttachments.indexOf(attachment.name);
                if (index == -1) {
                    item.highlightedAttachments.push(attachment);
                } else {
                    item.highlightedAttachments.push({
                        displayName: item.highlight['attachments.displayName'][index],
                        type: attachment.type
                    });
                }
            });
        };

        return item.highlightedAttachments;
    };

    $scope.highlightedTagList = function(item) {
        if (!item.hasOwnProperty('highlightedTags')) {
            item.highlightedTags = [];
            let strippedTags = [];
            if (item.highlight && item.highlight.tag) {
                strippedTags = item.highlight.tag.map(str => str.replace(/<\/?em>/g, ''));
            }
            angular.forEach(item._source.tag, function(tag) {
                const index = strippedTags.indexOf(tag);
                if (index == -1) {
                    item.highlightedTags.push({raw: tag});
                } else {
                    item.highlightedTags.push({raw: tag, highlighted: item.highlight.tag[index]});
                }
            });
        }

        return item.highlightedTags;
    };

    $scope.getLinkForElement = function(currentProjectKey, element) {
        const projectKey = element.projectKey || currentProjectKey;
        switch (element.type) {
            case "DATASET":
                if (element.projectKey && element.projectKey !== currentProjectKey) {
                    return $state.href("projects.project.foreigndatasets.dataset.explore", {
                        datasetFullName: element.datasetFullName,
                        projectKey: currentProjectKey
                    });
                } else {
                    return $state.href("projects.project.datasets.dataset.summary", {
                        datasetName: element.name, projectKey: projectKey
                    });
                }
            case "SAVED_MODEL":
                return $state.href("projects.project.savedmodels.savedmodel.summary", {
                    smId: element.name,
                    projectKey: projectKey
                });
            case "MODEL_EVALUATION_STORE":
                return $state.href("projects.project.modelevaluationstores.modelevaluationstore.evaluations", {
                    smId: element.name,
                    projectKey: projectKey
                });
            case "MANAGED_FOLDER":
                return $state.href("projects.project.managedfolders.managedfolder.summary", {
                    odbId: element.name,
                    projectKey: projectKey
                });
            case "STREAMING_ENDPOINT":
                return $state.href("projects.project.streaming-endpoints.streaming-endpoint.settings", {
                    streamingEndpointId: element.name,
                    projectKey: projectKey
                });
            default:
                throw "Incorrect or missing flow computable type";
        }
    };

    $scope.itemCount = function() {
        let type = "all";
        if ($scope.query.facets._type && $scope.query.facets._type.length) {
            type = $scope.query.facets._type[0].replace('_', ' ');
        }
        const plural = $scope.results && $scope.results.hits.total > 1;
        if (type == 'analysis') {
            type = plural ? 'analyses' : 'analysis';
        } else if (type == 'all') {
            type = 'item' + (plural ? 's' : '');
        } else {
            type += plural ? 's' : '';
        }
        return '<strong>' + ($scope.results ? $scope.results.hits.total : 0) + '</strong> ' + type;
    };

    init();
});


app.controller('CatalogRefreshController', function($scope, $rootScope, DataikuAPI, CachedAPICalls, $sce,
                                                    CatalogItemService, ActivityIndicator, ExposedObjectsService, FLOW_COMPUTABLE_TYPES) {
    $scope.$watch("formatted_items", function() {
        if ($scope.formatted_items && $scope.selected && $scope.selected.item) {
            for (let i = 0; i < $scope.formatted_items.length; i++) {
                if ($scope.formatted_items[i]._id == $scope.selected.item._id) {
                    $scope.selected.index = i;
                    $scope.selected.item = $scope.formatted_items[i];
                    return;
                }
            }
            $scope.selected.index = null;
            $scope.selected.item = null;
        }
    });

    function breakFlowComputableNameIntoParts(name) {
        const parts = name.split('.');
        if (parts.length === 1) return {name: name};
        return {
            projectKey: parts[0],
            name: parts.slice(1).join(''),
            fullName: name
        };
    }

    function reformatNames(flowComputables) {
        if (!flowComputables) return [];
        return flowComputables.map(e => Object.assign(e, breakFlowComputableNameIntoParts(e['name'])));
    }

    function highlightedColumnList(item, columns) {
        const highlightedColumns = [];
        let strippedCols = [];
        if (item.highlight && item.highlight['column']) {
            strippedCols = item.highlight['column'].map(str => str.replace(/<\/?em>/g, ''));
        }
        angular.forEach(columns, function(column) {
            const index = strippedCols.indexOf(column.name);
            if (index === -1) {
                highlightedColumns.push(column);
            } else {
                highlightedColumns.push({
                    name: item.highlight['column'][index],
                    type: column.type
                });
            }
        });

        return highlightedColumns;
    }

    $scope.$watch("selected.item", function(nv, ov) {
        if (!$scope.selected || !$scope.selected.item) return;
        const item = $scope.selected.item;

        const related = nv._source.rawRelatedItems;
        if (related) {
            nv.related = {projects:[],datasets:[],recipes:[]};
            related.projects.forEach(p => {
                nv.related.projects.push({key:p.key, name: p.name});
                p.datasets.forEach(d => {
                    nv.related.datasets.push($.extend({}, {projectKey: p.key}, d));
                    d.recipes.forEach(r => {
                        nv.related.recipes.push($.extend({}, {projectKey: p.key}, r));
                    });
                });
            });
        }

        if (item._type === 'insight') {
            $scope.insightData = null;
            DataikuAPI.dashboards.insights.get(item._source.projectKey, item._source.id)
                .success(function(response) {})
                .error(setErrorInScope.bind($scope));
        }

        else if (item._type === 'dataset') {
            item.splitOutputs = reformatNames(item._source.recursiveOutputs);
            item.splitOutputsByType = {};
            item.splitInputsByType = {};
            const obt = item.splitOutputsByType;
            const ibt = item.splitInputsByType;
            reformatNames(item._source.recursiveOutputs).forEach(out => {
                if (!obt[out.type]) {
                    obt[out.type] = [];
                }
                obt[out.type].push(out);
            });
            reformatNames(item._source.recursiveInputs).forEach(out => {
                if (!ibt[out.type]) {
                    ibt[out.type] = [];
                }
                ibt[out.type].push(out);
            });
        }

        else if (item._type === 'recipe') {
            item.splitOutputs = reformatNames(item._source.outputs);
            item.splitInputs = reformatNames(item._source.inputs);
        }

        $scope.navigatorFn = CatalogItemService.hasNavigator(item._type) ? CatalogItemService.openNavigator(item._type, item._source) : false;
        item.highlightedColumns = highlightedColumnList(item, item._source.columns);
        item.highlightedPartitionColumns = highlightedColumnList(item, item._source.partitioning);

        const exposable = FLOW_COMPUTABLE_TYPES.includes(item._type.toUpperCase());
        const targetProjectDefined = !!$scope.projectKey;
        const selectedItemSource = item._source;

        const exposeObjectToTargetProjectFn = () => {
            DataikuAPI.projects
                .addExposedObject(selectedItemSource.projectKey, item._type.toUpperCase(), selectedItemSource.id, $scope.projectKey)
                .success((data) => {
                    const linkMessage = `View ${selectedItemSource.name} in flow`;
                    const message = `${data.title} <a href='${CatalogItemService.getFlowLink(item._type, selectedItemSource, $scope.projectKey)}'> ${linkMessage}</a>.`;
                    if (data.severity === 'SUCCESS') {
                        ActivityIndicator.success(message, 5000);
                    } else {
                        ActivityIndicator.info(message, 5000);
                    }
                })
                .error(setErrorInScope.bind($scope.getCatalogScope()));
        };
        const exposeObjectToProjectsFn = //
            () => ExposedObjectsService.exposeSingleObject(item._type.toUpperCase(), selectedItemSource.id, selectedItemSource.name, selectedItemSource.projectKey);


        $scope.exposeObjectFn = null;
        $scope.exposeLabel = null;
        $scope.exposeDisabled = null;
        if (exposable) {
            if (targetProjectDefined) {
                $scope.exposeObjectFn = exposeObjectToTargetProjectFn;
                if ($scope.projectKey === selectedItemSource.projectKey) {
                    $scope.exposeLabel = 'Target project must be different from source';
                    $scope.exposeDisabled = true;
                } else if (selectedItemSource.usedIn && selectedItemSource.usedIn.includes($scope.projectKey)) {
                    $scope.exposeLabel = 'Object already exposed';
                    $scope.exposeDisabled = true;
                } else {
                    $scope.exposeLabel = 'Expose in ' + $scope.projectKey;
                    $scope.exposeDisabled = false;
                }
            } else {
                $scope.exposeObjectFn = exposeObjectToProjectsFn;
                $scope.exposeLabel = 'Expose';
                $scope.exposeDisabled = false;
            }
        }
    });

    $scope.$watch("selected.item.highlight.description[0]", function(nv, ov) {
        if (!nv) return;
        let description = nv.replace(/<em>/g, "((STARTEM))").replace(/<\/em>/g, "((ENDEM))");
        CachedAPICalls.emojisTable.then(function(emojisTable) {
            marked.setOptions({
                emoji: function(emoji) {
                    return emoji in emojisTable ? emojisTable[emoji] : (':' + emoji + ':');
                }
            });
            description = marked(description);
            $scope.selected.item.$highlightedDescription = description.replace(/\(\(STARTEM\)\)/g, '<em class="highlight">').replace(/\(\(ENDEM\)\)/g, "</em>");
        });
    });

    $scope.$watch("selected.item.highlight.shortDesc[0]", function(nv, ov) {
        if (!nv) return;
        let shortDesc = nv.replace(/<em>/g, "((STARTEM))").replace(/<\/em>/g, "((ENDEM))");
        CachedAPICalls.emojisTable.then(function(emojisTable) {
            marked.setOptions({
                emoji: function(emoji) {
                    return emoji in emojisTable ? emojisTable[emoji] : (':' + emoji + ':');
                }
            });
            shortDesc = marked(shortDesc);
            $scope.selected.item.$highlightedShortDesc = shortDesc.replace(/\(\(STARTEM\)\)/g, '<em class="highlight">').replace(/\(\(ENDEM\)\)/g, "</em>");
        });
    });
});


app.directive('itemHighlight', function() {
    return {
        scope: {
            highlights: '=itemHighlight',//item.highlight.hasOwnProperty('projects') // item['projects']
            label: '@',
            plural: '@'
        },
        template: "<p ng-if=\"highlights\" >\n    <span>{{label | plurify : highlights.length : plural}}:</span>\n    <span ng-if=\"highlights.length > 4\">\n        <span>{{highlights.length}} matching</span>\n    </span>\n    <span ng-if=\"highlights.length < 5\" ng-repeat=\"highlight in highlights track by $index\">\n        <span ng-bind-html=\"highlight\"></span>\n        <span class=\"separator\" ng-show=\"!$last\"> • </span>\n    </span>\n</p>\n            "
    };
});


})();
