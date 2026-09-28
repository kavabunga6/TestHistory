const comparisonExpression = /(?:^|\s)[\w.]+\s*(?:!=|~=|>=|<=|=|>|<)\s*\S/u;
const membershipExpression = /(?:^|\s)[\w.]+\s+(?:not\s+)?in\s*\[/iu;

export function isLikelyThqlQuery(query: string): boolean {
  return comparisonExpression.test(query) || membershipExpression.test(query);
}
