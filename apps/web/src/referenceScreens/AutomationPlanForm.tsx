import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  createTestPlan,
  updateTestPlan,
  type TestPlanInput,
  type TestPlanReadModel
} from "../automationApi.js";
import { useAutomationFormSubmit } from "./useAutomationFormSubmit.js";

export function AutomationPlanForm({
  onCancel,
  onSaved,
  plan,
  projectId
}: {
  onCancel: () => void;
  onSaved: () => Promise<void>;
  plan?: TestPlanReadModel | undefined;
  projectId: string;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [selectorError, setSelectorError] = useState<string>();
  const { busy, error, submit } = useAutomationFormSubmit();

  useEffect(() => nameRef.current?.focus(), []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const thql = String(form.get("thql") ?? "").trim();
    const tags = parseList(String(form.get("tags") ?? ""));
    const testCaseIds = parseList(String(form.get("testCaseIds") ?? ""));
    const selector: TestPlanInput["selector"] = {
      ...(thql ? { thql } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(testCaseIds.length > 0 ? { testCaseIds } : {})
    };
    if (Object.keys(selector).length === 0) {
      setSelectorError("Укажите THQL, теги или ID тест-кейсов.");
      return;
    }
    setSelectorError(undefined);
    const status = String(form.get("status")) as TestPlanReadModel["status"];
    const input: TestPlanInput = {
      name: String(form.get("name")).trim(),
      description: String(form.get("description") ?? "").trim(),
      launchNameTemplate: String(form.get("launchNameTemplate") ?? "").trim(),
      selector,
      status
    };
    await submit(async () => {
      if (plan === undefined) {
        await createTestPlan(projectId, input);
      } else {
        await updateTestPlan(projectId, plan.id, input);
      }
      await onSaved();
      onCancel();
    });
  };

  return (
    <form
      aria-busy={busy}
      className="automation-form automation-plan-form"
      onChange={() => setSelectorError(undefined)}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="automation-plan-form-heading">
        <strong>{plan === undefined ? "Новый тест-план" : `Редактирование: ${plan.name}`}</strong>
        <span>Выборка должна содержать THQL, теги или ID тест-кейсов.</span>
      </div>
      <label>
        Название
        <input defaultValue={plan?.name ?? ""} maxLength={200} name="name" ref={nameRef} required />
      </label>
      <label>
        Статус
        <select defaultValue={plan?.status ?? "active"} name="status">
          <option value="active">Активен</option>
          <option value="disabled">Выключен</option>
          {plan !== undefined ? <option value="archived">Архив</option> : null}
        </select>
      </label>
      <label className="automation-form-wide">
        THQL
        <input
          defaultValue={plan?.selector.thql ?? ""}
          maxLength={4000}
          name="thql"
          placeholder={'tag = "smoke"'}
        />
      </label>
      <label>
        Теги через запятую
        <input defaultValue={plan?.selector.tags?.join(", ") ?? ""} name="tags" />
      </label>
      <label>
        ID тест-кейсов через запятую
        <input defaultValue={plan?.selector.testCaseIds?.join(", ") ?? ""} name="testCaseIds" />
      </label>
      <label className="automation-form-wide">
        Описание
        <textarea
          defaultValue={plan?.description ?? ""}
          maxLength={4000}
          name="description"
          rows={2}
        />
      </label>
      <label className="automation-form-wide">
        Шаблон названия запуска
        <input
          defaultValue={plan?.launchNameTemplate ?? ""}
          maxLength={300}
          name="launchNameTemplate"
          placeholder="Например: Smoke · {branch}"
        />
      </label>
      {selectorError || error ? (
        <div className="automation-form-error" role="alert">
          {selectorError ?? error}
        </div>
      ) : null}
      <div className="automation-form-actions">
        <button disabled={busy} onClick={onCancel} type="button">
          Отмена
        </button>
        <button className="reference-primary-action" disabled={busy} type="submit">
          {busy ? "Сохраняем…" : plan === undefined ? "Создать план" : "Сохранить изменения"}
        </button>
      </div>
    </form>
  );
}

function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}
