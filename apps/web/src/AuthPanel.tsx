import { Eye, EyeOff, KeyRound, LogIn, LogOut, UserPlus } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  clearSessionToken,
  getStoredSessionToken,
  loadCurrentUser,
  loginUser,
  registerUser,
  storeSessionToken,
  type CurrentUser
} from "./auth.js";
import "./AuthPanel.css";

type AuthMode = "login" | "register";
type AuthMessage = {
  kind: "error" | "success";
  text: string;
};

export function AuthPanel({
  onOpenTypographySettings
}: {
  onOpenTypographySettings?: (() => void) | undefined;
} = {}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<CurrentUser | undefined>();
  const [message, setMessage] = useState<AuthMessage | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const loginTabRef = useRef<HTMLButtonElement>(null);
  const registerTabRef = useRef<HTMLButtonElement>(null);
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: ""
  });

  useEffect(() => {
    let active = true;
    const token = getStoredSessionToken();
    if (token === undefined) {
      return;
    }
    void loadCurrentUser(token)
      .then(async (loadedUser) => {
        if (!active) {
          return;
        }
        setUser(loadedUser);
        globalThis.localStorage?.setItem("testhistory.actorId", loadedUser.email);
        globalThis.localStorage?.setItem("testhistory.userRole", loadedUser.role);
      })
      .catch(() => {
        clearSessionToken();
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setMessage(undefined);
    try {
      const response =
        mode === "register"
          ? await registerUser(form)
          : await loginUser({ email: form.email, password: form.password });
      storeSessionToken(response.session.token);
      setForm((current) => ({ ...current, password: "" }));
      setPasswordVisible(false);
      globalThis.localStorage?.setItem("testhistory.actorId", response.user.email);
      globalThis.localStorage?.setItem("testhistory.userRole", response.user.role);
      setUser(response.user);
      dispatchAuthStateChanged();
      setMessage({
        kind: "success",
        text: mode === "register" ? "Пользователь создан" : "Вход выполнен"
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "API авторизации недоступен"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const logout = () => {
    clearSessionToken();
    globalThis.localStorage?.removeItem("testhistory.actorId");
    globalThis.localStorage?.removeItem("testhistory.userRole");
    setUser(undefined);
    setForm({ email: "", name: "", password: "" });
    setPasswordVisible(false);
    setMessage({ kind: "success", text: "Вы вышли" });
    dispatchAuthStateChanged();
  };

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage(undefined);
    setPasswordVisible(false);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const nextMode =
      event.key === "Home"
        ? "login"
        : event.key === "End"
          ? "register"
          : mode === "login"
            ? "register"
            : "login";
    selectMode(nextMode);
    (nextMode === "login" ? loginTabRef : registerTabRef).current?.focus();
  };

  if (user !== undefined) {
    const displayName = user.name.trim() || user.email;
    const secondary =
      user.email.trim() !== "" && user.email !== displayName ? user.email : undefined;

    return (
      <section className="auth-panel" aria-label="Текущий пользователь">
        <div className="auth-panel__user-card">
          <span className="auth-panel__avatar" aria-hidden="true">
            {getUserInitials(displayName)}
          </span>
          <div className="auth-panel__user">
            <strong>{displayName}</strong>
            {secondary !== undefined ? <span>{secondary}</span> : null}
            <small>{user.role === "admin" ? "Администратор" : "Пользователь"}</small>
          </div>
        </div>
        <div className="auth-panel__actions">
          {onOpenTypographySettings !== undefined ? (
            <button className="auth-panel__button" type="button" onClick={onOpenTypographySettings}>
              <span aria-hidden="true">Aa</span>
              <span>Шрифт</span>
            </button>
          ) : null}
          <button className="auth-panel__button" type="button" onClick={logout}>
            <LogOut size={14} />
            <span>Выйти</span>
          </button>
        </div>
        {message !== undefined ? (
          <small className="auth-panel__message">{message.text}</small>
        ) : null}
      </section>
    );
  }

  return (
    <section className="auth-panel auth-login" aria-labelledby="auth-login-title">
      <header className="auth-login__header">
        <span className="auth-login__mark" aria-hidden="true">
          TH
        </span>
        <div>
          <h1 id="auth-login-title">TestHistory</h1>
          <p>
            {mode === "register" ? "Создайте учётную запись" : "Войдите в рабочее пространство"}
          </p>
        </div>
      </header>
      <div
        className="auth-login__switch"
        role="tablist"
        aria-label="Режим авторизации"
        onKeyDown={onTabKeyDown}
      >
        <button
          className={`auth-login__tab${mode === "login" ? " auth-login__tab--active" : ""}`}
          type="button"
          role="tab"
          id="auth-login-tab"
          ref={loginTabRef}
          tabIndex={mode === "login" ? 0 : -1}
          aria-controls="auth-form-panel"
          aria-selected={mode === "login"}
          onClick={() => selectMode("login")}
        >
          <LogIn size={16} aria-hidden="true" />
          <span>Вход</span>
        </button>
        <button
          className={`auth-login__tab${mode === "register" ? " auth-login__tab--active" : ""}`}
          type="button"
          role="tab"
          id="auth-register-tab"
          ref={registerTabRef}
          tabIndex={mode === "register" ? 0 : -1}
          aria-controls="auth-form-panel"
          aria-selected={mode === "register"}
          onClick={() => selectMode("register")}
        >
          <UserPlus size={16} aria-hidden="true" />
          <span>Регистрация</span>
        </button>
      </div>
      <form
        className="auth-login__form"
        id="auth-form-panel"
        role="tabpanel"
        aria-labelledby={mode === "login" ? "auth-login-tab" : "auth-register-tab"}
        aria-busy={submitting}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {mode === "register" ? (
          <label className="auth-login__field" htmlFor="auth-name">
            <span>Имя</span>
            <input
              id="auth-name"
              name="name"
              autoComplete="name"
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
        ) : null}
        <label className="auth-login__field" htmlFor="auth-email">
          <span>Email или логин</span>
          <input
            id="auth-email"
            name="username"
            autoComplete="username"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <div className="auth-login__field">
          <label htmlFor="auth-password">Пароль</label>
          <div className="auth-login__password-control">
            <input
              id="auth-password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            <button
              aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
              aria-pressed={passwordVisible}
              className="auth-login__password-toggle"
              type="button"
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>
        <button className="auth-login__submit" type="submit" disabled={submitting}>
          <KeyRound size={16} aria-hidden="true" />
          <span>
            {submitting ? "Подождите…" : mode === "register" ? "Создать пользователя" : "Войти"}
          </span>
        </button>
        {message !== undefined ? (
          <p
            className={`auth-login__feedback auth-login__feedback--${message.kind}`}
            role={message.kind === "error" ? "alert" : "status"}
            aria-live="polite"
            aria-atomic="true"
          >
            {message.text}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function dispatchAuthStateChanged(): void {
  globalThis.dispatchEvent?.(new CustomEvent("testhistory-auth-changed"));
}

function getUserInitials(value: string): string {
  const words = value
    .trim()
    .split(/[\s._@-]+/)
    .filter((word) => word.length > 0);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "U";
}
