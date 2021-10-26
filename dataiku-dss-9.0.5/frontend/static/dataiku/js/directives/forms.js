(function() {
'use strict';

const app = angular.module('dataiku.directives.forms', ['dataiku.directives.forms']);


app.directive('checkUnique', function(DataikuAPI, $stateParams) {
    return {
        require: 'ngModel',
        scope: {
            exclude: '='
        },
        link: function(scope, elem, attrs, ngModel) {
            function format(v) {
                return v ? v.toLowerCase() : '';
            }

            function apply_validation(value) {
                ngModel.$setValidity('unique', true);
                if (scope.exclude && value) {
                    const valid = !scope.exclude.find(x => format(x) == format(value));
                    ngModel.$setValidity('unique', valid);
                }
                return value;
            }

            //For DOM -> model validation
            ngModel.$parsers.unshift(apply_validation);

            //For model -> DOM validation
            ngModel.$formatters.unshift(function(value) {
                apply_validation(value);
                return value;
            });
        }
    };
});

app.directive("objectTypePicker", function(TAGGABLE_TYPES) {
   return {
       templateUrl: '/templates/widgets/object-type-picker.html',
       restrict: 'A',
       scope: {
            objectTypePicker: '=',     // @param (optional) forwarded to dkuBsSelect
            objectType: '=',           // @model the selected taggable type
            exclude: '=?',             // @param (optional) array of types to exclude
            include: '=?',             // @param (optional) array of types to include (ignored if exclude if non-null)
            ngDisabled: '=?',
            allOption: '=?'
       },
       link: function($scope) {
            $scope.taggableTypes = TAGGABLE_TYPES;
            $scope.typeFilter = function(type) {
                if ($scope.exclude) {
                    return $scope.exclude.indexOf(type) == -1;
                } else if ($scope.include) {
                    return $scope.include.indexOf(type) != -1;
                }
                return true;
           }
       }
   }
});


app.directive("projectKeyPicker", function(DataikuAPI) {
    return {
        templateUrl: '/templates/widgets/project-key-picker.html',
        restrict: 'AE',
        scope: {
            projectKeyPicker: '=',  // @param (optional) forwarded to dkuBsSelect
            projectKey: '=',        // @model the selected projectKey
            project: '=?'           // @model bound to the selected project
        },
        link: function($scope) {
            function findProject() {
                $scope.project = $scope.projects.find(prj => prj.projectKey == $scope.projectKey);
            }
            DataikuAPI.projects.list()
                .success(function (projects) {
                    $scope.projects = projects;
                    findProject();
                });//TODO @errorHandling
            $scope.$watch("projectKey", function() {
                if ($scope.projects) {
                    findProject();
                }
            });
        }
    }
});


app.directive('computablePicker', function(DataikuAPI, $stateParams) {
    return {
        template: '<div dataset-selector="computable" available-datasets="availableComputables"></div>',
        restrict: 'A',
        scope: {
            computable: '=computablePicker',
            type: '@'
        },
        link: function($scope, element) {
            DataikuAPI.flow.listUsableComputables($stateParams.projectKey, {type: $scope.type}).success(function(data) {
                $scope.availableComputables = data;
            }).error(setErrorInScope.bind($scope.$parent));
        }
    };
});


app.directive('objectPicker', function(DataikuAPI, $stateParams, $rootScope, ActiveProjectKey) {
    return {
        templateUrl : '/templates/widgets/object-picker.html',
        restrict: 'A',
        scope: {
            objectSmartId: '=objectPicker',                  // @model bound to the smartId of the selected object
            object: '=?',                                    // @model bound to the selected object
            type: '@',                                       // @param taggable type
            unusable: '=?',                                  // @param smartIds of unusable objects (as array, or map: id -> unusable (boolean))
            popoverPlacement: '@?',
            emptyMessage: '@?',
            ngDisabled: '=?',
            errorScope: '=?',
            availableObjects: '=?',
            permissionMode: '@?',                            // @param the desired ReaderAuthorization.Mode (defaults to READ)
            hideForeign: '=?',                               // @param (boolean) to hide foreign objects,
            projectKey: '=?',
            noLiveUpdate: '=?'                               // @param (boolean) to stop up/down arrows auto-adding items from the pick list
        },
        link: function($scope, element) {
            $scope.object = null;
            const projectKey = $scope.projectKey || ActiveProjectKey.get();

            function findObject() {
                $scope.object = $scope.availableObjects.filter(function(d) {
                    return d.smartId == $scope.objectSmartId;
                })[0];
            }

            function refreshObjects() {
                if (!projectKey && $scope.type != 'PROJECT') {
                    console.info('No project key specified, not listing accessible objects');
                    return;
                }
                DataikuAPI.taggableObjects.listAccessibleObjects(projectKey, $scope.type, $scope.permissionMode).success(function(data) {
                    $scope.availableObjects = data;
                    updateUsability();
                    findObject();
                }).error(function(data, status, headers, config, statusText) {
                    setErrorInScope.bind($scope.errorScope || $scope.$parent)(data, status, headers, config, statusText);
                });
            }

            $scope.$watch("type", function(nv, ov) {
                if (!nv || (nv == ov && $scope.availableObjects)) return;

                if (ov && nv != ov) {
                    $scope.object = null;
                    $scope.objectSmartId = null;
                }

                refreshObjects();
            });

            $scope.$watch("permissionMode", function(nv, ov) {
                if (!nv || !ov || nv == ov) return;
                refreshObjects();
            });

            $scope.$watch('objectSmartId', function(nv) {
                if ($scope.availableObjects) {
                    findObject();
                }
            });

            $scope.$watch(function(scope) {
                if (angular.isObject(scope.unusable)) {
                    var simplified = {};
                    for (var key in scope.unusable) {
                        simplified[key] = !!scope.unusable[key];
                    }
                    return simplified;
                } else {
                    return scope.unusable;
                }
            }, updateUsability, true);

            function updateUsability(nv, ov) {
                if (!$scope.availableObjects) return;

                if (!$scope.unusable) {
                    $scope.availableObjects.forEach(function(item) {
                        item.usable = true;
                    });
                } else if (angular.isArray($scope.unusable)) {
                    $scope.availableObjects.forEach(function(item) {
                        item.usable = ($scope.unusable || []).indexOf(item.smartId) == -1;
                    });
                } else if(angular.isObject($scope.unusable)) {
                    $scope.availableObjects.forEach(function(item) {
                        item.usable = !$scope.unusable[item.smartId];
                    });
                }
            }
        }
    };
});


app.directive('datasetSelector', function(ListFilter, $compile) {
    var ret = {
        restrict : 'A',
        transclude: true,
        scope : {
            type:'@',
            availableDatasets : '=',
            datasetSelector : '=',
            transclude : '@',
            popoverPlacement: '@',
            marginTop: '@',
            noLiveUpdate : '@',
            ngDisabled: '=?',
            hideForeign: '=?',
            emptyMessage: '@?',
            multi: '@'
        },
        templateUrl : '/templates/dataset-selector.html',
    };

    ret.compile = function(element, attrs) {
        var popoverTemplate = element.find('.popover').detach();
        return function($scope, element, attrs) {
            var popover = null;

            if ($scope.multi) {
                $scope.noLiveUpdate = true;
                $scope.datasetSelector = $scope.datasetSelector || [];
            } 

            if ($scope.transclude) $(element).on('click', function(event) {
                if (event && event.target && event.target.hasAttribute('href') || $scope.ngDisabled) return;
                $scope.togglePopover();
                $scope.$apply();
            });

            /* List management */
            function update() {
                $scope.displayedDatasets = [];
                if (!$scope.availableDatasets) return;

                $scope.filtered = $scope.availableDatasets;

                // Filter on terms
                $scope.filtered = ListFilter.filter($scope.availableDatasets, $scope.filter.query);

                var groups = {}
                for (var i in  $scope.filtered) {
                    var group = "";
                    var sort = "";
                    if ( $scope.filtered[i].localProject) {
                        group =  ($scope.filtered[i].label || $scope.filtered[i].name) [0].toUpperCase();
                        sort = "AAAAAAAA" + group;
                    } else {
                        if ($scope.hideForeign) {
                            continue;
                        }
                        group = "Project: " +  $scope.filtered[i].projectKey;
                        sort = group;
                    }
                    if (! groups[group]) {
                         groups[group] = {title : group, datasets : [], sort:sort}
                    }
                    groups[group].datasets.push( $scope.filtered[i]);
                }
                $scope.displayedGroups = [];
                for (var g in groups) {
                    groups[g].datasets.sort(function(a,b) { return (a.label || a.name).localeCompare(b.label || b.name)})
                    $scope.displayedGroups.push(groups[g]);
                }
                $scope.displayedGroups.sort(function(a,b) { return a.sort.localeCompare(b.sort)})

                $scope.currentlySelected = null;
                for (var i in $scope.availableDatasets) {
                    if (($scope.availableDatasets[i].smartName || $scope.availableDatasets[i].smartId) == $scope.datasetSelector) {
                        $scope.currentlySelected = $scope.availableDatasets[i];
                    }
                }


            }
            $scope.filter = {
                allProjects : true,
                query : ""
            }
            $scope.$watch("filter", update, true);
            $scope.$watchCollection("availableDatasets", update);
            update();

            /* Model management */

            $scope.select = function(details) {
                const itemId = details.smartName || details.smartId;
                if (!$scope.multi) {
                    $scope.datasetSelector = itemId;
                    hide();
                } else {
                    $scope.datasetSelector.push(itemId);
                }
            };

            $scope.itemClicked = function(details) {
                const itemId = details.smartName || details.smartId;

                if (!$scope.multi) {
                    if (itemId === $scope.datasetSelector) {
                        $scope.datasetSelector = null;
                    } else {
                        $scope.datasetSelector = itemId;
                    }
                    hide();
                } else {
                    const detailsIndex = $scope.datasetSelector.indexOf(itemId);
                    if (detailsIndex >= 0) {
                        $scope.datasetSelector.splice(detailsIndex, 1);
                    } else {
                        $scope.datasetSelector.push(itemId);
                    }
                }
            };

            $scope.isItemSelected = function(item) {
                const itemId = item.smartName || item.smartId;

                if (!$scope.multi) {
                    return $scope.datasetSelector === itemId;
                } else {
                    return $scope.datasetSelector.indexOf(itemId) >= 0;
                }
            }

            $scope.$watch("datasetSelector", function(newValue, oldValue) {
                update();
            });

            /* Popover management */
            var popoverShown = false;
            $(popover).hide();
            var hide = function() {
                popover.hide().detach();
                $("html").unbind("click", hide);
                popoverShown=false;
            };
            var show = function() {
                var mainZone = $(".mainzone", element);
                popoverShown = true;
                if (popover == null) {
                    popover = $compile(popoverTemplate.clone())($scope);
                }
                popover.appendTo("body");

                popover.css("width", attrs.popoverWidth ? attrs.popoverWidth : Math.max(300, mainZone.width() + 20));
                if ($scope.popoverPlacement == 'right') {
                    popover.css("left", mainZone.offset().left - popover.width() + mainZone.width() +4);
                } else {
                    popover.css("left", mainZone.offset().left);
                }
                popover.css("top", mainZone.offset().top + mainZone.height() + ($scope.marginTop ? parseInt($scope.marginTop) : 8));

                if ($scope.popoverPlacement == 'auto') {
                    if (mainZone.offset().top + mainZone.height() + 280 > $(window).height()) {
                        popover.css("top", mainZone.offset().top - 310);
                    }
                }

                popover.show();

                popover.find("input").off('blur.dsSelector').on('blur.dsSelector',function() {
                    popover.find("input").focus();
                });
                popover.find("input").focus();

                popover.off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    //e.stopPropagation();
                });
                $(".mainzone", element).off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    //e.stopPropagation();
                });
                window.setTimeout(function() { $("html").click(function(event) {
                    if (event && event.target && $.contains(element[0], event.target)) return;
                    // In multi selection, do not close the dropdown when clicking an item.
                    if (!$scope.multi || !event.target.closest('.dss-object-selector__item')) {
                        hide();
                    } 
                }); }, 0);

                popover.find("input").off('keydown.dsSelector').on('keydown.dsSelector',function(event) {

                    if(event.keyCode==38 || event.keyCode==40 || event.keyCode==13) {
                        event.stopPropagation();
                    } else {
                        return;
                    }

                    // Up and down in list
                    if(event.keyCode==38 || event.keyCode==40) {
                        if($scope.displayedGroups &&  $scope.displayedGroups.length>0) {

                            var previous = null;
                            var next = null;
                            var current = null;
                            var first = null;
                            var foundCurrent = false;
                            var last = null;
                            var updateNext = false;

                            for(var k = 0 ; k < $scope.displayedGroups.length ; k++) {
                                var group = $scope.displayedGroups[k];
                                for(var j = 0 ; j < group.datasets.length ; j++) {
                                    var ds = group.datasets[j];
                                    if(!ds.usable) {
                                        continue;
                                    }
                                    if(!first) {
                                        first = ds;
                                    }
                                    last = ds;
                                    if(foundCurrent) {
                                        if(updateNext) {
                                            next = ds;
                                            updateNext=false;
                                        }
                                    } else {
                                        previous = current;
                                        current = ds;

                                        if($scope.currentlySelected == ds) {
                                            foundCurrent = true;
                                            updateNext = true;
                                        }
                                    }
                                }
                            }
                             $scope.$apply(function() {
                                if(foundCurrent) {
                                    if(event.keyCode == 40) {
                                        if(next) {
                                            $scope.currentlySelected = next;
                                        } else {
                                            $scope.currentlySelected = first;
                                        }
                                    }
                                    if(event.keyCode == 38) {
                                        if(previous) {
                                            $scope.currentlySelected = previous;
                                        } else {
                                            $scope.currentlySelected = last;
                                        }
                                    }
                                } else {
                                    if(first) {
                                        $scope.currentlySelected = first;
                                    }
                                }

                                if($scope.currentlySelected && !$scope.noLiveUpdate) {
                                    $scope.datasetSelector = $scope.currentlySelected.smartName || $scope.currentlySelected.smartId;
                                }
                            });
                        }

                    } 
                    // Enter
                    else if (event.keyCode === 13) {
                        if ($scope.currentlySelected) {
                            $scope.itemClicked($scope.currentlySelected);
                            $scope.$apply();
                        }
                    } else {
                        $scope.currentlySelected = null;
                    }

                });
            };

            $scope.togglePopover =function() {
                if (popoverShown) hide();
                else show();
            }
        }
    }
    return ret;
});


