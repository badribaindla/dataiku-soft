(function() {
'use strict';

// Very basic context-sensitive SQL completion
    const GENERIC_QUERY_KEYWORDS = ("SELECT FROM ").split(" ");

    const GENERIC_KEYWORDS_AFTER_TABLES = ("HAVING IS IN NOT LIKE UNION INNER JOIN ON WHERE GROUP BY LIMIT ORDER ASC DESC BETWEEN ").split(" ");

    //const HIVE_TYPES = ("date timestamp tinyint smallint int bigint float double decimal " + "timestamp date string varchar char boolean binary" + "array map struct uniontype").split(" ");

    const HIVE_FUNCTIONS = ("ROUND FLOOR CEIL CEILING RAND EXP LN LOG10 LOG2 LOG POW POWER SQRT BIN HEX UNHEX CONV ABS PMOD SIN ASIN COS ACOS TAN ATAN DEGREES RADIANS POSITIVE NEGATIVE SIGN E PI SIZE MAP_KEYS MAP_VALUES ARRAY_CONTAINS SORT_ARRAY BINARY CAST FROM_UNIXTIME UNIX_TIMESTAMP TO_DATE YEAR MONTH DAY HOUR MINUTE SECOND WEEKOFYEAR DATEDIFF DATE_ADD DATE_SUB FROM_UTC_TIMESTAMP TO_UTC_TIMESTAMP ASCII CONCAT CONTEXT_NGRAMS CONCAT_WS FIND_IN_SET FORMAT_NUMBER GET_JSON_OBJECT IN_FILE INSTR LENGTH LOCATE LOWER LCASE LPAD LTRIM NGRAMS PARSE_URL PRINTF REGEXP_EXTRACT REGEXP_REPLACE REPEAT REVERSE RPAD RTRIM SENTENCES SPACE SPLIT STR_TO_MAP SUBSTR SUBSTRING TRANSLATE TRIM UPPER UCASE JAVA_METHOD REFLECT XPATH XPATH_SHORT XPATH_INT XPATH_LONG XPATH_FLOAT XPATH_DOUBLE XPATH_NUMBER XPATH_STRING COUNT SUM AVG MIN MAX VARIANCE VAR_SAMP STDEV_POP STDEV_SAMP COVAR_POP COVAR_SAMP CORR PERCENTILE PERCENTILE_APPROX HISTOGRAM_NUMERIC COLLECT_SET INLINE EXPLODE JSON_TUPLE PARSE_URL_TUPLE GET_JSON_OBJECT").split(" ");

    const IMPALA_FUNCTIONS = HIVE_FUNCTIONS

    const GENERIC_FUNCTIONS = ("ROUND FLOOR CEIL EXP SUM COUNT AVG MIN MAX SQRT SIN COS ASIN ACOS TAN ATAN").split(" ")

    const GENERIC_KEYWORDS = ("AND DISTINCT OR false true").split(" ");

    const NON_QUERY_SQL_KEYWORDS = ("DELETE UPDATE ALTER CREATE DROP INSERT INTO SET TABLE").split(" ")

    const NON_QUERY_HIVE_KEYWORDS = ("ANALYZE SHOW DATABASE DESCRIBE DELETE ALTER CREATE DROP INSERT INTO SET TABLE ADD JAR FILE ARCHIVE TEMPORARY FUNCTION SORT DISTRIBUTE CLUSTER OVERWRITE").split(" ")

    const QUERY_HIVE_KEYWORDS = ("ANALYZE SHOW DATABASE DESCRIBE").split(" ")

    const NON_QUERY_IMPALA_KEYWORDS = NON_QUERY_HIVE_KEYWORDS

    const QUERY_IMPALA_KEYWORDS = QUERY_HIVE_KEYWORDS

    //const HIVE_KEYWORDS = ("").split(" ")

    function forEach(arr, f) {
        for (var i = 0, e = arr.length; i < e; ++i) {
            f(arr[i]);
        }
    }

    function maybeAdd(str, tkstr, list, prefix, suffix) {
        if (str.toLowerCase().indexOf(tkstr.toLowerCase()) == 0 && list.indexOf(str) == -1) {
            list.push((prefix || '') + str + (suffix || ''));
        }
    }

    function maybeAddIfToken(str, curToken, list, prefix, suffix) {
        if (curToken && curToken.string && curToken.string.length && !curToken.string.match(/^\s*$/)) {

            maybeAdd(str, curToken.string, list, prefix, suffix);
        } else if (curToken && curToken.string && curToken.string.length == 0) {
            list.push((prefix || '') + str + (suffix || ''));
        } else {
            list.push(" " + (prefix || '') + str + (suffix || ''));
        }
    }

    function maybeAddListIfToken(inList, curToken, list, prefix, suffix)  {
        forEach(inList, function(str) {
            maybeAddIfToken(str, curToken, list, prefix, suffix);
        });
    }

    function tablesAutocomplete(textBefore) {
        var u = textBefore.toUpperCase();
        return u.search(/\sFROM\s/) > -1 && u.search(/\sON\s/) == -1 && u.search(/\sWHERE\s/) == -1;

    }

    function tablesPlusFromAutocomplete(textBefore) {
        var u = textBefore.toUpperCase()
        return u.search(/SELECT\s/) > -1 && u.search(/\sFROM\s/) == -1;
    }

    /** Returns the list of tables on which to do autocompletion */
    function fieldsAutocomplete(text, tablesList) {
        var u = text.toUpperCase();

        if (u.search(/\sFROM\s/) > -1) {
            var ret = [];
            var tokensBefore = text.split(/[\s,]+/)
            for (var i = 0; i < tokensBefore.length; i++) {
                var tb = tokensBefore[i].toUpperCase();
                for(var k = 0 ; k < tablesList.length ; k++) {
                    var tableName = tablesList[k].table;
                    var matches = tableName.toUpperCase() == tb;
                	// check if the table is prefixed by schema
                    matches = matches || tb.endsWith('.' + tableName.toUpperCase());
                    ['"', '`'].forEach(function(q) {
                    	// captures table quoted alone, and prefixed by schema
                        matches = matches || tb.endsWith(q + tableName.toUpperCase() + q)
                    });
                    if(matches && ret.indexOf(tablesList[k])==-1) {
                        ret.push(tablesList[k]);
                    }
                }
            }
            return ret;
        } else {
            return null;
        }
    }

    CodeMirror.sqlNotebookHint = function(editor, type, tablesList, sqlFields)  {
        var cursor = editor.getCursor();
        var curToken = editor.getTokenAt(cursor);
        var textBefore = editor.getRange({
            line: 0,
            ch: 0
        }, {
            line: editor.getCursor().line,
            ch: editor.getCursor().ch
        }).replace(/(\r\n|\n|\r)/gm, " ");

        if (curToken.string.endsWith("(")) {
            var off = curToken.string.lastIndexOf('(');
            curToken.start += off + 1;
            curToken.string = curToken.string.substring(off + 1)
        } else if (curToken.string.endsWith(".")) {
            var off = curToken.string.lastIndexOf('.');
            curToken.start += off + 1;
            curToken.string = curToken.string.substring(off + 1)
        }

        var normalCompletionList = [],
            beginCompletionList = [];

        /* Tables and fields */
        if (tablesAutocomplete(textBefore)) {
        	// strip potential quotes
        	var tableToken = curToken;
        	var startQuote = null;
        	var endQuote = null;
        	['"','`'].forEach(function(q) {
        		if ( startQuote == null && endQuote == null && tableToken.string.charAt(0) == q ) {
        			tableToken.string = tableToken.string.substring(1);
        			startQuote = q;
        		}
        		if ( (startQuote == null || startQuote == q) && endQuote == null && tableToken.string.charAt(tableToken.string.length - 1) == q ) {
        			tableToken.string = tableToken.string.substring(0, tableToken.string.length - 1);
        			endQuote = q;
        		}
        	});
            maybeAddListIfToken(tablesList, tableToken, beginCompletionList, startQuote, endQuote || startQuote);
        }
        if (sqlFields) {
            forEach(sqlFields, function(str) {
                maybeAddIfToken(str.name, curToken, beginCompletionList);
            });
        }
        /* Fucntions */
        if (type.toLowerCase().indexOf("hive")!=-1) {
            maybeAddListIfToken(HIVE_FUNCTIONS, curToken, normalCompletionList);
        } else if (type.toLowerCase().indexOf("impala")!=-1) {
        	maybeAddListIfToken(IMPALA_FUNCTIONS, curToken, normalCompletionList);
        } else {
            maybeAddListIfToken(GENERIC_FUNCTIONS, curToken, normalCompletionList);
        }


        /* Non-notebook functions */
        if(type.toLowerCase().indexOf("recipe")!=-1) {
            if (type.toLowerCase().indexOf("hive")!=-1) {
                maybeAddListIfToken(NON_QUERY_HIVE_KEYWORDS,curToken,normalCompletionList);
                maybeAddListIfToken(QUERY_HIVE_KEYWORDS,curToken,normalCompletionList);
            } else if (type.toLowerCase().indexOf("impala")!=-1) {
                maybeAddListIfToken(NON_QUERY_IMPALA_KEYWORDS,curToken,normalCompletionList);
                maybeAddListIfToken(QUERY_IMPALA_KEYWORDS,curToken,normalCompletionList);
            } else {
                maybeAddListIfToken(NON_QUERY_SQL_KEYWORDS,curToken,normalCompletionList);
            }
        }  else {
            if (type.toLowerCase().indexOf("hive")!=-1) {
                maybeAddListIfToken(QUERY_HIVE_KEYWORDS,curToken,normalCompletionList);
            } else if (type.toLowerCase().indexOf("impala")!=-1) {
                maybeAddListIfToken(QUERY_IMPALA_KEYWORDS,curToken,normalCompletionList);
            }

        }

        /* Most specific keywords */
        if (textBefore.toUpperCase().indexOf("FROM") > -1) {
            maybeAddListIfToken(GENERIC_KEYWORDS_AFTER_TABLES, curToken, normalCompletionList);
        }

        if (textBefore.toUpperCase().indexOf("SELECT") == -1) {
            maybeAddIfToken("SELECT", curToken, beginCompletionList);
        }
        if (textBefore.toUpperCase().indexOf("FROM") == -1) {
            maybeAddIfToken("FROM", curToken, beginCompletionList);
        }

        /* Other keywords */
        maybeAddListIfToken(GENERIC_KEYWORDS, curToken, normalCompletionList);

        let completionList = beginCompletionList.sort().concat(normalCompletionList.sort());
        return {
            list: completionList,
            from: {
                line: cursor.line,
                ch: curToken.start
            },
            to: {
                line: cursor.line,
                ch: curToken.end
            }
        };
    }

    CodeMirror.sqlFieldsAutocomplete = function(editor, tablesList) {
        var cursor = editor.getCursor();
        var curToken = editor.getTokenAt(cursor);
        var textBefore = editor.getRange({
            line: 0,
            ch: 0
        }, {
            line: editor.getCursor().line,
            ch: editor.getCursor().ch
        }).replace(/(\r\n|\n|\r)/gm, " ");
        return fieldsAutocomplete(editor.getValue(), tablesList);
    }


})();