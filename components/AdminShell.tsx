"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, Moon, Search, Sun, User } from "lucide-react";
import { ADMIN_TONE_STYLES, getAdminRouteMeta } from "../lib/admin-routes";
import { cn } from "../lib/utils";
import { useAdminSession } from "./AdminSessionProvider";
import { AdminNav } from "./AdminNav";
import { useAdminNotifications, type AdminNotificationItem } from "./useAdminNotifications";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Sidebar, SidebarContent, SidebarInset, SidebarProvider, SidebarTrigger } from "./ui/sidebar";

export function AdminShell({
  title,
  subtitle,
  rightActions,
  children,
}: {
  title: string;
  subtitle?: string;
  rightActions?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const session = useAdminSession();
  const { resolvedTheme, setTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const notifications = useAdminNotifications({
    enabled: session.status === "ready",
    viewerUid: session.user?.uid ?? null,
  });

  const onSubmitSearch = () => {
    const q = searchValue.trim();
    if (!q) {
      setSearchOpen(false);
      return;
    }
    setSearchOpen(false);
    router.push(`/quotes?q=${encodeURIComponent(q)}`);
  };

  const email = session.user?.email ?? "";
  const unreadBadgeLabel = notifications.unreadCount > 99 ? "99+" : String(notifications.unreadCount);
  const routeMeta = getAdminRouteMeta(pathname);
  const toneStyles = ADMIN_TONE_STYLES[routeMeta.tone];
  const RouteIcon = routeMeta.icon;
  const hasBreadcrumbs = routeMeta.breadcrumbs.length > 1;

  const formatNotificationTime = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "";
    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const onNotificationClick = async (item: AdminNotificationItem) => {
    setNotificationsOpen(false);
    try {
      await notifications.markAsRead(item);
    } catch (error) {
      console.error("Notification markAsRead failed:", error);
    } finally {
      router.push(item.href);
    }
  };

  return (
    <SidebarProvider>
      <main className="appFrame">
        <div className="appWindow">
          <div className="flex min-w-0 gap-5">
            <Sidebar mobileTitle="Админка">
              <SidebarContent>
                <AdminNav variant="vertical" />
              </SidebarContent>
            </Sidebar>

            <SidebarInset className="content">
              <header className="contentHeader">
                <Card className={cn("rounded-[1.75rem] border-border/70 bg-card/95 p-4 shadow-sm backdrop-blur sm:p-5", toneStyles.headerFrame)}>
                  <div className="contentHeaderTop">
                    <div className="flex min-w-0 items-start gap-3">
                      <SidebarTrigger />

                      <div className={cn("mt-0.5 hidden size-12 shrink-0 items-center justify-center rounded-[1.1rem] border sm:flex", toneStyles.headerBadge)}>
                        <RouteIcon className="size-5" aria-hidden="true" />
                      </div>

                      <div className="min-w-0 flex-1">
                        {hasBreadcrumbs ? (
                          <nav aria-label="Хлебные крошки" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            {routeMeta.breadcrumbs.map((item, index) => (
                              <Fragment key={`${item.label}:${item.href ?? index}`}>
                                {index > 0 ? <span className="text-muted-foreground/60">/</span> : null}
                                {item.href ? (
                                  <Link href={item.href} className="transition-colors hover:text-foreground">
                                    {item.label}
                                  </Link>
                                ) : (
                                  <span className="text-foreground">{item.label}</span>
                                )}
                              </Fragment>
                            ))}
                          </nav>
                        ) : (
                          <div className="mb-3">
                            <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", toneStyles.headerPill)}>
                              {routeMeta.section}
                            </span>
                          </div>
                        )}

                        <div className="flex min-w-0 items-start gap-3">
                          <div className={cn("mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-[1rem] border sm:hidden", toneStyles.headerBadge)}>
                            <RouteIcon className="size-5" aria-hidden="true" />
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div className="flex flex-wrap items-center gap-2">
                              <h1>{title}</h1>
                              {hasBreadcrumbs ? (
                                <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold", toneStyles.headerPill)}>
                                  {routeMeta.section}
                                </span>
                              ) : null}
                            </div>
                            {subtitle ? <small className="breakLong mt-1 block">{subtitle}</small> : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="topbarRight">
                      {rightActions ? <div className="topbarActions">{rightActions}</div> : null}

                      <div className="topbarControls" aria-label="Быстрые действия">
                        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                          <PopoverTrigger asChild>
                            <Button type="button" variant="outline" size="icon" aria-label="Поиск по заявкам">
                              <Search className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-[min(92vw,360px)]">
                            <div className="grid gap-3">
                              <div>
                                <h3 className="!text-[11px]">Быстрый поиск</h3>
                                <p className="mt-1 text-sm text-muted-foreground">Ищет по заявкам и сразу открывает фильтрованный список.</p>
                              </div>
                              <Input
                                ref={searchInputRef}
                                placeholder="Поиск по заявкам…"
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") onSubmitSearch();
                                  if (e.key === "Escape") setSearchOpen(false);
                                }}
                                autoFocus
                              />
                              <div className="flex justify-end">
                                <Button type="button" size="sm" onClick={onSubmitSearch}>
                                  Найти
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>

                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={isDark ? "Светлая тема" : "Темная тема"}
                          onClick={() => setTheme(isDark ? "light" : "dark")}
                        >
                          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </Button>

                        <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={notifications.unreadCount ? `Уведомления: ${notifications.unreadCount}` : "Уведомления"}
                              className="relative"
                            >
                              <Bell className="h-4 w-4" />
                              {notifications.unreadCount ? (
                                <span className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm">
                                  {unreadBadgeLabel}
                                </span>
                              ) : null}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[min(92vw,380px)] p-0">
                            <div className="border-b border-border px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold">Уведомления</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {notifications.unreadCount
                                      ? `Новых событий: ${notifications.unreadCount}`
                                      : "Новых событий пока нет"}
                                  </p>
                                </div>
                                {notifications.unreadCount ? (
                                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium leading-none text-muted-foreground">
                                    {unreadBadgeLabel}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="max-h-[min(70vh,28rem)] overflow-y-auto p-1.5">
                              {notifications.loading ? (
                                <div className="px-3 py-6 text-sm text-muted-foreground">Загрузка уведомлений...</div>
                              ) : notifications.error ? (
                                <div className="px-3 py-6 text-sm text-muted-foreground">Не удалось загрузить уведомления.</div>
                              ) : notifications.items.length ? (
                                notifications.items.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    className="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent/60 focus:bg-accent/60 focus:outline-none"
                                    onClick={() => {
                                      void onNotificationClick(item);
                                    }}
                                  >
                                    <span
                                      className={cn(
                                        "mt-1 inline-flex size-2.5 shrink-0 rounded-full",
                                        item.type === "quote_created" ? "bg-sky-500" : "bg-emerald-500",
                                      )}
                                    />

                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-start justify-between gap-3">
                                        <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                                        <span className="shrink-0 text-[11px] text-muted-foreground">
                                          {formatNotificationTime(item.occurredAt)}
                                        </span>
                                      </span>
                                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                                    </span>
                                  </button>
                                ))
                              ) : (
                                <div className="px-3 py-6 text-sm text-muted-foreground">Новых уведомлений нет.</div>
                              )}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="outline" size="icon" aria-label="Аккаунт" className={cn(email ? "border-accent/40" : "")}>
                              <User className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{email || "Администратор"}</DropdownMenuLabel>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </Card>
              </header>

              <div className="contentBody">{children}</div>
            </SidebarInset>
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
}
