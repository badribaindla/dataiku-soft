(function() {
'use strict';

    function set(str) {
        var obj = {}, words = str.split(" ");
        for (var i = 0; i < words.length; ++i)
            obj[words[i]] = true;
        return obj;
    }

    // HiveQL mode
    CodeMirror
            .defineMIME(
                    "text/x-hivesql",
                    {
                        name : "sql",
                        keywords : set("analyze show database describe add delete jar file archive temporary function sort distribute cluster overwrite alter and as asc between by count create desc distinct drop from having in insert into is join like not on or order group select set table union where "),
                        builtin : set("tinyint smallint int bigint float double decimal timestamp date string varchar char boolean binary array map struct uniontype"),
                        atoms : set("false true null"),
                        operatorChars : /^[*+\-%<>!=]/,
                        dateSQL : set("date timestamp"),
                        support : set("zerolessFloat")
                    });

    // A generic SQL Mode. It's not a standard, it just try to support what is
    // generally supported

    function hookDKUVar(stream) {
        if (stream.peek() == "{" && stream.match(/{[^}]*}/)) {
            return "variable-2";
        }
        return null;
    }

    CodeMirror
            .defineMIME(
                    "text/x-sql2",
                    {
                        name : "sql",
                        keywords : set("alter and as asc between by count create delete desc distinct drop from having in insert into is join like not on or order select set table union update values where begin commit group"),
                        builtin : set("bool boolean bit blob enum long longblob longtext medium mediumblob mediumint mediumtext time timestamp tinyblob tinyint tinytext text bigint int int1 int2 int3 int4 int8 integer float float4 float8 double char varbinary varchar varcharacter precision real date datetime year unsigned signed decimal numeric"),
                        atoms : set("false true null unknown"),
                        operatorChars : /^[*+\-%<>!=]/,
                        dateSQL : set("date time timestamp"),
                        support : set("ODBCdotTable doubleQuote binaryNumber hexNumber"),
                        hooks : {
                            "$" : hookDKUVar
                        }
                    });

})();