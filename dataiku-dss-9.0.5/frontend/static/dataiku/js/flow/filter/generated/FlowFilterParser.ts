// Generated from /home/dkubuild/releases/9.0.5/initial-build/tmp8hdgqtlz/dip/src/main/platypus/../resources/com/dataiku/dip/antlr-grammar/FlowFilter.g4 by ANTLR 4.6-SNAPSHOT


import { ATN } from 'antlr4ts/atn/ATN';
import { ATNDeserializer } from 'antlr4ts/atn/ATNDeserializer';
import { FailedPredicateException } from 'antlr4ts/FailedPredicateException';
import { NotNull } from 'antlr4ts/Decorators';
import { NoViableAltException } from 'antlr4ts/NoViableAltException';
import { Override } from 'antlr4ts/Decorators';
import { Parser } from 'antlr4ts/Parser';
import { ParserRuleContext } from 'antlr4ts/ParserRuleContext';
import { ParserATNSimulator } from 'antlr4ts/atn/ParserATNSimulator';
import { ParseTreeListener } from 'antlr4ts/tree/ParseTreeListener';
import { ParseTreeVisitor } from 'antlr4ts/tree/ParseTreeVisitor';
import { RecognitionException } from 'antlr4ts/RecognitionException';
import { RuleContext } from 'antlr4ts/RuleContext';
import { RuleVersion } from 'antlr4ts/RuleVersion';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';
import { Token } from 'antlr4ts/Token';
import { TokenStream } from 'antlr4ts/TokenStream';
import { Vocabulary } from 'antlr4ts/Vocabulary';
import { VocabularyImpl } from 'antlr4ts/VocabularyImpl';

import * as Utils from 'antlr4ts/misc/Utils';


export class FlowFilterParser extends Parser {
	public static readonly T__0=1;
	public static readonly LPAREN=2;
	public static readonly RPAREN=3;
	public static readonly AND=4;
	public static readonly OR=5;
	public static readonly NOT=6;
	public static readonly PAST_HOUR=7;
	public static readonly PAST_DAY=8;
	public static readonly PAST_WEEK=9;
	public static readonly PAST_MONTH=10;
	public static readonly PAST_YEAR=11;
	public static readonly DATETIME=12;
	public static readonly DATE=13;
	public static readonly TIME=14;
	public static readonly VALUE=15;
	public static readonly NAME=16;
	public static readonly TAG=17;
	public static readonly TYPE=18;
	public static readonly DATASET_TYPE=19;
	public static readonly RECIPE_TYPE=20;
	public static readonly USER=21;
	public static readonly CREATED=22;
	public static readonly CREATED_ON=23;
	public static readonly CREATED_BETWEEN=24;
	public static readonly CREATED_FROM=25;
	public static readonly CREATED_TO=26;
	public static readonly DOWNSTREAM_FROM=27;
	public static readonly MODIFIED=28;
	public static readonly MODIFIED_ON=29;
	public static readonly MODIFIED_BETWEEN=30;
	public static readonly MODIFIED_FROM=31;
	public static readonly MODIFIED_TO=32;
	public static readonly WS=33;
	public static readonly SPACE=34;
	public static readonly ESCAPED_TEXT=35;
	public static readonly RULE_parse = 0;
	public static readonly RULE_expression = 1;
	public static readonly RULE_operator = 2;
	public static readonly RULE_escapedTextValue = 3;
	public static readonly RULE_stringValue = 4;
	public static readonly RULE_selectorTextValue = 5;
	public static readonly RULE_selectorDateValue = 6;
	public static readonly RULE_selectorModificationDateValue = 7;
	public static readonly RULE_date = 8;
	public static readonly RULE_dateTime = 9;
	public static readonly RULE_dateTimeRange = 10;
	public static readonly RULE_modificationDateTimeRange = 11;
	public static readonly RULE_floatingTimeRange = 12;
	public static readonly ruleNames: string[] = [
		"parse", "expression", "operator", "escapedTextValue", "stringValue", 
		"selectorTextValue", "selectorDateValue", "selectorModificationDateValue", 
		"date", "dateTime", "dateTimeRange", "modificationDateTimeRange", "floatingTimeRange"
	];

