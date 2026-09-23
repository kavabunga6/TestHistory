import React from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Bug,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Menu,
  Settings,
  Workflow,
  X
} from "lucide-react";

import { AuthPanel } from "./AuthPanel.js";
import { modeLabels, type WorkspaceMode } from "./workspaceRouting.js";

type NavItem = {
  mode: WorkspaceMode;
  label: string;
  icon: React.ReactNode;
};

const testingNav: NavItem[] = [
  { mode: "dashboard", label: "Дашборды", icon: <LayoutDashboard size={18} /> },
  { mode: "case", label: "Тест-кейсы", icon: <ListChecks size={18} /> },
  { mode: "launch", label: "Запуски", icon: <Activity size={18} /> },
  { mode: "defects", label: "Дефекты", icon: <Bug size={18} /> },
  { mode: "automation", label: "Автоматизация", icon: <Workflow size={18} /> }
];

const projectNav: NavItem[] = [
  { mode: "projects", label: "Проекты", icon: <BookOpen size={18} /> },
  { mode: "analytics", label: "Аналитика", icon: <BarChart3 size={18} /> },
  { mode: "settings", label: "Настройки", icon: <Settings size={18} /> }
];

export function WorkspaceNavigation({
  activeMode,
  onModeChange,
  onOpenTypographySettings,
  selectedProjectName
}: {
  activeMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  onOpenTypographySettings?: (() => void) | undefined;
  selectedProjectName?: string | undefined;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const mobileMenuButtonRef = React.useRef<HTMLButtonElement>(null);
  const sidebarRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const sidebar = sidebarRef.current;
    const initialFocus =
      sidebar?.querySelector<HTMLButtonElement>(".nav-link.active") ??
      sidebar?.querySelector<HTMLButtonElement>(".sidebar-mobile-close");
    initialFocus?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        mobileMenuButtonRef.current?.focus();
        return;
      }

      if (event.key !== "Tab" || sidebar === null) {
        return;
      }

      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const media = window.matchMedia?.("(max-width: 820px)");
    const onWidthChange = () => {
      if (media !== undefined && !media.matches) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    media?.addEventListener("change", onWidthChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      media?.removeEventListener("change", onWidthChange);
    };
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => {
    if (!mobileMenuOpen) {
      return;
    }
    setMobileMenuOpen(false);
    mobileMenuButtonRef.current?.focus();
  };

  return (
    <>
      <Sidebar
        activeMode={activeMode}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={closeMobileMenu}
        onModeChange={(nextMode) => {
          closeMobileMenu();
          onModeChange(nextMode);
        }}
        onOpenTypographySettings={
          onOpenTypographySettings === undefined
            ? undefined
            : () => {
                closeMobileMenu();
                onOpenTypographySettings();
              }
        }
        selectedProjectName={selectedProjectName}
        sidebarRef={sidebarRef}
      />
      {mobileMenuOpen ? (
        <button
          className="mobile-navigation-backdrop"
          type="button"
          aria-label="Закрыть меню разделов"
          onClick={closeMobileMenu}
        />
      ) : null}
      <header className="mobile-shell-header">
        <button
          className="mobile-shell-brand"
          type="button"
          aria-label="Перейти на дашборды"
          title="Перейти на дашборды"
          onClick={() => onModeChange("dashboard")}
        >
          <span className="mobile-shell-brand__mark" aria-hidden="true">
            TH
          </span>
          <strong>TestHistory</strong>
        </button>
        <div className="mobile-shell-current">
          <span title={selectedProjectName}>{selectedProjectName ?? "Раздел"}</span>
          <strong>{modeLabels[activeMode]}</strong>
        </div>
        <button
          className="mobile-shell-menu-button"
          type="button"
          ref={mobileMenuButtonRef}
          aria-controls="workspace-navigation"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Закрыть меню разделов" : "Открыть меню разделов"}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>
    </>
  );
}

function Sidebar({
  activeMode,
  mobileMenuOpen,
  onCloseMobileMenu,
  onModeChange,
  onOpenTypographySettings,
  selectedProjectName,
  sidebarRef
}: {
  activeMode: WorkspaceMode;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  onModeChange: (mode: WorkspaceMode) => void;
  onOpenTypographySettings?: (() => void) | undefined;
  selectedProjectName?: string | undefined;
  sidebarRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <aside
      className={`sidebar ${mobileMenuOpen ? "sidebar--mobile-open" : ""}`}
      id="workspace-navigation"
      role={mobileMenuOpen ? "dialog" : undefined}
      aria-modal={mobileMenuOpen ? true : undefined}
      aria-label="Навигация по разделам"
      ref={sidebarRef}
    >
      <div className="brand">
        <button
          className="brand-home"
          type="button"
          aria-label="Перейти на дашборды"
          title="Перейти на дашборды"
          onClick={() => onModeChange("dashboard")}
        >
          <span aria-hidden="true">TH</span>
          <strong>TestHistory</strong>
        </button>
        <button
          className="sidebar-mobile-close"
          type="button"
          aria-label="Закрыть меню разделов"
          onClick={onCloseMobileMenu}
        >
          <X size={20} />
        </button>
      </div>

      <div className="sidebar-navigation">
        {selectedProjectName !== undefined ? (
          <div className="sidebar-project-context">
            <span className="nav-caption">Текущий проект</span>
            <button
              className="sidebar-current-project"
              type="button"
              title={`Открыть проекты · текущий: ${selectedProjectName}`}
              onClick={() => onModeChange("projects")}
            >
              <span className="sidebar-current-project__icon" aria-hidden="true">
                <FolderKanban size={17} />
              </span>
              <strong>{selectedProjectName}</strong>
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          </div>
        ) : null}

        <nav className="nav-group" aria-label="Основная навигация">
          <span className="nav-caption">Тестирование</span>
          {testingNav.map((item) => (
            <NavButton
              active={activeMode === item.mode}
              item={item}
              key={item.mode}
              onClick={onModeChange}
            />
          ))}
        </nav>

        <nav className="nav-group" aria-label="Навигация проекта">
          <span className="nav-caption">Управление</span>
          {projectNav.map((item) => (
            <NavButton
              active={activeMode === item.mode}
              item={item}
              key={item.mode}
              onClick={onModeChange}
            />
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <AuthPanel onOpenTypographySettings={onOpenTypographySettings} />
      </div>
    </aside>
  );
}

function NavButton({
  active,
  item,
  onClick
}: {
  active: boolean;
  item: NavItem;
  onClick: (mode: WorkspaceMode) => void;
}) {
  return (
    <button
      className={`nav-link ${active ? "active" : ""}`}
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={() => onClick(item.mode)}
    >
      {item.icon}
      <span>{item.label}</span>
    </button>
  );
}
