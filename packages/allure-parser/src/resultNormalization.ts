import type {
  AllureAttachment,
  AllureLabel,
  AllureParameter,
  AllureResult,
  AllureStatus,
  AllureStatusDetails,
  AllureStep,
  NormalizedTestResult
} from "@testhistory/contracts";
import type {
  AllureAttemptGroupReadModel,
  AllureAttemptIdentity,
  AllureAttemptReadModel,
  AllureFixture,
  AllureParameterVariantReadModel
} from "./types.js";
import {
  redactedTextValue,
  sanitizeAttachmentMetadata,
  sanitizeTextField,
  sanitizeTextFields,
  shouldRedactTextKey
} from "./redaction.js";

const statuses = new Set<AllureStatus>(["failed", "broken", "passed", "skipped", "unknown"]);

export function normalizeAllureResult(result: AllureResult): NormalizedTestResult {
  const safeResult = sanitizeTextFields(result) as AllureResult;
  const status =
    safeResult.status && statuses.has(safeResult.status) ? safeResult.status : "unknown";
  const labels = normalizeLabels(sanitizeLabels(safeResult.labels ?? []));
  const durationMs =
    typeof safeResult.start === "number" && typeof safeResult.stop === "number"
      ? Math.max(0, safeResult.stop - safeResult.start)
      : undefined;

  return {
    uuid: safeResult.uuid,
    ...(safeResult.historyId !== undefined ? { historyId: safeResult.historyId } : {}),
    ...(safeResult.testCaseId !== undefined ? { testCaseId: safeResult.testCaseId } : {}),
    ...(safeResult.fullName !== undefined ? { fullName: safeResult.fullName } : {}),
    name: safeResult.name,
    status,
    ...(durationMs !== undefined ? { durationMs } : {}),
    labels,
    parameters: sanitizeParameters(safeResult.parameters ?? []),
    attachments: normalizeAttachments(safeResult.attachments ?? []),
    steps: normalizeSteps(safeResult.steps ?? []),
    raw: redactAllureResult(safeResult)
  };
}

export function buildAllureParameterVariant(parameters: unknown): AllureParameterVariantReadModel {
  const sanitizedParameters = sanitizeParameters(parameters);
  const comparableParameters = sanitizedParameters
    .filter((parameter) => parameter.excluded !== true)
    .map((parameter) => {
      const comparable: Record<string, unknown> = { name: parameter.name };
      if (parameter.mode !== undefined && parameter.mode !== "default") {
        comparable.mode = parameter.mode;
      }
      if (parameter.mode === "hidden") {
        comparable.value = "<hidden>";
      } else if (parameter.mode === "masked") {
        comparable.value = "<masked>";
      } else if (parameter.value !== undefined) {
        comparable.value = parameter.value;
      }
      return comparable;
    })
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return {
    signature: JSON.stringify(comparableParameters),
    parameters: sanitizedParameters
  };
}

export function normalizeAllureResultAttempts(
  results: AllureResult[]
): AllureAttemptGroupReadModel[] {
  const groups = new Map<
    string,
    {
      identity: AllureAttemptIdentity;
      parameterVariant: AllureParameterVariantReadModel;
      items: Array<{
        inputIndex: number;
        normalized: NormalizedTestResult;
        explicitRetry: boolean;
        flaky: boolean;
        startedAt?: number;
        stoppedAt?: number;
      }>;
    }
  >();

  results.forEach((result, inputIndex) => {
    const normalized = normalizeAllureResult(result);
    const identity = getAllureAttemptIdentity(normalized);
    const parameterVariant = buildAllureParameterVariant(normalized.parameters);
    const key = `${identity.source}:${identity.value}::parameters:${parameterVariant.signature}`;
    const rawRecord = normalized.raw as Record<string, unknown>;
    const group = groups.get(key) ?? {
      identity,
      parameterVariant,
      items: []
    };

    group.items.push({
      inputIndex,
      normalized,
      explicitRetry: rawRecord.retry === true || rawRecord.retried === true,
      flaky: normalized.raw.statusDetails?.flaky === true || rawRecord.flaky === true,
      ...(typeof normalized.raw.start === "number" ? { startedAt: normalized.raw.start } : {}),
      ...(typeof normalized.raw.stop === "number" ? { stoppedAt: normalized.raw.stop } : {})
    });
    groups.set(key, group);
  });

  return [...groups.entries()]
    .map(([key, group]) => {
      const attempts = [...group.items]
        .sort(compareAttemptItems)
        .map((item, attemptIndex): AllureAttemptReadModel => ({
          attemptIndex,
          attemptNumber: attemptIndex + 1,
          retry: item.explicitRetry || attemptIndex > 0,
          flaky: item.flaky,
          result: item.normalized,
          ...(item.startedAt !== undefined ? { startedAt: item.startedAt } : {}),
          ...(item.stoppedAt !== undefined ? { stoppedAt: item.stoppedAt } : {}),
          ...(item.normalized.raw.statusDetails !== undefined
            ? { statusDetails: item.normalized.raw.statusDetails }
            : {})
        }));
      const latest = attempts.at(-1);
      if (latest === undefined) {
        throw new Error("Allure attempt group cannot be empty");
      }

      return {
        key,
        identity: group.identity,
        parameterVariant: group.parameterVariant,
        attempts,
        latest
      };
    })
    .sort((left, right) => compareAttemptReadModels(left.attempts[0], right.attempts[0]));
}

