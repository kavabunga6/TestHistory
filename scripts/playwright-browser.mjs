import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

export async function launchChromiumWithFallback(options = {}) {
  const launchOptions = { headless: true, ...options };
  const failures = [];

  for (const candidate of buildLaunchCandidates(launchOptions)) {
    try {
      return await chromium.launch(candidate.options);
    } catch (error) {
      failures.push(`${candidate.label}: ${formatError(error)}`);
    }
  }

  throw new Error(
    [
      "Playwright browser executable is unavailable.",
      "Run `npx playwright install chromium` before browser evidence guards.",
      ...failures
    ].join("\n")
  );
}

function buildLaunchCandidates(launchOptions) {
  const candidates = [
    { label: "Installed Google Chrome channel", options: { ...launchOptions, channel: "chrome" } },
    { label: "Playwright managed Chromium", options: launchOptions }
  ];
  const playwrightPath = safeExecutablePath();
  if (playwrightPath !== undefined) {
    candidates.push({
      label: "Playwright executablePath()",
      options: { ...launchOptions, executablePath: playwrightPath }
    });
  }

  for (const executablePath of findInstalledChromiumExecutables()) {
    candidates.push({
      label: `Installed Chromium executable ${executablePath}`,
      options: { ...launchOptions, executablePath }
    });
  }

  return candidates;
}

function safeExecutablePath() {
  try {
    const executablePath = chromium.executablePath();
    return existsSync(executablePath) ? executablePath : undefined;
  } catch {
    return undefined;
  }
}

function findInstalledChromiumExecutables() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright")
      : path.join(os.homedir(), ".cache", "ms-playwright")
  ].filter((value) => value !== undefined && value !== "");

  const relativeCandidates =
    process.platform === "win32"
      ? ["chrome-win64/chrome.exe", "chrome-headless-shell-win64/chrome-headless-shell.exe"]
      : process.platform === "darwin"
        ? [
            "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
            "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
            "chrome-headless-shell-mac/headless_shell",
            "chrome-headless-shell-mac-arm64/headless_shell"
          ]
        : ["chrome-linux/chrome", "chrome-headless-shell-linux/headless_shell"];

  const found = new Set();
  for (const root of roots) {
    for (const browserFolder of ["chromium-*", "chromium_headless_shell-*"]) {
      const basePattern = path.join(root, browserFolder);
      for (const executablePath of expandBrowserPattern(basePattern, relativeCandidates)) {
        found.add(executablePath);
      }
    }
  }

  return [...found];
}

function expandBrowserPattern(basePattern, relativeCandidates) {
  const root = path.dirname(basePattern);
  const prefix = path.basename(basePattern).replace("*", "");
  if (!existsSync(root)) {
    return [];
  }

  let folders = [];
  try {
    folders = requireDirectoryEntries(root, prefix);
  } catch {
    return [];
  }

  return folders.flatMap((folder) =>
    relativeCandidates
      .map((relativePath) => path.join(root, folder, relativePath))
      .filter((executablePath) => existsSync(executablePath))
  );
}

function requireDirectoryEntries(root, prefix) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name);
}

function formatError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  return error.message.split("\n").slice(0, 4).join("\n");
}
