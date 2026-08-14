import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../app.js";
import { createAppStore } from "../store.js";

const apps: Awaited<ReturnType<typeof createApiApp>>[] = [];

describe("enterprise access routes", () => {
  const originalAllowlist = process.env.TESTHISTORY_OUTBOUND_HOST_ALLOWLIST;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (originalAllowlist === undefined) delete process.env.TESTHISTORY_OUTBOUND_HOST_ALLOWLIST;
    else process.env.TESTHISTORY_OUTBOUND_HOST_ALLOWLIST = originalAllowlist;
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("configures an OIDC provider by env reference and validates bounded discovery", async () => {
    process.env.TESTHISTORY_OUTBOUND_HOST_ALLOWLIST = "idp.example";
    const { app, projectId, store } = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              issuer: "https://idp.example/tenant",
              authorization_endpoint: "https://idp.example/tenant/authorize",
              token_endpoint: "https://idp.example/tenant/token",
              jwks_uri: "https://idp.example/tenant/keys"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
      )
    );

    const insecure = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/enterprise-access/oidc`,
      payload: {
        name: "Unsafe",
        issuer: "http://idp.example",
        clientId: "client",
        clientSecretEnvVar: "OIDC_CLIENT_SECRET"
      }
    });
    expect(insecure.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/enterprise-access/oidc`,
      payload: {
        name: "Corporate SSO",
        issuer: "https://idp.example/tenant/",
        clientId: "testhistory",
        clientSecretEnvVar: "TESTHISTORY_OIDC_CLIENT_SECRET",
        defaultRole: "viewer"
      }
    });
    expect(created.statusCode).toBe(201);
    const provider = created.json<{ provider: { id: string } }>().provider;

    const discovery = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/enterprise-access/oidc/${provider.id}/discover`
    });
    expect(discovery.statusCode).toBe(200);
    expect(discovery.json()).toMatchObject({
      kind: "oidc-discovery",
      discovery: {
        issuer: "https://idp.example/tenant",
        jwksUri: "https://idp.example/tenant/keys"
      }
    });
    expect(store.securityAuditEvents.map((event) => event.type)).toContain(
      "auth.oidc-provider.created"
    );
  });

  it("rotates a one-time SCIM token and provisions, updates, lists and disables users", async () => {
    const { app, projectId, store } = await fixture();
    const rotated = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/enterprise-access/scim/token`,
      payload: { defaultRole: "editor" }
    });
    expect(rotated.statusCode).toBe(201);
    const receipt = rotated.json<{ secret: string; endpoint: string }>();
    expect(receipt.secret).toMatch(/^thscim_/);

    const enterpriseRead = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/enterprise-access`
    });
    expect(enterpriseRead.body).not.toContain(receipt.secret);
    expect(enterpriseRead.body).not.toContain("tokenHash");
    expect(enterpriseRead.json()).toMatchObject({
      scimProvisioning: { enabled: true, defaultRole: "editor" }
    });

    const denied = await app.inject({
      method: "GET",
      url: `${receipt.endpoint}/Users`,
      headers: { authorization: "Bearer wrong" }
    });
    expect(denied.statusCode).toBe(401);
    expect(denied.headers["content-type"]).toContain("application/scim+json");

    const created = await app.inject({
      method: "POST",
      url: `${receipt.endpoint}/Users`,
      headers: { authorization: `Bearer ${receipt.secret}` },
      payload: {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        userName: "qa@example.test",
        displayName: "QA User",
        active: true,
        roles: [{ value: "maintainer" }]
      }
    });
    expect(created.statusCode).toBe(201);
    const user = created.json<{ id: string }>();
    expect(created.json()).toMatchObject({
      userName: "qa@example.test",
      active: true,
      roles: [{ value: "maintainer" }]
    });

    const patched = await app.inject({
      method: "PATCH",
      url: `${receipt.endpoint}/Users/${user.id}`,
      headers: { authorization: `Bearer ${receipt.secret}` },
      payload: { Operations: [{ op: "Replace", path: "active", value: false }] }
    });
    expect(patched.json()).toMatchObject({ active: false });

    const listed = await app.inject({
      method: "GET",
      url: `${receipt.endpoint}/Users?filter=userName%20eq%20%22qa%40example.test%22`,
      headers: { authorization: `Bearer ${receipt.secret}` }
    });
    expect(listed.json()).toMatchObject({
      totalResults: 1,
      Resources: [{ id: user.id, active: false }]
    });
    expect(store.securityAuditEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "auth.scim-token.rotated",
        "auth.scim-user.provisioned",
        "auth.scim-user.disabled"
      ])
    );
  });
});

async function fixture() {
  const store = createAppStore();
  const projectId = "project-enterprise";
  store.projects.set(projectId, {
    id: projectId,
    key: "enterprise",
    name: "Enterprise",
    createdAt: "2026-08-09T00:00:00.000Z"
  });
  const app = await createApiApp(store);
  apps.push(app);
  return { app, projectId, store };
}
