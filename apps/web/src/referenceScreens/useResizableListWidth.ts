import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

type ResizableListWidthOptions = {
  bodyClass: string;
  defaultWidth: number;
  maxWidth: number;
  minWidth: number;
  storageKey: string;
};

function clampWidth(value: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, Math.round(value)));
}

function readWidth({
  defaultWidth,
  maxWidth,
  minWidth,
  storageKey
}: ResizableListWidthOptions): number {
  if (typeof window === "undefined") {
    return defaultWidth;
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) {
      return defaultWidth;
    }
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? clampWidth(parsed, minWidth, maxWidth) : defaultWidth;
  } catch {
    return defaultWidth;
  }
}

export function useResizableListWidth(options: ResizableListWidthOptions) {
  const { bodyClass, maxWidth, minWidth, storageKey } = options;
  const [listWidth, setListWidth] = useState(() => readWidth(options));
  const [resizing, setResizing] = useState(false);
  const screenRef = useRef<HTMLElement | null>(null);

  const updateWidth = useCallback(
    (value: number) => {
      const nextWidth = clampWidth(value, minWidth, maxWidth);
      setListWidth(nextWidth);
      try {
        window.localStorage.setItem(storageKey, String(nextWidth));
      } catch {
        // Resizing still works for this visit when storage is unavailable.
      }
    },
    [maxWidth, minWidth, storageKey]
  );

  useEffect(() => {
    if (!resizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const screenLeft = screenRef.current?.getBoundingClientRect().left ?? 0;
      updateWidth(event.clientX - screenLeft);
    };
    const handlePointerEnd = () => setResizing(false);

    document.body.classList.add(bodyClass);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd, { once: true });
    window.addEventListener("pointercancel", handlePointerEnd, { once: true });

    return () => {
      document.body.classList.remove(bodyClass);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [bodyClass, resizing, updateWidth]);

  function onSeparatorKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    updateWidth(listWidth + (event.key === "ArrowLeft" ? -24 : 24));
  }

  function onSeparatorPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  }

  return { listWidth, onSeparatorKeyDown, onSeparatorPointerDown, resizing, screenRef };
}