//TODO @dssObjects factorize
app.directive('savedModelSelector', function($timeout, ListFilter, $compile) {
    var ret = {
        restrict : 'A',
        transclude: true,
        scope : {
            type:'@',
            availableSavedModels : '=',
            savedModelSelector : '=',
            transclude : '@',
            popoverPlacement: '@',
            marginTop: '@',
            noLiveUpdate : '@',
            ngDisabled: '=?'
        },
        templateUrl : '/templates/model-selector.html',
    };

    ret.compile = function(element, attrs) {
        var popoverTemplate = element.find('.popover').detach();
        return function($scope, element, attrs) {

            var popover = null;
            if ($scope.transclude) $(element).on('click', function(event) {
                if (event && event.target && event.target.hasAttribute('href') || $scope.ngDisabled) return;
                $scope.togglePopover();
            });

            /* List management */
            function update() {
                $scope.displayedSavedModels = [];
                if (!$scope.availableSavedModels) return;

                $scope.filtered = $scope.availableSavedModels;

                // Filter on terms
                $scope.filtered = ListFilter.filter($scope.availableSavedModels, $scope.filter.query);

                var groups = {}
                for (var i in  $scope.filtered) {
                    var group = "";
                    var sort = "";
                    if ( $scope.filtered[i].localProject) {
                        group =  ($scope.filtered[i].label || $scope.filtered[i].name) [0].toUpperCase();
                        sort = "AAAAAAAA" + group;
                    } else {
                        group = "Project: " +  $scope.filtered[i].projectKey;
                        sort = group;
                    }
                    if (! groups[group]) {
                         groups[group] = {title : group, savedModels : [], sort:sort}
                    }
                    groups[group].savedModels.push( $scope.filtered[i]);
                }
                $scope.displayedGroups = [];
                for (var g in groups) {
                    groups[g].savedModels.sort(function(a,b) { return (a.label || a.name).localeCompare(b.label || b.name)})
                    $scope.displayedGroups.push(groups[g]);
                }
                $scope.displayedGroups.sort(function(a,b) { return a.sort.localeCompare(b.sort)})

                $scope.currentlySelected = null;
                for (var i in $scope.availableSavedModels) {
                    if (($scope.availableSavedModels[i].smartName || $scope.availableSavedModels[i].smartId) == $scope.savedModelSelector) {
                        $scope.currentlySelected = $scope.availableSavedModels[i];
                    }
                }


            }
            $scope.filter = {
                allProjects : true,
                query : ""
            }
            $scope.$watch("filter", function() {
                update();
            }, true);
            $scope.$watch("availableSavedModels", function() {
                update();
            }, true);
            update();

            /* Model management */

            $scope.select = function(details) {
                //ngModel.$setViewValue(details.smartName);
                $scope.savedModelSelector = details.smartName || details.smartId;
                hide();
            };

            $scope.itemClicked = function(details) {
                //ngModel.$setViewValue(details.smartName);
                if ((details.smartName || details.smartId) == $scope.savedModelSelector) {
                    $scope.savedModelSelector = null;
                } else {
                    $scope.savedModelSelector = details.smartName || details.smartId;
                }
                hide();
            };

            $scope.$watch("savedModelSelector", function(newValue, oldValue) {
                update();
            });

            /* Popover management */
            var popoverShown = false;
            $(popover).hide();
            var hide = function() {
                popover.hide().detach();
                $("html").unbind("click", hide);
                popoverShown=false;
            };
            var show = function() {
                var mainZone = $(".mainzone", element);
                popoverShown = true;
                if (popover == null) {
                    popover = $compile(popoverTemplate.clone())($scope);
                }
                popover.appendTo("body");

                popover.css("width", attrs.popoverWidth ? attrs.popoverWidth : Math.max(300, mainZone.width() + 20));
                if ($scope.popoverPlacement == 'right') {
                    popover.css("left", mainZone.offset().left - popover.width() + mainZone.width() +4);
                } else {
                    popover.css("left", mainZone.offset().left);
                }
                popover.css("top", mainZone.offset().top + mainZone.height() + ($scope.marginTop ? parseInt($scope.marginTop) : 8));

                if ($scope.popoverPlacement == 'auto') {
                    if (mainZone.offset().top + mainZone.height() + 280 > $(window).height()) {
                        popover.css("top", mainZone.offset().top - 310);
                    }
                }

                popover.show();

                popover.find("input").off('blur.dsSelector').on('blur.dsSelector',function() {
                    popover.find("input").focus();
                });
                popover.find("input").focus();

                popover.off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    //e.stopPropagation();
                });
                $(".mainzone", element).off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    //e.stopPropagation();
                });
                window.setTimeout(function() { $("html").click(function(event) {
                    if (event && event.target && $.contains(element[0], event.target)) return;
                    hide();
                }); }, 0);

                popover.find("input").off('keydown.dsSelector').on('keydown.dsSelector',function(event) {

                    if(event.keyCode==38 || event.keyCode==40 || event.keyCode==13) {
                        event.stopPropagation();
                    } else {
                        return;
                    }

                    if(event.keyCode==38 || event.keyCode==40) {

                        if($scope.displayedGroups &&  $scope.displayedGroups.length>0) {

                            var previous = null;
                            var next = null;
                            var current = null;
                            var first = null;
                            var foundCurrent = false;
                            var last = null;
                            var updateNext = false;

                            for(var k = 0 ; k < $scope.displayedGroups.length ; k++) {
                                var group = $scope.displayedGroups[k];
                                for(var j = 0 ; j < group.savedModels.length ; j++) {
                                    var ds = group.savedModels[j];
                                    if(!ds.usable) {
                                        continue;
                                    }
                                    if(!first) {
                                        first = ds;
                                    }
                                    last = ds;
                                    if(foundCurrent) {
                                        if(updateNext) {
                                            next = ds;
                                            updateNext=false;
                                        }
                                    } else {
                                        previous = current;
                                        current = ds;

                                        if($scope.currentlySelected == ds) {
                                            foundCurrent = true;
                                            updateNext = true;
                                        }
                                    }
                                }
                            }

                            $scope.$apply(function() {
                                if(foundCurrent) {
                                    if(event.keyCode == 40) {
                                        if(next) {
                                            $scope.currentlySelected = next;
                                        } else {
                                            $scope.currentlySelected = first;
                                        }
                                    }
                                    if(event.keyCode == 38) {
                                        if(previous) {
                                            $scope.currentlySelected = previous;
                                        } else {
                                            $scope.currentlySelected = last;
                                        }
                                    }
                                } else {
                                    if(first) {
                                        $scope.currentlySelected = first;
                                    }
                                }

                                if($scope.currentlySelected && !$scope.noLiveUpdate) {
                                    $scope.savedModelSelector = $scope.currentlySelected.smartName || $scope.currentlySelected.smartId;
                                }
                            });
                        }

                    } else if(event.keyCode==13) {
                        if($scope.currentlySelected) {
                            $scope.select($scope.currentlySelected);
                            $scope.$apply();
                        }
                    }

                });
            };

            $scope.togglePopover =function() {
                if (popoverShown) hide();
                else show();
            }
        }
    }
    return ret;
});


