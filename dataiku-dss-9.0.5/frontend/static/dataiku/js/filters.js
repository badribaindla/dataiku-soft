function gentleTruncate(str, len) {
    /**
     * Truncate a string to make sure it takes at most
     * n characters.
     * Whenever possible truncates on special chars.
     *
     * If str is not a string, returns str unchanged.
     */
    if ((typeof str != "string") || (str.length <= len)) {
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

var now = new Date().getTime();
var NOW_REFRESH_INTERVAL = 1000 * 5; // 5 Seconds

setInterval(function(){
    now = new Date().getTime();
}, NOW_REFRESH_INTERVAL);

function friendlyDuration(diffInSeconds) {
    var sec = Math.floor((diffInSeconds >= 60 ? diffInSeconds % 60 : diffInSeconds));
    var min = Math.floor((diffInSeconds = (diffInSeconds / 60)) >= 60 ? diffInSeconds % 60 : diffInSeconds);
    var hrs = Math.floor((diffInSeconds = (diffInSeconds / 60)) >= 24 ? diffInSeconds % 24 : diffInSeconds);
    var days =Math.floor( (diffInSeconds = (diffInSeconds / 24)) >= 30 ? diffInSeconds % 30 : diffInSeconds);
    var months = Math.floor( (diffInSeconds = (diffInSeconds / 30)) >= 12 ? diffInSeconds % 12 : diffInSeconds);
    var years= Math.floor( (diffInSeconds = (diffInSeconds / 12)));
    var sb = "";
    if (years > 0) {
        if (years == 1) {
            sb += ("1 year");
        } else {
            sb += (years + " years");
        }
        if (years <= 6 && months > 0) {
            if (months == 1) {
                sb += (" and one month");
            } else {
                sb += (" and " + months + " months");
            }
        }
    } else if (months > 0) {
        if (months == 1) {
            sb += ("one month");
        } else {
            sb += (months + " months");
        }
        if (months <= 6 && days > 0) {
            if (days == 1) {
                sb += (" and a day");
            } else {
                sb += (" and " + days + " days");
            }
        }
    } else if (days > 0) {
        if (days == 1) {
            sb += ("one day");
        } else {
            sb += (days + " days");
        }
        if (days <= 3 && hrs > 0) {
            if (hrs == 1) {
                sb += (" and one hour");
            } else {
                sb += (" and " + hrs + " hours");
            }
        }
    } else if (hrs > 0) {
        if (hrs == 1) {
            sb += ("one hour");
        } else {
            sb += (hrs + " hours");
        }
        if (min > 1) {
            sb += (" and " + min + " minutes");
        }
    } else if (min > 0) {
        if (min == 1) {
            sb += ("one minute");
        } else {
            sb += (min + " minutes");
        }
        if (sec > 1) {
            sb += (" and " + sec + " seconds");
        }
    } else {
        if (sec <= 1) {
            sb += ("about a second");
        } else {
            sb += ("about " + sec + " seconds");
        }
    }
    return sb;
}

function durationHHMMSS(diffInSeconds) {
    var sec = Math.floor((diffInSeconds >= 60 ? diffInSeconds % 60 : diffInSeconds));
    var min = Math.floor((diffInSeconds = (diffInSeconds / 60)) >= 60 ? diffInSeconds % 60 : diffInSeconds);
    var hours = Math.floor( diffInSeconds / 60);
    var sb = "";
    if (hours > 0) {
        sb += (hours + "h ");
    }
    if (min > 0) {
        sb += (min + "m ");
    }
    sb += (sec + "s");
    return sb;
}

function durationHHMM(diffInSeconds) {
    var min = Math.floor((diffInSeconds = (diffInSeconds / 60)) >= 60 ? diffInSeconds % 60 : diffInSeconds);
    var hours = Math.floor( diffInSeconds / 60);
    var sb = "";
    if (hours > 0) {
        sb += (hours + "h ");
    }
    if (min > 0) {
        sb += (min + "m ");
    }
    return sb;
}

function durationHHMMSSPadded(diffInSeconds) {
    if (diffInSeconds == 0) diffInSeconds = 1;
    var sec = Math.floor((diffInSeconds >= 60 ? diffInSeconds % 60 : diffInSeconds));
    var min = Math.floor((diffInSeconds = (diffInSeconds / 60)) >= 60 ? diffInSeconds % 60 : diffInSeconds);
    var hours = Math.floor( diffInSeconds / 60);

    function pad(number) {
        if (number < 10) return "0" + number;
        else return number;
    }
    return pad(hours) + "h" + pad(min) + "m" + pad(sec) + "s";
}


function friendlyDurationShort(seconds, ref, noSeconds) {
    var sec    = Math.floor(seconds >= 60 ? seconds % 60 : seconds),
        min    = Math.floor((seconds = (seconds / 60)) >= 60 ? seconds % 60 : seconds),
        hours  = Math.floor((seconds = (seconds / 60)) >= 24 ? seconds % 24 : seconds),
        days   = Math.floor((seconds = (seconds / 24)) >= 30 ? seconds % 30 : seconds),
        months = Math.floor((seconds = (seconds / 30)) >= 12 ? seconds % 12 : seconds),
        years  = Math.floor((seconds = (seconds / 12))),
        sb = "";

    if (years > 0) {
        sb = (years + " year" + (years > 1 ? "s" :""));
    } else if (months > 0) {
        sb = (months + " month" + (months > 1 ? "s" :""));
    } else if (days > 0) {
        sb = (days + " day" + (days > 1 ? "s" :""));
    } else if (hours > 0) {
        sb = (hours + " hour" + (hours > 1 ? "s" : ""));
    } else if (min > 0) {
        sb = (min + " minute" + (min > 1 ? "s" : ""));
    } else if(!noSeconds && sec > 0) {
        sb = (sec + " second" + (sec > 1 ? "s" : ""));
    }

    switch (ref) {
        case 'ago':   return sb ? sb + " ago"   : "just now";
        case 'in':    return sb ? "in " + sb    : "immediately";
        default:      return sb ? sb            : "< 1 " + (noSeconds ? "minute" : "second");
    }
}

function dateDayDiff(date1, date2) {
    var d1 = new Date(date1);
    var d2 = new Date(date2);
    d1.setHours(0);
    d1.setMinutes(0);
    d1.setSeconds(0);
    d1.setMilliseconds(0);
    d2.setHours(0);
    d2.setMinutes(0);
    d2.setSeconds(0);
    d2.setMilliseconds(0);
    var dayLength = 24*60*60*1000;
    return Math.floor(d1.getTime()/dayLength) - Math.floor(d2.getTime()/dayLength);
}
function dateMinuteDiff(date1, date2) {
    var d1 = new Date(date1);
    var d2 = new Date(date2);
    d1.setSeconds(0);
    d1.setMilliseconds(0);
    d2.setSeconds(0);
    d2.setMilliseconds(0);
    var msToMin = 60*1000;
    return Math.floor(d1.getTime()/msToMin) - Math.floor(d2.getTime()/msToMin);
}


(function() {

'use strict';

var app = angular.module('dataiku.filters', []);

const CONVERSION_FIELD_ICON = 'icon';
const CONVERSION_FIELD_NAME = 'name';
const CONVERSION_FIELD_OTHER_NAME = 'otherName';
const CONVERSION_FIELD_LANGUAGE = 'language';
function buildTypeDefinition(icon, name = undefined, otherName = undefined) {
    return {[CONVERSION_FIELD_ICON]: icon, [CONVERSION_FIELD_NAME]: name, [CONVERSION_FIELD_OTHER_NAME]: otherName || name};
}
function buildTypeDefinitionWithIconAndLanguage(icon, language) {
    return {[CONVERSION_FIELD_ICON]: icon, [CONVERSION_FIELD_LANGUAGE]: language};
}

const FS_PROVIDER_TYPES = {
    'filesystem': buildTypeDefinition('icon-server_file_system_1', "Server's Filesystem"),
    'hdfs': buildTypeDefinition('icon-HDFS', 'Hadoop HDFS'),
    'ftp': buildTypeDefinition('icon-uncached_FTP', 'FTP'),
    'sftp': buildTypeDefinition('icon-dataset-ssh', 'SFTP'),
    'scp': buildTypeDefinition('icon-dataset-ssh', 'SCP'),
    'azure': buildTypeDefinition('icon-azure-storage', 'Azure Blob Storage'),
    'gcs': buildTypeDefinition('icon-google-cloud-storage', 'Google Cloud Storage'),
    's3': buildTypeDefinition('icon-amazon_s3', 'Amazon S3'),
    'url': buildTypeDefinition(undefined, 'HTTP or FTP URL'),
};
const COMMON_TYPES = Object.assign({}, FS_PROVIDER_TYPES, {
    'hiveserver2': buildTypeDefinition('icon-dku-hive', 'Hive'),
    'uploadedfiles': buildTypeDefinition('icon-upload', 'Uploaded Files'),
    'mongodb': buildTypeDefinition('icon-mongo_db', 'MongoDB'),
    'dynamodb': buildTypeDefinition('icon-dynamoDB', 'DynamoDB'),
    'mysql': buildTypeDefinition('icon-mySQL', 'MySQL'),
    'cassandra': buildTypeDefinition('icon-cassandra_1', 'Cassandra'),
    'postgresql': buildTypeDefinition('icon-postgreSQL', 'PostgreSQL'),
    'vertica': buildTypeDefinition('icon-HP_vertica', 'Vertica'),
    'redshift': buildTypeDefinition('icon-amazon_redshift', 'Amazon Redshift'),
    'greenplum': buildTypeDefinition('icon-greenplum', 'Greenplum'),
    'teradata': buildTypeDefinition('icon-teradata', 'Teradata'),
    'oracle': buildTypeDefinition('icon-oracle', 'Oracle'),
    'athena': buildTypeDefinition('icon-athena', 'Athena'),
    'sqlserver': buildTypeDefinition('icon-sqlserver', 'MS SQL Server'),
    'synapse': buildTypeDefinition('icon-dku-azure-synapse', 'Azure Synapse'),
    'netezza': buildTypeDefinition('icon-netezza', 'IBM Netezza'),
    'saphana': buildTypeDefinition('icon-sap-hana', 'SAP Hana'),
    'bigquery': buildTypeDefinition('icon-google-bigquery', 'Google BigQuery'),
    'snowflake': buildTypeDefinition('icon-snowflake', 'Snowflake'),
    'jdbc': buildTypeDefinition('icon-other_sql', 'SQL database (JDBC)', 'Other SQL databases'),
    'elasticsearch': buildTypeDefinition('icon-elasticsearch', 'ElasticSearch'),
    'twitter': buildTypeDefinition('icon-twitter', 'Twitter'),
    'kafka': buildTypeDefinition('icon-kafka', 'Kafka'),
    'sqs': buildTypeDefinition('icon-sqs', 'SQS'),
    'httpsse': buildTypeDefinition('icon-httpsse', 'HTTP Server Sent Events')
});
const DATASET_TYPES = Object.assign({}, COMMON_TYPES, {
    'cachedhttp': buildTypeDefinition('icon-FTP-HTTP-SSH', 'HTTP (with cache)'),
    'filesinfolder': buildTypeDefinition('icon-box', 'Files in Folder'),
    'http': buildTypeDefinition('icon-FTP-HTTP-SSH', 'HTTP'),
    'inline': buildTypeDefinition('icon-inline', 'Editable'),
    'jobsdb': buildTypeDefinition('icon-bar-chart', 'Metrics'),
    'statsdb': buildTypeDefinition('icon-tasks', 'Internal stats'),
    'remotefiles': buildTypeDefinition('icon-FTP-HTTP-SSH'),

});
const STREAMING_ENDPOINT_TYPES = {
    'kafka': buildTypeDefinition('icon-double-angle-right'),
    'httpsse': buildTypeDefinition('icon-double-angle-right'),
    'sqs': buildTypeDefinition('icon-double-angle-right')
};

const CONNECTION_TYPES = Object.assign({}, COMMON_TYPES,{
    'ec2': buildTypeDefinition('icon-amazon_s3', 'Amazon S3'),
    'ssh': buildTypeDefinition('icon-FTP-HTTP-SSH', 'SCP/SFTP'),
});
const RECIPE_TYPES = {
    'clustering_cluster': buildTypeDefinition('icon-clustering_recipe'),
    'clustering_scoring': buildTypeDefinition('icon-score_recipe'),
    'clustering_training': buildTypeDefinition('icon-train_recipe'),
    'distinct': buildTypeDefinition('icon-visual_prep_distinct_recipe'),
    'download': buildTypeDefinition('icon-visual_download_recipe'),
    'evaluation': buildTypeDefinition('icon-evaluation_recipe'),
    'standalone_evaluation': buildTypeDefinition('icon-standalone_evaluation_recipe'),
    'export': buildTypeDefinition('icon-visual_export_recipe'),
    'grouping': buildTypeDefinition('icon-visual_prep_group_recipe'),
    'hive': buildTypeDefinitionWithIconAndLanguage('icon-code_hive_recipe', 'text/x-hivesql'),
    'impala': buildTypeDefinitionWithIconAndLanguage('icon-code_impala_recipe', 'text/x-hivesql'),
    'ipython': buildTypeDefinition('icon-python'),
    'join': buildTypeDefinition('icon-visual_prep_join_recipe'),
    'fuzzyjoin': buildTypeDefinition('icon-visual_prep_fuzzyjoin_recipe'),
    'merge_folder': buildTypeDefinition('icon-visual_prep_merge_folder_recipe'),
    'julia' : buildTypeDefinitionWithIconAndLanguage('icon-code_julia_recipe','text/x-julia'),
    'pig': buildTypeDefinitionWithIconAndLanguage('icon-code_pig_recipe', 'text/x-dkupig'),
    'pivot': buildTypeDefinition('icon-visual_prep_pivot_recipe'),
    'prediction_scoring': buildTypeDefinition('icon-score_recipe'),
    'prediction_training': buildTypeDefinition('icon-train_recipe'),
    'pyspark': buildTypeDefinitionWithIconAndLanguage('icon-code_pyspark_recipe', 'text/x-python'),
    'python': buildTypeDefinitionWithIconAndLanguage('icon-code_python_recipe', 'text/x-python'),
    'r': buildTypeDefinitionWithIconAndLanguage('icon-code_r_recipe', 'text/x-rsrc'),
    'recipe': buildTypeDefinition('icon-circle'),
    'sampling': buildTypeDefinition('icon-visual_prep_filter-sample_recipe'),
    'shaker': buildTypeDefinition('icon-visual_prep_cleanse_recipe'),
    'shell': buildTypeDefinitionWithIconAndLanguage('icon-code_shell_recipe', 'text/x-sh'),
    'sort': buildTypeDefinition('icon-visual_prep_sort_recipe'),
    'spark_scala': buildTypeDefinitionWithIconAndLanguage('icon-code_spark_scala_recipe', 'text/x-scala'),
    'spark_sql_query': buildTypeDefinitionWithIconAndLanguage('icon-code_sparksql_recipe', 'text/x-sql2'),
    'sparkr': buildTypeDefinitionWithIconAndLanguage('icon-code_sparkr_recipe', 'text/x-rsrc'),
    'split': buildTypeDefinition('icon-visual_prep_split_recipe'),
    'sql': buildTypeDefinition('icon-sql'),
    'sql_query': buildTypeDefinitionWithIconAndLanguage('icon-code_sql_recipe', 'text/x-sql2'),
    'sql_script': buildTypeDefinitionWithIconAndLanguage('icon-code_sql_recipe', 'text/x-sql2'),
    'sync': buildTypeDefinition('icon-visual_prep_sync_recipe'),
    'topn': buildTypeDefinition('icon-visual_prep_topn_recipe'),
    'update': buildTypeDefinition('icon-visual_push_to_editable_recipe'),
    'vstack': buildTypeDefinition('icon-visual_prep_vstack_recipe'),
    'window': buildTypeDefinition('icon-visual_prep_window_recipe'),
    'csync': buildTypeDefinition('icon-continuous_sync_recipe'),
    'ksql': buildTypeDefinitionWithIconAndLanguage('icon-continuous_ksql_recipe', 'text/x-sql'),
    'cpython': buildTypeDefinitionWithIconAndLanguage('icon-continuous_python_recipe', 'text/x-python'),
    'streaming_spark_scala': buildTypeDefinitionWithIconAndLanguage('icon-continuous_spark_scala_recipe', 'text/x-scala')
};
const ML_TYPES = {
    'prediction': buildTypeDefinition('icon-beaker'),
    'regression': buildTypeDefinition('icon-machine_learning_regression'),
    'clustering': buildTypeDefinition('icon-machine_learning_clustering'),
};
const OTHER_TAGGABLE_OBJECTS_TYPES = {
    'analysis': buildTypeDefinition('icon-dku-nav_analysis'),
    'managed_folder': buildTypeDefinition('icon-folder-open'),
    'saved_model': buildTypeDefinition('icon-machine_learning_regression'),
    'model_evaluation_store': buildTypeDefinition('icon-model-evaluation-store'),
    'statistics_worksheet': buildTypeDefinition('icon-dku-statistics'),
    'scenario': buildTypeDefinition('icon-list'),
    'article': buildTypeDefinition('icon-dku-wiki'),
    'lambda_service': buildTypeDefinition('icon-cloud'),
    'flow_zone': buildTypeDefinition('icon-zone'),
    'taggable_object': buildTypeDefinition('icon-puzzle-piece'), //Generic (used for heterogeneous groups of taggable objects)
};
const NON_TAGGABLE_OBJECTS_TYPES = {
    'column': buildTypeDefinition('icon-list icon-rotate-90'),
    'meaning': buildTypeDefinition('icon-tags'),
    'discussion': buildTypeDefinition('icon-comments'),
};
const WEBAPPS_TYPES = {
    'web_app': buildTypeDefinition('icon-code'),
    'bokeh': buildTypeDefinition('icon-bokeh'),
    'dash': buildTypeDefinition('icon-dash'),
    'shiny': buildTypeDefinition('icon-code_r_recipe'),
    'standard': buildTypeDefinition('icon-code'),
};
const DASHBOARDS_OR_INSIGHTS_TYPES = {
    'insight': buildTypeDefinition('icon-dku-nav_dashboard'),
    'dashboard': buildTypeDefinition('icon-dku-dashboard'),
    'html': buildTypeDefinition('icon-code'),
    'image': buildTypeDefinition('icon-picture'),
    'text': buildTypeDefinition('icon-font'),
    'static_file': buildTypeDefinition('icon-file-alt'),
    'iframe': buildTypeDefinition('icon-link'),
    'bokeh_export': buildTypeDefinition('icon-bokeh'),
    'dash_export': buildTypeDefinition('icon-dash'),
    'static_chart': buildTypeDefinition('icon-bar-chart'),
    'discussions': buildTypeDefinition('icon-comments-alt'),
};
const OTHER_TYPES = {
    'project': buildTypeDefinition('icon-dkubird'),
    'report': buildTypeDefinition('icon-DKU_rmd'),
    'new': buildTypeDefinition('icon-plus'),
    'help': buildTypeDefinition('icon-question-sign'),
};
const NOTEBOOKS_TYPES = {
    'notebook': buildTypeDefinition('icon-dku-nav_notebook'),
    'sql_notebook': buildTypeDefinition('icon-sql'),
    'jupyter_notebook': buildTypeDefinition('icon-dku-nav_notebook'),
};
const ALL_TYPES = Object.assign( {},
    COMMON_TYPES, DATASET_TYPES, STREAMING_ENDPOINT_TYPES, CONNECTION_TYPES, RECIPE_TYPES, ML_TYPES, OTHER_TAGGABLE_OBJECTS_TYPES,
    NON_TAGGABLE_OBJECTS_TYPES, WEBAPPS_TYPES, DASHBOARDS_OR_INSIGHTS_TYPES, OTHER_TYPES, NOTEBOOKS_TYPES
);

function typeProcessor(type, types, conversionField, Logger, defaultValueFunction) {
    if(!type) {
        return '';
    }
    const existingType = types[type.toLowerCase()];
    const result = existingType && existingType[conversionField];
    if (result !== undefined) {
        return result;
    }
    return defaultValueFunction(type, conversionField, Logger);
}

function defaultValueForDataset(PluginsService) {
    return function (originalKey, conversionField, Logger) {
        const key = originalKey.toLowerCase();
        if (key.startsWith("custom") || key.startsWith("fsprovider_")) {
            if (CONVERSION_FIELD_ICON === conversionField) {
                return PluginsService.getDatasetIcon(originalKey);
            } else {
                return PluginsService.getDatasetLabel(originalKey);
            }
        }
        return defaultValue(key, conversionField, Logger);
    };
}

function defaultValueForRecipe(PluginsService) {
    return function (originalKey, conversionField, Logger) {
        const key = originalKey.toLowerCase();
        if (key.startsWith('custom')) {
            if (CONVERSION_FIELD_ICON === conversionField) {
                return PluginsService.getRecipeIcon(originalKey);
            }
        } else if (key.startsWith("app_")) {
            for (let ar of window.dkuAppConfig.appRecipes) {
                if (ar.recipeType == originalKey) {
                    return ar.icon;
                }
            }
        }
        return defaultValue(key, conversionField, Logger);
    };
}

function defaultValueForWebApp(WebAppsService) {
    return function(originalKey, conversionField, Logger) {
        if (conversionField === CONVERSION_FIELD_ICON) {
            return WebAppsService.getWebAppIcon(originalKey) || 'icon-code';
        } else if (conversionField === CONVERSION_FIELD_NAME) {
            return WebAppsService.getWebAppTypeName(originalKey) || type;
        } else {
            return defaultValue(originalKey.toLowerCase(), conversionField, Logger);
        }
    };
}

function defaultValue(key, conversionField, Logger) {
    const defaultPrefix = CONVERSION_FIELD_ICON === conversionField ? 'icon-' : '';
    const result = defaultPrefix + key.toLowerCase();
    if (Logger !== undefined) {
        Logger.error("Unknown type: " + key + ".Returning default value: " + result);
    }
    return result;
}


app.filter('slugify', function(){
    return function(input){
        if (input===undefined) {return '';}
        return input.replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'').replace(/\-+/g,'-').toLowerCase();
    };
});


app.filter('join', function(){
    return function(input){
        return input.join(",");
    };
});


app.filter('capitalize', function(){
    return function(input){
        if(input && input.length>0) {
            return input.charAt(0).toUpperCase() + input.slice(1);
        } else {
            return '';
        }
    };
});


app.filter('pluralize', function() {
    /**
     * Pluralize an item name.
     * @param {number}            num         - The quantity of the item
     * @param {string}            singular    - The singular form of the item name (only used when num is worth 1)
     * @param {string}            plural      - The plural form of the item name
     * @param {d3 formatter}      [format]    - Optional d3.js formatter for num
     * @param {boolean | string}  [no]        - Optional indicator of the filter behavior when num is worth 0:
     *                                        If false (default), use '0 ' + plural
     *                                        If true, use 'no ' + plural
     *                                        If a string, use it
     */
    return function(num, singular, plural, format, no) {
        if (no && num == 0) return no === true ? 'no ' + plural : no;
        return (format ? d3.format(format)(num) : num) + " " + (num === 1 ? singular : plural);
    }
});


app.filter('plurify', function() {
    return function(singular, num, plural) {
        plural = typeof(plural) !== "undefined" ? plural : singular + 's';
        return num == 1 ? singular : plural; // in english zero uses plural mode (crazy guys)
    };
});

app.filter('breakify', function (LoggerProvider) {
    return function (text, breakOnRegex) {
        try {
            const re = new RegExp(breakOnRegex, 'g');
            const indices = [];
            let m;
            do {
                m = re.exec(text);
                if (m) {
                    indices.push(m.index + m[0].length);
                }
            } while (m);
            indices.reverse().forEach(pos => {
                if (text) {
                    text = [text.slice(0, pos), '<wbr>', text.slice(pos)].join('');
                }
            });
            return text;
        } catch(err) {
            LoggerProvider.getLogger('DisplayFilters').error("Error ", err);
            return text;
        }
    };
});

app.filter('uncamel', function (LoggerProvider) {
    return function (text) {
        try {
            return text.replace(/[A-Z]/g, function(l) { return ' ' + l.toLowerCase(); })
        } catch(err) {
            LoggerProvider.getLogger('DisplayFilters').error("Error ", err);
            return text;
        }
    };
});

app.filter('objectSize', function() {
    return function(object) {
        if (!object) return 0;
        return Object.keys(object).length;
    };
});


app.filter('listSlice', function(){
    return function(input, from, to) {
        if (!input || input.length <= from) {
            return [];
        }
        return input.slice(from, to);
    }
});


// `[n] | range`        => 0 .. (n-1)
// `[from, to] | range` => from .. to (inclusive)
app.filter('range', function() {
    return function(input) {
        switch (input.length) {
            case  1:
                if (input[0] <= 0) return [];
                input = [0, input[0] - 1]; break;
            case  2:
                if (input[1] < input[0]) return [];
                break;
            default: return input;
        }
        var len = input[1] - input[0] + 1,
            result = new Array(len);
        for (var i = 0; i < len; i++) {
            result[i] = i + input[0];
        }
        return result;
    };
});


app.filter('gentleTruncate', function () {
    return function (text, length, end) {

        if (isNaN(length))
            length = 10;

        return gentleTruncate(text, length);

    };
});


app.filter('onlyNumbers', function(){
    return function(text){
        if (!text) { return ''; }
        return text.replace(/[^0-9]/g, '');
    };
});


app.filter('ordinal', function(){
    return function(number){
        return number < 14 && number > 10 ? 'th' : ['th','st','nd','rd','th','th','th','th','th','th'][number % 10];
    };
});


app.filter('ordinalWithNumber', function(){
    return function(number){
        return number + (number < 14 && number > 10 ? 'th' : ['th','st','nd','rd','th','th','th','th','th','th'][number % 10]);
    };
});

// ratio to % w/ fixed precision & optional non-breaking space
// special cases: '<1%' and '>99%' when <.01 but >0 (for precision == 2, '<0.01%'...)
app.filter('smartPercentage', function() {
    return function(ratio, precision, spaces) {
        precision = Math.max(+(precision || 0), 0);
        var tens = Math.pow(10, precision),
            min = 1 / tens / 100, // e.g. precision = 2 =>  0.01
            max = 1 - min,        //                    => 99.99
            out = [];
        if (ratio < 1 && ratio > max) {
            ratio = max;
            out.push('>');
        } else if (ratio > 0 && ratio < min) {
            ratio = min;
            out.push('<');
        }
        out.push((Math.round(ratio * 100 * tens) / tens).toFixed(precision), '%');
        return out.join(spaces ? '\u00A0' : '');
    }
});


app.filter('processorByType', function(){
    return function(processors, type){
        if (processors) {
            for (var i = 0; i < processors.processors.length; i++) {
                if (processors.processors[i].type == type) {
                    return processors.processors[i];
                }
            }
        }
        throw Error("Unknown processor " +type);
    }
});


app.filter('cleanFacetValue', function() {
    return function(input) {
        if (input == "___dku_no_value___") {
            return "<em>No value</em>";
        } else {
            return input;
        }
    };
});


app.filter('chartLabelValue', function() {
    return function(input) {
        if (input == "___dku_no_value___") {
            return "No value";
        } else {
            return input;
        }
    };
});


app.filter("prettyjson", function(){
    return function(input) {
         return JSON.stringify(input,undefined,3);
    }
});


app.filter("jsonOrString", function(){
    return function(input) {
        if (typeof input == "string") {
            return input;
        }
        else {
            return JSON.stringify(input);
        }    
    }
});


app.filter('friendlyTime', function() {
    return function(input) {
        var diffInSeconds = parseInt(input, 10) / 1000;
        return friendlyDuration(diffInSeconds);
    };
});


app.filter('friendlyTimeDeltaForward', function() {
    const filter =  function(input) {
        var diffInSeconds = (parseInt(input, 10) - now) / 1000;
        return "in " + friendlyDuration(diffInSeconds);
    };
    filter.$stateful= true;
    return filter;
});


app.filter('friendlyTimeDelta', function() {
    const filter = input => {
        var diffInSeconds = (now - parseInt(input, 10)) / 1000;
        return friendlyDuration(diffInSeconds) + ' ago';
    };
    filter.$stateful = true;
    return filter;
});


app.filter('friendlyTimeDeltaShort', function() {
    const filter = function(input) {
        var diffInSeconds = (now - parseInt(input, 10)) / 1000;
        return friendlyDurationShort(diffInSeconds, 'ago', true);
    };
    filter.$stateful = true;
    return filter;
});

app.filter('friendlyTimeDeltaHHMMSS', function() {
    const filter = function(input) {
        var diffInSeconds = Math.max(0, (now - parseInt(input, 10)) / 1000);
        return durationHHMMSS(diffInSeconds);
    };
    filter.$stateful= true;
    return filter;
});

app.filter('friendlyDuration', function(){
    return function (input) { return friendlyDuration(parseInt(input, 10) / 1000); };
});


app.filter('friendlyDurationShort', function() {
    return function(input, ref, noSeconds) {
        return friendlyDurationShort(parseInt(input, 10) / 1000, ref, noSeconds);
    };
});


app.filter('friendlyDurationSec', function() {
    return function(input) {
        return friendlyDuration(parseInt(input, 10));
    };
});


app.filter('durationHHMMSS', function() {
    return function(input) {
        return durationHHMMSS(parseInt(input, 10)/1000);
    };
});


app.filter('durationHHMMSSPadded', function() {
    return function(input) {
        return durationHHMMSSPadded(parseInt(input, 10)/1000);
    };
});


app.filter('yesNo', function(){
    return function(input) {
        if (input) return "Yes";
        else return "No";
    }
});

app.filter('friendlyDate', function($filter) {
    return function(time, format) {
        format = format || 'EEEE, d MMMM';
        var today = new Date();
        var date = new Date(time);
        if(dateDayDiff(date, today)===0){
            return 'Today'
        } else if(dateDayDiff(date, today)===-1){
            return 'Yesterday'
        } else if(dateDayDiff(date, today)===1){
            return 'Tomorrow'
        } else {
            return $filter('date')(date, format);
        }

    };
});


app.filter('friendlyDateRange', function($filter) {
    const day = $filter('friendlyDate');
    const time = date => $filter('date')(date, 'HH:mm');
    function duration(date1, date2, options) {
        if (options && options.noDuration || !date2){
            return '';
        }
        let delta = (new Date(date2) - new Date(date1));
        return ' (duration: ' + $filter('durationHHMMSS')(delta) + ')';
    }

    function unavailableEndDate(date) {
        return day(date) + ', started at ' +  time(date);
    }
    function sameMinute(date1, date2, options) {
        return day(date1) + ' ' +  time(date1) + duration(date1, date2, options);
    }
    function sameDay(date1, date2, options) {
        return day(date1) + ', ' +  time(date1) + ' to ' + time(date2) + duration(date1, date2, options);
    }
    function differentDays(date1, date2, options) {
        return 'From ' + day(date1) + ' ' +  time(date1)+ ' to ' + day(date2) + ' ' +  time(date2) + duration(date1, date2, options);
    }

    return function(date1, date2, options) {
        options = options || {};
        if (!date2) {
            return unavailableEndDate(date1);
        } else if (dateMinuteDiff(date1, date2) == 0) {
            return sameMinute(date1, date2, options);
        } else if (dateDayDiff(date1, date2) == 0) {
            return sameDay(date1, date2, options);
        } else {
            return differentDays(date1, date2, options);
        }
    };
});


app.filter('friendlyDateTime', function($filter) {
    var sameDay = function (date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }
    return function(time, format) {
        var today = new Date(),
            yesterday = new Date(),
            tomorrow = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        tomorrow.setDate(tomorrow.getDate() + 1);

        var date = new Date(time);
        var datePart;
        if(sameDay(date, today)){
            datePart = 'Today'
        } else if(sameDay(date, yesterday)){
            datePart = 'Yesterday'
        } else if(sameDay(date, tomorrow)){
            datePart = 'Tomorrow'
        } else {
            if (!format) {
                const nth = function(d) {
                  if (d > 3 && d < 21) return 'th';
                  switch (d % 10) {
                    case 1:  return "st";
                    case 2:  return "nd";
                    case 3:  return "rd";
                    default: return "th";
                  }
                }
                var day = $filter('date')(date, 'd');
                // 'EEEE, MMMM dth, yyyy' but I cannot put the "th" part into the filter because every the "2nd" with ends up like "2n2"
                datePart = $filter('date')(date, 'EEEE, MMMM ') + day + nth(parseInt(day)) + $filter('date')(date, ', yyyy');
            } else {
                datePart = $filter('date')(date, format);
            }
        }
        return datePart + ' at ' + $filter('date')(date, 'HH:mm')
    };
});


app.filter('utcDate', function() {
    return function(time, format) {
        format = format || 'EEEE, d MMMM';
        return moment.utc(time).format(format);
    };
});


app.filter('recipeTypeToName', function(RecipeDescService) {
    return RecipeDescService.getRecipeTypeName;
});

app.filter('datasetTypeToName', function(LoggerProvider, PluginsService) {
    return function(type) {
        return typeProcessor(type, DATASET_TYPES, CONVERSION_FIELD_NAME, LoggerProvider.getLogger('DisplayFilters'),
            defaultValueForDataset(PluginsService));
    };
});


app.filter('pluginIdToName', function(LoggerProvider, PluginsService) {
    return function(pluginId) {
        if(!pluginId) {
            return '';
        }
        let desc = PluginsService.getPluginDesc(pluginId);
        if (desc) {
            return desc.label;
        }
        return pluginId;
    };
});


app.filter("niceProfileName", function(){
    var dict = {
        "DATA_SCIENTIST": "Data scientist",
        "DATA_ANALYST": "Data analyst",
        "READER" : "Reader",
        "DESIGNER" : "Designer",
        "VISUAL_DESIGNER": "Visual Designer",
        "PLATFORM_ADMIN": "Platform admin",
        "EXPLORER": "Explorer"
    };
    return function(input) {
        return dict[input] || input;
    };
});

app.filter('itemToColor', function(typeToColorFilter) {
    return function(item) {
        return typeToColorFilter(item.type);
    };
});


app.filter('typeToColor', function($filter) {
    const supportedTypes = [
        "project",
        "dataset",
        "streaming_endpoint",
        "recipe",
        "analysis",
        "notebook",
        "scenario",
        "saved_model",
        "model_evaluation_store",
        "managed_folder",
        "web_app",
        "report",
        "dashboard",
        "insight",
        "article"];
    function getStandardType(type) {
        if (!type) return;
        if (type.endsWith("_NOTEBOOK")) {
            return "notebook";
        }
        return type.toLowerCase();
    }
    return function(type) {
        if (!type) return "";
        const recipeColor = $filter('recipeTypeToColor')(type);
        if (recipeColor) {
            return recipeColor;
        }

        const stdType = getStandardType(type);
        if (supportedTypes.indexOf(stdType) >= 0) {
            return "universe-color " + stdType;
        }
        return "";
    };
});


app.filter('insightTypeToIcon', function(DashboardUtils) {
    return function(type) {
        function defaultValueForInsight(key, conversionField, Logger) {
            return (DashboardUtils.getInsightHandler(type) || {}).icon;
        }
        return typeProcessor(type, DASHBOARDS_OR_INSIGHTS_TYPES, CONVERSION_FIELD_ICON, undefined, defaultValueForInsight);
    };
});


app.filter('insightTypeToColor', function(DashboardUtils) {
    return function(type, noBackground) {
        var color;
        switch(type) {
            case 'text':
            case 'iframe':
            case 'image':
                color = 'comments';
                break;
            default:
                color = (DashboardUtils.getInsightHandler(type) || {}).color;
                break;
        }

        if (!noBackground) return 'universe-background insight-icon ' + color;
        else return color;
    };
});


app.filter('insightTypeToDisplayableName', function(DashboardUtils) {
    return function(type) {
        var handler = DashboardUtils.getInsightHandler(type);
        if (!handler || !handler.name) return type;
        return handler.name;
    };
});

app.filter('webappTypeToIcon', function(WebAppsService) {
    return function(type) {
        return typeProcessor(type, WEBAPPS_TYPES, CONVERSION_FIELD_ICON, undefined,
            defaultValueForWebApp(WebAppsService));
    };
});

app.filter('webappTypeToColor', function(WebAppsService) {
    return function(type) {
        if (WebAppsService.getBaseType(type) == type) {
            return 'notebook'; //native webapp => code color
        } else {
            return 'flow';
        }
    };
});

app.filter('webappTypeToName', function(WebAppsService) {
    return function(type) {
        return typeProcessor(type, WEBAPPS_TYPES, CONVERSION_FIELD_NAME, undefined,
            defaultValueForWebApp(WebAppsService));
    };
});

function connectionTypeToName(connectionType, forDetailView) {
    const conversionField = forDetailView ? CONVERSION_FIELD_NAME : CONVERSION_FIELD_OTHER_NAME;
    return typeProcessor(connectionType, CONNECTION_TYPES, conversionField, undefined, defaultValue);
}

app.filter('connectionTypeToNameForList', function() {
    return function(connectionType) {
        return connectionTypeToName(connectionType, false);
    };
});
app.filter('connectionTypeToNameForItem', function() {
    return function(connectionType) {
        return connectionTypeToName(connectionType, true);
    };
});

app.filter("connectionTypeToIcon", function(LoggerProvider){
     return function(type) {
         return typeProcessor(type, CONNECTION_TYPES, CONVERSION_FIELD_ICON,
             LoggerProvider.getLogger('connectionTypeToIcon'), defaultValue);
     };
});

app.filter('datasetTypeToIcon', function(PluginsService, LoggerProvider) {
    return function(type) {
       return typeProcessor(type, DATASET_TYPES, CONVERSION_FIELD_ICON,
           LoggerProvider.getLogger('datasetTypeToIcon'), defaultValueForDataset(PluginsService));
    };
});

app.filter('recipeTypeToColorClass', function(recipeTypeToIconFilter, PluginsService, RecipeDescService, LoggerProvider) {
    const customRecipeColors = ["red", "pink", "purple", "blue", "green", "sky", "yellow", "orange", "brown", "grey"];

    return function(type) {
        if (!type) {
            return "recipe-custom";
        }
        if (!RecipeDescService.isRecipeType(type)) {
            return;
        }

        const loadedDesc = PluginsService.getRecipeLoadedDesc(type);
        if (loadedDesc) {
            let colorClass = 'recipe-custom';

            if (loadedDesc && loadedDesc.desc && loadedDesc.desc.meta) {
                const iconColor = loadedDesc.desc.meta.iconColor;

                if (customRecipeColors.indexOf(iconColor) > -1) {
                    colorClass = colorClass + "-" + iconColor;
                }
            }
            return colorClass;
        }

        const icon = recipeTypeToIconFilter(type);
        return icon ? "recipe-" + icon.split('_')[0].split('icon-')[1] : "";
    }
});

app.filter('recipeTypeToColor', function(recipeTypeToIconFilter, PluginsService, RecipeDescService, LoggerProvider, $filter) {
    return function(type) {
        if (!type) {
            return "universe-color recipe-custom";
        }
        const colorClass = $filter("recipeTypeToColorClass")(type);
        if (!colorClass) {
            return;
        }
        return "universe-color " + colorClass;
    }
});
app.filter('recipeTypeToIcon', function(PluginsService) {
    return function(input) {
        return typeProcessor(input, RECIPE_TYPES, CONVERSION_FIELD_ICON, undefined,
            defaultValueForRecipe(PluginsService));
    };
});


app.filter('modelTypeToIcon', function(PluginsService) {
    return function(input) {
        return typeProcessor(input, ML_TYPES, CONVERSION_FIELD_ICON, undefined,
            defaultValueForRecipe(PluginsService));
    };
});

app.filter("recipeTypeToLanguage", function() {
    return function(recipeType) {
        function defaultToUndefined(key, conversionField, Logger) {
            return undefined;
        }
        return typeProcessor(recipeType, RECIPE_TYPES, CONVERSION_FIELD_LANGUAGE, undefined, defaultToUndefined);
    }
});

app.filter('typeToIcon', function(PluginsService) {
    return function (input) {
        return typeProcessor(input, ALL_TYPES, CONVERSION_FIELD_ICON, undefined,
            defaultValueForDataset(PluginsService));
    }
});

app.filter('subTypeToIcon', function($filter) {
    var subtypeFilters = {
        'INSIGHT':            $filter('insightTypeToIcon'),
        'DATASET':            $filter('datasetTypeToIcon'),
        'RECIPE':             $filter('recipeTypeToIcon'),
        'WEB_APP':            $filter('webappTypeToIcon'),
        'STREAMING_ENDPOINT': $filter('datasetTypeToIcon'),
    };
    return function(subtype, type) {
        if (subtype && subtypeFilters[type.toUpperCase()]) {
            return subtypeFilters[type.toUpperCase()](subtype);
        } else {
            return $filter('typeToIcon')(type);
        }
    };
});


app.filter('subTypeToColor', function($filter) {
    var subtypeFilters = {
        'INSIGHT': $filter('insightTypeToColor'),
        'RECIPE': $filter('recipeTypeToColor')
    };
    return function(subtype, type) {
        if (subtype && subtypeFilters[type.toUpperCase()]) {
            return subtypeFilters[type.toUpperCase()](subtype);
        } else {
            return $filter('typeToColor')(type);
        }
    };
});


app.filter('mlTaskTypeToIcon', function() {
    return function(taskType, predictionType) {
        if (!taskType || !predictionType) {
            return;
        }
        if (taskType.toLowerCase() == 'clustering') {
            return "icon-clustering";
        }
        return "icon-prediction-"+predictionType.toLowerCase();
    };
});


app.filter('backendTypeToIcon', function() {
    return function(backendType) {
        if (!backendType) return;
        return "icon-ml icon-ml-"+backendType.toLowerCase();
    };
});

// Boldify a pattern in the input.
//
// Note:
// - Input is plain text (and not HTML, because it will be escaped)
// - Output is HTML (sanitized, ready for display)
app.filter('boldify', function(){
    function preg_quote( str ) {
        return (str+'').replace(/([\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:])/g, "\\$1");
    }

    return function(input, replacements) {
        if (!replacements || replacements.length == 0 || !input) return sanitize(input);
        // Implementation notes:
        // - It is not possible to escape HTML entities and then boldify the pattern: this may produce invalid HTML if the pattern matches)
        // - It is not possible to boldify the pattern and then escape HTML entities: the boldification will be escaped
        // => Strategy is to split the string into tokens. Tokens are sanitized individually, and then enclosed in <b>...</b> if they match the pattern.

        var regex = new RegExp(replacements.map(function(e){
            if (e instanceof RegExp) {
                return "(?:"+e.source+")";
            } else {
                return "(?:"+preg_quote(e)+")";
            }
        }).join("|"), "gi");

        const highlightedSections = [];
        const rawTokenBoundaries = [0, input.length];

        input.replace(regex, function(val, pos) {
            highlightedSections.push([pos, pos + val.length]);
            rawTokenBoundaries.push(pos);
            rawTokenBoundaries.push(pos + val.length);
        });

        const tokenBoundaries = _.chain(rawTokenBoundaries).uniq().sortBy().value();

        let output = '';
        for(let i = 1; i < tokenBoundaries.length; i++) {
            const tokStartPos = tokenBoundaries[i-1];
            const tokEndPos = tokenBoundaries[i];
            let tokHighlighted = false;

            for(let j = 0; j < highlightedSections.length; j++) {
                const hlStartPos = highlightedSections[j][0];
                const hlEndPos = highlightedSections[j][1];

                if(hlStartPos < tokEndPos && tokStartPos < hlEndPos) {
                    tokHighlighted = true;
                    break;
                }
            }

            const token = input.substring(tokStartPos, tokEndPos);

            if(tokHighlighted) output += '<b>';
            output += sanitize(token);
            if(tokHighlighted) output += '</b>';
        }

        return output;
    }
});

app.filter('connectionNameFormatter', function () {
    const virtualConnectionRegex = "^@virtual\\((.+)\\):(connection:)?(.+)$";

    return function (input) {
        if (!input) return input;
        const match = input.match(virtualConnectionRegex);
        return match ? `Hive (${match[3]})` : input;
    }
});

app.filter('niceType', function($filter) {
    return function(input) {
        return typeProcessor(input, DATASET_TYPES, CONVERSION_FIELD_NAME, undefined,
            $filter('connectionTypeToNameForItem'))
    };
});


app.filter('nicePrecision', function() {
    return function(val, p) {
        if (val == undefined || val != val || val == null || !val.toFixed)
            return undefined;
        if (Math.abs(val) < Math.pow(10, p)) {
            if (Math.round(val) == val) {
                /* Don't add stuff to integers */
                return val.toFixed(0);
            } else {
                return val.toPrecision(p);
            }
        } else {
            return val.toFixed(0);
        }
    };
});

app.filter('ifEmpty', function() {
    return (value, defaultValue) => value == null ? defaultValue : value;
});

app.filter('niceConst', function() {
    return function(input) {
        if (!input || !input.length) { return ''; }
        input = input.replace(/[\s_]+|([a-z])(?=[A-Z])/g, '$1 ').trim();
        var nice = input.charAt(0).toUpperCase() + input.substr(1).toLowerCase();
        if (nice == 'Lambda service') {
            nice = 'API service';
        }
        if (nice == 'Sql notebook') {
            nice = 'SQL notebook';
        }
        return nice;
    }
});


app.filter('niceMLBackendType', function(LoggerProvider) {
    var niceNames = {
        'PY_MEMORY': 'Python (in memory)',
        'MLLIB': 'Spark MLLib',
        'H2O': 'Sparkling Water (H2O)',
        'VERTICA': 'Vertica Advanced Analytics'
    };

    var Logger = LoggerProvider.getLogger('DisplayFilters');

    return function(input) {
        if (!niceNames[input]) {
            Logger.warn("ML backend has no display name: "+input);
            return input;
        } else {
            return niceNames[input];
        }
    }
});


// input | replace:search_str:replacement
// input | replace:search_regexp:flags:replacement
app.filter('replace', function() {
    return function(input, regexp, flags, replace) {
        if (typeof replace === 'undefined') {
            replace = flags;
        } else {
            regexp = new RegExp(regexp, flags);
        }
        return regexp ? input.replace(regexp, replace) : input;
    }
});


app.filter('startAt', function() {
    return function(input, first) {
        first = parseInt(first, 10);
        var out = [], i;
        if (first >= input.length) {
            return out;
        }
        for (var i = first; i<input.length; i++) {
            out.push(input[i]);
        }
        return out;
    };
});


app.filter('shakerStepIcon', function(ShakerProcessorsUtils) {
    return function(step) {
        return ShakerProcessorsUtils.getStepIcon(step.type, step.params);
    };
});


app.filter('shakerStepDescription', function(ShakerProcessorsUtils) {
    return function(step) {
        return ShakerProcessorsUtils.getStepDescription(step.type, step.params);
    };
});


app.filter('objToParamsList', function(){
    return function(obj) {
        var arr = [];
        $.each(obj, function(key, val){
            arr.push(key + ": " + val);
        });
        return arr.join(', ');
    }
});


app.filter('filesize', function(){
    return function(size){
        if (size >= 1024*1024*1024) {
            return Math.round(size / 1024 / 1024 / 1024 * 100)/100 + ' GB';
        } else if (size >= 1024*1024){
            return Math.round(size / 1024 / 1024*100)/100 + ' MB';
        } else {
            return Math.round(size / 1024 *100)/100 + ' KB';
        }
    };
});


app.filter('fileSizeOrNA', function(){
    return function(size){
        if (size < 0) {
            return "N/A";
        } else if (size >= 1024*1024*1024) {
            return Math.round(size / 1024 / 1024 / 1024 * 100)/100 + ' GB';
        } else if (size >= 1024*1024){
            return Math.round(size / 1024 / 1024*100)/100 + ' MB';
        } else {
            return Math.round(size / 1024 *100)/100 + ' KB';
        }
    };
});


app.filter('fileSizeInMB', function(){
    return function(size){
        if (size < 0) {
            return "N/A";
        } else {
            return Math.round(size / 1024 / 1024*100)/100 + ' MB';
        }
    };
});


app.filter("displayMeasure", function() {
    return function(measure) {
        if (measure.function == 'SUM') {
            return 'Sum of ' + measure.column.name;
        } else if (measure.function == 'AVG') {
            return 'Average of ' + measure.column.name;
        } else {
            return "I have no idea what this is about " + measure.column;
        }
    };
});


app.filter("percentage", function() {
    return function(val) {
        return Math.round(val * 100) + '%';
    };
});


app.filter('toKVArray', function(){
    return function(dict) {
        if (dict){
            return $.map(dict, function(v, k){
                return {k:k, v:v};
            });
        } else {
            return [];
        }
    };
});


function objectToArray(dict, saveKey) {
    if (dict) {
        return $.map(dict, function (v, k) {
            if (saveKey) {
                v['_key'] = k;
            }
            return v;
        });
    }
    return [];
}

app.filter('toArray', function(){
    return (dict) => objectToArray(dict);
});

app.filter('toArrayWithKey', function () {
    return (dict) => objectToArray(dict, true);
});


app.filter('datasetPartition', function() {
    return function(val) {
        if (val.partition && val.partition != 'NP') {
            return val.dataset + " (" + val.partition + ")";
        } else {
            return val.dataset;
        }
    };
});


app.filter('breakText', function(){
    return function(text, breakon){
        var bo = breakon || '_';
        return text.replace(new RegExp(bo, 'g'), bo + '&#8203;');
    };
});


app.filter('truncateText', function(){
   return function(text, val){
        if (val == null) val = 30;
       return text.substring(0, val);
   };
});

app.filter('subString', function(){
    return function(text, start, end){
        if (start > end) {
            let s = start;
            start = end;
            end = s;
        }
        return text.substring(start, end);
    };
 });

app.filter('sanitize', function() {
    return function(x) {
        return sanitize(x);
    };
});

app.filter("stripHtml", function($sanitize) {
    return (htmlString) => $("<div>").html($sanitize(htmlString)).text();
})

app.filter('escape', function() {
   return function(x) {
       return escape(x);
   };
});


app.filter('escapeHtml', function() {
    var chars = /[<>&'"]/g,
        esc = (function(_) { return this[_]; }).bind({
            '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' });
    return function(s) { return s.replace(chars, esc); };
});


app.filter('unescapeHtml', function() {
    var chars = /&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-fA-F]+));?/g,
        esc = (function(_, code, dec, hex) {
            if (code in this) return this[code];
            if (dec || hex) return String.fromCharCode(parseInt(dec || hex, dec ? 10 : 16));
            return _;
        }).bind({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" });
    return function(s) { return s.replace(chars, esc); };
});


app.filter('meaningLabel', function($rootScope) {
    return function(input) {
        return $rootScope.appConfig.meanings.labelsMap[input] || input;
    };
});


app.filter('buildPartitionsDesc', function() {
    return function(input) {
        if (input.useExplicit) {
            return input.explicit;
        } else if (input.start) {
            if (input.start == input.end) {
                return input.start;
            } else {
                return input.start + " / " +input.end;
            }
        } else {
            return input;
        }
    };
});


// Similar to linky for doesn't detect emails
app.filter('parseUrlFilter', function() {
    var urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

    return function(text, target) {
        if(!target) {
            target = '_blank';
        }
        if(text) {
            return text.replace(urlPattern,'<a href="$1" target="'+target+'">$1</a>');
        }
        else {
            return '';
        }
    };
});


app.filter('dynamicFormat', function($filter) {
	  return function(value, filterName) {
	    return $filter(filterName)(value);
	  };
});


app.factory('$localeDurations', [function () {
    return {
        'one': {
            year: '{} year',
            month: '{} month',
            week: '{} week',
            day: '{} day',
            hour: '{} hour',
            minute: '{} minute',
            second: '{} second'
        },
        'other': {
            year: '{} years',
            month: '{} months',
            week: '{} weeks',
            day: '{} days',
            hour: '{} hours',
            minute: '{} minutes',
            second: '{} seconds'
        }
    };
}]);


app.filter('duration', ['$locale', '$localeDurations', function ($locale, $localeDurations) {
    return function duration(value, unit, precision) {
        var unit_names = ['year', 'month', 'week', 'day', 'hour', 'minute', 'second'],
            units = {
                year: 86400*365.25,
                month: 86400*31,
                week: 86400*7,
                day: 86400,
                hour: 3600,
                minute: 60,
                second: 1
            },
            words = [],
            max_units = unit_names.length;


        precision = parseInt(precision, 10) || units[precision || 'second'] || 1;
        value = (parseInt(value, 10) || 0) * (units[unit || 'second'] || 1);

        if (value >= precision) {
            value = Math.round(value / precision) * precision;
        } else {
            max_units = 1;
        }

        var i, n;
        for (i = 0, n = unit_names.length; i < n && value !== 0; i++) {
            var unit_name = unit_names[i],
                unit_value = Math.floor(value / units[unit_name]);

            if (unit_value !== 0) {
                words.push(($localeDurations[unit_value] || $localeDurations[$locale.pluralCat(unit_value)] || {unit_name: ('{} ' + unit_name)})[unit_name].replace('{}', unit_value));
                if (--max_units === 0) break;
            }

            value = value % units[unit_name];
        }

        if (words.length){
            return words.join(" ");
        }
        return '0s';
    };
}]);

app.filter('fsProviderDisplayName', function() {
    return function(value) {
        return typeProcessor(value, FS_PROVIDER_TYPES, CONVERSION_FIELD_NAME, undefined, defaultValue);
    };
});

app.filter('cleanConnectionName', function() {
    return function(input) {
        if (input && input.startsWith("@virtual(impala-jdbc):")) {
            return "Impala builtin";
        } else {
            return input;
        }
    };
});

app.filter('uniqueStrings', function() {
    return function(x) {
        if (!x) return x;
        var uniqueValues = [];
        x.forEach(function(v) {
           if (uniqueValues.indexOf(v) < 0) {
               uniqueValues.push(v);
           }
        });
        return uniqueValues;
    };
 });

app.filter('encodeHTML', function() {
    return rawStr => String(rawStr).replace(/[\u00A0-\u9999<>\&]/gim, i => '&#'+i.charCodeAt(0)+';');
});

app.filter('map2Object', function() {
    return function(input) {
      var output = {};
      input.forEach((value, key) => output[key] = value);
      return output;
    };
});

app.filter("bundleProjectContent", function() {
    const bundleContentConfigMap = {
        datasets: 'Datasets',
        recipes: 'Recipes',
        savedModels: 'Saved models',
        modelEvaluationStores: 'Evaluation stores',
        managedFolders: 'Managed folders',
        scenarios: 'Scenarios',
        analysis: 'Analyses',
        jupyterNotebooks: 'Jupyter notebooks',
        sqlNotebooks: 'SQL notebooks',
        insights: 'Insights',
        dashboards: 'Dashboards'
    }
    return input => bundleContentConfigMap[input];
});

})();
