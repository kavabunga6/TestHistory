import { AlertCircle } from "lucide-react";

import type { TestResult } from "../m1Workspace.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import { getResultDefectReferences } from "./ResultDefectReferences.js";
import { formatHistoryDate } from "./TestCaseDetailReferenceUtils.js";

export function TestCaseQuarantineTab({ result }: { result: TestResult }) {
  return (
    <div className="tc-detail-reference-tab-panel">
      <section>
        <h3>Карантин</h3>
        {result.muted || result.defectMute ? (
          <div className="tc-detail-reference-quarantine">
            <strong>Тест помечен как приглушенный</strong>
            <span>
              {result.defectMute?.reason ?? "Причина будет загружена из политики карантина."}
            </span>
          </div>
        ) : (
          <p className="muted">Карантинные правила не применяются.</p>
        )}
      </section>
    </div>
  );
}

export function TestCaseDefectsTab({
  integrationProviders,
  result
}: {
  integrationProviders: IntegrationLinkProvider[];
  result: TestResult;
}) {
  const defects = getResultDefectReferences(result, integrationProviders);
  const archivedDefects = result.defectHistory ?? [];

  return (
    <div className="tc-detail-reference-tab-panel">
      <section>
        <h3>Дефекты и задачи из баг-трекера</h3>
        {defects.length === 0 ? (
          <p className="muted">Дефекты не связаны с тест-кейсом.</p>
        ) : (
          <div className="tc-detail-reference-defects">
            {defects.map((defect) => (
              <article key={defect.id}>
                <AlertCircle size={16} />
                <div className="tc-detail-reference-defect-copy">
                  {defect.href !== undefined ? (
                    <a
                      href={defect.href}
                      rel={defect.kind === "issue" ? "noreferrer" : undefined}
                      target={defect.kind === "issue" ? "_blank" : undefined}
                    >
                      {defect.id}
                    </a>
                  ) : (
                    <strong>{defect.id}</strong>
                  )}
                  <span>
                    {defect.kind === "internal" ? "Внутренний дефект" : "Задача из баг-трекера"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
        {archivedDefects.length > 0 ? (
          <div className="tc-detail-reference-defect-history">
            <h4>История дефектов</h4>
            {archivedDefects.map((defect) => (
              <span key={`${defect.id}-${defect.removedAt}`}>
                {defect.id} · удален из активных связей {formatHistoryDate(defect.removedAt)}
              </span>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