//TODO @dssObjects factorize
app.directive('modelEvaluationStoreSelector', function($timeout, ListFilter, $compile) {
    var ret = {
        restrict : 'A',
        transclude: true,
        scope : {
            type:'@',
            availableModelEvaluationStores : '=',
            modelEvaluationStoreSelector : '=',
            transclude : '@',
            popoverPlacement: '@',
            marginTop: '@',
            noLiveUpdate : '@',
            ngDisabled: '=?'
        },
        templateUrl : '/templates/evaluation-store-selector.html',
    };

    ret.compile = function(element, attrs) {
        var popoverTemplate = element.find('.popover').detach();
        return function($scope, element, attrs) {

            var popover = null;
            if ($scope.transclude) $(element).on('click', function(event) {
                if (event && event.target && event.target.hasAttribute('href') || $scope.ngDisabled) return;
                $scope.togglePopover();
            });

            /* List management */
            function update() {
                $scope.displayedModelEvaluationStores = [];
                if (!$scope.availableModelEvaluationStores) return;

                $scope.filtered = $scope.availableModelEvaluationStores;

                // Filter on terms
                $scope.filtered = ListFilter.filter($scope.availableModelEvaluationStores, $scope.filter.query);

                var groups = {}
                for (var i in  $scope.filtered) {
                    var group = "";
                    var sort = "";
                    if ( $scope.filtered[i].localProject) {
                        group =  ($scope.filtered[i].label || $scope.filtered[i].name) [0].toUpperCase();
                        sort = "AAAAAAAA" + group;
                    } else {
                        group = "Project: " +  $scope.filtered[i].projectKey;
                        sort = group;
                    }
                    if (! groups[group]) {
                         groups[group] = {title : group, modelEvaluationStores : [], sort:sort}
                    }
                    groups[group].modelEvaluationStores.push( $scope.filtered[i]);
                }
                $scope.displayedGroups = [];
                for (var g in groups) {
                    groups[g].modelEvaluationStores.sort(function(a,b) { return (a.label || a.name).localeCompare(b.label || b.name)})
                    $scope.displayedGroups.push(groups[g]);
                }
                $scope.displayedGroups.sort(function(a,b) { return a.sort.localeCompare(b.sort)})

                $scope.currentlySelected = null;
                for (var i in $scope.availableModelEvaluationStores) {
                    if (($scope.availableModelEvaluationStores[i].smartName || $scope.availableModelEvaluationStores[i].smartId) == $scope.modelEvaluationStoreSelector) {
                        $scope.currentlySelected = $scope.availableModelEvaluationStores[i];
                    }
                }


            }
            $scope.filter = {
                allProjects : true,
                query : ""
            }
            $scope.$watch("filter", function() {
                update();
            }, true);
            $scope.$watch("availableModelEvaluationStores", function() {
                update();
            }, true);
            update();

            /* Store management */

            $scope.select = function(details) {
                //ngModel.$setViewValue(details.smartName);
                $scope.modelEvaluationStoreSelector = details.smartName || details.smartId;
                hide();
            };

            $scope.itemClicked = function(details) {
                //ngModel.$setViewValue(details.smartName);
                if ((details.smartName || details.smartId) == $scope.modelEvaluationStoreSelector) {
                    $scope.modelEvaluationStoreSelector = null;
                } else {
                    $scope.modelEvaluationStoreSelector = details.smartName || details.smartId;
                }
                hide();
            };

            $scope.$watch("modelEvaluationStoreSelector", function(newValue, oldValue) {
                update();
            });

            /* Popover management */
            var popoverShown = false;
            $(popover).hide();
            var hide = function() {
                popover.hide().detach();
                $("html").unbind("click", hide);
                popoverShown=false;
            };
            var show = function() {
                var mainZone = $(".mainzone", element);
                popoverShown = true;
                if (popover == null) {
                    popover = $compile(popoverTemplate.clone())($scope);
                }
                popover.appendTo("body");

                popover.css("width", attrs.popoverWidth ? attrs.popoverWidth : Math.max(300, mainZone.width() + 20));
                if ($scope.popoverPlacement == 'right') {
                    popover.css("left", mainZone.offset().left - popover.width() + mainZone.width() +4);
                } else {
                    popover.css("left", mainZone.offset().left);
                }
                popover.css("top", mainZone.offset().top + mainZone.height() + ($scope.marginTop ? parseInt($scope.marginTop) : 8));

                if ($scope.popoverPlacement == 'auto') {
                    if (mainZone.offset().top + mainZone.height() + 280 > $(window).height()) {
                        popover.css("top", mainZone.offset().top - 310);
                    }
                }

                popover.show();

                popover.find("input").off('blur.dsSelector').on('blur.dsSelector',function() {
                    popover.find("input").focus();
                });
                popover.find("input").focus();

                popover.off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    //e.stopPropagation();
                });
                $(".mainzone", element).off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    //e.stopPropagation();
                });
                window.setTimeout(function() { $("html").click(function(event) {
                    if (event && event.target && $.contains(element[0], event.target)) return;
                    hide();
                }); }, 0);

                popover.find("input").off('keydown.dsSelector').on('keydown.dsSelector',function(event) {

                    if(event.keyCode==38 || event.keyCode==40 || event.keyCode==13) {
                        event.stopPropagation();
                    } else {
                        return;
                    }

                    if(event.keyCode==38 || event.keyCode==40) {

                        if($scope.displayedGroups &&  $scope.displayedGroups.length>0) {

                            var previous = null;
                            var next = null;
                            var current = null;
                            var first = null;
                            var foundCurrent = false;
                            var last = null;
                            var updateNext = false;

                            for(var k = 0 ; k < $scope.displayedGroups.length ; k++) {
                                var group = $scope.displayedGroups[k];
                                for(var j = 0 ; j < group.modelEvaluationStores.length ; j++) {
                                    var ds = group.modelEvaluationStores[j];
                                    if(!ds.usable) {
                                        continue;
                                    }
                                    if(!first) {
                                        first = ds;
                                    }
                                    last = ds;
                                    if(foundCurrent) {
                                        if(updateNext) {
                                            next = ds;
                                            updateNext=false;
                                        }
                                    } else {
                                        previous = current;
                                        current = ds;

                                        if($scope.currentlySelected == ds) {
                                            foundCurrent = true;
                                            updateNext = true;
                                        }
                                    }
                                }
                            }

                            $scope.$apply(function() {
                                if(foundCurrent) {
                                    if(event.keyCode == 40) {
                                        if(next) {
                                            $scope.currentlySelected = next;
                                        } else {
                                            $scope.currentlySelected = first;
                                        }
                                    }
                                    if(event.keyCode == 38) {
                                        if(previous) {
                                            $scope.currentlySelected = previous;
                                        } else {
                                            $scope.currentlySelected = last;
                                        }
                                    }
                                } else {
                                    if(first) {
                                        $scope.currentlySelected = first;
                                    }
                                }

                                if($scope.currentlySelected && !$scope.noLiveUpdate) {
                                    $scope.modelEvaluationStoreSelector = $scope.currentlySelected.smartName || $scope.currentlySelected.smartId;
                                }
                            });
                        }

                    } else if(event.keyCode==13) {
                        if($scope.currentlySelected) {
                            $scope.select($scope.currentlySelected);
                            $scope.$apply();
                        }
                    }

                });
            };

            $scope.togglePopover =function() {
                if (popoverShown) hide();
                else show();
            }
        }
    }
    return ret;
});


