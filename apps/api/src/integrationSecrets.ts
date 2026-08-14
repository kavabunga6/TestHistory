import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function encryptIntegrationSecret(
  secret: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const masterKey = integrationMasterKey(env);
  if (masterKey === undefined) return undefined;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptIntegrationSecret(
  value: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const masterKey = integrationMasterKey(env);
  if (masterKey === undefined) return undefined;
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", masterKey, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}

export function hasIntegrationMasterKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return integrationMasterKey(env) !== undefined;
}

function integrationMasterKey(env: NodeJS.ProcessEnv): Buffer | undefined {
  const value = env.TESTHISTORY_INTEGRATION_MASTER_KEY;
  if (value === undefined || value.length < 32) return undefined;
  return createHash("sha256").update(value).digest();
}
