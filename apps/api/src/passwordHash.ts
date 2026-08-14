import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const scryptKeyBytes = 64;
const scryptCost = 16_384;
const scryptBlockSize = 8;
const scryptParallelization = 1;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, scryptKeyBytes, {
    N: scryptCost,
    p: scryptParallelization,
    r: scryptBlockSize
  });
  return [
    "scrypt",
    scryptCost,
    scryptBlockSize,
    scryptParallelization,
    salt.toString("base64url"),
    hash.toString("base64url")
  ].join(":");
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  if (encodedHash.startsWith("sha256:")) {
    return safeEqual(hashOpaqueSecret(password), encodedHash);
  }

  const [algorithm, costValue, blockSizeValue, parallelizationValue, saltValue, hashValue] =
    encodedHash.split(":");
  if (
    algorithm !== "scrypt" ||
    costValue === undefined ||
    blockSizeValue === undefined ||
    parallelizationValue === undefined ||
    saltValue === undefined ||
    hashValue === undefined
  ) {
    return false;
  }

  const cost = Number(costValue);
  const blockSize = Number(blockSizeValue);
  const parallelization = Number(parallelizationValue);
  if (
    cost !== scryptCost ||
    blockSize !== scryptBlockSize ||
    parallelization !== scryptParallelization
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(hashValue, "base64url");
    const salt = Buffer.from(saltValue, "base64url");
    if (expected.length !== scryptKeyBytes || salt.length !== 16) {
      return false;
    }
    const actual = scryptSync(password, salt, expected.length, {
      N: cost,
      p: parallelization,
      r: blockSize
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function passwordHashNeedsUpgrade(encodedHash: string): boolean {
  return !encodedHash.startsWith("scrypt:");
}

export function hashOpaqueSecret(secret: string): string {
  return `sha256:${createHash("sha256").update(secret).digest("hex")}`;
}

function safeEqual(actualValue: string, expectedValue: string): boolean {
  const actual = Buffer.from(actualValue);
  const expected = Buffer.from(expectedValue);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
