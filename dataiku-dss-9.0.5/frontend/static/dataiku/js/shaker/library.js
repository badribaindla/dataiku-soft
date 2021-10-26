 /* Shaker support functions for processors library */

function StepIAE(message) {
    this.message = message;
    this.name = "StepIAE";
}
StepIAE.prototype = new Error;

(function(){
'use strict';


if (!String.prototype.format) {
    String.prototype.format = function() {
        var formatted = this;
        for(var arg in arguments) {
            formatted = formatted.replace("{" + arg + "}", arguments[arg]);
        }
        return formatted;
    };
}


function truncate(str, len) {
    /**
     * Truncate a string to make sure it takes at most
     * n characters.
     * Whenever possible truncates on special chars.
     *
     * If str is not a string, returns str unchanged.
     */
    if ((typeof str !== "string") || (str.length <= len)) {
        return str;
    }

    var cutOn = /[ ,\.,;\-\\\"\n\?\!\|]/g
    var truncated = str.substring(0, len-1);
    var lastSeparatorIdx = regexLastIndexOf(cutOn, truncated);

    // we don't want to cut more too much.
    if (lastSeparatorIdx > len / 2) {
        truncated = str.substring(0, lastSeparatorIdx);
    }
    return truncated + '…';
}


function hasNonEmptyParam(params, key){
    switch (typeof params[key]) {
        case 'undefined': return false;
        case 'string':    return params[key].length > 0;
        default:          return true;
    }
}

function hasAll(params, values) {
    for (var vidx in values) {
        if (!hasNonEmptyParam(params, values[vidx])) return false;
    }
    return true;
}

function inColName(value) {
    return "<span class=\"input-column-name\">" + sanitize(value) + "</span>";
}
function outColName(value) {
    return "<span class=\"output-column-name\">" + sanitize(value) + "</span>";
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
function actionVerb(value) {
    return "<span class=\"action-verb\">" + sanitize(value) + "</span>";
}
function meaningName(value) {
    return "<span class=\"meaning-label\">" + sanitize(value) + "</span>";
}

// strong param value
function strongify(value) {
    return "<strong>" + value + "</strong>";
}

// Boolean param value
function toBoolean(value) {
    return value == true || value == "true";
}


function isBlank(x) {
    return x == null|| x.length === 0;
}

function checkDate(d, name) {
    var match = /^(?:[1-9]\d{3}-(?:(?:0[1-9]|1[0-2])-(?:0[1-9]|1\d|2[0-8])|(?:0[13-9]|1[0-2])-(?:29|30)|(?:0[13578]|1[02])-31)|(?:[1-9]\d(?:0[48]|[2468][048]|[13579][26])|(?:[2468][048]|[13579][26])00)-02-29)(T(?:[01]\d|2[0-3])(:[0-5]\d:[0-5]\d(\.\d{3})?)?(?:Z|[+-][01]\d:[0-5]\d)?)?$/
    if (!(match.exec(d))) {
        throw new StepIAE("Invalid " + name);
    }
}

function appliesToCheckValid(params) {
    if (!params["appliesTo"]) throw new StepIAE("'Applies to' mode not selected");

    switch (params["appliesTo"]) {
        case "SINGLE_COLUMN":
            if (params.columns  == null || params.columns.length == 0 || params.columns[0] == null || params.columns[0].length == 0) {
                throw new StepIAE("Column not specified");
            }
            break;
        case "COLUMNS":
            // Let's say that 0 column is ok;
            break;
        case "PATTERN":
            if (params.appliesToPattern == null || params.appliesToPattern.length == 0) {
                throw new StepIAE("Pattern not specified");
            }
            break;
        default:
            break;
    }
}

function flagCheckValid(params) {
    if (!params["flagColumn"]) throw new StepIAE("Flag output column not selected");
}

function appliesToDescription(params) {
    switch (params["appliesTo"]) {
        case "SINGLE_COLUMN":
            return inColName(sanitize(params["columns"][0]));
        case "COLUMNS":
            if (params["columns"].length > 4) {
                return "{0} columns".format(strongify(params["columns"].length));
            } else {
                return "column{0} {1}".format(
                    params["columns"].length > 1 ? "s" : "",
                    params["columns"].map(sanitize).map(inColName).join(", "),
                    strongify(sanitize(params["columns"]))
                 );
            }
        case "PATTERN":
            return "columns matching /{0}/".format(anumLiteral(params["appliesToPattern"]));
        case "ALL":
            return strongify("all") + " columns";
    }
}

function checkAppliesToParams(params) {
    switch (params["appliesTo"]) {
        case "SINGLE_COLUMN":
            return !!params["columns"] && params["columns"].length && params["columns"][0] != "";
        case "COLUMNS":
            return !!params["columns"] && params["columns"].length;
        case "PATTERN":
            return !!params["appliesToPattern"];
        case "ALL":
            return true;
        default:
            return false;
    }
}

function comaList(items, foreach, lastSeparator) {
    if (items.length == 1) {
        return foreach(sanitize(items[0]))
    }

    return items.slice(0, items.length-1).map(sanitize).map(foreach).join(', ')
    + " " + lastSeparator + " " +
     foreach(sanitize(items[items.length-1]))
}

function filterAndFlagDescription(params, condition) {
    switch (params["action"]) {
        case "KEEP_ROW":
            return actionVerb("Keep") + " rows where " + condition.replace("{col}", appliesToDescription(params));
        case "REMOVE_ROW":
            return actionVerb("Remove") + " rows where " + condition.replace("{col}", appliesToDescription(params));
        case "CLEAR_CELL":
            return actionVerb("Clear") + " cells in " + appliesToDescription(params) + " if " + condition.replace("{col}", "value");
        case "DONTCLEAR_CELL":
            return actionVerb("Keep") + " cells in " + appliesToDescription(params) + " only if " + condition.replace("{col}", "value");
        case "FLAG":
            return actionVerb("Flag") + " rows where " + condition.replace("{col}", appliesToDescription(params));
        default:
            return false;
    }
}

function filterAndFlagSingleDescription(params, condition) {
    switch (params["action"]) {
        case "KEEP_ROW":
            return actionVerb("Keep") + " rows where " + condition;
        case "REMOVE_ROW":
            return actionVerb("Remove") + " rows where " + condition;
        case "CLEAR_CELL":
            return actionVerb("Clear") + " cells in " + params.clearColumn + " if " + condition;
        case "DONTCLEAR_CELL":
            return actionVerb("Keep") + " cells in " + params.clearColumn + " only if " + condition;
        case "FLAG":
            return actionVerb("Flag") + " rows where " + condition;
        default:
            return false;
    }
}

function filterAndFlagImpactVerb(params){
    if (params.action == "REMOVE_ROW" || params.action == "KEEP_ROW") {
        return "deleted";
    } else {
        return "modified"
    }
}




var app = angular.module('dataiku.shaker.library', ['dataiku.filters', 'platypus.utils']);



app.factory("ShakerProcessorsInfo", function($filter, Fn, Assert) {

    function fmtMeaningLabel(x){
        return meaningName($filter("meaningLabel")(x));
    }

    var svc = {};

    svc.map = {
    "CurrencySplitter": {
        description: function(type, params){
            if (!hasAll(params, ["inCol"])) return null;
            return actionVerb("Split") + " {0} between currency and amount".format(inColName(params.inCol));
        },
        icon: 'icon-cut'
    },
    "ColumnSplitter": {
        description: function(type, params){
            if (!hasAll(params, ["inCol", "separator"])) return null;
            return actionVerb("Split") + " {0} on {1}".format(inColName(params.inCol), anumLiteral(params.separator));
        },
        icon: 'icon-cut'
    },
    "FindReplace": {
        checkValid : function(params) {
            appliesToCheckValid(params);
        },
        description: function(type, params){
            if (!hasAll(params, ["matching", "normalization"]) || !checkAppliesToParams(params)) return null;
            if(!params.mapping){
                params.mapping = [];
            }
            var nbReplaces = Object.keys(params.mapping).length;
            if(nbReplaces === 1){
                var key = (params.mapping[0].from);
                var value = (params.mapping[0].to);
                return actionVerb("Replace") + " {0} by {1} in {2}".format(
                    anumLiteral(key), anumLiteral(value), appliesToDescription(params));
            } else {
                return "{0} {1} values in {2}".format(
                    actionVerb("Replace"), numLiteral(nbReplaces), appliesToDescription(params));
            }
        },
        icon: 'icon-edit',
    },
    "MatchCounter": {
        description: function(type, params){
            if (!hasAll(params, ["inCol", "outCol", "pattern", "normalizationMode", "matchingMode"])) return null;

            var pattern = (params.matchMode == 2) ? "/" + params.pattern + "/" : params.pattern;
            return "{0} number of occurrences of {1} in {2}".format(
                    actionVerb("Count"), pattern, inColName(params.inCol));
        },
        icon: 'icon-search',
    },
    "MeaningTranslate": {
        checkValid : function(params) {
            appliesToCheckValid(params);
        },
        description: function(type, params){
            if (!hasAll(params, ["meaningId"]) || !checkAppliesToParams(params)) return null;

            return actionVerb("Replace") + " values in {0} using meaning {1}".format(appliesToDescription(params), strongify(params.meaningId));
        },
        icon: 'icon-edit',
    },
    "ColumnReorder": {
        description: function(type, params){
            if (!checkAppliesToParams(params)) {
                return null;
            }
            let result = actionVerb("Move") + " " + appliesToDescription(params);
            switch (params.reorderAction) {
                case "AT_START":
                    result += " at beginning";
                    break;
                case "AT_END":
                    result += " at end";
                    break;
                case "BEFORE_COLUMN":
                    result += " before " + inColName(isBlank(params.referenceColumn) ? "'missing'" : params.referenceColumn);
                    break;
                case "AFTER_COLUMN":
                    result += " after " + inColName(isBlank(params.referenceColumn) ? "'missing'" : params.referenceColumn);
                    break;
            }
            return result;
        },
        icon: 'icon-reorder',
    },
    "ColumnRenamer": {
        description: function(type, params){
            if (!hasAll(params, ["renamings"])) return null;
            if (params["renamings"].length == 1) {
                var inCol = params["renamings"][0].from;
                var outCol = params["renamings"][0].to;
                return actionVerb("Rename") + " column '{0}' to '{1}'".format(inColName(inCol), inColName(outCol));
            } else {
                return actionVerb("Rename") + " {0} columns".format(numLiteral(params["renamings"].length));
            }
        },
        icon: 'icon-edit',
    },
    "TextSimplifierProcessor": {
        description: function(type, params){
            if (!hasAll(params, ["inCol"])) return null;
            return "{0} text in {1}".format(actionVerb("Simplify"), inColName(params.inCol));
        },
        icon: 'icon-edit',
    },
    "Tokenizer": {
        description: function(type, params){
            if (!hasAll(params, ["inCol"])) return null;
            var inCol = inColName(params["inCol"]);
            if(params.operation == "TO_JSON"){
                return actionVerb("Tokenize") + " column {0} into JSON".format(inCol);
            } else if(params.operation == "FOLD"){
                return actionVerb("Tokenize") + " column {0} and fold tokens (one per row)".format(inCol);
            } else if(params.operation == "SPLIT"){
                return actionVerb("Tokenize") + " column {0} and split tokens (one per column)".format(inCol);
            }
        },
        icon: 'icon-cut',
    },
    "NGramExtract": {
        description: function(type, params){
            if (!hasAll(params, ["inCol"])) return null;
            var inCol = inColName(params["inCol"]);
            var op = params["operation"];
            if(op == "TO_JSON"){
                return actionVerb("Extract ngrams") + " from column {0} into JSON".format(inCol);
            } else if(op == "FOLD"){
                return actionVerb("Extract ngrams") + " from column {0} and fold them (one per row)".format(inCol);
            } else if(op == "SPLIT"){
                return actionVerb("Extract ngrams") + " from column {0} and split them (one per column)".format(inCol);
        }
        },
        icon: 'icon-beaker',
    },
    "ExtractNumbers": {
        description: function(type, params){
            if (!hasAll(params, ["input"])) return null;
            if(toBoolean(params["multipleValues"])){
                return actionVerb("Extract numbers")+ " from {0}".format(inColName(params.input));
            } else {
                return actionVerb("Extract a number")+" from {0}".format(inColName(params.input));
            }
        },
        icon: 'icon-beaker',
    },
    "NumericalFormatConverter": {
        description: function(type, params){
            var formats = { RAW: "Raw", EN: "English", FR: "French", IT: "Italian", GE: "German" };
            if (!hasAll(params, ["inFormat", "outFormat"]) || !checkAppliesToParams(params)) return null;
            return actionVerb("Convert number formats") + " from {0} to {1} in {2}".format(
                formats[params['inFormat']], formats[params['outFormat']], appliesToDescription(params));
        },
        icon: 'icon-superscript',
    },
    "TypeSetter": {
        description: function(type, params){
            if (!hasAll(params, ["column", "type"])) return null;
            var column = strongify(sanitize(params["column"]));
            var typeloc = sanitize(params["type"]);
            var typestr = strongify(typeloc);
            return "Set meaning of {0} to {1}".format(column, typestr);
        },
        icon: 'icon-edit',
        postLinkFn : function(scope, element) {
            if (angular.isUndefined(scope.step.params.type)) {
                scope.step.params.type = "Text";
            }
        }
    },
    "StringTransformer" : {
        checkValid : function(params) {
            appliesToCheckValid(params);
            if (!params.mode) {
                throw new StepIAE("Mode not specified");
            }
        },
        description : function(type, params) {
            if (!hasAll(params, ["mode"]) || !checkAppliesToParams(params)) return null;
            var mode = actionVerb(params["mode"]);
            return "Perform {0} on {1}".format(mode.toLowerCase(), appliesToDescription(params));
        },
        postLinkFn : function(scope, element) {
            if (angular.isUndefined(scope.step.params.mode) && !scope.step.params.noMode) {
                scope.step.params.mode = "TO_LOWER";
            }
        },
        icon : 'icon-edit'
    },
    "ColumnsConcat" : {
        description : function(type, params) {
             if (!hasAll(params, ["outputColumn"])) return null;
            return actionVerb("Concatenate") + " columns in {0}".format(outColName(params.outputColumn));
        },
        icon : 'icon-resize-small'
    },
    "ArrayExtractProcessor" : {
        description : function(type, params) {
             if (!hasAll(params, ["input"])) return null;

            if (params.mode == "INDEX") {
                return actionVerb("Extract") + " elt {0} from {1}".format(
                    numLiteral(params.index), inColName(params.input))
            } else {
                return actionVerb("Extract") + " elts {0}-{1} from {2}".format(
                    numLiteral(params.begin), numLiteral(params.end), inColName(params.input))
            }
        },
        icon : 'icon-external-link'

    },
    "ArraySortProcessor" : {
        description : function(type, params) {
             if (!hasAll(params, ["input"])) return null;
            return actionVerb("Sort") + " array in {0}".format(inColName(params.input));
        },
        icon : 'icon-sort-by-attributes'
    },

    "ColumnsSelector": {
        checkValid : function(params) {
            appliesToCheckValid(params);
        },
        description: function(type, params){
            if (!checkAppliesToParams(params)) return null;
            return "{0} {1}".format(toBoolean(params["keep"]) ? actionVerb("Keep only") : actionVerb("Remove"), appliesToDescription(params));
        },
        icon: 'icon-filter',
    },
    "FilterOnValue": {
        description: function(type, params){
            if (!hasAll(params, ["matchingMode", "values"]) || !checkAppliesToParams(params) || params["values"].length == 0) return null;
            var mm = params["matchingMode"];
            if (mm == null) mm = "FULL_STRING";
            var mmm = mm == "FULL_STRING" ? "is" : (mm == "SUBSTRING" ? "contains" : "matches");

            var condition = "{col} {0} {1}".format(mmm, anumLiteral(truncate(comaList(params["values"], Fn.SELF, 'or'), 60)));

            return filterAndFlagDescription(params, condition);
        },
        impactVerb : filterAndFlagImpactVerb,
        icon: 'icon-trash',
    },
    "FlagOnValue": {
        checkValid : function(params) {
            appliesToCheckValid(params);
            flagCheckValid(params);
        },
        description: function(type, params){
            if (!hasAll(params, ["matchingMode", "values", "flagColumn"]) || params["values"].length == 0) return null;
            var mm = params["matchingMode"];
            if (mm == null) mm = "FULL_STRING";
            var mmm = mm == "FULL_STRING" ? "is" : (mm == "SUBSTRING" ? "contains" : "matches");

            var condition = "{col} {0} {1}".format(mmm, comaList(params["values"], anumLiteral, 'or'));

            return filterAndFlagDescription(params, condition);
        },
        impactVerb : filterAndFlagImpactVerb,
        icon: 'icon-flag',
    },
    "FilterOnNumericalRange": {
        checkValid : function(params) {
            appliesToCheckValid(params);
            if (params["min"]==undefined && params["max"]==undefined) {
                throw new StepIAE("Bounds are not defined");
            }
        },
        description: function(type, params){
            var condition = (
                    ((params["min"]!=undefined)?" {0} &le;":"")
                     + " {col} "
                    + ((params["max"]!=undefined)?" &le; {1}":"")
                ).format(numLiteral(params["min"]), numLiteral(params["max"]));

            return filterAndFlagDescription(params, condition);
        },
        impactVerb : filterAndFlagImpactVerb,
        icon: 'icon-trash',
    },
    "FlagOnNumericalRange": {
        checkValid : function(params) {
            appliesToCheckValid(params)
            flagCheckValid(params);
            if (params["min"]==undefined && params["max"]==undefined) {
                throw new StepIAE("Bounds are not defined");
            }
        },
        description: function(type, params){
            var condition = (
                    ((params["min"]!=undefined)?" {0} &le;":"")
                    + " {col} "
                    + ((params["max"]!=undefined)?" &le; {1}":"")
                 ).format(numLiteral(params["min"]), numLiteral(params["max"]));

            return filterAndFlagDescription(params, condition);
        },
        impactVerb : filterAndFlagImpactVerb,
        icon: 'icon-flag',
    },
    "FilterOnDate": {
        checkValid : function(params) {
            appliesToCheckValid(params);
        },
        description: function(type, params){
            const partLabels = {YEAR:"Year", QUARTER_OF_YEAR:"Quarter", WEEK_OF_YEAR: "Week", MONTH_OF_YEAR:"Month", DAY_OF_MONTH:"Day of month", DAY_OF_WEEK: "Day of week", HOUR_OF_DAY:"Hour", INDIVIDUAL:"Individual dates"};
            const relativePartsLabel = {YEAR:"year", QUARTER_OF_YEAR:"quarter", WEEK_OF_YEAR: "week", MONTH_OF_YEAR:"month", DAY_OF_MONTH:"day", HOUR_OF_DAY:"hour"};
            let condition = "";
            switch (params['filterType']) {
                case 'RANGE':
                    condition = " - no bounds selected.";
                    if (!params["min"] && params["max"]) {
                        condition = "{col} before {0}".format(
                            numLiteral(convertDateFromTimezone(new Date(params["max"]), params["timezone_id"]).toISOString())
                        );
                    } else if (params["min"] && !params["max"]) {
                        condition = "{col} after {0}".format(
                            numLiteral(convertDateFromTimezone(new Date(params["min"]), params["timezone_id"]).toISOString())
                        );
                    } else if (params["min"] && params["max"]) {
                        condition = "{col} between {0} and {1}".format(
                            numLiteral(convertDateFromTimezone(new Date(params["min"]), params["timezone_id"]).toISOString()),
                            numLiteral(convertDateFromTimezone(new Date(params["max"]), params["timezone_id"]).toISOString())
                        );
                    }
                    return filterAndFlagDescription(params, condition);

                case 'RELATIVE':
                    if (params["option"] && params["option"] === "THIS") {
                        if (params["part"] === 'HOUR_OF_DAY') {
                            condition = "{col} is today within this hour";
                        } else if (params["part"] === 'DAY_OF_MONTH') {
                            condition = "{col} is today";
                        } else {
                            condition = "{col} is in this {0}".format(relativePartsLabel[params["part"]]);
                        }
                    } else if (params["option"] && params["option"] === "LAST") {
                        if (params["relativeMin"] > 1) {
                            condition = "{col} is within the last {0} {1}s".format(numLiteral(params["relativeMin"]), relativePartsLabel[params["part"]]);
                        } else {
                            condition = "{col} is within the last {0}".format(relativePartsLabel[params["part"]]);
                        }
                    } else if (params["option"] && params["option"] === "NEXT") {
                        if (params["relativeMax"] > 1) {
                            condition = "{col} is within the next {0} {1}s".format(numLiteral(params["relativeMax"]), relativePartsLabel[params["part"]]);
                        } else {
                            condition = "{col} is within the next {0}".format(relativePartsLabel[params["part"]]);
                        }
                    } else if (params["option"] && params["option"] === "TO") {
                        condition = "{col} is between the beginning of this {0} and now".format(relativePartsLabel[params["part"]]);
                    }
                    return filterAndFlagDescription(params, condition);

                case 'PART':
                    condition = " - no part selected.";
                    if (params["part"] && params["values"] && params["values"].length > 0) {
                        if (params["part"] === 'INDIVIDUAL') {
                            condition = "{col} with {0}".format(partLabels[params["part"]]);
                        } else {
                            condition = "{col} with {0} in {1}".format(partLabels[params["part"]], params["values"]);
                        }
                    }
                    return filterAndFlagDescription(params, condition);
            }
        },
        impactVerb : filterAndFlagImpactVerb,
        icon: 'icon-trash',
    },
    "FlagOnDate": {
        checkValid : function(params) {
            appliesToCheckValid(params);
        },
        description: function(type, params){
            const partLabels = {YEAR:"Year", QUARTER_OF_YEAR:"Quarter", MONTH_OF_YEAR:"Month", DAY_OF_MONTH:"Day", HOUR_OF_DAY:"Hour"};
            let condition = "";
            switch (params['filterType']) {
                case 'RANGE':
                    condition = " - no bounds selected.";
                    if (!params["min"] && params["max"]) {
                        condition = "{col} before {0}".format(
                            numLiteral(convertDateFromTimezone(new Date(params["max"]), params["timezone_id"]).toISOString())
                        );
                    } else if (params["min"] && !params["max"]) {
                        condition = "{col} after {0}".format(
                            numLiteral(convertDateFromTimezone(new Date(params["min"]), params["timezone_id"]).toISOString())
                        );
                    } else if (params["min"] && params["max"]) {
                        condition = "{col} between {0} and {1}".format(
                            numLiteral(convertDateFromTimezone(new Date(params["min"]), params["timezone_id"]).toISOString()),
                            numLiteral(convertDateFromTimezone(new Date(params["max"]), params["timezone_id"]).toISOString())
                        );
                    }
                    return filterAndFlagDescription(params, condition);

                case 'RELATIVE':
                    if (params["option"] && params["option"] === "THIS") {
                        condition = "{col} with {0} same as current".format(partLabels[params["part"]]);
                    } else if (params["option"] && params["option"] === "LAST") {
                        condition = "{col} with {0} within last {1}".format(partLabels[params["part"]], numLiteral(params["relativeMin"]));
                    } else if (params["option"] && params["option"] === "NEXT") {
                        condition = "{col} with {0} within next {1}".format(partLabels[params["part"]], numLiteral(params["relativeMax"]));
                    } else if (params["option"] && params["option"] === "TO") {
                        condition = "{col} with {0} to date".format(partLabels[params["part"]]);
                    }
                    return filterAndFlagDescription(params, condition);

                case 'PART':
                    condition = " - no part selected.";
                    if (params["part"] && params["values"] && params["values"].length > 0) {
                        condition = "{col} with {0} in {1}".format(partLabels[params["part"]], params["values"]);
                    }
                    return filterAndFlagDescription(params, condition);
            }
        },
        impactVerb : filterAndFlagImpactVerb,
        icon: 'icon-flag',
    },
    "FilterOnDateRange": {
        checkValid : function(params) {
            appliesToCheckValid(params);
            if(params["max"]) checkDate(params["max"], "upper-bound date");
            if(params["min"]) checkDate(params["min"], "lower-bound date");
            if(!(params["max"] || params["min"])){
                    throw new StepIAE("Input at least one date bound.");
            }
        },
        description: function(type, params){
            var condition = " - no bounds selected.";
            if(!params["min"] && params["max"]){
                condition = "{col} before {0}".format(numLiteral(params["max"]));
            } else if(params["min"] && !params["max"]){
                condition = "{col} after {0}".format(numLiteral(params["min"]));
            } else if(params["min"] && params["max"]){
                condition = "{col} between {0} and {1}".format(numLiteral(params["min"]),numLiteral(params["max"]));
            }
            return filterAndFlagDescription(params, condition);
        },
        impactVerb : filterAndFlagImpactVerb,
        icon: 'icon-trash',
    },
    "FlagOnDateRange": {
        checkValid : function(params) {
            appliesToCheckValid(params);
            flagCheckValid(params);
            if(!(params["max"] || params["min"])){
                throw new StepIAE("Input at least one date bound.");
            }
            if(params["max"]) checkDate(params["max"], "upper-bound date");
            if(params["min"]) checkDate(params["min"], "lower-bound date");
        },
        description: function(type, params){
            var condition = "- no bounds selected.";
                if(!params["min"] && params["max"]){
                    condition = "{col} before {0}".format(numLiteral(params["max"]));
                } else if(params["min"] && !params["max"]){
                    condition = "{col} after {0}".format(numLiteral(params["min"]));
                } else if(params["min"] && params["max"]){
                    condition = "{col} between {0} and {1}".format(numLiteral(params["min"]),numLiteral(params["max"]));
                }
            return filterAndFlagDescription(params, condition);
        },
        impactVerb : filterAndFlagImpactVerb,
        icon: 'icon-flag',
    },
    "FilterOnCustomFormula" :{
        checkValid : function(params) {
            if (isBlank(params.expression)) throw new StepIAE("Expression not specified");
            if (params.action == "CLEAR_CELL" || params.action == "DONTCLEAR_CELL") {
                if (isBlank(params.clearColumn)){
                    throw new StepIAE("Column to clear not specified")
                }
            }
        },
        description : function(type, params) {
            var cond = params.expression.length > 20 ? "formula is true" : anumLiteral(params.expression)
            return filterAndFlagSingleDescription(params, cond);
        },
        impactVerb : filterAndFlagImpactVerb,
        icon : "icon-trash"
    },
    "FlagOnCustomFormula" : {
        checkValid : function(params) {
            if (isBlank(params.expression)) throw new StepIAE("Expression not specified");
            if (isBlank(params.flagColumn)){
                throw new StepIAE("Column to flag not specified")
            }
        },
        description : function(type, params) {
            var cond = params.expression.length > 20 ? "formula is true" : anumLiteral(params.expression)
            return filterAndFlagSingleDescription(params, cond);
        },
        impactVerb : filterAndFlagImpactVerb,
        icon : "icon-flag"
    },

    /* Cleansing */
    "FilterOnBadType": {
        description: function(type, params){
            if (!hasAll(params, ["type"]) || !checkAppliesToParams(params)) return null;
            return filterAndFlagDescription(params, "{col} is not a valid {0}".format(fmtMeaningLabel(params["type"])));
        },
        icon: 'icon-trash',
        impactVerb : filterAndFlagImpactVerb,
        postLinkFn : function(scope, element) {
            if (angular.isUndefined(scope.step.params.type)) {
                scope.step.params.type = "Text";
            }
        }
    },
    "FlagOnBadType": {
        checkValid : function(params){
            appliesToCheckValid(params);
            flagCheckValid(params);
        },
        description: function(type, params){
            if (!hasAll(params, ["type", "flagColumn"]) || !checkAppliesToParams(params)) return null;
            return filterAndFlagDescription(params, "{col} is not a valid {0}".format(fmtMeaningLabel(params["type"])));
        },
        icon: 'icon-flag',
        impactVerb : filterAndFlagImpactVerb,
        postLinkFn : function(scope, element) {
            if (angular.isUndefined(scope.step.params.type)) {
                scope.step.params.type = "Text";
            }
        }
    },
    "RemoveRowsOnEmpty": {
        description: function(type, params){
            if (!checkAppliesToParams(params)) return  null;
            if(params["keep"]) {
                return actionVerb("Keep") + " rows with empty values in {0}".format(appliesToDescription(params)); //TODO: unclear ?
            } else {
                return actionVerb("Remove") + " rows with empty values in {0}".format(appliesToDescription(params));
            }
        },
        impactVerb : Fn.cst("deleted"),
        icon: 'icon-trash',
    },
    "FillEmptyWithValue": {
        checkValid : function(params) {
            appliesToCheckValid(params);
        },
        description: function(type, params){
            if (!hasAll(params, ["value"]) || !checkAppliesToParams(params)) return null;
            return actionVerb("Fill empty") +" cells of {0} with '{1}'".format(appliesToDescription(params), anumLiteral(truncate(params["value"],60)));
        },
        impactVerb : Fn.cst("filled"),
        icon: 'icon-circle',
    },
    "FillEmptyWithComputedValue": {
        checkValid : function(params) {
            appliesToCheckValid(params);
        },
        description: function(type, params){
            if (!hasAll(params, ["mode"]) || !checkAppliesToParams(params)) return null;
            return actionVerb("Impute missing values ") +" of {0} with {1}".format(appliesToDescription(params), strongify(params["mode"]));
        },
        impactVerb : Fn.cst("filled"),
        icon: 'icon-circle',
    },
    "SplitInvalidCells" : {
        description : function(type, params) {
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Move invalid") + " cells of {0} to {1}".format(inColName(params["column"]), outColName(params["invalidColumn"]));
        },
        impactVerb : Fn.cst("splitted"),
        icon : 'icon-cut'
    },
    "UpDownFiller" : {
        description : function(type, params) {
            if (!params.columns || params.columns.length < 1) return null;
            return actionVerb("Fill empty") +" cells of {0} with {1} value".format(inColName(params["columns"]),
                    toBoolean(params["up"]) ? "next" : "previous");
        },
        impactVerb : Fn.cst("filled"),
        icon : 'icon-circle'
    },
    "LongTailGrouper" : {
        description : function(type, params) {
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Merge") + " long-tail values in {0}".format(inColName(params["column"]));
        },
        impactVerb : Fn.cst("merged"),
        icon: 'icon-resize-small'
    },
    "ComputeNTile" : {
        checkValid : function(params) {
            appliesToCheckValid(params);
        },
        description: function(type, params){
            if (!hasAll(params, ["n"]) || !checkAppliesToParams(params)) return null;
            return actionVerb("Compute quantile") +" of {0} with {1} bins".format(appliesToDescription(params), strongify(params["n"]));
        },
        impactVerb : Fn.cst("filled"),
        icon: 'icon-circle'
    },
    "MergeLongTailValues" : {
        checkValid : function(params) {
            appliesToCheckValid(params);
        },
        description: function(type, params){
            if (!hasAll(params, ["thresholdMode", "replacementValue"]) || !checkAppliesToParams(params)) return null;
            return actionVerb("Replace long tail") +" of {0} with {1}".format(appliesToDescription(params), strongify(params["replacementValue"]));
        },
        impactVerb : Fn.cst("filled"),
        icon: 'icon-circle'
    },

    /* Types */
    "QueryStringSplitter": {
        description: function(type, params){
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Split") + " HTTP Query string in {0}".format(inColName(params["column"]));
        },
        icon: 'icon-cut',
    },
    "URLSplitter": {
        description: function(type, params){
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Split") +" URL in {0}".format(inColName(params["column"]));
        },
        icon: 'icon-cut',
    },
    "EmailSplitter": {
        description: function(type, params){
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Split") +" email in {0}".format(inColName(params["column"]));
        },
        icon: 'icon-cut',
    },
    "VisitorIdGenerator" : {
        description : function(type, params) {
            if (!hasAll(params, ["outputColumn"])) return null;
            return actionVerb("Generate") +" visitor-id in {0}".format(outColName(params["outputColumn"]));
        },
        icon : 'icon-beaker'
    },

    "RegexpExtractor": {
        description: function(type, params){
            if (!hasAll(params, ["column","pattern"])) return null;
            return actionVerb("Extract") +" from {0} with {1}".format(inColName(params.column), anumLiteral(params.pattern));
        },
        icon: 'icon-beaker',
    },

    "UserAgentClassifier": {
        description: function(type, params){
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Classify") +" User-Agent in {0}".format(inColName(params.column));
        },
        icon: 'icon-laptop',
    },

    "UseRowAsHeader": {
        description: function(type, params){
            if (!hasAll(params, ["rowIdx"])) return null;
            return "Use row {0}'s values as column names".format(strongify(sanitize(params["rowIdx"])));
        },
        icon: 'icon-list-ol',
    },

    /* Basic */

    "JSONPathExtractor" : {
        description : function(type, params) {
            if (!hasAll(params, ["inCol"])) return null;
            return actionVerb("Extract") + " from {0] with JSONPath {1}".format(
                inColName(params.inCol),
                anumLiteral(truncate(params.expression, 60)));
        },
        icon: 'icon-beaker',
    },
    // TODO : URL Classifier

    /* Time */
    "DateParser": {
        checkValid: appliesToCheckValid,
        description: function(type, params){
            if (!hasAll(params, ["formats"]) || !checkAppliesToParams(params)) return null;
            return actionVerb("Parse date") +" in {0}".format(appliesToDescription(params));
        },
        icon: 'icon-calendar',
    },

    "DateIncrement": {
        checkValid : function(params) {
            if (params["incrementBy"] !== 'STATIC' && params["valueCol"] === undefined) {
                throw new StepIAE("Value column is not defined");
            }
        },
        description: function (type, params) {
            if (!hasAll(params, ["inCol"])) return null;
            const partLabels = { DAY: "days" ,WEEK: "weeks", MONTH: "month", QUARTER: "quarters", YEAR: "years"};
            if(params["incrementBy"] === 'STATIC') {
                const verb = params["increment"] > -1 ? actionVerb("Increment") : actionVerb("Decrement");
                return (verb + " date in {0} by {1} {2}".format(inColName(params["inCol"]), Math.abs(params["increment"]), partLabels[params["datePart"]]));
            }
            if(params["valueCol"] === undefined) {
                return null;
            }
            return (actionVerb("Increment") + " date in {0} by {1} {2}".format(inColName(params["inCol"]), inColName(params["valueCol"]), partLabels[params["datePart"]]));
        },
        icon: "icon-calendar",
    },

    "DateTruncate": {
        description: function (type, params) {
            if (!hasAll(params, ["inCol", "datePart"])) return null;
            const in1 = inColName(params["inCol"]);
            const in2 = anumLiteral(params["datePart"].toLowerCase());
            return (actionVerb("Truncate") + " {0} on {1}".format(in1, in2));
        },
        icon: "icon-calendar",
    },

    "DateFormatter": {
        description: function(type, params){
            if (!hasAll(params, ["inCol"])) return null;
            return actionVerb("Format date") + " in {0}".format(inColName(params["inCol"]));
        },
        icon: 'icon-calendar',
    },

    "DateDifference": {
        checkValid : function(params) {
            if(params.compareTo === "DATE"){
                if(!params.refDate){
                    throw new StepIAE("No date specified")
                } else {
                     checkDate(params.refDate)
                }
            } else if (params.compareTo == "COLUMN") {
                if (!params.input2) {
                    throw new StepIAE("No column specified")
                }
            }
         },
        description: function(type, params){
            if (!hasAll(params, ["input1", "output", "outputUnit", "compareTo"])) return null;
            var in1 =inColName(params["input1"]);
            var in2 =inColName(params["input2"]);
            if(params.compareTo === "NOW"){
                return actionVerb("Compute time difference") + " between {0} and now".format(in1);
            } else if(params.compareTo === "COLUMN"){
                return actionVerb("Compute time difference") + " between {0} and {1}".format(in1, in2);
            } else if(params.compareTo === "DATE"){
                return actionVerb("Compute time difference") + " between {0} and a reference".format(in1);
            }
        },
        icon: 'icon-calendar',
    },

    "UNIXTimestampParser": {
        description : function(type, params) {
            if (!hasAll(params, ["inCol"])) return null;
            return actionVerb("Convert UNIX") + " timestamp in {0}".format(inColName(params["inCol"]));
        },
        icon: 'icon-calendar'
    },

    "JSONFlattener": {
        description : function(type, params) {
            if (!hasAll(params, ["inCol"])) return null;
            return actionVerb("Unnest") + " object in {0}".format(inColName(params["inCol"]));
        },
        icon: 'icon-cut'
    },

    "DateComponentsExtractor" : {
        description: function(type, params){
            if (!hasAll(params, ["column","timezone_id"]) ) return null;
            if((params['timezone_id']=='extract_from_ip' || params['timezone_id']=='extract_from_column') && !hasAll(params, ["column","timezone_src"])) {
                return null;
            }
            return actionVerb("Extract date") +" components from {0}".format(inColName(params["column"]));
        },
        icon: 'icon-calendar',
    },
    "HolidaysComputer" : {
        description: function(type, params){
            if (!hasAll(params, ["inCol","calendar_id","timezone_id"])) return null;
            if(params["calendar_id"]=="extract_from_column" && !hasAll(params,["calendar_src"])) return null;
            if((params["timezone_id"]=="extract_from_column" || params["timezone_id"]=="extract_from_ip") && !hasAll(params,["timezone_src"])) return null;

            if(params["calendar_id"]!="extract_from_column") {
                return actionVerb("Extract holidays") +" from {0} using calendar {1}".format(
                    inColName(params["inCol"]),
                    anumLiteral(params["calendar_id"]));
            } else {
                return actionVerb("Extract holidays") +" from {0} using the country in {1}".format(
                    inColName(params["inCol"]),
                    anumLiteral(params["calendar_src"]));
            }
        },
        icon: 'icon-calendar',
    },
    /* Numbers */
    "BinnerProcessor": {
        description: function(type, params){
            if (!hasAll(params, ["input"])) return null;
            return actionVerb("Bin") + " values in {0}".format(inColName(params["input"]));
        },
        icon: 'icon-cut',
    },
    "NumericalCombinator": {
        checkValid : function(params) {
            appliesToCheckValid(params);
            var allOps = ["add", "sub", "mul", "div"];
            var hasOp = false;
            for (var opidx in allOps) {
                if (toBoolean(params[allOps[opidx]])) {
                    hasOp = true;
                }
            }
            if (!hasOp) {
                throw new StepIAE("No selected operation");
            }
        },
        description: function(type, params){
            if (!checkAppliesToParams(params)) return null;
            var ops = [],
                allOps = ["add", "sub", "mul", "div"],
                opDesc = ["+", "-", "×", "÷"];
            for (var opidx in allOps) {
                if (toBoolean(params[allOps[opidx]])) {
                    ops.push(opDesc[opidx]);
                }
            }
            if (!ops.length) { return null; }
            return actionVerb("Combine values") +" in {0} with operation{1} {2}{3}".format(
                appliesToDescription(params),
                ops.length > 1 ? "s" : "",
                anumLiteral(ops.join(", ")),
                hasNonEmptyParam(params, "prefix") ? " into " + anumLiteral(params.prefix) + "*" : "");
        },
        icon: 'icon-plus',
    },
    "RoundProcessor": {
        description: function(type, params){
            if (!checkAppliesToParams(params)) return null;
            return actionVerb("Round") + " values in {0}".format(appliesToDescription(params));
        },
        icon: 'icon-superscript',
    },
    "MinMaxProcessor": {
        description: function(type, params){
            if (!hasAll(params, ["columns"])) return null;
            var min = parseFloat(params["lowerBound"]),
                max = parseFloat(params["upperBound"]),
                hasMin = !isNaN(min), hasMax = !isNaN(max);
            if ((!hasMin && !hasMax) || min > max) return null;
            return "{0} values {1} in {2}".format(
                params['clear'] ? actionVerb('Clear') : actionVerb('Clip'),
                hasMin && hasMax ? ['outside [', numLiteral(params["lowerBound"]), ',', numLiteral(params["upperBound"]), ']'].join('')
                    : hasMin ? '&lt;&nbsp;' + numLiteral(params["lowerBound"]) : '&gt;&nbsp;' + numLiteral(params["upperBound"]),
                inColName(params["columns"]));
        },
        icon: 'icon-beaker',
    },
    "MeanProcessor": {
        description: function(type, params){
            if (!hasAll(params, ["columns"])) return null;
            return "{0} mean of {1}".format(
                actionVerb('Compute'),
                appliesToDescription(params),
            );
        },
        icon: 'icon-superscript',
    },
    "CurrencyConverterProcessor": {
        description: function(type, params){
            if (!hasAll(params, ["inputColumn", "inputCurrency", "outputCurrency"])) return null;
            return actionVerb("Convert") +" {0} to {1}".format(inColName(params["inputColumn"]),
                            anumLiteral(params["outputCurrency"]));
        },
        icon: 'icon-edit',
    },
    /* Geo */
    "GeoIPResolver": {
        description: function(type, params){
            if (!hasAll(params, ["inCol"])) return null;
            return actionVerb("Geo-locate IP") + " in {0}".format(inColName(params["inCol"]));
        },
        icon: 'icon-globe',
    },
    "GeoPointExtractor": {
        description: function(type, params){
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Extract") + " latitude/longitude from {0}".format(inColName(params["column"]));
        },
        icon: 'icon-globe',
    },
    "GeoPointCreator": {
        description: function(type, params){
            if (!hasAll(params, ["out_column","lat_column","lon_column"])) return null;
            return actionVerb("Create GeoPoint") + " from {0} & {1}".format(inColName(params["lat_column"]),inColName(params["lon_column"]));
        },
        icon: 'icon-globe',
    },

    "NearestNeighbourGeoJoiner" : {
        description : function(type, params) {
            return actionVerb("Geo-join") + " from dataset {0}".format(inColName(params["rightInput"]));
        },
        icon : 'icon-globe'
    },
    "Geocoder" : {
        description : function(type, params) {
            if (!hasAll(params, ["inCol","api", "prefixOutCol", "apiKey"])) return null;
            return actionVerb("Geocode") + " from adress {0}".format(inColName(params["inCol"]));
        },
        icon : 'icon-globe'
    },
    "CityLevelReverseGeocoder" : {
        description : function(type, params) {
            if (!hasAll(params, ["inputCol"])) return null;
            return actionVerb("Reverse-geocode") + " location {0}".format(inColName(params["inputCol"]));
        },
         icon : 'icon-globe'
    },
    "ChangeCRSProcessor" : {
        description : function(type, params) {
            if (!hasAll(params, ["geomCol"])) return null;
            return actionVerb("Change CRS") + " in {0}".format(inColName(params["geomCol"]));
        },
         icon : 'icon-globe'
    },
    "ZipCodeGeocoder" : {
        description : function(type, params) {
            if (!hasAll(params, ["zipCodeCol"])) return null;
            return actionVerb("Geocode zipcode") + " in {0}".format(inColName(params["zipCodeCol"]));
        },
        icon : 'icon-globe'
    },
    "GeometryInfoExtractor" : {
        description : function(type, params) {
            if (!hasAll(params, ["inputCol"])) return null;
            return actionVerb("Extract geo info") + " from {0}".format(inColName(params["inputCol"]));
        },
        icon : 'icon-globe'
    },
    "GeoDistanceProcessor" : {
        description : function(type, params) {
        	if (!hasAll(params, ["input1", "output", "outputUnit", "compareTo"])) return null;
        	var in1 =inColName(params["input1"]);
            var in2 =inColName(params["input2"]);
            if (params.compareTo === "COLUMN"){
                return actionVerb("Compute distance") + " between {0} and {1}".format(in1, in2);
            } else if(params.compareTo === "GEOPOINT"){
                return actionVerb("Compute distance") + " between {0} and a reference".format(in1);
            }
        },
        icon : 'icon-globe'
    },
    "GeoPointBufferProcessor" : {
        description: function(type, params) {

            var unitModes = {
                "KILOMETERS": "kilometers",
                "MILES": "miles"
            }

            var shapeModes = {
                "RECTANGLE": "rectangular",
                "CIRCLE": "circular"
            }

            var getShapeDescription = function(params){
                if (!params["shapeMode"] || params["shapeMode"].length === 0) return null;
                if (params["shapeMode"] in shapeModes) {
                    return " " +  shapeModes[params["shapeMode"]]
                } else {
                    return null;
                }
            }

            var getDimensionDescription = function(params){
                if (!params["shapeMode"] || params["shapeMode"].length === 0) return null;
                if (!(params["shapeMode"] in shapeModes)) {
                    return null
                } else {
                    switch (params["shapeMode"]) {
                        case "RECTANGLE":
                            return " with width=" + sanitize(params["width"]) + ", height=" + sanitize(params["height"]);
                        case "CIRCLE":
                            return "with radius=" + sanitize(params["radius"]);
                        default:
                            return null
                    }
                }
            }

            var getUnitDescription = function(params){
                if (!params["unitMode"] || params["unitMode"].length === 0) return null;
                if (!(params["unitMode"] in unitModes)) {
                    return null
                } else {
                    switch (params["unitMode"]) {
                        case "KILOMETERS":
                            return " kilometers";
                        case "MILES":
                            return " miles";
                        default:
                            return null
                    }
                }
            }

            if (!params["inputColumn"] || params["inputColumn"].length === 0) return "Choose an input geopoint column.";
            return " <strong>{0}</strong> ".format("Generate a " + getShapeDescription(params) + " polygon") + " centered on "
                + inColName(params["inputColumn"]) + " " + getDimensionDescription(params) + getUnitDescription(params);
        },
        icon: 'icon-globe'
    },

    /* Open data */
    "EnrichFrenchPostcode" : {
        description : function(type, params) {
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Enrich french postcode") + " info from {0}".format(inColName(params["column"]));
        },
        icon : 'icon-group'
    },
    "EnrichFrenchDepartement" : {
        description : function(type, params) {
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Enrich french departement") + " info from {0}".format(inColName(params["column"]));
        },
        icon : 'icon-group'
    },

    /* Reshaping */
    "Unfold" : {
        description : function(type, params) {
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Create dummy") + " columns from values of {0}".format(inColName(params["column"]));
        },
        icon : 'icon-level-up'
    },
    "ArrayUnfold" : {
    description : function(type, params) {
        if (!hasAll(params, ["column"])) return null;
        return actionVerb("Unfold") + " columns from values of {0}".format(inColName(params["column"]));
    },
    icon : 'icon-level-up'
    },
    "SplitUnfold" : {
        description : function(type, params) {
            if (!hasAll(params, ["column", "separator"])) return null;
            return actionVerb("Create dummy") + " columns by splitting {0} on {1}".format(inColName(params["column"]), anumLiteral(params.separator));
        },
        icon : 'icon-level-up'
    },
    "Pivot" : {
        description : function(type, params) {
            if (!hasAll(params, ["indexColumn", "labelsColumn", "valuesColumn"])) return null;
            return actionVerb("Pivot") + " around {0}, labels from {1}, values from {2}".format(
                inColName(params["indexColumn"]),
                inColName(params["labelsColumn"]),
                inColName(params["valuesColumn"])
                );
        },
        icon : 'icon-level-up'
    },
    "ZipArrays" : {
        description : function(type, params) {
            if (!hasAll(params, ["inputColumns", "outputColumn"])) return null;
            return actionVerb("Zip arrays") + " from {0} to arrays of objects in {1}".format(
                inColName(params["inputColumns"].join(", ")),
                outColName(params["outputColumn"])
                );
        },
        icon : 'icon-level-up'
    },
    "ConcatArrays" : {
        description : function(type, params) {
            if (!hasAll(params, ["inputColumns", "outputColumn"])) return null;
            return actionVerb("Concatenate arrays") + " from {0} in {1}".format(
                inColName(params["inputColumns"].join(", ")),
                outColName(params["outputColumn"])
                );
        },
        icon : 'icon-resize-small'
    },
    "SplitFold" : {
        description : function(type, params) {
            if (!hasAll(params, ["column", "separator"])) return null;
            return actionVerb("Split") + " values of {0} on {1} and " + actionVerb("fold") + " to new rows".format(
                inColName(params["column"]), anumLiteral(params["separator"]));
        },
        icon : 'icon-level-down'
    },
    "ArrayFold" : {
        description : function(type, params) {
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Fold array values") + " of {0} to new rows".format(inColName(params["column"]));
        },
        icon : 'icon-level-down'
    },
    "ObjectFoldProcessor" : {
        description : function(type, params) {
            if (!hasAll(params, ["column"])) return null;
            return actionVerb("Fold keys/values") + " of {0} to new rows".format(inColName(params["column"]));
        },
        icon : 'icon-level-down'
    },
    "MultiColumnFold" : {
         description : function(type, params) {
            if (!hasAll(params, ["foldNameColumn", "foldValueColumn"])) return null;
            return actionVerb("Fold multiple columns") + " into {0} / {1}".format(
                outColName(params["foldNameColumn"]),outColName(params["foldValueColumn"]));
        },
        icon : 'icon-level-down'
    },
    "RepeatableUnfold" : {
        description : function(type, params) {
            if (!hasAll(params, ["keyColumn", "foldColumn", "foldTrigger", "dataColumn"])) return null;
            return "Foreach {0}, create columns for values of {1} between each occurrence of '{3}' in {2}".format(
                inColName(params["keyColumn"]),
                inColName(params["dataColumn"]),
                inColName(params["foldColumn"]),
                anumLiteral(params["foldTrigger"])
                );
        },
        icon : 'icon-level-up'
    },
    "MultiColumnByPrefixFold" : {
        description : function(type, params) {
           if (!hasAll(params, ["columnNamePattern", "columnNameColumn", "columnContentColumn"])) return null;
           return actionVerb("Fold columns") + " matching {0} into {1} / {2}".format(
                anumLiteral(params["columnNamePattern"]),
                outColName(params["columnNameColumn"]),
                outColName(params["columnContentColumn"]));
       },
       icon : 'icon-level-down'
    },
    "NestProcessor" : {
        checkValid : function(params) {
            appliesToCheckValid(params);
            if (params["outputColumn"]==undefined) {
                throw new StepIAE("Output column not specified");
            }
        },
        description : function(type, params) {
            if (!checkAppliesToParams(params) || !params["outputColumn"]) return null;
            return actionVerb("Nest") + " {0} into {1}".format(appliesToDescription(params), outColName(params["outputColumn"]));
        },
        icon : 'icon-resize-small'
    },
    // TODO Melt

    /* Join */
    "MemoryEquiJoiner": {
        description : function(type, params){
            if (!hasAll(params, ["leftCol", "rightInput", "rightCol"])) return null;
            return actionVerb("Join") + " column {0} with column {1} of dataset {2}".format(
                inColName(params["leftCol"]),
                inColName(params["rightCol"]),
                inColName(params["rightInput"])
            );
        },
        icon : 'icon-resize-small'
    },
    "MemoryEquiJoinerFuzzy": {
        description : function(type, params){
            if (!hasAll(params, ["leftCol", "rightInput", "rightCol"])) return null;
            return actionVerb("Fuzzy-join") + " column {0} with column {1} of dataset {2}".format(
                inColName(params["leftCol"]),
                inColName(params["rightCol"]),
                inColName(params["rightInput"])
            );
        },
        icon : 'icon-resize-small'
    },

    /* GREL */
    "CreateColumnWithGREL" : {
        description: function(type, params){
            if (!hasAll(params, ["column", "expression"])) return null;
            if (params.expression.length > 30) {
                return "Create column {0} with formula".format(outColName(params["column"]));
            } else {
                return "Create column {0} with formula {1}".format(outColName(params["column"]), anumLiteral(params.expression));
            }
        },
        icon : 'icon-beaker'
    },

    /* Custom */
     "PythonUDF" : {
        description: function(type, params){
            if (params.mode == "CELL") {
                return "Create column {0} with Python code".format(outColName(params.column));
            } else if (params.mode == "ROW") {
                return "Modify row with Python code";
            } else {
                return "Modify data with Python code";
            }
        },
        icon : 'icon-beaker'
    },


    "GenerateBigData" : {
        description: function(type, params) {
            return "Generate Data {0} times bigger".format(numLiteral(params["expansionFactor"]));
        },
        icon : 'icon-beaker'

    },

    "ColumnCopier" : {
        description: function(type, params) {
            if (!hasAll(params, ["inputColumn", "outputColumn"])) {
                return null;
            }
            return actionVerb("Copy") + " column {0} to {1}".format(
                inColName(params["inputColumn"]),
                outColName(params["outputColumn"])
            );
        },
        icon : 'icon-copy'
    },
    "EnrichWithRecordContextProcessor" : {
        description: function(type, params) {
            return actionVerb("Enrich") + " records with files info";
        },
        icon : 'icon-file'
    },
    "FastPredict" : {
        description: function(type, params) {
            return "Predict missing values on {0}".format(strongify(sanitize(params["targetColumn"])))
        },
        icon : 'icon-beaker'

    },
    "BooleanNot" : {
        description: function(type, params) {
            return actionVerb("Negate") + " boolean {0}".format(inColName(params["column"]));
        },
        icon : 'icon-beaker'
    },
    "FillColumn" : {
        description: function(type, params) {
            var description = actionVerb("Fill") + ' column';
            if(params["column"]) description += ' ' + outColName(params["column"]);
            if(params["value"]) description += ' with ' + anumLiteral(params["value"]);
            return description;
        },
        icon : 'icon-beaker'
    },
    "ColumnPseudonymization": {
        description: function(_, params) {
            let description = actionVerb("Pseudonymize") + " values in {0}".format(appliesToDescription(params));
            if (params["saltColumn"]) {
                description += " with column {0} for salting".format(inColName(params["saltColumn"]));
            }
            if (params["pepper"]) {
                description += " with {0} as pepper".format(anumLiteral(params["pepper"]));
            }
            return description;
        },
        icon: 'icon-edit'
    },
    "MeasureNormalize" : {
        description: function(type, params) {
            return actionVerb("Normalize") + " measure {0} to SI units".format(inColName(params["column"]));
        },
        icon : 'icon-beaker'
    },
    "Transpose": {
        description: function (type, params) {
            return actionVerb("Transpose") + " rows into columns around {0}".format(inColName(params["column"]));
        },
        icon: 'icon-rotate-right'
    }

    }


    function jythonEntry(processor, loadedDesc){
        return {
            description : function(type, params) {
                return loadedDesc.desc.meta.label;
            },
            icon : loadedDesc.desc.meta.icon || "icon-puzzle-piece",
            checkValid : function(params) {
                Object.keys(params.customConfig).forEach(function(k) {
                    let v = params.customConfig[k];
                    let param = loadedDesc.desc.params.find(x => x.name == k);
                    if (param != null && param.mandatory && (v ==null || v.length == 0)) {
                        throw new StepIAE("No value for parameter " + param.name);
                    }
                })
            }
        }
    }

    svc.get = function(processor) {
        if (processor && processor.indexOf("jython-processor") == 0) {
            let loadedDesc = dkuAppConfig.customJythonProcessors.find(x => x.elementType == processor);
            Assert.trueish(loadedDesc, 'processor desc not loaded');
            return jythonEntry(processor, loadedDesc);
        } else {
            return svc.map[processor];
        }
    };

    return svc;
});


app.factory("ShakerProcessorsUtils", function(ShakerProcessorsInfo) {

    var svc = {}

    svc.getStepDescription = function(processor, type, params) {
        var e = ShakerProcessorsInfo.get(type);
        if (!e || !e.description) {
            return type + " (UNKNOWN)";
        }
        if (e.checkValid) {
            try {
                e.checkValid(params);
            } catch (e) {
                return processor.enDescription + " (invalid)";
            }
        }
        var desc = e.description(type, params);
        if (!desc) {
            return processor.enDescription + " (invalid - no desc)";
        } else{
            return desc;
        }
    };

    svc.getStepIcon = function(type, params) {
        var e = ShakerProcessorsInfo.get(type);
        return (!e || !e.icon) ? "icon-warning-sign"
            : (typeof e.icon == 'function' ? e.icon(type, params) : e.icon);
    };

    svc.getStepImpactVerb = function(type, params) {
        var e = ShakerProcessorsInfo.get(type);
        if (!e) return "modified";
        if (e.impactVerb) {
            return e.impactVerb(params);
        } else {
            return "modified";
        }

    };

    return svc;
});


app.factory("ShakerSuggestionsEngine", function(ShakerProcessorsInfo, CreateModalFromDOMElement, Dialogs, PluginsService, $filter, $rootScope, $q) {

var svc = {};

function addCustomSuggestion(map, category, id, func, text, icon) {
    (category in map ?
         map[category] :
         (map[category] = []))
        .push({id: id, text: text, action: func, icon});
}

/* Cell suggestions
 * MUST NOT include column-level suggestions
 */
svc.computeCellSuggestions =  function(column, value, validity) {
    var truncateFilter =$filter("gentleTruncate");

    function addStepBasedSuggestion(map, category, id, type, params, text) {
        addCustomSuggestion(map, category, id, function(shakerScope) {
            WT1SVC.event("shaker-use-cell-sugg", {
                "colMeaning" : column.selectedType ? column.selectedType.name : "unk" ,
                "cellValid" : validity,
                "processor" : type,
                "suggText" : text,
            });
            shakerScope.addStepNoPreview(type, params);
            if (type == "FilterOnValue") {
            	shakerScope.mergeLastDeleteRows();
            }
            shakerScope.autoSaveAutoRefresh();
        }, text);
    }

        var map = Object();
    var moreMap = Object();

    if (value) {
        addStepBasedSuggestion(map, "Filter data", "keep", "FilterOnValue", {
            'appliesTo': "SINGLE_COLUMN",
            'action': "REMOVE_ROW",
            'columns': [column.name],
            'values': [value],
            'matchingMode' : "FULL_STRING",
            'normalizationMode' : "EXACT"
        }, actionVerb("Remove") + " rows equal to " + anumLiteral(truncateFilter(value, 35)));

        addStepBasedSuggestion(map, "Filter data", "remove", "FilterOnValue", {
            'appliesTo': "SINGLE_COLUMN",
            'action': "KEEP_ROW",
            'columns': [column.name],
            'values': [value],
            'matchingMode' : "FULL_STRING",
            'normalizationMode' : "EXACT"
        }, actionVerb("Keep") + " only rows equal to " + anumLiteral(truncateFilter(value, 35)));

        addStepBasedSuggestion(map, "Filter data", "clear", "FilterOnValue", {
            'appliesTo': "SINGLE_COLUMN",
            'action': "CLEAR_CELL",
            'columns': [column.name],
            'values': [value],
            'matchingMode' : "FULL_STRING",
            'normalizationMode' : "EXACT"
        }, actionVerb("Clear") + " cells equal to " + anumLiteral(truncateFilter(value, 35) ));
    }

    if (value && validity.indexOf('I') == 0) {
        addStepBasedSuggestion(map, "Data cleansing", "c1", "FilterOnBadType", {
            'appliesTo': "SINGLE_COLUMN",
            'action': 'REMOVE_ROW',
            'columns': [column.name],
            'type': column.selectedType.name,
        }, actionVerb("Remove invalid") + " rows for meaning");
        addStepBasedSuggestion(map, "Data cleansing", "c1", "FilterOnBadType", {
            'appliesTo': "SINGLE_COLUMN",
            'action': 'CLEAR_CELL',
            'columns': [column.name],
            'type': column.selectedType.name,
        }, actionVerb("Clear invalid") + " cells for meaning");
    }

    if (!value) {
        addStepBasedSuggestion(map, "Data cleansing", "c1", "RemoveRowsOnEmpty", {
            'columns': [column.name],
            appliesTo : 'SINGLE_COLUMN',
            'keep' : false
        }, actionVerb("Remove") +" rows where cell is empty");
        addStepBasedSuggestion(map, "Data cleansing", "c1", "RemoveRowsOnEmpty", {
            'columns': [column.name],
            appliesTo : 'SINGLE_COLUMN',
            'keep' : true
        }, actionVerb("Keep only") +  " rows where cell is empty");
        addCustomSuggestion(map, "Data cleansing", "fill_empty_withval", function(scope) {
            CreateModalFromDOMElement("#fill-empty-with-value-box", scope, "FillEmptyWithValueController",
                function(newScope) { newScope.$apply(function() {
                        newScope.setColumns([column.name]);
                        newScope.isNumericOnly = ["LongMeaning", "DoubleMeaning"]
                            .indexOf(column.selectedType && column.selectedType.name) > -1;
                }); });
        }, actionVerb("Fill") +  " empty rows with...");
    }
    return [map, moreMap, Object.keys(moreMap).length];
};

svc.computeContentSuggestions = function(column, cellValue, value, validity, CreateModalFromTemplate, selectionStartOffset, selectionEndOffset) {
    function addStepBasedSuggestion(map, category, id, type, params, text) {
        addCustomSuggestion(map, category, id, function(shakerScope) {
            WT1SVC.event("shaker-use-content-sugg", {
                "colMeaning" : column.selectedType ? column.selectedType.name : "unk" ,
                "cellValid" : validity,
                "value" : value, "startOff" : selectionStartOffset, "endOff" : selectionEndOffset,
                "processor" : type,
                "suggText" : text,
            });
            shakerScope.addStepAndRefresh(type, params);
        }, text);
    }

    var map = Object();
    var moreMap = Object();

    addStepBasedSuggestion(map, "Transform", "c1", "ColumnSplitter", {
            'inCol': column.name,
            'separator': value,
            'outColPrefix' : column.name + "_",
            'target' : "COLUMNS"
        }, actionVerb("Split") +  " column on " + anumLiteral(value) + "");
    addStepBasedSuggestion(map, "Transform", "c1", "FindReplace", {
            'appliesTo' :"SINGLE_COLUMN",
            "columns" : [column.name],
            'matching' : "SUBSTRING",
            'normalization' : "EXACT",
            "mapping" : [{"from":value,"to":""}],
        }, actionVerb("Replace") +  " " + anumLiteral(value) + " by ...");

    //TODO : ui problem : often the label associated with the rules are too long and are cut...
    /*var suggestionEngine = new SuggestionEngine(true);
    suggestionEngine.add(cellValue, selectionStartOffset, selectionEndOffset);
    var suggestions = suggestionEngine.getSuggestions(true, false);
    for(var i = 0; i < suggestions.length; i++){
        addStepBasedSuggestion(map, "Extract", "c1", "RegexpExtractor", {
                'column': column.name,
                'prefix': column.name + "_",
                'pattern': suggestions[i].regexLiteral
            }, "<strong>Extract") +  "  + suggestions[i].getLabel());
    }*/

    addCustomSuggestion(map, "Smart Pattern Builder", "extractor",
        function(scope) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/shaker/regexbuilder-box.html", scope, "RegexBuilderController",
                function(newScope) {
                    newScope.deferred = deferred;
                    newScope.$apply(function() {
                        newScope.columnName = column.name;
                        newScope.firstSentence = cellValue;
                        newScope.addSelection(cellValue, selectionStartOffset, selectionEndOffset);
                        newScope.calledFrom = "highlight-extract_like";
                    });
                    deferred.promise.then(function(newPattern) {
                        var params = {
                            "column" : column.name,
                            "prefix": column.name + '_extracted_',
                            "pattern": newPattern.regex,
                            "extractAllOccurrences": newPattern.hasMultiOccurrences,
                        };
                        scope.addStepAndRefresh("RegexpExtractor", params);
                    });
                },
                "sd-modal");
        },
        actionVerb("Extract") + " text like " + anumLiteral(value) + "..."
    );

    addCustomSuggestion(map, "Smart Pattern Builder", "filter",
        function(scope) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/shaker/regexbuilder-box.html", scope, "RegexBuilderController",
                function(newScope) {
                    newScope.deferred = deferred;
                    newScope.$apply(function() {
                        newScope.columnName = column.name;
                        newScope.firstSentence = cellValue;
                        newScope.addSelection(cellValue, selectionStartOffset, selectionEndOffset);
                        newScope.calledFrom = "highlight-remove_like";
                    });
                    deferred.promise.then(function(newPattern) {
                        var params = {
                            'action': "REMOVE_ROW",
                            'appliesTo' : "SINGLE_COLUMN",
                            'columns': [column.name],
                            'values': [newPattern.regex],
                            'matchingMode' : "PATTERN",
                            'normalizationMode' : "EXACT"
                        };
                        scope.addStepAndRefresh("FilterOnValue", params);
                    });
                },
                "sd-modal");
        },
        actionVerb("Remove") + " rows containing text like " + anumLiteral(value) + "..."
    );

    addCustomSuggestion(map, "Smart Pattern Builder", "keep",
        function(scope) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/shaker/regexbuilder-box.html", scope, "RegexBuilderController",
                function(newScope) {
                    newScope.deferred = deferred;
                    newScope.$apply(function() {
                        newScope.columnName = column.name;
                        newScope.firstSentence = cellValue;
                        newScope.addSelection(cellValue, selectionStartOffset, selectionEndOffset);
                        newScope.calledFrom = "highlight-filter_like";
                    });
                    deferred.promise.then(function(newPattern) {
                        var params = {
                            'appliesTo' : "SINGLE_COLUMN",
                            'columns': [column.name],
                            'values': [newPattern.regex],
                            'matchingMode' : "PATTERN",
                            'normalizationMode' : "EXACT"
                        };
                        scope.addStepAndRefresh("FilterOnValue", params);
                    });
                },
                "sd-modal");
        },
        actionVerb("Keep") + " rows containing text like " + anumLiteral(value) + "..."
    );

    addCustomSuggestion(map, "Smart Pattern Builder", "flag",
        function(scope) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/shaker/regexbuilder-box.html", scope, "RegexBuilderController",
                function(newScope) {
                    newScope.deferred = deferred;
                    newScope.$apply(function() {
                        newScope.columnName = column.name;
                        newScope.firstSentence = cellValue;
                        newScope.addSelection(cellValue, selectionStartOffset, selectionEndOffset);
                        newScope.calledFrom = "highlight-flag_like";
                    });
                    deferred.promise.then(function(newPattern) {
                        var params = {
                            "flagColumn" : column.name + "_flagged",
                            'action': "KEEP_ROW",
                            'appliesTo' : "SINGLE_COLUMN",
                            'columns': [column.name],
                            'values': [newPattern.regex],
                            'matchingMode' : "PATTERN",
                            'normalizationMode' : "EXACT"
                        };
                        scope.addStepAndRefresh("FlagOnValue", params);
                    });
                },
                "sd-modal");
        },
        actionVerb("Flag") + " rows containing text like " + anumLiteral(value) + "..."
    );

    addStepBasedSuggestion(map, "Filter data", "c1", "FilterOnValue", {
            'action': "REMOVE_ROW",
            'appliesTo' : "SINGLE_COLUMN",
            'columns': [column.name],
            'values': [value],
            'matchingMode' : "SUBSTRING",
            'normalizationMode' : "EXACT"
        }, actionVerb("Remove") +  " rows containing " + anumLiteral(value) + "");

    addStepBasedSuggestion(map, "Filter data", "c1", "FilterOnValue", {
            'action': "KEEP_ROW",
            'appliesTo' : "SINGLE_COLUMN",
            'columns': [column.name],
            'values': [value],
            'matchingMode' : "SUBSTRING",
            'normalizationMode' : "EXACT"
        }, actionVerb("Keep only") + " rows containing " + anumLiteral(value) + "");

    return [map, moreMap, Object.keys(moreMap).length];

};


