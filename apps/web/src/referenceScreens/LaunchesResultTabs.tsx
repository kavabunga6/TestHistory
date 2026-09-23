import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { TestResult } from "../m1Workspace.js";
import { resultReportTabs, type ResultReportTab } from "./LaunchesReferenceModel.js";

type ScrollState = {
  overflowing: boolean;
  atStart: boolean;
  atEnd: boolean;
  clippedTabs: string[];
};

const compactTabLabels: Partial<Record<ResultReportTab, string>> = {
  history: "История"
};

export function ResultTabs({
  activeTab,
  isQuarantined,
  onSelectTab,
  result
}: {
  activeTab: ResultReportTab;
  isQuarantined: boolean;
  onSelectTab: (tab: ResultReportTab) => void;
  result: TestResult;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollState>({
    overflowing: false,
    atStart: true,
    atEnd: true,
    clippedTabs: []
  });

  const updateScrollState = useCallback(() => {
    const wrapper = wrapperRef.current;
    const tabs = tabsRef.current;
    const track = trackRef.current;
    if (wrapper === null || tabs === null || track === null) {
      return;
    }

    const styles = getComputedStyle(tabs);
    const horizontalPadding =
      (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    const overflowing = track.scrollWidth + horizontalPadding > wrapper.clientWidth + 1;
    const viewport = tabs.getBoundingClientRect();
    const clippedTabs = Array.from(track.querySelectorAll<HTMLButtonElement>("button"))
      .filter((button) => {
        const bounds = button.getBoundingClientRect();
        return (
          (bounds.left < viewport.left - 1 && bounds.right > viewport.left + 1) ||
          (bounds.right > viewport.right + 1 && bounds.left < viewport.right - 1)
        );
      })
      .map((button) => button.dataset.tabId ?? "");
    const next = {
      overflowing,
      atStart: tabs.scrollLeft <= 1,
      atEnd: tabs.scrollWidth - tabs.clientWidth - tabs.scrollLeft <= 1,
      clippedTabs
    };
    setScrollState((previous) =>
      previous.overflowing === next.overflowing &&
      previous.atStart === next.atStart &&
      previous.atEnd === next.atEnd &&
      previous.clippedTabs.join(",") === next.clippedTabs.join(",")
        ? previous
        : next
    );
  }, []);

  useLayoutEffect(() => {
    updateScrollState();
    const wrapper = wrapperRef.current;
    const tabs = tabsRef.current;
    const track = trackRef.current;
    if (wrapper === null || tabs === null || track === null) {
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateScrollState);
      return () => window.removeEventListener("resize", updateScrollState);
    }

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(wrapper);
    observer.observe(tabs);
    observer.observe(track);
    return () => observer.disconnect();
  }, [updateScrollState]);

  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const selected = tabs?.querySelector<HTMLElement>('[aria-current="page"]');
    if (tabs === null || selected === null || selected === undefined) {
      return;
    }

    const viewport = tabs.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    if (selectedBounds.left < viewport.left - 1) {
      tabs.scrollLeft += selectedBounds.left - viewport.left - 12;
    } else if (selectedBounds.right > viewport.right + 1) {
      tabs.scrollLeft += selectedBounds.right - viewport.right + 12;
    }
    updateScrollState();
  }, [activeTab, result.id, scrollState.overflowing, updateScrollState]);

  const scrollTabs = (direction: -1 | 1) => {
    const tabs = tabsRef.current;
    const track = trackRef.current;
    if (tabs === null || track === null) {
      return;
    }

    const viewport = tabs.getBoundingClientRect();
    const buttons = Array.from(track.querySelectorAll<HTMLButtonElement>("button"));
    const next =
      direction === 1
        ? buttons.find((button) => button.getBoundingClientRect().right > viewport.right + 1)
        : buttons
            .reverse()
            .find((button) => button.getBoundingClientRect().left < viewport.left - 1);
    if (next === undefined) {
      return;
    }

    const bounds = next.getBoundingClientRect();
    const delta =
      direction === 1 ? bounds.left - viewport.left - 8 : bounds.right - viewport.right + 8;
    tabs.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <div className="launches-reference-result-tabs-wrap" ref={wrapperRef}>
      {scrollState.overflowing ? (
        <button
          className="launches-reference-result-tab-scroll"
          type="button"
          aria-label="Прокрутить вкладки влево"
          title="Предыдущие вкладки"
          disabled={scrollState.atStart}
          onClick={() => scrollTabs(-1)}
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
      ) : null}
      <nav
        className="launches-reference-result-tabs"
        aria-label="Вкладки результата теста"
        ref={tabsRef}
        onScroll={updateScrollState}
      >
        <div className="launches-reference-result-tabs-track" ref={trackRef}>
          {resultReportTabs.map((tab) => {
            const count = tab.count?.(result);
            const disabled = tab.id === "quarantine" && !isQuarantined;

            return (
              <button
                className={activeTab === tab.id && !disabled ? "active" : ""}
                data-tab-id={tab.id}
                data-clipped={scrollState.clippedTabs.includes(tab.id) ? "true" : undefined}
                disabled={disabled}
                key={tab.id}
                type="button"
                aria-label={disabled ? `${tab.label}: результат не в карантине` : undefined}
                title={
                  disabled
                    ? "Результат не в карантине"
                    : tab.id === "attachments" && count !== undefined && count > 0
                      ? `Всего ${count} вложений в результате и его шагах`
                      : tab.label
                }
                aria-current={activeTab === tab.id && !disabled ? "page" : undefined}
                onClick={() => onSelectTab(tab.id)}
                onFocus={(event) => {
                  const viewport = tabsRef.current?.getBoundingClientRect();
                  if (viewport === undefined) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  if (bounds.left < viewport.left || bounds.right > viewport.right) {
                    event.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
                  }
                }}
              >
                {compactTabLabels[tab.id] ?? tab.label}
                {count !== undefined && count > 0 ? (
                  <span className="typography-role-meta">{count.toLocaleString("ru-RU")}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>
      {scrollState.overflowing ? (
        <button
          className="launches-reference-result-tab-scroll"
          type="button"
          aria-label="Прокрутить вкладки вправо"
          title="Следующие вкладки"
          disabled={scrollState.atEnd}
          onClick={() => scrollTabs(1)}
        >
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
