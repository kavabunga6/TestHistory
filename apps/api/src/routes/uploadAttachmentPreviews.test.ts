import { afterEach, describe, expect, it } from "vitest";
import {
  buildAttachmentFileIndex,
  enrichResultAttachmentPreviews
} from "./uploadAttachmentPreviews.js";

const originalNodeEnvironment = process.env.NODE_ENV;
const originalInlineSetting = process.env.TESTHISTORY_LOCAL_INLINE_ATTACHMENTS;

describe("local attachment previews", () => {
  afterEach(() => {
    restoreEnvironment("NODE_ENV", originalNodeEnvironment);
    restoreEnvironment("TESTHISTORY_LOCAL_INLINE_ATTACHMENTS", originalInlineSetting);
  });

  it("adds a bounded inline image URL for local UI checks", () => {
    process.env.NODE_ENV = "development";
    const result = resultWithImage();

    enrichResultAttachmentPreviews(
      result,
      buildAttachmentFileIndex([{ path: "screen.png", content: Buffer.from("png-bytes") }])
    );

    expect(result.attachments[0]?.previewUrl).toBe(
      `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`
    );
    expect(result.raw.attachments[0]?.previewUrl).toBeUndefined();
  });

  it("does not expose inline image payloads outside development", () => {
    process.env.NODE_ENV = "production";
    const result = resultWithImage();

    enrichResultAttachmentPreviews(
      result,
      buildAttachmentFileIndex([{ path: "screen.png", content: Buffer.from("png-bytes") }])
    );

    expect(result.attachments[0]?.previewUrl).toBeUndefined();
  });

  it("keeps oversized local images metadata-only", () => {
    process.env.NODE_ENV = "development";
    const result = resultWithImage();

    enrichResultAttachmentPreviews(
      result,
      buildAttachmentFileIndex([{ path: "screen.png", content: Buffer.alloc(256 * 1024 + 1, 1) }])
    );

    expect(result.attachments[0]?.previewUrl).toBeUndefined();
    expect(result.attachments[0]?.preview?.support).toBe("metadata-only");
  });

  it("creates on-demand preview references for text, json, and xml attachments", () => {
    const files = [
      { path: "console.log", content: Buffer.from(`token=do-not-expose\n${"x".repeat(20_000)}`) },
      {
        path: "payload.json",
        content: Buffer.from('{"password":"do-not-expose","value":42}')
      },
      { path: "response.xml", content: Buffer.from("<response><value>ok</value></response>") }
    ];
    const result = resultWithAttachments([
      { name: "Console", source: "console.log", type: "text/plain" },
      { name: "Payload", source: "payload.json", type: "application/json" },
      { name: "Response", source: "response.xml", type: "application/xml" }
    ]);

    enrichResultAttachmentPreviews(result, buildAttachmentFileIndex(files));

    expect(result.attachments.map((attachment) => attachment.preview?.kind)).toEqual([
      "text",
      "json",
      "xml"
    ]);
    expect(
      result.attachments.every((attachment) => attachment.preview?.support === "metadata-only")
    ).toBe(true);
    expect(JSON.stringify(result.attachments)).not.toContain("do-not-expose");
    expect(result.attachments[0]?.preview?.previewBytes).toBe(0);
    expect(result.raw.attachments.every((attachment) => attachment.preview === undefined)).toBe(
      true
    );
  });

  it("does not inline executable text formats", () => {
    const result = resultWithAttachments([
      { name: "Report", source: "report.html", type: "text/html" }
    ]);

    enrichResultAttachmentPreviews(
      result,
      buildAttachmentFileIndex([
        { path: "report.html", content: Buffer.from("<script>alert(1)</script>") }
      ])
    );

    expect(result.attachments[0]?.preview).toBeUndefined();
  });
});

function resultWithImage() {
  return resultWithAttachments([{ name: "Screenshot", source: "screen.png", type: "image/png" }]);
}

function resultWithAttachments(attachments: MutableAttachment[]) {
  return {
    attachments: structuredClone(attachments),
    raw: {
      attachments: structuredClone(attachments)
    },
    steps: []
  } as {
    attachments: MutableAttachment[];
    raw: { attachments: MutableAttachment[] };
    steps: unknown[];
  };
}

type MutableAttachment = {
  name: string;
  source: string;
  type: string;
  previewUrl?: string;
  preview?: {
    body?: { redacted?: boolean; truncated?: boolean; type: string };
    kind?: string;
    previewBytes?: number;
    support: string;
  };
};

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
