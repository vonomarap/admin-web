"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../lib/utils";
import { ADMIN_NAV_ITEMS, ADMIN_TONE_STYLES } from "../lib/admin-routes";
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "./ui/sidebar";

type AdminNavVariant = "horizontal" | "vertical";

export function AdminNav({ variant = "horizontal" }: { variant?: AdminNavVariant }): JSX.Element {
  const pathname = usePathname() || "/";
  const { setMobileOpen } = useSidebar();

  return (
    <nav
      className={cn(
        "flex gap-2",
        variant === "vertical" ? "flex-col" : "flex-wrap rounded-xl border border-border bg-card p-2 shadow-sm"
      )}
      aria-label="Навигация"
    >
      {variant === "vertical" ? (
        <SidebarGroup>
          <SidebarMenu>
            {ADMIN_NAV_ITEMS.map((item) => {
              const active = item.matches(pathname);
              const Icon = item.icon;
              const toneStyles = ADMIN_TONE_STYLES[item.tone];
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    className={cn(
                      "group relative min-h-[3.5rem] overflow-hidden border border-transparent pl-4 pr-3",
                      active ? toneStyles.navActive : "hover:border-border/70 hover:bg-accent/60",
                    )}
                  >
                    <Link
                      href={item.href}
                      className="group relative"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute bottom-2 left-1.5 top-2 w-1 rounded-full transition-colors",
                          active ? toneStyles.navAccent : "bg-transparent",
                        )}
                      />
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
                          active
                            ? toneStyles.navIcon
                            : "border-border/60 bg-background/80 text-muted-foreground group-hover:border-border group-hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className={cn("truncate", active ? "font-semibold" : "")}>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ) : (
        ADMIN_NAV_ITEMS.map((item) => {
          const active = item.matches(pathname);
          const Icon = item.icon;
          const toneStyles = ADMIN_TONE_STYLES[item.tone];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active ? cn("shadow-xs", toneStyles.navActive) : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                  active
                    ? toneStyles.navIcon
                    : "border-border/60 bg-background/80 text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })
      )}
    </nav>
  );
}
