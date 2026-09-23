import type { TestResult } from "../m1Workspace.js";
import { isExternalUrl, uniqueStrings } from "./LaunchesReferenceFormatters.js";
import {
  getDefectValues,
  getQuarantineMeta,
  getQuarantineTitle
} from "./LaunchesReferenceModel.js";
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

export function ResultFieldsTab({ result }: { result: TestResult }) {
  return (
    <div className="launches-reference-result-tab-panel">
      <section>
        <h4>Поля и связи</h4>
        <ResultAttributes result={result} />
      </section>
    </div>
  );
}

function ResultAttributes({ result }: { result: TestResult }) {
  const parameters = result.parameters ?? [];
  const tags = uniqueStrings(result.tags);
  const testKeys = uniqueStrings(result.testKeys);
  const links = uniqueStrings(result.links);
  const defects = uniqueStrings(getDefectValues(result));
  const hasValues =
    parameters.length > 0 ||
    tags.length > 0 ||
    testKeys.length > 0 ||
    links.length > 0 ||
    defects.length > 0;

  if (!hasValues) {
    return <p className="launches-reference-muted">Поля и связи не заданы.</p>;
  }

  return (
    <div className="launches-reference-attributes">
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
      <ResultAttributeValues title="Дефекты" values={defects} />
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
  values: string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="launches-reference-fields-group">
      <h5>{title}</h5>
      <div className="launches-reference-fields-values">
        {values.map((value) =>
          links && isExternalUrl(value) ? (
            <a href={value} key={value} rel="noreferrer" target="_blank">
              {value}
            </a>
          ) : (
            <span key={value}>{value}</span>
          )
        )}
      </div>
    </div>
  );
}
