import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync, gunzipSync } from "node:zlib";
import { test } from "node:test";
import {
  CliError,
  createClient,
  loadCatalog,
  runCli,
  safeRelativePath,
  upload,
  validatePng
} from "./testhistory-cli.mjs";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const env = {
  TESTHISTORY_BASE_URL: "https://testhistory.example.invalid",
  TESTHISTORY_WEB_URL: "https://reports.example.invalid",
  TESTHISTORY_PROJECT_ID: "project-1",
  TESTHISTORY_TOKEN: "fixture-project-token"
};
export function png() {
  const chunk = (kind, bytes) => {
    const data = Buffer.concat([Buffer.from(kind), bytes]);
    let crc = 0xffffffff;
    for (const value of data) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    const length = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}
export function fixture(t, { count = 1, status = "passed", steps = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "testhistory-cli-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "images"));
  const results = [];
  for (let index = 0; index < count; index++) {
    const attachment = {
      name: "Результат",
      source: `images/native-${index}.png`,
      type: "image/png"
    };
    const result = {
      uuid: `native-${index}`,
      name: `Смена ${index}`,
      historyId: `history-${index}`,
      testCaseId: `case-${index}`,
      fullName: `example.ScheduleTest.case${index}`,
      status,
      stage: "finished",
      start: 1000 + index * 100,
      stop: 1075 + index * 100,
      description: "Проверка сохранённой смены",
      labels: [
        { name: "suite", value: "Schedule" },
        { name: "owner", value: "Mobile QA" },
        { name: "feature", value: "Shifts" }
      ],
      links: [{ name: "source", url: "https://example.invalid/test", type: "source" }],
      attachments: steps ? [] : [attachment],
      steps: steps
        ? [
            {
              name: "Создать смену",
              status,
              start: 1000 + index * 100,
              stop: 1075 + index * 100,
              attachments: [attachment],
              steps: []
            }
          ]
        : []
    };
    if (status === "failed" || status === "broken")
      result.statusDetails = {
        message: "Expected state missing",
        trace: "ScheduleTest fixture trace"
      };
    writeFileSync(join(root, `${result.uuid}-result.json`), JSON.stringify(result));
    writeFileSync(join(root, attachment.source), png());
    results.push(result);
  }
  return {
    root,
    results,
    options: {
      resultsDir: root,
      launchName: "Schedule UI",
      expectedResults: count,
      minScreenshots: 1
    }
  };
}
export const allAttachments = (result) => [
  ...(result.attachments ?? []),
  ...(result.steps ?? []).flatMap(allAttachments)
];
export function fakeApi({
  mutate = () => {},
  projectId = env.TESTHISTORY_PROJECT_ID,
  expectToken = env.TESTHISTORY_TOKEN
} = {}) {
  const calls = [],
    results = new Map(),
    artifacts = new Map();
  let closed = false;
  function response(body, status = 200, headers = {}) {
    return new Response(Buffer.isBuffer(body) ? body : JSON.stringify(body), { status, headers });
  }
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname,
      query = new URL(url).searchParams;
    calls.push({ url, options, path });
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    assert.deepEqual(
      Object.keys(options.headers).sort(),
      path === "/health" ? [] : options.body ? ["authorization", "content-type"] : ["authorization"]
    );
    if (path !== "/health") assert.equal(options.headers.authorization, `Bearer ${expectToken}`);
    const payload = options.body ? JSON.parse(options.body) : null;
    let body;
    if (path === "/health")
      body = {
        status: "ok",
        service: "testhistory-api",
        persistence: { driver: "file", writable: true, migrated: true }
      };
    else if (path === `/api/v1/projects/${projectId}/launches`) {
      assert.equal(options.method, "POST");
      body = { id: "launch-1", projectId, status: "open", counters: { passed: 0 } };
    } else if (path === "/api/v1/launches/launch-1/results/json") {
      assert.equal(options.method, "POST");
      assert.ok(Buffer.byteLength(options.body) <= 8 * 1024 * 1024);
      let imported = 0;
      for (const file of payload.files) {
        assert.equal(file.contentEncoding, "base64");
        const bytes = Buffer.from(file.content, "base64");
        const id = hash(Buffer.from(file.path));
        artifacts.set(file.path, {
          id,
          path: file.path,
          bytes,
          sha256: hash(bytes),
          launchId: "launch-1",
          projectId,
          originalBytes: bytes.length,
          contentType: file.path.endsWith(".png") ? "image/png" : "application/json"
        });
        if (file.path.endsWith("-result.json")) {
          const result = JSON.parse(bytes);
          if (!results.has(result.uuid)) {
            results.set(result.uuid, result);
            imported++;
          }
          for (const attachment of allAttachments(result))
            assert.ok(
              payload.files.some((file) => file.path === attachment.source),
              "referenced attachment belongs to the same batch"
            );
        }
      }
      body = {
        job: { status: "completed", errors: [], importedResults: imported, duplicateResults: 0 },
        results: [...results.values()].map((result) => ({ resultId: result.uuid }))
      };
    } else if (path === "/api/v1/launches/launch-1/results") {
      const offset = Number(query.get("offset")),
        items = [...results.values()].slice(offset, offset + 100).map((result) => ({
          ...result,
          ...(typeof result.start === "number" && typeof result.stop === "number"
            ? { durationMs: result.stop - result.start }
            : {})
        }));
      body = {
        kind: "launch-result-list",
        launchId: "launch-1",
        projectId,
        items,
        page: { offset, total: results.size, returned: items.length }
      };
    } else if (path.startsWith("/api/v1/launches/launch-1/results/")) {
      const result = results.get(path.split("/").at(-1));
      assert.ok(result);
      const labels = {};
      for (const label of result.labels) (labels[label.name] ??= []).push(label.value);
      body = {
        ...result,
        launchId: "launch-1",
        projectId,
        ...(typeof result.start === "number" && typeof result.stop === "number"
          ? { durationMs: result.stop - result.start }
          : {}),
        raw: result,
        labels,
        attachments: allAttachments(result),
        artifacts: allAttachments(result).map((attachment) => artifacts.get(attachment.source))
      };
    } else if (path.startsWith("/api/v1/artifacts/")) {
      const artifact = [...artifacts.values()].find((item) => item.id === path.split("/")[4]);
      assert.ok(artifact);
      body = artifact.bytes;
    } else if (path === "/api/v1/launches/launch-1/close") {
      assert.equal(options.method, "POST");
      closed = true;
      body = {
        id: "launch-1",
        projectId,
        status: "closed",
        errors: [],
        closePipeline: { status: "closed" }
      };
    } else if (path === "/api/v1/launches/launch-1") {
      assert.equal(options.method, "GET");
      body = {
        id: "launch-1",
        projectId,
        status: closed ? "closed" : "open",
        resultsPage: { total: results.size }
      };
    } else assert.fail("Unexpected API path");
    const changed = mutate({ path, body, payload, options });
    return changed ?? response(body);
  };
  return {
    fetchImpl,
    calls,
    results,
    artifacts,
    get closed() {
      return closed;
    }
  };
}
export async function rejected(operation, code) {
  await assert.rejects(operation, (error) => error instanceof CliError && error.code === code);
}
