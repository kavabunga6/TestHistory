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

import { env, fakeApi, fixture, hash, png, rejected } from "./testhistory-cli-fixtures.mjs";

test("explicit incomplete mode preserves running unknown and omitted timing without silently dropping files", async (t) => {
  const f = fixture(t);
  const result = f.results[0];
  result.status = "unknown";
  result.stage = "running";
  delete result.stop;
  result.steps = [];
  result.attachments = [
    { name: "Last checkpoint", source: "images/native-0.png", type: "image/png" }
  ];
  writeFileSync(join(f.root, "native-0-result.json"), JSON.stringify(result));
  await rejected(
    upload(f.options, { env, fetchImpl: fakeApi().fetchImpl }),
    "NONPOSITIVE_RESULT_TIMING"
  );
  const api = fakeApi();
  const receipt = await runCli(
    [
      "upload",
      "--results-dir",
      f.root,
      "--launch-name",
      "Interrupted native run",
      "--expected-results",
      "1",
      "--planned-results",
      "50",
      "--allow-incomplete"
    ],
    { env, fetchImpl: api.fetchImpl }
  );
  assert.equal(receipt.incompleteResults, 1);
  assert.equal(receipt.unknownTimingResults, 1);
  assert.equal(receipt.verifiedTiming, false);
  assert.equal(receipt.allTimingPositive, false);
  assert.equal(receipt.testRunPassed, false);
  assert.equal(receipt.plannedResults, 50);
  assert.equal(api.results.get("native-0").status, "unknown");
  assert.ok(!("stop" in api.results.get("native-0")));
  assert.ok(api.closed);
});
test("ignored skipped cases retain unknown timing only in explicit incomplete mode", async (t) => {
  const f = fixture(t, { status: "skipped" });
  const result = f.results[0];
  delete result.start;
  delete result.stop;
  result.steps = [];
  writeFileSync(join(f.root, "native-0-result.json"), JSON.stringify(result));
  const api = fakeApi();
  const receipt = await upload(
    { ...f.options, minScreenshots: 0, allowIncomplete: true },
    { env, fetchImpl: api.fetchImpl }
  );
  assert.equal(receipt.unknownTimingResults, 1);
  assert.equal(receipt.incompleteResults, 0);
  assert.equal(receipt.testStatusCounts.skipped, 1);
  assert.equal(receipt.testRunPassed, false);
  assert.ok(!("start" in api.results.get("native-0")));
  assert.ok(!("stop" in api.results.get("native-0")));
});
test("submillisecond real monotonic timing stays zero milliseconds with the exact nanosecond parameter", async (t) => {
  const f = fixture(t);
  const result = f.results[0];
  result.stop = result.start;
  result.parameters = [{ name: "elapsedRealtimeNanos", value: "999999" }];
  writeFileSync(join(f.root, "native-0-result.json"), JSON.stringify(result));
  const api = fakeApi();
  const receipt = await upload(f.options, { env, fetchImpl: api.fetchImpl });
  assert.equal(receipt.allTimingPositive, true);
  assert.equal(receipt.testRunPassed, true);
  assert.equal(api.results.get("native-0").stop - result.start, 0);
  assert.equal(api.results.get("native-0").parameters[0].value, "999999");
  result.parameters[0].value = "1000000";
  writeFileSync(join(f.root, "native-0-result.json"), JSON.stringify(result));
  assert.throws(() => loadCatalog(f.root, { expectedResults: 1 }), /INVALID_RESULT_TIMING/);
});
test("planned subset and genuine measured zero cannot claim a complete successful test run", async (t) => {
  const f = fixture(t);
  assert.equal(
    (await upload({ ...f.options, plannedResults: 50 }, { env, fetchImpl: fakeApi().fetchImpl }))
      .testRunPassed,
    false
  );
  const result = f.results[0];
  result.stop = result.start;
  result.parameters = [{ name: "elapsedRealtimeNanos", value: "0" }];
  writeFileSync(join(f.root, "native-0-result.json"), JSON.stringify(result));
  await rejected(
    upload(f.options, { env, fetchImpl: fakeApi().fetchImpl }),
    "NONPOSITIVE_RESULT_TIMING"
  );
  const receipt = await upload(
    { ...f.options, allowIncomplete: true },
    { env, fetchImpl: fakeApi().fetchImpl }
  );
  assert.equal(receipt.nonpositiveTimingResults, 1);
  assert.equal(receipt.allTimingKnown, true);
  assert.equal(receipt.allTimingPositive, false);
  assert.equal(receipt.testRunPassed, false);
});

