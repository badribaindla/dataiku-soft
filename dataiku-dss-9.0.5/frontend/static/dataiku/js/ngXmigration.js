(function() {

const app = angular.module('dataiku.ngXmigration', []);

// This is a wrapper on dku-bs-select because in angularJS it has to be an attribute directive on <select>
// and upgraded components cannot be attribute directives
app.directive('ng1DkuBsSelect', ['$compile', function($compile) { 
    return {
        scope: {
            params: '<',
            list: '<',
            model: '<',
            ngOptions: '<',
            modelChange: '<',
            required: '<',
            optionsDescriptions: '<',
            optionsAnnotations: '<',
            layout: '<',
            dataActionsBox: '<',
            dataLiveSearch: '<',
            dkuMultiple: '<'
        },
        // directive breaks if optionsDescriptions is empty and passed to the select
        template: '',
        link: {
            pre: function($scope, $el, attrs) {
                $scope.$watch('model', () => {
                    $scope.modelChange.emit($scope.model);
                });
                
                // 1) adding multiple and optionsDescriptions using setAttribute doesn't work properly
                // and we cannot bind to neither multiple attribute in the template (angularjs limitation w/ ng model)
                // nor can be we bind to optionsDescriptions nor optionsAnnotations (throws an error if null)
                // without using ng-show/ng-if (which gets messy with several non-bindable attributes). 
                let select = `
                    <select dku-bs-select="params" ng-model="model" ng-options="{{ngOptions}}"
                    required="{{required}}" layout="{{layout}}"
                    data-actions-box="{{dataActionsBox}}" data-live-search="{{dataLiveSearch}}"
                `

                if ($scope.optionsDescriptions) {
                    select += ' options-descriptions="{{ optionsDescriptions }}" '
                }

                if ($scope.optionsAnnotations) {
                    select += ' options-annotations="{{ optionsAnnotations }}" '
                }

                if ($scope.dkuMultiple) {
                    select += ' multiple="multiple" '
                }

                select += '></select>'

                const $select = $compile(select)($scope);

                $el.append($select);
            }
        }
    };
}]);

app.directive('ng1ContainerSelectionForm', [ function() {
    return {
        scope: {
            selection: '<',
            selectionChange: '&'
        },
        template: `<div container-selection-form="_selection" />`,
        link: function($scope) {
            $scope.$watch('selection', () => {
                $scope._selection = angular.copy($scope.selection);
            }, true);
            $scope.$watch('_selection', () => {
                if ($scope._selection && !angular.equals($scope.selection, $scope._selection)) {
                    $scope.selectionChange(angular.copy($scope._selection));
                }
            }, true);
        }
    };
}]);

app.directive('ng1DatasetSelectionOrderingDirective', [ function() {
    return {
        scope: {
            selection: '=',
            datasetSupportsReadOrdering: '<',
            shakerState: '<'
        },
        template: `<div dataset-selection-ordering-fields selection="selection"
            dataset-supports-read-ordering="datasetSupportsReadOrdering"
            shaker-state="shakerState" />`,
    };
}]);

app.directive('ng1DatasetSelectorDirective', [ function() {
    return {
        scope: {
            dataset: '<',
            datasetChange: '<',
            availableDatasets: '<',
            required: '<',
        },
        template: `<div dataset-selector="dataset" available-datasets="availableDatasets" required="{{required}}"></div>`,
        link: function($scope) {      
            $scope.$watch('dataset', () => {
                if ($scope.datasetChange) {
                    $scope.datasetChange.emit($scope.dataset)
                }
            });
        }
    };
}]);

})();