function getAllureAttemptIdentity(result: NormalizedTestResult): AllureAttemptIdentity {
  if (isNonEmptyString(result.historyId)) {
    return { source: "historyId", value: result.historyId };
  }
  if (isNonEmptyString(result.testCaseId)) {
    return { source: "testCaseId", value: result.testCaseId };
  }
  if (isNonEmptyString(result.fullName)) {
    return { source: "fullName", value: result.fullName };
  }
  return { source: "name", value: result.name };
}

function compareAttemptItems(
  left: {
    inputIndex: number;
    startedAt?: number;
    stoppedAt?: number;
  },
  right: {
    inputIndex: number;
    startedAt?: number;
    stoppedAt?: number;
  }
): number {
  return (
    compareOptionalNumbers(left.startedAt, right.startedAt) ||
    compareOptionalNumbers(left.stoppedAt, right.stoppedAt) ||
    left.inputIndex - right.inputIndex
  );
}

function compareAttemptReadModels(
  left: AllureAttemptReadModel | undefined,
  right: AllureAttemptReadModel | undefined
): number {
  if (left === undefined || right === undefined) {
    return left === undefined && right === undefined ? 0 : left === undefined ? 1 : -1;
  }

  return (
    compareOptionalNumbers(left.startedAt, right.startedAt) ||
    compareOptionalNumbers(left.stoppedAt, right.stoppedAt)
  );
}

function compareOptionalNumbers(left: number | undefined, right: number | undefined): number {
  if (left === undefined || right === undefined) {
    return left === undefined && right === undefined ? 0 : left === undefined ? 1 : -1;
  }

  return left - right;
}

function redactAllureResult(result: AllureResult): AllureResult {
  const safeResult = sanitizeTextFields(result) as AllureResult;
  const { statusDetails, ...safeResultWithoutStatusDetails } = safeResult;
  return {
    ...safeResultWithoutStatusDetails,
    ...(safeResult.description !== undefined
      ? { description: sanitizeTextField(safeResult.description) }
      : {}),
    ...(safeResult.descriptionHtml !== undefined
      ? { descriptionHtml: sanitizeTextField(safeResult.descriptionHtml) }
      : {}),
    ...(isRecord(statusDetails)
      ? { statusDetails: sanitizeStatusDetails(statusDetails as AllureStatusDetails) }
      : {}),
    ...(safeResult.parameters !== undefined
      ? { parameters: sanitizeParameters(safeResult.parameters) }
      : {}),
    ...(safeResult.labels !== undefined ? { labels: sanitizeLabels(safeResult.labels) } : {}),
    ...(safeResult.attachments !== undefined
      ? { attachments: normalizeAttachments(safeResult.attachments, { preserveUnknown: true }) }
      : {}),
    ...(safeResult.steps !== undefined ? { steps: normalizeSteps(safeResult.steps) } : {})
  };
}

function normalizeLabels(labels: AllureLabel[]): Record<string, string[]> {
  return labels.reduce<Record<string, string[]>>((acc, label) => {
    if (!label.name || label.value === undefined) {
      return acc;
    }

    const values = acc[label.name] ?? [];
    values.push(label.value);
    acc[label.name] = values;
    return acc;
  }, {});
}

function sanitizeParameters(parameters: unknown): AllureParameter[] {
  if (!Array.isArray(parameters)) {
    return [];
  }

  return parameters.flatMap((parameter) => {
    if (!isRecord(parameter)) {
      return [];
    }

    const typedParameter = parameter as AllureParameter;
    if (!isNonEmptyString(typedParameter.name)) {
      return [];
    }

    if (parameter.mode === "hidden") {
      const parameterWithoutValue = { ...(parameter as Record<string, unknown>) };
      delete parameterWithoutValue.value;
      return [
        {
          ...parameterWithoutValue,
          name: typedParameter.name,
          mode: "hidden"
        } as AllureParameter
      ];
    }

    if (parameter.mode === "masked") {
      return typedParameter.value === undefined
        ? [{ ...(parameter as AllureParameter) }]
        : [{ ...(parameter as AllureParameter), value: "***" }];
    }

    return [{ ...(parameter as AllureParameter) }];
  });
}

