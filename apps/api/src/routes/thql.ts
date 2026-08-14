export type ThqlOperator = "=" | "!=" | "~=" | ">" | ">=" | "<" | "<=" | "in";

export type ThqlField = {
  key?: string;
  name: string;
};

export type ThqlValue = boolean | number | string;
export type ThqlList = { items: ThqlValue[]; type: "list" };

export type ThqlExpression =
  | { field: ThqlField; operator: ThqlOperator; type: "comparison"; value: ThqlList | ThqlValue }
  | { expression: ThqlExpression; type: "not" }
  | { left: ThqlExpression; right: ThqlExpression; type: "and" | "or" };

type ThqlToken =
  | { type: "identifier"; value: string }
  | { type: "keyword"; value: "and" | "false" | "in" | "not" | "or" | "true" }
  | { type: "number"; value: number }
  | { type: "operator"; value: Exclude<ThqlOperator, "in"> }
  | { type: "string"; value: string }
  | { type: "symbol"; value: "(" | ")" | "," | "[" | "]" };

export const thqlSearchFields = {
  launches: ["branch", "createdAt", "id", "name", "projectId", "resultCount", "status"],
  results: [
    "durationMs",
    "historyId",
    "launchId",
    "name",
    "projectId",
    "status",
    "testCaseId",
    "uuid"
  ],
  testCases: [
    "customFields",
    "id",
    "name",
    "projectId",
    "tag",
    "tags",
    "updatedAt",
    "workflowStatus"
  ]
} as const;

export function parseThql(query: string): ThqlExpression | undefined {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parser = new ThqlParser(tokenizeThql(trimmed));
  const expression = parser.parseExpression();
  parser.expectEnd();
  return expression;
}

export function getThqlFields(expression: ThqlExpression | undefined): string[] {
  if (expression === undefined) {
    return [];
  }
  if (expression.type === "comparison") {
    return [expression.field.name];
  }
  if (expression.type === "not") {
    return getThqlFields(expression.expression);
  }
  return [...getThqlFields(expression.left), ...getThqlFields(expression.right)];
}

export function evaluateThql(
  row: Record<string, unknown>,
  expression: ThqlExpression | undefined
): boolean {
  if (expression === undefined) {
    return true;
  }
  if (expression.type === "and") {
    return evaluateThql(row, expression.left) && evaluateThql(row, expression.right);
  }
  if (expression.type === "or") {
    return evaluateThql(row, expression.left) || evaluateThql(row, expression.right);
  }
  if (expression.type === "not") {
    return !evaluateThql(row, expression.expression);
  }
  if (expression.type !== "comparison") {
    return false;
  }

  const values = getFieldValues(row, expression.field);
  if (expression.operator === "in") {
    const expected = isThqlList(expression.value) ? expression.value.items : [];
    return values.some((value) => expected.some((item) => compareThql(value, "=", item)));
  }
  const queryValue = expression.value;
  if (isThqlList(queryValue)) {
    return false;
  }
  const operator = expression.operator;
  if (!isScalarOperator(operator)) {
    return false;
  }
  return values.some((value) => compareThql(value, operator, queryValue));
}

export function validateThqlFields(
  entity: keyof typeof thqlSearchFields,
  fields: string[]
): Array<{ code: string; message: string; path: string }> {
  const allowed = new Set<string>(thqlSearchFields[entity]);
  return Array.from(new Set(fields))
    .filter((field) => !allowed.has(field))
    .map((field) => ({
      code: "query.thql.field.unsupported",
      message: `THQL field ${field} is not supported for ${entity}`,
      path: "/query/thql"
    }));
}

function compareThql(actual: unknown, operator: Exclude<ThqlOperator, "in">, expected: ThqlValue) {
  if (operator === "~=") {
    return String(actual).toLowerCase().includes(String(expected).toLowerCase());
  }
  if (typeof actual === "number" && typeof expected === "number") {
    return compareNumbers(actual, operator, expected);
  }
  if (operator === "=" || operator === "!=") {
    const equals =
      typeof actual === "string" && typeof expected === "string"
        ? actual.toLowerCase() === expected.toLowerCase()
        : actual === expected;
    return operator === "=" ? equals : !equals;
  }
  return false;
}

function compareNumbers(actual: number, operator: Exclude<ThqlOperator, "in">, expected: number) {
  if (operator === "=") return actual === expected;
  if (operator === "!=") return actual !== expected;
  if (operator === ">") return actual > expected;
  if (operator === ">=") return actual >= expected;
  if (operator === "<") return actual < expected;
  if (operator === "<=") return actual <= expected;
  return false;
}

function getFieldValues(row: Record<string, unknown>, field: ThqlField): unknown[] {
  const source = field.name === "tag" ? row.tags : row[field.name];
  if (field.key !== undefined && isRecord(source)) {
    return normalizeValue(source[field.key]);
  }
  return normalizeValue(source);
}

