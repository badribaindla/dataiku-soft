(function(){
'use strict';

    const app = angular.module('dataiku.services');

    app.factory('Expressions', function($stateParams, DataikuAPI, Logger) {

        function inColName(value) {
            return "<span class=\"input-column-name\">" + sanitize(value) + "</span>";
        }
        function numLiteral(value) {
            return "<span class=\"num-literal\">" + sanitize(value) + "</span>";
        }
        function anumLiteral(value) {
            if (value == null || value.length == 0) {
                return '<span class="alphanum-literal">\'\'</span>';
            } else {
                return "<span class=\"alphanum-literal\">" + sanitize(value) + "</span>";
            }
        }

        var operators = [ //names should be unique
            {
                name: "empty array",
                label: "is an empty array",
                params: [],
                enableFor: ["array"],
                repr : function(cond) { return inColName(cond["input"]) + " is an empty array"; }
            },
            {
                name: "not empty array",
                label: "is not an empty array",
                params: [],
                enableFor: ["array"],
                repr : function(cond) { return inColName(cond["input"]) + " is not an empty array"; }
            },
            {
                name: "array contains",
                label: "contains",
                params: ["string"],
                enableFor: ["array"],
                repr : function(cond) { return inColName(cond["input"]) + " contains " + anumLiteral(cond["string"]); },
                meaning: "contains"
            },

            {
                name: "not empty",
                label: "is defined",
                params: [],
                enableFor: ["string"],
                repr : function(cond) { return inColName(cond["input"]) + " is defined"; },
                meaning: "is defined"
            },
            {
                name: "is empty",
                label: "is not defined",
                params: [],
                enableFor: ["string"],
                repr : function(cond) { return inColName(cond["input"]) + " is not defined"; },
                meaning: "is not defined"
            },
            {
                name: "not empty string",
                label: "is defined",
                params: [],
                disableFor: ["string"],
                repr : function(cond) { return inColName(cond["input"]) + " is defined"; },
                meaning: "is defined"
            },
            {
                name: "empty string",
                label: "is not defined",
                params: [],
                disableFor: ["string"],
                repr : function(cond) { return inColName(cond["input"]) + " is not defined"; },
                meaning: "is not defined"
            },

            {
                name: "true",
                label: "is true",
                params: [],
                enableFor: ["boolean"],
                repr : function(cond) { return inColName(cond["input"]) + " is true"; },
                meaning: "is true",
                approximateEquivalences: ["==", "== [column]"]
            },
            {
                name: "false",
                label: "is false",
                params: [],
                enableFor: ["boolean"],
                repr : function(cond) { return inColName(cond["input"]) + " is false"; },
                meaning: "is false",
                approximateEquivalences: ["==", "== [column]"]
            },

            {
                name: "== [string]",
                label: "equals",
                params: ["string"],
                disableFor: ["num", "date", "boolean"],
                repr : function(cond) { return inColName(cond["input"]) + " == " + anumLiteral(cond["string"]); },
                meaning: "==",
                approximateEquivalences: ["is true", "== [column]"]
            },
            {
                name: "== [string]i",
                label: "equals (case insensitive)",
                params: ["string"],
                disableFor: ["num", "date", "boolean"],
                repr : function(cond) { return inColName(cond["input"]) + " == " + anumLiteral(cond["string"]) + " (insensitive)"; },
                meaning: "==",
                approximateEquivalences: ["is true", "== [column]"]
            },
            {
                name: "!= [string]",
                label: "is different from",
                params: ["string"],
                disableFor: ["num", "date", "boolean"],
                repr : function(cond) { return inColName(cond["input"]) + " != " + anumLiteral(cond["string"]); },
                meaning: "!=",
                approximateEquivalences: ["!= [column]"]
            },

            {
                name: "== [NaNcolumn]",
                label: "is the same as ",
                params: ["col"],
                disableFor: ["num"],
                category: "column",
                repr : function(cond) { return inColName(cond["input"]) + " == " + inColName(cond["col"]); },
                meaning: "== [column]",
                approximateEquivalences: ["=="]
            },
            {
                name: "!= [NaNcolumn]",
                label: "is different from ",
                params: ["col"],
                disableFor: ["num"],
                category: "column",
                repr : function(cond) { return inColName(cond["input"]) + " != " + inColName(cond["col"]); },
                meaning: "!= [column]",
                approximateEquivalences: ["!="]
            },

            {
                name: "== [number]",
                label: "==",
                params: ["num"],
                enableFor: ["num"],
                repr : function(cond) { return inColName(cond["input"]) + " == " + numLiteral(cond["num"]); },
                meaning: "==",
                approximateEquivalences: ["is true", "== [column]"]
            },
            {
                name: "!= [number]",
                label: "!=",
                params: ["num"],
                enableFor: ["num"],
                repr : function(cond) { return inColName(cond["input"]) + " != " + numLiteral(cond["num"]); },
                meaning: "!=",
                approximateEquivalences: ["!= [column]"]
            },
            {
                name: ">  [number]",
                label: "> ",
                params: ["num"],
                enableFor: ["num"],
                repr : function(cond) { return inColName(cond["input"]) + " > " + numLiteral(cond["num"]); },
                meaning: ">",
                approximateEquivalences: [">=", ">  [column]", ">= [column]"]
            },
            {
                name: "<  [number]",
                label: "< ",
                params: ["num"],
                enableFor: ["num"],
                repr : function(cond) { return inColName(cond["input"]) + " < " + numLiteral(cond["num"]); },
                meaning: "<",
                approximateEquivalences: ["<=", "<  [column]", "<= [column]"]
            },
            {
                name: ">= [number]",
                label: ">=",
                params: ["num"],
                enableFor: ["num"],
                repr : function(cond) { return inColName(cond["input"]) + " >= " + numLiteral(cond["num"]); },
                meaning: ">=",
                approximateEquivalences: [ ">", ">= [column]", ">  [column]"]
            },
            {
                name: "<= [number]",
                label: "<=",
                params: ["num"],
                enableFor: ["num"],
                repr : function(cond) { return inColName(cond["input"]) + " <= " + numLiteral(cond["num"]); },
                meaning: "<=",
                approximateEquivalences: ["<", "<= [column]", "<  [column]"]
            },

            {
                name: "== [date]",
                label: "equals",
                params: ["date", "time", "unit"],
                enableFor: ["date"],
                repr : function(cond) { return inColName(cond["input"]) + " == " + numLiteral(cond["date"]) + " " + numLiteral(cond["time"]) + " (~ " + anumLiteral(cond["unit"]) + ")"; },
                meaning: "==",
                approximateEquivalences: ["is true", "== [column]"]
            },
            {
                name: ">= [date]",
                label: "is after",
                params: ["date", "time"],
                enableFor: ["date"],
                repr : function(cond) { return inColName(cond["input"]) + " >= " + numLiteral(cond["date"]) + " " + numLiteral(cond["time"]) ; },
                meaning: ">=",
                approximateEquivalences: [">", ">= [column]", ">  [column]"]
            },
            {
                name: "<  [date]",
                label: "is before",
                params: ["date", "time"],
                enableFor: ["date"],
                repr : function(cond) { return inColName(cond["input"]) + " <=" + numLiteral(cond["date"]) + " " + numLiteral(cond["time"]) ; },
                meaning: "<",
                approximateEquivalences: ["<=", "<  [column]", "<= [column]"]
            },
            {
                name: ">< [date]",
                label: "is between",
                params: ["date", "date2", "time", "time2"],
                enableFor: ["date"],
                repr : function(cond) {
                    return numLiteral(cond["date"]) + " " + numLiteral(cond["time"]) +
                        " <= " +
                        inColName(cond["input"]) +
                        " < " +
                        numLiteral(cond["date2"]) + " " + numLiteral(cond["time2"]);
                },
                approximateEquivalences: [">=", ">", ">= [column]", ">  [column]"] //debatable
            },

            {
                name: "== [column]",
                label: "==",
                params: ["col"],
                enableFor: ["num"],
                category: "column",
                repr : function(cond) { return inColName(cond["input"]) + " == " + inColName(cond["col"]); },
                meaning: "== [column]",
                approximateEquivalences: ["=="]
            },
            {
                name: "!= [column]",
                label: "!=",
                params: ["col"],
                enableFor: ["num"],
                category: "column",
                repr : function(cond) { return inColName(cond["input"]) + " != " + inColName(cond["col"]); },
                meaning: "!= [column]",
                approximateEquivalences: ["!="]
            },
            {
                name: ">  [column]",
                label: " >",
                params: ["col"],
                enableFor: ["num"],
                category: "column",
                repr : function(cond) { return inColName(cond["input"]) + " > " + inColName(cond["col"]); },
                meaning: ">  [column]",
                approximateEquivalences: [">= [column]", ">", ">="]
            },
            {
                name: "<  [column]",
                label: " <",
                params: ["col"],
                enableFor: ["num"],
                category: "column",
                repr : function(cond) { return inColName(cond["input"]) + " < " + inColName(cond["col"]); },
                meaning: "<  [column]",
                approximateEquivalences: ["<= [column]", "<", "<="]
            },
            {
                name: ">= [column]",
                label: ">=",
                params: ["col"],
                enableFor: ["num"],
                category: "column",
                repr : function(cond) { return inColName(cond["input"]) + " >= " + inColName(cond["col"]); },
                meaning: ">= [column]",
                approximateEquivalences: [">  [column]", ">=", ">"]
            },
            {
                name: "<= [column]",
                label: "<=",
                params: ["col"],
                enableFor: ["num"],
                category: "column",
                repr : function(cond) { return inColName(cond["input"]) + " <= " + inColName(cond["col"]); },
                meaning: "<= [column]",
                approximateEquivalences: ["<  [column]", "<=", "<"]
            },

            {
                name: "contains",
                label: "contains",
                params: ["string"],
                enableFor: ["string"],
                repr : function(cond){
                    return inColName(cond["input"]) + " contains " + anumLiteral(cond["string"]);
                },
                meaning: "contains"
            },
            {
                name: "regex",
                label: "matches the regex",
                params: ["string"],
                enableFor: ["string"],
                repr : function(cond) { return inColName(cond["input"]) + " =~ /" + anumLiteral(cond["string"]) + "/"; },
                approximateEquivalences: ["=="] //debatable
            }
        ];


        { //debug check for operator names
            var namesSoFar = [];
            for (var i = 0; i < operators.length; ++i) {
                var name = operators[i].name;
                if (namesSoFar.indexOf(name) >= 0) {
                    Logger.error("Duplicate operator name ("+name+")");
                }
                namesSoFar.push(name);
            }
        }

        var genericType = function(type) {
            type = (type||'').toLowerCase();
            if (["tinyint", "smallint", "int", "bigint", "float", "double"].indexOf(type) > -1) {
                return "num";
            }
            return type;
        };

        var getDefaultOperator = function(type) { //for default selection in UI
            switch(genericType(type)) {
                case "array": return "not empty array";
                case "boolean": return "true";
                case "date": return ">= [date]";
                case "num": return "== [number]";
                case "string": return "contains";
                default: return "not empty";
            }
        };

        const DATE_UNITS = [
            {name:"seconds",label:"second"},
            {name:"minutes",label:"minute"},
            {name:"hours",label:"hour"},
            {name:"days",label:"day"},
            {name:"weeks",label:"week"},
            {name:"months",label:"month"},
            {name:"years",label:"year"}
       ];

        var has = function(t,v) { if(!t) return false; return t.indexOf(v) > -1; };

        var getOperators = function(type) {
            if (!type) return operators;
            type = genericType(type);
            return operators
                .filter(function(op) {
                    return has(op.enableFor, type) ||  (!op.enableFor && !has(op.disableFor, type));
                })
                .map(function(op) {
                    return {name: op.name, label:op.label, params:op.params, category:op.category, meaning:op.meaning, approximateEquivalences: op.approximateEquivalences};
                });
        };

        var getOperatorByName = function(name){
            return operators.find(op => op.name == name);
        };

        var quoteString = function(str) {
            if (!str) return '';
            if (str.indexOf('"') < 0) return '"'+str+'"';
            if (str.indexOf("'") < 0) return "'"+str+"'";
            return "'"+str.replace(/'/g, "\\'")+"'";
        };

        // support for column names which are invalid grel identifiers
        var val = function(colName) {
            return "val("+quoteString(colName)+")";
        };
        var boolval = function(colName) {
            return "asBool(val("+quoteString(colName)+"))";
        };

        var validateExpression = function (expression, schema) {
            return DataikuAPI.flow.recipes.filter.validateExpression(expression, JSON.stringify(schema), $stateParams.projectKey);
        };

        var service = {
            getOperators: getOperators,
            getDefaultOperator: getDefaultOperator,
            validateExpression: validateExpression,
            genericType: genericType,
            dateUnits: DATE_UNITS,
            getOperatorByName: getOperatorByName
        };
        return service;
    });

})();


(function(){
'use strict';

    const app = angular.module('dataiku.directives.widgets');

    app.directive('filterEditor', function($timeout, Expressions, DataikuAPI, Logger, $stateParams, CodeMirrorSettingService) {
        return {
            templateUrl: '/templates/recipes/fragments/filter-editor.html',
            restrict: 'EA',
            scope: true,
            link : function(scope, element, attrs) {
                if ( attrs.hideSqlFilter ) {
                    scope.hideSqlFilter = scope.$eval(attrs.hideSqlFilter);
                } else {
                    // the parent may have set it
                }
                var manuallyEditedCustomFormula; //save the expression if it was manually edited to restore it if necessary
                var manuallyEditedSQLExpression; //save the expression if it was manually edited to restore it if necessary
                var automaticallyGeneratedCustomFormula; //save the expression if it was manually edited to restore it if necessary
                var automaticallyGeneratedSQLExpression; //save the expression if it was manually edited to restore it if necessary
                var timeout;//buffer validate expression AJAX calls

                DataikuAPI.flow.recipes.generic.getVariables($stateParams.projectKey).success(function(data) {
                    scope.recipeVariables = data;
                }).error(setErrorInScope.bind(scope));

                scope.$parent.$watch(attrs.schema, function(nv) {
                    scope.schema = nv;
                });
                scope.onExpressionChange = function(){
                    scope.revalidateExpression();
                    manuallyEditedCustomFormula = scope.filterDesc.expression;
                };

                scope.onFilterModeChange = function() {
                    scope.revalidateExpression();
                };

                scope.onSQLChange = function(){
                    manuallyEditedSQLExpression = scope.filterDesc.expression;
                };

                scope.revalidateExpression = function(){
                    scope.filterDesc.$status.validated = false;
                    $timeout.cancel(timeout);
                    if (!scope.filterDesc.expression) return;
                    scope.validationPending = true;
                    timeout = $timeout(scope.validateExpression, 400);
                };


                scope.updateUiData = function(){
                    delete scope.filterDesc.language;
                    // handle mode shifts
                    if (uiData.mode != lastUiData.mode) {
                        if (lastUiData.mode == 'SQL') {
                            // no keeping the expression for the other modes
                        } else if (lastUiData.mode == 'CUSTOM') {
                            // if moving to SQL try putting the converted GREL expression
                            var setTranslatedExpression = null;
                            if (uiData.mode == 'SQL' && manuallyEditedSQLExpression == null) {
                                setTranslatedExpression = function(data) {
                                    if (data.ok) {
                                        scope.filterDesc.expression = data.sql;
                                        manuallyEditedSQLExpression = null;
                                    }
                                };
                            }
                            if (setTranslatedExpression != null) {
                                Expressions.validateExpression(scope.filterDesc.expression, getSchema())
                                .success(setTranslatedExpression)
                                .error(setErrorInScope.bind(scope));
                            }
                        } else {
                            var setTranslatedExpression = null;
                            if (uiData.mode == 'SQL' && manuallyEditedSQLExpression == null) {
                                setTranslatedExpression = function(data) {
                                    if (data.ok) {
                                        scope.filterDesc.expression = data.sql;
                                        manuallyEditedSQLExpression = null;
                                    }
                                };
                            } else if (uiData.mode == 'CUSTOM' && manuallyEditedCustomFormula == null) {
                                setTranslatedExpression = function(data) {
                                    if (data.ok) {
                                        scope.filterDesc.expression = data.grel;
                                        manuallyEditedCustomFormula = null;
                                    }
                                };
                            }
                            if (setTranslatedExpression != null) {
                                var lastFilterDesc = angular.copy(scope.filterDesc);
                                lastFilterDesc.uiData = lastUiData;
                                DataikuAPI.flow.recipes.filter.validateAst(lastFilterDesc, $stateParams.projectKey)
                                    .success(setTranslatedExpression)
                                    .error(setErrorInScope.bind(scope));
                            }
                        }
                    }
                    lastUiData = angular.copy(uiData);
                };

                var getSchema = function() {
                    if (scope.filterDesc.$status && scope.filterDesc.$status.schema) {
                        return scope.filterDesc.$status.schema;
                    } else if (scope.schema) {
                        return scope.schema;
                    } else {
                        return {columns: []};
                    }
                };

                scope.hasSchema = function() {
                    return (scope.filterDesc.$status && scope.filterDesc.$status.schema) || scope.schema;
                }

                scope.validateExpression = function() {
                    if (!scope.filterDesc.enabled || !scope.filterDesc.expression || !scope.hasSchema()) {
                        return;
                    }
                    scope.validationPending = false;
                    scope.validationInProgress = scope.validationInProgress ? scope.validationInProgress+1 : 1;
                    Expressions.validateExpression(scope.filterDesc.expression, getSchema())
                        .success(function(data) {
                            if (data.ok && scope.mustRunInDatabase && !data.fullyTranslated) {
                                data.ok = false;
                                data.message = "this expression cannot be translated to SQL."
                            }
                            scope.filterDesc.$status = scope.filterDesc.$status || {};
                            $.extend(scope.filterDesc.$status, data);
                            scope.filterDesc.$status.validated = true;
                            scope.validationInProgress--;
                            automaticallyGeneratedSQLExpression = data.sql;
                            manuallyEditedSQLExpression = null;
                        })
                        .error(function(data) {
                            scope.validationInProgress--;
                            setErrorInScope.bind(scope);
                        });
                };

                scope.getColumns = function() {
                    var schema = getSchema();
                    return schema && schema.columns || [];
                };

                scope.clickedOnColumnName = function(colName) {
                    scope.addFormulaElement(colName.match(/^[a-z0-9_]+$/i) ? colName : `val('${colName}')`);
                };

                scope.clickedOnVariableName = function(varName) {
                    scope.addFormulaElement('variables["' + varName + '"]');
                };

                scope.addFormulaElement = function(code) {
                    // replace selection and focuses editor
                    var cm = $('.CodeMirror', element).get(0).CodeMirror;
                    cm.replaceSelection(code);
                    cm.focus();
                };

                // --- init parameters given in attributes:
                var defaults = {
                    modelLabel: "Keep only rows that satisfy",
                    mustRunInDatabase: false,
                    filterUpdateCallback: null,
                    dataset: null,
                    schema: null,
                    filterDesc: null
                };

                var regenInternalFields = function() {
                    $.each(defaults, function(param, value) {
                        scope[param] = scope.$eval(attrs[param]) || value;
                    });
                    if (!scope.filterDesc) {
                        Logger.error('"filter-desc" attribute is required by directive filterEditor', attrs);
                    }
                    if (!scope.schema && !scope.dataset && !(scope.filterDesc.$status && scope.filterDesc.$status.schema)) {
                        Logger.error('filterEditor must have either a dataset or a schema', attrs);
                    }

                };

                regenInternalFields();

                var columns = function(){return scope.getColumns().map(function(c){return c.name}); };
                scope.editorOptions = {
                        onLoad: function(cm) {
                            cm.on("keyup", function(cm, evt) {
                                if (evt.type == 'keyup') {
                                    /* Ignore tab, esc, and navigation/arrow keys */
                                    if (evt.keyCode == 9 || evt.keyCode == 27 || (evt.keyCode>= 33 && evt.keyCode <= 40)) {
                                        return;
                                    } else {
                                        var options = {
                                            columns: columns,
                                            completeSingle: false
                                        }
                                        CodeMirror.commands.autocomplete(cm, null, options);
                                    }
                                }
                            });
                        },
                        mode:'text/grel',
                        theme:'elegant',
                        variables: columns,
                        lineNumbers : false,
                        lineWrapping : true,
                        indentUnit: 4,
                        autofocus: true
                    };
                scope.sqlEditorOptions = CodeMirrorSettingService.get('text/x-sql');
                scope.sqlEditorOptions.variables = columns;
                scope.sqlEditorOptions.autofocus = true;

                // --- init uiData:
                scope.filterDesc.uiData = scope.filterDesc.uiData || {};
                var uiData = scope.filterDesc.uiData;
                var lastUiData = angular.copy(uiData);
                uiData.conditions = uiData.conditions || [{}];
                uiData.mode = uiData.mode || '&&';
                scope.conditions = uiData.conditions; //short name


                scope.$watch(
                    'filterDesc.uiData',
                    function(nv, ov){
                        if(angular.equals(ov, nv)) return;
                        scope.updateUiData();
                    },
                    true
                );

                scope.$watch(
                    'filterDesc.enabled',
                    scope.updateUiData,
                    true
                );

                scope.$watch(
                    'mustRunInDatabase',
                    scope.validateExpression
                );

                if (scope.filterUpdateCallback) {
                    scope.$watch('[filterDesc.expression, filterDesc.enabled, filterDesc.uiData]',
                        function(nv, ov){
                            if(angular.equals(ov, nv)) return;
                            scope.filterUpdateCallback(scope.filterDesc);
                        },
                        true
                    );
                }

                scope.filterDesc.$status = scope.filterDesc.$status || {}; //status is not saved on server

                if (scope.filterDesc.expression) {
                    scope.validateExpression();
                }
                scope.$watch('recipeStatus', function() {
                    // in case this filter is in a visual recipe, make sure to update the internal
                    // flags when the engine or something else changes
                    regenInternalFields();
                    //scope.revalidateExpression();
                },true);
            }
        };
    });

    app.directive('filterConditionsEditor', function(Expressions, Logger) {
        return {
            templateUrl : '/templates/recipes/fragments/filter-conditions-editor.html',
            restrict: 'AE',
            link : function(scope, element, attrs) {
                var mapToAttr = function(arr, attr) {
                    return arr.map(function(el){return el[attr]; });
                }
                var updateIfNotAllowed = function(currentValue, allowedValues, defaultValue) {
                    if (!allowedValues || !allowedValues.length) {
                        Logger.warn("WARNING: no allowedValues");
                        return defaultValue;
                    }
                    if (allowedValues.indexOf(currentValue) > -1) return currentValue;
                    if (defaultValue) return defaultValue;
                    return allowedValues[0];
                };

                scope.update = function(cond) {
                    cond.input = updateIfNotAllowed(cond.input, mapToAttr(scope.getColumns(), 'name'));
                    cond.col = updateIfNotAllowed(cond.col, mapToAttr(scope.getColumnsExcept(cond.input), 'name'));
                    var col = scope.getColumn(cond.input);
                    if (col) {
                        var tmp = cond.operator
                        var type = scope.getColumn(cond.input).type;
                        cond.operator = updateIfNotAllowed(
                            cond.operator,
                            mapToAttr(Expressions.getOperators(type), 'name'),
                            Expressions.getDefaultOperator(type)
                            );
                    }
                };

                scope.getColumn = function(name){
                    return scope.getColumns().find(col => col.name == name);
                };

                scope.populateWithDefaults = function(cond) {
                    var today = (new Date()).toISOString().split('T')[0];
                    if (scope.operatorHasParam(cond.operator, 'date')) {
                        cond.date = cond.date || today;
                        cond.time = cond.time || "00:00";
                    }
                    if (scope.operatorHasParam(cond.operator, 'date2')) {
                        cond.date2 = cond.date2 || today;
                        cond.time2 = cond.time2 || "00:00";
                    }
                }

                scope.getColumnGenericType = function(name) {
                    if (!name) return;
                    var col = scope.getColumns().find(col => col.name == name);
                    if (!col) return;
                    return Expressions.genericType(col.type);
                };

                scope.getColumnsExcept = function(name) {
                    return scope.getColumns().filter(col => col.name != name);
                };
                var opss = {}
                /* returns an array of operators that can act on a variable with specified type */
                scope.getOperators = function(type) {
                    if (type in opss) return opss[type]
                    opss[type] = Expressions.getOperators(type);
                    return opss[type]
                };

                scope.dateUnits = Expressions.dateUnits;
                var ocs = {};
                /* returns a list of String indicating the category (for now: "column" or "") */
                scope.getOperatorsCategories = function(type) {
                    if (type in ocs) return ocs[type]
                    ocs[type] = scope.getOperators(type).map(op => op.category || "");
                    return ocs[type]
                };

                scope.getOperator = function(name){
                    return Expressions.getOperators().find(op => op.name == name);
                };

                scope.operatorHasParam = function(operatorName, paramName){
                    if (!operatorName) return false;
                    return scope.getOperator(operatorName).params.includes(paramName);
                };

                scope.insert = function(index){
                    const newCondition = {num: 0};
                    scope.update(newCondition);
                    scope.conditions.push(newCondition);
                };

                scope.remove = function(index){
                    scope.conditions.splice(index, 1);
                };

                scope.intialiseAllData = function() {
                    scope.conditions.forEach(c => {
                        scope.update(c)
                    });
                }

                scope.$watch("hasSchema()", function(nv, ov) {
                    if (nv && nv!=ov && scope.filterDesc.enabled) {
                        scope.intialiseAllData();
                    }
                });

                scope.$watch("filterDesc.enabled", function(nv, ov) {
                    if (nv && scope.hasSchema()) {
                        scope.intialiseAllData();
                    }
                });
                scope.keyDownOnParam = function(event, index) {
                    if (event.keyCode == 13 && index+1 == scope.conditions.length) {
                        scope.insert(index+1);
                    }
                };

                scope.formatedColName = function(col) {
                    return col.name + ' ('+col.type+')';
                };
            }
        };
    });

    app.directive('filterCondition', function (Expressions) {
        return {
            restrict:'A',
            link: function($scope, element, attrs) {
                /*
                 * When changing filter condition's column (c.input), looking for an equivalent operator (c.operator)
                 * based on the current operator meaning or the current operator approximate equivalent meanings (as a fallback).
                 * Otherwise resetting it to default.
                 * example:
                 * - filter rule used to be 'DATE_COLUMN' is defined
                 * - user changes 'DATE_COLUMN' to 'STRING_COLUMN'
                 * - if we can find an operator with the same meaning as 'is defined' for string columns, then we update c.operator to it.
                 */
                $scope.$watch('c.input', function(nv, ov) {
                    if (nv !== undefined && ov !== undefined && nv != ov) {
                        let newType = $scope.getColumnGenericType(nv)
                        let newOperators = $scope.getOperators(newType);
                        let oldOperator = $scope.getOperators($scope.getColumnGenericType(ov)).find(o => o.name == $scope.c.operator);
                        $scope.c.operator = Expressions.getDefaultOperator(newType); // setting first as default in case we don't find an equivalence
                        if (oldOperator) {
                            let equivalentOperator;
                            //looking for exact equivalence
                            if (oldOperator.meaning) {
                                equivalentOperator = newOperators.find(o => o.meaning == oldOperator.meaning);
                            }
                            //looking for approximate equivalence
                            if (!equivalentOperator && oldOperator.approximateEquivalences) {
                                for (let i=0; i<oldOperator.approximateEquivalences.length; i++) {
                                    let approximateEquivalence = oldOperator.approximateEquivalences[i];
                                    equivalentOperator = newOperators.find(o => o.meaning == approximateEquivalence);
                                    if (typeof(equivalentOperator) !== 'undefined') {
                                        break;
                                    }
                                }
                            }
                            if (equivalentOperator) {
                                $scope.c.operator = equivalentOperator.name;
                            }
                        }
                    }
                })
            }
        }
    });

    app.directive('inputDateConversion', function ($timeout) {
        return {
            scope:false,
            restrict:'A',
            link: function($scope, element, attrs) {
                $scope.$watch(attrs.inputDateConversion, function(nv) {
                    if (nv == null) return;
                    var newVal = nv;
                    var curVal = $(element).val()
                    if (curVal == newVal) return;
                    var date = new Date();
                    date.setMilliseconds(0);
                    date.setSeconds(0);
                    date.setHours(0);
                    date.setMinutes(0);
                    date.setDate(parseInt(newVal.substring(8,10)));
                    date.setMonth(parseInt(newVal.substring(5,7))-1);
                    date.setFullYear(parseInt(newVal.substring(0,4)));
                    $scope[attrs.ngModel] = date
                    $(element).val(newVal);
                });
                $scope.$watch(attrs.ngModel, function(nv) {
                    if (nv == null) return;
                    var newVal = $(element).val()
                    var curVal = $scope.$eval(attrs.inputDateConversion);
                    if (curVal == newVal) return;
                    // timezone hell : use val() instead of getting the date
                    $scope.$eval(attrs.inputDateConversion + '="' + newVal + '"')
                });
            }
        };
    });

    app.directive('inputTimeConversion', function ($timeout) {
        return {
            scope:false,
            restrict:'A',
            link: function($scope, element, attrs) {
                $scope.$watch(attrs.inputTimeConversion, function(nv) {
                    if (nv == null) return;
                    var newVal = nv;
                    var curVal = $(element).val().substring(0,5)
                    if (curVal == newVal) return;
                    var date = new Date();
                    date.setMilliseconds(0);
                    date.setSeconds(0);
                    date.setHours(parseInt(newVal.substring(0,2)));
                    date.setMinutes(parseInt(newVal.substring(3,5)));
                    $scope[attrs.ngModel] = date;
                    $(element).val(newVal); // to avoid infinite digest
                    $timeout(function() {$(element).val(newVal);}); // because firefox likes to format time with full precision
                });
                $scope.$watch(attrs.ngModel, function(nv) {
                    if (nv == null) return;
                    var newVal = $(element).val().substring(0,5)
                    var curVal = $scope.$eval(attrs.inputTimeConversion);
                    if (curVal == newVal) return;
                    $scope.$eval(attrs.inputTimeConversion + '="' + newVal + '"')
                });
            }
        };
    });

    app.directive('inputFilterBlock', function (CreateModalFromTemplate) {
        return {
            templateUrl : '/templates/recipes/fragments/filter-management-block.html',
            restrict: 'AE',
            scope: {
                filter: '=',
                dataset: '=',
                schema: '=',
                recipeStatus: '=',
                onChange: '&',
                hideSqlFilter: '=',
                recipeVariables: '='
            },
            link : function(scope, element, attrs) {
                scope.showFilterModal = function() {
                    scope.filter = scope.filter || {};
                    var newScope = scope.$new();
                    newScope.dataset = scope.dataset;
                    newScope.schema = scope.schema;
                    newScope.filter = scope.filter;
                    newScope.recipeVariables = scope.recipeVariables;
                    CreateModalFromTemplate('/templates/recipes/fragments/filter-modal.html', newScope, null, function(newScope){
                        newScope.hideSqlFilter = scope.hideSqlFilter || false;
                    });
                };

                scope.ok = function() {
                    if (scope.onChange) {
                        scope.onChange();
                    }
                }
            }
        };
    });

    app.directive('inlineFilterEditor', function(DataikuAPI, $stateParams) {
        return {
            templateUrl : '/templates/widgets/inline-filter-editor-simple.html',
            scope: {
                filter: '=',
                dataset: '=',
                schema: '='
            },
            link : function(scope, element, attrs) {
                DataikuAPI.flow.recipes.generic.getVariables($stateParams.projectKey).success(function(data) {
                    scope.recipeVariables = data;
                }).error(setErrorInScope.bind(scope));
            }
        };
    });

    app.directive('grelReference', function (CachedAPICalls, $filter) {
        return {
            templateUrl : '/templates/widgets/grel-reference.html',
            link : function($scope, element, attrs) {
                CachedAPICalls.customFormulasReference.success(function(data) {
                    $scope.grelSyntax = [];
                    $scope.grelSyntax.push({type: 'Columns access', name:'column_name',unrealFunction:true, returns:'the value of a given cell', description:'column_name must be a valid identifier'});
                    $scope.grelSyntax.push({type: 'Columns access', name:'numval',params:'column', returns:'the numerical value of a given cell', description:''});
                    $scope.grelSyntax.push({type: 'Columns access', name:'strval',params:'column', returns:'the String value of a given cell', description:'strval returns an empty string for cells with no value.'});
                    $scope.grelSyntax.push({type: 'Columns access', name:'strval',params:'column, defaultValue', returns:'the String value of a given cell of defaultValue if the cell is empty', description:''});
                    $scope.grelSyntax.push({type: 'Columns access', name:'cells',params:'', isField:true, returns:'Returns a dictionary of cells of the current row', description:'Use cells["columnName"].value to access the value of a cell. This returns null for cells with no value'});
                    data.forEach(function(f) {
                        f.type = 'Functions';
                        $scope.grelSyntax.push(f);
                    });
                    $scope.refreshFilteredGrelFunctions();
                }).error(setErrorInScope.bind($scope));

                $scope.editing = {grelFilter : ''};
                $scope.refreshFilteredGrelFunctions = function() {
                    var filteredSyntax = $scope.grelSyntax;
                    $scope.filteredGrelFunctions = [];
                    if ( $scope.grelSyntax == null ) {
                        return;
                    }
                    if ( $scope.editing.grelFilter != null && $scope.editing.grelFilter.length > 0 ) {
                        filteredSyntax = $filter('filter')($scope.grelSyntax, $scope.editing.grelFilter);
                    }
                    // group by type
                    var lastGroup = null;
                    filteredSyntax.forEach(function(f) {
                        if ( lastGroup == null || lastGroup.name != f.type ) {
                            if ( lastGroup != null ) {
                                $scope.filteredGrelFunctions.push(lastGroup);
                            }
                            lastGroup = {name:f.type, functions:[]};
                        }
                        lastGroup.functions.push(f);
                    });
                    if ( lastGroup != null ) {
                        $scope.filteredGrelFunctions.push(lastGroup);
                    }

                };
                $scope.$watch('editing.grelFilter', function() {
                    $scope.refreshFilteredGrelFunctions();
                }, true);
            }
        };
    });
    app.directive('grelExamples', function (CachedAPICalls, $filter) {
        return {
            templateUrl : '/templates/widgets/grel-examples.html',
            link : function($scope, element, attrs) {
                // nothing here (yet?)
            }
        };
    });
    app.directive('grelReferenceAndExamples', function (CachedAPICalls, $filter) {
        return {
            templateUrl : '/templates/widgets/grel-reference-and-examples.html',
            link : function($scope, element, attrs) {
                // nothing here (yet?)
            }
        };
    });
    
    app.filter("filterNiceRepr", function(Expressions){
        function translateConds(input) {
            return input.uiData.conditions.map(function(cond){
                var op = Expressions.getOperatorByName(cond["operator"]);
                if (!op) return "Unknown op: " + cond["operator"];
                if (op.repr) return op.repr(cond);
                else return sanitize(JSON.stringify(cond));
            });
        }
        return function(input) {
            function anumLiteral(value) {
                return "<span class='alphanum-literal flex'>" + sanitize(value) + "</span>";
            }
            if (!input || !input.enabled || !input.uiData) return "No filter";

            if (input.uiData.mode == "&&") {
                var condStr = translateConds(input);
                if (condStr.length == 1) return condStr[0];
                else return condStr.map(function(x) { return "(" + x + ")"}).join(" AND ");
            } else if( input.uiData.mode == "||") {
                var condStr = translateConds(input);
                if (condStr.length == 1) return condStr[0];
                else return condStr.map(function(x) { return "(" + x + ")"}).join(" OR ");
            } else if (input.uiData.mode == "CUSTOM") {
                return "<span class='noflex'>Formula: </span>" + anumLiteral(input.expression);
            } else if (input.uiData.mode == "SQL") {
                return "<span class='noflex'>SQL: </span>" + anumLiteral(input.expression);
            }
        }
    });
})();
