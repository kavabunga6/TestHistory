import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ExternalLink,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  UploadCloud
} from "lucide-react";

import type { ApiState } from "./api.js";
import { ApiStateNotice } from "./ApiStateNotice.js";
import type { LaunchListItem, ResultStatus, TestResult } from "./m1Workspace.js";
import {
  EmptyState,
  formatListCount,
  HistoryDots,
  ListWindowFooter,
  ReadOnlyAction,
  StatusBadge
} from "./workspaceCommon.js";
import {
  formatLaunchState,
  LAUNCH_PAGE_SIZE,
  LIST_PAGE_SIZE,
  statusLabels
} from "./workspaceRouting.js";
export function LaunchWorkspace({
  apiState,
  launchItems,
  results,
  selected,
  selectedId,
  onSelect
}: {
  apiState: ApiState;
  launchItems: LaunchListItem[];
  results: TestResult[];
  selected: TestResult;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [selectedLaunchId, setSelectedLaunchId] = useState(launchItems[0]!.id);
  const [launchQuery, setLaunchQuery] = useState("");
  const filteredLaunchItems = useMemo(
    () => filterLaunchItems(launchItems, launchQuery),
    [launchItems, launchQuery]
  );
  const selectedLaunch =
    filteredLaunchItems.find((item) => item.id === selectedLaunchId) ?? filteredLaunchItems[0];
  const visibleResults = results.slice(0, LIST_PAGE_SIZE);

  useEffect(() => {
    if (filteredLaunchItems.length === 0) {
      return;
    }

    setSelectedLaunchId((currentId) =>
      filteredLaunchItems.some((item) => item.id === currentId)
        ? currentId
        : filteredLaunchItems[0]!.id
    );
  }, [filteredLaunchItems]);

  return (
    <section className="launches-page" aria-label="пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ">
      <div className="launches-header">
        <div>
          <span className="eyebrow">пїЅпїЅпїЅпїЅпїЅпїЅпїЅ</span>
          <h2>пїЅпїЅпїЅпїЅпїЅпїЅпїЅ</h2>
        </div>
        <div className="toolbar">
          <ReadOnlyAction
            icon={<UploadCloud size={16} />}
            label="пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ API"
          />
          <ReadOnlyAction
            icon={<SlidersHorizontal size={16} />}
            label="пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
          />
        </div>
      </div>

      <label className="launch-search-field">
        <Search size={17} />
        <input
          aria-label="пїЅпїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
          placeholder="пїЅпїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
          value={launchQuery}
          onChange={(event) => setLaunchQuery(event.target.value)}
          type="search"
        />
        <span className="ready-pill">пїЅпїЅпїЅпїЅпїЅпїЅ</span>
      </label>

      <div className="launches-strip">
        <span>пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ</span>
        <strong>
          пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ: {formatListCount(filteredLaunchItems.length)} пїЅпїЅ{" "}
          {formatListCount(launchItems.length)}
        </strong>
      </div>

      {apiState.denied !== undefined || apiState.loading || apiState.error !== undefined ? (
        <ApiStateNotice
          apiState={apiState}
          readyText="пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ."
          scope="пїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
        />
      ) : null}

      <section className="launch-master-detail">
        <LaunchList
          launchItems={filteredLaunchItems}
          selectedLaunchId={selectedLaunch?.id ?? ""}
          onSelect={setSelectedLaunchId}
        />
        {selectedLaunch !== undefined ? (
          <section
            className="launch-detail-panel"
            aria-label="пїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
          >
            <LaunchReportHeader counts={selectedLaunch.counters} launch={selectedLaunch} />
            <section
              className="launch-results-section"
              aria-label="пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
            >
              <div className="launch-results-heading">
                <div>
                  <span className="eyebrow">пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ</span>
                  <h3>пїЅпїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ</h3>
                </div>
                <span>{formatListCount(results.length)}</span>
              </div>
              <div className="result-table compact">
                <div className="result-row head">
                  <span>пїЅпїЅпїЅпїЅпїЅпїЅ</span>
                  <span>пїЅпїЅпїЅпїЅ</span>
                  <span>пїЅпїЅпїЅпїЅпїЅ</span>
                  <span>пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ</span>
                  <span>пїЅпїЅпїЅпїЅпїЅ</span>
                  <span>пїЅпїЅпїЅпїЅпїЅпїЅпїЅ</span>
                </div>
                {visibleResults.map((result) => (
                  <button
                    className={`result-row ${selectedId === result.id ? "selected" : ""}`}
                    key={result.id}
                    type="button"
                    onClick={() => onSelect(result.id)}
                  >
                    <StatusBadge status={result.status} />
                    <span>
                      <strong>{result.name}</strong>
                      <small>{result.id}</small>
                    </span>
                    <span>{result.suite}</span>
                    <span>{result.owner}</span>
                    <span>{result.duration}</span>
                    <HistoryDots history={result.history} />
                  </button>
                ))}
              </div>
              <ListWindowFooter rendered={visibleResults.length} total={results.length} />
            </section>
            <LaunchResultPreview result={selected} />
          </section>
        ) : (
          <EmptyState
            title="пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
            copy="пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ."
          />
        )}
      </section>
    </section>
  );
}

export function filterLaunchItems(launchItems: LaunchListItem[], query: string): LaunchListItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return launchItems;
  }

  return launchItems.filter((item) =>
    [
      item.id,
      item.name,
      item.state,
      item.defects,
      item.members,
      ...item.metadata,
      ...Object.values(item.counters)
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

function LaunchResultPreview({ result }: { result: TestResult }) {
  return (
    <section
      className="launch-result-preview"
      aria-label="пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
    >
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ</span>
          <h3>{result.name}</h3>
        </div>
        <StatusBadge status={result.status} />
      </div>
      <div className="launch-result-preview-grid">
        <LaunchRuntimeFact label="пїЅпїЅпїЅпїЅпїЅ" value={result.suite} />
        <LaunchRuntimeFact label="пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ" value={result.owner} />
        <LaunchRuntimeFact label="пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ" value={result.duration} />
        <LaunchRuntimeFact label="пїЅпїЅпїЅпїЅпїЅпїЅ" value={result.defect ?? "пїЅпїЅпїЅ"} />
      </div>
      <div className="launch-result-preview-actions">
        <ReadOnlyAction
          icon={<ExternalLink size={16} />}
          label="пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅ"
        />
      </div>
    </section>
  );
}

function LaunchList({
  launchItems,
  selectedLaunchId,
  onSelect
}: {
  launchItems: LaunchListItem[];
  selectedLaunchId: string;
  onSelect: (id: string) => void;
}) {
  const visibleLaunchItems = launchItems.slice(0, LAUNCH_PAGE_SIZE);

  return (
    <section className="launch-list" aria-label="пїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ">
      <div className="launch-cards-list">
        {visibleLaunchItems.map((item) => (
          <button
            className={`launch-card-row ${selectedLaunchId === item.id ? "selected" : ""}`}
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
          >
            <LaunchCard item={item} />
          </button>
        ))}
      </div>
      <ListWindowFooter rendered={visibleLaunchItems.length} total={launchItems.length} />
    </section>
  );
}

function LaunchCard({ item }: { item: LaunchListItem }) {
  const total = getLaunchTotal(item);

  return (
    <>
      <div className="launch-card-mainline">
        <span>
          <strong>{item.name}</strong>
          <span className={`state-badge ${item.state}`}>{formatLaunchState(item.state)}</span>
        </span>
        <small>
          #{item.id.replace(/^L-/, "")} пїЅ {formatLaunchMetadata(item.metadata)}
        </small>
      </div>
      <div className="launch-card-progress-cell">
        <LaunchProgressBar counters={item.counters} total={total} />
      </div>
      <div className="launch-card-actions" aria-label="пїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ">
        <ReadOnlyAction icon={<Activity size={16} />} label="пїЅпїЅпїЅпїЅпїЅ пїЅпїЅ read model" />
        <ReadOnlyAction
          icon={<MoreHorizontal size={17} />}
          label="пїЅпїЅпїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
        />
      </div>
      <div className="launch-card-meta">
        <span>
          <span>пїЅпїЅпїЅпїЅ</span>
          <em>{item.metadata[1] ?? "пїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅ"}</em>
        </span>
        <span>
          <span>пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ</span>
          <em>{item.metadata[0] ?? "-"}</em>
        </span>
        <span>
          <span>пїЅпїЅпїЅпїЅпїЅпїЅпїЅ</span>
          <em>{item.defects}</em>
        </span>
        <span>
          <span>пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ</span>
          <em>{item.members}</em>
        </span>
      </div>
    </>
  );
}

function LaunchReportHeader({
  counts,
  launch
}: {
  counts: Record<ResultStatus, number>;
  launch: LaunchListItem;
}) {
  const total = getLaunchTotal(launch);

  return (
    <section className="launch-report-header">
      <div>
        <span className="eyebrow">пїЅпїЅпїЅпїЅпїЅ пїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ</span>
        <h2>
          {launch.name}{" "}
          <span className={`state-badge ${launch.state}`}>{formatLaunchState(launch.state)}</span>
        </h2>
        <p>
          #{launch.id.replace(/^L-/, "")} пїЅ {formatLaunchMetadata(launch.metadata)}
        </p>
      </div>
      <LaunchProgressBar counters={counts} total={total} large />
      <div
        className="launch-report-stats"
        aria-label="пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
      >
        <StatusCounter status="failed" value={counts.failed} />
        <StatusCounter status="broken" value={counts.broken} />
        <StatusCounter status="passed" value={counts.passed} />
        <StatusCounter status="skipped" value={counts.skipped} />
      </div>
    </section>
  );
}

function LaunchProgressBar({
  counters,
  large = false,
  total
}: {
  counters: Record<ResultStatus, number>;
  large?: boolean;
  total: number;
}) {
  const safeTotal = Math.max(total, 1);
  const parts: ResultStatus[] = ["failed", "broken", "passed", "skipped"];

  return (
    <div
      className={`launch-progress ${large ? "large" : ""}`}
      aria-label="пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ пїЅпїЅпїЅпїЅпїЅпїЅпїЅпїЅ"
    >
      {parts.map((status) => {
        const value = counters[status];
        if (value <= 0) {
          return null;
        }

        return (
          <span
            className={status}
            key={status}
            style={{ width: `${Math.max(3, (value / safeTotal) * 100)}%` }}
            title={`${statusLabels[status]}: ${value}`}
          >
            {large || value > safeTotal * 0.08 ? value : ""}
          </span>
        );
      })}
    </div>
  );
}

function getLaunchTotal(item: { counters: Record<ResultStatus, number> }) {
  return Object.values(item.counters).reduce((total, value) => total + value, 0);
}

function formatLaunchMetadata(metadata: string[]): string {
  return metadata.filter(Boolean).join(" пїЅ ");
}

function StatusCounter({ status, value }: { status: ResultStatus; value: number }) {
  return (
    <span className={`status-counter ${status}`}>
      <i />
      {value}
    </span>
  );
}
function LaunchRuntimeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="runtime-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
