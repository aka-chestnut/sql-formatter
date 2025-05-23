import { isReserved, Token, TokenType } from './token.js';

/**
 * Ensures that no keyword token (RESERVED_*) is preceded or followed by a dot (.)
 * or any other property-access operator.
 *
 * Ensures that all RESERVED_FUNCTION_NAME tokens are followed by "(".
 * If they're not, converts the token to IDENTIFIER.
 *
 * Converts RESERVED_DATA_TYPE tokens followed by "(" to RESERVED_PARAMETERIZED_DATA_TYPE.
 *
 * When IDENTIFIER or RESERVED_DATA_TYPE token is followed by "["
 * converts it to ARRAY_IDENTIFIER or ARRAY_KEYWORD accordingly.
 *
 * This is needed to avoid ambiguity in parser which expects function names
 * to always be followed by open-paren, and to distinguish between
 * array accessor `foo[1]` and array literal `[1, 2, 3]`.
 */
export function disambiguateTokens(tokens: Token[]): Token[] {
  return tokens
    .map(propertyNameKeywordToIdent)
    .map(funcNameToIdent)
    .map(dataTypeToParameterizedDataType)
    .map(identToArrayIdent)
    .map(dataTypeToArrayKeyword);
}

const propertyNameKeywordToIdent = (token: Token, i: number, tokens: Token[]): Token => {
  if (isReserved(token.type)) {
    const prevToken = prevNonCommentToken(tokens, i);
    if (prevToken && prevToken.type === TokenType.PROPERTY_ACCESS_OPERATOR) {
      return { ...token, type: TokenType.IDENTIFIER, text: token.raw };
    }
    const nextToken = nextNonCommentToken(tokens, i);
    if (nextToken && nextToken.type === TokenType.PROPERTY_ACCESS_OPERATOR) {
      return { ...token, type: TokenType.IDENTIFIER, text: token.raw };
    }
  }
  return token;
};

const funcNameToIdent = (token: Token, i: number, tokens: Token[]): Token => {
  if (token.type === TokenType.RESERVED_FUNCTION_NAME) {
    const nextToken = nextNonCommentToken(tokens, i);
    if (!nextToken || !isOpenParen(nextToken)) {
      return { ...token, type: TokenType.IDENTIFIER, text: token.raw };
    }
  }
  return token;
};

const dataTypeToParameterizedDataType = (token: Token, i: number, tokens: Token[]): Token => {
  if (token.type === TokenType.RESERVED_DATA_TYPE) {
    const nextToken = nextNonCommentToken(tokens, i);
    if (nextToken && isOpenParen(nextToken)) {
      return { ...token, type: TokenType.RESERVED_PARAMETERIZED_DATA_TYPE };
    }
  }
  return token;
};

const identToArrayIdent = (token: Token, i: number, tokens: Token[]): Token => {
  if (token.type === TokenType.IDENTIFIER) {
    const nextToken = nextNonCommentToken(tokens, i);
    if (nextToken && isOpenBracket(nextToken)) {
      return { ...token, type: TokenType.ARRAY_IDENTIFIER };
    }
  }
  return token;
};

const dataTypeToArrayKeyword = (token: Token, i: number, tokens: Token[]): Token => {
  if (token.type === TokenType.RESERVED_DATA_TYPE) {
    const nextToken = nextNonCommentToken(tokens, i);
    if (nextToken && isOpenBracket(nextToken)) {
      return { ...token, type: TokenType.ARRAY_KEYWORD };
    }
  }
  return token;
};

const prevNonCommentToken = (tokens: Token[], index: number): Token | undefined =>
  nextNonCommentToken(tokens, index, -1);

const nextNonCommentToken = (
  tokens: Token[],
  index: number,
  dir: -1 | 1 = 1
): Token | undefined => {
  let i = 1;
  while (tokens[index + i * dir] && isComment(tokens[index + i * dir])) {
    i++;
  }
  return tokens[index + i * dir];
};

const isOpenParen = (t: Token): boolean => t.type === TokenType.OPEN_PAREN && t.text === '(';

const isOpenBracket = (t: Token): boolean => t.type === TokenType.OPEN_PAREN && t.text === '[';

const isComment = (t: Token): boolean =>
  t.type === TokenType.BLOCK_COMMENT || t.type === TokenType.LINE_COMMENT;
