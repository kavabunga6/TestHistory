import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { buildStandalone } from "./build-testhistory-cli.mjs";
import { upload } from "./testhistory-cli.mjs";
import { env, fakeApi, fixture, hash } from "./testhistory-cli-fixtures.mjs";

test("deterministic standalone artifact has verified source hashes and the same upload contract", async (t) => {
  const f = fixture(t, { count: 2 });
  const output = join(f.root, "standalone");
  const before = ["testhistory-cli-input.mjs", "testhistory-cli.mjs"].map((name) =>
    hash(readFileSync(new URL(name, import.meta.url)))
  );
  const built = buildStandalone(output);
  const bytes = readFileSync(built.path);
  assert.equal(hash(bytes), built.metadata.sha256);
  assert.deepEqual(
    built.metadata.sources.map((source) => source.sha256),
    before
  );
  assert.ok(!bytes.toString().includes('from "./'));
  assert.equal(buildStandalone(output).metadata.sha256, built.metadata.sha256);
  execFileSync(process.execPath, ["--check", built.path]);
  const help = JSON.parse(
    execFileSync(process.execPath, [built.path, "help"], { encoding: "utf8" })
  );
  assert.ok(help.usage.includes("--allow-incomplete"));
  const standalone = await import(pathToFileURL(built.path).href);
  const sourceReceipt = await upload(f.options, { env, fetchImpl: fakeApi().fetchImpl });
  const bundleReceipt = await standalone.upload(f.options, { env, fetchImpl: fakeApi().fetchImpl });
  delete sourceReceipt.checkedAt;
  delete bundleReceipt.checkedAt;
  assert.deepEqual(bundleReceipt, sourceReceipt);
  assert.deepEqual(
    ["testhistory-cli-input.mjs", "testhistory-cli.mjs"].map((name) =>
      hash(readFileSync(new URL(name, import.meta.url)))
    ),
    before
  );
});

test("standalone builder rejects a redirected output ancestor before creating any child", (t) => {
  const f = fixture(t);
  const outside = join(f.root, "outside"),
    alias = join(f.root, "alias");
  mkdirSync(outside);
  symlinkSync(outside, alias, "junction");
  assert.throws(() => buildStandalone(join(alias, "new-output")), /Unsafe CLI output ancestor/);
  assert.equal(existsSync(join(outside, "new-output")), false);
});
