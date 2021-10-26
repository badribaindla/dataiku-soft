(function() {
'use strict';

const app = angular.module('dataiku.catalog', []);


app.service('CatalogUtils', function() {
    const svc = this;

    function escape(str) {
        if (!str || typeof str != "string") {
            return;
        }
        return str.replace(/\\/g, '\\\\').replace(/&/g, '\\&').replace(/\+/g, '\\+');
    }

    this.getHash = function(queryString, facets) {
        const hash = [];
        if (queryString) {
            hash.push("q=" + escape(queryString));
        }
        for (const facet in facets) {
            if (!facets[facet] || !facets[facet].length) {
                continue;
            }
            hash.push(facet + "=" + facets[facet].map(escape).join('+'));
        }
        return hash.join("&");
    };

    this.getLink = function(queryString, facets, projectKey) {
        facets.projectKey = [projectKey];
        return "/catalog/#" + svc.getHash(queryString, facets);
    };

    this.parseHash = function($scope, hash) {
        if (!hash) return;
        const params = hash.match(/(\\&|[^&])+/g);  // split on non-escaped &
        const result = {};
        angular.forEach(params, function(param) {
            const parts = param.split('=');
            if (parts.length < 2) return;
            const key = parts[0];
            const value = parts.slice(1).join('').replace(/\\&/g, '&'); // replace \& by &
            result[key] = value;
            if (key == 'q') {
                $scope.query.queryString = value.replace(/\\\+/g, '+'); // replace \+ by +
            } else {
                const values = value.match(/(\\\+|[^\+])+/g);   // split on non-escaped +
                $scope.query.facets[key] = values.map(str => str.replace(/\\\+/, '+')); // replace \+ by +
            }
        });
        return result;
    };
});


app.service('CatalogTypes', function() {
    // taggable type -> catalog type mapping
    this.getCatalogType = function(taggableType) {
        if (!taggableType) return taggableType;
        const t = taggableType.toLowerCase();
        if (t.includes("notebook")) {
            return "notebook"
        }
        return t;
    };
});


app.controller("_CatalogControllerBase", function($state, $stateParams, $scope, searchEndpoint, $controller, $filter,
    Debounce, CatalogUtils, WT1, $timeout, TopNav, TaggingService) {

    let justDone = false;
    $scope.loadMoreItems = function() {
        if (!justDone && $scope.listItems && $scope.maxItems < $scope.listItems.length) {
            $scope.maxItems += 20;
            justDone = true;
            setTimeout(function() {
                justDone = false;
            }, 300);
        }
    };
    $scope.filterSortAndLimitItems = function() { // override to disable items filtering
        $scope.formatted_items = $filter('orderBy')($scope.listItems, $scope.sortOptions.column, $scope.sortOptions.reverse);
    };

    $scope.selection = {};
    $scope.listItems = [];
    $scope.facetsCollapse = {};
    $scope.facetsShowAll = {};
    $scope.facetsFilters = {};

    $scope.query = {
        queryString: "",
        facets: {}
    };

    CatalogUtils.parseHash($scope, $stateParams.hash);

    // Sort by score by default
    $scope.sortOptions = {
        column: '_score',
        reverse: true
    };

    $scope.canShowSearchResults = function() {
        return $scope.notReady || $scope.listItems === undefined || $scope.formatted_items === undefined || $scope.formatted_items.length !== 0;
    };
    let firstTimeRedirect = true;
    let displayedSearchEtag = 0;
    let latestSearchEtag = 0;
    $scope.search = function() {
        const searchEtag = ++latestSearchEtag;
        $scope.facetsShowAll['_type'] = false;
        if ($state.current.name.includes('catalog')) {
            // Do not change states and location hashes when not on catalog
            if (firstTimeRedirect) {
                $state.go('.', {hash: CatalogUtils.getHash($scope.query.queryString, $scope.query.facets)}, {notify: false, location:'replace'});
                firstTimeRedirect = false;
            } else {
                $state.go('.', {hash: CatalogUtils.getHash($scope.query.queryString, $scope.query.facets)}, {notify: false});
            }
        }
        delete $scope.formatted_items;

        const before = new Date().getTime();
        const promise = searchEndpoint($scope.query.queryString, $scope.query.facets);
        if (!promise) {
            return;
        }
        promise.success(function(resp) {
                let results; // Dirty, because inbox and catalog don't have the same result format...
                if (resp.results) {
                    results = resp.results;
                } else {
                    results = resp;
                }
                $scope.notReady = false;
                if (searchEtag <= displayedSearchEtag) {
                    return; // we already refreshed the UI for more recent results
                }
                const after = new Date().getTime();
                getDigestTime($scope, function(time) {
                    WT1.event("catalog-search-done", {searchTime: after - before, digestTime: time,});
                });
                addFacets(results.aggregations);
                $scope.error = false;
                $scope.results = results;
                $scope.listItems = results.hits.hits;
                $scope.filterSortAndLimitItems();
                displayedSearchEtag = searchEtag;
            })
            .error(function(data, status, headers, config) {
                if (status === 503 && data.errorType === "NotReady") {
                    $scope.notReady = true;
                    $timeout($scope.search, 5000); // retry in 5 seconds
                } else {
                    $scope.notReady = false;
                    $scope.error = true;
                }
            });
    };

    // Make sure that active facets are displayed even if their doc_count is 0
    function addFacets(aggs) {
        for (const field in aggs) {
            angular.forEach($scope.query.facets[field], function(value) {
                if (!aggs[field].agg.buckets.filter(function(bucket) {
                        return bucket.key == value;
                    }).length) {
                    aggs[field].agg.buckets.push({key: value, doc_count: 0});
                }
            });
        }
        if ($scope.inboxPage) {
            const statusFacetBuckets = aggs['closed'].agg.buckets;
            if (!statusFacetBuckets.find(bckt => bckt.key === 0)) {
                statusFacetBuckets.push({key: 0, doc_count: 0});
            }
            if (!statusFacetBuckets.find(bckt => bckt.key === 1)) {
                statusFacetBuckets.push({key: 1, doc_count: 0});
            }
        }
    }

    $scope.hasSearch = function() {
        return $scope.query.queryString !== '' || $scope.hasFacets();
    };

    $scope.hasFacets = function() {
        for (const field in $scope.query.facets) {
            for (let i = 0; i < ($scope.query.facets[field] || []).length; i++) {
                if (field !== '_type' || $scope.query.facets[field][i] !== 'all') return true;
            }
        }
        return false;
    };

    $scope.resetSearch = function() {
        $scope.query.queryString = "";
        $scope.query.facets = {};
    };

    $scope.$watch('query.facets', function(nv, ov) {
        if ((ov._type && ov._type.length) && (!nv._type || !nv._type.length)) { // remove subtype facet when switching object type
            delete nv.type_raw;
        }

        Object.entries(nv).forEach(e => $.isEmptyObject(e[1]) && delete nv[e[0]]);
        Object.entries(ov).forEach(e => $.isEmptyObject(e[1]) && delete ov[e[0]]);

        if (!angular.equals(nv, ov)) {
            $timeout($scope.search);
        }
    }, true);
    $scope.$watch('query.queryString', Debounce().withDelay(100, 200).wrap($scope.search));
    $scope.$watch('sortOptions.reverse', function(nv, ov) {
        if (nv !== ov) {
            $scope.filterSortAndLimitItems();
        }
    });
    $scope.$watch('sortOptions.column', function(nv, ov) {
        if (nv !== ov) {
            $scope.filterSortAndLimitItems();
        }
    });
    $scope.$watch('maxItems', function(nv, ov) {
        if (nv !== ov) {
            $scope.filterSortAndLimitItems()
        }
    });

    $scope.$watch("query", function(nv, ov) {
        $scope.maxItems = 20;
        $scope.filterSortAndLimitItems();
        $scope.$broadcast('clearMultiSelect')
    }, true);

    $scope.selectInput = function() {
        $(".catalog-search-input").select();
    };

    $scope.itemToColor = function(item) {
        if(!item) return;
        if (item._type == 'insight') {
            return $filter('insightTypeToColor')(item._source.type_raw) + ' insight-icon';
        } else if (item._type == 'recipe') {
            return 'recipe-' + $filter('recipeTypeToIcon')(item._source.type_raw).split('_')[0].split('icon-')[1];
        } else {
            return item._type;
        }
    };

    $scope.onFacetSearchKeyDown = function(e) {
        if (e.keyCode === 27) { // ESC key
            e.target.blur();
            angular.element(e.target).scope().$parent.showInput = false;
            angular.element(e.target).scope().$parent.facetValueSearch = '';
        }
    };

    $scope.facetValueMatching = function(field) {
        return function(search) {
            search = (search || "").toLowerCase();
            return function(item) {
                if (!search || !search.length) return true;
                return (item.key.toLowerCase().indexOf(search) != -1);
            }
        }
    };

    $scope.facetValueNotMatching = function(field, search) {
        return (item => !$scope.facetValueMatching(field)(search)(item))
    };

    TopNav.setLocation(TopNav.DSS_HOME, "catalog");
    TopNav.setNoItem();
    TaggingService.fetchGlobalTags();
});

})();