import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";
import {
  BellRing,
  Bug,
  Check,
  CirclePlay,
  Copy,
  ExternalLink,
  ListFilter,
  Pencil,
  Plus,
  RefreshCw,
  Workflow
} from "lucide-react";
import {
  createAutomationJob,
  createIssueTrackerIntegration,
  createNotificationIntegration,
  loadAutomationWorkspace,
  setOutboundIntegrationEnabled,
  updateAutomationJobStatus,
  type AutomationJobReadModel,
  type AutomationWorkspaceData
} from "../automationApi.js";
import { AutomationPlanForm } from "./AutomationPlanForm.js";
import { useAutomationFormSubmit } from "./useAutomationFormSubmit.js";

import "./AutomationReferenceScreen.css";

type AutomationTab = "plans" | "jobs" | "integrations";
const automationTabs: AutomationTab[] = ["plans", "jobs", "integrations"];
const deliveryEventLabels: Record<string, string> = {
  "automation-job.succeeded": "CI-задача выполнена",
  "automation-job.failed": "CI-задача завершилась ошибкой",
  "automation-job.canceled": "CI-задача отменена",
  "issue.create": "Создание задачи в трекере",
  "launch.closed": "Запуск закрыт",
  "launch.failed": "Запуск завершился ошибкой",
  "quality-gate.failed": "Порог качества не пройден"
};
const notificationEvents = [
  "automation-job.failed",
  "automation-job.succeeded",
  "automation-job.canceled",
  "launch.closed",
  "launch.failed",
  "quality-gate.failed"
] as const;
function integrationAddressLabel(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "Адрес интеграции";
  }
}

type PanelProps = {
  data: AutomationWorkspaceData;
  creating: boolean;
  setCreating: (value: boolean) => void;
  onChanged: () => Promise<void>;
};

