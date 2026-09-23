import { ArrowRight, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { ApiProjectReadModel } from "../m1WorkspaceApiTypes.js";
import type { ProjectListStatus } from "../projectSelection.js";

import "./ProjectsReferenceScreen.css";

export function ProjectsReferenceScreen({
  error,
  onRetry,
  onSelectProject,
  projects = [],
  selectedProjectId,
  status = "ready"
}: {
  error?: string | undefined;
  onRetry?: (() => void) | undefined;
  onSelectProject?: ((projectId: string) => void) | undefined;
  projects?: ApiProjectReadModel[] | undefined;
  selectedProjectId?: string | undefined;
  status?: ProjectListStatus | undefined;
}) {
  const [query, setQuery] = useState("");
  const visibleProjects = useMemo(() => filterProjects(projects, query), [projects, query]);
  const loading = status === "idle" || status === "loading";

  return (
    <main className="projects-reference" aria-label="Проекты">
      <section className="projects-reference__workspace" aria-labelledby="projects-reference-title">
        <div className="projects-reference__content">
          <header className="projects-reference__header">
            <div>
              <h1 id="projects-reference-title">
                Проекты
                {status === "ready" ? (
                  <span className="projects-reference__count">{projects.length}</span>
                ) : null}
              </h1>
              <p>Выберите проект, чтобы открыть его запуски, тест-кейсы и аналитику.</p>
            </div>
            {status === "ready" && onRetry !== undefined ? (
              <button className="projects-reference__refresh" onClick={onRetry} type="button">
                <RefreshCw aria-hidden="true" size={16} /> Обновить
              </button>
            ) : null}
          </header>

          <section className="projects-reference__catalog" aria-label="Список проектов">
            <label className="projects-reference__search">
              <Search aria-hidden="true" size={18} />
              <span className="projects-reference__search-label">Поиск проектов</span>
              <input
                aria-label="Поиск проектов"
                disabled={status !== "ready" || projects.length === 0}
                placeholder="Найти по названию, коду или ID"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="projects-reference__grid" role="list" aria-busy={loading}>
              {loading ? (
                <ProjectListMessage title="Загружаем проекты" body="Получаем доступные проекты." />
              ) : status === "error" ? (
                <ProjectListMessage
                  title="Не удалось загрузить проекты"
                  body={error ?? "Проверьте соединение и повторите попытку."}
                  onRetry={onRetry}
                />
              ) : projects.length === 0 ? (
                <ProjectListMessage
                  title="Пока нет доступных проектов"
                  body="Создайте проект или попросите предоставить к нему доступ."
                />
              ) : visibleProjects.length === 0 ? (
                <ProjectListMessage title="Проекты не найдены" body="Измените поисковый запрос." />
              ) : (
                visibleProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    onSelectProject={onSelectProject}
                    project={project}
                    selected={project.id === selectedProjectId}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function ProjectCard({
  onSelectProject,
  project,
  selected
}: {
  onSelectProject?: ((projectId: string) => void) | undefined;
  project: ApiProjectReadModel;
  selected: boolean;
}) {
  const name = project.name?.trim() || project.key?.trim() || project.id;
  const key = project.key?.trim();

  return (
    <article
      aria-current={selected ? "true" : undefined}
      className="projects-reference__card"
      role="listitem"
    >
      <header className="projects-reference__project-cell">
        <span
          className="projects-reference__logo"
          style={{ backgroundColor: projectColor(project.id) }}
        >
          {projectInitials(name, key)}
        </span>
        <span className="projects-reference__project-copy">
          <span className="projects-reference__project-title">
            <span>{name}</span>
            {selected ? <span className="projects-reference__current">Выбран</span> : null}
          </span>
          {key ? <span className="projects-reference__project-key">Код {key}</span> : null}
        </span>
      </header>
      <div className="projects-reference__project-meta">
        <span>ID проекта</span>
        <code title={project.id}>{project.id}</code>
      </div>
      <button
        className="projects-reference__open"
        disabled={onSelectProject === undefined}
        onClick={() => onSelectProject?.(project.id)}
        type="button"
      >
        {selected ? "Открыть дашборд" : "Выбрать проект"}
        <ArrowRight aria-hidden="true" size={16} />
      </button>
    </article>
  );
}

function ProjectListMessage({
  body,
  onRetry,
  title
}: {
  body: string;
  onRetry?: (() => void) | undefined;
  title: string;
}) {
  return (
    <div className="projects-reference__empty" role="listitem">
      <strong>{title}</strong>
      <span>{body}</span>
      {onRetry !== undefined ? (
        <button onClick={onRetry} type="button">
          Повторить
        </button>
      ) : null}
    </div>
  );
}

export function filterProjects(projectItems: ApiProjectReadModel[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery === "") {
    return projectItems;
  }

  return projectItems.filter((project) =>
    [project.id, project.key ?? "", project.name ?? ""]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  );
}

function projectInitials(name: string, key?: string): string {
  const source = key || name;
  const words = source.trim().split(/\s+/);
  return words.length > 1
    ? words
        .slice(0, 2)
        .map((word) => word[0] ?? "")
        .join("")
        .toUpperCase()
    : source.slice(0, 2).toUpperCase();
}

function projectColor(id: string): string {
  const colors = ["#2563eb", "#0f766e", "#7c3aed", "#b45309", "#be185d"];
  const hash = Array.from(id).reduce((value, character) => value + character.charCodeAt(0), 0);
  return colors[hash % colors.length] ?? colors[0] ?? "#2563eb";
}
