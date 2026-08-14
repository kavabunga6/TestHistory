import { AlertCircle, MousePointer2, RefreshCw } from "lucide-react";

export function ReferenceRouteState({
  compact = false,
  kind,
  text,
  title
}: {
  compact?: boolean | undefined;
  kind: "empty" | "loading" | "partial";
  text: string;
  title: string;
}) {
  return (
    <div className={`launches-reference-route-state ${kind}${compact ? " compact" : ""}`}>
      {kind === "loading" ? (
        <RefreshCw
          aria-hidden="true"
          className="launches-reference-route-state-spinner"
          size={18}
        />
      ) : kind === "partial" ? (
        <AlertCircle aria-hidden="true" size={18} />
      ) : (
        <MousePointer2 aria-hidden="true" size={18} />
      )}
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </div>
  );
}
