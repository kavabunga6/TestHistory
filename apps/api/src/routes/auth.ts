import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AppStore, PersonalApiTokenRecord, UserRecord, UserSessionRecord } from "../store.js";
import {
  hashOpaqueSecret,
  hashPassword,
  passwordHashNeedsUpgrade,
  verifyPassword
} from "../passwordHash.js";
import {
  getRequestUserPrincipal,
  setRequestUserPrincipal,
  type UserPrincipal
} from "../requestAuthContext.js";

type RegisterBody = {
  email: string;
  name: string;
  password: string;
};

type LoginBody = {
  email: string;
  password: string;
};

type PersonalTokenBody = {
  name: string;
  scopes?: string[];
  expiresAt?: string;
};

const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const personalTokenScopes = ["profile:read", "tokens:read", "tokens:write"] as const;

export async function registerAuthRoutes(app: FastifyInstance, store: AppStore) {
  app.post<{ Body: RegisterBody }>("/api/v1/auth/register", async (request, reply) => {
    if (!registrationEnabled()) {
      return reply.code(403).send({ message: "User registration is disabled", redacted: true });
    }
    const validation = validateRegisterBody(request.body);
    if (validation !== undefined) {
      return reply.code(400).send({ message: validation, redacted: true });
    }

    const email = normalizeEmail(request.body.email);
    if (findUserByEmail(store, email) !== undefined) {
      return reply.code(409).send({ message: "User already exists", redacted: true });
    }

    const now = new Date().toISOString();
    const user: UserRecord = {
      createdAt: now,
      email,
      id: randomUUID(),
      name: request.body.name.trim(),
      passwordHash: hashPassword(request.body.password),
      role: store.users.size === 0 && process.env.NODE_ENV !== "production" ? "admin" : "user",
      status: "active",
      updatedAt: now
    };
    store.users.set(user.id, user);
    const session = createSession(store, user);

    return reply.code(201).send(authResponse(user, session.secret, session.record));
  });

  app.post<{ Body: LoginBody }>("/api/v1/auth/login", async (request, reply) => {
    const email = normalizeEmail(request.body.email);
    const user = findUserByEmail(store, email);
    if (
      user === undefined ||
      user.status !== "active" ||
      !verifyPassword(request.body.password, user.passwordHash)
    ) {
      return reply.code(401).send({ message: "Invalid email or password", redacted: true });
    }

    if (passwordHashNeedsUpgrade(user.passwordHash)) {
      user.passwordHash = hashPassword(request.body.password);
      user.updatedAt = new Date().toISOString();
      store.users.set(user.id, user);
    }
    const session = createSession(store, user);
    return authResponse(user, session.secret, session.record);
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const principal = authenticateUser(request, store);
    if (principal === undefined) {
      return reply.code(401).send({ message: "Authentication required", redacted: true });
    }

    return {
      kind: "current-user",
      user: serializeUser(principal.user),
      auth: {
        method: principal.method
      }
    };
  });

  app.post<{ Body: PersonalTokenBody }>("/api/v1/auth/tokens", async (request, reply) => {
    const principal = authenticateUser(request, store);
    if (principal === undefined) {
      return reply.code(401).send({ message: "Authentication required", redacted: true });
    }
    const validation = validatePersonalTokenBody(request.body);
    if (validation !== undefined) {
      return reply.code(400).send({ message: validation, redacted: true });
    }

    const now = new Date().toISOString();
    const prefix = `tu_live_${randomBytes(4).toString("hex")}`;
    const secret = `${prefix}_${randomBytes(24).toString("base64url")}`;
    const token: PersonalApiTokenRecord = {
      createdAt: now,
      fingerprint: fingerprint(secret),
      id: randomUUID(),
      name: request.body.name.trim(),
      prefix,
      scopes: request.body.scopes ?? ["profile:read"],
      secretHash: hashOpaqueSecret(secret),
      status: "active",
      updatedAt: now,
      userId: principal.user.id,
      ...(request.body.expiresAt !== undefined ? { expiresAt: request.body.expiresAt } : {})
    };
    store.personalApiTokens.set(token.id, token);

    return reply.code(201).send({
      kind: "personal-api-token-created",
      secret,
      secretShownOnce: true,
      token: serializePersonalToken(token)
    });
  });

  app.get("/api/v1/auth/tokens", async (request, reply) => {
    const principal = authenticateUser(request, store);
    if (principal === undefined) {
      return reply.code(401).send({ message: "Authentication required", redacted: true });
    }

    return {
      kind: "personal-api-token-list",
      items: Array.from(store.personalApiTokens.values())
        .filter((token) => token.userId === principal.user.id)
        .map(serializePersonalToken)
    };
  });

  app.delete<{ Params: { tokenId: string } }>(
    "/api/v1/auth/tokens/:tokenId",
    async (request, reply) => {
      const principal = authenticateUser(request, store);
      if (principal === undefined) {
        return reply.code(401).send({ message: "Authentication required", redacted: true });
      }
      const token = store.personalApiTokens.get(request.params.tokenId);
      if (token === undefined || token.userId !== principal.user.id) {
        return reply.code(404).send({ message: "Token not found", redacted: true });
      }

      const now = new Date().toISOString();
      token.status = "revoked";
      token.revokedAt = now;
      token.updatedAt = now;
      store.personalApiTokens.set(token.id, token);
      return { kind: "personal-api-token-revoked", token: serializePersonalToken(token) };
    }
  );
}

