import type { AllureResult, AllureStatus } from "@testhistory/contracts";
import type {
  AllureCategory,
  AllureCompatibilityFile,
  AllureContainer,
  AllureEnvironment,
  AllureExecutor,
  AllureHistoryFile,
  ParseResult
} from "./types.js";
import { isNonEmptyString, isRecord, normalizeFixtures } from "./resultNormalization.js";
import { sanitizeTextField, sanitizeTextFields } from "./redaction.js";
export {
  buildAllureParameterVariant,
  normalizeAllureResult,
  normalizeAllureResultAttempts
} from "./resultNormalization.js";
export type {
  AllureArchiveManifest,
  AllureArchiveManifestEntry,
  AllureArchiveManifestEntryInput,
  AllureArchiveManifestEntryKind,
  AllureAttemptGroupReadModel,
  AllureAttemptIdentity,
  AllureAttemptIdentitySource,
  AllureAttemptReadModel,
  AllureCategory,
  AllureCompatibilityFile,
  AllureContainer,
  AllureEnvironment,
  AllureExecutor,
  AllureFixture,
  AllureHistoryFile,
  AllureParameterVariantReadModel,
  ParseResult
} from "./types.js";
export { normalizeAllureArchiveManifest } from "./archiveManifest.js";

const statuses = new Set<AllureStatus>(["failed", "broken", "passed", "skipped", "unknown"]);
export function parseAllureResultJson(input: string, filePath?: string): ParseResult<AllureResult> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return {
      ok: false,
      errors: [
        diagnosticMessage(
          filePath,
          `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
        )
      ],
      warnings: []
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      errors: [diagnosticMessage(filePath, "Allure result must be a JSON object")],
      warnings: []
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isNonEmptyString(parsed.uuid)) {
    errors.push(
      diagnosticMessage(filePath, "Field `uuid` is required and must be a non-empty string")
    );
  }

  if (!isNonEmptyString(parsed.name)) {
    errors.push(
      diagnosticMessage(filePath, "Field `name` is required and must be a non-empty string")
    );
  }

  const status = typeof parsed.status === "string" ? parsed.status : undefined;
  if (status !== undefined && !statuses.has(status as AllureStatus)) {
    warnings.push(
      diagnosticMessage(filePath, `Unknown status '${status}' was normalized to 'unknown'`)
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    value: parsed as AllureResult,
    warnings
  };
}

export function parseAllureContainerJson(
  input: string,
  filePath?: string
): ParseResult<AllureContainer> {
  const parsed = parseJsonRecord(input, "Allure container", filePath);
  if (!parsed.ok) {
    return parsed;
  }

  const errors: string[] = [];
  const warnings: string[] = [...parsed.warnings];
  if (!isNonEmptyString(parsed.value.uuid)) {
    errors.push(
      diagnosticMessage(filePath, "Field `uuid` is required and must be a non-empty string")
    );
  }

  collectArrayWarning(parsed.value.children, "`children`", warnings, filePath);
  collectArrayWarning(parsed.value.befores, "`befores`", warnings, filePath);
  collectArrayWarning(parsed.value.afters, "`afters`", warnings, filePath);

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    value: normalizeAllureContainer(parsed.value as AllureContainer),
    warnings
  };
}

export function normalizeAllureContainer(container: AllureContainer): AllureContainer {
  const safeContainer = sanitizeTextFields(container) as AllureContainer;
  return {
    ...safeContainer,
    ...(Array.isArray(safeContainer.children)
      ? { children: safeContainer.children.filter(isNonEmptyString) }
      : {}),
    ...(safeContainer.befores !== undefined
      ? { befores: normalizeFixtures(safeContainer.befores) }
      : {}),
    ...(safeContainer.afters !== undefined
      ? { afters: normalizeFixtures(safeContainer.afters) }
      : {})
  };
}

export function parseEnvironmentProperties(
  input: string,
  filePath = "environment.properties"
): ParseResult<AllureEnvironment> {
  const warnings: string[] = [];
  const environment: AllureEnvironment = {};
  const lines = input.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("!")) {
      return;
    }

    const delimiterIndex = findPropertiesDelimiter(line);
    if (delimiterIndex === -1) {
      warnings.push(
        diagnosticMessage(filePath, `Line ${index + 1} was ignored because it has no delimiter`)
      );
      return;
    }

    const key = line.slice(0, delimiterIndex).trim();
    if (key.length === 0) {
      warnings.push(
        diagnosticMessage(filePath, `Line ${index + 1} was ignored because its key is empty`)
      );
      return;
    }

    if (Object.hasOwn(environment, key)) {
      warnings.push(diagnosticMessage(filePath, `Line ${index + 1} overrides key '${key}'`));
    }

    environment[key] = line.slice(delimiterIndex + 1).trim();
  });

  return { ok: true, value: environment, warnings };
}

export function parseAllureExecutorJson(
  input: string,
  filePath?: string
): ParseResult<AllureExecutor> {
  return parseJsonRecord(input, "Allure executor", filePath);
}

export function parseAllureCategoriesJson(
  input: string,
  filePath?: string
): ParseResult<AllureCategory[]> {
  const parsed = parseJson(input, filePath);
  if (!parsed.ok) {
    return parsed;
  }

  if (!Array.isArray(parsed.value)) {
    return {
      ok: false,
      errors: [diagnosticMessage(filePath, "Allure categories must be a JSON array")],
      warnings: parsed.warnings
    };
  }

  const warnings = [...parsed.warnings];
  const categories = parsed.value.flatMap((category, index) => {
    if (!isRecord(category)) {
      warnings.push(
        diagnosticMessage(
          filePath,
          `Category at index ${index} was ignored because it is not an object`
        )
      );
      return [];
    }

    if (category.matchedStatuses !== undefined && !Array.isArray(category.matchedStatuses)) {
      warnings.push(
        diagnosticMessage(filePath, `Category at index ${index} has non-array matchedStatuses`)
      );
    }

    return [category as AllureCategory];
  });

  return { ok: true, value: categories, warnings };
}

export function parseAllureHistoryJson(
  input: string,
  filePath?: string
): ParseResult<AllureHistoryFile> {
  const parsed = parseJson(input, filePath);
  if (!parsed.ok) {
    return parsed;
  }

  if (!isRecord(parsed.value) && !Array.isArray(parsed.value)) {
    return {
      ok: false,
      errors: [diagnosticMessage(filePath, "Allure history file must be a JSON object or array")],
      warnings: parsed.warnings
    };
  }

  if (Array.isArray(parsed.value)) {
    const warnings = [...parsed.warnings];
    const historyItems = parsed.value.flatMap((item, index) => {
      if (!isRecord(item)) {
        warnings.push(
          diagnosticMessage(
            filePath,
            `History item at index ${index} was ignored because it is not an object`
          )
        );
        return [];
      }

      return [item];
    });
    return { ok: true, value: historyItems, warnings };
  }

  return { ok: true, value: parsed.value, warnings: parsed.warnings };
}

export function parseAllureCompatibilityFile(
  filePath: string,
  input: string
): ParseResult<AllureCompatibilityFile> {
  const normalizedPath = filePath.replaceAll("\\", "/");
  const compatibilityKind = getAllureCompatibilityKind(normalizedPath);

  if (compatibilityKind === "result") {
    return mapParseResult(parseAllureResultJson(input, filePath), (value) => ({
      kind: "result",
      path: normalizedPath,
      value
    }));
  }

  if (compatibilityKind === "container") {
    return mapParseResult(parseAllureContainerJson(input, filePath), (value) => ({
      kind: "container",
      path: normalizedPath,
      value
    }));
  }

  if (compatibilityKind === "environment") {
    return mapParseResult(parseEnvironmentProperties(input, filePath), (value) => ({
      kind: "environment",
      path: normalizedPath,
      value
    }));
  }

  if (compatibilityKind === "executor") {
    return mapParseResult(parseAllureExecutorJson(input, filePath), (value) => ({
      kind: "executor",
      path: normalizedPath,
      value
    }));
  }

  if (compatibilityKind === "categories") {
    return mapParseResult(parseAllureCategoriesJson(input, filePath), (value) => ({
      kind: "categories",
      path: normalizedPath,
      value
    }));
  }

  if (compatibilityKind === "history") {
    return mapParseResult(parseAllureHistoryJson(input, filePath), (value) => ({
      kind: "history",
      path: normalizedPath,
      value
    }));
  }

  return {
    ok: false,
    errors: [diagnosticMessage(filePath, "Unsupported Allure compatibility file")],
    warnings: []
  };
}

function getAllureCompatibilityKind(path: string): AllureCompatibilityFile["kind"] | undefined {
  const normalizedPath = path.replaceAll("\\", "/");
  const basename = normalizedPath.split("/").at(-1)?.toLowerCase() ?? normalizedPath.toLowerCase();

  if (basename.endsWith("-result.json")) {
    return "result";
  }
  if (basename.endsWith("-container.json")) {
    return "container";
  }
  if (basename === "environment.properties") {
    return "environment";
  }
  if (basename === "executor.json") {
    return "executor";
  }
  if (basename === "categories.json") {
    return "categories";
  }

  const lowerPath = normalizedPath.toLowerCase();
  if (
    (lowerPath.startsWith("history/") || lowerPath.includes("/history/")) &&
    basename.endsWith(".json")
  ) {
    return "history";
  }

  return undefined;
}

function parseJson(input: string, filePath?: string): ParseResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(input) as unknown, warnings: [] };
  } catch (error) {
    return {
      ok: false,
      errors: [
        diagnosticMessage(
          filePath,
          `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
        )
      ],
      warnings: []
    };
  }
}

