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

(function() {
'use strict';

/* Base directives for the "exploration-only" part of shaker */

// Base_explore is the first loaded and creates the module.
const app = angular.module('dataiku.shaker', ['dataiku.filters', 'platypus.utils']);


app.directive("shakerExploreBase", function(Logger, $filter, $rootScope) {

    return {
        scope: true,
        priority : 100,
        controller : function($scope, $stateParams, $state, DataikuAPI, CachedAPICalls, $filter, CreateModalFromTemplate, WT1, ActivityIndicator, $timeout, $q, Debounce, MonoFuture, GraphZoomTrackerService, computeColumnWidths, SmartId){
            $scope.isRecipe = false;

            GraphZoomTrackerService.setFocusItemByName("dataset", $stateParams.datasetName);

            $scope.shakerState = {
                activeView: 'table',
                quickColumnsView: false,

                lockedHighlighting : []
            }

            // Real controller inserts its hooks here
            $scope.shakerHooks = {
                isMonoFuturizedRefreshActive: function(){}, // NOSONAR: OK to have an empty function

                // Returns a promise when save is done
                saveForAuto: undefined,
                // Returns a promise that resolves with a future for the refresh
                getRefreshTablePromise: undefined,

                // Sets the meaning of a column
                setColumnMeaning : undefined,

                // Sets the storage type of a column
                getSetColumnStorageTypeImpact : undefined,
                setColumnStorageType : undefined,

                // Should open a box to edit the details of the column
                // (meaning, storage type, description)
                editColumnDetails : undefined,

                // Hook called in parallel to the table refresh
                onTableRefresh : function(){}, // NOSONAR: OK to have an empty function that does nothing by default
                // Hook called after the table refresh
                afterTableRefresh : function(){}, // NOSONAR: OK to have an empty function that does nothing by default

                // analysis modal :
                // - fetch the detailed analysis of a column
                fetchDetailedAnalysis : undefined,
                // - get clusters
                fetchClusters : undefined,
                // - compute text analysis
                fetchTextAnalysis : undefined
            }

            Mousetrap.bind("r s", function(){
                DataikuAPI.shakers.randomizeColors();
                $scope.refreshTable(false);
            })

            Mousetrap.bind("alt+a", function(){
                $scope.$apply(function(){
                    $scope.shaker.exploreUIParams.autoRefresh = !$scope.shaker.exploreUIParams.autoRefresh;
                    ActivityIndicator.success("Auto refresh is now " +
                        ($scope.shaker.exploreUIParams.autoRefresh ? "enabled" : "disabled"));
                    if ($scope.shaker.exploreUIParams.autoRefresh) {
                        $scope.autoSaveAutoRefresh();
                    }
                });
            })

            $scope.$on("$destroy", function(){
                Mousetrap.unbind("r s");
                Mousetrap.unbind("alt+a")
            })

            function id(dataset) {
                //if the current dataset is foreign, force the use of full dataset names (equi-joiner for example requires it)
                if ($scope.inputDatasetProjectKey != $stateParams.projectKey) {
                    return dataset.projectKey + '.' + dataset.name;
                } else {
                    return dataset.smartName;
                }
            }

            $scope.datasetHref = function() {
                if (!$scope.dataset) {return ''}
                return $state.href('projects.project.datasets.dataset.explore', {datasetName: $scope.dataset.name});
            }
            /** Called by the real controller to fetch required data once context has been set */
            $scope.baseInit = function() {
                if ($scope.inputDatasetName) {

                    if ($rootScope.topNav.isProjectAnalystRO) {
                        DataikuAPI.datasets.getFullInfo($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName).success(function(data){
                            $scope.datasetFullInfo = data;
                        }).error(setErrorInScope.bind($scope));

                        DataikuAPI.datasets.get($scope.inputDatasetProjectKey, $scope.inputDatasetName, $stateParams.projectKey)
                        .success(function(data) {
                            $scope.dataset = data;
                        }).error(setErrorInScope.bind($scope));
                        var opts = {
                            datasetsOnly : true
                        };
                        DataikuAPI.flow.listUsableComputables($stateParams.projectKey, opts).success(function(computables) {
                            $scope.datasetNames = $.map(computables, function(val) {
                                return id(val);
                            });
                        }).error(setErrorInScope.bind($scope));

                        DataikuAPI.datasets.get_types().success(function(data) {
                            $scope.dataset_types = data;
                        }).error(setErrorInScope.bind($scope));

                        $scope.datasetColumns = {};
                        $scope.getDatasetColumns = function(datasetId) { // datasetId is something id() would return
                            // only for input datasets. Only once (we don't care if the schema is changing while we edit the shaker)
                            if ($scope.datasetNames.indexOf(datasetId) >= 0 && !(datasetId in $scope.datasetColumns)) {
                                let resolvedSmartId = SmartId.resolve(datasetId, $stateParams.projectKey);
                                $scope.datasetColumns[datasetId] = [];
                                DataikuAPI.datasets.get(resolvedSmartId.projectKey, resolvedSmartId.id, $stateParams.projectKey).success(function(dataset){
                                    $scope.datasetColumns[datasetId] = $.map(dataset.schema.columns, function(el) {
                                        return el.name;
                                    });
                                    // and let the digest update the UI...
                                }).error(setErrorInScope.bind($scope));
                            }
                            return $scope.datasetColumns[datasetId];
                        };
                    }
                }

                CachedAPICalls.processorsLibrary.success(function(processors){
                    $scope.processors = processors;
                }).error(setErrorInScope.bind($scope));

            }

            /** Real handler calls this once $scope.shaker is set to fixup incomplete scripts */

            $scope.fixupShaker = function(shaker) {
                shaker = shaker || $scope.shaker;
                if (shaker.exploreUIParams == null) {
                    shaker.exploreUIParams = {};
                }
                if (shaker.exploreUIParams.autoRefresh == null) {
                    shaker.exploreUIParams.autoRefresh = true;
                }
                if (shaker.explorationFilters == null) {
                    shaker.explorationFilters = [];
                }
            }

            $scope.$watch("shaker.steps", function(nv, ov){
                if (!nv) return;
                 function _addChange(s) {
                    if (s.metaType == "GROUP") {
                        if (s.steps) {
                            s.steps.forEach(_addChange);
                        }
                    }
                    if (s.$stepState == null) {
                        s.$stepState = {}
                    }
                }
                $scope.shaker.steps.forEach(_addChange);
            }, true);

            $scope.invalidScriptError = {};

            $scope.forgetSample = function() {
                $scope.requestedSampleId = null;
            };


            $scope.saveOnly = function() {
                $scope.shakerHooks.saveForAuto().then(function(){
                    ActivityIndicator.success("Changes saved");
                });
            };

            $scope.getSampleDesc = function() {
                if (!$scope.table) return "-";
                var nbRows = $scope.table ? $scope.table.initialRows : 0;
                var nbCols = $scope.table ? $scope.table.initialCols : 0;
                var desc = '<strong>' + nbRows + '</strong> row';
                if (nbRows > 1) {
                    desc += 's';
                }
                desc += ' <strong>' + nbCols + '</strong> col';
                if (nbCols > 1) {
                    desc += 's';
                }
                return desc;
            }



            $scope.$on('refresh-table',function() {
                $scope.autoSaveForceRefresh();
            });

            /* Save if auto-save is enabled and force a refresh */
            $scope.autoSaveForceRefresh = function() {
                if (!$scope.isRecipe && $scope.canWriteProject()) {
                    $scope.shakerHooks.saveForAuto();
                }
                $scope.refreshTable(false);
            };

            $scope.autoSave = function() {
                if (!$scope.isRecipe && $scope.canWriteProject()) {
                    $scope.shakerHooks.saveForAuto();
                }
            };

            // returns relevant shaker data, a fat-free data only object
            // without the change information.
            $scope.getShakerData = function() {
                // get only own property stuff.
                if ($scope.shaker == undefined)  {
                    return undefined;
                }

                function clearOne(step) {
                    if (step.metaType == "GROUP") {
                        step.steps.forEach(clearOne);
                    } else {
                        delete step.$stepState;
                        delete step.$$hashKey;
                    }
                }

                var shakerData = JSON.parse(JSON.stringify($scope.shaker));
                shakerData.steps.forEach(clearOne);
                return shakerData;
            };

            // formerShakerData is supposed to hold the last shaker state for which we updated
            // the table.
            $scope.setFormerShakerData = function() {
                $scope.formerShakerData = $scope.getShakerData();
            }

            /* Save if auto-save is enabled and refresh if auto-refresh is enabled */
            $scope.autoSaveAutoRefresh = function() {
                var shakerData = $scope.getShakerData();

                if (angular.equals(shakerData, $scope.formerShakerData)) {
                    // nothing has changed, we don't have to do this.
                    return;
                }

                $scope.autoRefreshDirty = true;
                if ($scope.isRecipe){
                    if ($scope.shaker.exploreUIParams.autoRefresh) {
                        $scope.refreshTable(false);
                    }
                } else {
                    if ($scope.shaker.exploreUIParams.autoRefresh) {
                        $scope.shakerHooks.saveForAuto();
                        $scope.refreshTable(false);
                    } else {
                        $scope.saveOnly();
                        $scope.autoRefreshDirty = true;
                        $scope.setFormerShakerData();
                    }
                }
            };

            $scope.getProcessorIcon = function(processor) {
                return getStepIcon(processor.type,processor.params);
            };

            $scope.$on("overrideTableUpdated", function(){
                $scope.autoSaveAutoRefresh();
            });

            function clearErrors(step) {
                step.$stepState.frontError = null;
                step.$stepState.backendError = null;
                if (step.metaType == "GROUP") {
                    step.steps.forEach(clearErrors);
                }
            }

            function mergeChanges(step, change) {
                step.$stepState.change = change;
                step.designTimeReport = change.recordedReport;
                if (step.metaType == "GROUP") {
                    step.steps.forEach(function(substep, i){
                        if (change.groupStepsChanges && change.groupStepsChanges[i]){
                            mergeChanges(substep, change.groupStepsChanges[i]);
                        } else {
                            substep.$stepState.change = null;
                            step.designTimeReport = null;
                        }
                    });
                }
            }
            function mergeBackendErrors(step, errHolder) {
                if (errHolder.error) {
                    step.$stepState.backendError = errHolder.error;
                } else {
                    step.$stepState.backendError = null;
                }
                if (step.metaType == "GROUP") {
                    step.steps.forEach(function(substep, i){
                        if (step.children && step.children[i]){
                            mergeChanges(substep, step.children[i]);
                        } else {
                            substep.$stepState.backendError = null;
                        }
                    });
                }
            }

            $scope.onRefreshFutureDone = function(filtersOnly) {
                $scope.shakerState.runError = null;
                $scope.shakerState.initialRefreshDone = true;
                $scope.requestedSampleId = $scope.future.result.usedSampleId;
                $scope.invalidScriptError = {};

                $scope.shakerState.lockedHighlighting = [];

                $scope.table = $scope.future.result;
                $scope.setSpinnerPosition(undefined);
                $scope.lastRefreshCallTime = (new Date().getTime()-$scope.refreshCallBeg);
                $scope.updateFacetData();

                $scope.shaker.columnsSelection = $scope.table.newColumnsSelection;

                $scope.shaker.steps.forEach(function(step, i){
                    if ($scope.table.scriptChange.groupStepsChanges[i] != null) {
                        mergeChanges(step, $scope.table.scriptChange.groupStepsChanges[i]);
                    }
                })

                $scope.shakerState.hasAnyComment = false;
                $scope.shakerState.hasAnyCustomFields = false;

                var getNoFakeExtremeDoubleDecimalPercentage = function(numerator, denominator) {
                    var result = numerator * 10000 / denominator;
                    switch (Math.round(result)) {
                        case 0:
                            result = result == 0 ? 0 : 1;
                            break;
                        case 10000:
                            result = result == 10000 ? 10000 : 9999;
                            break
                        default:
                            result = Math.round(result);
                    }
                    return result / 100;
                }

                $scope.columns = $.map($scope.table.headers, function(header) {
                    if (header.selectedType) {
                        header.selectedType.totalCount = (header.selectedType.nbOK + header.selectedType.nbNOK + header.selectedType.nbEmpty);
                        header.okPercentage = getNoFakeExtremeDoubleDecimalPercentage(header.selectedType.nbOK, header.selectedType.totalCount);
                        header.emptyPercentage = !header.selectedType.nbEmpty ? 0 : getNoFakeExtremeDoubleDecimalPercentage(header.selectedType.nbEmpty, header.selectedType.totalCount);
                        header.nonemptyPercentage = header.selectedType.nbEmpty == null ? 0 : getNoFakeExtremeDoubleDecimalPercentage(header.selectedType.totalCount - header.selectedType.nbEmpty, header.selectedType.totalCount);
                        header.nokPercentage = !header.selectedType.nbNOK ? 0 : getNoFakeExtremeDoubleDecimalPercentage(header.selectedType.nbNOK, header.selectedType.totalCount);

                        if (header.deletedMeaningName) {
                            header.meaningLabel = header.deletedMeaningName + ' (deleted)';
                        } else {
                            header.meaningLabel = $filter('meaningLabel')(header.selectedType.name);
                        }
                    }

                    /* Check if this column has a comment */
                    if (header.recipeSchemaColumn && header.recipeSchemaColumn.column.comment) {
                        $scope.shakerState.hasAnyComment = true;
                        header.comment = header.recipeSchemaColumn.column.comment
                    }
                    if (header.datasetSchemaColumn && header.datasetSchemaColumn.comment) {
                        $scope.shakerState.hasAnyComment = true;
                        header.comment = header.datasetSchemaColumn.comment
                    }
                    if ($scope.shaker.origin == "ANALYSIS" &&
                       $scope.shaker.analysisColumnData[header.name] &&
                       $scope.shaker.analysisColumnData[header.name].comment) {
                        $scope.shakerState.hasAnyComment = true;
                        header.comment = $scope.shaker.analysisColumnData[header.name].comment;
                    }

                    /* Check if this column has preview custom fields */
                    function addCustomFieldsPreviews(customFields) {
                        const ret = [];
                        const customFieldsMap = $rootScope.appConfig.customFieldsMap['COLUMN'];
                        for (let i = 0; i < customFieldsMap.length; i++) {
                            const selectCFList = (customFieldsMap[i].customFields || []).filter(cf => cf.type == 'SELECT');
                            for (let j = 0; j < selectCFList.length; j++) {
                                const cfDef = selectCFList[j];
                                const value = (cfDef.selectChoices || []).find(choice => choice.value == (customFields && customFields[cfDef.name] || cfDef.defaultValue));
                                if (value && value.showInColumnPreview) {
                                    ret.push({definition: cfDef, value: value});
                                }
                            }
                        }
                        return ret;
                    }
                    $scope.customFieldsMap = $rootScope.appConfig.customFieldsMap['COLUMN'];
                    if (header.recipeSchemaColumn) {
                        header.customFields = header.recipeSchemaColumn.column.customFields;
                    }
                    if (header.datasetSchemaColumn) {
                        header.customFields = header.datasetSchemaColumn.customFields;
                    }
                    if ($scope.shaker.origin == "ANALYSIS" &&
                        $scope.shaker.analysisColumnData[header.name]) {
                        header.customFields = $scope.shaker.analysisColumnData[header.name].customFields;
                    }
                    const cfPreviews = addCustomFieldsPreviews(header.customFields);
                    if (cfPreviews.length > 0) {
                        $scope.shakerState.hasAnyCustomFields = true;
                        header.customFieldsPreview = cfPreviews;
                    }

                    return header.name;
                });
                if ($scope.shakerState.activeView === 'table') {
                    $scope.setQuickColumns();
                    $scope.clearQuickColumnsCache();
                }
                if ($scope.isRecipe && $scope.table.newRecipeSchema) {
                    $scope.recipeOutputSchema = $scope.table.newRecipeSchema;
                }
                $scope.$broadcast("shakerTableChanged");



                getDigestTime($scope, function(time) {
                    $scope.lastRefreshDigestTime = time;
                    $scope.$broadcast("reflow");
                    WT1.event("shaker-table-refreshed", {
                        "activeFFs" : $scope.shaker.explorationFilters.length,
                        "backendTime" : $scope.lastRefreshCallTime,
                        "digestTime" : time,
                        "numCols" : $scope.table.headers.length,
                        "totalKeptRows" : $scope.table.totalKeptRows,
                        "totalRows" : $scope.table.totalRows
                    });
                });
            };
            $scope.onRefreshFutureFailed = function(data, status, headers) {
                $scope.shakerState.runError = null;
                $scope.shakerState.initialRefreshDone = true;
                $scope.setSpinnerPosition(undefined);
                if(data && data.hasResult && data.aborted) {
                    return; // Abortion is not an error
                }
                var apiErr = getErrorDetails(data, status, headers);
                $scope.shakerState.runError = apiErr;

                if (apiErr.errorType == "ApplicativeException" && apiErr.code == "STEP_RUN_EXCEPTION" && apiErr.payload) {
                    $scope.shaker.steps.forEach(function(step, i){
                        if (apiErr.payload.children[i] != null) {
                            mergeBackendErrors(step, apiErr.payload.children[i]);
                        }
                    })
                }
                if ($scope.refreshTableFailed) {
                    $scope.refreshTableFailed(data, status, headers);
                }
            };

            $scope.showWarningsDetails = function(){
                CreateModalFromTemplate("/templates/shaker/warnings-details.html", $scope);
            }

            $scope.markSoftDisabled = function(){
                function _mark(s, isAfterPreview) {
                    if (isAfterPreview) {
                        s.$stepState.softDisabled = true;
                    }
                    if (s.metaType == "GROUP") {
                        if (s.steps) {
                            for (var i = 0; i < s.steps.length; i++) {
                                isAfterPreview = _mark(s.steps[i], isAfterPreview);
                            }
                        }
                    }
                    if (s.preview) {
                        $scope.stepBeingPreviewed = s;
                        return true;
                    }
                    return isAfterPreview
                }
                $scope.stepBeingPreviewed = null;
                var isAfterPreview = false;
                for (var i = 0; i < $scope.shaker.steps.length; i++) {
                    isAfterPreview = _mark($scope.shaker.steps[i], isAfterPreview);
                }
            }

            $scope.hasAnySoftDisabled = function(){
                var hasAny = false;
                function _visit(s) {
                    if (s.metaType == "GROUP") {
                        s.steps.forEach(_visit);
                    }
                    if (s.$stepState.softDisabled) hasAny = true;
                }
                $scope.shaker.steps.forEach(_visit);
                return hasAny;
            }

            // Make sure that every step after a preview is marked soft-disabled
            $scope.fixPreview = function() {
                $scope.markSoftDisabled();
                // var disable = false;
                // for (var i = 0; i < $scope.shaker.steps.length; i++) {
                //     if(disable) {
                //         $scope.shaker.steps[i].disabled = true;
                //     }
                //     if($scope.shaker.steps[i].preview) {
                //         disable=true;
                //     }
                // }
                // #2459
                if ($scope.dataset && $scope.dataset.partitioning && $scope.dataset.partitioning.dimensions){
                    if (!$scope.dataset.partitioning.dimensions.length && $scope.shaker.explorationSampling.selection.partitionSelectionMethod != "ALL") {
                        Logger.warn("Partition-based sampling requested on non partitioned dataset. Force non-partitioned sample.")
                        $scope.shaker.explorationSampling.selection.partitionSelectionMethod = "ALL";
                        delete $scope.shaker.explorationSampling.selection.selectedPartitions;
                    }
                }

            };

            /**
            * Refreshes the whole table
            * Set "filtersOnly" to true if this refresh is only for a change of filters / facets
            */
            $scope.refreshTable = function(filtersOnly){
                CachedAPICalls.processorsLibrary.success(function(){
                    if ($scope.validateScript){
                        if (!$scope.validateScript()) {
                            Logger.info("Aborted refresh: script is invalid");
                            ActivityIndicator.error("Not refreshing: script is invalid !");
                            return;
                        }
                    }
                    $scope.refreshTable_(filtersOnly);
                });
            };

            const refreshDebounce = Debounce();
            $scope.refreshTable_ = refreshDebounce
                .withDelay(100,500)
                .withSpinner(!$scope.refreshNoSpinner)
                .withScope($scope)
                .wrap(function(filtersOnly){
                    if (!angular.isDefined(filtersOnly)) throw new Exception();
                    $scope.fixPreview();
                    var filterRequest = $scope.buildFilterRequest();
                    $scope.setFormerShakerData();

                    $scope.shaker.steps.forEach(clearErrors);

                    $scope.$broadcast("scrollToLine", 0);

                    $scope.refreshCallBeg  = new Date().getTime();
                    $scope.future = null;

                    $scope.shakerHooks.onTableRefresh();

                    $scope.shakerHooks.getRefreshTablePromise(filtersOnly, {"elements": filterRequest})
                    .update(function(future) {
                        $scope.autoRefreshDirty = true;
                        $scope.future = future;
                    }).success(function(future) {
                        $scope.autoRefreshDirty = false;
                        Logger.info("Got table data");
                        $scope.future = future;
                        $scope.onRefreshFutureDone(filtersOnly);
                        $scope.shakerHooks.afterTableRefresh();
                    }).error(function(data,status,headers) {
                        $scope.future = null;
                        $scope.onRefreshFutureFailed(data,status,headers);
                        $scope.shakerHooks.afterTableRefresh();
                    });
            });

            /**
             * Checks weather there is a pending debounced refresh. and if the MonoFuturizedRefresh has an empty refresh queue
             */
            $scope.allRefreshesDone = function() {
                return !refreshDebounce.active() && !$scope.shakerHooks.isMonoFuturizedRefreshActive();
            };

            /**
            * Waits for all RefreshTable calls to be resolved. Returns a promise.
            */
            $scope.waitAllRefreshesDone = function () {
                const deferred = $q.defer();
                const inter = setInterval(
                    function () {
                        if ($scope.allRefreshesDone()) {
                            clearInterval(inter);
                            deferred.resolve();
                        }
                    }, 500);
                return deferred.promise;
            }

            /**
            * Fetches a chunk of the table. Returns a promise.
            * Out of bound is NOT handled, and will throw.
            */
            $scope.getTableChunk = function(firstRow, nbRows, firstCol, nbCols) {
                var deferred = $q.defer();
                var filterRequest = $scope.buildFilterRequest();
                $scope.shakerHooks.getTableChunk(firstRow, nbRows, firstCol, nbCols,
                        {"elements":filterRequest}).success(deferred.resolve)
                .error(function(a,b,c) {
                    deferred.reject();
                    setErrorInScope.bind($scope)(a,b,c)
                });
                return deferred.promise;
            };

            $scope.analyseColumn = function(column, columns) {
                CreateModalFromTemplate("/templates/shaker/analyse-box.html",
                    $scope, "ColumnAnalysisController", function(newScope) {
                        newScope.setColumn(column, columns || $scope.table.headers);
                    }, "analyse-box");
            };

            $scope.editColumnDetails = function(column) {
                CreateModalFromTemplate("/templates/shaker/modals/shaker-edit-column.html",
                    $scope, null, function(newScope) {
                        newScope.setColumn(column);
                    });
            }

            $scope.scrollToColumn = $scope.$broadcast.bind($scope, 'scrollToColumn'); // broadcast to child fattable
            $scope.$watch('shakerState.activeView', function(nv) {
                if ($scope.shakerState.activeView === 'table') {
                    $scope.setQuickColumns();
                }
            });
            $scope.setQuickColumns = function(qc) {
                $scope.quickColumns = qc || ($scope.table && $scope.table.headers || []);
            };
            $scope.clearQuickColumnsCache = function() {
                $scope.quickColumnsCache = {};
            };
            $scope.quickColumns = [];
            $scope.quickColumnsCache = {};

            $scope.setDisplayModeMeaning = function(){
                $scope.shaker.coloring.scheme = "MEANING_AND_STATUS";
                $scope.autoSaveForceRefresh();
            }
            $scope.setDisplayModeValuesAllColumn = function(){
                $scope.shaker.coloring.scheme = "ALL_COLUMNS_VALUES";
                $scope.autoSaveForceRefresh();
            }
            $scope.setDisplayModeSingleColumnValues = function(column){
                $scope.shaker.coloring.scheme = "SINGLE_COLUMN_VALUES";
                $scope.shaker.coloring.singleColumn = column;
                $scope.autoSaveForceRefresh();
            }
            $scope.setDisplayModeIndividualToggleOne = function(column) {
                var c = $scope.shaker.coloring;
                if (c.scheme == "INDIVIDUAL_COLUMNS_VALUES") {

                    if (c.individualColumns.indexOf(column) >=0) {
                        c.individualColumns.splice(c.individualColumns.indexOf(column), 1);
                    } else {
                        c.individualColumns.push(column);
                    }
                } else {
                    c.scheme = "INDIVIDUAL_COLUMNS_VALUES";
                    c.individualColumns = [column];
                }
                $scope.autoSaveForceRefresh();
            }
            $scope.sortDirection = function(column) {
                var sortElem = ($scope.shaker.sorting || []).filter(function(e) {return e.column == column;})[0];
                return sortElem == null ? null : sortElem.ascending;
            };
            $scope.toggleSort = function(column) {
                if ($scope.shaker.sorting == null) {
                    $scope.shaker.sorting = [];
                }
                var sorting = $scope.shaker.sorting;
                if (sorting.length == 1 && sorting[0].column == column) {
                    sorting[0].ascending = !sorting[0].ascending;
                } else {
                    $scope.shaker.sorting = [{column:column, ascending:true}];
                }
                $scope.autoSaveForceRefresh();
            }
            $scope.addSort = function(column) {
                if ($scope.shaker.sorting == null) {
                    $scope.shaker.sorting = [];
                }
                var sorting = $scope.shaker.sorting;
                var matching = sorting.filter(function(s) {return s.column == column;});
                if (matching.length > 0) {
                    matching[0].ascending = !matching[0].ascending;
                } else {
                    $scope.shaker.sorting.push({column:column, ascending:true});
                }
                $scope.autoSaveForceRefresh();
            }

            $scope.openColumnsSelectionModal = function(){
                CreateModalFromTemplate("/templates/shaker/select-columns-modal.html", $scope);
            }
            $scope.openSortSelectionModal = function(){
                CreateModalFromTemplate("/templates/shaker/select-sort-modal.html", $scope);
            }
            $scope.clearSort = function(column) {
                if (column && $scope.shaker.sorting) {
                    var sorting = $scope.shaker.sorting;
                    var matching = sorting.filter(function(s) {return s.column == column;});
                    if (matching.length > 0) {
                        sorting.splice(sorting.indexOf(matching[0]), 1);
                    }
                } else {
                    $scope.shaker.sorting = [];
                }
                $scope.autoSaveForceRefresh();
            }

            $scope.clearResize = function() {
                const minColumnWidth = 100;
                $scope.shaker.columnWidthsByName = computeColumnWidths($scope.table.initialChunk, $scope.table.headers, minColumnWidth, $scope.hasAnyFilterOnColumn, $scope.shaker.columnWidthsByName, true)[1];
                $scope.autoSaveAutoRefresh();
            }

            this.$scope = $scope; // fugly
        }
    }
});

app.directive('quickColumnsView', function(DataikuAPI, Fn, Debounce, MonoFuture, $filter, $stateParams) {
    var COLUMN_CHUNK = 50,
        dateFmt = Fn(function(d){ return new Date(d); }, d3.time.format('%Y-%m-%d %H:%M')),
        numFmt = $filter('smartNumber');
    return {
        scope: true,
        require: '^shakerExploreBase',
        templateUrl: '/templates/shaker/quick-columns-view.html',
        link: function(scope, element, attrs, exploreCtrl) {
            var monoLoad = [];
            scope.$watch('shakerState.quickColumnsView', function(qcv) {
                scope.setShowRightPane(qcv);
                scope.quickColumnsView = scope.shakerState.quickColumnsView;
            });
            scope.initColumnScope = function(cScope) {
                if (!cScope.col) return;
                cScope.activateColBar = scope.activateBar.bind(null, cScope);
            };
            scope.quickColumnsChanged = function() {
                scope.quickColumnsFilterChanged(scope.quickColumnsFilter);
            };
            scope.quickColumnCacheCleared = function() {
                monoLoad.forEach(function(m){ if (m.running) m.abort(); });
            };
            scope.quickColumnsFilter = '';
            scope.quickColumnsFilterChanged = function(nv) {
                scope.quickColumnCacheCleared();
                scope.quickColumnsFiltered = !nv ? scope.quickColumns : scope.quickColumns.filter(
                    function(c) { return c.name.toLowerCase().indexOf(this) >= 0; }, nv.toLowerCase());
                // append MonoFuture at will
                for (var i = monoLoad.length; i < Math.ceil(scope.quickColumnsFiltered.length / COLUMN_CHUNK); i++) {
                    monoLoad[i] = MonoFuture(scope);
                }
            };
            // Can’t use PagedAsyncTableModel because of divergent invalidation policy:
            // cache is kept when closing QCV or filtering columns,
            // but reset when editing shaker steps
            scope.tableModel = function() {
                var model = new fattable.TableModel();
                model.hasCell = Fn.cst(true); // always drawable
                model.getCell = function(i, j, cb) {
                    if (!scope.quickColumnsView) return;
                    var page = Math.floor(i / COLUMN_CHUNK);
                    // Initiate block fetch...
                    loadQuickColumns(page, cb);
                    // ...but render immediately (name, type, validity)
                    cb(scope.quickColumnsFiltered[i]);
                };
                return model;
            };
            function loadQuickColumns(page, cb) {
                if (monoLoad[page].running) return;
                var uncached = scope.quickColumnsFiltered
                    .slice(page * COLUMN_CHUNK, (page + 1) * COLUMN_CHUNK)
                    .map(Fn.prop('name'))
                    .filter(Fn.not(Fn.dict(scope.quickColumnsCache)));
                if (!uncached.length) return;
                monoLoad[page].running = true;
                monoLoad[page].exec(
                    DataikuAPI.shakers.multiColumnAnalysis(
                        $stateParams.projectKey,
                        scope.inputDatasetProjectKey, scope.inputDatasetName, scope.inputStreamingEndpointId,
                        scope.shakerHooks.shakerForQuery(),
                        scope.requestedSampleId, uncached, '*', 40))
                .success(function(data){
                    monoLoad[page].running = false;
                    if (!data.hasResult) return;
                    data = data.result;
                    for (var k in data) {
                        if (data[k].facets) {
                            scope.quickColumnsCache[k] = {
                                values: data[k].facets.counts,
                                labels: data[k].facets.values
                            };
                        } else {
                            scope.quickColumnsCache[k] = { values: data[k].histogram };
                            var col = scope.quickColumns.filter(Fn(Fn.prop("name"), Fn.eq(k)))[0],
                                fmt = col && col.selectedType && col.selectedType.name === 'Date' ? dateFmt : numFmt;
                            scope.quickColumnsCache[k].labels =
                              data[k].histogramLowerBounds.map(fmt).map(
                                function(lb, i) { return lb + " - " + this[i]; },
                                data[k].histogramUpperBounds.map(fmt))
                        }
                    }
                }).error(function() {
                    monoLoad[page].running = false;
                    setErrorInScope.apply(exploreCtrl.$scope, arguments);
                });
            }
            scope.$watch('quickColumnsCache', scope.quickColumnCacheCleared);
            scope.$watch('quickColumns', scope.quickColumnsChanged, true);
            scope.$watch('quickColumnsFilter',
                Debounce().withDelay(150,300).withScope(scope).wrap(scope.quickColumnsFilterChanged));
            scope.activateBar = function(colScope, value, i) {
                colScope.setLabels(value !== null ? {
                    pop: value.toFixed(0),
                    label: scope.quickColumnsCache[colScope.col.name].labels[i],
                    part: (colScope.col.selectedType ? (value * 100 / colScope.col.selectedType.totalCount).toFixed(1) + '&nbsp;%' : '')
                } : null);
            };
            scope.defaultAction = !scope.scrollToColumn ? null :
                function(column) { scope.scrollToColumn(column.name); };
        }
    };
});

/**
 * Base directive for all instances where a shaker table is made on a dataset
 * (explore, analysis script, prepare recipe).
 * (Counter examples: predicted data)
 */
app.directive("shakerOnDataset", function() {
    return {
        scope: true,
        controller  : function ($scope, $state, $stateParams, DataikuAPI, MonoFuture) {
            const monoFuture = MonoFuture($scope);
            const monoFuturizedRefresh = monoFuture.wrap(DataikuAPI.shakers.refreshTable);

            $scope.shakerState.onDataset = true;

            $scope.shakerHooks.isMonoFuturizedRefreshActive = monoFuture.active;

            $scope.shakerHooks.shakerForQuery = function(){
                var queryObj = angular.copy($scope.shaker);
                if ($scope.isRecipe) {
                    queryObj.recipeSchema = $scope.recipeOutputSchema;
                }
                queryObj.contextProjectKey = $stateParams.projectKey; // quick 'n' dirty, but there are too many call to bother passing the projectKey through them
                return queryObj;
            }

            $scope.shakerHooks.updateColumnWidth = function(name, width) {
                $scope.shaker.columnWidthsByName[name] = width;
                $scope.autoSaveAutoRefresh();
            };

            $scope.shakerHooks.getRefreshTablePromise = function(filtersOnly, filterRequest) {
                var ret = monoFuturizedRefresh($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId, filtersOnly, filterRequest);

                return $scope.refreshNoSpinner ? ret.noSpinner() : ret;
            };

            /**
            * Fetches a chunk of the table. Returns a promise.
            * Out of bound is NOT handled, and will throw.
            */
            $scope.shakerHooks.getTableChunk = function(firstRow, nbRows, firstCol, nbCols, filterRequest) {
                return DataikuAPI.shakers.getTableChunk(
                    $stateParams.projectKey,
                    $scope.inputDatasetProjectKey,
                    $scope.inputDatasetName,
                    $scope.shakerHooks.shakerForQuery(),
                    $scope.requestedSampleId,
                    firstRow,
                    nbRows,
                    firstCol,
                    nbCols,
                    filterRequest);
            }

            $scope.shakerHooks.fetchDetailedAnalysis = function(setAnalysis, handleError, columnName, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics) {
                DataikuAPI.shakers.detailedColumnAnalysis($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId, columnName, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics).success(function(data){
                            setAnalysis(data);
                }).error(function(a, b, c) {
                    if (handleError) {
                        handleError(a, b, c);
                    }    
                    setErrorInScope.bind($scope)(a, b, c);
                });
            };
            $scope.shakerHooks.fetchClusters = function(setClusters, columnName, setBased, radius, timeOut, blockSize) {
                DataikuAPI.shakers.getClusters($stateParams.projectKey,
                    $scope.inputDatasetProjectKey, $scope.inputDatasetName,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId,
                        columnName, setBased, radius, timeOut, blockSize
                    ).success(function(data) {
                        setClusters(data);
                    }).error(setErrorInScope.bind($scope));
            };
            $scope.shakerHooks.fetchTextAnalysis = function(setTextAnalysis, columnName, textSettings) {
                DataikuAPI.shakers.textAnalysis(
                        $stateParams.projectKey,
                        $scope.inputDatasetProjectKey, $scope.inputDatasetName,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId,
                        columnName, textSettings)
                    .success(function(data){setTextAnalysis(data);})
                    .error(setErrorInScope.bind($scope));
            };
        }
    }
});

/**
 * Base directive for all instances where a shaker table is made on a streaming endpoint
 */
app.directive("shakerOnStreamingEndpoint", function() {
    return {
        scope: true,
        controller  : function ($scope, $state, $stateParams, DataikuAPI, MonoFuture, WT1) {
            const monoFuture = MonoFuture($scope);
            const monoFuturizedRefresh = monoFuture.wrap(DataikuAPI.shakers.refreshCapture);

            $scope.shakerState.onDataset = false;

            $scope.shakerHooks.isMonoFuturizedRefreshActive = monoFuturizedRefresh.active;

            $scope.shakerHooks.shakerForQuery = function(){
                var queryObj = angular.copy($scope.shaker);
                if ($scope.isRecipe) {
                    queryObj.recipeSchema = $scope.recipeOutputSchema;
                }
                queryObj.contextProjectKey = $stateParams.projectKey; // quick 'n' dirty, but there are too many call to bother passing the projectKey through them
                return queryObj;
            }

            $scope.shakerHooks.updateColumnWidth = function(name, width) {
                $scope.shaker.columnWidthsByName[name] = width;
                $scope.autoSaveAutoRefresh();
            };

            $scope.shakerHooks.getRefreshTablePromise = function(filtersOnly, filterRequest) {
                WT1.event("streaming-refresh-explore")

                var ret = monoFuturizedRefresh($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputStreamingEndpointId,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId, filtersOnly, filterRequest);

                return $scope.refreshNoSpinner ? ret.noSpinner() : ret;
            };

            /**
            * Fetches a chunk of the table. Returns a promise.
            * Out of bound is NOT handled, and will throw.
            */
            $scope.shakerHooks.getTableChunk = function(firstRow, nbRows, firstCol, nbCols, filterRequest) {
                return DataikuAPI.shakers.getCaptureChunk(
                    $stateParams.projectKey,
                    $scope.inputDatasetProjectKey,
                    $scope.inputStreamingEndpointId,
                    $scope.shakerHooks.shakerForQuery(),
                    $scope.requestedSampleId,
                    firstRow,
                    nbRows,
                    firstCol,
                    nbCols,
                    filterRequest);
            }

            $scope.shakerHooks.fetchDetailedAnalysis = function(setAnalysis, handleError, columnName, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics) {
                DataikuAPI.shakers.detailedStreamingColumnAnalysis($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputStreamingEndpointId,
                        $scope.shakerHooks.shakerForQuery(), $scope.requestedSampleId, columnName, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics).success(function(data){
                            setAnalysis(data);
                }).error(function(a, b, c) {
                    if (handleError) {
                        handleError(a, b, c);
                    }    
                    setErrorInScope.bind($scope)(a, b, c);
                });
            };
            $scope.shakerHooks.fetchClusters = function(setClusters, columnName, setBased, radius, timeOut, blockSize) {
                // Do nothing
            };
            $scope.shakerHooks.fetchTextAnalysis = function(setTextAnalysis, columnName, textSettings) {
                // Do nothing
            };
        }
    }
});

app.service("DatasetChartsUtils", function(SamplingData){
    var svc = {
        makeSelectionFromScript: function(script) {
            return {
                 selection : SamplingData.makeStreamableFromMem(script.explorationSampling.selection)
            }
        }
    }
    return svc;
})

app.controller("_ChartOnDatasetSamplingEditorBase", function($scope, $stateParams, Logger, DatasetChartsUtils,
                                                                    DataikuAPI, CreateModalFromTemplate, SamplingData){
    $scope.getPartitionsList = function() {
        return DataikuAPI.datasets.listPartitions($scope.dataset)
                .error(setErrorInScope.bind($scope))
                .then(function(ret) { return ret.data });
    };

    $scope.$watch("chart.copySelectionFromScript", function(nv, ov) {
        if ($scope.canCopySelectionFromScript) {
            if ($scope.chart.copySelectionFromScript === false && !$scope.chart.refreshableSelection) {
                $scope.chart.refreshableSelection = DatasetChartsUtils.makeSelectionFromScript($scope.script);
            }
        } else {
            Logger.warn("Can't copy selection from script");
        }
    })

    $scope.showFilterModal = function() {
        var newScope = $scope.$new();
        DataikuAPI.datasets.get($scope.dataset.projectKey, $scope.dataset.name, $stateParams.projectKey)
        .success(function(data){
            newScope.dataset = data;
            newScope.schema = data.schema;
            newScope.filter = $scope.chart.refreshableSelection.selection.filter;
            CreateModalFromTemplate('/templates/recipes/fragments/filter-modal.html', newScope);
        }).error(setErrorInScope.bind($scope));
    }

    $scope.SamplingData = SamplingData;
});

app.controller("ChartsCommonController", function ($scope, $timeout) {
    $scope.$on("listeningToForceExecuteChart", function() {
        $scope.canForceExecuteChart = true;
    });

    /**
     * Broadcast for a forceToExecute() call only if it's sure someone is already listening to such a broadcast.
     * Otherwise recheck every 100ms until some directive has told it it was listening or that 3s have passed (at which point broadcast will be made).
     */
    $scope.forceExecuteChartOrWait = function(){
        let nbTimeouts = 0;

        // Inner function does the job to isolate nbTimeouts
        function inner() {
            if ($scope.canForceExecuteChart || nbTimeouts > 30) {
                $scope.$broadcast("forceExecuteChart");
            } else {
                nbTimeouts++;
                $scope.forceExecuteChartTimeout = $timeout(inner,100);
            }
        }
        inner();
    };

    //avoid two concurrent timeouts if two calls were made to forceExecuteChartOrWait()
    $scope.$watch('forceExecuteChartTimeout', function(nv, ov) {
        if (ov!= null) {
            $timeout.cancel(ov);
        }
    })
});

app.controller("ShakerChartsCommonController", function ($scope, $timeout, $controller) {
    $controller("ChartsCommonController", {$scope:$scope});

    $scope.summary = {};
    $scope.currentChart = {index: 0};
    $scope.chartBottomOffset = 30;

    $scope.addChart = function (from) {
        var newChart = angular.copy(from || $scope.getDefaultNewChart());
        const targetIdx = from ? $scope.currentChart.index + 1 : $scope.charts.length; // if copied, put the new chart just after the current one, otherwise put it at the end
        $scope.charts.splice(targetIdx, 0, newChart);
        $scope.currentChart.index = targetIdx;
        newChart.def.name = "New chart";
        if (typeof $scope.fetchColumnsSummaryForCurrentChart === "function") {
            $scope.fetchColumnsSummaryForCurrentChart();
        }
        $scope.saveShaker();
    };

    $scope.pageSortOptions = {
        axis: 'x',
        cursor: 'move',
        update: onSortUpdated,
        handle: '.thumbnail',
        items: '> a.chart',
        delay: 100,
        'ui-floating': true
    };

    function onSortUpdated(evt, ui) {
        var prevIdx = ui.item.sortable.index, newIdx = ui.item.index();
        if (prevIdx == $scope.currentChart.index) {
            $scope.currentChart.index = ui.item.index();
        } else if (prevIdx < $scope.currentChart.index && newIdx >= $scope.currentChart.index) {
            $scope.currentChart.index--;
        } else if (prevIdx > $scope.currentChart.index && newIdx <= $scope.currentChart.index) {
            $scope.currentChart.index++;
        }

        $timeout($scope.saveShaker);
    }

    $scope.deleteChart = function(idx) {
        $scope.charts.splice(idx,1);
        if ($scope.currentChart.index >= $scope.charts.length) {
            $scope.currentChart.index = $scope.charts.length - 1;
        }
        if ($scope.charts.length == 0) {
            $scope.addChart();
        }
    };

    $scope.makeUsableColumns = function(data) {
        $scope.usableColumns = [{cacheable : true, column : "__COUNT__", label : "Count of records", type: 'NUMERICAL'}];
        for (var i  = 0 ; i < data.usableColumns.length; i++) {
            $scope.usableColumns.push({
                column : data.usableColumns[i].column,
                type : data.usableColumns[i].type,
                label: data.usableColumns[i].column,
                cacheable : data.usableColumns[i].cacheable,
                meaningInfo: data.usableColumns[i].meaningInfo
            });
        }
    };

    $timeout(function() {
        $scope.$broadcast("tabSelect", "columns");
    }, 0);
});

// Chart management for Analyses & Datasets
app.directive("shakerChartsCommon", function(CreateModalFromTemplate, Logger, ChartChangeHandler) {
    return {
        scope: true,
        priority : 100,
        controller  : 'ShakerChartsCommonController'
    }
});

})();

(function(){
'use strict';

const app = angular.module('dataiku.shaker');


app.directive("shakerExplorePristine", function($timeout, $q, Assert, DataikuAPI, WT1, ActivityIndicator, TopNav, DKUtils, DatasetErrorCta) {
    return {
        scope: true,
        controller: function ($scope, $stateParams, $state) {

            /* ********************* Callbacks for shakerExploreBase ******************* */

            $scope.shakerHooks.saveForAuto = function() {
                var deferred = $q.defer();
                resetErrorInScope($scope);
                var shakerData = $scope.getShakerData();

                if ($scope.isRecipe) {
                    throw "Should not call this for a recipe";
                } else {
                    DataikuAPI.explores.saveScript($stateParams.projectKey, $stateParams.datasetName,
                        shakerData).success(function(data){
                        $scope.originalShaker = shakerData;
                        deferred.resolve();
                    }).error(setErrorInScope.bind($scope));
                }
                return deferred.promise;
            };

            $scope.shakerHooks.setColumnMeaning = function(column, newMeaning){
                DataikuAPI.explores.setColumnMeaning($stateParams.projectKey, $stateParams.datasetName,
                    column.name, newMeaning).success(function(data){
                    $scope.refreshTable(false);
                }).error(setErrorInScope.bind($scope));
            };

            $scope.shakerHooks.getSetColumnStorageTypeImpact = function(column, newType){
                return DataikuAPI.explores.getSetColumnStorageTypeImpact($stateParams.projectKey, $stateParams.datasetName, column.name, newType);
            };

            $scope.shakerHooks.setColumnStorageType = function(column, newType, actions){
                DataikuAPI.explores.setColumnStorageType($stateParams.projectKey, $stateParams.datasetName,
                    column.name, newType, actions).success(function(data){
                        $scope.refreshTable(false);
                        if (data.reload) {
                            DKUtils.reloadState();
                        } else if (data.refreshSample) {
                            $scope.shaker.explorationSampling._refreshTrigger++;
                            $scope.forgetSample();
                            $scope.autoSaveForceRefresh();
                        } else {
                            ActivityIndicator.success("Dataset schema saved - You might need to refresh the sample", 4000);
                        }
                }).error(function(a,b,c) {
                    ActivityIndicator.error("Failed to change column name, check sampling pane", 4000);
                    setErrorInScope.bind($scope)(a,b,c)
                });
            };

            $scope.shakerHooks.updateColumnDetails = function(column) {
                Assert.trueish(column, 'cannot update column with null');
                DataikuAPI.explores.updateColumn($stateParams.projectKey, $stateParams.datasetName, column).success(function(data){
                    $scope.refreshTable(false);
                    ActivityIndicator.success("Dataset schema saved - You might need to refresh the sample", 4000);
                }).error(setErrorInScope.bind($scope));
            };
 
            /* ********************* Main ******************* */

            // Set base context and call baseInit
            Assert.inScope($scope, 'shakerHooks');

            TopNav.setLocation(TopNav.TOP_FLOW, 'datasets', TopNav.TABS_DATASET, "explore")

            $scope.table = null;
            $scope.scriptId = "__pristine__";
            $scope.shakerWithSteps = false;
            $scope.shakerReadOnlyActions = true;
            $scope.shakerWritable = false;
            $scope.inputDatasetProjectKey = $stateParams.projectKey;
            $scope.inputDatasetName = $stateParams.datasetName;
            $scope.inputDatasetSmartName = $stateParams.datasetName;

            WT1.event("shaker-explore-open");

            $scope.$watch("projectSummary", function(nv, ov) {
                $scope.shakerState.writeAccess = $scope.isProjectAnalystRW();
            });

            //For datasetErrorCTA directive (CTA in case of error while loading dataset sample)

            $scope.updateUiState = DatasetErrorCta.getupdateUiStateFunc($scope);

            $scope.$watch("datasetFullInfo", _ => $scope.updateUiState($scope.shakerState.runError), true);
            $scope.$watch("shakerState", _ => $scope.updateUiState($scope.shakerState.runError), true);
            $scope.$watch("table", _ => $scope.updateUiState($scope.shakerState.runError));

            // Load shaker, set the necessary stuff in scope and call the initial refresh
            DataikuAPI.explores.getScript($stateParams.projectKey, $stateParams.datasetName).success(function(shaker) {
                $scope.shaker = shaker;
                $scope.shaker.origin = "DATASET_EXPLORE";
                $scope.fixupShaker();
                $scope.requestedSampleId = null;
                $scope.refreshTable(false);

            }).error(setErrorInScope.bind($scope));

            $timeout(function() { $scope.$broadcast("tabSelect", "Filters") });

            // Load stuff for "edit last analysis"
            DataikuAPI.analysis.listOnDataset($stateParams.projectKey, $stateParams.datasetName).success(function(data) {
                data.sort(function(a, b) {
                    return b.lastModifiedOn - a.lastModifiedOn;
                });
                if (data.length) {
                    Mousetrap.bind("g l a", $state.go.bind($state,
                        "projects.project.analyses.analysis.script", {analysisId: data[0].id}));
                    $scope.$on("$destroy", function(){
                        Mousetrap.unbind("g l a")
                    });
                }
            }).error(setErrorInScope.bind($scope));

        }
    }
});

app.directive("shakerExploreStreamingEndpoint", function($timeout, $q, Assert, DataikuAPI, WT1, ActivityIndicator, TopNav, DKUtils, DatasetErrorCta) {
    return {
        scope: true,
        controller: function ($scope, $stateParams, $state) {

            /* ********************* Callbacks for shakerExploreBase ******************* */

            $scope.shakerHooks.saveForAuto = function() {
                var deferred = $q.defer();
                resetErrorInScope($scope);
                var shakerData = $scope.getShakerData();

                if ($scope.isRecipe) {
                    throw "Should not call this for a recipe";
                } else {
                    DataikuAPI.explores.saveCaptureScript($stateParams.projectKey, $stateParams.streamingEndpointId,
                        shakerData).success(function(data){
                        $scope.originalShaker = shakerData;
                        deferred.resolve();
                    }).error(setErrorInScope.bind($scope));
                }
                return deferred.promise;
            };

            $scope.shakerHooks.setColumnMeaning = function(column, newMeaning){
            };

            $scope.shakerHooks.getSetColumnStorageTypeImpact = function(column, newType){
                return null;
            };

            $scope.shakerHooks.setColumnStorageType = function(column, newType, actions){
            };

            $scope.shakerHooks.updateColumnDetails = function(column) {
            };

            /* ********************* Main ******************* */

            // Set base context and call baseInit
            Assert.inScope($scope, 'shakerHooks');

            $scope.table = null;
            $scope.scriptId = "__pristine__";
            $scope.shakerWithSteps = false;
            $scope.shakerWritable = false;
            $scope.inputDatasetProjectKey = $stateParams.projectKey;
            $scope.inputStreamingEndpointId = $stateParams.streamingEndpointId;

            WT1.event("shaker-explore-open");

            $scope.$watch("projectSummary", function(nv, ov) {
                $scope.shakerState.writeAccess = $scope.isProjectAnalystRW();
            });

            //For datasetErrorCTA directive (CTA in case of error while loading dataset sample)

            $scope.updateUiState = DatasetErrorCta.getupdateUiStateFunc($scope);

            $scope.$watch("streamingEndpoint", _ => $scope.updateUiState($scope.shakerState.runError), true);
            $scope.$watch("shakerState", _ => $scope.updateUiState($scope.shakerState.runError), true);
            $scope.$watch("table", _ => $scope.updateUiState($scope.shakerState.runError));

            // Load shaker, set the necessary stuff in scope and call the initial refresh
            DataikuAPI.explores.getCaptureScript($stateParams.projectKey, $stateParams.streamingEndpointId).success(function(shaker) {
                $scope.shaker = shaker;
                $scope.shaker.origin = "DATASET_EXPLORE";
                if ($scope.shaker.explorationSampling && $scope.shaker.explorationSampling.selection && $scope.shaker.explorationSampling.selection.timeout < 0) {
                    $scope.shaker.explorationSampling.selection.timeout = 10;
                }
                if ($scope.shaker.vizSampling && $scope.shaker.vizSampling.selection && $scope.shaker.vizSampling.selection.timeout < 0) {
                    $scope.shaker.vizSampling.selection.timeout = 10;
                }
                $scope.fixupShaker();
                $scope.requestedSampleId = null;
                $scope.refreshTable(false);

            }).error(setErrorInScope.bind($scope));

            $timeout(function() { $scope.$broadcast("tabSelect", "Filters") });
        }
    }
});


}());

(function() {
'use strict';

const app = angular.module('dataiku.shaker');

app.directive("shakerFacets", function($rootScope, $timeout, $filter, Assert, ChartDimension, WT1, Logger) {
    return {
        scope: true,
        priority: 99,
        controller: function($scope, $stateParams, $state) {
            /* Actions by filter type */
            let filterTypes = {
                facet: {
                    computeFilter : function(ff, active) {
                        let ret = {
                            "column" : ff.column,
                            params : {}
                        };
                        ret.type = ff.currentMode + "_FACET";
                        ret.active = active;
                        if (ff.currentMode === "ALPHANUM") {
                            ret.values = Object.keys(ff.selectedValues);
                            ret.effective = ret.values.length;
                            ret.canBecomeStep = ret.values.length >= 1;
                        } else if (ff.currentMode === "NUMERICAL") {
                            ret.minValue = ff.minValue;
                            ret.maxValue = ff.maxValue;
                            ret.effective = (ff.minValue || ff.maxValue);
                            ret.canBecomeStep = ret.effective;
                        } else if (ff.currentMode === "DATE") {
                            ret.dateFilterType = ff.dateFilterType;
                            if (ff.dateFilterType === "RANGE") {
                                ret.minValue = ff.minValue;
                                ret.maxValue = ff.maxValue;
                                ret.timezone = ff.timezone;
                                ret.effective = (ff.minValue || ff.maxValue);
                                ret.canBecomeStep = ret.effective;
                            } else if (ff.dateFilterType === "RELATIVE") {
                                ret.dateFilterPart = ff.dateFilterPart;
                                ret.dateFilterOption = ff.dateFilterRelativeOption;
                                ret.minValue = ff.dateFilterRelativeLast;
                                ret.maxValue = ff.dateFilterRelativeNext;
                                ret.effective = true;
                                ret.canBecomeStep = true;
                            } else {
                                ret.dateFilterPart = ff.dateFilterPart;
                                ret.values = Object.keys(ff.selectedValues);
                                ret.effective = ret.values.length;
                                ret.canBecomeStep = ret.effective;
                            }
                        }
                        return ret;
                    },
                    clearFilter : function(ff) {
                        ff.selectedValues = {};
                        ff.minValue = undefined;
                        ff.maxValue = undefined;
                        ff.timezone = 'UTC';
                        ff.dateFilterRelativeOption = "THIS";
                        ff.dateFilterPart = "YEAR";
                        ff.dateFilterRelativeLast = 1;
                        ff.dateFilterRelativeNext = 1;
                    },
                    addSteps : function(ff) {
                        if (ff.currentMode === 'ALPHANUM') {
                            $scope.addStepAndRefresh('FilterOnValue', {
                                appliesTo: 'SINGLE_COLUMN',
                                columns: [ff.column],
                                action: 'KEEP_ROW',
                                values: Object.keys(ff.selectedValues),
                                matchingMode: 'FULL_STRING',
                                normalizationMode: 'EXACT'
                            });
                        } else if (ff.currentMode === 'NUMERICAL') {
                            $scope.addStepAndRefresh('FilterOnNumericalRange', {
                                appliesTo: 'SINGLE_COLUMN',
                                columns: [ff.column],
                                action: 'KEEP_ROW',
                                min: ff.minValue,
                                max: ff.maxValue
                            });
                        } else if (ff.currentMode === 'DATE') {
                            if (ff.dateFilterType === 'RANGE') {
                                $scope.addStepAndRefresh('FilterOnDate', {
                                    appliesTo: 'SINGLE_COLUMN',
                                    columns: [ff.column],
                                    action: 'KEEP_ROW',
                                    filterType: 'RANGE',
                                    // The processor is expecting - in min & max - a string in ISO 8601 format without the time zone part (ex: "2020-01-01T18:00:00.000")
                                    min: ff.minValue ? formatDateToISOLocalDateTime(convertDateToTimezone(new Date(ff.minValue), ff.timezone)) : '',
                                    max: ff.maxValue ? formatDateToISOLocalDateTime(convertDateToTimezone(new Date(ff.maxValue), ff.timezone)) : '',
                                    timezone_id: ff.timezone,
                                    part: 'YEAR',
                                    option: 'THIS',
                                    relativeMin: 1,
                                    relativeMax: 1
                                });
                            } else if(ff.dateFilterType === 'RELATIVE') {
                                $scope.addStepAndRefresh('FilterOnDate', {
                                    appliesTo: 'SINGLE_COLUMN',
                                    columns: [ff.column],
                                    action: 'KEEP_ROW',
                                    filterType: 'RELATIVE',
                                    relativeMin: isNaN(ff.dateFilterRelativeLast) ? 1 : Math.max(1, ff.dateFilterRelativeLast),
                                    relativeMax: isNaN(ff.dateFilterRelativeNext) ? 1 : Math.max(1, ff.dateFilterRelativeNext),
                                    option: ff.dateFilterRelativeOption,
                                    part: ff.dateFilterPart,
                                    timezone_id: 'UTC'
                                });
                            } else {
                                let values = Object.keys(ff.selectedValues);
                                if (ff.dateFilterPart === 'INDIVIDUAL') {
                                    values = values.map(v => formatDateToISOLocalDate(new Date(v * 1000)));
                                } else if (['QUARTER_OF_YEAR', 'DAY_OF_WEEK', 'DAY_OF_MONTH'].includes(ff.dateFilterPart)) {
                                    values = values.map(v => parseInt(v) + 1);
                                }
                                $scope.addStepAndRefresh('FilterOnDate', {
                                    appliesTo: 'SINGLE_COLUMN',
                                    columns: [ff.column],
                                    action: 'KEEP_ROW',
                                    filterType: 'PART',
                                    part: ff.dateFilterPart,
                                    values: values,
                                    option: ff.dateFilterRelativeOption,
                                    timezone_id: 'UTC',
                                    relativeMin: 1,
                                    relativeMax: 1
                                });
                            }
                        }
                    }
                },
                alphanum : {
                    computeFilter : function(ff, active) {
                        return {
                            "column" : ff.column,
                            "type" : "ALPHANUM",
                            "values" : ff.values,
                            effective : ff.values.length,
                            params : ff.params,
                            active: active
                        }
                    },
                    clearFilter : function(ff) {
                        Assert.trueish(false, 'cannot call alphanum');
                    }
                },
                validity : {
                    computeFilter : function(ff, active) {
                        return {
                            "column" : ff.column,
                            "type" : "VALIDITY",
                            "params" : ff.params,
                            effective : !ff.params.empty || !ff.params.nok || !ff.params.ok,
                            active: active
                        };
                    },
                    clearFilter : function(ff) {
                        Assert.trueish(false, 'cannot call validity');
                    }
                },
                global_search : {
                    computeFilter : function(ff) {
                        return { "type" : "GLOBAL_SEARCH", "values" : [ff.filter], effective : ff.filter && ff.filter.length }
                    },
                    clearFilter : function(ff) {
                        Assert.trueish(false, 'cannot call global_search');
                    }
                }
            };

            $scope.dateFilterTypes = ChartDimension.getDateFilterTypes();
            $scope.dateFilterParts = ChartDimension.getDateFilterParts();
            $scope.dateRelativeFilterParts = ChartDimension.getDateRelativeFilterParts();

            /* This removes the *filters* and clears the built-in filter of a facet, but does not remove the filters */
            $scope.removeAllFiltersOnColumn = function(column) {
                let newFFs = [];
                for (let i in $scope.shaker.explorationFilters) {
                    let fi = $scope.shaker.explorationFilters[i];
                    if (fi.type == "facet" && fi.column == column) {
                        filterTypes[fi.type].clearFilter(fi);
                        newFFs.push(fi);
                    } else if (fi.column != column) {
                        newFFs.push(fi);
                    }
                }
                $scope.shaker.explorationFilters = newFFs;
            };

            $scope.viewAllFilter = false;
            $scope.toggleFilterView = function() {
            	$scope.viewAllFilter = !$scope.viewAllFilter;
            	if (!$scope.viewAllFilter) {
            	    $scope.setMustBeVisibleFilter('');
            	    $rootScope.$broadcast("reflow");
            	}
            };

            $scope.mustBeVisibleFilter = {column: ''};
            $scope.isMustBeVisibleFilter = function(column) {
                return column == $scope.mustBeVisibleFilter.column;
            };
            $scope.setMustBeVisibleFilter = function(column) {
                $scope.mustBeVisibleFilter.column = column;
            };

            $scope.removeAllFilters = function() {
                $scope.shaker.explorationFilters.splice(1);
                $scope.shaker.globalSearchQuery = "";
            };

            $scope.clearFilter = function(filter) {
                filterTypes[filter.type].clearFilter(filter);
            };

            $scope.removeFFByColumn = function(columnName) {
                let newFFs = [];
                for (let i in $scope.shaker.explorationFilters) {
                    if ($scope.shaker.explorationFilters[i].column != columnName) {
                        newFFs.push($scope.shaker.explorationFilters[i]);
                    }
                }
                $scope.shaker.explorationFilters = newFFs;
            };

            $scope.buildFilterRequest = function() {
                if ($scope.shaker == null) return [];
                let filterRequest = [];
                for (let ffidx in $scope.shaker.explorationFilters) {
                    let ffi = $scope.shaker.explorationFilters[ffidx];
                    let fList = getFiltersList(ffi);
                    for (let fidx in fList) {
                        let fi = fList[fidx];
                        let requestElt =filterTypes[fi.type].computeFilter(fi, ffi.active);
                        if (requestElt != null) {
                            filterRequest.push(requestElt);
                        }
                    }
                }
                if (typeof($scope.shaker.globalSearchQuery)!=='undefined' && $scope.shaker.globalSearchQuery.length > 0) {
                    let globalFilter = {
                        type : "global_search",
                        filter: $scope.shaker.globalSearchQuery
                    };
                    filterRequest.push(filterTypes[globalFilter.type].computeFilter(globalFilter, true));
                }
                return filterRequest;
            };

            $scope.hasAnyFilter = function() {
                if(!$scope.shaker) return false;
                let ret = false;
                for (let ffidx in $scope.shaker.explorationFilters) {
                    let ffi = $scope.shaker.explorationFilters[ffidx];
                    let fList = getFiltersList(ffi);
                    for (let fidx in fList) {
                        let fi = fList[fidx];
                        if (filterTypes[fi.type].computeFilter(fi).effective) {
                            ret = true;
                            break;
                        }
                    }
                }
                // UGLY ! But as we use the tabs directive, we don't have an easy access to the filters tab title ...
                if (ret) {
                    $(".leftPane .tabbable li:eq(2)").addClass("filter-active");
                } else {
                    $(".leftPane .tabbable li:eq(2)").removeClass("filter-active");
                }
                return ret;
            };

            $scope.hasAnyFilterOnColumn = function(column, uneffectiveFilterCount) {
                if(!$scope.shaker) return false;
                for (let ffidx in $scope.shaker.explorationFilters) {
                    let ffi = $scope.shaker.explorationFilters[ffidx];
                    let fList = getFiltersList(ffi);
                    for (let fidx in fList) {
                        let fi = fList[fidx];
                        if (fi.column && fi.column == column) {
                            if (filterTypes[fi.type].computeFilter(fi).effective || uneffectiveFilterCount) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            };

            $scope.filterIsEffective = function(filter) {
                let fList = getFiltersList(filter);
                for (let fidx in fList) {
                    let fi = fList[fidx];
                    if (filterTypes[fi.type].computeFilter(fi).effective) {
                        return true;
                    }
                }
                return false
            };

            $scope.filterCanBecomeStep = function(filter) {
                let fList = getFiltersList(filter);
                for (let fidx in fList) {
                    let fi = fList[fidx];
                    if (filterTypes[fi.type].computeFilter(fi).canBecomeStep) {
                        return true;
                    }
                }
                return false;
            };

            $scope.addStepsFromFilter = function(filter) {
                return filterTypes[filter.type].addSteps(filter);
            };

            var emitFilterHaveChanged = function(nv, ov) {
                if ((nv != null) && (ov != null)) {
                    $scope.$emit("filterHaveChanged");
                }
            };

            $scope.$watch("shaker.explorationFilters", function(nv,ov) {
                emitFilterHaveChanged(nv, ov);
            });

            $scope.$watch("shaker.globalSearchQuery", function(nv,ov) {
                emitFilterHaveChanged(nv, ov);
            });

            $scope.addColumnFilter = function(column, selectedValues, matchingMode, columnType, isDouble) {
                if (!$scope.hasAnyFilterOnColumn(column, true)) {
                    WT1.event("anum-facet-add");
                    let facetType = columnType === 'Date' ? 'DATE' : (isDouble ? 'NUMERICAL' : 'ALPHANUM');
                    let columnFilter = {
                        column: column,
                        type: 'columnFilter',
                        currentMode: 'FACET',
                        active: true,
                        facet: {
                            type: "facet",
                            column: column,
                            columnType : facetType,
                            currentMode : selectedValues && Object.keys(selectedValues).length ? 'ALPHANUM' : facetType,
                            sort:"count",
                            minValue : null,
                            maxValue : null,
                            selectedValues: selectedValues
                        },
                        alphanumFilter: {
                            type : "alphanum",
                            column : column,
                            values : [],
                            params : { mode : matchingMode, normalization : "exact"}
                        },
                        validityFilter : {
                            type : "validity",
                            column : column,
                            params : {
                                type : columnType,
                                ok : true,
                                nok : true,
                                empty : true
                            }
                        }
                    };
                    if (facetType === "DATE") {
                        columnFilter.facet.timezone = "UTC";
                        columnFilter.facet.dateFilterType = "RANGE";
                        columnFilter.facet.dateFilterPart = "YEAR";
                        columnFilter.facet.dateFilterRelativeOption = "THIS";
                        columnFilter.facet.dateFilterRelativeLast = 1;
                        columnFilter.facet.dateFilterRelativeNext = 1;
                        columnFilter.facet.minValue = undefined; // undefined <=> Reset the bound to the smallest value
                        columnFilter.facet.maxValue = undefined; // undefined <=> Reset the bound to the largest value
                    }
                    if (!$scope.viewAllFilter) {
                    	$scope.openFacetContextualMenuAtAnimationEnd(column);
                    }
                    $scope.shaker.explorationFilters.push(columnFilter);
                    if ($scope.viewAllFilter) {
					    $timeout(function() {
					    	$scope.$apply(function() {
					    		$scope.setMustBeVisibleFilter(column);
					    	})
					    }, 0, false);
					}
                } else {
                	if (!$scope.viewAllFilter) {
                		$scope.openFacetContextualMenuAtAnimationEnd(column);
                        $scope.$broadcast('slideToId', '.facetsFilters', '.filters-slider' , $scope.getFFGroupIdByColumn(column));
                	} else {
                		$timeout(function() {
					    	$scope.$apply(function() {
					    		$scope.setMustBeVisibleFilter(column);
					    	})
					    }, 0, false);
                	}
                }
            };

            $scope.getFFGroupIdByColumn = function(column) {
                return 'facet-' + column;
            };

            $scope.openFacetContextualMenuAtAnimationEnd = function(column) {
            	var off = $('[dku-arrow-slider]').scope().$on('DKU_ARROW_SLIDER:animation_over',function() {
            		 $scope.$broadcast('openFilterFacetContextualMenu', column);
            		 off(); //to unregister the listener set with $on
            	});
            };

            /*
             * If ff is a column filter, returns all its active filters
             * Else, returns a list only containing ff (the filter passed in parameter)
             */
            var getFiltersList = function(ff) {
                let ffList = [];
                if (ff.type === "columnFilter") {
                    if (ff.currentMode === "FACET") {
                        ffList.push(ff.facet);
                    } else if (ff.currentMode === "SIMPLE_ALPHANUM") {
                        ffList.push(ff.alphanumFilter);
                    }
                    ffList.push(ff.validityFilter);
                } else {
                    ffList.push(ff);
                }
                return ffList;
            };

            $scope.isFilterDateRange = ChartDimension.isFilterDateRange;
            $scope.isFilterDateRelative = ChartDimension.isFilterDateRelative;
            $scope.isFilterDatePart = ChartDimension.isFilterDatePart;
            $scope.isFilterDiscreteDate = ChartDimension.isFilterDiscreteDate;

            $scope.resetFilter = function(filter) {
                filterTypes[filter.type].resetFilter(filter);
            };

            $scope.getFilterByColumn = function(column) {
            	for (let ffIdx = 0; ffIdx<$scope.shaker.explorationFilters.length; ffIdx++) {
            		var ff = $scope.shaker.explorationFilters[ffIdx];
            		if (ff.type === "columnFilter" && ff.column == column) {
            			return ff;
            		}
            	}
            	return undefined;
            };

            $scope.updateFacetData = function() {
                if ($scope.filterTmpDataWatchDeregister) {
                    $scope.filterTmpDataWatchDeregister();
                }
                $scope.filterTmpData = {};
                /* Build tmpData */
                for (let fIdx = 0; fIdx < $scope.table.filterFacets.length; fIdx++ ) {
                    let responseFacet = $scope.table.filterFacets[fIdx];
                    let column = responseFacet.column;
                    let type = responseFacet.type;
                	type = type.replace('_FACET', '');
                    let filter = $scope.getFilterByColumn(column);

                    if (filter) {
                        let tmpData =  $scope.filterTmpData[column] ;
                        if (!tmpData) {
                            tmpData = {};
                            $scope.filterTmpData[column] = tmpData;
                        }

                        if (type === 'VALIDITY') {
                            for (let v = 0 ; v < responseFacet.values.length; v++) {
                                let facetVal = responseFacet.values[v];
                                if (facetVal.id === 'ok') {
                                    tmpData.nbOk = facetVal.count;
                                } else if (facetVal.id === 'nok') {
                                    tmpData.nbNok = facetVal.count;
                                } else if (facetVal.id === 'empty') {
                                    tmpData.nbEmpty = facetVal.count;
                                }
                            }
                            let total = tmpData.nbOk + tmpData.nbNok + tmpData.nbEmpty;
                            tmpData.okPercentageStr = total > 0 ? $filter("smartPercentage")(tmpData.nbOk/total) : 'none';
                            tmpData.nokPercentageStr = total > 0 ? $filter("smartPercentage")(tmpData.nbNok/total) : 'none';
                            tmpData.emptyPercentageStr = total > 0 ? $filter("smartPercentage")(tmpData.nbEmpty/total) : 'none';
                            tmpData.nonemptyPercentageStr = total > 0 ? $filter("smartPercentage")((total-tmpData.nbEmpty)/total) : 'none';
                            tmpData.okPercentage = total > 0 ? tmpData.nbOk*100 / total : 'none';
                            tmpData.nokPercentage = total > 0 ? tmpData.nbNok*100 / total : 'none';
                            tmpData.emptyPercentage = total > 0 ? tmpData.nbEmpty*100 / total : 'none';
                            tmpData.nonemptyPercentage = total > 0 ? (total - tmpData.nbEmpty)*100 / total : 'none';
                        } else {
                            const valuesLength = responseFacet.values.length;
                            tmpData.values = [];
                            tmpData.type = type;
                            tmpData.isRange = responseFacet.isRange;
                            if (type === 'ALPHANUM' || (type === 'DATE' && !responseFacet.isRange)) {
                                for (let v = 0 ; v < valuesLength; v++) {
                                    let facetVal = responseFacet.values[v];
                                    tmpData.values.push({
                                        id : facetVal.id,
                                        label : facetVal.label,
                                        count : facetVal.count,
                                        included : (filter.facet.selectedValues && filter.facet.selectedValues[facetVal.id])
                                    });
                                }
                            } else if (type === 'DATE' && responseFacet.isRange) {
                                tmpData.response = responseFacet;
                                if (filter.facet.timezone != null) {
                                    tmpData.timezone = filter.facet.timezone;
                                }
                                // For dates, we use the following convention to improve user experience:
                                // - valid number => Use the value
                                // - undefined    => Take the smallest/largest date found in the sample
                                // - null         => Leave as it is (it will display the default date placeholder in the UI)
                                tmpData.minValue = filter.facet.minValue !== undefined ? filter.facet.minValue : responseFacet.minValue;
                                tmpData.maxValue = filter.facet.maxValue !== undefined ? filter.facet.maxValue : responseFacet.maxValue;
                            } else if (type === 'NUMERICAL') {
                                tmpData.response = responseFacet;
                                tmpData.minValue = filter.facet.minValue != null ? filter.facet.minValue : responseFacet.minValue;
                                tmpData.maxValue = filter.facet.maxValue != null ? filter.facet.maxValue : responseFacet.maxValue;
                            }

                            tmpData.uniqueRowCount = responseFacet.count;
                        }
                    }
                }

                /* Triggered by slide end */
                $scope.filterTmpDataWatchDeregister =  $scope.$watch("filterTmpData", function(nv, ov) {
                    for (let column in $scope.filterTmpData) {
                        let filter = $scope.getFilterByColumn(column);
                        let tmpData = $scope.filterTmpData[column];

                        if (tmpData.type === "ALPHANUM" || (tmpData.type === 'DATE' && !tmpData.isRange)) {
                            filter.facet.selectedValues = {};
                            for (let i in tmpData.values) {
                                if (tmpData.values[i].included) {
                                    filter.facet.selectedValues[tmpData.values[i].id] = true;
                                }
                            }
                        } else if (tmpData.type  === "NUMERICAL" || (tmpData.type === 'DATE' && tmpData.isRange)) {
                            // Detect when the entered value is the same as the lower or upper bound, and replace it with an undefined value
                            // to say that we don't want to filter using this bound.
                            filter.facet.minValue = tmpData.minValue !== tmpData.response.minValue ? tmpData.minValue : undefined;
                            filter.facet.maxValue = tmpData.maxValue !== tmpData.response.maxValue ? tmpData.maxValue : undefined;
                            filter.facet.timezone = tmpData.timezone;
                        }
                    }
                }, true);
            };

            var filterChanged = function(nv, ov) {
                if (nv  == null || ov == null) return;
                
                if ($scope.isRecipe) {
                    $scope.refreshTable(true);
                } else {
                    $scope.refreshTable(true);
                    /* Don't save synchronously, we want optimal performance here */
                    $timeout($scope.shakerHooks.saveForAuto, 100);
                }
            };

            $scope.$watch("shaker.explorationFilters", function(nv, ov) {
                filterChanged(nv, ov);
            }, true);

            $scope.$watch("shaker.globalSearchQuery", function(nv, ov) {
                filterChanged(nv, ov);
            }, true)
        }
    }
});


/*
 * Directive grouping a shakerFacet, a simpleAlphanumFilter, and a validityFilter in order to display them all into one single contextual menu
 */
app.directive('columnFilter', ['$filter', 'ContextualMenu', '$window', function($filter, ContextualMenu, $window) {
    return {
        scope: true,
        restrict : 'AE',
        link : function($scope, element, attrs) {

            /*
             * Filter panel visibility
             */

            $scope.isFilterPanelVisible = false;
            let numFmt = $filter('smartNumber');

            $scope.menu = new ContextualMenu({
                template: "/templates/shaker/column-filter-panel.html",
                cssClass : "ff-contextual-menu",
                scope: $scope,
                contextual: false,
                handleKeyboard: false,
                onOpen: function() {
                    $scope.isFilterPanelVisible = true;
                },
                onClose: function() {
                    $scope.isFilterPanelVisible = false;
                },
                enableClick: true
            });

            $scope.showMenu = function() {
                let openAtX = $(element).offset().left;
            	if (openAtX > $($window).width()/2) {
            		openAtX += $(element).outerWidth();
            	}
                $scope.menu.openAtXY(openAtX, $(element).offset().top + $(element).height(), function() {}, false, true); // NOSONAR: OK to have empty method
            };

            $scope.hideMenu = function() {
                $scope.menu.closeAny();
            };

            $scope.toggleMenu = function() {
                if ($scope.isFilterPanelVisible) {
                    $scope.hideMenu();
                } else {
                    $scope.showMenu();
                }
            };

            $scope.$on("openFilterFacetContextualMenu", function(event, column) {
                if ($scope.ffGroup.column == column) {
                    $scope.showMenu();
                }
            });

            /*
             * Switching filter mode
             */

            $scope.switchToFacetNumerical = function() {
                $scope.ffGroup.currentMode = "FACET";
                $scope.ffGroup.facet.currentMode = "NUMERICAL";
            };
            $scope.switchToFacetAlphanum = function() {
                $scope.ffGroup.currentMode = "FACET";
                $scope.ffGroup.facet.currentMode = "ALPHANUM";
            };
            $scope.switchToSimpleAlphanum = function() {
                $scope.ffGroup.currentMode = "SIMPLE_ALPHANUM";
            };

            $scope.isFacet = function() {
                return $scope.ffGroup.currentMode === "FACET";
            };

            $scope.isFacetNumerical = function() {
                return $scope.isFacet() && $scope.ffGroup.facet.currentMode === "NUMERICAL";
            };

            $scope.isFacetAlphanum = function() {
                return $scope.isFacet() && $scope.ffGroup.facet.currentMode === "ALPHANUM";
            };

            $scope.isSimpleAlphanum = function() {
                return $scope.ffGroup.currentMode === "SIMPLE_ALPHANUM";
            };

            $scope.isFacetDate = function() {
                return $scope.isFacet() && $scope.ffGroup.facet.currentMode === "DATE";
            };

            $scope.isFacetDateRange = function() {
                return $scope.isFacet() && $scope.isFacetDate() && $scope.ffGroup.facet.dateFilterType === "RANGE";
            };

            $scope.isFacetDateRelativeRange = function() {
                return $scope.isFacet() && $scope.isFacetDate() && $scope.ffGroup.facet.dateFilterType === "RELATIVE";
            };

            $scope.isFacetDateValues = function() {
                return $scope.isFacet() && $scope.isFacetDate() && $scope.ffGroup.facet.dateFilterType !== "RANGE";
            };

            $scope.isEffective = function() {
            	if ($scope.filterIsEffective($scope.ffGroup.validityFilter)) {
            		return true;
            	} else if ($scope.isFacet()) {
                    return $scope.filterIsEffective($scope.ffGroup.facet);
                } else if ($scope.isSimpleAlphanum()) {
                    return $scope.filterIsEffective($scope.ffGroup.alphanumFilter);
                }
                return false;
            };

            $scope.$watch('ffGroup.facet.dateFilterType', () => {
                if($scope.ffGroup.facet.dateFilterType !== 'PART' && $scope.ffGroup.facet.dateFilterPart === 'INDIVIDUAL') {
                    $scope.ffGroup.facet.dateFilterPart = "YEAR"
                }
            })

            $scope.getFilterChipInfo = function() {
                function capitalize(str) {
                    if (!str) {
                        return '';
                    }
                    return str.charAt(0).toUpperCase() + str.slice(1);
                }

                if (!$scope.isEffective()) {
                    return 'All';
                }
                //if validity filter is the only one filtering
                if ($scope.filterIsEffective($scope.ffGroup.validityFilter) && !$scope.filterIsEffective($scope.ffGroup.facet) && !$scope.filterIsEffective($scope.ffGroup.alphanumFilter)) {
                    let validityChipInfo = '';
                	if ($scope.ffGroup.validityFilter.params.ok) {
                		validityChipInfo += 'OK';
                	}
                	if ($scope.ffGroup.validityFilter.params.nok) {
                		validityChipInfo += validityChipInfo.length ? ' & NOK' : 'NOK';
                	}
                	if ($scope.ffGroup.validityFilter.params.empty) {
                		validityChipInfo += validityChipInfo.length ? ' & ∅' : '∅';
                	}
                	return validityChipInfo;
                }
                //otherwise we compute info relatively to "more important filters"
                if ($scope.isFacetNumerical() || $scope.isFacetDateRange()) {
                    let formatedMinValue;
                    let formatedMaxValue;
                    if ($scope.isFacetNumerical()) {
                        if (typeof($scope.ffGroup.facet.minValue) !== 'undefined' && $scope.ffGroup.facet.minValue) {
                            formatedMinValue = numFmt($scope.ffGroup.facet.minValue);
                        }
                        if (typeof($scope.ffGroup.facet.maxValue) !== 'undefined' && $scope.ffGroup.facet.maxValue) {
                            formatedMaxValue = numFmt($scope.ffGroup.facet.maxValue);
                        }
                    } else {
                        if (typeof($scope.ffGroup.facet.minValue) !== 'undefined' && $scope.ffGroup.facet.minValue) {
                            formatedMinValue = $filter('date')($scope.ffGroup.facet.minValue, 'yyyy-MM-dd');
                        }
                        if (typeof($scope.ffGroup.facet.maxValue) !== 'undefined' && $scope.ffGroup.facet.maxValue) {
                            formatedMaxValue = $filter('date')($scope.ffGroup.facet.maxValue, 'yyyy-MM-dd');
                        }
                    }
                    if (typeof(formatedMinValue)==='undefined') {
                        return ' ≤ ' + formatedMaxValue;
                    } else if (typeof(formatedMaxValue)==='undefined') {
                        return ' ≥ ' + formatedMinValue;
                    } else {
                        return formatedMinValue + ' to ' + formatedMaxValue;
                    }
                } else if ($scope.isFacetDateRelativeRange()) {
                    const facet = $scope.ffGroup.facet;
                    const item = {THIS:"this", LAST:"last", NEXT:"next", TO: "to date"}[facet.dateFilterRelativeOption];
                    const unit = {YEAR:"year", QUARTER_OF_YEAR:"quarter", MONTH_OF_YEAR:"month", DAY_OF_MONTH:"day", HOUR_OF_DAY:"hour"}[facet.dateFilterPart];
                    if (facet.dateFilterRelativeOption === 'TO') {
                        return capitalize(unit + ' ' + item);
                    } if (facet.dateFilterRelativeOption === 'LAST' && facet.dateFilterRelativeLast > 1) {
                        return capitalize(item + ' ' + facet.dateFilterRelativeLast + ' ' + unit + 's');
                    } else if (facet.dateFilterRelativeOption === 'NEXT' && facet.dateFilterRelativeNext > 1) {
                        return capitalize(item + ' ' + facet.dateFilterRelativeNext + ' ' + unit + 's');
                    } else {
                        return capitalize(item + ' ' + unit);
                    }
                } else if ($scope.isFacetAlphanum() || $scope.isFacetDateValues()) {
                    let nbValues = 0;
                    for (let v in $scope.ffGroup.facet.selectedValues) { // NOSONAR
                        nbValues++;
                    }
                    return nbValues === 1 ? nbValues + ' value' : nbValues + ' values';
                } else if ($scope.isSimpleAlphanum()) {
                    let nbValues = $scope.ffGroup.alphanumFilter.values.length;
                    return nbValues === 1 ? nbValues + ' value' : nbValues + ' values';
                }
            }
        }
    };
}]);


app.directive('shakerFacet', [ '$timeout', 'Logger', 'DataikuAPI', 'Debounce', function($timeout, Logger, DataikuAPI, Debounce) {
    return {
        templateUrl : '/templates/shaker/facet.html',
        replace:true,
        scope:true,
        restrict : 'E',
        link : function($scope, element, attrs) {
            $(element).find(".accordion-body").addClass("in");
            $scope.dateRelativeFilterPartsLabel = "Year";
            $scope.dateRelativeFilterComputedStart = '-';
            $scope.dateRelativeFilterComputedEnd = '-';

            $scope.$watch("filterTmpData", function(nv, ov) {
                if (nv == null) return;
                if (!$scope.filterTmpData[$scope.facet.column] || $scope.filterTmpData[$scope.facet.column].type !== $scope.facet.currentMode) return;
                $scope.facetUiState = $scope.facetUiState || {};

                let minValue = $scope.filterTmpData[$scope.facet.column].minValue;
                let maxValue = $scope.filterTmpData[$scope.facet.column].maxValue;
                if ($scope.facet.currentMode === "DATE") {
                    const timezone = $scope.filterTmpData[$scope.facet.column].timezone || 'UTC';
                    $scope.facetUiState.timezoneDateRangeModel = timezone;
                    // For dates, we use the following convention to improve user experience:
                    // - valid number => Use the value
                    // - undefined    => Take the smallest/largest date found in the sample
                    // - null         => Leave as it is (it will display the default date placeholder in the UI)
                    if (minValue === undefined) {
                        minValue = $scope.facetUiState.sliderModelMin;
                    }
                    if (maxValue === undefined) {
                        maxValue = $scope.facetUiState.sliderModelMax;
                    }
                    $scope.facetUiState.fromDateRangeModel = minValue != null ? convertDateToTimezone(new Date(minValue), timezone) : null;
                    $scope.facetUiState.toDateRangeModel = maxValue != null ? convertDateToTimezone(new Date(maxValue), timezone) : null;
                } else {
                    $scope.facetUiState.sliderModelMin = minValue != null ? minValue : $scope.facetUiState.sliderModelMin;
                    $scope.facetUiState.sliderModelMax = maxValue != null ? maxValue : $scope.facetUiState.sliderModelMax;
                }

                // 10000 ticks
                let sliderSpan = $scope.facetUiState.sliderModelMax - $scope.facetUiState.sliderModelMin;
                if (sliderSpan > 0.00001) {
                    $scope.sliderStep = Math.round(10000*sliderSpan)/100000000;
                } else {
                    $scope.sliderStep = sliderSpan / 10000;
                }

                // Handle min=max
                if ($scope.sliderStep === 0) {
                    $scope.sliderStep = 1;
                }
                // handle scientific notation to get the # of decimal places
                $scope.sliderDecimals = 0;
                if ($scope.sliderStep < 1e-14) {
                    // no point in getting the # of decimal places, we'll end up below the precision of 64bit doubles
                    $scope.sliderDecimals = 14;
                } else {
                    let dec = 1;
                    while (dec > $scope.sliderStep) {
                        dec /= 10;
                        $scope.sliderDecimals++;
                    }
                }

                if ($scope.facet.currentMode === "NUMERICAL") {
                    let selector = $(element).find("div.ministogram-container").get(0);
                    let response = $scope.filterTmpData[$scope.facet.column].response;
                    $scope.isChart = response.histogramBars.length > 0;
                    $scope.isRangeSlider = $scope.isChart;
                    if ($scope.isChart) {
                    	d3.select(selector).selectAll("svg").remove();
                        let height = 100;
                        let width = $(selector).parent().width() !== 0 ? $(selector).parent().width() : 300;
                        let svg = d3.select(selector).append("svg").style("height", height).style("width", width).append("g");

                        let maxCount = 0;
                        for (let i = 0; i < response.histogramBars.length; i++) {
                            maxCount = Math.max(maxCount, response.histogramBars[i].count);
                        }
                        let xscale = d3.scale.linear().domain([response.minValue, response.maxValue]).range([0, width]);
                        let yscale = d3.scale.linear().domain([0, maxCount]).range([0, height]);

                        /* Each data is [lb, hb, value]*/
                        let barWidth = width / response.histogramBars.length;

                        let tooltip = d3.select("body").append("div")
                        .attr("class", "histogramtooltip")
                        .style("left", "0").style("top", "0")
                        .style("opacity", 0);

                        svg.selectAll("rect").data(response.histogramBars).enter().append("rect")
                        .attr("class", "histogrambar")
                        .attr("x", function(d) { return xscale(d.minValue) + 2; })
                        .attr("y", function(d) { return height - yscale(d.count);})
                        .attr("min", function(d) { return d.minValue;})
                        .attr("max", function(d) { return d.maxValue;})
                        .attr("count", function(d) { return d.count;})
                        .attr("width", barWidth-4)
                        .attr("height", function(d) { return yscale(d.count);})
                        .on("mouseover", function(d) {
                            tooltip.transition()
                            .duration(400)
                            .style("opacity", 1);
                            tooltip.html("[{0} - {1}] - {2} records".format(d.minValue.toFixed(2),
                                     d.maxValue.toFixed(2), Math.round(d.count)))
                            .style("left", (d3.event.pageX) + "px")
                            .style("top", (d3.event.pageY - 28) + "px");
                        }).on("mouseout", function(d) {
                            tooltip.transition()
                            .duration(500)
                            .style("opacity", 0);
                        });
                        svg.append("line").attr("x1", 0).attr("x2", width).attr("y1", height).attr("y2", height)
                        .style("stroke", "#ccc");
                    }
                }

                if ($scope.isFilterDateRange($scope.facet)) {
                	$scope.isChart = false;
                }
            }, true);

            $scope.dateRangeChange = function() {
                if ($scope.facetUiState) {
                    const from = $scope.facetUiState.fromDateRangeModel;
                    const to = $scope.facetUiState.toDateRangeModel;
                    const tz = $scope.facetUiState.timezoneDateRangeModel;

                    $scope.filterTmpData[$scope.facet.column].timezone = tz;
                    $scope.filterTmpData[$scope.facet.column].minValue = from != null ? convertDateFromTimezone(from, tz).getTime() : null;
                    $scope.filterTmpData[$scope.facet.column].maxValue = to != null ? convertDateFromTimezone(to, tz).getTime() : null;
                }
            };

            $scope.slideEnd = function() {
                $timeout(function() {
                    Logger.info("slideEnd event", $scope.facetUiState);
                    $scope.filterTmpData[$scope.facet.column].minValue = $scope.facetUiState.sliderModelMin;
                    $scope.filterTmpData[$scope.facet.column].maxValue = $scope.facetUiState.sliderModelMax;
                	$scope.$apply();
                }, 0);
            };

            $scope.switchToNumerical = function() {
                $scope.facet.currentMode = "NUMERICAL";
            };
            $scope.switchToAlphanum = function() {
                $scope.facet.currentMode = "ALPHANUM";
            };

            $scope.resetThisFilter = function() {
                $scope.clearFilter($scope.facet);
            };

            $scope.$watch("facet.dateFilterPart", function(nv, ov) {
                $scope.dateRelativeFilterPartsLabel = {YEAR:"Year", QUARTER_OF_YEAR:"Quarter", MONTH_OF_YEAR:"Month", DAY_OF_MONTH:"Day", HOUR_OF_DAY:"Hour"}[nv];
            });

            const computeRelativeDateIntervalDebounced = Debounce().withDelay(100,100).withScope($scope).wrap(function() {
                DataikuAPI.shakers.computeRelativeDateInterval({
                    part: $scope.facet.dateFilterPart,
                    option: $scope.facet.dateFilterRelativeOption,
                    offset: $scope.facet.dateFilterRelativeOption === 'NEXT' ? $scope.facet.dateFilterRelativeNext : $scope.facet.dateFilterRelativeLast
                }).success(function(interval) {
                    $scope.dateRelativeFilterComputedStart = interval.start;
                    $scope.dateRelativeFilterComputedEnd = interval.end;
                }).error(function() {
                    $scope.dateRelativeFilterComputedStart = '-';
                    $scope.dateRelativeFilterComputedEnd = '-';
                });
            })
            const refreshRelativeIntervalHint = function () {
                if ($scope.facet.dateFilterType === "RELATIVE") {
                    computeRelativeDateIntervalDebounced();
                }
            };

            $scope.$watchGroup(["facet.dateFilterType", "facet.dateFilterPart", "facet.dateFilterRelativeOption"], refreshRelativeIntervalHint);
            $scope.$watch("facet.dateFilterRelativeLast", () => {
                if ($scope.facet.dateFilterRelativeOption === 'LAST') {
                    refreshRelativeIntervalHint();
                }
            });
            $scope.$watch("facet.dateFilterRelativeNext", () => {
                if ($scope.facet.dateFilterRelativeOption === 'NEXT') {
                    refreshRelativeIntervalHint();
                }
            });

        	$scope.isSpinner = function() {
        		return !$scope.filterTmpData || !$scope.filterTmpData[$scope.facet.column] || (!$scope.filterTmpData[$scope.facet.column].values && !$scope.filterTmpData[$scope.facet.column].response);
        	}
        }
    };
}]);


app.directive('simpleAlphanumFilter', function() {
    return {
        templateUrl : '/templates/shaker/simple-alphanum-filter.html',
        replace:true,
        scope:true,
        restrict : 'E',
        link : function(scope, element, attrs) {
            scope.filterModes = {
                "full_string": "Full string",
                "substring": "Substring",
                "pattern": "Regular expression",
            };
            scope.filterNormalizations = {
                "exact": "Case-sensitive",
                "lowercase": "Lowercase",
                "normalized": "Normalized"
            };
            if (angular.isUndefined(scope.filter.params.mode)) {
                scope.filter.params.mode = "full_string";
            }
            $(element).find(".accordion-body").addClass("in");
            scope.onSmartChange = function() {
                if (angular.isDefined(scope.filter.values[0]) && scope.filter.values[0].length > 0) {
                    scope.refreshTable(true);
                }
            };
            scope.changeNormModeIfRegexp = function() {
            	if (scope.filter.params.mode === "pattern") {
            		scope.filter.params.normalization = "exact";
            	}
            };
        }
    };
});

app.directive('validityFilter', function() {
    return {
        templateUrl : '/templates/shaker/validity-filter.html',
        replace:true,
        scope:true,
        restrict : 'E',
        link : function(scope, element, attrs) {
            $(element).find(".accordion-body").addClass("in");

            scope.toggleValidityFacet = function(facetValue) {
            	return !facetValue;
            };

            scope.isAll = function() {
                return scope.filter.params.ok && scope.filter.params.nok && scope.filter.params.empty;
            };

            function goBackToAllIfNeeded(){
                if (!scope.filter.params.ok && !scope.filter.params.nok && !scope.filter.params.empty) {
                    scope.filter.params.ok = scope.filter.params.nok = scope.filter.params.empty = true;
                }
            }

            scope.toggleAll = function() {
                if (!scope.isAll()) {
                    scope.filter.params.ok = true;
                    scope.filter.params.nok = true;
                    scope.filter.params.empty = true;
                }
            };

            scope.toggleOk = function() {
                if (scope.isAll()) {
                    scope.filter.params.ok = true;
                    scope.filter.params.nok = false;
                    scope.filter.params.empty = false;
                } else {
                    scope.filter.params.ok = !scope.filter.params.ok;
                }
                goBackToAllIfNeeded();
            };

            scope.toggleNok = function() {
                if (scope.isAll()) {
                    scope.filter.params.ok = false;
                    scope.filter.params.nok = true;
                    scope.filter.params.empty = false;
                } else {
                    scope.filter.params.nok = !scope.filter.params.nok;
                }
                goBackToAllIfNeeded();

            };

            scope.toggleEmpty = function() {
                if (scope.isAll()) {
                    scope.filter.params.ok = false;
                    scope.filter.params.nok = false;
                    scope.filter.params.empty = true;
                } else {
                    scope.filter.params.empty = !scope.filter.params.empty;
                }
                goBackToAllIfNeeded();
            };

            scope.displayValue = function (value) {
                if (isNaN(value)) {
                    return value;
                } else {
                    return scope.roundForDisplay(value) + '%';
                }
            };

            scope.roundForDisplay = function (value) {
                let rounded = Math.floor(value);
                if (rounded == 0 && value > 0) {
                    return 1;
                }
                return rounded;
            };

            scope.isNaN = function(value) {
                return isNaN(value);
            }
        }
    };
});

})();

(function(){
'use strict';

var app = angular.module('dataiku.shaker');

function oneWayCompare(small,big) {
    if(small==big) {
        return true;
    } else if(Array.isArray(small)) {
        if(!Array.isArray(big)) {
            return false;
        }
        if(small.length!=big.length) {
           return false;
        }
        for(var i = 0 ; i < small.length; i++) {
            if(!oneWayCompare(small[i],big[i])) {
                return false;
            }
        }
        return true;
    } else if(typeof small=='object'){
        if(typeof big!='object') {
            return false;
        }
        for(var k in small) {
            if(!k.startsWith('$') && !oneWayCompare(small[k], big[k])) {
                return false;
            }
        }
        return true;
    }
}


app.controller("ShakerRecipeCreationController", function($scope, Fn, $stateParams, DataikuAPI, $controller) {
    $scope.recipeType = "shaker";
    $controller("SingleOutputDatasetRecipeCreationController", {$scope:$scope});

    $scope.autosetName = function() {
        if ($scope.io.inputDataset) {
            var niceInputName = $scope.io.inputDataset.replace(/[A-Z]*\./,"");
            $scope.maybeSetNewDatasetName(niceInputName + "_prepared");
        }
    };
});


app.directive("shakerRecipe", function($rootScope, $filter, $timeout, $q, Assert, DataikuAPI, WT1, TopNav, PartitionDeps, RecipesUtils, StateUtils, AnyLoc, Dialogs, Logger, ComputableSchemaRecipeSave, computeColumnWidths) {
    return {
        scope: true,
        controller: function($scope, $stateParams, $state, $controller) {
            $controller("_RecipeWithEngineBehavior", {$scope});

            TopNav.setTab(StateUtils.defaultTab("code"));

            WT1.event("shaker-script-open");

            $scope.hooks.getShaker = function() {
                return $scope.shaker;
            };

            $scope.hooks.onRecipeLoaded = function(){
                Logger.info("On Recipe Loaded");
                $scope.hooks.updateRecipeStatus();
            };

            $scope.hooks.updateRecipeStatus = function(forceUpdate, exactPlan) {
                var deferred = $q.defer();
                var payload = $scope.hooks.getPayloadData();
                var outputSchema = {columns:[]};
                if ($scope.table && $scope.table.headers) {
                	$scope.table.headers.forEach(function(h) {
                		if (h.recipeSchemaColumn && h.recipeSchemaColumn.column) {
                			var c = angular.copy(h.recipeSchemaColumn.column)
                			if (!c.name) {
                				c.name = h.name;
                			}
                			outputSchema.columns.push(c);
                		}
                	});
                }
                $scope.updateRecipeStatusBase(exactPlan, payload, {reallyNeedsExecutionPlan: exactPlan, outputSchema: outputSchema}).then(function() {
                    // $scope.recipeStatus should have been set by updateRecipeStatusBase
                    if (!$scope.recipeStatus) return deferred.reject();
                    deferred.resolve($scope.recipeStatus);
                    $scope.updateStepTranslatabilities();
                });
                return deferred.promise;
            };

            $scope.hooks.getPayloadData = function() {
                return JSON.stringify($scope.hooks.getShaker());
            };

            $scope.hooks.save = function() {
                var deferred = $q.defer();

                $scope.fixPreview();

                if ($scope.hasAnySoftDisabled()){
                    Dialogs.error($scope, "Cannot save", "Cannot save this prepare recipe: please disable Step preview");
                    deferred.reject();
                    return deferred.promise;
                }

                /* Complete the partition deps from the "fixedup" version */
                var recipeSerialized = angular.copy($scope.recipe);
                PartitionDeps.prepareRecipeForSerialize(recipeSerialized);

                var shaker = $scope.hooks.getShaker();

                ComputableSchemaRecipeSave.handleSaveShaker($scope, recipeSerialized, shaker, $scope.recipeOutputSchema, deferred);
                return deferred.promise;
            };

            $scope.hooks.recipeIsDirty = function() {
                if (!$scope.recipe) return false;
                if ($scope.creation) {
                    return true;
                } else {
                    var dirty = !angular.equals($scope.recipe, $scope.origRecipe);
                    dirty = dirty || $scope.schemaDirtiness.dirty;
                    var shaker = $scope.hooks.getShaker();
                    dirty = dirty || !oneWayCompare($scope.origShaker.steps,shaker.steps);
                    // FIXME That is ugly. oneWayCompare is used to ignore "stepStep" on steps,
                    // but we do want to notice when override table changes
                    if (!dirty) {
                        for(var i in $scope.origShaker.steps) {
                            var oldS = $scope.origShaker.steps[i];
                            var newS = shaker.steps[i];
                            dirty = dirty || !angular.equals(oldS.overrideTable, newS.overrideTable);
                            dirty = dirty || !angular.equals(oldS.comment, newS.comment);
                        }
                    }
                    dirty = dirty || !angular.equals($scope.origShaker.explorationFilters, shaker.explorationFilters)
                    dirty = dirty || !angular.equals($scope.origShaker.explorationSampling, shaker.explorationSampling)
                    return dirty;
                }
            };

            $scope.shakerHooks.setColumnMeaning = function(column, newMeaning) {
                Assert.inScope($scope, 'shaker');
                Assert.inScope($scope, 'recipeOutputSchema');

                var colData = $scope.recipeOutputSchema.columns[column.name];
                if (!colData){
                    Logger.warn("Column " + column.name + " not found");
                    return;
                }
                colData.column.meaning = newMeaning;
                $scope.schemaDirtiness.dirty = true;

                $scope.refreshTable(false);
            };

            $scope.shakerHooks.getSetColumnStorageTypeImpact = function(column, newType){
                var deferred = $q.defer();
                deferred.resolve({justDoIt:true});
                return deferred.promise;
            };
            $scope.shakerHooks.setColumnStorageType = function(column, newType, actionId){
                var colData = $scope.recipeOutputSchema.columns[column.name];
                if (!colData){
                    Logger.warn("Column " + column.name + " not found");
                    return;
                }
                colData.column.type = newType;
                colData.persistent = true;
                $scope.schemaDirtiness.dirty = true;
                $scope.refreshTable(true);
            };

            $scope.shakerHooks.updateColumnDetails = function(column) {
                var colData = $scope.recipeOutputSchema.columns[column.name];
                if (!colData){
                    Logger.warn("Column " + column.name + " not found");
                    return;
                }
                colData.column = column;
                colData.persistent = true;
                $scope.schemaDirtiness.dirty = true;
                $scope.refreshTable(true);
            };

            $scope.shakerHooks.updateColumnWidth = function(name, width) {
                Assert.inScope($scope, 'shaker');
                Assert.trueish($scope.shaker.columnWidthsByName, 'columnWidthsByName is null');

                $scope.shaker.columnWidthsByName[name] = width;
                $scope.schemaDirtiness.dirty = true;
                $scope.refreshTable(false);
            };

            $scope.clearResize = function() {
                Assert.inScope($scope, 'shaker');
                Assert.trueish($scope.shaker.columnWidthsByName, 'columnWidthsByName is null');

                const minColumnWidth = 100;
                $scope.shaker.columnWidthsByName = computeColumnWidths($scope.table.initialChunk, $scope.table.headers, minColumnWidth, $scope.hasAnyFilterOnColumn, $scope.shaker.columnWidthsByName, true)[1];
                $scope.schemaDirtiness.dirty = true;
                $scope.refreshTable(false);
            }

            $scope.isRecipe = true;
            $scope.table = undefined;
            $scope.processors = undefined;
            $scope.scriptId = "I don't need a script id"
            $scope.shakerWithSteps = true;
            $scope.shakerWritable = $scope.isProjectAnalystRW();

            $scope.schemaDirtiness = { dirty : false};

            var input = RecipesUtils.getSingleInput($scope.recipe, "main").ref;
            if (input.indexOf(".") > -1) {
                $scope.inputDatasetProjectKey = input.split(".")[0];
                $scope.inputDatasetName = input.split(".")[1];
            } else {
                $scope.inputDatasetProjectKey = $stateParams.projectKey;
                $scope.inputDatasetName = input;
            }

            $scope.shaker = JSON.parse($scope.script.data);
            $scope.shaker.origin = "PREPARE_RECIPE";
            $scope.origShaker = angular.copy($scope.shaker);
            $scope.fixupShaker();
            $scope.requestedSampleId = null;

            $scope.shakerState.writeAccess = $scope.isProjectAnalystRW();
            $scope.$watch("projectSummary", function(nv, ov) {
                $scope.shakerWritable = $scope.isProjectAnalystRW();
                $scope.shakerState.writeAccess = $scope.isProjectAnalystRW();
            });
            $scope.shakerState.withSteps = true;

            $scope.shakerHooks.onTableRefresh = function() {
                $scope.updateRecipeStatusLater();
            }
            $scope.shakerHooks.afterTableRefresh = function() {
            	// for steps with a report, because the report comes back from the table report
                $scope.updateRecipeStatusLater();
            }

            $scope.updateStepTranslatabilities = function() {
            	if (!$scope.recipeStatus) return;
            	if (!$scope.shaker.steps) return;
            	var flattenEnabledSteps = function(steps) {
            		steps.forEach(function(s) {delete s.$translatability;});
            		var flatList = [];
            		return steps.map(function(s) {
                		if (!s.disabled) {
                			if (s.metaType == 'GROUP') {
                				return flattenEnabledSteps(s.steps);
                			} else {
                				return [s];
                			}
                		} else {
                			return [];
                		}
                	}).reduce(function(acc, a) {return acc.concat(a);}, []);
            	};
            	var flatStepList = flattenEnabledSteps($scope.shaker.steps);
            	if (!$scope.recipeStatus.translatabilities) return; // do it here so that the translabilites are reset if the status is failed
            	if (flatStepList.length == $scope.recipeStatus.translatabilities.length) {
            		flatStepList.forEach(function(s, i) {s.$translatability = $scope.recipeStatus.translatabilities[i];});
            	}
            };

            var outputRef = RecipesUtils.getSingleOutput($scope.recipe, "main").ref;
            var outputLoc = AnyLoc.getLocFromSmart($stateParams.projectKey, outputRef);

            /* Set the initial dataset output schema as current recipe output schema */
            DataikuAPI.datasets.get(outputLoc.projectKey, outputLoc.localId, $stateParams.projectKey)
            .success(function(outputDataset) {
                $scope.recipeOutputSchema = { columns : {}, columnsOrder : [], outputDatasetType : outputDataset.type }
                angular.forEach(outputDataset.schema.columns, function(col) {
                    $scope.recipeOutputSchema.columns[col.name] = {
                        column: col,
                        persistent : true
                    };
                    $scope.recipeOutputSchema.columnsOrder.push(col.name);
                });
                $scope.refreshTable(false);
                $scope.baseInit();
            }).error(setErrorInScope.bind($scope));

            $scope.enableAutoFixup();

            /* When the "running job" alert is shown or removed, we need to force the
             * fat table to redraw itself */
            $scope.$watch("startedJob.jobId", function(){
                Logger.info("Forcing shaker table resize");
                $rootScope.$broadcast("forcedShakerTableResizing");
            });

            //TODO @recipes32 remove?
            $scope.$watch("recipe.params.engine", function(nv, ov) {
                if (nv == "SPARK" && !$scope.recipe.params.sparkConfig) {
                    $scope.recipe.params.sparkConfig = {}
                }
            });
            // params is not in the same place
            $scope.$watch("recipe.params.engineParams", $scope.updateRecipeStatusLater, true);
        }
    }
});
})();

(function(){
'use strict';

const app = angular.module('dataiku.shaker.analyse', ['dataiku.filters', 'platypus.utils']);

    function mesure(attr, def) {
        if (!attr) { return def; }
        var m = parseInt(attr);
        return m && !isNaN(m) ? m : def;
    }
    function svgElement(selector, width, height) {
        return d3.select(selector)
                .style({width: "100%", "max-width": width + "px"})
            .append("div").classed('d3-container', true) // fixed aspect ratio padding trick:
                .style({ position: "relative", "padding-top": (height * 100 / width) + "%" })
            .append("svg")
                .style({ width: "100%", position: "absolute", top: 0, bottom: 0 })
                .attr("viewBox", "0 0 " + width + " " + height)
                .attr("preserveAspectRatio", "xMinYMin meet");
    }
    function dateFormatter(asDate) {
        return (d) => {
            try {
                return (new Date(d)).toISOString().replace(/([^T]+)T(\d\d:\d\d):(\d\d)(\.\d+)?Z(.*)/, asDate);
            }
            catch (e) {
                return d3.format("s")(d);
            }
        }
    }

    app.directive("histogram", function($filter, NumberFormatter) {
        return {
            restrict: 'ECA',
            replace: true,
            template: '<div class="d3graph" />',
            scope: { data: '=', isDate: '=' },
            link: function(scope, element, attrs){
                var selector = $(element).get(0),
                    width  = mesure(attrs.width,  560),
                    height = mesure(attrs.height, 120);

                scope.$watch("data", function() {
                    if (scope.data == null) {
                        return;
                    }
                    d3.select(selector).selectAll('.d3-container').remove();

                    var min = scope.data.min,
                        max = scope.data.max,
                        asDate = scope.isDate,
                        bottom = 40;
                    for(var i in scope.data.chistogram) {
                        var val = scope.data.chistogram[i];
                        min = Math.min(min, val[0]);
                        max = Math.max(max, val[1]);
                    }

                    if (asDate) {
                        var days = (max - min) / 86400000;
                        if (days / 24 <= 1) { asDate = '$2:$3'; bottom = 50; }
                        else if (days <= 2) { asDate = '$2'; }
                        else { asDate = '$1'; bottom = 50; }
                    }

                    var svg = svgElement(selector, width, height + bottom).append("g"),
                        xscale = d3.scale.linear().domain([min, max]).range([0, width]),
                        yscale = d3.scale.linear().domain([0, scope.data.longestHistogramBar]).range([0, height]);

                    var barWidth = width / scope.data.chistogram.length;

                    var tooltip = d3.select("body").append("div")
                            .attr("class", "histogramtooltip")
                            .style("opacity", 0).style("top", "0");

                    /* Each datum is [lb, hb, value]*/
                    var entry = svg.selectAll("g.histogramentry").data(scope.data.chistogram).enter()
                        .append("g").attr("class", "histogramentry")
                        .on("mouseover", function(d, i) {
                            tooltip.transition().duration(400).style("opacity", 1);
                            var lowerBracket = i === 0 ? "[" : "(";
                            var lowerValue = scope.isDate ? $filter('utcDate')(d[0], 'YYYY-MM-DD HH:mm:ss') : d[0].toFixed(2);
                            var upperValue = scope.isDate ? $filter('utcDate')(d[1], 'YYYY-MM-DD HH:mm:ss') : d[1].toFixed(2);
                            tooltip.html(lowerBracket + " {0} , {1} ] - {2} rows".format(lowerValue,
                                         upperValue, Math.round(d[2])))
                                .style("left", (d3.event.pageX) + "px")
                                .style("top", (d3.event.pageY - 28) + "px");
                        })
                        .on("mouseout", function(d) {
                            tooltip.transition().duration(500).style("opacity", 0);
                        });
                    entry.append("rect").attr("class", "histogrambar")
                        .attr("x", function(d) { return xscale(d[0]); })
                        .attr("y", function(d) { return height - yscale(d[2]);})
                        .attr("width", barWidth-1)
                        .attr("height", function(d) { return yscale(d[2]);});
                    entry.append("rect").attr("class", "histogramhover")
                        .attr("x", function(d) { return xscale(d[0]); })
                        .attr("y", 0)
                        .attr("width", barWidth-1)
                        .attr("height", height);

                    const axisFormatter = asDate ? dateFormatter(asDate) : NumberFormatter.get(min, max, 10, false, false);

                    var drawnAxis = svg.append("g")
                        .attr("class", "x axis")
                        .style('fill', '#999')
                        .style('stroke', '#999')
                        .attr("transform", "translate(0," + height + ")")
                        .call(d3.svg.axis().scale(xscale).orient("bottom")
                                .tickFormat(axisFormatter));
                    drawnAxis.selectAll("text")
                        .style('stroke', 'none')
                        .style("text-anchor", "end")
                        .attr("dx", "-.8em")
                        .attr("dy", ".15em")
                        .attr("transform", "rotate(-35)");
                });
            }
        };
    });

    app.directive("miniHistogram", function() {
        return {
            restrict: 'ECA',
            replace: true,
            template: '<div class="d3graph" />',
            scope: { values: '=', activateBar: '=?' },
            link: function(scope, element, attrs){
                var selector = $(element).get(0),
                    width  = mesure(attrs.width,  500),
                    height = mesure(attrs.height, 180);

                scope.$watch("values", function() {
                    if (!scope.values) {
                        return;
                    }
                    d3.select(selector).selectAll('.d3-container').remove();

                    var nBars = Math.max(scope.values.length, 10), // ensure max bar width
                        barWidth = width / nBars,
                        min = Math.min.apply(Math, scope.values),
                        max = Math.max.apply(Math, scope.values);

                    var svg = svgElement(selector, width, height).append("g"),
                        xscale = d3.scale.linear().domain([0, nBars]).range([0, width]),
                        yscale = d3.scale.linear().domain([Math.min(0, min), max]).range([0, height]);

                    /* Each datum is the value */
                    var entry = svg.selectAll("g.histogramentry").data(scope.values).enter()
                        .append("g").attr("class", "histogramentry");
                    if (scope.activateBar) {
                        entry.on("mouseover", scope.activateBar)
                             .on("mouseout", scope.activateBar.bind(null, null));
                    }
                    entry.append("rect").attr("class", "histogrambar")
                        .attr("x", function(d, i) { return xscale(i); })
                        .attr("y", function(d) { return height - yscale(d);})
                        .attr("width", barWidth - 1)
                        .attr("height", yscale);
                    entry.append("rect").attr("class", "histogramhover")
                        .attr("x", function(d, i) { return xscale(i); })
                        .attr("y", 0)
                        .attr("width", barWidth - 1)
                        .attr("height", height);
                });
            }
        };
    });

    app.directive("barChart", function() {
        return {
            restrict: 'ECA',
            replace: true,
            template: '<div class="d3graph" />',
            scope: {
                data: '=data',
                count: '=count'
            },
            link: function(scope, element, attrs){
                var selector = $(element).get(0),
                    width =  mesure(attrs.width,  500),
                    baseHeight = mesure(attrs.height, 180);

                scope.$watch("data", function() {
                    if (!scope.data || !scope.data.percentages || !scope.data.percentages.length) {
                        return;
                    }
                    d3.select(selector).selectAll('.d3-container').remove();
                    const count = Math.min(scope.data.percentages.length, scope.count || 7),
                        height = count * baseHeight / scope.count,
                        svg = svgElement(selector, width, height + 40).append("g"),
                        max = Math.max.apply(Math, scope.data.percentages.slice(0, count)),
                        xscale = d3.scale.linear().domain([0, max]).range([0, width]),
                        yscale = d3.scale.linear().domain([0, count]).range([0, height]),
                        perCent = d3.format(".1%"),
                        barHeight = height / count,
                        ti = 0;

                    svg.selectAll("rect").data(scope.data.percentages.slice(0, count)).enter().append("rect")
                        .attr("class", "histogrambar")
                        .attr("x", 0)
                        .attr("y", function(d, i) { return yscale(i); })
                        .attr("width", function(d) { return xscale(d); })
                        .attr("height", barHeight - 1);

                    svg.append("g").attr("transform", "translate(10, 3)")
                        .selectAll("text").data(scope.data.percentages.slice(0, count)).enter().append("text")
                        .text(function(d, i) { return [scope.data.values[i],
                            " (", perCent(scope.data.percentages[i]), ")"].join(""); })
                        .attr("x", 0)
                        .attr("y", function(d, i) { return yscale(i) + barHeight / 2; });

                    const drawnAxis = svg.append("g")
                        .attr("class", "x axis")
                        .style('fill', '#999')
                        .style('stroke', '#999')
                        .attr("transform", "translate(0," + height + ")")
                        .call(d3.svg.axis().scale(xscale).orient("bottom")
                            .tickFormat(perCent));
                    drawnAxis.selectAll("text")
                        .style('stroke', 'none')
                        .style("text-anchor", "end")
                        .attr("dx", "-.8em")
                        .attr("dy", ".15em")
                        .attr("transform", "rotate(-35)");
                });
            }
        };
    });

    app.directive('boxPlot', function() {
        return {
            restrict: 'ECA',
            replace: true,
            template: '<div class="d3graph" />',
            scope : {
                data : '=data',
            },
            link: function(scope, element, attrs){
                var selector = $(element).get(0),
                    height = mesure(attrs.height, 25),
                    width  = mesure(attrs.width,  560),
                    fill = '#C4E0FE',   // digital-blue-lighten-4
                    stroke = '#000';

                scope.$watch("data", function() {
                    if (scope.data == null) {
                        return;
                    }

                    d3.select(selector).selectAll('.d3-container').remove();

                    var svg = svgElement(selector, width, height).append("g");

                    var x1 = d3.scale.linear()
                    .domain([scope.data.min, scope.data.max])
                    .range([0, width]);

                    var center = svg.selectAll("line.center")
                    .data([scope.data])
                    .enter().insert("svg:line", "rect")
                    .attr("class", "center")
                    .attr("x1", function(d) { return x1(d.lowWhisker); })
                    .attr("y1", height/2)
                    .attr("x2", function(d) { return x1(d.highWhisker); })
                    .attr("y2", height / 2)
                    .style("opacity", 1)
                    .style("stroke", stroke);

                    var box = svg.selectAll("rect.box").data([scope.data])
                    .enter().append("svg:rect")
                    .attr("class", "box")
                    .attr("x", function(d) { return x1(d.quartiles[0]); })
                    .attr("y", 0) // Avoid margin issues
                    .attr("width", function(d) { return x1(d.quartiles[2]) - x1(d.quartiles[0]);})
                    .attr("height", height) // Avoid margin issues
                    .attr("fill", fill)
                    //.attr("stroke", fill)
                    .style("opacity", "1");

                    var median = svg.selectAll("line.median").data([scope.data])
                    .enter().append("svg:line")
                    .attr("class", "median")
                    .attr("y1", 0)
                    .attr("x1", function(d) { return x1(d.median); })
                    .attr("y2", height)
                    .attr("x2", function(d) { return x1(d.median); })
                    .style("stroke", stroke);

                    var whiskers = svg.selectAll("line.whisker").data([scope.data.lowWhisker, scope.data.highWhisker])
                    .enter().append("svg:line")
                    .attr("class", "whisker")
                    .attr("y1", height * 0.3)
                    .attr("x1", function(d) { return x1(d); })
                    .attr("y2", height * 0.7)
                    .attr("x2", function(d) { return x1(d); })
                    .style("stroke", stroke);

                    svg.selectAll("text.whisker").data([scope.data.lowWhisker, scope.data.highWhisker])
                    .enter().append("svg:text")
                    .attr("class", "whisker")
                    .attr("dy", ".3em")
                    .attr("dx", 6)
                    .attr("x", width)
                    .attr("y", x1).style("font-size", "12px")
                    .text(function(d) { return d.toPrecision(3);});

                    svg.selectAll("text.box").data(scope.data.quartiles)
                    .enter().append("svg:text")
                    .attr("class", "box")
                    .attr("dy", ".3em")
                    .attr("dx", function(d, i) { return i & 1 ? 6 : -6; })
                    .attr("x", function(d, i) { return i & 1 ? width : 0; })
                    .attr("text-anchor", function(d, i) { return i & 1 ? "start" : "end"; })
                    .attr("y", x1).style("font-size", "12px")
                    .text(function(d) { return d.toPrecision(3);});
                });
            }
        };
    });

app.directive('analyseFullSampleToggle', function($stateParams, DataikuAPI, CreateModalFromTemplate, FutureWatcher, FutureProgressModal) {
    return {
        scope: false,
        restrict: 'A',
        templateUrl: "/templates/shaker/analyse-full-sample-toggle.html",
        link: function($scope, element, attrs) {
            function generateSampleModes() {
                function makeMode(label, partitionId) {
                    return {
                        useFullSampleStatistics: true,
                        label: label,
                        partitionId: partitionId
                    };
                }
                const modes = [{
                    useFullSampleStatistics:false,
                    label:"Sample"
                }];
                if ($scope.datasetFullInfo.partitioned) {
                    if ($scope.shaker && $scope.shaker.explorationSampling && $scope.shaker.explorationSampling.selection) {
                        const selection = $scope.shaker.explorationSampling.selection;
                        if (selection.partitionSelectionMethod == 'ALL') {
                            modes.push(makeMode("Whole data", "ALL"));
                        } else if (selection.partitionSelectionMethod == 'LATEST_N') {
                            // todo : get the list of the latest n partitions in the front
                            modes.push(makeMode("Whole data", "ALL"));
                        } else {
                            selection.selectedPartitions.forEach(function(partitionId) {
                                modes.push(makeMode("Whole " + partitionId, partitionId));
                            });
                        }
                    } else {
                        modes.push(makeMode("Whole data", "ALL"));
                    }
                } else {
                    modes.push(makeMode("Whole data", "NP"));
                }
                $scope.sampleModes = modes;
                const old = $scope.sampleMode;
                $scope.sampleMode = modes.filter(function(m) {
                    return old && m.useFullSampleStatistics == old.useFullSampleStatistics && m.partitionId == old.partitionId;
                })[0];
                if ($scope.sampleMode == null) {
                    // use the sample as default
                    $scope.sampleMode = $scope.sampleModes[0];
                }
            }
            $scope.sampleModes = [];
            $scope.sampleMode = null;
            generateSampleModes();
            // prepare the data for the partition selection of the full sample pane (if partitioned)
            var updateSampleMode = function() {
                $scope.uiState.useFullSampleStatistics = $scope.sampleMode ? $scope.sampleMode.useFullSampleStatistics : false;
                $scope.uiState.fullPartitionId = $scope.sampleMode ? $scope.sampleMode.partitionId : null;
            };
            updateSampleMode();
            $scope.$watch('sampleMode', updateSampleMode);

            $scope.prefix = attrs.prefix;

            $scope.configureFullSampleStatistics = function(initial) {
                var origFullSampleStatistics = initial ? null : angular.copy($scope.shaker.fullSampleStatistics);
                CreateModalFromTemplate("/templates/shaker/analyze-full-sample-config.html", $scope, "AnalyzeFullSampleConfigController").then(function(decision) {
                    if (decision && decision.save) {
                        if (!angular.equals(origFullSampleStatistics, $scope.shaker.fullSampleStatistics)) {
                            $scope.autoSaveForceRefresh();
                        }
                    }
                    if (decision && decision.compute) {
                        $scope.doComputeFullMetrics($scope.columnName, false); // no need to wait for the shaker refresh, we send the $scope.shaker.fullSampleStatistics in the compute call
                    }
                });
            };
            if ($scope.uiState) {
                // put it also in the uiState to share with links in the modal
                $scope.uiState.configureFullSampleStatistics = $scope.configureFullSampleStatistics;
            }
            $scope.doComputeFullMetrics = function(columnName, forceRefresh) {
                // columnName null means 'do all columns'
                $scope.fatalAPIError = null;
                DataikuAPI.datasets.computeDetailedColumnMetrics($stateParams.projectKey, $stateParams.datasetName, columnName, $scope.shaker.fullSampleStatistics, $scope.uiState.fullPartitionId, forceRefresh).success(function(data) {
                    $scope.computingFullMetrics = data;
                    $scope.computingModalHandle = FutureProgressModal.reopenableModal($scope, $scope.computingFullMetrics, "Computing metrics…");
                    $scope.computingModalHandle.promise.then(function(result) {
                        // success
                        $scope.computingFullMetrics = null;
                        $scope.$eval(attrs.callback)();
                        const errorRuns = result && result.runs && result.runs.filter(_ => _.error);
                        if (errorRuns && errorRuns.length) {
                            $scope.lastComputeResult = {runs: errorRuns, startTime: result.startTime, endTime: result.endTime};
                        } else {
                            $scope.lastComputeResult = null;
                        }
                    }, function(data) {
                        $scope.computingFullMetrics = null;
                    });
                    $scope.showProgressModal();
                }).error(setErrorInScope.bind($scope));
            };

            $scope.showProgressModal = function (jobId) {
                if ($scope.computingModalHandle && $scope.computingModalHandle.open) {
                    $scope.computingModalHandle.open();
                }
            };

            $scope.abortComputingFullMetrics = function() {
                DataikuAPI.futures.abort($scope.computingFullMetrics.jobId).error(setErrorInScope.bind($scope));
            };

            var updateUseFullSampleStatistics = function() {
                if ($scope.uiState.useFullSampleStatistics && (($scope.shaker && $scope.shaker.fullSampleStatistics == null) || ($scope.analysis && $scope.analysis.fullSampleStatistics == null))) {
                    var doConfigure = function() {
                        DataikuAPI.datasets.getFullSampleStatisticsConfig($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName).success(function(data) {
                            if ($scope.shaker) {
                                $scope.shaker.fullSampleStatistics = data;
                            }
                            if ($scope.analysis) {
                                $scope.analysis.fullSampleStatistics = data;
                            }
                            $scope.configureFullSampleStatistics(data); // will do the save
                        }).error(setErrorInScope.bind($scope));
                    };
                
                    // first time activating statistics on the full dataset for this dataset => 
                    if ($scope.columnFilter) {
                        // columns-view mode: all ready, we have the multi-column analysis already
                        doConfigure();
                    } else {
                        // single-column-header mode (ie the modal)
                        // 1) fetch with full-sample statistics
                        $scope.refreshAnalysis().then(function(data) {
                            // 2) if still all empty, ask for the configuration then compute
                            var stillNoGood = false; // whether we have the count of values serves as a check that something was ever computed
                            if (data.fullSampleAnalysis == null) {
                                stillNoGood = true;
                            } else if (data.fullSampleAnalysis.categorical == null) {
                                stillNoGood = true;
                            } else if (data.fullSampleAnalysis.categorical.count == null) {
                                stillNoGood = true;
                            } else if (data.fullSampleAnalysis.categorical.count.value == null) {
                                stillNoGood = true;
                            }
                            if (stillNoGood) {
                                doConfigure();
                            }
                        });
                    }
                }
            };
            $scope.$watch('uiState.useFullSampleStatistics', updateUseFullSampleStatistics);

            $scope.$watch('shaker.explorationSampling.selection', generateSampleModes, true);
        }
    }
});


app.controller("AnalyzeFullSampleConfigController", function($scope, DataikuAPI, $stateParams, $timeout, $filter,
        TableChangePropagator, WT1, LoggerProvider, Fn, CreateModalFromTemplate) {
    WT1.event("analyse-full-sample-configuration-open");

    $scope.uiState = {
        tab: 'METRICS'
    };
});


app.controller("ColumnAnalysisController", function($scope, DataikuAPI, $stateParams, $timeout, $filter,
        Assert, TableChangePropagator, WT1, LoggerProvider, Fn, $q) {

    WT1.event("analyse-open");

    var Logger = LoggerProvider.getLogger('ColumnAnalysisController');

    $scope.tcp = TableChangePropagator;
    $scope.uiState = {
        activeTab: "categorical",
        useFullSampleStatistics: false,
        fullPartitionId: null
    };
    $scope.$watch('uiState.fullPartitionId', function(nv, ov) {
        // note: (null == undefined) = true but (null === undefined) = false
        if (nv != null && ov != null && !angular.equals(ov, nv)) {
            $scope.refreshAnalysis();
        }
    });

    /* Main initialization + column change function */
    $scope.setColumn  = function(column, columns) {
        var changed = $scope.columnName !== column.name;
        $scope.column = column;
        $scope.columnName = column.name;
        $scope.showNumerical = column.isDouble;
        $scope.isDate  = column.selectedType.name === 'Date';
        $scope.showArray = column.selectedType.name === 'JSONArrayMeaning';
        $scope.showText  = column.selectedType.name === 'FreeText' && $scope.shakerHooks && $scope.shakerHooks.fetchTextAnalysis;
        $scope.showClusters = $scope.shakerHooks && $scope.shakerHooks.fetchClusters;

        if (columns) {  // optional columns list for previous/next
            $scope.columns = columns;
        }
        if ($scope.columns && $scope.columns.length) {
            var columnIndex = $scope.columns.indexOf(column);
            if (columnIndex >= 0) {
                $scope.nextColumn = $scope.columns[columnIndex + 1];
                $scope.prevColumn = $scope.columns[columnIndex - 1];
            }
        }

        if (changed) { // Force the auto-select of analysis type to retrigger
            $scope.analysis = null;
        }
        $scope.textAnalysis = null;
        $scope.refreshAnalysis();

        if ($scope.shaker.fullSampleStatistics && $scope.shaker.fullSampleStatistics.updateOnAnalyzeBoxOpen) {
            $scope.doComputeFullMetrics($scope.columnName, false);
        }
    };
    $scope.updateColumn = function(name) {
        var col = null;
        $scope.table.headers.some(function(h) {
            if (h.name === name) {
                col = h;
                return true;
            }
            return false;
        });
        return col;
    };

    $scope.getFullCHistogram = function() {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.numeric) return null;
        var numeric = $scope.analysis.fullSampleAnalysis.numeric;
        if (numeric.histogram && numeric.histogram.value != null) {
            if (numeric.histogramData) return numeric.histogramData; // cache for $watch
            var histogram = numeric.histogram.value;
            var longestHistogramBar = 0;
            histogram.forEach(function(bin) {longestHistogramBar = Math.max(longestHistogramBar, bin[2]);});
            numeric.histogramData = {min:numeric.min.value, max:numeric.max.value, chistogram:histogram, longestHistogramBar:longestHistogramBar};
            return numeric.histogramData;
        } else {
            return null;
        }
    };
    $scope.getFullBoxplot = function() {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.numeric) return null;
        var numeric = $scope.analysis.fullSampleAnalysis.numeric;
        if ($scope.hasNumeric('median') && $scope.hasNumeric('min') && $scope.hasNumeric('max') && $scope.hasNumeric('p75') && $scope.hasNumeric('p25')) {
            if (numeric.boxplotData) return numeric.boxplotData; // cache for $watch
            var min = numeric.min.value;
            var median = numeric.median.value;
            var max = numeric.max.value;
            var p25 = numeric.p25.value;
            var p75 = numeric.p75.value;
            var iqr = p75 - p25;
            var lowWhisker = Math.max(min, p25 - iqr * 1.5);
            var highWhisker = Math.min(max, p75 + iqr * 1.5);
            numeric.boxplotData = {min:numeric.min.value, max:numeric.max.value, median:median, quartiles:[p25,median, p75], lowWhisker:lowWhisker, highWhisker:highWhisker};
            return numeric.boxplotData;
        } else {
            return null;
        }
    };

    $scope.getFullTop10WithCounts = function() {
        var categorical = $scope.analysis.fullSampleAnalysis.categorical;
        if (categorical.top10WithCounts && categorical.top10WithCounts.value) {
            if (categorical.top10WithCountsData) return categorical.top10WithCountsData; // cache for $watch
            var top10WithCounts = categorical.top10WithCounts.value;
            var total = categorical.count != null && categorical.countMissing != null ? (categorical.count.value + categorical.countMissing.value) : null;
            var top10WithCountsData = [];
            var cum = 0;
            var maxCount = top10WithCounts.length > 0 ? top10WithCounts[0][1] : 0;
            top10WithCounts.forEach(function(pair) {
                var value = pair[0], count = pair[1];
                cum += count;
                var top10WithCountsPoint = {value: value, count:count, cum:cum, maxCount:maxCount};
                if (total != null && total > 0) {
                    top10WithCountsPoint.percent = 100.0 * count / total;
                    top10WithCountsPoint.cumPercent = 100.0 * cum / total;
                }
                top10WithCountsData.push(top10WithCountsPoint);
            });
            categorical.top10WithCountsData = top10WithCountsData;
            return categorical.top10WithCountsData;
        } else {
            return null;
        }
    };

    $scope.numericNeedsRecompute = function(p) {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.numeric) return false;
        if (p in $scope.analysis.fullSampleAnalysis.numeric) {
            var v = $scope.analysis.fullSampleAnalysis.numeric[p];
            return !v.current || (v.value == null && v.reason == null); // no 'reason' field == no reason for missing
        } else {
            return false;
        }
    };
    $scope.hasNumeric = function(p) {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.numeric) return false;
        if (p in $scope.analysis.fullSampleAnalysis.numeric) {
            var v = $scope.analysis.fullSampleAnalysis.numeric[p];
            return v.value != null;
        } else {
            return false;
        }
    };
    $scope.numericsNeedRecompute = function(ps) {
        var need = false;
        ps.forEach(function(p) {need |= $scope.numericNeedsRecompute(p);});
        return need;
    };
    $scope.categoricalNeedsRecompute = function(p) {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.categorical) return false;
        if (p in $scope.analysis.fullSampleAnalysis.categorical) {
            var v = $scope.analysis.fullSampleAnalysis.categorical[p];
            return !v.current || (v.value == null && v.reason == null); // no 'reason' field == no reason for missing
        } else {
            return false;
        }
    };
    $scope.hasCategorical = function(p) {
        if (!$scope.analysis || !$scope.analysis.fullSampleAnalysis || !$scope.analysis.fullSampleAnalysis.categorical) return false;
        if (p in $scope.analysis.fullSampleAnalysis.categorical) {
            var v = $scope.analysis.fullSampleAnalysis.categorical[p];
            return v.value != null;
        } else {
            return false;
        }
    };
    $scope.categoricalsNeedRecompute = function(ps) {
        var need = false;
        ps.forEach(function(p) {need |= $scope.categoricalNeedsRecompute(p);});
        return need;
    };

    $scope.updateUseFullSampleStatistics = function() {
        // leave tabs that are not available in full sample
        if ($scope.uiState.useFullSampleStatistics) {
            if ($scope.uiState.activeTab != 'categorical' && $scope.uiState.activeTab != 'numerical') {
                $scope.uiState.activeTab = 'categorical';
            }
        }
    };
    $scope.$watch('uiState.useFullSampleStatistics', $scope.updateUseFullSampleStatistics);

    $scope.$on("$destroy", $scope.$parent.$on("shakerTableChanged", function() {
        // $scope.column[s] stats may be stale but names should not be -> remap
        $scope.setColumn($scope.updateColumn($scope.columnName),
            !$scope.columns ? null :
                $scope.columns.map(Fn(Fn.prop('name'), $scope.updateColumn)).filter(Fn.SELF));
    }));

    $scope.numData = function(d, interval, long) {
        if ($scope.isDate) {
            if (interval === true) {
                return $filter('friendlyDuration' + (long ? '' : 'Short'))(d);
            } else if (long) {
                return moment(d).toISOString().substring(0, 19) + 'Z'; // drop the milliseconds
            } else {
                return $filter('utcDate')(d, 'YYYY-MM-DD HH:mm:ss');
            }
        }
        return long ? d : $filter('nicePrecision')(d, 5);
    };

    $scope.initializeClusterer = function(){
        Assert.inScope($scope, 'analysis');

        var getNumberOfSpaces = function(str){
            return str.split(" ").filter(function(v){return v !== '';}).length - 1;
        }

        var facet = $scope.analysis.alphanumFacet;

        var lengthTotal = 0;
        var spacesTotal = 0;
        for (var i in facet.values) {
            spacesTotal += getNumberOfSpaces(facet.values[i]);
            lengthTotal += facet.values[i].length;
        }

        // Parameters for the clusterer
        $scope.cp.meanLength = Math.round(lengthTotal / facet.values.length);
        $scope.cp.meanSpaces = Math.round(spacesTotal / facet.values.length);
        var nValues = facet.totalNbValues;
        // if average word length is high, clustering is slower

        if (!$scope.cp.initialized){
            if (nValues >= 1500) {
                $scope.cp.blockSize = SpeedLevel.FAST;
            } else {//if (nValues >= 200) {
                $scope.cp.blockSize = SpeedLevel.MID;
            } /*else {
                $scope.cp.blockSize = SpeedLevel.SLOW;
            }*/
        }

        if($scope.cp.meanSpaces < 1){
            $scope.cp.setBased = "false";
        } else {
            $scope.cp.setBased = "true";
        }
    }

    $scope.refreshAnalysis = function() {
        let deferred = $q.defer();
        var first = $scope.analysis == null;
        var setAnalysis = function(data) {
            $scope.analysis = data;

            if (first) {
                if($scope.showNumerical && data.alphanumFacet.totalNbValues > 15) {
                    $scope.uiState.activeTab = 'numerical';
                } else {
                    $scope.uiState.activeTab = 'categorical';
                }
            }

            if ($scope.analysis.numericalAnalysis){
                var na = $scope.analysis.numericalAnalysis;
                $scope.removeBounds = {
                    "1.5 IQR" : [
                        Math.max((na.quartiles[0] - na.iqr * 1.5), na.min),
                        Math.min((na.quartiles[2] + na.iqr * 1.5), na.max)
                    ],
                    "5 IQR" : [
                        Math.max((na.quartiles[0] - na.iqr * 5), na.min),
                        Math.min((na.quartiles[2] + na.iqr * 5), na.max)
                    ]
                };
            }

            data.alphanumFacet.selected = data.alphanumFacet.values.map(Fn.cst(false));
            data.alphanumFacet.maxRatio = data.alphanumFacet.percentages[0];

            if (data.arrayFacet) {
                data.arrayFacet.selected = [];
                data.arrayFacet.values.forEach(function(){
                    data.arrayFacet.selected.push(false);
                })

            }

            $scope.initializeClusterer();
            deferred.resolve(data);
        };
        
        var failAnalysis = function() {
            deferred.reject("failed");
        };
        
        if ( $scope.shakerHooks.fetchDetailedAnalysis ) {
            $scope.shakerHooks.fetchDetailedAnalysis(setAnalysis, failAnalysis, $scope.columnName, 50, $scope.uiState.fullPartitionId, $scope.uiState.useFullSampleStatistics);
        } else {
            deferred.resolve({});
        }
        return deferred.promise;
    };

    $scope.deleteColumn = function() {
        var goner = $scope.columnName,
            col = $scope.nextColumn || $scope.prevColumn;
        if (col) {
            $scope.setColumn(col);
        }

        $scope.addStepNoPreview("ColumnsSelector", { keep: false, columns: [goner], appliesTo: "SINGLE_COLUMN" }, true);
        $scope.mergeLastColumnDeleters();
        $scope.autoSaveForceRefresh();

        if (!col && $scope.dismiss) { //$scope.dismiss is available in the context of a modal
            $scope.dismiss();
        }
    };

    /*******************************************************
     * Generic "current transform" handling
     *******************************************************/

    $scope.currentTransform = null;
    $scope.cancelTransform = function() {
        $scope.currentTransform = null;
        $scope.merge = null;
        $scope.editRow = null;
    };
    // Cancel current transform at each refresh
    $scope.$watch("analysis", $scope.cancelTransform);

    /*******************************************************
     * 'Edit' category view actions
     *******************************************************/

    $scope.startEditValue = function(rowId, objectScope) {
        if($scope.editRow !== rowId) {
            $scope.editRow = rowId;
            objectScope.newValue = $scope.analysis.alphanumFacet.values[$scope.editRow];
            window.setTimeout(function() {
                document.getElementById('analyseCatEdit' + rowId).focus();
            }, 0);
        }
    };
    $scope.handleKey = function($event) {
        switch ($event.keyCode) {
        case 27:
            $scope.editRow = null;
            $event.stopPropagation();
            return;
        case 13:
            $scope.doneEditing($event.delegateTarget.value);
            $event.preventDefault();
            $event.stopPropagation();
            return;
        }
    };
    $scope.doneEditing = function(newValue) {
        if (!newValue) {
            $scope.editRow = null;
            return;
        }
        if ($scope.editRow === null) return;
        Assert.inScope($scope, 'analysis');

        var facets = $scope.analysis.alphanumFacet.values,
            oldValue = facets[$scope.editRow];

        if (newValue !== oldValue) {
            facets[$scope.editRow] = newValue;
            $scope.editRow = null;

            if(oldValue) {
                $scope.addStepNoPreview("FindReplace", {
                    appliesTo: 'SINGLE_COLUMN',
                    columns: [$scope.columnName],
                    mapping: [{from: oldValue, to: newValue}],
                    normalization: 'EXACT',
                    matching: 'FULL_STRING'
                }, true);
            } else {
                $scope.addStepNoPreview("FillEmptyWithValue", {
                    appliesTo: 'SINGLE_COLUMN',
                    columns: [$scope.columnName],
                    value: newValue
                }, true);
            }
            $scope.mergeLastFindReplaces();
            $scope.autoSaveForceRefresh();
            $scope.cancelTransform();
            WT1.event("analyse-category-merge", {mergedVals: 1});
        } else {
            $scope.editRow = null;
        }
    }

    /*******************************************************
     * Regular category view actions
     *******************************************************/

    $scope.nbSelected = function() {
        return $scope.getSelectedValues().length;
    };
    $scope.getSelectedValues = function() {
        if (!$scope.analysis) return [];
        return $scope.analysis.alphanumFacet.values.filter(Fn.from($scope.analysis.alphanumFacet.selected, 1));
    };
    $scope.selectAllValues = function(sel) {
        if (!$scope.analysis) return;
        $scope.analysis.alphanumFacet.selected.forEach(
            function(s, i) { $scope.analysis.alphanumFacet.selected[i] = sel; });
    };

    /* Merging */
    $scope.merge = null;
    $scope.mergeSelected = function(revert) {
        var vals = $scope.getSelectedValues(),
            target = $scope.merge ? $scope.merge.value : (revert ? "Others" : vals[0]),
            hasVals = revert ? vals.length < $scope.analysis.alphanumFacet.totalNbValues : vals.length > 0;
        if (!hasVals) {
            $scope.cancelTransform();
            return;
        }
        $scope.merge = {
            count: revert ? $scope.analysis.alphanumFacet.totalNbValues - vals.length : vals.length,
            index: null, // selection
            revert: !!revert,
            empty: vals.indexOf('') >= 0,
            value: target
        };
        $scope.currentTransform = "merge";
    };
    $scope.mergeTail = function(index) {
        if (typeof index !== 'number') {
            return;
        }
        $scope.merge = {
            count: $scope.analysis.alphanumFacet.totalNbValues - index - 1,
            index: index,
            revert: false,
            empty: $scope.analysis.alphanumFacet.values.slice(0, index + 1).indexOf('') < 0,
            value: "Others"
        };
        $scope.currentTransform = "merge";
    };
    $scope.execMerge = function() {
        Assert.trueish($scope.merge && $scope.merge.value, 'no merge value');
        var vals;
        function filter(v) {
            return v && v !== $scope.merge.value;
        }

        if (typeof $scope.merge.index === 'number') {  // long tail after index
            vals = $scope.analysis.alphanumFacet.values.slice(0, $scope.merge.index + 1).filter(filter);
            if (!$scope.merge.empty) {
                vals.push('');
            }
            if (!vals.length) return;
            $scope.addStepAndRefresh("LongTailGrouper", {
                column: $scope.columnName,
                replace: $scope.merge.value,
                toKeep: vals
            }, true);
            WT1.event("analyse-category-longtailgroup", {keptVals: vals.length, type: 'below'});

        } else if ($scope.merge.revert) {    // long tail (merge unselected)
            vals = $scope.getSelectedValues().filter(filter);
            if (!$scope.merge.empty) {
                vals.push('');
            }
            if (!vals.length) return;
            $scope.addStepAndRefresh("LongTailGrouper", {
                column: $scope.columnName,
                replace: $scope.merge.value,
                toKeep: vals
            }, true);
            WT1.event("analyse-category-longtailgroup", {keptVals: vals.length, type: 'selection'});

        } else {    // merge selected
            vals = $scope.getSelectedValues().filter(filter);
            if (vals.length) {
                $scope.addStepNoPreview("FindReplace", {
                    appliesTo: 'SINGLE_COLUMN',
                    columns: [$scope.columnName],
                    mapping: vals.map(function(v) { return {from: v, to: $scope.merge.value}; }),
                    normalization: 'EXACT',
                    matching: 'FULL_STRING'
                }, true);
                $scope.mergeLastFindReplaces();
            }
            if ($scope.merge.empty) {
                $scope.addStepNoPreview("FillEmptyWithValue", {
                    appliesTo: 'SINGLE_COLUMN',
                    columns: [$scope.columnName],
                    value: $scope.merge.value
                }, true);
            }
            WT1.event("analyse-category-merge", {mergedVals: vals.length + ($scope.merge.empty ? 1 : 0)});
        }
        $scope.autoSaveForceRefresh();
        $scope.cancelTransform();
    };

    /* Removing, Keeping, Clearing */
    function flagValues(action, values) {
        var touched = 0;
        if (values.indexOf('') >= 0) {
            $scope.addStepNoPreview("RemoveRowsOnEmpty",{
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.columnName],
                keep: action === 'KEEP_ROW'
            }, true);
            values = values.filter(Fn.SELF);
            touched++;
        }
        if (values.length) {
            $scope.addStepNoPreview("FilterOnValue", {
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.columnName],
                action: action,
                matchingMode: 'FULL_STRING',
                normalizationMode: 'EXACT',
                values: values
            }, true);
            touched += values.length;
        }
        if (!touched) return 0;
        if (action === 'REMOVE_ROW' || action === 'KEEP_ROW') {
            $scope.mergeLastDeleteRows();
        }
        $scope.autoSaveForceRefresh();
        return touched;
    }
    $scope.removeRowsOnSelection = function() {
        var n = flagValues('REMOVE_ROW', $scope.getSelectedValues());
        WT1.event("analyse-category-removeselected", {removedVals: n});
    }
    $scope.removeValue = function(index) {
        flagValues('REMOVE_ROW', [$scope.analysis.alphanumFacet.values[index]]);
        WT1.event("analyse-category-removeone");
    }
    $scope.keepValue = function(index) {
        flagValues('KEEP_ROW', [$scope.analysis.alphanumFacet.values[index]]);
        WT1.event("analyse-category-keepone");
    };
    $scope.clearValue = function(index) {
        flagValues('CLEAR_CELL'), [$scope.analysis.alphanumFacet.values[index]]
        WT1.event("analyse-category-clearone");
    };
    $scope.clearCellsOnSelection = function() {
        var n = flagValues('CLEAR_CELL', $scope.getSelectedValues().filter(Fn.SELF));
        WT1.event("analyse-category-clearselected", {clearedVals: n});
    };
    $scope.removeEmpty = function() { flagValues('REMOVE_ROW', ['']); };

    /* Filtering */
    $scope.filterViewOnSelection = function() {
        $scope.addColumnFilter($scope.columnName,
            // transform ['a', 'b'] into {a: true, b: true} for facets
            $scope.getSelectedValues().reduce(function(o, k) { o[k] = true; return o; }, {}),
            "full_string", $scope.column.selectedType.name, $scope.column.isDouble);
        $scope.dismiss();
        $scope.autoSaveForceRefresh();
    };
    $scope.handleInvalids = function(action) {  // e.g. REMOVE_ROW or CLEAR_CELL
        $scope.addStepNoPreview("FilterOnBadType", {
            appliesTo: 'SINGLE_COLUMN',
            columns: [$scope.columnName],
            action: action,
            type: $scope.column.selectedType.name
        }, true);
        if (action === 'REMOVE_ROW' || action === 'KEEP_ROW') {
            $scope.mergeLastDeleteRows();
        }
        $scope.autoSaveForceRefresh();
    };

    /* **************************************************************************
     * Categorical clusterer actions
     * **************************************************************************/

    var SpeedLevel = {FAST: 0, MID: 1, SLOW: 2};

    // cp : clustering parameters
    $scope.cp = {blockSize : SpeedLevel.MID, meanLength : 0, meanSpaces : 0,
        fuzziness : 0, nowComputing : false,
        initialized : false, setBased : false, radius : 0,
        timeOut : 15, clusters : [], mergeValues : [],
        allSelected : false, selected : [], hasTimedOut : false};

    $scope.clustersSelectAll = function() {
        $scope.cp.selected = $scope.cp.selected.map(Fn.cst($scope.cp.allSelected));
    };
    $scope.nbClustersSelected = function() {
        return $scope.cp.selected.filter(Fn.SELF).length;
    };
    $scope.refreshClusterer = function(recur) {
        var lastRecur = true;
        $scope.cp.nowComputing = true;

        var blockSize = 0,
            setBased = $scope.cp.setBased === 'true';
        $scope.cp.selected = [];
        $scope.cp.allSelected = false;
        $scope.cp.mergeValues = [];

        if (setBased){
            switch (+$scope.cp.fuzziness) {
                case 0:  $scope.cp.radius = 0.8;   break; // 4 words out of 5
                case 1:  $scope.cp.radius = 0.775; break;
                case 2:  $scope.cp.radius = 0.75;  break; // 3 words out of 4
            }
        } else {
            // we define slightly fuzzy as 0.5 mistake per word, very fuzzy as 1.5
            var nWords = $scope.cp.meanSpaces + 1;
            switch (+$scope.cp.fuzziness) {
                case 0:  $scope.cp.radius = 0.5; break;
                case 1:  $scope.cp.radius = 1.0; break;
                case 2:  $scope.cp.radius = 1.5; break;
            }
            $scope.cp.radius = Math.max(1, Math.round($scope.cp.radius * nWords));

            // a high blocksize => less calculations => relatively faster
            // we are slowed by a high number of distinct values, not by sample size
            if($scope.cp.meanLength >= 40){ // Usually, a bad idea to compute edit distance
                blockSize = 10;
            } else {
                // 1-9 => 2, 10-19 => 3, 20-29 => 4, 30-39 => 5
                var lowBlockSize = Math.floor($scope.cp.meanLength / 10) + 1;
                Logger.log("Low block size" + lowBlockSize);
                if ($scope.cp.blockSize == SpeedLevel.MID){
                    blockSize = lowBlockSize ;
                } else if ($scope.cp.blockSize == SpeedLevel.FAST){
                    blockSize = lowBlockSize * 2;
                }
            } // blockSize should be between 1 & 10
        }

        var setClusters = function(data) {
            $scope.cp.hasTimedOut = data.timedOut;
            $scope.cp.clusters = data.values;
            $scope.cp.initialized = true;
            $scope.cp.mergeValues = data.values.map(Fn.prop(0));
            $scope.cp.selected = data.values.map(Fn.cst(false));
            $scope.cp.nowComputing = false;
        };
        if ( $scope.shakerHooks.fetchClusters ) {
            $scope.shakerHooks.fetchClusters(setClusters, $scope.columnName, setBased, $scope.cp.radius, $scope.cp.timeOut, blockSize);
        }
    };
    $scope.mergeSelectedClusters = function() {
        var mapping = [],
            index = {},
            mergeCount = 0;
        // we have to go backwards to process smallest clusters first
        // so that the rules are effective in case of nested clusters
        for (var cluster = $scope.cp.selected.length - 1; cluster >= 0; cluster--) {
            if (!$scope.cp.selected[cluster]) continue;
            $scope.cp.clusters[cluster].forEach(function(toMerge) {
                if(!toMerge) {
                    $scope.addStepNoPreview("FillEmptyWithValue", {
                        appliesTo: 'SINGLE_COLUMN',
                        columns: [$scope.columnName],
                        value: $scope.cp.mergeValues[cluster]
                    }, true);
                    mergeCount++;
                } else if (toMerge !== $scope.cp.mergeValues[cluster]) {
                    if (toMerge in index){ // remove
                        mapping.splice(index[toMerge], 1);
                        // updating indexes: reduce by 1 all the indexes that are above
                        // the removed index in mapping array
                        for (var toMergeTmp in index) {
                            if (index[toMergeTmp] > index[toMerge]) {
                                index[toMergeTmp] -= 1;
                            }
                        }
                    }
                    index[toMerge] = mapping.push({from: toMerge, to: $scope.cp.mergeValues[cluster]}) - 1;
                    mergeCount++;
                }
            });
        }

        WT1.event("analyse-category-merge", {mergedVals: mergeCount});
        $scope.addStepNoPreview("FindReplace", {
            appliesTo: 'SINGLE_COLUMN',
            columns: [$scope.columnName],
            mapping: mapping,
            matching: 'FULL_STRING',
            normalization: 'EXACT'
        });
        $scope.mergeLastFindReplaces();
        $scope.autoSaveForceRefresh();
        $scope.cancelTransform();
        $scope.dismiss();
    }

     /*******************************************************
     * Text analysis actions
     *******************************************************/

     $scope.textSettings = {
        normalize: true,
        stem: false,
        clearStopWords: true,
        language: 'english'
    };
    var setTextAnalysis = function(data) {$scope.textAnalysis = data;};
    $scope.computeTextAnalysis = function() {
        if ($scope.shakerHooks.fetchTextAnalysis) {
            $scope.shakerHooks.fetchTextAnalysis(setTextAnalysis, $scope.columnName, $scope.textSettings);
        }
    }
    /*******************************************************
     * Numerical analysis actions
     *******************************************************/

    function niceToPrecision(val, p) {
        if (Math.abs(val) < Math.pow(10, p)) {
            return val.toPrecision(p);
        } else {
            return val.toFixed(0);
        }
    }
    $scope.removeOutliers = function(iqrRatio) {
        var na = $scope.analysis.numericalAnalysis;
        Assert.trueish(na, 'no numericalAnalysis');
        var min = Math.max((na.quartiles[0] - na.iqr * iqrRatio), na.min);
        var max = Math.min((na.quartiles[2] + na.iqr * iqrRatio), na.max);
        WT1.event("analyse-numerical-rmoutliers", {iqrRatio: iqrRatio});

        if ($scope.isDate) {
            $scope.addStepNoPreview("FilterOnDate", {
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.column],
                action: 'KEEP_ROW',
                filterType: 'RANGE',
                min: $scope.numData(min, false, true),
                max: $scope.numData(max, false, true),
                timezone_id: "UTC",
                part: 'YEAR',
                option: 'THIS'
            }, true);
        } else {
            $scope.addStepNoPreview("FilterOnNumericalRange", {
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.columnName],
                action: 'KEEP_ROW',
                min: niceToPrecision(min, 4),
                max: niceToPrecision(max, 4)
            }, true);
        }

        $scope.autoSaveForceRefresh();
    };
    $scope.clipOutliers = function(iqrRatio, clear) {
        var na = $scope.analysis.numericalAnalysis;
        Assert.trueish(na, 'no numericalAnalysis');
        var min = Math.max((na.quartiles[0] - na.iqr * iqrRatio), na.min);
        var max = Math.min((na.quartiles[2] + na.iqr * iqrRatio), na.max);
        WT1.event("analyse-numerical-clipoutliers", {iqrRatio: iqrRatio, clear: !!clear});

        if ($scope.isDate) {
            $scope.addStepNoPreview("FilterOnDate", {
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.column],
                action: 'KEEP_ROW',
                filterType: 'RANGE',
                min: $scope.numData(min, false, true),
                max: $scope.numData(max, false, true),
                timezone_id: "UTC",
                part: 'YEAR',
                option: 'THIS'
            }, true);
        } else {
            $scope.addStepNoPreview("MinMaxProcessor", {
                columns: [$scope.columnName],
                clear: !!clear,
                lowerBound: niceToPrecision(min, 4),
                upperBound: niceToPrecision(max, 4)
            }, true);
        }

        $scope.autoSaveForceRefresh();
    };

    /*******************************************************
     * Array view action
     *******************************************************/

    $scope.arraySelectAll = function(sel) {
        $scope.analysis.arrayFacet.selected = $scope.analysis.arrayFacet.values.map(Fn.cst(sel));
    };
    $scope.arrayNbSelected = function() {
        if (!$scope.analysis) return 0;
        return $scope.analysis.arrayFacet.selected.filter(Fn.SELF).length;
    };
    $scope.getArraySelectedValues = function() {
        if (!$scope.analysis) return [];
        return $scope.analysis.arrayFacet.values.filter(Fn.from($scope.analysis.arrayFacet.selected, 1));
    };
    /* Removing */
    $scope.arrayRemoveSelectedRows = function(keep) {
        var vals = $scope.getArraySelectedValues();
        Assert.trueish(vals.length > 0, 'no selected values');

        vals.forEach(function(val) {
            $scope.addStepNoPreview("FilterOnCustomFormula", {
                appliesTo: 'SINGLE_COLUMN',
                columns: [$scope.columnName],
                action: keep ? 'KEEP_ROW' : 'REMOVE_ROW',
                expression: 'arrayContains(' + $scope.columnName + ', "' + val.replace(/"/g,"\\\"") + '")'
           }, true);
        })
        WT1.event("analyse-array-removeselected", {removedVals: vals.length});
        $scope.mergeLastDeleteRows();
        $scope.autoSaveAutoRefresh();
    };

});
})();

(function(){
    'use strict';

    var app = angular.module('dataiku.shaker.table', ['dataiku.filters', 'platypus.utils']);


    app.service('ShakerTableModel', function() {

        return function(tableData, scope) {

            var PAGE_WIDTH = Math.pow(2,5);
            var PAGE_HEIGHT = Math.pow(2,6);

            var pageFromData = function(I,J,data) {
                return function(i,j)  {
                    var offset = (i-I)*data.nbCols + (j-J);
                    return {
                        content: data.content[offset],
                        status: data.status[offset],
                        colorBin : data.colorBin ? data.colorBin[offset] : null,
                        origRowIdx : data.origRowIdx[i-I],
                        rowId: i,
                        colId: j,
                    };
                };
            };

            var tableData = $.extend(
                new fattable.PagedAsyncTableModel(),
                tableData,
            {
                getHeader: function(j, cb) {
                    // Here we fork the scope for each header to append
                    // a new header property.
                    var newScope = scope.$new(false);
                    newScope.header = tableData.headers[j];
                    cb(newScope);
                }
            ,
                searchHeader: function(q) {
                    var q = q.toLowerCase();
                    var results = [];
                    for (var i = 0; i < tableData.headers.length; i++) {
                        var header = tableData.headers[i];
                        if (header.name.toLowerCase() == q) {
                            results.push(i);
                        }
                    }
                    for (var i = 0; i < tableData.headers.length; i++) {
                        var header = tableData.headers[i];
                        if ((header.name.toLowerCase().indexOf(q) != -1) && (results.indexOf(i) == -1) ) {
                            results.push(i);
                        }
                    }
                    return results;

                }
            ,
                hasHeader:  function() {
                    return true;  // we are synchronous for headers.
                }
            ,
                fetchCellPage: function(pageName, cb) {
                    var coords =  JSON.parse(pageName);
                    var I = coords[0];
                    var J = coords[1];
                    var nbRequestedRows = Math.min(this.totalKeptRows - I, PAGE_HEIGHT);
                    var nbRequestedCols = Math.min(this.headers.length - J, PAGE_WIDTH);
                    var promise = scope.getTableChunk(I, nbRequestedRows, J, nbRequestedCols);
                    promise.then(function(resp) {
                        var page = pageFromData(I,J,resp);
                        cb(page);
                    });
                }
            ,
                cellPageName: function(i,j) {
                    return JSON.stringify([i - (i & (PAGE_HEIGHT-1)), j - (j & (PAGE_WIDTH-1))]);
                }
            });

            // populate the page cache with the initial data.
            var initialPage = pageFromData(0,0, tableData.initialChunk);
            var initialPageName = tableData.cellPageName(0,0);
            tableData.pageCache.set(initialPageName, initialPage);
            tableData.PAGE_WIDTH = PAGE_WIDTH;
            tableData.PAGE_HEIGHT = PAGE_HEIGHT;
            return tableData;
        }
    });


    app.service('computeColumnWidths', function() {
        return function(sampleData, headers, minColumnWidth, hasAnyFilterOnColumn, columnWidthsByName, reset = false) {
            // Upper bounds for a cell/col containing only capital M: { header = 99, body = 95 }
            // Lower bound wih only small l: {header = 2.9, body = 2.6 }

            // Seems reasonable: 7 / 7.5
            const CELL_LETTER_WIDTH = 7;
            const HEADER_LETTER_WIDTH = 7.5;

            const CELL_MARGIN = 15;
            const HEADER_MARGIN = 15;
            const MAX_WIDTH = 300;
            const FILTER_FLAG_WIDTH = 20;

            let columnWidthsByIndex = [];
            const nbCols = headers.length;

            for (var colId = 0; colId < nbCols; colId++) {
                const header = headers[colId];
                const columnName = header.name;
                let columnWidth;

                if (!reset) {
                    columnWidth = columnWidthsByName[columnName];
                }

                if (!(Number.isInteger(columnWidth))) {
                    let cellColumnWidth =  Math.ceil(header.ncharsToShow * CELL_LETTER_WIDTH + CELL_MARGIN);
                    let colColumnWidth =  Math.ceil(header.name.length * HEADER_LETTER_WIDTH + HEADER_MARGIN);
                    columnWidth = Math.max(colColumnWidth, cellColumnWidth);
                    columnWidth = fattable.bound(columnWidth, minColumnWidth, MAX_WIDTH);
    
                    if ((hasAnyFilterOnColumn === undefined) || hasAnyFilterOnColumn(header.name)) {
                        columnWidth += FILTER_FLAG_WIDTH;
                    }

                    columnWidthsByName[columnName] = columnWidth;
                }

                columnWidthsByIndex.push(columnWidth);
            }
            return [ columnWidthsByIndex, columnWidthsByName ];
        };
    });

    app.directive('fattable', function(DataikuAPI, ShakerTableModel, computeColumnWidths, ContextualMenu, CreateModalFromDOMElement, CreateModalFromTemplate,
            $filter, $templateCache, $q, $http, $timeout, $compile,Debounce, ShakerProcessorsUtils, ShakerSuggestionsEngine, Logger, WT1, FatTouchableService, FatDraggableService, FatResizableService, ClipboardUtils) {

        // Fattable delegates filling cells / columns header
        // with content to this object.
        function ShakerTablePainter(scope) {

            return $.extend(new fattable.Painter(), {

                setupHeader: function(el) {
                    el.setAttribute("column-header", "header");
                    el.setAttribute("ng-class", "{'columnHeader': true, 'filtered': hasAnyFilterOnColumn(column.name)}");
                 }
            ,
                fillHeader: function(el, headerScope)  {
                    var $el = $(el);
                    this.destroyFormerHeaderScope(el);
                    el.scopeToDestroy = headerScope;
                    $el.empty();
                    $compile($el)(headerScope);
                }
            ,
                destroyFormerHeaderScope: function(el) {
                    if (el.scopeToDestroy !== undefined) {
                        el.scopeToDestroy.$destroy();
                        el.scopeToDestroy = undefined;
                    }
                }
            ,
                fillCellPending: function(el,cell) {
                    el.textContent = "Wait...";
                    el.className = "PENDING"
                }
            ,
                fillCell: function(el, cell)  {
                    const MAX_TITLE_LENGTH = 980;
                    const viewMoreContentLabel = '...\n\nShift + v to view complete cell value.';
                    el.dataset.rowId = cell.rowId;
                    el.dataset.colId = cell.colId;

                    el.title = cell.content && cell.content.length > MAX_TITLE_LENGTH ? cell.content.slice(0, MAX_TITLE_LENGTH) + viewMoreContentLabel : cell.content;

                    if (cell.colorBin !== null) {
                        el.className = cell.status + "-" + cell.colorBin + " " + ["even", "odd"][cell.rowId % 2];
                    } else {
                        el.className = cell.status + " " + ["even", "odd"][cell.rowId % 2];
                    }
                      if (scope.shakerState.lockedHighlighting.indexOf(cell.rowId) >=0) {
                        el.className += " FH";
                    }
                    if(!cell.content){
                        el.textContent = "";
                        return;
                    }

                    // highlight selections
                    var lastDisplayedRow = scope.shakerTable.firstVisibleRow + scope.shakerTable.nbRowsVisible;
                    el.textContent = cell.content.replace(/(\r\n|\n)/g, "¶");

                    if (scope.shaker.coloring && scope.shaker.coloring.highlightWhitespaces) {
                        $(el).html(sanitize(el.textContent)
                                .replace(/^(\s*)/, "<span class='ls'>$1</span>")
                                .replace(/(\s*)$/, "<span class='ts'>$1</span>")
                                .replace(/(\s\s+)/g, "<span class='ms'>$1</span>"));
                    }

                    el.appendChild(document.createElement('div'));
                }
            ,
                setupCell: function(el) {
                    el.oncontextmenu = function(evt) {
                        var row = el.dataset.rowId;
                        var col = el.dataset.colId;
                        scope.showCellPopup(el, row, col, evt);
                        return false;
                    };
                }
            ,
                cleanUpCell: function(cellDiv) {
                    $(cellDiv).remove();
                }
            ,
                cleanUpheader: function(headerDiv) {
                    this.destroyFormerHeaderScope(headerDiv);
                    $(headerDiv).remove();
                }
            });
        }

        return {
            restrict: 'A',
            scope: true,
            link: function(scope, element, attrs) {

                var currentMousePos;

                $(element).mousemove(function(evt) {
                    currentMousePos = {
                        x : evt.clientX,
                        y: evt.clientY
                    }
                });

                var tableDataExpr = attrs.fattableData;

                { // bind "c" to "scroll to column"

                    var shown = false;

                    //<input type="text" class="form-control" ng-model="selectedState" ng-options="state for state in states" placeholder="Enter state" bs-typeahead>
                    scope.openSearchBox = function() {
                        shown=true;
                        const newScope = scope.$new();
                        const controller = function() {
                            newScope.searchHeaderName = function(query) {
                                const columnIds = scope.tableModel.searchHeader(query);
                                return columnIds.map(i => scope.tableModel.headers[i].name);
                            }
                            newScope.move = function(query) {
                                const columnIds = scope.tableModel.searchHeader(query);
                                if (columnIds.length > 0) {
                                    const columnSelected = columnIds[0];
                                    scope.shakerTable.goTo(undefined, columnSelected);
                                }
                            }
                            $("body").addClass("fattable-searchbox-modal");
                            $("#fattable-search").focus();
                        };
                        CreateModalFromTemplate('/templates/shaker/search-column.html', newScope, controller, function(modalScope) {
                            $(".modal").one("hide", function() {
                                shown = false;
                                $("body").removeClass("fattable-searchbox-modal");
                            });
                            modalScope.onSubmit = function(e) {
                                modalScope.dismiss();
                            }
                            modalScope.$on('typeahead-updated', modalScope.onSubmit);
                        });
                    };

                    var $window = $(window);

                    var keyCodes = {
                        tab: 9,
                        pageup: 33,
                        pagedown: 34,
                        left: 37,
                        up: 38,
                        right: 39,
                        down: 40
                    };

                    Mousetrap.bind("c", function() {
                        if (!shown) {
                            scope.hideCellPopup();
                            scope.openSearchBox();
                        }
                    });

                    $window.on("keydown.fattable", function(e){
                        if (["INPUT", "SELECT", "TEXTAREA"].indexOf(e.target.tagName) == -1) {
                            var move = function(dx,dy) {
                                var scrollBar = scope.shakerTable.scroll;
                                var x = scrollBar.scrollLeft + dx;
                                var y = scrollBar.scrollTop + dy;
                                scrollBar.setScrollXY(x,y);
                            };

                            var smallJump = 20;
                            var bigJump = smallJump * 7;
                            switch(e.keyCode) {
                                case keyCodes.up:
                                    move(0, -smallJump);
                                    break;
                                case keyCodes.down:
                                    move(0, smallJump);
                                    break;
                                case keyCodes.left:
                                    move(-smallJump, 0);
                                    break;
                                case keyCodes.right:
                                    move(smallJump, 0);
                                    break;
                                case keyCodes.pagedown:
                                    move(0, bigJump);
                                    break;
                                case keyCodes.pageup:
                                    move(0, -bigJump);
                                    break;
                            }
                        }
                    });

                    scope.$on('scrollToColumn', function(e, columnName) {
                        var c = scope.tableModel.searchHeader(columnName)[0];
                        if (c >= 0) {
                            scope.shakerTable.goTo(undefined, c);
                        }
                    });

                    scope.$on('$destroy', function() {
                        $(window).off("keydown.fattable");
                    });

                }


                // binding cell click events.
                {
                    var $el = $(element);
                    var $currentSelectCell = null;
                    $el.off(".shakerTable");
                    var getRow = function($el) {
                        var rowId = $el[0].dataset.rowId;
                        return $el.siblings("[data-row-id='"+ rowId+ "']");
                    };

                    $el.on("mousedown.shakerTable", ".fattable-body-container > div > div", function(evt) {
                        // Prevent a bit selection of more than one cell.
                        if ($currentSelectCell != null) {
                            $currentSelectCell.parent().find(".selectable").removeClass("selectable");
                            $currentSelectCell.parent().removeClass("inselection");
                        }
                        $currentSelectCell = $(evt.target);
                        $currentSelectCell.addClass("selectable");
                        $currentSelectCell.parent().addClass("inselection");
                    });

                    $el.on("mouseup.shakerTable", ".fattable-body-container > div", function(evt) {
                        if (evt.button != 1 && !scope.shakerReadOnlyActions) {
                            if (!scope.isCellPopupVisible() ) {
                                var target = evt.target;
                                if ($currentSelectCell != null) {
                                    if ($currentSelectCell[0] == target) {
                                        var row = target.dataset.rowId;
                                        var col = target.dataset.colId;
                                        scope.showCellPopup(target, row, col, evt);
                                        // If the event bubbles up to body,
                                        // it will trigger hidePopup.
                                        evt.stopPropagation();
                                    }
                                }
                                $currentSelectCell = null;
                            }
                        }
                    });

                    $el.on("mouseenter.shakerTable", ".fattable-body-container > div > div", function(evt) {
                        getRow($(evt.target)).addClass('H');
                        scope.shakerState.hoverredRow = $(evt.target)[0].dataset.rowId;
                        scope.shakerState.hoverredCol = $(evt.target)[0].dataset.colId;
                    });

                    $el.on("mouseleave.shakerTable", ".fattable-body-container > div > div", function(evt) {
                        var $target = $(evt.target);
                        getRow($target).removeClass('H');
                        scope.shakerState.hoverredRow = null;
                        scope.shakerState.hoverredCol = null;
                    });
                }

                // setuping the cell popup.
                var popupContent = $('<div><div class="popover-content shaker-cell-popover"></div></div>');
                $("body").append(popupContent);

                var cvPopupContent = $('<div><div class="popover-content"></div></div>');
                $("body").append(cvPopupContent);

                var $doc = $(document);

                scope.isCellPopupVisible = function() {
                    return popupContent.css("display") != "none";
                };

                scope.hideCellPopup = function() {
                    var formerPopupScope = popupContent.find(".popover-content > div").first().scope();
                    if ((formerPopupScope != undefined) && (formerPopupScope !== scope)) {
                        formerPopupScope.$destroy();
                    }
                    $doc.unbind("click.shaker.cellPopup");
                    popupContent.css("display", "none");
                };

                scope.hideCVPopup = function(){
                    var formerPopupScope = cvPopupContent.find(".popover-content > div").first().scope();
                    if ((formerPopupScope != undefined) && (formerPopupScope !== scope)) {
                        formerPopupScope.$destroy();
                    }
                    cvPopupContent.css("display", "none");
                }

                scope.toggleRowHighlight = function(rowIdx) {
                    var arr = scope.shakerState.lockedHighlighting;
                    if (arr.indexOf(rowIdx) >=0){
                        arr.splice(arr.indexOf(rowIdx), 1);
                    } else {
                        arr.push(rowIdx);
                    }
                    scope.shakerTable.refreshAllContent(true);
                }

                scope.copyRowAsJSON = async function(rowIdx) {
                    function getColumnSchema(column) {
                        if (scope.shaker.origin === "DATASET_EXPLORE") {
                            return column.datasetSchemaColumn;
                        } else if (scope.shaker.origin === "PREPARE_RECIPE" && column.recipeSchemaColumn) {
                            return column.recipeSchemaColumn.column;
                        }
                    }

                    function getCellPromise(rowIdx, colIdx) {
                        return new Promise((resolve) => {
                            scope.tableModel.getCell(rowIdx, colIdx, resolve);
                        });
                    }

                    function smartCast(colType, colValue) {
                        switch (colType) {
                            case "tinyint":
                            case "smallint":
                            case "int":
                            case "bigint":
                                return Number.parseInt(colValue);
                            case "float":
                            case "double":
                                return Number.parseFloat(colValue);
                            default:
                                return colValue;
                            }
                    }

                    const colTypes = scope.table.headers.reduce((obj, column) => {
                        const colSchema = getColumnSchema(column);
                        obj[column.name] = colSchema ? colSchema.type : null;
                        return obj;
                      }, {});

                    const columnNames = scope.tableModel.allColumnNames;
                    const columnIndices = [...Array(columnNames.length).keys()];
                    const row = {};

                    await Promise.all(columnIndices.map(colIdx => getCellPromise(rowIdx, colIdx)))
                        .then((cells) => {
                            for (const [index, cell] of cells.entries()) {
                                const columnName = columnNames[index];
                                row[columnName] = smartCast(colTypes[columnName], cell.content);
                            }
                        });

                    ClipboardUtils.copyToClipboard(JSON.stringify(row, null, 2), `Row copied to clipboard.`);
                };

                Mousetrap.bind("shift+h", function(){
                    var rowIdx = scope.shakerState.hoverredRow;
                    if (!rowIdx) return;
                    rowIdx = parseInt(rowIdx);
                    scope.$apply(function(){
                        scope.toggleRowHighlight(rowIdx);
                    });
                }, 'keyup');

                 Mousetrap.bind("shift+v", function(){
                    var rowIdx = scope.shakerState.hoverredRow;
                    var colIdx = scope.shakerState.hoverredCol;
                    if (!rowIdx) return;
                    rowIdx = parseInt(rowIdx);
                    colIdx = parseInt(colIdx);
                    scope.$apply(function(){
                        scope.showCVCellPopup(rowIdx, colIdx);
                    });
                }, 'keyup');

                Mousetrap.bind("shift+j", function(){
                    var rowIdx = scope.shakerState.hoverredRow;
                    if (!rowIdx) return;
                    rowIdx = parseInt(rowIdx);
                    scope.$apply(function(){
                        scope.copyRowAsJSON(rowIdx);
                    });
                }, 'keyup');

                scope.$on('$destroy', function() {
                    scope.hideCellPopup();
                    scope.hideCVPopup();
                    $(document).off(".shaker");
                    popupContent.remove();
                    Mousetrap.unbind("shift+h");
                    Mousetrap.unbind("c");
                });

                scope.showCVCellPopup2 = function(cellValue, column, placement){
                    ContextualMenu.prototype.closeAny();
                    var templateUrl = "/templates/shaker/cell-value-popup.html";
                    $q.when($templateCache.get(templateUrl) || $http.get(templateUrl, {
                        cache: true
                    })).then(function(template) {
                        if(angular.isArray(template)) {
                            template = template[1];
                        } else if(angular.isObject(template)) {
                            template = template.data;
                        }
                        var newDOMElt = $('<div>');
                        newDOMElt.html(template);
                        $timeout(function() {
                            var newScope = scope.$new();
                            newScope.cellValue = cellValue;
                            newScope.column = column;
                            $compile(newDOMElt)(newScope);
                            cvPopupContent.find(".popover-content").empty().append(newDOMElt);
                            $timeout(function() {
                                // var placement = getPlacement2(elt, popupContent, evt);
                                cvPopupContent.css("display", "block");
                                cvPopupContent.css(placement.css);
                                var popupClassNames = "shaker-cell-popover popover ";
                                popupClassNames += placement.clazzes.join(" ");
                                cvPopupContent[0].className = popupClassNames;
                                cvPopupContent.on('click', function(e){
                                    if(! $(e.target).closest('a,input,button,select,textarea').length){
                                        e.stopPropagation();
                                    }
                                });
                            }, 0);
                        });
                    });
                }

                scope.showCVCellPopup = function(row, col) {
                    scope.tableModel.getCell(row, col, function(cellData) {
                        var placement = getPlacementForMouse({
                            top: currentMousePos.y,
                            left : currentMousePos.x
                        },
                         popupContent, currentMousePos.x, currentMousePos.y);
                        var cellValue = cellData.content;
                        scope.showCVCellPopup2(cellData.content, scope.table.headers[col], placement);
                    });
                }

                scope.showCellPopup = function(elt, row, col, evt) {
                    ContextualMenu.prototype.closeAny();

                    // TODO eventually get rid of this.
                    // terrible monkey patching
                    {
                        var parent = popupContent.parent();
                        if (popupContent.parent().length == 0) {
                            // why is not under body anymore!?
                            $("body").append(popupContent);
                            WT1.event("shaker-cell-popup-content-disappear");
                            Logger.error("POPUP CONTENT DISAPPEARED. MONKEY PATCH AT WORK");
                        }
                    }
                    // end of terrible monkey...


                    if (!scope.shakerWritable && !scope.shakerReadOnlyActions) return;
                    scope.tableModel.getCell(row, col, function(cellData) {
                        var cellValue = cellData.content;
                        var req = {
                            cellValue: cellValue,
                            type: "cell",
                            row: cellData.origRowIdx, // TODO probably not what we want here.
                            column: scope.table.headers[col].name,
                        };
                        var selection = getSelectionInElement(elt);
                        if (selection != null) {
                            req.type = "content";
                            $.extend(req, selection);
                        }

                        var templateUrl = "/templates/shaker/suggestions-popup.html";
                        $q.when($templateCache.get(templateUrl) || $http.get(templateUrl, {
                            cache: true
                        })).then(function(template) {
                            if(angular.isArray(template)) {
                                template = template[1];
                            } else if(angular.isObject(template)) {
                                template = template.data;
                            }
                            var newDOMElt = $('<div>');
                            newDOMElt.html(template);
                            $timeout(function() {
                                var newScope = scope.$new();
                                newScope.req = req;
                                var invalidCell = cellData.status.indexOf("I") == 0;
                                const appConfig = scope.appConfig || scope.$root.appConfig;
                                newScope.columnData = ShakerSuggestionsEngine.computeColumnSuggestions(scope.table.headers[col], CreateModalFromDOMElement, CreateModalFromTemplate, true, invalidCell, appConfig);
                                newScope.cellData = ShakerSuggestionsEngine.computeCellSuggestions(scope.table.headers[col], cellValue, cellData.status, CreateModalFromDOMElement, appConfig);
                                if(cellValue == null){
                                    cellValue = "";
                                }
                                if (newScope.shakerWritable && req.type == "content") {
                                    newScope.contentData = ShakerSuggestionsEngine.computeContentSuggestions(scope.table.headers[col], cellValue, req.content,
                                                cellData.status, CreateModalFromTemplate, req.startOffset, req.endOffset);
                                }
                                newScope.executeSuggestion = function(sugg) {
                                    sugg.action(scope);
                                };
                                newScope.showCellValue = function(){
                                    scope.showCVCellPopup2(cellValue, scope.table.headers[col], newScope.popupPlacement);
                                }

                                newScope.getStepDescription =function(a,b) {
                                    return ShakerProcessorsUtils.getStepDescription(null, a,b);
                                };
                                newScope.filter = function(val, matchingMode) {
                                    if(!val) {
                                        val = '';
                                    }
                                    var v = {};
                                    v[val] = true;
                                    scope.addColumnFilter(scope.table.headers[col].name, v, matchingMode,
                                        scope.table.headers[col].selectedType.name, scope.table.headers[col].isDouble);
                                };
                                $compile(newDOMElt)(newScope);
                                popupContent.find(".popover-content").empty().append(newDOMElt);
                                $timeout(function() {
                                    var placement = getPlacement2(elt, popupContent, evt);

                                    newScope.popupPlacement = placement;

                                    popupContent.css("display", "block");
                                    popupContent.css(placement.css);
                                    var popupClassNames = "shaker-cell-popover popover ";
                                    popupClassNames += placement.clazzes.join(" ");
                                    popupContent[0].className = popupClassNames;
                                    popupContent.on('click', function(e){
                                        if(! $(e.target).closest('a,input,button,select,textarea').length){
                                            e.stopPropagation();
                                        }
                                    });
                                }, 0);
                            });
                        });
                    });
                };

                scope.shakerTable = null;

                var ratioX = 0;
                var ratioY = 0;
                scope.setNewTable = function(tableData) {
                    if (scope.shakerTable) {
                        if (scope.shakerTable.scroll) {
                            ratioX = scope.shakerTable.scroll.scrollLeft / scope.shakerTable.W;
                            ratioY = scope.shakerTable.scroll.scrollTop  / scope.shakerTable.H;
                        } else {
                            // we're in the middle of refreshing, so use the last saved values of ratioX and ratioY
                            // and anyway scrollLeft and scrollTop haven't been regenerated yet
                        }
                        scope.shakerTable.cleanUp();
                    } else {
                        ratioX = 0;
                        ratioY = 0;
                    }
                    if (scope.tableScope) {
                        scope.tableScope.$destroy();
                        scope.shakerTable.onScroll = null;
                    }
                    scope.tableScope = scope.$new();
                    scope.tableModel = ShakerTableModel(tableData, scope.tableScope);

                    // Absolute minimum for "Decimal (FR format)"
                    var minColumnWidth = 100;
                    var headerHeight = 63;
                    /* Space for schema */
                    if (!scope.shaker.$headerOptions) {
                        if (scope.shaker.origin == "PREPARE_RECIPE" || scope.shaker.origin == "DATASET_EXPLORE") {
                            headerHeight += 19;
                        }
                        if (scope.shakerState.hasAnyComment) {
                            headerHeight += 15;
                        }
                        if (scope.shakerState.hasAnyCustomFields) {
                            headerHeight += 19;
                        }
                    } else {
                        headerHeight += scope.shakerState.hasAnyComment ? -4 : 3;

                        if (!scope.shaker.$headerOptions.showName) {
                            headerHeight -= scope.shakerState.hasAnyComment ? 28 : 34;
                        }

                        if (!scope.shaker.$headerOptions.showStorageType) {
                            headerHeight -= 19;
                        }

                        if (scope.shaker.$headerOptions.showMeaning) {
                            headerHeight += 19;
                        }

                        if (scope.shakerState.hasAnyComment && scope.shaker.$headerOptions.showDescription) {
                            headerHeight += 19;
                        }

                        if (scope.shakerState.hasAnyCustomFields && scope.shaker.$headerOptions.showCustomFields) {
                            headerHeight += 19;
                        }

                        if (!scope.shaker.$headerOptions.showProgressBar) {
                            headerHeight -= 11;
                        }

                        var unwatch = scope.$watch("shaker.$headerOptions", function(nv, ov) {
                            if (!nv || nv == ov) return;
                            unwatch();
                            scope.setNewTable(tableData);
                        }, true);
                    }

                    var ROW_HEIGHT = 27;

                    scope.shaker.columnWidthsByName = scope.shaker.columnWidthsByName || {};
                    [ tableData.columnWidthsByIndex, scope.shaker.columnWidthsByName ] = computeColumnWidths(scope.tableModel.initialChunk, scope.tableModel.headers, minColumnWidth, scope.hasAnyFilterOnColumn, scope.shaker.columnWidthsByName);

                    scope.shakerTable = fattable({
                        "container": element[0],
                        "model": scope.tableModel,
                        "nbRows": scope.tableModel.totalKeptRows,
                        "headerHeight": headerHeight,
                        "rowHeight":  ROW_HEIGHT,
                        "columnWidths": tableData.columnWidthsByIndex,
                        "painter": ShakerTablePainter(scope.tableScope),
                        "autoSetup": false
                    });

                    scope.shakerTable.onScroll = function(x,y) {
                        scope.hideCellPopup();
                        scope.hideCVPopup();
                    }

                    // we save the scroll state, as a ratio.
                    // we scroll back to the position we were at.
                    var newX = (scope.shakerTable.W *ratioX) | 0;
                    var newY = (scope.shakerTable.H *ratioY) | 0;


                    var leftTopCorner = scope.shakerTable.leftTopCornerFromXY(newX, newY);
                    var I = leftTopCorner[0];
                    var J = leftTopCorner[1];

                    var requested = 0;
                    var shakerTable = scope.shakerTable;
                    // A lib like async would have been nice here.
                    // only draw the table if all the
                    // pages are ready.
                    var everythingDone = function() {
                        if (requested == 0) {
                            // we check that the shaker has not
                            // been replaced.
                            if (shakerTable === scope.shakerTable) {
                                scope.shakerTable.setup();
                                scope.shakerTable.scroll.setScrollXY(newX, newY);
                                if (typeof scope.refreshTableDone === 'function') {
                                    scope.refreshTableDone();
                                }
                            }
                        }

                        if (isTouchDevice()) {
                            if (typeof(scope.unsetTouchable) === "function") {
                                scope.unsetTouchable();
                            }
                            scope.unsetTouchable = FatTouchableService.setTouchable(scope, element, scope.shakerTable);
                        }

                        if (attrs.fatDraggable !== undefined) {
                            scope.isDraggable = true;

                            // fatDraggable callback for placeholder shaping : use the whole table height instead of header only
                            scope.onPlaceholderUpdate = function(dimensions) {
                                let table = scope.shakerTable.container;
                                if (table) {
                                    dimensions.height = table.getBoundingClientRect().height;
                                }
                            };

                            FatDraggableService.setDraggable({
                                element: scope.shakerTable.container,
                                onDrop: scope.reorderColumnCallback,
                                onPlaceholderUpdate: scope.onPlaceholderUpdate,
                                scrollBar: scope.shakerTable.scroll,
                                classNamesToIgnore: ['icon-sort-by-attributes', 'sort-indication', 'pull-right', 'fat-resizable__handler']
                            })
                        }

                        if (attrs.fatResizable !== undefined) {
                            scope.isResizable = true;

                            let table = scope.shakerTable.container;
                            let barHeight;
                            if (table) {
                                barHeight = table.getBoundingClientRect().height;
                            }

                            FatResizableService.setResizable({
                                element: scope.shakerTable.container,
                                barHeight: barHeight,
                                onDrop: function(resizeData) {
                                    tableData.columnWidthsByIndex[resizeData.index] = resizeData.width;
                                    scope.shakerHooks.updateColumnWidth(resizeData.name, Math.round(resizeData.width));
                                }
                            })
                        }
                    }
                    for (var i=I; i<I+scope.shakerTable.nbRowsVisible; i+=scope.tableModel.PAGE_HEIGHT) {
                        for (var j=J; j<J+scope.shakerTable.nbColsVisible; j+=scope.tableModel.PAGE_WIDTH){
                            if (!scope.tableModel.hasCell(i,j)) {
                                requested += 1;
                                scope.tableModel.getCell(i,j, function() {
                                    requested -= 1;
                                    everythingDone();
                                });
                            }
                        }
                    }
                    everythingDone();
                }

                // we only resize at the end of the resizing.
                // == when the user has been idle for 200ms.
                var formerScrollLeft = 0;
                var formerScrollTop = 0;
                var debouncedResizingHandler = Debounce().withScope(scope).withDelay(200,200).wrap(function() {
                    if (scope.shakerTable !== null) {
                        // check whether we really need to resize the
                        // the table. See #1851
                        var widthChanged = (scope.shakerTable.w != scope.shakerTable.container.offsetWidth);
                        var heightChanged = (scope.shakerTable.h != scope.shakerTable.container.offsetHeight - scope.shakerTable.headerHeight);
                        if (widthChanged || heightChanged) {
                            scope.shakerTable.setup();
                            scope.shakerTable.scroll.setScrollXY(formerScrollLeft, formerScrollTop);
                        }
                    }
                });
                var wrappedDebouncedResizingHandler = function() {
                    if (scope.shakerTable && scope.shakerTable.scroll) {
                        var scrollBar = scope.shakerTable.scroll;
                        formerScrollLeft = scrollBar.scrollLeft;
                        formerScrollTop = scrollBar.scrollTop;
                    } else {
                        // a table is being refreshed, keep the last known values of the scroll position
                    }
                    debouncedResizingHandler();
                };

                scope.$on('scrollToLine', function(e, lineNum) {
                    var table = scope.shakerTable;
                    if (table && table.scroll) {
                        var nbRowsVisible = table.h / table.rowHeight; // we need the float value
                        var firstVisibleRow = table.scroll.scrollTop / table.rowHeight; // we need the float value
                        var x = table.scroll.scrollLeft;
                        if (lineNum == -1) {
                            var y = table.nbRows * table.rowHeight;
                            table.scroll.setScrollXY(x, y);
                        } else if (lineNum <= firstVisibleRow) {
                            var y = Math.max(lineNum, 0) * table.rowHeight;
                            table.scroll.setScrollXY(x,y);
                        } else if (lineNum >= firstVisibleRow + nbRowsVisible - 1) {
                            var y = (Math.min(lineNum, table.nbRows) + 1) * table.rowHeight - table.h;
                            table.scroll.setScrollXY(x,y);
                        }
                    }
                });

                scope.$on('reflow',wrappedDebouncedResizingHandler);
                $(window).on("resize.shakerTable",wrappedDebouncedResizingHandler);
                scope.$on('resize', wrappedDebouncedResizingHandler);

                $doc.bind("click.shakerTable", scope.hideCellPopup);
                $doc.bind("click.shakerTable", scope.hideCVPopup);
                scope.$on("$destroy", function() {
                    scope.$broadcast("shakerIsGettingDestroyed");
                    $(window).off('.shakerTable');
                    $doc.off('.shakerTable');
                    if (scope.shakerTable) scope.shakerTable.cleanUp();
                    if (scope.tableScope) {
                        scope.tableScope.$destroy();
                    }
                    /* I'm not 100% clear on why we need this but experimentally,
                     * this helps avoid some leaks ... */
                    scope.shakerTable = undefined;
                    scope.tableModel = undefined;
                });

                scope.$on("forcedShakerTableResizing", wrappedDebouncedResizingHandler);

                scope.$watch("shaker.coloring.highlightWhitespaces", function(nv){
                    if (nv === undefined) return;
                    scope.setNewTable(scope.$eval(tableDataExpr));
                });

                scope.$watch(tableDataExpr, function(tableData) {

                    var curScope = undefined;
                    scope.hideCellPopup();
                    scope.hideCVPopup();
                    if (tableData) {
                        scope.setNewTable(tableData);
                    }
                });

            }
        }
    });

    app.directive('columnHeader', function($controller, CreateModalFromDOMElement, CreateModalFromTemplate, ContextualMenu, $state, DataikuAPI, WT1, ShakerSuggestionsEngine) {
        return {
            restrict: 'A',
            replace: false,
            templateUrl: '/templates/shaker/column_header.html',
            scope: true,
            link: function(scope, element, attrs) {

                scope.$on("shakerIsGettingDestroyed", function(){
                    /* Since fattable does not use jQuery to remove its elements,
                     * we need to use jQuery ourselves to remove our children (and
                     * ourselves).
                     * Doing that will ensure that the jQuery data cache is cleared
                     * (it's only cleared when it's jQuery that removes the element)
                     * Without that, since Angular has used jQuery().data() to retrieve
                     * some stuff in the element, the jQuery data cache will always
                     * contain the scope and ultimately the element, leading to massive
                     * DOM leaks
                     */
                    element.empty();
                    element.remove();
                })

                scope.storageTypes = [
                    ['string', 'String'],
                    ['int', 'Integer'],
                    ['double', 'Double'],
                    ['float', 'Float'],
                    ['tinyint', 'Tiny int (8 bits)'],
                    ['smallint', 'Small int (16 bits)'],
                    ['bigint', 'Long int (64 bits)'],
                    ['boolean', 'Boolean'],
                    ['date', 'Date'],
                    ['geopoint', "Geo Point"],
                    ['geometry', "Geometry / Geography"],
                    ['array', "Array"],
                    ['object', "Complex object"],
                    ['map', "Map"]
                ];

                // We avoid using a simple bootstrap dropdown
                // because we want to avoid having the hidden menus
                // DOM polluting our DOM tree.

                scope.anyMenuShown = false;

                scope.menusState = {
                    name: false,
                    meaning: false,
                    type : false,
                    color : false
                }

                scope.menu = new ContextualMenu({
                    template: "/templates/shaker/column-header-contextual-menu.html",
                    cssClass : "column-header-dropdown-menu",
                    scope: scope,
                    contextual: false,
                     onOpen: function() {
                        scope.menusState.name = true;
                    },
                    onClose: function() {
                        scope.menusState.name = false;
                    }
                });

                scope.meaningMenu = new ContextualMenu({
                    template: "/templates/shaker/edit-meaning-contextual-menu.html",
                    cssClass : "column-header-meanings-menu",
                    scope: scope,
                    contextual: false,
                     onOpen: function() {
                        scope.menusState.meaning = true;
                    },
                    onClose: function() {
                        scope.menusState.meaning = false;
                    }
                });

                scope.datasetStorageTypeMenu = new ContextualMenu({
                    template: "/templates/shaker/edit-storagetype-contextual-menu.html",
                    cssClass : "column-header-types-menu",
                    scope: scope,
                    contextual: false,
                     onOpen: function() {
                        scope.menusState.type = true;
                    },
                    onClose: function() {
                        scope.menusState.type = false;
                    }
                });
                scope.colorMenu = new ContextualMenu({
                    template: "/templates/shaker/column-num-color-contextual-menu.html",
                    cssClass : "column-colors-menu",
                    scope: scope,
                    contextual: false,
                     onOpen: function() {
                        scope.menusState.color = true;
                    },
                    onClose: function() {
                        scope.menusState.color = false;
                    }
                });

                scope.toggleHeaderMenu = function() {

                    if (!scope.menusState.name) {
                         element.parent().append(element); //< do not remove this!
                        // It puts the element at the end, and put the menu
                        // over the siblings
                        // The former z-index machinery is broken by the use of css transform.
                        scope.menu.openAlignedWithElement(element.find(".name"), function() {}, true, true);
                    } else {
                        scope.menu.closeAny();
                    }
                };

                scope.toggleMeaningMenu = function() {
                    if (!scope.menusState.meaning) {
                        element.parent().append(element); //< do not remove this!
                        scope.meaningMenu.openAlignedWithElement(element.find(".meaning"), function() {}, true, true);
                    } else {
                        scope.meaningMenu.closeAny();
                    }
                };
                scope.toggleStorageTypeMenu = function() {
                    if (!scope.menusState.type) {
                        element.parent().append(element); //< do not remove this!
                        scope.datasetStorageTypeMenu.openAlignedWithElement(element.find(".storage-type"), function() {}, true, true);
                    } else {
                        scope.datasetStorageTypeMenu.closeAny();
                    }
                };
                 scope.toggleColorMenu = function() {
                    if (!scope.menusState.color) {
                        element.parent().append(element); //< do not remove this!
                        scope.colorMenu.openAlignedWithElement(element.find(".progress:visible"), function() {}, true, true);
                    } else {
                        scope.colorMenu.closeAny();
                    }
                };

                scope.column = scope.header;
                scope.columnIndex = scope.columns.indexOf(scope.column.name);

                scope.isType = function(x) {
                    return this.column.selectedType.name == x;
                };

                scope.possibleMeanings = $.map(scope.column.possibleTypes, function(t) {
                    return t.name;
                });


                    // scope.unprobableTypes = [];
                    // for (var tIdx in scope.types) {
                    //     if ($.inArray(scope.types[tIdx], scope.possibleTypes) == -1) {
                    //         scope.unprobableTypes.push(scope.types[tIdx]);
                    //     }
                    // }

                    // Column have changed, need to update layout -
                    // We only do it for the last column of the layout
                    if (scope.header && scope.table && scope.table.headers && scope.table.headers.length &&
                        scope.column  === scope.table.headers[scope.table.headers.length - 1]) {
                        scope.$emit('updateFixedTableColumns');
                    }
                // });

                if (scope.shakerWritable) {
                    var s = ShakerSuggestionsEngine.computeColumnSuggestions(scope.column, CreateModalFromDOMElement, CreateModalFromTemplate,
                                undefined, undefined, scope.appConfig);
                    scope.suggestions = s[0];
                    scope.moreSuggestions = s[1];
                } else {
                    scope.suggestions = [];
                }

                if (scope.isRecipe){
                    scope.setStorageType = function(newType) {
                        scope.recipeOutputSchema.columns[scope.column.name].column.type = newType;
                        scope.recipeOutputSchema.columns[scope.column.name].persistent = true;
                        scope.schemaDirtiness.dirty = true;
                    };
                }

                scope.executeSuggestion = function(sugg) {
                    sugg.action(scope);
                };
                scope.hasSuggestions = function() {
                    return Object.keys(scope.suggestions).length > 0;
                };
                scope.hasMoreSuggestions = function() {
                    return Object.keys(scope.moreSuggestions).length > 0;
                };

                scope.hasInvalidData = function() {
                    return scope.column.selectedType.nbNOK > 0;
                };
                scope.hasEmptyData = function() {
                    return scope.column.selectedType.nbEmpty > 0;
                };

                scope.setColumnMeaning = function(newMeaning) {
                    scope.shakerHooks.setColumnMeaning(scope.column, newMeaning);
                };

                scope.editColumnUDM = function(){
                    CreateModalFromTemplate("/templates/meanings/column-edit-udm.html", scope, null, function(newScope){
                        newScope.initModal(scope.column.name, scope.setColumnMeaning);
                    });
                }

                scope.setColumnStorageType = function(newType){
                    var schemaColumn = null;

                    if (scope.shaker.origin == "DATASET_EXPLORE") {
                        schemaColumn = scope.column.datasetSchemaColumn;
                    } else if (scope.shaker.origin == "PREPARE_RECIPE") {
                        if (scope.column.recipeSchemaColumn) {
                            schemaColumn = scope.column.recipeSchemaColumn.column;
                        } else {
                            return; // ghost column, added by a stray filter for ex
                        }
                    } else {
                        throw Error("Can't set storage type here origin=" + scope.shaker.origin);
                    }
                    var impact = scope.shakerHooks.getSetColumnStorageTypeImpact(scope.column, newType);
                    if (impact != null) {
                        var doSetStorageType = function(data) {
                            if (data.justDoIt) {
                                scope.shakerHooks.setColumnStorageType(scope.column, newType, null);
                            } else {
                                CreateModalFromTemplate("/templates/shaker/storage-type-change-warning-modal.html", scope, null, function(newScope){
                                    newScope.ok = function() {
                                        newScope.dismiss();
                                        scope.shakerHooks.setColumnStorageType(scope.column, newType, newScope.extraActions.filter(function(a) {return a.selected;}).map(function(a) {return a.id;}));
                                    };
                                    newScope.warnings = data.warnings;
                                    newScope.extraActions = data.extraActions;
                                });
                            }
                        };
                        if (impact.success) {
                            impact.success(doSetStorageType).error(setErrorInScope.bind(scope));
                        } else {
                            impact.then(doSetStorageType);
                        }
                    }
                }
                scope.editThisColumnDetails = function() {
                    var schemaColumn = null;

                    if (scope.shaker.origin == "DATASET_EXPLORE") {
                        schemaColumn = scope.column.datasetSchemaColumn;
                    } else if (scope.shaker.origin == "PREPARE_RECIPE") {
                        if (scope.column.recipeSchemaColumn) {
                            schemaColumn = scope.column.recipeSchemaColumn.column;
                        } else {
                            return; // ghost column, added by a stray filter for ex
                        }
                    } else {
                        schemaColumn = angular.extend({}, scope.shaker.analysisColumnData[scope.column.name], {name: scope.column.name});
                        if (!schemaColumn) {
                            schemaColumn = {name: scope.column.name}
                            scope.shaker.analysisColumnData[scope.column.name] = schemaColumn;
                        }
                    }
                    scope.editColumnDetails(schemaColumn);
                }

                scope.setFilterEmpty = function() {
                    scope.addValidityFilter(scope.column.name, scope.column.selectedType.name, "empty");
                };
                scope.setFilterOK = function() {
                    scope.addValidityFilter(scope.column.name, scope.column.selectedType.name, "ok");
                };
                scope.setFilterNOK = function() {
                    scope.addValidityFilter(scope.column.name, scope.column.selectedType.name, "nok");
                };

                scope.createColumnFilter = function() {
                    scope.addColumnFilter(scope.column.name, {}, 'full_string', scope.column.selectedType.name, scope.column.isDouble);
                }

                scope.deleteColumn = function() {
                    scope.addStepNoPreview("ColumnsSelector", {
                        "keep": false,
                        "appliesTo": "SINGLE_COLUMN",
                        "columns": [ scope.column.name ]
                    });
                    scope.mergeLastColumnDeleters();
                    scope.autoSaveForceRefresh();
                };

                scope.renameColumn = function() {
                    CreateModalFromDOMElement("#rename-column-box", scope, "RenameColumnController", function(newScope) {
                        newScope.setColumn(scope.column.name);
                    });
                };

                scope.datasetInsightLoaded = false;
                scope.callbackDatasetLoaded = function() {
                    if (typeof scope.refreshTableDone === 'function') {
                        scope.refreshTableDone();
                    }
                    scope.datasetInsightLoaded = true;
                }

                scope.moveColumn = function() {
                    CreateModalFromDOMElement("#move-column-box", scope, "MoveColumnController", function(newScope) {
                        newScope.setColumn(scope.column.name);
                    });
                };

                scope.createPredictionModelOnColumn = function(column, datasetName) {
                    if (scope.analysisCoreParams){ // In an analysis, we do not create a new analysis to create the ML task
                        $controller('AnalysisNewMLTaskController', { $scope: scope });
                    } else { // otherwise we create a new analysis
                        $controller('DatasetLabController', { $scope: scope});
                    }
                    scope.newPrediction(column, datasetName);
                };
            }
        };
    });


app.controller("ShakerEditColumnDetailsController", function($scope, $controller, DataikuAPI, $state, Debounce, $stateParams, categoricalPalette, ContextualMenu, CreateModalFromTemplate){
    $scope.column = null;

    $scope.uiState = {};

    $scope.setColumn = function(column) {
        $scope.column = column;
    }

    $scope.save = function() {
        if ($scope.column.customFields && Object.keys($scope.column.customFields).length == 0) {
            delete $scope.column.customFields;
        }
        $scope.shakerHooks.updateColumnDetails($scope.column);
        $scope.dismiss();
    };


    $scope.openMeaningMenu = function($event, column) {
            $scope.meaningMenu.openAtXY($event.pageX, $event.pageY);
            $scope.meaningColumn = column;
    };

    $scope.setColumnMeaning = function(meaningId) {
        $scope.meaningColumn.meaning = meaningId;
        $(".code-edit-schema-box").css("display", "block");
    };

    $scope.editColumnUDM = function() {
        CreateModalFromTemplate("/templates/meanings/column-edit-udm.html", $scope, null, function(newScope) {
            newScope.initModal($scope.meaningColumn.name, $scope.setColumnMeaning);
        });
    };

    $scope.meaningMenu = new ContextualMenu({
        template: "/templates/shaker/edit-meaning-contextual-menu.html",
        cssClass : "column-header-meanings-menu pull-right",
        scope: $scope,
        contextual: false,
        onOpen: function() {},
        onClose: function() {}
    });
});

})();

(function() {
'use strict';

const app = angular.module('dataiku.shaker');


app.constant("NORMALIZATION_MODES", [
    ["EXACT", "Exact"],
    ["LOWERCASE", "Lowercase"],
    ["NORMALIZED", "Normalize (ignore accents)"]
]);


app.controller('ShakerCellValuePopupController', function($scope, Assert) {
    Assert.inScope($scope, 'cellValue');
    Assert.inScope($scope, 'column');

    if (["GeometryMeaning", "BagOfWordsMeaning", "JSONObjectMeaning", "JSONArrayMeaning"].indexOf($scope.column.selectedType.name) >= 0) {
        try {
            $scope.jsonValue = JSON.parse($scope.cellValue);

            $scope.jsonDetails = {}

            if ($scope.jsonValue.constructor === Array) {
                $scope.jsonDetails.type = "array";
                $scope.jsonDetails.length = $scope.jsonValue.length;
                $scope.jsonDetails.strLength = $scope.cellValue.length;
            } else if (typeof($scope.jsonValue) == "object") {
                $scope.jsonDetails.type = "object";
                $scope.jsonDetails.nbKeys = Object.keys($scope.jsonValue).length;
                $scope.jsonDetails.strLength = $scope.cellValue.length;
            }

            $scope.jsonEnabled = true;
        } catch (e){}
    }
});


app.controller('ShakerSelectColumnsController', function($scope, $filter, Assert) {
    Assert.inScope($scope, 'shaker');
    Assert.inScope($scope, 'table');

    if (!$scope.shaker.columnsSelection.list) {
        $scope.allColumnNames = angular.copy($scope.table.allColumnNames.map(function(x){ return { name : x, $selected : true } }));
    } else {
        $scope.allColumnNames = angular.copy($scope.shaker.columnsSelection.list.map(function(x){ return { name : x.name, $selected : x.d } }));
    }

    $scope.ok = function(selectedObjects){
        if ($scope.shaker.columnsSelection.mode == "ALL") {
            $scope.shaker.columnsSelection.list = null;
        } else {
            $scope.shaker.columnsSelection.list = angular.copy($scope.selection.allObjects.map(function(x){ return { name : x.name, d : x.$selected } }));
        }
        $scope.dismiss();
        $scope.autoSaveForceRefresh();
    }
});


app.controller('ShakerSelectSortController', function($scope, $filter, Assert) {
    Assert.inScope($scope, 'shaker');
    Assert.inScope($scope, 'table');

    $scope.uiState = {
        query : ''
    };

    $scope.choicesLeft = [];
    $scope.choicesMade = [];

    // init the 2 lists
    var sorted = {};
    ($scope.shaker.sorting || []).forEach(function(s) {
        $scope.choicesMade.push(angular.copy(s));
        sorted[s.column] = true;
    });
    $scope.table.headers.forEach(function(x) {
        if (!(sorted[x.name])) {
            $scope.choicesLeft.push({column:x.name, ascending:true});
        }
    });

    // utils
    $scope.hasSearch = function() {
        return $scope.uiState.query;
    };
    $scope.resetSearch = function() {
        $scope.uiState.query = null;
    };
    $scope.toggle = function(column) {
        column.ascending = !column.ascending;
    };


    // list operations
    $scope.removeAll = function() {
        $scope.choicesMade.forEach(function(c) {$scope.choicesLeft.push(c);});
        $scope.choicesMade = [];
    };
    $scope.add = function(column) {
        var i = $scope.choicesLeft.indexOf(column);
        if (i >= 0) {
            $scope.choicesLeft.splice(i, 1);
            $scope.choicesMade.push(column);
        }
    };
    $scope.remove = function(column) {
        var i = $scope.choicesMade.indexOf(column);
        if (i >= 0) {
            $scope.choicesMade.splice(i, 1);
            $scope.choicesLeft.push(column);
        }
    };

    $scope.ok = function(){
        $scope.shaker.sorting = angular.copy($scope.choicesMade);
        $scope.dismiss();
        $scope.autoSaveForceRefresh();
    }
});

app.controller('RegexBuilderController', function ($scope, $stateParams, DataikuAPI, FutureWatcher, SpinnerService, $filter, WT1) {
    $scope.uiState = {};
    $scope.customRegexError = "";
    $scope.firstSentence = "";
    $scope.sentences = [];
    $scope.selectionPositions = []; // changes when new selections or when new sentences
    $scope.selections = [];
    $scope.excludedSentences = [];
    $scope.patterns = [];
    $scope.columnName = "";
    $scope.onColumnNames = false;
    $scope.selectedPattern = null;
    $scope.wrapLines = false;
    $scope.warningMessage = "";
    $scope.lastRequestNumber = 0;
    const MULTI_OCCURRENCES_THRESHOLD = 0.1;

    $scope.createCustomPattern = function (regex) {
        return {
            oldRegex: regex || "",
            regex: regex || "",
            nbOK: -1,
            nbNOK: -1,
            extractions: [],
            errors: [],
        }
    };

    $scope.customPattern = $scope.createCustomPattern();

    $scope.removeNextStepsFromShaker = function (shaker, step) {
        const stepId = $scope.findStepId(step);
        if (typeof (stepId) !== 'undefined') {
            if (stepId.depth === 0) {
                shaker.steps = shaker.steps.slice(0, stepId.id);
            } else if (stepId.depth === 1) {
                shaker.steps[stepId.id].steps = shaker.steps[stepId.id].steps.slice(0, stepId.subId);
                shaker.steps = shaker.steps.slice(0, stepId.id + 1);
            }
        }
    };

    const findSelections = function (sentence, selections) {
        const foundSelections = [];
        for (const sel of selections) {
            if (sentence === sel.before + sel.selection + sel.after) {
                foundSelections.push({
                    start: sel.before.length,
                    end: sel.before.length + sel.selection.length,
                });
            }
        }
        return foundSelections;
    }

    const computeSelectionPositions = function (sentences, selections) {
        const selectionPositions = [];
        for (const sentence of sentences) {
            selectionPositions.push(findSelections(sentence, selections));
        }
        return selectionPositions;
    }

    const computeErrorPositionsOneRow = function (selectionPositions, extractionPositions, isExcluded) {
        extractionPositions = extractionPositions || [];
        if (isExcluded) {
            return extractionPositions;
        }
        if (selectionPositions.length == 0) {
            return [];
        }
        const errorPositions = [];
        for (const selection of selectionPositions) {
            if (!extractionPositions.some(extr => extr.start === selection.start && extr.end === selection.end)) {
                errorPositions.push(selection);
            }
        }
        for (const extraction of extractionPositions) {
            if (!selectionPositions.some(sel => sel.start === extraction.start && sel.end === extraction.end)) {
                errorPositions.push(extraction);
            }
        }
        return errorPositions;
    }

    $scope.computeErrorPositions = function (pattern) {
        const errorPositions = [];
        for (const [index, sentence] of $scope.sentences.entries()) {
            errorPositions.push(computeErrorPositionsOneRow($scope.selectionPositions[index], pattern.extractions[index], $scope.isUsedAsExclusion(sentence)));
        }
        return errorPositions;
    }

    $scope.selectPattern = function (pattern) {
        $scope.selectedPattern = pattern;
    }

    $scope.setDefaultSelectedPattern = function (onlyCustomComputed) {
        if (onlyCustomComputed) {
            if ($scope.selectedPattern.category !== 'userCustomPattern') {
                // if the custom pattern was not selected before , we should not force select it
                const selectedIndex = $scope.patterns.findIndex(p => p.regex == $scope.selectedPattern.regex);
                if (selectedIndex >= 0) {
                    $scope.selectPattern($scope.patterns[selectedIndex]);
                    return;
                }
            }
            $scope.selectPattern($scope.customPattern);
            return;
        }
        //select a default pattern
        if ($scope.patterns.length >= 1) {
            $scope.selectPattern($scope.patterns[0]);
        } else {
            $scope.selectPattern($scope.customPattern);
        }
    }

    $scope.filterRequestParameter = function () {
        return { "elements": $scope.buildFilterRequest() };
    }

    $scope.computePatterns = function (computeOnlyCustom) {
        $scope.lastRequestNumber++;
        const currentRequestNumber = $scope.lastRequestNumber;
        const shakerForQuery = $scope.shakerHooks.shakerForQuery();
        // Remove currently edited step and next steps from query
        if ($scope.editStep) {
            $scope.removeNextStepsFromShaker(shakerForQuery, $scope.editStep);
        }
        let selections = [];
        let excludedSentences = [];
        const customRegex = $scope.customPattern.regex;
        if (!computeOnlyCustom) {
            selections = $scope.selections;
            excludedSentences = $scope.excludedSentences;
        }
        DataikuAPI.shakers.smartExtractor($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName, shakerForQuery, $scope.requestedSampleId,
            $scope.columnName,
            selections,
            excludedSentences,
            customRegex,
            $scope.onColumnNames,
            $scope.firstSentence,
            $scope.filterRequestParameter()
        ).success(function (initialResponse) {
            SpinnerService.lockOnPromise(FutureWatcher.watchJobId(initialResponse.jobId).success(function (data) {
                if (currentRequestNumber !== $scope.lastRequestNumber) return;
                if (!computeOnlyCustom) {
                    $scope.patterns = data.result.categories
                        .filter(c => c.name !== "userCustomPattern")
                        .map(c => c.propositions)
                        .flat();
                }
                $scope.customRegexError = data.result.customRegexError;
                const oldRegex = $scope.customPattern.regex
                const customPatternCategory = data.result.categories.find(c => c.name === "userCustomPattern");
                if (customPatternCategory && customPatternCategory.propositions.length >= 1) {
                    $scope.customPattern = customPatternCategory.propositions[0];
                }
                $scope.customPattern.oldRegex = oldRegex;
                $scope.sentences = data.result.sentences;
                $scope.selectionPositions = computeSelectionPositions($scope.sentences, $scope.selections);
                $scope.patterns = $scope.patterns.map(p => {
                    return {
                        ...p,
                        errors: $scope.computeErrorPositions(p),
                    }
                });
                $scope.customPattern.errors = $scope.computeErrorPositions($scope.customPattern)
                if (!$scope.customPattern) {
                    $scope.customPatterns = $scope.createCustomPattern();
                }
                $scope.setDefaultSelectedPattern(computeOnlyCustom);
            }));
        }).error(setErrorInScope.bind($scope));
    };

    $scope.addSelection = function (sentence, startOff, endOff) {
        if ($scope.isUsedAsExclusion(sentence)) {
            $scope.removeSentenceSelectionExcluded(sentence);
        }
        while (sentence[startOff] === " " && startOff <= sentence.length) {
            startOff++;
        }
        while (sentence[endOff - 1] === " " && endOff >= 0) {
            endOff--;
        }
        if (endOff <= startOff) {
            return;
        }
        const sel = {
            before: sentence.substring(0, startOff),
            selection: sentence.substring(startOff, endOff),
            after: sentence.substring(endOff),
        };
        if ($scope.isExistingSelection(sel)) return;
        $scope.selections.push(sel);
        $scope.computePatterns(false);
    };

    $scope.removeSelection = function (idx) {
        $scope.selections.splice(idx, 1);
        $scope.computePatterns(false);
    };

    $scope.removeSentenceSelectionExcluded = function (sentence) {
        $scope.selections = $scope.selections.filter(sel => sel.before + sel.selection + sel.after !== sentence);
        $scope.excludedSentences = $scope.excludedSentences.filter(excl => excl !== sentence);
    };

    $scope.ignoreErrors = function (sentence) {
        $scope.removeSentenceSelectionExcluded(sentence);
        $scope.computePatterns(false);
    };

    $scope.addExcludedSentence = function (sentence) {
        $scope.removeSentenceSelectionExcluded(sentence);
        $scope.excludedSentences.push(sentence);
        $scope.computePatterns(false);
    };

    $scope.removeExcludedSentence = function (idx) {
        $scope.excludedSentences.splice(idx, 1);
        $scope.computePatterns(false);
    };

    $scope.isExistingSelection = function (selection) {
        return $scope.selections.some(sel => sel.before === selection.before && sel.selection === selection.selection && sel.after === selection.after);
    };

    $scope.isUsedAsExclusion = function (sentence) {
        if ($scope.excludedSentences.includes(sentence)) {
            return true;
        }
        return false;
    };

    $scope.findStartOffset = function (nodes, selection) {
        //selection is not a string, it's a https://developer.mozilla.org/en-US/docs/Web/API/Selection
        //nodes are DOM elements
        let startOff = 0;
        for (const node of nodes) {
            if (node.nodeType == 1 && !selection.containsNode(node, true)) {
                startOff += node.textContent.length;
            }
            if (node.nodeType == 1 && selection.containsNode(node, true)) {
                // the selection is between anchorNode and focusNode, but they can either be at the begining or the end of the selection depending on the selection direction (to the right or to the left)
                const isAnchor = node.isSameNode(selection.anchorNode.parentElement);
                const isFocus = node.isSameNode(selection.focusNode.parentElement);
                if (isAnchor && isFocus) {
                    return startOff + Math.min(selection.anchorOffset, selection.focusOffset);
                }
                if (isAnchor) {
                    return startOff + selection.anchorOffset;
                }
                if (isFocus) {
                    return startOff + selection.focusOffset;
                }
            }
        }
    };

    $scope.isSingleNodeSelection = function (nodes, selection) {
        let containsAnchor = false;
        let containsFocus = false;
        for (const node of nodes) {
            if (node.isSameNode(selection.anchorNode.parentElement)) {
                containsAnchor = true;
            }
            if (node.isSameNode(selection.focusNode.parentElement)) {
                containsFocus = true;
            }
        }
        return containsAnchor && containsFocus;
    };

    $scope.onSelection = function (evt, sentence) {
        evt.stopPropagation();
        var userSelection;
        if (window.getSelection) {
            userSelection = window.getSelection();
        } else if (document.selection) {
            userSelection = document.selection.createRange();
        }
        const rowNodes = evt.currentTarget.childNodes;
        if (!$scope.isSingleNodeSelection(rowNodes, userSelection)) {
            return;
        }
        var selectedText = userSelection + "";
        if (userSelection.text) {
            selectedText = userSelection.text;
        }
        if (selectedText) {
            const startOff = $scope.findStartOffset(rowNodes, userSelection);
            $scope.addSelection(sentence, startOff, startOff + selectedText.length);
        }
    };

    $scope.onCustomRegexChange = function () {
        const pattern = $scope.customPattern;
        if (pattern.regex !== pattern.oldRegex) {
            $scope.computePatterns(true);
        }
    }

    $scope.getWT1Stats = function (action) {
        let stats = {};
        stats.action = action || '';
        stats.nbSelections = $scope.selections.length;
        if ($scope.selectedPattern != null) {
            stats.category = $scope.selectedPattern.category;
            stats.matchOK = $scope.selectedPattern.nbOK;
            stats.matchNOK = $scope.selectedPattern.nbNOK;
        }
        stats.calledFrom = $scope.calledFrom || '';
        return stats;
    };

    $scope.save = function () {
        const WT1stats = $scope.getWT1Stats("save")
        WT1.event("patternbuilder", WT1stats);
        if ($scope.selectedPattern != null) {
            if ($scope.deferred) {
                const extractingLines = $scope.selectedPattern.extractions.filter(extractions => extractions.length > 0).length;
                const multiExtractingLines = $scope.selectedPattern.extractions.filter(extractions => extractions.length > 1).length;
                let multiOccurenceRatio = 0;
                if (extractingLines >= 1) {
                    multiOccurenceRatio = multiExtractingLines / extractingLines;
                }
                const pattern = {
                    regex: $scope.selectedPattern.regex,
                    hasMultiOccurrences: multiOccurenceRatio > MULTI_OCCURRENCES_THRESHOLD,
                };
                $scope.deferred.resolve(pattern);
            }
        }
        $scope.dismiss();
    };

    $scope.cancel = function () {
        const WT1stats = $scope.getWT1Stats("cancel");
        WT1.event("patternbuilder", WT1stats);
        if ($scope.deferred) {
            $scope.deferred.reject();
        }
        $scope.dismiss();
    };

});

app.directive('overlapUnderlineHighlight', function () {
    const template = '<span ng-repeat="subSentence in subSentences"'
        + 'ng-class="{'
        + '\'overlap-underline-highlight--dark-green\': subSentence.darkGreen,'
        + '\'overlap-underline-highlight--light-green\': subSentence.lightGreen,'
        + '\'overlap-underline-highlight--error\': subSentence.error,'
        + '\'overlap-underline-highlight--crossed\': isCrossed}">'
        + '{{subSentence.value}}'
        + '</span>';
    return {
        template,
        restrict: 'AE',
        scope: {
            sentence: '=',
            isCrossed: '=',
            darkGreenOffsets: '=', // all offsets should look like [{start: 26, end: 41}, {start: 132, end: 138}]
            lightGreenOffsets: '=',
            errorOffsets: '=',
        },
        link: function (scope, element, attrs) {
            scope.$watch('[sentence, darkGreenOffsets, lightGreenOffsets, errorOffsets, isCrossed]', function (ov, nv) {
                const darkGreenOffsets = scope.darkGreenOffsets || [];
                const lightGreenOffsets = scope.lightGreenOffsets || [];
                const errorOffsets = scope.errorOffsets || [];
                scope.subSentences = [];
                let styleChangingIndexes = new Set([
                    0,
                    ...darkGreenOffsets.flatMap(o => [o.start, o.end]),
                    ...lightGreenOffsets.flatMap(o => [o.start, o.end]),
                    ...errorOffsets.flatMap(o => [o.start, o.end]),
                    scope.sentence.length,
                ]);
                const sortedIndexes = [...styleChangingIndexes].sort((a, b) => a - b);
                for (let i = 0; i < sortedIndexes.length - 1; i++) {
                    const start = sortedIndexes[i];
                    const end = sortedIndexes[i + 1];
                    let subsentence = {
                        value: scope.sentence.substring(start, end),
                        darkGreen: darkGreenOffsets.some(o => o.start <= start && o.end >= end),
                        lightGreen: lightGreenOffsets.some(o => o.start <= start && o.end >= end),
                        error: errorOffsets.some(o => o.start <= start && o.end >= end),
                    };
                    scope.subSentences.push(subsentence);
                };
            }, true)
        }
    }
});

app.controller('SmartDateController', function($scope, $stateParams, $timeout, DataikuAPI, WT1) {
    $scope.uiState = {
        customFormatInput: ""
    };

    $scope.removeNextStepsFromShaker = function(shaker, step) {
        const stepId = $scope.findStepId(step);
        if (typeof(stepId)!=='undefined') {
            if (stepId.depth == 0) {
                shaker.steps = shaker.steps.slice(0, stepId.id);
            } else if (stepId.depth == 1) {
                shaker.steps[stepId.id].steps = shaker.steps[stepId.id].steps.slice(0, stepId.subId);
                shaker.steps = shaker.steps.slice(0, stepId.id + 1);
            }
        }
    };

    $scope.setColumn  = function(name) {
        $scope.columnName = name;
        // Copy of the original shaker for the query
        const shakerForQuery = $scope.shakerHooks.shakerForQuery();
        // Remove currently edited step and next steps from query
        if ($scope.editStep) {
            $scope.removeNextStepsFromShaker(shakerForQuery, $scope.editStep);
        }

        DataikuAPI.shakers.smartDateGuess($stateParams.projectKey,
            $scope.inputDatasetProjectKey, $scope.inputDatasetName, shakerForQuery, $scope.requestedSampleId, $scope.columnName).success(function(data) {
            $scope.autodetected = data.formats;
            WT1.event("smartdate-guessed", {"nbGuessed" : $scope.autodetected.length});
            let detectedFormatIndex;
            for (const i in $scope.autodetected) {
                let fmt = $scope.autodetected[i];
                fmt.parsesPercentage = 100*fmt.nbOK/(fmt.nbOK + fmt.nbNOK + fmt.nbPartial);
                fmt.partialPercentage = 100*fmt.nbPartial/(fmt.nbOK + fmt.nbNOK + fmt.nbPartial);
                fmt.failsPercentage = 100 - fmt.parsesPercentage - fmt.partialPercentage;
                if ($scope.editFormat == fmt.format) {
                    detectedFormatIndex = i;
                }
            }

            let selectCustom = false
            if (!$scope.editFormat) {
                // New smart date or no format to edit => select first format if found
                if ($scope.autodetected.length > 0) {
                    $scope.selectFormat(0);
                } else { // select the custom format
                    selectCustom = true;
                }
            } else if (detectedFormatIndex >= 0) {
                // Found format in the guess list => select this one
                $scope.selectFormat(detectedFormatIndex);
            } else {
                selectCustom = true;
            }
            // need to validate the empty custom so that we can display examples (they come from backend and depend on the format)
            $scope.validateCustom(selectCustom);
        }).error(setErrorInScope.bind($scope));
    };

    WT1.event("smartdate-open");

    $scope.selectFormat = function(idx) {
        $scope.selectedFormat = $scope.autodetected[idx];
    };

    $scope.validateSeqId = 0;

    $scope.onCustomFormatClick = function() {
        $scope.selectedFormat = $scope.customFormat;
    };

    $scope.validateCustom = function(isSelected) {
        $scope.validateSeqId++;
        const seqId = $scope.validateSeqId;
        WT1.event("smartdate-validate-custom", {"format" : $scope.uiState.customFormatInput});
        // Get a copy of the current shaker for the query
        let shakerForQuery = $scope.shakerHooks.shakerForQuery();
        // Remove currently edited step and next steps from query
        if ($scope.editStep) {
            $scope.removeNextStepsFromShaker(shakerForQuery, $scope.editStep);
        }
        DataikuAPI.shakers.smartDateValidate($stateParams.projectKey,
                $scope.inputDatasetProjectKey, $scope.inputDatasetName, shakerForQuery, $scope.requestedSampleId,
                $scope.columnName, $scope.uiState.customFormatInput == null ? "" : $scope.uiState.customFormatInput).success(function(data) {
            if (seqId != $scope.validateSeqId) return;
            data.parsesPercentage = 100*data.nbOK/(data.nbOK + data.nbNOK + data.nbPartial);
            data.partialPercentage = 100*data.nbPartial/(data.nbOK + data.nbNOK + data.nbPartial);
            data.failsPercentage = 100 - data.parsesPercentage - data.partialPercentage;
            if (isSelected) {
                $scope.selectedFormat = data;
            }
            $scope.customFormat = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.save = function() {
        if ($scope.selectedFormat != null && $scope.selectedFormat.validFormat) {
            WT1.event("smartdate-accept", {"format" : $scope.selectedFormat.format});
            if ($scope.deferred) {
                $scope.deferred.resolve($scope.selectedFormat.format);
            }
            $scope.dismiss();
        }
    };

    $scope.cancel = function() {
        if ($scope.deferred) {
            $scope.deferred.reject();
        }
        $scope.dismiss();
    };

    $scope.$watch("uiState.customFormatInput", function(ov, nv) {
        if (ov != nv) {
            $timeout(function () {$scope.validateCustom(true);}, 200);
        }
    });
});

app.controller('DateParserController', function($scope, $q, $element, WT1, CreateModalFromTemplate) {
    if (!$scope.step.params.formats) $scope.step.params.formats = [''];
    $scope.formatItemTemplate = {format: ''};
    $scope.formatItems = $scope.step.params.formats.map(function(f) { return {format: f}; });
    $scope.formatsChanged = function() {
        [].splice.apply($scope.step.params.formats,
            [0, $scope.step.params.formats.length].concat($scope.formatItems.map(function(fi) { return fi.format; })));
        $scope.checkAndRefresh();
    };
    $scope.validateFormatList = function(it, itemIndex) {
        if (!it || !it.format || it.format.length == 0) return false;
        for (var i in $scope.formatItems) {
            if ($scope.formatItems[i].format == it.format) return false;
        }
        return true;
    };
    $scope.showSmartDateTool = function() {
        return $scope.columns && $scope.step.params.columns && $scope.step.params.columns[0] && $scope.columns.indexOf($scope.step.params.columns[0]) >= 0;
    };
    $scope.openSmartDateTool = function() {
        if (!$scope.step.params.columns || !$scope.step.params.columns[0] || $scope.columns.indexOf($scope.step.params.columns[0]) == -1) return;
        
        WT1.event("shaker-parsedate-edit-smartdate");
        var deferred = $q.defer();
        CreateModalFromTemplate("/templates/shaker/smartdate-box.html", $scope, "SmartDateController",
            function(newScope) { newScope.$apply(function() {
                    newScope.deferred = deferred;
                    newScope.editStep = $scope.step;
                    newScope.editFormat = "";
                    newScope.setColumn($scope.step.params.columns[0]);
            }); }, "sd-modal");
        deferred.promise.then(function(newFormat) {
            if (!newFormat || newFormat.length == 0) return;
            // Checks if the new format is already present in the list and retrieve the old format index
            let isNewFormatThere, newFormatIdx;
            for (let i in $scope.formatItems) {
                if ($scope.formatItems[i].format == newFormat) {
                    isNewFormatThere = true;
                    newFormatIdx = i;
                    break;
                }
            }
            // Edit the new format if not present, otherwise focus on the existing input containing the new format
            if (!isNewFormatThere) {
                if ($scope.formatItems.length > 0) {
                    const lastItem = $scope.formatItems[$scope.formatItems.length - 1];
                    if (lastItem.format == '') {
                        $scope.formatItems.pop();
                    }
                }
                $scope.formatItems = [...$scope.formatItems, { format: newFormat }];
                newFormatIdx = $scope.formatItems.length - 1;
                $scope.formatsChanged();
            }
            setTimeout(() => {
                // element not yet created ion the dom when checking
                $element.find(".dateFormatInput")[newFormatIdx].focus();
            }, 100);
        });
    };
});

app.controller('RenameColumnController', function($scope) {
    $scope.setColumn  = function(name) {
        $scope.columnName = name;
        $scope.renameTarget = name;
    }

    $scope.save = function() {
        if($scope.columnName!=$scope.renameTarget) {
            $scope.addStepNoPreviewAndRefresh("ColumnRenamer", {
                renamings : [
                    {"from" : $scope.columnName, "to" : $scope.renameTarget}
                ]
            });
            $scope.mergeLastColumnRenamers();
        }
        $scope.dismiss();
    }
});

app.controller('MoveColumnController', function($scope) {
    $scope.setColumn = function(name) {
        $scope.columnName = name;
        // Remove the column we want to move from the list of reference columns.
        let index = $scope.referenceColumnList.indexOf(name);
        $scope.referenceColumnList.splice(index, 1);
    };

    $scope.save = function() {
        $scope.addStepNoPreviewAndRefresh("ColumnReorder", {
            appliesTo : "SINGLE_COLUMN",
            columns: [$scope.columnName],
            referenceColumn: $scope.referenceColumn,
            reorderAction: $scope.reorderAction.name
        });
        $scope.mergeLastColumnReorders();
        $scope.dismiss();
    };

    $scope.reorderActions = [
        { name: "AT_START", label: "at beginning", needReferenceColumn: false },
        { name: "AT_END", label: "at end", needReferenceColumn: false },
        { name: "BEFORE_COLUMN", label: "before", needReferenceColumn: true },
        { name: "AFTER_COLUMN", label: "after", needReferenceColumn: true }
    ];

    $scope.reorderAction = $scope.reorderActions[0];
    $scope.referenceColumnList = $scope.tableModel.allColumnNames.slice();
});

app.controller('FillEmptyWithValueController', function($scope, DataikuAPI, MonoFuture, $stateParams) {
    var monoFuture = MonoFuture($scope);
    function analysis(callback) {
        monoFuture.exec(
            DataikuAPI.shakers.multiColumnAnalysis(
                $stateParams.projectKey,
                $scope.inputDatasetProjectKey, $scope.inputDatasetName, $scope.inputStreamingEndpointId, $scope.shakerHooks.shakerForQuery(),
                $scope.requestedSampleId, $scope.columns, $scope.source)
        ).success(function(data) {
            if (data.hasResult) {
                callback(data.result);
            }
        }).error(setErrorInScope.bind($scope));
    }
    $scope.source = 'constant';
    $scope.isNumericOnly = false;
    $scope.setColumns = function(cols) {
        $scope.columns = cols;
        $scope.columnName = cols.length === 1 ? cols[0] : null;
    }
    $scope.save = function() {
        var fn = $scope.columns.length === 1 ? 'addStep' : 'addStepNoPreview';
        if ($scope.source === 'constant') {
            if ($scope.columns.length == 1) {
                $scope[fn]("FillEmptyWithValue", { appliesTo : "SINGLE_COLUMN", columns: $scope.columns, value: $scope.valueToFill });
            } else {
                $scope[fn]("FillEmptyWithValue", { appliesTo : "COLUMNS", columns: $scope.columns, value: $scope.valueToFill });
            }
            $scope.autoSaveForceRefresh();
            $scope.dismiss();
        } else {
            analysis(function(data) {
                for (var c in data) {
                    $scope[fn]("FillEmptyWithValue", { appliesTo : "SINGLE_COLUMN", columns: [c], value: data[c] });
                }
                $scope.autoSaveForceRefresh();
                $scope.dismiss();
            });
        }
    }
});


app.controller('MassRenameColumnsController', function($scope) {
    var edits = {
        prefix: function(c) { return $scope.prefix ? $scope.prefix + c : c; },
        suffix: function(c) { return $scope.suffix ? c + $scope.suffix : c; },
        regexp: function(c) { return $scope.regexp ?
                c.replace(new RegExp($scope.regexp, 'ig'), $scope.replace) : c; },
        lowercase : function(c){ return c.toLowerCase()},
        uppercase : function(c){ return c.toUpperCase()},
        normalizeSpecialChars : function(c) { return c.toLowerCase().replace( /[^A-Za-z0-9_]/g, "_")}
    };
    $scope.replace = '';
    $scope.setColumns = function(cols) {
        $scope.columns = cols;
        $scope.columnName = cols.length === 1 ? cols[0] : null;
    }
    $scope.edit = 'prefix';
    $scope.save = function() {
        var dirty = false,
            renamings = [];

        $scope.columns.forEach(function(c) {
            var c2 = edits[$scope.edit](c);
            if (c2 && c2 !== c) {
                dirty = true;
                renamings.push({ from : c, to : c2 });
            }
        });
        if (dirty) {
        	$scope.doRenameColumns(renamings);
        }
        $scope.dismiss();
    }
});


app.controller('MultiRangeController', function($scope) {
    $scope.setColumns = function(cols) {
        $scope.columns = cols;
        $scope.columnName = cols.length === 1 ? cols[0] : null;
    }

    $scope.keep = true;
    $scope.save = function() {
        $scope.addStepNoPreview("FilterOnNumericalRange", {
            appliesTo : "COLUMNS",
            columns: $scope.columns,
            min: $scope.min,
            max: $scope.max,
            action : $scope.keep ? "KEEP_ROW" : "REMOVE_ROW"
        });
        $scope.autoSaveForceRefresh();
        $scope.dismiss();
    }
});


app.controller('FindReplaceController', function($scope, NORMALIZATION_MODES) {
    $scope.$watch("step.params.matching", function(nv, ov) {
        if (nv && nv == 'FULL_STRING') {
            $scope.normalizationModes = NORMALIZATION_MODES;
        } else if (nv) {
            $scope.normalizationModes = NORMALIZATION_MODES.filter(function(mode) { return mode[0] !== 'NORMALIZED'; });
            if ($scope.step.params.normalization == "NORMALIZED") {
                $scope.step.params.normalization = "EXACT";
            }
        }
    })
});


app.controller('MeaningTranslateController', function($scope) {
    $scope.meanings = $scope.appConfig.meanings.categories
        .filter(function(cat) { return cat.label === "User-defined"; })[0]
        .meanings.filter(function(meaning) { return meaning.type === 'VALUES_MAPPING'; });
});


app.controller('CurrencySplitterController', function($scope) {
    $scope.$watch("step.params.inCol", function(nv, ov) {
        if (angular.isDefined(nv) && nv.length > 0 && $scope.step.isNew) {
          $scope.step.params.outColCurrencyCode = $scope.step.params.inCol + "_currency_code";
          $scope.step.params.outColAmount = $scope.step.params.inCol + "_amount";
        }
    }, true);

    /* TODO: This should rather be done by a "default values" section ... */
});


app.controller('ColumnSplitterController', function($scope) {
    $scope.$watch("step.params.inCol", function(nv, ov) {
        if (angular.isDefined(nv) && nv.length > 0 && $scope.step.isNew) {
            $scope.step.params.outColPrefix = $scope.step.params.inCol + "_";
        }
    }, true);

    /* TODO: This should rather be done by a "default values" section ... */
    $scope.$watch("step.params.limitOutput", function(nv, ov) {
        if ($scope.step.params.limitOutput && !$scope.step.params.limit) {
            $scope.step.params.limit = 1;
            $scope.step.params.startFrom = "beginning";
        }
    }, true);
});


app.controller('CurrencyConverterController', function($scope, DataikuAPI) {

    $scope.currencies = [
        ["AUD", "AUD"],
        ["BGN", "BGN"],
        ["BRL", "BRL"],
        ["CAD", "CAD"],
        ["CHF", "CHF"],
        ["CNY", "CNY"],
        ["CYP", "CYP"],
        ["CZK", "CZK"],
        ["DKK", "DKK"],
        ["EEK", "EEK"],
        ["EUR", "EUR"],
        ["GBP", "GBP"],
        ["HKD", "HKD"],
        ["HRK", "HRK"],
        ["HUF", "HUF"],
        ["IDR", "IDR"],
        ["INR", "INR"],
        ["ISK", "ISK"],
        ["JPY", "JPY"],
        ["KRW", "KRW"],
        ["LTL", "LTL"],
        ["LVL", "LVL"],
        ["MTL", "MTL"],
        ["MXN", "MXN"],
        ["MYR", "MYR"],
        ["NOK", "NOK"],
        ["NZD", "NZD"],
        ["PHP", "PHP"],
        ["PLN", "PLN"],
        ["ROL", "ROL"],
        ["RON", "RON"],
        ["RUB", "RUB"],
        ["SEK", "SEK"],
        ["SGD", "SGD"],
        ["SIT", "SIT"],
        ["SKK", "SKK"],
        ["THB", "THB"],
        ["TRL", "TRL"],
        ["TRY", "TRY"],
        ["USD", "USD"],
        ["ZAR", "ZAR"]
    ];

    $scope.dateInputs = [];
    DataikuAPI.shakers.getLastKnownCurrencyRateDate().success(function(data) {
        $scope.dateInputs = buildDateInputsList(data);
    }).error(function() {
        $scope.dateInputs = buildDateInputsList("unknown date");
    });

    function buildDateInputsList(lastKnownRateDate) {
        return [
            ["LATEST", "Last known rates (" + lastKnownRateDate + ")"],
            ["COLUMN", "From Column (Date)"],
            ["CUSTOM", "Custom input"]
        ];
    }

    function isColumnValid(col, meaning) {
        if(!$scope.table) return true;
        return $scope.table.headers.some(function(h) { return h.name === col && h.selectedType.name === meaning; });
    }

    $scope.$watch('step.params.inputColumn', function(nv, ov) {
        if (angular.isDefined(nv) && nv.length > 0 && $scope.step.isNew) {
            $scope.step.params.outputColumn = $scope.step.params.inputColumn + "_";
        }
    });

    $scope.$watch("step.params.refDateColumn", function(nv, ov) {
        $scope.dateColumnIsValid = isColumnValid(nv, "Date");
        if (nv != ov)
            $scope.processorForm.dateReferenceColumn.$setValidity('columnTypeInvalid', $scope.dateColumnIsValid);
    });

    $scope.$watch("step.params.refCurrencyColumn", function(nv, ov) {
        $scope.currencyColumnIsValid = isColumnValid(nv, "CurrencyMeaning");
        if (nv != ov)
            $scope.processorForm.currencyReferenceColumn.$setValidity('columnTypeInvalid', $scope.currencyColumnIsValid);
    });

    $scope.$watch("step.params.refDateCustom", function(nv, ov) {
        if (nv != ov) {
            var minDate = new Date("1999-01-04");
            /*
             * Date() constructor accepts yyyy or yyyy-MM or yyyy-MM-dd
             * We want to restrict user's entry to yyyy-MM-dd which explains
             * the Regex, checking XXXX-XX-XX, with X any number.
             * Date() constructor will check if it's a valid date
             * If it's not, then "date" will be false
             */
            var dateFormat = new RegExp("^[0-9]{4}(-[0-9]{2}){2}$").test(nv);
            var date = new Date(nv);
            $scope.processorForm.dateReferenceCustom.$setValidity('Date type invalid', dateFormat && date && date > minDate);
            $scope.outOfDateReference = (dateFormat && date && date < minDate);
        }
    });
});


app.controller('RegexpExtractorController', function($scope, $q, CreateModalFromTemplate) {
    $scope.validColumn = function() {
        return $scope.step.$stepState.change && $scope.step.$stepState.change.columnsBeforeStep.indexOf($scope.step.params.column) !== -1;
    };
    $scope.openSmartRegexBuilder = function() {
        let deferred = $q.defer();
        CreateModalFromTemplate("/templates/shaker/regexbuilder-box.html", $scope, "RegexBuilderController",
            function(newScope) {
                newScope.$apply(function() {
                    newScope.deferred = deferred;
                    newScope.columnName = $scope.step.params.column;
                    newScope.editStep = $scope.step;
                    newScope.calledFrom = "shaker_recipe-regexpextractor";
                    newScope.customPattern = newScope.createCustomPattern($scope.step.params.pattern);
                    newScope.computePatterns(false);
                });
                deferred.promise.then(function(newPattern) {
                    $scope.step.params.pattern = newPattern.regex;
                    $scope.step.params.extractAllOccurrences = newPattern.hasMultiOccurrences;
                    $scope.checkAndRefresh();
                });
            },
            "sd-modal");
    };
});

app.controller('MultiColumnByPrefixFoldController', function($scope, $q, CreateModalFromTemplate) {
    $scope.openSmartRegexBuilder = function() {
        var deferred = $q.defer();
        CreateModalFromTemplate("/templates/shaker/regexbuilder-box.html", $scope, "RegexBuilderController",
            function(newScope) {
                newScope.deferred = deferred;
                newScope.$apply(function() {
                    newScope.onColumnNames = true;
                    newScope.editStep = $scope.step;
                    newScope.calledFrom = "shaker_recipe-multi_column_by_prefix_fold";
                    newScope.customPattern = newScope.createCustomPattern($scope.step.params.columnNamePattern);
                    newScope.computePatterns(false);
                });
                deferred.promise.then(function(newPattern) {
                    let columnNamePattern = newPattern.regex;
                    if (!columnNamePattern.startsWith('.*?')) {
                        columnNamePattern = ".*?" + columnNamePattern;
                    }
                    if (!columnNamePattern.endsWith('.*')) {
                        columnNamePattern = columnNamePattern + ".*";
                    }
                    $scope.step.params.columnNamePattern = columnNamePattern;
                    $scope.checkAndRefresh();
                });
            },
            "sd-modal");
    };
});


app.controller('PythonUDFController', function(
       $scope, $timeout, $rootScope, $q, $stateParams,
       CreateModalFromTemplate, CreateCustomElementFromTemplate, DataikuAPI, ShakerPopupRegistry, CodeMirrorSettingService) {

    var pythonSourceCodes = {

"CELL_true": "\
# Modify the process function to fit your needs\n\
import pandas as pd\n\
def process(rows):\n\
    # In 'cell' mode, the process function must return\n\
    # a single Pandas Series for each block of rows,\n\
    # which will be affected to a new column.\n\
    # The 'rows' argument is a dictionary of columns in the\n\
    # block of rows, with values in the dictionary being\n\
    # Pandas Series, which additionally holds an 'index'\n\
    # field.\n\
    return pd.Series(len(rows), index=rows.index)\n"
,
"ROW_true": "\
# Modify the process function to fit your needs\n\
import pandas as pd\n\
def process(rows):\n\
    # In 'row' mode, the process function \n\
    # must return the full rows.\n\
    # The 'rows' argument is a dictionary of columns in the\n\
    # block of rows, with values in the dictionary being\n\
    # Pandas Series, which additionally holds an 'index'\n\
    # field.\n\
    # You may modify the 'rows' in place to\n\
    # keep the previous values of the row.\n\
    # Here, we simply add two new columns.\n\
    rows[\"rowLength\"] = pd.Series(len(rows), index=rows.index)\n\
    rows[\"static_value\"] = pd.Series(42, index=rows.index)\n\
    return rows\n"
,
"MULTI_ROWS_true": "\
# Modify the process function to fit your needs\n\
import numpy as np, pandas as pd\n\
def process(rows):\n\
    # In 'multi rows' mode, the process function\n\
    # must return an indexed dictionary of vectors,\n\
    # either built by modifying the 'rows' \n\
    # parameter, or by returning a pandas DataFrame.\n\
    # To get an input dataframe, use\n\
    # rows.get_dataframe([col_name1, ...])\n\
    input_index = rows.index\n\
    # the values in the output index indicate which\n\
    # row of the input is used as base for the \n\
    # output rows. -1 signals that the new row comes\n\
    # from a blank base\n\
    new_index = np.concatenate([input_index, -1 * np.ones(input_index.shape[0])])\n\
    rows.index = new_index\n\
    # input columns are passed as pandas Series\n\
    existing_column_name = rows.columns[0]\n\
    existing_column = rows[existing_column_name]\n\
    rows[existing_column_name] = pd.concat([existing_column, existing_column])\n\
    # new columns can be numpy arrays\n\
    rows[\"static_value\"] = 42 * np.ones(2 * input_index.shape[0])\n\
    # the index field of the 'rows' parameter\n\
    # is a numpy array\n\
    rows[\"index\"] = np.concatenate([input_index, input_index])\n\
    return rows"
,
"CELL_false": "\
# Modify the process function to fit your needs\n\
def process(row):\n\
    # In 'cell' mode, the process function must return\n\
    # a single cell value for each row,\n\
    # which will be affected to a new column.\n\
    # The 'row' argument is a dictionary of columns of the row\n\
    return len(row)\n"
,
"ROW_false": "\
# Modify the process function to fit your needs\n\
def process(row):\n\
    # In 'row' mode, the process function \n\
    # must return the full row.\n\
    # The 'row' argument is a dictionary of columns of the row\n\
    # You may modify the 'row' in place to\n\
    # keep the previous values of the row.\n\
    # Here, we simply add two new columns.\n\
    row[\"rowLength\"] = len(row)\n\
    row[\"static_value\"] = 42\n\
    return row\n"
,
"MULTI_ROWS_false": "\
# Modify the process function to fit your needs\n\
def process(row):\n\
    # In 'multi rows' mode, the process function\n\
    # must return an iterable list of rows.\n\
    ret = []\n\
    # Here we append a new row with only one column\n\
    newrow1 = { \"previous_row_length\" : len(row) }\n\
    ret.append(newrow1)\n\
    # We can also modify the original row and reappend it\n\
    row[\"i\"] = 3\n\
    ret.append(row)\n\
    \n\
    return ret"
}

    $scope.editorOptions = CodeMirrorSettingService.get('text/x-python', {onLoad: function(cm) {$scope.codeMirror = cm}});

    $scope.$watch("[step.params.mode,step.params.vectorize, step.params.useKernel]", function(nv, ov) {
        if (!nv) return;
        // put defaults if they're not here already
        if ($scope.step.params.vectorize == null) {
            $scope.step.params.vectorize = false;
        }
        if ($scope.step.params.vectorSize == null) {
            $scope.step.params.vectorSize = 256;
        }
        const oldVectorized = ov[1] && ov[2];
        const newVectorized = nv[1] && nv[2];
        const oldDefaultPythonSourceCode = pythonSourceCodes[ov[0] + '_' + oldVectorized];
        const newDefaultPythonSourceCode = pythonSourceCodes[nv[0] + '_' + newVectorized];

        let oldPythonSource = $scope.step.params.pythonSourceCode;

        /* If we have already some code but it was the example code of the previous mode,
        then override it */
        if (oldPythonSource == oldDefaultPythonSourceCode) {
            oldPythonSource = null;
        }

        if ( (!oldPythonSource) || oldPythonSource.trim().length == 0) {
            $scope.step.params.pythonSourceCode = newDefaultPythonSourceCode;
        }
    }, true);

    $scope.parentDismiss = function() {
    	$rootScope.$broadcast("dismissModalInternal_");
    	$scope.modalShown = false;
    }
    $scope.$on("dismissModals", $scope.parentDismiss);

    $scope.hooks= {
            ok : function(){
                throw Error("not implemented");
            },
		    apply : function(){
		        throw Error("not implemented");
		    }
        };

    $scope.editPythonSource = function() {
        if ($scope.modalShown) {
            $scope.parentDismiss();
        } else {
            ShakerPopupRegistry.dismissAllAndRegister($scope.parentDismiss);
            $scope.modalShown = true;
            CreateCustomElementFromTemplate("/templates/shaker/pythonedit-box.html", $scope, null, function(newScope) {
                var pythonSource = $scope.step.params.pythonSourceCode;
                var mode = $scope.step.params.mode;
                var vectorize = $scope.step.params.vectorize;
                newScope.modified = false;
                if ( (!pythonSource) || pythonSource.trim().length == 0) {
                    newScope.pythonSource = pythonSourceCodes[mode + '_' + vectorize];
                    newScope.modified = true;
                }
                else {
                    newScope.pythonSource = $scope.step.params.pythonSourceCode;
                }

                $scope.hooks.apply = function() {
                	if ( newScope.modified ) {
                		$scope.step.params.pythonSourceCode = newScope.pythonSource;
                		$scope.checkAndRefresh();
                	}
                };
                $scope.hooks.ok = function() {
                	$scope.hooks.apply();
                	$scope.parentDismiss();
                };

                newScope.checkSyntax = function(pythonCode) {
                	var stepPosition = $scope.findStepId($scope.step);
                	DataikuAPI.shakers.validateUdf($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName, $scope.shakerHooks.shakerForQuery()
                			, $scope.requestedSampleId, pythonCode, stepPosition.id, stepPosition.subId || 0, stepPosition.depth).success(function(data) {
                				newScope.validationError = data;
                			}).error(setErrorInScope.bind($scope));
                };

                $scope.uiState = { codeSamplesSelectorVisible: false };
                var insertCode = function (codeToInsert) {
                 	//timeout to make sure of an angular safe apply
                  	$timeout(function() {
                   		$scope.codeMirror.replaceSelection(codeToInsert + '\n\n', "around");
                   	});
                   	$scope.codeMirror.focus();
                };
                $scope.insertCodeSnippet = function(snippet) {
                    insertCode(snippet.code);
                };
            } , $scope.customFormulaEdition.displayCustomFormula);
        }
    };
});

/**
 * Formula function hinter directive
 *  @param {string}     name        - Name of the function
 *  @param {boolean}    applied     - Is function applied to column
 *  @param {string}     arguments   - Argument list as string, separated by ","
 *  @param {string}     description - Function description
 *  @param {number}     left        - Absolute CSS position left
 *  @param {number}     top         - Absolute CSS position top
 *  @param {number}     cursor      - Cursor position in the current line
 *  @param {string}     line        - Line of code user actually typing into
 *  @param {number}     start       - Position of the function token in the code line
 */
app.directive('formulaFunctionHinter', function($compile) {
    return {
        template: ``,
        restrict :'E',
        scope : {
            name: "<",
            applied: "<",
            arguments: "<",
            description: "<",
            examples: "<",
            left: "<",
            top: "<",
            cursor: '<',
            line: '<',
            start: '<'
        },
        link: function($scope) {

            const removeAnchor = () => {
                const prevAnchor = document.getElementById('formula-function-hinter');
                if(prevAnchor) {
                    prevAnchor.parentNode.removeChild(prevAnchor);
                }
            }

            removeAnchor();
            $scope.$on('$destroy', removeAnchor);

            const formatExamples = function(name, examples) {
                if (!examples) {
                    return "";
                } 
                return examples.map((example) =>
                        `<div class="formula-tooltip__example">
                            <code>${name}(${example.args.join(", ")})</code> returns <code>${example.result}</code>
                        </div>`).join("");
            }

            // Element need to be placed at root level to avoid overflowing issue due to editor container
            $scope.htmlExamples = formatExamples($scope.name, $scope.examples);
            const body = angular.element(document.body);
            const anchor = angular.element(`
                <div class="formula-tooltip" id="formula-function-hinter" ng-style="getStyle()">
                    <strong>{{name}}</strong>(<span ng-bind-html="argsString"></span>)
                    <p class="formula-tooltip__description" ng-bind-html="description"></p>
                    <span ng-bind-html="htmlExamples"></span>
                </div>
            `);
            body.append(anchor);
            $compile(anchor)($scope);
            
            $scope.getStyle = () => ({
                top: $scope.top + 'px',
                left: $scope.left + 'px'
            });

            const getCurrentArgumentIndex = () => {
                let part = $scope.line.substr($scope.start);
                let pos = 0;
                let parentheses = 0;
                let brackets = 0;
                let quotes = 0;
                let sglQuotes = 0;
                let index = 0;
                while(pos + $scope.start < $scope.cursor) {
                    const char = part.substr(pos, 1);
                    if(char === '\\') {
                        // Escaping character, so we should also skip next one
                        pos += 2;
                        continue;
                    }
                    
                    if(char === ',' && parentheses === 0 && brackets === 0 && sglQuotes % 2 === 0 && quotes % 2 === 0) {
                        // We are not between parentheses or quotes, we can increment the count
                        index ++;
                    } else if(char === '(') {
                        parentheses ++;
                    } else if(char === ')') {
                        parentheses --;
                    } else if(char === '[') {
                        brackets ++;
                    } else if(char === ']') {
                        brackets --;
                    } else if(char === '"' && sglQuotes % 2 === 0) {
                        quotes ++;
                    } else if(char === "'" && quotes % 2 === 0) {
                        sglQuotes --;
                    }
                    pos ++;
                }
                return index;
            };

            $scope.argsString = '';

            $scope.$watch('[arguments,cursor,line,start]', () => {
                const index = getCurrentArgumentIndex();
                $scope.argsString = $scope.arguments.split(', ')
                    .filter((_, id) => id > 0 || !$scope.applied)
                    .map((arg, id) => id === index ? `<strong>${arg}</strong>` : arg)
                    .join(', ');
            });

            $scope.$watch('examples', nv => {
                $scope.htmlExamples = formatExamples($scope.name, nv);
            })
        }       
    };
});

/**
 * Grel formula editor
 *  @param {string}     expression          - Current formula expression
 *  @param {array}      columns             - Array of column objects, formatted as { name: string, type: string, meaning?: string, comment?: string }
 *  @param {object}     scope variables     - If set, this will replace the variables coming from API. Must be a key-value pair dictionnary.
 *  @param {function}   validator           - Function validating the expression
 *  @param {function}   onValidate          - Event fired after complete validation
 *  @param {function}   onExpressionChange  - Event fired when expression changes
 */
app.directive('grelEditor', function($timeout, $stateParams, DataikuAPI, CachedAPICalls, Debounce) {
    return {
        template: `<div class="editor-tooltip-anchor h100" on-smart-change="validateGRELExpression()">
                        <formula-function-hinter
                            ng-if="tooltip.shown"
                            description="tooltip.description"
                            applied="tooltip.applied"
                            left="tooltip.left"
                            top="tooltip.top"
                            arguments="tooltip.arguments"
                            name="tooltip.name"
                            examples="tooltip.examples"
                            line="tooltip.line"
                            cursor="tooltip.cursor"
                            start="tooltip.tokenStart" />
                        <textarea class="h100"></textarea>
                    </div>`,
        restrict :'E',
        replace: true,
        scope : {
            expression: "=",
            columns: "<",
            scopeVariables: "=?",
            validator: "<",
            onValidate: "<",
            onExpressionChange: "<"
        },
        link: function($scope, element) {

            $scope.tooltip = {
                shown: false,
                applied: false,
                left: 0,
                top: 0,
                arguments: '',
                description: '',
                examples: '',
                name: '',
                line: '',
                cursor: 0,
                tokenStart: 0
            }

            $scope.$watch('scopeVariables', () => {
                if($scope.scopeVariables && Object.keys($scope.scopeVariables).length > 0) {
                    const newVars = {};
                    Object.keys($scope.scopeVariables).forEach(key => {
                        newVars[`variables["${key}"]`] = { value: $scope.scopeVariables[key] };
                        newVars[`\${${key}}`] = { value: $scope.scopeVariables[key] };
                    });
                    $scope.variables = newVars;
                }
            });

            $scope.variables = [];
            DataikuAPI.admin.getGlobalVariables().success(data => {
                const newVars = {};
                Object.keys(data).forEach(key => {
                    newVars[`variables["${key}"]`] = { type: 'global', value: data[key] };
                    newVars[`\${${key}}`] = { type: 'global', value: data[key] };
                });
                $scope.variables = {
                    ...newVars,
                    ...$scope.variables,
                };
            });
            DataikuAPI.projects.variables.get($stateParams.projectKey).success((data) => {
                const newVars = {};
                Object.keys(data.local).forEach(key => {
                    newVars[`variables["${key}"]`] = { type: 'local', value: data.local[key] };
                    newVars[`\${${key}}`] = { type: 'local', value: data.local[key] };
                });
                Object.keys(data.standard).forEach(key => {
                    newVars[`variables["${key}"]`] = { type: 'standard', value: data.standard[key] };
                    newVars[`\${${key}}`] = { type: 'standard', value: data.standard[key] };
                });
                $scope.variables = {
                    ...newVars,
                    ...$scope.variables,
                };
            });

            let helpers = [];
            CachedAPICalls.customFormulasReference.success(data => helpers = data);

            const columnTypeMapping = {
                string: ['String', 'icon-dku-string', 'cm-string'],
                int: ['Integer', 'icon-dku-hexa_view', 'cm-number'],
                double: ['Double', 'icon-dku-hexa_view', 'cm-number'],
                float: ['Float', 'icon-dku-hexa_view', 'cm-number'],
                tinyint: ['Tiny int (8 bits)', 'icon-dku-hexa_view', 'cm-number'],
                smallint: ['Small int (16 bits)', 'icon-dku-hexa_view', 'cm-number'],
                bigint: ['Long int (64 bits)', 'icon-dku-hexa_view', 'cm-number'],
                boolean: ['Boolean', 'icon-dku-true-false', 'cm-bool'],
                date: ['Date', 'icon-calendar', 'cm-date'],
                geopoint: ['Geo Point', 'icon-dku-globe', 'cm-date'],
                geometry: ['Geometry/Geography', 'icon-dku-globe', 'cm-date'],
                array: ['Array', 'icon-dku-array', 'cm-date'],
                object: ['Complex object', 'icon-dku-object', 'cm-date'],
                map: ['Map', 'icon-dku-map', 'cm-date'],
                unspecified: ['', 'icon-dku-column', 'cm-table']
            };

            const getColumnNames = () => {
                return $scope.columns.map(c => c.name || c);
            };

            const helperScrollHandler = (e) => {
                const elems = document.getElementsByClassName('helper-display');
                for(let i = 0; i < elems.length; i++) {
                    elems[i].style.top = e.target.scrollTop + 'px';
                }
            };
        
            const hintRenderer = (hint, value, index) => {
                return (elt) => {
                    if(!hint || hint === '') {
                        return;
                    }

                    let icon = 'icon-dku-function cm-function';
        
                    const helperElement = document.createElement('div');
                    helperElement.className = 'helper-display';
    

                    const helper = helpers.find(h => h.name === hint);
                    const helperFooter = '<div class="helper-tip">Hit tab to complete<div style="float: right;">Hit esc to hide</div></div>';
                    if(helper) {
                        let htmlTitle = `<div class="helper-title"><strong>${helper.name}(${helper.params}) ${helper.returns || ''}</strong></div>`
                        let htmlDescription = `<div class="helper-description"><p>${helper.description}</p>`;
                        if (helper.examples) {
                            htmlDescription += helper.examples.map((example) =>
                                `<div class="helper-example">
                                        <code>${helper.name}(${example.args.join(", ")})</code> returns <code>${example.result}</code>
                                    </div>`).join("");
                        }
                        htmlDescription += "</div>";
                        helperElement.innerHTML = htmlTitle + htmlDescription + helperFooter;
                    } else if(Object.keys($scope.variables).includes(hint)) {
                        const value = typeof $scope.variables[hint].value === 'object' ?
                                        JSON.stringify($scope.variables[hint].value, null, 2) :
                                        $scope.variables[hint].value;
                        helperElement.innerHTML = `<div class="helper-title">`
                                                        + ($scope.variables[hint].type ? `Scope: <strong>${$scope.variables[hint].type}</strong><br />` : '')
                                                        + `Value: <strong>${value}</strong>`
                                                        + `</div>`
                                                        + helperFooter;
                        icon = 'icon-dku-variable cm-variable';
                    } else if(getColumnNames().includes(hint)) {
                        const col = $scope.columns.find(c => c.name === hint || c === hint);
                        const ref = columnTypeMapping[col && col.type ? col.type : 'unspecified'] || ['icon-dku-string', 'cm-default'];
                        if(col) {
                            helperElement.innerHTML = `<div class="helper-title">`
                                                        + (ref[0] ? `Type: <strong>${ref[0]}</strong>` : '')
                                                        + (col.meaning ? `<br />Meaning: <strong>${col.meaning}</strong>` : '')
                                                        + (col.comment ? `<p>${col.comment}</p>` : '<p class="text-weak">No description provided.</p>')
                                                        + `</div>`
                                                        + helperFooter;
                        }
                        icon = `${ref[1]} ${ref[2]}`;
                    }
        
                    elt.innerHTML = `<i class="${icon}"></i>&nbsp;<strong>${hint.substr(0, value.length)}</strong>${hint.substr(value.length)}`;
                    elt.appendChild(helperElement);
        
                    if(index === 0) {
                        elt.parentElement.id = "qa_formula_auto_complete";
                        elt.parentElement.removeEventListener('scroll', helperScrollHandler);
                        elt.parentElement.addEventListener('scroll', helperScrollHandler);
                    }
                }
            }
        
            const autoCompleteHandler = (hint) => {
                const isColumn = getColumnNames().includes(hint.text);
                const isFunction = !isColumn && !Object.keys($scope.variables).includes(hint.text);
                
                // When column has a complex name, the autocompletion should be wrapped inside val('')
                if (isColumn && !hint.text.match(/^[a-z0-9_]+$/i)) {
                    const doc = $scope.cm.getDoc();
                    const cursor = doc.getCursor();
                    const leftPart = cm.getLine(cursor.line).substr(0, cursor.ch - hint.text.length);
                    if(leftPart.endsWith('val(')) {
                        doc.setSelection({line: cursor.line, ch: cursor.ch - hint.text.length});
                        doc.replaceSelection('"');
                        doc.setSelection({line: cursor.line, ch: cursor.ch + 1 });
                        doc.replaceSelection('"');
                    } else if(leftPart.endsWith('val("') || leftPart.endsWith('val(\'')) {
                        doc.setSelection({line: cursor.line, ch: cursor.ch - hint.text.length});
                        doc.setSelection({line: cursor.line, ch: cursor.ch });
                    } else {
                        doc.setSelection({line: cursor.line, ch: cursor.ch - hint.text.length});
                        doc.replaceSelection('val("');
                        doc.setSelection({line: cursor.line, ch: cursor.ch + 5 });
                        doc.replaceSelection('")');
                    }
                }
                else if(isFunction) {
                    const doc = $scope.cm.getDoc();
                    const cursor = doc.getCursor();
                    const line = cm.getLine(cursor.line);
                    if (line.length < cursor.ch || line[cursor.ch] !== '(') {
                        doc.setSelection({ line: cursor.line, ch: cursor.ch });
                        doc.replaceSelection('()');
                    }
                    cursor.ch = cursor.ch + 1;
                    doc.setCursor(cursor);
                } else if (!isColumn && !isFunction && hint.text.endsWith('}')) {
                    const doc = $scope.cm.getDoc();
                    const cursor = doc.getCursor();
                    const nextChar = cm.getLine(cursor.line).substr(cursor.ch, 1);
                    if(nextChar === '}') {
                        doc.replaceRange('', { ...cursor }, { line: cursor.line, ch: cursor.ch + 1 });
                    }
                }

                $scope.validateGRELExpression();
            }

            const getLineQuoteState = (line, pos) => {
                let quoteOpened = false;
                let doubleQuoteOpened = false;
                for(let i = 0; i < pos - 1; i++) {
                    if(line[i] == "\\") {
                        i ++;
                    } else if(line[i] === "'" && !doubleQuoteOpened) {
                        quoteOpened = !quoteOpened;
                    } else if(line[i] === '"' && !quoteOpened) {
                        doubleQuoteOpened = !doubleQuoteOpened;
                    }
                }
                return { quoteOpened, doubleQuoteOpened };
            }

            const autoClosingPairs = {'(': ')', '"': '"', "'": "'", '[': ']', '{': '}'};
            const autoCloseCharacter = (cm, key, event) => {
                const doc = cm.getDoc();
                const cursor = doc.getCursor();
                const line = cm.getLine(cursor.line);
                const nextChar = line[cursor.ch];
                const selection = doc.getSelection();
        
                if(nextChar === key) {
                    doc.replaceRange('', { ...cursor }, { line: cursor.line, ch: cursor.ch + 1 });
                    return;
                }

                if(selection.length === 0 && (key === '"' || key === "'") && ![undefined, ']', ')', '}'].includes(nextChar)) {
                    return;
                }

                // Check if we are not currently inside a string definition
                const quoteStatus = getLineQuoteState(line, cursor.ch);
                if(!quoteStatus.doubleQuoteOpened && !quoteStatus.quoteOpened) {
                    if(selection.length > 0) {
                        const endCursor = doc.getCursor(false);
                        doc.replaceSelection(key + selection + autoClosingPairs[key]);
                        doc.setCursor({...endCursor, ch: endCursor.ch + 2});
                    } else {
                        doc.replaceSelection(key + autoClosingPairs[key]);
                        doc.setCursor({...cursor, ch: cursor.ch + 1});
                    }
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        
            const autoCloseCharacterRemover = (cm) => {
                const doc = cm.getDoc();
                const cursor = doc.getCursor();
                const line = cm.getLine(cursor.line);
                const deletedChar = line[cursor.ch -1];
                const nextChar = line[cursor.ch];
        
                // Check if we are not currently inside a string definition
                const quoteStatus = getLineQuoteState(line, cursor.ch);
                if(quoteStatus.doubleQuoteOpened || quoteStatus.quoteOpened) {
                    return;
                }
        
                if(autoClosingPairs[deletedChar] && autoClosingPairs[deletedChar] === nextChar) {
                    doc.replaceRange('', { ...cursor }, { line: cursor.line, ch: cursor.ch + 1 });
                }
            }

            const getTokenBeforeCursor = (cm) => {
                const cursor = cm.doc.getCursor();
                const tokens = cm.getLineTokens(cursor.line);
                let token = [];
                let parenthese = [];
                let isAppliedToColumn = false;
                for(let i = 0; i < tokens.length; i++) {
                    if(tokens[i].end < cursor.ch + 1) {
                        if(tokens[i].type === 'builtin') {
                            token.push(tokens[i]);
                            if(i > 0 && tokens[i-1].string === '.') {
                                isAppliedToColumn = true;
                            } else {
                                isAppliedToColumn = false;
                            }
                        } else if(tokens[i].string === '(') {
                            parenthese.push(tokens[i].end);
                        } else if(tokens[i].string === ')') {
                            token.pop();
                            parenthese.pop();
                        }
                    }
                }
                if(token.length > 0 && parenthese.length > token.length - 1) {
                    $scope.tooltip.tokenStart = parenthese[token.length - 1];
                    return {...token[token.length - 1], isAppliedToColumn };
                }
                return  null;
            };

            const editorOptions = {
                value: $scope.expression || "",
                mode:'text/grel',
                theme:'elegant',
                variables: getColumnNames,
                lineNumbers : false,
                lineWrapping : true,
                autofocus: true,
                hintOptions: {
                    hint: (editor) => {
                        const grelWordHints = CodeMirror.hint.grel($scope.cm, { columns: getColumnNames, variables: Object.keys($scope.variables), completeSingle: false });
                        const words = grelWordHints.list;

                        let cursor = editor.getCursor();
                        let curLine = editor.getLine(cursor.line);
                        let start = cursor.ch;
                        let end = start;
                        while (end < curLine.length && /[\w$]/.test(curLine.charAt(end))) ++end;
                        while (start && (/[\w\.$]/.test(curLine.charAt(start - 1)) || curLine.charAt(start - 1) == '{')) --start;
        
                        let curWord = start !== end ? curLine.slice(start, end) : '';
                        // The dot should only be considered a token separator when outside of the ${...} variable syntax
                        const firstDot = curWord.indexOf('.');
                        if(!curWord.startsWith('$') && firstDot > -1) {
                            curWord = curWord.substr(firstDot + 1);
                            start += firstDot + 1;
                        }

                        const list = (!curWord ? words : words.filter(word => {
                            return word.toLowerCase().startsWith(curWord.toLowerCase());
                        }))
                        list.sort((a, b) => {
                            const malusA = Object.keys($scope.variables).includes(a) ? 2 : getColumnNames().includes(a) ? 1 : 0;
                            const malusB = Object.keys($scope.variables).includes(b) ? 2 : getColumnNames().includes(b) ? 1 : 0;
                            if(malusA === malusB)
                                return a - b;
                            return malusA - malusB;
                         });
        
                        const data = {
                            list: list.map((item, index) => ({ text: item, render: hintRenderer(item, curWord, index)})),
                            from: CodeMirror.Pos(cursor.line, start),
                            to: CodeMirror.Pos(cursor.line, end)
                        };
                        CodeMirror.on(data, 'pick', autoCompleteHandler);
                            
                        return data;
                    },
                    completeSingle: false
                }
            };

            const prevCursor = { line: 0, ch: 0 };
            const textarea = element.find('textarea')[0];
            const cm = CodeMirror.fromTextArea(textarea, editorOptions);

            $scope.$watch('expression', (newValue, oldValue) => {
                const cursor = cm.doc.getCursor();
                cm.setValue(newValue || '');
                cm.setCursor(cursor);
            });

            $scope.cm = cm;
            cm.on("keydown", function(cm, evt) {
                if(evt.key === "Backspace") { // Backspace
                    autoCloseCharacterRemover(cm);
                }
                else if(Object.keys(autoClosingPairs).includes(evt.key)) {
                    autoCloseCharacter(cm, evt.key, evt);
                }
            });

            cm.on("keyup", function(cm, evt) {
                /* Ignore tab, esc, and navigation/arrow keys */
                if (evt.key === "Tab" || evt.key === 'Escape' || (evt.keyCode>= 33 && evt.keyCode <= 40)) {
                    if(evt.key === "Tab") {
                        // We force the expression validation on tab, as autocompletion does not trigger smart change
                        $scope.validateGRELExpression();
                    }
                    CodeMirror.signal(cm, "endCompletion", cm);
                }
                else if(evt.key !== "Enter") {
                    CodeMirror.commands.autocomplete(cm, null, {
                        columns: $scope.columns,
                        completeSingle: false
                    });
                }
            });

            cm.on('cursorActivity', () => {
                const parent = cm.getTextArea().closest('.editor-tooltip-anchor');
                if(!parent) {
                    return;
                }

                const coords = cm.cursorCoords();
                $scope.tooltip.left = coords.left;
                $scope.tooltip.top = coords.top + 16;
                $scope.tooltip.shown = false;

                const doc = cm.getDoc();
                const cursor = doc.getCursor();
                const token = getTokenBeforeCursor(cm);
                const leftPart = cm.getLine(cursor.line).substr(0, cursor.ch);
                if(token && !leftPart.endsWith('val("') && !leftPart.endsWith('val(\'')) {
                    const helper = helpers.find(h => h.name === token.string);
                    if(helper) {
                        $scope.tooltip.shown = true;
                        $scope.tooltip.name = helper.name;
                        $scope.tooltip.arguments = helper.params;
                        $scope.tooltip.description = helper.description;
                        $scope.tooltip.examples = helper.examples;
                        $scope.tooltip.line = cm.getLine(cursor.line);
                        $scope.tooltip.cursor = cursor.ch;
                        $scope.tooltip.applied = token.isAppliedToColumn;
                    }
                }

                // We do not want to auto display the autocomplete hinter if the user is just moving to the next line
                // Or if the completion has just ended
                if (cursor.line === prevCursor.line && cm.state.completionActive !== null) {
                    CodeMirror.commands.autocomplete(cm, null, {
                        columns: $scope.columns,
                        completeSingle: false
                    });
                }
                safeApply($scope);

                prevCursor.ch = cursor.ch;
                prevCursor.line = cursor.line;
            });

            const hasTokenOfType = (type) => {
                const lineCount = $scope.cm.lineCount();
                for(let i = 0; i < lineCount; i++) {
                    if($scope.cm.getLineTokens(i).find(t => t.type === type)) {
                        return true;
                    }
                }
                return false;
            };
        
            let errorMarker = null;
            const highlightOffset = (offset) => {
                let current = 0;
                const lineCount = $scope.cm.lineCount();
                for(let i = 0; i < lineCount; i++) {
                    const line = $scope.cm.doc.getLine(i);
                    if(current + line.length > offset) {
                        errorMarker = $scope.cm.doc.markText(
                            { line: i, ch: offset - current },
                            { line: i, ch: offset - current + 1 },
                            { className: 'error-hint', clearOnEnter: true }
                        );
                        return;
                    }
                    current += line.length + 1; // CrLf is counted as 1 offset
                }
            }
        
            $scope.validateGRELExpression = () => {
                const expr = cm.getValue();
                $scope.examples = null;
        
                const hasError = hasTokenOfType('error');
                if(hasError) {
                    if($scope.onValidate) {
                        $scope.onValidate({ valid: false, error: "it has some unknown tokens", data: [] });
                    }
                    return;
                }
        
                if($scope.validator) {
                    $scope.validator(expr).success((data) => {
                        if($scope.onValidate) {
                            $scope.onValidate({ valid: data.ok, error: data.message, data });
                        }
    
                        if(errorMarker != null) {
                            errorMarker.clear();
                        }
            
                        const matches = (data.message || '').match(/at offset (\d+)/i);
                        if(matches != null) {
                            highlightOffset(matches[1])
                        }
                    }).error(setErrorInScope.bind($scope));
                }
            };
            const debouncedValidateGrelExpression = Debounce().withDelay(0, 200).wrap($scope.validateGRELExpression);

            cm.on('change', () => {
                debouncedValidateGrelExpression();
                $scope.expression = cm.getValue();
                if($scope.onExpressionChange) {
                    $scope.onExpressionChange($scope.expression);
                }
            });
        }       
    };
});


app.controller('FormulaAwareProcessorController', function($scope, $stateParams, $rootScope, DataikuAPI,
               CreateCustomElementFromTemplate, ShakerPopupRegistry) {

    $scope.editing = {}
    $scope.columns = [];

    const canGetColumnDetails = () => {
        const stepPosition = $scope.shaker.steps.indexOf($scope.step);

        // If the current step is the last one or if it is in preview mode or if the steps after it are disabled.
        return $scope.shaker && $scope.shaker.steps && $scope.shaker.steps[$scope.shaker.steps.length - 1] === $scope.step 
            || $scope.step.preview === true
            || (!$scope.step.disabled && $scope.shaker.steps.slice(stepPosition + 1).every(step => step.disabled))
    } 

    const computeColumns = () => {
        if (canGetColumnDetails()) {
            $scope.columns = $scope.quickColumns.map(c => ({
                ...(c.recipeSchemaColumn ? c.recipeSchemaColumn.column : {}),
                name: c.name,
                meaning: c.meaningLabel || '',
                comment: c.comment || ''
            }));
        } else {
            $scope.columns = $scope.step.$stepState.change ? $scope.step.$stepState.change.columnsBeforeStep : [];
        }
    }

    const stopWatchingForColumnsCompute = $scope.$watch('[quickColumns, step.preview, shaker.steps]', () => {
        computeColumns();
    });

    $scope.expressionValidator = (expression) => {
    	const stepPosition = $scope.findStepId($scope.step);
        return DataikuAPI.shakers.validateExpression(
            $stateParams.projectKey,
            $scope.inputDatasetProjectKey,
            $scope.inputDatasetName,
            $scope.shakerHooks.shakerForQuery(),
            $scope.requestedSampleId,
            expression,
            "create",
            "__output__",
            stepPosition.id,
            stepPosition.subId || 0,
            stepPosition.depth);
    };

    $scope.fixupFormula = (expression) => {
        const stepPosition = $scope.findStepId($scope.step);
        return DataikuAPI.shakers.fixExpression(
            $stateParams.projectKey,
            $scope.inputDatasetProjectKey,
            $scope.inputDatasetName,
            $scope.shakerHooks.shakerForQuery(),
            $scope.requestedSampleId,
            expression,
            "create",
            "__output__",
            stepPosition.id,
            stepPosition.subId || 0,
            stepPosition.depth).then(data => {
                $scope.editing.expression = data.data
            }, setErrorInScope.bind($scope));
    }

    $scope.onValidate = (result) => {
        $scope.grelExpressionValid = result.valid;
        $scope.grelExpressionError = result.error;
        $scope.grelExpressionData = result.data;

        // If everything is empty, we should not render the preview
        if(result.data.table
            && result.data.table.colNames.length === 1
            && result.data.table.rows.filter(r => r.data[0] !== null).length < 1) {
            $scope.grelExpressionData.table = undefined;
        }
    };

    $scope.parentDismiss = function() {
        $rootScope.$broadcast("dismissModalInternal_");
        $scope.modalShown = false;
    }
    $scope.$on("dismissModals", $scope.parentDismiss);
    $scope.grelExpressionError = false;
    $scope.grelExpressionValid = false;

    $scope._edit = function(expression){
        if ($scope.modalShown) {
            $scope.parentDismiss();
        } else {
            ShakerPopupRegistry.dismissAllAndRegister($scope.parentDismiss);
            $scope.modalShown = true;
            CreateCustomElementFromTemplate("/templates/shaker/formula-editor.html", $scope, null, function(newScope) {
                $scope.editing.expression = expression;
            }, $scope.customFormulaEdition.displayCustomFormula);
        }
    }

    $scope.hooks= {
        ok : function(){
            throw Error("not implemented");
        }
    }

    $scope.$on("$destroy", stopWatchingForColumnsCompute);
});


app.controller('CreateColumnWithGRELController', function($scope, $controller) {
    $controller("FormulaAwareProcessorController", {$scope:$scope});

    if (angular.isUndefined($scope.step.params.column)) {
        $scope.step.params.column = "newcolumn_expression";
    }
    $scope.mode = "create";

    $scope.hooks.ok = function() {
        $scope.step.params.expression = $scope.editing.expression;
        $scope.editing.expression = null;
        $scope.checkAndRefresh();
        $scope.parentDismiss();
    }

    $scope.edit = function(){
        $scope._edit(angular.copy($scope.step.params.expression));
    }

    $scope.storageTypes = [
    	[null, 'None'],
        [{name:'foo', type:'string'}, 'String'],
        [{name:'foo', type:'int'}, 'Integer'],
        [{name:'foo', type:'double'}, 'Double'],
        [{name:'foo', type:'float'}, 'Float'],
        [{name:'foo', type:'tinyint'}, 'Tiny int (8 bits)'],
        [{name:'foo', type:'smallint'}, 'Small int (16 bits)'],
        [{name:'foo', type:'bigint'}, 'Long int (64 bits)'],
        [{name:'foo', type:'boolean'}, 'Boolean'],
        [{name:'foo', type:'date'}, 'Date'],
        [{name:'foo', type:'geopoint'}, "Geo Point"],
        [{name:'foo', type:'geometry'}, "Geometry/Geography"]
    ];

});

app.controller("CustomJythonProcessorController", function($scope, Assert, DataikuAPI, WT1, $stateParams, TopNav, PluginConfigUtils, Logger){
    $scope.loadedDesc = $scope.appConfig.customJythonProcessors.find(x => x.elementType == $scope.step.type);
    Assert.inScope($scope, 'loadedDesc');
    $scope.pluginDesc = $scope.appConfig.loadedPlugins.find(x => x.id == $scope.loadedDesc.ownerPluginId);
    Assert.inScope($scope, 'pluginDesc');

    // Make a copy to play with roles
    $scope.desc = angular.copy($scope.loadedDesc.desc);
    $scope.desc.params.forEach(function(param) {
        if (param.type == "COLUMNS" || param.type == "COLUMN") {
            param.columnRole = "main";
        }
    });

    if (!$scope.step.params) {
        $scope.step.params = {}
    }
    if (!$scope.step.params.customConfig){
        $scope.step.params.customConfig = {}
    }

    var getCurrentColumns = function() {
        // step info are loaded asynchronously
        if ($scope.step.$stepState.change) {
            return $scope.step.$stepState.change.columnsBeforeStep.map(colName => ({name: colName, type: 'STRING'}));
        } else {
            return [];
        }
    }

    $scope.columnsPerInputRole = {
        "main" : []
    };

    $scope.$watch("step", function(nv, ov) {
        if (nv && nv.$stepState) {
            $scope.columnsPerInputRole = {
                main: getCurrentColumns()
            };
        }
    }, true);

    PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.step.params.customConfig);
});


app.controller('FilterOnCustomFormulaController', function($scope, $controller, $stateParams, $rootScope, DataikuAPI, CreateCustomElementFromTemplate, ShakerPopupRegistry) {
    $controller("FormulaAwareProcessorController", {$scope:$scope});

    $scope.hooks.ok = function() {
        $scope.step.params.expression = $scope.editing.expression;
        $scope.editing.expression = null;
        $scope.checkAndRefresh();
        $scope.parentDismiss();
    }

    $scope.edit = function(){
        $scope._edit(angular.copy($scope.step.params.expression));
    }
});


app.controller('ClearOnCustomFormulaController', function($scope, $controller, $stateParams, $rootScope,
               DataikuAPI, CreateCustomElementFromTemplate, ShakerPopupRegistry) {
    $controller("FormulaAwareProcessorController", {$scope:$scope});

    $scope.hooks.ok = function() {
        $scope.step.params.expression = $scope.editing.expression;
        $scope.editing.expression = null;
        $scope.checkAndRefresh();
        $scope.parentDismiss();
    }

    $scope.edit = function(){
        $scope._edit(angular.copy($scope.step.params.expression));
    }
});


app.controller('FlagOnCustomFormulaController', function($scope, $controller, $stateParams, $rootScope,
               DataikuAPI, CreateCustomElementFromTemplate, ShakerPopupRegistry) {
    $controller("FormulaAwareProcessorController", {$scope:$scope});

    $scope.hooks.ok = function() {
        $scope.step.params.expression = $scope.editing.expression;
        $scope.editing.expression = null;
        $scope.checkAndRefresh();
        $scope.parentDismiss();
    }

    $scope.edit = function(){
        $scope._edit(angular.copy($scope.step.params.expression));
    }
});


app.controller('FilterAndFlagProcessorController', function($scope) {
    // don't show the generic input for clearColumn if the processor already declares a parameter called clearColumn
    $scope.showClearColumn = !$scope.processor.params.some(function(param) { return param.name == 'clearColumn'; });

    $scope.onActionChange = function() {
        // if (['FLAG', 'KEEP_ROW'].indexOf($scope.step.params['action']) != -1) {
        //     $scope.step.params.appliesTo = 'SINGLE_COLUMN';
        //     $scope.$parent.$parent.$parent.appliesToDisabled = true;
        // } else {
        //     $scope.$parent.$parent.$parent.appliesToDisabled = false;
        // }

        $scope.checkAndRefresh();
    }

    if ($scope.processor.filterAndFlagMode == "FLAG") {
        $scope.step.params.action = "FLAG";
    }
});


app.controller('AppliesToProcessorController', function($scope) {
    $scope.clearEmptyColumns = function() {
        if ($scope.step.params.columns.length == 1 && $scope.step.params.columns[0] == '') {
            $scope.step.params.columns = [];
        }
    }
});


app.controller('ConfigureSamplingController', function($scope, DataikuAPI, $stateParams, $timeout,
               WT1, CreateModalFromTemplate, SamplingData, DatasetUtils) {
    $scope.getPartitionsList = function() {
        return DataikuAPI.datasets.listPartitionsWithName($scope.inputDatasetProjectKey, $scope.inputDatasetName)
            .error(setErrorInScope.bind($scope))
            .then(function(ret) { return ret.data; })
    };

    $scope.SamplingData = SamplingData;

    $scope.showFilterModal = function() {
        var newScope = $scope.$new();
        if ($scope.inputDatasetName) {
            DataikuAPI.datasets.get($scope.inputDatasetProjectKey, $scope.inputDatasetName, $stateParams.projectKey)
            .success(function(data){
                newScope.dataset = data;
                newScope.schema = data.schema;
                newScope.filter = $scope.shaker.explorationSampling.selection.filter;
                CreateModalFromTemplate('/templates/recipes/fragments/filter-modal.html', newScope);
            }).error(setErrorInScope.bind($scope));
        } else if ($scope.inputStreamingEndpointId) {
            DataikuAPI.streamingEndpoints.get($scope.inputDatasetProjectKey, $scope.inputStreamingEndpointId)
            .success(function(data){
                newScope.dataset = data;
                newScope.schema = data.schema;
                newScope.filter = $scope.shaker.explorationSampling.selection.filter;
                CreateModalFromTemplate('/templates/recipes/fragments/filter-modal.html', newScope);
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.datasetIsSQL = function() {
        return $scope.dataset_types && $scope.dataset && $scope.dataset_types[$scope.dataset.type] && $scope.dataset_types[$scope.dataset.type].sql;
    };

    $scope.datasetIsSQLTable = function() {
        return $scope.datasetFullInfo && DatasetUtils.isSQLTable($scope.datasetFullInfo.dataset);
    };

    $scope.datasetSupportsReadOrdering = function() {
        return $scope.datasetFullInfo && DatasetUtils.supportsReadOrdering($scope.datasetFullInfo.dataset);
    };

    $scope.save = function() {
        $scope.shaker.explorationSampling._refreshTrigger++;
        $scope.forgetSample();
        $scope.autoSaveForceRefresh();
    };
});

app.controller('DateRangeShakerController', function($scope, $timeout, DataikuAPI, Debounce) {
    $scope.dateRelativeFilterPartsLabel = 'Year';
    $scope.dateRelativeFilterComputedStart = '-';
    $scope.dateRelativeFilterComputedEnd = '';
    $scope.displayed = { values: [] };
    $scope.valuesCount = 0;
    // Firefox always displays the milliseconds in the time picker, so give more space to the time picker
    $scope.timeInputStyle = { 'width': (navigator.userAgent.includes("Gecko/") ? '144px' : '104px') };

    if($scope.step.params.values) {
        $scope.displayed.values = [...$scope.step.params.values];
    }

    if ($scope.step.params.min) {
        // If date was written as UTC (old format), convert it to the corresponding time zone
        if ($scope.step.params.min.slice(-1).toUpperCase() === "Z") {
            $scope.step.params.min = formatDateToISOLocalDateTime(convertDateToTimezone(new Date($scope.step.params.min), $scope.step.params.timezone_id));
        }
        $scope.displayed.min = new Date($scope.step.params.min);
        $scope.displayed.min.setSeconds($scope.displayed.min.getSeconds(), 0);
    }

    if ($scope.step.params.max) {
        // If date was written as UTC (old format), convert it to the corresponding time zone
        if ($scope.step.params.max.slice(-1).toUpperCase() === "Z") {
            $scope.step.params.max = formatDateToISOLocalDateTime(convertDateToTimezone(new Date($scope.step.params.max), $scope.step.params.timezone_id));
        }
        $scope.displayed.max = new Date($scope.step.params.max);
        $scope.displayed.max.setSeconds($scope.displayed.max.getSeconds(), 0);
    }

    // This is a fix for firefox, not firing blur event if input cleared with cross icon
    $scope.updateBoundariesWithDelay = function(boundary) {
        setTimeout($scope.updateBoundaries, 200, boundary);
    }

    $scope.updateBoundaries = function(boundary) {
        if (boundary === 'min') {
            if ($scope.displayed.min) {
                $scope.step.params.min = formatDateToISOLocalDateTime($scope.displayed.min);
            } else {
                $scope.step.params.min = null;
            }
        } else if (boundary === 'max') {
            if ($scope.displayed.max) {
                $scope.step.params.max = formatDateToISOLocalDateTime($scope.displayed.max);
            } else {
                $scope.step.params.max = null;
            }
        }
        $scope.checkAndRefresh();
    };

    const computeRelativeDateIntervalDebounced = Debounce().withDelay(100,100).withScope($scope).wrap(function() {
        DataikuAPI.shakers.computeRelativeDateInterval({
            part: $scope.step.params.part,
            option: $scope.step.params.option,
            offset: $scope.step.params.option === 'NEXT' ? $scope.step.params.relativeMax : $scope.step.params.relativeMin
        }).success(function(interval) {
            $scope.dateRelativeFilterComputedStart = interval.start;
            $scope.dateRelativeFilterComputedEnd = interval.end;
        }).error(function() {
            $scope.dateRelativeFilterComputedStart = '-';
            $scope.dateRelativeFilterComputedEnd = '-';
        });
    });
    const refreshRelativeIntervalHint = function() {
        if ($scope.step.params.filterType === 'RELATIVE') {
            computeRelativeDateIntervalDebounced();
        }
    }

    $scope.$watchGroup(["step.params.filterType", "step.params.part", "step.params.option"], refreshRelativeIntervalHint);
    $scope.$watch("step.params.relativeMin", () => {
        if ($scope.step.params.option === 'LAST') {
            refreshRelativeIntervalHint();
        }
    });
    $scope.$watch("step.params.relativeMax", () => {
        if ($scope.step.params.option === 'NEXT') {
            refreshRelativeIntervalHint();
        }
    });

    $scope.$watch("displayed.values", function() {
        $scope.step.params.values = [...$scope.displayed.values];
    });

    $scope.$watch("step.params.timezone_id", $scope.updateBoundaries);

    $scope.$watch("step.params.filterType", function(nv) {
        if (nv === "RELATIVE" && $scope.step.params.part === "INDIVIDUAL") {
            $scope.step.params.part = "YEAR";
        }
    });

    $scope.$watch("step.params.part", function(nv) {
        $scope.dateRelativeFilterPartsLabel = {
            YEAR: "Year",
            QUARTER_OF_YEAR: "Quarter",
            MONTH_OF_YEAR: "Month",
            DAY_OF_MONTH: "Day",
            HOUR_OF_DAY: "Hour"
        }[nv];
    });
});

app.controller('UnfoldController', function($scope){

    $scope.overflowActions = [
        ["KEEP", "Keep all columns"],
        ["WARNING", "Add warnings"],
        ["ERROR", "Raise an error"],
        ["CLIP", "Clip further data"],
    ];

    $scope.overflowActionsDesc = [
        ["Will keep all the created columns. Warning, this may create a huge amount of columns and slow the whole computation."],
        ["Will raise warning during the computation but continues to process all the columns. It may create a huge amount of columns and slow the whole computation."],
        ["Will raise an error and make the computation fail as soon as the maximum number of created columns is exceeded."],
        ["Will silently drop the remaining columns when the maximum number of columns is reached."]
    ];

    $scope.modifyOverflowAction = function() {
        if ($scope.step.params.limit === 0) {
            $scope.step.params.overflowAction = "KEEP";
        }
    };

});

}());

(function(){
    'use strict';

    /* Misc additional directives for Shaker */

    var app = angular.module('dataiku.shaker.misc', ['dataiku.filters', 'platypus.utils']);

    app.directive('dkuListTypeaheadV2', function($parse){
        return {
            templateUrl: '/templates/widgets/dku-list-typeahead-v2.html',
            scope: {
                model: '=ngModel',
                onChange: '&',
                addLabel: '@',
                validate: '=?',
                keepInvalid: '=?',
                typeAhead: '='
            },
            link: function(scope, el, attrs) {
                scope.richModel = {}

                scope.$watch("model", function(nv){
                    if (!nv) return;
                    scope.richModel = scope.model.map(function(x){
                        return { value  : x }
                    });
                }, true);

                if (scope.onChange) {
                    scope.callback = function(){
                        // Update in place instead of replacing, important because
                        // we don't want this to trigger another watch cycle in the
                        // listForm, which watches items non-deeply
                        scope.model.length = 0;
                        scope.richModel.forEach(function(x){
                            scope.model.push(x.value);
                        });
                        scope.onChange.bind(scope)({model : scope.model});
                    }
                }
                if (scope.typeAhead) {
                    scope.$watch("model", function() {
                        scope.remainingSuggests = listDifference(scope.typeAhead, scope.model);
                    }, true);
                }
            }
        };
    });
    
    app.directive('meaningSelect', function(ContextualMenu) {
    	return {
    		restrict: 'A',
    		template: '<div class="select-button">'
    					+'<button ng-click="openMeaningMenu($event)" class="btn  dku-select-button btn--secondary">'
                            +'<span class="filter-option pull-left">{{ngModel|meaningLabel}}</span>'
							+'&nbsp;'
							+'<span class="caret"></span>'
    					+'</button>'
    				 +'</div>',
            scope: {
                ngModel: '=',
                appConfig: '='
            },
            link: function($scope, element, attrs) {
    			$scope.menuState = {};
                $scope.meaningMenu = new ContextualMenu({
                    template: "/templates/shaker/select-meaning-contextual-menu.html",
                    cssClass : "column-header-meanings-menu",
                    scope: $scope,
                    contextual: false,
                    onOpen: function() {
                        $scope.menuState.meaning = true;
                    },
                    onClose: function() {
                        $scope.menuState.meaning = false;
                    }
                });
                $scope.openMeaningMenu = function($event) {
                    $scope.meaningMenu.openAtXY($event.pageX, $event.pageY);
                };

	            $scope.setMeaning = function(meaningId) {
                    $scope.ngModel = meaningId;
                    $(element).trigger('change');
	            };
    		}
    	}
    });

    app.directive('nextOnEnter', function() {
        return {
            score: true,
            priority: 90,
            restrict: 'A',
            link: function(scope, el, attrs) {
                var form = el[0].form;
                $(el).keyup(function (e) {
                    if (e.keyCode === 13) {
                        // on enter, we behave like for tab.
                        // and focus the next element of the form.
                        var tabbables = $(form).find(":tabbable");
                        var elId = tabbables.index(el);
                        if ( (elId >= 0) && (elId < tabbables.length -1) ) {
                            tabbables[elId+1].focus();
                        }
                        else {
                            // reached the last element... Just blur.
                            el.blur();
                        }
                    }
                });
            }
        };
    });
    app.directive('blurOnEnter', function() {
        return {
            score: true,
            priority: 90,
            restrict: 'A',
            link: function(scope, el, attrs) {
                var form = el[0].form;
                $(el).keyup(function (e) {
                    if (e.keyCode === 13) {
                            el.blur();
                    }
                });
            }
        };
    });
    app.directive('blurOnEnterAndEsc', function() {
        return {
            score: true,
            priority: 90,
            restrict: 'A',
            link: function(scope, el, attrs) {
                var form = el[0].form;
                $(el).keyup(function (e) {
                    if (e.keyCode === 13 || e.keyCode === 27) {
                            el.blur();
                    }
                });
            }
        };
    });

    app.directive('shakerProcessorStep', function($filter, CachedAPICalls, ShakerProcessorsInfo, ShakerProcessorsUtils){
        return {
            templateUrl: '/templates/shaker/processor-step.html',
            replace: true,
            /* We have to use prototypal inheritance scope instead of isolate scope because of bug
            https://github.com/angular/angular.js/issues/1941
            *
            * And also because we access a lot of the scope
            *
            * Requires in scope:
            *  - step
            *  - columns (array[string])
            *  - $index
            */
            scope:true,
            link: function(scope, element, attrs){
                // TODO: also linked to the isolate scope issue

                // at instantiation, always scroll to element
                $(element).find(".content").get(0).scrollIntoView(true);

                scope.remove = function(step) {
                    $('.processor-help-popover').popover('hide');//hide any displayed help window
                    scope.removeStep(step.step);
                };
                
                scope.deleteHelper = function(obj, key) {
                    delete obj[key];
                };

                scope.isStepActive = function() {
                	return scope.step == scope.currentStep;
                }

                /**
                 * This is the method called by all forms when a value is changed by the user.
                 * It triggers validation of the step, and, if the step is valid, the refresh.
                 *
                 * This handles a special case: processors that are "new", i.e. that have never been valid.
                 * For them, we don't display their 'in-error' state while they have not been valid at least
                 * once
                 */
                scope.checkAndRefresh = function() {
                    if (!scope.step.$stepState) {
                        scope.step.$stepState = {};
                    }
                    const state = scope.step.$stepState;

                    state.frontError = scope.validateStep(scope.step);

                    if (state.frontError && state.isNew){
                        // Don't do anything for a new processor that is still invalid
                    } else if (!state.frontError && state.isNew) {
                        // No error in new processor -> so it's not new anymore, and we can refresh
                        state.isNew = false;
                        scope.autoSaveAutoRefresh();
                    } else if (state.frontError && !state.isNew) {
                        // Error in non-new processor: Don't refresh
                    } else if (!state.frontError && !state.isNew) {
                        // No error in non-new processor -> the 'normal' case
                        scope.autoSaveAutoRefresh();
                    }
                };

                CachedAPICalls.processorsLibrary.success(function(processors){
                    scope.processors = processors;
                    scope.processor = $filter('processorByType')(scope.processors, scope.step.type);

                    var e = ShakerProcessorsInfo.get(scope.step.type);
                    if (angular.isDefined(e) && angular.isDefined(e.postLinkFn)){
                        e.postLinkFn(scope, element);
                    }

                    scope.$watch("step", function(step, ov) {
                        if (!step.$stepState) {
                            step.$stepState = {};
                        }

                        step.$stepState.frontError = scope.validateStep(scope.step);

                        scope.description = ShakerProcessorsUtils.getStepDescription(scope.processor, step.type, step.params);
                        scope.icon = ShakerProcessorsUtils.getStepIcon(step.type, step.params);
                    }, true);
                });

                scope.types = Object.keys(scope.appConfig.meanings.labelsMap);
            }
        };
    });

    app.directive('shakerGroupStep', function($filter, CachedAPICalls, Fn, $timeout){
        return {
            templateUrl: '/templates/shaker/group-step.html',
            replace: true,
            /*
            * Requires in scope:
            *  - step
            *  - columns (array[string])
            *  - $index
            */
            scope:true,
            link: function(scope, element, attrs){
                scope.remove = function(step) {
                    $('.processor-help-popover').popover('hide');//hide any displayed help window
                    scope.removeStep(step.step);
                };

                scope.hasMatchingSteps = function() {
                    return scope.step.steps.filter(Fn.prop('match')).length > 0;
                }

                scope.isGroupActive = function() {
                   return !scope.isCollapsed() || (scope.hasMatchingSteps() && !scope.step.closeOnMatch);
                }

                scope.toggleGroup = function() {
                    if (scope.isCollapsed() && scope.isGroupActive()) {
                        scope.step.closeOnMatch = !scope.step.closeOnMatch;
                    } else {
                        scope.toggle();
                    }
                }

                scope.$on('openShakerGroup', function(e, step) {
                    if (scope.step === step && scope.isCollapsed()) {
                        scope.toggle();        
                    }
                });

                scope.$watch('groupChanged.addedStepsTo', function() {
                    if (scope.groupChanged.addedStepsTo === scope.step) {
                        if (!scope.isGroupActive()) {
                            scope.toggleGroup();
                        }
                        scrollToStep();
                    } else if (scope.groupChanged.removedStepsFrom.indexOf(scope.step) > -1 && scope.step.steps.length === 0) {
                        if (scope.isGroupActive()) {
                            scope.toggleGroup();
                        }
                    }
                });

                scrollToStep();

                function scrollToStep() {
                    // at instantiation, always scroll to element and start editing
                    $timeout(function() {
                        $(element).get(0).scrollIntoView({
                            behavior: 'auto',
                            block: 'center',
                            inline: 'center'
                        });
                    });
                }


            }
        };
    });


    app.directive('shaker', function($timeout) {
        return {
            restrict: 'C',
            link: function(scope, element, attrs){
                scope.$watch('shaker.explorationFilters.length', function(nv, ov){
                    if (nv && nv > 1) {
                        scope.$broadcast('tabSelect', 'filters');
                    }
                });
                scope.$watch('shaker.steps.length', function(nv, ov){
                    scope.$broadcast('tabSelect', 'script');
                    if (nv > ov) {
                        let ul = $(element).find('ul.steps.accordion');
                        let items = ul.children();
                        let scrollIndex = scope.pasting ? findFirstCopy(scope.shaker.steps) : items.length - 1;

                        $timeout(function() {
                            let addedElement = ul.children().get(scrollIndex);
                            // scroll to element
                            if (addedElement) {
                                addedElement.scrollIntoView({ 'block': 'center' });
                            }
                        });
                    }
                });

                function findFirstCopy(steps) {
                    return steps.findIndex(_ => {
                        return (_.$stepState && _.$stepState.isNewCopy) || (_.steps && findFirstCopy(_.steps) >= 0);
                    });
                }

                scope.clearFFS = function(){
                    scope.ffs = [];
                };
            }
        };
    });

    // small directive meant to replace "-1" by "not set", since -1 is used as a marker of "no limit" in the backend
    // Also handles megabytes
    app.directive('optionalMaxSizeMb', function() { // Warning : this directive cannot handle nulls -> ng-if above it
        return {
            scope: true,
            restrict: 'A',
            link: function($scope, el, attrs) {
                $scope.$optionalState = {};
                var initSize = $scope.$eval(attrs.optionalMaxSizeMb);
                $scope.$optionalState.hasMaxSize = initSize >= 0;
                if ($scope.$optionalState.hasMaxSize) {
                    $scope.$optionalState.maxSize = initSize / (1024 * 1024);
                }
                $scope.$watch('$optionalState.hasMaxSize', function(nv, ov) {
                    if (!$scope.$optionalState.hasMaxSize) {
                        $scope.$eval(attrs.optionalMaxSizeMb + " = -1");
                    } else {
                        /* Put a sane default value */
                        if ($scope.$optionalState.maxSize === undefined || $scope.$optionalState.maxSize < 0) {
                            $scope.$optionalState.maxSize = 1;
                        }
                        $scope.$eval(attrs.optionalMaxSizeMb + " = " + ($scope.$optionalState.maxSize * 1024 * 1024));
                    }
                });
                $scope.$watch('$optionalState.maxSize', function(nv, ov) {
                    if (nv === undefined) return;
                    $scope.$eval(attrs.optionalMaxSizeMb + " = " + ($scope.$optionalState.maxSize * 1024 * 1024));
                });
            }
        };
    });


    var services = angular.module('dataiku.services');

    services.factory('ShakerPopupRegistry', function(Logger) {
        var callbacks = [];
        function register(dismissFunction) {
            callbacks.push(dismissFunction);
        }
        function dismissAll() {
            callbacks.forEach(function(f) {
                try {
                    f();
                } catch (e) {
                    Logger.warn("failed to dismiss shaker popup", e);
                }
            });
            callbacks = [];
        }

        function dismissAllAndRegister(dismissFunction) {
            dismissAll();
            register(dismissFunction);
        }

        return {
            register: register,
            dismissAll: dismissAll,
            dismissAllAndRegister: dismissAllAndRegister
        }
    });

    // to put on the element in which the custom formula editor is supposed to be shown. It provides a function
    // that can be passed to CreateCustomElementFromTemplate in order to insert the formula editor in the DOM,
    // instead of the usual mechanism (which is: append to <body>). This directive sets a boolean in the scope
    // to indicate the formula editor is open (so that you can hide other stuff while it's open, for example)
    app.directive('customFormulaZone', function($rootScope) {
        return {
            scope: true,
            restrict: 'A',
            link: function($scope, el, attrs) {
            	var type = attrs.customFormulaZone || 'replace';
            	$scope.customFormulaEdition.editing = 0;

            	$scope.customFormulaEdition.displayCustomFormula = function(formulaElement) {
            		$scope.customFormulaEdition.editing += 1;

                	$(formulaElement).on("remove", function() {
                		$scope.customFormulaEdition.editing -= 1;
                		if ($scope.customFormulaEdition.editing == 0 ) {
                			if ( type == 'replace' ) {
                				$(el).removeClass("replaced-by-formula");
                			}
                		}
                		$scope.customFormulaEdition.reflowStuff();
                	});

                	if (type == 'replace') {
                		$(el).after(formulaElement);
                		if ( $scope.customFormulaEdition.editing == 1 ) {
                			$(el).addClass("replaced-by-formula");
                		}
                	} else {
                		$(el).append(formulaElement);
                	}
            	};
            }
        };
    });
    // dumb directive to put somewhere above the element providing the custom formula, and the element receiving it.
    // Its purpose is to bridge the scopes of the step using the formula editor and the place where the formula
    // editor is shown (they're most likely in different panes on the screen)
    app.directive('hasCustomFormulaZone', function() {
        return {
            scope: true,
            restrict: 'A',
            link: function($scope, el, attrs) {
            	$scope.customFormulaEdition = {
            		reflowStuff : function() {$scope.$broadcast("reflow");} // reflow just inside the shaker screen, not the entire dss
            	};
            }
        };
    });

})();

(function() {
"use strict";

const  app = angular.module('dataiku.shaker');


app.directive('datasetChartsBase', function(Assert, ChartChangeHandler, Logger, CreateModalFromTemplate, DatasetUtils, WT1, TopNav, DataikuAPI, $timeout, ActivityIndicator, $state, $stateParams, $q, DatasetChartsUtils, ChartSetErrorInScope, DatasetErrorCta){
    return {
        priority: 2,
        scope : true,
        controller: function ($scope, $stateParams) {
            ChartSetErrorInScope.defineInScope($scope);
            $scope.onLoad = function(projectKey, datasetName, contextProjectKey, datasetSmartName) {
                if ($stateParams.chartIdx) {
                    $scope.currentChart.index = parseInt($stateParams.chartIdx);
                }

                //For datasetErrorCTA directive (CTA in case of error while loading dataset sample)
                $scope.errorCTA = {};

                $scope.updateUiState = DatasetErrorCta.getupdateUiStateFunc($scope);

                $scope.$watch("datasetFullInfo", _ => $scope.updateUiState($scope.errorCTA.error), true);
                $scope.$watch("errorCTA", _ => $scope.updateUiState($scope.errorCTA.error), true);

                /* ********************* Execute Callbacks for chartsCommon ******************* */

                function getDataSpec(){
                    var currentChart = $scope.charts[$scope.currentChart.index];
                    Assert.trueish(currentChart, 'no currentChart');

                    var dataSpec = {
                        datasetProjectKey: projectKey,
                        datasetName: datasetName,
                        script: angular.copy($scope.shaker),
                        copySelectionFromScript: currentChart.copySelectionFromScript,
                        sampleSettings: currentChart.refreshableSelection,
                        engineType: currentChart.engineType
                    };
                    dataSpec.script.origin = "DATASET_EXPLORE";
                    return dataSpec;
                }

                $scope.getExecutePromise = function(request, saveShaker = true, noSpinner = false) {
                    var currentChart = $scope.charts[$scope.currentChart.index];
                    Assert.trueish(currentChart.summary, "Current chart summary is not ready");
                    (saveShaker !== false) && $scope.saveShaker();
                    if(request) {
                        request.maxDataBytes = currentChart.maxDataBytes;
                        let promise = DataikuAPI.shakers.charts.getPivotResponse(
                            projectKey,
                            getDataSpec(),
                            request,
                            currentChart.summary.requiredSampleId
                        );

                        if (noSpinner === true) {
                            promise = promise.noSpinner();
                        }

                        return promise;
                    }
                };

                $scope.$on("chartSamplingChanged", function(){
                    $scope.clearCachedSummaries();
                    $scope.fetchColumnsSummaryForCurrentChart().then(function(){
                        Logger.info("Sample reloaded, executing chart");
                        $scope.$broadcast("forceExecuteChart");
                    });
                });

                $scope.getDefaultNewChart = function() {
                    var newChart = null;
                    if ($scope.charts.length > 0) {
                        // Copy to retrieve the same sample, copySample and engine settings
                        newChart = angular.copy($scope.charts[$scope.charts.length - 1]);
                        newChart.def = ChartChangeHandler.defaultNewChart();
                    } else {
                        newChart = {
                            def : ChartChangeHandler.defaultNewChart(),
                            copySelectionFromScript : true,
                            engineType : "LINO",
                            maxDataBytes: 150*1024*1024
                        }
                    }
                    return newChart;
                }

                function exploreIsDirty(ignoreThumbnailChanges) {
                    try {
                        var savedExplore2 = angular.copy(savedExplore);
                        var explore = angular.copy($scope.explore);

                        if (ignoreThumbnailChanges) {
                            if (explore) {
                                explore.charts.forEach(function(chart){
                                    chart.def.thumbnailData = null;
                                });
                            }
                            if (savedExplore2) {
                                savedExplore2.charts.forEach(function(chart){
                                    chart.def.thumbnailData = null;
                                });
                            }
                        }
                        return !angular.equals(explore, savedExplore2);
                    } catch (e) {
                        Logger.error(e);
                        return true;
                    }
                }

                $scope.saveShaker = function() {
                    Logger.info("Saving shaker");
                    var ignoreThumbnailChanges = !$scope.isProjectAnalystRW();
                    if (!exploreIsDirty(ignoreThumbnailChanges)) {
                        Logger.info("No changes: don't save explore");
                        return;
                    }

                    if ($scope.isProjectAnalystRW()){
                        DataikuAPI.explores.save(contextProjectKey, datasetSmartName, $scope.explore).success(function(data) {
                            ActivityIndicator.success("Charts saved");
                        }).error(setErrorInScope.bind($scope));
                    } else {
                        ActivityIndicator.warning("You don't have write access - not saving");
                    }
                };

                $scope.saveChart = $scope.saveShaker;

                /* ********************* Load callback ******************* */

                var cachedColumnSummaries = {};

                $scope.clearCachedSummaries = function(){
                    $scope.charts.forEach(function(x) {
                        x.summary = null;
                    });
                    cachedColumnSummaries = {};
                }

                $scope.fetchColumnsSummaryForCurrentChart = function(forceRefresh){
                    var currentChart = $scope.charts[$scope.currentChart.index];
                    var dataSpec = getDataSpec();
                    var cacheKey = JSON.stringify(dataSpec).dkuHashCode();

                    var promise = null;
                    if (cachedColumnSummaries[cacheKey] != null && !forceRefresh) {
                        Logger.info("Already cached for", dataSpec);
                        promise = $q.when(cachedColumnSummaries[cacheKey]);
                    } else {
                        Logger.info("No cache for", dataSpec);
                        promise = DataikuAPI.shakers.charts.getColumnsSummary(projectKey, dataSpec)
                            .error($scope.chartSetErrorInScope)
                            .then(function(response) {
                            cachedColumnSummaries[cacheKey] = response.data;
                            return response.data;
                        })
                    }

                    return promise.then(
                        function(data) {
                            currentChart.summary = data;
                            $scope.makeUsableColumns(data);
                            if ($scope.errorCTA) {
                                $scope.errorCTA.error = null;
                            }
                        },
                        function(attr) {
                            if ($scope.errorCTA) {
                                $scope.errorCTA.error = getErrorDetails(attr.data, attr.status, attr.headers, attr.statusText);
                            }
                        }
                    );
                };

                $scope.createAndPinInsight = function(){
                    let insights = [];

                    $scope.charts.forEach(chart => {
                        let insight = {
                            type: 'chart',
                            projectKey: contextProjectKey,
                            name: chart.def.name + ' on ' + datasetSmartName,
                            params: {
                                datasetSmartName: datasetSmartName,
                                engineType: chart.engineType,
                                refreshableSelection: chart.refreshableSelection,
                                def : chart.def,
                                maxDataBytes: chart.maxDataBytes
                            }
                        };
                        if (insight.params.refreshableSelection == null) {
                            insight.params.refreshableSelection = DatasetChartsUtils.makeSelectionFromScript($scope.shaker);
                        }

                        insights.push(insight);
                    });

                    CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insights-modal.html", $scope, "CreateAndPinInsightsModalController", function(newScope) {
                        let selectedCharts = angular.copy($scope.charts);
                        selectedCharts.forEach(_ => _.selected = false);
                        selectedCharts[$scope.currentChart.index].selected = true;

                        newScope.insightData = {
                            items: selectedCharts,
                            type: 'chart'
                        }

                        newScope.init(insights);
                    });
                };

                /* ********************* Main ******************* */

                var savedExplore;
                var main = function(){
                    WT1.event("dataset-charts-open");
                    TopNav.setLocation(TopNav.TOP_FLOW, 'datasets', TopNav.TABS_DATASET, "visualize");

                    DataikuAPI.explores.get(contextProjectKey, datasetSmartName).success(function(data) {
                        $scope.explore = data;
                        $scope.shaker = data.script;
                        $scope.charts = data.charts;
                        savedExplore = angular.copy($scope.savedExplore);

                        DataikuAPI.datasets.get(projectKey, datasetName, $stateParams.projectKey).success(function(data){
                            $scope.dataset = data;
                        }).error(setErrorInScope.bind($scope));

                        if ($scope.charts.length == 0) {
                            $scope.addChart();
                        }

                        Logger.info("Explore loaded, get summary");

                        $scope.$watch("charts[currentChart.index]", function(nv){
                            Logger.info("Chart changed, fetching summary and executing");
                            if (nv) {
                                $scope.fetchColumnsSummaryForCurrentChart().then(function(){
                                    // Fixes a race condition that used to happen sometimes when explores.get returned before the
                                    // event listeners in chart_logic.js were properly set up, causing the forceExecuteChart to be missed
                                    // and nothing to be drawn.
                                    $scope.forceExecuteChartOrWait();
                                })
                            }
                        });
                        if ($scope.errorCTA) {
                            $scope.errorCTA.error = null;
                        }
                    }).error(function(data, status, headers, config, statusText, xhrStatus) {
                        setErrorInScope.bind($scope)(data, status, headers, config, statusText, xhrStatus);
                        if ($scope.errorCTA) {
                            $scope.errorCTA.error = getErrorDetails(data, status, headers, statusText);
                        }
                    });
                };

                main();
            };
        }
    }
});

app.directive('datasetCharts', function(){
    return {
        scope : true,
        controller  : function ($scope, $stateParams) {
            $scope.onLoad($stateParams.projectKey, $stateParams.datasetName, $stateParams.projectKey, $stateParams.datasetName);
        }
    }
});

app.directive('foreignDatasetCharts', function(Logger, DatasetUtils) {
    return {
        scope : true,
        controller  : function ($scope, $stateParams) {
            var loc = DatasetUtils.getLocFromFull($stateParams.datasetFullName);
            $scope.onLoad(loc.projectKey, loc.name, $stateParams.projectKey, $stateParams.datasetFullName);
        }
    }
});

app.directive("datasetChartSamplingEditor", function(DataikuAPI, $stateParams, $timeout, WT1, $q, CreateModalFromTemplate, DatasetUtils, ChartUtils, $rootScope) {
    return {
        scope : {
            dataset: '=',
            chart : '=',
            script : '=',
            canCopySelectionFromScript : '='
        },
        templateUrl : "/templates/simple_report/dataset-chart-sampling-editor.html",
        controller : function($scope, $controller){
            $controller("_ChartOnDatasetSamplingEditorBase", {$scope:$scope});

            function makeEnginesStatus(dataset, script, chartSpec) {
                var engines = [
                    ["LINO", $rootScope.wl.productShortName, true, ""]
                ]
                var sqlEngine = ["SQL", "In-database", false, ""];
                if (!DatasetUtils.canUseSQL($scope.dataset)) {
                    sqlEngine[3] = "Dataset is not SQL";
                } else if (script != null && script.steps.length) {
                    sqlEngine[3] = "Script contains steps";
                } else if (!ChartUtils.canUseSQL({def: chartSpec})) {
                    sqlEngine[3] = "This chart is not compatible with in-database";
                } else {
                    sqlEngine[2] = true;
                }
                engines.push(sqlEngine);
                if ($rootScope.appConfig.interactiveSparkEngine != null) {
                    var sparksqlEngine = ["SPARKSQL", "SparkSQL", false, ""];
                    if (!DatasetUtils.canUseSparkSQL($scope.dataset)) {
                        sqlEngine[3] = "Dataset is SQL, use in-database engine";
                    } else if (script != null && script.steps.length) {
                        sparksqlEngine[3] = "Script contains steps";
                    } else if (!ChartUtils.canUseSQL({def: chartSpec})) {
                        sparksqlEngine[3] = "This chart is not compatible with SparkSQL";
                    } else {
                        sparksqlEngine[2] = true;
                    }
                    engines.push(sparksqlEngine);
                }
                return engines;
            }

            $scope.$watch("chart", function(){
                $scope.availableEngines = makeEnginesStatus(
                                $scope.dataset, $scope.script, $scope.chart.def);
            });

            /* Auto-revert to compatible settings */
            $scope.$watch("chart.engineType", function(nv, ov){
                if (!nv || !ov) return;

                if ((nv == "SQL" || nv == "SPARKSQL") && !$scope.chart.refreshableSelection) {
                    $scope.chart.refreshableSelection = {
                        selection: {
                            samplingMethod: "FULL",
                            partitionSelectionMethod: "ALL"
                        }
                    }
                }
            });

            $scope.save = function() {
                if ($scope.chart.refreshableSelection != null) {
                    $scope.chart.refreshableSelection._refreshTrigger =
                            ($scope.chart.refreshableSelection._refreshTrigger||0)+1;
                }

                $scope.$emit("chartSamplingChanged");
            };

            $scope.saveNoRefresh = function() {
                $scope.$emit("chartSamplingChanged");
            };
        }
    }
});

})();

(function() {
'use strict';

const app = angular.module('dataiku.shaker');


app.directive("shakerWithLibrary", function() {
    return {
        scope:true,
        controller : function($scope, $timeout, $filter, ListFilter, ShakerPopupRegistry) {

            $scope.$on("paneSelected", function(e, pane) {
            	if ($scope.uiState) {
            		$scope.uiState.shakerLeftPane = pane.slug;
            	}
            });

            /* ******************* Processors library management *************** */

            Mousetrap.bind("esc", function() {
                if ($scope.shakerUIState.showProcessorsLibrary &&
                    !$(".library-search-input").is(":focus")) {
                    $scope.shakerUIState.showProcessorsLibrary = false;
                    $scope.$apply();
                }
            });
            $scope.$on("$destroy", function() {Mousetrap.unbind("esc")});

            $scope.displayProcessor = function(p) {
                $scope.shakerUIState.displayedProcessor = p;
            }

            $scope.toggleLibrary = function(show) {
                if (show === undefined) {
                    show = !$scope.shakerUIState.showProcessorsLibrary;
                }
                if (show) {
                    ShakerPopupRegistry.dismissAllAndRegister(function(){$scope.toggleLibrary(false);})
                    setupLibraryPopup();
                }
                $scope.shakerUIState.showProcessorsLibrary = show;
            }

            function setupLibraryPopup() {
                $timeout(function(){$(".library-search-input").focus()}, 0);

                $(".library-search-input").on("keyup", function(e) {
                    if (e.which == 27) {
                        $scope.toggleLibrary();
                        $scope.$apply();
                    }
                });

                $(".library-search-input").off("keyup").on("keyup", function(e) {
                    var s = $scope.shakerUIState.displayedProcessor;
                    var i = -1;

                    if (e.which === 27) {
                        $scope.shakerUIState.showProcessorsLibrary = false;
                        $scope.$apply();
                    }

                    if (s) {
                        i = $scope.filteredProcessors.indexOf(s);
                    }
                    if (e.which == 13 && s) {
                        $scope.toggleLibrary();
                        $scope.addUnconfiguredStep(s.type);
                        e.preventDefault();
                        e.stopPropagation();
                        $scope.$apply();
                        return false;
                    } else if (e.which == 40 && $scope.filteredProcessors.length) {
                        if (i == -1) {
                            i = 0;
                        } else if (i < $scope.filteredProcessors.length - 1) {
                            i++;
                        }
                        $scope.shakerUIState.displayedProcessor = $scope.filteredProcessors[i];
                    } else if (e.which == 38 && $scope.filteredProcessors.length) {
                        if (i >= 1) {
                            i--;
                            $scope.shakerUIState.displayedProcessor = $scope.filteredProcessors[i];
                        }
                    }
                    $scope.$apply();
                });
            }

            $scope.selectTag = function(tag) {
                if (tag.selected) {
                    $scope.processors.tags.forEach(function(x){x.selected=false});
                } else {
                    $scope.processors.tags.forEach(function(x){x.selected=false});
                    tag.selected = true;
                }
                $scope.refreshLibrarySearch();
            }

            $scope.refreshLibrarySearch = function() {
                if (!$scope.processors) return;

                var selectedTags = $scope.processors.tags.filter(function(tag) {
                    return tag.selected;
                }).map(function(tag) {
                    return tag.id;
                });

                $scope.shakerUIState.tagsCount = {};
                var filteredProcessors = ListFilter.filter(
                        angular.copy($scope.processors.processors),
                        $scope.shakerUIState.libraryQuery);

                /* Facet */
                angular.forEach($scope.processors.tags, function(tag) {
                    $scope.shakerUIState.tagsCount[tag.id] = 0;
                    tag.selected = selectedTags.indexOf(tag.id) >= 0;
                });

                /* If we have a query, make a filtered facet */
                if ($scope.shakerUIState.libraryQuery) {
                    angular.forEach(filteredProcessors, function(processor) {
                        angular.forEach(processor.tags, function(tag) {
                            $scope.shakerUIState.tagsCount[tag]++;
                        });
                    })
                } else {
                    angular.forEach($scope.processors.processors, function(processor) {
                        angular.forEach(processor.tags, function(tag) {
                            $scope.shakerUIState.tagsCount[tag]++;
                        });
                    })

                }

                /* Then only, filter on tags */

                if (selectedTags.length) {
                    angular.forEach(selectedTags, function(tag){
                        filteredProcessors = $.grep(filteredProcessors, function(item){
                            return item.tags && item.tags.indexOf(tag) >= 0;
                        })
                    })
                }

                filteredProcessors = $.grep(filteredProcessors, function(i) {
                    return i.displayInLibrary && !i.disabledByAdmin;
                })

                $scope.filteredProcessors = filteredProcessors;

                //Remove displayed processor if it is not in the filtered results
                if ($scope.shakerUIState.displayedProcessor && filteredProcessors.map(function(p){return p.type}).indexOf($scope.shakerUIState.displayedProcessor.type) < 0) {
                    delete $scope.shakerUIState.displayedProcessor;
                }
            };

            Mousetrap.bind("a", function() {
                $scope.toggleLibrary();
                $scope.$apply();
            })
            $scope.$on("$destroy", function() {
                Mousetrap.unbind("a");
            });

            $scope.$watch("shakerUIState.libraryQuery", $scope.refreshLibrarySearch);
            $scope.$watch("processors", function(nv, ov) {
                if (nv) $scope.refreshLibrarySearch();
            });
        }
    }
});


app.directive("shakerWithProcessors", function($rootScope, Assert, CreateModalFromTemplate, ShakerProcessorsInfo, ShakerProcessorsUtils, Logger) {
    return {
        scope: true,
        controller: function($scope, $stateParams, $state, CachedAPICalls, $filter, TableChangePropagator, WT1, $timeout,$q, Fn, openDkuPopin, ClipboardUtils, ActivityIndicator){

            $scope.shakerUIState  = { selectedTags : [] };
            $scope.shakerState.withSteps = true;
            $scope.groupChanged = {justCreated: false, addedStepsTo: null, removedStepsFrom: []};

            // you're going to need them
            CachedAPICalls.processorsLibrary.success(function(processors){
                $scope.processors = processors;
            }).error(setErrorInScope.bind($scope));

            /*
             * Adding Step
             */

            /* When you add a step, the previous ones are not new anymore */
            function clearNewState(){
                function clearNewState_(step) {
                    if (step.$stepState) {
                        step.$stepState.isNew = false;
                        step.$stepState.isNewCopy = false;
                    }
                    if (step.metaType == "GROUP") {
                        step.steps.forEach(clearNewState_);
                    }
                }
                $scope.shaker.steps.forEach(clearNewState_);
            }

            $scope.addStep = function(processor, params, keepClosed, onOpenCallback) {
                clearNewState();
                if (angular.isString(processor)) {
                    processor = $filter('processorByType')($scope.processors, processor)
                }
                $scope.stopPreview(true);
                var step = {
                    type: processor.type,
                    preview: true,
                    params: params
                };
                if (!keepClosed) {
                    $scope.openStep(step, onOpenCallback);
                }
                $scope.shaker.steps.push(step);
            }

            $scope.addStepAndRefresh = function(processor, params, keepClosed) {
                clearNewState();
                $scope.addStep(processor, params, keepClosed);
                $scope.autoSaveForceRefresh();
            }

            $scope.addStepNoPreview = function(processor, params, keepClosed) {
                clearNewState();
                $scope.addStep(processor, params, keepClosed);
                $scope.shaker.steps[$scope.shaker.steps.length-1].preview = false;
            }

            $scope.addStepNoPreviewAndRefresh = function(processor, params, keepClosed) {
                clearNewState();
                $scope.addStep(processor, params, keepClosed);
                $scope.shaker.steps[$scope.shaker.steps.length-1].preview = false;
                $scope.autoSaveForceRefresh();
            }

            $scope.addUnconfiguredStep = function(type, params) {
                clearNewState();
                var processor = $filter('processorByType')($scope.processors, type);
                if (angular.isUndefined(params)) {
                    if (processor.defaultParams) {
                        params = angular.copy(processor.defaultParams);
                    } else {
                        params = {}
                    }
                    angular.forEach(processor.params, function(pparam){
                        if (pparam.defaultValue) {
                            params[pparam.name] = angular.copy(pparam.defaultValue);
                        }
                    });
                }
                $scope.stopPreview(true);

                var step = {
                    type: processor.type,
                    preview: true,
                    isNew : true,
                    params: params,

                    $stepState:  {
                        isNew : true,
                        change: {
                           columnsBeforeStep: $scope.columns
                        }
                    }
                };
                $scope.shaker.steps.push(step);
                $scope.openStep(step);
            }

            $scope.duplicateStep = function(step){
                $scope.disablePreviewOnAllSteps();
                var newStep = angular.copy(step);
                if (typeof(newStep.name)!=='undefined' && newStep.name.length > 0) {
                    var suffix = ' (copy)';
                    if (newStep.name.indexOf(suffix, newStep.name.length - suffix.length) === -1) {
                        newStep.name += ' (copy)';
                    }
                }
                var stepId = $scope.findStepId(step);
                if (stepId.depth == 1) {
                	var group = $scope.shaker.steps[stepId.id];
                	group.steps.splice(stepId.subIndex + 1, 0, newStep);
                } else {
                	$scope.shaker.steps.splice(stepId.id + 1, 0, newStep);
                }
                $scope.currentStep = newStep;
                $scope.autoSaveForceRefresh();
            }

            $scope.appendGroup = function(){
                $scope.stopPreview(true);
                var group = {
                    metaType : "GROUP",
                    steps : []
                }
                $scope.shaker.steps.push(group);
                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
                $scope.groupChanged.justCreated = true;
            }

            //TODO: to remove ?
            $scope.addStepToPrevGroup = function(step){
                var lastGroup = null, stepIdx = -1;
                for (var i = 0; i < $scope.shaker.steps.length; i++) {
                    if ($scope.shaker.steps[i].metaType == 'GROUP') {
                        lastGroup = $scope.shaker.steps[i];
                    }
                    if ($scope.shaker.steps[i] == step) {
                        stepIdx = i;
                        break;
                    }
                }
                if (!lastGroup) {
                    Logger.error("No group before step!");
                } else {
                    lastGroup.steps.push(step);
                    $scope.shaker.steps.splice(stepIdx, 1);
                }
            }

            /*
             * Removing Step
             */

            var removeStepNoRefresh = function(step) {
                //removing step from shaker.steps
                var stepId = $scope.findStepId(step);
                if (typeof(stepId)!=='undefined') {
                    if (stepId.depth == 0) {
                        $scope.shaker.steps.splice(stepId.id, 1);
                    } else if (stepId.depth == 1) {
                        $scope.shaker.steps[stepId.id].steps.splice(stepId.subId, 1);
                    }
                }
            }

            $scope.removeStep = function(step, saveAndRefresh) {
                removeStepNoRefresh(step);
                $scope.autoSaveForceRefresh();
            };


            /*
             * Reordering Steps
             */

            $scope.afterStepMove = function(){
                $scope.stopPreview(true);
                $scope.autoSaveAutoRefresh();
            }

            $scope.treeOptions = {
                dropped: $scope.afterStepMove,
                accept: function(sourceNodeScope, destNodesScope, destIndex) {
                    return destNodesScope.depth() == 0 || sourceNodeScope.$modelValue.metaType != 'GROUP';
                }
            }

            /*
             * Disabling steps
             */

            $scope.toggleDisable = function(step) {
                toggleDisableNoRefresh(step);
                $scope.autoSaveForceRefresh();
            }

            var toggleDisableNoRefresh = function(step) {
                step.disabled = !step.disabled;
                onDisableChange(step);
            }

            var enableStepNoRefresh = function(step) {
                step.disabled = false;
                onDisableChange(step);
            }

            var disableStepNoRefresh = function(step) {
                step.disabled = true;
                onDisableChange(step);
            }

            $scope.isAllStepsDisabled = function() {
            	return typeof($scope.shaker) === 'undefined' || typeof($scope.shaker.steps) === 'undefined' ||  isAllStepsInArrayDisabled($scope.shaker.steps);
            }

            var isAllStepsInArrayDisabled = function(steps) {
    			for (var id = 0; id < steps.length; id ++) {
    				var step = steps[id];
            		if (!step.disabled) {
            			return false;
            		}
            		if (step.metaType == 'GROUP') {
            			if (!isAllStepsInArrayDisabled(step.steps)) {
            				return false;
            			}
            		}
    			}
    			return true;
            }

            var onDisableChange = function(step) {
                if (step.disabled) {
                    /* This step was enabled, also disable preview on it */
                    step.preview = false;
                    //if it's a group all nested processor are disabled too
                    if (step.metaType == 'GROUP') {
                        for (var i = 0; i<step.steps.length; i++) {
                            step.steps[i].disabled = true;
                            step.steps[i].preview = false;
                        }
                    }
                } else {
                    if (step.metaType == 'GROUP') {
                        for (var i = 0; i<step.steps.length; i++) {
                            step.steps[i].disabled = false;
                        }
                    } else {
                        var stepId = $scope.findStepId(step);
                        if (stepId.depth == 1) {
                            $scope.shaker.steps[stepId.id].disabled = false;
                        }
                    }
                }
            }

            /*
             * Previewing steps
             */

            $scope.togglePreview = function(step) {
                if (step.preview) {
                    /* Disable preview : disable it everywhere */
                    $scope.stopPreview(true);
                } else {
                    $scope.stopPreview(true);

                    /* Enable it here */
                    step.preview = true;
                    /* And mark further steps as softdisabled */
                    $scope.markSoftDisabled();
                }
                $scope.autoSaveForceRefresh();
            }

            $scope.stopPreview = function(norefresh){
                function _disablePreviewOnStep(s) {
                    if (s.metaType == "GROUP") {
                        if (s.steps) {
                            s.steps.forEach(_disablePreviewOnStep);
                        }
                        s.preview = false;
                        if (s.$stepState) s.$stepState.softDisabled=false;
                    } else {
                        s.preview = false;
                        if (s.$stepState) s.$stepState.softDisabled=false;
                    }
                }
                /* Disable preview everywhere */
                $scope.shaker.steps.forEach(_disablePreviewOnStep);

                $scope.stepBeingPreviewed = null;

                if (!norefresh){
                    $scope.autoSaveForceRefresh();
                }
            }

            $scope.computeExtraCoachmarksSerieIds = function() {
                $scope.extraCoachmarksSerieIds = [];

                if ($scope.stepBeingPreviewed && ($scope.topNav.tab == 'code' || $scope.topNav.tab == 'script')) {
                    $scope.extraCoachmarksSerieIds.push("shaker-eye");
                }

                if ($scope.shakerState.isInAnalysis) {
                    $scope.extraCoachmarksSerieIds.push("analysis-deploy");
                }
                else {
                    $scope.extraCoachmarksSerieIds.push("shaker-run");
                  }
            };
            $scope.$watch("stepBeingPreviewed", $scope.computeExtraCoachmarksSerieIds);
            $scope.$watch("topNav.tab", $scope.computeExtraCoachmarksSerieIds);
            $scope.computeExtraCoachmarksSerieIds();


            $scope.getStepBeingPreviewedDescription =function(){
                Assert.inScope($scope, 'stepBeingPreviewed');

                var processor = {
                    enDescription : "UNKNOWN"
                }
                if ($scope.stepBeingPreviewed.metaType == "GROUP") {
                    return $scope.getGroupName($scope.stepBeingPreviewed);
                } else {
                    return ShakerProcessorsUtils.getStepDescription(processor, $scope.stepBeingPreviewed.type, $scope.stepBeingPreviewed.params);
                }
            }
            $scope.getStepBeingPreviewedImpactVerb =function(){
                Assert.inScope($scope, 'stepBeingPreviewed');
                return ShakerProcessorsUtils.getStepImpactVerb($scope.stepBeingPreviewed.type, $scope.stepBeingPreviewed.params);
            }

            $scope.disablePreviewOnAllSteps = function() {
                for (var i = 0; i < $scope.shaker.steps.length; i++) {
                    $scope.shaker.steps[i].preview = false;
                    if ($scope.shaker.steps[i].metaType == 'GROUP' && $scope.shaker.steps[i].steps && $scope.shaker.steps[i].length > 0) {
                        for (var j=0; j<$scope.shaker.steps[i].steps.length; j++) {
                            $scope.shaker.steps[i].steps[j].preview = false;
                        }
                    }
                }
            }

            /*
             * Copy/Paste steps
             */
            let copyType = 'shaker-steps';

            function sanitizeSteps(data) {
                let steps = data;
                // ensure steps are in order they appear in the shaker
                // list so order is preserved when pasting
                steps = sortSteps(steps);
                // if selecting a group, ensure that the substeps
                // aren't included twice in the data
                steps = removeExtraChildren(steps);

                return steps;
            }

            /*
                Copy JSON of steps to clipboard
            */
            $scope.copyData = function(data) {
                let copy = {
                    "type": copyType,
                    "version": $scope.appConfig.version.product_version,
                    "steps": sanitizeSteps(data)
                };

                // this removes all instances of the keys, including substeps
                const dataStr = JSON.stringify(copy, (key, value) => {
                    let keysToRemove = ['$$hashKey', '$stepState', '$translatability'];

                    return keysToRemove.includes(key) ? undefined : value;
                }, 2);
                const stepCount = $scope.getNumberOfSteps(copy.steps);
                const plural = stepCount > 1 ? 's' : '';

                ClipboardUtils.copyToClipboard(dataStr, `Copied ${stepCount} step${plural} to clipboard.`);
            }

            // steps: list of existing steps describing where
            // to insert the new steps
            $scope.openPasteModalFromStep = function(steps) {
                let newScope = $scope.$new();
                // ensure existing steps are in the correct order so
                // we know where to insert the pasted steps
                steps = sortSteps(steps);
                $scope.insertAfter = steps[steps.length - 1];

                CreateModalFromTemplate("/templates/shaker/paste-steps-modal.html", newScope, 'PasteModalController', function(modalScope) {
                    modalScope.copyType = copyType;
                    modalScope.formatData = $scope.formatStepData;
                    modalScope.itemKey = 'steps';
                    modalScope.pasteItems = $scope.pasteSteps;
                });
            };

            $scope.formatStepData = function(steps) {
                if ($scope.insertAfter) {
                    const stepId = $scope.findStepId($scope.insertAfter);
                    
                    if (stepId.depth === 1) {
                        // flatten any groups so we don't have groups within groups
                        steps = steps.reduce((acc, c) => acc.concat(c.metaType === 'GROUP' ? c.steps : c), []);
                    }
                }

                steps.forEach(_ => {
                    const name = _.name;
                    if (typeof name !== 'undefined' && name.length > 0) {
                        const suffix = ' (copy)';
                        if (name.indexOf(suffix, name.length - suffix.length) === -1) {
                            _.name += ' (copy)';
                        }
                    }

                    _.$stepState = _.$stepState || {
                        isNewCopy: true
                    };
                    _.selected = true;
                    _.preview = false;
                });

                return steps;
            };

            $scope.pasteSteps = function(steps) {
                let insertAt = $scope.shaker.steps.length;
                let addTo = $scope.shaker.steps;
                
                if ($scope.insertAfter) {
                    const stepId = $scope.findStepId($scope.insertAfter);
                    insertAt = stepId.id + 1;

                    if (stepId.depth === 1) {
                        insertAt = stepId.subId + 1;
                        addTo = $scope.shaker.steps[stepId.id].steps;
                    }
                }

                if (steps && steps.length) {
                    $scope.pasting = true;
                    $scope.stopPreview();
                    $scope.unselectSteps();
                    clearNewState();

                    addTo.splice(insertAt, 0, ...steps);
                    
                    const stepCount = steps.length;
                    const stepText = stepCount + ' step' + stepCount > 1 ? 's' : '';
                    ActivityIndicator.success(`Pasted ${stepText} successfully.`, 5000);
                    
                    $scope.autoSaveAutoRefresh();
                    $scope.insertAfter = null;

                    $timeout(() => $scope.pasting = false);
                }
            };

            /*
                Called when user uses ctrl + v from within
                the shaker step list (not in the modal)

                Immediately show preview modal since we've already pasted
            */
            $scope.openPasteModalFromKeydown = function(data) {
                try {
                    data = JSON.parse(data);
                } catch(e) {}

                if (data && data.steps && data.steps.length && data.type === copyType) {
                    CreateModalFromTemplate("/templates/shaker/paste-steps-modal.html", $scope, 'PasteModalController', function(modalScope) {
                        modalScope.uiState.editMode = false;
                        modalScope.uiState.items = data.steps;
                        modalScope.uiState.type = data.type;
                        modalScope.pasteItems = $scope.pasteSteps;
                    });
                }
            }

            /*
                Called when user uses ctrl + c from within
                the shaker step list (not in the modal)
            */
            $scope.keydownCopy = function(event) {
                let selectedSteps = $scope.getSelectedSteps();
                        
                if (selectedSteps.length) {
                    $scope.copyData(selectedSteps);
                }
                
                event.currentTarget.focus();
            }

            /*
             * Displaying info to user
             */

            $scope.getGroupName = function(step) {
                if (step.metaType == 'GROUP') {
                    return step.name && step.name.length>0 ? step.name : 'GROUP ' + $scope.findGroupIndex(step);
                }
            }

            $scope.getScriptDesc = function() {
                var nbSteps = $scope.shaker && $scope.shaker.steps ? $scope.shaker.steps.length : 0;
                if (nbSteps == 0) {
                    return 'no step';
                } else if (nbSteps == 1) {
                    return '<strong>1</strong> step';
                } else {
                    return '<strong>' + nbSteps + '</strong> steps';
                }
            };

            $scope.isStepInWarning = function(step) {
                return step.$stepState.change && step.$stepState.change.messages && step.$stepState.change.messages.length > 0;
            };

            $scope.getWarningMessage = function(step) {
                var message = "";
                if (step.metaType == "GROUP") {
                    var warningList = "";
                    step.$stepState.change.messages.forEach(function(e) {
                        if (warningList.indexOf(e.title) == -1) {
                            if (warningList.length > 0) {
                                warningList +=", ";
                            }
                            warningList +="<b>" + e.title + "</b>";
                        }
                    });
                    message = "<h5>" + "Inner warning(s)" + "</h5>" + "<p>" + "Some inner step(s) have warning(s) (" + warningList + "), open group for more information." + "</p>";
                } else {
                    step.$stepState.change.messages.forEach(function(m) {
                        message += "<h5>" + m.title + "</h5>" + "<p>" + m.details + "</p>";
                    });
                }
                return message;
            }

            /*
             * Group Utils: used to situate a step is the steps tree
             */

            // Given a step object, returns its id in the script or undefined if it not in the list.
            // N.B.: the function is 'public' because the formula processors need it to send the position of the
            // step they're validating to the backend.
            $scope.findStepId = function(step) {
                var steps = $scope.shaker.steps;
                for (var stepId=0; stepId <steps.length; stepId++) {
                    if (steps[stepId] === step) {
                        return {'id':stepId, 'subId':undefined, 'depth':0};
                    }
                    if (steps[stepId].metaType == "GROUP") {
                        for (var subStepId=0; subStepId<steps[stepId].steps.length; subStepId++) {
                            var subStep = steps[stepId].steps[subStepId];
                            if (step == subStep) {
                                return {'id':stepId, 'subId':subStepId, 'depth':1};
                            }
                        }
                    }
                }
                return undefined;
            };

            $scope.findStepFlattenIndex = function(step) {
                let counter = 0;
                
                var findStepFlattenIndexInArray = function(arr, step) {
                    for (var i = 0; i<arr.length; i++) {
                        var currStep = arr[i];
                        if (currStep==step) {
                            return counter;
                        } else {
                            counter++;
                            if (currStep.metaType == 'GROUP') {
                                var recRet = findStepFlattenIndexInArray(currStep.steps, step);
                                if (recRet != -1) {
                                    return recRet;
                                }
                            }
                        }
                    }
                    return -1;
                }
                return findStepFlattenIndexInArray($scope.shaker.steps, step);
            }

            $scope.recursiveStepsFilter = function(filteringProp) {
                var recursiveStepsFilterInArray = function(arr, filteringProp) {
                    var filteredList = arr.filter(Fn.prop(filteringProp));
                    var groups = arr.filter(function(s) { return s.metaType === 'GROUP'; })
                    for (var i = 0; i < groups.length; i++) {
                        filteredList = filteredList.concat(recursiveStepsFilterInArray(groups[i].steps, filteringProp));
                    }
                    return filteredList;
                }
                return recursiveStepsFilterInArray($scope.shaker.steps, filteringProp);
            }

            $scope.findGroupIndex = null;
            $scope.$watch('shaker.steps', function(nv, ov) {
                if (nv) {
                    var tmpFindGroupIndex = Array.prototype.indexOf.bind($scope.shaker.steps.filter(function(s) { return s.metaType === 'GROUP'; }));
                    $scope.findGroupIndex = function(step) {
                        const groupIndex = tmpFindGroupIndex(step);
                        return groupIndex < 0 ? '' : groupIndex + 1;
                    }
                }
            }, true);

            var isGroupFatherOfStep = function (group, step) {
                if (group.metaType != 'GROUP' || group.steps.length == 0 || step.metaType != 'PROCESSOR') {
                    return false;
                }
                for (var subId = 0; subId < group.steps.length; subId++) {
                    if (group.steps[subId] == step) {
                        return true;
                    }
                }
                return false;
            }

            // when selecting a group, if its children are also selected, make sure they aren't in both
            // the group's steps and in the main steps
            function removeExtraChildren(steps) {
                steps = angular.copy(steps);

                let groups = steps.filter(_ => _.metaType === 'GROUP');
              
                groups.forEach(group => {
                    const stepCount = group.steps.length;
                    const intersection = steps.filter(step => group.steps.indexOf(step) !== -1);

                    // if some substeps but not all are selected, only keep those
                    if (intersection.length && intersection.length !== stepCount) {
                        group.steps = intersection;
                    }
                });

                // if any group already includes the step, remove it
                return steps.filter(step => !groups.some(group => group.steps.includes(step)));
            }

            /*
                A group counts as 1 step, regardless if its children
                are selected or not
            */
            $scope.getNumberOfSteps = function(steps) {
                steps = removeExtraChildren(steps);
                const groups = steps.filter(_ => _.metaType === 'GROUP' && _.steps && _.steps.length);

                // don't include the group itself in the step count (but include its children)
                return groups.reduce((acc, _) => acc + _.steps.length, steps.length - groups.length);
            }
            
            // returns a sorted subset of steps based on the entire set of shaker steps
            function sortSteps(steps) {
                let indices = steps.map(_ => $scope.findStepFlattenIndex(_));

                return indices
                    .map((_, i) => i) // create array of numbers from 0 to steps.length
                    .sort((a, b) => indices[a] - indices[b]) // sort indices array 
                    .map(_ => steps[_]); // sort steps based on the indices
            }

            /*
             * Selecting
             */

            $scope.openStep = function(step, onOpenCallback) {
                $scope.currentStep = step;
                window.setTimeout(function() {
                	if (onOpenCallback && typeof(onOpenCallback) == "function") {
                		onOpenCallback(step);
                	} else {
                		$("ul.steps").find("div.active input[type='text']").first().focus();
                	}
                }, 0);
            }

            $scope.toggleStep = function(step) {
                if ($scope.currentStep != step) {
                    $scope.openStep(step);
                } else {
                    $scope.currentStep = null;
                }
            }

            $scope.toggleStepSelection = function(step, $event) {
                if (typeof $scope.activeShakerMenu === 'function') {
                    $scope.activeShakerMenu();
                }

                var selectedSteps = $scope.getSelectedSteps();
                if ($event.shiftKey && selectedSteps.length > 0) {
                    var range1 = getRangeStep(step, selectedSteps[0]);
                    var range2 = getRangeStep(step, selectedSteps[selectedSteps.length-1]);
                    var isAllStepInRange1Selected = range1.filter(Fn.prop('selected')).length == range1.length;
                    var isAllStepInRange2Selected = range2.filter(Fn.prop('selected')).length == range2.length;
                    var rangeToSelect;
                    if (isAllStepInRange1Selected && isAllStepInRange2Selected) {
                        rangeToSelect = range2.length < range1.length ? range2 : range1;
                        for (var i = 0; i<rangeToSelect.length; i++) {
                            rangeToSelect[i].selected = false;
                        }
                        step.selected = true;
                    } else {
                        rangeToSelect = range2.length > range1.length ? range2 : range1;
                        $scope.unselectSteps();
                        for (var i = 0; i<rangeToSelect.length; i++) {
                            rangeToSelect[i].selected = true;
                        }
                    }
                } else {
                    step.selected = !step.selected;
                    if (!step.selected && step.metaType == "GROUP") {
                        // unselecting a group => unselect its contents as well, otherwise you could not notice they're still selected (if the group is folded)
                        // in the other direction (selecting) it's fine
                        step.steps.forEach(function(subStep) {subStep.selected = false;});
                    }
                }
            }

            var getRangeStep = function(fromStep, toStep) {
                //Return next step in group, null if stepId is the last step in group
                var getNextStepInGroup = function(stepId, group) {
                    return stepId.depth!=0 && stepId.subId < group.steps.length - 1 ? group.steps[stepId.subId+1] : null;
                }
                //Return next step in level 0, null if stepId is last the last step in level 0
                var getNextStep = function(stepId) {
                    return stepId.depth==0 && stepId.id < $scope.shaker.steps.length - 1 ? $scope.shaker.steps[stepId.id + 1] : null;
                }
                // Return the next visual step
                var getNextStepMultipleLevel = function(step) {
                    var stepId = $scope.findStepId(step);
                    if (stepId.depth == 1) {
                        var group = $scope.shaker.steps[stepId.id];
                        return getNextStepInGroup(stepId, group)!=null ? getNextStepInGroup(stepId, group) : getNextStep({depth: 0, id : stepId.id, subId : undefined});
                    } else {
                        if (step.metaType != "GROUP") {
                            return getNextStep(stepId);
                        } else {
                            if (step.steps.length > 0) {
                                return step.steps[0];
                            } else {
                                return getNextStep(stepId);
                            }
                        }
                    }
                }
                // Returns range of step between toSteps and fromSteps included. fromStep must be before toStep (ie: fromStep's id must be inferior to toStep's id)
                // Returns null if toStep was never found while iterating (ie: toStep does not exist or toStep is before fromStep)
                var getRange = function(fromStep, toStep) {
                   var range = [];
                   var nextStep = fromStep;
                   while (nextStep!=toStep && nextStep!=null) {
                       range.push(nextStep);
                       nextStep = getNextStepMultipleLevel(nextStep);
                   }
                   range.push(nextStep);
                   return nextStep ? range : null;
                }
                // compare fromStep's id and toStep's id and call getRange
                var c = compareStepId($scope.findStepId(fromStep), $scope.findStepId(toStep));
                if (c == 0) {
                    return [fromStep];
                } else if (c < 0 ) {
                    return getRange(fromStep, toStep);
                }  else {
                    return getRange(toStep, fromStep);
                }
            }

            var compareStepId = function(stepId1, stepId2) {
                if (stepId1.id != stepId2.id) {
                    return stepId1.id > stepId2.id ? 1 : -1;
                }
                var subId1 = typeof(stepId1.subId)!=='undefined' ? stepId1.subId : -1;
                var subId2 = typeof(stepId2.subId)!=='undefined' ? stepId2.subId : -1;
                if (subId1 == subId2) {
                    return 0;
                }
                return subId1 > subId2 ? 1 : -1;
            }

            /*
             * Search
             */
            $scope.query = {'val' : ''};

            $scope.searchSteps = function() {

                var searchStepArray = function(arr, processors, query) {
                    query = query.toLowerCase();
                    for (var id = 0; id < arr.length; id ++) {
                        var step = arr[id];
                        var str;
                        if (step.metaType == 'GROUP') {
                            str = $scope.getGroupName(step);
                            searchStepArray(step.steps, processors, query);
                        } else {
                            str = $scope.getStepDescription(step, processors);
                        }
                        str = str.toLowerCase();
                        if (str.indexOf(query)!=-1) {
                            step.match = true;
                        } else {
                            step.match = false;
                        }
                    }
                }

                var removeCloseOnMatchFlag = function() {
                    var stepsToUnflag = $scope.recursiveStepsFilter('closeOnMatch');
                    stepsToUnflag.forEach(function(el) {
                       delete el.closeOnMatch;
                    });
                }

                removeCloseOnMatchFlag();
                var query = $scope.query.val;
                if (query.length > 0) {
                    searchStepArray($scope.shaker.steps, $scope.processors, query);
                    var matchs = $scope.recursiveStepsFilter('match');
                    if (matchs.length > 0) {
                        var firstMatch = matchs[0];
                        var firstMatchDomIndex = $scope.findStepFlattenIndex(firstMatch);
                        $('.processor')[firstMatchDomIndex].scrollIntoView();
                    }
                } else {
                    $scope.unmatchSteps();
                }
            }

            $scope.getStepDescription = function(step, processors) {
                var processor = $filter('processorByType')($scope.processors, step.type);
                return ShakerProcessorsUtils.getStepDescription(processor, step.type, step.params);
            }

            $scope.unmatchSteps = function() {
                var unmatchStepsArray = function(arr) {
                    for (var id = 0; id < arr.length; id++) {
                        var step = arr[id];
                        step.match = false;
                        if (step.metaType == 'GROUP') {
                            unmatchStepsArray(step.steps);
                        }
                    }
                }
                unmatchStepsArray($scope.shaker.steps);
            };

            /*
             * Selecting
             */
            $scope.getSelectedSteps = function() {
                return $scope.recursiveStepsFilter('selected');
            }

            $scope.isAllStepsSelected = function() {
                var isAllStepsSelectedInArray = function(arr) {
                    for (var i=0; i<arr.length; i++) {
                        var step = arr[i];
                        if (!step.selected) {
                            return false;
                        }
                        if (step.metaType == "GROUP" && !isAllStepsSelectedInArray(step.steps)) {
                            return false;
                        }
                    }
                    return true;
                }
                return typeof($scope.shaker) !== 'undefined' && isAllStepsSelectedInArray($scope.shaker.steps);
            }

            $scope.isNoStepSelected = function() {
                var isNoStepSelectedInArray = function(arr) {
                    for (var i=0; i<arr.length; i++) {
                        var step = arr[i];
                        if (step.selected) {
                            return false;
                        }
                        if (step.metaType == "GROUP" && !isNoStepSelectedInArray(step.steps)) {
                            return false;
                        }
                    }
                    return true;
                }
                return typeof($scope.shaker) !== 'undefined' && isNoStepSelectedInArray($scope.shaker.steps);
            }

            $scope.selectAllSteps = function() {
                // on initial selection, only select steps currently filtered by search box
                const steps = $scope.recursiveStepsFilter('match').length && $scope.isNoStepSelected() ? $scope.recursiveStepsFilter('match') : $scope.shaker.steps;
                const selectAllStepsInArray = function(arr) {
                    for (var i=0; i<arr.length; i++) {
                        var step = arr[i];
                        step.selected = true;
                        if (step.metaType == "GROUP") {
                            selectAllStepsInArray(step.steps);
                        }
                    }
                }
                selectAllStepsInArray(steps);
            }

            $scope.unselectSteps = function() {
                var unselectStepsInArray = function(arr) {
                    for (var i=0; i<arr.length; i++) {
                        var step = arr[i];
                        step.selected = false;
                        if (step.metaType == "GROUP") {
                            unselectStepsInArray(step.steps);
                        }
                    }
                }
                unselectStepsInArray($scope.shaker.steps);
            }

            /*
             * Grouping
             */
            $scope.canGroupSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                for (var i = 0; i < selectedSteps.length; i++) {
                    var step = selectedSteps[i];
                    if (step.metaType == 'GROUP' || $scope.findStepId(step).depth == 1) {
                        return false;
                    }
                }
                return selectedSteps.length > 1;
            }

            /*
             * Add to an existing group
             * 
             * Optional to pass a list of steps, otherwise just use what is selected
             */
            $scope.canAddMoreStepsToGroup = function(steps) {
                for (var i = 0; i < steps.length; i++) {
                    var step = steps[i];
                    if (step.metaType == 'GROUP') {
                        return false;
                    }
                }

                return steps.length && $scope.shaker.steps.filter(function(s) { return s.metaType === 'GROUP'; }).length;
            }

            $scope.addMoreStepsToGroup = function(group, steps) {                
                if ($scope.canAddMoreStepsToGroup(steps)) {
                    const newSteps = steps.map(_ => {
                        _.selected = false
                        return _;
                    });                    
                    
                    //removing steps to be grouped from shaker's steps list
                    const removedGroups = [...new Set(steps.map(_ => $scope.findStepId(_)).map(_ => $scope.shaker.steps[_.id]))]
                    $scope.groupChanged.removedStepsFrom = removedGroups;
                    steps.forEach((_) => removeStepNoRefresh(_));

                    group.steps = group.steps.concat(newSteps);
                    $scope.groupChanged.addedStepsTo = group;

                    $scope.autoSaveForceRefresh();
                }
            };

            $scope.groupSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                if ($scope.canGroupSelectedSteps()) {
                    // creating group
                    var group = {
                        metaType : "GROUP",
                        steps : []
                    }
                    //prepopulating its steps list in some extra array
                    var groupSteps = [];
                    for (var i = 0; i<selectedSteps.length; i++) {
                        var step = selectedSteps[i];
                        step.selected = false;
                        groupSteps.push(step);
                    }
                    //placing it in shaker's steps list
                    var groupId = $scope.findStepId(selectedSteps[0]).id;
                    $scope.shaker.steps[groupId] = group;
                    //removing steps to be grouped from shaker's steps list
                    for (var i = 0; i<selectedSteps.length; i++) {
                        var step = selectedSteps[i];
                        removeStepNoRefresh(step);
                    }
                    //finally setting new group's steps list
                    group.steps = groupSteps;
                    //saving
                    $scope.autoSaveForceRefresh();
                    $scope.groupChanged.justCreated = true;
                }
            }

            $scope.canUngroupSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                for (var i = 0; i < selectedSteps.length; i++) {
                    var step = selectedSteps[i];
                    if (step.metaType != 'GROUP' && $scope.findStepId(step).depth == 0) {
                        return false;
                    }
                }
                return selectedSteps.length > 0;
            }

            $scope.ungroupSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                var selectedProcessors = selectedSteps.filter(function(el) {
                    return el.metaType != 'GROUP';
                });
                var selectedGroups = selectedSteps.filter(function(el) {
                    return el.metaType == 'GROUP';
                });
                var unpopedGroups = [];
                for (var i=0; i<selectedProcessors.length; i++) {
                    var step = selectedProcessors[i];
                    var stepId = $scope.findStepId(step);
                    var group = $scope.shaker.steps[stepId.id];
                    //is step is not among list of groups to ungroup we take it out of its group
                    if (selectedGroups.indexOf(group)==-1) {
                        group.steps.splice(stepId.subId, 1);
                        $scope.shaker.steps.splice(stepId.id,0,step);
                        //later we'll check if the group the current step used to belong to is now empty
                        if (unpopedGroups.indexOf(group)==-1) {
                            unpopedGroups.push(group);
                        }
                    }
                }
                //going through all groups unpopulated during previous loop and deleting theme if empty
                for (var i=0; i<unpopedGroups.length; i++) {
                    var group = unpopedGroups[i];
                    if (group.steps.length == 0) {
                        var id = $scope.shaker.steps.indexOf(group);
                        $scope.shaker.steps.splice(id, 1);
                    }
                }
                for (var i = 0; i < selectedGroups.length; i++) {
                    $scope.ungroup(selectedGroups[i], true);
                }
                $scope.autoSaveForceRefresh();
            }

            /*
             * Deletes a group and puts all its steps at its previous index in the same order they used to be in the group
             */
            $scope.ungroup = function(step, noRefresh) {
                if (step.metaType == "GROUP") {
                    var groupIndex = $scope.findStepId(step).id;
                    var spliceArgs = [groupIndex, 1].concat(step.steps);
                    Array.prototype.splice.apply($scope.shaker.steps, spliceArgs);
                    if (!noRefresh) {
                        $scope.autoSaveForceRefresh();
                    }
                }
            }

            /*
             * Disabling
             */
            $scope.toggleDisableSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                var allStepsDisabled = true;
                for (var i = 0; i<selectedSteps.length; i++) {
                    if (!selectedSteps[i].disabled) {
                        allStepsDisabled = false;
                        break;
                    }
                }
                for (var i = 0; i<selectedSteps.length; i++) {
                    if (allStepsDisabled) {
                        enableStepNoRefresh(selectedSteps[i]);
                    } else {
                        disableStepNoRefresh(selectedSteps[i]);
                    }
                }
                $scope.autoSaveForceRefresh();
            }

            /*
             * Deleting
             */
            var inModal = false;
            $scope.deleteSelectedSteps = function(evt) {
                // Delete selected steps, or all if
                // no step is selected.
                if (inModal)
                    return;
                if (evt.type=="keydown") {
                    var $focusedEl = $("input:focus, textarea:focus");
                    if ($focusedEl.length > 0) {
                        return;
                    }
                }

                // TODO prompt the user here.
                var stepsToDelete = $scope.getSelectedSteps();
                if (stepsToDelete.length == 0) {
                    stepsToDelete = $scope.shaker.steps;
                }
                if (stepsToDelete.length > 0) {
                    stepsToDelete = stepsToDelete.slice(0);
                    var dialogScope = $scope.$new();
                    dialogScope.stepsToDelete = stepsToDelete;
                    dialogScope.cancel = function() {
                        inModal = false;
                    }
                    dialogScope.perform = function() {
                        inModal = false;
                        for (var i=0; i<stepsToDelete.length; i++) {
                            var step = stepsToDelete[i];
                            removeStepNoRefresh(step);
                        }
                        $scope.autoSaveForceRefresh();
                    }
                    inModal = true;
                    CreateModalFromTemplate("/templates/widgets/delete-step-dialog.html", dialogScope);
                }
            }


            $scope.remove = function(step) {
                $('.processor-help-popover').popover('hide');//hide any displayed help window
                $scope.removeStep(step.step);
            };

            /*
             * Coloring
             */
            $scope.uncolorStep = function(step) {
                delete step.mainColor;
                delete step.secondaryColor;

                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }

            $scope.colorStep = function(step, main, secondary) {
                step.mainColor = main;
                step.secondaryColor = secondary;

                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }

            $scope.uncolorSelectedSteps = function() {
                var selectedSteps = $scope.getSelectedSteps();
                for (var i = 0; i<selectedSteps.length; i++) {
                    var step = selectedSteps[i];
                    delete step.mainColor;
                    delete step.secondaryColor;
                }
                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }

            $scope.colorSelectedSteps = function(main, secondary) {
                var selectedSteps = $scope.getSelectedSteps();
                for (var i = 0; i<selectedSteps.length; i++) {
                    var step = selectedSteps[i];
                    step.mainColor = main;
                    step.secondaryColor = secondary;
                }
                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }

            /*
             * Validating scipt
             */

            /**
             * Performs JS validation of the whole script.
             * Sets frontError on all invalid steps.
             *
             * Returns true if script is ok, false if script is NOK
             */
            $scope.validateScript = function() {
                var nbBadProc = 0;
                function validateProcessor(proc) {
                    if (!proc.$stepState) proc.$stepState = {}
                    proc.$stepState.frontError = $scope.validateStep(proc);
                    if (proc.$stepState.frontError) {
                        ++nbBadProc;
                    }
                }
                $scope.shaker.steps.forEach(function(step) {
                    if (step.metaType == "GROUP") {
                        step.steps.forEach(validateProcessor);
                    } else {
                        validateProcessor(step);
                    }
                });
                if (nbBadProc > 0) {
                    return false;
                } else {
                    return true;
                }
            }


            /* Perform JS validation of the step. Does not set frontError */
            $scope.validateStep = function(step) {
                if (step.metaType == "GROUP") {
                    if (step.steps != null) {
                        for (var i = 0; i < step.steps; i++) {
                            var subvalidationResult = $scope.validateStep(step.steps[i]);
                            if (subvalidationResult) return subvalidationResult;
                        }
                    }
                } else {
                    var processorType = $filter('processorByType')($scope.processors, step.type);
                    /* If we have some stepParams, then check using them */
                    if (processorType.params) {
                        for (var paramIdx in processorType.params) {
                            var param = processorType.params[paramIdx];
                            var value = step.params[param.name];
                            if (param.mandatory && !param.canBeEmpty && (value == null || value.length === 0)) {
                                return new StepIAE("Missing parameter: " + (param.label || param.name));
                            }
                        }
                    }
                    /* Then also play the specific validation of each step */
                    if (ShakerProcessorsInfo.get(step.type).checkValid){
                        try {
                            ShakerProcessorsInfo.get(step.type).checkValid(step.params);
                        } catch (e) {
                            return e;
                        }
                    }
                }
                return null;
            };

            /*
             * Factorising script steps
             */

            $scope.mergeLastColumnDeleters = function() {
                var deletedColumns = [];
                var deletedFromIndex = $scope.shaker.steps.length;
                for(var i = $scope.shaker.steps.length-1 ; i >= 0; i--) {
                    var step = $scope.shaker.steps[i];
                    if(step.type=='ColumnsSelector' && (step.params.appliesTo === "SINGLE_COLUMN" || step.params.appliesTo === "COLUMNS") && (step.params.keep=="false" || step.params.keep==false)) {
                        deletedColumns = deletedColumns.concat(step.params.columns);
                        deletedFromIndex = i;
                    } else {
                        break;
                    }
                }

                if(deletedColumns.length>0 && deletedFromIndex != $scope.shaker.steps.length) {
                    $scope.shaker.steps.splice(deletedFromIndex,$scope.shaker.steps.length-deletedFromIndex);
                    $scope.addStepNoPreview("ColumnsSelector", {
                        "appliesTo": deletedColumns.length > 1 ? "COLUMNS" : "SINGLE_COLUMN",
                        "keep": false,
                        "columns": deletedColumns
                    });
                }
            }

            $scope.mergeLastColumnRenamers = function() {
                var renamedColumns = [];
                var renamedFromIndex = $scope.shaker.steps.length;
                for(var i = $scope.shaker.steps.length-1 ; i >= 0; i--) {
                    var step = $scope.shaker.steps[i];
                    if(step.type=='ColumnRenamer') {
                        renamedColumns = step.params.renamings.concat(renamedColumns);
                        renamedFromIndex = i;
                    } else {
                        break;
                    }
                }

                if(renamedColumns.length>0 && renamedFromIndex != $scope.shaker.steps.length) {
                    $scope.shaker.steps.splice(renamedFromIndex,$scope.shaker.steps.length-renamedFromIndex);
                    $scope.addStepNoPreview("ColumnRenamer", {
                        "renamings": renamedColumns
                    });
                }
            }

            $scope.mergeLastColumnReorders = function() {
                // We'll only look at the last step and the step before...
                let stepCount = $scope.shaker.steps.length;
                if (stepCount < 2) {
                    return;
                }
                let lastStep = $scope.shaker.steps[stepCount - 1]; // last step
                let penultimateStep = $scope.shaker.steps[stepCount - 2]; // step before last step
                if (lastStep.type !== "ColumnReorder" || penultimateStep.type !== "ColumnReorder") {
                    return;
                }
                if ((lastStep.params.appliesTo !== "SINGLE_COLUMN" && lastStep.params.appliesTo !== "COLUMNS") ||
                    (penultimateStep.params.appliesTo !== "SINGLE_COLUMN" && penultimateStep.params.appliesTo !== "COLUMNS")) {
                    return;
                }
                // At this point the last two steps are ColumnReorder steps dealing with specific columns. Let's merge them if possible.

                // If the new step operates on a column that is already present in the penultimate step,
                // we remove this column from the penultimate step.
                let lastColumns = lastStep.params.columns;
                let lastAction = lastStep.params.reorderAction;
                let lastRefColumn = lastStep.params.referenceColumn;
                let penultimateColumns = penultimateStep.params.columns;
                let penultimateAction = penultimateStep.params.reorderAction;
                let penultimateRefColumn = penultimateStep.params.referenceColumn;

                penultimateColumns = penultimateColumns.filter(col => !lastColumns.includes(col));
                if (penultimateColumns.length === 0) {
                    // Penultimate step is now empty, remove it.
                    $scope.shaker.steps.splice(stepCount - 2, 2);
                    $scope.addStepNoPreview("ColumnReorder", lastStep.params);
                }

                // Merge the 2 steps if they both move the columns at start/end or before/after the same reference column.
                else if ((lastAction === "AT_END" && penultimateAction === "AT_END") ||
                        (lastAction === "BEFORE_COLUMN" && penultimateAction === "BEFORE_COLUMN" && lastRefColumn === penultimateRefColumn) ||
                        (lastAction === "AFTER_COLUMN" && penultimateAction === "AFTER_COLUMN" && lastRefColumn === penultimateRefColumn)) {
                    $scope.shaker.steps.splice(stepCount - 2, 2);
                    penultimateStep.params.columns = penultimateColumns.concat(lastColumns);
                    penultimateStep.params.appliesTo = "COLUMNS";
                    $scope.addStepNoPreview("ColumnReorder", penultimateStep.params);
                }
                else if ((lastAction === "AT_START" && penultimateAction === "AT_START")) {
                    $scope.shaker.steps.splice(stepCount - 2, 2);
                    penultimateStep.params.columns = lastColumns.concat(penultimateColumns);
                    penultimateStep.params.appliesTo = "COLUMNS";
                    $scope.addStepNoPreview("ColumnReorder", penultimateStep.params);
                }

                // Merge the 2 steps if the last step uses - as reference column - a column that is moved by the penultimate step.
                // (but not if one of the columns moved in the last steps are not a reference column in the penultimate step)
                else if ((lastAction === "BEFORE_COLUMN" || lastAction === "AFTER_COLUMN") && penultimateColumns.includes(lastRefColumn)
                        && !((penultimateAction === "BEFORE_COLUMN" || penultimateAction === "AFTER_COLUMN") && lastColumns.includes(penultimateRefColumn))) {
                    let columnIndex = penultimateColumns.indexOf(lastRefColumn);
                    if (lastAction === "AFTER_COLUMN") {
                        columnIndex++;
                    }
                    for (let i = 0; i < lastColumns.length; i++) {
                        let column = lastColumns[i];
                        penultimateColumns.splice(columnIndex + i, 0, column);
                    }

                    $scope.shaker.steps.splice(stepCount - 2, 2);
                    penultimateStep.params.columns = penultimateColumns;
                    penultimateStep.params.appliesTo = "COLUMNS";
                    $scope.addStepNoPreview("ColumnReorder", penultimateStep.params);
                }
            };

            $scope.mergeLastDeleteRows = function() {
                var firstVRProcessorIdx = $scope.shaker.steps.length;
                var relatedColumn = null, relatedAction = null;
                var defaults = {
                    appliesTo: 'SINGLE_COLUMN',
                    normalizationMode: 'EXACT',
                    matchingMode: 'FULL_STRING'
                };

                for(var i = $scope.shaker.steps.length - 1; i >= 0; i--) {
                    var step = $scope.shaker.steps[i];
                    if (step.type === 'FilterOnValue'
                            && step.params.appliesTo         === defaults.appliesTo
                            && step.params.matchingMode      === defaults.matchingMode
                            && step.params.normalizationMode === defaults.normalizationMode
                            && (relatedAction === null || step.params.action === relatedAction)
                            && step.params.columns && step.params.columns.length === 1 && step.params.columns[0]
                            && (relatedColumn === null || step.params.columns[0] === relatedColumn)) {
                        firstVRProcessorIdx = i;
                        relatedColumn = step.params.columns[0];
                        relatedAction = step.params.action;
                    } else {
                        break;
                    }
                }

                // Not enough processors to trigger a merge
                if($scope.shaker.steps.length - firstVRProcessorIdx - 1 < 1) {
                    return; // Not enough processors to trigger a merge
                }

                var valuesTotal = $scope.shaker.steps.slice(firstVRProcessorIdx).reduce(function (arr, step) {
                        return arr.concat(step.params.values);
                    }, []);
                // Remove previous processors
                $scope.shaker.steps.splice(firstVRProcessorIdx, $scope.shaker.steps.length - firstVRProcessorIdx);

                if (valuesTotal.length > 0) {
                    defaults.action = relatedAction;
                    defaults.columns = [relatedColumn];
                    defaults.values = valuesTotal;
                    $scope.addStep("FilterOnValue", defaults);
                }
            };

            $scope.mergeLastFindReplaces = function() {
                var firstVRProcessorIdx = $scope.shaker.steps.length;
                var relatedColumn = null;
                var defaults = {
                    appliesTo: 'SINGLE_COLUMN',
                    normalization: 'EXACT',
                    matching: 'FULL_STRING'
                };

                for (var i = $scope.shaker.steps.length - 1; i >= 0; i--) {
                    var step = $scope.shaker.steps[i];
                    if (step.type === 'FindReplace'
                            && step.params.appliesTo     === defaults.appliesTo
                            && step.params.matching      === defaults.matching
                            && step.params.normalization === defaults.normalization
                            && !step.params.output  // in-place only
                            && step.params.columns && step.params.columns.length === 1 && step.params.columns[0]
                            && (relatedColumn === null || step.params.columns[0] === relatedColumn)) {
                        firstVRProcessorIdx = i;
                        relatedColumn = step.params.columns[0];
                    } else {
                        break;
                    }
                }

                if($scope.shaker.steps.length - firstVRProcessorIdx - 1 < 1) {
                    return; // Not enough processors to trigger a merge
                }

                var mapping = [];
                // Mapping builder & merger
                function addMapping(add) {
                    if (add.from === null || add.from === undefined) return;
                    var updated = false;
                    // Apply transitivity
                    for (var i = 0; i < mapping.length; i++ ) {
                        var map = mapping[i];
                        if (map.to === add.from) {
                            map.to = add.to;
                        }
                    }
                    // Edit existing mapping for this input
                    for (var i = 0; i < mapping.length; i++ ) {
                        var map = mapping[i];
                        if(map.from === add.from) {
                            map.to = add.to;
                            updated = true;
                            break;
                        }
                    }
                    if (!updated) {
                        mapping.push(add);
                    }
                }

                // Build internal mapping
                for(var i = firstVRProcessorIdx; i < $scope.shaker.steps.length ; i++) {
                    $scope.shaker.steps[i].params.mapping.forEach(addMapping);
                }

                // Remove previous processors
                $scope.shaker.steps.splice(firstVRProcessorIdx,$scope.shaker.steps.length - firstVRProcessorIdx);

                if (mapping.length > 0) {
                    defaults.columns = [relatedColumn];
                    defaults.mapping = angular.copy(mapping);
                    defaults.mapping.push({ from: '', to: '' });
                    $scope.addStep("FindReplace", defaults, false, function(step) {
                        const inputs = $(".steps .active .editable-list__input");
                    	if (inputs.length > 1) {
                    	   $(inputs[inputs.length - 2]).focus();
                    	}
                    });
                }
            };

            /*
             * Column Reordering
             */

            // Callback called when dropping a column while reordering (see fatDraggable directive)
            $scope.reorderColumnCallback = function(draggedColumn, hoveredColumn, columnName, referenceColumnName) {
                let columnOldPosition;
                let columnNewPosition;
                let options = {};

                columnOldPosition = $scope.columns.indexOf(columnName);
                columnNewPosition = $scope.columns.indexOf(referenceColumnName);

                if (columnOldPosition < 0 || columnNewPosition < 0) {
                    return;
                }

                if (columnNewPosition === 0) {
                    options.reorderAction = "AT_START";
                } else if (columnNewPosition === $scope.columns.length - 1) {
                    options.reorderAction = "AT_END";
                } else if (columnOldPosition > columnNewPosition) {
                    options.reorderAction = "BEFORE_COLUMN";
                } else {
                    options.reorderAction = "AFTER_COLUMN";
                }

                options.appliesTo = "SINGLE_COLUMN";
                options.columns = [$scope.columns[columnOldPosition]];

                if (options.reorderAction === "BEFORE_COLUMN" || options.reorderAction === "AFTER_COLUMN") {
                    options.referenceColumn = $scope.columns[columnNewPosition];
                }

                $scope.addStepNoPreviewAndRefresh("ColumnReorder", options);
                $scope.mergeLastColumnReorders();
            };

            /*************************** OTHER ************************************/

            $scope.$watch("shaker.exploreUIParams.autoRefresh", function(nv, ov) {
                // tracking usage of the autorefresh button.
                if ((ov !== undefined) && (ov !== null) && (ov !== nv)) {
                    WT1.event("auto-refresh-set", {
                        "ov": ov,
                        "nv": nv
                    });
                }
            });

            /*
                Menu
            */

           $scope.previewTitle = function(step) {
            return step.preview ? "Stop viewing impact" : "View impact";
            };
            
            $scope.disableTitle = function(step) {
                return step.disabled ? 'Enable step' : 'Disable step';
            };

            $scope.openShakerMenu = function($event, step) {
                // only open menu if we aren't right clicking an input field
                if (!($event.target && ($event.target.tagName === 'INPUT' || $event.target.tagName === 'TEXTAREA'))) {
                    const selectedSteps = $scope.getSelectedSteps();
                    if (selectedSteps.length > 1 && step.selected) {
                        $scope.openActionsMenu($event);
                    } else {
                        $scope.openStepMenu($event, step, true);
                    }
                    
                    $event.preventDefault();
                    $event.stopPropagation();
                }
            }
 
            $scope.openStepMenu = function($event, step, showFullMenu) {
                // dismiss existing menu
                if (typeof $scope.activeShakerMenu === 'function') {
                    $scope.activeShakerMenu();
                }
                
                function isElsewhere() {
                    return true;
                }

                let newScope = $scope.$new();
                newScope.step = step;
                newScope.showFullMenu = showFullMenu;
                newScope.toggleComment = function($event) {
                    if (step.metaType === 'GROUP') {
                        $rootScope.$broadcast('openShakerGroup', step);
                    } else {
                        $scope.openStep(step);
                    }
                    $rootScope.$broadcast('toggleEditingComment', $event, step);
                };

                const template = `
                    <ul class="dropdown-menu" processor-footer>
                        <li ng-if="showFullMenu">
                            <a class="previewbutton"  ng-click="togglePreview(step);"
                                title="{{ previewTitle(step) }}" ng-if="!step.disabled" ng-class="{'previewActive': step.preview}">
                                <i alt="Preview" class="icon-eye-open"  /> {{ previewTitle(step) }}
                            </a>
                        </li>
                        <!-- disable -->
                        <li ng-if="showFullMenu">
                            <a class="disablebutton" ng-click="toggleDisable(step);"
                                title="{{ disableTitle(step) }}">
                                <i alt="Disable" class="icon-off" /> {{ disableTitle(step) }}
                            </a>
                        </li>
                        <li class="dropdown-submenu">
                            <a ng-if="canAddMoreStepsToGroup([step])"><i class="icon-plus "></i>&nbsp; Add to Group</a>
                            <ul class="dropdown-menu step-add-to-group-panel">
                                <li ng-repeat="group in shaker.steps | filter: { metaType: 'GROUP' }">
                                    <a ng-click="addMoreStepsToGroup(group, [step])">{{getGroupName(group)}}</a>
                                </li>
                            </ul>
                        </li>
                        <li>
                            <a class="previewbutton" id="qa_prepare_copy-single" ng-click="copyData([step]);"
                                title="Copy step">
                                <i alt="Copy step" class="icon-dku-copy-step"  /> Copy this {{ step.metaType === 'GROUP' ? 'group' : 'step' }}
                            </a>
                        </li>
                        <li>
                            <a class="previewbutton" id="qa_prepare_open-paste-modal-single" ng-click="openPasteModalFromStep([step]);"
                                title="Paste after" >
                                <i alt="Paste after" class="icon-dku-paste-step"  /> Paste after this {{ step.metaType === 'GROUP' ? 'group' : 'step' }}
                            </a>
                        </li>
                        <li>
                            <a title="comment" ng-click="toggleComment($event)">
                                <i class="icon-info-sign" /> Comment
                            </a>
                        </li>
                        <li class="dropup dropdown-submenu step-color-pannel" step-color-picker>
                            <a><i class="icon-dku-color_picker_2"></i> Color</a>
                            <ul class="dropdown-menu">
                                <li ng-click="uncolorStep(step)"><div class="color"></div></li>
                                <li ng-repeat="color in colors" ng-click="colorStep(step, color.main, color.secondary)">
                                    <div class="color" style="background-color:{{color.secondary}};border-color:{{color.main}}"></div>
                                </li>
                            </ul>
                        </li>
                        <li>
                            <a title="Duplicate step" ng-click="duplicateStep(step)">
                                <i class="icon-dku-clone" /> Duplicate step
                            </a>
                        </li>
                        <!-- delete -->
                        <li ng-if="showFullMenu">
                            <a ng-click="console.log('a');remove({step:step});" title="Delete step">
                                <i class="icon-trash"></i> Delete step
                            </a>
                        </li>
                    </ul>
                `
  
                let dkuPopinOptions = {
                    template: template,
                    isElsewhere: isElsewhere,
                    callback: null,
                    popinPosition: 'CLICK',
                    onDismiss: () => {
                        $scope.activeShakerMenu = null;
                        $scope.activeMenuType = null;
                    }
                };

                $scope.activeShakerMenu = openDkuPopin(newScope, $event, dkuPopinOptions);
            }

            $scope.openActionsMenu = function($event, menuType = 'CLICK') {
                // dismiss existing menu
                if (typeof $scope.activeShakerMenu === 'function') {
                    const previousMenuType = $scope.activeShakerMenuType;
                    $scope.activeShakerMenu();

                    // close actions dropdown if we clicked on it again
                    if (previousMenuType === menuType) {
                        return;
                    }
                }

                $scope.activeShakerMenuType = menuType;
                
                function isElsewhere() {
                    return true;
                }
                
                let newScope = $scope.$new();
                newScope.selectedSteps = $scope.getSelectedSteps();

                const template = `
                    <ul class="dropdown-menu shaker-column-row-popup">
                        <li class="dropdown-submenu">
                            <a ng-if="canAddMoreStepsToGroup(getSelectedSteps())"><i class="icon-plus "></i> Add to Group</a>
                            <ul class="dropdown-menu step-add-to-group-panel">
                                <li ng-repeat="group in shaker.steps | filter: { metaType: 'GROUP' }">
                                    <a ng-click="addMoreStepsToGroup(group, getSelectedSteps())">{{getGroupName(group)}}</a>
                                </li>
                            </ul>
                        </li>
                        <li><a ng-if="canGroupSelectedSteps()" ng-click="groupSelectedSteps()"><i class="icon-folder-close-alt "></i> Group</a></li>
                        <li><a ng-if="canUngroupSelectedSteps()" ng-click="ungroupSelectedSteps()"><i class="icon-folder-open-alt "></i> Ungroup</a></li>
                        <li><a id="qa_prepare_copy-selection" ng-click="copyData(selectedSteps)"><i class="icon-dku-copy-step" /> Copy {{ getNumberOfSteps(selectedSteps) }} {{'step' | plurify: getNumberOfSteps(selectedSteps) }}</a></li>
                        <li><a id="qa_prepare_open-paste-modal-selection" ng-click="openPasteModalFromStep(selectedSteps)"><i class="icon-dku-paste-step" /> Paste after selection</a></li>
                        <li><a ng-click="toggleDisableSelectedSteps()"><i class="icon-off" /> Toggle enable/disable</a></li>
                        <li><a ng-click="deleteSelectedSteps($event)"><i class="icon-trash" /> Delete</a></li>
                        <li class="dropup dropdown-submenu step-color-pannel" step-color-picker>
                            <a><i class="icon-dku-color_picker_2"></i> Color</a>
                            <ul class="dropdown-menu">
                                <li ng-click="uncolorSelectedSteps()"><div class="color"></div></li>
                                <li ng-repeat="color in colors" ng-click="colorSelectedSteps(color.main, color.secondary)">
                                    <div class="color" style="background-color:{{color.secondary}};border-color:{{color.main}}"></div>
                                </li>
                            </ul>
                        </li>
                    </ul>
                `

                let dkuPopinOptions = {
                    template: template,
                    isElsewhere: isElsewhere,
                    callback: null,
                    popinPosition: menuType,
                    onDismiss: () => {
                        $scope.activeShakerMenu = null;
                        $scope.activeMenuType = null;
                    }
                };

                $scope.activeShakerMenu = openDkuPopin(newScope, $event, dkuPopinOptions);
            }

        }
    }
});


app.directive('groupNameEditor', [ '$timeout', function($timeout) {
    return {
        scope: true,
        restrict: 'A',
        link : function($scope, element, attrs) {
            $scope.showGroupNameForm = false;

            $scope.toggleGroupNameForm = function($event) {
                $scope.showGroupNameForm = !$scope.showGroupNameForm;
                if ($scope.showGroupNameForm) {
                    $timeout(function() {
                        $($event.target).siblings('fieldset').find('input').focus();
                    }, false);
                }
            }

            if ($scope.groupChanged.justCreated) {
                $timeout(function() {
                    angular.element(element).find('.show-group').triggerHandler('click');
                });
                $scope.groupChanged.justCreated = false;
            }
        }
    };
}]);


app.directive('processorFooter', [ '$timeout', function($timeout) {
    return {
        scope: true,
        restrict : 'A',
        link : function($scope, element, attrs) {

            //flag for edition state
            $scope.editingComment = false;

            /*
             * Display/Hide methods
             */

            $scope.showFooter = function (expanded) {
                return expanded || $scope.showComment(expanded) || $scope.showCommentEditor(expanded);
            }

            $scope.showComment = function(expanded) {
                return $scope.hasComment() && ($scope.step.alwaysShowComment || expanded) && !$scope.showCommentEditor(expanded);
            }

            $scope.showCommentEditor = function(expanded) {
                return $scope.editingComment && expanded;
            }

            /*
             * Display/Hide utils
             */

            $scope.hasComment = function() {
                return typeof($scope.step.comment) !== 'undefined' && $scope.step.comment.length > 0;
            }

            /*
             * Comment editor utils
             */

            $scope.toggleEditingComment = function ($event) {
                $scope.editingComment = !$scope.editingComment;
                if (!$scope.editingComment) {
                    $scope.saveComment();
                }
            }
            
            $scope.$on('toggleEditingComment', (e, $event, step) => {
                if ($scope.step === step) {
                    $scope.toggleEditingComment($event);
                }
            });

            $scope.saveComment = function() {
                $scope.editingComment = false;
                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }

            $scope.deleteComment = function() {
                $scope.step.comment = undefined;
                $scope.editingComment = false;
                if (!$scope.isRecipe){
                	$scope.saveOnly();
                }
            }


        }
    }
}]);
app.directive('stepColorPicker', [ 'ContextualMenu', function(ContextualMenu) {
   return {
       scope: true,
       restrict : 'A',
       link : function($scope, element, attrs) {
           $scope.colors = [
                {
                    main: '#ff9c00',
                    secondary: '#f4e0c1'
                },
                {
                    main: '#ffdc00',
                    secondary: '#f4edc1'
                },
                {
                    main: '#30c2ff',
                    secondary: '#cae8f4'
                },

                {
                    main: '#61c1b0',
                    secondary: '#d4e7e4'
                },
                {
                    main: '#90d931',
                    secondary: '#deeccb'
                },

           ];

           $scope.colorMenu = new ContextualMenu({
               template: "/templates/shaker/step-color-picker.html",
               cssClass : "step-color-picker",
               scope: $scope,
               contextual: false,
               onClose: function() {
                   $scope.stepToColor = undefined;
               }
           });

           $scope.openColorPicker = function(step, $event) {
               $scope.colorMenu.openAtXY($($event.target).offset().left, $($event.target).offset().top + $($event.target).height(), function() {}, true, false);
               $scope.stepToColor = step;
           }

           $scope.setStepColor = function(main, secondary) {
               $scope.stepToColor.mainColor = main;
               $scope.stepToColor.secondaryColor = secondary;
               if (!$scope.isRecipe){
               	$scope.saveOnly();
               }
           }

           $scope.removeStepColor = function() {
               delete $scope.stepToColor.mainColor;
               delete $scope.stepToColor.secondaryColor;
               if (!$scope.isRecipe){
               	$scope.saveOnly();
               }
           }
       }
   }
}]);


})();
