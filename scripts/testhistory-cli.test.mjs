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

import {
  allAttachments,
  env,
  fakeApi,
  fixture,
  hash,
  png,
  rejected
} from "./testhistory-cli-fixtures.mjs";

test("upload uses production bearer routes and verifies native metadata, positive timing and exact PNG bytes before close", async (t) => {
  const f = fixture(t, { count: 3 }),
    api = fakeApi();
  const receipt = await upload(
    {
      ...f.options,
      output: join(f.root, "receipt.json"),
      branch: "ci",
      commit: "abc123",
      buildNumber: "42"
    },
    { env, fetchImpl: api.fetchImpl }
  );
  assert.equal(receipt.status, "UPLOADED_AND_VERIFIED");
  assert.equal(receipt.verifiedResults, 3);
  assert.equal(receipt.verifiedAttachments, 3);
  assert.equal(receipt.screenshotCount, 3);
  assert.equal(receipt.testRunPassed, true);
  assert.equal(receipt.launchUrl, "https://reports.example.invalid/#launch/launch-1");
  assert.ok(api.closed);
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, "receipt.json"))), receipt);
  assert.ok(!JSON.stringify(receipt).includes(env.TESTHISTORY_TOKEN));
  const close = api.calls.findIndex((call) => call.path.endsWith("/close"));
  assert.ok(
    api.calls.slice(0, close).filter((call) => call.path.startsWith("/api/v1/artifacts/"))
      .length === 3
  );
  assert.ok(
    api.calls.every(
      (call) =>
        !call.path.endsWith("/process") &&
        !call.path.includes("/auth/") &&
        !call.path.includes("/settings/")
    )
  );
});
test("failed and broken assertions retain their statuses and traces while publication succeeds", async (t) => {
  for (const status of ["failed", "broken"]) {
    const f = fixture(t, { status }),
      api = fakeApi();
    const receipt = await upload(f.options, { env, fetchImpl: api.fetchImpl });
    assert.equal(receipt.testRunPassed, false);
    assert.equal(receipt.testStatusCounts[status], 1);
    assert.equal(api.results.get("native-0").statusDetails.trace, f.results[0].statusDetails.trace);
    assert.ok(api.closed);
  }
});
test("pagination verifies all 101 native UUIDs rather than only the first response page", async (t) => {
  const f = fixture(t, { count: 101 }),
    api = fakeApi();
  const receipt = await upload(f.options, { env, fetchImpl: api.fetchImpl });
  assert.equal(receipt.verifiedResults, 101);
  assert.equal(
    api.calls.filter((call) => call.path.endsWith("/results") && call.options.method === "GET")
      .length,
    2
  );
});
test("bounded batches keep every result with nested evidence and do not rewrite UUID/history/timing", (t) => {
  const f = fixture(t, { count: 4 });
  const catalog = loadCatalog(f.root, { expectedResults: 4, batchBytes: 2048 });
  assert.ok(catalog.batches.length > 1);
  for (const files of catalog.batches) {
    assert.ok(Buffer.byteLength(JSON.stringify({ files })) <= 2048);
    for (const file of files.filter((file) => file.path.endsWith("-result.json"))) {
      const result = JSON.parse(Buffer.from(file.content, "base64"));
      assert.deepEqual(
        result,
        f.results.find((item) => item.uuid === result.uuid)
      );
      for (const attachment of allAttachments(result))
        assert.ok(files.some((item) => item.path === attachment.source));
    }
  }
});
test("missing, traversal, encoded, Windows and absolute references fail before any network mutation", async (t) => {
  for (const source of [
    "missing.png",
    "../outside.png",
    "/images/a.png",
    "images/../native-0.png",
    "images\\native-0.png",
    "images%2Fnative-0.png",
    "C:/outside.png"
  ]) {
    const f = fixture(t);
    f.results[0].steps[0].attachments[0].source = source;
    writeFileSync(join(f.root, "native-0-result.json"), JSON.stringify(f.results[0]));
    let called = 0;
    await assert.rejects(
      upload(f.options, {
        env,
        fetchImpl: async () => {
          called++;
        }
      })
    );
    assert.equal(called, 0);
  }
});
test("artifact source byte limits reject unsupported UTF-8 paths before creating a launch", async (t) => {
  assert.equal(safeRelativePath(`${"я".repeat(125)}a.png`), `${"я".repeat(125)}a.png`);
  for (const source of [
    `${"я".repeat(126)}.png`,
    `${"a".repeat(252)}.png`,
    `${"a".repeat(255)}/${"b".repeat(255)}/c`
  ]) {
    const f = fixture(t);
    f.results[0].steps[0].attachments[0].source = source;
    writeFileSync(join(f.root, "native-0-result.json"), JSON.stringify(f.results[0]));
    let called = 0;
    await rejected(
      upload(f.options, {
        env,
        fetchImpl: async () => {
          called++;
        }
      }),
      "UNSAFE_ARTIFACT_PATH"
    );
    assert.equal(called, 0);
  }
});
test("input identity, statuses, labels, screenshot count and nonpositive timing are rejected without a launch", async (t) => {
  for (const change of [
    (result) => (result.uuid = "../bad"),
    (result) => (result.status = "green"),
    (result) => (result.historyId = ""),
    (result) => (result.fullName = ""),
    (result) => (result.labels = []),
    (result) => (result.stop = result.start)
  ]) {
    const f = fixture(t);
    change(f.results[0]);
    writeFileSync(join(f.root, "native-0-result.json"), JSON.stringify(f.results[0]));
    let called = 0;
    await assert.rejects(
      upload(f.options, {
        env,
        fetchImpl: async () => {
          called++;
        }
      })
    );
    assert.equal(called, 0);
  }
  const f = fixture(t);
  assert.throws(() => loadCatalog(f.root, { expectedResults: 2 }), /RESULT_COUNT_MISMATCH/);
  assert.throws(
    () => loadCatalog(f.root, { expectedResults: 1, minScreenshots: 2 }),
    /SCREENSHOT_COUNT_MISMATCH/
  );
});
test("PNG CRC, truncation and empty evidence cannot be published", (t) => {
  const good = png();
  validatePng(good);
  const corrupt = Buffer.from(good);
  corrupt[45] ^= 1;
  assert.throws(() => validatePng(corrupt), /INVALID_PNG/);
  assert.throws(() => validatePng(good.subarray(0, -1)), /INVALID_PNG/);
  const f = fixture(t);
  writeFileSync(join(f.root, "images/native-0.png"), Buffer.alloc(0));
  assert.throws(() => loadCatalog(f.root, { expectedResults: 1 }), /MISSING_ATTACHMENT/);
});
test("oversized evidence groups fail preflight and keep the source files intact", async (t) => {
  const f = fixture(t, { steps: false });
  f.results[0].attachments = [{ name: "Log", source: "large.log", type: "text/plain" }];
  writeFileSync(join(f.root, "native-0-result.json"), JSON.stringify(f.results[0]));
  const bytes = Buffer.alloc(6 * 1024 * 1024, 65);
  writeFileSync(join(f.root, "large.log"), bytes);
  let called = 0;
  await rejected(
    upload(
      { ...f.options, minScreenshots: 0 },
      {
        env,
        fetchImpl: async () => {
          called++;
        }
      }
    ),
    "RESULT_GROUP_TOO_LARGE"
  );
  assert.equal(called, 0);
  assert.equal(hash(readFileSync(join(f.root, "large.log"))), hash(bytes));
});
test("symbolic-link input and existing receipt files are rejected before a request", async (t) => {
  const f = fixture(t),
    target = join(f.root, "real"),
    link = join(f.root, "linked");
  mkdirSync(target);
  symlinkSync(target, link, "junction");
  assert.throws(() => loadCatalog(f.root, { expectedResults: 1 }), /UNSAFE_INPUT_FILE/);
  rmSync(link);
  const receipt = join(f.root, "receipt.json");
  writeFileSync(receipt, "previous evidence");
  let called = 0;
  await assert.rejects(
    upload(
      { ...f.options, output: receipt },
      {
        env,
        fetchImpl: async () => {
          called++;
        }
      }
    )
  );
  assert.equal(called, 0);
  assert.equal(readFileSync(receipt, "utf8"), "previous evidence");
});
test("HTTP errors do not leak an echoed bearer or server response body", async (t) => {
  const f = fixture(t);
  const fetchImpl = async () =>
    new Response(JSON.stringify({ secret: env.TESTHISTORY_TOKEN, stack: "private-server-log" }), {
      status: 401
    });
  let error;
  try {
    await upload({ ...f.options, output: join(f.root, "receipt.json") }, { env, fetchImpl });
  } catch (value) {
    error = value;
  }
  assert.equal(error.code, "HTTP_401");
  assert.ok(!JSON.stringify(error.receipt).includes(env.TESTHISTORY_TOKEN));
  assert.ok(!readFileSync(join(f.root, "receipt.json"), "utf8").includes("private-server-log"));
});
test("207 import diagnostics, duplicate results and wrong counts prevent a false successful close", async (t) => {
  for (const change of [
    (body) => (body.job.duplicateResults = 1),
    (body) => (body.job.importedResults = 0),
    (body) => (body.job.errors = [{ private: "fixture" }])
  ]) {
    const f = fixture(t),
      api = fakeApi({
        mutate: ({ path, body }) => {
          if (path.endsWith("/results/json")) change(body);
        }
      });
    await assert.rejects(upload(f.options, { env, fetchImpl: api.fetchImpl }));
    assert.equal(api.closed, false);
  }
  const f = fixture(t),
    api = fakeApi({
      mutate: ({ path }) =>
        path.endsWith("/results/json")
          ? new Response("private diagnostics", { status: 207 })
          : undefined
    });
  await rejected(upload(f.options, { env, fetchImpl: api.fetchImpl }), "HTTP_207");
  assert.equal(api.closed, false);
});
test("result metadata, timing, labels, steps and artifact bytes mismatch leave an honest open-launch recovery receipt", async (t) => {
  const changes = [
    ({ path, body }) => {
      if (path.endsWith("/results/native-0")) body.fullName = "wrong";
    },
    ({ path, body }) => {
      if (path.endsWith("/results/native-0")) body.durationMs = 0;
    },
    ({ path, body }) => {
      if (path.endsWith("/results/native-0")) body.labels.owner = ["wrong"];
    },
    ({ path, body }) => {
      if (path.endsWith("/results/native-0")) body.steps = [];
    },
    ({ path }) =>
      path.startsWith("/api/v1/artifacts/") ? new Response(Buffer.from("wrong bytes")) : undefined
  ];
  for (const mutate of changes) {
    const f = fixture(t),
      api = fakeApi({ mutate });
    let failure;
    try {
      await upload(
        { ...f.options, output: join(f.root, "receipt.json") },
        { env, fetchImpl: api.fetchImpl }
      );
    } catch (error) {
      failure = error;
    }
    assert.equal(failure.receipt.status, "FAILED");
    assert.equal(failure.receipt.launchId, "launch-1");
    assert.equal(failure.receipt.stage, "verify");
    assert.equal(failure.receipt.closed, false);
    assert.equal(api.closed, false);
  }
});
test("close failure and uncertain transport are reported without deleting or hiding the launch", async (t) => {
  const f = fixture(t),
    api = fakeApi({
      mutate: ({ path, body }) => {
        if (path.endsWith("/close")) body.closePipeline.status = "failed";
      }
    });
  let failure;
  try {
    await upload(f.options, { env, fetchImpl: api.fetchImpl });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.code, "LAUNCH_CLOSE_INCOMPLETE");
  assert.equal(failure.receipt.launchId, "launch-1");
  assert.equal(failure.receipt.closed, false);
  assert.ok(api.calls.every((call) => call.options.method !== "DELETE"));
});
test("endpoint credentials, query tokens, TLS bypass and CLI token arguments are refused", async () => {
  for (const url of [
    "https://user:password@example.invalid",
    "https://example.invalid?token=fixture",
    "file:///tmp/input",
    "https://example.invalid/api"
  ]) {
    assert.throws(() => createClient({ ...env, TESTHISTORY_BASE_URL: url }), /INVALID_ENDPOINT/);
  }
  assert.throws(
    () => createClient({ ...env, NODE_TLS_REJECT_UNAUTHORIZED: "0" }),
    /TLS_VERIFICATION_REQUIRED/
  );
  await rejected(runCli(["upload", "--token", "fixture"], { env }), "INVALID_ARGUMENTS");
  assert.throws(() => safeRelativePath("../../secret"), /UNSAFE_ARTIFACT_PATH/);
});
test("bounded API responses and transport errors produce only safe codes", async () => {
  const huge = {
    status: 200,
    headers: new Headers(),
    body: (async function* () {
      yield Buffer.alloc(8 * 1024 * 1024 + 1);
    })()
  };
  await rejected(
    createClient(env, { fetchImpl: async () => huge }).request("GET", "/api/v1/launches/launch-1"),
    "RESPONSE_TOO_LARGE"
  );
  await rejected(
    createClient(env, {
      fetchImpl: async () => {
        throw new Error(env.TESTHISTORY_TOKEN);
      }
    }).request("GET", "/api/v1/launches/launch-1"),
    "TRANSPORT_FAILED"
  );
});
test("status and check are read-only and anonymous health contains no token", async () => {
  const api = fakeApi();
  assert.equal(
    (
      await runCli(["check"], {
        env: { ...env, TESTHISTORY_TOKEN: undefined },
        fetchImpl: api.fetchImpl
      })
    ).status,
    "HEALTHY"
  );
  assert.equal(
    (await runCli(["status", "--launch-id", "launch-1"], { env, fetchImpl: api.fetchImpl }))
      .resultCount,
    0
  );
  assert.ok(api.calls.every((call) => call.options.method === "GET"));
});

