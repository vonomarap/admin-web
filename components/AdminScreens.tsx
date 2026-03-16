"use client";

import { FormEvent, useState } from "react";
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, firebaseConfigReady } from "../lib/firebase";
import { useAdminSession } from "./AdminSessionProvider";

function formatAuthError(error: unknown): string {
  const code =
    error instanceof FirebaseError
      ? error.code
      : typeof (error as { code?: unknown } | null)?.code === "string"
        ? String((error as { code?: unknown }).code)
        : "";

  if (!code) {
    return error instanceof Error ? error.message : String(error);
  }

  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return `${code} - неверный email/пароль или пользователь не создан в Firebase Auth.`;
    case "auth/operation-not-allowed":
      return `${code} - вход Email/Password не включен в Firebase Auth. Запусти configure-auth.sh.`;
    case "auth/unauthorized-domain":
    case "auth/app-not-authorized":
      return `${code} - домен админки не добавлен в Authorized domains. Запусти configure-auth.sh.`;
    case "auth/invalid-email":
      return `${code} - некорректный email.`;
    case "auth/user-disabled":
      return `${code} - пользователь отключен в Firebase Auth.`;
    case "auth/too-many-requests":
      return `${code} - слишком много попыток. Подожди и попробуй позже.`;
    case "auth/network-request-failed":
      return `${code} - ошибка сети. Проверь интернет/блокировки.`;
    case "auth/invalid-api-key":
      return `${code} - неверный Firebase API key (проверь .env.local и задеплой админку заново).`;
    default:
      return `${code} - ${error instanceof Error ? error.message : "ошибка входа"}`;
  }
}

export function LoadingScreen(): JSX.Element {
  return (
    <main>
      <div className="card">Загрузка...</div>
    </main>
  );
}

export function MissingConfigScreen(): JSX.Element {
  return (
    <main>
      <section className="card centerCard centerCard-wide">
        <h1>Не настроен Firebase</h1>
        <small>
          Не заполнены переменные <b>NEXT_PUBLIC_FIREBASE_*</b>. Проверь <b>.env.local</b> и пересобери админку.
        </small>
      </section>
    </main>
  );
}

export function AdminLoginScreen({
  title = "Админ-панель",
  subtitle = "Войдите под админским аккаунтом",
}: {
  title?: string;
  subtitle?: string;
}): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!firebaseConfigReady || !auth) return;

    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      console.error("Admin login failed:", err);
      setError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <section className="card centerCard centerCard-narrow">
        <h1>{title}</h1>
        <small>{subtitle}</small>
        <form onSubmit={onLogin} className="grid" style={{ gap: 10 }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
          <input
            placeholder="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <div className="errorBox">{error}</div> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "Вход..." : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function NoAccessScreen(): JSX.Element {
  const session = useAdminSession();
  const user = session.user ?? auth?.currentUser ?? null;
  const uid = user?.uid ?? "";
  const email = user?.email ?? "";
  const roleCheckFailed = session.status === "role_check_failed";

  return (
    <main>
      <section className="card centerCard centerCard-wide">
        <h1>{roleCheckFailed ? "Не удалось проверить роль" : "Нет доступа"}</h1>
        <small>
          {roleCheckFailed
            ? "Админка не смогла прочитать документ пользователя из Firestore."
            : "У этого аккаунта нет роли администратора."}
        </small>
        {uid ? (
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            <small>
              UID: <code>{uid}</code>
            </small>
            {email ? (
              <small>
                Email: <code>{email}</code>
              </small>
            ) : null}
            {roleCheckFailed ? (
              <small>
                Ошибка проверки роли: <code>{session.error ?? "unknown"}</code>
              </small>
            ) : (
              <small>
                Чтобы дать доступ: в Firestore создай/обнови документ <code>users/{uid}</code> и добавь поле <code>role</code> = <code>admin</code>.
              </small>
            )}
          </div>
        ) : null}
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {roleCheckFailed ? (
            <button onClick={() => globalThis.location?.reload()}>Повторить</button>
          ) : null}
          <button onClick={() => void signOut(auth!)} disabled={!auth}>
            Выйти
          </button>
        </div>
      </section>
    </main>
  );
}
