(function(){
'use strict';

var app = angular.module('dataiku.meanings', []);


app.constant('UDM_TYPES', {
    'DECLARATIVE': "Declarative",
    'VALUES_LIST': "Value list",
    'VALUES_MAPPING': "Value mapping",
    'PATTERN': "Pattern"
});

app.factory("UDMUtils", function($rootScope) {
    return {
        getLabel: function(meaningId) {
            return $rootScope.appConfig.meanings.labelsMap[meaningId];
        }
    };
});

function updateAppConfig(appConfig, udm) {
    appConfig.meanings.labelsMap[udm.id] = udm.label;

    var meanings = appConfig.meanings.categories.filter(function(cat) { return cat.label === 'User-defined'; })[0].meanings;

    for (var i = 0 ; i < meanings.length ; i++) {
        if (meanings[i].id === udm.id) {
            meanings[i].label = udm.label;
            meanings[i].type = udm.type;
            return;
        }
    }

    meanings.push({id: udm.id, label: udm.label, type: udm.type});
}

function cleanBeforeSave(udm) {
    var cleanUDM = angular.extend({}, udm);

    switch(udm.type) {
        case 'DECLARATIVE':
            delete cleanUDM.values;
            delete cleanUDM.mappings;
            delete cleanUDM.pattern;
            delete cleanUDM.normalizationMode;
        break;

        case 'VALUES_MAPPING':
            cleanUDM.mappings = udm.mappings.map(function(m) { return {from: m.from, to: {value: m.to, color: m.color }}});
            delete cleanUDM.pattern;
            delete cleanUDM.values;
        break;

        case 'PATTERN':
            delete cleanUDM.values;
            delete cleanUDM.mappings;
        break;

        case 'VALUES_LIST':
            cleanUDM.entries = udm.mappings.map(function(m) { return {value: m.from, color: m.color}; });
            delete cleanUDM.mappings;
            delete cleanUDM.pattern;
        break;
    }

    return cleanUDM;
}

function defaultUDM() {
    return {
        type: 'DECLARATIVE',
        normalizationMode: 'EXACT',
        mappings:[]
    };
}


app.controller("ColumnEditUDMController", function($scope, $controller, DataikuAPI, Debounce, UDM_TYPES, $timeout){
    $scope.form = {};
    $scope.state = "search";
    $scope.udmTypes = UDM_TYPES;
    $scope.query = {queryString: ''};

    $scope.showValues = true;

    $scope.createNew = function(){
        $scope.state = "new";
        $scope.creation = true;
        $scope.udm = defaultUDM();
        $timeout(function() { $('.udm-definition-form #udmLabelInput').focus(); });
    }

    $scope.initModal = function(columnName, validationCB) {
        $scope.columnName = columnName;
        $scope.validationCB = validationCB;
    }

    DataikuAPI.meanings.listUDM().success(function(data){
        $scope.userDefinedMeanings = data;
    }).error(setErrorInScope.bind($scope));

    $scope.saveNew = function(){
        $scope.saving = true;

        DataikuAPI.meanings.createUDM(cleanBeforeSave($scope.udm)).success(function(){
            DataikuAPI.catalog.flush().success(function() {
                updateAppConfig($scope.appConfig, $scope.udm);
                $scope.saveSet($scope.udm.id);
            });
        }).error(function(data, status, headers, config) { setErrorInScope.bind($scope)(data, status, headers, config); $scope.saving = false; });
    }

    $scope.saveSet = function(id){
        $scope.validationCB(id);
        $scope.resolveModal();
    }

    $scope.$watch("query.queryString", Debounce().withDelay(100, 200).wrap(function(){
        DataikuAPI.catalog.searchMeanings($scope.query.queryString).success(function(data){
            $scope.results = data;
        }).error(setErrorInScope.bind($scope));
    }));

    $scope.blurOnEnter = function($event){
        if(event.which === 13) {
            $event.target.blur();
        }
    }

});


app.controller("EditUDMController", function($scope, $controller, DataikuAPI, Debounce, $timeout){
    $scope.form = {};
    $scope.query = "";
    $scope.checkboxes = {};
    $scope.udm = {};
    $scope.uiState = $scope.uiState || {};

    $scope.initModal = function(meaningId, callback) {
        $scope.uiState.activeTab = 'definition';
        $scope.callback = callback;

        if (meaningId === null) {
            $scope.creation = true;
            $scope.udm = defaultUDM();
            $timeout(function() { $('.udm-definition-form #udmLabelInput').focus(); });
        } else {
            $scope.creation = false;
            DataikuAPI.meanings.getUDM(meaningId).success(function(udm) {
                $scope.udm = udm;
                if (!$scope.udm.mappings) $scope.udm.mappings = [];
                if($scope.udm.type == 'VALUES_LIST') {
                    $scope.udm.mappings = $scope.udm.entries.map(function(v) { return {from:v.value, color: v.color}});
                } else if ($scope.udm.type == 'VALUES_MAPPING') {
                    $scope.udm.mappings = $scope.udm.mappings.map(function(v) { return {from:v.from, to: v.to.value, color: v.to.color}});
                }
            });
        }
    };

    $scope.removeCol = function(checked, id) {
        if (!checked) {
            if ($scope.actions.remove.indexOf(id) !== -1) return;
            $scope.actions.remove.push(id);
        } else {
            var index = $scope.actions.remove.indexOf(id);
            if (index === -1) return;
            $scope.actions.remove.splice(index, 1);
        }
    };

    $scope.save = function(){
        $scope.saving = true;

        var endpoint = $scope.creation ? 'createUDM' : 'saveUDM';

        DataikuAPI.meanings[endpoint](cleanBeforeSave($scope.udm)).success(function(){

            updateAppConfig($scope.appConfig, $scope.udm);

            var data = {};
            for (var key in $scope.checkboxes) {
                if ($scope.checkboxes[key] !== "no_change") {
                    if ($scope.checkboxes[key] === "remove") data[key] = null;
                    else if ($scope.checkboxes[key] === "add") data[key] = $scope.udm.id;
                }
            }

            DataikuAPI.explores.setColumnsMeanings(data).success(function() {
                DataikuAPI.catalog.flush().success(function() {
                     $scope.callback($scope.udm);
                     $scope.resolveModal();
                });
            }).error(function(data, status, headers, config) { setErrorInScope.bind($scope)(data, status, headers, config); $scope.saving = false; });

        }).error(function(data, status, headers, config) { setErrorInScope.bind($scope)(data, status, headers, config); $scope.saving = false; });
    };

    $scope.$watch("toggleAll", function(nv, ov) {
        if (nv === true) {
            $scope.results.hits.hits.forEach(function(column) {
                if (column._source.meaning === $scope.udm.id) {
                    $scope.checkboxes[column._id] = 'no_change';
                } else {
                    $scope.checkboxes[column._id] = 'add';
                }
            });
            $scope.updateCounts();
        } else if (nv === false) {
            $scope.results.hits.hits.forEach(function(column) {
                if (column._source.meaning !== $scope.udm.id) {
                    $scope.checkboxes[column._id] = 'no_change';
                } else {
                    $scope.checkboxes[column._id] = 'remove';
                }
            });
            $scope.updateCounts();
        }
    });

    function anyChecked() {
        for (var i = 0; i < $scope.results.hits.hits.length; i++) {
            var column = $scope.results.hits.hits[i];
            if (column._source.meaning === $scope.udm.id) {
                if ($scope.checkboxes[column._id] !== 'remove') return true;
            } else {
                if ($scope.checkboxes[column._id] === 'add') return true;
            }
        }
        return false;
    }

    function allChecked() {
        for (var i = 0; i < $scope.results.hits.hits.length; i++) {
            var column = $scope.results.hits.hits[i];
            if (column._source.meaning === $scope.udm.id) {
                if ($scope.checkboxes[column._id] === 'remove') return false;
            } else {
                if ($scope.checkboxes[column._id] !== 'add') return false;
            }
        }
        return true;
    }

    $scope.indeterminate = function() {
        return anyChecked() && !allChecked();
    };

    function search() {
        DataikuAPI.catalog.searchColumns($scope.query, {"_type": ["column"]}).success(function(results) {
            $scope.results = results;
        });
    }

    // flush the catalog first to make sure that we don't show deleted columns
    DataikuAPI.catalog.flush().success(function() {
        $scope.$watch('query', Debounce().withDelay(100, 200).wrap(search));
    });

    $scope.updateCounts = function() {
        $scope.changeCounts = {add: 0, remove: 0};
        for (var key in $scope.checkboxes) {
            if ($scope.checkboxes[key] !== "no_change") {
                if ($scope.checkboxes[key] === "remove") $scope.changeCounts.remove = $scope.changeCounts.remove+1;
                else if ($scope.checkboxes[key] === "add") $scope.changeCounts.add = $scope.changeCounts.add+1;
            }
        }
    }
});


app.controller("ColumnEditUDMRefreshController", function($scope, $controller, DataikuAPI, $state, Debounce, $stateParams, ActivityIndicator, categoricalPalette){
    $scope.$watch("results", function() {
        if ($scope.selected && $scope.selected.item) {
            for (var i = 0 ; i < $scope.results.hits.hits.length ; i++) {
                if ($scope.results.hits.hits[i]._id === $scope.selected.item._id) {
                    $scope.selected.index = i;
                    $scope.selected.item = $scope.results.hits.hits[i];
                    return;
                }
            }

            $scope.selected.index = null;
            $scope.selected.item = null;
        }
    });
});


app.controller("UDMFormController", function($scope, UDM_TYPES, NORMALIZATION_MODES){
    var count = null;

    $scope.udmTypes = UDM_TYPES;
    $scope.normalizationModes = NORMALIZATION_MODES;

    $scope.$watch("udm.type", function(nv) {
        if (nv === 'PATTERN' && $scope.udm.normalizationMode === 'NORMALIZED') {
            $scope.udm.normalizationMode = 'EXACT';
        }
    });

    if ($scope.creation) {
        $scope.$watch("udm.label", function(nv, ov) {
            if (!nv) return;
            var slug = nv.toLowerCase().replace(/\W+/g, ""),
                cur = slug,
                i = 0;
            while ($scope.appConfig.meanings.labelsMap.hasOwnProperty(cur)) {
                cur = slug + "_" + (++i);
            }
            $scope.udm.id = cur;
        });

        $scope.$watch("udm.id", function(nv, ov) {
            if (!$scope.form.UDMForm.id) return;
            if(nv && $scope.appConfig.meanings.labelsMap.hasOwnProperty(nv.toLowerCase())) {
                $scope.form.UDMForm.id.$setValidity("unique", false);
                $scope.form.invalidId = true;
            } else {
                $scope.form.UDMForm.id.$setValidity("unique", true);
                $scope.form.invalidId = false;
            }
        });
    }
    // Scroll to the bottom of the list every time a new value is added
    $scope.onListChange = function(items) {
        if (!items) return;

        if (count !== null && items.length === count+1) {
            var $el = $('.udm-definition-form .values');
            $el.scrollTop($el[0].scrollHeight)
        }

        count = items.length;
        $scope.validate();
    };

    $scope.$watch("form.UDMForm.$invalid", function(nv, ov) {
        $scope.form.$invalid = nv;
    });

    // enforce uniqueness of values / mapping keys
    $scope.validate = function(obj, itemIndex) {
        var validity = true;

        angular.forEach($scope.udm.mappings, function(v, i) {
            var container = ".editable-list__item:nth-child(" + (i+1) + ")";
            var controller = $(".udm-definition-form " + container + " div[ng-model='it.from']").data().$ngModelController;

            if (!v.from || $scope.udm.mappings.filter(function(v2) { return v.from == v2.from }).length > 1) {
                controller.$setValidity("unique", false);
                if (i === itemIndex) validity = false;
            } else {
                controller.$setValidity("unique", true);
                if (i === itemIndex) validity = true;
            }
        });

        return validity;
    };
});

})();