import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  GitBranch,
  ShieldCheck
} from "lucide-react";

import type {
  TestCaseHistoryComparePermissionAudit,
  TestCaseHistoryComparePermissionAuditInvariant,
  TestCaseHistoryComparePermissionAuditInvariantItem,
  TestCaseHistoryCompareValue
} from "./m1Workspace.js";
import { formatListCount, ReadOnlyAction } from "./workspaceCommon.js";
import { formatAuditDate } from "./workspaceDate.js";
export function HistoryComparePermissionAuditPanel({
  audit
}: {
  audit: TestCaseHistoryComparePermissionAudit | undefined;
}) {
  if (audit === undefined) {
    return (
      <div className="history-compare-audit is-empty" aria-label="History compare permission audit">
        <ShieldCheck size={16} />
        <span>
          <strong>Аудит прав ожидается</strong>
          <small>В read-модели выбранного кейса пока нет evidence replay-аудита.</small>
        </span>
      </div>
    );
  }

  const replayItems = [
    ["События replay", audit.replay.eventCount],
    ["Принято", audit.replay.acceptedCount],
    ["Запрещено", audit.replay.deniedCount],
    ["Частично", audit.replay.partialCount],
    ["Дубликаты", audit.replay.duplicateCount],
    ["Игнорировано", audit.replay.ignoredCount]
  ] as const;
  const auditRecords = audit.records ?? [];
  const auditPage = audit.page ?? {
    hasMore: false,
    limit: auditRecords.length,
    offset: 0,
    returned: auditRecords.length,
    total: auditRecords.length
  };

  return (
    <div
      className={`history-compare-audit state-${audit.state}`}
      aria-label="History compare permission audit"
    >
      <div className="history-compare-audit-heading">
        <ShieldCheck size={16} />
        <span>
          <strong>Аудит прав</strong>
          <small>{historyCompareAuditHeadingCopy(audit.state)}</small>
        </span>
        <code>{formatCompareAuditState(audit.state)}</code>
      </div>
      <div className="history-compare-audit-grid">
        <article>
          <span>Автор аудита</span>
          <strong>{formatCompareAuditVisibleValue(audit.actor, "Скрыто правами")}</strong>
        </article>
        <article>
          <span>Проект аудита</span>
          <strong>{formatCompareAuditVisibleValue(audit.project, "Проект скрыт")}</strong>
        </article>
        <article>
          <span>Проверено</span>
          <strong>{formatAuditDate(audit.evaluatedAt)}</strong>
        </article>
        <article>
          <span>Причина доступа</span>
          <strong className="redacted">{formatCompareAuditReason(audit.reason)}</strong>
        </article>
        <article>
          <span>Источник чтения</span>
          <strong>{formatCompareAuditSource(audit.source)}</strong>
        </article>
        <article>
          <span>Область доступа</span>
          <strong>{formatCompareAuditAccess(audit.access)}</strong>
        </article>
      </div>
      <div className="history-compare-audit-replay" aria-label="History compare replay metadata">
        {replayItems.map(([label, value]) => (
          <span key={label}>
            {label} <strong>{formatListCount(value)}</strong>
          </span>
        ))}
      </div>
      <div className="history-compare-audit-digest" aria-label="History compare digest metadata">
        <article>
          <span>Дайджест проекции</span>
          <code>{safeCompareAuditText(audit.digest.projectionDigest)}</code>
        </article>
        <article>
          <span>Дайджест источника</span>
          <code>{safeCompareAuditText(audit.digest.rawHistoryDigest)}</code>
        </article>
        <article>
          <span>Раскрытие источника</span>
          <strong>
            {audit.digest.rawHistoryExposed
              ? "[redacted]"
              : "Чувствительные исходные данные скрыты"}
          </strong>
        </article>
        <article>
          <span>Скрытые поля</span>
          <strong>{formatCompareAuditRedactedFields(audit.redactedFields)}</strong>
        </article>
      </div>
      <div className="history-compare-audit-records" aria-label="History compare audit records">
        <div>
          <strong>Записи аудита</strong>
          <small>
            {formatCompareAuditRecordPage(auditPage)}; чувствительные входные данные сравнения
            скрыты.
          </small>
        </div>
        {auditRecords.length === 0 ? (
          <span className="redacted">Нет видимых записей аудита для этого автора и проекта.</span>
        ) : (
          auditRecords.map((record) => (
            <article className={`state-${record.decision}`} key={record.compareId}>
              <span>
                <strong>{formatCompareAuditDecision(record.decision)}</strong>
                <small>{safeCompareAuditText(record.compareId, "compare redacted")}</small>
              </span>
              <code>{formatCompareAuditVisibleValue(record.actor, "Hidden by permission")}</code>
              <code>{formatListCount(record.eventCount)} событий</code>
              <code>
                {record.rawHistoryDigest !== undefined
                  ? safeCompareAuditText(record.rawHistoryDigest, "sha256:redacted")
                  : "дайджест источника недоступен"}
              </code>
              <em>{formatListCount(record.rawHistoryItemCount)} исходных элементов сохранено</em>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

export function HistoryComparePermissionAuditInvariantPanel({
  invariant,
  loading = false
}: {
  invariant: TestCaseHistoryComparePermissionAuditInvariant | undefined;
  loading?: boolean;
}) {
  if (invariant === undefined) {
    return (
      <div
        className="history-compare-invariants is-empty"
        aria-label="History compare permission audit invariants"
      >
        {loading ? <Clock3 size={16} /> : <ShieldCheck size={16} />}
        <span>
          <strong>
            {loading ? "Инварианты аудита прав загружаются" : "Инварианты аудита прав ожидаются"}
          </strong>
          <small>
            {loading
              ? "Ждем сохраненные summaries инвариантов для выбранного кейса."
              : "В read-модели выбранного кейса пока нет replay evidence инвариантов."}
          </small>
        </span>
      </div>
    );
  }

  if (invariant.state === "denied" || invariant.state === "empty") {
    return (
      <div
        className={`history-compare-invariants state-${invariant.state}`}
        aria-label="History compare permission audit invariants"
      >
        <HistoryCompareInvariantHeading invariant={invariant} />
        <div
          className="history-compare-invariant-guard"
          aria-label={`History compare invariant ${invariant.state} guard`}
        >
          {invariant.state === "denied" ? <ShieldCheck size={16} /> : <CheckCircle2 size={16} />}
          <span>
            <strong>
              {invariant.state === "denied"
                ? "Доказательства инвариантов скрыты"
                : "Сохраненных событий инвариантов нет"}
            </strong>
            <small>
              {invariant.state === "denied"
                ? "Проект и автор скрыты; сырые входные данные сравнения не показываются."
                : "Для области выбранного кейса нет доступных событий replay-инвариантов."}
            </small>
          </span>
        </div>
      </div>
    );
  }

  const invariantItems = invariant.items ?? [];
  const signals = [
    ["Детерминированность", invariant.invariant.deterministic],
    ["Пересчет", invariant.invariant.recomputable],
    ["Область проекта", invariant.invariant.projectScoped],
    ["Область автора", invariant.invariant.actorScoped],
    ["Append-only", invariant.appendOnly.uniqueProjectedEventIds],
    ["Сырые входы сохранены", invariant.rawCompareInputs.preserved],
    ["Редакция", invariant.redaction.passed],
    ["Без мутаций", invariant.access?.mutation === false]
  ] as const;

  return (
    <div
      className={`history-compare-invariants state-${invariant.state}`}
      aria-label="History compare permission audit invariants"
    >
      <HistoryCompareInvariantHeading invariant={invariant} />
      <div className="history-compare-invariant-scope">
        <article>
          <span>Автор инварианта</span>
          <strong>{formatCompareAuditVisibleValue(invariant.actor, "Скрыто правами")}</strong>
        </article>
        <article>
          <span>Проект инварианта</span>
          <strong>{formatCompareAuditVisibleValue(invariant.project, "Проект скрыт")}</strong>
        </article>
        <article>
          <span>Доступ</span>
          <strong>{formatCompareAuditAccess(invariant.access)}</strong>
        </article>
        <article>
          <span>Граница</span>
          <strong>{safeCompareAuditText(invariant.invariant.boundary)}</strong>
        </article>
      </div>
      <div className="history-compare-invariant-signals" aria-label="Replay invariant signals">
        {signals.map(([label, passed]) => (
          <article className={passed ? "ready" : "blocked"} key={label}>
            {passed ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            <span>{label}</span>
            <strong>{passed ? "пройдено" : "заблокировано"}</strong>
          </article>
        ))}
      </div>
      <div className="history-compare-invariant-digests" aria-label="Invariant digest metadata">
        <article>
          <span>Дайджест проекции</span>
          <code>{safeCompareAuditText(invariant.invariant.projectionDigest)}</code>
        </article>
        <article>
          <span>Дайджест пересчета</span>
          <code>{safeCompareAuditText(invariant.invariant.recomputedDigest)}</code>
        </article>
        <article>
          <span>Сырые входы сравнения</span>
          <strong>{formatRawCompareInputBoundary(invariant)}</strong>
        </article>
        <article>
          <span>Политика редакции</span>
          <strong>{safeCompareAuditText(invariant.redaction.policy)}</strong>
        </article>
      </div>
      <div className="history-compare-invariant-events" aria-label="Invariant event evidence">
        <div>
          <strong>События инвариантов</strong>
          <small>{formatCompareAuditInvariantPage(invariant)}; сырые входы сравнения скрыты.</small>
        </div>
        {invariantItems.length === 0 ? (
          <span className="redacted">
            Нет видимых событий инвариантов для этого автора и проекта.
          </span>
        ) : (
          invariantItems.map((item) => (
            <HistoryCompareInvariantEventItem item={item} key={`${item.ordinal}-${item.eventId}`} />
          ))
        )}
      </div>
      <div className="history-compare-invariant-actions">
        <ReadOnlyAction icon={<Activity size={16} />} label="Инварианты из read model" />
        <ReadOnlyAction icon={<GitBranch size={16} />} label="Пересчет сверяется дайджестом" />
        <ReadOnlyAction icon={<FileText size={16} />} label="Аудит открыт на странице" />
      </div>
    </div>
  );
}

function HistoryCompareInvariantHeading({
  invariant
}: {
  invariant: TestCaseHistoryComparePermissionAuditInvariant;
}) {
  return (
    <div className="history-compare-invariant-heading">
      <ShieldCheck size={16} />
      <span>
        <strong>Инварианты аудита прав</strong>
        <small>
          Сохраненные summaries инвариантов. {historyCompareInvariantHeadingCopy(invariant)}
        </small>
      </span>
      <code>{formatCompareAuditInvariantState(invariant.state)}</code>
    </div>
  );
}

function HistoryCompareInvariantEventItem({
  item
}: {
  item: TestCaseHistoryComparePermissionAuditInvariantItem;
}) {
  return (
    <article>
      <span>
        <strong>Событие {formatListCount(item.ordinal + 1)}</strong>
        <small>{item.redacted ? "метаданные события скрыты" : "метаданные события"}</small>
      </span>
      <code>{safeCompareAuditText(item.eventId, "событие скрыто")}</code>
    </article>
  );
}

function historyCompareInvariantHeadingCopy(
  invariant: TestCaseHistoryComparePermissionAuditInvariant
): string {
  if (invariant.state === "empty") {
    return "Для выбранного тест-кейса пока нет событий replay-инвариантов.";
  }
  if (invariant.state === "denied") {
    return "Доказательства инвариантов скрыты правами автора или проекта.";
  }
  if (invariant.state === "partial") {
    return "Replay evidence инвариантов доступно частично; сырые входы сравнения отделены.";
  }

  return "Детерминированное, пересчитываемое evidence в области проекта и автора.";
}

function formatCompareAuditInvariantState(
  state: TestCaseHistoryComparePermissionAuditInvariant["state"]
): string {
  if (state === "denied") {
    return "Инварианты недоступны";
  }
  if (state === "partial") {
    return "Инварианты частично доступны";
  }
  if (state === "empty") {
    return "Инвариантов нет";
  }

  return "Инварианты готовы";
}

function formatRawCompareInputBoundary(
  invariant: TestCaseHistoryComparePermissionAuditInvariant
): string {
  if (invariant.rawCompareInputs.included) {
    return "сырые входы сравнения отредактированы";
  }

  return `${formatListCount(invariant.rawCompareInputs.itemCount)} исходных элементов сохранено, ${formatListCount(
    invariant.rawCompareInputs.digestCount
  )} дайджеста, сырые входы скрыты`;
}

function formatCompareAuditInvariantPage(
  invariant: TestCaseHistoryComparePermissionAuditInvariant
): string {
  const page = invariant.page ?? {
    hasMore: false,
    limit: invariant.items?.length ?? 0,
    offset: 0,
    returned: invariant.items?.length ?? 0,
    total: invariant.items?.length ?? 0
  };
  const start = page.returned === 0 ? 0 : page.offset + 1;
  const end = page.offset + page.returned;
  return `${formatListCount(start)}-${formatListCount(end)} из ${formatListCount(
    page.total
  )} событий${page.hasMore ? ", есть еще" : ""}`;
}

function historyCompareAuditHeadingCopy(
  state: TestCaseHistoryComparePermissionAudit["state"]
): string {
  if (state === "empty") {
    return "Для этого автора и проекта пока нет записей аудита прав.";
  }

  return "Replay evidence в области автора и проекта; чувствительные исходные данные скрыты из UI.";
}

function formatCompareAuditState(state: TestCaseHistoryComparePermissionAudit["state"]): string {
  if (state === "denied") {
    return "Аудит недоступен";
  }

  if (state === "partial") {
    return "Аудит частично доступен";
  }

  if (state === "empty") {
    return "Аудита нет";
  }

  return "Аудит готов";
}

function formatCompareAuditSource(
  source: TestCaseHistoryComparePermissionAudit["source"] | undefined
): string {
  if (source === "rest-permission-audit") {
    return "REST-чтение аудита прав";
  }
  if (source === "mcp-permission-audit") {
    return "MCP-чтение аудита прав";
  }

  return "Read-модель выбранного кейса";
}

function formatCompareAuditAccess(
  access: TestCaseHistoryComparePermissionAudit["access"] | undefined
): string {
  if (access === undefined) {
    return "test-cases:read / только чтение";
  }

  const scope = safeCompareAuditText(access.scope, "test-cases:read");
  const actorScope = access.actorScoped ? "область автора" : "все авторы";
  const projectScope = access.projectScoped ? "область проекта" : "область рабочего пространства";
  const mutation = access.mutation ? "мутации включены" : "только чтение";
  return `${scope} / ${projectScope} / ${actorScope} / ${mutation}`;
}

function formatCompareAuditRecordPage(
  page: NonNullable<TestCaseHistoryComparePermissionAudit["page"]>
): string {
  const start = page.returned === 0 ? 0 : page.offset + 1;
  const end = page.offset + page.returned;
  return `${formatListCount(start)}-${formatListCount(end)} из ${formatListCount(
    page.total
  )} записей${page.hasMore ? ", есть еще" : ""}`;
}

function formatCompareAuditDecision(
  decision: NonNullable<TestCaseHistoryComparePermissionAudit["records"]>[number]["decision"]
): string {
  if (decision === "denied") {
    return "Запись аудита запрещена";
  }
  if (decision === "partial") {
    return "Запись аудита частичная";
  }

  return "Запись аудита готова";
}

function formatCompareAuditVisibleValue(
  value: TestCaseHistoryCompareValue,
  fallback: string
): string {
  if (typeof value !== "string") {
    return getCompareDisplayValue(value).text;
  }

  return safeCompareAuditText(value, fallback);
}

function formatCompareAuditReason(value: TestCaseHistoryCompareValue | undefined): string {
  if (value !== undefined && typeof value !== "string" && value.state === "denied") {
    return "Скрыто правами";
  }

  return "[redacted]";
}

function formatCompareAuditRedactedFields(fields: string[]): string {
  const safeFields = fields.filter((field) => !containsSensitiveCompareText(field));

  if (safeFields.length === 0) {
    return "скрытые значения";
  }

  return safeFields.join(", ");
}

function safeCompareAuditText(value: string, fallback = "[redacted]"): string {
  const normalized = value.trim();

  if (normalized.length === 0 || containsSensitiveCompareText(normalized)) {
    return fallback;
  }

  return normalized;
}
function containsSensitiveCompareText(value: string): boolean {
  return (
    /[A-Za-z]:\\|\\\\|\/Users\/|\/home\/|\/var\/|\/tmp\/|Downloads/i.test(value) ||
    /\b(authorization|bearer|password|secret|token|api[-_ ]?key|raw-sensitive|storage[-_ ]?key|storage[-_ ]?ref|signed[-_ ]?url)\b/i.test(
      value
    ) ||
    /https?:\/\/\S*(?:[?&](?:token|signature|x-amz-signature|sig|key|secret)=)/i.test(value) ||
    /(?:s3|gs|az|azure|minio|storage|blob):\/\//i.test(value)
  );
}

function getCompareDisplayValue(value: TestCaseHistoryCompareValue): {
  text: string;
  className?: string;
} {
  if (typeof value === "string") {
    return { text: value };
  }

  if (value.state === "denied") {
    return { text: "Скрыто правами", className: "redacted" };
  }

  if (value.state === "redacted") {
    return { text: "[redacted]", className: "redacted" };
  }

  return { text: value.text ?? "Нет значения" };
}