function parseJsonRecord(
  input: string,
  label: string,
  filePath?: string
): ParseResult<Record<string, unknown>> {
  const parsed = parseJson(input, filePath);
  if (!parsed.ok) {
    return parsed;
  }

  if (!isRecord(parsed.value)) {
    return {
      ok: false,
      errors: [diagnosticMessage(filePath, `${label} must be a JSON object`)],
      warnings: parsed.warnings
    };
  }

  return { ok: true, value: parsed.value, warnings: parsed.warnings };
}

function mapParseResult<T, U>(result: ParseResult<T>, mapper: (value: T) => U): ParseResult<U> {
  if (!result.ok) {
    return result;
  }

  return { ok: true, value: mapper(result.value), warnings: result.warnings };
}

function diagnosticMessage(filePath: string | undefined, message: string): string {
  return filePath === undefined ? message : `${sanitizeDiagnosticFilePath(filePath)}: ${message}`;
}

function sanitizeDiagnosticFilePath(filePath: string): string {
  const normalizedPath = filePath.replaceAll("\\", "/");
  if (normalizedPath.includes("://")) {
    return "[redacted-url]";
  }

  return sanitizeTextField(normalizedPath);
}

function collectArrayWarning(
  value: unknown,
  fieldName: string,
  warnings: string[],
  filePath?: string
): void {
  if (value !== undefined && !Array.isArray(value)) {
    warnings.push(
      diagnosticMessage(filePath, `Field ${fieldName} was ignored because it is not an array`)
    );
  }
}

function findPropertiesDelimiter(line: string): number {
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === "=" || char === ":") && !isEscaped(line, index)) {
      return index;
    }
  }

  return -1;
}

function isEscaped(value: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}