export function AutomationReferenceScreen({ projectId }: { projectId?: string | undefined }) {
  const [tab, setTab] = useState<AutomationTab>("plans");
  const [data, setData] = useState<AutomationWorkspaceData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setLoading(true);
    setError(undefined);
    setData((current) => (current?.projectId === projectId ? current : undefined));
    if (projectId === undefined) {
      setError("Выберите проект, чтобы открыть автоматизацию.");
      setLoading(false);
      return;
    }
    try {
      const loaded = await loadAutomationWorkspace(projectId);
      if (sequence === requestSequence.current) {
        setData(loaded);
      }
    } catch (nextError) {
      if (sequence === requestSequence.current) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    return () => {
      requestSequence.current += 1;
    };
  }, [refresh]);

  const selectTab = (nextTab: AutomationTab) => {
    setCreating(false);
    setTab(nextTab);
  };
  const onTabsKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const currentIndex = automationTabs.indexOf(tab);
    const nextTab =
      event.key === "ArrowRight"
        ? automationTabs[(currentIndex + 1) % automationTabs.length]
        : event.key === "ArrowLeft"
          ? automationTabs[(currentIndex - 1 + automationTabs.length) % automationTabs.length]
          : event.key === "Home"
            ? automationTabs[0]
            : event.key === "End"
              ? automationTabs[automationTabs.length - 1]
              : undefined;
    if (nextTab === undefined) {
      return;
    }
    event.preventDefault();
    selectTab(nextTab);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${nextTab}"]`)?.focus();
  };

  return (
    <section className="automation-screen" aria-busy={loading}>
      <header className="automation-header">
        <div>
          <span className="reference-eyebrow">Автоматизация</span>
          <h1>Планы и CI-задачи</h1>
          <p>Отбор автоматизированных тестов и история внешних CI-прогонов.</p>
        </div>
        <button
          className="reference-action"
          disabled={loading}
          type="button"
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} aria-hidden="true" /> {loading ? "Обновляем…" : "Обновить"}
        </button>
      </header>

      <nav
        className="automation-tabs"
        aria-label="Разделы автоматизации"
        role="tablist"
        onKeyDown={onTabsKeyDown}
      >
        <button
          aria-controls="automation-panel-plans"
          aria-selected={tab === "plans"}
          className={tab === "plans" ? "active" : ""}
          data-tab="plans"
          id="automation-tab-plans"
          role="tab"
          tabIndex={tab === "plans" ? 0 : -1}
          type="button"
          onClick={() => selectTab("plans")}
        >
          <ListFilter aria-hidden="true" size={16} /> Тест-планы{" "}
          <span className="typography-role-meta">{data?.plans.length ?? 0}</span>
        </button>
        <button
          aria-controls="automation-panel-jobs"
          aria-selected={tab === "jobs"}
          className={tab === "jobs" ? "active" : ""}
          data-tab="jobs"
          id="automation-tab-jobs"
          role="tab"
          tabIndex={tab === "jobs" ? 0 : -1}
          type="button"
          onClick={() => selectTab("jobs")}
        >
          <Workflow aria-hidden="true" size={16} /> CI-задачи{" "}
          <span className="typography-role-meta">{data?.jobs.length ?? 0}</span>
        </button>
        <button
          aria-controls="automation-panel-integrations"
          aria-selected={tab === "integrations"}
          className={tab === "integrations" ? "active" : ""}
          data-tab="integrations"
          id="automation-tab-integrations"
          role="tab"
          tabIndex={tab === "integrations" ? 0 : -1}
          type="button"
          onClick={() => selectTab("integrations")}
        >
          <BellRing aria-hidden="true" size={16} /> Интеграции{" "}
          <span className="typography-role-meta">
            {(data?.notifications.length ?? 0) + (data?.issueTrackers.length ?? 0)}
          </span>
        </button>
      </nav>

      {error ? (
        <div className="automation-notice automation-notice--error" role="alert">
          {error}
        </div>
      ) : null}
      {loading && data === undefined ? (
        <div className="automation-notice">Загружаем автоматизацию…</div>
      ) : null}

      {data !== undefined && tab === "plans" ? (
        <div aria-labelledby="automation-tab-plans" id="automation-panel-plans" role="tabpanel">
          <PlansPanel
            data={data}
            creating={creating}
            setCreating={setCreating}
            onChanged={refresh}
          />
        </div>
      ) : null}
      {data !== undefined && tab === "jobs" ? (
        <div aria-labelledby="automation-tab-jobs" id="automation-panel-jobs" role="tabpanel">
          <JobsPanel
            data={data}
            creating={creating}
            setCreating={setCreating}
            onChanged={refresh}
          />
        </div>
      ) : null}
      {data !== undefined && tab === "integrations" ? (
        <div
          aria-labelledby="automation-tab-integrations"
          id="automation-panel-integrations"
          role="tabpanel"
        >
          <IntegrationsPanel data={data} onChanged={refresh} />
        </div>
      ) : null}
    </section>
  );
}