/* Column suggestions are handled fully in Javascript based on the data in the column header, to avoid useless
 * calls.
 *
 * Returns an array of two maps of <category name, array[]>
 *   - id (string)
 *   - text (string)
 *   - action (function)
 * The first map contains "important" suggestions, the second one more suggestions.
 * We ensure that there is always at least one non-additional suggestion per column
 */
svc.computeColumnSuggestions = function(column, CreateModalFromDOMElement, CreateModalFromTemplate, forCell, forInvalidCell, appConfig) {
    // UGLY
    var meaningLabelFilter = angular.element("body").injector().get("$filter")("meaningLabel");

    var COLUMN_NAME_PH = '__DKU_COLUMN_NAME__', CNRE = new RegExp(COLUMN_NAME_PH, 'g'),
        TYPE_NAME_PH   = '__DKU_COLUMN_TYPE__', TNRE = new RegExp(TYPE_NAME_PH, 'g');

    function addStepBasedSuggestion(map, category, id, type, params, text, incomplete, oneStep) {
        params = JSON.stringify(params);
        var reportEvent = report("shaker-use-col-sugg", type, text),
            addStepFnName = incomplete ? 'addUnconfiguredStep' : multi ? 'addStepNoPreview' : 'addStep',
            addStepFn = function (c) { this[addStepFnName](type, JSON.parse(params
                    .replace(CNRE, c.name).replace(TNRE, c.selectedType && c.selectedType.name || ''))); };
        addCustomSuggestion(map, category, id, function(shakerScope) {
            reportEvent();
            if (oneStep) {
            	addStepFn.call(shakerScope, columns[0]);
            } else {
            	columns.forEach(addStepFn, shakerScope);
            }
            if (type == "FindReplace") {
            	shakerScope.mergeLastFindReplaces();
            }
            shakerScope.autoSaveAutoRefresh();

        }, text);
    }

    function addAppliesToSuggestion(map, category, id, type, params, text, incomplete) {

        if (columnNames.length == 1) {
            params["appliesTo"] = "SINGLE_COLUMN";
        } else {
            params["appliesTo"] = "COLUMNS";
        }
        params["columns"] = columnNames;

        addStepBasedSuggestion(map, category, id, type, params, text, incomplete, true);
    }



    var map = {}, moreMap = {}, target,
        columns = [column];
    if (Array.isArray(column)) {
        columns = column;
        column = column.length === 1 ? column = column[0] : { name: COLUMN_NAME_PH };
    }

    var types = columns.reduce(function(ts, c){
            if (c.selectedType && ts.indexOf(c.selectedType.name) === -1) {
                ts.push(c.selectedType.name);
            } return ts; }, []),
        multi = columns.length > 1,
        hasNOK   = columns.some(function(c) { return c.selectedType && c.selectedType.nbNOK   > 0; }),
        hasEmpty = columns.some(function(c) { return c.selectedType && c.selectedType.nbEmpty > 0; }),
        typesAllIn = types.every.bind(types, function(t) { return this.indexOf(t) !== -1; }),
        noTypeIn   = types.every.bind(types, function(t) { return this.indexOf(t) === -1; }),
        typeIs     = function(t) { return types.length === 1 && types[0] === t; },
        typeName = types.length === 1 ? types[0] : TYPE_NAME_PH,
        columnName = column.name,
        columnNames = columns.map(function(c){ return c.name; }),
        eventBase = multi ? {
            colMeaning: column.selectedType ? column.selectedType.name    : "unk" ,
            nbOK:       column.selectedType ? column.selectedType.nbOK    : -1,
            nbNOK:      column.selectedType ? column.selectedType.nbNOK   : -1,
            nbEmpty:    column.selectedType ? column.selectedType.nbEmpty : -1
        } : {
            colMeanings: types.join(','),
            colCount: columns.length,
            hasNOK: hasNOK,
            hasEmpty: hasEmpty
        },
        report = function(evt, proc, text) {
            var ep = { processor: proc, text: text }, i;
            for (i in eventBase) {
                ep[i] = eventBase[i];
            }
            return WT1SVC.event.bind(WT1SVC, evt, ep);
        };

    /* Step 1 : add type-based main suggestions */

    if (typeIs("IPAddress")) {
        addStepBasedSuggestion(map, "Geography", "geoip", "GeoIPResolver", {
            'inCol': columnName,
            'outColPrefix': columnName+'_',
            'extract_country' : true,
            'extract_countrycode' : true,
            'extract_region' : true,
            'extract_city' : true,
            'extract_geopoint' : true
        }, actionVerb("Resolve") + " GeoIP");
    } else if (typeIs("GeoPoint")) {
        addStepBasedSuggestion(map, "Geography", "extractlatlon", "GeoPointExtractor", {
            'column': columnName,
            'lat_col': columnName+'_latitude',
            'lon_col' : columnName+'_longitude'
        }, actionVerb("Extract") + " latitude/longitude");
        if (PluginsService.isPluginLoaded('geoadmin')) {
            addStepBasedSuggestion(map, "Geography", "geoadmin", "CityLevelReverseGeocoder", {
                'inputCol': columnName
            }, actionVerb("Reverse-geocode") + " location", true);
        } else {
            addCustomSuggestion(map, "Geography", "geoadmin", function(shakerScope) {
                Dialogs.ack(shakerScope, "Plugin required",
                    "The <a href='https://doc.dataiku.com/dss/latest/preparation/geo_processors.html' " +
                    "target='_blank'>Reverse Geocoding</a> plugin is required for this action.<br><br>" +
                    (!$rootScope.appConfig.admin ? "Please contact your DSS administrator."
                        : "<a href='/plugins-explore/store/' target='_blank'>Go to plugins</a> to install it.")
                );
            }, actionVerb("Reverse-geocode") + " location");
        }
    } else if (typeIs("QueryString")) {
        addStepBasedSuggestion(map, "Web", "querystring", "QueryStringSplitter", {
            'column': columnName,
        }, actionVerb("Split query string") + " elements");
    } else if (typeIs("URL")) {
        addStepBasedSuggestion(map, "Web", "urlsplit", "URLSplitter", {
            'column': columnName,
            extractPath:true,
            extractQueryString:true,
            extractPort:true,
            extractAnchor:true,
            extractScheme:true,
            extractHost:true
        }, actionVerb("Split URL") + " into host, port ...");
    } else if (typeIs("Email")) {
        addStepBasedSuggestion(map, "Email", "emailsplit", "EmailSplitter", {
            'column': columnName,
        }, actionVerb("Split email") + " address");
    } else if (typeIs("Boolean")) {
        addStepBasedSuggestion(map, "Boolean", "booleannot", "BooleanNot", {
            'column': columnName
        }, actionVerb("Negate") + " boolean");
    } else if (typeIs("Measure")) {
         addStepBasedSuggestion(map, "Measure", "measurenormalize", "MeasureNormalize", {
             'column': columnName
         }, actionVerb("Normalize") + " to SI units");
    } else if (typeIs("DateSource") && !multi) {
        addCustomSuggestion(map, "Date", "date_stuff", function(scope) {
            report("shaker-use-col-sugg", "SmartDate", "Parse date...")();
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/shaker/smartdate-box.html", scope, "SmartDateController",
                function(newScope) { newScope.$apply(function() {
                        newScope.deferred = deferred;
                        newScope.setColumn(columnName);
                }); }, "sd-modal");
            deferred.promise.then(function(newFormat) {
                scope.addStepAndRefresh("DateParser", {
                    "appliesTo" : "SINGLE_COLUMN",
                    "columns" : [columnName],
                    "outCol" : columnName + "_parsed", "formats" : [newFormat],
                    "lang" : "auto", "timezone_id" : "UTC"});
            });
        },
        actionVerb("Parse") + " date...",
        "icon-calendar");
    } else if (typeIs("DateSource")) {
        addAppliesToSuggestion(map, "parse_date", null, "DateParser", {
            "lang" : "auto", "timezone_id" : "UTC"
        },  actionVerb("Parse") + " date", true);
    }
    else if (typeIs("Date")) {
        addStepBasedSuggestion(map, "Date", "date_difference", "DateDifference", {
            "input1" : columnName,
            "output" : "since_" + columnName + "_days",
            "compareTo" : "NOW",
            "outputUnit":  "DAYS"
        }, actionVerb("Compute time") + " since");
        addStepBasedSuggestion(map, "Date", "extract_components", "DateComponentsExtractor", {
                "column" : columnName,
                "timezone_id" : "UTC",
                "outYearColumn" : columnName + "_year",
                "outMonthColumn" : columnName + "_month",
                "outDayColumn" : columnName + "_day"
        }, actionVerb("Extract") + " date components");
        addStepBasedSuggestion(map, "Date", "filterOnDate", "FilterOnDate", {
                "appliesTo": 'SINGLE_COLUMN',
                "columns" : [columnName],
                "action": 'KEEP_ROW',
                "filterType": 'RANGE',
                "timezone_id": "UTC",
                "part": 'YEAR',
                "option": 'THIS',
                "relativeMin": 1,
                "relativeMax": 1
        }, actionVerb("Filter") + " on date", true);
    } else if (typeIs("UserAgent")) {
         addStepBasedSuggestion(map, "Web", "useragent", "UserAgentClassifier", {
            'column': columnName,
        }, actionVerb("Classify") + " User-Agent");
    } else if (typeIs("JSONObjectMeaning")) {
        addStepBasedSuggestion(map, "Transformations", null, "JSONFlattener", {
            "inCol" : columnName,
            "maxDepth" : 1,
            'prefixOutputs' : true,
            'nullAsEmpty' : true,
            'separator' : '_'
        }, actionVerb("Unnest") + " object");
    } else if (typeIs("FreeText")) {
         addStepBasedSuggestion(map, "Text", "null", "Tokenizer", {
             'inCol': columnName,
             'operation' : 'TO_JSON',
             'language' : 'english'
         }, actionVerb("Split") + " in words (tokenize)");
         addStepBasedSuggestion(map, "Text", "null", "TextSimplifierProcessor", {
             'inCol': columnName,
             'normalize' : true,
             'language' : 'english'
         }, actionVerb("Simplify") + " text (normalize, stem, clear stop words)");
     } else if (typeIs("BagOfWordsMeaning")) {
        addStepBasedSuggestion(map, "Text", null, "ArrayFold", {
             "column" : columnName
        }, actionVerb("Fold") + " to one word per line");
        addStepBasedSuggestion(map, "Text", null, "ArrayUnfold", {
             "column" : columnName,
             "prefix": columnName + "_",
             'countVal': true,
             'limit': 100,
             'overflowAction': 'ERROR'
        }, actionVerb("Unfold") + " to several columns");
    } else if (typeIs("JSONArrayMeaning")) {
        addStepBasedSuggestion(map, "Text", null, "ArrayFold", {
             "column" : columnName
        }, actionVerb("Fold") + " to one element per line");
        addStepBasedSuggestion(map, "Text", null, "ArrayUnfold", {
             "column" : columnName,
             "prefix": columnName + "_",
             'countVal': true,
             'limit': 100,
             'overflowAction': 'ERROR'
        }, actionVerb("Unfold") + " to several columns");
    } else if (typeIs("DoubleMeaning")) {
        addAppliesToSuggestion(map, "Numbers", null, "RoundProcessor", {
            "mode": "ROUND",
            "precision": 0,
            "places": 0
        },  actionVerb("Round") + " to integer", false);
    } else if (typeIs("FrenchDoubleMeaning")) {
        addAppliesToSuggestion(map, "Numbers", null, "NumericalFormatConverter", {
            inFormat: 'FR', outFormat: 'RAW'
        }, actionVerb("Convert") + " French format to regular decimal", true);
    } else if (typeIs("CurrencyAmountMeaning")) {
        addStepBasedSuggestion(map, "Transform", "c1", "CurrencySplitter", {
            'inCol': column.name,
            'outColCurrencyCode' : column.name + "_currency_code",
            'outColAmount' : column.name + "_amount",
            'pristineAmount': false,
        }, actionVerb("Split") +  " currency and amount");
    }

    /* Suggestions for bad data */
    if (hasNOK) {
        if (!(forCell && forInvalidCell)) {
            addAppliesToSuggestion(map, "Data cleansing", "remove_badtype", "FilterOnBadType", {
                "action": "REMOVE_ROW", "type" : typeName, "booleanMode" : "AND"
            }, actionVerb("Remove invalid") + " rows for meaning " + (
                types.length === 1 ? meaningName(meaningLabelFilter(typeName)) : ""));
            addAppliesToSuggestion(map, "Data cleansing", "clear_badtype", "FilterOnBadType", {
                "action": "CLEAR_CELL", "type" : typeName
            }, actionVerb("Clear invalid ") + "cells for meaning " + (
                types.length === 1 ? meaningName(meaningLabelFilter(typeName)): ""));
        }
        addStepBasedSuggestion(moreMap, "Data cleansing", "split_badtype", "SplitInvalidCells", {
            "column" : columnName, "type" : typeName,
            "invalidColumn" : columnName + "_invalid"
        }, "Move invalid cells for meaning" + (
                types.length === 1 ? " <em>" + (meaningLabelFilter(typeName)) + "</em>" : ""
            ) + " to <em>" + (multi ? "&lt;column name&gt;" : columnName) + "_invalid</em>");
    }

     if (types.length === 1 && appConfig.meanings.categories
            .filter(function(cat) { return cat.label === "User-defined"; })[0]
            .meanings.filter(function(mapping) { return mapping.id === typeName && mapping.type === 'VALUES_MAPPING'; })
            .length) {
        addAppliesToSuggestion(map, "Transformations", "translate_meaning", "MeaningTranslate", {"meaningId": typeName},
            actionVerb("Translate") + " using meaning " + meaningName(typeName), false);
     }


    /* Now, if at this point we have 0 items in the main suggestions,
     * we add some that would normally go to more */

    if (hasEmpty) {
        target = Object.keys(map).length > 0 ? moreMap : map;
        addAppliesToSuggestion(target, "Data cleansing", "rm_empty", "RemoveRowsOnEmpty", {"keep": false},
            actionVerb("Remove") + " rows with no value", false);

        addCustomSuggestion(target, "Data cleansing", "fill_empty_withval", function(scope) {
            CreateModalFromDOMElement("#fill-empty-with-value-box", scope, "FillEmptyWithValueController",
                function(newScope) { newScope.$apply(function() {
                        newScope.setColumns(columnNames);
                        newScope.isNumericOnly = ["LongMeaning", "DoubleMeaning"]
                            .indexOf(column.selectedType && column.selectedType.name) > -1;
                }); });
        }, actionVerb("Fill") +  " empty rows with...");

        addStepBasedSuggestion(moreMap, "Data cleansing", "fill_empty_prev", "UpDownFiller", {
            "columns" : [columnName],
            "up" : false
        }, actionVerb("Fill") + " empty rows with previous value", true);
    }

    if (typesAllIn(["LongMeaning", "DoubleMeaning"])) {
        target = Object.keys(map).length > 2 ? moreMap : map;
        if (multi) {
            addCustomSuggestion(target, "Delete/Keep", "numerical_range_selector", function(scope) {
                report("shaker-use-col-sugg", "FilterOnNumericalRange", "Delete/Keep on number range...")();
                CreateModalFromDOMElement("#value-range-filter-box", scope, "MultiRangeController",
                    function(newScope) { newScope.$apply(function() {
                            newScope.setColumns(columnNames);
                    }); });
            }, actionVerb("Filter") + " with numerical range...");
        } else {
            addStepBasedSuggestion(target, "Delete/Keep", null, "FilterOnNumericalRange", {
                    "appliesTo" : "SINGLE_COLUMN",
                    "columns": [columnName],
                    "min": undefined,
                    "max" : undefined,
                    "action" : "KEEP_ROW",
                }, actionVerb("Filter") + " with numerical range...", true);
        }
    }

    if (noTypeIn(["LongMeaning", "DoubleMeaning", "Date"])) {
        target = Object.keys(map).length > 0 ? moreMap : map;

        addAppliesToSuggestion(target, "Transformations", null, "StringTransformer", {
                "mode" : "TO_LOWER"
        }, actionVerb("Convert") + " to lowercase");
        addAppliesToSuggestion(target, "Transformations", null, "StringTransformer", {
                "mode" : "TO_UPPER"
        }, actionVerb("Convert") + " to uppercase");
        addAppliesToSuggestion(target, "Transformations", null, "StringTransformer", {
                "noMode": true
        }, actionVerb("Transform") + " string", true);

    }
    /* At this point, we should always have something in the main map */

    /* Add the rest of type-based tranformations to hte more map */

    if (typeIs("Date")) {
        addStepBasedSuggestion(moreMap, "Date", "extract_ts", "DateComponentsExtractor", {
                "column" : columnName,
                "timezone_id" : "UTC",
                "outTimestampColumn" : columnName + "_timestamp",
        }, actionVerb("Convert") + " to UNIX timestamp");
        addStepBasedSuggestion(moreMap, "Date", "holidays", "HolidaysComputer", {
            "inCol" : columnName,
            "outColPrefix" : columnName+'_holiday_',
            "flagBankHolidays":true,
            "calendar_id":"FR",
            "timezone_id":"use_preferred_timezone",
            "flagWeekends":true,
            "flagSchoolHolidays":true
        }, actionVerb("Flag") + " holidays");
        addStepBasedSuggestion(moreMap, "Date", "date_format", "DateFormatter", {
            "inCol": columnName,
            "outCol": columnName + "_formatted",
            "lang" : "en_US",
            "timezone_id" : "UTC",
            "format": "yyyy-MM-dd HH:mm:ss"
        }, actionVerb("Reformat") + " date");
    }

    /* Text also gets some text handling, but in more Map unlike FreeText */
    if (typeIs("Text")) {
        addStepBasedSuggestion(moreMap, "Text", null, "Tokenizer", {
             'inCol': columnName,
             'operation' : 'TO_JSON',
             'language' : 'english'
         }, actionVerb("Split") + " in words (tokenize)");
         addStepBasedSuggestion(moreMap, "Text", null, "TextSimplifierProcessor", {
             'inCol': columnName,
             'normalize':true,
             'language' : 'english'
         }, actionVerb("Normalize") + " text");
    }

    addStepBasedSuggestion(moreMap, "Transformations", null, "ColumnCopier", {
        "inputColumn": columnName,
        "outputColumn": columnName+"_copy"
    }, actionVerb("Duplicate") + " column");

    if (!multi) {
        addAppliesToSuggestion(moreMap, "Transformations", null, "FindReplace", {
            "output": "",
            "mapping": [],
            "matching" : "FULL_STRING",
            "normalization" : "EXACT"
        }, actionVerb("Find") +" and " + actionVerb("replace") + "...", true);
        addStepBasedSuggestion(
            ["DoubleMeaning", "LongMeaning"].indexOf(typeName) === -1 ? moreMap : map,
            "Numbers", null, "CreateColumnWithGREL",{
                "column" : columnName,
                "expression" : columnName.match(/^[a-z0-9_]+$/i) ? columnName : `val("${columnName}")`
            }, actionVerb("Process") + " with formula...");
    } else {
        addCustomSuggestion(moreMap, "Transformations", null, function(shakerScope) {
            report("shaker-use-col-sugg", "ColumnsConcat", "Concatenate columns")();
            shakerScope.addUnconfiguredStep("ColumnsConcat",
                { columns: columnNames, join: ',' });
            shakerScope.autoSave();
        }, actionVerb("Concatenate") +" columns");
        addCustomSuggestion(moreMap, "Transformations", null, function(shakerScope) {
            report("shaker-use-col-sugg", "NestProcessor", "Nest columns")();
            shakerScope.addUnconfiguredStep("NestProcessor",
                { columns: columnNames, join: ',', appliesTo: 'COLUMNS' });
            shakerScope.autoSave();
        }, actionVerb("Nest") + " columns to object");
        addCustomSuggestion(moreMap, "Transformations", null, function(shakerScope) {
            report("shaker-use-col-sugg", "MultiColumnFold", "Fold columns")();
            shakerScope.addUnconfiguredStep("MultiColumnFold",
                { columns: columnNames, join: ',' });
            shakerScope.autoSave();
        }, actionVerb("Fold ") + " columns");
        addCustomSuggestion(moreMap, "Transformations", null, function(shakerScope) {
            report("shaker-use-col-sugg", "FindReplace", "Find & replace")();
            shakerScope.addUnconfiguredStep("FindReplace",
                { columns: columnNames, join: ',', appliesTo: 'COLUMNS'});
            shakerScope.autoSave();
        }, actionVerb("Find") + " and " + actionVerb("replace") + " in columns");
    }

    if (Object.keys(map).length === 0) { // shift
        map = moreMap;
        moreMap = {};
    }
    return [map, moreMap, Object.keys(moreMap).length];
};

return svc;
});


})();
