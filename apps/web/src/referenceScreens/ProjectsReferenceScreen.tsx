import { Percent, PlayCircle, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";

import "./ProjectsReferenceScreen.css";

type ProjectMetric = {
  icon: "coverage" | "runs";
  label: string;
  value: string;
};

export type DemoProject = {
  id: number;
  name: string;
  initials: string;
  color: string;
  description?: string;
  starred?: boolean;
  metrics: ProjectMetric[];
};

export const projects: DemoProject[] = [
  {
    id: 1,
    name: "Web Sandbox",
    initials: "WS",
    color: "#2563eb",
    description: "Тестовый проект для проверки web-интерфейса",
    starred: true,
    metrics: [
      { icon: "coverage", label: "Покрытие", value: "100%" },
      { icon: "runs", label: "Запуски", value: "10" }
    ]
  }
];

const metricIcons = {
  coverage: Percent,
  runs: PlayCircle
};

export function ProjectsReferenceScreen() {
  const [query, setQuery] = useState("");
  const selectedProjectId = projects[0]?.id;
  const visibleProjects = useMemo(() => filterProjects(projects, query), [query]);

  return (
    <main className="projects-reference" aria-label="Проекты">
      <section className="projects-reference__workspace" aria-labelledby="projects-reference-title">
        <div className="projects-reference__content">
          <header className="projects-reference__header">
            <div>
              <h1 id="projects-reference-title">
                Проекты
                <span className="projects-reference__count">{visibleProjects.length}</span>
              </h1>
              <p>Рабочие области с актуальными метриками тестирования.</p>
            </div>
          </header>

          <section className="projects-reference__catalog" aria-label="Список проектов">
            <label className="projects-reference__search">
              <Search aria-hidden="true" size={18} />
              <span className="projects-reference__search-label">Поиск и фильтрация</span>
              <input
                aria-label="Поиск и фильтрация проектов"
                placeholder="Поиск и фильтрация"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="projects-reference__grid" role="list">
              {visibleProjects.map((project) => (
                <article
                  aria-current={project.id === selectedProjectId ? "true" : undefined}
                  className="projects-reference__card"
                  key={project.id}
                  role="listitem"
                >
                  <header className="projects-reference__project-cell">
                    <span
                      className="projects-reference__logo"
                      style={{ backgroundColor: project.color }}
                    >
                      {project.initials}
                    </span>
                    <span className="projects-reference__project-copy">
                      <span className="projects-reference__project-title">
                        <span>{project.name}</span>
                        <span className="projects-reference__project-number">#{project.id}</span>
                        {project.starred ? (
                          <Star
                            aria-label="Избранный проект"
                            className="projects-reference__star"
                            size={16}
                          />
                        ) : null}
                        {project.id === selectedProjectId ? (
                          <span className="projects-reference__current">Текущий</span>
                        ) : null}
                      </span>
                      {project.description ? (
                        <span className="projects-reference__description">
                          {project.description}
                        </span>
                      ) : null}
                    </span>
                  </header>

                  <div className="projects-reference__metrics" aria-label="Метрики проекта">
                    {project.metrics.map((metric) => {
                      const Icon = metricIcons[metric.icon];

                      return (
                        <div className="projects-reference__metric" key={metric.label}>
                          <Icon aria-hidden="true" size={18} strokeWidth={2} />
                          <span>
                            <small>{metric.label}</small>
                            <strong>{metric.value}</strong>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}

              {visibleProjects.length === 0 ? (
                <div className="projects-reference__empty">
                  <strong>Проекты не найдены</strong>
                  <span>Измените поисковый запрос.</span>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

export function filterProjects(projectItems: DemoProject[], query: string): DemoProject[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return projectItems;
  }

  return projectItems.filter((project) => {
    const searchable = [
      project.name,
      String(project.id),
      project.initials,
      project.description ?? "",
      ...project.metrics.map((metric) => `${metric.label} ${metric.value}`)
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedQuery);
  });
}
