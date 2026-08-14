import { spawn } from "node:child_process";
import path from "node:path";

export function startPreviewServer({ port, workspace }) {
  return spawn(
    process.execPath,
    [
      path.join(workspace, "node_modules", "vite", "bin", "vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort"
    ],
    {
      cwd: path.join(workspace, "apps", "web"),
      detached: process.platform !== "win32",
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
}

export function stopPreviewServer(child) {
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (child.pid === undefined) {
    return;
  }

  try {
    child.kill();
  } catch {
    // The process may already be gone after a successful guard run.
  }

  if (process.platform === "win32") {
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // The direct child.kill() above already handled a non-detached process.
  }
}
