import { describe, expect, it, vi } from "vitest";
import { processApiIntegrationDeliveries } from "./workerApiIntegrationDeliveries.js";

describe("integration delivery worker poller", () => {
  it("dispatches a bounded batch through the authenticated API endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ processed: 3 }), { status: 200 })
    );
    const result = await processApiIntegrationDeliveries({
      baseUrl: "https://testhistory.example",
      token: "worker-secret",
      workerId: "worker-1",
      limit: 500,
      fetch: fetchMock
    });
    expect(result).toEqual({ status: "processed", processed: 3 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://testhistory.example/api/v1/integrations/deliveries/dispatch");
    expect(init?.headers).toMatchObject({ authorization: "Bearer worker-secret" });
    expect(JSON.parse(String(init?.body))).toEqual({ workerId: "worker-1", limit: 100 });
  });
});
