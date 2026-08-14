import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  BellRing,
  Bug,
  CirclePlay,
  ExternalLink,
  ListFilter,
  Plus,
  RefreshCw,
  Workflow
} from "lucide-react";
import {
  createAutomationJob,
  createIssueTrackerIntegration,
  createNotificationIntegration,
  createTestPlan,
  loadAutomationWorkspace,
  setOutboundIntegrationEnabled,
  updateAutomationJobStatus,
  type AutomationJobReadModel,
  type AutomationWorkspaceData
} from "../automationApi.js";

type AutomationTab = "plans" | "jobs" | "integrations";
type PanelProps = {
  data: AutomationWorkspaceData;
  creating: boolean;
  setCreating: (value: boolean) => void;
  onChanged: () => Promise<void>;
};

export function AutomationReferenceScreen() {
  const [tab, setTab] = useState<AutomationTab>("plans");
  const [data, setData] = useState<AutomationWorkspaceData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setData(await loadAutomationWorkspace());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void refresh(), [refresh]);

  return (
    <section className="automation-screen">
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
          <RefreshCw size={16} /> Обновить
        </button>
      </header>

      <nav className="automation-tabs" aria-label="Разделы автоматизации">
        <button
          className={tab === "plans" ? "active" : ""}
          type="button"
          onClick={() => {
            setCreating(false);
            setTab("plans");
          }}
        >
          <ListFilter size={16} /> Тест-планы{" "}
          <span className="typography-role-meta">{data?.plans.length ?? 0}</span>
        </button>
        <button
          className={tab === "jobs" ? "active" : ""}
          type="button"
          onClick={() => {
            setCreating(false);
            setTab("jobs");
          }}
        >
          <Workflow size={16} /> CI-задачи{" "}
          <span className="typography-role-meta">{data?.jobs.length ?? 0}</span>
        </button>
        <button
          className={tab === "integrations" ? "active" : ""}
          type="button"
          onClick={() => {
            setCreating(false);
            setTab("integrations");
          }}
        >
          <BellRing size={16} /> Интеграции{" "}
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
        <PlansPanel data={data} creating={creating} setCreating={setCreating} onChanged={refresh} />
      ) : null}
      {data !== undefined && tab === "jobs" ? (
        <JobsPanel data={data} creating={creating} setCreating={setCreating} onChanged={refresh} />
      ) : null}
      {data !== undefined && tab === "integrations" ? (
        <IntegrationsPanel data={data} onChanged={refresh} />
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
  const toggle = async (kind: "notifications" | "issue-trackers", id: string, enabled: boolean) => {
    await setOutboundIntegrationEnabled(data.projectId, kind, id, enabled);
    await onChanged();
  };
  return (
    <div className="automation-content automation-integrations">
      <div className="automation-toolbar">
        <div>
          <strong>Исходящие интеграции</strong>
          <span>
            Подписанные уведомления и создание задач через серверные адаптеры. Секреты остаются в
            окружении deployment.
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
              <a href={item.endpointUrl} target="_blank" rel="noreferrer">
                {item.endpointUrl}
                <ExternalLink size={13} />
              </a>
              <button
                type="button"
                onClick={() => void toggle("notifications", item.id, !item.enabled)}
              >
                {item.enabled ? "Отключить" : "Включить"}
              </button>
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
              <a href={item.baseUrl} target="_blank" rel="noreferrer">
                {item.baseUrl}
                <ExternalLink size={13} />
              </a>
              <button
                type="button"
                onClick={() => void toggle("issue-trackers", item.id, !item.enabled)}
              >
                {item.enabled ? "Отключить" : "Включить"}
              </button>
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
                <strong>{delivery.event}</strong>
                <small>{new Date(delivery.updatedAt).toLocaleString("ru-RU")}</small>
              </span>
              <span>{delivery.kind}</span>
              <span>
                {delivery.attempts}/{delivery.status === "dead" ? delivery.attempts : 5}
              </span>
              <span>
                <StatusChip status={delivery.status} />
              </span>
              <span>
                {delivery.externalReference ? (
                  <a href={delivery.externalReference} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                  </a>
                ) : null}
              </span>
            </div>
          ))}
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
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const secretEnvVar = String(form.get("secretEnvVar") ?? "").trim();
    await createNotificationIntegration(projectId, {
      name: String(form.get("name")),
      provider: String(form.get("provider")),
      endpointUrl: String(form.get("endpointUrl")),
      events: ["automation-job.failed", "automation-job.succeeded"],
      ...(secretEnvVar ? { secretEnvVar } : {})
    });
    onCancel();
    await onCreated();
  };
  return (
    <form className="automation-form" onSubmit={(event) => void submit(event)}>
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
        HTTPS endpoint
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
      <div className="automation-form-actions">
        <button type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="reference-primary-action">Сохранить</button>
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
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createIssueTrackerIntegration(projectId, {
      name: String(form.get("name")),
      provider: String(form.get("provider")),
      baseUrl: String(form.get("baseUrl")),
      projectKey: String(form.get("projectKey")),
      credentialEnvVar: String(form.get("credentialEnvVar"))
    });
    onCancel();
    await onCreated();
  };
  return (
    <form className="automation-form" onSubmit={(event) => void submit(event)}>
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
          <option value="generic">Generic</option>
        </select>
      </label>
      <label>
        HTTPS base URL
        <input name="baseUrl" type="url" required />
      </label>
      <label>
        Проект / repository
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
      <div className="automation-form-actions">
        <button type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="reference-primary-action">Сохранить</button>
      </div>
    </form>
  );
}

