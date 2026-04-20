"use client";

import { FormEvent, useState } from "react";
import { FirebaseError } from "firebase/app";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, firebaseConfigReady } from "../lib/firebase";
import { useAdminSession } from "./AdminSessionProvider";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

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
      return `${code} - неверный Firebase API key (проверь admin-web/.env.local и задеплой админку заново).`;
    default:
      return `${code} - ${error instanceof Error ? error.message : "ошибка входа"}`;
  }
}

export function LoadingScreen(): JSX.Element {
  return (
    <main>
      <Card className="centerCard centerCard-narrow">
        <CardContent className="flex items-center gap-3 p-6">
          <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
          <span>Загрузка...</span>
        </CardContent>
      </Card>
    </main>
  );
}

export function MissingConfigScreen(): JSX.Element {
  return (
    <main>
      <Card className="centerCard centerCard-wide">
        <CardHeader className="p-0">
          <CardTitle>Не настроен Firebase</CardTitle>
          <CardDescription>
            Не заполнены переменные <b>NEXT_PUBLIC_FIREBASE_*</b>. Проверь <b>admin-web/.env.local</b> и пересобери админку.
          </CardDescription>
        </CardHeader>
      </Card>
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
      <Card className="centerCard centerCard-narrow overflow-hidden">
        <CardHeader className="space-y-2 p-6 pb-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={onLogin} className="grid" style={{ gap: 10 }}>
            <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
            <Input
              placeholder="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Ошибка входа</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Вход..." : "Войти"}
            </Button>
          </form>
        </CardContent>
      </Card>
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
      <Card className="centerCard centerCard-wide">
        <CardHeader className="space-y-2 p-0">
          <CardTitle>{roleCheckFailed ? "Не удалось проверить роль" : "Нет доступа"}</CardTitle>
          <CardDescription>
            {roleCheckFailed
              ? "Админка не смогла прочитать документ пользователя из Firestore."
              : "У этого аккаунта нет роли администратора."}
          </CardDescription>
        </CardHeader>
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
            <Button type="button" onClick={() => globalThis.location?.reload()}>
              Повторить
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => void signOut(auth!)} disabled={!auth}>
            Выйти
          </Button>
        </div>
      </Card>
    </main>
  );
}
