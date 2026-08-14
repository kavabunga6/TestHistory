import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultBaseUrl = "http://127.0.0.1:18080";
const defaultAdminEmail = "admin";
const defaultAdminPassword = "admin";
const pageSize = 500;

export async function seedLocalTestCaseMetadata(options = {}) {
  const baseUrl = (options.baseUrl ?? process.env.TESTHISTORY_API_URL ?? defaultBaseUrl).replace(
    /\/$/,
    ""
  );
  const token =
    options.token ??
    (await login(
      baseUrl,
      options.email ?? process.env.TESTHISTORY_LOCAL_ADMIN_EMAIL ?? defaultAdminEmail,
      options.password ?? process.env.TESTHISTORY_LOCAL_ADMIN_PASSWORD ?? defaultAdminPassword
    ));
  const authHeaders = { authorization: `Bearer ${token}` };
  const projects = await requestJson(baseUrl, "/api/v1/projects", { headers: authHeaders });
  const requestedProjectIds = new Set(options.projectIds ?? []);
  const selectedProjects = projects.filter(
    (project) => requestedProjectIds.size === 0 || requestedProjectIds.has(project.id)
  );
  let updatedTestCases = 0;

  for (const project of selectedProjects) {
    const payload = await requestJson(
      baseUrl,
      `/api/v1/test-cases?projectId=${encodeURIComponent(project.id)}&limit=${pageSize}`,
      { headers: authHeaders }
    );
    const testCases = [...(payload.items ?? [])].sort((left, right) =>
      String(left.id).localeCompare(String(right.id))
    );

    for (const testCase of testCases) {
      const patch = buildDemoTestCaseMetadata(testCase);
      await requestJson(baseUrl, `/api/v1/test-cases/${encodeURIComponent(testCase.id)}`, {
        body: JSON.stringify(patch),
        headers: { ...authHeaders, "content-type": "application/json" },
        method: "PATCH"
      });
      updatedTestCases += 1;
    }
  }

  const summary = {
    kind: "local-test-case-metadata-seed",
    projects: selectedProjects.length,
    updatedTestCases
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

export function buildDemoTestCaseMetadata(testCase) {
  const existing = testCase.testCase ?? {};
  const identity = String(testCase.id ?? testCase.name ?? "test-case");
  const readableName = String(testCase.name ?? existing.name ?? identity);
  const area = inferArea(`${identity} ${readableName}`);
  const number = 100 + (stableHash(identity) % 900);
  const encodedIdentity = encodeURIComponent(identity);

  return {
    customFields: {
      Компонент: area,
      Контур: "E2E",
      Платформа: "Android",
      ...(existing.customFields ?? {})
    },
    issues: uniqueStrings([...(existing.issues ?? []), `ANDROID-${number}`]),
    links: uniqueLinks([
      ...(existing.links ?? []),
      {
        name: "Спецификация теста",
        type: "tms",
        url: `https://example.invalid/testhistory/specs/${encodedIdentity}`
      },
      {
        name: "Исходный код автотеста",
        type: "source",
        url: `https://example.invalid/testhistory/source/${encodedIdentity}`
      }
    ]),
    testKeys: uniqueStrings([...(existing.testKeys ?? []), `TH-ANDROID-${number}`])
  };
}

function inferArea(value) {
  const normalized = value.toLowerCase();
  if (/login|username|password|validation|auth/.test(normalized)) return "Авторизация";
  if (/checkout|cart/.test(normalized)) return "Корзина";
  if (/evidence|screenshot|video|logcat|attachment/.test(normalized)) return "Диагностика";
  if (/crash|runtime|broken/.test(normalized)) return "Стабильность";
  return "Мобильное приложение";
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== ""))];
}

function uniqueLinks(links) {
  const byUrl = new Map();
  for (const link of links) {
    if (typeof link?.url === "string" && link.url.trim() !== "") {
      byUrl.set(link.url, link);
    }
  }
  return [...byUrl.values()];
}

async function login(baseUrl, email, password) {
  const response = await requestJson(baseUrl, "/api/v1/auth/login", {
    body: JSON.stringify({ email, password }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  return response.session.token;
}

async function requestJson(baseUrl, url, init = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...init,
    signal: AbortSignal.timeout(10_000)
  });
  const text = await response.text();
  const payload = text === "" ? undefined : JSON.parse(text);
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${url} returned ${response.status}: ${text.slice(0, 500)}`
    );
  }
  return payload;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  await seedLocalTestCaseMetadata();
}
