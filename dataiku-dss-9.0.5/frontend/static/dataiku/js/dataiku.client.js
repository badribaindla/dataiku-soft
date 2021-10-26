(function() {
'use strict';


window.dataiku = {};

var resolveDatasetFullName = function(smartName) {
    if (smartName.indexOf(".") > 0) {
        var chunks = smartName.split(".");
        return {projectKey: chunks[0], datasetName: chunks[1]}
    } else {
        return {projectKey: defaultProjectKey, datasetName: smartName};
    }
};

function DataFrame(resp) {
    // For debugging purposes only
    this.__resp = resp;

    /* helper class to access the API results. */

    var columns = resp.columns;
    var rows = resp.rows;

    this.getNbRows = function() {
        // Returns the number of rows in the dataframe
        return rows.length;
    }

    this.getRow = function(rowIdx) {
        // Returns an array representing the row with
        // a given row id
        return rows[rowIdx];
    }

    this.getColumnNames = function() {
        // Returns an array of column names
        return columns;
    }

    this.getRows = function() {
        // Returns an array with the dataframe rows
        return rows;
    }

    this.getRecord = function(rowId) {
        // Returns a record object of the row with the given rowId.
        var row = this.getRow(rowId);
        var record = {};
        for (var i=0; i < columns.length; i++) {
            var column = columns[i];
            record[column] = row[i];
        }
        record.$rowId = rowId
        return record;
    }

    this.mapRows = function(f) {
        // Returns the array [ f(row[0]), f(row[1]), ... , f(row[N-1]) ]
        var res = [];
        for (var i=0; i<rows.length; i++) {
            var row = this.getRow(i);
            res.push(f(row, i));
        }
        return res;
    }

    this.mapRecords = function(f) {
        // Returns the array [ f(record[0]), f(record[1]), ... , f(record[N-1]) ]
        var res = [];
        for (var i=0; i<rows.length; i++) {
            var record = this.getRecord(i);
            res.push(f(record, i));
        }
        return res;
    }

    this.getColumnValues = function(colName) {
        // Return an array containing the values of the column <columnName>
        var columnIdx = this.getColumnIdx(colName);
        if (columnIdx == -1) {
            throw "Column " + colName + " is unknown.";
        }
        return this.mapRows(function(row) { return row[columnIdx]; });
    }

    this.getColumnIdx = function(colName) {
        // Returns the columnIdx of the column baring the name colName
        // This idx can be used to lookup in the array returned by getRow.
        // Returns -1 if the column name is not found.
        return columns.indexOf(colName);
    }
};

function Schema(resp) {
    // For debugging purposes only
    this.__resp = resp;

    /* helper class to access the API results. */

    var columns = resp.columns;

    this.getNbColumns = function() {
        // Returns the number of columns in the dataset
        return columns.length;
    }

    this.getColumns = function() {
        // Returns columns in the dataset
        return columns.concat([]);
    }

    this.getColumnNames = function() {
        // Returns an array of column names
        return columns.map(column => column.name);
    }

    this.getColumnTypes = function() {
        // Returns an array of column types
        return columns.map(column => column.type);
    }

    this.getColumnIdx = function(colName) {
        // Returns the columnIdx of the column baring the name colName
        // Returns -1 if the column name is not found.
        var idx = -1;
        columns.forEach(function(column, i) {
            if (column.name == colName) {
                idx=i;
            }
        });
        return idx;
    }

    this.getColumn = function(colName) {
        // Returns the column info of the column baring the name colName
        // Returns null if the column name is not found.
        var idx = getColumnIdx(colName);
        return idx >= 0 ? columns[idx] : null;
    }
};


dataiku.defaultAPIKey = undefined;

dataiku.setAPIKey = function(apiKey) {
    dataiku.defaultAPIKey = apiKey;
};

dataiku.setDefaultProjectKey = function(projectKey) {
    dataiku.defaultProjectKey = projectKey;
};

dataiku._createSamplingArg = function(options) {
    /* Difference between Python and JS API:
     * In python, no sampling means FULL. In JS, as it's in RAM,
     * no sampling means HEAD(20000) */
    if (!options.sampling) {
        return { "samplingMethod" : "HEAD_SEQUENTIAL" , "maxRecords" : options.limit || 20000 }
    } else if (options.sampling == 'full') {
        return {
            samplingMethod : "FULL"
        }
    } else if (options.sampling == "head") {
        if (options.limit == null) {
            throw "'limit' is a required argument for 'head' sampling"
        }
        return {
            "samplingMethod": "HEAD_SEQUENTIAL",
            "maxRecords": options.limit
        }
    } else if (options.sampling == "random") {
        if (options.ratio != null && options.limit != null) {
            throw "Cannot set both ratio and limit for random sampling";
        } else if (options.ratio) {
             return {
                "samplingMethod": "RANDOM_FIXED_RATIO",
                "targetRatio": options.ratio
            }
        } else if (options.limit) {
             return {
                "samplingMethod": "RANDOM_FIXED_NB",
                "maxRecords": options.limit
            }
        } else {
            throw "'random' sampling requires either 'limit' or 'ratio'";
        }
    } else if (options.sampling ==  "random-column") {
        if (!options.sampling_column) {
            throw "random-column sampling requires a sampling_column";
        }
        if (options.limit == null) {
            throw "random-column sampling requires a limit"
        }
        return {
            "samplingMethod": "COLUMN_BASED",
            "maxRecords": options.limit,
            "column": options.sampling_column
        }
    } else {
        throw "Unsupported sampling method: " + options.sampling
    }
};

function resolveSmartName(datasetSmartName) {
    var projectKey, datasetName;
    if (datasetSmartName.indexOf(".") >= 0) {
        var chunks = datasetSmartName.split(".");
        projectKey = chunks[0];
        datasetName = chunks[1];
    } else {
        projectKey = dataiku.defaultProjectKey;
        datasetName = datasetSmartName;
    }
    return {projectKey:projectKey, datasetName:datasetName}
}

function makeDataReq(args) {
    var datasetSmartName, options, success, failure;
    if (args.length < 2) {
        throw "dataiku.fetch takes at least two args : datasetSmartName and success."
    }
    else if (args.length > 4) {
        throw "dataiku.fetch expects at most 4 args. Got + " + args.length + "."
    }
    else {
        var datasetSmartName = args.shift();
        if ("object" == typeof args[0]) {
            options = args.shift();
        }
        else {
            options = {};
        }
        success = args.shift();
        failure = args.shift();
    }

    var apiKey = options.apiKey || dataiku.defaultAPIKey;
    var loc = resolveSmartName(datasetSmartName);
    var projectKey = loc.projectKey, datasetName = loc.datasetName;
    if (options.partitions && Array.isArray(options.partitions)) {
        options.partitions = options.partitions.join(",");
    }

    return {
        projectKey : projectKey,
        datasetName : datasetName,
        apiKey : apiKey,
        req : {
            columns: options.columns,
            filterExpression: options.filter,
            sampling: dataiku._createSamplingArg(options),
            partitions: options.partitions
        },
        success : success,
        failure : failure
    }
}

dataiku.fetch = function(datasetSmartName, _variadic_see_docstring_) {
    /*
     * dataiku.fetch( datasetSmartName [, options ], success, [failure ,])
     *
     * Description: Returns a DataFrame object containing a whole dataset.
     *
     *      datasetSmartName:  string identifying the dataset. Can be either of the formats :
     *          - [projectKey].[datasetName]
     *          - [datasetName], if which case the current project will be
     *          searched.
     *
     *      options: [optional] (javascript object) .... Mainly here for the future.
     *           apiKey: by default, dataiku.apiKey will be used when specified.
     *
     *      success: (function(dataframe) {})
     *           callback called if the dataframe has been successfully
     *           downloaded.
     *
     *      failure: [optional] (function(error) {})
     *           callback called if an error was encountered
     */

    var args = Array.prototype.slice.call(arguments);
    var data = makeDataReq(args);

    data.req.format = "memory-json",

    $.ajax({
        method: "POST",
        url: "/dip/publicapi/projects/" + data.projectKey + "/datasets/" + data.datasetName + "/data",
        data: JSON.stringify(data.req),
        headers : {
            "Authorization" : "Basic " + btoa(data.apiKey + ":" + "")
        }
    }).done(function(resp) {
        data.success(new DataFrame(resp));
    }).fail(data.failure);
};

dataiku.fetchAsGeoJSON = function(datasetSmartName, _variadic_see_docstring_) {
    /*
     * dataiku.fetchAsGeoJSON( datasetSmartName [, options ], success, [failure ,])
     *
     * Description: Returns a GeoJSON FeatureCollection containing a whole dataset.
     *      The dataset must contain a geometry column
     *
     *      datasetSmartName:  string identifying the dataset. Can be either of the formats :
     *          - [projectKey].[datasetName]
     *          - [datasetName], if which case the current project will be
     *          searched.
     *
     *      options: [optional] (javascript object) .... Mainly here for the future.
     *           apiKey: by default, dataiku.apiKey will be used when specified.
     *
     *      success: (function(data) {})
     *           callback called if the data has been successfully
     *           downloaded.
     *
     *      failure: [optional] (function(error) {})
     *           callback called if an error was encountered
     */

    var datasetSmartName, options, success, failures;
    var args = Array.prototype.slice.call(arguments);

    var data = makeDataReq(args);
    data.req.format = "geojson"

    $.ajax({
        method: "POST",
        url: "/dip/publicapi/projects/" + data.projectKey + "/datasets/" + data.datasetName + "/data",
        data: JSON.stringify(data.req),
        headers : {
            "Authorization" : "Basic " + btoa(data.apiKey + ":" + "")
        }
    }).done(function(resp) {
        data.success(resp);
    }).fail(data.failure);
};

dataiku.getVariableResolved = function(variableName, success, failure) {
    /*
     * dataiku.getVariableResolved( variableName, success, [failure ,])
     *
     * Description: Returns the value of a variable, with project and local
     *      overrides taken into account. Returns undefined for non-existing
     *      variables.
     *
     *      variableName: the project or instance variable's name
     *
     *      success: (function(value) {})
     *           callback called if the value of the variable was successfully retrieved
     *
     *      failure: [optional] (function(error) {})
     *           callback called if an error was encountered
     */
    $.ajax({
        method: "GET",
        url: "/dip/publicapi/projects/" + dataiku.defaultProjectKey + "/variables-resolved",
        headers : {
            "Authorization" : "Basic " + btoa(dataiku.defaultAPIKey + ":" + "")
        }
    }).done(function(resp) {
        var variableValue = resp[variableName];
        success(variableValue);
    }).fail(failure);
};


dataiku.getSchema = function(datasetSmartName, success, failure) {
    /*
     * dataiku.getSchema( datasetSmartName, success, [failure ,])
     *
     * Description: Returns a Schema containing the list of columns of the dataset
     *
     *      datasetSmartName:  string identifying the dataset. Can be either of the formats :
     *          - [projectKey].[datasetName]
     *          - [datasetName], if which case the current project will be
     *          searched.
     *
     *      success: (function(dataframe) {})
     *           callback called if the schema has been successfully
     *           downloaded.
     *
     *      failure: [optional] (function(error) {})
     *           callback called if an error was encountered
     */

    var loc = resolveSmartName(datasetSmartName);

    $.ajax({
        method: "GET",
        url: "/dip/publicapi/projects/" + loc.projectKey + "/datasets/" + loc.datasetName + "/schema",
        headers : {
            "Authorization" : "Basic " + btoa(dataiku.defaultAPIKey + ":" + "")
        }
    }).done(function(resp) {
        success(new Schema(resp));
    }).fail(failure);
};

dataiku.listDatasets = function(success, failure) {
    /*
     * dataiku.list(success, [failure ,])
     *
     * Description: Returns the list of datasets' names in the project
     *     *
     *      success: (function(lsit) {})
     *           callback called if the list has been successfully
     *           downloaded.
     *
     *      failure: [optional] (function(error) {})
     *           callback called if an error was encountered
     */

    $.ajax({
        method: "GET",
        url: "/dip/publicapi/projects/" + dataiku.defaultProjectKey + "/datasets/",
        headers : {
            "Authorization" : "Basic " + btoa(dataiku.defaultAPIKey + ":" + "")
        }
    }).done(function(resp) {
        success(resp.map(function(dataset) {return dataset.name;}));
    }).fail(failure);
};

dataiku.resolvePluginConfig = function(config, success, failure) {
    /*
     * dataiku.resolvePluginConfig(success, [failure ,])
     *
     * Description: Resolves a config for a plugin component
     *     *
     *      success: (function({config:..., pluginConfig:...}) {})
     *           callback called if the resolution has been successfully
     *           downloaded.
     *
     *      failure: [optional] (function(error) {})
     *           callback called if an error was encountered
     */

    $.ajax({
        method: "POST",
        url: "/dip/api/tintercom/plugins/get-resolved-settings/",
        data: {elementConfig:JSON.stringify(config)},
        headers : {
            "Authorization" : "Basic " + btoa(dataiku.defaultAPIKey + ":" + "")
        }
    }).done(success).fail(failure);
};

})();

// Old. Still usable by legacy webapps?
function dku_backend_url(call) {
    return "/html-apps-backends/" + insightId + call
}
