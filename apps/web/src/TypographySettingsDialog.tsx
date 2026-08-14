import { ALargeSmall, Minus, RotateCcw, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useModalDialog } from "./AppDialogs.js";
import {
  defaultTypographyPreferences,
  normalizeTypographyPreferences,
  typographyCategories,
  type TypographyCategory,
  type TypographyPreferences
} from "./typographyPreferences.js";
import "./TypographySettingsDialog.css";

export function TypographySettingsDialog({
  onCancel,
  onPreview,
  onSave,
  open,
  value
}: {
  onCancel: () => void;
  onPreview: (value: TypographyPreferences) => void;
  onSave: (value: TypographyPreferences) => void;
  open: boolean;
  value: TypographyPreferences;
}) {
  const [draft, setDraft] = useState(value);
  const dialogRef = useModalDialog<HTMLElement>(onCancel, open);

  useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  if (!open) {
    return null;
  }

  const updateCategory = (category: TypographyCategory, size: number) => {
    const next = normalizeTypographyPreferences({ ...draft, [category]: size });
    setDraft(next);
    onPreview(next);
  };

  const reset = () => {
    const next = { ...defaultTypographyPreferences };
    setDraft(next);
    onPreview(next);
  };

  return (
    <div className="typography-dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        aria-describedby="typography-dialog-description"
        aria-labelledby="typography-dialog-title"
        aria-modal="true"
        className="typography-dialog"
        role="dialog"
        tabIndex={-1}
      >
        <header className="typography-dialog__header">
          <span className="typography-dialog__header-icon" aria-hidden="true">
            <ALargeSmall size={20} />
          </span>
          <div>
            <h2 id="typography-dialog-title">Размер текста</h2>
            <p id="typography-dialog-description">
              Четыре размера применяются ко всему интерфейсу и сохраняются для вашего профиля.
            </p>
          </div>
          <button aria-label="Закрыть настройки текста" type="button" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>

        <div className="typography-dialog__body">
          {typographyCategories.map((category) => (
            <section className="typography-dialog__category" key={category.id}>
              <div className="typography-dialog__control">
                <div>
                  <h3>{category.label}</h3>
                  <p>{category.description}</p>
                </div>
                <div className="typography-dialog__stepper">
                  <button
                    aria-label={`Уменьшить: ${category.label}`}
                    disabled={draft[category.id] <= category.min}
                    type="button"
                    onClick={() => updateCategory(category.id, draft[category.id] - 1)}
                  >
                    <Minus size={15} />
                  </button>
                  <output aria-live="polite">{draft[category.id]} px</output>
                  <button
                    aria-label={`Увеличить: ${category.label}`}
                    disabled={draft[category.id] >= category.max}
                    type="button"
                    onClick={() => updateCategory(category.id, draft[category.id] + 1)}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <input
                  aria-label={`${category.label}, размер`}
                  max={category.max}
                  min={category.min}
                  step={1}
                  type="range"
                  value={draft[category.id]}
                  onChange={(event) => updateCategory(category.id, Number(event.target.value))}
                />
              </div>
              <TypographyPreview category={category.id} />
            </section>
          ))}
        </div>

        <footer className="typography-dialog__footer">
          <button className="typography-dialog__reset" type="button" onClick={reset}>
            <RotateCcw size={15} />
            По умолчанию
          </button>
          <span />
          <button className="typography-dialog__cancel" type="button" onClick={onCancel}>
            Отмена
          </button>
          <button className="typography-dialog__save" type="button" onClick={() => onSave(draft)}>
            Сохранить
          </button>
        </footer>
      </section>
    </div>
  );
}

function TypographyPreview({ category }: { category: TypographyCategory }) {
  if (category === "title") {
    return (
      <div className="typography-preview typography-preview--title">
        <small>com.testhistory.CheckoutFlowTest</small>
        <strong className="typography-role-title">Оформление заказа</strong>
      </div>
    );
  }
  if (category === "heading") {
    return (
      <div className="typography-preview typography-preview--heading">
        <span className="typography-preview__tab typography-role-heading">Результаты тестов</span>
        <strong className="typography-role-heading">История результатов</strong>
        <span>Содержимое раздела</span>
      </div>
    );
  }
  if (category === "body") {
    return (
      <div className="typography-preview typography-preview--body">
        <span aria-hidden="true">✓</span>
        <strong className="typography-role-body">Проверить форму авторизации</strong>
        <button className="typography-role-body" tabIndex={-1} type="button">
          Открыть результат
        </button>
      </div>
    );
  }
  return (
    <div className="typography-preview typography-preview--meta">
      <span className="typography-role-meta">27 тестов</span>
      <span className="typography-role-meta">Провален</span>
      <small className="typography-role-meta">09.08 · 12:17</small>
      <code className="typography-role-meta">E2E</code>
    </div>
  );
}