function IntegrationsPanel({
  data,
  onChanged
}: {
  data: AutomationWorkspaceData;
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState<"notification" | "issue" | undefined>();
  const [pendingIntegrationId, setPendingIntegrationId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [copiedIntegrationId, setCopiedIntegrationId] = useState<string>();
  const copyAddress = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIntegrationId(id);
      setActionError(undefined);
    } catch {
      setActionError("Не удалось скопировать адрес интеграции");
    }
  };
  const toggle = async (kind: "notifications" | "issue-trackers", id: string, enabled: boolean) => {
    setPendingIntegrationId(id);
    setActionError(undefined);
    try {
      await setOutboundIntegrationEnabled(data.projectId, kind, id, enabled);
      await onChanged();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось изменить интеграцию");
    } finally {
      setPendingIntegrationId(undefined);
    }
  };
  return (
    <div className="automation-content automation-integrations">
      <div className="automation-toolbar">
        <div>
          <strong>Исходящие интеграции</strong>
          <span>
            Подписанные уведомления и создание задач через серверные адаптеры. Секреты хранятся в
            окружении сервера.
          </span>
        </div>
        <div className="automation-toolbar-actions">
          <button
            type="button"
            onClick={() => setForm(form === "notification" ? undefined : "notification")}
          >
            <BellRing size={16} /> Уведомление
          </button>
          <button
            className="reference-primary-action"
            type="button"
            onClick={() => setForm(form === "issue" ? undefined : "issue")}
          >
            <Bug size={16} /> Трекер задач
          </button>
        </div>
      </div>
      {actionError ? (
        <div className="automation-notice automation-notice--error" role="alert">
          {actionError}
        </div>
      ) : null}
      {form === "notification" ? (
        <NotificationIntegrationForm
          projectId={data.projectId}
          onCancel={() => setForm(undefined)}
          onCreated={onChanged}
        />
      ) : null}
      {form === "issue" ? (
        <IssueTrackerIntegrationForm
          projectId={data.projectId}
          onCancel={() => setForm(undefined)}
          onCreated={onChanged}
        />
      ) : null}
      <div className="automation-integration-columns">
        <section className="automation-integration-section">
          <h2>
            <BellRing size={17} /> Уведомления <span>{data.notifications.length}</span>
          </h2>
          {data.notifications.map((item) => (
            <article className="automation-card automation-integration-card" key={item.id}>
              <div className="automation-card-heading">
                <strong>{item.name}</strong>
                <StatusChip status={item.enabled ? "active" : "disabled"} />
              </div>
              <p>
                {notificationProviderLabels[item.provider]} · {item.events.length} событий · подпись{" "}
                {item.signingSecretConfigured ? "настроена" : "не задана"}
              </p>
              <div className="automation-integration-actions">
                <a
                  href={item.endpointUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={item.endpointUrl}
                >
                  <span>{integrationAddressLabel(item.endpointUrl)}</span>
                  <ExternalLink size={13} />
                </a>
                <button
                  aria-label={
                    copiedIntegrationId === item.id
                      ? "Адрес скопирован"
                      : `Копировать адрес «${item.name}»`
                  }
                  className="automation-integration-copy"
                  title={copiedIntegrationId === item.id ? "Адрес скопирован" : "Копировать адрес"}
                  type="button"
                  onClick={() => void copyAddress(item.id, item.endpointUrl)}
                >
                  {copiedIntegrationId === item.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  disabled={pendingIntegrationId !== undefined}
                  type="button"
                  onClick={() => void toggle("notifications", item.id, !item.enabled)}
                >
                  {pendingIntegrationId === item.id
                    ? "Сохраняем…"
                    : item.enabled
                      ? "Отключить"
                      : "Включить"}
                </button>
              </div>
            </article>
          ))}
          {data.notifications.length === 0 ? (
            <EmptyAutomation
              icon={<BellRing />}
              title="Уведомления не настроены"
              copy="Добавьте webhook, Slack, Teams или Пачку."
            />
          ) : null}
        </section>
        <section className="automation-integration-section">
          <h2>
            <Bug size={17} /> Трекеры задач <span>{data.issueTrackers.length}</span>
          </h2>
          {data.issueTrackers.map((item) => (
            <article className="automation-card automation-integration-card" key={item.id}>
              <div className="automation-card-heading">
                <strong>{item.name}</strong>
                <StatusChip status={item.enabled ? "active" : "disabled"} />
              </div>
              <p>
                {item.provider} · {item.projectKey} · токен{" "}
                {item.credentialConfigured ? "настроен" : "не задан"}
              </p>
              <div className="automation-integration-actions">
                <a href={item.baseUrl} target="_blank" rel="noreferrer" title={item.baseUrl}>
                  <span>{integrationAddressLabel(item.baseUrl)}</span>
                  <ExternalLink size={13} />
                </a>
                <button
                  aria-label={
                    copiedIntegrationId === item.id
                      ? "Адрес скопирован"
                      : `Копировать адрес «${item.name}»`
                  }
                  className="automation-integration-copy"
                  title={copiedIntegrationId === item.id ? "Адрес скопирован" : "Копировать адрес"}
                  type="button"
                  onClick={() => void copyAddress(item.id, item.baseUrl)}
                >
                  {copiedIntegrationId === item.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  disabled={pendingIntegrationId !== undefined}
                  type="button"
                  onClick={() => void toggle("issue-trackers", item.id, !item.enabled)}
                >
                  {pendingIntegrationId === item.id
                    ? "Сохраняем…"
                    : item.enabled
                      ? "Отключить"
                      : "Включить"}
                </button>
              </div>
            </article>
          ))}
          {data.issueTrackers.length === 0 ? (
            <EmptyAutomation
              icon={<Bug />}
              title="Трекеры не настроены"
              copy="Подключите Jira, YouTrack, GitHub Issues или generic HTTP API."
            />
          ) : null}
        </section>
      </div>
      <section className="automation-deliveries">
        <h2>
          Последние доставки <span>{data.deliveries.length}</span>
        </h2>
        <div className="automation-table" role="table" aria-label="Доставки интеграций">
          <div className="automation-table-row automation-table-head">
            <span>Событие</span>
            <span>Тип</span>
            <span>Попытки</span>
            <span>Статус</span>
            <span />
          </div>
          {data.deliveries.slice(0, 20).map((delivery) => (
            <div className="automation-table-row" key={delivery.id}>
              <span>
                <strong>{deliveryEventLabels[delivery.event] ?? delivery.event}</strong>
                <small>
                  {delivery.event} · {new Date(delivery.updatedAt).toLocaleString("ru-RU")}
                </small>
              </span>
              <span>{delivery.kind === "notification" ? "Уведомление" : "Задача"}</span>
              <span>
                {delivery.attempts}/{delivery.status === "dead" ? delivery.attempts : 5}
              </span>
              <span>
                <StatusChip status={delivery.status} />
              </span>
              <span>
                {delivery.externalReference ? (
                  <a
                    aria-label={`Открыть внешнюю ссылку доставки «${delivery.event}»`}
                    href={delivery.externalReference}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} />
                  </a>
                ) : null}
              </span>
            </div>
          ))}
          {data.deliveries.length === 0 ? (
            <EmptyAutomation
              icon={<BellRing />}
              title="Доставок пока нет"
              copy="События появятся после срабатывания исходящих интеграций."
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

const notificationProviderLabels: Record<
  AutomationWorkspaceData["notifications"][number]["provider"],
  string
> = {
  generic: "Webhook",
  slack: "Slack",
  teams: "Teams",
  pachca: "Пачка"
};

function NotificationIntegrationForm({
  projectId,
  onCancel,
  onCreated
}: {
  projectId: string;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const { busy, error, submit } = useAutomationFormSubmit();
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "automation-job.failed",
    "automation-job.succeeded"
  ]);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedEvents.length === 0) return;
    const form = new FormData(event.currentTarget);
    const secretEnvVar = String(form.get("secretEnvVar") ?? "").trim();
    await submit(async () => {
      await createNotificationIntegration(projectId, {
        name: String(form.get("name")),
        provider: String(form.get("provider")),
        endpointUrl: String(form.get("endpointUrl")),
        events: selectedEvents,
        ...(secretEnvVar ? { secretEnvVar } : {})
      });
      await onCreated();
      onCancel();
    });
  };
  return (
    <form
      aria-busy={busy}
      className="automation-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label>
        Название
        <input name="name" required />
      </label>
      <label>
        Тип
        <select name="provider">
          <option value="generic">Webhook</option>
          <option value="slack">Slack</option>
          <option value="teams">Teams</option>
          <option value="pachca">Пачка</option>
        </select>
      </label>
      <label className="automation-form-wide">
        Адрес HTTPS
        <input name="endpointUrl" type="url" required />
      </label>
      <label>
        Переменная секрета подписи
        <input
          name="secretEnvVar"
          pattern="[A-Z][A-Z0-9_]{2,127}"
          placeholder="TESTHISTORY_WEBHOOK_SECRET"
        />
      </label>
      <fieldset
        aria-describedby={selectedEvents.length === 0 ? "automation-events-hint" : undefined}
        className="automation-events automation-form-wide"
      >
        <legend>События для уведомлений</legend>
        <div className="automation-events-options">
          {notificationEvents.map((eventName) => (
            <label key={eventName}>
              <input
                checked={selectedEvents.includes(eventName)}
                type="checkbox"
                value={eventName}
                onChange={(event) =>
                  setSelectedEvents((current) =>
                    event.target.checked
                      ? [...current, eventName]
                      : current.filter((item) => item !== eventName)
                  )
                }
              />
              <span>{deliveryEventLabels[eventName]}</span>
            </label>
          ))}
        </div>
        {selectedEvents.length === 0 ? (
          <p className="automation-events-hint" id="automation-events-hint" role="status">
            Выберите хотя бы одно событие, чтобы сохранить уведомление.
          </p>
        ) : null}
      </fieldset>
      <AutomationFormError error={error} />
      <div className="automation-form-actions">
        <button disabled={busy} type="button" onClick={onCancel}>
          Отмена
        </button>
        <button
          className="reference-primary-action"
          disabled={busy || selectedEvents.length === 0}
          type="submit"
        >
          {busy ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

function IssueTrackerIntegrationForm({
  projectId,
  onCancel,
  onCreated
}: {
  projectId: string;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const { busy, error, submit } = useAutomationFormSubmit();
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit(async () => {
      await createIssueTrackerIntegration(projectId, {
        name: String(form.get("name")),
        provider: String(form.get("provider")),
        baseUrl: String(form.get("baseUrl")),
        projectKey: String(form.get("projectKey")),
        credentialEnvVar: String(form.get("credentialEnvVar"))
      });
      await onCreated();
      onCancel();
    });
  };
  return (
    <form
      aria-busy={busy}
      className="automation-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label>
        Название
        <input name="name" required />
      </label>
      <label>
        Провайдер
        <select name="provider">
          <option value="jira">Jira</option>
          <option value="youtrack">YouTrack</option>
          <option value="github">GitHub</option>
          <option value="generic">HTTP API</option>
        </select>
      </label>
      <label>
        Базовый адрес HTTPS
        <input name="baseUrl" type="url" required />
      </label>
      <label>
        Ключ проекта или репозитория
        <input name="projectKey" required />
      </label>
      <label>
        Переменная токена
        <input
          name="credentialEnvVar"
          required
          pattern="[A-Z][A-Z0-9_]{2,127}"
          placeholder="TESTHISTORY_JIRA_TOKEN"
        />
      </label>
      <AutomationFormError error={error} />
      <div className="automation-form-actions">
        <button disabled={busy} type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="reference-primary-action" disabled={busy} type="submit">
          {busy ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

function PlansPanel({ data, creating, setCreating, onChanged }: PanelProps) {
  const [editingPlanId, setEditingPlanId] = useState<string>();
  const editingPlan = data.plans.find((plan) => plan.id === editingPlanId);
  return (
    <div className="automation-content">
      <div className="automation-toolbar">
        <div>
          <strong>Тест-планы</strong>
          <span>Сохранённые выборки только автоматизированных кейсов.</span>
        </div>
        {data.plans.length > 0 ? (
          <button
            className="reference-primary-action"
            type="button"
            onClick={() => {
              setEditingPlanId(undefined);
              setCreating(!creating);
            }}
          >
            <Plus size={16} /> Создать план
          </button>
        ) : null}
      </div>
      {creating || editingPlan !== undefined ? (
        <AutomationPlanForm
          key={editingPlan?.id ?? "new"}
          projectId={data.projectId}
          plan={editingPlan}
          onCancel={() => {
            setCreating(false);
            setEditingPlanId(undefined);
          }}
          onSaved={onChanged}
        />
      ) : null}
      <div className="automation-grid">
        {data.plans.map((plan) => (
          <article
            className={`automation-card automation-plan-card${editingPlanId === plan.id ? " is-editing" : ""}`}
            key={plan.id}
          >
            <div className="automation-card-heading">
              <strong>{plan.name}</strong>
              <div className="automation-plan-card-actions">
                <StatusChip status={plan.status} />
                <button
                  aria-label={`Редактировать план «${plan.name}»`}
                  className="automation-plan-edit"
                  onClick={() => {
                    setCreating(false);
                    setEditingPlanId(plan.id);
                  }}
                  type="button"
                >
                  <Pencil aria-hidden="true" size={14} /> Изменить
                </button>
              </div>
            </div>
            {plan.description ? <p>{plan.description}</p> : null}
            <dl>
              {plan.selector.thql ? (
                <>
                  <dt className="automation-plan-thql-label">THQL</dt>
                  <dd className="automation-plan-thql-value">
                    <code>{plan.selector.thql}</code>
                  </dd>
                </>
              ) : null}
              {plan.selector.tags?.length ? (
                <>
                  <dt>Теги</dt>
                  <dd>{plan.selector.tags.join(", ")}</dd>
                </>
              ) : null}
              {plan.selector.testCaseIds?.length ? (
                <>
                  <dt>Кейсы</dt>
                  <dd>{plan.selector.testCaseIds.length}</dd>
                </>
              ) : null}
              {plan.launchNameTemplate ? (
                <>
                  <dt>Запуск</dt>
                  <dd>{plan.launchNameTemplate}</dd>
                </>
              ) : null}
            </dl>
          </article>
        ))}
        {data.plans.length === 0 && !creating ? (
          <EmptyAutomation
            icon={<ListFilter />}
            title="Планов пока нет"
            copy="Создайте THQL-выборку для автоматизированного CI-прогона."
            actionLabel="Создать первый план"
            onAction={() => setCreating(true)}
          />
        ) : null}
      </div>
    </div>
  );
}

function JobsPanel({ data, creating, setCreating, onChanged }: PanelProps) {
  const [pendingJobId, setPendingJobId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const advance = async (job: AutomationJobReadModel) => {
    const next =
      job.status === "queued" ? "running" : job.status === "running" ? "succeeded" : undefined;
    if (next) {
      setPendingJobId(job.id);
      setActionError(undefined);
      try {
        await updateAutomationJobStatus(data.projectId, job.id, next);
        await onChanged();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Не удалось обновить CI-задачу");
      } finally {
        setPendingJobId(undefined);
      }
    }
  };

  return (
    <div className="automation-content">
      <div className="automation-toolbar">
        <div>
          <strong>CI-задачи</strong>
          <span>Состояния прогонов, зарегистрированных CI или webhook-интеграцией.</span>
        </div>
        <button
          className="reference-primary-action"
          type="button"
          onClick={() => setCreating(!creating)}
        >
          <Plus size={16} /> Зарегистрировать
        </button>
      </div>
      {actionError ? (
        <div className="automation-notice automation-notice--error" role="alert">
          {actionError}
        </div>
      ) : null}
      {creating ? (
        <JobForm data={data} onCancel={() => setCreating(false)} onCreated={onChanged} />
      ) : null}
      <div className="automation-table" role="table" aria-label="CI-задачи">
        <div className="automation-table-row automation-table-head" role="row">
          <span>Задача</span>
          <span>Провайдер</span>
          <span>План</span>
          <span>Статус</span>
          <span />
        </div>
        {data.jobs.map((job) => (
          <div className="automation-table-row" role="row" key={job.id}>
            <span>
              <strong>{job.name}</strong>
              <small>{job.branch ?? job.trigger}</small>
            </span>
            <span>
              {job.external?.pipelineUrl ? (
                <a href={job.external.pipelineUrl} target="_blank" rel="noreferrer">
                  {job.external.provider}
                  <ExternalLink size={13} />
                </a>
              ) : (
                (job.external?.provider ?? "API")
              )}
            </span>
            <span>
              {data.plans.find((plan) => plan.id === job.testPlanId)?.name ?? "Без плана"}
            </span>
            <span>
              <StatusChip status={job.status} />
            </span>
            <span>
              {job.status === "queued" || job.status === "running" ? (
                <button
                  aria-label={`Перевести задачу «${job.name}» в состояние «${job.status === "queued" ? "Выполняется" : "Успешно"}»`}
                  className="automation-icon-action"
                  disabled={pendingJobId !== undefined}
                  type="button"
                  title={job.status === "queued" ? "Начать выполнение" : "Завершить успешно"}
                  onClick={() => void advance(job)}
                >
                  <CirclePlay size={17} />
                </button>
              ) : null}
            </span>
          </div>
        ))}
        {data.jobs.length === 0 ? (
          <EmptyAutomation
            icon={<Workflow />}
            title="CI-задач пока нет"
            copy="Зарегистрируйте внешний pipeline или дождитесь webhook от CI."
          />
        ) : null}
      </div>
    </div>
  );
}

function JobForm({
  data,
  onCancel,
  onCreated
}: {
  data: AutomationWorkspaceData;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const { busy, error, submit } = useAutomationFormSubmit();
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const testPlanId = String(form.get("testPlanId") ?? "");
    await submit(async () => {
      await createAutomationJob(data.projectId, {
        name: String(form.get("name")),
        provider: String(form.get("provider")),
        pipelineUrl: String(form.get("pipelineUrl") ?? ""),
        ...(testPlanId ? { testPlanId } : {})
      });
      await onCreated();
      onCancel();
    });
  };
  return (
    <form
      aria-busy={busy}
      className="automation-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label>
        Название
        <input name="name" required maxLength={200} />
      </label>
      <label>
        Провайдер
        <input name="provider" required maxLength={100} placeholder="gitlab" />
      </label>
      <label>
        Тест-план
        <select name="testPlanId">
          <option value="">Без плана</option>
          {data.plans
            .filter((plan) => plan.status === "active")
            .map((plan) => (
              <option value={plan.id} key={plan.id}>
                {plan.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Ссылка на pipeline
        <input name="pipelineUrl" type="url" maxLength={2000} />
      </label>
      <AutomationFormError error={error} />
      <div className="automation-form-actions">
        <button disabled={busy} type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="reference-primary-action" disabled={busy} type="submit">
          {busy ? "Регистрируем…" : "Зарегистрировать"}
        </button>
      </div>
    </form>
  );
}

function AutomationFormError({ error }: { error: string | undefined }) {
  return error ? (
    <div className="automation-form-error" role="alert">
      {error}
    </div>
  ) : null;
}

function StatusChip({ status }: { status: string }) {
  const labels: Record<string, string> = {
    active: "Активен",
    disabled: "Выключен",
    archived: "Архив",
    queued: "В очереди",
    running: "Выполняется",
    succeeded: "Успешно",
    failed: "Ошибка",
    canceled: "Отменена",
    pending: "Ожидает",
    processing: "Доставляется",
    delivered: "Доставлено",
    retrying: "Повтор",
    dead: "Ошибка доставки"
  };
  return (
    <span className={`automation-status automation-status--${status}`}>
      {labels[status] ?? status}
    </span>
  );
}

function EmptyAutomation({
  icon,
  title,
  copy,
  actionLabel,
  onAction
}: {
  icon: ReactNode;
  title: string;
  copy: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`automation-empty${onAction ? " automation-empty--actionable" : ""}`}>
      {icon}
      <strong>{title}</strong>
      <span>{copy}</span>
      {onAction && actionLabel ? (
        <button className="reference-primary-action" onClick={onAction} type="button">
          <Plus size={16} aria-hidden="true" /> {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
