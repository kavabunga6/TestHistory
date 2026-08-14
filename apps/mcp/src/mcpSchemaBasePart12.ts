import { uploadSessionSchema } from "./mcpUploadSessionSchema.js";

export const schemaBasePart12 = {
  "test-result.details": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryTestResultDetails",
    type: "object",
    additionalProperties: true,
    required: ["launchId", "projectId", "uuid", "name", "status", "labels", "parameters"],
    properties: {
      launchId: { type: "string" },
      projectId: { type: "string" },
      uuid: { type: "string" },
      historyId: { type: "string" },
      testCaseId: { type: "string" },
      fullName: { type: "string" },
      name: { type: "string" },
      status: { type: "string", enum: ["failed", "broken", "passed", "skipped", "unknown"] },
      durationMs: { type: "integer", minimum: 0 },
      labels: {
        type: "object",
        additionalProperties: {
          type: "array",
          items: { type: "string" }
        }
      },
      parameters: {
        type: "array",
        items: { $ref: "#/$defs/parameter" },
        description:
          "Matches REST redaction: masked parameters keep value as ***; hidden parameters omit value."
      },
      steps: {
        type: "array",
        items: { type: "object", additionalProperties: true }
      },
      raw: {
        type: "object",
        additionalProperties: true,
        description:
          "REST redacted raw result. Masked parameter values are replaced with *** and hidden parameter values are omitted."
      }
    },
    $defs: {
      parameter: {
        type: "object",
        additionalProperties: true,
        required: ["name"],
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          mode: { type: "string", enum: ["default", "masked", "hidden"] }
        }
      }
    }
  },
  "shared-step.mutation": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistorySharedStepMutation",
    type: "object",
    additionalProperties: false,
    required: ["projectId", "name", "steps"],
    properties: {
      projectId: { type: "string" },
      id: { type: "string", description: "Required for update operations." },
      name: { type: "string" },
      steps: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            expectedResult: { type: "string" }
          }
        }
      },
      aql: { type: "string", description: "AQL-like selector for future find workflows." }
    },
    backendRequirement: "Schema is static. Shared step create/update/find API support is planned."
  },
  "mute.mutation": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryMuteMutation",
    type: "object",
    additionalProperties: false,
    required: ["projectId", "reason"],
    properties: {
      projectId: { type: "string" },
      id: { type: "string", description: "Required for delete operations." },
      testCaseId: { type: "string" },
      testResultId: { type: "string" },
      reason: { type: "string" },
      expiresAt: { type: "string", format: "date-time" },
      aql: {
        type: "string",
        description: "AQL-like selector for future mute creation workflows."
      }
    },
    backendRequirement: "Schema is static. Mute create/delete API support is planned."
  },
  "quality-gate.evaluation": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryQualityGateEvaluation",
    type: "object",
    additionalProperties: false,
    required: ["status", "score", "metrics", "violations"],
    properties: {
      status: { type: "string", enum: ["passed", "warning", "failed"] },
      score: { type: "integer", minimum: 0, maximum: 100 },
      metrics: {
        type: "object",
        required: ["total", "failed", "broken", "unknown", "passed", "skipped", "passRate"],
        properties: {
          total: { type: "integer", minimum: 0 },
          failed: { type: "integer", minimum: 0 },
          broken: { type: "integer", minimum: 0 },
          unknown: { type: "integer", minimum: 0 },
          passed: { type: "integer", minimum: 0 },
          skipped: { type: "integer", minimum: 0 },
          passRate: { type: "number", minimum: 0, maximum: 100 }
        }
      },
      violations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          required: ["rule", "actual", "expected"],
          properties: {
            rule: { type: "object" },
            actual: { type: "number" },
            expected: { type: "number" }
          }
        }
      }
    }
  },
  "upload.session": uploadSessionSchema
} as const;
