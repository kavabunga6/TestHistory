const resultWord: Record<Intl.LDMLPluralRule, string> = {
  zero: "результатов",
  one: "результат",
  two: "результата",
  few: "результата",
  many: "результатов",
  other: "результатов"
};

const russianPluralRules = new Intl.PluralRules("ru-RU");

export function formatResultCount(count: number): string {
  return `${count.toLocaleString("ru-RU")} ${resultWord[russianPluralRules.select(count)]}`;
}
