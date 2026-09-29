import type { TestResult } from "../m1Workspace.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import {
  formatSeverity,
  formatStatus,
  isExternalUrl,
  uniqueStrings
} from "./LaunchesReferenceFormatters.js";
import { formatResultDuration } from "./LaunchesResultDuration.js";
import { getResultDefectReferences } from "./ResultDefectReferences.js";
import { getQuarantineMeta, getQuarantineTitle } from "./LaunchesReferenceModel.js";
export function ResultQuarantineTab({ result }: { result: TestResult }) {
  const quarantineTitle = getQuarantineTitle(result);
  const quarantineMeta = getQuarantineMeta(result);

  return (
    <div className="launches-reference-result-tab-panel">
      <section>
        <h4>Карантин</h4>
        {result.muted || result.defectMute ? (
          <div className="launches-reference-quarantine">
            <strong>{quarantineTitle}</strong>
            <span>{quarantineMeta}</span>
          </div>
        ) : (
          <p className="launches-reference-muted">Карантинные правила не применяются.</p>
        )}
      </section>
    </div>
  );
}

export function ResultFieldsTab({
  integrationProviders = [],
  result
}: {
  integrationProviders?: IntegrationLinkProvider[] | undefined;
  result: TestResult;
}) {
  return (
    <div className="launches-reference-result-tab-panel">
      <section>
        <h4>Поля и связи</h4>
        <ResultAttributes integrationProviders={integrationProviders} result={result} />
      </section>
    </div>
  );
}

function ResultAttributes({
  integrationProviders,
  result
}: {
  integrationProviders: IntegrationLinkProvider[];
  result: TestResult;
}) {
  const parameters = result.parameters ?? [];
  const tags = uniqueStrings(result.tags);
  const testKeys = uniqueStrings(result.testKeys);
  const links = result.linkDetails?.length
    ? result.linkDetails.map((link) =>
        isExternalUrl(link.url) ? { label: link.label, href: link.url, external: true } : link.label
      )
    : uniqueStrings(result.links);
  const references = getResultDefectReferences(result, integrationProviders);
  const internalDefects = references.filter((reference) => reference.kind === "internal");
  const issues = references.filter((reference) => reference.kind === "issue");
  const archivedDefects = (result.defectHistory ?? []).map((defect) => `${defect.id} (история)`);
  const hasValues =
    parameters.length > 0 ||
    tags.length > 0 ||
    testKeys.length > 0 ||
    links.length > 0 ||
    references.length > 0 ||
    archivedDefects.length > 0;

  return (
    <div className="launches-reference-attributes">
      <div className="launches-reference-fields-group">
        <h5>Данные результата</h5>
        <dl>
          <div>
            <dt>ID результата</dt>
            <dd>{result.id}</dd>
          </div>
          {result.allureId && result.allureId !== result.id ? (
            <div>
              <dt>Allure ID</dt>
              <dd>{result.allureId}</dd>
            </div>
          ) : null}
          <div>
            <dt>Статус</dt>
            <dd>{formatStatus(result.status)}</dd>
          </div>
          <div>
            <dt>Длительность</dt>
            <dd>{formatResultDuration(result.duration)}</dd>
          </div>
          <div>
            <dt>Слой</dt>
            <dd>{result.layer}</dd>
          </div>
          <div>
            <dt>Серьезность</dt>
            <dd>{formatSeverity(result.severity)}</dd>
          </div>
          <div>
            <dt>Владелец</dt>
            <dd>{result.owner === "Unassigned" ? "Не назначен" : result.owner}</dd>
          </div>
        </dl>
      </div>
      {!hasValues ? (
        <p className="launches-reference-muted">Дополнительные поля и связи не заданы.</p>
      ) : null}
      {parameters.length > 0 ? (
        <div className="launches-reference-fields-group">
          <h5>Параметры</h5>
          <dl>
            {parameters.map((parameter) => (
              <div key={parameter.name}>
                <dt>{parameter.name}</dt>
                <dd>{parameter.masked ? "[redacted]" : parameter.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <ResultAttributeValues title="Метки" values={tags} />
      <ResultAttributeValues title="Ключи теста" values={testKeys} />
      <ResultAttributeValues title="Ссылки" values={links} links />
      <ResultAttributeValues
        title="Внутренние дефекты"
        values={internalDefects.map(toAttributeValue)}
      />
      <ResultAttributeValues title="Задачи из баг-трекера" values={issues.map(toAttributeValue)} />
      <ResultAttributeValues title="История связей" values={archivedDefects} />
    </div>
  );
}

function ResultAttributeValues({
  links = false,
  title,
  values
}: {
  links?: boolean;
  title: string;
  values: Array<string | { label: string; href?: string; external?: boolean }>;
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="launches-reference-fields-group">
      <h5>{title}</h5>
      <div className="launches-reference-fields-values">
        {values.map((value) => {
          const label = typeof value === "string" ? value : value.label;
          const href =
            typeof value === "string"
              ? links && isExternalUrl(value)
                ? value
                : undefined
              : value.href;
          const external = typeof value === "string" ? true : value.external === true;
          return href !== undefined ? (
            <a
              href={href}
              key={label}
              rel={external ? "noreferrer" : undefined}
              target={external ? "_blank" : undefined}
            >
              {label}
            </a>
          ) : (
            <span key={label}>{label}</span>
          );
        })}
      </div>
    </div>
  );
}

function toAttributeValue(reference: ReturnType<typeof getResultDefectReferences>[number]) {
  return {
    label: reference.id,
    ...(reference.href !== undefined ? { href: reference.href } : {}),
    external: reference.kind === "issue"
  };
}
