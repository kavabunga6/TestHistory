import { describe, expect, it } from "vitest";
import {
  canDispatchIntegrationDelivery,
  nextIntegrationRetryAt,
  type IntegrationDelivery
} from "./integrations.js";

const base: IntegrationDelivery = {
  id: "delivery-1",
  projectId: "project-1",
  integrationId: "integration-1",
  kind: "notification",
  event: "automation-job.failed",
  status: "pending",
  payload: {},
  attempts: 0,
  maxAttempts: 5,
  nextAttemptAt: "2026-08-09T00:00:00.000Z",
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z"
};

describe("integration delivery scheduling", () => {
  it("does not reclaim terminal or actively leased deliveries", () => {
    expect(
      canDispatchIntegrationDelivery({ ...base, status: "delivered" }, "2026-08-09T01:00:00.000Z")
    ).toBe(false);
    expect(
      canDispatchIntegrationDelivery({ ...base, status: "dead" }, "2026-08-09T01:00:00.000Z")
    ).toBe(false);
    expect(
      canDispatchIntegrationDelivery(
        {
          ...base,
          status: "processing",
          lease: { workerId: "a", token: "t", expiresAt: "2026-08-09T02:00:00.000Z" }
        },
        "2026-08-09T01:00:00.000Z"
      )
    ).toBe(false);
    expect(
      canDispatchIntegrationDelivery(
        {
          ...base,
          status: "processing",
          lease: { workerId: "a", token: "t", expiresAt: "2026-08-09T00:30:00.000Z" }
        },
        "2026-08-09T01:00:00.000Z"
      )
    ).toBe(true);
  });

  it("uses bounded exponential retry delays", () => {
    expect(nextIntegrationRetryAt("2026-08-09T00:00:00.000Z", 1)).toBe("2026-08-09T00:00:05.000Z");
    expect(nextIntegrationRetryAt("2026-08-09T00:00:00.000Z", 4)).toBe("2026-08-09T00:00:40.000Z");
    expect(nextIntegrationRetryAt("2026-08-09T00:00:00.000Z", 99)).toBe("2026-08-09T00:10:40.000Z");
  });
});