	private static readonly _LITERAL_NAMES: (string | undefined)[] = [
		undefined, "'/'", "'('", "')'", "'AND'", "'OR'", "'NOT'", "'PAST_HOUR'", 
		"'PAST_DAY'", "'PAST_WEEK'", "'PAST_MONTH'", "'PAST_YEAR'", undefined, 
		undefined, undefined, undefined, "'name:'", "'tag:'", "'type:'", "'datasetType:'", 
		"'recipeType:'", "'user:'", "'created:'", "'createdOn:'", "'createdBetween:'", 
		"'createdFrom:'", "'createdTo:'", "'downstreamFrom:'", "'modified:'", 
		"'modifiedOn:'", "'modifiedBetween:'", "'modifiedFrom:'", "'modifiedTo:'", 
		undefined, "' '"
	];
	private static readonly _SYMBOLIC_NAMES: (string | undefined)[] = [
		undefined, undefined, "LPAREN", "RPAREN", "AND", "OR", "NOT", "PAST_HOUR", 
		"PAST_DAY", "PAST_WEEK", "PAST_MONTH", "PAST_YEAR", "DATETIME", "DATE", 
		"TIME", "VALUE", "NAME", "TAG", "TYPE", "DATASET_TYPE", "RECIPE_TYPE", 
		"USER", "CREATED", "CREATED_ON", "CREATED_BETWEEN", "CREATED_FROM", "CREATED_TO", 
		"DOWNSTREAM_FROM", "MODIFIED", "MODIFIED_ON", "MODIFIED_BETWEEN", "MODIFIED_FROM", 
		"MODIFIED_TO", "WS", "SPACE", "ESCAPED_TEXT"
	];
	public static readonly VOCABULARY: Vocabulary = new VocabularyImpl(FlowFilterParser._LITERAL_NAMES, FlowFilterParser._SYMBOLIC_NAMES, []);

	@Override
	@NotNull
	public get vocabulary(): Vocabulary {
		return FlowFilterParser.VOCABULARY;
	}

	@Override
	public get grammarFileName(): string { return "FlowFilter.g4"; }

	@Override
	public get ruleNames(): string[] { return FlowFilterParser.ruleNames; }

	@Override
	public get serializedATN(): string { return FlowFilterParser._serializedATN; }

	constructor(input: TokenStream) {
		super(input);
		this._interp = new ParserATNSimulator(FlowFilterParser._ATN, this);
	}
	@RuleVersion(0)
	public parse(): ParseContext {
		let _localctx: ParseContext = new ParseContext(this._ctx, this.state);
		this.enterRule(_localctx, 0, FlowFilterParser.RULE_parse);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 27;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (((((_la - 2)) & ~0x1F) === 0 && ((1 << (_la - 2)) & ((1 << (FlowFilterParser.LPAREN - 2)) | (1 << (FlowFilterParser.NOT - 2)) | (1 << (FlowFilterParser.NAME - 2)) | (1 << (FlowFilterParser.TAG - 2)) | (1 << (FlowFilterParser.TYPE - 2)) | (1 << (FlowFilterParser.DATASET_TYPE - 2)) | (1 << (FlowFilterParser.RECIPE_TYPE - 2)) | (1 << (FlowFilterParser.USER - 2)) | (1 << (FlowFilterParser.CREATED - 2)) | (1 << (FlowFilterParser.CREATED_ON - 2)) | (1 << (FlowFilterParser.CREATED_BETWEEN - 2)) | (1 << (FlowFilterParser.CREATED_FROM - 2)) | (1 << (FlowFilterParser.CREATED_TO - 2)) | (1 << (FlowFilterParser.DOWNSTREAM_FROM - 2)) | (1 << (FlowFilterParser.MODIFIED - 2)) | (1 << (FlowFilterParser.MODIFIED_ON - 2)) | (1 << (FlowFilterParser.MODIFIED_BETWEEN - 2)) | (1 << (FlowFilterParser.MODIFIED_FROM - 2)) | (1 << (FlowFilterParser.MODIFIED_TO - 2)))) !== 0)) {
				{
				this.state = 26;
				this.expression(0);
				}
			}

			this.state = 29;
			this.match(FlowFilterParser.EOF);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}

