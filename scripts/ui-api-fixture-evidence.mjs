import { createHash } from "node:crypto";

const screenshotSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200" viewBox="0 0 360 200"><rect width="360" height="200" rx="16" fill="#f3f6fa"/><rect width="360" height="42" rx="16" fill="#213447"/><rect y="30" width="360" height="12" fill="#213447"/><circle cx="24" cy="21" r="5" fill="#ed6a5f"/><circle cx="41" cy="21" r="5" fill="#f5bf4f"/><circle cx="58" cy="21" r="5" fill="#62c554"/><rect x="26" y="65" width="170" height="15" rx="6" fill="#587ba0"/><rect x="26" y="97" width="305" height="10" rx="5" fill="#bdccd9"/><rect x="26" y="118" width="252" height="10" rx="5" fill="#bdccd9"/><rect x="26" y="151" width="100" height="26" rx="8" fill="#2d9573"/></svg>`;
const screenshotPreviewUrl = `data:image/svg+xml;base64,${Buffer.from(screenshotSvg).toString("base64")}`;
function createTextAttachment(item, suffix, content, type = "text/plain") {
  const source = `${item.uuid}-${suffix}`;
  const bytes = Buffer.byteLength(content);
  const json = type === "application/json";
  return {
    name: suffix,
    type,
    source,
    size: bytes,
    preview: {
      id: `preview-${source}`,
      artifactId: `artifact-${source}`,
      kind: json ? "json" : "text",
      flavor: json ? "json" : "log",
      support: "inline",
      status: "ready",
      reason: "eligible",
      originalBytes: bytes,
      previewBytes: bytes,
      maxPreviewBytes: 4096,
      contentType: type,
      sha256: createHash("sha256").update(content).digest("hex"),
      body: {
        type: "redacted-text",
        encoding: "utf8",
        value: content,
        lineCount: content.split("\n").length,
        truncated: false,
        redacted: false
      },
      safety: {
        descriptorVersion: 1,
        bounded: true,
        pathIncluded: false,
        storageKeyIncluded: false,
        rawPayloadIncluded: false,
        blobIncluded: false,
        signedUrlIncluded: false,
        redactionApplied: false
      }
    }
  };
}

function createScreenshotAttachment(item) {
  return {
    name: "screenshot.svg",
    type: "image/svg+xml",
    source: `${item.uuid}-screenshot.svg`,
    size: Buffer.byteLength(screenshotSvg),
    previewUrl: screenshotPreviewUrl
  };
}

function createVideoAttachment(item) {
  return {
    name: "screen-recording.mp4",
    type: "video/mp4",
    source: `${item.uuid}-screen-recording.mp4`,
    size: 2048
  };
}

function createResultSteps(item, index) {
  const terminalStatus = item.status;
  const depth = index === 0 ? 6 : 2 + (index % 5);
  let nested = {
    name: "Проверить итоговое состояние",
    status: terminalStatus,
    start: 300,
    stop: item.durationMs - 40,
    attachments: [
      createScreenshotAttachment(item),
      createTextAttachment(
        item,
        "assertion.json",
        JSON.stringify({ testId: item.uuid, status: item.status }, null, 2),
        "application/json"
      )
    ]
  };
  for (let level = depth - 1; level >= 1; level -= 1) {
    const start = 100 + level * 20;
    nested = {
      name: `Шаг уровня ${level}: ${level % 2 === 0 ? "проверить ответ" : "выполнить действие"}`,
      status: terminalStatus,
      start,
      stop: item.durationMs - 40,
      steps: [
        {
          name: `Подготовить данные уровня ${level}`,
          status: "passed",
          start: start + 5,
          stop: start + 15
        },
        nested
      ]
    };
  }
  return [
    {
      name: "Подготовить окружение",
      status: "passed",
      start: 0,
      stop: 100,
      attachments: [
        createTextAttachment(
          item,
          "environment.log",
          `result=${item.uuid}\nenvironment=staging\nready=true`
        )
      ]
    },
    nested,
    {
      name: "Собрать диагностические данные",
      status: "passed",
      start: item.durationMs - 40,
      stop: item.durationMs
    }
  ];
}

function createResultDetails(item, index) {
  return {
    ...item,
    steps: createResultSteps(item, index),
    attachments: [
      createScreenshotAttachment(item),
      createTextAttachment(
        item,
        "test.log",
        `result=${item.uuid}\nstatus=${item.status}\ndurationMs=${item.durationMs}`
      ),
      ...(index % 10 === 0 ? [createVideoAttachment(item)] : [])
    ],
    links: item.raw.links
  };
}

export { createResultDetails };
