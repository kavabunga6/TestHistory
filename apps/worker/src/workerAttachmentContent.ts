export function safeAttachmentType(type: string | undefined): string {
  const normalized = type?.split(";")[0]?.trim().toLowerCase();
  if (normalized !== undefined && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized)) {
    return normalized;
  }

  return "unknown";
}