	public expression(): ExpressionContext;
	public expression(_p: number): ExpressionContext;
	@RuleVersion(0)
	public expression(_p?: number): ExpressionContext {
		if (_p === undefined) {
			_p = 0;
		}

		let _parentctx: ParserRuleContext = this._ctx;
		let _parentState: number = this.state;
		let _localctx: ExpressionContext = new ExpressionContext(this._ctx, _parentState);
		let _prevctx: ExpressionContext = _localctx;
		let _startState: number = 2;
		this.enterRecursionRule(_localctx, 2, FlowFilterParser.RULE_expression, _p);
		let _la: number;
		try {
			let _alt: number;
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 52;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case FlowFilterParser.LPAREN:
				{
				_localctx = new ParenExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;

				this.state = 32;
				this.match(FlowFilterParser.LPAREN);
				this.state = 33;
				this.expression(0);
				this.state = 34;
				this.match(FlowFilterParser.RPAREN);
				}
				break;
			case FlowFilterParser.NOT:
				{
				_localctx = new NotExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 36;
				this.match(FlowFilterParser.NOT);
				this.state = 37;
				(_localctx as NotExpressionContext)._expr = this.expression(9);
				}
				break;
			case FlowFilterParser.NAME:
			case FlowFilterParser.TAG:
			case FlowFilterParser.TYPE:
			case FlowFilterParser.DATASET_TYPE:
			case FlowFilterParser.RECIPE_TYPE:
			case FlowFilterParser.USER:
			case FlowFilterParser.DOWNSTREAM_FROM:
				{
				_localctx = new SelectorWithTextExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 38;
				(_localctx as SelectorWithTextExpressionContext)._key = this._input.LT(1);
				_la = this._input.LA(1);
				if ( !((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << FlowFilterParser.NAME) | (1 << FlowFilterParser.TAG) | (1 << FlowFilterParser.TYPE) | (1 << FlowFilterParser.DATASET_TYPE) | (1 << FlowFilterParser.RECIPE_TYPE) | (1 << FlowFilterParser.USER) | (1 << FlowFilterParser.DOWNSTREAM_FROM))) !== 0)) ) {
					(_localctx as SelectorWithTextExpressionContext)._key = this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 39;
				(_localctx as SelectorWithTextExpressionContext)._value = this.selectorTextValue();
				}
				break;
			case FlowFilterParser.CREATED_ON:
			case FlowFilterParser.CREATED_FROM:
			case FlowFilterParser.CREATED_TO:
				{
				_localctx = new SelectorWithDateExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 40;
				(_localctx as SelectorWithDateExpressionContext)._key = this._input.LT(1);
				_la = this._input.LA(1);
				if ( !((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << FlowFilterParser.CREATED_ON) | (1 << FlowFilterParser.CREATED_FROM) | (1 << FlowFilterParser.CREATED_TO))) !== 0)) ) {
					(_localctx as SelectorWithDateExpressionContext)._key = this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 41;
				(_localctx as SelectorWithDateExpressionContext)._value = this.selectorDateValue();
				}
				break;
			case FlowFilterParser.CREATED_BETWEEN:
				{
				_localctx = new SelectorWithDateRangeExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 42;
				(_localctx as SelectorWithDateRangeExpressionContext)._key = this.match(FlowFilterParser.CREATED_BETWEEN);
				this.state = 43;
				(_localctx as SelectorWithDateRangeExpressionContext)._value = this.dateTimeRange();
				}
				break;
			case FlowFilterParser.CREATED:
				{
				_localctx = new SelectorWithFloatingDateExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 44;
				(_localctx as SelectorWithFloatingDateExpressionContext)._key = this.match(FlowFilterParser.CREATED);
				this.state = 45;
				(_localctx as SelectorWithFloatingDateExpressionContext)._value = this.floatingTimeRange();
				}
				break;
			case FlowFilterParser.MODIFIED_ON:
			case FlowFilterParser.MODIFIED_FROM:
			case FlowFilterParser.MODIFIED_TO:
				{
				_localctx = new SelectorWithModificationDateExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 46;
				(_localctx as SelectorWithModificationDateExpressionContext)._key = this._input.LT(1);
				_la = this._input.LA(1);
				if ( !(((((_la - 29)) & ~0x1F) === 0 && ((1 << (_la - 29)) & ((1 << (FlowFilterParser.MODIFIED_ON - 29)) | (1 << (FlowFilterParser.MODIFIED_FROM - 29)) | (1 << (FlowFilterParser.MODIFIED_TO - 29)))) !== 0)) ) {
					(_localctx as SelectorWithModificationDateExpressionContext)._key = this._errHandler.recoverInline(this);
				} else {
					if (this._input.LA(1) === Token.EOF) {
						this.matchedEOF = true;
					}

					this._errHandler.reportMatch(this);
					this.consume();
				}
				this.state = 47;
				(_localctx as SelectorWithModificationDateExpressionContext)._value = this.selectorModificationDateValue();
				}
				break;
			case FlowFilterParser.MODIFIED_BETWEEN:
				{
				_localctx = new SelectorWithModificationDateRangeExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 48;
				(_localctx as SelectorWithModificationDateRangeExpressionContext)._key = this.match(FlowFilterParser.MODIFIED_BETWEEN);
				this.state = 49;
				(_localctx as SelectorWithModificationDateRangeExpressionContext)._value = this.modificationDateTimeRange();
				}
				break;
			case FlowFilterParser.MODIFIED:
				{
				_localctx = new SelectorWithFloatingModificationDateExpressionContext(_localctx);
				this._ctx = _localctx;
				_prevctx = _localctx;
				this.state = 50;
				(_localctx as SelectorWithFloatingModificationDateExpressionContext)._key = this.match(FlowFilterParser.MODIFIED);
				this.state = 51;
				(_localctx as SelectorWithFloatingModificationDateExpressionContext)._value = this.floatingTimeRange();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
			this._ctx._stop = this._input.tryLT(-1);
			this.state = 60;
			this._errHandler.sync(this);
			_alt = this.interpreter.adaptivePredict(this._input,2,this._ctx);
			while ( _alt!==2 && _alt!==ATN.INVALID_ALT_NUMBER ) {
				if ( _alt===1 ) {
					if ( this._parseListeners!=null ) this.triggerExitRuleEvent();
					_prevctx = _localctx;
					{
					{
					_localctx = new BinaryExpressionContext(new ExpressionContext(_parentctx, _parentState));
					(_localctx as BinaryExpressionContext)._left = _prevctx;
					this.pushNewRecursionContext(_localctx, _startState, FlowFilterParser.RULE_expression);
					this.state = 54;
					if (!(this.precpred(this._ctx, 8))) throw new FailedPredicateException(this, "this.precpred(this._ctx, 8)");
					this.state = 55;
					(_localctx as BinaryExpressionContext)._op = this.operator();
					this.state = 56;
					(_localctx as BinaryExpressionContext)._right = this.expression(9);
					}
					} 
				}
				this.state = 62;
				this._errHandler.sync(this);
				_alt = this.interpreter.adaptivePredict(this._input,2,this._ctx);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.unrollRecursionContexts(_parentctx);
		}
		return _localctx;
	}
	@RuleVersion(0)
	public operator(): OperatorContext {
		let _localctx: OperatorContext = new OperatorContext(this._ctx, this.state);
		this.enterRule(_localctx, 4, FlowFilterParser.RULE_operator);
		let _la: number;
		try {
			this.state = 71;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case FlowFilterParser.AND:
				_localctx = new AndOperatorContext(_localctx);
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 63;
				this.match(FlowFilterParser.AND);
				}
				break;
			case FlowFilterParser.OR:
				_localctx = new OrOperatorContext(_localctx);
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 64;
				this.match(FlowFilterParser.OR);
				}
				break;
			case FlowFilterParser.LPAREN:
			case FlowFilterParser.NOT:
			case FlowFilterParser.NAME:
			case FlowFilterParser.TAG:
			case FlowFilterParser.TYPE:
			case FlowFilterParser.DATASET_TYPE:
			case FlowFilterParser.RECIPE_TYPE:
			case FlowFilterParser.USER:
			case FlowFilterParser.CREATED:
			case FlowFilterParser.CREATED_ON:
			case FlowFilterParser.CREATED_BETWEEN:
			case FlowFilterParser.CREATED_FROM:
			case FlowFilterParser.CREATED_TO:
			case FlowFilterParser.DOWNSTREAM_FROM:
			case FlowFilterParser.MODIFIED:
			case FlowFilterParser.MODIFIED_ON:
			case FlowFilterParser.MODIFIED_BETWEEN:
			case FlowFilterParser.MODIFIED_FROM:
			case FlowFilterParser.MODIFIED_TO:
			case FlowFilterParser.SPACE:
				_localctx = new SpaceOperatorContext(_localctx);
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 68;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la===FlowFilterParser.SPACE) {
					{
					{
					this.state = 65;
					this.match(FlowFilterParser.SPACE);
					}
					}
					this.state = 70;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	@RuleVersion(0)
	public escapedTextValue(): EscapedTextValueContext {
		let _localctx: EscapedTextValueContext = new EscapedTextValueContext(this._ctx, this.state);
		this.enterRule(_localctx, 6, FlowFilterParser.RULE_escapedTextValue);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 73;
			this.match(FlowFilterParser.ESCAPED_TEXT);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	@RuleVersion(0)
	public stringValue(): StringValueContext {
		let _localctx: StringValueContext = new StringValueContext(this._ctx, this.state);
		this.enterRule(_localctx, 8, FlowFilterParser.RULE_stringValue);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 75;
			this.match(FlowFilterParser.VALUE);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	@RuleVersion(0)
	public selectorTextValue(): SelectorTextValueContext {
		let _localctx: SelectorTextValueContext = new SelectorTextValueContext(this._ctx, this.state);
		this.enterRule(_localctx, 10, FlowFilterParser.RULE_selectorTextValue);
		try {
			this.state = 79;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case FlowFilterParser.VALUE:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 77;
				this.stringValue();
				}
				break;
			case FlowFilterParser.ESCAPED_TEXT:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 78;
				this.escapedTextValue();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	@RuleVersion(0)
	public selectorDateValue(): SelectorDateValueContext {
		let _localctx: SelectorDateValueContext = new SelectorDateValueContext(this._ctx, this.state);
		this.enterRule(_localctx, 12, FlowFilterParser.RULE_selectorDateValue);
		try {
			this.state = 83;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case FlowFilterParser.DATE:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 81;
				this.date();
				}
				break;
			case FlowFilterParser.DATETIME:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 82;
				this.dateTime();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	@RuleVersion(0)
	public selectorModificationDateValue(): SelectorModificationDateValueContext {
		let _localctx: SelectorModificationDateValueContext = new SelectorModificationDateValueContext(this._ctx, this.state);
		this.enterRule(_localctx, 14, FlowFilterParser.RULE_selectorModificationDateValue);
		try {
			this.state = 87;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case FlowFilterParser.DATE:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 85;
				this.date();
				}
				break;
			case FlowFilterParser.DATETIME:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 86;
				this.dateTime();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	@RuleVersion(0)
	public date(): DateContext {
		let _localctx: DateContext = new DateContext(this._ctx, this.state);
		this.enterRule(_localctx, 16, FlowFilterParser.RULE_date);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 89;
			this.match(FlowFilterParser.DATE);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	@RuleVersion(0)
	public dateTime(): DateTimeContext {
		let _localctx: DateTimeContext = new DateTimeContext(this._ctx, this.state);
		this.enterRule(_localctx, 18, FlowFilterParser.RULE_dateTime);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 91;
			this.match(FlowFilterParser.DATETIME);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	@RuleVersion(0)
	public dateTimeRange(): DateTimeRangeContext {
		let _localctx: DateTimeRangeContext = new DateTimeRangeContext(this._ctx, this.state);
		this.enterRule(_localctx, 20, FlowFilterParser.RULE_dateTimeRange);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 93;
			_localctx._from = this.dateTime();
			this.state = 94;
			this.match(FlowFilterParser.T__0);
			this.state = 95;
			_localctx._to = this.dateTime();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	@RuleVersion(0)
	public modificationDateTimeRange(): ModificationDateTimeRangeContext {
		let _localctx: ModificationDateTimeRangeContext = new ModificationDateTimeRangeContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, FlowFilterParser.RULE_modificationDateTimeRange);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 97;
			_localctx._from = this.dateTime();
			this.state = 98;
			this.match(FlowFilterParser.T__0);
			this.state = 99;
			_localctx._to = this.dateTime();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	@RuleVersion(0)
	public floatingTimeRange(): FloatingTimeRangeContext {
		let _localctx: FloatingTimeRangeContext = new FloatingTimeRangeContext(this._ctx, this.state);
		this.enterRule(_localctx, 24, FlowFilterParser.RULE_floatingTimeRange);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 101;
			_la = this._input.LA(1);
			if ( !((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << FlowFilterParser.PAST_HOUR) | (1 << FlowFilterParser.PAST_DAY) | (1 << FlowFilterParser.PAST_WEEK) | (1 << FlowFilterParser.PAST_MONTH) | (1 << FlowFilterParser.PAST_YEAR))) !== 0)) ) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}

	public sempred(_localctx: RuleContext, ruleIndex: number, predIndex: number): boolean {
		switch (ruleIndex) {
		case 1:
			return this.expression_sempred(_localctx as ExpressionContext, predIndex);
		}
		return true;
	}
	private expression_sempred(_localctx: ExpressionContext, predIndex: number): boolean {
		switch (predIndex) {
		case 0:
			return this.precpred(this._ctx, 8);
		}
		return true;
	}

	public static readonly _serializedATN: string =
		"\x03\uAF6F\u8320\u479D\uB75C\u4880\u1605\u191C\uAB37\x03%j\x04\x02\t\x02"+
		"\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07\t\x07"+
		"\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04\x0E\t"+
		"\x0E\x03\x02\x05\x02\x1E\n\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03"+
		"\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03"+
		"\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03"+
		"\x05\x037\n\x03\x03\x03\x03\x03\x03\x03\x03\x03\x07\x03=\n\x03\f\x03\x0E"+
		"\x03@\v\x03\x03\x04\x03\x04\x03\x04\x07\x04E\n\x04\f\x04\x0E\x04H\v\x04"+
		"\x05\x04J\n\x04\x03\x05\x03\x05\x03\x06\x03\x06\x03\x07\x03\x07\x05\x07"+
		"R\n\x07\x03\b\x03\b\x05\bV\n\b\x03\t\x03\t\x05\tZ\n\t\x03\n\x03\n\x03"+
		"\v\x03\v\x03\f\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\r\x03\x0E\x03\x0E"+
		"\x03\x0E\x02\x02\x03\x04\x0F\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02"+
		"\x0E\x02\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x02\x06\x04\x02"+
		"\x12\x17\x1D\x1D\x04\x02\x19\x19\x1B\x1C\x04\x02\x1F\x1F!\"\x03\x02\t"+
		"\rl\x02\x1D\x03\x02\x02\x02\x046\x03\x02\x02\x02\x06I\x03\x02\x02\x02"+
		"\bK\x03\x02\x02\x02\nM\x03\x02\x02\x02\fQ\x03\x02\x02\x02\x0EU\x03\x02"+
		"\x02\x02\x10Y\x03\x02\x02\x02\x12[\x03\x02\x02\x02\x14]\x03\x02\x02\x02"+
		"\x16_\x03\x02\x02\x02\x18c\x03\x02\x02\x02\x1Ag\x03\x02\x02\x02\x1C\x1E"+
		"\x05\x04\x03\x02\x1D\x1C\x03\x02\x02\x02\x1D\x1E\x03\x02\x02\x02\x1E\x1F"+
		"\x03\x02\x02\x02\x1F \x07\x02\x02\x03 \x03\x03\x02\x02\x02!\"\b\x03\x01"+
		"\x02\"#\x07\x04\x02\x02#$\x05\x04\x03\x02$%\x07\x05\x02\x02%7\x03\x02"+
		"\x02\x02&\'\x07\b\x02\x02\'7\x05\x04\x03\v()\t\x02\x02\x02)7\x05\f\x07"+
		"\x02*+\t\x03\x02\x02+7\x05\x0E\b\x02,-\x07\x1A\x02\x02-7\x05\x16\f\x02"+
		"./\x07\x18\x02\x02/7\x05\x1A\x0E\x0201\t\x04\x02\x0217\x05\x10\t\x022"+
		"3\x07 \x02\x0237\x05\x18\r\x0245\x07\x1E\x02\x0257\x05\x1A\x0E\x026!\x03"+
		"\x02\x02\x026&\x03\x02\x02\x026(\x03\x02\x02\x026*\x03\x02\x02\x026,\x03"+
		"\x02\x02\x026.\x03\x02\x02\x0260\x03\x02\x02\x0262\x03\x02\x02\x0264\x03"+
		"\x02\x02\x027>\x03\x02\x02\x0289\f\n\x02\x029:\x05\x06\x04\x02:;\x05\x04"+
		"\x03\v;=\x03\x02\x02\x02<8\x03\x02\x02\x02=@\x03\x02\x02\x02><\x03\x02"+
		"\x02\x02>?\x03\x02\x02\x02?\x05\x03\x02\x02\x02@>\x03\x02\x02\x02AJ\x07"+
		"\x06\x02\x02BJ\x07\x07\x02\x02CE\x07$\x02\x02DC\x03\x02\x02\x02EH\x03"+
		"\x02\x02\x02FD\x03\x02\x02\x02FG\x03\x02\x02\x02GJ\x03\x02\x02\x02HF\x03"+
		"\x02\x02\x02IA\x03\x02\x02\x02IB\x03\x02\x02\x02IF\x03\x02\x02\x02J\x07"+
		"\x03\x02\x02\x02KL\x07%\x02\x02L\t\x03\x02\x02\x02MN\x07\x11\x02\x02N"+
		"\v\x03\x02\x02\x02OR\x05\n\x06\x02PR\x05\b\x05\x02QO\x03\x02\x02\x02Q"+
		"P\x03\x02\x02\x02R\r\x03\x02\x02\x02SV\x05\x12\n\x02TV\x05\x14\v\x02U"+
		"S\x03\x02\x02\x02UT\x03\x02\x02\x02V\x0F\x03\x02\x02\x02WZ\x05\x12\n\x02"+
		"XZ\x05\x14\v\x02YW\x03\x02\x02\x02YX\x03\x02\x02\x02Z\x11\x03\x02\x02"+
		"\x02[\\\x07\x0F\x02\x02\\\x13\x03\x02\x02\x02]^\x07\x0E\x02\x02^\x15\x03"+
		"\x02\x02\x02_`\x05\x14\v\x02`a\x07\x03\x02\x02ab\x05\x14\v\x02b\x17\x03"+
		"\x02\x02\x02cd\x05\x14\v\x02de\x07\x03\x02\x02ef\x05\x14\v\x02f\x19\x03"+
		"\x02\x02\x02gh\t\x05\x02\x02h\x1B\x03\x02\x02\x02\n\x1D6>FIQUY";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!FlowFilterParser.__ATN) {
			FlowFilterParser.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(FlowFilterParser._serializedATN));
		}

		return FlowFilterParser.__ATN;
	}

}

export class ParseContext extends ParserRuleContext {
	public EOF(): TerminalNode { return this.getToken(FlowFilterParser.EOF, 0); }
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_parse; }
}


export class ExpressionContext extends ParserRuleContext {
	constructor();
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent?: ParserRuleContext, invokingState?: number) {
		if (parent !== undefined && invokingState !== undefined) {
			super(parent, invokingState);
		} else {
			super();
		}
	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_expression; }
 
	public copyFrom(ctx: ExpressionContext): void {
		super.copyFrom(ctx);
	}
}
export class BinaryExpressionContext extends ExpressionContext {
	public _left: ExpressionContext;
	public _op: OperatorContext;
	public _right: ExpressionContext;
	public expression(): ExpressionContext[];
	public expression(i: number): ExpressionContext;
	public expression(i?: number): ExpressionContext | ExpressionContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ExpressionContext);
		} else {
			return this.getRuleContext(i, ExpressionContext);
		}
	}
	public operator(): OperatorContext {
		return this.getRuleContext(0, OperatorContext);
	}
	constructor(ctx: ExpressionContext) { super(); this.copyFrom(ctx); }
}
export class SelectorWithDateExpressionContext extends ExpressionContext {
	public _key: Token;
	public _value: SelectorDateValueContext;
	public selectorDateValue(): SelectorDateValueContext {
		return this.getRuleContext(0, SelectorDateValueContext);
	}
	public CREATED_FROM(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.CREATED_FROM, 0); }
	public CREATED_TO(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.CREATED_TO, 0); }
	public CREATED_ON(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.CREATED_ON, 0); }
	constructor(ctx: ExpressionContext) { super(); this.copyFrom(ctx); }
}
export class SelectorWithFloatingModificationDateExpressionContext extends ExpressionContext {
	public _key: Token;
	public _value: FloatingTimeRangeContext;
	public MODIFIED(): TerminalNode { return this.getToken(FlowFilterParser.MODIFIED, 0); }
	public floatingTimeRange(): FloatingTimeRangeContext {
		return this.getRuleContext(0, FloatingTimeRangeContext);
	}
	constructor(ctx: ExpressionContext) { super(); this.copyFrom(ctx); }
}
export class SelectorWithFloatingDateExpressionContext extends ExpressionContext {
	public _key: Token;
	public _value: FloatingTimeRangeContext;
	public CREATED(): TerminalNode { return this.getToken(FlowFilterParser.CREATED, 0); }
	public floatingTimeRange(): FloatingTimeRangeContext {
		return this.getRuleContext(0, FloatingTimeRangeContext);
	}
	constructor(ctx: ExpressionContext) { super(); this.copyFrom(ctx); }
}
export class SelectorWithDateRangeExpressionContext extends ExpressionContext {
	public _key: Token;
	public _value: DateTimeRangeContext;
	public CREATED_BETWEEN(): TerminalNode { return this.getToken(FlowFilterParser.CREATED_BETWEEN, 0); }
	public dateTimeRange(): DateTimeRangeContext {
		return this.getRuleContext(0, DateTimeRangeContext);
	}
	constructor(ctx: ExpressionContext) { super(); this.copyFrom(ctx); }
}
export class SelectorWithModificationDateRangeExpressionContext extends ExpressionContext {
	public _key: Token;
	public _value: ModificationDateTimeRangeContext;
	public MODIFIED_BETWEEN(): TerminalNode { return this.getToken(FlowFilterParser.MODIFIED_BETWEEN, 0); }
	public modificationDateTimeRange(): ModificationDateTimeRangeContext {
		return this.getRuleContext(0, ModificationDateTimeRangeContext);
	}
	constructor(ctx: ExpressionContext) { super(); this.copyFrom(ctx); }
}
export class NotExpressionContext extends ExpressionContext {
	public _expr: ExpressionContext;
	public NOT(): TerminalNode { return this.getToken(FlowFilterParser.NOT, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	constructor(ctx: ExpressionContext) { super(); this.copyFrom(ctx); }
}
export class ParenExpressionContext extends ExpressionContext {
	public LPAREN(): TerminalNode { return this.getToken(FlowFilterParser.LPAREN, 0); }
	public expression(): ExpressionContext {
		return this.getRuleContext(0, ExpressionContext);
	}
	public RPAREN(): TerminalNode { return this.getToken(FlowFilterParser.RPAREN, 0); }
	constructor(ctx: ExpressionContext) { super(); this.copyFrom(ctx); }
}
export class SelectorWithTextExpressionContext extends ExpressionContext {
	public _key: Token;
	public _value: SelectorTextValueContext;
	public selectorTextValue(): SelectorTextValueContext {
		return this.getRuleContext(0, SelectorTextValueContext);
	}
	public NAME(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.NAME, 0); }
	public TYPE(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.TYPE, 0); }
	public TAG(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.TAG, 0); }
	public USER(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.USER, 0); }
	public DOWNSTREAM_FROM(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.DOWNSTREAM_FROM, 0); }
	public DATASET_TYPE(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.DATASET_TYPE, 0); }
	public RECIPE_TYPE(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.RECIPE_TYPE, 0); }
	constructor(ctx: ExpressionContext) { super(); this.copyFrom(ctx); }
}
export class SelectorWithModificationDateExpressionContext extends ExpressionContext {
	public _key: Token;
	public _value: SelectorModificationDateValueContext;
	public selectorModificationDateValue(): SelectorModificationDateValueContext {
		return this.getRuleContext(0, SelectorModificationDateValueContext);
	}
	public MODIFIED_FROM(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.MODIFIED_FROM, 0); }
	public MODIFIED_TO(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.MODIFIED_TO, 0); }
	public MODIFIED_ON(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.MODIFIED_ON, 0); }
	constructor(ctx: ExpressionContext) { super(); this.copyFrom(ctx); }
}


