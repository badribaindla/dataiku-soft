import {
    ANTLRInputStream,
    CommonTokenStream,
    ANTLRErrorListener,
    Recognizer,
    Token,
    RecognitionException
} from 'antlr4ts';
import {FlowFilterLexer} from "./generated/FlowFilterLexer";
import {FlowFilterParser} from "./generated/FlowFilterParser";
import * as c3 from "./third/index";

export class ErrorListener implements ANTLRErrorListener<Token> {
    public offeringSymbol: Token | undefined;

    syntaxError<T extends Token>(recognizer: Recognizer<T, any>, offendingSymbol: T | undefined, line: number,
                                 charPositionInLine: number, msg: string, e: RecognitionException | undefined) {
        this.offeringSymbol = offendingSymbol;
    }
};

function suggestTokens(input: string) {
    let inputStream = new ANTLRInputStream(input);
    let lexer = new FlowFilterLexer(inputStream);
    let tokenStream = new CommonTokenStream(lexer);

    let parser = new FlowFilterParser(tokenStream);
    lexer.removeErrorListeners();
    parser.removeErrorListeners();
    let core = new c3.CodeCompletionCore(parser);
    let errorListener = new ErrorListener();
    parser.addErrorListener(errorListener);
    let tree = parser.parse();

    let candidates = core.collectCandidates(errorListener.offeringSymbol && errorListener.offeringSymbol.type != Token.EOF ? tokenStream.size - 2 : tokenStream.size);

    function tokenTypesToNames(tokenTypes: Array<number>) {
        return tokenTypes
            .filter(e => e > 0)
            .map(e => lexer.vocabulary.getDisplayName(e))
            .map(e => e.replace(/^\'|\'$/g, ""))
            .filter(e => e !== ' ')
    };
    return {
        tokens: tokenTypesToNames(tokenStream.getTokens().map(e => e.type)),
        suggestions: tokenTypesToNames(Array.from(candidates.tokens.keys()).sort()),
        offeringSymbol: errorListener.offeringSymbol ? errorListener.offeringSymbol.text : null
    };
}

export {suggestTokens};