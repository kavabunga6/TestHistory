export function formatResultDuration(duration: string): string {
  const minutesMatch = /^\s*(\d+)\s*m\s*(\d+)\s*s\s*$/i.exec(duration);
  if (minutesMatch !== null) {
    return `${minutesMatch[1]} мин ${minutesMatch[2]} с`;
  }

  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(ms|s)\s*$/i.exec(duration);
  if (match === null) {
    return duration === "n/a" ? "—" : duration;
  }
  return `${match[1]!.replace(".", ",")} ${match[2]!.toLowerCase() === "ms" ? "мс" : "с"}`;
}