// A normal repository build enables this case; an external compiled API can be supplied for an isolated worktree.
const apiModule = process.env.TESTHISTORY_TEST_API_MODULE ?? resolve("apps/api/dist/app.js");
if (existsSync(apiModule))
  test("real production API with scoped token accepts CLI upload, keeps file persistence and verifies binary evidence", async (t) => {
    const f = fixture(t, { count: 2 }),
      previous = {
        NODE_ENV: process.env.NODE_ENV,
        TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL: process.env.TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL,
        TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD: process.env.TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD
      };
    process.env.NODE_ENV = "production";
    process.env.TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL = "cli-test@example.invalid";
    process.env.TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD = "fixture-password-minimum-length";
    const { createApiApp } = await import(pathToFileURL(apiModule).href);
    const { createFileBackedAppStore } = await import(
      pathToFileURL(join(dirname(apiModule), "storeFilePersistence.js")).href
    );
    f.results[0].attachments = [f.results[0].steps[0].attachments[0]];
    f.results[0].parameters = [{ name: "elapsedRealtimeNanos", value: "75000000" }];
    writeFileSync(join(f.root, "native-0-result.json"), JSON.stringify(f.results[0]));
    const storePath = join(f.root, "store.json"),
      app = await createApiApp(createFileBackedAppStore(storePath));
    app.log.level = "silent";
    try {
      const call = async (method, url, payload, token) => {
        const response = await app.inject({
          method,
          url,
          ...(payload ? { payload } : {}),
          headers: token ? { authorization: `Bearer ${token}` } : {}
        });
        assert.ok(response.statusCode >= 200 && response.statusCode < 300);
        return response.json();
      };
      const session = await call("POST", "/api/v1/auth/login", {
        email: process.env.TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL,
        password: process.env.TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD
      });
      const project = await call(
        "POST",
        "/api/v1/projects",
        { key: "CLI-FIXTURE", name: "CLI contract fixture" },
        session.session.token
      );
      const token = await call(
        "POST",
        `/api/v1/projects/${project.id}/settings/access/tokens`,
        {
          name: "Fixture CI",
          ownerSubject: "ci-fixture",
          scopes: [
            "launches:write",
            "uploads:write",
            "launches:read",
            "results:read",
            "artifacts:read"
          ]
        },
        session.session.token
      );
      const actualEnv = {
        ...env,
        TESTHISTORY_PROJECT_ID: project.id,
        TESTHISTORY_TOKEN: token.secret
      };
      const fetchImpl = async (url, options) => {
        const response = await app.inject({
          method: options.method,
          url: new URL(url).pathname + new URL(url).search,
          headers: options.headers,
          ...(options.body ? { payload: options.body } : {})
        });
        const bytes =
          response.headers["content-encoding"] === "gzip"
            ? gunzipSync(response.rawPayload)
            : response.rawPayload;
        return new Response(bytes, { status: response.statusCode, headers: response.headers });
      };
      const receipt = await upload(f.options, { env: actualEnv, fetchImpl });
      assert.equal(receipt.verifiedResults, 2);
      assert.equal(receipt.verifiedAttachments, 2);
      assert.equal(receipt.testRunPassed, true);
      assert.equal(
        (await runCli(["check"], { env: actualEnv, fetchImpl })).persistence.driver,
        "file"
      );
      const unfinished = f.results[0];
      unfinished.status = "unknown";
      unfinished.stage = "running";
      delete unfinished.stop;
      delete unfinished.parameters;
      unfinished.steps = [];
      unfinished.attachments = [
        { name: "Last checkpoint", source: "images/native-0.png", type: "image/png" }
      ];
      const ignored = f.results[1];
      ignored.status = "skipped";
      ignored.stage = "finished";
      delete ignored.start;
      delete ignored.stop;
      ignored.steps = [];
      ignored.attachments = [];
      for (const result of f.results)
        writeFileSync(join(f.root, result.uuid + "-result.json"), JSON.stringify(result));
      const interruptedReceipt = await upload(
        { ...f.options, allowIncomplete: true, plannedResults: 50 },
        { env: actualEnv, fetchImpl }
      );
      assert.equal(interruptedReceipt.incompleteResults, 1);
      assert.equal(interruptedReceipt.unknownTimingResults, 2);
      assert.equal(interruptedReceipt.testStatusCounts.unknown, 1);
      assert.equal(interruptedReceipt.testStatusCounts.skipped, 1);
      assert.equal(interruptedReceipt.testRunPassed, false);
      assert.equal(interruptedReceipt.closed, true);
      await app.close();
      const reopened = await createApiApp(createFileBackedAppStore(storePath));
      reopened.log.level = "silent";
      try {
        const response = await reopened.inject({
          method: "GET",
          url: `/api/v1/launches/${receipt.launchId}`,
          headers: { authorization: `Bearer ${token.secret}` }
        });
        assert.equal(response.statusCode, 200);
        assert.equal(response.json().status, "closed");
        assert.equal(response.json().resultsPage.total, 2);
      } finally {
        await reopened.close();
      }
    } finally {
      await app.close();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
