import { describe, expect, it } from "vitest";
import { resolveRuntimeStorePlan } from "./runtimeStore.js";

describe("runtime store selection", () => {
  it("keeps the zero-infrastructure memory store available outside production", () => {
    expect(resolveRuntimeStorePlan({ NODE_ENV: "development" })).toEqual({ mode: "memory" });
    expect(resolveRuntimeStorePlan({ NODE_ENV: "test" })).toEqual({ mode: "memory" });
  });

  it("selects the explicit file-backed store in local and transitional deployments", () => {
    expect(
      resolveRuntimeStorePlan({
        NODE_ENV: "production",
        TESTHISTORY_STORE_FILE: "  .testhistory/store.json  "
      })
    ).toEqual({ mode: "file", filePath: ".testhistory/store.json" });
  });

  it("selects PostgreSQL as the durable production store when configured", () => {
    expect(
      resolveRuntimeStorePlan({
        DATABASE_URL: "postgres://db.internal/testhistory",
        NODE_ENV: "production"
      })
    ).toEqual({ mode: "postgres" });
  });

  it("refuses production without any durable store configuration", () => {
    expect(() => resolveRuntimeStorePlan({ NODE_ENV: "production" })).toThrow(
      "No durable store is configured. Refusing to start production with an ephemeral memory store."
    );
  });
});