export class OperatorContext extends ParserRuleContext {
	constructor();
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent?: ParserRuleContext, invokingState?: number) {
		if (parent !== undefined && invokingState !== undefined) {
			super(parent, invokingState);
		} else {
			super();
		}
	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_operator; }
 
	public copyFrom(ctx: OperatorContext): void {
		super.copyFrom(ctx);
	}
}
export class OrOperatorContext extends OperatorContext {
	public OR(): TerminalNode { return this.getToken(FlowFilterParser.OR, 0); }
	constructor(ctx: OperatorContext) { super(); this.copyFrom(ctx); }
}
export class AndOperatorContext extends OperatorContext {
	public AND(): TerminalNode { return this.getToken(FlowFilterParser.AND, 0); }
	constructor(ctx: OperatorContext) { super(); this.copyFrom(ctx); }
}
export class SpaceOperatorContext extends OperatorContext {
	public SPACE(): TerminalNode[];
	public SPACE(i: number): TerminalNode;
	public SPACE(i?: number): TerminalNode | TerminalNode[] {
		if (i === undefined) {
			return this.getTokens(FlowFilterParser.SPACE);
		} else {
			return this.getToken(FlowFilterParser.SPACE, i);
		}
	}
	constructor(ctx: OperatorContext) { super(); this.copyFrom(ctx); }
}


