import { AlertCircle, CheckCircle2, CircleDashed, PauseCircle, XCircle } from "lucide-react";

import type { ResultStatus } from "../m1Workspace.js";

export function StatusIcon({ size = 16, status }: { size?: number; status: ResultStatus }) {
  if (status === "muted") {
    return <PauseCircle className="status-muted" size={size} />;
  }
  if (status === "passed") {
    return <CheckCircle2 className="status-passed" size={size} />;
  }
  if (status === "failed") {
    return <XCircle className="status-failed" size={size} />;
  }
  if (status === "broken") {
    return <AlertCircle className="status-broken" size={size} />;
  }
  return <CircleDashed className="status-skipped" size={size} />;
}
