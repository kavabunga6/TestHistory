import {
  createArtifactPreviewDescriptorFromContent,
  detectArtifactContentType,
  restoreArtifactPayload
} from "@testhistory/artifacts";
import type { FastifyInstance } from "fastify";
import { basename } from "node:path";

import type { AppStore } from "../store.js";
import { authorizeArtifactRetentionRequest } from "./artifactRetentionAuth.js";
import {
  isSafeTextPreviewContentType,
  maxBrowserTextPreviewBytes
} from "./uploadAttachmentPreviews.js";

export function registerArtifactContentRoute(app: FastifyInstance, store: AppStore) {
  app.get<{ Params: { artifactId: string } }>(
    "/api/v1/artifacts/:artifactId/preview",
    {
      schema: {
        tags: ["artifacts"],
        params: {
          type: "object",
          additionalProperties: false,
          required: ["artifactId"],
          properties: { artifactId: { type: "string", minLength: 1 } }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true },
          413: { type: "object", additionalProperties: true },
          415: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const resolved = resolveAuthorizedArtifact(request.params.artifactId, request, store);
      if ("statusCode" in resolved) {
        return reply.code(resolved.statusCode).send(resolved.body);
      }

      const { artifact } = resolved;
      if (artifact.originalBytes > maxBrowserTextPreviewBytes) {
        return reply.code(413).send({
          code: "ARTIFACT_PREVIEW_TOO_LARGE",
          message: "Artifact is too large for browser preview",
          maxPreviewBytes: maxBrowserTextPreviewBytes,
          redacted: true
        });
      }
      const object = await store.artifactObjects.getObject(artifact.storageKey);
      if (object === undefined) {
        return reply.code(404).send({ message: "Artifact content not found", redacted: true });
      }
      const contentType = detectArtifactContentType(
        artifact.path,
        artifact.contentType ?? object.contentType
      );
      if (contentType === undefined || !isSafeTextPreviewContentType(contentType)) {
        return reply.code(415).send({ message: "Artifact preview is unavailable", redacted: true });
      }

      const content = restoreArtifactPayload({
        ...artifact,
        contentType,
        payload: object.body
      });
      const preview = createArtifactPreviewDescriptorFromContent({
        artifactId: artifact.id,
        content,
        contentType,
        maxPreviewBytes: maxBrowserTextPreviewBytes,
        path: artifact.path
      });
      if (preview.sha256 !== artifact.sha256) {
        return reply.code(404).send({ message: "Artifact content not found", redacted: true });
      }

      reply.header("cache-control", "private, no-store");
      reply.header("content-security-policy", "sandbox; default-src 'none'");
      reply.header("x-content-type-options", "nosniff");
      return preview;
    }
  );

  app.get<{ Params: { artifactId: string } }>(
    "/api/v1/artifacts/:artifactId/content",
    {
      schema: {
        tags: ["artifacts"],
        params: {
          type: "object",
          additionalProperties: false,
          required: ["artifactId"],
          properties: { artifactId: { type: "string", minLength: 1 } }
        },
        response: {
          200: { type: "string", format: "binary" },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const resolved = resolveAuthorizedArtifact(request.params.artifactId, request, store);
      if ("statusCode" in resolved) {
        return reply.code(resolved.statusCode).send(resolved.body);
      }
      const { artifact } = resolved;

      const object = await store.artifactObjects.getObject(artifact.storageKey);
      if (object === undefined) {
        return reply.code(404).send({ message: "Artifact content not found", redacted: true });
      }
      const downloadName =
        basename(artifact.path).replace(/[^\x20-\x21\x23-\x7e]/g, "_") || "artifact";
      reply.header("cache-control", "private, no-store");
      reply.header("content-disposition", `inline; filename="${downloadName}"`);
      reply.header("content-type", artifact.contentType ?? "application/octet-stream");
      reply.header("x-content-type-options", "nosniff");
      if (object.compression === "gzip") {
        reply.header("content-encoding", "gzip");
      }
      return reply.send(object.body);
    }
  );
}

function resolveAuthorizedArtifact(
  artifactId: string,
  request: Parameters<typeof authorizeArtifactRetentionRequest>[0],
  store: AppStore
) {
  const artifact = store.artifacts.get(artifactId);
  if (artifact === undefined) {
    return { statusCode: 404 as const, body: { message: "Artifact not found", redacted: true } };
  }
  const projectId = artifact.projectId ?? store.launches.get(artifact.launchId)?.projectId;
  if (projectId === undefined) {
    return {
      statusCode: 404 as const,
      body: { message: "Artifact project not found", redacted: true }
    };
  }
  const authorizationDenial = authorizeArtifactRetentionRequest(request, store, projectId, false);
  if (authorizationDenial !== undefined) {
    return { statusCode: 403 as const, body: authorizationDenial };
  }
  return { artifact };
}
