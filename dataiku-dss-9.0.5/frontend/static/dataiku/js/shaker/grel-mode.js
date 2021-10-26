(function () {
    "use strict";

    const app = angular.module("dataiku.services");

    app.factory("GrelMode", [
        "CachedAPICalls",
        function (CachedAPICalls) {
            CachedAPICalls.customFormulasFunctions.then(function (resp) {
                const Pos = CodeMirror.Pos;

                const ctx = {
                    bra: 0, //current open brackets
                    sqbra: 0, // current open square brackets
                };

                /*
                  addictional config options:
                  - variables: (function that returns a list of strings) if provided, only returned identifiers are valid variable names
                */
                CodeMirror.defineMode("grel", function (config) {
                    const QUOTES = "\"'";
                    const numLiteralPtn = /\b^-?\d+(\.\d+)?\b/;
                    const namePtn = /\w+/;
                    const variablesAltPtn = /\${[^}]*}/;
                    const variablesPtn = /variables/;
                    const variablesAndNamePtn = /variables\.\w+/;
                    const regExpPtn = /\/(\\.|[^\\\/])*\//;

                    function neutral(stream, state) {
                        if (stream.match(numLiteralPtn)) {
                            return "number";
                        }

                        if (stream.match(variablesAndNamePtn) || stream.match(variablesPtn) || stream.match(variablesAltPtn)) {
                            return "variable";
                        }

                        if (stream.match(namePtn)) {
                            // if no set of available variables was defined, accept anything that matched the pattern
                            if (config.variables) {
                                const name = stream.string.substr(
                                    stream.start,
                                    stream.pos - stream.start
                                );
                                if (FUNCTIONS.indexOf(name) >= 0) {
                                    return "builtin";
                                }

                                const variables = config.variables();
                                if (
                                    !variables ||
                                    variables.length == 0 ||
                                    variables.indexOf(name) >= 0
                                ) {
                                    return "column";
                                }

                                // we should not expect inline definition of a variable outside of a function
                                return state.ctx.bra > 0
                                    ? "inline-variable"
                                    : "error";
                            }
                            return "column";
                        }

                        if (stream.match(regExpPtn)) {
                            return "regex";
                        }

                        const c = stream.next();
                        if (QUOTES.indexOf(c) != -1) {
                            state.ctx.curquote = c;
                            state.token = inString;
                            return inString(stream, state);
                        } else if (c == "(") {
                            state.ctx.bra += 1;
                            return "bracket";
                        } else if (c == ")") {
                            if (state.ctx.bra == 0) {
                                return "error";
                            } else {
                                state.ctx.bra -= 1;
                                return "bracket";
                            }
                        } else if (c == "[") {
                            state.ctx.sqbra += 1;
                            return "sqbracket";
                        } else if (c == "]") {
                            if (state.ctx.sqbra == 0) {
                                return "error";
                            } else {
                                state.ctx.sqbra -= 1;
                                return "sqbracket";
                            }
                        } else if (OPERATORS.indexOf(c + stream.peek()) != -1) {
                            //try two characters operators
                            stream.next();
                            return "symbol";
                        } else if (OPERATORS.indexOf(c) != -1) {
                            return "symbol";
                        } else if (c == "\\") {
                            return "symbol";
                        } else if (
                            state.ctx.bra + state.ctx.sqbra > 0 &&
                            c == ","
                        ) {
                            return "comma";
                        }
                        return "error";
                    }

                    function inString(stream, state) {
                        var c = undefined;
                        // as long as we do not reach the end of the file
                        // or the end of the string
                        while (c != state.ctx.curquote) {
                            if (c == "\\") {
                                stream.next(); // escape char, we skip ahead
                            }
                            c = stream.next();
                            if (!c) {
                                break;
                            }
                        }
                        state.token = neutral;
                        return "string";
                    }

                    return {
                        startState: function () {
                            return {
                                ctx,
                                token: neutral,
                            };
                        },

                        token: function (stream, state) {
                            // skipping whitespaces
                            if (stream.eatSpace()) {
                                return null;
                            }
                            return state.token(stream, state);
                        },
                    };
                });

                CodeMirror.defineMIME("text/grel", "grel");

                const OPERATORS = [
                    "+",
                    "-",
                    "%",
                    "+",
                    "*",
                    "/",
                    ".",
                    "==",
                    "<=",
                    ">=",
                    "<",
                    ">",
                    "!=",
                    "&&",
                    "||",
                    "!",
                ]; // . is the 'apply()' operator
                const FUNCTIONS = resp.data;

                function grelHint(cm, options) {
                    var noColumn = function () {
                        return [];
                    };
                    var columns = options.columns || noColumn;
                    var variables = options.variables || [];
                    var cur = cm.getCursor();
                    var token = cm.getTokenAt(cur);
                    var suggestions = [];
                    var start, end;
                    var token_str = token.string;

                    if(token_str.startsWith('${') && token_str.endsWith('}')) {
                        if(token.end === cur.ch) {
                            return {
                                list: [],
                                from: start,
                                to: end,
                            };
                        }
                        token_str = token_str.substr(0, token.length - 1);
                    }

                    const filterSuggest = function (prefix, candidates) {
                        if (!candidates) {
                            return [];
                        }
                        var filteredSuggests = [];
                        for (let i = 0; i < candidates.length; i++) {
                            var candidate = candidates[i];
                            if (
                                candidate &&
                                candidate
                                    .toLowerCase()
                                    .startsWith(prefix.toLowerCase())
                            ) {
                                filteredSuggests.push(candidate);
                            }
                        }
                        return filteredSuggests;
                    };

                    if (token.type == "string") {
                        const leftPart = cm.getLine(cur.line).substr(0, cur.ch);
                        if(leftPart.endsWith('val("') || leftPart.endsWith('val(\'')) {
                            suggestions = columns();
                        }
                        else if (token_str.length > 1) {
                            // autocomplete with column, only after at least one character
                            suggestions = filterSuggest(
                                token_str.substr(1),
                                columns()
                            );
                        }
                    } else if (
                        token.type == "bracket" ||
                        token.type == "sqbracket" ||
                        token.type == "symbol"
                    ) {
                        // TODO maybe add autocomplete here as well
                    } else if (token.type == null && token.string == "") {
                        // Don't autocomplete "nothing", it's too annoying
                    } else {
                        suggestions = filterSuggest(token_str, columns());
                        suggestions = [
                            ...suggestions,
                            ...filterSuggest(token_str, variables),
                        ];
                        if (token_str != "") {
                            suggestions = [
                                ...suggestions,
                                ...filterSuggest(token_str, FUNCTIONS),
                            ];
                        }
                    }
                    start = Pos(cur.line, token.start);
                    end = Pos(cur.line, token.end);
                    return {
                        list: suggestions,
                        from: start,
                        to: end,
                    };
                }

                CodeMirror.registerHelper("hint", "grel", grelHint);
            });

            return {
                //TODO this is not really a service, it has no functionnality
            };
        },
    ]);
})();