test("invalid UTF8 and duplicate JSON keys fail before a launch rather than normalizing native evidence", async (t) => {
  const f = fixture(t);
  const valid = JSON.stringify(f.results[0]);
  const nameStart = valid.indexOf('"name":"') + '"name":"'.length;
  const brokenUtf8 = Buffer.concat([
    Buffer.from(valid.slice(0, nameStart)),
    Buffer.from([0xc3, 0x28]),
    Buffer.from(valid.slice(nameStart))
  ]);
  const invalidInputs = [
    brokenUtf8,
    Buffer.from(valid.replace('"status":"passed"', '"status":"failed","status":"passed"')),
    Buffer.from(valid.replace('"name":"', '"\\u006eame":"duplicate","name":"')),
    Buffer.from(
      valid.replace('"name":"Создать смену"', '"name":"duplicate","name":"Создать смену"')
    )
  ];
  for (const [index, bytes] of invalidInputs.entries()) {
    writeFileSync(join(f.root, "native-0-result.json"), bytes);
    let requests = 0;
    await rejected(
      upload(f.options, {
        env,
        fetchImpl: async () => {
          requests++;
        }
      }),
      index === 0 ? "INVALID_RESULT_JSON" : "DUPLICATE_RESULT_JSON_KEY"
    );
    assert.equal(requests, 0);
  }
});
