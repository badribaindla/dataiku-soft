"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestTokens = exports.ErrorListener = void 0;
const antlr4ts_1 = require("antlr4ts");
const FlowFilterLexer_1 = require("./generated/FlowFilterLexer");
const FlowFilterParser_1 = require("./generated/FlowFilterParser");
const c3 = require("./third/index");
class ErrorListener {
    syntaxError(recognizer, offendingSymbol, line, charPositionInLine, msg, e) {
        this.offeringSymbol = offendingSymbol;
    }
}
exports.ErrorListener = ErrorListener;
;
function suggestTokens(input) {
    let inputStream = new antlr4ts_1.ANTLRInputStream(input);
    let lexer = new FlowFilterLexer_1.FlowFilterLexer(inputStream);
    let tokenStream = new antlr4ts_1.CommonTokenStream(lexer);
    let parser = new FlowFilterParser_1.FlowFilterParser(tokenStream);
    lexer.removeErrorListeners();
    parser.removeErrorListeners();
    let core = new c3.CodeCompletionCore(parser);
    let errorListener = new ErrorListener();
    parser.addErrorListener(errorListener);
    let tree = parser.parse();
    let candidates = core.collectCandidates(errorListener.offeringSymbol && errorListener.offeringSymbol.type != antlr4ts_1.Token.EOF ? tokenStream.size - 2 : tokenStream.size);
    function tokenTypesToNames(tokenTypes) {
        return tokenTypes
            .filter(e => e > 0)
            .map(e => lexer.vocabulary.getDisplayName(e))
            .map(e => e.replace(/^\'|\'$/g, ""))
            .filter(e => e !== ' ');
    }
    ;
    return {
        tokens: tokenTypesToNames(tokenStream.getTokens().map(e => e.type)),
        suggestions: tokenTypesToNames(Array.from(candidates.tokens.keys()).sort()),
        offeringSymbol: errorListener.offeringSymbol ? errorListener.offeringSymbol.text : null
    };
}
exports.suggestTokens = suggestTokens;
//# sourceMappingURL=suggester.js.map