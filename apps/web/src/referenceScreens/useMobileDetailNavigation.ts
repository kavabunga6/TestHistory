import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

export function useMobileDetailNavigation(
  screenRef: RefObject<HTMLElement | null>,
  selectedId: string | undefined,
  breakpoint: number
) {
  const revealedId = useRef<string | undefined>(undefined);
  const showDetail = useCallback(() => {
    if (window.innerWidth > breakpoint) return false;

    const screen = screenRef.current;
    const detail = screen?.querySelector<HTMLElement>("[data-mobile-selected-detail]");
    if (screen === null || screen === undefined || detail === null || detail === undefined) {
      return false;
    }

    screen.scrollTop += detail.getBoundingClientRect().top - screen.getBoundingClientRect().top;
    return true;
  }, [breakpoint, screenRef]);

  useLayoutEffect(() => {
    if (!selectedId) {
      revealedId.current = undefined;
      return;
    }
    if (revealedId.current === selectedId) return;
    if (showDetail()) revealedId.current = selectedId;
  }, [selectedId, showDetail]);

  const showList = useCallback(
    () => screenRef.current?.scrollTo({ top: 0, behavior: "smooth" }),
    [screenRef]
  );

  return { showDetail, showList };
}
