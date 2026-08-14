import type { FastifyRequest } from "fastify";
import type { UserRecord } from "./store.js";

export type UserPrincipal = {
  method: "session" | "personal-token";
  scopes?: string[];
  user: UserRecord;
};

const requestPrincipals = new WeakMap<FastifyRequest, UserPrincipal>();

export function getRequestUserPrincipal(request: FastifyRequest): UserPrincipal | undefined {
  return requestPrincipals.get(request);
}

export function setRequestUserPrincipal(request: FastifyRequest, principal: UserPrincipal): void {
  requestPrincipals.set(request, principal);
}

export function trustedHeaderAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" || process.env.TESTHISTORY_TRUSTED_HEADER_AUTH === "true"
  );
}
