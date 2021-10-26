(function(){
    'use strict';

    const app = angular.module('dataiku.directives.widgets');

    app.directive('browsePath', function($timeout, $filter) {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/templates/widgets/browse-path/browse-path.html',
            scope: {
                title: '@',
                path: '=',
                browseFn: '=',
                onBrowseDoneFn: '=?',
                canSelectFn: '=',
                canBrowseFn: '=?',
                selectedItems: '=?',
                isMultiSelect: '=?',
                destinationLabel: '@?',
                displayItemFn: '=?',
                cantWriteContentVerb: '@',
                searchable: '@?',
                itemsAreProjects: '='
            },
            link: function(scope, element, attrs) {
                scope.searchable = attrs.searchable ? scope.$eval(scope.searchable) : true;
                scope.displayItemFn = attrs.displayItemFn !== undefined ? scope.displayItemFn : item => item;
                scope.clickOnItem = function(item, event) {
                    if (!item.directory && scope.canSelectFn(item)) {
                        toggleSelect(item)
                    } else if (item.directory) {
                        if (((event.ctrlKey || event.metaKey) || !scope.canBrowseFn(item)) && scope.canSelectFn(item)) {
                            toggleSelect(item)
                            return;
                        }
                        if (scope.canBrowseFn(item)) {
                            scope.executeBrowse(item.fullPath);
                            return;
                        }
                    }
                }

                // -- selection
                if (typeof scope.selectedItems === "undefined") {
                    scope.selectedItems = [];
                }
                let selectedItemsMap = {};

                scope.isSelected = function(item) {
                    return typeof selectedItemsMap[item.fullPath] !== "undefined";
                }

                function toggleSelect(item) {
                    if (scope.isSelected(item)) {
                        delete selectedItemsMap[item.fullPath];
                    } else {
                        if (!scope.isMultiSelect) {
                            selectedItemsMap = {};
                        }
                        selectedItemsMap[item.fullPath] = item;
                    }
                    scope.selectedItems = Object.values(selectedItemsMap);
                }

                // -- filtering

                scope.filter = {query:""};
                function updateFiltered(){
                    if (scope.pathContent == null) {
                        return;
                    }
                    if (!scope.filter.query) {
                        scope.pathContent.filteredChildren = scope.pathContent.children;
                    } else {
                        scope.pathContent.filteredChildren = $filter("filter")(scope.pathContent.children, {name: scope.filter.query});
                    }
                }

                scope.$watch("filter.query", updateFiltered);

                // -- browsing

                scope.browseError = null;
                scope.firstBrowseDone = false;
                if (scope.path == null) scope.path = "/";
                scope.pathContent = [];
                scope.browsing = false;

                scope.executeBrowse = function(newPath){
                    scope.browseError = null;
                    scope.path = newPath.replace(/^\/+/,'/');
                    scope.browsing = true;
                    scope.browseFn(scope.path).success(function(data){
                        scope.pathContent = data;
                        scope.pathContent.children.sort(function(a,b) {
                            if (a.directory != b.directory)  {
                                return a.directory ? -1 : 1;
                            }
                            return a.name.localeCompare(b.name);
                        });
                        updateFiltered();
                        scope.browsing = false;
                        // Refocus search after filter
                        scope.filter.query = "";
                        scope.selectedItems = [];
                        if (typeof scope.onBrowseDoneFn === "function") {
                            const currentFolder = angular.extend({ canWriteContents: true }, scope.pathContent.pathElts[scope.pathContent.pathElts.length - 1], { pathElts: scope.pathContent.pathElts.map(f => scope.displayItemFn(f)).join('/') });
                            scope.onBrowseDoneFn(currentFolder);
                        }
                        $timeout(function(){
                            element.find(".search-input").focus();
                        }, 0);
                    }).error(function(data, status, error){
                        scope.browsing = false;
                        scope.browseErrorMsg = getErrorDetails(data, status, error).detailedMessage;
                        scope.browseError = getErrorDetails(data, status, error);
                    });
                };

                if (typeof(scope.canBrowseFn) !== "function") (
                    scope.canBrowseFn = function(item) {
                        return true;
                    }
                )

                // postponing it to next digest so that fatRepeat's container does not have its full height
                // (b/c many other elements in the modal will be hidden using ng-show, leaving space to fatRepeat's container once digest is done)
                $timeout(function() {
                    scope.executeBrowse(scope.path);
                    element.find(".search-input").focus();
                }, 0);
            }
        }
    });

    app.directive('browsePathInput', function(DataikuAPI, $timeout, $filter) {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/templates/widgets/browse-path/browse-path-input.html',
            scope: {
                title: '@',
                path: '=',
                browseFn: '=',
                onBrowseDoneFn: '=?',
                canSelectFn: '=',
                canBrowseFn: '=?',
                itemsAreProjects: '='
            },
            link: function (scope, element, attrs) {

            }
        }
    });

})();

