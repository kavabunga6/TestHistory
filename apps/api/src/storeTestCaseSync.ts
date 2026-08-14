import { createEmptyCounters, getTestCaseIdentity } from "@testhistory/domain";
import type {
  AppStore,
  Launch,
  TestCaseRecord,
  UploadFieldName,
  UploadPolicySource
} from "./store.js";

export function defaultUploadFieldPolicy(): Record<UploadFieldName, UploadPolicySource> {
  return {
    name: "from_result",
    layer: "from_result",
    description: "from_result",
    expected_result: "from_result",
    link: "from_result",
    tag: "from_result",
    issue: "from_result",
    member: "from_result",
    custom_field: "from_result"
  };
}

export function summarizeStoredLaunch(launch: Launch) {
  const counters = createEmptyCounters();

  for (const result of launch.results) {
    counters[result.status] = (counters[result.status] ?? 0) + 1;
  }

  return {
    id: launch.id,
    projectId: launch.projectId,
    name: launch.name,
    status: launch.status,
    counters
  };
}

export function syncTestCasesFromLaunch(
  store: AppStore,
  launch: Launch,
  fieldPolicy: Record<UploadFieldName, UploadPolicySource> = defaultUploadFieldPolicy()
): number {
  let changed = 0;

  for (const result of launch.results) {
    const id = getTestCaseIdentity(result);
    const now = new Date().toISOString();
    const existing = store.testCases.get(id);
    const record: TestCaseRecord = existing ?? {
      id,
      projectId: launch.projectId,
      name: result.name,
      ...(result.fullName !== undefined ? { fullName: result.fullName } : {}),
      workflowStatus: "active",
      tags: [],
      customFields: {},
      members: [],
      links: [],
      issues: [],
      testKeys: [],
      relations: [],
      historyVersions: [],
      createdAt: now,
      updatedAt: now
    };

    const labels = result.labels;
    if (fieldPolicy.name === "from_result") {
      record.name = result.name;
      if (result.fullName !== undefined) {
        record.fullName = result.fullName;
      }
    }
    if (fieldPolicy.layer === "from_result") {
      assignOptional(record, "layer", firstLabel(labels, "layer"));
    }
    if (fieldPolicy.description === "from_result") {
      assignOptional(record, "description", result.raw.description);
      assignOptional(record, "scenario", firstLabel(labels, "scenario"));
    }
    if (fieldPolicy.expected_result === "from_result") {
      assignOptional(
        record,
        "expectedResult",
        firstLabel(labels, "expected_result") ?? firstLabel(labels, "expectedResult")
      );
    }
    if (fieldPolicy.tag === "from_result") {
      record.tags = unique(labels.tag ?? []);
    }
    if (fieldPolicy.member === "from_result") {
      record.members = unique([...(labels.member ?? []), ...(labels.owner ?? [])]);
    }
    if (fieldPolicy.issue === "from_result") {
      record.issues = unique(labels.issue ?? []);
      record.testKeys = unique([...(labels.tms ?? []), ...(labels.testKey ?? [])]);
    }
    if (fieldPolicy.link === "from_result") {
      record.links = (result.raw.links ?? []).filter((link) => link.url);
    }
    if (fieldPolicy.custom_field === "from_result") {
      record.customFields = Object.fromEntries(
        Object.entries(labels)
          .filter(([name]) => name.startsWith("custom_field:"))
          .map(([name, values]) => [
            name.slice("custom_field:".length),
            values[values.length - 1] ?? ""
          ])
      );
    }

    if (
      !record.historyVersions.some(
        (version) => version.launchId === launch.id && version.resultUuid === result.uuid
      )
    ) {
      record.historyVersions.push({
        launchId: launch.id,
        resultUuid: result.uuid,
        status: result.status,
        seenAt: launch.closedAt ?? launch.createdAt,
        ...(result.historyId !== undefined ? { historyId: result.historyId } : {})
      });
    }
    record.updatedAt = now;
    store.testCases.set(id, record);
    changed += 1;
  }

  return changed;
}

function firstLabel(labels: Record<string, string[]>, name: string): string | undefined {
  return labels[name]?.[0];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function assignOptional<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
) {
  if (value !== undefined) {
    target[key] = value;
  }
}