function PlansPanel({ data, creating, setCreating, onChanged }: PanelProps) {
  return (
    <div className="automation-content">
      <div className="automation-toolbar">
        <div>
          <strong>Тест-планы</strong>
          <span>Сохранённые выборки только автоматизированных кейсов.</span>
        </div>
        <button
          className="reference-primary-action"
          type="button"
          onClick={() => setCreating(!creating)}
        >
          <Plus size={16} /> Создать план
        </button>
      </div>
      {creating ? (
        <PlanForm
          projectId={data.projectId}
          onCancel={() => setCreating(false)}
          onCreated={onChanged}
        />
      ) : null}
      <div className="automation-grid">
        {data.plans.map((plan) => (
          <article className="automation-card" key={plan.id}>
            <div className="automation-card-heading">
              <strong>{plan.name}</strong>
              <StatusChip status={plan.status} />
            </div>
            {plan.description ? <p>{plan.description}</p> : null}
            <dl>
              {plan.selector.thql ? (
                <>
                  <dt>THQL</dt>
                  <dd>
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
            </dl>
          </article>
        ))}
        {data.plans.length === 0 ? (
          <EmptyAutomation
            icon={<ListFilter />}
            title="Планов пока нет"
            copy="Создайте THQL-выборку для автоматизированного CI-прогона."
          />
        ) : null}
      </div>
    </div>
  );
}

function JobsPanel({ data, creating, setCreating, onChanged }: PanelProps) {
  const advance = async (job: AutomationJobReadModel) => {
    const next =
      job.status === "queued" ? "running" : job.status === "running" ? "succeeded" : undefined;
    if (next) {
      await updateAutomationJobStatus(data.projectId, job.id, next);
      await onChanged();
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
                  className="automation-icon-action"
                  type="button"
                  title="Перевести в следующее состояние"
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

function PlanForm({
  projectId,
  onCancel,
  onCreated
}: {
  projectId: string;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    await createTestPlan(projectId, {
      name: String(form.get("name")),
      thql: String(form.get("thql")),
      description: String(form.get("description") ?? "")
    });
    onCancel();
    await onCreated();
  };
  return (
    <form className="automation-form" onSubmit={(event) => void submit(event)}>
      <label>
        Название
        <input name="name" required maxLength={200} />
      </label>
      <label>
        THQL
        <input name="thql" required maxLength={4000} placeholder={'tag = "smoke"'} />
      </label>
      <label className="automation-form-wide">
        Описание
        <input name="description" maxLength={4000} />
      </label>
      <div className="automation-form-actions">
        <button type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="reference-primary-action" disabled={busy} type="submit">
          Сохранить
        </button>
      </div>
    </form>
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
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const testPlanId = String(form.get("testPlanId") ?? "");
    await createAutomationJob(data.projectId, {
      name: String(form.get("name")),
      provider: String(form.get("provider")),
      pipelineUrl: String(form.get("pipelineUrl") ?? ""),
      ...(testPlanId ? { testPlanId } : {})
    });
    onCancel();
    await onCreated();
  };
  return (
    <form className="automation-form" onSubmit={(event) => void submit(event)}>
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
      <div className="automation-form-actions">
        <button type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="reference-primary-action" disabled={busy} type="submit">
          Зарегистрировать
        </button>
      </div>
    </form>
  );
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

function EmptyAutomation({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div className="automation-empty">
      {icon}
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}
