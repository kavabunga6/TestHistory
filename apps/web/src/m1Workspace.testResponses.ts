export function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    json: async () => value
  } as Response;
}

export function notFoundResponse(): Response {
  return {
    ok: false,
    status: 404,
    json: async () => ({ message: "not found" })
  } as Response;
}
