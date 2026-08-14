import type {
  FieldReference,
  KeywordValue,
  QueryExpression,
  QueryList,
  QueryValue,
  SymbolValue,
  Token
} from "./analyticsQueryTypes.js";

export function parseQuery(query: string): QueryExpression | undefined {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parser = new QueryParser(tokenize(trimmed));
  const expression = parser.parseExpression();
  parser.expectEnd();
  return expression;
}

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < query.length) {
    const char = query[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if ("()[],".includes(char)) {
      tokens.push({ type: "symbol", value: char as SymbolValue });
      index += 1;
      continue;
    }

    const twoCharOperator = query.slice(index, index + 2);
    if (["!=", "~=", ">=", "<="].includes(twoCharOperator)) {
      tokens.push({
        type: "operator",
        value: twoCharOperator as Extract<Token, { type: "operator" }>["value"]
      });
      index += 2;
      continue;
    }

    if (["=", ">", "<"].includes(char)) {
      tokens.push({
        type: "operator",
        value: char as Extract<Token, { type: "operator" }>["value"]
      });
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const { nextIndex, value } = readQuotedString(query, index, char);
      tokens.push({ type: "string", value });
      index = nextIndex;
      continue;
    }

    if (/\d/.test(char)) {
      const match = query.slice(index).match(/^\d+(?:\.\d+)?/);
      if (match === null) {
        throw new Error("Некорректное число в запросе");
      }
      tokens.push({ type: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }

    const identifierMatch = query.slice(index).match(/^[A-Za-zА-Яа-я_][\wА-Яа-я.-]*/u);
    if (identifierMatch !== null) {
      const value = identifierMatch[0];
      const normalized = value.toLowerCase();
      if (["and", "or", "in", "not", "true", "false"].includes(normalized)) {
        tokens.push({ type: "keyword", value: normalized as KeywordValue });
      } else {
        tokens.push({ type: "identifier", value });
      }
      index += value.length;
      continue;
    }

    throw new Error(`Неизвестный символ "${char}"`);
  }

  return tokens;
}

function readQuotedString(query: string, startIndex: number, quote: string) {
  let value = "";
  let index = startIndex + 1;
  while (index < query.length) {
    const char = query[index]!;
    if (char === "\\" && index + 1 < query.length) {
      value += query[index + 1]!;
      index += 2;
      continue;
    }
    if (char === quote) {
      return { nextIndex: index + 1, value };
    }
    value += char;
    index += 1;
  }

  throw new Error("Строка в запросе не закрыта");
}

class QueryParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parseExpression(): QueryExpression {
    return this.parseOr();
  }

  expectEnd() {
    if (this.peek() !== undefined) {
      throw new Error("Лишний текст после конца выражения");
    }
  }

  private parseOr(): QueryExpression {
    let expression = this.parseAnd();
    while (this.matchKeyword("or")) {
      expression = { left: expression, right: this.parseAnd(), type: "or" };
    }
    return expression;
  }

  private parseAnd(): QueryExpression {
    let expression = this.parseUnary();
    while (this.matchKeyword("and")) {
      expression = { left: expression, right: this.parseUnary(), type: "and" };
    }
    return expression;
  }

  private parseUnary(): QueryExpression {
    if (this.matchKeyword("not")) {
      return { expression: this.parseUnary(), type: "not" };
    }

    if (this.matchSymbol("(")) {
      const expression = this.parseExpression();
      this.expectSymbol(")");
      return expression;
    }

    return this.parseComparison();
  }

  private parseComparison(): QueryExpression {
    const field = this.parseFieldReference();
    const operator = this.matchKeyword("in") ? "in" : this.expectOperator().value;
    const value = operator === "in" ? this.parseList() : this.parseValue();
    return { field, operator, value, type: "comparison" };
  }

  private parseFieldReference(): FieldReference {
    const name = this.expectIdentifier().value;
    if (!this.matchSymbol("[")) {
      return { name };
    }

    const key = this.parseValue();
    if (typeof key !== "string") {
      throw new Error("Ключ поля должен быть строкой");
    }
    this.expectSymbol("]");
    return { key, name };
  }

  private parseList(): QueryList {
    const items: QueryValue[] = [];
    this.expectSymbol("[");
    while (!this.matchSymbol("]")) {
      items.push(this.parseValue());
      if (!this.matchSymbol(",")) {
        this.expectSymbol("]");
        break;
      }
    }
    return { items, type: "list" };
  }

  private parseValue(): QueryValue {
    const token = this.next();
    if (token === undefined) {
      throw new Error("Ожидалось значение");
    }
    if (token.type === "string" || token.type === "number") {
      return token.value;
    }
    if (token.type === "keyword" && (token.value === "true" || token.value === "false")) {
      return token.value === "true";
    }
    if (token.type === "identifier") {
      return token.value;
    }
    throw new Error("Ожидалось строковое, числовое или boolean значение");
  }

  private expectIdentifier(): Extract<Token, { type: "identifier" }> {
    const token = this.next();
    if (token?.type !== "identifier") {
      throw new Error("Ожидалось имя поля");
    }
    return token;
  }

  private expectOperator(): Extract<Token, { type: "operator" }> {
    const token = this.next();
    if (token?.type !== "operator") {
      throw new Error("Ожидался оператор сравнения");
    }
    return token;
  }

  private expectSymbol(value: Extract<Token, { type: "symbol" }>["value"]) {
    if (!this.matchSymbol(value)) {
      throw new Error(`Ожидался символ ${value}`);
    }
  }

  private matchKeyword(value: Extract<Token, { type: "keyword" }>["value"]): boolean {
    if (this.peek()?.type === "keyword" && this.peek()?.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private matchSymbol(value: Extract<Token, { type: "symbol" }>["value"]): boolean {
    if (this.peek()?.type === "symbol" && this.peek()?.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private next(): Token | undefined {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }
}
