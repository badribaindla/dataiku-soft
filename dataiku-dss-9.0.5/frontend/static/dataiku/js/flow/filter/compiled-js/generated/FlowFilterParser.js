"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FloatingTimeRangeContext = exports.ModificationDateTimeRangeContext = exports.DateTimeRangeContext = exports.DateTimeContext = exports.DateContext = exports.SelectorModificationDateValueContext = exports.SelectorDateValueContext = exports.SelectorTextValueContext = exports.StringValueContext = exports.EscapedTextValueContext = exports.SpaceOperatorContext = exports.AndOperatorContext = exports.OrOperatorContext = exports.OperatorContext = exports.SelectorWithModificationDateExpressionContext = exports.SelectorWithTextExpressionContext = exports.ParenExpressionContext = exports.NotExpressionContext = exports.SelectorWithModificationDateRangeExpressionContext = exports.SelectorWithDateRangeExpressionContext = exports.SelectorWithFloatingDateExpressionContext = exports.SelectorWithFloatingModificationDateExpressionContext = exports.SelectorWithDateExpressionContext = exports.BinaryExpressionContext = exports.ExpressionContext = exports.ParseContext = exports.FlowFilterParser = void 0;
const ATN_1 = require("antlr4ts/atn/ATN");
const ATNDeserializer_1 = require("antlr4ts/atn/ATNDeserializer");
const FailedPredicateException_1 = require("antlr4ts/FailedPredicateException");
const Decorators_1 = require("antlr4ts/Decorators");
const NoViableAltException_1 = require("antlr4ts/NoViableAltException");
const Decorators_2 = require("antlr4ts/Decorators");
const Parser_1 = require("antlr4ts/Parser");
const ParserRuleContext_1 = require("antlr4ts/ParserRuleContext");
const ParserATNSimulator_1 = require("antlr4ts/atn/ParserATNSimulator");
const RecognitionException_1 = require("antlr4ts/RecognitionException");
const RuleVersion_1 = require("antlr4ts/RuleVersion");
const Token_1 = require("antlr4ts/Token");
const VocabularyImpl_1 = require("antlr4ts/VocabularyImpl");
const Utils = require("antlr4ts/misc/Utils");
class FlowFilterParser extends Parser_1.Parser {
    constructor(input) {
        super(input);
        this._interp = new ParserATNSimulator_1.ParserATNSimulator(FlowFilterParser._ATN, this);
    }
    get vocabulary() {
        return FlowFilterParser.VOCABULARY;
    }
    get grammarFileName() { return "FlowFilter.g4"; }
    get ruleNames() { return FlowFilterParser.ruleNames; }
    get serializedATN() { return FlowFilterParser._serializedATN; }
    parse() {
        let _localctx = new ParseContext(this._ctx, this.state);
        this.enterRule(_localctx, 0, FlowFilterParser.RULE_parse);
        let _la;
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
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    expression(_p) {
        if (_p === undefined) {
            _p = 0;
        }
        let _parentctx = this._ctx;
        let _parentState = this.state;
        let _localctx = new ExpressionContext(this._ctx, _parentState);
        let _prevctx = _localctx;
        let _startState = 2;
        this.enterRecursionRule(_localctx, 2, FlowFilterParser.RULE_expression, _p);
        let _la;
        try {
            let _alt;
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
                            _localctx._expr = this.expression(9);
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
                            _localctx._key = this._input.LT(1);
                            _la = this._input.LA(1);
                            if (!((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << FlowFilterParser.NAME) | (1 << FlowFilterParser.TAG) | (1 << FlowFilterParser.TYPE) | (1 << FlowFilterParser.DATASET_TYPE) | (1 << FlowFilterParser.RECIPE_TYPE) | (1 << FlowFilterParser.USER) | (1 << FlowFilterParser.DOWNSTREAM_FROM))) !== 0))) {
                                _localctx._key = this._errHandler.recoverInline(this);
                            }
                            else {
                                if (this._input.LA(1) === Token_1.Token.EOF) {
                                    this.matchedEOF = true;
                                }
                                this._errHandler.reportMatch(this);
                                this.consume();
                            }
                            this.state = 39;
                            _localctx._value = this.selectorTextValue();
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
                            _localctx._key = this._input.LT(1);
                            _la = this._input.LA(1);
                            if (!((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << FlowFilterParser.CREATED_ON) | (1 << FlowFilterParser.CREATED_FROM) | (1 << FlowFilterParser.CREATED_TO))) !== 0))) {
                                _localctx._key = this._errHandler.recoverInline(this);
                            }
                            else {
                                if (this._input.LA(1) === Token_1.Token.EOF) {
                                    this.matchedEOF = true;
                                }
                                this._errHandler.reportMatch(this);
                                this.consume();
                            }
                            this.state = 41;
                            _localctx._value = this.selectorDateValue();
                        }
                        break;
                    case FlowFilterParser.CREATED_BETWEEN:
                        {
                            _localctx = new SelectorWithDateRangeExpressionContext(_localctx);
                            this._ctx = _localctx;
                            _prevctx = _localctx;
                            this.state = 42;
                            _localctx._key = this.match(FlowFilterParser.CREATED_BETWEEN);
                            this.state = 43;
                            _localctx._value = this.dateTimeRange();
                        }
                        break;
                    case FlowFilterParser.CREATED:
                        {
                            _localctx = new SelectorWithFloatingDateExpressionContext(_localctx);
                            this._ctx = _localctx;
                            _prevctx = _localctx;
                            this.state = 44;
                            _localctx._key = this.match(FlowFilterParser.CREATED);
                            this.state = 45;
                            _localctx._value = this.floatingTimeRange();
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
                            _localctx._key = this._input.LT(1);
                            _la = this._input.LA(1);
                            if (!(((((_la - 29)) & ~0x1F) === 0 && ((1 << (_la - 29)) & ((1 << (FlowFilterParser.MODIFIED_ON - 29)) | (1 << (FlowFilterParser.MODIFIED_FROM - 29)) | (1 << (FlowFilterParser.MODIFIED_TO - 29)))) !== 0))) {
                                _localctx._key = this._errHandler.recoverInline(this);
                            }
                            else {
                                if (this._input.LA(1) === Token_1.Token.EOF) {
                                    this.matchedEOF = true;
                                }
                                this._errHandler.reportMatch(this);
                                this.consume();
                            }
                            this.state = 47;
                            _localctx._value = this.selectorModificationDateValue();
                        }
                        break;
                    case FlowFilterParser.MODIFIED_BETWEEN:
                        {
                            _localctx = new SelectorWithModificationDateRangeExpressionContext(_localctx);
                            this._ctx = _localctx;
                            _prevctx = _localctx;
                            this.state = 48;
                            _localctx._key = this.match(FlowFilterParser.MODIFIED_BETWEEN);
                            this.state = 49;
                            _localctx._value = this.modificationDateTimeRange();
                        }
                        break;
                    case FlowFilterParser.MODIFIED:
                        {
                            _localctx = new SelectorWithFloatingModificationDateExpressionContext(_localctx);
                            this._ctx = _localctx;
                            _prevctx = _localctx;
                            this.state = 50;
                            _localctx._key = this.match(FlowFilterParser.MODIFIED);
                            this.state = 51;
                            _localctx._value = this.floatingTimeRange();
                        }
                        break;
                    default:
                        throw new NoViableAltException_1.NoViableAltException(this);
                }
                this._ctx._stop = this._input.tryLT(-1);
                this.state = 60;
                this._errHandler.sync(this);
                _alt = this.interpreter.adaptivePredict(this._input, 2, this._ctx);
                while (_alt !== 2 && _alt !== ATN_1.ATN.INVALID_ALT_NUMBER) {
                    if (_alt === 1) {
                        if (this._parseListeners != null)
                            this.triggerExitRuleEvent();
                        _prevctx = _localctx;
                        {
                            {
                                _localctx = new BinaryExpressionContext(new ExpressionContext(_parentctx, _parentState));
                                _localctx._left = _prevctx;
                                this.pushNewRecursionContext(_localctx, _startState, FlowFilterParser.RULE_expression);
                                this.state = 54;
                                if (!(this.precpred(this._ctx, 8)))
                                    throw new FailedPredicateException_1.FailedPredicateException(this, "this.precpred(this._ctx, 8)");
                                this.state = 55;
                                _localctx._op = this.operator();
                                this.state = 56;
                                _localctx._right = this.expression(9);
                            }
                        }
                    }
                    this.state = 62;
                    this._errHandler.sync(this);
                    _alt = this.interpreter.adaptivePredict(this._input, 2, this._ctx);
                }
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(_parentctx);
        }
        return _localctx;
    }
    operator() {
        let _localctx = new OperatorContext(this._ctx, this.state);
        this.enterRule(_localctx, 4, FlowFilterParser.RULE_operator);
        let _la;
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
                        while (_la === FlowFilterParser.SPACE) {
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
                    throw new NoViableAltException_1.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    escapedTextValue() {
        let _localctx = new EscapedTextValueContext(this._ctx, this.state);
        this.enterRule(_localctx, 6, FlowFilterParser.RULE_escapedTextValue);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 73;
                this.match(FlowFilterParser.ESCAPED_TEXT);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    stringValue() {
        let _localctx = new StringValueContext(this._ctx, this.state);
        this.enterRule(_localctx, 8, FlowFilterParser.RULE_stringValue);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 75;
                this.match(FlowFilterParser.VALUE);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    selectorTextValue() {
        let _localctx = new SelectorTextValueContext(this._ctx, this.state);
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
                    throw new NoViableAltException_1.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    selectorDateValue() {
        let _localctx = new SelectorDateValueContext(this._ctx, this.state);
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
                    throw new NoViableAltException_1.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    selectorModificationDateValue() {
        let _localctx = new SelectorModificationDateValueContext(this._ctx, this.state);
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
                    throw new NoViableAltException_1.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    date() {
        let _localctx = new DateContext(this._ctx, this.state);
        this.enterRule(_localctx, 16, FlowFilterParser.RULE_date);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 89;
                this.match(FlowFilterParser.DATE);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    dateTime() {
        let _localctx = new DateTimeContext(this._ctx, this.state);
        this.enterRule(_localctx, 18, FlowFilterParser.RULE_dateTime);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 91;
                this.match(FlowFilterParser.DATETIME);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    dateTimeRange() {
        let _localctx = new DateTimeRangeContext(this._ctx, this.state);
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
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    modificationDateTimeRange() {
        let _localctx = new ModificationDateTimeRangeContext(this._ctx, this.state);
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
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    floatingTimeRange() {
        let _localctx = new FloatingTimeRangeContext(this._ctx, this.state);
        this.enterRule(_localctx, 24, FlowFilterParser.RULE_floatingTimeRange);
        let _la;
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 101;
                _la = this._input.LA(1);
                if (!((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << FlowFilterParser.PAST_HOUR) | (1 << FlowFilterParser.PAST_DAY) | (1 << FlowFilterParser.PAST_WEEK) | (1 << FlowFilterParser.PAST_MONTH) | (1 << FlowFilterParser.PAST_YEAR))) !== 0))) {
                    this._errHandler.recoverInline(this);
                }
                else {
                    if (this._input.LA(1) === Token_1.Token.EOF) {
                        this.matchedEOF = true;
                    }
                    this._errHandler.reportMatch(this);
                    this.consume();
                }
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    sempred(_localctx, ruleIndex, predIndex) {
        switch (ruleIndex) {
            case 1:
                return this.expression_sempred(_localctx, predIndex);
        }
        return true;
    }
    expression_sempred(_localctx, predIndex) {
        switch (predIndex) {
            case 0:
                return this.precpred(this._ctx, 8);
        }
        return true;
    }
    static get _ATN() {
        if (!FlowFilterParser.__ATN) {
            FlowFilterParser.__ATN = new ATNDeserializer_1.ATNDeserializer().deserialize(Utils.toCharArray(FlowFilterParser._serializedATN));
        }
        return FlowFilterParser.__ATN;
    }
}
FlowFilterParser.T__0 = 1;
FlowFilterParser.LPAREN = 2;
FlowFilterParser.RPAREN = 3;
FlowFilterParser.AND = 4;
FlowFilterParser.OR = 5;
FlowFilterParser.NOT = 6;
FlowFilterParser.PAST_HOUR = 7;
FlowFilterParser.PAST_DAY = 8;
FlowFilterParser.PAST_WEEK = 9;
FlowFilterParser.PAST_MONTH = 10;
FlowFilterParser.PAST_YEAR = 11;
FlowFilterParser.DATETIME = 12;
FlowFilterParser.DATE = 13;
FlowFilterParser.TIME = 14;
FlowFilterParser.VALUE = 15;
FlowFilterParser.NAME = 16;
FlowFilterParser.TAG = 17;
FlowFilterParser.TYPE = 18;
FlowFilterParser.DATASET_TYPE = 19;
FlowFilterParser.RECIPE_TYPE = 20;
FlowFilterParser.USER = 21;
FlowFilterParser.CREATED = 22;
FlowFilterParser.CREATED_ON = 23;
FlowFilterParser.CREATED_BETWEEN = 24;
FlowFilterParser.CREATED_FROM = 25;
FlowFilterParser.CREATED_TO = 26;
FlowFilterParser.DOWNSTREAM_FROM = 27;
FlowFilterParser.MODIFIED = 28;
FlowFilterParser.MODIFIED_ON = 29;
FlowFilterParser.MODIFIED_BETWEEN = 30;
FlowFilterParser.MODIFIED_FROM = 31;
FlowFilterParser.MODIFIED_TO = 32;
FlowFilterParser.WS = 33;
FlowFilterParser.SPACE = 34;
FlowFilterParser.ESCAPED_TEXT = 35;
FlowFilterParser.RULE_parse = 0;
FlowFilterParser.RULE_expression = 1;
FlowFilterParser.RULE_operator = 2;
FlowFilterParser.RULE_escapedTextValue = 3;
FlowFilterParser.RULE_stringValue = 4;
FlowFilterParser.RULE_selectorTextValue = 5;
FlowFilterParser.RULE_selectorDateValue = 6;
FlowFilterParser.RULE_selectorModificationDateValue = 7;
FlowFilterParser.RULE_date = 8;
FlowFilterParser.RULE_dateTime = 9;
FlowFilterParser.RULE_dateTimeRange = 10;
FlowFilterParser.RULE_modificationDateTimeRange = 11;
FlowFilterParser.RULE_floatingTimeRange = 12;
FlowFilterParser.ruleNames = [
    "parse", "expression", "operator", "escapedTextValue", "stringValue",
    "selectorTextValue", "selectorDateValue", "selectorModificationDateValue",
    "date", "dateTime", "dateTimeRange", "modificationDateTimeRange", "floatingTimeRange"
];
FlowFilterParser._LITERAL_NAMES = [
    undefined, "'/'", "'('", "')'", "'AND'", "'OR'", "'NOT'", "'PAST_HOUR'",
    "'PAST_DAY'", "'PAST_WEEK'", "'PAST_MONTH'", "'PAST_YEAR'", undefined,
    undefined, undefined, undefined, "'name:'", "'tag:'", "'type:'", "'datasetType:'",
    "'recipeType:'", "'user:'", "'created:'", "'createdOn:'", "'createdBetween:'",
    "'createdFrom:'", "'createdTo:'", "'downstreamFrom:'", "'modified:'",
    "'modifiedOn:'", "'modifiedBetween:'", "'modifiedFrom:'", "'modifiedTo:'",
    undefined, "' '"
];
FlowFilterParser._SYMBOLIC_NAMES = [
    undefined, undefined, "LPAREN", "RPAREN", "AND", "OR", "NOT", "PAST_HOUR",
    "PAST_DAY", "PAST_WEEK", "PAST_MONTH", "PAST_YEAR", "DATETIME", "DATE",
    "TIME", "VALUE", "NAME", "TAG", "TYPE", "DATASET_TYPE", "RECIPE_TYPE",
    "USER", "CREATED", "CREATED_ON", "CREATED_BETWEEN", "CREATED_FROM", "CREATED_TO",
    "DOWNSTREAM_FROM", "MODIFIED", "MODIFIED_ON", "MODIFIED_BETWEEN", "MODIFIED_FROM",
    "MODIFIED_TO", "WS", "SPACE", "ESCAPED_TEXT"
];
FlowFilterParser.VOCABULARY = new VocabularyImpl_1.VocabularyImpl(FlowFilterParser._LITERAL_NAMES, FlowFilterParser._SYMBOLIC_NAMES, []);
FlowFilterParser._serializedATN = "\x03\uAF6F\u8320\u479D\uB75C\u4880\u1605\u191C\uAB37\x03%j\x04\x02\t\x02" +
    "\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07\t\x07" +
    "\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04\x0E\t" +
    "\x0E\x03\x02\x05\x02\x1E\n\x02\x03\x02\x03\x02\x03\x03\x03\x03\x03\x03" +
    "\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03" +
    "\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03\x03" +
    "\x05\x037\n\x03\x03\x03\x03\x03\x03\x03\x03\x03\x07\x03=\n\x03\f\x03\x0E" +
    "\x03@\v\x03\x03\x04\x03\x04\x03\x04\x07\x04E\n\x04\f\x04\x0E\x04H\v\x04" +
    "\x05\x04J\n\x04\x03\x05\x03\x05\x03\x06\x03\x06\x03\x07\x03\x07\x05\x07" +
    "R\n\x07\x03\b\x03\b\x05\bV\n\b\x03\t\x03\t\x05\tZ\n\t\x03\n\x03\n\x03" +
    "\v\x03\v\x03\f\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\r\x03\x0E\x03\x0E" +
    "\x03\x0E\x02\x02\x03\x04\x0F\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02" +
    "\x0E\x02\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x02\x06\x04\x02" +
    "\x12\x17\x1D\x1D\x04\x02\x19\x19\x1B\x1C\x04\x02\x1F\x1F!\"\x03\x02\t" +
    "\rl\x02\x1D\x03\x02\x02\x02\x046\x03\x02\x02\x02\x06I\x03\x02\x02\x02" +
    "\bK\x03\x02\x02\x02\nM\x03\x02\x02\x02\fQ\x03\x02\x02\x02\x0EU\x03\x02" +
    "\x02\x02\x10Y\x03\x02\x02\x02\x12[\x03\x02\x02\x02\x14]\x03\x02\x02\x02" +
    "\x16_\x03\x02\x02\x02\x18c\x03\x02\x02\x02\x1Ag\x03\x02\x02\x02\x1C\x1E" +
    "\x05\x04\x03\x02\x1D\x1C\x03\x02\x02\x02\x1D\x1E\x03\x02\x02\x02\x1E\x1F" +
    "\x03\x02\x02\x02\x1F \x07\x02\x02\x03 \x03\x03\x02\x02\x02!\"\b\x03\x01" +
    "\x02\"#\x07\x04\x02\x02#$\x05\x04\x03\x02$%\x07\x05\x02\x02%7\x03\x02" +
    "\x02\x02&\'\x07\b\x02\x02\'7\x05\x04\x03\v()\t\x02\x02\x02)7\x05\f\x07" +
    "\x02*+\t\x03\x02\x02+7\x05\x0E\b\x02,-\x07\x1A\x02\x02-7\x05\x16\f\x02" +
    "./\x07\x18\x02\x02/7\x05\x1A\x0E\x0201\t\x04\x02\x0217\x05\x10\t\x022" +
    "3\x07 \x02\x0237\x05\x18\r\x0245\x07\x1E\x02\x0257\x05\x1A\x0E\x026!\x03" +
    "\x02\x02\x026&\x03\x02\x02\x026(\x03\x02\x02\x026*\x03\x02\x02\x026,\x03" +
    "\x02\x02\x026.\x03\x02\x02\x0260\x03\x02\x02\x0262\x03\x02\x02\x0264\x03" +
    "\x02\x02\x027>\x03\x02\x02\x0289\f\n\x02\x029:\x05\x06\x04\x02:;\x05\x04" +
    "\x03\v;=\x03\x02\x02\x02<8\x03\x02\x02\x02=@\x03\x02\x02\x02><\x03\x02" +
    "\x02\x02>?\x03\x02\x02\x02?\x05\x03\x02\x02\x02@>\x03\x02\x02\x02AJ\x07" +
    "\x06\x02\x02BJ\x07\x07\x02\x02CE\x07$\x02\x02DC\x03\x02\x02\x02EH\x03" +
    "\x02\x02\x02FD\x03\x02\x02\x02FG\x03\x02\x02\x02GJ\x03\x02\x02\x02HF\x03" +
    "\x02\x02\x02IA\x03\x02\x02\x02IB\x03\x02\x02\x02IF\x03\x02\x02\x02J\x07" +
    "\x03\x02\x02\x02KL\x07%\x02\x02L\t\x03\x02\x02\x02MN\x07\x11\x02\x02N" +
    "\v\x03\x02\x02\x02OR\x05\n\x06\x02PR\x05\b\x05\x02QO\x03\x02\x02\x02Q" +
    "P\x03\x02\x02\x02R\r\x03\x02\x02\x02SV\x05\x12\n\x02TV\x05\x14\v\x02U" +
    "S\x03\x02\x02\x02UT\x03\x02\x02\x02V\x0F\x03\x02\x02\x02WZ\x05\x12\n\x02" +
    "XZ\x05\x14\v\x02YW\x03\x02\x02\x02YX\x03\x02\x02\x02Z\x11\x03\x02\x02" +
    "\x02[\\\x07\x0F\x02\x02\\\x13\x03\x02\x02\x02]^\x07\x0E\x02\x02^\x15\x03" +
    "\x02\x02\x02_`\x05\x14\v\x02`a\x07\x03\x02\x02ab\x05\x14\v\x02b\x17\x03" +
    "\x02\x02\x02cd\x05\x14\v\x02de\x07\x03\x02\x02ef\x05\x14\v\x02f\x19\x03" +
    "\x02\x02\x02gh\t\x05\x02\x02h\x1B\x03\x02\x02\x02\n\x1D6>FIQUY";
__decorate([
    Decorators_2.Override,
    Decorators_1.NotNull
], FlowFilterParser.prototype, "vocabulary", null);
__decorate([
    Decorators_2.Override
], FlowFilterParser.prototype, "grammarFileName", null);
__decorate([
    Decorators_2.Override
], FlowFilterParser.prototype, "ruleNames", null);
__decorate([
    Decorators_2.Override
], FlowFilterParser.prototype, "serializedATN", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "parse", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "expression", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "operator", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "escapedTextValue", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "stringValue", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "selectorTextValue", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "selectorDateValue", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "selectorModificationDateValue", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "date", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "dateTime", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "dateTimeRange", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "modificationDateTimeRange", null);
__decorate([
    RuleVersion_1.RuleVersion(0)
], FlowFilterParser.prototype, "floatingTimeRange", null);
exports.FlowFilterParser = FlowFilterParser;
class ParseContext extends ParserRuleContext_1.ParserRuleContext {
    EOF() { return this.getToken(FlowFilterParser.EOF, 0); }
    expression() {
        return this.tryGetRuleContext(0, ExpressionContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return FlowFilterParser.RULE_parse; }
}
__decorate([
    Decorators_2.Override
], ParseContext.prototype, "ruleIndex", null);
exports.ParseContext = ParseContext;
class ExpressionContext extends ParserRuleContext_1.ParserRuleContext {
    constructor(parent, invokingState) {
        if (parent !== undefined && invokingState !== undefined) {
            super(parent, invokingState);
        }
        else {
            super();
        }
    }
    get ruleIndex() { return FlowFilterParser.RULE_expression; }
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }
}
__decorate([
    Decorators_2.Override
], ExpressionContext.prototype, "ruleIndex", null);
exports.ExpressionContext = ExpressionContext;
class BinaryExpressionContext extends ExpressionContext {
    constructor(ctx) { super(); this.copyFrom(ctx); }
    expression(i) {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }
        else {
            return this.getRuleContext(i, ExpressionContext);
        }
    }
    operator() {
        return this.getRuleContext(0, OperatorContext);
    }
}
exports.BinaryExpressionContext = BinaryExpressionContext;
class SelectorWithDateExpressionContext extends ExpressionContext {
    constructor(ctx) { super(); this.copyFrom(ctx); }
    selectorDateValue() {
        return this.getRuleContext(0, SelectorDateValueContext);
    }
    CREATED_FROM() { return this.tryGetToken(FlowFilterParser.CREATED_FROM, 0); }
    CREATED_TO() { return this.tryGetToken(FlowFilterParser.CREATED_TO, 0); }
    CREATED_ON() { return this.tryGetToken(FlowFilterParser.CREATED_ON, 0); }
}
exports.SelectorWithDateExpressionContext = SelectorWithDateExpressionContext;
class SelectorWithFloatingModificationDateExpressionContext extends ExpressionContext {
    constructor(ctx) { super(); this.copyFrom(ctx); }
    MODIFIED() { return this.getToken(FlowFilterParser.MODIFIED, 0); }
    floatingTimeRange() {
        return this.getRuleContext(0, FloatingTimeRangeContext);
    }
}
exports.SelectorWithFloatingModificationDateExpressionContext = SelectorWithFloatingModificationDateExpressionContext;
class SelectorWithFloatingDateExpressionContext extends ExpressionContext {
    constructor(ctx) { super(); this.copyFrom(ctx); }
    CREATED() { return this.getToken(FlowFilterParser.CREATED, 0); }
    floatingTimeRange() {
        return this.getRuleContext(0, FloatingTimeRangeContext);
    }
}
exports.SelectorWithFloatingDateExpressionContext = SelectorWithFloatingDateExpressionContext;
class SelectorWithDateRangeExpressionContext extends ExpressionContext {
    constructor(ctx) { super(); this.copyFrom(ctx); }
    CREATED_BETWEEN() { return this.getToken(FlowFilterParser.CREATED_BETWEEN, 0); }
    dateTimeRange() {
        return this.getRuleContext(0, DateTimeRangeContext);
    }
}
exports.SelectorWithDateRangeExpressionContext = SelectorWithDateRangeExpressionContext;
class SelectorWithModificationDateRangeExpressionContext extends ExpressionContext {
    constructor(ctx) { super(); this.copyFrom(ctx); }
    MODIFIED_BETWEEN() { return this.getToken(FlowFilterParser.MODIFIED_BETWEEN, 0); }
    modificationDateTimeRange() {
        return this.getRuleContext(0, ModificationDateTimeRangeContext);
    }
}
exports.SelectorWithModificationDateRangeExpressionContext = SelectorWithModificationDateRangeExpressionContext;
class NotExpressionContext extends ExpressionContext {
    constructor(ctx) { super(); this.copyFrom(ctx); }
    NOT() { return this.getToken(FlowFilterParser.NOT, 0); }
    expression() {
        return this.getRuleContext(0, ExpressionContext);
    }
}
exports.NotExpressionContext = NotExpressionContext;
class ParenExpressionContext extends ExpressionContext {
    LPAREN() { return this.getToken(FlowFilterParser.LPAREN, 0); }
    expression() {
        return this.getRuleContext(0, ExpressionContext);
    }
    RPAREN() { return this.getToken(FlowFilterParser.RPAREN, 0); }
    constructor(ctx) { super(); this.copyFrom(ctx); }
}
exports.ParenExpressionContext = ParenExpressionContext;
class SelectorWithTextExpressionContext extends ExpressionContext {
    constructor(ctx) { super(); this.copyFrom(ctx); }
    selectorTextValue() {
        return this.getRuleContext(0, SelectorTextValueContext);
    }
    NAME() { return this.tryGetToken(FlowFilterParser.NAME, 0); }
    TYPE() { return this.tryGetToken(FlowFilterParser.TYPE, 0); }
    TAG() { return this.tryGetToken(FlowFilterParser.TAG, 0); }
    USER() { return this.tryGetToken(FlowFilterParser.USER, 0); }
    DOWNSTREAM_FROM() { return this.tryGetToken(FlowFilterParser.DOWNSTREAM_FROM, 0); }
    DATASET_TYPE() { return this.tryGetToken(FlowFilterParser.DATASET_TYPE, 0); }
    RECIPE_TYPE() { return this.tryGetToken(FlowFilterParser.RECIPE_TYPE, 0); }
}
exports.SelectorWithTextExpressionContext = SelectorWithTextExpressionContext;
class SelectorWithModificationDateExpressionContext extends ExpressionContext {
    constructor(ctx) { super(); this.copyFrom(ctx); }
    selectorModificationDateValue() {
        return this.getRuleContext(0, SelectorModificationDateValueContext);
    }
    MODIFIED_FROM() { return this.tryGetToken(FlowFilterParser.MODIFIED_FROM, 0); }
    MODIFIED_TO() { return this.tryGetToken(FlowFilterParser.MODIFIED_TO, 0); }
    MODIFIED_ON() { return this.tryGetToken(FlowFilterParser.MODIFIED_ON, 0); }
}
exports.SelectorWithModificationDateExpressionContext = SelectorWithModificationDateExpressionContext;
class OperatorContext extends ParserRuleContext_1.ParserRuleContext {
    constructor(parent, invokingState) {
        if (parent !== undefined && invokingState !== undefined) {
            super(parent, invokingState);
        }
        else {
            super();
        }
    }
    get ruleIndex() { return FlowFilterParser.RULE_operator; }
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }
}
__decorate([
    Decorators_2.Override
], OperatorContext.prototype, "ruleIndex", null);
exports.OperatorContext = OperatorContext;
class OrOperatorContext extends OperatorContext {
    OR() { return this.getToken(FlowFilterParser.OR, 0); }
    constructor(ctx) { super(); this.copyFrom(ctx); }
}
exports.OrOperatorContext = OrOperatorContext;
class AndOperatorContext extends OperatorContext {
    AND() { return this.getToken(FlowFilterParser.AND, 0); }
    constructor(ctx) { super(); this.copyFrom(ctx); }
}
exports.AndOperatorContext = AndOperatorContext;
class SpaceOperatorContext extends OperatorContext {
    SPACE(i) {
        if (i === undefined) {
            return this.getTokens(FlowFilterParser.SPACE);
        }
        else {
            return this.getToken(FlowFilterParser.SPACE, i);
        }
    }
    constructor(ctx) { super(); this.copyFrom(ctx); }
}
exports.SpaceOperatorContext = SpaceOperatorContext;
class EscapedTextValueContext extends ParserRuleContext_1.ParserRuleContext {
    ESCAPED_TEXT() { return this.getToken(FlowFilterParser.ESCAPED_TEXT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return FlowFilterParser.RULE_escapedTextValue; }
}
__decorate([
    Decorators_2.Override
], EscapedTextValueContext.prototype, "ruleIndex", null);
exports.EscapedTextValueContext = EscapedTextValueContext;
class StringValueContext extends ParserRuleContext_1.ParserRuleContext {
    VALUE() { return this.getToken(FlowFilterParser.VALUE, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return FlowFilterParser.RULE_stringValue; }
}
__decorate([
    Decorators_2.Override
], StringValueContext.prototype, "ruleIndex", null);
exports.StringValueContext = StringValueContext;
class SelectorTextValueContext extends ParserRuleContext_1.ParserRuleContext {
    stringValue() {
        return this.tryGetRuleContext(0, StringValueContext);
    }
    escapedTextValue() {
        return this.tryGetRuleContext(0, EscapedTextValueContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return FlowFilterParser.RULE_selectorTextValue; }
}
__decorate([
    Decorators_2.Override
], SelectorTextValueContext.prototype, "ruleIndex", null);
exports.SelectorTextValueContext = SelectorTextValueContext;
class SelectorDateValueContext extends ParserRuleContext_1.ParserRuleContext {
    date() {
        return this.tryGetRuleContext(0, DateContext);
    }
    dateTime() {
        return this.tryGetRuleContext(0, DateTimeContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return FlowFilterParser.RULE_selectorDateValue; }
}
__decorate([
    Decorators_2.Override
], SelectorDateValueContext.prototype, "ruleIndex", null);
exports.SelectorDateValueContext = SelectorDateValueContext;
class SelectorModificationDateValueContext extends ParserRuleContext_1.ParserRuleContext {
    date() {
        return this.tryGetRuleContext(0, DateContext);
    }
    dateTime() {
        return this.tryGetRuleContext(0, DateTimeContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return FlowFilterParser.RULE_selectorModificationDateValue; }
}
__decorate([
    Decorators_2.Override
], SelectorModificationDateValueContext.prototype, "ruleIndex", null);
exports.SelectorModificationDateValueContext = SelectorModificationDateValueContext;
class DateContext extends ParserRuleContext_1.ParserRuleContext {
    DATE() { return this.getToken(FlowFilterParser.DATE, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return FlowFilterParser.RULE_date; }
}
__decorate([
    Decorators_2.Override
], DateContext.prototype, "ruleIndex", null);
exports.DateContext = DateContext;
class DateTimeContext extends ParserRuleContext_1.ParserRuleContext {
    DATETIME() { return this.getToken(FlowFilterParser.DATETIME, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return FlowFilterParser.RULE_dateTime; }
}
__decorate([
    Decorators_2.Override
], DateTimeContext.prototype, "ruleIndex", null);
exports.DateTimeContext = DateTimeContext;
class DateTimeRangeContext extends ParserRuleContext_1.ParserRuleContext {
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    dateTime(i) {
        if (i === undefined) {
            return this.getRuleContexts(DateTimeContext);
        }
        else {
            return this.getRuleContext(i, DateTimeContext);
        }
    }
    get ruleIndex() { return FlowFilterParser.RULE_dateTimeRange; }
}
__decorate([
    Decorators_2.Override
], DateTimeRangeContext.prototype, "ruleIndex", null);
exports.DateTimeRangeContext = DateTimeRangeContext;
class ModificationDateTimeRangeContext extends ParserRuleContext_1.ParserRuleContext {
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    dateTime(i) {
        if (i === undefined) {
            return this.getRuleContexts(DateTimeContext);
        }
        else {
            return this.getRuleContext(i, DateTimeContext);
        }
    }
    get ruleIndex() { return FlowFilterParser.RULE_modificationDateTimeRange; }
}
__decorate([
    Decorators_2.Override
], ModificationDateTimeRangeContext.prototype, "ruleIndex", null);
exports.ModificationDateTimeRangeContext = ModificationDateTimeRangeContext;
class FloatingTimeRangeContext extends ParserRuleContext_1.ParserRuleContext {
    PAST_HOUR() { return this.tryGetToken(FlowFilterParser.PAST_HOUR, 0); }
    PAST_DAY() { return this.tryGetToken(FlowFilterParser.PAST_DAY, 0); }
    PAST_WEEK() { return this.tryGetToken(FlowFilterParser.PAST_WEEK, 0); }
    PAST_MONTH() { return this.tryGetToken(FlowFilterParser.PAST_MONTH, 0); }
    PAST_YEAR() { return this.tryGetToken(FlowFilterParser.PAST_YEAR, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return FlowFilterParser.RULE_floatingTimeRange; }
}
__decorate([
    Decorators_2.Override
], FloatingTimeRangeContext.prototype, "ruleIndex", null);
exports.FloatingTimeRangeContext = FloatingTimeRangeContext;
//# sourceMappingURL=FlowFilterParser.js.map