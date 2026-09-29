import type { TestResult } from "../m1Workspace.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import { getResultDefectReferences } from "./ResultDefectReferences.js";
import { isExternalUrl } from "./TestCaseDetailReferenceUtils.js";

export function TestCaseMetadataSections({
  compact = false,
  integrationProviders,
  onFilterByTag,
  result
}: {
  compact?: boolean;
  integrationProviders: IntegrationLinkProvider[];
  onFilterByTag: (tag: string) => void;
  result: TestResult;
}) {
  const references = getResultDefectReferences(result, integrationProviders).map((reference) =>
    reference.href === undefined ? reference.id : { label: reference.id, url: reference.href }
  );
  const links = result.linkDetails?.length ? result.linkDetails : result.links;

  return (
    <>
      {!compact || result.tags.length > 0 ? (
        <div className="tc-detail-reference-rail-card" role="group" aria-label="Теги">
          <RailSection
            title="Теги"
            values={result.tags}
            variant="chips"
            onSelectValue={onFilterByTag}
          />
        </div>
      ) : null}
      {!compact || result.customFields.length > 0 ? (
        <div className="tc-detail-reference-rail-card" role="group" aria-label="Кастомные поля">
          <CustomFieldsRail fields={result.customFields} />
        </div>
      ) : null}
      {!compact || result.testKeys.length > 0 ? (
        <div className="tc-detail-reference-rail-card" role="group" aria-label="Ключи теста">
          <RailSection title="Ключи теста" values={result.testKeys} variant="chips" />
        </div>
      ) : null}
      {!compact || links.length > 0 ? (
        <div className="tc-detail-reference-rail-card" role="group" aria-label="Ссылки">
          <RailSection title="Ссылки" values={links} />
        </div>
      ) : null}
      {!compact || references.length > 0 ? (
        <div className="tc-detail-reference-rail-card" role="group" aria-label="Дефекты и задачи">
          <RailSection title="Дефекты и задачи" values={references} variant="chips" />
        </div>
      ) : null}
    </>
  );
}

function RailSection({
  onSelectValue,
  title,
  values,
  variant = "rows"
}: {
  title: string;
  values: Array<string | { label: string; url: string }>;
  onSelectValue?: ((value: string) => void) | undefined;
  variant?: "chips" | "rows";
}) {
  const hasValues = values.length > 0;

  return (
    <section
      className={`tc-detail-reference-rail-section rail-section--${variant} ${hasValues ? "" : "is-empty"}`}
    >
      <h3>{title}</h3>
      {hasValues ? (
        <div className="tc-detail-reference-value-list">
          {values.map((value) => {
            const label = typeof value === "string" ? value : value.label;
            const url = typeof value === "string" ? value : value.url;
            const external = isExternalUrl(url);

            if (external || url.startsWith("#defects/")) {
              return (
                <a
                  href={url}
                  key={`${label}-${url}`}
                  rel={external ? "noreferrer" : undefined}
                  target={external ? "_blank" : undefined}
                >
                  {label}
                </a>
              );
            }

            if (onSelectValue !== undefined) {
              return (
                <button key={label} type="button" onClick={() => onSelectValue(label)}>
                  {label}
                </button>
              );
            }

            return <span key={label}>{label}</span>;
          })}
        </div>
      ) : null}
    </section>
  );
}

function CustomFieldsRail({ fields }: { fields: TestResult["customFields"] }) {
  const hasFields = fields.length > 0;

  return (
    <section
      className={`tc-detail-reference-rail-section rail-section--fields ${hasFields ? "" : "is-empty"}`}
    >
      <h3>Кастомные поля</h3>
      {hasFields ? (
        <dl className="tc-detail-reference-field-list">
          {fields.map((field) => (
            <div key={`${field.label}-${field.value}`}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