export class EscapedTextValueContext extends ParserRuleContext {
	public ESCAPED_TEXT(): TerminalNode { return this.getToken(FlowFilterParser.ESCAPED_TEXT, 0); }
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_escapedTextValue; }
}


export class StringValueContext extends ParserRuleContext {
	public VALUE(): TerminalNode { return this.getToken(FlowFilterParser.VALUE, 0); }
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_stringValue; }
}


export class SelectorTextValueContext extends ParserRuleContext {
	public stringValue(): StringValueContext | undefined {
		return this.tryGetRuleContext(0, StringValueContext);
	}
	public escapedTextValue(): EscapedTextValueContext | undefined {
		return this.tryGetRuleContext(0, EscapedTextValueContext);
	}
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_selectorTextValue; }
}


export class SelectorDateValueContext extends ParserRuleContext {
	public date(): DateContext | undefined {
		return this.tryGetRuleContext(0, DateContext);
	}
	public dateTime(): DateTimeContext | undefined {
		return this.tryGetRuleContext(0, DateTimeContext);
	}
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_selectorDateValue; }
}


export class SelectorModificationDateValueContext extends ParserRuleContext {
	public date(): DateContext | undefined {
		return this.tryGetRuleContext(0, DateContext);
	}
	public dateTime(): DateTimeContext | undefined {
		return this.tryGetRuleContext(0, DateTimeContext);
	}
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_selectorModificationDateValue; }
}