//TODO @dssObjects factorize
app.directive('folderSelector', function($timeout, ListFilter, $compile) {
    var ret = {
        restrict : 'A',
        transclude: true,
        scope : {
            type:'@',
            availableFolders : '=',
            folderSelector : '=',
            transclude : '@',
            popoverPlacement: '@',
            marginTop: '@',
            noLiveUpdate : '@',
            ngDisabled: '=?'
        },
        templateUrl : '/templates/folder-selector.html',
    };

    ret.compile = function(element, attrs) {
        var popoverTemplate = element.find('.popover').detach();
        return function($scope, element, attrs) {

            var popover = null;
            if ($scope.transclude) $(element).on('click', function(event) {
                if (event && event.target && event.target.hasAttribute('href') || $scope.ngDisabled) return;
                $scope.togglePopover();
            });

            /* List management */
            function update() {
                $scope.displayedFolders = [];
                if (!$scope.availableFolders) return;

                $scope.filtered = $scope.availableFolders;

                // Filter on terms
                $scope.filtered = ListFilter.filter($scope.availableFolders, $scope.filter.query);

                var groups = {}
                for (var i in  $scope.filtered) {
                    var group = "";
                    var sort = "";
                    if ( $scope.filtered[i].localProject) {
                        group =  ($scope.filtered[i].label || $scope.filtered[i].name) [0].toUpperCase();
                        sort = "AAAAAAAA" + group;
                    } else {
                        group = "Project: " +  $scope.filtered[i].projectKey;
                        sort = group;
                    }
                    if (! groups[group]) {
                         groups[group] = {title : group, folders : [], sort:sort}
                    }
                    groups[group].folders.push( $scope.filtered[i]);
                }
                $scope.displayedGroups = [];
                for (var g in groups) {
                    groups[g].folders.sort(function(a,b) { return (a.label || a.name).localeCompare(b.label || b.name)})
                    $scope.displayedGroups.push(groups[g]);
                }
                $scope.displayedGroups.sort(function(a,b) { return a.sort.localeCompare(b.sort)})

                $scope.currentlySelected = null;
                for (var i in $scope.availableFolders) {
                    if (($scope.availableFolders[i].smartName || $scope.availableFolders[i].smartId) == $scope.folderSelector) {
                        $scope.currentlySelected = $scope.availableFolders[i];
                    }
                }


            }
            $scope.filter = {
                allProjects : true,
                query : ""
            }
            $scope.$watch("filter", function() {
                update();
            }, true);
            $scope.$watch("availableFolders", function() {
                update();
            }, true);
            update();

            /* Model management */

            $scope.select = function(details) {
                //ngModel.$setViewValue(details.smartName);
                $scope.folderSelector = details.smartName || details.smartId;
                hide();
            };

            $scope.itemClicked = function(details) {
                //ngModel.$setViewValue(details.smartName);
                if ((details.smartName || details.smartId) == $scope.folderSelector) {
                    $scope.folderSelector = null;
                } else {
                    $scope.folderSelector = details.smartName || details.smartId;
                }
                hide();
            };

            $scope.$watch("folderSelector", function(newValue, oldValue) {
                update();
            });

            /* Popover management */
            var popoverShown = false;
            $(popover).hide();
            var hide = function() {
                popover.hide().detach();
                $("html").unbind("click", hide);
                popoverShown=false;
            };
            var show = function() {
                var mainZone = $(".mainzone", element);
                popoverShown = true;
                if (popover == null) {
                    popover = $compile(popoverTemplate.clone())($scope);
                }
                popover.appendTo("body");

                popover.css("width", attrs.popoverWidth ? attrs.popoverWidth : Math.max(300, mainZone.width() + 20));
                if ($scope.popoverPlacement == 'right') {
                    popover.css("left", mainZone.offset().left - popover.width() + mainZone.width() +4);
                } else {
                    popover.css("left", mainZone.offset().left);
                }
                popover.css("top", mainZone.offset().top + mainZone.height() + ($scope.marginTop ? parseInt($scope.marginTop) : 8));

                if ($scope.popoverPlacement == 'auto') {
                    if (mainZone.offset().top + mainZone.height() + 280 > $(window).height()) {
                        popover.css("top", mainZone.offset().top - 310);
                    }
                }

                popover.show();

                popover.find("input").off('blur.dsSelector').on('blur.dsSelector',function() {
                    popover.find("input").focus();
                });
                popover.find("input").focus();

                popover.off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    //e.stopPropagation();
                });
                $(".mainzone", element).off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    //e.stopPropagation();
                });
                window.setTimeout(function() { $("html").click(function(event) {
                    if (event && event.target && $.contains(element[0], event.target)) return;
                    hide();
                }); }, 0);

                popover.find("input").off('keydown.dsSelector').on('keydown.dsSelector',function(event) {

                    if(event.keyCode==38 || event.keyCode==40 || event.keyCode==13) {
                        event.stopPropagation();
                    } else {
                        return;
                    }

                    if(event.keyCode==38 || event.keyCode==40) {

                        if($scope.displayedGroups &&  $scope.displayedGroups.length>0) {

                            var previous = null;
                            var next = null;
                            var current = null;
                            var first = null;
                            var foundCurrent = false;
                            var last = null;
                            var updateNext = false;

                            for(var k = 0 ; k < $scope.displayedGroups.length ; k++) {
                                var group = $scope.displayedGroups[k];
                                for(var j = 0 ; j < group.folders.length ; j++) {
                                    var ds = group.folders[j];
                                    if(!ds.usable) {
                                        continue;
                                    }
                                    if(!first) {
                                        first = ds;
                                    }
                                    last = ds;
                                    if(foundCurrent) {
                                        if(updateNext) {
                                            next = ds;
                                            updateNext=false;
                                        }
                                    } else {
                                        previous = current;
                                        current = ds;

                                        if($scope.currentlySelected == ds) {
                                            foundCurrent = true;
                                            updateNext = true;
                                        }
                                    }
                                }
                            }

                            $scope.$apply(function() {
                                if(foundCurrent) {
                                    if(event.keyCode == 40) {
                                        if(next) {
                                            $scope.currentlySelected = next;
                                        } else {
                                            $scope.currentlySelected = first;
                                        }
                                    }
                                    if(event.keyCode == 38) {
                                        if(previous) {
                                            $scope.currentlySelected = previous;
                                        } else {
                                            $scope.currentlySelected = last;
                                        }
                                    }
                                } else {
                                    if(first) {
                                        $scope.currentlySelected = first;
                                    }
                                }

                                if($scope.currentlySelected && !$scope.noLiveUpdate) {
                                    $scope.folderSelector = $scope.currentlySelected.smartName || $scope.currentlySelected.smartId;
                                }
                            });
                        }

                    } else if(event.keyCode==13) {
                        if($scope.currentlySelected) {
                            $scope.select($scope.currentlySelected);
                            $scope.$apply();
                        }
                    }

                });
            };

            $scope.togglePopover =function() {
                if (popoverShown) hide();
                else show();
            }
        }
}
    return ret;
});

