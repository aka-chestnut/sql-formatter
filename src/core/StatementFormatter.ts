import Indentation from './Indentation';
import InlineBlock from './InlineBlock';
import Params from './Params';
import { equalizeWhitespace } from '../utils';
import { isReserved, isCommand, isToken, Token, TokenType, EOF_TOKEN } from './token';
import { FormatOptions } from '../types';
import { toTabularToken, replaceTabularPlaceholders } from './tabularStyle';
import AliasAs from './AliasAs';
import AsTokenFactory from './AsTokenFactory';
import { Statement } from './Parser';
import { indentString, isTabularStyle } from './config';
import StringBuilder from './StringBuilder';

/** Formats single SQL statement */
export default class StatementFormatter {
  private cfg: FormatOptions;
  private indentation: Indentation;
  private inlineBlock: InlineBlock;
  private aliasAs: AliasAs;
  private params: Params;
  private asTokenFactory: AsTokenFactory;
  private query: StringBuilder;

  private currentNewline = true;
  private previousReservedToken: Token = EOF_TOKEN;
  private previousCommandToken: Token = EOF_TOKEN;
  private tokens: Token[] = [];
  private index = -1;

  constructor(cfg: FormatOptions, params: Params, asTokenFactory: AsTokenFactory) {
    this.cfg = cfg;
    this.indentation = new Indentation(indentString(cfg));
    this.inlineBlock = new InlineBlock(this.cfg.expressionWidth);
    this.aliasAs = new AliasAs(this.cfg.aliasAs, this);
    this.params = params;
    this.asTokenFactory = asTokenFactory;
    this.query = new StringBuilder(this.indentation);
  }

  public format(statement: Statement): string {
    this.tokens = statement.tokens;

    for (this.index = 0; this.index < this.tokens.length; this.index++) {
      let token = this.tokens[this.index];

      // if token is a Reserved Keyword, Command, Binary Command, Dependent Clause, Logical Operator, CASE, END
      if (isReserved(token)) {
        this.previousReservedToken = token;
        if (
          token.type === TokenType.RESERVED_LOGICAL_OPERATOR ||
          token.type === TokenType.RESERVED_DEPENDENT_CLAUSE ||
          token.type === TokenType.RESERVED_COMMAND ||
          token.type === TokenType.RESERVED_BINARY_COMMAND
        ) {
          token = toTabularToken(token, this.cfg.indentStyle);
        }
        if (token.type === TokenType.RESERVED_COMMAND) {
          this.previousCommandToken = token;
        }
      }

      if (token.type === TokenType.LINE_COMMENT) {
        this.formatLineComment(token);
      } else if (token.type === TokenType.BLOCK_COMMENT) {
        this.formatBlockComment(token);
      } else if (token.type === TokenType.RESERVED_COMMAND) {
        this.currentNewline = this.checkNewline(token);
        this.formatCommand(token);
      } else if (token.type === TokenType.RESERVED_BINARY_COMMAND) {
        this.formatBinaryCommand(token);
      } else if (token.type === TokenType.RESERVED_DEPENDENT_CLAUSE) {
        this.formatDependentClause(token);
      } else if (token.type === TokenType.RESERVED_JOIN_CONDITION) {
        this.formatJoinCondition(token);
      } else if (token.type === TokenType.RESERVED_LOGICAL_OPERATOR) {
        this.formatLogicalOperator(token);
      } else if (token.type === TokenType.RESERVED_KEYWORD) {
        this.formatKeyword(token);
      } else if (token.type === TokenType.BLOCK_START) {
        this.formatBlockStart(token);
      } else if (token.type === TokenType.BLOCK_END) {
        this.formatBlockEnd(token);
      } else if (token.type === TokenType.RESERVED_CASE_START) {
        this.formatCaseStart(token);
      } else if (token.type === TokenType.RESERVED_CASE_END) {
        this.formatCaseEnd(token);
      } else if (token.type === TokenType.PLACEHOLDER) {
        this.formatPlaceholder(token);
      } else if (token.type === TokenType.OPERATOR) {
        this.formatOperator(token);
      } else {
        this.formatWord(token);
      }
    }
    return replaceTabularPlaceholders(this.query.toString());
  }

  /**
   * Formats word tokens + any potential AS tokens for aliases
   */
  private formatWord(token: Token) {
    if (this.aliasAs.shouldAddBefore(token)) {
      this.query.addWithSpaces(this.show(this.asTokenFactory.token()));
    }

    this.query.addWithSpaces(this.show(token));

    if (this.aliasAs.shouldAddAfter()) {
      this.query.addWithSpaces(this.show(this.asTokenFactory.token()));
    }
  }