function normalizeValue(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value.flatMap(normalizeValue) : [value];
}

function isThqlList(value: ThqlList | ThqlValue): value is ThqlList {
  return typeof value === "object" && value !== null && "items" in value;
}

function isScalarOperator(operator: ThqlOperator): operator is Exclude<ThqlOperator, "in"> {
  return operator !== "in";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokenizeThql(query: string): ThqlToken[] {
  const tokens: ThqlToken[] = [];
  let index = 0;
  while (index < query.length) {
    const char = query[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if ("()[],".includes(char)) {
      tokens.push({
        type: "symbol",
        value: char as Extract<ThqlToken, { type: "symbol" }>["value"]
      });
      index += 1;
      continue;
    }
    const twoCharOperator = query.slice(index, index + 2);
    if (["!=", "~=", ">=", "<="].includes(twoCharOperator)) {
      tokens.push({
        type: "operator",
        value: twoCharOperator as Extract<ThqlToken, { type: "operator" }>["value"]
      });
      index += 2;
      continue;
    }
    if (["=", ">", "<"].includes(char)) {
      tokens.push({
        type: "operator",
        value: char as Extract<ThqlToken, { type: "operator" }>["value"]
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
        throw new Error("Invalid number");
      }
      tokens.push({ type: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    const identifierMatch = query.slice(index).match(/^[\p{L}_][\p{L}\p{N}_.-]*/u);
    if (identifierMatch !== null) {
      const value = identifierMatch[0];
      const normalized = value.toLowerCase();
      if (["and", "false", "in", "not", "or", "true"].includes(normalized)) {
        tokens.push({
          type: "keyword",
          value: normalized as Extract<ThqlToken, { type: "keyword" }>["value"]
        });
      } else {
        tokens.push({ type: "identifier", value });
      }
      index += value.length;
      continue;
    }
    throw new Error(`Unknown character ${char}`);
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
  throw new Error("Unclosed string");
}

class ThqlParser {
  private index = 0;

  constructor(private readonly tokens: ThqlToken[]) {}

  parseExpression(): ThqlExpression {
    return this.parseOr();
  }

  expectEnd() {
    if (this.peek() !== undefined) {
      throw new Error("Unexpected text after expression");
    }
  }

  private parseOr(): ThqlExpression {
    let expression = this.parseAnd();
    while (this.matchKeyword("or")) {
      expression = { left: expression, right: this.parseAnd(), type: "or" };
    }
    return expression;
  }

  private parseAnd(): ThqlExpression {
    let expression = this.parseUnary();
    while (this.matchKeyword("and")) {
      expression = { left: expression, right: this.parseUnary(), type: "and" };
    }
    return expression;
  }

  private parseUnary(): ThqlExpression {
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

  private parseComparison(): ThqlExpression {
    const field = this.parseField();
    const operator = this.matchKeyword("in") ? "in" : this.expectOperator().value;
    return {
      field,
      operator,
      type: "comparison",
      value: operator === "in" ? this.parseList() : this.parseValue()
    };
  }

  private parseField(): ThqlField {
    const name = this.expectIdentifier().value;
    if (!this.matchSymbol("[")) {
      return { name };
    }
    const key = this.parseValue();
    if (typeof key !== "string") {
      throw new Error("Field key must be a string");
    }
    this.expectSymbol("]");
    return { key, name };
  }

  private parseList(): ThqlList {
    const items: ThqlValue[] = [];
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

  private parseValue(): ThqlValue {
    const token = this.next();
    if (token?.type === "string" || token?.type === "number") return token.value;
    if (token?.type === "keyword" && (token.value === "true" || token.value === "false")) {
      return token.value === "true";
    }
    if (token?.type === "identifier") return token.value;
    throw new Error("Expected value");
  }

  private expectIdentifier() {
    const token = this.next();
    if (token?.type !== "identifier") throw new Error("Expected field name");
    return token;
  }

  private expectOperator() {
    const token = this.next();
    if (token?.type !== "operator") throw new Error("Expected comparison operator");
    return token;
  }

  private expectSymbol(value: Extract<ThqlToken, { type: "symbol" }>["value"]) {
    if (!this.matchSymbol(value)) throw new Error(`Expected ${value}`);
  }

  private matchKeyword(value: Extract<ThqlToken, { type: "keyword" }>["value"]) {
    if (this.peek()?.type === "keyword" && this.peek()?.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private matchSymbol(value: Extract<ThqlToken, { type: "symbol" }>["value"]) {
    if (this.peek()?.type === "symbol" && this.peek()?.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private next() {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private peek() {
    return this.tokens[this.index];
  }
}
