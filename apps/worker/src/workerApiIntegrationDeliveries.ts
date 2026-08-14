export type IntegrationDeliveryPollResult = {
  status: "idle" | "processed" | "failed";
  processed: number;
  error?: string;
};

export async function processApiIntegrationDeliveries(options: {
  baseUrl: string;
  token?: string;
  workerId: string;
  limit?: number;
  fetch?: typeof fetch;
}): Promise<IntegrationDeliveryPollResult> {
  try {
    const url = new URL(
      "/api/v1/integrations/deliveries/dispatch",
      normalizedBase(options.baseUrl)
    );
    const response = await (options.fetch ?? fetch)(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.token !== undefined ? { authorization: `Bearer ${options.token}` } : {})
      },
      body: JSON.stringify({ workerId: options.workerId, limit: normalizeLimit(options.limit) })
    });
    if (!response.ok) {
      return { status: "failed", processed: 0, error: (await response.text()).slice(0, 500) };
    }
    const body = (await response.json()) as { processed?: unknown };
    const processed = typeof body.processed === "number" ? body.processed : 0;
    return { status: processed === 0 ? "idle" : "processed", processed };
  } catch (error) {
    return {
      status: "failed",
      processed: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function normalizedBase(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error("TESTHISTORY_API_URL must not be empty");
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}
function normalizeLimit(value: number | undefined) {
  return value !== undefined && Number.isInteger(value) && value > 0 ? Math.min(value, 100) : 25;
}