//TODO @dssObjects factorize
app.directive('streamingEndpointSelector', function($timeout, ListFilter, $compile, StateUtils) {
    var ret = {
        restrict : 'A',
        transclude: true,
        scope : {
            type:'@',
            availableStreamingEndpoints : '=',
            streamingEndpointSelector : '=',
            transclude : '@',
            popoverPlacement: '@',
            marginTop: '@',
            noLiveUpdate : '@',
            ngDisabled: '=?'
        },
        templateUrl : '/templates/streaming-endpoint-selector.html',
    };

    ret.compile = function(element, attrs) {
        var popoverTemplate = element.find('.popover').detach();
        return function($scope, element, attrs) {
        
            $scope.StateUtils = StateUtils; 
            var popover = null;
            if ($scope.transclude) $(element).on('click', function(event) {
                if (event && event.target && event.target.hasAttribute('href') || $scope.ngDisabled) return;
                $scope.togglePopover();
            });

            /* List management */
            function update() {
                $scope.displayedStreamingEndpoints = [];
                if (!$scope.availableStreamingEndpoints) return;

                $scope.filtered = $scope.availableStreamingEndpoints;

                // Filter on terms
                $scope.filtered = ListFilter.filter($scope.availableStreamingEndpoints, $scope.filter.query);

                var groups = {}
                for (var i in  $scope.filtered) {
                    var group = "";
                    var sort = "";
                    if ( $scope.filtered[i].localProject) {
                        group =  ($scope.filtered[i].label || $scope.filtered[i].name) [0].toUpperCase();
                        sort = "AAAAAAAA" + group;
                    } else {
                        group = "Project: " +  $scope.filtered[i].projectKey;
                        sort = group;
                    }
                    if (! groups[group]) {
                         groups[group] = {title : group, streamingEndpoints : [], sort:sort}
                    }
                    groups[group].streamingEndpoints.push( $scope.filtered[i]);
                }
                $scope.displayedGroups = [];
                for (var g in groups) {
                    groups[g].streamingEndpoints.sort(function(a,b) { return (a.label || a.name).localeCompare(b.label || b.name)})
                    $scope.displayedGroups.push(groups[g]);
                }
                $scope.displayedGroups.sort(function(a,b) { return a.sort.localeCompare(b.sort)})

                $scope.currentlySelected = null;
                for (var i in $scope.availableStreamingEndpoints) {
                    if (($scope.availableStreamingEndpoints[i].smartName || $scope.availableStreamingEndpoints[i].smartId) == $scope.streamingEndpointSelector) {
                        $scope.currentlySelected = $scope.availableStreamingEndpoints[i];
                    }
                }


            }
            $scope.filter = {
                allProjects : true,
                query : ""
            }
            $scope.$watch("filter", function() {
                update();
            }, true);
            $scope.$watch("availableStreamingEndpoints", function() {
                update();
            }, true);
            update();

            /* Model management */

            $scope.select = function(details) {
                //ngModel.$setViewValue(details.smartName);
                $scope.streamingEndpointSelector = details.smartName || details.smartId;
                hide();
            };

            $scope.itemClicked = function(details) {
                //ngModel.$setViewValue(details.smartName);
                if ((details.smartName || details.smartId) == $scope.streamingEndpointSelector) {
                    $scope.streamingEndpointSelector = null;
                } else {
                    $scope.streamingEndpointSelector = details.smartName || details.smartId;
                }
                hide();
            };

            $scope.$watch("streamingEndpointSelector", function(newValue, oldValue) {
                update();
            });

            /* Popover management */
            var popoverShown = false;
            $(popover).hide();
            var hide = function() {
                popover.hide().detach();
                $("html").unbind("click", hide);
                popoverShown=false;
            };
            var show = function() {
                var mainZone = $(".mainzone", element);
                popoverShown = true;
                if (popover == null) {
                    popover = $compile(popoverTemplate.clone())($scope);
                }
                popover.appendTo("body");

                popover.css("width", attrs.popoverWidth ? attrs.popoverWidth : Math.max(300, mainZone.width() + 20));
                if ($scope.popoverPlacement == 'right') {
                    popover.css("left", mainZone.offset().left - popover.width() + mainZone.width() +4);
                } else {
                    popover.css("left", mainZone.offset().left);
                }
                popover.css("top", mainZone.offset().top + mainZone.height() + ($scope.marginTop ? parseInt($scope.marginTop) : 8));

                if ($scope.popoverPlacement == 'auto') {
                    if (mainZone.offset().top + mainZone.height() + 280 > $(window).height()) {
                        popover.css("top", mainZone.offset().top - 310);
                    }
                }

                popover.show();

                popover.find("input").off('blur.dsSelector').on('blur.dsSelector',function() {
                    popover.find("input").focus();
                });
                popover.find("input").focus();

                popover.off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    //e.stopPropagation();
                });
                $(".mainzone", element).off("click.dku-pop-over").on("click.dku-pop-over", function(e) {
                    //e.stopPropagation();
                });
                window.setTimeout(function() { $("html").click(function(event) {
                    if (event && event.target && $.contains(element[0], event.target)) return;
                    hide();
                }); }, 0);

                popover.find("input").off('keydown.dsSelector').on('keydown.dsSelector',function(event) {

                    if(event.keyCode==38 || event.keyCode==40 || event.keyCode==13) {
                        event.stopPropagation();
                    } else {
                        return;
                    }

                    if(event.keyCode==38 || event.keyCode==40) {

                        if($scope.displayedGroups &&  $scope.displayedGroups.length>0) {

                            var previous = null;
                            var next = null;
                            var current = null;
                            var first = null;
                            var foundCurrent = false;
                            var last = null;
                            var updateNext = false;

                            for(var k = 0 ; k < $scope.displayedGroups.length ; k++) {
                                var group = $scope.displayedGroups[k];
                                for(var j = 0 ; j < group.streamingEndpoints.length ; j++) {
                                    var ds = group.streamingEndpoints[j];
                                    if(!ds.usable) {
                                        continue;
                                    }
                                    if(!first) {
                                        first = ds;
                                    }
                                    last = ds;
                                    if(foundCurrent) {
                                        if(updateNext) {
                                            next = ds;
                                            updateNext=false;
                                        }
                                    } else {
                                        previous = current;
                                        current = ds;

                                        if($scope.currentlySelected == ds) {
                                            foundCurrent = true;
                                            updateNext = true;
                                        }
                                    }
                                }
                            }

                            $scope.$apply(function() {
                                if(foundCurrent) {
                                    if(event.keyCode == 40) {
                                        if(next) {
                                            $scope.currentlySelected = next;
                                        } else {
                                            $scope.currentlySelected = first;
                                        }
                                    }
                                    if(event.keyCode == 38) {
                                        if(previous) {
                                            $scope.currentlySelected = previous;
                                        } else {
                                            $scope.currentlySelected = last;
                                        }
                                    }
                                } else {
                                    if(first) {
                                        $scope.currentlySelected = first;
                                    }
                                }

                                if($scope.currentlySelected && !$scope.noLiveUpdate) {
                                    $scope.streamingEndpointSelector = $scope.currentlySelected.smartName || $scope.currentlySelected.smartId;
                                }
                            });
                        }

                    } else if(event.keyCode==13) {
                        if($scope.currentlySelected) {
                            $scope.select($scope.currentlySelected);
                            $scope.$apply();
                        }
                    }

                });
            };

            $scope.togglePopover =function() {
                if (popoverShown) hide();
                else show();
            }
        }
    }
    return ret;
});


})();