export function sanitizeArchiveText(value: string, fallback: string): string {
  if (containsSensitiveArchiveText(value)) {
    return fallback;
  }

  return value;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "not advertised";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function containsSensitiveArchiveText(value: string): boolean {
  return (
    /[A-Za-z]:\\|\\\\|\/Users\/|\/home\/|\/var\/|\/tmp\/|Downloads/i.test(value) ||
    /\b(token|bearer|secret|password|api[-_ ]?key|storage[-_ ]?key|storage[-_ ]?ref|signed[-_ ]?url)\b/i.test(
      value
    ) ||
    /https?:\/\/\S*(?:[?&](?:token|signature|x-amz-signature|sig|key|secret)=)/i.test(value) ||
    /(?:s3|gs|az|azure|minio|storage|blob):\/\//i.test(value)
  );
}
