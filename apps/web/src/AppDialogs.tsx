import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useRef } from "react";

import type { TestResult } from "./m1Workspace.js";

export type ConfirmDeleteRequest = {
  body: string;
  confirmLabel: string;
  title: string;
  onConfirm: () => void;
};

export type QuarantineRequest = {
  result: TestResult;
};

export type QuarantineFormData = {
  creator: string;
  defectId: string;
  reason: string;
  taskId: string;
};

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

export function useModalDialog<T extends HTMLElement>(onClose: () => void, active = true) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    if (!active) {
      return;
    }

    onCloseRef.current = onClose;
  }, [active, onClose]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const dialog = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    dialog?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || dialog === null) {
        return;
      }

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.getAttribute("aria-hidden") !== "true"
      );
      const first = focusable[0];
      const last = focusable.at(-1);

      if (first === undefined || last === undefined) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [active]);

  return dialogRef;
}
export function ConfirmDeleteDialog({
  onCancel,
  onConfirm,
  request
}: {
  onCancel: () => void;
  onConfirm: () => void;
  request?: ConfirmDeleteRequest | undefined;
}) {
  const dialogRef = useModalDialog<HTMLElement>(onCancel, request !== undefined);

  if (request === undefined) {
    return null;
  }

  return (
    <div className="confirm-delete-backdrop" role="presentation">
      <section
        ref={dialogRef}
        aria-describedby="confirm-delete-description"
        aria-labelledby="confirm-delete-title"
        aria-modal="true"
        className="confirm-delete-dialog"
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <AlertTriangle aria-hidden="true" size={20} />
          <h2 id="confirm-delete-title">{request.title}</h2>
        </header>
        <div className="confirm-delete-dialog__body">
          <p id="confirm-delete-description">{request.body}</p>
        </div>
        <footer>
          <button className="confirm-delete-secondary" type="button" onClick={onCancel}>
            Отмена
          </button>
          <button className="confirm-delete-danger" type="button" onClick={onConfirm}>
            {request.confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function QuarantineDialog({
  onCancel,
  onConfirm,
  request
}: {
  onCancel: () => void;
  onConfirm: (data: QuarantineFormData) => void;
  request?: QuarantineRequest | undefined;
}) {
  const [reason, setReason] = useState("");
  const [creator, setCreator] = useState("");
  const [defectId, setDefectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const dialogRef = useModalDialog<HTMLFormElement>(onCancel, request !== undefined);

  useEffect(() => {
    if (request !== undefined) {
      setReason("");
      setCreator(request.result.defectMute?.actor ?? "");
      setDefectId(request.result.defect ?? request.result.issues[0] ?? "");
      setTaskId(request.result.testKeys[0] ?? "");
    }
  }, [request]);

  if (request === undefined) {
    return null;
  }

  const submitQuarantine = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reason.trim() === "") {
      return;
    }
    onConfirm({ creator, defectId, reason, taskId });
  };

  return (
    <div className="confirm-delete-backdrop" role="presentation">
      <form
        ref={dialogRef}
        aria-describedby="quarantine-dialog-result"
        aria-labelledby="quarantine-dialog-title"
        aria-modal="true"
        className="quarantine-dialog"
        role="dialog"
        tabIndex={-1}
        onSubmit={submitQuarantine}
      >
        <header>
          <AlertTriangle aria-hidden="true" size={20} />
          <span>
            <h2 id="quarantine-dialog-title">Перенести результат в карантин</h2>
            <small id="quarantine-dialog-result">{request.result.name}</small>
          </span>
        </header>

        <div className="quarantine-dialog__body">
          <label>
            <span>Причина</span>
            <textarea
              required
              placeholder="Например: известный дефект оплаты, ждем исправление в релизе"
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          <div className="quarantine-dialog-grid">
            <label>
              <span>Создатель</span>
              <input
                placeholder="qa-lead"
                value={creator}
                onChange={(event) => setCreator(event.target.value)}
              />
            </label>
            <label>
              <span>Дефект</span>
              <input
                placeholder="PAY-337"
                value={defectId}
                onChange={(event) => setDefectId(event.target.value)}
              />
            </label>
            <label>
              <span>Задача</span>
              <input
                placeholder="QA-1289"
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
              />
            </label>
          </div>
        </div>

        <footer>
          <button className="confirm-delete-secondary" type="button" onClick={onCancel}>
            Отмена
          </button>
          <button
            className="confirm-delete-danger"
            disabled={reason.trim() === ""}
            title={reason.trim() === "" ? "Укажите причину карантина" : undefined}
            type="submit"
          >
            В карантин
          </button>
        </footer>
      </form>
    </div>
  );
}
