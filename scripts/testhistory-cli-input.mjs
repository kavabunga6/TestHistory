import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { inflateSync } from "node:zlib";

export const MAX_BATCH = 8 * 1024 * 1024;
const MAX_INPUT = 256 * 1024 * 1024;
export const MAX_FILES = 10000;
export const STATUSES = ["passed", "failed", "broken", "skipped", "unknown"];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const equal = (left, right) => canonical(left) === canonical(right);
function canonical(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(canonical(item))));
  if (value && typeof value === "object")
    return JSON.stringify(
      Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, JSON.parse(canonical(value[key]))])
      )
    );
  return JSON.stringify(value ?? null);
}
export class CliError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export function requireTrue(value, code) {
  if (!value) throw new CliError(code);
}
export function text(value, limit = 500) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= limit &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
export function identifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}
export function safeRelativePath(value) {
  requireTrue(
    text(value, 1024) &&
      Buffer.byteLength(value, "utf8") <= 512 &&
      !/[\\:%?#]/.test(value) &&
      !isAbsolute(value) &&
      value
        .split("/")
        .every(
          (part) =>
            part &&
            part !== "." &&
            part !== ".." &&
            part.trim() === part &&
            Buffer.byteLength(part, "utf8") <= 255
        ),
    "UNSAFE_ARTIFACT_PATH"
  );
  return value;
}
function inside(root, path) {
  const value = relative(root, path);
  return value !== ".." && !value.startsWith(".." + sep) && !isAbsolute(value);
}
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function validatePng(data) {
  requireTrue(data.subarray(0, 8).equals(pngSignature), "INVALID_PNG");
  let offset = 8,
    header,
    ended = false,
    idatEnded = false,
    palette = false;
  const compressed = [];
  while (offset < data.length) {
    requireTrue(data.length - offset >= 12, "INVALID_PNG");
    const length = data.readUInt32BE(offset),
      end = offset + length + 12;
    requireTrue(end <= data.length, "INVALID_PNG");
    const kind = data.toString("ascii", offset + 4, offset + 8),
      payload = data.subarray(offset + 8, end - 4);
    requireTrue(
      /^[A-Za-z]{4}$/.test(kind) &&
        crc32(data.subarray(offset + 4, end - 4)) === data.readUInt32BE(end - 4),
      "INVALID_PNG"
    );
    if (!header) {
      requireTrue(kind === "IHDR" && length === 13, "INVALID_PNG");
      header = {
        w: payload.readUInt32BE(0),
        h: payload.readUInt32BE(4),
        d: payload[8],
        c: payload[9],
        i: payload[12]
      };
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      requireTrue(
        header.w > 0 &&
          header.h > 0 &&
          header.w <= 8192 &&
          header.h <= 8192 &&
          depths[header.c]?.includes(header.d) &&
          !payload[10] &&
          !payload[11] &&
          header.i <= 1,
        "INVALID_PNG"
      );
    } else if (kind === "IHDR") throw new CliError("INVALID_PNG");
    else if (kind === "IDAT") {
      requireTrue(!idatEnded, "INVALID_PNG");
      compressed.push(payload);
    } else {
      if (compressed.length) idatEnded = true;
      if (kind === "PLTE") palette = true;
      if (kind === "IEND") {
        requireTrue(length === 0 && end === data.length && compressed.length > 0, "INVALID_PNG");
        ended = true;
      } else requireTrue(kind === "PLTE" || (data[offset + 4] & 32) !== 0, "INVALID_PNG");
    }
    offset = end;
  }
  requireTrue(ended && (header.c !== 3 || palette), "INVALID_PNG");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.c];
  const passes = header.i
    ? [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2]
      ]
    : [[0, 0, 1, 1]];
  const rows = passes.flatMap(([x, y, dx, dy]) => {
    const w = Math.max(0, Math.ceil((header.w - x) / dx)),
      h = Math.max(0, Math.ceil((header.h - y) / dy));
    return w && h ? [[Math.ceil((w * channels * header.d) / 8) + 1, h]] : [];
  });
  const expected = rows.reduce((sum, [length, count]) => sum + length * count, 0);
  requireTrue(expected <= 64 * 1024 * 1024, "INVALID_PNG");
  const packed = Buffer.concat(compressed);
  let decoded;
  try {
    decoded = inflateSync(packed, { maxOutputLength: expected + 1, info: true });
  } catch {
    throw new CliError("INVALID_PNG");
  }
  requireTrue(
    decoded.buffer.length === expected && decoded.engine.bytesWritten === packed.length,
    "INVALID_PNG"
  );
  let position = 0;
  for (const [length, count] of rows)
    for (let row = 0; row < count; row++, position += length)
      requireTrue(decoded.buffer[position] <= 4, "INVALID_PNG");
}
export function attachmentsOf(result) {
  return [
    ...(result.attachments ?? []),
    ...(result.steps ?? []).flatMap((step) => attachmentsOf(step))
  ];
}
export function stepProjection(steps = []) {
  return steps.map((step) =>
    Object.fromEntries(
      ["name", "status", "stage", "start", "stop", "statusDetails"]
        .filter((key) => step[key] !== undefined)
        .map((key) => [key, step[key]])
        .concat([
          ["steps", stepProjection(step.steps ?? [])],
          ["attachments", (step.attachments ?? []).map(attachmentProjection)]
        ])
    )
  );
}
export function attachmentProjection(item) {
  return {
    name: item.name,
    source: item.source,
    ...(item.type !== undefined ? { type: item.type } : {})
  };
}
function validateSteps(steps = [], depth = 0) {
  requireTrue(Array.isArray(steps) && depth <= 32, "INVALID_RESULT_STEPS");
  for (const step of steps) {
    requireTrue(
      step && text(step.name) && (step.status === undefined || STATUSES.includes(step.status)),
      "INVALID_RESULT_STEPS"
    );
    validateSteps(step.steps, depth + 1);
    requireTrue(
      step.attachments === undefined || Array.isArray(step.attachments),
      "INVALID_RESULT_ATTACHMENTS"
    );
  }
}
function resultTiming(result, allowIncomplete) {
  const nanoseconds = (result.parameters ?? []).filter(
    (item) => item.name === "elapsedRealtimeNanos"
  );
  requireTrue(nanoseconds.length <= 1, "INVALID_RESULT_TIMING");
  const [nano] = nanoseconds;
  if (nano !== undefined)
    requireTrue(
      typeof nano.value === "string" && /^\d{1,20}$/.test(nano.value),
      "INVALID_RESULT_TIMING"
    );
  const elapsed = nano === undefined ? undefined : BigInt(nano.value);
  const started = Number.isSafeInteger(result.start) && result.start > 0;
  const stopped = Number.isSafeInteger(result.stop) && result.stop >= result.start;
  if (started && stopped) {
    const milliseconds = result.stop - result.start;
    requireTrue(
      Number.isInteger(milliseconds) &&
        (elapsed === undefined || elapsed / 1000000n === BigInt(milliseconds)),
      "INVALID_RESULT_TIMING"
    );
    const positive = milliseconds > 0 || (elapsed !== undefined && elapsed > 0n);
    requireTrue(positive || allowIncomplete, "NONPOSITIVE_RESULT_TIMING");
    return { known: true, incomplete: false, milliseconds, positive };
  }
  const running =
    result.status === "unknown" &&
    result.stage === "running" &&
    started &&
    result.stop == null &&
    elapsed === undefined;
  const ignored =
    result.status === "skipped" &&
    result.stage === "finished" &&
    result.start == null &&
    result.stop == null &&
    elapsed === undefined;
  requireTrue(allowIncomplete && (running || ignored), "NONPOSITIVE_RESULT_TIMING");
  return { known: false, incomplete: running, positive: false };
}
function parseResultJson(bytes) {
  let source, parsed;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(source);
  } catch {
    throw new CliError("INVALID_RESULT_JSON");
  }
  const frames = [];
  for (const token of source.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]/g)) {
    const value = token[0],
      frame = frames.at(-1);
    if (value === "{" || value === "[") {
      frames.push({ object: value === "{", expectKey: value === "{", keys: new Set() });
      requireTrue(frames.length <= 128, "INVALID_RESULT_JSON");
    } else if (value === "}" || value === "]") frames.pop();
    else if (value === "," && frame?.object) frame.expectKey = true;
    else if (value.startsWith('"') && frame?.object && frame.expectKey) {
      const key = JSON.parse(value);
      requireTrue(!frame.keys.has(key), "DUPLICATE_RESULT_JSON_KEY");
      frame.keys.add(key);
      frame.expectKey = false;
    }
  }
  return parsed;
}
export function loadCatalog(
  directory,
  { expectedResults, minScreenshots = 1, batchBytes = MAX_BATCH, allowIncomplete = false } = {}
) {
  requireTrue(
    Number.isInteger(expectedResults) && expectedResults > 0 && expectedResults <= MAX_FILES,
    "EXPECTED_RESULTS_REQUIRED"
  );
  requireTrue(
    Number.isInteger(minScreenshots) &&
      minScreenshots >= 0 &&
      minScreenshots <= MAX_FILES &&
      Number.isInteger(batchBytes) &&
      batchBytes >= 1024 &&
      batchBytes <= MAX_BATCH,
    "INVALID_LIMIT"
  );
  const root = realpathSync(resolve(directory));
  requireTrue(
    lstatSync(resolve(directory)).isDirectory() && !lstatSync(resolve(directory)).isSymbolicLink(),
    "UNSAFE_RESULTS_DIRECTORY"
  );
  const files = new Map();
  let totalBytes = 0;
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const absolute = join(path, entry.name),
        stat = lstatSync(absolute);
      requireTrue(
        !stat.isSymbolicLink() && inside(root, realpathSync(absolute)),
        "UNSAFE_INPUT_FILE"
      );
      if (stat.isDirectory()) walk(absolute);
      else {
        requireTrue(
          stat.isFile() && stat.size <= MAX_BATCH && files.size < MAX_FILES,
          "UNSAFE_OR_OVERSIZED_INPUT"
        );
        const path = safeRelativePath(relative(root, absolute).split(sep).join("/"));
        const fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        let bytes;
        try {
          const checked = fstatSync(fd);
          requireTrue(
            checked.isFile() &&
              checked.dev === stat.dev &&
              checked.ino === stat.ino &&
              checked.size === stat.size,
            "INPUT_CHANGED"
          );
          bytes = Buffer.alloc(stat.size);
          let offset = 0;
          while (offset < bytes.length) {
            const length = readSync(fd, bytes, offset, bytes.length - offset, offset);
            requireTrue(length > 0, "INPUT_CHANGED");
            offset += length;
          }
          requireTrue(
            readSync(fd, Buffer.alloc(1), 0, 1, offset) === 0 && fstatSync(fd).size === stat.size,
            "INPUT_CHANGED"
          );
        } finally {
          closeSync(fd);
        }
        totalBytes += bytes.length;
        requireTrue(totalBytes <= MAX_INPUT, "INPUT_TOO_LARGE");
        files.set(path, { path, bytes, sha256: sha256(bytes) });
      }
    }
  }
  walk(root);
  const results = [],
    uuids = new Set(),
    referenced = new Map();
  for (const file of [...files.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!file.path.endsWith("-result.json")) continue;
    const result = parseResultJson(file.bytes);
    requireTrue(
      result &&
        identifier(result.uuid) &&
        !uuids.has(result.uuid) &&
        text(result.name) &&
        text(result.fullName, 2000) &&
        text(result.historyId) &&
        text(result.testCaseId) &&
        STATUSES.includes(result.status),
      "INVALID_RESULT_IDENTITY_OR_STATUS"
    );
    requireTrue(
      result.parameters === undefined ||
        (Array.isArray(result.parameters) &&
          result.parameters.every((item) => item && text(item.name, 200))),
      "INVALID_RESULT_PARAMETERS"
    );
    const timing = resultTiming(result, allowIncomplete);
    requireTrue(
      Array.isArray(result.labels) &&
        result.labels.length > 0 &&
        result.labels.every((label) => label && text(label.name, 200) && text(label.value, 2000)),
      "INVALID_RESULT_LABELS"
    );
    requireTrue(
      result.attachments === undefined || Array.isArray(result.attachments),
      "INVALID_RESULT_ATTACHMENTS"
    );
    validateSteps(result.steps);
    const group = [file],
      groupPaths = new Set([file.path]);
    for (const attachment of attachmentsOf(result)) {
      requireTrue(
        attachment && text(attachment.name) && text(attachment.type, 200),
        "INVALID_RESULT_ATTACHMENTS"
      );
      const source = safeRelativePath(attachment.source),
        artifact = files.get(source);
      requireTrue(
        artifact &&
          artifact.bytes.length > 0 &&
          !source.endsWith("-result.json") &&
          !source.endsWith("-container.json"),
        "MISSING_ATTACHMENT"
      );
      if (attachment.type === "image/png" || source.toLowerCase().endsWith(".png")) {
        requireTrue(attachment.type === "image/png", "INVALID_PNG_TYPE");
        validatePng(artifact.bytes);
      }
      referenced.set(source, artifact);
      if (!groupPaths.has(source)) {
        group.push(artifact);
        groupPaths.add(source);
      }
    }
    uuids.add(result.uuid);
    results.push({ result, file, group, timing });
  }
  requireTrue(results.length === expectedResults, "RESULT_COUNT_MISMATCH");
  const pngCount = [...referenced.values()].filter((file) =>
    file.path.toLowerCase().endsWith(".png")
  ).length;
  requireTrue(pngCount >= minScreenshots, "SCREENSHOT_COUNT_MISMATCH");
  const wire = (file) => ({
    path: file.path,
    content: file.bytes.toString("base64"),
    contentEncoding: "base64"
  });
  const batches = [];
  let batch = new Map();
  const size = (group) =>
    Buffer.byteLength(JSON.stringify({ files: [...group.values()].map(wire) }));
  for (const { group } of results) {
    const added = new Map([...batch, ...group.map((file) => [file.path, file])]);
    if (size(added) > batchBytes && batch.size) {
      batches.push([...batch.values()].map(wire));
      batch = new Map();
    }
    for (const file of group) batch.set(file.path, file);
    requireTrue(size(batch) <= batchBytes, "RESULT_GROUP_TOO_LARGE");
  }
  for (const file of files.values()) {
    if (file.path.endsWith("-result.json") || referenced.has(file.path)) continue;
    if (
      !file.path.endsWith("-container.json") &&
      !["environment.properties", "executor.json", "categories.json"].includes(file.path)
    )
      continue;
    const added = new Map([...batch, [file.path, file]]);
    if (size(added) > batchBytes && batch.size) {
      batches.push([...batch.values()].map(wire));
      batch = new Map();
    }
    batch.set(file.path, file);
    requireTrue(size(batch) <= batchBytes, "METADATA_FILE_TOO_LARGE");
  }
  if (batch.size) batches.push([...batch.values()].map(wire));
  return { results, referenced, batches, pngCount, totalBytes };
}