function sanitizeLabels(labels: unknown): AllureLabel[] {
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels.flatMap((label) => {
    if (!isRecord(label) || !isNonEmptyString(label.name) || typeof label.value !== "string") {
      return [];
    }

    return [
      {
        ...(label as AllureLabel),
        value: shouldRedactTextKey(label.name) ? redactedTextValue : sanitizeTextField(label.value)
      }
    ];
  });
}

function sanitizeStatusDetails(statusDetails: AllureStatusDetails): AllureStatusDetails {
  return {
    ...statusDetails,
    ...(statusDetails.message !== undefined
      ? { message: sanitizeTextField(statusDetails.message) }
      : {}),
    ...(statusDetails.trace !== undefined ? { trace: sanitizeTextField(statusDetails.trace) } : {})
  };
}

function normalizeAttachments(
  attachments: unknown,
  options: { preserveUnknown?: boolean } = {}
): AllureAttachment[] {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.flatMap((attachment) => {
    if (!isRecord(attachment)) {
      return [];
    }

    const name = normalizeNonEmptyString(attachment.name);
    const source = normalizeAttachmentSource(attachment.source);
    if (name === undefined || source === undefined) {
      return [];
    }

    const type = normalizeAttachmentType(
      typeof attachment.type === "string" ? attachment.type : undefined,
      source
    );
    const normalizedAttachment = options.preserveUnknown
      ? ({
          ...(sanitizeAttachmentMetadata(attachment) as Record<string, unknown>),
          name,
          source
        } satisfies Record<string, unknown>)
      : { name, source };

    return [
      {
        ...normalizedAttachment,
        ...(type !== undefined ? { type } : {})
      } as AllureAttachment
    ];
  });
}

function normalizeSteps(steps: unknown): AllureStep[] {
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps.flatMap((step) => {
    if (!isRecord(step)) {
      return [];
    }

    const typedStep = step as AllureStep;
    return [
      {
        ...(step as AllureStep),
        ...(isRecord(typedStep.statusDetails)
          ? { statusDetails: sanitizeStatusDetails(typedStep.statusDetails as AllureStatusDetails) }
          : {}),
        attachments: normalizeAttachments(typedStep.attachments, { preserveUnknown: true }),
        parameters: sanitizeParameters(typedStep.parameters),
        steps: normalizeSteps(typedStep.steps)
      }
    ];
  });
}

export function normalizeFixtures(fixtures: unknown): AllureFixture[] {
  if (!Array.isArray(fixtures)) {
    return [];
  }

  return fixtures.flatMap((fixture) => {
    if (!isRecord(fixture)) {
      return [];
    }

    const typedFixture = fixture as AllureFixture;
    return [
      {
        ...typedFixture,
        ...(isRecord(typedFixture.statusDetails)
          ? {
              statusDetails: sanitizeStatusDetails(
                typedFixture.statusDetails as AllureStatusDetails
              )
            }
          : {}),
        attachments: normalizeAttachments(typedFixture.attachments, { preserveUnknown: true }),
        parameters: sanitizeParameters(typedFixture.parameters),
        steps: normalizeFixtures(typedFixture.steps)
      }
    ];
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeAttachmentSource(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const source = value.trim().replaceAll("\\", "/");
  if (
    source.length === 0 ||
    source === "[redacted-local-path]" ||
    source.includes("://") ||
    source.startsWith("/") ||
    source.includes(":")
  ) {
    return undefined;
  }

  const segments = source.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return undefined;
  }

  return source;
}

function normalizeAttachmentType(type: string | undefined, source: string): string | undefined {
  const normalized = type?.split(";")[0]?.trim().toLowerCase();
  if (normalized !== undefined && normalized.length > 0) {
    return normalized === "application/text" ? "text/plain" : normalized;
  }

  if (source.endsWith(".png")) {
    return "image/png";
  }
  if (source.endsWith(".xml")) {
    return "application/xml";
  }
  if (source.endsWith(".txt") || source.endsWith(".log")) {
    return "text/plain";
  }
  if (source.endsWith(".json")) {
    return "application/json";
  }
  if (source.endsWith(".html") || source.endsWith(".htm")) {
    return "text/html";
  }

  return undefined;
}
