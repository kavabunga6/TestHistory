import { Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function ResultIdCopy({ resultId }: { resultId: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => setCopyState("idle"), [resultId]);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(resultId);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <div className="tc-detail-reference-result-id">
      <code title={resultId}>ID результата: {resultId}</code>
      <button
        aria-label={`Скопировать ID результата ${resultId}`}
        onClick={() => void copyId()}
        title="Скопировать ID результата"
        type="button"
      >
        <Copy aria-hidden="true" size={14} />
        Копировать
      </button>
      {copyState !== "idle" ? (
        <span aria-live="polite" role="status">
          {copyState === "copied" ? "Скопировано" : "Не удалось скопировать"}
        </span>
      ) : null}
    </div>
  );
}
