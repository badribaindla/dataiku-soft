(function() {
'use strict';

const app = angular.module('dataiku.catalog');


app.controller('CatalogMeaningsController', function($scope, $controller, TopNav, DataikuAPI, Dialogs, CreateModalFromTemplate, UDM_TYPES) {

    $controller("_CatalogControllerBase", {
        $scope : $scope,
        searchEndpoint : DataikuAPI.catalog.searchMeanings
    });

    $controller("_MeaningsCatalogSupportController", {$scope});


    $scope.meaningsPage = true;
    $scope.udmTypes = UDM_TYPES;

    $scope.editUDM = function(item) {
        CreateModalFromTemplate("/templates/meanings/edit-udm.html", $scope, null, function(newScope) {
            newScope.initModal(item._source.id, $scope.search);
        })
    };
    $scope.goToItem = $scope.editUDM; // For compatibility with generic catalog stuff

    $scope.deleteUDM = function(item) {
        DataikuAPI.meanings.prepareDeleteUDM(item._id)
            .success(function(data) {
                Dialogs.confirmInfoMessages($scope, 'Delete meaning', data, 'Are you sure you want to delete this meaning?', false)
                    .then(function() {
                        DataikuAPI.meanings.deleteUDM(item._id)
                            .success($scope.search)
                            .error(setErrorInScope.bind($scope));
                    });
            })
            .error(setErrorInScope.bind($scope));
    };

    $scope.createUDM = function(item) {
        CreateModalFromTemplate("/templates/meanings/edit-udm.html", $scope, null, function(newScope) {
            newScope.initModal(null, $scope.search);
        })
    };

});


// Required stuff for catalog based UI compatibility
app.controller('_MeaningsCatalogSupportController', function($scope, $filter, UDM_TYPES) {

    $scope.hasNavigator = item => false;

    $scope.itemToIcon = item =>'icon-dku-meanings';

    $scope.getLink = input => null;

    $scope.itemCount = function() {
        const hits = $scope.results && $scope.results.hits ? $scope.results.hits.total : 0;
        return '<strong>' + hits + '</strong> meaning' + (hits > 1 ? 's' : '');
    };

    $scope.selectInput = function() {
        $(".catalog-search-input").select();
    };

    const NICE_FACET_FIELDS = {
        "udm_type": "Type"
    };

    $scope.formatFacetField = function(field) {
        return NICE_FACET_FIELDS[field] || $filter('capitalize')(field);
    };

    $scope.formatFacetValue = function(value, facet) {
        switch (facet) {
            case 'udm_type':    return UDM_TYPES[value]; break;
            default:            return value;
        }
    };

    $scope.formatItemName = function(item, inList) {
        if (item.highlight && item.highlight.label && item.highlight.label.length) {
            return item.highlight.label[0];
        }
        // Comes from _source, encode HTML entities in order to display attributes like <stuff
        return $filter('encodeHTML')(item._source.label);
    };

    $scope.sortBy = [
        {label: 'Relevance', value: '_score' },
        {label: 'Type', value: i => i._source.udm_type },
        {label: 'Number of uses', value: i => (i.inner_hits.column.hits.hits || []).length }
    ];
});


app.controller("MeaningRightColumnController", function($scope, UDM_TYPES) {
    $scope.udmTypes = UDM_TYPES;
    $scope.highlightedDescription = function() {
        if ($scope.selected.item.highlight && $scope.selected.item.highlight.description) {
            let description = $scope.selected.item.highlight.description[0].replace(/<em>/g, "((STARTEM))").replace(/<\/em>/g, "((ENDEM))");
            description = marked(description);
            description = description.replace(/\(\(STARTEM\)\)/g, '<em class="highlight">').replace(/\(\(ENDEM\)\)/g, "</em>");
            return description;
        }
        return marked($scope.selected.item._source.description);
    };
});

})();