import {
  createArtifactPreviewDescriptor,
  prepareArtifact,
  type ArtifactDescriptor,
  type ArtifactPreviewDescriptor
} from "@testhistory/artifacts";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createApiApp } from "../app.js";
import { createLaunch } from "../appTestHelpers.js";
import { createAppStore } from "../store.js";
import { addArtifactPreviewReferences } from "./artifactPreviewReferences.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("result attachment preview references", () => {
  it("exposes a stored nested screenshot through the result detail API", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const upload = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "nested-screenshot-result.json",
            content: JSON.stringify({
              uuid: "nested-screenshot-result",
              name: "Screenshot result",
              status: "failed",
              steps: [
                {
                  name: "Parent",
                  status: "failed",
                  steps: [
                    {
                      name: "Screenshot",
                      status: "passed",
                      attachments: [
                        {
                          name: "Evidence",
                          source: "screens/evidence.png",
                          type: "image/png",
                          previewUrl: "data:image/svg+xml;base64,spoofed"
                        }
                      ]
                    }
                  ]
                }
              ]
            })
          },
          { path: "screens/evidence.png", content: "stored image bytes" }
        ]
      }
    });
    expect(upload.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/results/nested-screenshot-result`
    });
    const detail = response.json<{
      steps: Array<{
        steps: Array<{ attachments: TestAttachment[] }>;
      }>;
    }>();
    expect(response.statusCode).toBe(200);
    const attachment = detail.steps[0]?.steps[0]?.attachments[0];
    expect(attachment?.preview).toMatchObject({
      artifactId: expect.any(String),
      contentType: "image/png",
      kind: "image",
      support: "metadata-only"
    });
    expect(attachment?.previewUrl).toBeUndefined();
    expect(JSON.stringify(attachment?.preview)).not.toContain("stored image bytes");
  });

  it("adds metadata-only image references to root and nested step attachments", () => {
    const paths = [
      "screens/root.png",
      "screens/nested.jpg",
      "screens/deep.webp",
      "screens/animated.gif"
    ];
    const artifacts = paths.map((path) => artifactForPath(path));
    const input: { attachments: TestAttachment[]; steps: TestStep[] } = {
      attachments: [
        {
          source: paths[0]!,
          type: "image/png",
          previewUrl: "data:image/svg+xml;base64,spoofed",
          preview: createArtifactPreviewDescriptor({ artifact: artifactForPath("spoofed.png") })
        }
      ],
      steps: [
        {
          attachments: [{ source: paths[1]!, type: "image/jpeg" }],
          steps: [
            {
              attachments: [
                { source: paths[2]!, type: "image/webp" },
                { source: paths[3]!, type: "image/gif" }
              ],
              steps: []
            }
          ]
        }
      ]
    };
    const details = addArtifactPreviewReferences(input, artifacts);

    const attachments = [
      ...details.attachments,
      ...details.steps[0]!.attachments,
      ...details.steps[0]!.steps[0]!.attachments
    ];
    expect(attachments.map((attachment) => attachment.preview?.artifactId)).toEqual(
      artifacts.map((artifact) => artifact.id)
    );
    expect(attachments.map((attachment) => attachment.preview?.contentType)).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif"
    ]);
    for (const attachment of attachments) {
      expect(attachment.preview).toMatchObject({
        kind: "image",
        support: "metadata-only",
        status: "metadata-only",
        body: { type: "image-metadata", inline: false, downloadRequired: true },
        safety: {
          pathIncluded: false,
          storageKeyIncluded: false,
          rawPayloadIncluded: false,
          blobIncluded: false,
          signedUrlIncluded: false
        }
      });
      expect(attachment).not.toHaveProperty("previewUrl");
      expect(JSON.stringify(attachment.preview)).not.toContain(attachment.source);
    }
  });

  it("keeps text preview references and excludes SVG even when its MIME is spoofed", () => {
    const text = artifactForPath("logs/run.log");
    const svg = artifactForPath("screens/vector.svg", "image/png");
    const mismatched = artifactForPath("screens/mismatch.png", "image/svg+xml");
    const input: { attachments: TestAttachment[]; steps: TestStep[] } = {
      attachments: [
        { source: text.path, type: "text/plain" },
        { source: svg.path, type: "image/png", previewUrl: "data:image/svg+xml;base64,unsafe" },
        { source: mismatched.path, type: "image/png" }
      ],
      steps: []
    };
    const details = addArtifactPreviewReferences(input, [text, svg, mismatched]);

    expect(details.attachments[0]?.preview).toMatchObject({
      artifactId: text.id,
      kind: "text",
      support: "metadata-only"
    });
    expect(details.attachments[1]?.preview).toBeUndefined();
    expect(details.attachments[1]?.previewUrl).toBeUndefined();
    expect(details.attachments[2]?.preview).toBeUndefined();
  });

  it("removes imported preview fields when a nested image has no stored artifact", () => {
    const orphan = artifactForPath("screens/orphan.png");
    const input: { attachments: TestAttachment[]; steps: TestStep[] } = {
      attachments: [],
      steps: [
        {
          attachments: [
            {
              source: orphan.path,
              type: "image/png",
              preview: createArtifactPreviewDescriptor({ artifact: orphan }),
              previewUrl: "data:image/png;base64,spoofed"
            }
          ],
          steps: []
        }
      ]
    };

    const details = addArtifactPreviewReferences(input, []);
    expect(details.steps[0]?.attachments[0]).toEqual({
      source: orphan.path,
      type: "image/png"
    });
  });
});

type TestAttachment = {
  source: string;
  type?: string;
  preview?: ArtifactPreviewDescriptor;
  previewUrl?: string;
};

type TestStep = {
  attachments: TestAttachment[];
  steps: TestStep[];
};

function artifactForPath(path: string, contentType?: string): ArtifactDescriptor {
  const { payload: _payload, ...artifact } = prepareArtifact({
    launchId: "launch-preview",
    path,
    content: Buffer.from("binary attachment"),
    ...(contentType !== undefined ? { contentType } : {})
  });
  return artifact;
}