export function authenticateUser(
  request: FastifyRequest,
  store: AppStore
): UserPrincipal | undefined {
  const requestPrincipal = getRequestUserPrincipal(request);
  if (requestPrincipal !== undefined) {
    return requestPrincipal;
  }
  const secret = parseBearer(request.headers.authorization);
  if (secret === undefined) {
    return undefined;
  }
  const tokenHash = hashOpaqueSecret(secret);
  const now = new Date().toISOString();

  const session = Array.from(store.userSessions.values()).find(
    (item) => item.tokenHash === tokenHash
  );
  if (session !== undefined && session.expiresAt > now) {
    const user = store.users.get(session.userId);
    if (user?.status === "active") {
      session.lastUsedAt = now;
      store.userSessions.set(session.id, session);
      const principal = { method: "session" as const, user };
      setRequestUserPrincipal(request, principal);
      return principal;
    }
  }

  const personalToken = Array.from(store.personalApiTokens.values()).find(
    (item) => item.secretHash === tokenHash
  );
  if (
    personalToken !== undefined &&
    personalToken.status === "active" &&
    (personalToken.expiresAt === undefined || personalToken.expiresAt > now)
  ) {
    const user = store.users.get(personalToken.userId);
    if (user?.status === "active" && personalToken.scopes.includes("profile:read")) {
      personalToken.lastUsedAt = now;
      personalToken.updatedAt = now;
      store.personalApiTokens.set(personalToken.id, personalToken);
      const principal = {
        method: "personal-token" as const,
        scopes: personalToken.scopes,
        user
      };
      setRequestUserPrincipal(request, principal);
      return principal;
    }
  }

  return undefined;
}

function authResponse(user: UserRecord, secret: string, session: UserSessionRecord) {
  return {
    kind: "auth-session",
    session: {
      expiresAt: session.expiresAt,
      id: session.id,
      token: secret
    },
    user: serializeUser(user)
  };
}

function createSession(store: AppStore, user: UserRecord) {
  const secret = `ts_session_${randomBytes(32).toString("base64url")}`;
  const now = new Date().toISOString();
  const record: UserSessionRecord = {
    createdAt: now,
    expiresAt: new Date(Date.now() + sessionTtlMs).toISOString(),
    id: randomUUID(),
    tokenHash: hashOpaqueSecret(secret),
    userId: user.id
  };
  store.userSessions.set(record.id, record);
  return { record, secret };
}

function serializeUser(user: UserRecord) {
  return {
    createdAt: user.createdAt,
    email: user.email,
    id: user.id,
    name: user.name,
    role: user.role,
    status: user.status
  };
}

function serializePersonalToken(token: PersonalApiTokenRecord) {
  return {
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    fingerprint: token.fingerprint,
    id: token.id,
    lastUsedAt: token.lastUsedAt,
    name: token.name,
    prefix: token.prefix,
    revokedAt: token.revokedAt,
    scopes: token.scopes,
    status: token.status,
    updatedAt: token.updatedAt
  };
}

function validateRegisterBody(body: RegisterBody): string | undefined {
  if (!isEmail(body.email)) {
    return "email must be valid";
  }
  if (body.name.trim().length < 2) {
    return "name must contain at least 2 characters";
  }
  if (body.password.length < 8) {
    return "password must contain at least 8 characters";
  }
  return undefined;
}

function validatePersonalTokenBody(body: PersonalTokenBody): string | undefined {
  if (body.name.trim().length === 0) {
    return "name is required";
  }
  if (body.expiresAt !== undefined && Number.isNaN(Date.parse(body.expiresAt))) {
    return "expiresAt must be an ISO date time";
  }
  if (
    body.scopes !== undefined &&
    !body.scopes.every((scope) => personalTokenScopes.includes(scope as never))
  ) {
    return "scopes must contain known personal token scopes";
  }
  return undefined;
}

function findUserByEmail(store: AppStore, email: string) {
  return Array.from(store.users.values()).find((user) => user.email === email);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseBearer(value: FastifyRequest["headers"]["authorization"]): string | undefined {
  if (Array.isArray(value)) {
    return parseBearer(value[0]);
  }
  const match = typeof value === "string" ? /^Bearer\s+(.+)$/i.exec(value.trim()) : undefined;
  return match?.[1];
}

function fingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

function registrationEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" || process.env.TESTHISTORY_ALLOW_REGISTRATION === "true"
  );
}
