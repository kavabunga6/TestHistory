export function formatResultDuration(duration: string): string {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(ms|s)\s*$/i.exec(duration);
  if (match === null) {
    return duration === "n/a" ? "—" : duration;
  }
  return `${match[1]!.replace(".", ",")} ${match[2]!.toLowerCase() === "ms" ? "мс" : "с"}`;
}