  /**
   * Checks if a newline should currently be inserted
   */
  private checkNewline(token: Token): boolean {
    const nextTokens = this.tokensUntilNextCommandOrQueryEnd();

    // auto break if SELECT includes CASE statements
    if (this.isWithinSelect() && nextTokens.some(isToken.CASE)) {
      return true;
    }

    switch (this.cfg.multilineLists) {
      case 'always':
        return true;
      case 'avoid':
        return false;
      case 'expressionWidth':
        return this.inlineWidth(token, nextTokens) > this.cfg.expressionWidth;
      default: // multilineLists mode is a number
        return (
          this.countClauses(nextTokens) > this.cfg.multilineLists ||
          this.inlineWidth(token, nextTokens) > this.cfg.expressionWidth
        );
    }
  }

  private inlineWidth(token: Token, tokens: Token[]): number {
    const tokensString = tokens.map(({ value }) => (value === ',' ? value + ' ' : value)).join('');
    return `${token.whitespaceBefore}${token.value} ${tokensString}`.length;
  }

  /**
   * Counts comma-separated clauses (doesn't count commas inside blocks)
   * Note: There's always at least one clause.
   */
  private countClauses(tokens: Token[]): number {
    let count = 1;
    let openBlocks = 0;
    for (const { type, value } of tokens) {
      if (value === ',' && openBlocks === 0) {
        count++;
      }
      if (type === TokenType.BLOCK_START) {
        openBlocks++;
      }
      if (type === TokenType.BLOCK_END) {
        openBlocks--;
      }
    }
    return count;
  }

  /** get all tokens between current token and next Reserved Command or query end */
  private tokensUntilNextCommandOrQueryEnd(): Token[] {
    const tail = this.tokens.slice(this.index + 1);
    return tail.slice(
      0,
      tail.length ? tail.findIndex(token => isCommand(token) || token.value === ';') : undefined
    );
  }

  /** Formats a line comment onto query */
  private formatLineComment(token: Token) {
    this.query.addWithSpaceBefore(this.show(token));
    this.query.addNewline();
  }

  /** Formats a block comment onto query */
  private formatBlockComment(token: Token) {
    this.query.addNewline();
    this.query.addWithSpaceBefore(this.indentComment(token.value));
    this.query.addNewline();
  }

  /** Aligns comment to current indentation level */
  private indentComment(comment: string): string {
    return comment.replace(/\n[ \t]*/gu, '\n' + this.indentation.getIndent() + ' ');
  }

  /**
   * Formats a Reserved Command onto query, increasing indentation level where necessary
   */
  private formatCommand(token: Token) {
    this.indentation.decreaseTopLevel();

    this.query.addNewline();

    // indent tabular formats, except when preceding a (
    if (isTabularStyle(this.cfg)) {
      if (this.tokenLookAhead().value !== '(') {
        this.indentation.increaseTopLevel();
      }
    } else {
      this.indentation.increaseTopLevel();
    }

    this.query.addWithSpaceBefore(this.show(token)); // print token onto query
    if (this.currentNewline && !isTabularStyle(this.cfg)) {
      this.query.addNewline();
    } else {
      this.query.addWithSpaceBefore(' ');
    }
  }

  /**
   * Formats a Reserved Binary Command onto query, joining neighbouring tokens
   */
  private formatBinaryCommand(token: Token) {
    const isJoin = /JOIN/i.test(token.value); // check if token contains JOIN
    if (!isJoin || isTabularStyle(this.cfg)) {
      // decrease for boolean set operators or in tabular mode
      this.indentation.decreaseTopLevel();
    }
    this.query.addNewline();
    this.query.addWithSpaceBefore(this.show(token));
    if (isJoin) {
      this.query.addWithSpaceBefore(' ');
    } else {
      this.query.addNewline();
    }
  }

  /**
   * Formats a Reserved Keyword onto query, skipping AS if disabled
   */
  private formatKeyword(token: Token) {
    if (isToken.AS(token) && this.aliasAs.shouldRemove()) {
      return;
    }

    this.query.addWithSpaces(this.show(token));
  }

  /**
   * Formats a Reserved Dependent Clause token onto query, supporting the keyword that precedes it
   */
  private formatDependentClause(token: Token) {
    this.query.addNewline();
    this.query.addWithSpaces(this.show(token));
  }

  // Formats ON and USING keywords
  private formatJoinCondition(token: Token) {
    this.query.addWithSpaces(this.show(token));
  }

  /**
   * Formats an Operator onto query, following rules for specific characters
   */
  private formatOperator(token: Token) {
    // special operator
    if (token.value === ',') {
      this.formatComma(token);
      return;
    } else if (token.value === ';') {
      this.formatQuerySeparator(token);
      return;
    } else if (['$', '['].includes(token.value)) {
      this.query.addWithSpaceBefore(this.show(token));
      return;
    } else if ([':', ']'].includes(token.value)) {
      this.query.addWithSpaceAfter(this.show(token));
      return;
    } else if (['.', '{', '}', '`'].includes(token.value)) {
      this.query.addWithoutSpaces(this.show(token));
      return;
    }

    // regular operator
    if (this.cfg.denseOperators && this.tokenLookBehind().type !== TokenType.RESERVED_COMMAND) {
      // do not trim whitespace if SELECT *
      this.query.addWithoutSpaces(this.show(token));
      return;
    }
    this.query.addWithSpaces(this.show(token));
  }

