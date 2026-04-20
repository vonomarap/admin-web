"use client";

import Link from "next/link";
import { Calculator, Globe, ImageIcon, Settings2 } from "lucide-react";
import { useAdminSession } from "../../components/AdminSessionProvider";
import { AdminLoginScreen, LoadingScreen, MissingConfigScreen, NoAccessScreen } from "../../components/AdminScreens";
import { AdminShell } from "../../components/AdminShell";
import { SectionCard } from "../../components/admin-kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

const SETTINGS_LINKS: Array<{ href: string; title: string; subtitle: string; icon: typeof Globe }> = [
  { href: "/media", title: "Медиа", subtitle: "Загрузка и удаление файлов, GitHub/Firestore хранилище", icon: ImageIcon },
  { href: "/gallery", title: "Портфолио", subtitle: "Работы, фото, статусы публикации", icon: Settings2 },
  { href: "/settings/site", title: "Сайт", subtitle: "Бренд, футер, контакты и блок партнера", icon: Globe },
  { href: "/settings/calc", title: "Калькулятор", subtitle: "Тарифы, коэффициенты и доплаты", icon: Calculator },
];

export default function SettingsHubPage(): JSX.Element {
  const session = useAdminSession();

  if (session.status === "loading") return <LoadingScreen />;
  if (session.status === "missing_config") return <MissingConfigScreen />;
  if (session.status === "signed_out") return <AdminLoginScreen title="Настройки" subtitle="Войдите под админским аккаунтом" />;
  if (session.status === "not_admin" || session.status === "role_check_failed") return <NoAccessScreen />;

  return (
    <AdminShell title="Настройки" subtitle={session.user?.email ?? ""}>
      <div className="flex flex-col gap-6">
        <SectionCard
          eyebrow="Служебные разделы"
          title="Редкие настройки"
          description="Собрали менее частые экраны в одном месте, чтобы основная навигация админки оставалась короткой."
          icon={Settings2}
          tone="slate"
        />

        <div className="grid gap-4 md:grid-cols-2">
          {SETTINGS_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="group block h-full">
                <Card className="flex h-full flex-col border-border/80 transition-colors group-hover:border-accent/40 group-hover:bg-card/95">
                  <CardHeader className="gap-4">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground">
                      <Icon className="size-5" />
                    </div>
                    <div className="grid gap-1">
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      <CardDescription className="leading-relaxed">{item.subtitle}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-muted-foreground">Открыть раздел</CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}
