export function getSafeProjectionDeniedMessage(message: string): string {
  return sanitizeProjectionText(message);
}

export function sanitizeSafeText(value: string): string {
  return sanitizeProjectionText(value);
}

export function sanitizeProjectionText(value: string): string {
  if (
    /\b(token|bearer|secret|password|api[-_ ]?key|storage[-_ ]?key|storage[-_ ]?ref|signed[-_ ]?url|signedUrl|storageRef)\b/i.test(
      value
    ) ||
    /https?:\/\/\S*(?:[?&](?:token|signature|x-amz-signature|sig|key|secret)=)/i.test(value) ||
    /[?&](token|signature|x-amz-signature|sig|key|secret)=/i.test(value) ||
    /(?:s3|gs|az|azure|minio|storage|blob):\/\//i.test(value) ||
    /[A-Z]:\\/i.test(value) ||
    /\\\\/i.test(value) ||
    /\/Users\//i.test(value) ||
    /\/home\//i.test(value) ||
    /\/var\//i.test(value) ||
    /\/tmp\//i.test(value) ||
    /\bDownloads\b/i.test(value)
  ) {
    return "[redacted]";
  }

  return value;
}
