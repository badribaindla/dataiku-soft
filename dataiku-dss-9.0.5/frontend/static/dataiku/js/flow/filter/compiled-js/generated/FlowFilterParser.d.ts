import { ATN } from 'antlr4ts/atn/ATN';
import { Parser } from 'antlr4ts/Parser';
import { ParserRuleContext } from 'antlr4ts/ParserRuleContext';
import { RuleContext } from 'antlr4ts/RuleContext';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';
import { Token } from 'antlr4ts/Token';
import { TokenStream } from 'antlr4ts/TokenStream';
import { Vocabulary } from 'antlr4ts/Vocabulary';
export declare class FlowFilterParser extends Parser {
    static readonly T__0 = 1;
    static readonly LPAREN = 2;
    static readonly RPAREN = 3;
    static readonly AND = 4;
    static readonly OR = 5;
    static readonly NOT = 6;
    static readonly PAST_HOUR = 7;
    static readonly PAST_DAY = 8;
    static readonly PAST_WEEK = 9;
    static readonly PAST_MONTH = 10;
    static readonly PAST_YEAR = 11;
    static readonly DATETIME = 12;
    static readonly DATE = 13;
    static readonly TIME = 14;
    static readonly VALUE = 15;
    static readonly NAME = 16;
    static readonly TAG = 17;
    static readonly TYPE = 18;
    static readonly DATASET_TYPE = 19;
    static readonly RECIPE_TYPE = 20;
    static readonly USER = 21;
    static readonly CREATED = 22;
    static readonly CREATED_ON = 23;
    static readonly CREATED_BETWEEN = 24;
    static readonly CREATED_FROM = 25;
    static readonly CREATED_TO = 26;
    static readonly DOWNSTREAM_FROM = 27;
    static readonly MODIFIED = 28;
    static readonly MODIFIED_ON = 29;
    static readonly MODIFIED_BETWEEN = 30;
    static readonly MODIFIED_FROM = 31;
    static readonly MODIFIED_TO = 32;
    static readonly WS = 33;
    static readonly SPACE = 34;
    static readonly ESCAPED_TEXT = 35;
    static readonly RULE_parse = 0;
    static readonly RULE_expression = 1;
    static readonly RULE_operator = 2;
    static readonly RULE_escapedTextValue = 3;
    static readonly RULE_stringValue = 4;
    static readonly RULE_selectorTextValue = 5;
    static readonly RULE_selectorDateValue = 6;
    static readonly RULE_selectorModificationDateValue = 7;
    static readonly RULE_date = 8;
    static readonly RULE_dateTime = 9;
    static readonly RULE_dateTimeRange = 10;
    static readonly RULE_modificationDateTimeRange = 11;
    static readonly RULE_floatingTimeRange = 12;
    static readonly ruleNames: string[];
    private static readonly _LITERAL_NAMES;
    private static readonly _SYMBOLIC_NAMES;
    static readonly VOCABULARY: Vocabulary;
    get vocabulary(): Vocabulary;
    get grammarFileName(): string;
    get ruleNames(): string[];
    get serializedATN(): string;
    constructor(input: TokenStream);
    parse(): ParseContext;
    expression(): ExpressionContext;
    expression(_p: number): ExpressionContext;
    operator(): OperatorContext;
    escapedTextValue(): EscapedTextValueContext;
    stringValue(): StringValueContext;
    selectorTextValue(): SelectorTextValueContext;
    selectorDateValue(): SelectorDateValueContext;
    selectorModificationDateValue(): SelectorModificationDateValueContext;
    date(): DateContext;
    dateTime(): DateTimeContext;
    dateTimeRange(): DateTimeRangeContext;
    modificationDateTimeRange(): ModificationDateTimeRangeContext;
    floatingTimeRange(): FloatingTimeRangeContext;
    sempred(_localctx: RuleContext, ruleIndex: number, predIndex: number): boolean;
    private expression_sempred;
    static readonly _serializedATN: string;
    static __ATN: ATN;
    static get _ATN(): ATN;
}
export declare class ParseContext extends ParserRuleContext {
    EOF(): TerminalNode;
    expression(): ExpressionContext | undefined;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
export declare class ExpressionContext extends ParserRuleContext {
    constructor();
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
    copyFrom(ctx: ExpressionContext): void;
}
export declare class BinaryExpressionContext extends ExpressionContext {
    _left: ExpressionContext;
    _op: OperatorContext;
    _right: ExpressionContext;
    expression(): ExpressionContext[];
    expression(i: number): ExpressionContext;
    operator(): OperatorContext;
    constructor(ctx: ExpressionContext);
}
export declare class SelectorWithDateExpressionContext extends ExpressionContext {
    _key: Token;
    _value: SelectorDateValueContext;
    selectorDateValue(): SelectorDateValueContext;
    CREATED_FROM(): TerminalNode | undefined;
    CREATED_TO(): TerminalNode | undefined;
    CREATED_ON(): TerminalNode | undefined;
    constructor(ctx: ExpressionContext);
}
export declare class SelectorWithFloatingModificationDateExpressionContext extends ExpressionContext {
    _key: Token;
    _value: FloatingTimeRangeContext;
    MODIFIED(): TerminalNode;
    floatingTimeRange(): FloatingTimeRangeContext;
    constructor(ctx: ExpressionContext);
}
export declare class SelectorWithFloatingDateExpressionContext extends ExpressionContext {
    _key: Token;
    _value: FloatingTimeRangeContext;
    CREATED(): TerminalNode;
    floatingTimeRange(): FloatingTimeRangeContext;
    constructor(ctx: ExpressionContext);
}
export declare class SelectorWithDateRangeExpressionContext extends ExpressionContext {
    _key: Token;
    _value: DateTimeRangeContext;
    CREATED_BETWEEN(): TerminalNode;
    dateTimeRange(): DateTimeRangeContext;
    constructor(ctx: ExpressionContext);
}
export declare class SelectorWithModificationDateRangeExpressionContext extends ExpressionContext {
    _key: Token;
    _value: ModificationDateTimeRangeContext;
    MODIFIED_BETWEEN(): TerminalNode;
    modificationDateTimeRange(): ModificationDateTimeRangeContext;
    constructor(ctx: ExpressionContext);
}
export declare class NotExpressionContext extends ExpressionContext {
    _expr: ExpressionContext;
    NOT(): TerminalNode;
    expression(): ExpressionContext;
    constructor(ctx: ExpressionContext);
}
export declare class ParenExpressionContext extends ExpressionContext {
    LPAREN(): TerminalNode;
    expression(): ExpressionContext;
    RPAREN(): TerminalNode;
    constructor(ctx: ExpressionContext);
}
export declare class SelectorWithTextExpressionContext extends ExpressionContext {
    _key: Token;
    _value: SelectorTextValueContext;
    selectorTextValue(): SelectorTextValueContext;
    NAME(): TerminalNode | undefined;
    TYPE(): TerminalNode | undefined;
    TAG(): TerminalNode | undefined;
    USER(): TerminalNode | undefined;
    DOWNSTREAM_FROM(): TerminalNode | undefined;
    DATASET_TYPE(): TerminalNode | undefined;
    RECIPE_TYPE(): TerminalNode | undefined;
    constructor(ctx: ExpressionContext);
}
export declare class SelectorWithModificationDateExpressionContext extends ExpressionContext {
    _key: Token;
    _value: SelectorModificationDateValueContext;
    selectorModificationDateValue(): SelectorModificationDateValueContext;
    MODIFIED_FROM(): TerminalNode | undefined;
    MODIFIED_TO(): TerminalNode | undefined;
    MODIFIED_ON(): TerminalNode | undefined;
    constructor(ctx: ExpressionContext);
}
export declare class OperatorContext extends ParserRuleContext {
    constructor();
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
    copyFrom(ctx: OperatorContext): void;
}
export declare class OrOperatorContext extends OperatorContext {
    OR(): TerminalNode;
    constructor(ctx: OperatorContext);
}
export declare class AndOperatorContext extends OperatorContext {
    AND(): TerminalNode;
    constructor(ctx: OperatorContext);
}
export declare class SpaceOperatorContext extends OperatorContext {
    SPACE(): TerminalNode[];
    SPACE(i: number): TerminalNode;
    constructor(ctx: OperatorContext);
}
export declare class EscapedTextValueContext extends ParserRuleContext {
    ESCAPED_TEXT(): TerminalNode;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
export declare class StringValueContext extends ParserRuleContext {
    VALUE(): TerminalNode;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
export declare class SelectorTextValueContext extends ParserRuleContext {
    stringValue(): StringValueContext | undefined;
    escapedTextValue(): EscapedTextValueContext | undefined;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
export declare class SelectorDateValueContext extends ParserRuleContext {
    date(): DateContext | undefined;
    dateTime(): DateTimeContext | undefined;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
export declare class SelectorModificationDateValueContext extends ParserRuleContext {
    date(): DateContext | undefined;
    dateTime(): DateTimeContext | undefined;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
export declare class DateContext extends ParserRuleContext {
    DATE(): TerminalNode;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
export declare class DateTimeContext extends ParserRuleContext {
    DATETIME(): TerminalNode;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
export declare class DateTimeRangeContext extends ParserRuleContext {
    _from: DateTimeContext;
    _to: DateTimeContext;
    dateTime(): DateTimeContext[];
    dateTime(i: number): DateTimeContext;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
export declare class ModificationDateTimeRangeContext extends ParserRuleContext {
    _from: DateTimeContext;
    _to: DateTimeContext;
    dateTime(): DateTimeContext[];
    dateTime(i: number): DateTimeContext;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
export declare class FloatingTimeRangeContext extends ParserRuleContext {
    PAST_HOUR(): TerminalNode | undefined;
    PAST_DAY(): TerminalNode | undefined;
    PAST_WEEK(): TerminalNode | undefined;
    PAST_MONTH(): TerminalNode | undefined;
    PAST_YEAR(): TerminalNode | undefined;
    constructor(parent: ParserRuleContext, invokingState: number);
    get ruleIndex(): number;
}
