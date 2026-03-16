"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { AdminShell } from "../../components/AdminShell";

const SETTINGS_LINKS: Array<{ href: string; title: string; subtitle: string }> = [
  { href: "/media", title: "Медиа", subtitle: "Загрузка и удаление файлов, GitHub/Firestore хранилище" },
  { href: "/gallery", title: "Портфолио", subtitle: "Работы, фото, статусы публикации" },
  { href: "/settings/site", title: "Сайт", subtitle: "Бренд, футер, контакты и блок партнера" },
  { href: "/settings/calc", title: "Калькулятор", subtitle: "Тарифы, коэффициенты и доплаты" },
];

export default function SettingsHubPage(): JSX.Element {
  const session = useAdminSession();

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Настройки" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell
      title="Настройки"
      subtitle={session.user?.email ?? ""}
      rightActions={
        <button onClick={() => void signOut(auth!)} disabled={!auth}>
          Выйти
        </button>
      }
    >
      <section className="card">
        <h2>Редко используемые разделы</h2>
        <small>Собрали в одном месте, чтобы основная навигация оставалась компактной.</small>
      </section>

      <section className="grid cols-2">
        {SETTINGS_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="card tileCard">
            <div className="tileTitle">{item.title}</div>
            <small className="tileSubtitle">{item.subtitle}</small>
          </Link>
        ))}
      </section>
    </AdminShell>
  );
}