  /**
   * Formats a Logical Operator onto query, joining boolean conditions
   */
  private formatLogicalOperator(token: Token) {
    // ignore AND when BETWEEN x [AND] y
    if (isToken.AND(token) && isToken.BETWEEN(this.tokenLookBehind(2))) {
      this.query.addWithSpaces(this.show(token));
      return;
    }

    if (isTabularStyle(this.cfg)) {
      this.indentation.decreaseTopLevel();
    }

    if (this.cfg.logicalOperatorNewline === 'before') {
      if (this.currentNewline) {
        this.query.addNewline();
      }
      this.query.addWithSpaces(this.show(token));
    } else {
      this.query.addWithSpaceBefore(this.show(token));
      if (this.currentNewline) {
        this.query.addNewline();
      }
    }
  }

  private formatBlockStart(token: Token) {
    // Take out the preceding space unless there was whitespace there in the original query
    // or another opening parens or line comment
    const preserveWhitespaceFor = [
      TokenType.BLOCK_START,
      TokenType.LINE_COMMENT,
      TokenType.OPERATOR,
    ];
    if (
      token.whitespaceBefore?.length === 0 &&
      !preserveWhitespaceFor.includes(this.tokenLookBehind().type)
    ) {
      this.query.addWithoutSpaces(this.show(token));
    } else if (!this.cfg.newlineBeforeOpenParen) {
      this.query.addWithoutNewlinesBefore(this.show(token));
    } else {
      this.query.addWithSpaceBefore(this.show(token));
    }
    this.inlineBlock.beginIfPossible(this.tokens, this.index);

    if (!this.inlineBlock.isActive()) {
      this.indentation.increaseBlockLevel();
      this.query.addNewline();
    }
  }

  private formatBlockEnd(token: Token) {
    if (this.inlineBlock.isActive()) {
      this.inlineBlock.end();
      this.query.addWithSpaceAfter(this.show(token)); // do not add space before )
    } else {
      this.formatMultilineBlockEnd(token);
    }
  }

  private formatCaseStart(token: Token) {
    this.query.addWithSpaces(this.show(token));
    this.indentation.increaseBlockLevel();
    if (this.cfg.multilineLists === 'always') {
      this.query.addNewline();
    }
  }

  private formatCaseEnd(token: Token) {
    this.formatMultilineBlockEnd(token);
  }

  private formatMultilineBlockEnd(token: Token) {
    this.indentation.decreaseBlockLevel();

    if (isTabularStyle(this.cfg)) {
      // +1 extra indentation step for the closing paren
      this.query.addNewline();
      this.query.addWithSpaceBefore(this.indentation.getSingleIndent());
    } else if (this.cfg.newlineBeforeCloseParen) {
      this.query.addNewline();
    } else {
      this.query.addWithoutNewlinesBefore('');
    }

    this.query.addWithSpaces(this.show(token));
  }

  /**
   * Formats a Placeholder item onto query, to be replaced with the value of the placeholder
   */
  formatPlaceholder(token: Token) {
    this.query.addWithSpaces(this.params.get(token));
  }

  /**
   * Formats a comma Operator onto query, ending line unless in an Inline Block
   */
  private formatComma(token: Token) {
    this.query.addWithSpaceAfter(this.show(token));

    if (this.inlineBlock.isActive()) {
      // nothing
    } else if (isToken.LIMIT(this.getPreviousReservedToken())) {
      // nothing
    } else if (this.currentNewline) {
      this.query.addNewline();
    } else {
      // nothing
    }
  }

  private formatQuerySeparator(token: Token) {
    if (this.cfg.newlineBeforeSemicolon) {
      this.query.addNewline();
    }
    this.query.addWithoutSpaces(this.show(token));
  }

  /** Converts token to string, uppercasing if enabled */
  private show(token: Token): string {
    if (isReserved(token)) {
      switch (this.cfg.keywordCase) {
        case 'preserve':
          return equalizeWhitespace(token.text);
        case 'upper':
          return equalizeWhitespace(token.text.toUpperCase());
        case 'lower':
          return equalizeWhitespace(token.text.toLowerCase());
      }
    } else {
      return token.value;
    }
  }

  /** Returns the latest encountered reserved keyword token */
  public getPreviousReservedToken(): Token {
    return this.previousReservedToken;
  }

  /** True when currently within SELECT command */
  public isWithinSelect(): boolean {
    return isToken.SELECT(this.previousCommandToken);
  }

  /** Fetches nth previous token from the token stream */
  public tokenLookBehind(n = 1): Token {
    return this.tokens[this.index - n] || EOF_TOKEN;
  }

  /** Fetches nth next token from the token stream */
  public tokenLookAhead(n = 1): Token {
    return this.tokens[this.index + n] || EOF_TOKEN;
  }
}
