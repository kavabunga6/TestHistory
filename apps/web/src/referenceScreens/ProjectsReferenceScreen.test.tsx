import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectsReferenceScreen } from "./ProjectsReferenceScreen.js";

describe("ProjectsReferenceScreen", () => {
  it("shows loading, empty and error states without sample projects", () => {
    const loading = renderToStaticMarkup(<ProjectsReferenceScreen status="loading" />);
    const empty = renderToStaticMarkup(<ProjectsReferenceScreen status="ready" projects={[]} />);
    const error = renderToStaticMarkup(
      <ProjectsReferenceScreen status="error" error="Network unavailable" onRetry={() => {}} />
    );

    expect(loading).toContain("Загружаем проекты");
    expect(empty).toContain("Пока нет доступных проектов");
    expect(error).toContain("Не удалось загрузить проекты");
    expect(error).toContain("Повторить");
    expect([loading, empty, error].join(" ")).not.toContain("Web Sandbox");
  });

  it("marks only the selected API project and exposes selection actions", () => {
    const markup = renderToStaticMarkup(
      <ProjectsReferenceScreen
        projects={[
          { id: "project-web", key: "WEB", name: "Web QA" },
          { id: "project-mobile", key: "MOBILE", name: "Mobile QA" }
        ]}
        selectedProjectId="project-mobile"
        onSelectProject={() => {}}
      />
    );

    expect(markup.match(/aria-current="true"/g)).toHaveLength(1);
    expect(markup).toContain("project-web");
    expect(markup).toContain("project-mobile");
    expect(markup).toContain("Выбрать проект");
    expect(markup).toContain("Открыть дашборд");
  });
});
