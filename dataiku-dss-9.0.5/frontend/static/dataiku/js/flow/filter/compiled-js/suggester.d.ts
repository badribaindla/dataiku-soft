import { ANTLRErrorListener, Recognizer, Token, RecognitionException } from 'antlr4ts';
export declare class ErrorListener implements ANTLRErrorListener<Token> {
    offeringSymbol: Token | undefined;
    syntaxError<T extends Token>(recognizer: Recognizer<T, any>, offendingSymbol: T | undefined, line: number, charPositionInLine: number, msg: string, e: RecognitionException | undefined): void;
}
declare function suggestTokens(input: string): {
    tokens: string[];
    suggestions: string[];
    offeringSymbol: string | null | undefined;
};
export { suggestTokens };
