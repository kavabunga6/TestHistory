#!/usr/bin/env node
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const resultsDir = process.argv[2] ?? "allure-results";
const videoSource = process.argv[3] ?? "full-run-video.mp4";
const videoPath = path.join(resultsDir, videoSource);

async function main() {
  const videoStat = await stat(videoPath).catch(() => null);
  if (!videoStat || videoStat.size <= 0) {
    console.log(`Run video attachment skipped: ${videoPath} is missing or empty`);
    return;
  }

  const files = await readdir(resultsDir);
  const resultFiles = files.filter((file) => file.endsWith("-result.json"));
  let updated = 0;

  for (const file of resultFiles) {
    const fullPath = path.join(resultsDir, file);
    const result = JSON.parse(await readFile(fullPath, "utf8"));
    const attachments = Array.isArray(result.attachments) ? result.attachments : [];
    const alreadyAttached = attachments.some(
      (attachment) => attachment?.source === videoSource && attachment?.type === "video/mp4",
    );
    if (!alreadyAttached) {
      attachments.push({
        name: "Full test run video",
        source: videoSource,
        type: "video/mp4",
      });
      result.attachments = attachments;
      await writeFile(fullPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      updated += 1;
    }
  }

  console.log(`Run video attached to ${updated} Allure result files`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
