import type { FastifyInstance, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";

const workerRoutes = [
  { method: "GET", pattern: /^\/api\/v1\/uploads\/jobs(?:\?|$)/ },
  { method: "POST", pattern: /^\/api\/v1\/uploads\/jobs\/claim(?:\?|$)/ },
  { method: "POST", pattern: /^\/api\/v1\/uploads\/[^/]+\/process(?:\?|$)/ },
  { method: "POST", pattern: /^\/api\/v1\/integrations\/deliveries\/dispatch(?:\?|$)/ }
] as const;

export async function registerWorkerAuthGuard(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    if (!isWorkerRoute(request)) {
      return;
    }

    const expectedToken = process.env.TESTHISTORY_WORKER_TOKEN;
    if (expectedToken === undefined || expectedToken.length === 0) {
      if (process.env.NODE_ENV !== "production") {
        return;
      }
      return reply.code(503).send({
        error: "WorkerAuthenticationConfigurationError",
        message: "Worker authentication is not configured",
        redacted: true
      });
    }

    const suppliedToken = parseBearer(request.headers.authorization);
    if (suppliedToken === undefined || !safeEqual(suppliedToken, expectedToken)) {
      return reply.code(401).send({
        error: "WorkerAuthenticationRequiredError",
        message: "Worker authentication is required",
        redacted: true
      });
    }
  });
}

function isWorkerRoute(request: FastifyRequest): boolean {
  return workerRoutes.some(
    (route) => route.method === request.method && route.pattern.test(request.url)
  );
}

function parseBearer(value: FastifyRequest["headers"]["authorization"]): string | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const match = typeof rawValue === "string" ? /^Bearer\s+(.+)$/i.exec(rawValue.trim()) : null;
  return match?.[1];
}

function safeEqual(actualValue: string, expectedValue: string): boolean {
  const actual = Buffer.from(actualValue);
  const expected = Buffer.from(expectedValue);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
