(function(){
    'use strict';

    var widgets = angular.module('dataiku.directives.widgets');

    widgets.directive('computedColumnStep', function(Logger, $timeout) {
        return {
            templateUrl: '/templates/recipes/visual-recipes-fragments/inline-computed-columns.html',
            restrict: 'EA',
            scope: true,
            link: function(scope, element, attrs) {
                scope.computedColumnStep = {};

                scope.getComputedColumnsStatus = function(recipeStatus, computedColumnIndex) {
                    return ((recipeStatus || {}).messages || []).filter(function(msg) {
                        return msg.line === computedColumnIndex;
                    });
                };

                scope.addNewComputedColumn = function() {
                    scope.computedColumnStep.editingNewComputedColumn = true;
                    scope.computedColumnListDesc.push({name:'', type: 'double', expr: '', mode: 'GREL'});
                    // focus the newly added computed column's name input
                    $timeout(function() {
                        element.find('[computed-column-step-editor]').last().find('input.computed-column-name').focus();
                    });
                };

                // --- init parameters given in attributes:
                var defaults = {
                    computedColumnListUpdateCallback: null,
                    dataset: null,
                    schema: null,
                    computedColumnListDesc: null
                };

                var regenInternalFields = function() {
                    $.each(defaults, function(param, value) {
                        scope[param] = scope.$eval(attrs[param]) || value;
                    });
                    if (!scope.computedColumnListDesc) {
                        Logger.error('"computed-column-list-desc" attribute is required by directive computed-column-step', attrs);
                    }
                    if (!scope.schema && !scope.dataset) {
                        Logger.error('computedColumnStep must have either a dataset or a schema', attrs);
                    }
                };

                regenInternalFields();

                if (scope.computedColumnListUpdateCallback) {
                    var computedColumnListDescOldValue;

                    var computedColumnListDescChanged = function(nv, ov){
                        // check if the newly added computed column's expression is set,
                        // if so compute status for this news computed column aswell
                        if (scope.computedColumnStep.editingNewComputedColumn && nv[nv.length-1] && nv[nv.length-1].expr) {
                            scope.computedColumnStep.editingNewComputedColumn = false;
                        }
                        var oldValue = computedColumnListDescOldValue;
                        var newValue = nv;
                        // ignoring the last element of the array if it has been recently added
                        if (scope.computedColumnStep.editingNewComputedColumn) {
                            newValue = newValue.slice(0, -1);
                        }
                        if(angular.equals(oldValue, newValue)) {
                            return;
                        }
                        computedColumnListDescOldValue = angular.copy(newValue);
                        scope.computedColumnListUpdateCallback(newValue);
                    };

                    scope.$on('$destroy', function() {
                        scope.computedColumnStep.editingNewComputedColumn = false;
                        computedColumnListDescChanged(scope.computedColumnListDesc, computedColumnListDescOldValue);
                    });

                    scope.$watch('computedColumnListDesc', computedColumnListDescChanged, true);
                }

                scope.$watch('recipeStatus', function() {
                    // in case these computed columns are in a visual recipe, make sure to update the internal
                    // flags when the engine or something else changes
                    regenInternalFields();
                },true);
            }
        };
    });

    widgets.directive('computedColumnStepEditor', function(Logger, InfoMessagesUtils, ColumnTypeConstants, CodeMirrorSettingService) {
        return {
            templateUrl: '/templates/recipes/fragments/computed-column-step-editor.html',
            restrict: 'EA',
            scope: true,
            link: function(scope, element, attrs) {
                var getSchema = function() {
                    if (scope.schema) {
                        return scope.schema;
                    } else {
                        Logger.error("schema not found for computed column")
                        return {columns: {}};
                    }
                };

                scope.getColumns = function() {
                    var schema = getSchema();
                    return schema && schema.columns || [];
                };

                scope.clickedOnColumnName = function(colName) {
                    scope.addFormulaElement(colName.match(/^[a-z0-9_]+$/i) ? colName : `val('${colName}')`);
                };

                scope.clickedOnVariableName = function(varName) {
                    scope.addFormulaElement(`variables['${colName}']`);
                };

                scope.addFormulaElement = function(code) {
                    // replace selection and focuses editor
                    var cm = $('.CodeMirror', element).get(0).CodeMirror;
                    cm.replaceSelection(code);
                    cm.focus();
                };

                scope.InfoMessagesUtils = InfoMessagesUtils;
                scope.ColumnTypeConstants = ColumnTypeConstants;

                // --- init parameters given in attributes:
                var defaults = {
                    mustRunInDatabase: false,
                    computedColumnUpdateCallback: null,
                    dataset: null,
                    schema: null,
                    computedColumnDesc: null,
                    recipeStatusMessages: null
                };

                var regenInternalFields = function() {
                    $.each(defaults, function(param, value) {
                        scope[param] = scope.$eval(attrs[param]) || value;
                    });
                    if (!scope.computedColumnDesc) {
                        Logger.error('"computed-column-desc" attribute is required by directive computed-column-step-editor', attrs);
                    }
                    if (!scope.schema && !scope.dataset) {
                        Logger.error('computedColumnStepEditor must have either a dataset or a schema', attrs);
                    }
                };

                regenInternalFields();

                scope.sqlEditorOptions = CodeMirrorSettingService.get('text/x-sql');

                if (scope.computedColumnUpdateCallback) {
                    scope.$watch('computedColumnDesc',
                        function(nv, ov){
                            if(angular.equals(ov, nv)) {
                                return;
                            }
                            scope.computedColumnUpdateCallback(scope.computedColumnDesc);
                        },
                        true
                    );
                }

                scope.$watch('recipeStatus', function() {
                    // in case these computed columns are in a visual recipe, make sure to update the internal
                    // flags when the engine or something else changes
                    regenInternalFields();
                },true);
            }
        };
    });

    widgets.directive('inputComputedColumnsBlock', function (CreateModalFromTemplate, $timeout) {
        return {
            templateUrl : '/templates/recipes/fragments/computed-columns-management-block.html',
            restrict: 'AE',
            scope: {
                inputIndex: '=',
                computedColumnListDesc: '=',
                dataset: '=',
                schema: '=',
                recipeStatus: '=',
                onChange: '&',
                recipeVariables: '='
            },
            link : function(scope, element, attrs) {
                scope.computedColumnListDesc = scope.computedColumnListDesc || [];

                scope.getInputComputedColumnsStatus = function(inputIndex, computedColumnIndex) {
                    return (((scope.recipeStatus || {}).inputComputedColumns || {}).messages || []).filter(function(msg) {
                        return msg.column === inputIndex && msg.line === computedColumnIndex;
                    });
                };

                scope.showComputedColumnsModal = function(computedColumnDescIdx) {
                    var computedColumnDesc = scope.computedColumnListDesc[computedColumnDescIdx];

                    var newScope = scope.$new();

                    newScope.computedColumnListDesc = scope.computedColumnListDesc;
                    newScope.dataset = scope.dataset;
                    newScope.schema = scope.schema;
                    newScope.recipeVariables = scope.recipeVariables;

                    newScope.newComputedColumn = computedColumnDescIdx === undefined || !computedColumnDesc;

                    newScope.computedColumnDesc = newScope.newComputedColumn ? {name:'', type: 'double', expr: '', mode: 'GREL'} : computedColumnDesc;
                    newScope.computedColumnDescIdx = newScope.newComputedColumn ? scope.computedColumnListDesc.length : computedColumnDescIdx;

                    CreateModalFromTemplate('/templates/recipes/fragments/computed-columns-modal.html', newScope, null, function(newScope) {
                        $timeout(function() {
                            $('#computed-columns-modal input.computed-column-name').focus();
                        });
                        if (newScope.newComputedColumn) {
                            newScope.$watch('computedColumnDesc.expr', function(nv) {
                                if (newScope.newComputedColumn && !!nv) {
                                    newScope.newComputedColumn = false;
                                    newScope.computedColumnListDesc.push(newScope.computedColumnDesc);
                                }
                            });

                            newScope.$on('$destroy', function() {
                                if (newScope.newComputedColumn) {
                                    newScope.newComputedColumn = false;
                                    newScope.computedColumnListDesc.push(newScope.computedColumnDesc);
                                }
                            });
                        }
                    });
                };

                scope.addNewComputedColumn = function() {
                    scope.showComputedColumnsModal();
                };

                scope.ok = function() {
                    if (scope.onChange) {
                        scope.onChange();
                    }
                }
            }
        };
    });
})();
