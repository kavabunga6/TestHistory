import { describe, expect, it } from "vitest";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "./integrationSecrets.js";

describe("integration secret envelope", () => {
  it("round-trips with AES-GCM and fails closed for missing or different master keys", () => {
    const env = {
      TESTHISTORY_INTEGRATION_MASTER_KEY: "a sufficiently long deployment master key 123"
    };
    const ciphertext = encryptIntegrationSecret("provider-webhook-secret", env);
    expect(ciphertext).toMatch(/^v1\./);
    expect(ciphertext).not.toContain("provider-webhook-secret");
    expect(decryptIntegrationSecret(ciphertext!, env)).toBe("provider-webhook-secret");
    expect(
      decryptIntegrationSecret(ciphertext!, {
        TESTHISTORY_INTEGRATION_MASTER_KEY: "a different sufficiently long master key"
      })
    ).toBeUndefined();
    expect(encryptIntegrationSecret("secret", {})).toBeUndefined();
  });
});