export class DateContext extends ParserRuleContext {
	public DATE(): TerminalNode { return this.getToken(FlowFilterParser.DATE, 0); }
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_date; }
}


export class DateTimeContext extends ParserRuleContext {
	public DATETIME(): TerminalNode { return this.getToken(FlowFilterParser.DATETIME, 0); }
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_dateTime; }
}


export class DateTimeRangeContext extends ParserRuleContext {
	public _from: DateTimeContext;
	public _to: DateTimeContext;
	public dateTime(): DateTimeContext[];
	public dateTime(i: number): DateTimeContext;
	public dateTime(i?: number): DateTimeContext | DateTimeContext[] {
		if (i === undefined) {
			return this.getRuleContexts(DateTimeContext);
		} else {
			return this.getRuleContext(i, DateTimeContext);
		}
	}
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_dateTimeRange; }
}


export class ModificationDateTimeRangeContext extends ParserRuleContext {
	public _from: DateTimeContext;
	public _to: DateTimeContext;
	public dateTime(): DateTimeContext[];
	public dateTime(i: number): DateTimeContext;
	public dateTime(i?: number): DateTimeContext | DateTimeContext[] {
		if (i === undefined) {
			return this.getRuleContexts(DateTimeContext);
		} else {
			return this.getRuleContext(i, DateTimeContext);
		}
	}
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_modificationDateTimeRange; }
}


export class FloatingTimeRangeContext extends ParserRuleContext {
	public PAST_HOUR(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.PAST_HOUR, 0); }
	public PAST_DAY(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.PAST_DAY, 0); }
	public PAST_WEEK(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.PAST_WEEK, 0); }
	public PAST_MONTH(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.PAST_MONTH, 0); }
	public PAST_YEAR(): TerminalNode | undefined { return this.tryGetToken(FlowFilterParser.PAST_YEAR, 0); }
	constructor(parent: ParserRuleContext, invokingState: number);
	constructor(parent: ParserRuleContext, invokingState: number) {
		super(parent, invokingState);

	}
	@Override public get ruleIndex(): number { return FlowFilterParser.RULE_floatingTimeRange; }
}


