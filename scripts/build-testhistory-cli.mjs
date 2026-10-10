#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const sourceDirectory = dirname(scriptPath);
const sourceNames = ["testhistory-cli-input.mjs", "testhistory-cli.mjs"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function buildStandalone(outputDirectory = join(sourceDirectory, "dist")) {
  const imports = new Map();
  const sources = sourceNames.map((name) => {
    const bytes = readFileSync(join(sourceDirectory, name));
    let code = bytes.toString("utf8").replace(/^#![^\n]*\n/, "");
    code = code.replace(
      /(?:import|export)\s*\{[^}]*\}\s*from\s*"\.\/testhistory-cli-input\.mjs";\s*/g,
      ""
    );
    code = code.replace(
      /import\s*\{([^}]*)\}\s*from\s*"(node:[^"]+)";\s*/g,
      (_match, names, module) => {
        const bindings = imports.get(module) ?? new Set();
        names
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
          .forEach((name) => bindings.add(name));
        imports.set(module, bindings);
        return "";
      }
    );
    if (/^\s*import\s/m.test(code) || /export\s*\{[^}]*\}\s*from/m.test(code))
      throw new Error("Unexpected CLI module import");
    return { name, sha256: digest(bytes), code };
  });
  const header = [...imports]
    .map(([module, names]) => `import { ${[...names].sort().join(", ")} } from "${module}";`)
    .join("\n");
  const bytes = Buffer.from(
    "#!/usr/bin/env node\n// Generated standalone CLI; rebuild with npm run build:cli.\n" +
      header +
      "\n\n" +
      sources.map((source) => source.code).join("\n")
  );
  const output = resolve(outputDirectory);
  let ancestor = output;
  while (!existsSync(ancestor)) {
    try {
      lstatSync(ancestor);
      throw new Error("Unsafe CLI output ancestor");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    ancestor = dirname(ancestor);
  }
  if (realpathSync(ancestor) !== ancestor || lstatSync(ancestor).isSymbolicLink())
    throw new Error("Unsafe CLI output ancestor");
  mkdirSync(output, { recursive: true });
  if (realpathSync(output) !== output || lstatSync(output).isSymbolicLink())
    throw new Error("Unsafe CLI output directory");
  const path = join(output, "testhistory-cli.mjs");
  for (const name of ["testhistory-cli.mjs", "testhistory-cli-build.json"]) {
    try {
      if (lstatSync(join(output, name)).isSymbolicLink()) throw new Error("Unsafe CLI output file");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  writeFileSync(path, bytes);
  const metadata = {
    schemaVersion: 1,
    output: "testhistory-cli.mjs",
    sha256: digest(bytes),
    builderSha256: digest(readFileSync(scriptPath)),
    sources: sources.map(({ name, sha256 }) => ({ name, sha256 }))
  };
  writeFileSync(
    join(output, "testhistory-cli-build.json"),
    JSON.stringify(metadata, null, 2) + "\n"
  );
  return { path, metadata };
}
if (process.argv[1] && resolve(process.argv[1]) === scriptPath)
  console.log(JSON.stringify(buildStandalone().metadata, null, 2));
