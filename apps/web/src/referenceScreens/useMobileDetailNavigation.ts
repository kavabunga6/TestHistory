import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export function useMobileWidth(breakpoint: number): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= breakpoint
  );

  useEffect(() => {
    const update = () => setMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, [breakpoint]);

  return mobile;
}

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
      if (window.innerWidth <= breakpoint && screenRef.current) screenRef.current.scrollTop = 0;
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
