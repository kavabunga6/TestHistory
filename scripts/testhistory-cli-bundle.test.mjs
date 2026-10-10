import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
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

test("source and standalone CLI execute the actual help command through a symlinked parent", (t) => {
  const f = fixture(t),
    physical = join(f.root, "physical-cli"),
    alias = join(f.root, "logical-cli");
  mkdirSync(physical);
  for (const name of ["testhistory-cli.mjs", "testhistory-cli-input.mjs"])
    copyFileSync(new URL(name, import.meta.url), join(physical, name));
  symlinkSync(physical, alias, "junction");
  const bundle = buildStandalone(join(physical, "dist"));
  for (const main of [
    join(alias, "testhistory-cli.mjs"),
    join(alias, "dist", "testhistory-cli.mjs")
  ]) {
    for (const flags of [[], ["--preserve-symlinks-main"]]) {
      const stdout = execFileSync(process.execPath, [...flags, main, "help"], { encoding: "utf8" });
      assert.ok(
        stdout.trim().length > 0,
        "a main invocation must not silently exit as an imported module"
      );
      const help = JSON.parse(stdout);
      assert.ok(help.usage.includes("upload --results-dir"));
      assert.ok(help.usage.includes("--allow-incomplete"));
    }
  }
  assert.equal(hash(readFileSync(bundle.path)), bundle.metadata.sha256);
});

test("standalone builder executes through a symlinked parent and preserves its physical output root", (t) => {
  const f = fixture(t),
    physical = join(f.root, "physical-builder"),
    alias = join(f.root, "logical-builder");
  mkdirSync(physical);
  for (const name of [
    "testhistory-cli.mjs",
    "testhistory-cli-input.mjs",
    "build-testhistory-cli.mjs"
  ])
    copyFileSync(new URL(name, import.meta.url), join(physical, name));
  symlinkSync(physical, alias, "junction");
  for (const flags of [[], ["--preserve-symlinks-main"]]) {
    const stdout = execFileSync(
      process.execPath,
      [...flags, join(alias, "build-testhistory-cli.mjs")],
      { encoding: "utf8" }
    );
    assert.ok(stdout.trim().length > 0, "builder invocation must emit its actual build metadata");
    const metadata = JSON.parse(stdout);
    assert.equal(
      hash(readFileSync(join(physical, "dist", "testhistory-cli.mjs"))),
      metadata.sha256
    );
  }
});
